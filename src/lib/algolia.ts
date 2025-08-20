// lib/algolia.ts
import { algoliasearch } from 'algoliasearch';

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
}

// Algolia hit response interfaces
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

class AlgoliaServiceManager {
  private static instance: AlgoliaServiceManager;
  private readonly applicationId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID || "3QVVGQH4ME";
  private readonly apiKey = process.env.NEXT_PUBLIC_ALGOLIA_API_KEY || "dcca6685e21c2baed748ccea7a6ddef1";
  private client = algoliasearch(this.applicationId, this.apiKey);
  private cache = new Map<string, { data: Product[] | Suggestion[] | CategorySuggestion[]; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  static getInstance() {
    if (!AlgoliaServiceManager.instance) {
      AlgoliaServiceManager.instance = new AlgoliaServiceManager();
    }
    return AlgoliaServiceManager.instance;
  }

  private getCacheKey(query: string, page: number, hitsPerPage: number, indexName: string): string {
    return `${indexName}-${query}-${page}-${hitsPerPage}`;
  }

  private isValidCache(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_DURATION;
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

  private cleanOldCache(): void {
    for (const [key, value] of this.cache.entries()) {
      if (!this.isValidCache(value.timestamp)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Search for full product details (used in SearchResults page)
   */
  async searchProducts(
    query: string,
    page: number = 0,
    hitsPerPage: number = 50,
    indexName: string = "products"
  ): Promise<Product[]> {
    const cacheKey = this.getCacheKey(query, page, hitsPerPage, indexName);
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isValidCache(cached.timestamp)) {
      console.log(`🎯 Cache hit for: ${cacheKey}`);
      return cached.data as Product[];
    }

    try {
      console.log(`🔍 Searching ${indexName} for: "${query}" (page ${page})`);
      console.log('🌐 Environment:', process.env.NODE_ENV);
      console.log('🔑 App ID:', this.applicationId);

      const searchResult = await this.client.searchSingleIndex({
        indexName,
        searchParams: {
          query,
          page,
          hitsPerPage,
          attributesToRetrieve: [
            "objectID",
            "productName", 
            "price",
            "originalPrice",
            "discountPercentage",
            "currency",
            "imageUrls",
            "colorImages",
            "description",
            "brandModel",
            "condition",
            "quantity",
            "averageRating",
            "isBoosted",
            "deliveryOption",
            "campaignName",
            "dailyClickCount",
            "purchaseCount",
            "createdAt"
          ],
          attributesToHighlight: [],
        }
      });

      console.log('📡 Response status: 200 (SDK)');
      console.log(`✅ Found ${searchResult.hits.length} hits`);

      const products: Product[] = searchResult.hits.map((hit: AlgoliaProductHit) => ({
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
      }));

      // Cache the result
      this.cache.set(cacheKey, { data: products, timestamp: Date.now() });
      
      // Clean old cache entries
      this.cleanOldCache();

      console.log(`✅ Found ${products.length} products`);
      return products;

    } catch (error: unknown) {
      console.error(`❌ Full error details:`, error);
      console.error(`❌ Algolia search error for "${query}":`, error);
      throw error;
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
    const cacheKey = this.getCacheKey(query, page, hitsPerPage, replicaIndex);
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isValidCache(cached.timestamp)) {
      console.log(`🎯 Suggestion cache hit for: ${cacheKey}`);
      return cached.data as Suggestion[];
    }

    try {
      console.log(`🔍 Searching ${replicaIndex} with query: "${query}"`);

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

      console.log(`✅ ${replicaIndex} returned ${searchResult.hits.length} hits`);

      const suggestions = searchResult.hits.map((hit: Record<string, unknown>) => ({
        id: (hit.objectID as string) || `unknown-${Math.random().toString(36).substr(2, 9)}`,
        name: (hit.productName as string) || "Unknown Product",
        price: (hit.price as number) || 0,
      }));

      // Cache the result
      this.cache.set(cacheKey, { data: suggestions, timestamp: Date.now() });
      this.cleanOldCache();

      return suggestions;
    } catch (error) {
      console.error(`❌ ${replicaIndex} search error:`, error);
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
    const cacheKey = this.getCacheKey(query, 0, hitsPerPage, `categories-${languageCode || 'all'}`);
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isValidCache(cached.timestamp)) {
      console.log(`🎯 Category cache hit for: ${cacheKey}`);
      return cached.data as CategorySuggestion[];
    }

    try {
      console.log(`🔍 Searching categories with query: "${query}"`);

      const searchParams: any = {
        query,
        hitsPerPage,
        attributesToRetrieve: [
          "objectID",
          "categoryKey",
          "subcategoryKey",
          "subsubcategoryKey",
          "displayName",
          "type",
          "level",
          "languageCode"
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

      // Cache the result
      this.cache.set(cacheKey, { data: categories, timestamp: Date.now() });
      this.cleanOldCache();

      return categories;
    } catch (error) {
      console.error("❌ Category search error:", error);
      return [];
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
   * Cancel all ongoing requests
   */
  cancelRequests(): void {
    // The Algolia SDK handles request cancellation internally
    console.log('🚫 Algolia SDK handles request cancellation');
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