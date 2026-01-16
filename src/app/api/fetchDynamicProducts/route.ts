// src/app/api/fetchDynamicProducts/route.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC PRODUCTS API - PRODUCTION OPTIMIZED
// ═══════════════════════════════════════════════════════════════════════════
//
// OPTIMIZATIONS:
// 1. Request Deduplication - Prevents duplicate in-flight requests
// 2. Retry with Exponential Backoff - Handles transient Firestore failures
// 3. Stale-While-Revalidate Caching - Fast responses with background refresh
// 4. Request Timeout - Prevents hanging requests
// 5. Graceful Degradation - Boosted products failure doesn't break main query
// 6. LRU Cache with Smart Eviction - Memory-efficient caching
//
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import type { Query, QuerySnapshot } from "firebase-admin/firestore";
import { Product, ProductUtils } from "@/app/models/Product";

// ============= CONFIGURATION =============

const CONFIG = {
  // Pagination
  DEFAULT_LIMIT: 20,
  MAX_ARRAY_FILTER_SIZE: 10,

  // Caching
  CACHE_TTL: 2 * 60 * 1000, // 2 minutes - fresh
  STALE_TTL: 5 * 60 * 1000, // 5 minutes - stale but usable
  MAX_CACHE_SIZE: 200,
  CACHE_CLEANUP_THRESHOLD: 0.9,

  // Resilience
  REQUEST_TIMEOUT: 10000, // 10 seconds
  MAX_RETRIES: 2,
  BASE_RETRY_DELAY: 100,
} as const;

// ============= TYPES =============

interface ApiResponse {
  products: Product[];
  boostedProducts: Product[];
  hasMore: boolean;
  page: number;
  total: number;
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
  minPrice: number | null;
  maxPrice: number | null;
  page: number;
}

// ============= CATEGORY MAPPING =============

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

// ============= REQUEST DEDUPLICATION =============

const pendingRequests = new Map<string, Promise<ApiResponse>>();

// ============= RESPONSE CACHING WITH LRU =============

const responseCache = new Map<string, CacheEntry>();

function generateCacheKey(params: QueryParams): string {
  return JSON.stringify({
    c: params.category || "",
    sc: params.subcategory || "",
    ssc: params.subsubcategory || "",
    bc: params.buyerCategory || "",
    bsc: params.buyerSubcategory || "",
    so: params.sortOption,
    qf: params.quickFilter || "",
    br: params.brands.sort().join(","),
    col: params.colors.sort().join(","),
    fsc: params.filterSubcategories.sort().join(","),
    minP: params.minPrice ?? "",
    maxP: params.maxPrice ?? "",
    p: params.page,
  });
}

function getCachedResponse(cacheKey: string): CacheResult {
  const entry = responseCache.get(cacheKey);

  if (!entry) {
    return { data: null, status: "miss" };
  }

  const now = Date.now();
  const age = now - entry.timestamp;

  // Update access stats for LRU (regardless of freshness)
  entry.accessCount++;
  entry.lastAccess = now;

  if (age <= CONFIG.CACHE_TTL) {
    return { data: entry.data, status: "fresh" };
  }

  if (age <= CONFIG.STALE_TTL) {
    return { data: entry.data, status: "stale" };
  }

  // Expired
  responseCache.delete(cacheKey);
  return { data: null, status: "expired" };
}

function cacheResponse(cacheKey: string, data: ApiResponse): void {
  const now = Date.now();

  // Trigger cleanup if approaching max size
  if (
    responseCache.size >=
    CONFIG.MAX_CACHE_SIZE * CONFIG.CACHE_CLEANUP_THRESHOLD
  ) {
    cleanupCache();
  }

  responseCache.set(cacheKey, {
    data,
    timestamp: now,
    accessCount: 1,
    lastAccess: now,
  });
}

function cleanupCache(): void {
  const now = Date.now();
  const entries = Array.from(responseCache.entries());

  // Remove expired entries first
  const validEntries = entries.filter(([key, entry]) => {
    if (now - entry.timestamp > CONFIG.STALE_TTL) {
      responseCache.delete(key);
      return false;
    }
    return true;
  });

  // If still over limit, remove least recently used
  if (validEntries.length > CONFIG.MAX_CACHE_SIZE) {
    // Score = lastAccess + (accessCount * 1000) - higher is better
    validEntries.sort((a, b) => {
      const scoreA = a[1].lastAccess + a[1].accessCount * 1000;
      const scoreB = b[1].lastAccess + b[1].accessCount * 1000;
      return scoreA - scoreB; // Lowest scores first (to remove)
    });

    // Remove oldest 20%
    const toRemove = Math.floor(validEntries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      responseCache.delete(validEntries[i][0]);
    }
  }
}

// ============= RETRY LOGIC =============

async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = CONFIG.MAX_RETRIES,
    baseDelay = CONFIG.BASE_RETRY_DELAY,
    shouldRetry = () => true,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!shouldRetry(error) || attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ============= TIMEOUT WRAPPER =============

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = "Request timeout"
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

// ============= HELPER FUNCTIONS =============

function extractQueryParams(searchParams: URLSearchParams): QueryParams {
  const minPriceStr = searchParams.get("minPrice");
  const maxPriceStr = searchParams.get("maxPrice");

  return {
    category: searchParams.get("category"),
    subcategory: searchParams.get("subcategory"),
    subsubcategory: searchParams.get("subsubcategory"),
    buyerCategory: searchParams.get("buyerCategory"),
    buyerSubcategory: searchParams.get("buyerSubcategory"),
    page: Math.max(0, parseInt(searchParams.get("page") || "0", 10)),
    sortOption: searchParams.get("sort") || "date",
    quickFilter: searchParams.get("filter"),
    filterSubcategories:
      searchParams.get("filterSubcategories")?.split(",").filter(Boolean) || [],
    colors: searchParams.get("colors")?.split(",").filter(Boolean) || [],
    brands: searchParams.get("brands")?.split(",").filter(Boolean) || [],
    minPrice: minPriceStr ? parseFloat(minPriceStr) : null,
    maxPrice: maxPriceStr ? parseFloat(maxPriceStr) : null,
  };
}

function parseProducts(snapshot: QuerySnapshot): Product[] {
  const products: Product[] = [];
  const errorIds: string[] = [];

  for (const doc of snapshot.docs) {
    try {
      const data = { id: doc.id, ...doc.data() };
      products.push(ProductUtils.fromJson(data));
    } catch (error) {
      errorIds.push(doc.id);
      if (process.env.NODE_ENV === "development") {
        console.error(
          `[fetchDynamicProducts] Parse error for ${doc.id}:`,
          error
        );
      }
    }
  }

  if (errorIds.length > 0) {
    console.warn(
      `[fetchDynamicProducts] Failed to parse ${errorIds.length} products:`,
      errorIds.slice(0, 5)
    );
  }

  return products;
}

// ============= QUERY BUILDERS =============

function buildProductsQuery(
  params: QueryParams,
  firestoreCategory: string | null
): Query {
  const db = getFirestoreAdmin();
  let queryRef: Query = db.collection("shop_products");

  // Category filters
  if (firestoreCategory) {
    queryRef = queryRef.where("category", "==", firestoreCategory);
  }

  if (params.subcategory) {
    queryRef = queryRef.where("subcategory", "==", params.subcategory);
  }

  if (params.subsubcategory) {
    queryRef = queryRef.where("subsubcategory", "==", params.subsubcategory);
  }

  // Gender filtering
  if (params.buyerCategory === "Women" || params.buyerCategory === "Men") {
    queryRef = queryRef.where("gender", "in", [params.buyerCategory, "Unisex"]);
  }

  // Dynamic filters (respect Firestore's 10-item limit)
  if (params.filterSubcategories.length > 0) {
    const subcats = params.filterSubcategories.slice(
      0,
      CONFIG.MAX_ARRAY_FILTER_SIZE
    );
    queryRef = queryRef.where("subsubcategory", "in", subcats);
  }

  if (params.brands.length > 0) {
    const brands = params.brands.slice(0, CONFIG.MAX_ARRAY_FILTER_SIZE);
    queryRef = queryRef.where("brandModel", "in", brands);
  }

  if (params.colors.length > 0) {
    const colors = params.colors.slice(0, CONFIG.MAX_ARRAY_FILTER_SIZE);
    queryRef = queryRef.where("availableColors", "array-contains-any", colors);
  }

  // Price filters
  if (params.minPrice !== null) {
    queryRef = queryRef.where("price", ">=", params.minPrice);
  }

  if (params.maxPrice !== null) {
    queryRef = queryRef.where("price", "<=", params.maxPrice);
  }

  // Quick filters
  queryRef = applyQuickFilter(queryRef, params.quickFilter);

  // Sorting
  queryRef = applySorting(queryRef, params.sortOption, params.quickFilter);

  // Limit
  queryRef = queryRef.limit(CONFIG.DEFAULT_LIMIT);

  return queryRef;
}

function applyQuickFilter(
  queryRef: Query,
  quickFilter: string | null
): Query {
  if (!quickFilter) return queryRef;

  switch (quickFilter) {
    case "deals":
      return queryRef.where("discountPercentage", ">", 0);
    case "boosted":
      return queryRef.where("isBoosted", "==", true);
    case "trending":
      return queryRef.where("dailyClickCount", ">=", 10);
    case "fiveStar":
      return queryRef.where("averageRating", "==", 5);
    // bestSellers handled in sorting
    default:
      return queryRef;
  }
}

function applySorting(
  queryRef: Query,
  sortOption: string,
  quickFilter: string | null
): Query {
  if (quickFilter === "bestSellers") {
    return queryRef.orderBy("isBoosted", "desc").orderBy("purchaseCount", "desc");
  }

  switch (sortOption) {
    case "alphabetical":
      return queryRef.orderBy("isBoosted", "desc").orderBy("productName", "asc");
    case "price_asc":
      return queryRef.orderBy("isBoosted", "desc").orderBy("price", "asc");
    case "price_desc":
      return queryRef.orderBy("isBoosted", "desc").orderBy("price", "desc");
    case "date":
    default:
      return queryRef.orderBy("promotionScore", "desc").orderBy("createdAt", "desc");
  }
}

// ============= BOOSTED PRODUCTS FETCHER =============

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
  let queryRef: Query = db.collection("shop_products")
    .where("isBoosted", "==", true)
    .where("category", "==", params.category)
    .where("subsubcategory", "==", params.subsubcategory);

  // Gender filtering
  if (params.buyerCategory === "Women" || params.buyerCategory === "Men") {
    queryRef = queryRef.where("gender", "in", [params.buyerCategory, "Unisex"]);
  }

  // Dynamic filters
  if (
    params.brands.length > 0 &&
    params.brands.length <= CONFIG.MAX_ARRAY_FILTER_SIZE
  ) {
    queryRef = queryRef.where("brandModel", "in", params.brands);
  }

  if (
    params.colors.length > 0 &&
    params.colors.length <= CONFIG.MAX_ARRAY_FILTER_SIZE
  ) {
    queryRef = queryRef.where("availableColors", "array-contains-any", params.colors);
  }

  if (
    params.filterSubcategories.length > 0 &&
    params.filterSubcategories.length <= CONFIG.MAX_ARRAY_FILTER_SIZE
  ) {
    queryRef = queryRef.where("subsubcategory", "in", params.filterSubcategories);
  }

  // Price filters
  if (params.minPrice !== null) {
    queryRef = queryRef.where("price", ">=", params.minPrice);
  }

  if (params.maxPrice !== null) {
    queryRef = queryRef.where("price", "<=", params.maxPrice);
  }

  // Sorting and limit
  queryRef = queryRef.orderBy("promotionScore", "desc").limit(20);

  const snapshot = await queryRef.get();

  return parseProducts(snapshot);
}

// ============= CORE DATA FETCHING =============

async function fetchDynamicProductsData(
  params: QueryParams
): Promise<ApiResponse> {
  const startTime = Date.now();

  // Convert category to Firestore format
  const firestoreCategory = params.category
    ? CATEGORY_MAPPING[params.category] || params.category
    : null;

  // Determine if we should fetch boosted products
  const shouldFetchBoosted =
    !params.quickFilter && firestoreCategory && params.subsubcategory;

  // Parallel fetching with graceful degradation
  const [products, boostedProducts] = await Promise.all([
    // Main products query with retry
    withRetry(async () => {
      const productsQuery = buildProductsQuery(params, firestoreCategory);
      const snapshot = await productsQuery.get();
      return parseProducts(snapshot);
    }),

    // Boosted products (graceful degradation - failure doesn't break main query)
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
        }).catch((error) => {
          console.error(
            "[fetchDynamicProducts] Boosted products failed:",
            error
          );
          return []; // Return empty array on failure
        })
      : Promise.resolve([]),
  ]);

  return {
    products,
    boostedProducts,
    hasMore: products.length >= CONFIG.DEFAULT_LIMIT,
    page: params.page,
    total: products.length,
    source: "fresh",
    timing: Date.now() - startTime,
  };
}

// ============= BACKGROUND REVALIDATION =============

function revalidateInBackground(cacheKey: string, params: QueryParams): void {
  if (pendingRequests.has(cacheKey)) {
    return;
  }

  const fetchPromise = fetchDynamicProductsData(params);
  pendingRequests.set(cacheKey, fetchPromise);

  fetchPromise
    .then((result) => {
      cacheResponse(cacheKey, result);
      console.log(`[fetchDynamicProducts] Background revalidation complete`);
    })
    .catch((error) => {
      console.error(
        `[fetchDynamicProducts] Background revalidation failed:`,
        error
      );
    })
    .finally(() => {
      pendingRequests.delete(cacheKey);
    });
}

// ============= MAIN HANDLER =============

export async function GET(request: NextRequest) {
  const requestStart = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const params = extractQueryParams(searchParams);
    const cacheKey = generateCacheKey(params);

    // ========== STEP 1: Check cache ==========
    const cacheResult = getCachedResponse(cacheKey);

    if (cacheResult.status === "fresh") {
      console.log(`[fetchDynamicProducts] Cache HIT (fresh)`);
      return NextResponse.json(
        { ...cacheResult.data, source: "cache" },
        {
          headers: {
            "Cache-Control": "public, max-age=120, stale-while-revalidate=60",
            "X-Cache": "HIT",
            "X-Response-Time": `${Date.now() - requestStart}ms`,
          },
        }
      );
    }

    // ========== STEP 2: Check for in-flight request ==========
    const pendingRequest = pendingRequests.get(cacheKey);

    if (pendingRequest) {
      console.log(`[fetchDynamicProducts] Deduplicating request`);

      // Return stale data if available
      if (cacheResult.status === "stale" && cacheResult.data) {
        return NextResponse.json(
          { ...cacheResult.data, source: "stale" },
          {
            headers: {
              "Cache-Control": "public, max-age=0, stale-while-revalidate=120",
              "X-Cache": "STALE",
              "X-Response-Time": `${Date.now() - requestStart}ms`,
            },
          }
        );
      }

      // Wait for pending request
      try {
        const result = await withTimeout(
          pendingRequest,
          CONFIG.REQUEST_TIMEOUT,
          "Deduplicated request timeout"
        );
        return NextResponse.json(
          { ...result, source: "dedupe" },
          {
            headers: {
              "Cache-Control": "public, max-age=120, stale-while-revalidate=60",
              "X-Cache": "DEDUPE",
              "X-Response-Time": `${Date.now() - requestStart}ms`,
            },
          }
        );
      } catch {
        // Fall through to fresh fetch
      }
    }

    // ========== STEP 3: Stale-while-revalidate ==========
    if (cacheResult.status === "stale" && cacheResult.data) {
      console.log(
        `[fetchDynamicProducts] Returning stale, revalidating in background`
      );
      revalidateInBackground(cacheKey, params);

      return NextResponse.json(
        { ...cacheResult.data, source: "stale" },
        {
          headers: {
            "Cache-Control": "public, max-age=0, stale-while-revalidate=120",
            "X-Cache": "STALE",
            "X-Response-Time": `${Date.now() - requestStart}ms`,
          },
        }
      );
    }

    // ========== STEP 4: Fresh fetch ==========
    console.log(`[fetchDynamicProducts] Fresh fetch`);

    const fetchPromise = fetchDynamicProductsData(params);
    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const result = await withTimeout(
        fetchPromise,
        CONFIG.REQUEST_TIMEOUT,
        "Request timeout"
      );

      cacheResponse(cacheKey, result);

      console.log(
        `[fetchDynamicProducts] Fetched ${result.products.length} products in ${result.timing}ms`
      );

      return NextResponse.json(
        { ...result, source: "fresh" },
        {
          headers: {
            "Cache-Control": "public, max-age=120, stale-while-revalidate=60",
            "X-Cache": "MISS",
            "X-Response-Time": `${Date.now() - requestStart}ms`,
            "X-Timing": `${result.timing}ms`,
          },
        }
      );
    } catch (error) {
      console.error(`[fetchDynamicProducts] Fetch error:`, error);

      if (error instanceof Error && error.message.includes("timeout")) {
        return NextResponse.json(
          {
            error: "Request timeout",
            products: [],
            boostedProducts: [],
            hasMore: false,
            page: params.page,
            total: 0,
          },
          { status: 504 }
        );
      }

      return NextResponse.json(
        {
          error: "Failed to fetch products",
          details: error instanceof Error ? error.message : "Unknown error",
          products: [],
          boostedProducts: [],
          hasMore: false,
          page: params.page,
          total: 0,
        },
        { status: 500 }
      );
    } finally {
      pendingRequests.delete(cacheKey);
    }
  } catch (error) {
    console.error(`[fetchDynamicProducts] Unexpected error:`, error);

    return NextResponse.json(
      {
        error: "Internal server error",
        products: [],
        boostedProducts: [],
        hasMore: false,
        page: 0,
        total: 0,
      },
      { status: 500 }
    );
  }
}

// ============= CACHE MANAGEMENT ENDPOINTS =============

export async function DELETE() {
  const previousSize = responseCache.size;
  responseCache.clear();
  pendingRequests.clear();

  return NextResponse.json({
    message: "Cache cleared successfully",
    clearedEntries: previousSize,
  });
}

export async function HEAD() {
  const now = Date.now();

  const stats = {
    cacheSize: responseCache.size,
    maxCacheSize: CONFIG.MAX_CACHE_SIZE,
    pendingRequests: pendingRequests.size,
    entries: Array.from(responseCache.entries())
      .slice(0, 20) // Limit for performance
      .map(([key, entry]) => ({
        key: key.substring(0, 50),
        ageSeconds: Math.floor((now - entry.timestamp) / 1000),
        accessCount: entry.accessCount,
        isFresh: now - entry.timestamp <= CONFIG.CACHE_TTL,
        isStale:
          now - entry.timestamp > CONFIG.CACHE_TTL &&
          now - entry.timestamp <= CONFIG.STALE_TTL,
      })),
  };

  return NextResponse.json(stats);
}
