// services/redis_service.ts
"use client"; // ✅ ADD THIS

/**
 * Redis initialization configuration
 */
interface RedisConfig {
  url: string;
  token: string;
}

/**
 * Redis response structure
 */
interface RedisResponse<T = unknown> {
  result: T;
}

/**
 * Cart totals structure (matches backend)
 */
interface CartTotals {
  subtotal?: number;
  tax?: number;
  total?: number;
  discount?: number;
  shipping?: number;
  currency?: string;
  items?: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    total: number;
    isBundleItem?: boolean;
  }>;
  [key: string]: unknown;
}

/**
 * Unified Redis service for cart and favorites caching
 */
class RedisService {
  private static instance: RedisService | null = null;
  
  private baseUrl: string = '';
  private token: string = '';
  private initialized: boolean = false;
  
  static readonly TOTALS_TTL_SECONDS = 600;
  static readonly FAVORITES_TTL_SECONDS = 300;
  static readonly TIMEOUT_MS = 5000;

  private constructor() {
    if (RedisService.instance) {
      return RedisService.instance;
    }
    RedisService.instance = this;
  }

  static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  initialize({ url, token }: RedisConfig): void {
    if (!url || !token) {
      console.warn('⚠️ Redis credentials missing');
      return;
    }
    
    this.baseUrl = url;
    this.token = token;
    this.initialized = true;
    console.log('✅ Redis initialized (cart + favorites caching):', this.baseUrl);
  }

  // ========================================================================
  // CART TOTALS CACHING
  // ========================================================================

  async getCachedTotals(
    userId: string,
    productIds: string[]
  ): Promise<CartTotals | null> {
    if (!this.initialized || !productIds || productIds.length === 0) {
      return null;
    }

    try {
      const key = this.buildTotalsKey(userId, productIds);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RedisService.TIMEOUT_MS);

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['GET', key]),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data: RedisResponse<string | null> = await response.json();
        const result = data.result;

        if (result !== null && result !== undefined) {
          return JSON.parse(result) as CartTotals;
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('❌ Redis get totals error:', error);
      }
    }

    return null;
  }

  async cacheTotals(
    userId: string,
    productIds: string[],
    totals: CartTotals
  ): Promise<void> {
    if (!this.initialized || !productIds || productIds.length === 0) {
      return;
    }

    try {
      const key = this.buildTotalsKey(userId, productIds);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RedisService.TIMEOUT_MS);

      await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          'SET',
          key,
          JSON.stringify(totals),
          'EX',
          RedisService.TOTALS_TTL_SECONDS,
        ]),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log(`✅ Cached totals for ${productIds.length} products`);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('❌ Redis cache totals error:', error);
      }
    }
  }

  async invalidateCartTotals(userId: string): Promise<void> {
    if (!this.initialized) return;

    try {
      const pattern = `totals:${userId}:*`;
      await this.invalidatePattern(pattern);
      console.log('🗑️ Invalidated cart totals');
    } catch (error) {
      console.error('❌ Redis invalidate error:', error);
    }
  }

  private buildTotalsKey(userId: string, productIds: string[]): string {
    const sorted = [...productIds].sort();
    return `totals:${userId}:${sorted.join(',')}`;
  }

  // ========================================================================
  // FAVORITES CACHING
  // ========================================================================

  async getCachedFavoriteIds(
    userId: string,
    basketId: string | null = null
  ): Promise<Set<string> | null> {
    if (!this.initialized) return null;

    try {
      const key = this.buildFavoritesKey(userId, basketId);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RedisService.TIMEOUT_MS);

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['GET', key]),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data: RedisResponse<string | null> = await response.json();
        const result = data.result;

        if (result !== null && result !== undefined) {
          const list: unknown[] = JSON.parse(result);
          return new Set(list.map(item => String(item)));
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('❌ Redis get favorites error:', error);
      }
    }

    return null;
  }

  async cacheFavoriteIds(
    userId: string,
    favoriteIds: Set<string>,
    basketId: string | null = null
  ): Promise<void> {
    if (!this.initialized) return;

    try {
      const key = this.buildFavoritesKey(userId, basketId);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RedisService.TIMEOUT_MS);

      await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          'SET',
          key,
          JSON.stringify(Array.from(favoriteIds)),
          'EX',
          RedisService.FAVORITES_TTL_SECONDS,
        ]),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const basketInfo = basketId ? ` for basket ${basketId}` : '';
      console.log(`✅ Cached ${favoriteIds.size} favorites${basketInfo}`);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('❌ Redis cache favorites error:', error);
      }
    }
  }

  async invalidateFavorites(userId: string): Promise<void> {
    if (!this.initialized) return;

    try {
      const pattern = `favorites:${userId}:*`;
      await this.invalidatePattern(pattern);
      console.log('🗑️ Invalidated favorites');
    } catch (error) {
      console.error('❌ Redis invalidate favorites error:', error);
    }
  }

  private buildFavoritesKey(userId: string, basketId: string | null): string {
    return `favorites:${userId}:${basketId || 'default'}`;
  }

  // ========================================================================
  // COMMON UTILITIES
  // ========================================================================

  private async invalidatePattern(pattern: string): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RedisService.TIMEOUT_MS);

      const scanResponse = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(['KEYS', pattern]),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (scanResponse.ok) {
        const data: RedisResponse<string[]> = await scanResponse.json();
        const keys = data.result;

        if (keys && Array.isArray(keys) && keys.length > 0) {
          const deleteController = new AbortController();
          const deleteTimeoutId = setTimeout(
            () => deleteController.abort(),
            RedisService.TIMEOUT_MS
          );

          await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(['DEL', ...keys]),
            signal: deleteController.signal,
          });

          clearTimeout(deleteTimeoutId);

          console.log(`🗑️ Invalidated ${keys.length} cache keys`);
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('❌ Redis invalidate pattern error:', error);
      }
    }
  }

  dispose(): void {
    console.log('🧹 Redis Service disposed');
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// ✅ SIMPLIFIED EXPORT
const redisService = RedisService.getInstance();
export default redisService;
export { RedisService };
export type { RedisConfig, CartTotals };