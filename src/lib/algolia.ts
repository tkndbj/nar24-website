// lib/algolia.ts

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
    private cache = new Map<string, { data: Product[] | Suggestion[] | CategorySuggestion[]; timestamp: number }>();
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    private abortController: AbortController | null = null;
  
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
      // Cancel previous request
      if (this.abortController) {
        this.abortController.abort();
      }
      this.abortController = new AbortController();
  
      const cacheKey = this.getCacheKey(query, page, hitsPerPage, indexName);
      const cached = this.cache.get(cacheKey);
      
      if (cached && this.isValidCache(cached.timestamp)) {
        console.log(`🎯 Cache hit for: ${cacheKey}`);
        return cached.data as Product[];
      }
  
      const url = `https://${this.applicationId}-dsn.algolia.net/1/indexes/${indexName}/query`;
  
      const params = new URLSearchParams({
        query,
        page: page.toString(),
        hitsPerPage: hitsPerPage.toString(),
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
        ].join(","),
        attributesToHighlight: "",
      });
  
      try {
        console.log(`🔍 Searching ${indexName} for: "${query}" (page ${page})`);
        console.log('🌐 Environment:', process.env.NODE_ENV);
        console.log('🔑 App ID:', this.applicationId);
  
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "X-Algolia-Application-Id": this.applicationId,
            "X-Algolia-API-Key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ params: params.toString() }),
          signal: this.abortController.signal,
        });
  
        console.log('📡 Response status:', response.status);
  
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Response error:', errorText);
          throw new Error(`Algolia request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
  
        const data = await response.json();
        const hits = data.hits || [];
  
        const products: Product[] = hits.map((hit: AlgoliaProductHit) => ({
          id: hit.objectID || `unknown-${Math.random().toString(36).substr(2, 9)}`,
          productName: hit.productName || "Unknown Product",
          price: hit.price ? (typeof hit.price === 'string' ? parseFloat(hit.price) : hit.price) || 0 : 0,
          originalPrice: hit.originalPrice ? (typeof hit.originalPrice === 'string' ? parseFloat(hit.originalPrice) : hit.originalPrice) : undefined,
          discountPercentage: hit.discountPercentage ? (typeof hit.discountPercentage === 'string' ? parseFloat(hit.discountPercentage) : hit.discountPercentage) || 0 : 0,
          currency: hit.currency || "TL",
          imageUrls: Array.isArray(hit.imageUrls) ? hit.imageUrls : [],
          colorImages: hit.colorImages || {},
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
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('🚫 Search request aborted');
          throw new Error('Request cancelled');
        }
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
  
      const url = `https://${this.applicationId}-dsn.algolia.net/1/indexes/${replicaIndex}/query`;
  
      const params = new URLSearchParams({
        query,
        page: page.toString(),
        hitsPerPage: hitsPerPage.toString(),
        attributesToRetrieve: "objectID,productName,price",
        attributesToHighlight: "",
      });
  
      try {
        console.log(`🔍 Searching ${replicaIndex} with query: "${query}"`);
  
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "X-Algolia-Application-Id": this.applicationId,
            "X-Algolia-API-Key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ params: params.toString() }),
        });
  
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Suggestion response error:', errorText);
          throw new Error(`Algolia request failed: ${response.status} ${response.statusText}`);
        }
  
        const data = await response.json();
        console.log(`✅ ${replicaIndex} returned ${data.hits?.length || 0} hits`);
  
        const hits = data.hits || [];
        const suggestions = hits.map((hit: Record<string, unknown>) => ({
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
  
      const url = `https://${this.applicationId}-dsn.algolia.net/1/indexes/categories/query`;
  
      const params: Record<string, string> = {
        query,
        hitsPerPage: hitsPerPage.toString(),
        attributesToRetrieve:
          "objectID,categoryKey,subcategoryKey,subsubcategoryKey,displayName,type,level,languageCode",
        attributesToHighlight: "displayName,searchableText",
        typoTolerance: "true",
      };
  
      if (languageCode) {
        params.filters = `languageCode:${languageCode}`;
      }
  
      try {
        console.log(`🔍 Searching categories with query: "${query}"`);
  
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "X-Algolia-Application-Id": this.applicationId,
            "X-Algolia-API-Key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            params: new URLSearchParams(params).toString(),
          }),
        });
  
        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Category response error:', errorText);
          throw new Error(`Category search failed: ${response.status} ${response.statusText}`);
        }
  
        const data = await response.json();
        console.log(`✅ Categories returned ${data.hits?.length || 0} hits`);
  
        const hits = data.hits || [];
        const categories = hits.map((hit: AlgoliaCategoryHit) => ({
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
      if (this.abortController) {
        this.abortController.abort();
        console.log('🚫 Algolia requests cancelled');
      }
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