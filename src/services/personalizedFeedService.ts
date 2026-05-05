// personalizedFeedService.ts
// Fetches personalized or trending product IDs with localStorage caching.
//
// Manifest pattern (added 2026-05): the personalized feed CF now embeds the
// top-N product summaries inline in `user_profiles/{uid}.feed.products`, so
// the home preference widget can render with 1 read instead of 1 (profile)
// + 30 (whereIn). `getTopProducts()` exposes those embedded summaries.
// Falls back gracefully when the field is missing (older docs or CF byte-
// budget guard skipped the embed).

import { getFirebaseDb, getFirebaseAuth } from "@/lib/firebase-lazy";
import { ProductUtils, type Product } from "@/app/models/Product";

// ── Cache config ────────────────────────────────────────────────────────────

const CACHE_KEYS = {
  personalizedFeed: "personalized_feed_cache",
  personalizedExpiry: "personalized_feed_expiry",
  trendingProducts: "trending_products_cache",
  trendingExpiry: "trending_products_expiry",
} as const;

const TTL = {
  personalized: 6 * 60 * 60 * 1000, // 6 hours
  trending: 2 * 60 * 60 * 1000, // 2 hours
} as const;

const STALE_DAYS = 3; // Feed older than this falls back to trending

// In-memory cache for the embedded top-N product summaries. Lives only as
// long as the page session (no localStorage persistence — Product objects
// don't always round-trip cleanly through JSON, and a single doc read on
// a fresh page load is cheap). Null when:
//   * user is unauthenticated
//   * user_profile doc predates the embedded-products rollout
//   * CF byte-budget guard skipped the embed
//   * trending fallback path was taken
let cachedTopProducts: Product[] | null = null;

// In-memory cache for the embedded top-N trending summaries from
// `trending_products/global.productSummaries`. Same lifecycle rules as
// `cachedTopProducts`. Used by `getTrendingTopProducts()` to render the
// home preference widget for unauthenticated users with 1 read.
let cachedTopTrendingProducts: Product[] | null = null;

// ── Cache helpers ───────────────────────────────────────────────────────────

function readCache(dataKey: string, expiryKey: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(dataKey);
    const exp = localStorage.getItem(expiryKey);
    if (raw && exp && Number(exp) > Date.now()) return JSON.parse(raw);
  } catch { /* corrupted cache — ignore */ }
  return null;
}

function writeCache(dataKey: string, expiryKey: string, ids: string[], ttl: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(dataKey, JSON.stringify(ids));
    localStorage.setItem(expiryKey, String(Date.now() + ttl));
  } catch { /* quota exceeded — ignore */ }
}

function clearAllCaches(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.values(CACHE_KEYS)) localStorage.removeItem(key);
  } catch { /* ignore */ }
}

/**
 * Parse the `feed.products` array from the user_profile doc into typed
 * Product objects. Returns null on any malformed input — caller treats as
 * "no embedded data" and falls back to the IDs path.
 */
function parseEmbeddedProducts(raw: unknown): Product[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  try {
    const result: Product[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      try {
        result.push(ProductUtils.fromJson(item as Record<string, unknown>));
      } catch (e) {
        // Skip individual malformed entries; don't fail the whole batch.
        console.warn("⚠️ Skipping malformed embedded product:", e);
      }
    }
    return result.length > 0 ? result : null;
  } catch (e) {
    console.warn("⚠️ Failed to parse embedded products:", e);
    return null;
  }
}

// ── Firestore fetchers ──────────────────────────────────────────────────────

async function fetchTrending(): Promise<string[]> {
  const cached = readCache(CACHE_KEYS.trendingProducts, CACHE_KEYS.trendingExpiry);
  if (cached) return cached;

  const [db, { doc, getDoc }] = await Promise.all([
    getFirebaseDb(),
    import("firebase/firestore"),
  ]);

  const snap = await getDoc(doc(db, "trending_products", "global"));
  if (!snap.exists()) {
    cachedTopTrendingProducts = null;
    return [];
  }

  const data = snap.data();
  const ids = (data.products || []) as string[];
  if (ids.length === 0) {
    cachedTopTrendingProducts = null;
    return [];
  }

  // Manifest fast path: parse embedded summaries when the CF wrote them.
  // Side-effect populates `cachedTopTrendingProducts` so subsequent
  // `getTrendingTopProducts()` calls within this session hit the memory
  // cache. Falls back to null when the doc predates the embed rollout.
  cachedTopTrendingProducts = parseEmbeddedProducts(data.productSummaries);

  writeCache(CACHE_KEYS.trendingProducts, CACHE_KEYS.trendingExpiry, ids, TTL.trending);
  return ids;
}

/**
 * Direct doc read for embedded trending summaries. Used when
 * `cachedTopTrendingProducts` is empty but `getProductIds` already returned a
 * localStorage hit (so `fetchTrending` didn't run this session).
 */
async function fetchEmbeddedTrendingProducts(): Promise<Product[] | null> {
  const [db, { doc, getDoc }] = await Promise.all([
    getFirebaseDb(),
    import("firebase/firestore"),
  ]);

  const snap = await getDoc(doc(db, "trending_products", "global"));
  if (!snap.exists()) {
    cachedTopTrendingProducts = null;
    return null;
  }

  const data = snap.data();

  // Refresh the IDs cache while we have the doc open — costs nothing extra.
  const ids = (data.products || []) as string[];
  if (ids.length > 0) {
    writeCache(
      CACHE_KEYS.trendingProducts,
      CACHE_KEYS.trendingExpiry,
      ids,
      TTL.trending,
    );
  }

  cachedTopTrendingProducts = parseEmbeddedProducts(data.productSummaries);
  return cachedTopTrendingProducts;
}

async function fetchPersonalized(userId: string): Promise<string[]> {
  const cached = readCache(CACHE_KEYS.personalizedFeed, CACHE_KEYS.personalizedExpiry);
  if (cached) return cached;

  const [db, { doc, getDoc }] = await Promise.all([
    getFirebaseDb(),
    import("firebase/firestore"),
  ]);

  const snap = await getDoc(doc(db, "user_profiles", userId));

  if (!snap.exists() || !snap.data().feed) {
    cachedTopProducts = null;
    return fetchTrending();
  }

  const data = snap.data().feed;

  // Stale feed (>3 days) → fall back to trending
  if (data.lastComputed) {
    const ageMs = Date.now() - data.lastComputed.toMillis();
    if (ageMs > STALE_DAYS * 24 * 60 * 60 * 1000) {
      cachedTopProducts = null;
      return fetchTrending();
    }
  }

  const ids = (data.productIds || []) as string[];
  if (ids.length === 0) {
    cachedTopProducts = null;
    return fetchTrending();
  }

  // Manifest fast path: parse embedded summaries when the CF wrote them.
  // Side-effect populates `cachedTopProducts` so subsequent
  // `getTopProducts()` calls within this session hit the memory cache.
  cachedTopProducts = parseEmbeddedProducts(data.products);

  writeCache(CACHE_KEYS.personalizedFeed, CACHE_KEYS.personalizedExpiry, ids, TTL.personalized);
  return ids;
}

/**
 * Direct doc read for embedded summaries. Used when `cachedTopProducts` is
 * empty but `getProductIds` already returned a localStorage hit (so
 * `fetchPersonalized` didn't run this session). Populates both the memory
 * cache and the localStorage IDs cache as side effects.
 */
async function fetchEmbeddedProducts(userId: string): Promise<Product[] | null> {
  const [db, { doc, getDoc }] = await Promise.all([
    getFirebaseDb(),
    import("firebase/firestore"),
  ]);

  const snap = await getDoc(doc(db, "user_profiles", userId));

  if (!snap.exists() || !snap.data().feed) {
    cachedTopProducts = null;
    return null;
  }

  const data = snap.data().feed;

  if (data.lastComputed) {
    const ageMs = Date.now() - data.lastComputed.toMillis();
    if (ageMs > STALE_DAYS * 24 * 60 * 60 * 1000) {
      cachedTopProducts = null;
      return null;
    }
  }

  // Refresh the IDs cache while we have the doc open — costs nothing extra.
  const ids = (data.productIds || []) as string[];
  if (ids.length > 0) {
    writeCache(
      CACHE_KEYS.personalizedFeed,
      CACHE_KEYS.personalizedExpiry,
      ids,
      TTL.personalized,
    );
  }

  cachedTopProducts = parseEmbeddedProducts(data.products);
  return cachedTopProducts;
}

// ── Public API (same shape as before — no consumer changes needed) ──────────

export const personalizedFeedService = {
  /** No-op — caching is handled lazily. Kept for backward compat. */
  async initialize(): Promise<void> {},

  /** Get product IDs: personalized for logged-in users, trending otherwise. */
  async getProductIds(): Promise<string[]> {
    try {
      const auth = await getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) return fetchTrending();
      return await fetchPersonalized(user.uid);
    } catch {
      return readCache(CACHE_KEYS.trendingProducts, CACHE_KEYS.trendingExpiry) || [];
    }
  },

  /**
   * Get the top-N personalized products as embedded summaries — 1 Firestore
   * read instead of 1 (profile) + 30 (whereIn). Returns null when:
   *   * user is unauthenticated
   *   * the user_profile doc predates the embedded-products rollout
   *   * the CF byte-budget guard skipped the embed
   *   * any error occurs
   *
   * Callers should fall back to `getProductIds()` + a `whereIn` query when
   * this returns null.
   */
  async getTopProducts(): Promise<Product[] | null> {
    try {
      const auth = await getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) return null;

      // Memory cache hit — no Firestore read.
      if (cachedTopProducts !== null) return cachedTopProducts;

      // Memory empty: either we never read the doc this session, or the
      // last read returned null (no embedded data). Fetch directly; the
      // result is cached for subsequent calls regardless of outcome.
      return await fetchEmbeddedProducts(user.uid);
    } catch (e) {
      console.warn("getTopProducts error:", e);
      return null;
    }
  },

  /**
   * Get the top-N trending products as embedded summaries — 1 Firestore read
   * (the `trending_products/global` doc) instead of 1 + 30 (whereIn). Used
   * by the home preference widget for unauthenticated users.
   *
   * Returns null when:
   *   * the trending doc predates the embedded-products rollout
   *   * any error occurs
   *
   * Callers should fall back to `getProductIds()` + a `whereIn` query when
   * this returns null.
   */
  async getTrendingTopProducts(): Promise<Product[] | null> {
    try {
      // Memory cache hit — no Firestore read.
      if (cachedTopTrendingProducts !== null) return cachedTopTrendingProducts;

      return await fetchEmbeddedTrendingProducts();
    } catch (e) {
      console.warn("getTrendingTopProducts error:", e);
      return null;
    }
  },

  /** Clear caches and re-fetch on next getProductIds call. */
  async forceRefresh(): Promise<void> {
    cachedTopProducts = null;
    cachedTopTrendingProducts = null;
    clearAllCaches();
  },

  /** Clear all localStorage caches (call on logout). */
  async clearCache(): Promise<void> {
    cachedTopProducts = null;
    cachedTopTrendingProducts = null;
    clearAllCaches();
  },
};

export default personalizedFeedService;
