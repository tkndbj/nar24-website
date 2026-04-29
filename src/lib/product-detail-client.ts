// src/lib/product-detail-client.ts
//
// Client-side Firestore data fetchers for the product detail page.
//
// These mirror the shapes returned by the corresponding /api routes
// (api/reviews, api/questions, api/seller, api/collections/by-product,
// api/bundles, api/products), but skip the API round-trip and the cold-
// lambda startup by hitting Firestore directly from the browser via the
// Firebase JS SDK.
//
// Security: every collection touched here has `allow read: if true` (or
// equivalently public read) in firestore.rules — public catalog data.
//
// All functions are pure async — they don't manage React state. Widgets
// call them inside their existing useEffect fallback paths.

import {
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  limit as qLimit,
  orderBy,
  query,
  startAfter,
  where,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";
import { Product, ProductUtils } from "@/app/models/Product";
import type {
  BundleInfo,
  CollectionData,
  Question,
  Review,
  SellerInfo,
} from "@/types/product-detail";

// ─── Helpers ─────────────────────────────────────────────────────────────

function timestampToISO(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null && "seconds" in value) {
    const s = (value as { seconds: number }).seconds;
    if (typeof s === "number") return new Date(s * 1000).toISOString();
  }
  if (typeof value === "number") {
    const ms = value > 10_000_000_000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function timestampToISOOrNull(value: unknown): string | null {
  if (!value) return null;
  return timestampToISO(value);
}

function safeStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.trim() === "" ? [] : [value];
  return [];
}

// Chunk an array into pieces of `size`. Firestore `in` queries accept up
// to 30 values per query (10 historically); we chunk to 10 to stay
// conservative across SDK versions.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── Seller info ────────────────────────────────────────────────────────

export async function fetchSellerInfoClient(
  sellerId: string,
  shopId?: string | null
): Promise<SellerInfo | null> {
  if (!sellerId || sellerId.trim() === "") return null;

  const sellerRef = doc(db, "users", sellerId);
  const shopRef = shopId ? doc(db, "shops", shopId) : null;

  const [sellerSnap, shopSnap] = await Promise.all([
    getDoc(sellerRef),
    shopRef ? getDoc(shopRef) : Promise.resolve(null),
  ]);

  if (!sellerSnap.exists()) return null;
  const sellerData = sellerSnap.data();

  let shopAverageRating = 0;
  if (shopSnap?.exists()) {
    const shopData = shopSnap.data();
    shopAverageRating =
      typeof shopData.averageRating === "number" ? shopData.averageRating : 0;
  } else if (!shopId) {
    // Fallback: find shop by ownerId
    const shopByOwner = await getDocs(
      query(
        collection(db, "shops"),
        where("ownerId", "==", sellerId),
        qLimit(1)
      )
    );
    if (!shopByOwner.empty) {
      const data = shopByOwner.docs[0].data();
      shopAverageRating =
        typeof data.averageRating === "number" ? data.averageRating : 0;
    }
  }

  return {
    sellerName: String(sellerData.displayName || "Unknown Seller"),
    sellerAverageRating:
      typeof sellerData.averageRating === "number"
        ? sellerData.averageRating
        : 0,
    shopAverageRating,
    sellerIsVerified: sellerData.verified === true,
    totalProductsSold:
      typeof sellerData.totalProductsSold === "number"
        ? sellerData.totalProductsSold
        : 0,
    totalReviews:
      typeof sellerData.reviewCount === "number"
        ? sellerData.reviewCount
        : typeof sellerData.totalReviews === "number"
          ? sellerData.totalReviews
          : 0,
    cargoAgreement: sellerData.cargoAgreement || null,
  };
}

// Variant used by the Questions widget. The widget looks up the asker /
// seller's avatar URL alongside the headline display info — fields the
// generic SellerInfo type doesn't carry. Returns user-doc + shop-doc
// fields packed into a single object.
export interface SellerInfoForQuestions {
  // Shop fields (only populated when isShop)
  profileImageUrl?: string;
  // User fields (always populated when the user doc exists)
  profileImage?: string;
  displayName: string;
}

export async function fetchSellerForQuestionsClient(
  sellerId: string,
  shopId: string | null
): Promise<SellerInfoForQuestions | null> {
  if (!sellerId || sellerId.trim() === "") return null;
  const [userSnap, shopSnap] = await Promise.all([
    getDoc(doc(db, "users", sellerId)),
    shopId ? getDoc(doc(db, "shops", shopId)) : Promise.resolve(null),
  ]);
  if (!userSnap.exists()) return null;
  const userData = userSnap.data();
  const shopData = shopSnap?.exists() ? shopSnap.data() : null;
  return {
    displayName: String(userData.displayName || "Unknown Seller"),
    profileImage: userData.profileImage
      ? String(userData.profileImage)
      : undefined,
    profileImageUrl: shopData?.profileImageUrl
      ? String(shopData.profileImageUrl)
      : undefined,
  };
}

// ─── Reviews ────────────────────────────────────────────────────────────

export interface FetchReviewsOptions {
  isShop?: boolean;
  limit?: number;
  sortBy?: "recent" | "helpful" | "rating";
  filterRating?: number | null;
  // ID of the last review from the previous page; the next page starts
  // strictly after this document.
  lastDocId?: string | null;
}

export interface FetchReviewsResult {
  reviews: Review[];
  totalCount: number;
  hasMore: boolean;
}

export async function fetchReviewsClient(
  productId: string,
  opts: FetchReviewsOptions = {}
): Promise<FetchReviewsResult> {
  const rawId = productId.trim();
  if (rawId === "") return { reviews: [], totalCount: 0, hasMore: false };

  // Determine which root collection holds the product. If the caller
  // passed isShop, trust it; otherwise probe shop_products first.
  let baseCollection: string;
  if (opts.isShop !== undefined) {
    baseCollection = opts.isShop ? "shop_products" : "products";
  } else {
    const shopProbe = await getDoc(doc(db, "shop_products", rawId));
    baseCollection = shopProbe.exists() ? "shop_products" : "products";
  }

  const limit = Math.min(opts.limit ?? 20, 50);
  const sortBy = opts.sortBy ?? "recent";
  const filterRating = opts.filterRating ?? null;

  const reviewsRef = collection(db, baseCollection, rawId, "reviews");

  // Build constraints. Firestore requires the range filter field to be
  // the first orderBy when combined with other orderBy fields.
  const constraints: QueryConstraint[] = [];
  if (filterRating !== null) {
    constraints.push(where("rating", ">=", filterRating));
    constraints.push(where("rating", "<", filterRating + 1));
    constraints.push(orderBy("rating", "desc"));
    constraints.push(orderBy("timestamp", "desc"));
  } else if (sortBy === "rating") {
    constraints.push(orderBy("rating", "desc"));
    constraints.push(orderBy("timestamp", "desc"));
  } else if (sortBy === "helpful") {
    constraints.push(orderBy("helpful", "desc"));
    constraints.push(orderBy("timestamp", "desc"));
  } else {
    constraints.push(orderBy("timestamp", "desc"));
  }

  // Pagination cursor — fetch the cursor doc only if requested
  if (opts.lastDocId) {
    const cursorSnap = await getDoc(
      doc(db, baseCollection, rawId, "reviews", opts.lastDocId)
    );
    if (cursorSnap.exists()) constraints.push(startAfter(cursorSnap));
  }

  constraints.push(qLimit(limit));

  // Count query mirrors filter constraints (no order/limit needed)
  const countConstraints: QueryConstraint[] = [];
  if (filterRating !== null) {
    countConstraints.push(where("rating", ">=", filterRating));
    countConstraints.push(where("rating", "<", filterRating + 1));
  }

  const [snap, countSnap] = await Promise.all([
    getDocs(query(reviewsRef, ...constraints)),
    getCountFromServer(query(reviewsRef, ...countConstraints)),
  ]);

  const reviews: Review[] = snap.docs.map((d) => {
    const data = d.data();
    let imageUrls: string[] = [];
    if (Array.isArray(data.imageUrls)) {
      imageUrls = data.imageUrls.map(String);
    } else if (typeof data.imageUrl === "string" && data.imageUrl) {
      imageUrls = [data.imageUrl];
    }
    return {
      id: d.id,
      productId: data.productId || rawId,
      userId: data.userId || "",
      userName: data.userName ?? null,
      userImage: data.userImage ?? null,
      rating: typeof data.rating === "number" ? data.rating : 0,
      review: data.review || "",
      imageUrls,
      timestamp: timestampToISO(data.timestamp),
      likes: Array.isArray(data.likes) ? data.likes.map(String) : [],
      helpful: typeof data.helpful === "number" ? data.helpful : 0,
      verified: data.verified === true,
      sellerResponse: data.sellerResponse ?? null,
      sellerResponseDate: timestampToISOOrNull(data.sellerResponseDate),
    };
  });

  const totalCount = countSnap.data().count;

  return {
    reviews,
    totalCount,
    hasMore: reviews.length === limit && totalCount > reviews.length,
  };
}

// ─── Questions ──────────────────────────────────────────────────────────

export interface FetchQuestionsResult {
  questions: Question[];
  totalCount: number;
  hasMore: boolean;
}

export async function fetchQuestionsClient(
  productId: string,
  opts: { isShop: boolean; limit?: number }
): Promise<FetchQuestionsResult> {
  const rawId = productId.trim();
  if (rawId === "") return { questions: [], totalCount: 0, hasMore: false };

  const limit = Math.min(opts.limit ?? 5, 30);
  const baseCollection = opts.isShop ? "shop_products" : "products";

  const baseRef = collection(db, baseCollection, rawId, "product_questions");
  const baseConstraints: QueryConstraint[] = [
    where("productId", "==", rawId),
    where("answered", "==", true),
  ];

  const [snap, countSnap] = await Promise.all([
    getDocs(
      query(
        baseRef,
        ...baseConstraints,
        orderBy("timestamp", "desc"),
        qLimit(limit)
      )
    ),
    getCountFromServer(query(baseRef, ...baseConstraints)),
  ]);

  const questions: Question[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      questionText: data.questionText || "",
      answerText: data.answerText || "",
      timestamp: timestampToISO(data.timestamp),
      askerName: data.askerName || "Anonymous",
      askerNameVisible: data.askerNameVisible === true,
      answered: data.answered === true,
      productId: data.productId || rawId,
    };
  });

  const totalCount = countSnap.data().count;

  return {
    questions,
    totalCount,
    hasMore: questions.length === limit && totalCount > limit,
  };
}

// ─── Collection (shop product collection) ──────────────────────────────

export async function fetchCollectionByProductClient(
  productId: string,
  shopId: string
): Promise<CollectionData | null> {
  if (!productId || !shopId) return null;

  const collectionsRef = collection(db, "shops", shopId, "collections");
  const collectionsSnap = await getDocs(
    query(
      collectionsRef,
      where("productIds", "array-contains", productId),
      qLimit(1)
    )
  );
  if (collectionsSnap.empty) return null;

  const collectionDoc = collectionsSnap.docs[0];
  const data = collectionDoc.data();
  const allIds: string[] = Array.isArray(data.productIds)
    ? data.productIds.map(String)
    : [];
  const otherIds = allIds.filter((id) => id !== productId).slice(0, 10);
  if (otherIds.length === 0) return null;

  // Fetch products in batches of 10 (Firestore `in` limit)
  const products: CollectionData["products"] = [];
  for (const batch of chunk(otherIds, 10)) {
    const batchSnap = await getDocs(
      query(collection(db, "shop_products"), where(documentId(), "in", batch))
    );
    for (const d of batchSnap.docs) {
      const pd = d.data();
      products.push({
        id: d.id,
        productName: String(pd.productName || ""),
        price: typeof pd.price === "number" ? pd.price : 0,
        currency: String(pd.currency || "TL"),
        imageUrls: safeStringArray(pd.imageUrls),
      });
    }
  }

  if (products.length === 0) return null;

  return {
    id: collectionDoc.id,
    name: String(data.name || "Collection"),
    imageUrl: data.imageUrl ? String(data.imageUrl) : undefined,
    products,
  };
}

// ─── Bundles ───────────────────────────────────────────────────────────

// Mirrors the shape returned by /api/bundles — used by BundleComponent
// before its second-stage per-product fetch.
export interface ShopBundle {
  id: string;
  shopId: string;
  products: Array<{
    productId: string;
    productName: string;
    originalPrice: number;
    imageUrl: string | null;
  }>;
  totalBundlePrice: number;
  totalOriginalPrice: number;
  discountPercentage: number;
  currency: string;
  isActive: boolean;
}

export async function fetchActiveBundlesForShopClient(
  shopId: string
): Promise<ShopBundle[]> {
  if (!shopId || shopId.trim() === "") return [];
  // Firestore rule for `bundles/{id}` requires `resource.data.isActive == true`
  // for unauth reads; the where clause aligns the query with that rule.
  const snap = await getDocs(
    query(
      collection(db, "bundles"),
      where("shopId", "==", shopId),
      where("isActive", "==", true)
    )
  );
  return snap.docs.map((d) => {
    const data = d.data();
    const productsRaw = Array.isArray(data.products) ? data.products : [];
    return {
      id: d.id,
      shopId: String(data.shopId || ""),
      products: productsRaw.map((p: Record<string, unknown>) => ({
        productId: String(p.productId || ""),
        productName: String(p.productName || ""),
        originalPrice:
          typeof p.originalPrice === "number" ? p.originalPrice : 0,
        imageUrl: p.imageUrl ? String(p.imageUrl) : null,
      })),
      totalBundlePrice:
        typeof data.totalBundlePrice === "number" ? data.totalBundlePrice : 0,
      totalOriginalPrice:
        typeof data.totalOriginalPrice === "number"
          ? data.totalOriginalPrice
          : 0,
      discountPercentage:
        typeof data.discountPercentage === "number"
          ? data.discountPercentage
          : 0,
      currency: String(data.currency || "TL"),
      isActive: data.isActive === true,
    };
  });
}

// Legacy bundle shape (kept for back-compat with the old
// `bundles where mainProductId == productId` schema, if anything still
// reads from it).
export async function fetchLegacyBundlesForProductClient(
  productId: string,
  shopId: string | null
): Promise<BundleInfo[]> {
  if (!shopId || shopId.trim() === "" || !productId) return [];
  const snap = await getDocs(
    query(
      collection(db, "bundles"),
      where("shopId", "==", shopId),
      where("mainProductId", "==", productId),
      where("isActive", "==", true),
      qLimit(10)
    )
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      mainProductId: String(data.mainProductId || ""),
      bundleItems: Array.isArray(data.bundleItems) ? data.bundleItems : [],
      isActive: data.isActive === true,
    };
  });
}

// ─── Products (single + batch) ─────────────────────────────────────────

// `canonicalId` accepts the same forms the API does:
//   "p:<id>"  → products/<id>
//   "sp:<id>" → shop_products/<id>
//   "<id>"    → probe both (legacy)
async function getProductDocByCanonical(
  canonicalId: string
): Promise<DocumentSnapshot<DocumentData> | null> {
  let snap: DocumentSnapshot<DocumentData> | null = null;
  if (canonicalId.startsWith("p:")) {
    const id = canonicalId.substring(2);
    const s = await getDoc(doc(db, "products", id));
    if (s.exists()) snap = s;
  } else if (canonicalId.startsWith("sp:")) {
    const id = canonicalId.substring(3);
    const s = await getDoc(doc(db, "shop_products", id));
    if (s.exists()) snap = s;
  } else {
    const [pSnap, spSnap] = await Promise.all([
      getDoc(doc(db, "products", canonicalId)),
      getDoc(doc(db, "shop_products", canonicalId)),
    ]);
    if (pSnap.exists()) snap = pSnap;
    else if (spSnap.exists()) snap = spSnap;
  }
  return snap;
}

function snapshotToProduct(
  snap: DocumentSnapshot<DocumentData>
): Product | null {
  const data = snap.data();
  if (!data) return null;
  try {
    return ProductUtils.fromJson({
      ...data,
      id: snap.id,
      reference: {
        id: snap.id,
        path: snap.ref.path,
        parent: { id: snap.ref.parent.id },
      },
    });
  } catch (err) {
    console.error(`Error parsing product ${snap.id}:`, err);
    return null;
  }
}

export async function fetchProductByIdClient(
  canonicalOrRawId: string
): Promise<Product | null> {
  const trimmed = canonicalOrRawId.trim();
  if (!trimmed) return null;
  let canonical = trimmed;
  if (trimmed.startsWith("shop_products_")) {
    canonical = `sp:${trimmed.substring("shop_products_".length)}`;
  } else if (trimmed.startsWith("products_")) {
    canonical = `p:${trimmed.substring("products_".length)}`;
  }
  const snap = await getProductDocByCanonical(canonical);
  return snap ? snapshotToProduct(snap) : null;
}

// Batch fetch — mirrors /api/products/batch. Order in returned array
// matches the input `ids` order.
export async function fetchProductsBatchClient(
  ids: string[]
): Promise<Product[]> {
  const cleaned = ids
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .slice(0, 15);
  if (cleaned.length === 0) return [];

  const results = await Promise.all(
    cleaned.map((id) => fetchProductByIdClient(id))
  );
  // Preserve input order; drop nulls
  return results.filter((p): p is Product => p !== null);
}
