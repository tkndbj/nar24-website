// personalizedFeedService.ts
// Fetches personalized or trending product IDs with localStorage caching.

import { getFirebaseDb, getFirebaseAuth } from "@/lib/firebase-lazy";

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

// ── Firestore fetchers ──────────────────────────────────────────────────────

async function fetchTrending(): Promise<string[]> {
  const cached = readCache(CACHE_KEYS.trendingProducts, CACHE_KEYS.trendingExpiry);
  if (cached) return cached;

  const [db, { doc, getDoc }] = await Promise.all([
    getFirebaseDb(),
    import("firebase/firestore"),
  ]);

  const snap = await getDoc(doc(db, "trending_products", "global"));
  if (!snap.exists()) return [];

  const ids = (snap.data().products || []) as string[];
  if (ids.length === 0) return [];

  writeCache(CACHE_KEYS.trendingProducts, CACHE_KEYS.trendingExpiry, ids, TTL.trending);
  return ids;
}

async function fetchPersonalized(userId: string): Promise<string[]> {
  const cached = readCache(CACHE_KEYS.personalizedFeed, CACHE_KEYS.personalizedExpiry);
  if (cached) return cached;

  const [db, { doc, getDoc }] = await Promise.all([
    getFirebaseDb(),
    import("firebase/firestore"),
  ]);

  const snap = await getDoc(
    doc(db, "user_profiles", userId, "personalized_feed", "current"),
  );

  if (!snap.exists()) return fetchTrending();

  const data = snap.data();

  // Stale feed (>3 days) → fall back to trending
  if (data.lastComputed) {
    const ageMs = Date.now() - data.lastComputed.toMillis();
    if (ageMs > STALE_DAYS * 24 * 60 * 60 * 1000) return fetchTrending();
  }

  const ids = (data.productIds || []) as string[];
  if (ids.length === 0) return fetchTrending();

  writeCache(CACHE_KEYS.personalizedFeed, CACHE_KEYS.personalizedExpiry, ids, TTL.personalized);
  return ids;
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

  /** Clear caches and re-fetch on next getProductIds call. */
  async forceRefresh(): Promise<void> {
    clearAllCaches();
  },

  /** Clear all localStorage caches (call on logout). */
  async clearCache(): Promise<void> {
    clearAllCaches();
  },
};

export default personalizedFeedService;
