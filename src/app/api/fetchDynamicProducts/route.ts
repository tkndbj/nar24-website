// src/app/api/fetchDynamicProducts/route.ts
//
// Dynamic Products API with unstable_cache for server-side caching.
// - Initial load (no filters, default sort) → Firestore
// - Filtering / sorting → Typesense

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
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
  CACHE_REVALIDATE_SECONDS: 120, // 2 minutes
  FACET_CACHE_REVALIDATE_SECONDS: 300, // 5 minutes
  REQUEST_TIMEOUT: 10_000,
  MAX_RETRIES: 2,
  BASE_RETRY_DELAY: 100,
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
  // Gender (buyerCategory) queries require a Firestore composite index on
  // gender + promotionScore + __name__ that isn't deployed; route them to
  // Typesense, which already indexes the gender facet.
  if (p.buyerCategory === "Women" || p.buyerCategory === "Men")
    return "typesense";
  return "firestore";
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore query (mirrors Flutter's _buildFirestoreQuery exactly)
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

  if (p.page > 0) {
    q = q.offset(p.page * CONFIG.DEFAULT_LIMIT);
  }

  return q.limit(CONFIG.DEFAULT_LIMIT);
}

// ─────────────────────────────────────────────────────────────────────────────
// Typesense fetch (mirrors Flutter's _fetchPageFromTypeSense exactly)
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
    await TypeSenseServiceManager.instance.shopService.searchIdsWithFacets({
      indexName: "shop_products",
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

function buildFacetFiltersForParams(
  p: QueryParams,
  firestoreCategory: string | null,
): string[][] {
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
  return facetFilters;
}

async function fetchSpecFacetsForParams(
  p: QueryParams,
  firestoreCategory: string | null,
): Promise<Record<string, FacetCount[]>> {
  try {
    const facetFilters = buildFacetFiltersForParams(p, firestoreCategory);

    const numericFilters: string[] = [];
    if (p.minPrice !== null)
      numericFilters.push(`price>=${Math.floor(p.minPrice)}`);
    if (p.maxPrice !== null)
      numericFilters.push(`price<=${Math.ceil(p.maxPrice)}`);
    if (p.minRating !== null)
      numericFilters.push(`averageRating>=${p.minRating}`);

    return await TypeSenseServiceManager.instance.shopService.fetchSpecFacets({
      indexName: "shop_products",
      facetFilters,
      additionalFilterBy:
        numericFilters.length > 0 ? numericFilters.join(" && ") : undefined,
    });
  } catch (err) {
    console.error("[fetchDynamicProducts] fetchSpecFacets error:", err);
    return {};
  }
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
      ? fetchSpecFacetsForParams(params, firestoreCategory)
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

const cachedFetchDynamicProducts = unstable_cache(
  fetchDynamicProductsData,
  ["dynamic-products"],
  { revalidate: CONFIG.CACHE_REVALIDATE_SECONDS, tags: ["dynamic-products"] },
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
        cachedFetchDynamicProducts(params),
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

export async function DELETE(request: NextRequest) {
  const { verifyAuth, verifyAdmin } = await import("@/lib/auth-middleware");
  const auth = await verifyAuth(request);
  if (auth.error) return auth.error;
  const adminCheck = await verifyAdmin(auth.isAdmin ?? false);
  if (adminCheck.error) return adminCheck.error;

  revalidateTag("dynamic-products");
  return NextResponse.json({ message: "Cache invalidated" });
}

export async function HEAD(request: NextRequest) {
  const { verifyAuth, verifyAdmin } = await import("@/lib/auth-middleware");
  const auth = await verifyAuth(request);
  if (auth.error) return auth.error;
  const adminCheck = await verifyAdmin(auth.isAdmin ?? false);
  if (adminCheck.error) return adminCheck.error;

  return NextResponse.json({
    cacheType: "unstable_cache",
    revalidateSeconds: CONFIG.CACHE_REVALIDATE_SECONDS,
    facetRevalidateSeconds: CONFIG.FACET_CACHE_REVALIDATE_SECONDS,
  });
}
