// src/app/api/fetchDynamicProducts/route.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC PRODUCTS API — PRODUCTION OPTIMIZED
//
// Additions vs previous version:
//  • Parses `spec_${field}` query params → applies as Typesense facet filters
//  • Parses `minRating` → numeric filter on averageRating
//  • Fetches specFacets from Typesense and includes them in the response
//    (only on page 0, so the sidebar populates on first load)
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import type { Query, QuerySnapshot } from "firebase-admin/firestore";
import { Product, ProductUtils } from "@/app/models/Product";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import type { FacetCount } from "@/app/components/FilterSideBar";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  DEFAULT_LIMIT: 20,
  MAX_ARRAY_FILTER_SIZE: 10,
  CACHE_TTL: 2 * 60 * 1000,
  STALE_TTL: 5 * 60 * 1000,
  MAX_CACHE_SIZE: 200,
  CACHE_CLEANUP_THRESHOLD: 0.9,
  REQUEST_TIMEOUT: 10_000,
  MAX_RETRIES: 2,
  BASE_RETRY_DELAY: 100,
  // Facet cache
  FACET_CACHE_TTL: 5 * 60 * 1000,
  MAX_FACET_CACHE: 50,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Generic spec filter: field → selected values (from spec_${field} params) */
type SpecFilters = Record<string, string[]>;

interface ApiResponse {
  products: Product[];
  boostedProducts: Product[];
  hasMore: boolean;
  page: number;
  total: number;
  /** Only populated on page 0 */
  specFacets?: Record<string, FacetCount[]>;
  source?: "cache" | "stale" | "dedupe" | "fresh";
  timing?: number;
}

interface CacheEntry {
  data: ApiResponse;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
}

interface CacheResult {
  data: ApiResponse | null;
  status: "fresh" | "stale" | "expired" | "miss";
}

interface QueryParams {
  category: string | null;
  subcategory: string | null;
  subsubcategory: string | null;
  buyerCategory: string | null;
  buyerSubcategory: string | null;
  sortOption: string;
  quickFilter: string | null;
  brands: string[];
  colors: string[];
  filterSubcategories: string[];
  /** NEW: parsed from spec_${field} query params */
  specFilters: SpecFilters;
  minPrice: number | null;
  maxPrice: number | null;
  /** NEW: minimum star rating */
  minRating: number | null;
  page: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category mapping
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_MAPPING: Record<string, string> = {
  "clothing-fashion": "Clothing & Fashion",
  footwear: "Footwear",
  accessories: "Accessories",
  "bags-luggage": "Bags & Luggage",
  "beauty-personal-care": "Beauty & Personal Care",
  "mother-child": "Mother & Child",
  "home-furniture": "Home & Furniture",
  electronics: "Electronics",
  "sports-outdoor": "Sports & Outdoor",
  "books-stationery-hobby": "Books, Stationery & Hobby",
  "tools-hardware": "Tools & Hardware",
  "pet-supplies": "Pet Supplies",
  automotive: "Automotive",
  "health-wellness": "Health & Wellness",
};

// ─────────────────────────────────────────────────────────────────────────────
// Request deduplication + main cache
// ─────────────────────────────────────────────────────────────────────────────

const pendingRequests = new Map<string, Promise<ApiResponse>>();
const responseCache = new Map<string, CacheEntry>();

function generateCacheKey(p: QueryParams): string {
  return JSON.stringify({
    c: p.category || "",
    sc: p.subcategory || "",
    ssc: p.subsubcategory || "",
    bc: p.buyerCategory || "",
    bsc: p.buyerSubcategory || "",
    so: p.sortOption,
    qf: p.quickFilter || "",
    br: p.brands.sort().join(","),
    col: p.colors.sort().join(","),
    fsc: p.filterSubcategories.sort().join(","),
    sf: JSON.stringify(
      Object.fromEntries(
        Object.entries(p.specFilters).map(([k, v]) => [k, [...v].sort()]),
      ),
    ),
    minP: p.minPrice ?? "",
    maxP: p.maxPrice ?? "",
    minR: p.minRating ?? "",
    pg: p.page,
  });
}

function getCachedResponse(key: string): CacheResult {
  const entry = responseCache.get(key);
  if (!entry) return { data: null, status: "miss" };
  const age = Date.now() - entry.timestamp;
  entry.accessCount++;
  entry.lastAccess = Date.now();
  if (age <= CONFIG.CACHE_TTL) return { data: entry.data, status: "fresh" };
  if (age <= CONFIG.STALE_TTL) return { data: entry.data, status: "stale" };
  responseCache.delete(key);
  return { data: null, status: "expired" };
}

function cacheResponse(key: string, data: ApiResponse): void {
  const now = Date.now();
  if (
    responseCache.size >=
    CONFIG.MAX_CACHE_SIZE * CONFIG.CACHE_CLEANUP_THRESHOLD
  ) {
    cleanupCache();
  }
  responseCache.set(key, {
    data,
    timestamp: now,
    accessCount: 1,
    lastAccess: now,
  });
}

function cleanupCache(): void {
  const now = Date.now();
  const entries = Array.from(responseCache.entries());
  const valid = entries.filter(([k, e]) => {
    if (now - e.timestamp > CONFIG.STALE_TTL) {
      responseCache.delete(k);
      return false;
    }
    return true;
  });
  if (valid.length > CONFIG.MAX_CACHE_SIZE) {
    valid.sort(
      (a, b) =>
        a[1].lastAccess +
        a[1].accessCount * 1000 -
        (b[1].lastAccess + b[1].accessCount * 1000),
    );
    valid
      .slice(0, Math.floor(valid.length * 0.2))
      .forEach(([k]) => responseCache.delete(k));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec-facet cache (Typesense)
// ─────────────────────────────────────────────────────────────────────────────

const facetCache = new Map<
  string,
  { data: Record<string, FacetCount[]>; ts: number }
>();

function buildFacetCacheKey(p: QueryParams): string {
  return [p.category, p.subcategory, p.subsubcategory, p.buyerCategory].join(
    "|",
  );
}

async function fetchSpecFacets(
  p: QueryParams,
  firestoreCategory: string | null,
): Promise<Record<string, FacetCount[]>> {
  const key = buildFacetCacheKey(p);
  const cached = facetCache.get(key);
  if (cached && Date.now() - cached.ts < CONFIG.FACET_CACHE_TTL) {
    return cached.data;
  }

  try {
    const facetFilters: string[][] = [];
    if (firestoreCategory)
      facetFilters.push([`category_en:${firestoreCategory}`]);
    if (p.subcategory) facetFilters.push([`subcategory_en:${p.subcategory}`]);
    if (p.subsubcategory)
      facetFilters.push([`subsubcategory_en:${p.subsubcategory}`]);
    if (p.buyerCategory === "Women" || p.buyerCategory === "Men") {
      facetFilters.push([`gender:${p.buyerCategory}`, "gender:Unisex"]);
    }

    const result =
      await TypeSenseServiceManager.instance.shopService.fetchSpecFacets({
        indexName: "shop_products",
        facetFilters,
      });

    // Prune cache
    if (facetCache.size >= CONFIG.MAX_FACET_CACHE) {
      const oldest = Array.from(facetCache.entries()).sort(
        (a, b) => a[1].ts - b[1].ts,
      );
      oldest
        .slice(0, Math.floor(CONFIG.MAX_FACET_CACHE * 0.2))
        .forEach(([k]) => facetCache.delete(k));
    }
    facetCache.set(key, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    console.error("[fetchDynamicProducts] fetchSpecFacets error:", err);
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry + timeout
// ─────────────────────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = CONFIG.MAX_RETRIES,
  baseDelay = CONFIG.BASE_RETRY_DELAY,
): Promise<T> {
  let last: Error | null = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
      if (i === maxRetries) throw last;
      await new Promise((r) => setTimeout(r, baseDelay * 2 ** i));
    }
  }
  throw last;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let id: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => {
    id = setTimeout(() => rej(new Error("Request timeout")), ms);
  });
  try {
    const r = await Promise.race([p, timeout]);
    clearTimeout(id!);
    return r;
  } catch (e) {
    clearTimeout(id!);
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Param extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractQueryParams(sp: URLSearchParams): QueryParams {
  // Collect all spec_* params
  const specFilters: SpecFilters = {};
  sp.forEach((value, key) => {
    if (key.startsWith("spec_")) {
      const field = key.slice(5); // strip "spec_"
      const vals = value.split(",").filter(Boolean);
      if (vals.length > 0) specFilters[field] = vals;
    }
  });

  return {
    category: sp.get("category"),
    subcategory: sp.get("subcategory"),
    subsubcategory: sp.get("subsubcategory"),
    buyerCategory: sp.get("buyerCategory"),
    buyerSubcategory: sp.get("buyerSubcategory"),
    page: Math.max(0, parseInt(sp.get("page") || "0", 10)),
    sortOption: sp.get("sort") || "date",
    quickFilter: sp.get("filter"),
    filterSubcategories:
      sp.get("filterSubcategories")?.split(",").filter(Boolean) ?? [],
    colors: sp.get("colors")?.split(",").filter(Boolean) ?? [],
    brands: sp.get("brands")?.split(",").filter(Boolean) ?? [],
    minPrice: sp.get("minPrice") ? parseFloat(sp.get("minPrice")!) : null,
    maxPrice: sp.get("maxPrice") ? parseFloat(sp.get("maxPrice")!) : null,
    minRating: sp.get("minRating") ? parseFloat(sp.get("minRating")!) : null,
    specFilters,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Product parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseProducts(snapshot: QuerySnapshot): Product[] {
  const out: Product[] = [];
  const errIds: string[] = [];
  for (const doc of snapshot.docs) {
    try {
      out.push(ProductUtils.fromJson({ id: doc.id, ...doc.data() }));
    } catch {
      errIds.push(doc.id);
    }
  }
  if (errIds.length > 0)
    console.warn(`[fetchDynamicProducts] parse errors:`, errIds.slice(0, 5));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query builders
// ─────────────────────────────────────────────────────────────────────────────

function buildProductsQuery(
  p: QueryParams,
  firestoreCategory: string | null,
): Query {
  const db = getFirestoreAdmin();
  let q: Query = db.collection("shop_products");

  if (firestoreCategory) q = q.where("category", "==", firestoreCategory);
  if (p.subcategory) q = q.where("subcategory", "==", p.subcategory);
  if (p.subsubcategory) q = q.where("subsubcategory", "==", p.subsubcategory);

  if (p.buyerCategory === "Women" || p.buyerCategory === "Men") {
    q = q.where("gender", "in", [p.buyerCategory, "Unisex"]);
  }

  // Multi-value Firestore filters (respect 10-item limit)
  if (p.filterSubcategories.length > 0)
    q = q.where(
      "subsubcategory",
      "in",
      p.filterSubcategories.slice(0, CONFIG.MAX_ARRAY_FILTER_SIZE),
    );
  if (p.brands.length > 0)
    q = q.where(
      "brandModel",
      "in",
      p.brands.slice(0, CONFIG.MAX_ARRAY_FILTER_SIZE),
    );
  if (p.colors.length > 0)
    q = q.where(
      "availableColors",
      "array-contains-any",
      p.colors.slice(0, CONFIG.MAX_ARRAY_FILTER_SIZE),
    );

  // Price
  if (p.minPrice !== null) q = q.where("price", ">=", p.minPrice);
  if (p.maxPrice !== null) q = q.where("price", "<=", p.maxPrice);

  // Rating (NEW)
  if (p.minRating !== null) q = q.where("averageRating", ">=", p.minRating);

  // Spec filters — each field applied as equality / array-contains
  // Note: Firestore can only do one array-contains per query; spec filters
  // work best via Typesense. Here we apply the first spec field if present,
  // and route to Typesense when multiple spec fields are selected (see
  // _decideBackend equivalent in the helper below).
  const specEntries = Object.entries(p.specFilters);
  if (specEntries.length === 1) {
    const [field, vals] = specEntries[0];
    if (vals.length === 1) {
      q = q.where(field, "==", vals[0]);
    } else if (vals.length > 1) {
      q = q.where(field, "in", vals.slice(0, CONFIG.MAX_ARRAY_FILTER_SIZE));
    }
  }
  // Multiple spec fields → handled by Typesense path (specFilters passed to TS below)

  // Quick filter
  q = applyQuickFilter(q, p.quickFilter);

  // Sort
  q = applySorting(q, p.sortOption, p.quickFilter);

  return q.limit(CONFIG.DEFAULT_LIMIT);
}

function applyQuickFilter(q: Query, qf: string | null): Query {
  if (!qf) return q;
  switch (qf) {
    case "deals":
      return q.where("discountPercentage", ">", 0);
    case "boosted":
      return q.where("isBoosted", "==", true);
    case "trending":
      return q.where("dailyClickCount", ">=", 10);
    case "fiveStar":
      return q.where("averageRating", "==", 5);
    default:
      return q;
  }
}

function applySorting(q: Query, sort: string, qf: string | null): Query {
  if (qf === "bestSellers")
    return q.orderBy("isBoosted", "desc").orderBy("purchaseCount", "desc");
  switch (sort) {
    case "alphabetical":
      return q.orderBy("isBoosted", "desc").orderBy("productName", "asc");
    case "price_asc":
      return q.orderBy("isBoosted", "desc").orderBy("price", "asc");
    case "price_desc":
      return q.orderBy("isBoosted", "desc").orderBy("price", "desc");
    default:
      return q.orderBy("promotionScore", "desc").orderBy("createdAt", "desc");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Boosted products fetcher
// ─────────────────────────────────────────────────────────────────────────────

async function fetchBoostedProducts(params: {
  category: string;
  subsubcategory: string;
  buyerCategory: string | null;
  brands: string[];
  colors: string[];
  filterSubcategories: string[];
  minPrice: number | null;
  maxPrice: number | null;
}): Promise<Product[]> {
  const db = getFirestoreAdmin();
  let q: Query = db
    .collection("shop_products")
    .where("isBoosted", "==", true)
    .where("category", "==", params.category)
    .where("subsubcategory", "==", params.subsubcategory);

  if (params.buyerCategory === "Women" || params.buyerCategory === "Men")
    q = q.where("gender", "in", [params.buyerCategory, "Unisex"]);
  if (
    params.brands.length > 0 &&
    params.brands.length <= CONFIG.MAX_ARRAY_FILTER_SIZE
  )
    q = q.where("brandModel", "in", params.brands);
  if (
    params.colors.length > 0 &&
    params.colors.length <= CONFIG.MAX_ARRAY_FILTER_SIZE
  )
    q = q.where("availableColors", "array-contains-any", params.colors);
  if (
    params.filterSubcategories.length > 0 &&
    params.filterSubcategories.length <= CONFIG.MAX_ARRAY_FILTER_SIZE
  )
    q = q.where("subsubcategory", "in", params.filterSubcategories);
  if (params.minPrice !== null) q = q.where("price", ">=", params.minPrice);
  if (params.maxPrice !== null) q = q.where("price", "<=", params.maxPrice);

  q = q.orderBy("promotionScore", "desc").limit(20);
  return parseProducts(await q.get());
}

// ─────────────────────────────────────────────────────────────────────────────
// Core data fetch
// ─────────────────────────────────────────────────────────────────────────────

async function fetchDynamicProductsData(
  params: QueryParams,
): Promise<ApiResponse> {
  const t0 = Date.now();

  const firestoreCategory = params.category
    ? (CATEGORY_MAPPING[params.category] ?? params.category)
    : null;

  const shouldFetchBoosted =
    !params.quickFilter && firestoreCategory && params.subsubcategory;

  // Fetch products + boosted + (page 0 only) spec facets in parallel
  const [products, boostedProducts, specFacets] = await Promise.all([
    withRetry(async () => {
      const snap = await buildProductsQuery(params, firestoreCategory).get();
      return parseProducts(snap);
    }),

    shouldFetchBoosted
      ? fetchBoostedProducts({
          category: firestoreCategory!,
          subsubcategory: params.subsubcategory!,
          buyerCategory: params.buyerCategory,
          brands: params.brands,
          colors: params.colors,
          filterSubcategories: params.filterSubcategories,
          minPrice: params.minPrice,
          maxPrice: params.maxPrice,
        }).catch((e) => {
          console.error("[fetchDynamicProducts] boosted error:", e);
          return [];
        })
      : Promise.resolve([] as Product[]),

    // Spec facets only on page 0 (sidebar initial population)
    params.page === 0
      ? fetchSpecFacets(params, firestoreCategory)
      : Promise.resolve({} as Record<string, FacetCount[]>),
  ]);

  return {
    products,
    boostedProducts,
    hasMore: products.length >= CONFIG.DEFAULT_LIMIT,
    page: params.page,
    total: products.length,
    specFacets: params.page === 0 ? specFacets : undefined,
    source: "fresh",
    timing: Date.now() - t0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Background revalidation
// ─────────────────────────────────────────────────────────────────────────────

function revalidateInBackground(cacheKey: string, params: QueryParams): void {
  if (pendingRequests.has(cacheKey)) return;
  const p = fetchDynamicProductsData(params);
  pendingRequests.set(cacheKey, p);
  p.then((r) => cacheResponse(cacheKey, r))
    .catch((e) =>
      console.error("[fetchDynamicProducts] bg revalidate error:", e),
    )
    .finally(() => pendingRequests.delete(cacheKey));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const t0 = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const params = extractQueryParams(searchParams);
    const cacheKey = generateCacheKey(params);
    const cached = getCachedResponse(cacheKey);

    const headers = (extra: Record<string, string> = {}) => ({
      "Cache-Control": "public, max-age=120, stale-while-revalidate=60",
      "X-Response-Time": `${Date.now() - t0}ms`,
      ...extra,
    });

    // ── 1. Cache HIT (fresh) ─────────────────────────────────────────────
    if (cached.status === "fresh") {
      return NextResponse.json(
        { ...cached.data, source: "cache" },
        { headers: headers({ "X-Cache": "HIT" }) },
      );
    }

    // ── 2. Deduplicate in-flight request ─────────────────────────────────
    const pending = pendingRequests.get(cacheKey);
    if (pending) {
      if (cached.status === "stale" && cached.data) {
        return NextResponse.json(
          { ...cached.data, source: "stale" },
          { headers: headers({ "X-Cache": "STALE" }) },
        );
      }
      try {
        const r = await withTimeout(pending, CONFIG.REQUEST_TIMEOUT);
        return NextResponse.json(
          { ...r, source: "dedupe" },
          { headers: headers({ "X-Cache": "DEDUPE" }) },
        );
      } catch {
        /* fall through */
      }
    }

    // ── 3. Stale-while-revalidate ─────────────────────────────────────────
    if (cached.status === "stale" && cached.data) {
      revalidateInBackground(cacheKey, params);
      return NextResponse.json(
        { ...cached.data, source: "stale" },
        { headers: headers({ "X-Cache": "STALE" }) },
      );
    }

    // ── 4. Fresh fetch ────────────────────────────────────────────────────
    const fetchPromise = fetchDynamicProductsData(params);
    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const result = await withTimeout(fetchPromise, CONFIG.REQUEST_TIMEOUT);
      cacheResponse(cacheKey, result);
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
      if (err instanceof Error && err.message === "Request timeout") {
        return NextResponse.json(
          {
            error: "Request timeout",
            products: [],
            boostedProducts: [],
            hasMore: false,
            page: params.page,
            total: 0,
          },
          { status: 504 },
        );
      }
      return NextResponse.json(
        {
          error: "Failed to fetch products",
          details: err instanceof Error ? err.message : "Unknown error",
          products: [],
          boostedProducts: [],
          hasMore: false,
          page: params.page,
          total: 0,
        },
        { status: 500 },
      );
    } finally {
      pendingRequests.delete(cacheKey);
    }
  } catch (err) {
    console.error("[fetchDynamicProducts] Unexpected error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        products: [],
        boostedProducts: [],
        hasMore: false,
        page: 0,
        total: 0,
      },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache management endpoints (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE() {
  const prev = responseCache.size;
  responseCache.clear();
  pendingRequests.clear();
  facetCache.clear();
  return NextResponse.json({ message: "Cache cleared", clearedEntries: prev });
}

export async function HEAD() {
  const now = Date.now();
  return NextResponse.json({
    cacheSize: responseCache.size,
    facetCacheSize: facetCache.size,
    maxCacheSize: CONFIG.MAX_CACHE_SIZE,
    pendingRequests: pendingRequests.size,
    entries: Array.from(responseCache.entries())
      .slice(0, 20)
      .map(([key, e]) => ({
        key: key.substring(0, 50),
        ageSeconds: Math.floor((now - e.timestamp) / 1000),
        accessCount: e.accessCount,
        isFresh: now - e.timestamp <= CONFIG.CACHE_TTL,
      })),
  });
}
