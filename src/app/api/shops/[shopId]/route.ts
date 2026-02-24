// src/app/api/shopProducts/route.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// SHOP PRODUCTS API  (100 % Typesense — scoped to shopId)
//
// Mirrors Flutter's ShopProvider._fetchProductsFromTypesense():
//   • Always Typesense — no Firestore fallback needed server-side
//   • shopId:=$shopId baked into every query (additionalFilterBy pattern)
//   • Facet filters: gender, subcategory, brands, colors, dynamic spec
//   • Numeric / string filters: price range + shopId scope
//   • specFacets scoped to shopId on page 0
//
// Search (debounced in-store):
//   Mirrors Flutter's ShopProvider._performTypesenseSearch()
//   Uses query param; all active filters still applied.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import { ProductUtils } from "@/app/models/Product";
import type { FacetCount } from "@/app/components/FilterSideBar";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  DEFAULT_HITS: 20,
  MAX_HITS: 50,
  CACHE_TTL: 30 * 1000, // 30s — shop products change often
  STALE_TTL: 2 * 60 * 1000,
  MAX_CACHE: 500,
  TIMEOUT_MS: 8_000,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SpecFilters = Record<string, string[]>;

interface ShopProductsParams {
  shopId: string;
  query: string;
  page: number;
  hitsPerPage: number;
  sortOption: string;
  gender: string | null;
  subcategory: string | null;
  brands: string[];
  colors: string[];
  specFilters: SpecFilters;
  minPrice: number | null;
  maxPrice: number | null;
}

interface ShopProductsResponse {
  products: ReturnType<typeof ProductUtils.fromTypeSense>[];
  specFacets?: Record<string, FacetCount[]>;
  hasMore: boolean;
  page: number;
  total: number;
  source?: string;
  timing?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry {
  data: ShopProductsResponse;
  ts: number;
  accessed: number;
}
const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<ShopProductsResponse>>();

function cacheKey(p: ShopProductsParams): string {
  return JSON.stringify({
    sid: p.shopId,
    q: p.query,
    pg: p.page,
    hpp: p.hitsPerPage,
    so: p.sortOption,
    g: p.gender ?? "",
    sub: p.subcategory ?? "",
    br: [...p.brands].sort().join(","),
    col: [...p.colors].sort().join(","),
    sf: JSON.stringify(
      Object.fromEntries(
        Object.entries(p.specFilters).map(([k, v]) => [k, [...v].sort()]),
      ),
    ),
    minP: p.minPrice ?? "",
    maxP: p.maxPrice ?? "",
  });
}

function getCache(
  key: string,
): { data: ShopProductsResponse; stale: boolean } | null {
  const e = cache.get(key);
  if (!e) return null;
  const age = Date.now() - e.ts;
  if (age > CONFIG.STALE_TTL) {
    cache.delete(key);
    return null;
  }
  e.accessed = Date.now();
  return { data: e.data, stale: age > CONFIG.CACHE_TTL };
}

function setCache(key: string, data: ShopProductsResponse): void {
  if (cache.size >= CONFIG.MAX_CACHE) {
    const sorted = [...cache.entries()].sort(
      (a, b) => a[1].accessed - b[1].accessed,
    );
    sorted
      .slice(0, Math.floor(CONFIG.MAX_CACHE * 0.2))
      .forEach(([k]) => cache.delete(k));
  }
  cache.set(key, { data, ts: Date.now(), accessed: Date.now() });
}

// ─────────────────────────────────────────────────────────────────────────────
// Param extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractParams(sp: URLSearchParams): ShopProductsParams | null {
  const shopId = sp.get("shopId")?.trim() || "";
  if (!shopId) return null;

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
    shopId,
    query: (sp.get("q") || "").trim(),
    page: Math.max(0, parseInt(sp.get("page") || "0", 10)),
    hitsPerPage: hpp,
    sortOption: sp.get("sort") || "date",
    gender: sp.get("gender") || null,
    subcategory: sp.get("subcategory") || null,
    brands: sp.get("brands")?.split(",").filter(Boolean) ?? [],
    colors: sp.get("colors")?.split(",").filter(Boolean) ?? [],
    specFilters,
    minPrice: sp.get("minPrice") ? parseFloat(sp.get("minPrice")!) : null,
    maxPrice: sp.get("maxPrice") ? parseFloat(sp.get("maxPrice")!) : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build Typesense filter arrays
// Mirrors Flutter's _fetchProductsFromTypesense facetFilters / numericFilters
// ─────────────────────────────────────────────────────────────────────────────

function buildFacetFilters(p: ShopProductsParams): string[][] {
  const groups: string[][] = [];

  // Gender — single value, wrapped in group for consistency
  if (p.gender) groups.push([`gender:${p.gender}`]);

  // Subcategory filter (Flutter: _selectedSubcategory)
  if (p.subcategory) groups.push([`subcategory:${p.subcategory}`]);

  // Brands — OR within group (Flutter: _selectedBrands.map((b) => 'brandModel:$b'))
  if (p.brands.length > 0) groups.push(p.brands.map((b) => `brandModel:${b}`));

  // Colors — OR within group (Flutter: _selectedColors.map((c) => 'availableColors:$c'))
  if (p.colors.length > 0)
    groups.push(p.colors.map((c) => `availableColors:${c}`));

  // Dynamic spec filters — one OR group per field
  // (Flutter: _dynamicSpecFilters.entries → entry.value.map((v) => '${entry.key}:$v'))
  for (const [field, vals] of Object.entries(p.specFilters)) {
    if (vals.length > 0) groups.push(vals.map((v) => `${field}:${v}`));
  }

  return groups;
}

function buildNumericFilters(p: ShopProductsParams): string[] {
  const filters: string[] = [];
  // Price range (Flutter: numericFilters.add('price >= $_minPrice'))
  if (p.minPrice !== null) filters.push(`price>=${Math.floor(p.minPrice)}`);
  if (p.maxPrice !== null) filters.push(`price<=${Math.ceil(p.maxPrice)}`);
  // Scope to this shop — mirrors Flutter's additionalFilterBy: 'shopId:=$shopId'
  filters.push(`shopId:=${p.shopId}`);
  return filters;
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
// Core fetch — always Typesense
// ─────────────────────────────────────────────────────────────────────────────

async function fetchShopProducts(
  p: ShopProductsParams,
): Promise<ShopProductsResponse> {
  const t0 = Date.now();
  const svc = TypeSenseServiceManager.instance.shopService;

  const facetFilters = buildFacetFilters(p);
  const numericFilters = buildNumericFilters(p); // includes shopId:=$shopId

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

  // specFacets on page 0, scoped to this shop
  // Pass shopId as a single-element facet filter group so it goes into filter_by
  let specFacets: Record<string, FacetCount[]> | undefined;
  if (p.page === 0) {
    specFacets = await svc
      .fetchSpecFacets({
        indexName: "shop_products",
        query: p.query,
        facetFilters: [[`shopId:=${p.shopId}`]],
      })
      .catch(() => ({}));
  }

  return {
    products,
    specFacets: p.page === 0 ? specFacets : undefined,
    hasMore: res.page < res.nbPages - 1,
    page: p.page,
    total: res.hits.length,
    timing: Date.now() - t0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Background revalidation
// ─────────────────────────────────────────────────────────────────────────────

function revalidate(key: string, params: ShopProductsParams): void {
  if (pending.has(key)) return;
  const p = fetchShopProducts(params);
  pending.set(key, p);
  p.then((r) => setCache(key, r))
    .catch(() => {
      /* swallow */
    })
    .finally(() => pending.delete(key));
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  try {
    const params = extractParams(new URL(request.url).searchParams);

    if (!params) {
      return NextResponse.json(
        {
          error: "shopId is required",
          products: [],
          hasMore: false,
          page: 0,
          total: 0,
        },
        { status: 400 },
      );
    }

    const key = cacheKey(params);
    const cached = getCache(key);

    const headers = (extra: Record<string, string> = {}) => ({
      "Cache-Control": "public, max-age=30, stale-while-revalidate=90",
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
        /* fall through */
      }
    }

    // ── Fresh fetch ──
    const fetchPromise = fetchShopProducts(params);
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
          error: isTimeout ? "Search timeout" : "Fetch failed",
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
    console.error("[shopProducts] unexpected error:", err);
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

// Cache management endpoint
export async function DELETE() {
  const n = cache.size;
  cache.clear();
  pending.clear();
  return NextResponse.json({ cleared: n });
}
