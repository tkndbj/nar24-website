// lib/algolia.ts - Enhanced Production-Grade Implementation
import { algoliasearch, SearchClient } from 'algoliasearch';

export interface Suggestion {
  id: string;
  name: string;
  price: number;
}

export interface CategorySuggestion {
  id: string;
  categoryKey?: string;
  subcategoryKey?: string;
  subsubcategoryKey?: string;
  displayName: string;
  type: string;
  level: number;
  languageCode?: string;
}

export interface Product {
  id: string;
  productName: string;
  price: number;
  originalPrice?: number;
  discountPercentage?: number;
  currency: string;
  imageUrls: string[];
  colorImages: Record<string, string[]>;
  description: string;
  brandModel?: string;
  condition: string;
  quantity?: number;
  averageRating: number;
  isBoosted: boolean;
  deliveryOption?: string;
  campaignName?: string;
  dailyClickCount: number;
  purchaseCount: number;
  createdAt: string;
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  userId?: string;
  sellerName?: string;
  reviewCount?: number;
  clickCount?: number;
  rankingScore?: number;
  collection?: string;
  shopId?: string;
}

// Define the types that can be cached - moved to top for proper scoping
type CacheableData = Product[] | Suggestion[] | CategorySuggestion[];

// Enhanced hit response interfaces
interface AlgoliaProductHit {
  objectID?: string;
  productName?: string;
  price?: string | number;
  originalPrice?: string | number;
  discountPercentage?: string | number;
  currency?: string;
  imageUrls?: string[];
  colorImages?: Record<string, unknown>;
  description?: string;
  brandModel?: string;
  condition?: string;
  quantity?: string | number;
  averageRating?: string | number;
  isBoosted?: boolean;
  deliveryOption?: string;
  campaignName?: string;
  dailyClickCount?: string | number;
  purchaseCount?: string | number;
  createdAt?: string;
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  userId?: string;
  sellerName?: string;
  reviewCount?: string | number;
  clickCount?: string | number;
  rankingScore?: string | number;
  collection?: string;
  shopId?: string;
}

interface AlgoliaCategoryHit {
  objectID?: string;
  categoryKey?: string;
  subcategoryKey?: string;
  subsubcategoryKey?: string;
  displayName?: string;
  type?: string;
  level?: number;
  languageCode?: string;
}

interface AlgoliaSuggestionHit {
  objectID?: string;
  productName?: string;
  price?: string | number;
}

interface SearchParams {
  query: string;
  hitsPerPage: number;
  attributesToRetrieve: string[];
  attributesToHighlight: string[];
  typoTolerance?: boolean;
  filters?: string;
  page?: number;
  distinct?: number;
  analytics?: boolean;
  clickAnalytics?: boolean;
  facets?: string[];
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Retry utility
class RetryHelper {
  static async retry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    delayFactor: number = 200
  ): Promise<T> {
    let lastError: Error = new Error('Unknown error');
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        console.warn(`Attempt ${attempt}/${maxAttempts} failed:`, error);
        
        // Don't retry on certain errors
        if (error instanceof Error && error.message.includes('4')) {
          throw error; // Client errors (400-499)
        }
        
        if (attempt < maxAttempts) {
          const delay = delayFactor * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }
}

class AlgoliaServiceManager {
  private static instance: AlgoliaServiceManager;
  private readonly applicationId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID || '3QVVGQH4ME';
  private readonly apiKey = process.env.NEXT_PUBLIC_ALGOLIA_API_KEY || 'dcca6685e21c2baed748ccea7a6ddef1';
  private client: SearchClient;
  
  // Enhanced caching
  private cache = new Map<string, CacheEntry<Product[] | Suggestion[] | CategorySuggestion[]>>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100;

  private constructor() {
    if (!this.applicationId || !this.apiKey) {
      throw new Error('Missing Algolia configuration');
    }
    this.client = algoliasearch(this.applicationId, this.apiKey);
  }

  static getInstance() {
    if (!AlgoliaServiceManager.instance) {
      AlgoliaServiceManager.instance = new AlgoliaServiceManager();
    }
    return AlgoliaServiceManager.instance;
  }

  private getCacheKey(
    indexName: string,
    query: string, 
    page: number, 
    hitsPerPage: number, 
    filters?: string,
    sortOption?: string
  ): string {
    return `${indexName}-${query}-${page}-${hitsPerPage}-${filters || ''}-${sortOption || ''}`;
  }

  private isValidCache(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  private getFromCache<T extends CacheableData>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && this.isValidCache(entry.timestamp)) {
      return entry.data as T;
    }
    if (entry) {
      this.cache.delete(key);
    }
    return null;
  }

  private setCache<T extends CacheableData>(key: string, data: T): void {
    // Implement LRU cache eviction
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    this.cache.set(key, { data: data as CacheableData, timestamp: Date.now() });
  }

  private getReplicaIndexName(indexName: string, sortOption: string): string {
    if (indexName === "shop_products") {
      return indexName;
    }
    switch (sortOption) {
      case "date":
        return `${indexName}_createdAt_desc`;
      case "alphabetical":
        return `${indexName}_alphabetical`;
      case "price_asc":
        return `${indexName}_price_asc`;
      case "price_desc":
        return `${indexName}_price_desc`;
      default:
        return indexName;
    }
  }

  private buildFilters(filterType?: string): string | undefined {
    if (!filterType) return undefined;
    
    switch (filterType) {
      case 'deals':
        return 'discountPercentage>0';
      case 'boosted':
        return 'isBoosted:true';
      case 'trending':
        return 'dailyClickCount>=10';
      case 'fiveStar':
        return 'averageRating=5';
      case 'bestSellers':
        // This should use a specific replica index
        return undefined;
      default:
        return undefined;
    }
  }

  private mapAlgoliaHitToProduct(hit: AlgoliaProductHit): Product {
    return {
      id: hit.objectID || `unknown-${Math.random().toString(36).substr(2, 9)}`,
      productName: hit.productName || "Unknown Product",
      price: hit.price ? (typeof hit.price === 'string' ? parseFloat(hit.price) : hit.price) || 0 : 0,
      originalPrice: hit.originalPrice ? (typeof hit.originalPrice === 'string' ? parseFloat(hit.originalPrice) : hit.originalPrice) : undefined,
      discountPercentage: hit.discountPercentage ? (typeof hit.discountPercentage === 'string' ? parseFloat(hit.discountPercentage) : hit.discountPercentage) || 0 : 0,
      currency: hit.currency || "TL",
      imageUrls: Array.isArray(hit.imageUrls) ? hit.imageUrls : [],
      colorImages: hit.colorImages as Record<string, string[]> || {},
      description: hit.description || "",
      brandModel: hit.brandModel,
      condition: hit.condition || "new",
      quantity: hit.quantity ? (typeof hit.quantity === 'string' ? parseInt(hit.quantity) : hit.quantity) : undefined,
      averageRating: hit.averageRating ? (typeof hit.averageRating === 'string' ? parseFloat(hit.averageRating) : hit.averageRating) || 0 : 0,
      isBoosted: Boolean(hit.isBoosted),
      deliveryOption: hit.deliveryOption,
      campaignName: hit.campaignName,
      dailyClickCount: hit.dailyClickCount ? (typeof hit.dailyClickCount === 'string' ? parseInt(hit.dailyClickCount) : hit.dailyClickCount) || 0 : 0,
      purchaseCount: hit.purchaseCount ? (typeof hit.purchaseCount === 'string' ? parseInt(hit.purchaseCount) : hit.purchaseCount) || 0 : 0,
      createdAt: hit.createdAt || new Date().toISOString(),
      category: hit.category,
      subcategory: hit.subcategory,
      subsubcategory: hit.subsubcategory,
      userId: hit.userId,
      sellerName: hit.sellerName,
      reviewCount: hit.reviewCount ? (typeof hit.reviewCount === 'string' ? parseInt(hit.reviewCount) : hit.reviewCount) : undefined,
      clickCount: hit.clickCount ? (typeof hit.clickCount === 'string' ? parseInt(hit.clickCount) : hit.clickCount) : undefined,
      rankingScore: hit.rankingScore ? (typeof hit.rankingScore === 'string' ? parseFloat(hit.rankingScore) : hit.rankingScore) : undefined,
      collection: hit.collection,
      shopId: hit.shopId,
    };
  }

  private async searchSingleIndex(
    indexName: string,
    query: string,
    page: number = 0,
    hitsPerPage: number = 50,
    filterType?: string,
    sortOption: string = "None"
  ): Promise<Product[]> {
    const replicaIndex = this.getReplicaIndexName(indexName, sortOption);
    const filters = this.buildFilters(filterType);
    
    const searchParams: SearchParams = {
      query,
      page,
      hitsPerPage,
      attributesToRetrieve: [
        "objectID", "productName", "price", "originalPrice", "discountPercentage", "currency",
        "imageUrls", "colorImages", "description", "brandModel", "condition", "quantity",
        "averageRating", "isBoosted", "deliveryOption", "campaignName", "dailyClickCount",
        "purchaseCount", "createdAt", "category", "subcategory", "subsubcategory",
        "userId", "sellerName", "reviewCount", "clickCount", "rankingScore", "collection", "shopId"
      ],
      attributesToHighlight: [],
      distinct: 0,
      analytics: false,
      clickAnalytics: false,
      facets: []
    };

    if (filters) {
      searchParams.filters = filters;
    }

    return RetryHelper.retry(async () => {
      const searchResult = await this.client.searchSingleIndex({
        indexName: replicaIndex,
        searchParams
      });

      return searchResult.hits.map((hit: AlgoliaProductHit) => 
        this.mapAlgoliaHitToProduct(hit)
      );
    });
  }

  /**
   * Enhanced search that mimics Flutter's dual-index strategy
   */
  async searchProducts(
    query: string,
    page: number = 0,
    hitsPerPage: number = 50,
    indexName: string = "products",
    filterType?: string,
    sortOption: string = "None"
  ): Promise<Product[]> {
    if (!query.trim()) return [];

    const cacheKey = this.getCacheKey(indexName, query, page, hitsPerPage, filterType, sortOption);
    
    // Check cache first
    const cached = this.getFromCache<Product[]>(cacheKey);
    if (cached) {
      console.log(`🎯 Cache hit for: ${cacheKey}`);
      return cached;
    }

    try {
      console.log(`🔍 Searching ${indexName} for: "${query}" (page ${page})`);

      // Strategy 1: Search primary index
      let mainResults: Product[] = [];
      try {
        mainResults = await this.searchSingleIndex(
          indexName, 
          query, 
          page, 
          hitsPerPage, 
          filterType, 
          sortOption
        );
        console.log(`✅ Found ${mainResults.length} products in ${indexName}`);
      } catch (error) {
        console.warn(`❌ Primary index ${indexName} failed:`, error);
      }

      // Strategy 2: Search shop_products index if primary failed or returned few results
      let shopResults: Product[] = [];
      if (indexName !== 'shop_products' && (mainResults.length === 0 || mainResults.length < hitsPerPage / 2)) {
        try {
          console.log(`🔍 Searching shop_products as fallback/supplement`);
          shopResults = await this.searchSingleIndex(
            'shop_products', 
            query, 
            page, 
            hitsPerPage, 
            filterType, 
            sortOption
          );
          console.log(`✅ Found ${shopResults.length} products in shop_products`);
        } catch (error) {
          console.warn(`❌ Shop products index failed:`, error);
        }
      }

      // Merge and deduplicate results (mimicking Flutter logic)
      const merged: Product[] = [];
      const seen = new Set<string>();
      
      // Add main results first
      for (const product of mainResults) {
        if (seen.has(product.id)) continue;
        seen.add(product.id);
        merged.push(product);
      }
      
      // Add shop results
      for (const product of shopResults) {
        if (seen.has(product.id)) continue;
        seen.add(product.id);
        merged.push(product);
      }

      // Cache the result
      this.setCache(cacheKey, merged);
      
      console.log(`✅ Final merged results: ${merged.length} products`);
      return merged;

    } catch (error: unknown) {
      console.error(`❌ Complete search failure for "${query}":`, error);
      
      // Return empty array instead of throwing to prevent app crashes
      return [];
    }
  }

  /**
   * Search for product suggestions (used in SearchProvider for autocomplete)
   */
  async searchProductSuggestions(
    query: string,
    indexName: string = "products",
    sortOption: string = "alphabetical",
    page: number = 0,
    hitsPerPage: number = 5
  ): Promise<Suggestion[]> {
    const replicaIndex = this.getReplicaIndexName(indexName, sortOption);
    const cacheKey = this.getCacheKey(replicaIndex, query, page, hitsPerPage);
    
    const cached = this.getFromCache<Suggestion[]>(cacheKey);
    if (cached) {
      console.log(`🎯 Suggestion cache hit for: ${cacheKey}`);
      return cached;
    }

    try {
      console.log(`🔍 Searching ${replicaIndex} for suggestions: "${query}"`);

      const searchResult = await this.client.searchSingleIndex({
        indexName: replicaIndex,
        searchParams: {
          query,
          page,
          hitsPerPage,
          attributesToRetrieve: ["objectID", "productName", "price"],
          attributesToHighlight: [],
        }
      });

      console.log(`✅ ${replicaIndex} returned ${searchResult.hits.length} suggestion hits`);

      const suggestions = searchResult.hits.map((hit: AlgoliaSuggestionHit) => ({
        id: hit.objectID || `unknown-${Math.random().toString(36).substr(2, 9)}`,
        name: hit.productName || "Unknown Product",
        price: hit.price ? (typeof hit.price === 'string' ? parseFloat(hit.price) : hit.price) || 0 : 0,
      }));

      this.setCache(cacheKey, suggestions);
      return suggestions;
    } catch (error) {
      console.error(`❌ ${replicaIndex} suggestion search error:`, error);
      return [];
    }
  }

  /**
   * Search for category suggestions
   */
  async searchCategories(
    query: string,
    hitsPerPage: number = 15,
    languageCode?: string
  ): Promise<CategorySuggestion[]> {
    const cacheKey = this.getCacheKey('categories', query, 0, hitsPerPage, languageCode || 'all');
    
    const cached = this.getFromCache<CategorySuggestion[]>(cacheKey);
    if (cached) {
      console.log(`🎯 Category cache hit for: ${cacheKey}`);
      return cached;
    }

    try {
      console.log(`🔍 Searching categories with query: "${query}"`);

      const searchParams: SearchParams = {
        query,
        hitsPerPage,
        attributesToRetrieve: [
          "objectID", "categoryKey", "subcategoryKey", "subsubcategoryKey",
          "displayName", "type", "level", "languageCode"
        ],
        attributesToHighlight: ["displayName", "searchableText"],
        typoTolerance: true,
      };

      if (languageCode) {
        searchParams.filters = `languageCode:${languageCode}`;
      }

      const searchResult = await this.client.searchSingleIndex({
        indexName: 'categories',
        searchParams
      });

      console.log(`✅ Categories returned ${searchResult.hits.length} hits`);

      const categories = searchResult.hits.map((hit: AlgoliaCategoryHit) => ({
        id: hit.objectID || `unknown-category-${Math.random().toString(36).substr(2, 9)}`,
        categoryKey: hit.categoryKey,
        subcategoryKey: hit.subcategoryKey,
        subsubcategoryKey: hit.subsubcategoryKey,
        displayName: hit.displayName || "Unknown Category",
        type: hit.type || "category",
        level: hit.level || 1,
        languageCode: hit.languageCode,
      }));

      this.setCache(cacheKey, categories);
      return categories;
    } catch (error) {
      console.error("❌ Category search error:", error);
      return [];
    }
  }

  /**
   * Health check - verify service is reachable
   */
  async isServiceReachable(): Promise<boolean> {
    try {
      const result = await this.client.searchSingleIndex({
        indexName: 'products',
        searchParams: {
          query: '',
          hitsPerPage: 1,
          attributesToRetrieve: ['objectID'],
          attributesToHighlight: [],
        }
      });
      return true;
    } catch (error) {
      console.error('Algolia health check failed:', error);
      return false;
    }
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🧹 Algolia cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

export default AlgoliaServiceManager;