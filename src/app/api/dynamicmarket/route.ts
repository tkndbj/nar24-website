// src/app/api/dynamicmarket/route.ts
//
// CATEGORY PRODUCTS API
// Uses unstable_cache for server-side caching.

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { Product, ProductUtils } from "@/app/models/Product";

// ============= CONFIGURATION =============

const CONFIG = {
  CACHE_REVALIDATE_SECONDS: 60, // 1 minute
  MAX_FETCH_LIMIT: 200,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  REQUEST_TIMEOUT: 10000,
  MAX_RETRIES: 2,
  BASE_RETRY_DELAY: 100,
} as const;

// ============= TYPES =============

interface CategoryProductsResponse {
  products: Product[];
  hasMore: boolean;
  page: number;
  total: number;
  timing?: number;
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

// ============= RETRY LOGIC =============

async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {},
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
  errorMessage: string = "Request timeout",
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
        10,
      ),
    ),
    CONFIG.MAX_PAGE_SIZE,
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
  },
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

  const normalizedFilterSubs = filters.filterSubcategories.map(normalizeString);
  const normalizedFilterColors = filters.colors.map(normalizeString);
  const normalizedFilterBrands = filters.brands.map(normalizeString);

  return products.filter((product) => {
    if (normalizedFilterSubs.length > 0) {
      if (!product.subcategory) return false;

      const normalizedProductSub = normalizeString(product.subcategory);
      const matchesSubcategory = normalizedFilterSubs.some(
        (filterSub) =>
          normalizedProductSub === filterSub ||
          normalizedProductSub.includes(filterSub) ||
          filterSub.includes(normalizedProductSub),
      );

      if (!matchesSubcategory) return false;
    }

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
        }),
      );

      if (!hasMatchingColor) return false;
    }

    if (normalizedFilterBrands.length > 0) {
      if (!product.brandModel) return false;

      const normalizedProductBrand = normalizeString(product.brandModel);
      const matchesBrand = normalizedFilterBrands.some(
        (filterBrand) =>
          normalizedProductBrand === filterBrand ||
          normalizedProductBrand.includes(filterBrand) ||
          filterBrand.includes(normalizedProductBrand),
      );

      if (!matchesBrand) return false;
    }

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
  filters: QueryFilters,
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

  if (filters.category === "women" || filters.category === "men") {
    const genderValue = formattedCategory;

    try {
      let query: FirebaseFirestore.Query = db
        .collection("shop_products")
        .where("gender", "in", [genderValue, "Unisex"])
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
        .orderBy("promotionScore", "desc")
        .limit(CONFIG.MAX_FETCH_LIMIT);

      const snapshot = await query.get();
      allProducts = snapshot.docs.map(documentToProduct);
    } catch (error) {
      console.error(`[category-products] Gender query failed:`, error);

      try {
        const fallbackQuery: FirebaseFirestore.Query = db
          .collection("shop_products")
          .where("gender", "in", [genderValue, "Unisex"])
          .orderBy("createdAt", "desc")
          .limit(CONFIG.MAX_FETCH_LIMIT);

        const snapshot = await fallbackQuery.get();
        allProducts = snapshot.docs.map(documentToProduct);
        console.log(
          `[category-products] Fallback returned ${allProducts.length} products`,
        );
      } catch (fallbackError) {
        console.error(
          `[category-products] Fallback also failed:`,
          fallbackError,
        );
        allProducts = [];
      }
    }
  } else {
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
        .orderBy("promotionScore", "desc")
        .limit(CONFIG.MAX_FETCH_LIMIT);

      const snapshot = await query.get();
      allProducts = snapshot.docs.map(documentToProduct);
    } catch (error) {
      console.error(`[category-products] Category query failed:`, error);

      try {
        const fallbackQuery: FirebaseFirestore.Query = db
          .collection("shop_products")
          .where("category", "==", formattedCategory)
          .orderBy("createdAt", "desc")
          .limit(CONFIG.MAX_FETCH_LIMIT);

        const snapshot = await fallbackQuery.get();
        allProducts = snapshot.docs.map(documentToProduct);
        console.log(
          `[category-products] Fallback returned ${allProducts.length} products`,
        );
      } catch (fallbackError) {
        console.error(
          `[category-products] Fallback also failed:`,
          fallbackError,
        );
        allProducts = [];
      }
    }
  }

  allProducts = applyClientSideFilters(allProducts, {
    filterSubcategories: filters.filterSubcategories,
    colors: filters.colors,
    brands: filters.brands,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
  });

  allProducts.sort((a, b) => {
    if (a.isBoosted !== b.isBoosted) {
      return a.isBoosted ? -1 : 1;
    }
    return (b.promotionScore ?? 0) - (a.promotionScore ?? 0);
  });

  const startIndex = filters.page * filters.limit;
  const paginatedProducts = allProducts.slice(
    startIndex,
    startIndex + filters.limit,
  );
  const hasMore = allProducts.length > startIndex + filters.limit;

  return {
    products: paginatedProducts,
    hasMore,
    page: filters.page,
    total: allProducts.length,
    timing: Date.now() - startTime,
  };
}

// ============= SERVER-SIDE CACHE =============

const cachedFetchCategoryProducts = unstable_cache(
  fetchCategoryProducts,
  ["category-products"],
  { revalidate: CONFIG.CACHE_REVALIDATE_SECONDS, tags: ["category-products"] },
);

// ============= MAIN HANDLER =============

export async function GET(request: NextRequest) {
  const requestStart = Date.now();

  try {
    // Rate limit: 60 requests/min per IP
    const { applyRateLimit } = await import("@/lib/auth-middleware");
    const limited = await applyRateLimit(request, 60, 60000);
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const filters = parseQueryParams(searchParams);

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
        { status: 400 },
      );
    }

    try {
      const result = await withTimeout(
        withRetry(() => cachedFetchCategoryProducts(filters), {
          maxRetries: CONFIG.MAX_RETRIES,
          shouldRetry: (error) => {
            if (error instanceof Error && error.message.includes("permission")) {
              return false;
            }
            return true;
          },
        }),
        CONFIG.REQUEST_TIMEOUT,
        "Request timeout",
      );

      return NextResponse.json(result, {
        headers: {
          "Cache-Control": `public, s-maxage=60, stale-while-revalidate=120`,
          "X-Response-Time": `${Date.now() - requestStart}ms`,
        },
      });
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
          { status: 504 },
        );
      }

      const isPermissionError =
        error instanceof Error && error.message.includes("permission");
      const statusCode = isPermissionError ? 403 : 500;

      return NextResponse.json(
        {
          error: isPermissionError ? "Permission denied" : "Internal server error",
          products: [],
          hasMore: false,
          page: 0,
          total: 0,
        },
        { status: statusCode },
      );
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
      { status: 500 },
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
