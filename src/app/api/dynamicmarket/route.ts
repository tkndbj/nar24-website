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

    // Handle Women/Men categories using gender field
    if (category === "women" || category === "men") {
      const genderValue = category.charAt(0).toUpperCase() + category.slice(1);
      const gendersToFetch = [genderValue, "Unisex"];

      for (const gender of gendersToFetch) {
        try {
          let genderQuery: FirebaseFirestore.Query = db
            .collection("shop_products")
            .where("gender", "==", gender)
            .where("quantity", ">", 0);

          // Add subcategory filter if provided in URL
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

          // Add subsubcategory filter if provided in URL
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

          // Apply price filters at database level (most efficient)
          if (minPrice !== undefined) {
            genderQuery = genderQuery.where("price", ">=", minPrice);
          }

          if (maxPrice !== undefined) {
            genderQuery = genderQuery.where("price", "<=", maxPrice);
          }

          // Only apply simple filters at database level to avoid complex compound queries
          // We'll handle colors, brands, and filterSubcategories client-side for better reliability

          // Order by ranking score for better results
          genderQuery = genderQuery
            .orderBy("quantity") // Required for the where clause
            .orderBy("isBoosted", "desc")
            .orderBy("rankingScore", "desc")
            .limit(200); // Fetch more to account for client-side filtering

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

        // Add subcategory filter if provided in URL
        if (subcategory) {
          const subcategoryValue = subcategory
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
          query = query.where("subcategory", "==", subcategoryValue);
        }

        // Add subsubcategory filter if provided in URL
        if (subsubcategory) {
          const subsubcategoryValue = subsubcategory
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
          query = query.where("subsubcategory", "==", subsubcategoryValue);
        }

        // Apply price filters at database level
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
          .limit(200); // Fetch more for filtering

        const snapshot = await query.get();
        allProducts = snapshot.docs.map((doc: QueryDocumentSnapshot) =>
          documentToProduct(doc)
        );
      } catch (error) {
        console.log(`Error fetching products for category ${category}:`, error);
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
      // First priority: boosted products
      if (a.isBoosted && !b.isBoosted) return -1;
      if (!a.isBoosted && b.isBoosted) return 1;

      // Second priority: ranking score
      const aScore = a.rankingScore ?? 0;
      const bScore = b.rankingScore ?? 0;
      return bScore - aScore;
    });

    // Apply pagination
    const startIndex = page * limit;
    const paginatedProducts = allProducts.slice(startIndex, startIndex + limit);
    const hasMore = allProducts.length > startIndex + limit;

    const response = {
      products: paginatedProducts,
      hasMore,
      page,
      total: allProducts.length, // Changed to show total filtered products
    };

    console.log(
      `✅ Total filtered ${allProducts.length} products, returning ${paginatedProducts.length} for page ${page}`
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

// Improved client-side filtering function
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
  console.log("🔧 Applying client-side filters:", filters);
  console.log("🔧 Before filtering:", products.length, "products");

  const filteredProducts = products.filter((product) => {
    // Filter by subcategories
    if (filters.filterSubcategories.length > 0) {
      if (!product.subcategory) {
        console.log(`❌ Product ${product.id} has no subcategory`);
        return false;
      }
      
      // Check if product subcategory matches any of the filter subcategories
      const productSubcategory = product.subcategory.toLowerCase();
      const matchesSubcategory = filters.filterSubcategories.some(filterSub => {
        const normalizedFilterSub = filterSub.toLowerCase();
        return productSubcategory === normalizedFilterSub || 
               productSubcategory.includes(normalizedFilterSub) ||
               normalizedFilterSub.includes(productSubcategory);
      });
      
      if (!matchesSubcategory) {
        console.log(`❌ Product ${product.id} subcategory "${product.subcategory}" doesn't match filters:`, filters.filterSubcategories);
        return false;
      }
    }

    // Filter by colors - check if product has any of the selected colors
    if (filters.colors.length > 0) {
      if (!product.availableColors || product.availableColors.length === 0) {
        console.log(`❌ Product ${product.id} has no available colors`);
        return false;
      }
      
      const hasMatchingColor = filters.colors.some(filterColor => {
        const normalizedFilterColor = filterColor.toLowerCase();
        return product.availableColors!.some(productColor => 
          productColor.toLowerCase() === normalizedFilterColor ||
          productColor.toLowerCase().includes(normalizedFilterColor) ||
          normalizedFilterColor.includes(productColor.toLowerCase())
        );
      });
      
      if (!hasMatchingColor) {
        console.log(`❌ Product ${product.id} colors ${product.availableColors} don't match filters:`, filters.colors);
        return false;
      }
    }

    // Filter by brands - exact match on brandModel
    if (filters.brands.length > 0) {
      if (!product.brandModel) {
        console.log(`❌ Product ${product.id} has no brand`);
        return false;
      }
      
      const matchesBrand = filters.brands.some(filterBrand => {
        return product.brandModel!.toLowerCase() === filterBrand.toLowerCase() ||
               product.brandModel!.toLowerCase().includes(filterBrand.toLowerCase()) ||
               filterBrand.toLowerCase().includes(product.brandModel!.toLowerCase());
      });
      
      if (!matchesBrand) {
        console.log(`❌ Product ${product.id} brand "${product.brandModel}" doesn't match filters:`, filters.brands);
        return false;
      }
    }

    // Filter by price range (double-check since we also filter at DB level)
    if (filters.minPrice !== undefined && product.price < filters.minPrice) {
      console.log(`❌ Product ${product.id} price ${product.price} below min ${filters.minPrice}`);
      return false;
    }

    if (filters.maxPrice !== undefined && product.price > filters.maxPrice) {
      console.log(`❌ Product ${product.id} price ${product.price} above max ${filters.maxPrice}`);
      return false;
    }

    return true;
  });

  console.log("🔧 After filtering:", filteredProducts.length, "products");
  
  // Log some examples of what passed the filters
  if (filteredProducts.length > 0) {
    console.log("✅ Sample filtered products:", filteredProducts.slice(0, 3).map(p => ({
      id: p.id,
      name: p.productName,
      subcategory: p.subcategory,
      brand: p.brandModel,
      colors: p.availableColors,
      price: p.price
    })));
  }

  return filteredProducts;
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