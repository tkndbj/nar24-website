// src/app/api/fetchDynamicProducts/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { FieldPath } from "firebase-admin/firestore";
import type { Query, QuerySnapshot } from "firebase-admin/firestore";
import { Product, ProductUtils } from "@/app/models/Product";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import type { FacetCount } from "@/app/components/FilterSideBar";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  DEFAULT_LIMIT: 20,
  CACHE_TTL: 2 * 60 * 1000,
  STALE_TTL: 5 * 60 * 1000,
  MAX_CACHE_SIZE: 200,
  CACHE_CLEANUP_THRESHOLD: 0.9,
  REQUEST_TIMEOUT: 10_000,
  MAX_RETRIES: 2,
  BASE_RETRY_DELAY: 100,
  FACET_CACHE_TTL: 5 * 60 * 1000,
  MAX_FACET_CACHE: 50,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type SpecFilters = Record<string, string[]>;

interface ApiResponse {
  products: Product[];
  boostedProducts: Product[];
  hasMore: boolean;
  page: number;
  total: number;
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
  brands: string[];
  colors: string[];
  filterSubcategories: string[];
  specFilters: SpecFilters;
  minPrice: number | null;
  maxPrice: number | null;
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
// Spec-facet cache
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
    // Build same category filters Flutter uses for facet fetch
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
  const specFilters: SpecFilters = {};
  sp.forEach((value, key) => {
    if (key.startsWith("spec_")) {
      const field = key.slice(5);
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
// Product parsing (Firestore)
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
// Backend decision (mirrors Flutter's _decideBackend exactly)
// ─────────────────────────────────────────────────────────────────────────────

function decideBackend(p: QueryParams): "firestore" | "typesense" {
  if (p.sortOption !== "date") return "typesense";
  if (
    p.brands.length > 0 ||
    p.colors.length > 0 ||
    p.filterSubcategories.length > 0 ||
    Object.keys(p.specFilters).length > 0 ||
    p.minPrice !== null ||
    p.maxPrice !== null ||
    p.minRating !== null
  )
    return "typesense";
  return "firestore";
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore query (mirrors Flutter's _buildFirestoreQuery exactly)
// Only category/subcategory/subsubcategory/gender — nothing else.
// Always ordered by promotionScore DESC, documentId ASC.
// ─────────────────────────────────────────────────────────────────────────────

function buildFirestoreQuery(
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

  q = q
    .orderBy("promotionScore", "desc")
    .orderBy(FieldPath.documentId(), "asc");

  // Offset pagination for pages beyond the first
  if (p.page > 0) {
    q = q.offset(p.page * CONFIG.DEFAULT_LIMIT);
  }

  return q.limit(CONFIG.DEFAULT_LIMIT);
}

// ─────────────────────────────────────────────────────────────────────────────
// Typesense fetch (mirrors Flutter's _fetchPageFromTypeSense exactly)
// Parses products directly from hits — no Firestore round-trip.
// ─────────────────────────────────────────────────────────────────────────────

async function fetchFromTypesense(
  p: QueryParams,
  firestoreCategory: string | null,
): Promise<{ products: Product[]; hasMore: boolean }> {
  // Build facet filter groups (mirrors Flutter's _buildTypeSenseFacetFilters)
  const facetFilters: string[][] = [];

  if (firestoreCategory)
    facetFilters.push([`category_en:${firestoreCategory}`]);
  if (p.subcategory) facetFilters.push([`subcategory_en:${p.subcategory}`]);
  if (p.subsubcategory)
    facetFilters.push([`subsubcategory_en:${p.subsubcategory}`]);

  // Gender: Women OR Unisex / Men OR Unisex (mirrors Flutter)
  if (p.buyerCategory === "Women" || p.buyerCategory === "Men") {
    facetFilters.push([`gender:${p.buyerCategory}`, "gender:Unisex"]);
  }

  // Dynamic filters — each is its own AND group, OR within the group
  if (p.brands.length > 0)
    facetFilters.push(p.brands.map((b) => `brandModel:${b}`));
  if (p.colors.length > 0)
    facetFilters.push(p.colors.map((c) => `availableColors:${c}`));
  if (p.filterSubcategories.length > 0)
    facetFilters.push(
      p.filterSubcategories.map((s) => `subsubcategory_en:${s}`),
    );

  // Spec filters: each field is its own AND group (mirrors Flutter)
  for (const [field, vals] of Object.entries(p.specFilters)) {
    if (vals.length > 0) facetFilters.push(vals.map((v) => `${field}:${v}`));
  }

  // Numeric filters (mirrors Flutter's _buildTypeSenseNumericFilters)
  const numericFilters: string[] = [];
  if (p.minPrice !== null)
    numericFilters.push(`price>=${Math.floor(p.minPrice)}`);
  if (p.maxPrice !== null)
    numericFilters.push(`price<=${Math.ceil(p.maxPrice)}`);
  if (p.minRating !== null)
    numericFilters.push(`averageRating>=${p.minRating}`);

  const res =
    await TypeSenseServiceManager.instance.shopService.searchIdsWithFacets({
      indexName: "shop_products",
      page: p.page,
      hitsPerPage: CONFIG.DEFAULT_LIMIT,
      facetFilters,
      numericFilters,
      sortOption: p.sortOption,
    });

  // Parse directly from Typesense hits — no Firestore round-trip
  const products = res.hits.map((hit) =>
    ProductUtils.fromJson({ ...hit, id: hit.objectID || hit.id }),
  );

  // hasMore: page-based (mirrors Flutter: res.page < res.nbPages - 1)
  return { products, hasMore: res.page < res.nbPages - 1 };
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

  const backend = decideBackend(params);

  const [{ products, hasMore }, specFacets] = await Promise.all([
    backend === "typesense"
      ? fetchFromTypesense(params, firestoreCategory)
      : withRetry(async () => {
          const snap = await buildFirestoreQuery(
            params,
            firestoreCategory,
          ).get();
          const products = parseProducts(snap);
          return {
            products,
            hasMore: products.length >= CONFIG.DEFAULT_LIMIT,
          };
        }),

    params.page === 0
      ? fetchSpecFacets(params, firestoreCategory)
      : Promise.resolve({} as Record<string, FacetCount[]>),
  ]);

  return {
    products,
    boostedProducts: [], // Always empty — promotionScore ordering handles this
    hasMore,
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

    if (cached.status === "fresh") {
      return NextResponse.json(
        { ...cached.data, source: "cache" },
        { headers: headers({ "X-Cache": "HIT" }) },
      );
    }

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

    if (cached.status === "stale" && cached.data) {
      revalidateInBackground(cacheKey, params);
      return NextResponse.json(
        { ...cached.data, source: "stale" },
        { headers: headers({ "X-Cache": "STALE" }) },
      );
    }

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
