// src/app/api/product-detail-batch/[productId]/route.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// BATCH PRODUCT DETAIL API - Matches Flutter's Parallel Fetching Pattern
// ═══════════════════════════════════════════════════════════════════════════
//
// This endpoint returns ALL data needed for the product detail page in ONE call:
// - Product data
// - Seller info
// - Reviews (first 3)
// - Questions (first 5)
// - Related products
// - Collection info
// - Bundle info
//
// Performance: ~200-400ms total vs ~1500-2000ms with sequential calls
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";

// ============= TYPES =============

interface SellerInfo {
  sellerName: string;
  sellerAverageRating: number;
  shopAverageRating: number;
  sellerIsVerified: boolean;
  totalProductsSold: number;
  totalReviews: number;
  cargoAgreement: Record<string, unknown> | null;
}

interface Review {
  id: string;
  productId: string;
  userId: string;
  userName: string | null;
  userImage: string | null;
  rating: number;
  review: string;
  imageUrls: string[];
  timestamp: string;
  likes: string[];
  helpful: number;
  verified: boolean;
  sellerResponse: string | null;
  sellerResponseDate: string | null;
}

interface Question {
  id: string;
  questionText: string;
  answerText: string;
  timestamp: string;
  askerName: string;
  askerNameVisible: boolean;
  answered: boolean;
  productId: string;
}

interface RelatedProduct {
  id: string;
  productName: string;
  price: number;
  currency: string;
  imageUrls: string[];
  averageRating: number;
  discountPercentage?: number;
  brandModel?: string;
}

interface CollectionInfo {
  id: string;
  name: string;
  imageUrl: string | null;
  products: RelatedProduct[];
}

interface BundleInfo {
  id: string;
  mainProductId: string;
  bundleItems: Array<{
    productId: string;
    productName: string;
    originalPrice: number;
    bundlePrice: number;
    discountPercentage: number;
    imageUrl?: string;
    currency: string;
  }>;
  isActive: boolean;
}

interface ProductDetailBatchResponse {
  product: Record<string, unknown>;
  seller: SellerInfo | null;
  reviews: Review[];
  reviewsTotal: number;
  questions: Question[];
  questionsTotal: number;
  relatedProducts: RelatedProduct[];
  collection: CollectionInfo | null;
  bundles: BundleInfo[];
  fetchedAt: number;
  timings: Record<string, number>;
}

// ============= CACHING =============

const responseCache = new Map<
  string,
  { data: ProductDetailBatchResponse; timestamp: number }
>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const MAX_CACHE_SIZE = 50;

function getCachedResponse(
  productId: string
): ProductDetailBatchResponse | null {
  const cached = responseCache.get(productId);
  if (!cached) return null;

  if (Date.now() - cached.timestamp > CACHE_TTL) {
    responseCache.delete(productId);
    return null;
  }

  return cached.data;
}

function cacheResponse(productId: string, data: ProductDetailBatchResponse) {
  responseCache.set(productId, { data, timestamp: Date.now() });

  // LRU eviction
  if (responseCache.size > MAX_CACHE_SIZE) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
}

// ============= HELPER FUNCTIONS =============

function safeString(value: unknown, defaultValue: string = ""): string {
  if (value === null || value === undefined) return defaultValue;
  return String(value);
}

function safeDouble(value: unknown, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value) || defaultValue;
  return defaultValue;
}

function safeInt(value: unknown, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === "number") return Math.floor(value);
  if (typeof value === "string") return parseInt(value) || defaultValue;
  return defaultValue;
}

function safeStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((e) => String(e));
  if (typeof value === "string") return value.trim() === "" ? [] : [value];
  return [];
}

function parseTimestamp(value: unknown): string {
  if (!value) return new Date().toISOString();

  // Handle Firestore Timestamp
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

  // Handle _seconds format
  if (
    value &&
    typeof value === "object" &&
    "_seconds" in value &&
    typeof (value as { _seconds: unknown })._seconds === "number"
  ) {
    return new Date(
      (value as { _seconds: number })._seconds * 1000
    ).toISOString();
  }

  // Handle number (milliseconds or seconds)
  if (typeof value === "number") {
    const ms = value > 10000000000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }

  // Handle string
  if (typeof value === "string") {
    const date = new Date(value);
    return isNaN(date.getTime())
      ? new Date().toISOString()
      : date.toISOString();
  }

  return new Date().toISOString();
}

// ============= FETCH FUNCTIONS =============

async function fetchProduct(
  db: FirebaseFirestore.Firestore,
  productId: string
): Promise<{ product: Record<string, unknown>; collection: string } | null> {
  const [productDoc, shopProductDoc] = await Promise.all([
    db.collection("products").doc(productId).get(),
    db.collection("shop_products").doc(productId).get(),
  ]);

  let doc = null;
  let collection = "";

  if (productDoc.exists) {
    doc = productDoc;
    collection = "products";
  } else if (shopProductDoc.exists) {
    doc = shopProductDoc;
    collection = "shop_products";
  }

  if (!doc || !doc.exists) return null;

  const data = doc.data();
  if (!data) return null;

  return {
    product: { ...data, id: doc.id, _collection: collection },
    collection,
  };
}

async function fetchSellerInfo(
  db: FirebaseFirestore.Firestore,
  sellerId: string,
  shopId: string | null
): Promise<SellerInfo | null> {
  try {
    const [sellerDoc, shopDoc] = await Promise.all([
      db.collection("users").doc(sellerId).get(),
      shopId ? db.collection("shops").doc(shopId).get() : Promise.resolve(null),
    ]);

    if (!sellerDoc.exists) return null;

    const sellerData = sellerDoc.data();
    if (!sellerData) return null;

    // Get seller reviews count
    const reviewsSnapshot = await db
      .collection("users")
      .doc(sellerId)
      .collection("reviews")
      .get();

    let sellerAverageRating = 0;
    let totalReviews = 0;

    if (!reviewsSnapshot.empty) {
      let totalRating = 0;
      reviewsSnapshot.docs.forEach((doc) => {
        const reviewData = doc.data();
        if (reviewData.rating) {
          totalRating += reviewData.rating;
          totalReviews++;
        }
      });
      sellerAverageRating = totalReviews > 0 ? totalRating / totalReviews : 0;
    }

    let shopAverageRating = 0;
    if (shopDoc && shopDoc.exists) {
      const shopData = shopDoc.data();
      shopAverageRating = shopData?.averageRating || 0;
    }

    return {
      sellerName: sellerData.displayName || "Unknown Seller",
      sellerAverageRating,
      shopAverageRating,
      sellerIsVerified: sellerData.verified === true,
      totalProductsSold: sellerData.totalProductsSold || 0,
      totalReviews,
      cargoAgreement: sellerData.cargoAgreement || null,
    };
  } catch (error) {
    console.error("Error fetching seller info:", error);
    return null;
  }
}

async function fetchReviews(
  db: FirebaseFirestore.Firestore,
  productId: string,
  collection: string,
  limit: number = 3
): Promise<{ reviews: Review[]; total: number }> {
  try {
    const reviewsRef = db
      .collection(collection)
      .doc(productId)
      .collection("reviews");

    const [reviewsSnapshot, countSnapshot] = await Promise.all([
      reviewsRef.orderBy("timestamp", "desc").limit(limit).get(),
      reviewsRef.get(),
    ]);

    const reviews: Review[] = reviewsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        productId: data.productId || productId,
        userId: data.userId || "",
        userName: data.userName || null,
        userImage: data.userImage || null,
        rating: data.rating || 0,
        review: data.review || "",
        imageUrls: safeStringArray(data.imageUrls || data.imageUrl),
        timestamp: parseTimestamp(data.timestamp),
        likes: data.likes || [],
        helpful: data.helpful || 0,
        verified: data.verified || false,
        sellerResponse: data.sellerResponse || null,
        sellerResponseDate: data.sellerResponseDate
          ? parseTimestamp(data.sellerResponseDate)
          : null,
      };
    });

    return { reviews, total: countSnapshot.size };
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return { reviews: [], total: 0 };
  }
}

async function fetchQuestions(
  db: FirebaseFirestore.Firestore,
  productId: string,
  collection: string,
  limit: number = 5
): Promise<{ questions: Question[]; total: number }> {
  try {
    const questionsRef = db
      .collection(collection)
      .doc(productId)
      .collection("product_questions");

    const [questionsSnapshot, countSnapshot] = await Promise.all([
      questionsRef
        .where("productId", "==", productId)
        .where("answered", "==", true)
        .orderBy("timestamp", "desc")
        .limit(limit)
        .get(),
      questionsRef
        .where("productId", "==", productId)
        .where("answered", "==", true)
        .get(),
    ]);

    const questions: Question[] = questionsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        questionText: data.questionText || "",
        answerText: data.answerText || "",
        timestamp: parseTimestamp(data.timestamp),
        askerName: data.askerName || "Anonymous",
        askerNameVisible: data.askerNameVisible === true,
        answered: data.answered === true,
        productId: data.productId || productId,
      };
    });

    return { questions, total: countSnapshot.size };
  } catch (error) {
    console.error("Error fetching questions:", error);
    return { questions: [], total: 0 };
  }
}

async function fetchRelatedProducts(
  db: FirebaseFirestore.Firestore,
  productId: string,
  relatedIds: string[],
  category: string,
  subcategory: string
): Promise<RelatedProduct[]> {
  try {
    // If we have pre-computed related IDs, use them
    if (relatedIds.length > 0) {
      const products: RelatedProduct[] = [];
      const limitedIds = relatedIds.slice(0, 10);

      const docs = await Promise.all(
        limitedIds.map(async (id) => {
          const shopDoc = await db.collection("shop_products").doc(id).get();
          if (shopDoc.exists) return shopDoc;

          const prodDoc = await db.collection("products").doc(id).get();
          return prodDoc.exists ? prodDoc : null;
        })
      );

      for (const doc of docs) {
        if (doc && doc.exists) {
          const data = doc.data();
          if (data) {
            products.push({
              id: doc.id,
              productName: safeString(data.productName),
              price: safeDouble(data.price),
              currency: safeString(data.currency, "TL"),
              imageUrls: safeStringArray(data.imageUrls),
              averageRating: safeDouble(data.averageRating),
              discountPercentage: data.discountPercentage
                ? safeInt(data.discountPercentage)
                : undefined,
              brandModel: data.brandModel
                ? safeString(data.brandModel)
                : undefined,
            });
          }
        }
      }

      return products;
    }

    // Fallback: query by category
    const snapshot = await db
      .collection("shop_products")
      .where("category", "==", category)
      .where("subcategory", "==", subcategory)
      .orderBy("promotionScore", "desc")
      .limit(10)
      .get();

    return snapshot.docs
      .filter((doc) => doc.id !== productId)
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          productName: safeString(data.productName),
          price: safeDouble(data.price),
          currency: safeString(data.currency, "TL"),
          imageUrls: safeStringArray(data.imageUrls),
          averageRating: safeDouble(data.averageRating),
          discountPercentage: data.discountPercentage
            ? safeInt(data.discountPercentage)
            : undefined,
          brandModel: data.brandModel ? safeString(data.brandModel) : undefined,
        };
      });
  } catch (error) {
    console.error("Error fetching related products:", error);
    return [];
  }
}

async function fetchCollection(
  db: FirebaseFirestore.Firestore,
  productId: string,
  shopId: string | null
): Promise<CollectionInfo | null> {
  if (!shopId) return null;

  try {
    const collectionsSnapshot = await db
      .collection("shops")
      .doc(shopId)
      .collection("collections")
      .where("productIds", "array-contains", productId)
      .limit(1)
      .get();

    if (collectionsSnapshot.empty) return null;

    const collectionDoc = collectionsSnapshot.docs[0];
    const collectionData = collectionDoc.data();
    const productIds = (collectionData.productIds || []).filter(
      (id: string) => id !== productId
    );

    if (productIds.length === 0) return null;

    // Fetch collection products
    const limitedIds = productIds.slice(0, 10);
    const products: RelatedProduct[] = [];

    const productsSnapshot = await db
      .collection("shop_products")
      .where("__name__", "in", limitedIds)
      .get();

    for (const doc of productsSnapshot.docs) {
      const data = doc.data();
      products.push({
        id: doc.id,
        productName: safeString(data.productName),
        price: safeDouble(data.price),
        currency: safeString(data.currency, "TL"),
        imageUrls: safeStringArray(data.imageUrls),
        averageRating: safeDouble(data.averageRating),
      });
    }

    return {
      id: collectionDoc.id,
      name: collectionData.name || "Collection",
      imageUrl: collectionData.imageUrl || null,
      products,
    };
  } catch (error) {
    console.error("Error fetching collection:", error);
    return null;
  }
}

async function fetchBundles(
  db: FirebaseFirestore.Firestore,
  productId: string,
  shopId: string | null
): Promise<BundleInfo[]> {
  if (!shopId) return [];

  try {
    const bundlesSnapshot = await db
      .collection("bundles")
      .where("shopId", "==", shopId)
      .where("mainProductId", "==", productId)
      .where("isActive", "==", true)
      .get();

    return bundlesSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        mainProductId: data.mainProductId,
        bundleItems: data.bundleItems || [],
        isActive: data.isActive === true,
      };
    });
  } catch (error) {
    console.error("Error fetching bundles:", error);
    return [];
  }
}

// ============= MAIN HANDLER =============

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  const startTime = Date.now();
  const timings: Record<string, number> = {};

  try {
    const { productId } = await params;

    if (!productId || productId.trim() === "") {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    // Normalize productId
    let rawId = productId.trim();
    if (rawId.startsWith("products_")) {
      rawId = rawId.substring("products_".length);
    } else if (rawId.startsWith("shop_products_")) {
      rawId = rawId.substring("shop_products_".length);
    }

    // Check cache
    const cached = getCachedResponse(rawId);
    if (cached) {
      return NextResponse.json(
        { ...cached, source: "cache" },
        {
          headers: {
            "Cache-Control": "public, max-age=120, stale-while-revalidate=60",
            "X-Cache": "HIT",
          },
        }
      );
    }

    const db = getFirestoreAdmin();

    // ============= STAGE 1: Fetch product first (needed for other queries) =============
    const productStart = Date.now();
    const productResult = await fetchProduct(db, rawId);
    timings.product = Date.now() - productStart;

    if (!productResult) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const { product, collection: productCollection } = productResult;
    const sellerId = safeString(product.userId);
    const shopId = product.shopId ? safeString(product.shopId) : null;
    const relatedIds = safeStringArray(product.relatedProductIds);
    const category = safeString(product.category, "Uncategorized");
    const subcategory = safeString(product.subcategory);

    // ============= STAGE 2: Fetch all secondary data in PARALLEL =============
    const parallelStart = Date.now();

    const [
      sellerResult,
      reviewsResult,
      questionsResult,
      relatedResult,
      collectionResult,
      bundlesResult,
    ] = await Promise.all([
      fetchSellerInfo(db, sellerId, shopId),
      fetchReviews(db, rawId, productCollection, 3),
      fetchQuestions(db, rawId, productCollection, 5),
      fetchRelatedProducts(db, rawId, relatedIds, category, subcategory),
      fetchCollection(db, rawId, shopId),
      fetchBundles(db, rawId, shopId),
    ]);

    timings.parallel = Date.now() - parallelStart;
    timings.total = Date.now() - startTime;

    // Build response
    const response: ProductDetailBatchResponse = {
      product,
      seller: sellerResult,
      reviews: reviewsResult.reviews,
      reviewsTotal: reviewsResult.total,
      questions: questionsResult.questions,
      questionsTotal: questionsResult.total,
      relatedProducts: relatedResult,
      collection: collectionResult,
      bundles: bundlesResult,
      fetchedAt: Date.now(),
      timings,
    };

    // Cache the response
    cacheResponse(rawId, response);

    console.log(
      `✅ Batch fetch completed in ${timings.total}ms (product: ${timings.product}ms, parallel: ${timings.parallel}ms)`
    );

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, max-age=120, stale-while-revalidate=60",
        "X-Cache": "MISS",
        "X-Timing-Total": String(timings.total),
        "X-Timing-Parallel": String(timings.parallel),
      },
    });
  } catch (error) {
    console.error("Error in batch fetch:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        details:
          process.env.NODE_ENV === "development" ? String(error) : undefined,
      },
      { status: 500 }
    );
  }
}
