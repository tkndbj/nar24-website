// src/app/api/fetchDynamicTerasProducts/route.ts
//
// Dynamic Teras Products API
// - Initial load (no filters, default sort) → Firestore `products` collection
// - Filtering / sorting → Typesense `products` index via mainService
// - Spec facets fetched from Typesense on page 0

import { NextRequest, NextResponse } from "next/server";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Query,
  DocumentData,
  QueryConstraint,
  CollectionReference,
  QuerySnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
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
  REQUEST_TIMEOUT: 12_000,
  MAX_RETRIES: 2,
  BASE_RETRY_DELAY: 100,
  FACET_CACHE_TTL: 5 * 60 * 1000,
  MAX_FACET_CACHE: 50,
  DEBUG: process.env.NODE_ENV === "development",
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
  quickFilter: string | null;
  filterSubcategories: string[];
  colors: string[];
  brands: string[];
  specFilters: SpecFilters;
  minPrice: number | null;
  maxPrice: number | null;
  minRating: number | null;
  page: number;
  filterBuyerCategory: string | null;
  filterBuyerSubcategory: string | null;
  filterBuyerSubSubcategory: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category mappings
// ─────────────────────────────────────────────────────────────────────────────

const URL_TO_FIRESTORE_CATEGORY: Record<string, string> = {
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

const BUYER_TO_PRODUCT_CATEGORY: Record<string, Record<string, string>> = {
  Women: {
    Fashion: "Clothing & Fashion",
    Shoes: "Footwear",
    Accessories: "Accessories",
    Bags: "Bags & Luggage",
    "Self Care": "Beauty & Personal Care",
  },
  Men: {
    Fashion: "Clothing & Fashion",
    Shoes: "Footwear",
    Accessories: "Accessories",
    Bags: "Bags & Luggage",
    "Self Care": "Beauty & Personal Care",
  },
};

const DIRECT_CATEGORY_MAP: Record<string, string> = {
  "Mother & Child": "Mother & Child",
  "Home & Furniture": "Home & Furniture",
  Electronics: "Electronics",
  "Books, Stationery & Hobby": "Books, Stationery & Hobby",
  "Sports & Outdoor": "Sports & Outdoor",
  "Tools & Hardware": "Tools & Hardware",
  "Pet Supplies": "Pet Supplies",
  Automotive: "Automotive",
  "Health & Wellness": "Health & Wellness",
};

// ─────────────────────────────────────────────────────────────────────────────
// Request deduplication + caching
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
    fsc: p.filterSubcategories.sort().join(","),
    col: p.colors.sort().join(","),
    br: p.brands.sort().join(","),
    sf: JSON.stringify(
      Object.fromEntries(
        Object.entries(p.specFilters).map(([k, v]) => [k, [...v].sort()]),
      ),
    ),
    minP: p.minPrice ?? "",
    maxP: p.maxPrice ?? "",
    minR: p.minRating ?? "",
    pg: p.page,
    fbc: p.filterBuyerCategory || "",
    fbsc: p.filterBuyerSubcategory || "",
    fbssc: p.filterBuyerSubSubcategory || "",
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
  if (
    responseCache.size >=
    CONFIG.MAX_CACHE_SIZE * CONFIG.CACHE_CLEANUP_THRESHOLD
  ) {
    cleanupCache();
  }
  const now = Date.now();
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
      await TypeSenseServiceManager.instance.mainService.fetchSpecFacets({
        indexName: "products",
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
    console.error("[TerasProducts] fetchSpecFacets error:", err);
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
// Logging
// ─────────────────────────────────────────────────────────────────────────────

function log(message: string, data?: unknown): void {
  if (CONFIG.DEBUG) {
    if (data) console.log(`[TerasProducts] ${message}`, data);
    else console.log(`[TerasProducts] ${message}`);
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
    quickFilter: sp.get("filter"),
    filterSubcategories:
      sp.get("filterSubcategories")?.split(",").filter(Boolean) ?? [],
    colors: sp.get("colors")?.split(",").filter(Boolean) ?? [],
    brands: sp.get("brands")?.split(",").filter(Boolean) ?? [],
    minPrice: sp.get("minPrice") ? parseFloat(sp.get("minPrice")!) : null,
    maxPrice: sp.get("maxPrice") ? parseFloat(sp.get("maxPrice")!) : null,
    minRating: sp.get("minRating") ? parseFloat(sp.get("minRating")!) : null,
    specFilters,
    filterBuyerCategory: sp.get("filterBuyerCategory"),
    filterBuyerSubcategory: sp.get("filterBuyerSubcategory"),
    filterBuyerSubSubcategory: sp.get("filterBuyerSubSubcategory"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Category helpers
// ─────────────────────────────────────────────────────────────────────────────

function convertToFirestoreCategory(urlCategory: string | null): string | null {
  if (!urlCategory) return null;
  return URL_TO_FIRESTORE_CATEGORY[urlCategory] || urlCategory;
}

// ─────────────────────────────────────────────────────────────────────────────
// Effective filters
// ─────────────────────────────────────────────────────────────────────────────

interface EffectiveFilters {
  category: string | null;
  gender: string | null;
  subcategory: string | null;
  subsubcategory: string | null;
}

function calculateEffectiveFilters(
  params: QueryParams,
  firestoreCategory: string | null,
): EffectiveFilters {
  let effectiveCategory = firestoreCategory;
  let effectiveGender: string | null = null;
  let effectiveSubcategory = params.subcategory;
  let effectiveSubSubcategory = params.subsubcategory;

  if (params.filterBuyerCategory) {
    if (
      params.filterBuyerCategory === "Women" ||
      params.filterBuyerCategory === "Men"
    ) {
      effectiveGender = params.filterBuyerCategory;
    }

    if (params.filterBuyerSubcategory) {
      const mappedCategory =
        BUYER_TO_PRODUCT_CATEGORY[params.filterBuyerCategory]?.[
          params.filterBuyerSubcategory
        ];
      if (mappedCategory && !firestoreCategory) {
        effectiveCategory = mappedCategory;
      }
    } else if (
      params.filterBuyerCategory !== "Women" &&
      params.filterBuyerCategory !== "Men"
    ) {
      const mappedCategory = DIRECT_CATEGORY_MAP[params.filterBuyerCategory];
      if (mappedCategory && !firestoreCategory) {
        effectiveCategory = mappedCategory;
      }
    }
  }

  if (params.buyerCategory === "Women" || params.buyerCategory === "Men") {
    effectiveGender = params.buyerCategory;
  }

  if (
    params.filterBuyerCategory &&
    (params.filterBuyerCategory === "Women" ||
      params.filterBuyerCategory === "Men") &&
    params.filterBuyerSubcategory &&
    params.filterBuyerSubSubcategory &&
    !params.subcategory
  ) {
    effectiveSubcategory = params.filterBuyerSubSubcategory;
  }

  if (
    !effectiveSubSubcategory &&
    params.filterBuyerSubSubcategory &&
    !(
      params.filterBuyerCategory &&
      (params.filterBuyerCategory === "Women" ||
        params.filterBuyerCategory === "Men") &&
      params.filterBuyerSubcategory
    )
  ) {
    effectiveSubSubcategory = params.filterBuyerSubSubcategory;
  }

  return {
    category: effectiveCategory,
    gender: effectiveGender,
    subcategory: effectiveSubcategory,
    subsubcategory: effectiveSubSubcategory,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend decision (mirrors fetchDynamicProducts pattern)
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
// Firestore query (initial load only — no dynamic filters)
// ─────────────────────────────────────────────────────────────────────────────

function parseProducts(snapshot: QuerySnapshot<DocumentData>): Product[] {
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
    console.warn(`[TerasProducts] parse errors:`, errIds.slice(0, 5));
  return out;
}

function buildFirestoreQuery(
  params: QueryParams,
  effectiveFilters: EffectiveFilters,
): Query<DocumentData, DocumentData> {
  const collectionRef: CollectionReference<DocumentData, DocumentData> =
    collection(db, "products");
  const constraints: QueryConstraint[] = [];

  if (effectiveFilters.category) {
    constraints.push(where("category", "==", effectiveFilters.category));
  }
  if (effectiveFilters.gender) {
    constraints.push(
      where("gender", "in", [effectiveFilters.gender, "Unisex"]),
    );
  }
  if (effectiveFilters.subcategory) {
    constraints.push(where("subcategory", "==", effectiveFilters.subcategory));
  }
  if (effectiveFilters.subsubcategory) {
    constraints.push(
      where("subsubcategory", "==", effectiveFilters.subsubcategory),
    );
  }

  // Quick filters (Firestore-only path)
  if (params.quickFilter) {
    switch (params.quickFilter) {
      case "deals":
        constraints.push(where("discountPercentage", ">", 0));
        break;
      case "boosted":
        constraints.push(where("isBoosted", "==", true));
        break;
      case "trending":
        constraints.push(where("isTrending", "==", true));
        break;
      case "fiveStar":
        constraints.push(where("averageRating", "==", 5));
        break;
    }
  }

  if (params.quickFilter === "bestSellers") {
    constraints.push(orderBy("purchaseCount", "desc"));
  } else {
    constraints.push(orderBy("createdAt", "desc"));
  }

  constraints.push(limit(CONFIG.DEFAULT_LIMIT));
  return query(collectionRef, ...constraints);
}

// ─────────────────────────────────────────────────────────────────────────────
// Typesense fetch (filtering + sorting)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchFromTypesense(
  p: QueryParams,
  firestoreCategory: string | null,
): Promise<{ products: Product[]; hasMore: boolean }> {
  const facetFilters: string[][] = [];

  if (firestoreCategory)
    facetFilters.push([`category_en:${firestoreCategory}`]);
  if (p.subcategory) facetFilters.push([`subcategory_en:${p.subcategory}`]);
  if (p.subsubcategory)
    facetFilters.push([`subsubcategory_en:${p.subsubcategory}`]);

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

  // Spec filters: each field is its own AND group
  for (const [field, vals] of Object.entries(p.specFilters)) {
    if (vals.length > 0) facetFilters.push(vals.map((v) => `${field}:${v}`));
  }

  // Numeric filters
  const numericFilters: string[] = [];
  if (p.minPrice !== null)
    numericFilters.push(`price>=${Math.floor(p.minPrice)}`);
  if (p.maxPrice !== null)
    numericFilters.push(`price<=${Math.ceil(p.maxPrice)}`);
  if (p.minRating !== null)
    numericFilters.push(`averageRating>=${p.minRating}`);

  const res =
    await TypeSenseServiceManager.instance.mainService.searchIdsWithFacets({
      indexName: "products",
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

  return { products, hasMore: res.page < res.nbPages - 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core data fetch
// ─────────────────────────────────────────────────────────────────────────────

async function fetchTerasProductsData(
  params: QueryParams,
): Promise<ApiResponse> {
  const t0 = Date.now();

  const firestoreCategory = convertToFirestoreCategory(params.category);
  const effectiveFilters = calculateEffectiveFilters(params, firestoreCategory);
  const backend = decideBackend(params);

  log(`Backend: ${backend}`, effectiveFilters);

  const [{ products, hasMore }, specFacets] = await Promise.all([
    backend === "typesense"
      ? fetchFromTypesense(params, firestoreCategory)
      : withRetry(async () => {
          const q = buildFirestoreQuery(params, effectiveFilters);
          const snapshot = await getDocs(q);
          const products = parseProducts(snapshot);
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
    boostedProducts: [],
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
  const p = fetchTerasProductsData(params);
  pendingRequests.set(cacheKey, p);
  p.then((r) => cacheResponse(cacheKey, r))
    .catch((e) =>
      console.error("[TerasProducts] bg revalidate error:", e),
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

    const fetchPromise = fetchTerasProductsData(params);
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
    console.error("[TerasProducts] Unexpected error:", err);
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
