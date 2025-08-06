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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract parameters
    const category = searchParams.get("category");
    const subcategory = searchParams.get("subcategory");
    const subsubcategory = searchParams.get("subsubcategory");
    const buyerCategory = searchParams.get("buyerCategory");
    const buyerSubcategory = searchParams.get("buyerSubcategory");
    const page = parseInt(searchParams.get("page") || "0");
    const sortOption = searchParams.get("sort") || "date";
    const quickFilter = searchParams.get("filter");

    // Dynamic filters from sidebar
    const filterSubcategories =
      searchParams.get("filterSubcategories")?.split(",") || [];
    const colors = searchParams.get("colors")?.split(",") || [];
    const brands = searchParams.get("brands")?.split(",") || [];
    const minPrice = searchParams.get("minPrice")
      ? parseFloat(searchParams.get("minPrice")!)
      : null;
    const maxPrice = searchParams.get("maxPrice")
      ? parseFloat(searchParams.get("maxPrice")!)
      : null;

    console.log("🔍 API Request params:", {
      category,
      subcategory,
      subsubcategory,
      buyerCategory,
      buyerSubcategory,
      page,
      sortOption,
      quickFilter,
      filterSubcategories,
      colors,
      brands,
      minPrice,
      maxPrice,
    });

    // Convert URL-friendly category back to Firestore format
    const firestoreCategory = convertToFirestoreCategory(category);

    console.log("🔍 Converted category:", {
      original: category,
      firestore: firestoreCategory,
    });

    // Build the main query
    const q = buildServerSideQuery({
      category: firestoreCategory,
      subcategory,
      subsubcategory,
      buyerCategory,
      buyerSubcategory,
      sortOption,
      quickFilter,
      dynamicBrands: brands,
      dynamicColors: colors,
      dynamicSubSubcategories: filterSubcategories,
      minPrice,
      maxPrice,
    });

    // Execute query
    console.log("🔍 Executing Firestore query...");
    const snapshot = await getDocs(q);
    console.log(`🔍 Query returned ${snapshot.size} documents`);

    const products: Product[] = [];

    snapshot.docs.forEach((doc) => {
      try {
        const data = { id: doc.id, ...doc.data() };
        const product = ProductUtils.fromJson(data);
        products.push(product);
      } catch (error) {
        console.warn(`Failed to parse product ${doc.id}:`, error);
      }
    });

    // Fetch boosted products separately (only for default filter)
    let boostedProducts: Product[] = [];
    if (!quickFilter && firestoreCategory && subsubcategory) {
      console.log("🔍 Fetching boosted products...");
      boostedProducts = await fetchBoostedProducts({
        category: firestoreCategory,
        subsubcategory,
        buyerCategory,
        dynamicBrands: brands,
        dynamicColors: colors,
        dynamicSubSubcategories: filterSubcategories,
        minPrice,
        maxPrice,
      });
      console.log(`🔍 Found ${boostedProducts.length} boosted products`);
    }

    console.log("🔍 API Response:", {
      products: products.length,
      boostedProducts: boostedProducts.length,
      hasMore: products.length >= LIMIT,
    });

    return NextResponse.json({
      products,
      boostedProducts,
      hasMore: products.length >= LIMIT,
      page,
      total: snapshot.size,
    });
  } catch (error) {
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

// Helper function to convert URL-friendly category to Firestore format
function convertToFirestoreCategory(urlCategory: string | null): string | null {
  if (!urlCategory) return null;

  const categoryMapping: { [key: string]: string } = {
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

  return categoryMapping[urlCategory] || urlCategory;
}

interface QueryParams {
  category?: string | null;
  subcategory?: string | null;
  subsubcategory?: string | null;
  buyerCategory?: string | null;
  buyerSubcategory?: string | null;
  sortOption: string;
  quickFilter?: string | null;
  dynamicBrands: string[];
  dynamicColors: string[];
  dynamicSubSubcategories: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
}

function buildServerSideQuery({
  category,
  subcategory,
  subsubcategory,
  buyerCategory,
  sortOption,
  quickFilter,
  dynamicBrands,
  dynamicColors,
  dynamicSubSubcategories,
  minPrice,
  maxPrice,
}: QueryParams): Query<DocumentData, DocumentData> {
  const collectionRef: CollectionReference<DocumentData, DocumentData> =
    collection(db, "shop_products");
  const constraints: QueryConstraint[] = [];

  console.log("🔍 Building query with params:", {
    category,
    subcategory,
    subsubcategory,
    buyerCategory,
    sortOption,
    quickFilter,
  });

  // ========== BASIC FILTERS ==========
  if (category) {
    constraints.push(where("category", "==", category));
    console.log("🔍 Added category filter:", category);
  }

  if (subcategory) {
    constraints.push(where("subcategory", "==", subcategory));
    console.log("🔍 Added subcategory filter:", subcategory);
  }

  if (subsubcategory) {
    constraints.push(where("subsubcategory", "==", subsubcategory));
    console.log("🔍 Added subsubcategory filter:", subsubcategory);
  }

  // ========== GENDER FILTERING ==========
  if (buyerCategory === "Women" || buyerCategory === "Men") {
    constraints.push(where("gender", "in", [buyerCategory, "Unisex"]));
    console.log("🔍 Added gender filter:", [buyerCategory, "Unisex"]);
  }

  // ========== DYNAMIC FILTERS ==========
  if (dynamicSubSubcategories.length > 0) {
    if (dynamicSubSubcategories.length <= 10) {
      constraints.push(where("subsubcategory", "in", dynamicSubSubcategories));
    } else {
      constraints.push(
        where("subsubcategory", "in", dynamicSubSubcategories.slice(0, 10))
      );
    }
    console.log(
      "🔍 Added dynamic subsubcategories filter:",
      dynamicSubSubcategories
    );
  }

  if (dynamicBrands.length > 0) {
    if (dynamicBrands.length <= 10) {
      constraints.push(where("brandModel", "in", dynamicBrands));
    } else {
      constraints.push(where("brandModel", "in", dynamicBrands.slice(0, 10)));
    }
    console.log("🔍 Added dynamic brands filter:", dynamicBrands);
  }

  if (dynamicColors.length > 0) {
    if (dynamicColors.length <= 10) {
      constraints.push(
        where("availableColors", "array-contains-any", dynamicColors)
      );
    } else {
      constraints.push(
        where(
          "availableColors",
          "array-contains-any",
          dynamicColors.slice(0, 10)
        )
      );
    }
    console.log("🔍 Added dynamic colors filter:", dynamicColors);
  }

  if (minPrice !== null) {
    constraints.push(where("price", ">=", minPrice));
    console.log("🔍 Added minPrice filter:", minPrice);
  }

  if (maxPrice !== null) {
    constraints.push(where("price", "<=", maxPrice));
    console.log("🔍 Added maxPrice filter:", maxPrice);
  }

  // ========== QUICK FILTERS ==========
  if (quickFilter) {
    console.log("🔍 Adding quick filter:", quickFilter);
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
        // Don't add constraint here, handle in sorting
        break;
    }
  }

  // ========== SORTING (SIMPLIFIED TO MATCH FLUTTER) ==========
  console.log("🔍 Adding sorting for option:", sortOption);

  // Use the exact same sorting logic as Flutter
  if (quickFilter === "bestSellers") {
    // For best sellers: boosted first, then by purchase count
    constraints.push(orderBy("isBoosted", "desc"));
    constraints.push(orderBy("purchaseCount", "desc"));
  } else {
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
        // PRIMARY SORT: Try promotionScore first, fallback to legacy
        try {
          constraints.push(orderBy("promotionScore", "desc"));
          constraints.push(orderBy("createdAt", "desc"));
          console.log("🔍 Using promotionScore sorting");
        } catch {
          // If promotionScore fails, use fallback
          constraints.push(orderBy("isBoosted", "desc"));
          constraints.push(orderBy("rankingScore", "desc"));
          constraints.push(orderBy("createdAt", "desc"));
          console.log("🔍 Using fallback sorting");
        }
        break;
    }
  }

  // Add limit constraint
  constraints.push(limit(LIMIT));

  console.log("🔍 Final query constraints count:", constraints.length);
  return query(collectionRef, ...constraints);
}

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

    console.log("🔍 Building boosted query with:", {
      category,
      subsubcategory,
      buyerCategory,
    });

    // Add buyer category gender filtering for boosted products
    if (buyerCategory === "Women" || buyerCategory === "Men") {
      constraints.push(where("gender", "in", [buyerCategory, "Unisex"]));
    }

    // Apply dynamic filters to boosted products as well
    if (dynamicBrands.length > 0 && dynamicBrands.length <= 10) {
      constraints.push(where("brandModel", "in", dynamicBrands));
    }
    if (dynamicColors.length > 0 && dynamicColors.length <= 10) {
      constraints.push(
        where("availableColors", "array-contains-any", dynamicColors)
      );
    }
    if (
      dynamicSubSubcategories.length > 0 &&
      dynamicSubSubcategories.length <= 10
    ) {
      constraints.push(where("subsubcategory", "in", dynamicSubSubcategories));
    }
    if (minPrice !== null) {
      constraints.push(where("price", ">=", minPrice));
    }
    if (maxPrice !== null) {
      constraints.push(where("price", "<=", maxPrice));
    }

    // Enhanced sorting for boosted products
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
    const boostedProducts: Product[] = [];

    snapshot.docs.forEach((doc) => {
      try {
        const data = { id: doc.id, ...doc.data() };
        const product = ProductUtils.fromJson(data);
        boostedProducts.push(product);
      } catch (error) {
        console.warn(`Failed to parse boosted product ${doc.id}:`, error);
      }
    });

    return boostedProducts;
  } catch (error) {
    console.error("Error fetching boosted products:", error);
    return [];
  }
}
