// src/app/api/fetchShopBundle/[shopId]/route.ts
//
// Single-roundtrip prefetch endpoint for the shop detail page.
//
// The legacy client component (`shopdetail/[id]/_client.tsx`) used to walk a
// waterfall: download JS → hydrate → fetch shop doc → wait → fetch products,
// reviews, collections, facets. This route collapses that into one server call
// so `page.tsx` can SSR-prefetch the entire bundle and seed the client.
//
// Composition:
//   • shop          ← Firestore Admin (single doc read)
//   • products      ← Typesense (always; no composite-index dependency)
//   • collections   ← Firestore Admin (subcollection)
//   • reviews       ← Firestore Admin (subcollection, limit 20)
//   • specFacets    ← Typesense
//
// All five run in parallel via Promise.allSettled — a slow facet call cannot
// block the shop doc, and a missing subcollection cannot fail the bundle.
//
// Cached server-side via `unstable_cache` (60 s) so a hot shop URL doesn't
// re-execute the five fan-out reads on every visit.

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { Timestamp } from "firebase-admin/firestore";
import type {
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { applyRateLimit } from "@/lib/auth-middleware";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import type { FacetCount } from "@/app/components/FilterSideBar";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  PRODUCTS_LIMIT: 20,
  REVIEWS_LIMIT: 20,
  CACHE_REVALIDATE_SECONDS: 60,
  REQUEST_TIMEOUT: 8_000,
  RATE_LIMIT_MAX: 60,
  RATE_LIMIT_WINDOW: 60_000,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Wire types — what the client actually consumes.
// Field names mirror what `_client.tsx` reads on the page; do not reshape
// without updating that consumer.
// ─────────────────────────────────────────────────────────────────────────────

interface SerialisedTimestamp {
  seconds: number;
  nanoseconds: number;
}

interface ShopWire {
  id: string;
  name: string;
  profileImageUrl: string;
  coverImageUrls: string[];
  homeImageUrls?: string[];
  homeImageLinks?: Record<string, string>;
  address: string;
  averageRating: number;
  reviewCount: number;
  followerCount: number;
  clickCount: number;
  categories: string[];
  contactNo: string;
  ownerId: string;
  isBoosted: boolean;
  createdAt: SerialisedTimestamp;
}

interface ShopCollectionWire {
  id: string;
  name: string;
  imageUrl?: string;
  productIds: string[];
  createdAt: SerialisedTimestamp;
}

interface ReviewWire {
  id: string;
  rating: number;
  review: string;
  timestamp: SerialisedTimestamp;
  userId: string;
  userName?: string;
  likes: string[];
}

export interface ShopBundleResponse {
  shop: ShopWire;
  products: Record<string, unknown>[];
  hasMore: boolean;
  collections: ShopCollectionWire[];
  reviews: ReviewWire[];
  specFacets: Record<string, FacetCount[]>;
  timing?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert any Firestore-y timestamp value to a JSON-safe `{seconds, nanoseconds}`.
 * Accepts Admin Timestamp instances, plain `{_seconds,_nanoseconds}` blobs
 * (post-JSON), `{seconds,nanoseconds}` (already wire-shaped), Date, or null.
 * Falls back to epoch zero so the client never sees `undefined.seconds`.
 */
function toWireTimestamp(value: unknown): SerialisedTimestamp {
  const ZERO: SerialisedTimestamp = { seconds: 0, nanoseconds: 0 };
  if (value == null) return ZERO;
  if (value instanceof Timestamp) {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof Date) {
    return { seconds: Math.floor(value.getTime() / 1000), nanoseconds: 0 };
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.seconds === "number" && typeof v.nanoseconds === "number") {
      return { seconds: v.seconds, nanoseconds: v.nanoseconds };
    }
    if (typeof v._seconds === "number" && typeof v._nanoseconds === "number") {
      return { seconds: v._seconds, nanoseconds: v._nanoseconds };
    }
  }
  return ZERO;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function asStringRecord(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function transformShop(id: string, data: DocumentData): ShopWire {
  return {
    id,
    name: asString(data.name),
    profileImageUrl: asString(data.profileImageUrl),
    coverImageUrls: asStringArray(data.coverImageUrls),
    homeImageUrls: Array.isArray(data.homeImageUrls)
      ? asStringArray(data.homeImageUrls)
      : undefined,
    homeImageLinks: asStringRecord(data.homeImageLinks),
    address: asString(data.address),
    averageRating: asNumber(data.averageRating),
    reviewCount: asNumber(data.reviewCount),
    followerCount: asNumber(data.followerCount),
    clickCount: asNumber(data.clickCount),
    categories: asStringArray(data.categories),
    contactNo: asString(data.contactNo),
    ownerId: asString(data.ownerId),
    isBoosted: data.isBoosted === true,
    createdAt: toWireTimestamp(data.createdAt),
  };
}

function transformCollection(
  doc: QueryDocumentSnapshot,
): ShopCollectionWire {
  const data = doc.data();
  return {
    id: doc.id,
    name: asString(data.name),
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : undefined,
    productIds: asStringArray(data.productIds),
    createdAt: toWireTimestamp(data.createdAt),
  };
}

function transformReview(doc: QueryDocumentSnapshot): ReviewWire {
  const data = doc.data();
  return {
    id: doc.id,
    rating: asNumber(data.rating),
    review: asString(data.review),
    timestamp: toWireTimestamp(data.timestamp),
    userId: asString(data.userId),
    userName: typeof data.userName === "string" ? data.userName : undefined,
    likes: asStringArray(data.likes),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-fetchers
// ─────────────────────────────────────────────────────────────────────────────

async function fetchShop(shopId: string): Promise<ShopWire | null> {
  const db = getFirestoreAdmin();
  const snap = await db.collection("shops").doc(shopId).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data) return null;
  return transformShop(snap.id, data);
}

async function fetchInitialProducts(
  shopId: string,
): Promise<{ products: Record<string, unknown>[]; hasMore: boolean }> {
  // Always Typesense — same call shape the client uses with shouldUseTypesense=false
  // would have hit Firestore, but the indexed Typesense path avoids requiring a
  // (shopId, createdAt desc) composite index in every environment.
  const res =
    await TypeSenseServiceManager.instance.shopService.searchIdsWithFacets({
      indexName: "shop_products",
      page: 0,
      hitsPerPage: CONFIG.PRODUCTS_LIMIT,
      sortOption: "date",
      additionalFilterBy: `shopId:=${shopId}`,
    });

  // Pass-through: the SSR layer re-runs ProductUtils.fromTypeSense on each hit
  // (mirroring how the client constructs Products from Typesense responses),
  // so we forward the raw hit shape without server-side parsing.
  const products = res.hits.map(
    (hit) => hit as unknown as Record<string, unknown>,
  );
  const hasMore = res.page < res.nbPages - 1;
  return { products, hasMore };
}

async function fetchCollections(
  shopId: string,
): Promise<ShopCollectionWire[]> {
  const db = getFirestoreAdmin();
  const snap = await db
    .collection("shops")
    .doc(shopId)
    .collection("collections")
    .orderBy("createdAt", "desc")
    .get();
  return snap.docs.map(transformCollection);
}

async function fetchReviews(shopId: string): Promise<ReviewWire[]> {
  const db = getFirestoreAdmin();
  const snap = await db
    .collection("shops")
    .doc(shopId)
    .collection("reviews")
    .orderBy("timestamp", "desc")
    .limit(CONFIG.REVIEWS_LIMIT)
    .get();
  return snap.docs.map(transformReview);
}

async function fetchSpecFacets(
  shopId: string,
): Promise<Record<string, FacetCount[]>> {
  return await TypeSenseServiceManager.instance.shopService.fetchSpecFacets({
    indexName: "shop_products",
    additionalFilterBy: `shopId:=${shopId}`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bundle composer
// ─────────────────────────────────────────────────────────────────────────────

class ShopNotFoundError extends Error {
  constructor() {
    super("Shop not found");
    this.name = "ShopNotFoundError";
  }
}

async function fetchShopBundleData(shopId: string): Promise<ShopBundleResponse> {
  const t0 = Date.now();

  // Run everything in parallel. Use allSettled so a non-critical sub-fetch
  // failure (e.g. Typesense facet hiccup) doesn't poison the whole bundle.
  const [shopRes, productsRes, collectionsRes, reviewsRes, facetsRes] =
    await Promise.allSettled([
      fetchShop(shopId),
      fetchInitialProducts(shopId),
      fetchCollections(shopId),
      fetchReviews(shopId),
      fetchSpecFacets(shopId),
    ]);

  // Shop is the one truly required piece — no shop, no page.
  if (shopRes.status !== "fulfilled" || shopRes.value == null) {
    throw new ShopNotFoundError();
  }

  const products =
    productsRes.status === "fulfilled" ? productsRes.value.products : [];
  const hasMore =
    productsRes.status === "fulfilled" ? productsRes.value.hasMore : false;
  const collections =
    collectionsRes.status === "fulfilled" ? collectionsRes.value : [];
  const reviews = reviewsRes.status === "fulfilled" ? reviewsRes.value : [];
  const specFacets =
    facetsRes.status === "fulfilled" ? facetsRes.value : {};

  // Surface non-fatal failures in logs so they're visible in production.
  if (productsRes.status === "rejected") {
    console.warn("[fetchShopBundle] products fetch failed:", productsRes.reason);
  }
  if (collectionsRes.status === "rejected") {
    console.warn(
      "[fetchShopBundle] collections fetch failed:",
      collectionsRes.reason,
    );
  }
  if (reviewsRes.status === "rejected") {
    console.warn("[fetchShopBundle] reviews fetch failed:", reviewsRes.reason);
  }
  if (facetsRes.status === "rejected") {
    console.warn("[fetchShopBundle] facets fetch failed:", facetsRes.reason);
  }

  return {
    shop: shopRes.value,
    products,
    hasMore,
    collections,
    reviews,
    specFacets,
    timing: Date.now() - t0,
  };
}

// `unstable_cache` keys on the function arguments — passing shopId as the
// first arg gives us per-shop cache scoping for free.
const cachedFetchShopBundle = unstable_cache(
  fetchShopBundleData,
  ["shop-bundle"],
  {
    revalidate: CONFIG.CACHE_REVALIDATE_SECONDS,
    tags: ["shop-bundle"],
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error("Request timeout")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ shopId: string }> },
) {
  const t0 = Date.now();

  try {
    const limited = await applyRateLimit(
      request,
      CONFIG.RATE_LIMIT_MAX,
      CONFIG.RATE_LIMIT_WINDOW,
    );
    if (limited) return limited;

    const { shopId: rawShopId } = await context.params;
    const shopId = rawShopId?.trim();
    if (!shopId) {
      return NextResponse.json(
        { error: "shopId is required" },
        { status: 400 },
      );
    }

    const result = await withTimeout(
      cachedFetchShopBundle(shopId),
      CONFIG.REQUEST_TIMEOUT,
    );

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
        "X-Response-Time": `${Date.now() - t0}ms`,
      },
    });
  } catch (err) {
    if (err instanceof ShopNotFoundError) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }
    if (err instanceof Error && err.message === "Request timeout") {
      return NextResponse.json(
        { error: "Request timeout" },
        { status: 504 },
      );
    }
    console.error("[fetchShopBundle] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { verifyAuth, verifyAdmin } = await import("@/lib/auth-middleware");
  const auth = await verifyAuth(request);
  if (auth.error) return auth.error;
  const adminCheck = await verifyAdmin(auth.isAdmin ?? false);
  if (adminCheck.error) return adminCheck.error;

  revalidateTag("shop-bundle");
  return NextResponse.json({ message: "Cache invalidated" });
}
