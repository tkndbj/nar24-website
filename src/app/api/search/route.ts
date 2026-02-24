// src/app/api/searchProducts/route.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// SEARCH PRODUCTS API  (100 % Typesense — no Algolia dependency)
//
// Products (mirrors Flutter's SearchResultsScreen._fetchResults):
//   Unfiltered (no filters, sort = relevance):
//     Search "products" + "shop_products" in parallel, merge & deduplicate.
//   Filtered / sorted:
//     Search "shop_products" only with facetFilters + numericFilters.
//   Spec facets returned on page 0.
//
// Shops (mirrors Flutter's searchShops):
//   Search Typesense "shops" index.
//   Only on page 0 — shops don't paginate.
//   Firestore enrichment done server-side for fields not in Typesense index
//   (coverImageUrls, address, averageRating, etc.).
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { ProductUtils } from "@/app/models/Product";
import type { FacetCount } from "@/app/components/FilterSideBar";
import { Timestamp } from "firebase-admin/firestore";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  DEFAULT_HITS: 20,
  MAX_HITS: 50,
  CACHE_TTL: 60 * 1000, // 1 min  — search results go stale faster
  STALE_TTL: 3 * 60 * 1000,
  MAX_CACHE: 300,
  TIMEOUT_MS: 8_000,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SpecFilters = Record<string, string[]>;

interface SearchParams {
  query: string;
  page: number;
  hitsPerPage: number;
  sortOption: string; // "date" | "alphabetical" | "price_asc" | "price_desc"
  brands: string[];
  colors: string[];
  specFilters: SpecFilters;
  minPrice: number | null;
  maxPrice: number | null;
  minRating: number | null;
}

/** Minimal shop shape returned to the client — matches ShopCard props */
interface ShopResult {
  id: string;
  name: string;
  profileImageUrl: string;
  coverImageUrls: string[];
  address: string;
  averageRating: number;
  reviewCount: number;
  followerCount: number;
  clickCount: number;
  categories: string[];
  contactNo: string;
  ownerId: string;
  isBoosted: boolean;
  isActive: boolean;
  createdAt: { seconds: number; nanoseconds: number };
}

interface SearchResponse {
  products: ReturnType<typeof ProductUtils.fromJson>[];
  /** Only present on page 0 */
  shops?: ShopResult[];
  hasMore: boolean;
  page: number;
  total: number;
  specFacets?: Record<string, FacetCount[]>;
  source?: string;
  timing?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry {
  data: SearchResponse;
  ts: number;
  hits: number;
  accessed: number;
}
const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<SearchResponse>>();

function cacheKey(p: SearchParams): string {
  return JSON.stringify({
    q: p.query,
    pg: p.page,
    hpp: p.hitsPerPage,
    so: p.sortOption,
    br: [...p.brands].sort().join(","),
    col: [...p.colors].sort().join(","),
    sf: JSON.stringify(
      Object.fromEntries(
        Object.entries(p.specFilters).map(([k, v]) => [k, [...v].sort()]),
      ),
    ),
    minP: p.minPrice ?? "",
    maxP: p.maxPrice ?? "",
    minR: p.minRating ?? "",
  });
}

function getCache(
  key: string,
): { data: SearchResponse; stale: boolean } | null {
  const e = cache.get(key);
  if (!e) return null;
  const age = Date.now() - e.ts;
  if (age > CONFIG.STALE_TTL) {
    cache.delete(key);
    return null;
  }
  e.hits++;
  e.accessed = Date.now();
  return { data: e.data, stale: age > CONFIG.CACHE_TTL };
}

function setCache(key: string, data: SearchResponse): void {
  if (cache.size >= CONFIG.MAX_CACHE) {
    // evict LRU 20 %
    const sorted = [...cache.entries()].sort(
      (a, b) => a[1].accessed - b[1].accessed,
    );
    sorted
      .slice(0, Math.floor(CONFIG.MAX_CACHE * 0.2))
      .forEach(([k]) => cache.delete(k));
  }
  cache.set(key, { data, ts: Date.now(), hits: 1, accessed: Date.now() });
}

// ─────────────────────────────────────────────────────────────────────────────
// Param extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractParams(sp: URLSearchParams): SearchParams {
  const specFilters: SpecFilters = {};
  sp.forEach((value, key) => {
    if (key.startsWith("spec_")) {
      const vals = value.split(",").filter(Boolean);
      if (vals.length) specFilters[key.slice(5)] = vals;
    }
  });

  const hpp = Math.min(
    CONFIG.MAX_HITS,
    Math.max(
      1,
      parseInt(sp.get("hitsPerPage") || String(CONFIG.DEFAULT_HITS), 10),
    ),
  );

  return {
    query: (sp.get("q") || "").trim(),
    page: Math.max(0, parseInt(sp.get("page") || "0", 10)),
    hitsPerPage: hpp,
    sortOption: sp.get("sort") || "date",
    brands: sp.get("brands")?.split(",").filter(Boolean) ?? [],
    colors: sp.get("colors")?.split(",").filter(Boolean) ?? [],
    specFilters,
    minPrice: sp.get("minPrice") ? parseFloat(sp.get("minPrice")!) : null,
    maxPrice: sp.get("maxPrice") ? parseFloat(sp.get("maxPrice")!) : null,
    minRating: sp.get("minRating") ? parseFloat(sp.get("minRating")!) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter-state helpers (mirrors Flutter's hasDynamicFilters + sortOption check)
// ─────────────────────────────────────────────────────────────────────────────

function hasFilters(p: SearchParams): boolean {
  return (
    p.brands.length > 0 ||
    p.colors.length > 0 ||
    Object.keys(p.specFilters).length > 0 ||
    p.minPrice !== null ||
    p.maxPrice !== null ||
    p.minRating !== null
  );
}

function needsFilteredPath(p: SearchParams): boolean {
  return hasFilters(p) || p.sortOption !== "date";
}

// ─────────────────────────────────────────────────────────────────────────────
// Build Typesense filter arrays
// ─────────────────────────────────────────────────────────────────────────────

function buildFacetFilters(p: SearchParams): string[][] {
  const groups: string[][] = [];

  if (p.brands.length > 0) groups.push(p.brands.map((b) => `brandModel:${b}`));

  if (p.colors.length > 0)
    groups.push(p.colors.map((c) => `availableColors:${c}`));

  for (const [field, vals] of Object.entries(p.specFilters)) {
    if (vals.length > 0) groups.push(vals.map((v) => `${field}:${v}`));
  }

  return groups;
}

function buildNumericFilters(p: SearchParams): string[] {
  const filters: string[] = [];
  if (p.minPrice !== null) filters.push(`price>=${Math.floor(p.minPrice)}`);
  if (p.maxPrice !== null) filters.push(`price<=${Math.ceil(p.maxPrice)}`);
  if (p.minRating !== null) filters.push(`averageRating>=${p.minRating}`);
  return filters;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shop search via Typesense + Firestore enrichment (server-side)
// Typesense "shops" index fields: id, name, profileImageUrl, isActive,
//   categories, searchableText
// Fields not in Typesense → enriched from Firestore shops collection
// ─────────────────────────────────────────────────────────────────────────────

interface RawTypesenseShop {
  id: string;
  name?: string;
  profileImageUrl?: string;
  isActive?: boolean;
  categories?: string[];
}

async function fetchShopsFromTypesense(query: string): Promise<ShopResult[]> {
  try {
    const svc = TypeSenseServiceManager.instance.shopsService;
    const res = await svc.searchIdsWithFacets({
      indexName: "shops",
      query,
      page: 0,
      hitsPerPage: 10,
      facetFilters: [["isActive:true"]],
      numericFilters: [],
      sortOption: "relevance",
    });

    if (!res.hits.length) return [];

    // Strip "shops_" prefix (backfill used "shops_<firestoreId>" format)
    const hitsWithIds = res.hits.map((hit) => {
      const raw = hit as RawTypesenseShop;
      const firestoreId = raw.id.startsWith("shops_")
        ? raw.id.slice(6)
        : raw.id;
      return { firestoreId, raw };
    });

    // Enrich from Firestore (coverImageUrls, address, ratings, etc. not in TS)
    const db = getFirestoreAdmin();
    const enriched = await Promise.all(
      hitsWithIds.map(async ({ firestoreId, raw }) => {
        try {
          const snap = await db.collection("shops").doc(firestoreId).get();
          const d = snap.exists ? snap.data()! : {};
          const ts: Timestamp | null =
            d.createdAt instanceof Timestamp ? d.createdAt : null;

          return {
            id: firestoreId,
            name: raw.name ?? d.name ?? "",
            profileImageUrl: raw.profileImageUrl ?? d.profileImageUrl ?? "",
            coverImageUrls: (d.coverImageUrls as string[]) ?? [],
            address: (d.address as string) ?? "",
            averageRating: (d.averageRating as number) ?? 0,
            reviewCount: (d.reviewCount as number) ?? 0,
            followerCount: (d.followerCount as number) ?? 0,
            clickCount: (d.clickCount as number) ?? 0,
            categories: raw.categories ?? (d.categories as string[]) ?? [],
            contactNo: (d.contactNo as string) ?? "",
            ownerId: (d.ownerId as string) ?? "",
            isBoosted: (d.isBoosted as boolean) ?? false,
            isActive: raw.isActive ?? (d.isActive as boolean) ?? true,
            createdAt: ts
              ? { seconds: ts.seconds, nanoseconds: ts.nanoseconds }
              : { seconds: 0, nanoseconds: 0 },
          } satisfies ShopResult;
        } catch {
          return null;
        }
      }),
    );

    return enriched.filter(
      (s): s is ShopResult => s !== null && s.isActive !== false,
    );
  } catch (err) {
    console.error("[searchProducts] shop search error:", err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core data fetch
// ─────────────────────────────────────────────────────────────────────────────

async function fetchSearchData(p: SearchParams): Promise<SearchResponse> {
  const t0 = Date.now();
  const svc = TypeSenseServiceManager.instance.shopService;

  const filtered = needsFilteredPath(p);

  // ── Filtered / sorted path (shop_products only) ───────────────────────────
  if (filtered) {
    const facetFilters = buildFacetFilters(p);
    const numericFilters = buildNumericFilters(p);

    const res = await svc.searchIdsWithFacets({
      indexName: "shop_products",
      query: p.query,
      page: p.page,
      hitsPerPage: p.hitsPerPage,
      facetFilters,
      numericFilters,
      sortOption: p.sortOption,
    });

    const products = res.hits.map((hit) =>
      ProductUtils.fromTypeSense(hit as unknown as Record<string, unknown>),
    );

    // Spec facets on page 0
    let specFacets: Record<string, FacetCount[]> | undefined;
    if (p.page === 0) {
      specFacets = await svc
        .fetchSpecFacets({
          indexName: "shop_products",
          query: p.query,
          facetFilters,
        })
        .catch(() => ({}));
    }

    // Shops on page 0
    const shops =
      p.page === 0
        ? await fetchShopsFromTypesense(p.query).catch(() => [])
        : undefined;

    return {
      products,
      shops: p.page === 0 ? shops : undefined,
      hasMore: res.page < res.nbPages - 1,
      page: p.page,
      total: res.hits.length,
      specFacets: p.page === 0 ? specFacets : undefined,
      source: "filtered",
      timing: Date.now() - t0,
    };
  }

  // ── Unfiltered path — search BOTH indexes, merge & deduplicate ────────────
  // Mirrors Flutter: _marketProvider.searchOnly() searches products + shop_products
  const [prodRes, shopRes] = await Promise.allSettled([
    svc.searchIdsWithFacets({
      indexName: "products",
      query: p.query,
      page: p.page,
      hitsPerPage: p.hitsPerPage,
      facetFilters: [],
      numericFilters: [],
      sortOption: p.sortOption,
    }),
    svc.searchIdsWithFacets({
      indexName: "shop_products",
      query: p.query,
      page: p.page,
      hitsPerPage: p.hitsPerPage,
      facetFilters: [],
      numericFilters: [],
      sortOption: p.sortOption,
    }),
  ]);

  const seen = new Set<string>();
  const merged: ReturnType<typeof ProductUtils.fromTypeSense>[] = [];

  for (const result of [prodRes, shopRes]) {
    if (result.status === "rejected") continue;
    for (const hit of result.value.hits) {
      const id = String(hit.id ?? hit.objectID ?? "").replace(/^[^_]+_/, "");
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(
        ProductUtils.fromTypeSense(hit as unknown as Record<string, unknown>),
      );
    }
  }

  // Boosted products first (mirrors Flutter's prioritizeBoosted)
  merged.sort((a, b) => (b.isBoosted ? 1 : 0) - (a.isBoosted ? 1 : 0));

  const nbPages = Math.max(
    prodRes.status === "fulfilled" ? prodRes.value.nbPages : 0,
    shopRes.status === "fulfilled" ? shopRes.value.nbPages : 0,
  );

  // Spec facets + shops on page 0 (run in parallel)
  let specFacets: Record<string, FacetCount[]> | undefined;
  let shops: ShopResult[] | undefined;
  if (p.page === 0) {
    [specFacets, shops] = await Promise.all([
      svc
        .fetchSpecFacets({
          indexName: "shop_products",
          query: p.query,
          facetFilters: [],
        })
        .catch(() => ({})),
      fetchShopsFromTypesense(p.query).catch(() => []),
    ]);
  }

  return {
    products: merged,
    shops: p.page === 0 ? shops : undefined,
    hasMore: p.page < nbPages - 1,
    page: p.page,
    total: merged.length,
    specFacets: p.page === 0 ? specFacets : undefined,
    source: "unfiltered",
    timing: Date.now() - t0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Background revalidation
// ─────────────────────────────────────────────────────────────────────────────

function revalidate(key: string, params: SearchParams): void {
  if (pending.has(key)) return;
  const p = fetchSearchData(params);
  pending.set(key, p);
  p.then((r) => setCache(key, r))
    .catch(() => {
      /* swallow */
    })
    .finally(() => pending.delete(key));
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeout wrapper
// ─────────────────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let id: NodeJS.Timeout;
  const t = new Promise<never>((_, rej) => {
    id = setTimeout(() => rej(new Error("timeout")), ms);
  });
  return Promise.race([promise, t]).finally(() => clearTimeout(id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  try {
    const params = extractParams(new URL(request.url).searchParams);

    if (!params.query) {
      return NextResponse.json({
        products: [],
        hasMore: false,
        page: 0,
        total: 0,
      });
    }

    const key = cacheKey(params);
    const cached = getCache(key);

    const headers = (extra: Record<string, string> = {}) => ({
      "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      "X-Response-Time": `${Date.now() - t0}ms`,
      ...extra,
    });

    // ── Fresh cache hit ──
    if (cached && !cached.stale) {
      return NextResponse.json(
        { ...cached.data, source: "cache" },
        { headers: headers({ "X-Cache": "HIT" }) },
      );
    }

    // ── Stale-while-revalidate ──
    if (cached?.stale) {
      revalidate(key, params);
      return NextResponse.json(
        { ...cached.data, source: "stale" },
        { headers: headers({ "X-Cache": "STALE" }) },
      );
    }

    // ── Deduplicate in-flight ──
    const inFlight = pending.get(key);
    if (inFlight) {
      try {
        const r = await withTimeout(inFlight, CONFIG.TIMEOUT_MS);
        return NextResponse.json(
          { ...r, source: "dedupe" },
          { headers: headers({ "X-Cache": "DEDUPE" }) },
        );
      } catch {
        /* fall through to fresh fetch */
      }
    }

    // ── Fresh fetch ──
    const fetchPromise = fetchSearchData(params);
    pending.set(key, fetchPromise);

    try {
      const result = await withTimeout(fetchPromise, CONFIG.TIMEOUT_MS);
      setCache(key, result);
      return NextResponse.json(
        { ...result, source: "fresh" },
        {
          headers: headers({
            "X-Cache": "MISS",
            "X-Timing": `${result.timing}ms`,
          }),
        },
      );
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === "timeout";
      return NextResponse.json(
        {
          error: isTimeout ? "Search timeout" : "Search failed",
          products: [],
          hasMore: false,
          page: params.page,
          total: 0,
        },
        { status: isTimeout ? 504 : 500 },
      );
    } finally {
      pending.delete(key);
    }
  } catch (err) {
    console.error("[searchProducts] unexpected error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        products: [],
        hasMore: false,
        page: 0,
        total: 0,
      },
      { status: 500 },
    );
  }
}

// Cache management
export async function DELETE() {
  const n = cache.size;
  cache.clear();
  pending.clear();
  return NextResponse.json({ cleared: n });
}
