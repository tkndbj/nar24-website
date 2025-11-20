// src/app/api/relatedproducts/[productId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { Product, ProductUtils } from "@/app/models/Product";

// ✅ TWO-TIER CACHE: Memory + TTL (matching Flutter)
const memoryCache = new Map<
  string,
  {
    products: Product[];
    timestamp: number;
  }
>();

const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours
const MAX_CACHE_SIZE = 30;

function getCachedRelated(productId: string): Product[] | null {
  const cached = memoryCache.get(productId);
  if (!cached) return null;

  const now = Date.now();
  if (now - cached.timestamp > CACHE_TTL) {
    memoryCache.delete(productId);
    return null;
  }

  return cached.products;
}

function cacheRelatedProducts(productId: string, products: Product[]) {
  memoryCache.set(productId, {
    products,
    timestamp: Date.now(),
  });

  // LRU eviction
  if (memoryCache.size > MAX_CACHE_SIZE) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) {
      memoryCache.delete(firstKey);
    }
  }
}

/**
 * Converts Firestore document to Product object using ProductUtils.fromJson
 */
function documentToProduct(
  doc: FirebaseFirestore.DocumentSnapshot
): Product | null {
  const data = doc.data();
  if (!data) return null;

  try {
    // Add document ID and reference information
    const jsonData = {
      ...data,
      id: doc.id,
      reference: {
        id: doc.id,
        path: doc.ref.path,
        parent: {
          id: doc.ref.parent.id,
        },
      },
    };

    return ProductUtils.fromJson(jsonData);
  } catch (error) {
    console.error(`Error parsing product ${doc.id}:`, error);
    return null;
  }
}

/**
 * Batch fetch products by IDs (matching Flutter's _batchFetchProducts)
 * Fetches in chunks of 10 to respect Firestore limits
 */
async function batchFetchProducts(
  db: FirebaseFirestore.Firestore,
  ids: string[]
): Promise<Product[]> {
  if (ids.length === 0) return [];

  const products: Product[] = [];
  const chunkSize = 10; // Firestore getAll limit

  // Split IDs into chunks
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);

    try {
      // Fetch all documents in parallel for this chunk
      const docPromises = chunk.map(async (id) => {
        try {
          // Try shop_products first, then products (matching Flutter logic)
          const shopDoc = await db.collection("shop_products").doc(id).get();
          if (shopDoc.exists) {
            return shopDoc;
          }

          const productDoc = await db.collection("products").doc(id).get();
          return productDoc.exists ? productDoc : null;
        } catch (error) {
          console.error(`Error fetching product ${id}:`, error);
          return null;
        }
      });

      const docs = await Promise.all(docPromises);

      // Parse documents that exist
      for (const doc of docs) {
        if (doc && doc.exists) {
          const product = documentToProduct(doc);
          if (product) {
            products.push(product);
          }
        }
      }
    } catch (error) {
      console.error("Error in batch fetch:", error);
    }
  }

  return products;
}

/**
 * Fallback strategy: Simple category match
 * Matches Flutter's _fallbackStrategy method
 */
async function fallbackStrategy(
  db: FirebaseFirestore.Firestore,
  productId: string,
  category: string,
  subcategory: string,
  gender: string | undefined
): Promise<Product[]> {
  console.log("⚠️ Using fallback strategy for product", productId);

  try {
    let query: FirebaseFirestore.Query = db
      .collection("shop_products")
      .where("category", "==", category)
      .where("subcategory", "==", subcategory);

    // Try with gender first if available
    if (gender) {
      query = query.where("gender", "==", gender);
    }

    const snapshot = await query
      .orderBy("promotionScore", "desc")
      .limit(10)
      .get();

    const products = snapshot.docs
      .filter((doc) => doc.id !== productId)
      .map((doc) => documentToProduct(doc))
      .filter((product): product is Product => product !== null);

    if (products.length > 0) return products;

    // Fallback without gender
    const snapshot2 = await db
      .collection("shop_products")
      .where("category", "==", category)
      .where("subcategory", "==", subcategory)
      .orderBy("promotionScore", "desc")
      .limit(10)
      .get();

    return snapshot2.docs
      .filter((doc) => doc.id !== productId)
      .map((doc) => documentToProduct(doc))
      .filter((product): product is Product => product !== null);
  } catch (error) {
    console.error("Fallback strategy failed:", error);
    return [];
  }
}

interface RelatedProductsResponse {
  products: Product[];
  source: "precomputed" | "fallback" | "cache";
  count: number;
}

interface RelatedProductsErrorResponse {
  error: string;
  products: Product[];
  details?: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
): Promise<
  NextResponse<RelatedProductsResponse | RelatedProductsErrorResponse>
> {
  try {
    const { productId } = await params;

    if (!productId || productId.trim() === "") {
      return NextResponse.json(
        {
          error: "Product ID is required",
          products: [],
        },
        { status: 400 }
      );
    }

    // ✅ 1️⃣ CHECK MEMORY CACHE FIRST
    const cached = getCachedRelated(productId);
    if (cached) {
      console.log(`✅ Cache hit for ${productId}`);
      return NextResponse.json({
        products: cached,
        source: "cache",
        count: cached.length,
      });
    }

    const db = getFirestoreAdmin();

    // ✅ 2️⃣ Fetch the main product document to get relatedProductIds
    // Try both collections (matching Flutter's logic)
    const [shopDoc, productDoc] = await Promise.all([
      db.collection("shop_products").doc(productId).get(),
      db.collection("products").doc(productId).get(),
    ]);

    const doc = shopDoc.exists
      ? shopDoc
      : productDoc.exists
      ? productDoc
      : null;

    if (!doc || !doc.exists) {
      return NextResponse.json(
        {
          error: "Product not found",
          products: [],
        },
        { status: 404 }
      );
    }

    const data = doc.data();
    if (!data) {
      return NextResponse.json(
        {
          error: "Product data is empty",
          products: [],
        },
        { status: 404 }
      );
    }

    // ✅ 3️⃣ Read pre-computed relatedProductIds (matching Flutter's approach)
    const relatedIds = ProductUtils.safeStringArray(data.relatedProductIds);

    console.log(
      `Found ${relatedIds.length} pre-computed related product IDs for ${productId}`
    );

    let relatedProducts: Product[] = [];

    if (relatedIds.length > 0) {
      // ✅ 4️⃣ Batch fetch related products
      relatedProducts = await batchFetchProducts(db, relatedIds);
      console.log(
        `Successfully fetched ${relatedProducts.length} related products`
      );
    }

    // ✅ 5️⃣ Fallback if no related products found
    if (relatedProducts.length === 0) {
      console.log("No pre-computed related products, using fallback strategy");

      relatedProducts = await fallbackStrategy(
        db,
        productId,
        ProductUtils.safeString(data.category, "Uncategorized"),
        ProductUtils.safeString(data.subcategory),
        ProductUtils.safeStringNullable(data.gender)
      );
    }

    // ✅ 6️⃣ CACHE BEFORE RETURNING
    if (relatedProducts.length > 0) {
      cacheRelatedProducts(productId, relatedProducts);
    }

    // Return products (even if empty array)
    return NextResponse.json({
      products: relatedProducts,
      source: relatedIds.length > 0 ? "precomputed" : "fallback",
      count: relatedProducts.length,
    });
  } catch (error) {
    console.error("Error fetching related products:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        products: [],
        details:
          process.env.NODE_ENV === "development" ? String(error) : undefined,
      },
      { status: 500 }
    );
  }
}
