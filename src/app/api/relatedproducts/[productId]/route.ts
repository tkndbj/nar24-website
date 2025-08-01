// src/app/api/relatedproducts/[productId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, DocumentSnapshot } from "firebase-admin/firestore";

// Product interface
interface Product {
  id: string;
  productName: string;
  price: number;
  originalPrice: number | null;
  discountPercentage: number | null;
  currency: string;
  imageUrls: string[];
  colorImages: Record<string, unknown>;
  description: string;
  brandModel: string | null;
  condition: string;
  quantity: number | null;
  averageRating: number;
  isBoosted: boolean;
  deliveryOption: string | null;
  campaignName: string | null;
  category: string;
  subcategory: string;
  clickCount: number;
  userId: string;
  shopId: string | null;
}

// Cache interface
interface CacheData {
  data: Product[];
  timestamp: number;
}

// Initialize Firebase Admin SDK
function initializeFirebase() {
  if (getApps().length === 0) {
    try {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(
        /\\n/g,
        "\n"
      );

      if (!projectId || !clientEmail || !privateKey) {
        throw new Error("Missing Firebase environment variables");
      }

      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } catch (error) {
      console.error("Failed to initialize Firebase Admin SDK:", error);
      throw error;
    }
  }
  return getFirestore();
}

// In-memory cache
const cache = new Map<string, CacheData>();
const CACHE_EXPIRY = 15 * 60 * 1000; // 15 minutes
const MAX_RELATED_PRODUCTS = 15;

function isValidCache(key: string): boolean {
  const cached = cache.get(key);
  if (!cached) return false;
  return Date.now() - cached.timestamp < CACHE_EXPIRY;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function mergeUnique(existing: Product[], newProducts: Product[]): Product[] {
  const existingIds = new Set(existing.map((p) => p.id));
  return [...existing, ...newProducts.filter((p) => !existingIds.has(p.id))];
}

function limitAndRandomize(products: Product[], excludeId: string): Product[] {
  const filtered = products.filter((p) => p.id !== excludeId);
  if (filtered.length <= MAX_RELATED_PRODUCTS) return filtered;

  const half = Math.floor(MAX_RELATED_PRODUCTS / 2);
  const topProducts = filtered.slice(0, half);
  const remaining = shuffleArray(filtered.slice(half));
  return [...topProducts, ...remaining.slice(0, MAX_RELATED_PRODUCTS - half)];
}

function convertDocToProduct(doc: DocumentSnapshot): Product {
  const data = doc.data();
  if (!data) {
    throw new Error(`Document ${doc.id} has no data`);
  }

  return {
    id: doc.id,
    productName: data.productName || "",
    price: data.price || 0,
    originalPrice: data.originalPrice || null,
    discountPercentage: data.discountPercentage || null,
    currency: data.currency || "TL",
    imageUrls: data.imageUrls || [],
    colorImages: data.colorImages || {},
    description: data.description || "",
    brandModel: data.brandModel || null,
    condition: data.condition || "new",
    quantity: data.quantity || null,
    averageRating: data.averageRating || 0,
    isBoosted: data.isBoosted === true,
    deliveryOption: data.deliveryOption || null,
    campaignName: data.campaignName || null,
    category: data.category || "",
    subcategory: data.subcategory || "",
    clickCount: data.clickCount || 0,
    userId: data.userId || "",
    shopId: data.shopId || null,
  };
}

async function getRelatedProducts(
  db: FirebaseFirestore.Firestore,
  product: Product
): Promise<Product[]> {
  let relatedProducts: Product[] = [];

  try {
    // Strategy 1: Same subcategory + brand
    if (product.brandModel?.trim() && product.subcategory?.trim()) {
      const query1 = await db
        .collection("shop_products")
        .where("category", "==", product.category)
        .where("subcategory", "==", product.subcategory)
        .where("brandModel", "==", product.brandModel)
        .where("quantity", ">", 0)
        .limit(4)
        .get();

      query1.docs.forEach((doc) => {
        if (doc.id !== product.id) {
          try {
            relatedProducts.push(convertDocToProduct(doc));
          } catch (error) {
            console.error(`Error converting document ${doc.id}:`, error);
          }
        }
      });
    }

    // Strategy 2: Same subcategory
    if (
      relatedProducts.length < MAX_RELATED_PRODUCTS &&
      product.subcategory?.trim()
    ) {
      const query2 = await db
        .collection("shop_products")
        .where("category", "==", product.category)
        .where("subcategory", "==", product.subcategory)
        .where("quantity", ">", 0)
        .orderBy("quantity")
        .orderBy("averageRating", "desc")
        .limit(6)
        .get();

      const subcategoryProducts: Product[] = [];
      query2.docs.forEach((doc) => {
        if (doc.id !== product.id) {
          try {
            subcategoryProducts.push(convertDocToProduct(doc));
          } catch (error) {
            console.error(`Error converting document ${doc.id}:`, error);
          }
        }
      });
      relatedProducts = mergeUnique(relatedProducts, subcategoryProducts);
    }

    // Strategy 3: Same category
    if (relatedProducts.length < MAX_RELATED_PRODUCTS) {
      const query3 = await db
        .collection("shop_products")
        .where("category", "==", product.category)
        .where("quantity", ">", 0)
        .orderBy("quantity")
        .orderBy("clickCount", "desc")
        .limit(8)
        .get();

      const categoryProducts: Product[] = [];
      query3.docs.forEach((doc) => {
        if (doc.id !== product.id) {
          try {
            categoryProducts.push(convertDocToProduct(doc));
          } catch (error) {
            console.error(`Error converting document ${doc.id}:`, error);
          }
        }
      });
      relatedProducts = mergeUnique(relatedProducts, categoryProducts);
    }

    // Strategy 4: Similar price range
    if (relatedProducts.length < MAX_RELATED_PRODUCTS) {
      const priceMin = product.price * 0.7;
      const priceMax = product.price * 1.3;

      const query4 = await db
        .collection("shop_products")
        .where("price", ">=", priceMin)
        .where("price", "<=", priceMax)
        .where("quantity", ">", 0)
        .orderBy("price")
        .orderBy("quantity")
        .orderBy("averageRating", "desc")
        .limit(6)
        .get();

      const priceRangeProducts: Product[] = [];
      query4.docs.forEach((doc) => {
        if (doc.id !== product.id) {
          try {
            priceRangeProducts.push(convertDocToProduct(doc));
          } catch (error) {
            console.error(`Error converting document ${doc.id}:`, error);
          }
        }
      });
      relatedProducts = mergeUnique(relatedProducts, priceRangeProducts);
    }

    return limitAndRandomize(relatedProducts, product.id);
  } catch (error) {
    console.error("Error in getRelatedProducts:", error);
    return [];
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { productId: string } }
): Promise<NextResponse> {
  try {
    const { productId } = params;

    // Validate productId
    if (!productId || productId.trim() === "") {
      return NextResponse.json(
        { error: "Product ID is required", products: [], totalCount: 0 },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = productId;
    if (isValidCache(cacheKey)) {
      const cached = cache.get(cacheKey)!;
      return NextResponse.json({
        products: cached.data,
        totalCount: cached.data.length,
        fromCache: true,
      });
    }

    // Initialize Firebase
    const db = initializeFirebase();

    // Normalize productId
    let rawId = productId.trim();
    if (rawId.startsWith("products_")) {
      rawId = rawId.substring("products_".length);
    } else if (rawId.startsWith("shop_products_")) {
      rawId = rawId.substring("shop_products_".length);
    }

    if (rawId === "") {
      return NextResponse.json(
        { error: "Invalid product ID format", products: [], totalCount: 0 },
        { status: 400 }
      );
    }

    // Get the current product
    const [productDoc, shopProductDoc] = await Promise.all([
      db.collection("products").doc(rawId).get(),
      db.collection("shop_products").doc(rawId).get(),
    ]);

    const currentProduct = productDoc.exists ? productDoc : shopProductDoc;

    if (!currentProduct.exists) {
      return NextResponse.json(
        { error: "Product not found", products: [], totalCount: 0 },
        { status: 404 }
      );
    }

    const currentProductData = currentProduct.data();
    if (!currentProductData) {
      return NextResponse.json(
        { error: "Product data is empty", products: [], totalCount: 0 },
        { status: 404 }
      );
    }

    // Convert to Product object
    const product: Product = {
      id: currentProduct.id,
      productName: currentProductData.productName || "",
      price: currentProductData.price || 0,
      originalPrice: currentProductData.originalPrice || null,
      discountPercentage: currentProductData.discountPercentage || null,
      currency: currentProductData.currency || "TL",
      imageUrls: currentProductData.imageUrls || [],
      colorImages: currentProductData.colorImages || {},
      description: currentProductData.description || "",
      brandModel: currentProductData.brandModel || null,
      condition: currentProductData.condition || "new",
      quantity: currentProductData.quantity || null,
      averageRating: currentProductData.averageRating || 0,
      isBoosted: currentProductData.isBoosted === true,
      deliveryOption: currentProductData.deliveryOption || null,
      campaignName: currentProductData.campaignName || null,
      category: currentProductData.category || "",
      subcategory: currentProductData.subcategory || "",
      clickCount: currentProductData.clickCount || 0,
      userId: currentProductData.userId || "",
      shopId: currentProductData.shopId || null,
    };

    // Get related products
    const relatedProducts = await getRelatedProducts(db, product);

    // Cache the results
    cache.set(cacheKey, {
      data: relatedProducts,
      timestamp: Date.now(),
    });

    // Clean up expired cache entries occasionally
    if (Math.random() < 0.1) {
      const now = Date.now();
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp >= CACHE_EXPIRY) {
          cache.delete(key);
        }
      }
    }

    return NextResponse.json({
      products: relatedProducts,
      totalCount: relatedProducts.length,
      category: product.category,
      subcategory: product.subcategory,
      brandModel: product.brandModel,
      fromCache: false,
    });
  } catch (error) {
    console.error("Error in GET /api/relatedproducts/[productId]:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        products: [],
        totalCount: 0,
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
