/**
 * Cache Manager - Production-grade caching with TTL and LRU eviction
 * Matches Flutter's multi-cache system with automatic cleanup
 */

interface CacheEntry<T> {
    value: T;
    timestamp: number;
    accessCount: number;
    lastAccess: number;
  }
  
  interface CacheStats {
    hits: number;
    misses: number;
    size: number;
    evictions: number;
  }
  
  class CacheManager {
    private static instance: CacheManager;
    private caches = new Map<string, Map<string, CacheEntry<unknown>>>();
    private stats = new Map<string, CacheStats>();
    private cleanupTimer: NodeJS.Timeout | null = null;
    private nextCleanupNeeded: number | null = null;
  
    // Configuration (matching Flutter's approach)
    private readonly DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
    private readonly MAX_CACHE_SIZE = 100; // per cache
    private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
    private readonly MAX_TOTAL_CACHES = 20; // prevent unbounded cache creation
  
    private constructor() {
      this.startPeriodicCleanup();
      this.setupVisibilityHandler();
    }
  
    static getInstance(): CacheManager {
      if (!CacheManager.instance) {
        CacheManager.instance = new CacheManager();
      }
      return CacheManager.instance;
    }
  
    /**
     * Set a value in cache with optional TTL override
     */
    set<T>(
      cacheName: string,
      key: string,
      value: T,
      ttlMs: number = this.DEFAULT_TTL_MS
    ): void {
      if (!this.caches.has(cacheName)) {
        // Prevent unbounded cache creation
        if (this.caches.size >= this.MAX_TOTAL_CACHES) {
          console.warn(`⚠️ Max caches (${this.MAX_TOTAL_CACHES}) reached, removing oldest`);
          this.evictOldestCache();
        }
        this.caches.set(cacheName, new Map());
        this.stats.set(cacheName, { hits: 0, misses: 0, size: 0, evictions: 0 });
      }
  
      const cache = this.caches.get(cacheName)!;
      const now = Date.now();
  
      // Enforce size limit before adding
      if (cache.size >= this.MAX_CACHE_SIZE && !cache.has(key)) {
        this.evictLRU(cacheName);
      }
  
      cache.set(key, {
        value,
        timestamp: now,
        accessCount: 0,
        lastAccess: now,
      });
  
      this.stats.get(cacheName)!.size = cache.size;
  
      // Schedule cleanup if this is the earliest expiration
      const expiresAt = now + ttlMs;
      if (!this.nextCleanupNeeded || expiresAt < this.nextCleanupNeeded) {
        this.nextCleanupNeeded = expiresAt;
      }
    }
  
    /**
     * Get a value from cache (returns null if expired or missing)
     */
    get<T>(cacheName: string, key: string, ttlMs: number = this.DEFAULT_TTL_MS): T | null {
      const cache = this.caches.get(cacheName);
      const stats = this.stats.get(cacheName);
  
      if (!cache || !stats) {
        if (stats) stats.misses++;
        return null;
      }
  
      const entry = cache.get(key);
  
      if (!entry) {
        stats.misses++;
        return null;
      }
  
      const now = Date.now();
      const age = now - entry.timestamp;
  
      // Check if expired
      if (age > ttlMs) {
        cache.delete(key);
        stats.size = cache.size;
        stats.misses++;
        return null;
      }
  
      // Update access tracking (for LRU)
      entry.accessCount++;
      entry.lastAccess = now;
  
      stats.hits++;
      return entry.value as T;
    }
  
    /**
     * Check if a key exists and is not expired
     */
    has(cacheName: string, key: string, ttlMs: number = this.DEFAULT_TTL_MS): boolean {
      return this.get(cacheName, key, ttlMs) !== null;
    }
  
    /**
     * Delete a specific key
     */
    delete(cacheName: string, key: string): boolean {
      const cache = this.caches.get(cacheName);
      if (!cache) return false;
  
      const deleted = cache.delete(key);
      if (deleted) {
        const stats = this.stats.get(cacheName);
        if (stats) stats.size = cache.size;
      }
      return deleted;
    }
  
    /**
     * Clear entire cache
     */
    clear(cacheName: string): void {
      const cache = this.caches.get(cacheName);
      if (cache) {
        cache.clear();
        const stats = this.stats.get(cacheName);
        if (stats) {
          stats.size = 0;
          stats.hits = 0;
          stats.misses = 0;
          stats.evictions = 0;
        }
      }
    }
  
    /**
     * Clear all caches
     */
    clearAll(): void {
      console.log('🧹 Clearing all caches');
      this.caches.clear();
      this.stats.clear();
      this.nextCleanupNeeded = null;
    }
  
    /**
     * Get cache statistics
     */
    getStats(cacheName: string): CacheStats | null {
      return this.stats.get(cacheName) || null;
    }
  
    /**
     * Get all cache names
     */
    getCacheNames(): string[] {
      return Array.from(this.caches.keys());
    }
  
    /**
     * Evict least recently used entry (LRU)
     */
    private evictLRU(cacheName: string): void {
      const cache = this.caches.get(cacheName);
      if (!cache || cache.size === 0) return;
  
      let oldestKey: string | null = null;
      let oldestAccess = Infinity;
  
      // Find entry with oldest lastAccess time
      for (const [key, entry] of cache.entries()) {
        if (entry.lastAccess < oldestAccess) {
          oldestAccess = entry.lastAccess;
          oldestKey = key;
        }
      }
  
      if (oldestKey) {
        cache.delete(oldestKey);
        const stats = this.stats.get(cacheName);
        if (stats) {
          stats.size = cache.size;
          stats.evictions++;
        }
      }
    }
  
    /**
     * Evict oldest cache when max total caches reached
     */
    private evictOldestCache(): void {
      let oldestCacheName: string | null = null;
      let oldestTime = Infinity;
  
      for (const [name, cache] of this.caches.entries()) {
        for (const entry of cache.values()) {
          if (entry.timestamp < oldestTime) {
            oldestTime = entry.timestamp;
            oldestCacheName = name;
          }
        }
      }
  
      if (oldestCacheName) {
        console.log(`🗑️ Evicting oldest cache: ${oldestCacheName}`);
        this.caches.delete(oldestCacheName);
        this.stats.delete(oldestCacheName);
      }
    }
  
    /**
     * Scheduled cleanup - removes expired entries
     * Matches Flutter's O(n) single-pass removal
     */
    private performCleanup(): void {
      const now = Date.now();
      
      // Skip if no cleanup needed yet
      if (this.nextCleanupNeeded && now < this.nextCleanupNeeded) {
        return;
      }
  
      let totalRemoved = 0;
      let nextExpiration: number | null = null;
  
      for (const [cacheName, cache] of this.caches.entries()) {
        const stats = this.stats.get(cacheName);
        let removed = 0;
  
        // O(n) single pass removal of expired entries
        for (const [key, entry] of cache.entries()) {
          const age = now - entry.timestamp;
          
          if (age > this.DEFAULT_TTL_MS) {
            cache.delete(key);
            removed++;
          } else {
            // Track next expiration time
            const expiresAt = entry.timestamp + this.DEFAULT_TTL_MS;
            if (!nextExpiration || expiresAt < nextExpiration) {
              nextExpiration = expiresAt;
            }
          }
        }
  
        if (removed > 0 && stats) {
          stats.size = cache.size;
          stats.evictions += removed;
          totalRemoved += removed;
        }
  
        // Remove empty caches
        if (cache.size === 0) {
          this.caches.delete(cacheName);
          this.stats.delete(cacheName);
        }
      }
  
      this.nextCleanupNeeded = nextExpiration;
  
      if (totalRemoved > 0) {
        console.log(`🧹 Cleaned ${totalRemoved} expired cache entries`);
      }
    }
  
    /**
     * Start periodic cleanup timer (every 5 minutes like Flutter)
     */
    private startPeriodicCleanup(): void {
      if (this.cleanupTimer) return;
  
      this.cleanupTimer = setInterval(() => {
        this.performCleanup();
      }, this.CLEANUP_INTERVAL_MS);
  
      // Also run cleanup immediately
      this.performCleanup();
    }
  
    /**
     * Handle visibility changes (cleanup when app returns to foreground)
     */
    private setupVisibilityHandler(): void {
      if (typeof document === 'undefined') return;
  
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          console.log('👁️ App visible, running cache cleanup');
          this.performCleanup();
        }
      });
    }
  
    /**
     * Get memory usage estimate (rough)
     */
    getMemoryEstimate(): number {
      let totalEntries = 0;
      for (const cache of this.caches.values()) {
        totalEntries += cache.size;
      }
      // Rough estimate: 1KB per entry
      return totalEntries * 1024;
    }
  
    /**
     * Log cache statistics (for debugging)
     */
    logStats(): void {
      console.group('📊 Cache Statistics');
      
      for (const [name, stats] of this.stats.entries()) {
        const hitRate = stats.hits + stats.misses > 0
          ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)
          : '0.0';
        
        console.log(
          `${name}: ${stats.size} items, ${hitRate}% hit rate, ${stats.evictions} evictions`
        );
      }
      
      console.log(`Total memory estimate: ${(this.getMemoryEstimate() / 1024).toFixed(2)} KB`);
      console.groupEnd();
    }
  
    /**
     * Dispose and cleanup
     */
    dispose(): void {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
      this.clearAll();
      console.log('✅ CacheManager disposed');
    }
  }
  
  // Singleton instance
  export const cacheManager = CacheManager.getInstance();
  
  // Named cache constants (like Flutter's approach)
  export const CACHE_NAMES = {
    PRODUCTS: 'products',
    SEARCH: 'search',
    SUGGESTIONS: 'suggestions',
    REVIEWS: 'reviews',
    QUESTIONS: 'questions',
    SELLER_INFO: 'seller_info',
    RELATED_PRODUCTS: 'related_products',
    BUYER_CATEGORY: 'buyer_category',
    BUYER_CATEGORY_TERAS: 'buyer_category_teras',
  } as const;