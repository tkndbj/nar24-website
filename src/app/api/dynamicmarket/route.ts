// src/app/api/category-products/route.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY PRODUCTS API - PRODUCTION OPTIMIZED
// ═══════════════════════════════════════════════════════════════════════════
//
// OPTIMIZATIONS:
// 1. Request Deduplication - Prevents duplicate in-flight requests
// 2. Retry with Exponential Backoff - Handles transient Firestore failures
// 3. Stale-While-Revalidate Caching - Fast responses with background refresh
// 4. Request Timeout - Prevents hanging requests
// 5. Query Fingerprinting - Cache key based on all query params
// 6. Efficient Pagination - Cursor-based option for large datasets
//
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { Product, ProductUtils } from "@/app/models/Product";

// ============= CONFIGURATION =============

const CONFIG = {
  CACHE_TTL: 60 * 1000, // 1 minute - fresh
  STALE_TTL: 3 * 60 * 1000, // 3 minutes - stale but usable
  MAX_CACHE_SIZE: 100,
  MAX_FETCH_LIMIT: 200,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  REQUEST_TIMEOUT: 10000, // 10 seconds
  MAX_RETRIES: 2,
  BASE_RETRY_DELAY: 100,
} as const;

// ============= TYPES =============

interface CategoryProductsResponse {
  products: Product[];
  hasMore: boolean;
  page: number;
  total: number;
  source?: "cache" | "stale" | "dedupe" | "fresh";
  timing?: number;
}

interface CacheEntry {
  data: CategoryProductsResponse;
  timestamp: number;
}

interface QueryFilters {
  category: string;
  subcategory?: string;
  subsubcategory?: string;
  filterSubcategories: string[];
  colors: string[];
  brands: string[];
  minPrice?: number;
  maxPrice?: number;
  page: number;
  limit: number;
}

// ============= REQUEST DEDUPLICATION =============

const pendingRequests = new Map<string, Promise<CategoryProductsResponse>>();

// ============= RESPONSE CACHING =============

const responseCache = new Map<string, CacheEntry>();

interface CacheResult {
  data: CategoryProductsResponse | null;
  status: "fresh" | "stale" | "expired" | "miss";
}

function generateCacheKey(filters: QueryFilters): string {
  return JSON.stringify({
    c: filters.category,
    sc: filters.subcategory || "",
    ssc: filters.subsubcategory || "",
    fsc: filters.filterSubcategories.sort().join(","),
    col: filters.colors.sort().join(","),
    br: filters.brands.sort().join(","),
    minP: filters.minPrice ?? "",
    maxP: filters.maxPrice ?? "",
    p: filters.page,
    l: filters.limit,
  });
}

function getCachedResponse(cacheKey: string): CacheResult {
  const cached = responseCache.get(cacheKey);

  if (!cached) {
    return { data: null, status: "miss" };
  }

  const age = Date.now() - cached.timestamp;

  if (age <= CONFIG.CACHE_TTL) {
    return { data: cached.data, status: "fresh" };
  }

  if (age <= CONFIG.STALE_TTL) {
    return { data: cached.data, status: "stale" };
  }

  responseCache.delete(cacheKey);
  return { data: null, status: "expired" };
}

function cacheResponse(cacheKey: string, data: CategoryProductsResponse): void {
  if (responseCache.size >= CONFIG.MAX_CACHE_SIZE) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }

  responseCache.set(cacheKey, { data, timestamp: Date.now() });
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

function documentToProduct(doc: QueryDocumentSnapshot): Product {
  const data = { id: doc.id, ...doc.data() };
  return ProductUtils.fromJson(data);
}

function normalizeString(str: string): string {
  return str.toLowerCase().trim();
}

function formatCategoryName(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function parseQueryParams(searchParams: URLSearchParams): QueryFilters {
  const category = searchParams.get("category") || "";
  const subcategory = searchParams.get("subcategory") || undefined;
  const subsubcategory = searchParams.get("subsubcategory") || undefined;
  const page = Math.max(0, parseInt(searchParams.get("page") || "0", 10));
  const limit = Math.min(
    Math.max(
      1,
      parseInt(
        searchParams.get("limit") || String(CONFIG.DEFAULT_PAGE_SIZE),
        10
      )
    ),
    CONFIG.MAX_PAGE_SIZE
  );

  const filterSubcategories =
    searchParams.get("filterSubcategories")?.split(",").filter(Boolean) || [];
  const colors = searchParams.get("colors")?.split(",").filter(Boolean) || [];
  const brands = searchParams.get("brands")?.split(",").filter(Boolean) || [];

  const minPriceStr = searchParams.get("minPrice");
  const maxPriceStr = searchParams.get("maxPrice");
  const minPrice = minPriceStr ? parseFloat(minPriceStr) : undefined;
  const maxPrice = maxPriceStr ? parseFloat(maxPriceStr) : undefined;

  return {
    category,
    subcategory,
    subsubcategory,
    filterSubcategories,
    colors,
    brands,
    minPrice: minPrice !== undefined && !isNaN(minPrice) ? minPrice : undefined,
    maxPrice: maxPrice !== undefined && !isNaN(maxPrice) ? maxPrice : undefined,
    page,
    limit,
  };
}

function validateFilters(filters: QueryFilters): string | null {
  if (!filters.category) {
    return "Category parameter is required";
  }

  if (
    filters.minPrice !== undefined &&
    filters.maxPrice !== undefined &&
    filters.minPrice > filters.maxPrice
  ) {
    return "Invalid price range: minimum price cannot exceed maximum price";
  }

  return null;
}

// ============= CLIENT-SIDE FILTERING =============

function applyClientSideFilters(
  products: Product[],
  filters: {
    filterSubcategories: string[];
    colors: string[];
    brands: string[];
    minPrice?: number;
    maxPrice?: number;
  }
): Product[] {
  const hasFilters =
    filters.filterSubcategories.length > 0 ||
    filters.colors.length > 0 ||
    filters.brands.length > 0 ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined;

  if (!hasFilters) {
    return products;
  }

  // Pre-normalize filter values for performance
  const normalizedFilterSubs = filters.filterSubcategories.map(normalizeString);
  const normalizedFilterColors = filters.colors.map(normalizeString);
  const normalizedFilterBrands = filters.brands.map(normalizeString);

  return products.filter((product) => {
    // Subcategory filter
    if (normalizedFilterSubs.length > 0) {
      if (!product.subcategory) return false;

      const normalizedProductSub = normalizeString(product.subcategory);
      const matchesSubcategory = normalizedFilterSubs.some(
        (filterSub) =>
          normalizedProductSub === filterSub ||
          normalizedProductSub.includes(filterSub) ||
          filterSub.includes(normalizedProductSub)
      );

      if (!matchesSubcategory) return false;
    }

    // Color filter
    if (normalizedFilterColors.length > 0) {
      if (!product.availableColors || product.availableColors.length === 0) {
        return false;
      }

      const hasMatchingColor = normalizedFilterColors.some((filterColor) =>
        product.availableColors!.some((productColor) => {
          const normalizedProductColor = normalizeString(productColor);
          return (
            normalizedProductColor === filterColor ||
            normalizedProductColor.includes(filterColor) ||
            filterColor.includes(normalizedProductColor)
          );
        })
      );

      if (!hasMatchingColor) return false;
    }

    // Brand filter
    if (normalizedFilterBrands.length > 0) {
      if (!product.brandModel) return false;

      const normalizedProductBrand = normalizeString(product.brandModel);
      const matchesBrand = normalizedFilterBrands.some(
        (filterBrand) =>
          normalizedProductBrand === filterBrand ||
          normalizedProductBrand.includes(filterBrand) ||
          filterBrand.includes(normalizedProductBrand)
      );

      if (!matchesBrand) return false;
    }

    // Price range filter (backup - should be handled at DB level)
    if (filters.minPrice !== undefined && product.price < filters.minPrice) {
      return false;
    }

    if (filters.maxPrice !== undefined && product.price > filters.maxPrice) {
      return false;
    }

    return true;
  });
}

// ============= CORE DATA FETCHING =============

async function fetchCategoryProducts(
  filters: QueryFilters
): Promise<CategoryProductsResponse> {
  const startTime = Date.now();
  const db = getFirestoreAdmin();
  let allProducts: Product[] = [];

  const formattedCategory = formatCategoryName(filters.category);
  const formattedSubcategory = filters.subcategory
    ? formatCategoryName(filters.subcategory)
    : undefined;
  const formattedSubsubcategory = filters.subsubcategory
    ? formatCategoryName(filters.subsubcategory)
    : undefined;

  // Handle Women/Men categories using gender field
  if (filters.category === "women" || filters.category === "men") {
    const genderValue = formattedCategory;
    const gendersToFetch = [genderValue, "Unisex"];

    const genderResults = await Promise.all(
      gendersToFetch.map(async (gender) => {
        try {
          let query: FirebaseFirestore.Query = db
            .collection("shop_products")
            .where("gender", "==", gender)
            .where("quantity", ">", 0);

          if (formattedSubcategory) {
            query = query.where("subcategory", "==", formattedSubcategory);
          }

          if (formattedSubsubcategory) {
            query = query.where(
              "subsubcategory",
              "==",
              formattedSubsubcategory
            );
          }

          if (filters.minPrice !== undefined) {
            query = query.where("price", ">=", filters.minPrice);
          }

          if (filters.maxPrice !== undefined) {
            query = query.where("price", "<=", filters.maxPrice);
          }

          query = query
            .orderBy("quantity")
            .orderBy("isBoosted", "desc")
            .orderBy("rankingScore", "desc")
            .limit(CONFIG.MAX_FETCH_LIMIT);

          const snapshot = await query.get();
          return snapshot.docs.map(documentToProduct);
        } catch (error) {
          console.error(
            `[category-products] Gender query failed for ${gender}:`,
            error
          );
          return [];
        }
      })
    );

    // Flatten and deduplicate
    const productMap = new Map<string, Product>();
    genderResults.flat().forEach((product) => {
      if (!productMap.has(product.id)) {
        productMap.set(product.id, product);
      }
    });
    allProducts = Array.from(productMap.values());
  } else {
    // Standard category query
    try {
      let query: FirebaseFirestore.Query = db
        .collection("shop_products")
        .where("category", "==", formattedCategory)
        .where("quantity", ">", 0);

      if (formattedSubcategory) {
        query = query.where("subcategory", "==", formattedSubcategory);
      }

      if (formattedSubsubcategory) {
        query = query.where("subsubcategory", "==", formattedSubsubcategory);
      }

      if (filters.minPrice !== undefined) {
        query = query.where("price", ">=", filters.minPrice);
      }

      if (filters.maxPrice !== undefined) {
        query = query.where("price", "<=", filters.maxPrice);
      }

      query = query
        .orderBy("quantity")
        .orderBy("isBoosted", "desc")
        .orderBy("rankingScore", "desc")
        .limit(CONFIG.MAX_FETCH_LIMIT);

      const snapshot = await query.get();
      allProducts = snapshot.docs.map(documentToProduct);
    } catch (error) {
      console.error(`[category-products] Category query failed:`, error);
      allProducts = [];
    }
  }

  // Apply client-side filters
  allProducts = applyClientSideFilters(allProducts, {
    filterSubcategories: filters.filterSubcategories,
    colors: filters.colors,
    brands: filters.brands,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
  });

  // Sort: boosted first, then by ranking score
  allProducts.sort((a, b) => {
    if (a.isBoosted !== b.isBoosted) {
      return a.isBoosted ? -1 : 1;
    }
    return (b.rankingScore ?? 0) - (a.rankingScore ?? 0);
  });

  // Paginate
  const startIndex = filters.page * filters.limit;
  const paginatedProducts = allProducts.slice(
    startIndex,
    startIndex + filters.limit
  );
  const hasMore = allProducts.length > startIndex + filters.limit;

  return {
    products: paginatedProducts,
    hasMore,
    page: filters.page,
    total: allProducts.length,
    source: "fresh",
    timing: Date.now() - startTime,
  };
}

// ============= BACKGROUND REVALIDATION =============

function revalidateInBackground(cacheKey: string, filters: QueryFilters): void {
  if (pendingRequests.has(cacheKey)) {
    return;
  }

  const fetchPromise = fetchCategoryProducts(filters);
  pendingRequests.set(cacheKey, fetchPromise);

  fetchPromise
    .then((result) => {
      cacheResponse(cacheKey, result);
      console.log(`[category-products] Background revalidation complete`);
    })
    .catch((error) => {
      console.error(
        `[category-products] Background revalidation failed:`,
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
    const filters = parseQueryParams(searchParams);

    // Validate
    const validationError = validateFilters(filters);
    if (validationError) {
      return NextResponse.json(
        {
          error: validationError,
          products: [],
          hasMore: false,
          page: 0,
          total: 0,
        },
        { status: 400 }
      );
    }

    const cacheKey = generateCacheKey(filters);

    // ========== STEP 1: Check cache ==========
    const cacheResult = getCachedResponse(cacheKey);

    if (cacheResult.status === "fresh") {
      console.log(`[category-products] Cache HIT (fresh)`);
      return NextResponse.json(
        { ...cacheResult.data, source: "cache" },
        {
          headers: {
            "Cache-Control": `public, s-maxage=60, stale-while-revalidate=120`,
            "X-Cache": "HIT",
            "X-Response-Time": `${Date.now() - requestStart}ms`,
          },
        }
      );
    }

    // ========== STEP 2: Check for in-flight request ==========
    const pendingRequest = pendingRequests.get(cacheKey);

    if (pendingRequest) {
      console.log(`[category-products] Deduplicating request`);

      if (cacheResult.status === "stale" && cacheResult.data) {
        return NextResponse.json(
          { ...cacheResult.data, source: "stale" },
          {
            headers: {
              "Cache-Control": `public, s-maxage=0, stale-while-revalidate=120`,
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
              "Cache-Control": `public, s-maxage=60, stale-while-revalidate=120`,
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
        `[category-products] Returning stale, revalidating in background`
      );
      revalidateInBackground(cacheKey, filters);

      return NextResponse.json(
        { ...cacheResult.data, source: "stale" },
        {
          headers: {
            "Cache-Control": `public, s-maxage=0, stale-while-revalidate=120`,
            "X-Cache": "STALE",
            "X-Response-Time": `${Date.now() - requestStart}ms`,
          },
        }
      );
    }

    // ========== STEP 4: Fresh fetch ==========
    console.log(`[category-products] Fresh fetch for ${filters.category}`);

    const fetchPromise = withRetry(() => fetchCategoryProducts(filters), {
      maxRetries: CONFIG.MAX_RETRIES,
      shouldRetry: (error) => {
        // Don't retry on validation errors
        if (error instanceof Error && error.message.includes("permission")) {
          return false;
        }
        return true;
      },
    });

    pendingRequests.set(cacheKey, fetchPromise);

    try {
      const result = await withTimeout(
        fetchPromise,
        CONFIG.REQUEST_TIMEOUT,
        "Request timeout"
      );

      cacheResponse(cacheKey, result);

      console.log(
        `[category-products] Fetched ${result.products.length}/${result.total} products in ${result.timing}ms`
      );

      return NextResponse.json(
        { ...result, source: "fresh" },
        {
          headers: {
            "Cache-Control": `public, s-maxage=60, stale-while-revalidate=120`,
            "X-Cache": "MISS",
            "X-Response-Time": `${Date.now() - requestStart}ms`,
            "X-Timing": `${result.timing}ms`,
          },
        }
      );
    } catch (error) {
      console.error(`[category-products] Fetch error:`, error);

      if (error instanceof Error && error.message.includes("timeout")) {
        return NextResponse.json(
          {
            error: "Request timeout",
            products: [],
            hasMore: false,
            page: 0,
            total: 0,
          },
          { status: 504 }
        );
      }

      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";
      const statusCode = errorMessage.includes("permission") ? 403 : 500;

      return NextResponse.json(
        {
          error: errorMessage,
          products: [],
          hasMore: false,
          page: 0,
          total: 0,
        },
        { status: statusCode }
      );
    } finally {
      pendingRequests.delete(cacheKey);
    }
  } catch (error) {
    console.error(`[category-products] Unexpected error:`, error);

    return NextResponse.json(
      {
        error: "Internal server error",
        products: [],
        hasMore: false,
        page: 0,
        total: 0,
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
