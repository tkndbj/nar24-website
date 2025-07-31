import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { Product, ProductUtils } from "@/app/models/Product";
import {
  collection,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";

// Cache interface
interface CacheEntry {
  products: Product[];
  timestamp: number;
  userId?: string;
  category?: string;
}

// In-memory cache (in production, use Redis or similar)
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Firebase database operations
class ProductDatabase {
  static async getTopRankedShopProducts(limit: number): Promise<Product[]> {
    try {
      console.log("Fetching top-ranked shop products from Firebase");

      // Query shop_products by ranking score, filtering out of stock items
      const q = query(
        collection(db, "shop_products"),
        where("quantity", ">", 0),
        orderBy("quantity"),
        orderBy("rankingScore", "desc"),
        firestoreLimit(limit * 2) // Fetch extra in case some fail validation
      );

      const snapshot = await getDocs(q);
      const products: Product[] = [];

      for (const docSnap of snapshot.docs) {
        try {
          const product = ProductUtils.fromJson({
            id: docSnap.id,
            ...docSnap.data(),
          });

          // Basic validation
          if (this.validateProduct(product)) {
            products.push(product);
            if (products.length >= limit) break;
          }
        } catch (e) {
          console.error(`Error parsing product ${docSnap.id}:`, e);
          continue;
        }
      }

      // If we don't have enough products, try a simpler query
      if (products.length < limit) {
        console.log("Not enough ranked products, fetching by creation date");
        const additionalQ = query(
          collection(db, "shop_products"),
          where("quantity", ">", 0),
          orderBy("quantity"),
          orderBy("createdAt", "desc"),
          firestoreLimit(limit - products.length)
        );

        const additionalSnapshot = await getDocs(additionalQ);

        for (const docSnap of additionalSnapshot.docs) {
          try {
            const product = ProductUtils.fromJson({
              id: docSnap.id,
              ...docSnap.data(),
            });

            if (
              !products.some((p) => p.id === product.id) &&
              this.validateProduct(product)
            ) {
              products.push(product);
            }
          } catch (e) {
            console.error(`Error parsing additional product ${docSnap.id}:`, e);
          }
        }
      }

      console.log(`Fetched ${products.length} top-ranked products`);
      return products;
    } catch (error) {
      console.error("Error fetching top-ranked shop products:", error);
      return [];
    }
  }

  static async getRecommendationsForUser(
    userId: string,
    category?: string,
    limit: number = 20
  ): Promise<Product[]> {
    try {
      console.log(`Fetching recommendations for user: ${userId}`);

      // For authenticated users, you might want to implement more sophisticated logic
      // For now, we'll use a combination of user activity and top products

      // Get user activity score (you might want to implement this based on your user activity tracking)
      const activityScore = await this.getUserActivityScore(userId);

      let products: Product[] = [];

      // Build filter based on category
      let filterQuery = query(
        collection(db, "shop_products"),
        where("quantity", ">", 0)
      );

      if (category && !category.includes(" > ")) {
        // Add category filter if specified
        filterQuery = query(filterQuery, where("category", "==", category));
      }

      // Order by ranking score and limit results
      const q = query(
        filterQuery,
        orderBy("quantity"),
        orderBy("rankingScore", "desc"),
        firestoreLimit(limit * 2)
      );

      const snapshot = await getDocs(q);

      for (const docSnap of snapshot.docs) {
        try {
          const product = ProductUtils.fromJson({
            id: docSnap.id,
            ...docSnap.data(),
          });

          if (this.validateProduct(product)) {
            products.push(product);
            if (products.length >= limit) break;
          }
        } catch (e) {
          console.error(`Error parsing recommended product ${docSnap.id}:`, e);
          continue;
        }
      }

      // If we don't have enough products or user has low activity, blend with fallback
      if (products.length < limit || activityScore < 20) {
        console.log("Blending with fallback products");
        const fallbackProducts = await this.getFallbackShopProducts(limit);

        if (products.length === 0) {
          products = fallbackProducts;
        } else {
          // Blend recommendations with fallback
          const blended: Product[] = [];
          const seen = new Set<string>();
          let ri = 0,
            fi = 0;

          while (
            blended.length < limit &&
            (ri < products.length || fi < fallbackProducts.length)
          ) {
            const takeRec =
              ri < products.length && (activityScore >= 20 || fi % 2 === 0);

            if (takeRec) {
              const product = products[ri++];
              if (seen.has(product.id)) continue;
              seen.add(product.id);
              blended.push(product);
            } else if (fi < fallbackProducts.length) {
              const product = fallbackProducts[fi++];
              if (seen.has(product.id)) continue;
              seen.add(product.id);
              blended.push(product);
            }
          }

          products = blended;
        }
      }

      return products.slice(0, limit);
    } catch (error) {
      console.error("Error fetching user recommendations:", error);
      // Fallback to top-ranked products
      return await this.getFallbackShopProducts(limit);
    }
  }

  static async getFallbackShopProducts(limit: number): Promise<Product[]> {
    try {
      const q = query(
        collection(db, "shop_products"),
        where("quantity", ">", 0),
        orderBy("quantity", "desc"),
        orderBy("createdAt", "desc"),
        firestoreLimit(limit)
      );

      const snapshot = await getDocs(q);
      const products: Product[] = [];

      for (const docSnap of snapshot.docs) {
        try {
          const product = ProductUtils.fromJson({
            id: docSnap.id,
            ...docSnap.data(),
          });

          if (this.validateProduct(product)) {
            products.push(product);
          }
        } catch (e) {
          console.error(`Error parsing fallback product ${docSnap.id}:`, e);
          continue;
        }
      }

      return products;
    } catch (error) {
      console.error("Error fetching fallback shop products:", error);
      return [];
    }
  }

  static async getUserActivityScore(userId: string): Promise<number> {
    try {
      // Check if user has activity data
      // You might want to implement this based on your user activity collection
      const userDoc = await getDoc(doc(db, "users", userId));

      if (!userDoc.exists()) {
        return 0; // New user
      }

      const userData = userDoc.data();
      // Calculate activity score based on user's purchase history, clicks, etc.
      // This is a simplified version - you can enhance based on your needs
      const purchases = (userData?.purchaseCount as number) || 0;
      const clicks = (userData?.clickCount as number) || 0;
      const views = (userData?.viewCount as number) || 0;

      return Math.min(100, purchases * 10 + clicks * 2 + views);
    } catch (error) {
      console.error("Error calculating user activity score:", error);
      return 0;
    }
  }

  static validateProduct(product: Product): boolean {
    return (
      product.productName.trim().length > 0 &&
      product.price > 0 &&
      Array.isArray(product.imageUrls) &&
      product.imageUrls.length > 0 &&
      product.quantity > 0
    );
  }
}

function generateCacheKey(userId?: string, category?: string): string {
  const userPart = userId || "anonymous";
  const categoryPart = category || "all";
  return `recommendations:${userPart}:${categoryPart}`;
}

function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const category = searchParams.get("category");
    const maxProducts = parseInt(searchParams.get("maxProducts") || "20");
    const pageSize = parseInt(
      searchParams.get("pageSize") || maxProducts.toString()
    );
    const pageToken = searchParams.get("pageToken");

    console.log("Fetching recommendations:", {
      userId,
      category,
      maxProducts,
      pageSize,
      pageToken,
    });

    // Generate cache key
    const cacheKey = generateCacheKey(
      userId || undefined,
      category || undefined
    );

    // Check cache for initial fetch (no pageToken)
    if (!pageToken) {
      const cachedEntry = cache.get(cacheKey);
      if (cachedEntry && isCacheValid(cachedEntry)) {
        console.log("Returning cached recommendations");
        return NextResponse.json({
          products: cachedEntry.products.slice(0, pageSize),
          cached: true,
          timestamp: cachedEntry.timestamp,
        });
      }
    }

    let products: Product[] = [];

    if (!userId) {
      // Unauthenticated user - fetch top-ranked shop products
      console.log("Fetching top-ranked products for unauthenticated user");
      products = await ProductDatabase.getTopRankedShopProducts(pageSize);
    } else {
      // Authenticated user - get personalized recommendations
      console.log("Fetching personalized recommendations for user:", userId);
      try {
        products = await ProductDatabase.getRecommendationsForUser(
          userId,
          category || undefined,
          pageSize
        );
      } catch (error) {
        console.error("Error fetching personalized recommendations:", error);
        // Fallback to top-ranked products
        products = await ProductDatabase.getTopRankedShopProducts(pageSize);
      }
    }

    // Cache the results for initial fetch
    if (!pageToken) {
      cache.set(cacheKey, {
        products: products,
        timestamp: Date.now(),
        userId: userId || undefined,
        category: category || undefined,
      });

      console.log(
        `Cached ${products.length} recommendations for ${
          userId ? "user " + userId : "anonymous user"
        }`
      );
    }

    // Simulate pagination token (in real implementation, this would be more sophisticated)
    const nextPageToken =
      products.length >= pageSize
        ? Buffer.from(`${Date.now()}-${Math.random()}`).toString("base64")
        : null;

    return NextResponse.json({
      products: products,
      nextPageToken,
      cached: false,
      total: products.length,
    });
  } catch (error) {
    console.error("Error in recommendations API:", error);

    // Return fallback response
    try {
      const fallbackProducts = await ProductDatabase.getTopRankedShopProducts(
        20
      );
      return NextResponse.json({
        products: fallbackProducts,
        error: "Partial failure - showing fallback products",
        fallback: true,
      });
    } catch (fallbackError) {
      console.error("Fallback also failed:", fallbackError);
      return NextResponse.json(
        {
          error: "Failed to fetch recommendations",
          products: [],
        },
        { status: 500 }
      );
    }
  }
}

// Optional: Add POST method for more complex recommendation requests
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, category, filters, maxProducts = 20, preferences } = body;

    console.log("POST recommendations request:", {
      userId,
      category,
      filters,
      preferences,
    });

    let products: Product[];

    if (userId) {
      products = await ProductDatabase.getRecommendationsForUser(
        userId,
        category,
        maxProducts
      );
    } else {
      products = await ProductDatabase.getTopRankedShopProducts(maxProducts);
    }

    // Apply any additional filters from the request body
    if (filters) {
      // Implement filtering logic based on the filters object
      // e.g., price range, brand, condition, etc.
    }

    return NextResponse.json({
      products,
      requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in POST recommendations:", error);
    return NextResponse.json(
      { error: "Failed to process recommendation request" },
      { status: 500 }
    );
  }
}
