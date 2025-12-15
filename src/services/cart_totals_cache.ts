// services/cart_totals_cache.ts - Production Grade Local Cache (Matching Flutter)

/**
 * Lightweight totals model for caching
 * Only stores what's needed - no heavy Product objects
 */
export interface CachedItemTotal {
  productId: string;
  unitPrice: number;
  total: number;
  quantity: number;
  isBundleItem: boolean;
}

export interface CachedCartTotals {
  total: number;
  currency: string;
  items: CachedItemTotal[];
}

interface CacheEntry {
  data: CachedCartTotals;
  createdAt: number;
  expiresAt: number;
}

/**
 * Production-grade in-memory cache for cart totals
 * Features:
 * - Automatic TTL expiration
 * - Memory-efficient (only stores computed totals)
 * - Instant invalidation on cart changes
 * - No external dependencies or exposed credentials
 */
class CartTotalsCache {
  private static instance: CartTotalsCache;

  // Cache storage
  private cache: Map<string, CacheEntry> = new Map();

  // Configuration
  private readonly DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
  private readonly MAX_CACHE_ENTRIES = 50; // Prevent memory bloat

  // Cleanup interval
  private cleanupInterval: NodeJS.Timeout | null = null;
  private initialized = false;

  private constructor() {}

  static getInstance(): CartTotalsCache {
    if (!CartTotalsCache.instance) {
      CartTotalsCache.instance = new CartTotalsCache();
    }
    return CartTotalsCache.instance;
  }

  /**
   * Initialize the cache with periodic cleanup
   */
  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.removeExpiredEntries();
    }, 5 * 60 * 1000);

    console.log("✅ CartTotalsCache initialized");
  }

  /**
   * Build cache key from user ID and product IDs
   */
  private buildKey(userId: string, productIds: string[]): string {
    const sorted = [...productIds].sort();
    return `${userId}:${sorted.join(",")}`;
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt;
  }

  /**
   * Get age of entry in seconds
   */
  private getAge(entry: CacheEntry): number {
    return Math.floor((Date.now() - entry.createdAt) / 1000);
  }

  /**
   * Get cached totals if valid
   */
  get(userId: string, productIds: string[]): CachedCartTotals | null {
    if (productIds.length === 0) return null;

    const key = this.buildKey(userId, productIds);
    const entry = this.cache.get(key);

    if (!entry) {
      console.log("📭 Cache miss: totals");
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      console.log("⏰ Cache expired: totals");
      return null;
    }

    console.log(`⚡ Cache hit: totals (${this.getAge(entry)}s old)`);
    return entry.data;
  }

  /**
   * Store totals in cache
   */
  set(
    userId: string,
    productIds: string[],
    totals: CachedCartTotals,
    ttlMs?: number
  ): void {
    if (productIds.length === 0) return;

    // Enforce max cache size (LRU-style: remove oldest entries)
    if (this.cache.size >= this.MAX_CACHE_ENTRIES) {
      this.evictOldestEntries(10); // Remove 10 oldest
    }

    const key = this.buildKey(userId, productIds);
    const now = Date.now();

    this.cache.set(key, {
      data: totals,
      createdAt: now,
      expiresAt: now + (ttlMs ?? this.DEFAULT_TTL_MS),
    });

    console.log(`💾 Cached totals: ${totals.total} ${totals.currency}`);
  }

  /**
   * Invalidate all cached totals for a user
   * Called when cart contents change (add/remove/update quantity)
   */
  invalidateForUser(userId: string): void {
    const keysToRemove: string[] = [];

    this.cache.forEach((_, key) => {
      if (key.startsWith(`${userId}:`)) {
        keysToRemove.push(key);
      }
    });

    keysToRemove.forEach((key) => this.cache.delete(key));

    if (keysToRemove.length > 0) {
      console.log(
        `🗑️ Invalidated ${keysToRemove.length} cached totals for user`
      );
    }
  }

  /**
   * Invalidate specific product combination
   */
  invalidateSpecific(userId: string, productIds: string[]): void {
    const key = this.buildKey(userId, productIds);
    if (this.cache.delete(key)) {
      console.log("🗑️ Invalidated specific cached total");
    }
  }

  /**
   * Clear all cache (e.g., on logout)
   */
  clearAll(): void {
    this.cache.clear();
    console.log("🗑️ Cleared all cached totals");
  }

  /**
   * Remove expired entries
   */
  private removeExpiredEntries(): void {
    const expiredKeys: string[] = [];

    this.cache.forEach((entry, key) => {
      if (this.isExpired(entry)) {
        expiredKeys.push(key);
      }
    });

    expiredKeys.forEach((key) => this.cache.delete(key));

    if (expiredKeys.length > 0) {
      console.log(`🧹 Removed ${expiredKeys.length} expired cache entries`);
    }
  }

  /**
   * Evict oldest entries when cache is full
   */
  private evictOldestEntries(count: number): void {
    const entries = Array.from(this.cache.entries()).sort(
      (a, b) => a[1].createdAt - b[1].createdAt
    );

    for (let i = 0; i < count && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }

    console.log(
      `🧹 Evicted ${Math.min(count, entries.length)} oldest cache entries`
    );
  }

  /**
   * Get cache statistics (for debugging)
   */
  getStats(): {
    totalEntries: number;
    validEntries: number;
    expiredEntries: number;
    maxEntries: number;
  } {
    let validEntries = 0;
    let expiredEntries = 0;

    this.cache.forEach((entry) => {
      if (this.isExpired(entry)) {
        expiredEntries++;
      } else {
        validEntries++;
      }
    });

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      maxEntries: this.MAX_CACHE_ENTRIES,
    };
  }

  /**
   * Dispose the cache
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
    this.initialized = false;
    console.log("🧹 CartTotalsCache disposed");
  }
}

// Export singleton instance
const cartTotalsCache = CartTotalsCache.getInstance();
export default cartTotalsCache;
