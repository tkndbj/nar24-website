// src/lib/product-detail-fetcher.ts
// Server-side Firestore data fetching for product detail page

import { getFirestoreAdmin } from "@/lib/firebase-admin";
import type {
  SellerInfo,
  Review,
  Question,
  RelatedProduct,
  CollectionData,
  BundleInfo,
  ProductDetailData,
} from "@/types/product-detail";

// ============= HELPERS =============

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

function parseColorImageStoragePaths(
  value: unknown,
): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v != null) out[String(k)] = String(v);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function safeStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((e) => String(e));
  if (typeof value === "string") return value.trim() === "" ? [] : [value];
  return [];
}

function parseTimestamp(value: unknown): string {
  if (!value) return new Date().toISOString();

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }

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

  if (typeof value === "number") {
    const ms = value > 10000000000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return isNaN(date.getTime())
      ? new Date().toISOString()
      : date.toISOString();
  }

  return new Date().toISOString();
}

export function normalizeProductId(productId: string): string {
  let rawId = productId.trim();

  if (rawId.startsWith("products_")) {
    rawId = rawId.substring("products_".length);
  } else if (rawId.startsWith("shop_products_")) {
    rawId = rawId.substring("shop_products_".length);
  }

  return rawId;
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
  const [sellerDoc, shopDoc] = await Promise.all([
    db.collection("users").doc(sellerId).get(),
    shopId ? db.collection("shops").doc(shopId).get() : Promise.resolve(null),
  ]);

  if (!sellerDoc.exists) return null;

  const sellerData = sellerDoc.data();
  if (!sellerData) return null;

  // Use denormalized averageRating/totalReviews from user and shop docs
  const sellerAverageRating = safeDouble(sellerData.averageRating);
  const totalReviews = safeInt(sellerData.totalReviews);

  let shopAverageRating = 0;
  if (shopDoc && shopDoc.exists) {
    const shopData = shopDoc.data();
    shopAverageRating = safeDouble(shopData?.averageRating);
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
}

async function fetchReviews(
  db: FirebaseFirestore.Firestore,
  productId: string,
  collection: string,
  limit: number = 3
): Promise<{ reviews: Review[]; total: number }> {
  const reviewsRef = db
    .collection(collection)
    .doc(productId)
    .collection("reviews");

  const [reviewsSnapshot, countSnapshot] = await Promise.all([
    reviewsRef.orderBy("timestamp", "desc").limit(limit).get(),
    reviewsRef.count().get(),
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

  return { reviews, total: countSnapshot.data().count };
}

async function fetchQuestions(
  db: FirebaseFirestore.Firestore,
  productId: string,
  collection: string,
  limit: number = 5
): Promise<{ questions: Question[]; total: number }> {
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
      .count()
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

  return { questions, total: countSnapshot.data().count };
}

async function fetchRelatedProducts(
  db: FirebaseFirestore.Firestore,
  productId: string,
  relatedIds: string[],
  category: string,
  subcategory: string
): Promise<RelatedProduct[]> {
  if (relatedIds.length > 0) {
    const limitedIds = relatedIds.slice(0, 10);

    // Batch read: try shop_products first, then fill gaps from products
    const shopRefs = limitedIds.map((id) =>
      db.collection("shop_products").doc(id)
    );
    const shopDocs = await db.getAll(...shopRefs);

    // Collect IDs that weren't found in shop_products
    const missingIds: string[] = [];
    const foundMap = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    shopDocs.forEach((doc, i) => {
      if (doc.exists) {
        foundMap.set(limitedIds[i], doc);
      } else {
        missingIds.push(limitedIds[i]);
      }
    });

    // Batch read the missing ones from products collection
    if (missingIds.length > 0) {
      const prodRefs = missingIds.map((id) =>
        db.collection("products").doc(id)
      );
      const prodDocs = await db.getAll(...prodRefs);
      prodDocs.forEach((doc, i) => {
        if (doc.exists) {
          foundMap.set(missingIds[i], doc);
        }
      });
    }

    // Map results preserving original order
    const products: RelatedProduct[] = [];
    for (const id of limitedIds) {
      const doc = foundMap.get(id);
      if (doc && doc.exists) {
        const data = doc.data();
        if (data) {
          products.push({
            id: doc.id,
            productName: safeString(data.productName),
            price: safeDouble(data.price),
            currency: safeString(data.currency, "TL"),
            imageUrls: safeStringArray(data.imageUrls),
            imageStoragePaths: Array.isArray(data.imageStoragePaths)
              ? safeStringArray(data.imageStoragePaths)
              : undefined,
            colorImageStoragePaths: parseColorImageStoragePaths(
              data.colorImageStoragePaths,
            ),
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
        imageStoragePaths: Array.isArray(data.imageStoragePaths)
          ? safeStringArray(data.imageStoragePaths)
          : undefined,
        colorImageStoragePaths: parseColorImageStoragePaths(
          data.colorImageStoragePaths,
        ),
        averageRating: safeDouble(data.averageRating),
        discountPercentage: data.discountPercentage
          ? safeInt(data.discountPercentage)
          : undefined,
        brandModel: data.brandModel ? safeString(data.brandModel) : undefined,
      };
    });
}

async function fetchCollection(
  db: FirebaseFirestore.Firestore,
  productId: string,
  shopId: string | null
): Promise<CollectionData | null> {
  if (!shopId) return null;

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

  const limitedIds = productIds.slice(0, 10);

  const productsSnapshot = await db
    .collection("shop_products")
    .where("__name__", "in", limitedIds)
    .get();

  const products = productsSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      productName: safeString(data.productName),
      price: safeDouble(data.price),
      currency: safeString(data.currency, "TL"),
      imageUrls: safeStringArray(data.imageUrls),
      averageRating: safeDouble(data.averageRating),
    };
  });

  return {
    id: collectionDoc.id,
    name: collectionData.name || "Collection",
    imageUrl: collectionData.imageUrl || undefined,
    products,
  };
}

async function fetchBundles(
  db: FirebaseFirestore.Firestore,
  productId: string,
  shopId: string | null
): Promise<BundleInfo[]> {
  if (!shopId) return [];

  const bundlesSnapshot = await db
    .collection("bundles")
    .where("shopId", "==", shopId)
    .where("mainProductId", "==", productId)
    .where("isActive", "==", true)
    .limit(10)
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
}

async function fetchSalesConfig(
  db: FirebaseFirestore.Firestore
): Promise<{ salesPaused: boolean; pauseReason: string }> {
  const doc = await db.collection("settings").doc("salesConfig").get();
  if (doc.exists) {
    const data = doc.data();
    return {
      salesPaused: data?.salesPaused || false,
      pauseReason: data?.pauseReason || "",
    };
  }
  return { salesPaused: false, pauseReason: "" };
}

// ============= MAIN ORCHESTRATOR =============

export async function fetchAllProductData(
  productId: string
): Promise<ProductDetailData | null> {
  const db = getFirestoreAdmin();

  // Stage 1: Fetch product first (needed for other queries)
  const productResult = await fetchProduct(db, productId);

  if (!productResult) return null;

  const { product, collection: productCollection } = productResult;
  const sellerId = safeString(product.userId);
  const shopId = product.shopId ? safeString(product.shopId) : null;
  const relatedIds = safeStringArray(product.relatedProductIds);
  const category = safeString(product.category, "Uncategorized");
  const subcategory = safeString(product.subcategory);

  // Stage 2: Fetch all secondary data in PARALLEL with graceful degradation
  const [
    sellerResult,
    reviewsResult,
    questionsResult,
    relatedResult,
    collectionResult,
    bundlesResult,
    salesConfigResult,
  ] = await Promise.all([
    fetchSellerInfo(db, sellerId, shopId).catch(() => null),
    fetchReviews(db, productId, productCollection, 3).catch(() => ({
      reviews: [] as Review[],
      total: 0,
    })),
    fetchQuestions(db, productId, productCollection, 5).catch(() => ({
      questions: [] as Question[],
      total: 0,
    })),
    fetchRelatedProducts(db, productId, relatedIds, category, subcategory).catch(
      () => [] as RelatedProduct[]
    ),
    fetchCollection(db, productId, shopId).catch(() => null),
    fetchBundles(db, productId, shopId).catch(() => [] as BundleInfo[]),
    fetchSalesConfig(db).catch(() => ({ salesPaused: false, pauseReason: "" })),
  ]);

  return {
    product,
    seller: sellerResult,
    reviews: reviewsResult.reviews,
    reviewsTotal: reviewsResult.total,
    questions: questionsResult.questions,
    questionsTotal: questionsResult.total,
    relatedProducts: relatedResult,
    collection: collectionResult,
    bundles: bundlesResult,
    salesConfig: salesConfigResult,
  };
}

