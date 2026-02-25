// src/app/api/shops/[shopId]/route.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// SHOP DETAIL API - PRODUCTION OPTIMIZED
// ═══════════════════════════════════════════════════════════════════════════
//
// OPTIMIZATIONS:
// 1. Request Deduplication - Prevents duplicate in-flight requests
// 2. Retry with Exponential Backoff - Handles transient Firestore failures
// 3. Stale-While-Revalidate Caching - Fast responses with background refresh
// 4. Request Timeout - Prevents hanging requests
// 5. Rate Limiting Integration - Preserved from original
// 6. Structured Error Handling - Consistent error responses
//
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/auth-middleware";

// ============= CONFIGURATION =============

const CONFIG = {
  // Caching
  CACHE_TTL: 2 * 60 * 1000, // 2 minutes - fresh
  STALE_TTL: 5 * 60 * 1000, // 5 minutes - stale but usable
  MAX_CACHE_SIZE: 100,

  // Resilience
  REQUEST_TIMEOUT: 8000, // 8 seconds
  MAX_RETRIES: 2,
  BASE_RETRY_DELAY: 100,

  // Rate Limiting
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_WINDOW: 60000, // 1 minute
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
  source?: "cache" | "stale" | "dedupe" | "fresh";
  timing?: number;
}

interface CacheEntry {
  data: ShopResponse;
  timestamp: number;
}

interface CacheResult {
  data: ShopResponse | null;
  status: "fresh" | "stale" | "expired" | "miss";
}

// ============= REQUEST DEDUPLICATION =============

const pendingRequests = new Map<string, Promise<ShopResponse>>();

// ============= RESPONSE CACHING =============

const responseCache = new Map<string, CacheEntry>();

function getCachedResponse(shopId: string): CacheResult {
  const entry = responseCache.get(shopId);

  if (!entry) {
    return { data: null, status: "miss" };
  }

  const age = Date.now() - entry.timestamp;

  if (age <= CONFIG.CACHE_TTL) {
    return { data: entry.data, status: "fresh" };
  }

  if (age <= CONFIG.STALE_TTL) {
    return { data: entry.data, status: "stale" };
  }

  responseCache.delete(shopId);
  return { data: null, status: "expired" };
}

function cacheResponse(shopId: string, data: ShopResponse): void {
  // LRU eviction if needed
  if (responseCache.size >= CONFIG.MAX_CACHE_SIZE) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }

  responseCache.set(shopId, { data, timestamp: Date.now() });
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

// ============= TIMEOUT WRAPPER =============

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = "Request timeout",
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

// ============= TIMESTAMP PARSER =============

function parseTimestamp(value: unknown): string | null {
  if (!value) return null;

  // Handle Firestore Timestamp with toDate()
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
      (value as { _seconds: number })._seconds * 1000,
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
        // Don't retry on permission errors
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
  response.source = "fresh";
  response.timing = Date.now() - startTime;

  return response;
}

// ============= BACKGROUND REVALIDATION =============

function revalidateInBackground(shopId: string): void {
  if (pendingRequests.has(shopId)) {
    return;
  }

  const fetchPromise = fetchShopData(shopId);
  pendingRequests.set(shopId, fetchPromise);

  fetchPromise
    .then((result) => {
      cacheResponse(shopId, result);
      console.log(`[shops] Background revalidation complete for ${shopId}`);
    })
    .catch((error) => {
      console.error(
        `[shops] Background revalidation failed for ${shopId}:`,
        error,
      );
    })
    .finally(() => {
      pendingRequests.delete(shopId);
    });
}

// ============= MAIN HANDLER =============

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ shopId: string }> },
) {
  const requestStart = Date.now();

  try {
    const { shopId } = await context.params;

    // Validate shopId
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

    // ========== STEP 1: Check cache ==========
    const cacheResult = getCachedResponse(normalizedShopId);

    if (cacheResult.status === "fresh") {
      console.log(`[shops] Cache HIT (fresh) for ${normalizedShopId}`);
      return NextResponse.json(
        { ...cacheResult.data, source: "cache" },
        {
          headers: {
            "Cache-Control": "public, max-age=120, stale-while-revalidate=60",
            "X-Cache": "HIT",
            "X-Response-Time": `${Date.now() - requestStart}ms`,
          },
        },
      );
    }

    // ========== STEP 2: Check for in-flight request ==========
    const pendingRequest = pendingRequests.get(normalizedShopId);

    if (pendingRequest) {
      console.log(`[shops] Deduplicating request for ${normalizedShopId}`);

      // Return stale data if available
      if (cacheResult.status === "stale" && cacheResult.data) {
        return NextResponse.json(
          { ...cacheResult.data, source: "stale" },
          {
            headers: {
              "Cache-Control": "public, max-age=0, stale-while-revalidate=120",
              "X-Cache": "STALE",
              "X-Response-Time": `${Date.now() - requestStart}ms`,
            },
          },
        );
      }

      // Wait for pending request
      try {
        const result = await withTimeout(
          pendingRequest,
          CONFIG.REQUEST_TIMEOUT,
          "Deduplicated request timeout",
        );
        return NextResponse.json(
          { ...result, source: "dedupe" },
          {
            headers: {
              "Cache-Control": "public, max-age=120, stale-while-revalidate=60",
              "X-Cache": "DEDUPE",
              "X-Response-Time": `${Date.now() - requestStart}ms`,
            },
          },
        );
      } catch {
        // Fall through to fresh fetch
      }
    }

    // ========== STEP 3: Stale-while-revalidate ==========
    if (cacheResult.status === "stale" && cacheResult.data) {
      console.log(
        `[shops] Returning stale, revalidating in background for ${normalizedShopId}`,
      );
      revalidateInBackground(normalizedShopId);

      return NextResponse.json(
        { ...cacheResult.data, source: "stale" },
        {
          headers: {
            "Cache-Control": "public, max-age=0, stale-while-revalidate=120",
            "X-Cache": "STALE",
            "X-Response-Time": `${Date.now() - requestStart}ms`,
          },
        },
      );
    }

    // ========== STEP 4: Fresh fetch ==========
    console.log(`[shops] Fresh fetch for ${normalizedShopId}`);

    const fetchPromise = fetchShopData(normalizedShopId);
    pendingRequests.set(normalizedShopId, fetchPromise);

    try {
      const result = await withTimeout(
        fetchPromise,
        CONFIG.REQUEST_TIMEOUT,
        "Request timeout",
      );

      cacheResponse(normalizedShopId, result);

      console.log(
        `[shops] Fetched shop ${normalizedShopId} in ${result.timing}ms`,
      );

      return NextResponse.json(
        { ...result, source: "fresh" },
        {
          headers: {
            "Cache-Control": "public, max-age=120, stale-while-revalidate=60",
            "X-Cache": "MISS",
            "X-Response-Time": `${Date.now() - requestStart}ms`,
            "X-Timing": `${result.timing}ms`,
          },
        },
      );
    } catch (error) {
      console.error(`[shops] Fetch error for ${normalizedShopId}:`, error);

      // Handle "not found"
      if (error instanceof Error && error.message === "Shop not found") {
        return NextResponse.json({ error: "Shop not found" }, { status: 404 });
      }

      // Handle timeout
      if (error instanceof Error && error.message.includes("timeout")) {
        return NextResponse.json(
          { error: "Request timeout", message: "Please try again" },
          { status: 504 },
        );
      }

      // Handle permission errors
      if (error instanceof Error && error.message.includes("permission")) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }

      // Generic error
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    } finally {
      pendingRequests.delete(normalizedShopId);
    }
  } catch (error) {
    console.error("[shops] Unexpected error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
