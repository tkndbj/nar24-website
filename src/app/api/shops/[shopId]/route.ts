// src/app/api/shops/[shopId]/route.ts
//
// SHOP DETAIL API
// Uses Next.js unstable_cache for server-side caching that persists across
// Vercel serverless invocations, replacing in-memory Maps.

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/auth-middleware";

// ============= CONFIGURATION =============

const CONFIG = {
  CACHE_REVALIDATE_SECONDS: 120, // 2 minutes
  REQUEST_TIMEOUT: 8000,
  MAX_RETRIES: 2,
  BASE_RETRY_DELAY: 100,
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: 60000,
} as const;

// ============= TYPES =============

interface ShopResponse {
  id: string;
  name: string;
  profileImageUrl: string;
  averageRating: number;
  description: string;
  ownerId: string;
  coOwners: string[];
  editors: string[];
  viewers: string[];
  createdAt: string | null;
  updatedAt: string | null;
  isActive: boolean;
  contactEmail: string;
  contactPhone: string;
  address: Record<string, unknown>;
  socialLinks: Record<string, unknown>;
  businessHours: Record<string, unknown>;
  categories: string[];
  totalProducts: number;
  totalSales: number;
  timing?: number;
}

// ============= RETRY LOGIC =============

async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const {
    maxRetries = CONFIG.MAX_RETRIES,
    baseDelay = CONFIG.BASE_RETRY_DELAY,
    shouldRetry = () => true,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!shouldRetry(error) || attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ============= TIMESTAMP PARSER =============

function parseTimestamp(value: unknown): string | null {
  if (!value) return null;

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
      (value as { _seconds: number })._seconds * 1000,
    ).toISOString();
  }

  if (typeof value === "number") {
    const ms = value > 10000000000 ? value : value * 1000;
    return new Date(ms).toISOString();
  }

  if (typeof value === "string") {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}

// ============= SHOP DATA TRANSFORMER =============

function transformShopData(
  shopId: string,
  shopData: FirebaseFirestore.DocumentData,
): ShopResponse {
  return {
    id: shopId,
    name: shopData.name || "",
    profileImageUrl: shopData.profileImageUrl || shopData.logoUrl || "",
    averageRating:
      typeof shopData.averageRating === "number" ? shopData.averageRating : 0,
    description: shopData.description || "",
    ownerId: shopData.ownerId || "",
    coOwners: Array.isArray(shopData.coOwners) ? shopData.coOwners : [],
    editors: Array.isArray(shopData.editors) ? shopData.editors : [],
    viewers: Array.isArray(shopData.viewers) ? shopData.viewers : [],
    createdAt: parseTimestamp(shopData.createdAt),
    updatedAt: parseTimestamp(shopData.updatedAt),
    isActive: shopData.isActive !== false,
    contactEmail: shopData.contactEmail || "",
    contactPhone: shopData.contactPhone || "",
    address:
      typeof shopData.address === "object" && shopData.address
        ? shopData.address
        : {},
    socialLinks:
      typeof shopData.socialLinks === "object" && shopData.socialLinks
        ? shopData.socialLinks
        : {},
    businessHours:
      typeof shopData.businessHours === "object" && shopData.businessHours
        ? shopData.businessHours
        : {},
    categories: Array.isArray(shopData.categories) ? shopData.categories : [],
    totalProducts:
      typeof shopData.totalProducts === "number" ? shopData.totalProducts : 0,
    totalSales:
      typeof shopData.totalSales === "number" ? shopData.totalSales : 0,
  };
}

// ============= CORE DATA FETCHING =============

async function fetchShopData(shopId: string): Promise<ShopResponse> {
  const startTime = Date.now();
  const db = getFirestoreAdmin();

  const shopDoc = await withRetry(
    () => db.collection("shops").doc(shopId).get(),
    {
      maxRetries: CONFIG.MAX_RETRIES,
      shouldRetry: (error) => {
        if (error instanceof Error && error.message.includes("permission")) {
          return false;
        }
        return true;
      },
    },
  );

  if (!shopDoc.exists) {
    throw new Error("Shop not found");
  }

  const shopData = shopDoc.data();
  if (!shopData) {
    throw new Error("Shop data is empty");
  }

  const response = transformShopData(shopId, shopData);
  response.timing = Date.now() - startTime;

  return response;
}

// ============= SERVER-SIDE CACHE =============

const getCachedShopData = unstable_cache(
  fetchShopData,
  ["shop-detail"],
  { revalidate: CONFIG.CACHE_REVALIDATE_SECONDS, tags: ["shops"] },
);

// ============= MAIN HANDLER =============

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ shopId: string }> },
) {
  const requestStart = Date.now();

  try {
    const { shopId } = await context.params;

    if (!shopId || shopId.trim() === "") {
      return NextResponse.json(
        { error: "Shop ID is required" },
        { status: 400 },
      );
    }

    const normalizedShopId = shopId.trim();

    // Rate limiting
    const clientIp =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rateLimitResult = await checkRateLimit(
      clientIp,
      CONFIG.RATE_LIMIT_MAX,
      CONFIG.RATE_LIMIT_WINDOW,
    );
    if (rateLimitResult.error) {
      return rateLimitResult.error;
    }

    const result = await getCachedShopData(normalizedShopId);

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, max-age=120, stale-while-revalidate=60",
        "X-Response-Time": `${Date.now() - requestStart}ms`,
      },
    });
  } catch (error) {
    console.error("[shops] Fetch error:", error);

    if (error instanceof Error && error.message === "Shop not found") {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    if (error instanceof Error && error.message.includes("timeout")) {
      return NextResponse.json(
        { error: "Request timeout", message: "Please try again" },
        { status: 504 },
      );
    }

    if (error instanceof Error && error.message.includes("permission")) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
