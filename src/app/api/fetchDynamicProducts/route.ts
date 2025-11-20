// src/app/api/fetchDynamicProducts/route.ts

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

const LIMIT = 20;
const MAX_ARRAY_FILTER_SIZE = 10;

// ✅ Cache configuration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 200; // Maximum number of cached entries
const CACHE_CLEANUP_THRESHOLD = 0.9; // Clean when 90% full

// ✅ Response interface
interface ApiResponse {
  products: Product[];
  boostedProducts: Product[];
  hasMore: boolean;
  page: number;
  total: number;
}

// ✅ In-memory cache with LRU eviction - FIXED to cache full response
interface CacheEntry {
  data: ApiResponse; // ✅ Changed from Product[] to ApiResponse
  timestamp: number;
  accessCount: number;
  lastAccess: number;
}

const responseCache = new Map<string, CacheEntry>();

// Category mapping cache to avoid repeated string operations
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

interface QueryParams {
  category?: string | null;
  subcategory?: string | null;
  subsubcategory?: string | null;
  buyerCategory?: string | null;
  buyerSubcategory?: string | null;
  sortOption: string;
  quickFilter?: string | null;
  brands: string[];
  colors: string[];
  filterSubcategories: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  page: number;
}

// ✅ Generate cache key
function generateCacheKey(params: QueryParams): string {
  const keyParts = [
    params.category || "",
    params.subcategory || "",
    params.subsubcategory || "",
    params.buyerCategory || "",
    params.buyerSubcategory || "",
    params.sortOption,
    params.quickFilter || "",
    params.brands.sort().join(","),
    params.colors.sort().join(","),
    params.filterSubcategories.sort().join(","),
    params.minPrice || "",
    params.maxPrice || "",
    params.page,
  ];
  return keyParts.join("|");
}

// ✅ Get from cache with TTL check - FIXED return type
function getFromCache(key: string): ApiResponse | null {
  const entry = responseCache.get(key);
  if (!entry) return null;

  const now = Date.now();

  // Check if expired
  if (now - entry.timestamp > CACHE_TTL) {
    responseCache.delete(key);
    return null;
  }

  // Update access stats for LRU
  entry.accessCount++;
  entry.lastAccess = now;

  return entry.data;
}

// ✅ Set in cache with automatic cleanup - FIXED parameter type
function setInCache(key: string, data: ApiResponse): void {
  const now = Date.now();

  // Trigger cleanup if approaching max size
  if (responseCache.size >= MAX_CACHE_SIZE * CACHE_CLEANUP_THRESHOLD) {
    cleanupCache();
  }

  responseCache.set(key, {
    data,
    timestamp: now,
    accessCount: 1,
    lastAccess: now,
  });
}

// ✅ Cleanup cache using LRU strategy
function cleanupCache(): void {
  const now = Date.now();
  const entries = Array.from(responseCache.entries());

  // Remove expired entries first
  const validEntries = entries.filter(([key, entry]) => {
    if (now - entry.timestamp > CACHE_TTL) {
      responseCache.delete(key);
      return false;
    }
    return true;
  });

  // If still over limit, remove least recently used
  if (validEntries.length > MAX_CACHE_SIZE) {
    // Sort by last access time (oldest first) and access count (least used first)
    validEntries.sort((a, b) => {
      const scoreA = a[1].lastAccess + a[1].accessCount * 1000;
      const scoreB = b[1].lastAccess + b[1].accessCount * 1000;
      return scoreA - scoreB;
    });

    // Remove oldest 20%
    const toRemove = Math.floor(validEntries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      responseCache.delete(validEntries[i][0]);
    }
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);

    // Extract and parse parameters
    const params = extractQueryParams(searchParams);

    // ✅ Generate cache key
    const cacheKey = generateCacheKey(params);

    // ✅ Check cache first - now returns full ApiResponse
    const cachedResponse = getFromCache(cacheKey);
    if (cachedResponse) {
      console.log(`✅ Cache HIT for: ${cacheKey.substring(0, 50)}...`);
      return NextResponse.json(cachedResponse, {
        headers: {
          "X-Cache": "HIT",
          "X-Response-Time": `${Date.now() - startTime}ms`,
          "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
        },
      });
    }

    console.log(`❌ Cache MISS for: ${cacheKey.substring(0, 50)}...`);

    // Convert category to Firestore format
    const firestoreCategory = params.category
      ? CATEGORY_MAPPING[params.category] || params.category
      : null;

    // ✅ Parallel fetching for products and boosted products
    const shouldFetchBoosted =
      !params.quickFilter && firestoreCategory && params.subsubcategory;

    const [products, boostedProducts] = await Promise.all([
      // Main products query
      (async () => {
        const productsQuery = buildProductsQuery({
          ...params,
          category: firestoreCategory,
        });
        const snapshot = await getDocs(productsQuery);
        return parseProducts(snapshot);
      })(),

      // Boosted products query (conditional)
      shouldFetchBoosted
        ? fetchBoostedProducts({
            category: firestoreCategory!,
            subsubcategory: params.subsubcategory!,
            buyerCategory: params.buyerCategory,
            dynamicBrands: params.brands,
            dynamicColors: params.colors,
            dynamicSubSubcategories: params.filterSubcategories,
            minPrice: params.minPrice,
            maxPrice: params.maxPrice,
          })
        : Promise.resolve([]),
    ]);

    const responseData: ApiResponse = {
      products,
      boostedProducts,
      hasMore: products.length >= LIMIT,
      page: params.page,
      total: products.length,
    };

    // ✅ Store full response in cache
    setInCache(cacheKey, responseData);

    const responseTime = Date.now() - startTime;
    console.log(`⚡ API response time: ${responseTime}ms`);

    return NextResponse.json(responseData, {
      headers: {
        "X-Cache": "MISS",
        "X-Response-Time": `${responseTime}ms`,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (error: unknown) {
    console.error("❌ Error fetching products:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch products",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Extract and validate query parameters
function extractQueryParams(searchParams: URLSearchParams): QueryParams {
  return {
    category: searchParams.get("category"),
    subcategory: searchParams.get("subcategory"),
    subsubcategory: searchParams.get("subsubcategory"),
    buyerCategory: searchParams.get("buyerCategory"),
    buyerSubcategory: searchParams.get("buyerSubcategory"),
    page: parseInt(searchParams.get("page") || "0", 10),
    sortOption: searchParams.get("sort") || "date",
    quickFilter: searchParams.get("filter"),
    filterSubcategories:
      searchParams.get("filterSubcategories")?.split(",").filter(Boolean) || [],
    colors: searchParams.get("colors")?.split(",").filter(Boolean) || [],
    brands: searchParams.get("brands")?.split(",").filter(Boolean) || [],
    minPrice: searchParams.get("minPrice")
      ? parseFloat(searchParams.get("minPrice")!)
      : null,
    maxPrice: searchParams.get("maxPrice")
      ? parseFloat(searchParams.get("maxPrice")!)
      : null,
  };
}

// ✅ Optimized product parsing with early error handling
function parseProducts(snapshot: QuerySnapshot<DocumentData>): Product[] {
  const products: Product[] = [];
  const errors: string[] = [];

  for (const doc of snapshot.docs) {
    try {
      const data = { id: doc.id, ...doc.data() };
      const product = ProductUtils.fromJson(data);
      products.push(product);
    } catch (error: unknown) {
      errors.push(doc.id);
      console.error("Error parsing product:", error);
    }
  }

  if (errors.length > 0) {
    console.warn(
      `Failed to parse ${errors.length} products:`,
      errors.slice(0, 5)
    );
  }

  return products;
}

// ✅ Optimized query builder with constraint reuse
function buildProductsQuery(
  params: QueryParams
): Query<DocumentData, DocumentData> {
  const collectionRef: CollectionReference<DocumentData, DocumentData> =
    collection(db, "shop_products");
  const constraints: QueryConstraint[] = [];

  // Basic filters - only add if values exist
  if (params.category) {
    constraints.push(where("category", "==", params.category));
  }

  if (params.subcategory) {
    constraints.push(where("subcategory", "==", params.subcategory));
  }

  if (params.subsubcategory) {
    constraints.push(where("subsubcategory", "==", params.subsubcategory));
  }

  // Gender filtering for Women/Men categories
  if (params.buyerCategory === "Women" || params.buyerCategory === "Men") {
    constraints.push(where("gender", "in", [params.buyerCategory, "Unisex"]));
  }

  // Dynamic filters - respect Firestore's 10-item limit for 'in' and 'array-contains-any'
  if (params.filterSubcategories.length > 0) {
    const subcats = params.filterSubcategories.slice(0, MAX_ARRAY_FILTER_SIZE);
    constraints.push(where("subsubcategory", "in", subcats));
  }

  if (params.brands.length > 0) {
    const brands = params.brands.slice(0, MAX_ARRAY_FILTER_SIZE);
    constraints.push(where("brandModel", "in", brands));
  }

  if (params.colors.length > 0) {
    const colors = params.colors.slice(0, MAX_ARRAY_FILTER_SIZE);
    constraints.push(where("availableColors", "array-contains-any", colors));
  }

  // Price range filters
  if (params.minPrice !== null && params.minPrice !== undefined) {
    constraints.push(where("price", ">=", params.minPrice));
  }

  if (params.maxPrice !== null && params.maxPrice !== undefined) {
    constraints.push(where("price", "<=", params.maxPrice));
  }

  // Quick filters
  if (params.quickFilter) {
    applyQuickFilter(constraints, params.quickFilter);
  }

  // Sorting - optimized for Firestore indexes
  applySorting(constraints, params.sortOption, params.quickFilter);

  // Limit results
  constraints.push(limit(LIMIT));

  return query(collectionRef, ...constraints);
}

// Apply quick filter constraints
function applyQuickFilter(constraints: QueryConstraint[], quickFilter: string) {
  switch (quickFilter) {
    case "deals":
      constraints.push(where("discountPercentage", ">", 0));
      break;
    case "boosted":
      constraints.push(where("isBoosted", "==", true));
      break;
    case "trending":
      constraints.push(where("dailyClickCount", ">=", 10));
      break;
    case "fiveStar":
      constraints.push(where("averageRating", "==", 5));
      break;
    case "bestSellers":
      // Handled in sorting
      break;
  }
}

// Apply sorting constraints
function applySorting(
  constraints: QueryConstraint[],
  sortOption: string,
  quickFilter?: string | null
) {
  if (quickFilter === "bestSellers") {
    // Best sellers: boosted first, then by purchase count
    constraints.push(orderBy("isBoosted", "desc"));
    constraints.push(orderBy("purchaseCount", "desc"));
    return;
  }

  switch (sortOption) {
    case "alphabetical":
      constraints.push(orderBy("isBoosted", "desc"));
      constraints.push(orderBy("productName", "asc"));
      break;
    case "price_asc":
      constraints.push(orderBy("isBoosted", "desc"));
      constraints.push(orderBy("price", "asc"));
      break;
    case "price_desc":
      constraints.push(orderBy("isBoosted", "desc"));
      constraints.push(orderBy("price", "desc"));
      break;
    case "date":
    default:
      // Default sorting: promotionScore first
      constraints.push(orderBy("promotionScore", "desc"));
      constraints.push(orderBy("createdAt", "desc"));
      break;
  }
}

// ✅ Optimized boosted products with reduced query complexity
async function fetchBoostedProducts({
  category,
  subsubcategory,
  buyerCategory,
  dynamicBrands,
  dynamicColors,
  dynamicSubSubcategories,
  minPrice,
  maxPrice,
}: {
  category: string;
  subsubcategory: string;
  buyerCategory?: string | null;
  dynamicBrands: string[];
  dynamicColors: string[];
  dynamicSubSubcategories: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
}): Promise<Product[]> {
  try {
    const collectionRef = collection(db, "shop_products");
    const constraints: QueryConstraint[] = [
      where("isBoosted", "==", true),
      where("category", "==", category),
      where("subsubcategory", "==", subsubcategory),
    ];

    // Gender filtering for boosted products
    if (buyerCategory === "Women" || buyerCategory === "Men") {
      constraints.push(where("gender", "in", [buyerCategory, "Unisex"]));
    }

    // Apply dynamic filters to boosted products
    if (
      dynamicBrands.length > 0 &&
      dynamicBrands.length <= MAX_ARRAY_FILTER_SIZE
    ) {
      constraints.push(where("brandModel", "in", dynamicBrands));
    }

    if (
      dynamicColors.length > 0 &&
      dynamicColors.length <= MAX_ARRAY_FILTER_SIZE
    ) {
      constraints.push(
        where("availableColors", "array-contains-any", dynamicColors)
      );
    }

    if (
      dynamicSubSubcategories.length > 0 &&
      dynamicSubSubcategories.length <= MAX_ARRAY_FILTER_SIZE
    ) {
      constraints.push(where("subsubcategory", "in", dynamicSubSubcategories));
    }

    if (minPrice !== null && minPrice !== undefined) {
      constraints.push(where("price", ">=", minPrice));
    }

    if (maxPrice !== null && maxPrice !== undefined) {
      constraints.push(where("price", "<=", maxPrice));
    }

    // Sorting for boosted products
    constraints.push(orderBy("promotionScore", "desc"));
    constraints.push(limit(20));

    const q = query(collectionRef, ...constraints);
    const snapshot = await getDocs(q);

    return parseProducts(snapshot);
  } catch (error: unknown) {
    console.error("Error fetching boosted products:", error);
    return [];
  }
}

// ✅ Optional: Manual cache cleanup endpoint (for maintenance)
export async function DELETE() {
  responseCache.clear();
  return NextResponse.json({ message: "Cache cleared successfully" });
}

// ✅ Optional: Cache stats endpoint (for monitoring)
export async function HEAD() {
  const now = Date.now();
  const stats = {
    size: responseCache.size,
    maxSize: MAX_CACHE_SIZE,
    entries: Array.from(responseCache.entries()).map(([key, entry]) => ({
      key: key.substring(0, 50),
      age: Math.floor((now - entry.timestamp) / 1000),
      accessCount: entry.accessCount,
    })),
  };

  return NextResponse.json(stats);
}
