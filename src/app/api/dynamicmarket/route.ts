import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";

// Product interface matching your React component
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

// Convert Firestore document to Product
function documentToProduct(doc: QueryDocumentSnapshot): Product {
  const data = doc.data();
  return {
    id: doc.id,
    productName: data.productName || "",
    price: data.price || 0,
    originalPrice: data.originalPrice,
    discountPercentage: data.discountPercentage,
    currency: data.currency || "TL",
    imageUrls: data.imageUrls || [],
    colorImages: data.colorImages || {},
    description: data.description || "",
    brandModel: data.brandModel,
    condition: data.condition || "New",
    quantity: data.quantity,
    averageRating: data.averageRating || 0,
    isBoosted: data.isBoosted || false,
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const category = searchParams.get("category");
    const subcategory = searchParams.get("subcategory");
    const subsubcategory = searchParams.get("subsubcategory");
    const page = parseInt(searchParams.get("page") || "0");
    const limit = parseInt(searchParams.get("limit") || "20");

    // Filter parameters
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

    console.log("🔍 API Query Parameters:", {
      category,
      subcategory,
      subsubcategory,
      filterSubcategories,
      colors,
      brands,
      minPrice,
      maxPrice,
      page,
      limit,
    });

    if (!category) {
      return NextResponse.json(
        { error: "Category parameter is required" },
        { status: 400 }
      );
    }

    // Initialize Firestore
    const db = getFirestoreAdmin();
    let allProducts: Product[] = [];

    // Handle Women/Men categories using gender field (fetch both gender and Unisex)
    if (category === "women" || category === "men") {
      const genderValue = category.charAt(0).toUpperCase() + category.slice(1);
      const gendersToFetch = [genderValue, "Unisex"];

      for (const gender of gendersToFetch) {
        try {
          let genderQuery: FirebaseFirestore.Query = db
            .collection("shop_products")
            .where("gender", "==", gender)
            .where("quantity", ">", 0);

          // Add subcategory filter if provided
          if (subcategory) {
            const subcategoryValue = subcategory
              .split("-")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ");
            genderQuery = genderQuery.where(
              "subcategory",
              "==",
              subcategoryValue
            );
          }

          // Add subsubcategory filter if provided
          if (subsubcategory) {
            const subsubcategoryValue = subsubcategory
              .split("-")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ");
            genderQuery = genderQuery.where(
              "subsubcategory",
              "==",
              subsubcategoryValue
            );
          }

          // Apply additional filters
          if (filterSubcategories.length > 0) {
            // Convert filter subcategories to proper format
            const formattedSubcategories = filterSubcategories.map((sub) =>
              sub
                .split(" ")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" ")
            );
            if (formattedSubcategories.length <= 10) {
              genderQuery = genderQuery.where(
                "subcategory",
                "in",
                formattedSubcategories
              );
            }
          }

          if (brands.length > 0 && brands.length <= 10) {
            genderQuery = genderQuery.where("brandModel", "in", brands);
          }

          if (colors.length > 0 && colors.length <= 10) {
            genderQuery = genderQuery.where(
              "availableColors",
              "array-contains-any",
              colors
            );
          }

          if (minPrice !== undefined) {
            genderQuery = genderQuery.where("price", ">=", minPrice);
          }

          if (maxPrice !== undefined) {
            genderQuery = genderQuery.where("price", "<=", maxPrice);
          }

          // Order by ranking score for better results
          genderQuery = genderQuery
            .orderBy("quantity") // Required for the where clause
            .orderBy("isBoosted", "desc")
            .orderBy("rankingScore", "desc")
            .limit(50); // Fetch more to account for filtering

          const snapshot = await genderQuery.get();
          const products = snapshot.docs.map((doc: QueryDocumentSnapshot) =>
            documentToProduct(doc)
          );
          allProducts.push(...products);

          console.log(
            `Fetched ${products.length} products for gender: ${gender}`
          );
        } catch (error) {
          console.log(`Error fetching products for gender ${gender}:`, error);
        }
      }

      // Remove duplicates (in case a product appears in both queries somehow)
      const seenIds = new Set<string>();
      allProducts = allProducts.filter((product) => {
        if (seenIds.has(product.id)) {
          return false;
        }
        seenIds.add(product.id);
        return true;
      });

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
        // First priority: boosted products
        if (a.isBoosted && !b.isBoosted) return -1;
        if (!a.isBoosted && b.isBoosted) return 1;

        // Second priority: ranking score
        const aScore = a.rankingScore ?? 0;
        const bScore = b.rankingScore ?? 0;
        return bScore - aScore;
      });
    } else {
      // For other categories, filter by category field directly
      try {
        const categoryValue = category
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");

        let query: FirebaseFirestore.Query = db
          .collection("shop_products")
          .where("category", "==", categoryValue)
          .where("quantity", ">", 0);

        // Add subcategory filter if provided
        if (subcategory) {
          const subcategoryValue = subcategory
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
          query = query.where("subcategory", "==", subcategoryValue);
        }

        // Add subsubcategory filter if provided
        if (subsubcategory) {
          const subsubcategoryValue = subsubcategory
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
          query = query.where("subsubcategory", "==", subsubcategoryValue);
        }

        // Apply additional filters
        if (filterSubcategories.length > 0) {
          const formattedSubcategories = filterSubcategories.map((sub) =>
            sub
              .split(" ")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")
          );
          if (formattedSubcategories.length <= 10) {
            query = query.where("subcategory", "in", formattedSubcategories);
          }
        }

        if (brands.length > 0 && brands.length <= 10) {
          query = query.where("brandModel", "in", brands);
        }

        if (colors.length > 0 && colors.length <= 10) {
          query = query.where("availableColors", "array-contains-any", colors);
        }

        if (minPrice !== undefined) {
          query = query.where("price", ">=", minPrice);
        }

        if (maxPrice !== undefined) {
          query = query.where("price", "<=", maxPrice);
        }

        // Order by ranking score for better results
        query = query
          .orderBy("quantity") // Required for the where clause
          .orderBy("isBoosted", "desc")
          .orderBy("rankingScore", "desc")
          .limit(100); // Fetch more for filtering

        const snapshot = await query.get();
        allProducts = snapshot.docs.map((doc: QueryDocumentSnapshot) =>
          documentToProduct(doc)
        );

        // Apply client-side filtering for complex filters
        allProducts = applyClientSideFilters(allProducts, {
          filterSubcategories,
          colors,
          brands,
          minPrice,
          maxPrice,
        });
      } catch (error) {
        console.log(`Error fetching products for category ${category}:`, error);
        allProducts = [];
      }
    }

    // Apply pagination
    const startIndex = page * limit;
    const paginatedProducts = allProducts.slice(startIndex, startIndex + limit);
    const hasMore = allProducts.length > startIndex + limit;

    const response = {
      products: paginatedProducts,
      hasMore,
      page,
      total: paginatedProducts.length,
    };

    console.log(
      `✅ Total fetched ${allProducts.length} products, returning ${paginatedProducts.length} for page ${page}`
    );

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error fetching products:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Client-side filtering for complex filters that can't be done in Firestore
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
  return products.filter((product) => {
    // Filter by subcategories
    if (filters.filterSubcategories.length > 0) {
      const formattedSubcategories = filters.filterSubcategories.map((sub) =>
        sub
          .split(" ")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ")
      );
      if (
        product.subcategory &&
        !formattedSubcategories.includes(product.subcategory)
      ) {
        return false;
      }
    }

    // Filter by colors (if available in product)
    if (filters.colors.length > 0) {
      if (!product.availableColors || product.availableColors.length === 0) {
        return false;
      }
      const hasMatchingColor = filters.colors.some((color) =>
        product.availableColors!.includes(color)
      );
      if (!hasMatchingColor) {
        return false;
      }
    }

    // Filter by brands
    if (filters.brands.length > 0) {
      if (!product.brandModel || !filters.brands.includes(product.brandModel)) {
        return false;
      }
    }

    // Filter by price range
    if (filters.minPrice !== undefined && product.price < filters.minPrice) {
      return false;
    }

    if (filters.maxPrice !== undefined && product.price > filters.maxPrice) {
      return false;
    }

    return true;
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
