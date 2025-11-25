// lib/services/personalizedFeedService.ts
// Production-ready personalized feed service for web with caching and fallbacks

import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

/**
 * Service for fetching personalized product recommendations
 *
 * Features:
 * - Personalized feed for authenticated users
 * - Trending products fallback for unauthenticated/new users
 * - In-memory and localStorage caching for performance
 * - Graceful degradation on errors
 * - Automatic cache invalidation
 */
class PersonalizedFeedService {
  private static instance: PersonalizedFeedService;

  // In-memory cache
  private cachedPersonalizedFeed: string[] | null = null;
  private cachedTrendingProducts: string[] | null = null;
  private personalizedCacheExpiry: Date | null = null;
  private trendingCacheExpiry: Date | null = null;

  // Cache durations (in milliseconds)
  private static readonly PERSONALIZED_CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours
  private static readonly TRENDING_CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

  // LocalStorage keys
  private static readonly KEY_PERSONALIZED_FEED = "personalized_feed_cache";
  private static readonly KEY_PERSONALIZED_EXPIRY = "personalized_feed_expiry";
  private static readonly KEY_TRENDING_PRODUCTS = "trending_products_cache";
  private static readonly KEY_TRENDING_EXPIRY = "trending_products_expiry";

  private initialized = false;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): PersonalizedFeedService {
    if (!PersonalizedFeedService.instance) {
      PersonalizedFeedService.instance = new PersonalizedFeedService();
    }
    return PersonalizedFeedService.instance;
  }

  /**
   * Initialize the service (call once at app startup)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadCachedData();
      this.initialized = true;
      console.log("✅ PersonalizedFeedService initialized");
    } catch (e) {
      console.warn("⚠️ PersonalizedFeedService init error:", e);
    }
  }

  /**
   * Load cached data from localStorage
   */
  private async loadCachedData(): Promise<void> {
    if (typeof window === "undefined") return;

    try {
      // Load personalized feed cache
      const personalizedFeed = localStorage.getItem(
        PersonalizedFeedService.KEY_PERSONALIZED_FEED
      );
      const personalizedExpiry = localStorage.getItem(
        PersonalizedFeedService.KEY_PERSONALIZED_EXPIRY
      );

      if (personalizedFeed && personalizedExpiry) {
        const expiry = new Date(parseInt(personalizedExpiry));
        if (expiry > new Date()) {
          this.cachedPersonalizedFeed = JSON.parse(personalizedFeed);
          this.personalizedCacheExpiry = expiry;
        }
      }

      // Load trending products cache
      const trendingProducts = localStorage.getItem(
        PersonalizedFeedService.KEY_TRENDING_PRODUCTS
      );
      const trendingExpiry = localStorage.getItem(
        PersonalizedFeedService.KEY_TRENDING_EXPIRY
      );

      if (trendingProducts && trendingExpiry) {
        const expiry = new Date(parseInt(trendingExpiry));
        if (expiry > new Date()) {
          this.cachedTrendingProducts = JSON.parse(trendingProducts);
          this.trendingCacheExpiry = expiry;
        }
      }
    } catch (e) {
      console.warn("⚠️ Error loading cached data:", e);
    }
  }

  /**
   * Save data to cache
   */
  private async saveToCache(
    products: string[],
    isPersonalized: boolean
  ): Promise<void> {
    if (typeof window === "undefined") return;

    try {
      const duration = isPersonalized
        ? PersonalizedFeedService.PERSONALIZED_CACHE_DURATION
        : PersonalizedFeedService.TRENDING_CACHE_DURATION;
      const expiry = new Date(Date.now() + duration);

      if (isPersonalized) {
        localStorage.setItem(
          PersonalizedFeedService.KEY_PERSONALIZED_FEED,
          JSON.stringify(products)
        );
        localStorage.setItem(
          PersonalizedFeedService.KEY_PERSONALIZED_EXPIRY,
          expiry.getTime().toString()
        );
        this.cachedPersonalizedFeed = products;
        this.personalizedCacheExpiry = expiry;
      } else {
        localStorage.setItem(
          PersonalizedFeedService.KEY_TRENDING_PRODUCTS,
          JSON.stringify(products)
        );
        localStorage.setItem(
          PersonalizedFeedService.KEY_TRENDING_EXPIRY,
          expiry.getTime().toString()
        );
        this.cachedTrendingProducts = products;
        this.trendingCacheExpiry = expiry;
      }
    } catch (e) {
      console.warn("⚠️ Error saving to cache:", e);
    }
  }

  /**
   * Check if cached data is still valid
   */
  private isCacheValid(isPersonalized: boolean): boolean {
    const expiry = isPersonalized
      ? this.personalizedCacheExpiry
      : this.trendingCacheExpiry;
    return expiry !== null && expiry > new Date();
  }

  /**
   * Get trending products (fallback for unauthenticated/new users)
   */
  private async getTrendingProducts(): Promise<string[]> {
    try {
      // Return cached trending if still valid
      if (this.isCacheValid(false) && this.cachedTrendingProducts) {
        console.log(
          `✅ Returning cached trending products (${this.cachedTrendingProducts.length})`
        );
        return this.cachedTrendingProducts;
      }

      console.log("📡 Fetching trending products from Firestore...");

      const db = getFirestore();
      const trendingDoc = await getDoc(doc(db, "trending_products", "global"));

      if (!trendingDoc.exists()) {
        console.warn("⚠️ Trending products not found");
        return [];
      }

      const data = trendingDoc.data();
      const products = (data.products || []) as string[];

      if (products.length === 0) {
        console.warn("⚠️ Trending products list is empty");
        return [];
      }

      // Cache the results
      await this.saveToCache(products, false);

      console.log(`✅ Fetched ${products.length} trending products`);
      return products;
    } catch (e) {
      console.error("❌ Error fetching trending products:", e);

      // Return cached data even if expired (better than nothing)
      if (
        this.cachedTrendingProducts &&
        this.cachedTrendingProducts.length > 0
      ) {
        console.warn("⚠️ Using expired trending cache as fallback");
        return this.cachedTrendingProducts;
      }

      return [];
    }
  }

  /**
   * Get personalized products for authenticated user
   */
  private async getPersonalizedProducts(userId: string): Promise<string[]> {
    try {
      // Return cached personalized feed if still valid
      if (this.isCacheValid(true) && this.cachedPersonalizedFeed) {
        console.log(
          `✅ Returning cached personalized feed (${this.cachedPersonalizedFeed.length})`
        );
        return this.cachedPersonalizedFeed;
      }

      console.log("📡 Fetching personalized feed from Firestore...");

      const db = getFirestore();
      const feedDoc = await getDoc(
        doc(db, "user_profiles", userId, "personalized_feed", "current")
      );

      if (!feedDoc.exists()) {
        console.warn("⚠️ Personalized feed not found, using trending");
        return this.getTrendingProducts();
      }

      const data = feedDoc.data();

      // Check if feed is stale (>3 days old as buffer for 2-day refresh)
      const lastComputed = data.lastComputed;
      if (lastComputed) {
        const age = Date.now() - lastComputed.toMillis();
        const daysOld = age / (1000 * 60 * 60 * 24);
        if (daysOld > 3) {
          console.warn(
            `⚠️ Personalized feed is stale (${daysOld.toFixed(
              1
            )} days), using trending`
          );
          return this.getTrendingProducts();
        }
      }

      const products = (data.productIds || []) as string[];

      if (products.length === 0) {
        console.warn("⚠️ Personalized feed is empty, using trending");
        return this.getTrendingProducts();
      }

      // Cache the results
      await this.saveToCache(products, true);

      console.log(`✅ Fetched ${products.length} personalized products`);
      return products;
    } catch (e) {
      console.error("❌ Error fetching personalized feed:", e);

      // Return cached data even if expired (better than nothing)
      if (
        this.cachedPersonalizedFeed &&
        this.cachedPersonalizedFeed.length > 0
      ) {
        console.warn("⚠️ Using expired personalized cache as fallback");
        return this.cachedPersonalizedFeed;
      }

      // Fall back to trending
      return this.getTrendingProducts();
    }
  }

  /**
   * Get product IDs for the user (personalized or trending)
   *
   * This is the main method to call from your UI.
   *
   * Returns:
   * - Personalized products (200 items) for authenticated users with sufficient activity
   * - Trending products (200 items) for unauthenticated users or as fallback
   */
  async getProductIds(): Promise<string[]> {
    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        console.log("👤 User not authenticated, using trending products");
        return this.getTrendingProducts();
      }

      // Try personalized feed first
      return await this.getPersonalizedProducts(user.uid);
    } catch (e) {
      console.error("❌ Error in getProductIds:", e);

      // Final fallback: return cached trending or empty
      if (
        this.cachedTrendingProducts &&
        this.cachedTrendingProducts.length > 0
      ) {
        console.warn("⚠️ Using trending cache as final fallback");
        return this.cachedTrendingProducts;
      }

      return [];
    }
  }

  /**
   * Force refresh personalized feed (bypass cache)
   *
   * Use this when user performs significant actions that might change preferences
   * (e.g., completing a purchase, adding many items to cart)
   */
  async forceRefresh(): Promise<string[]> {
    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        // Clear trending cache
        this.cachedTrendingProducts = null;
        this.trendingCacheExpiry = null;
        return this.getTrendingProducts();
      }

      // Clear personalized cache
      this.cachedPersonalizedFeed = null;
      this.personalizedCacheExpiry = null;

      return await this.getPersonalizedProducts(user.uid);
    } catch (e) {
      console.error("❌ Error in forceRefresh:", e);
      return [];
    }
  }

  /**
   * Get just the trending products (useful for "Trending Now" sections)
   */
  async getTrendingProductIds(): Promise<string[]> {
    return this.getTrendingProducts();
  }

  /**
   * Clear all caches (call on logout)
   */
  async clearCache(): Promise<void> {
    if (typeof window === "undefined") return;

    try {
      this.cachedPersonalizedFeed = null;
      this.cachedTrendingProducts = null;
      this.personalizedCacheExpiry = null;
      this.trendingCacheExpiry = null;

      localStorage.removeItem(PersonalizedFeedService.KEY_PERSONALIZED_FEED);
      localStorage.removeItem(PersonalizedFeedService.KEY_PERSONALIZED_EXPIRY);
      localStorage.removeItem(PersonalizedFeedService.KEY_TRENDING_PRODUCTS);
      localStorage.removeItem(PersonalizedFeedService.KEY_TRENDING_EXPIRY);

      console.log("🧹 Cleared all feed caches");
    } catch (e) {
      console.warn("⚠️ Error clearing cache:", e);
    }
  }

  /**
   * Check if user has a personalized feed
   */
  async hasPersonalizedFeed(): Promise<boolean> {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return false;

      // Check cache first
      if (this.isCacheValid(true) && this.cachedPersonalizedFeed) {
        return true;
      }

      // Check Firestore
      const db = getFirestore();
      const feedDoc = await getDoc(
        doc(db, "user_profiles", user.uid, "personalized_feed", "current")
      );

      return feedDoc.exists();
    } catch (e) {
      console.warn("⚠️ Error checking personalized feed:", e);
      return false;
    }
  }

  /**
   * Get feed metadata (for debugging/analytics)
   */
  async getFeedMetadata(): Promise<Record<string, unknown> | null> {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return null;

      const db = getFirestore();
      const feedDoc = await getDoc(
        doc(db, "user_profiles", user.uid, "personalized_feed", "current")
      );

      if (!feedDoc.exists()) return null;

      const data = feedDoc.data();
      return {
        lastComputed: data.lastComputed?.toDate(),
        productsCount: (data.productIds || []).length,
        avgScore: data.stats?.avgScore,
        topCategories: data.stats?.topCategories,
        version: data.version,
      };
    } catch (e) {
      console.warn("⚠️ Error fetching feed metadata:", e);
      return null;
    }
  }
}

// Export singleton instance
export const personalizedFeedService = PersonalizedFeedService.getInstance();

// Export class for type definitions
export default PersonalizedFeedService;
