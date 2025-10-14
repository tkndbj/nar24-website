import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";

// Product interface
interface Product {
  id: string;
  productName: string;
  price: number;
  originalPrice?: number;
  discountPercentage?: number;
  currency: string;
  imageUrls: string[];
  colorImages: Record<string, string[]>;
  description: string;
  brandModel?: string;
  condition: string;
  quantity?: number;
  averageRating: number;
  isBoosted: boolean;
  deliveryOption?: string;
  campaignName?: string;
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  gender?: string;
  availableColors?: string[];
  createdAt?: FirebaseFirestore.Timestamp;
  rankingScore?: number;
  promotionScore?: number;
}

// Cache configuration
const CACHE_DURATION = 60; // 60 seconds
const MAX_FETCH_LIMIT = 200;
const DEFAULT_PAGE_SIZE = 20;

// Convert Firestore document to Product (optimized)
function documentToProduct(doc: QueryDocumentSnapshot): Product {
  const data = doc.data();
  
  // Use object spread for better performance
  return {
    id: doc.id,
    productName: data.productName ?? "",
    price: data.price ?? 0,
    originalPrice: data.originalPrice,
    discountPercentage: data.discountPercentage,
    currency: data.currency ?? "TL",
    imageUrls: data.imageUrls ?? [],
    colorImages: data.colorImages ?? {},
    description: data.description ?? "",
    brandModel: data.brandModel,
    condition: data.condition ?? "New",
    quantity: data.quantity,
    averageRating: data.averageRating ?? 0,
    isBoosted: data.isBoosted ?? false,
    deliveryOption: data.deliveryOption,
    campaignName: data.campaignName,
    category: data.category,
    subcategory: data.subcategory,
    subsubcategory: data.subsubcategory,
    gender: data.gender,
    availableColors: data.availableColors,
    createdAt: data.createdAt,
    rankingScore: data.rankingScore,
    promotionScore: data.promotionScore,
  };
}

// Normalize string for comparison (case-insensitive and trim)
function normalizeString(str: string): string {
  return str.toLowerCase().trim();
}

// Client-side filtering function (optimized)
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
  // Early return if no filters
  const hasFilters =
    filters.filterSubcategories.length > 0 ||
    filters.colors.length > 0 ||
    filters.brands.length > 0 ||
    filters.minPrice !== undefined ||
    filters.maxPrice !== undefined;

  if (!hasFilters) {
    return products;
  }

  // Normalize filter values once
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

    // Price range filter
    if (filters.minPrice !== undefined && product.price < filters.minPrice) {
      return false;
    }

    if (filters.maxPrice !== undefined && product.price > filters.maxPrice) {
      return false;
    }

    return true;
  });
}

// Format category name helper
function formatCategoryName(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse parameters
    const category = searchParams.get("category");
    const subcategory = searchParams.get("subcategory");
    const subsubcategory = searchParams.get("subsubcategory");
    const page = Math.max(0, parseInt(searchParams.get("page") || "0"));
    const limit = Math.min(
      Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_PAGE_SIZE))),
      100
    );

    // Parse filter parameters
    const filterSubcategories =
      searchParams.get("filterSubcategories")?.split(",").filter(Boolean) || [];
    const colors = searchParams.get("colors")?.split(",").filter(Boolean) || [];
    const brands = searchParams.get("brands")?.split(",").filter(Boolean) || [];
    const minPrice = searchParams.get("minPrice")
      ? parseFloat(searchParams.get("minPrice")!)
      : undefined;
    const maxPrice = searchParams.get("maxPrice")
      ? parseFloat(searchParams.get("maxPrice")!)
      : undefined;

    // Validate required parameters
    if (!category) {
      return NextResponse.json(
        { error: "Category parameter is required" },
        { status: 400 }
      );
    }

    // Validate price range
    if (
      minPrice !== undefined &&
      maxPrice !== undefined &&
      minPrice > maxPrice
    ) {
      return NextResponse.json(
        { error: "Invalid price range: minimum price cannot exceed maximum price" },
        { status: 400 }
      );
    }

    // Initialize Firestore
    const db = getFirestoreAdmin();
    let allProducts: Product[] = [];

    // Handle Women/Men categories using gender field
    if (category === "women" || category === "men") {
      const genderValue = formatCategoryName(category);
      const gendersToFetch = [genderValue, "Unisex"];

      // Use Promise.all for parallel fetching
      const genderPromises = gendersToFetch.map(async (gender) => {
        try {
          let genderQuery: FirebaseFirestore.Query = db
            .collection("shop_products")
            .where("gender", "==", gender)
            .where("quantity", ">", 0);

          // Add URL-based filters at DB level
          if (subcategory) {
            genderQuery = genderQuery.where(
              "subcategory",
              "==",
              formatCategoryName(subcategory)
            );
          }

          if (subsubcategory) {
            genderQuery = genderQuery.where(
              "subsubcategory",
              "==",
              formatCategoryName(subsubcategory)
            );
          }

          // Apply price filters at database level
          if (minPrice !== undefined) {
            genderQuery = genderQuery.where("price", ">=", minPrice);
          }

          if (maxPrice !== undefined) {
            genderQuery = genderQuery.where("price", "<=", maxPrice);
          }

          // Order and limit
          genderQuery = genderQuery
            .orderBy("quantity")
            .orderBy("isBoosted", "desc")
            .orderBy("rankingScore", "desc")
            .limit(MAX_FETCH_LIMIT);

          const snapshot = await genderQuery.get();
          return snapshot.docs.map((doc: QueryDocumentSnapshot) =>
            documentToProduct(doc)
          );
        } catch (error) {
          console.error(`Error fetching products for gender ${gender}:`, error);
          return [];
        }
      });

      const results = await Promise.all(genderPromises);
      allProducts = results.flat();

      // Remove duplicates using Map for better performance
      const uniqueProducts = new Map<string, Product>();
      allProducts.forEach((product) => {
        if (!uniqueProducts.has(product.id)) {
          uniqueProducts.set(product.id, product);
        }
      });
      allProducts = Array.from(uniqueProducts.values());
    } else {
      // For other categories, filter by category field directly
      try {
        const categoryValue = formatCategoryName(category);

        let query: FirebaseFirestore.Query = db
          .collection("shop_products")
          .where("category", "==", categoryValue)
          .where("quantity", ">", 0);

        // Add URL-based filters at DB level
        if (subcategory) {
          query = query.where("subcategory", "==", formatCategoryName(subcategory));
        }

        if (subsubcategory) {
          query = query.where(
            "subsubcategory",
            "==",
            formatCategoryName(subsubcategory)
          );
        }

        // Apply price filters at database level
        if (minPrice !== undefined) {
          query = query.where("price", ">=", minPrice);
        }

        if (maxPrice !== undefined) {
          query = query.where("price", "<=", maxPrice);
        }

        // Order and limit
        query = query
          .orderBy("quantity")
          .orderBy("isBoosted", "desc")
          .orderBy("rankingScore", "desc")
          .limit(MAX_FETCH_LIMIT);

        const snapshot = await query.get();
        allProducts = snapshot.docs.map((doc: QueryDocumentSnapshot) =>
          documentToProduct(doc)
        );
      } catch (error) {
        console.error(`Error fetching products for category ${category}:`, error);
        allProducts = [];
      }
    }

    // Apply client-side filtering for complex filters
    allProducts = applyClientSideFilters(allProducts, {
      filterSubcategories,
      colors,
      brands,
      minPrice,
      maxPrice,
    });

    // Sort by boosted first, then ranking score
    allProducts.sort((a, b) => {
      if (a.isBoosted !== b.isBoosted) {
        return a.isBoosted ? -1 : 1;
      }
      return (b.rankingScore ?? 0) - (a.rankingScore ?? 0);
    });

    // Apply pagination
    const startIndex = page * limit;
    const paginatedProducts = allProducts.slice(startIndex, startIndex + limit);
    const hasMore = allProducts.length > startIndex + limit;

    const response = {
      products: paginatedProducts,
      hasMore,
      page,
      total: allProducts.length,
    };

    // Add cache headers
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_DURATION}, stale-while-revalidate`,
        "CDN-Cache-Control": `public, s-maxage=${CACHE_DURATION}`,
      },
    });
  } catch (error) {
    console.error("Error in API route:", error);
    
    // Return appropriate error response
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    const statusCode = errorMessage.includes("permission") ? 403 : 500;

    return NextResponse.json(
      { 
        error: errorMessage,
        products: [],
        hasMore: false,
        page: 0,
        total: 0
      },
      { status: statusCode }
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