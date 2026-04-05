// src/app/api/products/[productId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getFirestoreAdmin } from "@/lib/firebase-admin";

// Helper functions to safely parse data (matching Flutter's approach)
function safeDouble(value: unknown, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || defaultValue;
  return defaultValue;
}

function safeInt(value: unknown, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'number') return Math.floor(value);
  if (typeof value === 'string') return parseInt(value) || defaultValue;
  return defaultValue;
}

function safeString(value: unknown, defaultValue: string = ''): string {
  if (value === null || value === undefined) return defaultValue;
  return String(value);
}

function safeStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(e => String(e));
  if (typeof value === 'string') return value.trim() === '' ? [] : [value];
  return [];
}

function safeColorQuantities(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(value)) {
    result[String(key)] = safeInt(val);
  }
  return result;
}

function safeColorImages(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(value)) {
    if (Array.isArray(val)) {
      result[String(key)] = val.map(e => String(e));
    } else if (typeof val === 'string' && val.trim() !== '') {
      result[String(key)] = [String(val)];
    }
  }
  return result;
}

function safeStringNullable(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function parseTimestamp(value: unknown): number | null {
  if (!value) return null;

  if (value && typeof value === 'object' && '_seconds' in value && typeof (value as { _seconds: unknown })._seconds === 'number') {
    return (value as { _seconds: number })._seconds * 1000;
  }

  if (typeof value === 'number') {
    return value > 10000000000 ? value : value * 1000;
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.getTime();
  }

  return null;
}

// ============= CORE DATA FETCHING =============

// canonicalId formats:
//   "p:<id>"  → products collection (single read)
//   "sp:<id>" → shop_products collection (single read)
//   "<id>"    → unknown, fall back to parallel dual read
async function fetchProductData(canonicalId: string): Promise<Record<string, unknown> | null> {
  const db = getFirestoreAdmin();

  let doc: FirebaseFirestore.DocumentSnapshot | null = null;
  let collection = "";

  if (canonicalId.startsWith("p:")) {
    const id = canonicalId.substring(2);
    const snap = await db.collection("products").doc(id).get();
    if (snap.exists) { doc = snap; collection = "products"; }
  } else if (canonicalId.startsWith("sp:")) {
    const id = canonicalId.substring(3);
    const snap = await db.collection("shop_products").doc(id).get();
    if (snap.exists) { doc = snap; collection = "shop_products"; }
  } else {
    // No collection hint — probe both in parallel (legacy fallback)
    const [productDoc, shopProductDoc] = await Promise.all([
      db.collection("products").doc(canonicalId).get(),
      db.collection("shop_products").doc(canonicalId).get(),
    ]);
    if (productDoc.exists) { doc = productDoc; collection = "products"; }
    else if (shopProductDoc.exists) { doc = shopProductDoc; collection = "shop_products"; }
  }

  if (!doc || !doc.exists) return null;

  const data = doc.data();
  if (!data) return null;

  const rawAttr = data.attributes;
  const attributes: Record<string, unknown> = rawAttr && typeof rawAttr === 'object' ? rawAttr : {};

  const product: Record<string, unknown> = {
    id: doc.id,
    productName: safeString(data.productName || data.title),
    description: safeString(data.description),
    price: safeDouble(data.price),
    currency: safeString(data.currency, 'TL'),
    condition: safeString(data.condition, 'Brand New'),
    brandModel: safeString(data.brandModel || data.brand || ''),
    imageUrls: safeStringArray(data.imageUrls),
    averageRating: safeDouble(data.averageRating),
    reviewCount: safeInt(data.reviewCount),
    gender: safeStringNullable(data.gender),
    originalPrice: data.originalPrice !== null && data.originalPrice !== undefined ? safeDouble(data.originalPrice) : null,
    discountPercentage: data.discountPercentage !== null && data.discountPercentage !== undefined ? safeInt(data.discountPercentage) : null,
    colorQuantities: safeColorQuantities(data.colorQuantities),
    boostClickCountAtStart: safeInt(data.boostClickCountAtStart),
    availableColors: safeStringArray(data.availableColors),
    userId: safeString(data.userId),
    discountThreshold: data.discountThreshold !== null && data.discountThreshold !== undefined ? safeInt(data.discountThreshold) : null,
    rankingScore: safeDouble(data.rankingScore),
    promotionScore: safeDouble(data.promotionScore),
    campaign: data.campaign?.toString() || null,
    campaignDiscount: data.campaignDiscount !== null && data.campaignDiscount !== undefined ? safeDouble(data.campaignDiscount) : null,
    campaignPrice: data.campaignPrice !== null && data.campaignPrice !== undefined ? safeDouble(data.campaignPrice) : null,
    ownerId: safeString(data.ownerId),
    shopId: data.shopId?.toString() || null,
    ilanNo: safeString(data.ilan_no || data.id, 'N/A'),
    searchIndex: safeStringArray(data.searchIndex),
    createdAt: parseTimestamp(data.createdAt) || Date.now(),
    sellerName: safeString(data.sellerName, 'Unknown'),
    category: safeString(data.category, 'Uncategorized'),
    subcategory: safeString(data.subcategory),
    subsubcategory: safeString(data.subsubcategory),
    quantity: safeInt(data.quantity),
    maxMetre: safeInt(data.maxMetre),
    bestSellerRank: data.bestSellerRank !== null && data.bestSellerRank !== undefined ? safeInt(data.bestSellerRank) : null,
    sold: data.sold === true,
    clickCount: safeInt(data.clickCount),
    clickCountAtStart: safeInt(data.clickCountAtStart),
    favoritesCount: safeInt(data.favoritesCount),
    cartCount: safeInt(data.cartCount),
    purchaseCount: safeInt(data.purchaseCount),
    deliveryOption: safeString(data.deliveryOption, 'Self Delivery'),
    boostedImpressionCount: safeInt(data.boostedImpressionCount),
    boostImpressionCountAtStart: safeInt(data.boostImpressionCountAtStart),
    isFeatured: data.isFeatured === true,
    isTrending: data.isTrending === true,
    isBoosted: data.isBoosted === true,
    boostStartTime: parseTimestamp(data.boostStartTime),
    boostEndTime: parseTimestamp(data.boostEndTime),
    dailyClickCount: safeInt(data.dailyClickCount),
    lastClickDate: parseTimestamp(data.lastClickDate),
    paused: data.paused === true,
    campaignName: data.campaignName?.toString() || null,
    colorImages: safeColorImages(data.colorImages),
    videoUrl: data.videoUrl?.toString() || null,
    attributes: attributes,
    relatedProductIds: safeStringArray(data.relatedProductIds),
    reference: {
      id: doc.id,
      path: `${collection}/${doc.id}`,
      parent: {
        id: collection
      }
    }
  };

  // Remove null/undefined values
  return Object.fromEntries(
    Object.entries(product).filter(([, value]) => value !== null && value !== undefined)
  );
}

// ============= SERVER-SIDE CACHE =============

const getCachedProduct = unstable_cache(
  fetchProductData,
  ["product-detail"],
  { revalidate: 120, tags: ["products"] },
);

// ============= HANDLER =============

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    // Rate limit: 60 requests/min per IP
    const { applyRateLimit } = await import("@/lib/auth-middleware");
    const limited = await applyRateLimit(request, 60, 60000);
    if (limited) return limited;

    const { productId } = await params;

    if (!productId || productId.trim() === "") {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    // Normalize incoming ID to canonical form used by fetchProductData and the cache:
    //   "products_<id>"      → "p:<id>"
    //   "shop_products_<id>" → "sp:<id>"
    //   "p:<id>" / "sp:<id>" → already canonical (batch-route format)
    //   "<id>"               → bare ID, dual-read fallback
    const trimmed = productId.trim();
    let canonicalId: string;
    if (trimmed.startsWith("shop_products_")) {
      canonicalId = `sp:${trimmed.substring("shop_products_".length)}`;
    } else if (trimmed.startsWith("products_")) {
      canonicalId = `p:${trimmed.substring("products_".length)}`;
    } else {
      canonicalId = trimmed; // handles "p:", "sp:", and bare IDs
    }

    if (canonicalId === "" || canonicalId === "p:" || canonicalId === "sp:") {
      return NextResponse.json(
        { error: "Invalid product ID format" },
        { status: 400 }
      );
    }

    const product = await getCachedProduct(canonicalId);

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(product, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("Error fetching product:", error);

    if (error instanceof Error) {
      if (error.message.includes("Firebase credentials") ||
          error.message.includes("Private key") ||
          error.message.includes("service account")) {
        return NextResponse.json(
          {
            error: "Firebase configuration error",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}
