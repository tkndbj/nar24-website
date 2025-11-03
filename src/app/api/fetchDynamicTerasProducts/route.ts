// src/app/api/fetchDynamicTerasProducts/route.ts

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
      searchParams.get("filterSubcategories")?.split(",").filter(Boolean) || [];
    const colors = searchParams.get("colors")?.split(",").filter(Boolean) || [];
    const brands = searchParams.get("brands")?.split(",").filter(Boolean) || [];
    const minPrice = searchParams.get("minPrice")
      ? parseFloat(searchParams.get("minPrice")!)
      : null;
    const maxPrice = searchParams.get("maxPrice")
      ? parseFloat(searchParams.get("maxPrice")!)
      : null;

    // New hierarchical buyer category filters
    const filterBuyerCategory = searchParams.get("filterBuyerCategory");
    const filterBuyerSubcategory = searchParams.get("filterBuyerSubcategory");
    const filterBuyerSubSubcategory = searchParams.get(
      "filterBuyerSubSubcategory"
    );

    console.log("🔍 Teras API Request params:", {
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
      filterBuyerCategory,
      filterBuyerSubcategory,
      filterBuyerSubSubcategory,
    });

    // Convert URL-friendly category back to Firestore format
    const firestoreCategory = convertToFirestoreCategory(category);

    console.log("🔍 Converted category:", {
      original: category,
      firestore: firestoreCategory,
    });

    // Build the main query for products collection
    const { q, error } = buildProductsQuery({
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
      page,
      filterBuyerCategory,
      filterBuyerSubcategory,
      filterBuyerSubSubcategory,
    });

    if (error) {
      console.error("❌ Error building query:", error);
      return NextResponse.json(
        {
          error: "Failed to build query",
          details: error,
        },
        { status: 500 }
      );
    }

    // Execute query
    console.log("🔍 Executing Firestore query on products collection...");
    let snapshot;
    try {
      snapshot = await getDocs(q);
      console.log(`🔍 Query returned ${snapshot.size} documents`);
    } catch (firestoreError) {
      console.error("❌ Firestore query execution failed:", firestoreError);
      console.error("❌ Query details:", {
        category: firestoreCategory,
        subcategory,
        subsubcategory,
        buyerCategory,
        filterBuyerCategory,
        filterBuyerSubcategory,
        filterBuyerSubSubcategory,
      });

      // Return a more helpful error message
      return NextResponse.json(
        {
          error: "Database query failed",
          details: firestoreError instanceof Error ? firestoreError.message : "Unknown Firestore error",
          hint: "This might require a Firestore composite index. Check the Firebase console for index creation links.",
        },
        { status: 500 }
      );
    }

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
    if (!quickFilter && (firestoreCategory || filterBuyerCategory)) {
      console.log("🔍 Fetching boosted products from products collection...");
      try {
        boostedProducts = await fetchBoostedProductsFromProducts({
          category: firestoreCategory,
          subcategory,
          subsubcategory,
          buyerCategory,
          dynamicBrands: brands,
          dynamicColors: colors,
          dynamicSubSubcategories: filterSubcategories,
          minPrice,
          maxPrice,
          filterBuyerCategory,
          filterBuyerSubcategory,
          filterBuyerSubSubcategory,
        });
        console.log(`🔍 Found ${boostedProducts.length} boosted products`);
      } catch (boostedError) {
        console.error("❌ Failed to fetch boosted products:", boostedError);
        // Don't fail the whole request, just log the error and continue without boosted products
        boostedProducts = [];
      }
    }

    console.log("🔍 Teras API Response:", {
      products: products.length,
      boostedProducts: boostedProducts.length,
      hasMore: products.length >= LIMIT,
      page,
    });

    return NextResponse.json({
      products,
      boostedProducts,
      hasMore: products.length >= LIMIT,
      page,
      total: snapshot.size,
    });
  } catch (error) {
    console.error(
      "❌ Error fetching products from products collection:",
      error
    );
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

interface ProductsQueryParams {
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
  page: number;
  filterBuyerCategory?: string | null;
  filterBuyerSubcategory?: string | null;
  filterBuyerSubSubcategory?: string | null;
}

function buildProductsQuery({
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
  page,
  filterBuyerCategory,
  filterBuyerSubcategory,
  filterBuyerSubSubcategory,
}: ProductsQueryParams): { q: Query<DocumentData, DocumentData>; error?: string } {
  try {
    const collectionRef: CollectionReference<DocumentData, DocumentData> =
      collection(db, "products");
    const constraints: QueryConstraint[] = [];

    console.log("🔍 Building products query with params:", {
      category,
      subcategory,
      subsubcategory,
      buyerCategory,
      sortOption,
      quickFilter,
      page,
      filterBuyerCategory,
      filterBuyerSubcategory,
      filterBuyerSubSubcategory,
    });

    // Determine which category to use (URL param takes precedence)
    let effectiveCategory = category;
    let effectiveGender: string | null = null;

    // ========== HIERARCHICAL BUYER CATEGORY FILTERING ==========
    if (filterBuyerCategory) {
      console.log("🔍 Processing filterBuyerCategory:", filterBuyerCategory);

      // Handle gender filtering for Women/Men
      if (filterBuyerCategory === "Women" || filterBuyerCategory === "Men") {
        effectiveGender = filterBuyerCategory;
      }

      // If filterBuyerSubcategory is set, map to product category
      if (filterBuyerSubcategory) {
        console.log(
          "🔍 Processing filterBuyerSubcategory:",
          filterBuyerSubcategory
        );

        // Map buyer subcategory to product category
        const productCategoryMapping: Record<string, Record<string, string>> = {
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

        const mappedCategory =
          productCategoryMapping[filterBuyerCategory]?.[filterBuyerSubcategory];

        // Use mapped category if URL category is not already set
        if (mappedCategory && !category) {
          effectiveCategory = mappedCategory;
        }
      } else if (
        filterBuyerCategory !== "Women" &&
        filterBuyerCategory !== "Men"
      ) {
        // For non-gendered categories, map directly
        const directCategoryMap: Record<string, string> = {
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

        const mappedCategory = directCategoryMap[filterBuyerCategory];
        if (mappedCategory && !category) {
          effectiveCategory = mappedCategory;
        }
      }
    }

    // Apply gender filter from URL params if present
    if (buyerCategory === "Women" || buyerCategory === "Men") {
      effectiveGender = buyerCategory;
    }

    // ========== APPLY FILTERS ==========
    // Category filter
    if (effectiveCategory) {
      constraints.push(where("category", "==", effectiveCategory));
      console.log("🔍 Added category filter:", effectiveCategory);
    }

    // Gender filter (only add once)
    if (effectiveGender) {
      constraints.push(where("gender", "in", [effectiveGender, "Unisex"]));
      console.log("🔍 Added gender filter:", [effectiveGender, "Unisex"]);
    }

    // Subcategory filter
    let effectiveSubcategory = subcategory;

    // For Women/Men buyer categories, buyerSubSubcategory maps to product subcategory
    // This applies to all buyer subcategories: Fashion, Shoes, Accessories, Bags, Self Care
    if (
      filterBuyerCategory &&
      (filterBuyerCategory === "Women" || filterBuyerCategory === "Men") &&
      filterBuyerSubcategory &&
      filterBuyerSubSubcategory &&
      !subcategory
    ) {
      effectiveSubcategory = filterBuyerSubSubcategory;
      console.log(
        "🔍 Mapped buyerSubSubcategory to product subcategory:",
        effectiveSubcategory
      );
    }

    if (effectiveSubcategory) {
      constraints.push(where("subcategory", "==", effectiveSubcategory));
      console.log("🔍 Added subcategory filter:", effectiveSubcategory);
    }

    // Subsubcategory filter (only if not already used for subcategory mapping)
    let effectiveSubSubcategory = subsubcategory;

    // Only use filterBuyerSubSubcategory for subsubcategory if not Women/Men buyer categories
    if (
      !effectiveSubSubcategory &&
      filterBuyerSubSubcategory &&
      !(
        filterBuyerCategory &&
        (filterBuyerCategory === "Women" || filterBuyerCategory === "Men") &&
        filterBuyerSubcategory
      )
    ) {
      effectiveSubSubcategory = filterBuyerSubSubcategory;
    }

    if (effectiveSubSubcategory) {
      constraints.push(where("subsubcategory", "==", effectiveSubSubcategory));
      console.log("🔍 Added subsubcategory filter:", effectiveSubSubcategory);
    }

    // ========== DYNAMIC FILTERS ==========
    if (dynamicSubSubcategories.length > 0 && !effectiveSubSubcategory) {
      if (dynamicSubSubcategories.length <= 10) {
        constraints.push(where("subsubcategory", "in", dynamicSubSubcategories));
        console.log(
          "🔍 Added dynamic subsubcategories filter:",
          dynamicSubSubcategories
        );
      } else {
        constraints.push(
          where("subsubcategory", "in", dynamicSubSubcategories.slice(0, 10))
        );
        console.log(
          "🔍 Added dynamic subsubcategories filter (limited to 10):",
          dynamicSubSubcategories.slice(0, 10)
        );
      }
    }

    if (dynamicBrands.length > 0) {
      // Note: Your Firestore doesn't have brandModel field, you might need to adjust this
      // Based on your example, there's no brand field visible, so this might cause issues
      const brandField = "brandModel";
      if (dynamicBrands.length <= 10) {
        constraints.push(where(brandField, "in", dynamicBrands));
      } else {
        constraints.push(where(brandField, "in", dynamicBrands.slice(0, 10)));
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
          where("availableColors", "array-contains-any", dynamicColors.slice(0, 10))
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
          // Check if this field exists in your Firestore
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
        case "bestSellers":
          // Don't add constraint here, handle in sorting
          break;
      }
    }

    // ========== SORTING ==========
    console.log("🔍 Adding sorting for option:", sortOption);

    // For complex queries with multiple where clauses, we need to be careful with orderBy
    // Firestore requires composite indexes for certain combinations
    if (quickFilter === "bestSellers") {
      // Use purchaseCount if available
      constraints.push(orderBy("purchaseCount", "desc"));
    } else {
      switch (sortOption) {
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
          // Use createdAt for date sorting - this exists in your Firestore
          constraints.push(orderBy("createdAt", "desc"));
          break;
      }
    }

    // Add limit constraint
    constraints.push(limit(LIMIT));

    console.log(
      "🔍 Final products query constraints count:",
      constraints.length
    );
    
    const q = query(collectionRef, ...constraints);
    return { q };
  } catch (error) {
    console.error("❌ Error in buildProductsQuery:", error);
    return {
      q: query(collection(db, "products"), limit(LIMIT)),
      error: error instanceof Error ? error.message : "Unknown error building query"
    };
  }
}

async function fetchBoostedProductsFromProducts({
  category,
  subcategory,
  subsubcategory,
  buyerCategory,
  dynamicBrands,
  dynamicColors,
  dynamicSubSubcategories,
  minPrice,
  maxPrice,
  filterBuyerCategory,
  filterBuyerSubcategory,
  filterBuyerSubSubcategory,
}: {
  category?: string | null;
  subcategory?: string | null;
  subsubcategory?: string | null;
  buyerCategory?: string | null;
  dynamicBrands: string[];
  dynamicColors: string[];
  dynamicSubSubcategories: string[];
  minPrice?: number | null;
  maxPrice?: number | null;
  filterBuyerCategory?: string | null;
  filterBuyerSubcategory?: string | null;
  filterBuyerSubSubcategory?: string | null;
}): Promise<Product[]> {
  try {
    const collectionRef = collection(db, "products");
    const constraints: QueryConstraint[] = [where("isBoosted", "==", true)];

    // Determine effective category and gender
    let effectiveCategory = category;
    let effectiveGender: string | null = null;

    if (filterBuyerCategory) {
      if (filterBuyerCategory === "Women" || filterBuyerCategory === "Men") {
        effectiveGender = filterBuyerCategory;
      }

      if (filterBuyerSubcategory) {
        const productCategoryMapping: Record<string, Record<string, string>> = {
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

        const mappedCategory =
          productCategoryMapping[filterBuyerCategory]?.[filterBuyerSubcategory];
        if (mappedCategory && !category) {
          effectiveCategory = mappedCategory;
        }
      } else if (
        filterBuyerCategory !== "Women" &&
        filterBuyerCategory !== "Men"
      ) {
        const directCategoryMap: Record<string, string> = {
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

        const mappedCategory = directCategoryMap[filterBuyerCategory];
        if (mappedCategory && !category) {
          effectiveCategory = mappedCategory;
        }
      }
    }

    if (buyerCategory === "Women" || buyerCategory === "Men") {
      effectiveGender = buyerCategory;
    }

    // Apply filters
    if (effectiveCategory) {
      constraints.push(where("category", "==", effectiveCategory));
    }

    if (effectiveGender) {
      constraints.push(where("gender", "in", [effectiveGender, "Unisex"]));
    }

    // Subcategory mapping (same logic as main query)
    let effectiveSubcategory = subcategory;

    // For Women/Men buyer categories, buyerSubSubcategory maps to product subcategory
    if (
      filterBuyerCategory &&
      (filterBuyerCategory === "Women" || filterBuyerCategory === "Men") &&
      filterBuyerSubcategory &&
      filterBuyerSubSubcategory &&
      !subcategory
    ) {
      effectiveSubcategory = filterBuyerSubSubcategory;
    }

    if (effectiveSubcategory) {
      constraints.push(where("subcategory", "==", effectiveSubcategory));
    }

    // Subsubcategory mapping
    let effectiveSubSubcategory = subsubcategory;

    // Only use filterBuyerSubSubcategory for subsubcategory if not Women/Men buyer categories
    if (
      !effectiveSubSubcategory &&
      filterBuyerSubSubcategory &&
      !(
        filterBuyerCategory &&
        (filterBuyerCategory === "Women" || filterBuyerCategory === "Men") &&
        filterBuyerSubcategory
      )
    ) {
      effectiveSubSubcategory = filterBuyerSubSubcategory;
    }

    if (effectiveSubSubcategory) {
      constraints.push(where("subsubcategory", "==", effectiveSubSubcategory));
    }

    // Apply dynamic filters
    if (dynamicSubSubcategories.length > 0 && !effectiveSubSubcategory) {
      if (dynamicSubSubcategories.length <= 10) {
        constraints.push(where("subsubcategory", "in", dynamicSubSubcategories));
      } else {
        constraints.push(
          where("subsubcategory", "in", dynamicSubSubcategories.slice(0, 10))
        );
      }
    }

    if (dynamicBrands.length > 0 && dynamicBrands.length <= 10) {
      constraints.push(where("brandModel", "in", dynamicBrands));
    }

    if (dynamicColors.length > 0 && dynamicColors.length <= 10) {
      constraints.push(
        where("availableColors", "array-contains-any", dynamicColors)
      );
    }

    if (minPrice !== null) {
      constraints.push(where("price", ">=", minPrice));
    }

    if (maxPrice !== null) {
      constraints.push(where("price", "<=", maxPrice));
    }

    // Sorting - use createdAt which exists in your Firestore
    constraints.push(orderBy("createdAt", "desc"));
    constraints.push(limit(20));

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
    console.error(
      "Error fetching boosted products from products collection:",
      error
    );
    return [];
  }
}