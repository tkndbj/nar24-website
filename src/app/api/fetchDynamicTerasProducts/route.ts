// src/app/api/fetchDynamicTerasProducts/route.ts
//
// Dynamic Teras Products API with unstable_cache for server-side caching.
// - Initial load (no filters, default sort) → Firestore `products` collection
// - Filtering / sorting → Typesense `products` index via mainService
// - Spec facets fetched from Typesense on page 0

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
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
  CACHE_REVALIDATE_SECONDS: 120, // 2 minutes
  FACET_CACHE_REVALIDATE_SECONDS: 300, // 5 minutes
  REQUEST_TIMEOUT: 12_000,
  MAX_RETRIES: 2,
  BASE_RETRY_DELAY: 100,
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
  timing?: number;
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
// Backend decision
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

  if (p.brands.length > 0)
    facetFilters.push(p.brands.map((b) => `brandModel:${b}`));
  if (p.colors.length > 0)
    facetFilters.push(p.colors.map((c) => `availableColors:${c}`));
  if (p.filterSubcategories.length > 0)
    facetFilters.push(
      p.filterSubcategories.map((s) => `subsubcategory_en:${s}`),
    );

  for (const [field, vals] of Object.entries(p.specFilters)) {
    if (vals.length > 0) facetFilters.push(vals.map((v) => `${field}:${v}`));
  }

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

  const products = res.hits.map((hit) =>
    ProductUtils.fromJson({ ...hit, id: hit.objectID || hit.id }),
  );

  return { products, hasMore: res.page < res.nbPages - 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Spec-facet fetch
// ─────────────────────────────────────────────────────────────────────────────

async function fetchSpecFacetsData(
  category: string | null,
  subcategory: string | null,
  subsubcategory: string | null,
  buyerCategory: string | null,
  firestoreCategory: string | null,
): Promise<Record<string, FacetCount[]>> {
  try {
    const facetFilters: string[][] = [];
    if (firestoreCategory)
      facetFilters.push([`category_en:${firestoreCategory}`]);
    if (subcategory) facetFilters.push([`subcategory_en:${subcategory}`]);
    if (subsubcategory)
      facetFilters.push([`subsubcategory_en:${subsubcategory}`]);
    if (buyerCategory === "Women" || buyerCategory === "Men") {
      facetFilters.push([`gender:${buyerCategory}`, "gender:Unisex"]);
    }

    return await TypeSenseServiceManager.instance.mainService.fetchSpecFacets({
      indexName: "products",
      facetFilters,
    });
  } catch (err) {
    console.error("[TerasProducts] fetchSpecFacets error:", err);
    return {};
  }
}

const cachedFetchSpecFacets = unstable_cache(
  fetchSpecFacetsData,
  ["teras-products-facets"],
  { revalidate: CONFIG.FACET_CACHE_REVALIDATE_SECONDS, tags: ["teras-products"] },
);

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
      ? cachedFetchSpecFacets(
          params.category,
          params.subcategory,
          params.subsubcategory,
          params.buyerCategory,
          firestoreCategory,
        )
      : Promise.resolve({} as Record<string, FacetCount[]>),
  ]);

  return {
    products,
    boostedProducts: [],
    hasMore,
    page: params.page,
    total: products.length,
    specFacets: params.page === 0 ? specFacets : undefined,
    timing: Date.now() - t0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-side cache
// ─────────────────────────────────────────────────────────────────────────────

const cachedFetchTerasProducts = unstable_cache(
  fetchTerasProductsData,
  ["teras-products"],
  { revalidate: CONFIG.CACHE_REVALIDATE_SECONDS, tags: ["teras-products"] },
);

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const t0 = Date.now();

  try {
    // Rate limit: 60 requests/min per IP
    const { applyRateLimit } = await import("@/lib/auth-middleware");
    const limited = await applyRateLimit(request, 60, 60000);
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const params = extractQueryParams(searchParams);

    const headers = (extra: Record<string, string> = {}) => ({
      "Cache-Control": "public, max-age=120, stale-while-revalidate=60",
      "X-Response-Time": `${Date.now() - t0}ms`,
      ...extra,
    });

    try {
      const result = await withTimeout(
        cachedFetchTerasProducts(params),
        CONFIG.REQUEST_TIMEOUT,
      );
      return NextResponse.json(result, {
        headers: headers({ "X-Timing": `${result.timing}ms` }),
      });
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

export async function DELETE(request: NextRequest) {
  const { verifyAuth, verifyAdmin } = await import("@/lib/auth-middleware");
  const auth = await verifyAuth(request);
  if (auth.error) return auth.error;
  const adminCheck = await verifyAdmin(auth.isAdmin ?? false);
  if (adminCheck.error) return adminCheck.error;

  revalidateTag("teras-products");
  return NextResponse.json({ message: "Cache invalidated" });
}
