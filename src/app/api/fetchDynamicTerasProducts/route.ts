// src/app/api/fetchDynamicTerasProducts/route.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// DYNAMIC TERAS PRODUCTS API - PRODUCTION OPTIMIZED
// ═══════════════════════════════════════════════════════════════════════════
//
// OPTIMIZATIONS:
// 1. Request Deduplication - Prevents duplicate in-flight requests
// 2. Retry with Exponential Backoff - Handles transient Firestore failures
// 3. Stale-While-Revalidate Caching - Fast responses with background refresh
// 4. Request Timeout - Prevents hanging requests
// 5. Graceful Degradation - Boosted products failure doesn't break main query
// 6. Reduced Logging - Production-appropriate logging levels
// 7. LRU Cache with Smart Eviction - Memory-efficient caching
//
// ═══════════════════════════════════════════════════════════════════════════

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

// ============= CONFIGURATION =============

const CONFIG = {
  // Pagination
  DEFAULT_LIMIT: 20,
  MAX_ARRAY_FILTER_SIZE: 10,
  BOOSTED_LIMIT: 20,

  // Caching
  CACHE_TTL: 2 * 60 * 1000, // 2 minutes - fresh
  STALE_TTL: 5 * 60 * 1000, // 5 minutes - stale but usable
  MAX_CACHE_SIZE: 200,

  // Resilience
  REQUEST_TIMEOUT: 12000, // 12 seconds
  MAX_RETRIES: 2,
  BASE_RETRY_DELAY: 100,

  // Logging
  DEBUG: process.env.NODE_ENV === "development",
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
  filterSubcategories: string[];
  colors: string[];
  brands: string[];
  minPrice: number | null;
  maxPrice: number | null;
  page: number;
  filterBuyerCategory: string | null;
  filterBuyerSubcategory: string | null;
  filterBuyerSubSubcategory: string | null;
}

// ============= CATEGORY MAPPINGS =============

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

// ============= REQUEST DEDUPLICATION =============

const pendingRequests = new Map<string, Promise<ApiResponse>>();

// ============= RESPONSE CACHING =============

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
    fsc: params.filterSubcategories.sort().join(","),
    col: params.colors.sort().join(","),
    br: params.brands.sort().join(","),
    minP: params.minPrice ?? "",
    maxP: params.maxPrice ?? "",
    p: params.page,
    fbc: params.filterBuyerCategory || "",
    fbsc: params.filterBuyerSubcategory || "",
    fbssc: params.filterBuyerSubSubcategory || "",
  });
}

function getCachedResponse(cacheKey: string): CacheResult {
  const entry = responseCache.get(cacheKey);

  if (!entry) {
    return { data: null, status: "miss" };
  }

  const now = Date.now();
  const age = now - entry.timestamp;

  // Update LRU stats
  entry.accessCount++;
  entry.lastAccess = now;

  if (age <= CONFIG.CACHE_TTL) {
    return { data: entry.data, status: "fresh" };
  }

  if (age <= CONFIG.STALE_TTL) {
    return { data: entry.data, status: "stale" };
  }

  responseCache.delete(cacheKey);
  return { data: null, status: "expired" };
}

function cacheResponse(cacheKey: string, data: ApiResponse): void {
  // LRU eviction if needed
  if (responseCache.size >= CONFIG.MAX_CACHE_SIZE) {
    cleanupCache();
  }

  responseCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
    accessCount: 1,
    lastAccess: Date.now(),
  });
}

function cleanupCache(): void {
  const now = Date.now();
  const entries = Array.from(responseCache.entries());

  // Remove expired first
  const validEntries = entries.filter(([key, entry]) => {
    if (now - entry.timestamp > CONFIG.STALE_TTL) {
      responseCache.delete(key);
      return false;
    }
    return true;
  });

  // LRU eviction if still over limit
  if (validEntries.length > CONFIG.MAX_CACHE_SIZE) {
    validEntries.sort((a, b) => {
      const scoreA = a[1].lastAccess + a[1].accessCount * 1000;
      const scoreB = b[1].lastAccess + b[1].accessCount * 1000;
      return scoreA - scoreB;
    });

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

// ============= LOGGING HELPER =============

function log(message: string, data?: unknown): void {
  if (CONFIG.DEBUG) {
    if (data) {
      console.log(`[TerasProducts] ${message}`, data);
    } else {
      console.log(`[TerasProducts] ${message}`);
    }
  }
}

function logError(message: string, error?: unknown): void {
  console.error(`[TerasProducts] ${message}`, error);
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
    filterBuyerCategory: searchParams.get("filterBuyerCategory"),
    filterBuyerSubcategory: searchParams.get("filterBuyerSubcategory"),
    filterBuyerSubSubcategory: searchParams.get("filterBuyerSubSubcategory"),
  };
}

function convertToFirestoreCategory(urlCategory: string | null): string | null {
  if (!urlCategory) return null;
  return URL_TO_FIRESTORE_CATEGORY[urlCategory] || urlCategory;
}

function parseProducts(snapshot: QuerySnapshot<DocumentData>): Product[] {
  const products: Product[] = [];
  const errorIds: string[] = [];

  for (const doc of snapshot.docs) {
    try {
      const data = { id: doc.id, ...doc.data() };
      products.push(ProductUtils.fromJson(data));
    } catch (error) {
      console.error(
        `[TerasProducts] Failed to parse product ${doc.id}:`,
        error
      );
      errorIds.push(doc.id);
    }
  }

  if (errorIds.length > 0) {
    console.warn(
      `[TerasProducts] Failed to parse ${errorIds.length} products:`,
      errorIds.slice(0, 5)
    );
  }

  return products;
}

// ============= EFFECTIVE FILTERS CALCULATOR =============

interface EffectiveFilters {
  category: string | null;
  gender: string | null;
  subcategory: string | null;
  subsubcategory: string | null;
}

function calculateEffectiveFilters(
  params: QueryParams,
  firestoreCategory: string | null
): EffectiveFilters {
  let effectiveCategory = firestoreCategory;
  let effectiveGender: string | null = null;
  let effectiveSubcategory = params.subcategory;
  let effectiveSubSubcategory = params.subsubcategory;

  // Process filterBuyerCategory
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

  // Gender from URL params
  if (params.buyerCategory === "Women" || params.buyerCategory === "Men") {
    effectiveGender = params.buyerCategory;
  }

  // Subcategory mapping for Women/Men
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

  // SubSubcategory mapping
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

// ============= QUERY BUILDERS =============

function buildProductsQuery(
  params: QueryParams,
  effectiveFilters: EffectiveFilters
): Query<DocumentData, DocumentData> {
  const collectionRef: CollectionReference<DocumentData, DocumentData> =
    collection(db, "products");
  const constraints: QueryConstraint[] = [];

  // Category filter
  if (effectiveFilters.category) {
    constraints.push(where("category", "==", effectiveFilters.category));
  }

  // Gender filter
  if (effectiveFilters.gender) {
    constraints.push(
      where("gender", "in", [effectiveFilters.gender, "Unisex"])
    );
  }

  // Subcategory filter
  if (effectiveFilters.subcategory) {
    constraints.push(where("subcategory", "==", effectiveFilters.subcategory));
  }

  // SubSubcategory filter
  if (effectiveFilters.subsubcategory) {
    constraints.push(
      where("subsubcategory", "==", effectiveFilters.subsubcategory)
    );
  }

  // Dynamic filters
  if (
    params.filterSubcategories.length > 0 &&
    !effectiveFilters.subsubcategory
  ) {
    const subcats = params.filterSubcategories.slice(
      0,
      CONFIG.MAX_ARRAY_FILTER_SIZE
    );
    constraints.push(where("subsubcategory", "in", subcats));
  }

  if (params.brands.length > 0) {
    const brands = params.brands.slice(0, CONFIG.MAX_ARRAY_FILTER_SIZE);
    constraints.push(where("brandModel", "in", brands));
  }

  if (params.colors.length > 0) {
    const colors = params.colors.slice(0, CONFIG.MAX_ARRAY_FILTER_SIZE);
    constraints.push(where("availableColors", "array-contains-any", colors));
  }

  // Price filters
  if (params.minPrice !== null) {
    constraints.push(where("price", ">=", params.minPrice));
  }

  if (params.maxPrice !== null) {
    constraints.push(where("price", "<=", params.maxPrice));
  }

  // Quick filters
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

  // Sorting
  if (params.quickFilter === "bestSellers") {
    constraints.push(orderBy("purchaseCount", "desc"));
  } else {
    switch (params.sortOption) {
      case "alphabetical":
        constraints.push(orderBy("productName", "asc"));
        break;
      case "price_asc":
        constraints.push(orderBy("price", "asc"));
        break;
      case "price_desc":
        constraints.push(orderBy("price", "desc"));
        break;
      case "date":
      default:
        constraints.push(orderBy("createdAt", "desc"));
        break;
    }
  }

  constraints.push(limit(CONFIG.DEFAULT_LIMIT));

  return query(collectionRef, ...constraints);
}

function buildBoostedProductsQuery(
  params: QueryParams,
  effectiveFilters: EffectiveFilters
): Query<DocumentData, DocumentData> {
  const collectionRef = collection(db, "products");
  const constraints: QueryConstraint[] = [where("isBoosted", "==", true)];

  if (effectiveFilters.category) {
    constraints.push(where("category", "==", effectiveFilters.category));
  }

  if (effectiveFilters.gender) {
    constraints.push(
      where("gender", "in", [effectiveFilters.gender, "Unisex"])
    );
  }

  if (effectiveFilters.subcategory) {
    constraints.push(where("subcategory", "==", effectiveFilters.subcategory));
  }

  if (effectiveFilters.subsubcategory) {
    constraints.push(
      where("subsubcategory", "==", effectiveFilters.subsubcategory)
    );
  }

  // Dynamic filters
  if (
    params.filterSubcategories.length > 0 &&
    !effectiveFilters.subsubcategory
  ) {
    const subcats = params.filterSubcategories.slice(
      0,
      CONFIG.MAX_ARRAY_FILTER_SIZE
    );
    constraints.push(where("subsubcategory", "in", subcats));
  }

  if (
    params.brands.length > 0 &&
    params.brands.length <= CONFIG.MAX_ARRAY_FILTER_SIZE
  ) {
    constraints.push(where("brandModel", "in", params.brands));
  }

  if (
    params.colors.length > 0 &&
    params.colors.length <= CONFIG.MAX_ARRAY_FILTER_SIZE
  ) {
    constraints.push(
      where("availableColors", "array-contains-any", params.colors)
    );
  }

  if (params.minPrice !== null) {
    constraints.push(where("price", ">=", params.minPrice));
  }

  if (params.maxPrice !== null) {
    constraints.push(where("price", "<=", params.maxPrice));
  }

  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(limit(CONFIG.BOOSTED_LIMIT));

  return query(collectionRef, ...constraints);
}

// ============= CORE DATA FETCHING =============

async function fetchTerasProductsData(
  params: QueryParams
): Promise<ApiResponse> {
  const startTime = Date.now();

  const firestoreCategory = convertToFirestoreCategory(params.category);
  const effectiveFilters = calculateEffectiveFilters(params, firestoreCategory);

  log("Effective filters calculated", effectiveFilters);

  // Determine if we should fetch boosted products
  const shouldFetchBoosted =
    !params.quickFilter &&
    (effectiveFilters.category || params.filterBuyerCategory);

  // Parallel fetching with graceful degradation
  const [products, boostedProducts] = await Promise.all([
    // Main products query with retry
    withRetry(async () => {
      const productsQuery = buildProductsQuery(params, effectiveFilters);
      const snapshot = await getDocs(productsQuery);
      return parseProducts(snapshot);
    }),

    // Boosted products (graceful degradation)
    shouldFetchBoosted
      ? (async () => {
          try {
            const boostedQuery = buildBoostedProductsQuery(
              params,
              effectiveFilters
            );
            const snapshot = await getDocs(boostedQuery);
            return parseProducts(snapshot);
          } catch (error) {
            logError("Boosted products failed (graceful degradation)", error);
            return [];
          }
        })()
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

  const fetchPromise = fetchTerasProductsData(params);
  pendingRequests.set(cacheKey, fetchPromise);

  fetchPromise
    .then((result) => {
      cacheResponse(cacheKey, result);
      log("Background revalidation complete");
    })
    .catch((error) => {
      logError("Background revalidation failed", error);
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

    log("Request params", {
      category: params.category,
      filterBuyerCategory: params.filterBuyerCategory,
      page: params.page,
    });

    // ========== STEP 1: Check cache ==========
    const cacheResult = getCachedResponse(cacheKey);

    if (cacheResult.status === "fresh") {
      log("Cache HIT (fresh)");
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
      log("Deduplicating request");

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
      log("Returning stale, revalidating in background");
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
    log("Fresh fetch");

    const fetchPromise = fetchTerasProductsData(params);
    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const result = await withTimeout(
        fetchPromise,
        CONFIG.REQUEST_TIMEOUT,
        "Request timeout"
      );

      cacheResponse(cacheKey, result);

      log(`Fetched ${result.products.length} products in ${result.timing}ms`);

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
      logError("Fetch error", error);

      // Handle timeout
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

      // Handle Firestore index errors with helpful message
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const isIndexError =
        errorMessage.includes("index") ||
        errorMessage.includes("requires an index");

      return NextResponse.json(
        {
          error: "Failed to fetch products",
          details: errorMessage,
          hint: isIndexError
            ? "This query requires a Firestore composite index. Check the Firebase console for index creation links."
            : undefined,
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
    logError("Unexpected error", error);

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
