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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Product, ProductUtils } from "@/app/models/Product";

const LIMIT = 20;
const MAX_ARRAY_FILTER_SIZE = 10;

// Category mapping cache to avoid repeated string operations
const CATEGORY_MAPPING: Record<string, string> = {
  "clothing-fashion": "Clothing & Fashion",
  "footwear": "Footwear",
  "accessories": "Accessories",
  "bags-luggage": "Bags & Luggage",
  "beauty-personal-care": "Beauty & Personal Care",
  "mother-child": "Mother & Child",
  "home-furniture": "Home & Furniture",
  "electronics": "Electronics",
  "sports-outdoor": "Sports & Outdoor",
  "books-stationery-hobby": "Books, Stationery & Hobby",
  "tools-hardware": "Tools & Hardware",
  "pet-supplies": "Pet Supplies",
  "automotive": "Automotive",
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract and parse parameters
    const params = extractQueryParams(searchParams);

    // Convert category to Firestore format
    const firestoreCategory = params.category 
      ? CATEGORY_MAPPING[params.category] || params.category 
      : null;

    // Build main products query
    const productsQuery = buildProductsQuery({
      ...params,
      category: firestoreCategory,
    });

    // Execute query with error handling
    const snapshot = await getDocs(productsQuery);
    
    // Parse products efficiently
    const products = parseProducts(snapshot);

    // Fetch boosted products if needed (only for default filter)
    let boostedProducts: Product[] = [];
    if (!params.quickFilter && firestoreCategory && params.subsubcategory) {
      boostedProducts = await fetchBoostedProducts({
        category: firestoreCategory,
        subsubcategory: params.subsubcategory,
        buyerCategory: params.buyerCategory,
        dynamicBrands: params.brands,
        dynamicColors: params.colors,
        dynamicSubSubcategories: params.filterSubcategories,
        minPrice: params.minPrice,
        maxPrice: params.maxPrice,
      });
    }

    return NextResponse.json({
      products,
      boostedProducts,
      hasMore: products.length >= LIMIT,
      page: params.page,
      total: snapshot.size,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
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
    filterSubcategories: searchParams.get("filterSubcategories")?.split(",").filter(Boolean) || [],
    colors: searchParams.get("colors")?.split(",").filter(Boolean) || [],
    brands: searchParams.get("brands")?.split(",").filter(Boolean) || [],
    minPrice: searchParams.get("minPrice") ? parseFloat(searchParams.get("minPrice")!) : null,
    maxPrice: searchParams.get("maxPrice") ? parseFloat(searchParams.get("maxPrice")!) : null,
  };
}

// Parse products from snapshot
function parseProducts(snapshot: any): Product[] {
  const products: Product[] = [];
  
  snapshot.docs.forEach((doc: any) => {
    try {
      const data = { id: doc.id, ...doc.data() };
      const product = ProductUtils.fromJson(data);
      products.push(product);
    } catch (error) {
      console.warn(`Failed to parse product ${doc.id}:`, error);
    }
  });

  return products;
}

function buildProductsQuery(params: QueryParams): Query<DocumentData, DocumentData> {
  const collectionRef: CollectionReference<DocumentData, DocumentData> = collection(db, "shop_products");
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
      // Default sorting: promotionScore or fallback to legacy
      try {
        constraints.push(orderBy("promotionScore", "desc"));
        constraints.push(orderBy("createdAt", "desc"));
      } catch {
        // Fallback if promotionScore doesn't exist
        constraints.push(orderBy("isBoosted", "desc"));
        constraints.push(orderBy("rankingScore", "desc"));
        constraints.push(orderBy("createdAt", "desc"));
      }
      break;
  }
}

// Fetch boosted products separately
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
    if (dynamicBrands.length > 0 && dynamicBrands.length <= MAX_ARRAY_FILTER_SIZE) {
      constraints.push(where("brandModel", "in", dynamicBrands));
    }

    if (dynamicColors.length > 0 && dynamicColors.length <= MAX_ARRAY_FILTER_SIZE) {
      constraints.push(where("availableColors", "array-contains-any", dynamicColors));
    }

    if (dynamicSubSubcategories.length > 0 && dynamicSubSubcategories.length <= MAX_ARRAY_FILTER_SIZE) {
      constraints.push(where("subsubcategory", "in", dynamicSubSubcategories));
    }

    if (minPrice !== null && minPrice !== undefined) {
      constraints.push(where("price", ">=", minPrice));
    }

    if (maxPrice !== null && maxPrice !== undefined) {
      constraints.push(where("price", "<=", maxPrice));
    }

    // Sorting for boosted products
    try {
      constraints.push(orderBy("promotionScore", "desc"));
      constraints.push(limit(20));
    } catch {
      constraints.push(orderBy("rankingScore", "desc"));
      constraints.push(orderBy("createdAt", "desc"));
      constraints.push(limit(20));
    }

    const q = query(collectionRef, ...constraints);
    const snapshot = await getDocs(q);

    return parseProducts(snapshot);
  } catch (error) {
    console.error("Error fetching boosted products:", error);
    return [];
  }
}