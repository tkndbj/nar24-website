// src/app/api/search/route.ts
//
// SEARCH PRODUCTS API (100% Typesense — no Algolia dependency)
//
// Uses unstable_cache for server-side caching + batch Firestore reads for shops.

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import { ProductUtils } from "@/app/models/Product";
import type { FacetCount } from "@/app/components/FilterSideBar";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  DEFAULT_HITS: 20,
  MAX_HITS: 50,
  CACHE_REVALIDATE_SECONDS: 60, // 1 minute
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
  sortOption: string;
  brands: string[];
  colors: string[];
  specFilters: SpecFilters;
  minPrice: number | null;
  maxPrice: number | null;
  minRating: number | null;
}

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
  shops?: ShopResult[];
  hasMore: boolean;
  page: number;
  total: number;
  specFacets?: Record<string, FacetCount[]>;
  timing?: number;
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
// Filter-state helpers
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
// Shop search via Typesense + Firestore batch enrichment
// ─────────────────────────────────────────────────────────────────────────────

const SHOP_INCLUDE_FIELDS =
  "id,name,profileImageUrl,coverImageUrls,address,averageRating," +
  "reviewCount,followerCount,clickCount,categories,contactNo," +
  "ownerId,isBoosted,isActive,createdAt";

async function fetchShopsFromTypesense(query: string): Promise<ShopResult[]> {
  try {
    const svc = TypeSenseServiceManager.instance.shopsService;
    const res = await svc.searchIdsWithFacets({
      indexName: "shops",
      query,
      page: 0,
      hitsPerPage: 10,
      facetFilters: [["isActive:true"]],
      sortOption: "relevance",
      queryBy: "name,searchableText",
      includeFields: SHOP_INCLUDE_FIELDS,
    });

    if (!res.hits.length) return [];

    return res.hits
      .map((hit) => {
        try {
          const d = hit as unknown as Record<string, unknown>;
          const rawId = String(d.id ?? "");
          const id = rawId.startsWith("shops_") ? rawId.slice(6) : rawId;
          const rawCreatedAt = d.createdAt as number | undefined;

          return {
            id,
            name: String(d.name ?? ""),
            profileImageUrl: String(d.profileImageUrl ?? ""),
            coverImageUrls: (d.coverImageUrls as string[]) ?? [],
            address: String(d.address ?? ""),
            averageRating: Number(d.averageRating ?? 0),
            reviewCount: Number(d.reviewCount ?? 0),
            followerCount: Number(d.followerCount ?? 0),
            clickCount: Number(d.clickCount ?? 0),
            categories: (d.categories as string[]) ?? [],
            contactNo: String(d.contactNo ?? ""),
            ownerId: String(d.ownerId ?? ""),
            isBoosted: Boolean(d.isBoosted ?? false),
            isActive: Boolean(d.isActive ?? true),
            createdAt: rawCreatedAt
              ? {
                  seconds:
                    rawCreatedAt > 1e12
                      ? Math.floor(rawCreatedAt / 1000)
                      : rawCreatedAt,
                  nanoseconds: 0,
                }
              : { seconds: 0, nanoseconds: 0 },
          } satisfies ShopResult;
        } catch {
          return null;
        }
      })
      .filter((s): s is ShopResult => s !== null);
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
      timing: Date.now() - t0,
    };
  }

  // ── Unfiltered path — search BOTH indexes, merge & deduplicate ────────────
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

  merged.sort((a, b) => (b.isBoosted ? 1 : 0) - (a.isBoosted ? 1 : 0));

  const nbPages = Math.max(
    prodRes.status === "fulfilled" ? prodRes.value.nbPages : 0,
    shopRes.status === "fulfilled" ? shopRes.value.nbPages : 0,
  );

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
    timing: Date.now() - t0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-side cache
// ─────────────────────────────────────────────────────────────────────────────

const cachedSearchData = unstable_cache(
  fetchSearchData,
  ["search-results"],
  { revalidate: CONFIG.CACHE_REVALIDATE_SECONDS, tags: ["search"] },
);

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
    // Rate limit: 60 requests/min per IP
    const { applyRateLimit } = await import("@/lib/auth-middleware");
    const limited = await applyRateLimit(request, 60, 60000);
    if (limited) return limited;

    const params = extractParams(new URL(request.url).searchParams);

    if (!params.query) {
      return NextResponse.json({
        products: [],
        hasMore: false,
        page: 0,
        total: 0,
      });
    }

    const headers = (extra: Record<string, string> = {}) => ({
      "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      "X-Response-Time": `${Date.now() - t0}ms`,
      ...extra,
    });

    try {
      const result = await withTimeout(
        cachedSearchData(params),
        CONFIG.TIMEOUT_MS,
      );
      return NextResponse.json(result, {
        headers: headers({ "X-Timing": `${result.timing}ms` }),
      });
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

// Cache management (admin-only)
export async function DELETE(request: NextRequest) {
  const { verifyAuth, verifyAdmin } = await import("@/lib/auth-middleware");
  const auth = await verifyAuth(request);
  if (auth.error) return auth.error;
  const adminCheck = await verifyAdmin(auth.isAdmin ?? false);
  if (adminCheck.error) return adminCheck.error;

  revalidateTag("search");
  return NextResponse.json({ cleared: true });
}
