import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { Product, ProductUtils } from "@/app/models/Product";

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

function documentToProduct(
  doc: FirebaseFirestore.DocumentSnapshot
): Product | null {
  const data = doc.data();
  if (!data) return null;

  try {
    return ProductUtils.fromJson({
      ...data,
      id: doc.id,
      reference: {
        id: doc.id,
        path: doc.ref.path,
        parent: { id: doc.ref.parent.id },
      },
    });
  } catch (error) {
    console.error(`Error parsing product ${doc.id}:`, error);
    return null;
  }
}

// Firebase database operations
class ProductDatabase {
  static async getTopRankedShopProducts(limit: number): Promise<Product[]> {
    try {
      const db = getFirestoreAdmin();

      // Query shop_products by ranking score, filtering out of stock items
      const snapshot = await db
        .collection("shop_products")
        .where("quantity", ">", 0)
        .orderBy("quantity")
        .orderBy("rankingScore", "desc")
        .limit(limit * 2) // Fetch extra in case some fail validation
        .get();

      const products: Product[] = [];

      for (const doc of snapshot.docs) {
        const product = documentToProduct(doc);
        if (product && this.validateProduct(product)) {
          products.push(product);
          if (products.length >= limit) break;
        }
      }

      // If we don't have enough products, try a simpler query
      if (products.length < limit) {
        const additionalSnapshot = await db
          .collection("shop_products")
          .where("quantity", ">", 0)
          .orderBy("quantity")
          .orderBy("createdAt", "desc")
          .limit(limit - products.length)
          .get();

        for (const doc of additionalSnapshot.docs) {
          const product = documentToProduct(doc);
          if (
            product &&
            !products.some((p) => p.id === product.id) &&
            this.validateProduct(product)
          ) {
            products.push(product);
          }
        }
      }

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
      const db = getFirestoreAdmin();

      // Fetch activity score and products in parallel
      const productsQuery = (() => {
        let ref: FirebaseFirestore.Query = db
          .collection("shop_products")
          .where("quantity", ">", 0);

        if (category && !category.includes(" > ")) {
          ref = ref.where("category", "==", category);
        }

        return ref
          .orderBy("quantity")
          .orderBy("rankingScore", "desc")
          .limit(limit * 2)
          .get();
      })();

      const [activityScore, snapshot] = await Promise.all([
        this.getUserActivityScore(userId),
        productsQuery,
      ]);

      const products: Product[] = [];

      for (const doc of snapshot.docs) {
        const product = documentToProduct(doc);
        if (product && this.validateProduct(product)) {
          products.push(product);
          if (products.length >= limit) break;
        }
      }

      // If we don't have enough products or user has low activity, blend with fallback
      if (products.length < limit || activityScore < 20) {
        const fallbackProducts = await this.getFallbackShopProducts(limit);

        if (products.length === 0) {
          return fallbackProducts.slice(0, limit);
        }

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

        return blended.slice(0, limit);
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
      const db = getFirestoreAdmin();

      const snapshot = await db
        .collection("shop_products")
        .where("quantity", ">", 0)
        .orderBy("quantity", "desc")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      const products: Product[] = [];

      for (const doc of snapshot.docs) {
        const product = documentToProduct(doc);
        if (product && this.validateProduct(product)) {
          products.push(product);
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
      const db = getFirestoreAdmin();
      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) {
        return 0; // New user
      }

      const userData = userDoc.data();
      if (!userData) return 0;

      const purchases = (userData.purchaseCount as number) || 0;
      const clicks = (userData.clickCount as number) || 0;
      const views = (userData.viewCount as number) || 0;

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

const RESPONSE_HEADERS = {
  "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
};

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

    // Generate cache key
    const cacheKey = generateCacheKey(
      userId || undefined,
      category || undefined
    );

    // Check cache for initial fetch (no pageToken)
    if (!pageToken) {
      const cachedEntry = cache.get(cacheKey);
      if (cachedEntry && isCacheValid(cachedEntry)) {
        return NextResponse.json(
          {
            products: cachedEntry.products.slice(0, pageSize),
            cached: true,
            timestamp: cachedEntry.timestamp,
          },
          { headers: RESPONSE_HEADERS }
        );
      }
    }

    let products: Product[] = [];

    if (!userId) {
      // Unauthenticated user - fetch top-ranked shop products
      products = await ProductDatabase.getTopRankedShopProducts(pageSize);
    } else {
      // Authenticated user - get personalized recommendations
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
    }

    // Simulate pagination token (in real implementation, this would be more sophisticated)
    const nextPageToken =
      products.length >= pageSize
        ? Buffer.from(`${Date.now()}-${Math.random()}`).toString("base64")
        : null;

    return NextResponse.json(
      {
        products: products,
        nextPageToken,
        cached: false,
        total: products.length,
      },
      { headers: RESPONSE_HEADERS }
    );
  } catch (error) {
    console.error("Error in recommendations API:", error);

    // Return fallback response
    try {
      const fallbackProducts = await ProductDatabase.getTopRankedShopProducts(
        20
      );
      return NextResponse.json(
        {
          products: fallbackProducts,
          error: "Partial failure - showing fallback products",
          fallback: true,
        },
        { headers: RESPONSE_HEADERS }
      );
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
    const { userId, category, filters, maxProducts = 20 } = body;

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

    return NextResponse.json(
      {
        products,
        requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        processedAt: new Date().toISOString(),
      },
      { headers: RESPONSE_HEADERS }
    );
  } catch (error) {
    console.error("Error in POST recommendations:", error);
    return NextResponse.json(
      { error: "Failed to process recommendation request" },
      { status: 500 }
    );
  }
}
