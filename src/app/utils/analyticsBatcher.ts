// utils/analyticsBatcher.ts
/**
 * Analytics Batcher - Optimized batching system for impressions, clicks, and detail views
 * Mimics Flutter's ImpressionBatcher with React-specific optimizations
 */


  
  interface ClickData {
    productId: string;
    shopId?: string;
    count: number;
  }
  
  interface DetailViewData {
    productId: string;
    collectionName: string;
    viewData: Record<string, unknown>;
    timestamp: number;
  }

  class RetryHelper {
    static async fetchWithRetry(
      url: string,
      options: RequestInit,
      maxRetries: number = 3
    ): Promise<Response> {
      let lastError: Error = new Error('Unknown error');
  
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(url, options);
  
          // Don't retry on 4xx errors (client errors)
          if (!response.ok && response.status >= 400 && response.status < 500) {
            throw new Error(`Client error: ${response.status}`);
          }
  
          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }
  
          return response;
        } catch (error) {
          lastError = error as Error;
          console.warn(`Attempt ${attempt}/${maxRetries} failed:`, error);
  
          // Don't retry on client errors
          if (error instanceof Error && error.message.includes('Client error')) {
            throw error;
          }
  
          if (attempt < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s
            const delay = 1000 * Math.pow(2, attempt - 1);
            console.log(`⏳ Retrying in ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
  
      throw lastError;
    }
  }
  
  class AnalyticsBatcher {
    private static instance: AnalyticsBatcher;   
    
    
    // Click tracking
    private clickBuffer: Map<string, ClickData> = new Map();
    private clickFlushTimer: NodeJS.Timeout | null = null;
    private readonly CLICK_FLUSH_INTERVAL = 20000; // 20 seconds
    private readonly CLICK_COOLDOWN = 1000; // 1 second cooldown per product
    private lastClickTime: Map<string, number> = new Map();
    
    // Detail view tracking
    private detailViewBuffer: Map<string, DetailViewData> = new Map();
    private detailViewFlushTimer: NodeJS.Timeout | null = null;
    private detailViewCounter = 0;
    private readonly DETAIL_VIEW_FLUSH_INTERVAL = 30000; // 30 seconds
    
    // Preferences tracking
    private preferenceBuffer = {
      category: new Map<string, number>(),
      subcategory: new Map<string, number>(),
      subsubcategory: new Map<string, number>(),
      purchaseCategories: new Set<string>(),
      purchaseSubcategories: new Set<string>(),
      purchaseSubsubcategories: new Set<string>(),
    };
    private preferenceFlushTimer: NodeJS.Timeout | null = null;
    private readonly PREFERENCE_FLUSH_INTERVAL = 30000; // 30 seconds
    
    private isDisposed = false;
    private currentUserId: string | null = null;
  
    private constructor() {
      // Setup visibility change listener for background flushing
      if (typeof window !== 'undefined') {
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('beforeunload', this.handleBeforeUnload);
      }
    }
  
    static getInstance(): AnalyticsBatcher {
      if (!AnalyticsBatcher.instance) {
        AnalyticsBatcher.instance = new AnalyticsBatcher();
      }
      return AnalyticsBatcher.instance;
    }
  
    setCurrentUserId(userId: string | null) {
      this.currentUserId = userId;
    } 
    
  
    // ============= CLICK TRACKING =============
    
    recordClick(productId: string, shopId?: string): void {
      if (this.isDisposed) return;
  
      // Throttle rapid clicks
      const now = Date.now();
      const lastClick = this.lastClickTime.get(productId);
      if (lastClick && (now - lastClick) < this.CLICK_COOLDOWN) {
        return;
      }
  
      this.lastClickTime.set(productId, now);
  
      // Extract clean product ID
      const cleanId = productId.includes('_') 
        ? productId.split('_').pop()! 
        : productId;
  
      const existing = this.clickBuffer.get(cleanId);
      this.clickBuffer.set(cleanId, {
        productId: cleanId,
        shopId: shopId || existing?.shopId,
        count: (existing?.count || 0) + 1,
      });
  
      this.scheduleClickFlush();
    }
  
    private scheduleClickFlush(): void {
      if (this.clickFlushTimer) return;
      
      this.clickFlushTimer = setTimeout(() => {
        this.flushClicks();
      }, this.CLICK_FLUSH_INTERVAL);
    }
  
    async flushClicks(): Promise<void> {
      if (this.clickBuffer.size === 0) return;
  
      const clicksToFlush = new Map(this.clickBuffer);
      this.clickBuffer.clear();
  
      if (this.clickFlushTimer) {
        clearTimeout(this.clickFlushTimer);
        this.clickFlushTimer = null;
      }
  
      try {
        const clicks: Record<string, number> = {};
        const shopIds: Record<string, string> = {};
  
        clicksToFlush.forEach((data, productId) => {
          clicks[productId] = data.count;
          if (data.shopId) {
            shopIds[productId] = data.shopId;
          }
        });
  
        const response = await RetryHelper.fetchWithRetry(
          '/api/analytics/clicks',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clicks, shopIds }),
          },
          3
        );
  
        if (!response.ok) throw new Error('Failed to flush clicks');
        
        console.log(`✅ Flushed ${clicksToFlush.size} product clicks`);
      } catch (error) {
        console.error('❌ Error flushing clicks:', error);
        
        // Re-add failed clicks
        clicksToFlush.forEach((data, productId) => {
          const existing = this.clickBuffer.get(productId);
          this.clickBuffer.set(productId, {
            productId,
            shopId: data.shopId || existing?.shopId,
            count: (existing?.count || 0) + data.count,
          });
        });
      }
    }
  
    // ============= DETAIL VIEW TRACKING =============
    
    recordDetailView(
      productId: string,
      collectionName: string,
      viewData: Record<string, unknown>
    ): void {
      if (this.isDisposed) return;
  
      // Use unique key to prevent overwriting duplicate views
      const timestamp = Date.now();
      const uniqueKey = `${collectionName}_${productId}_${timestamp}_${this.detailViewCounter++}`;
  
      this.detailViewBuffer.set(uniqueKey, {
        productId,
        collectionName,
        viewData,
        timestamp,
      });
  
      this.scheduleDetailViewFlush();
    }
  
    private scheduleDetailViewFlush(): void {
      if (this.detailViewFlushTimer) return;
      
      this.detailViewFlushTimer = setTimeout(() => {
        this.flushDetailViews();
      }, this.DETAIL_VIEW_FLUSH_INTERVAL);
    }
  
    async flushDetailViews(): Promise<void> {
      if (this.detailViewBuffer.size === 0) return;
  
      const viewsToFlush = new Map(this.detailViewBuffer);
      this.detailViewBuffer.clear();
  
      if (this.detailViewFlushTimer) {
        clearTimeout(this.detailViewFlushTimer);
        this.detailViewFlushTimer = null;
      }
  
      try {
        // Convert to array for batching
        const views = Array.from(viewsToFlush.values());
        
        // Split into batches of 500 (Firestore limit)
        const BATCH_SIZE = 500;
        const batches: DetailViewData[][] = [];
        
        for (let i = 0; i < views.length; i += BATCH_SIZE) {
          batches.push(views.slice(i, i + BATCH_SIZE));
        }
  
        // Send all batches in parallel
        await Promise.all(
          batches.map(batch =>
            RetryHelper.fetchWithRetry(
              '/api/analytics/detail-views',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ views: batch }),
              },
              3 // max 3 retries
            )
          )
        );
  
        console.log(`✅ Flushed ${views.length} detail views in ${batches.length} batch(es)`);
      } catch (error) {
        console.error('❌ Error flushing detail views:', error);
        
        // Re-add failed views
        viewsToFlush.forEach((view, key) => {
          this.detailViewBuffer.set(key, view);
        });
      }
    }
  
    // ============= PREFERENCE TRACKING =============
    
    recordProductClick(category: string, subcategory: string, subsubcategory: string): void {
      if (this.isDisposed || !this.currentUserId) return;
  
      const sanitize = (value?: string) => {
        const trimmed = value?.trim();
        return (trimmed && trimmed.length > 0) 
          ? trimmed.replace(/[./]/g, '_') 
          : 'Unknown';
      };
  
      const catKey = sanitize(category);
      const subKey = sanitize(subcategory);
      const subsubKey = sanitize(subsubcategory);
  
      this.preferenceBuffer.category.set(
        catKey,
        (this.preferenceBuffer.category.get(catKey) || 0) + 1
      );
      this.preferenceBuffer.subcategory.set(
        subKey,
        (this.preferenceBuffer.subcategory.get(subKey) || 0) + 1
      );
      this.preferenceBuffer.subsubcategory.set(
        subsubKey,
        (this.preferenceBuffer.subsubcategory.get(subsubKey) || 0) + 1
      );
  
      this.schedulePreferenceFlush();
    }
  
    recordPurchase(category: string, subcategory: string, subsubcategory: string): void {
      if (this.isDisposed || !this.currentUserId) return;
  
      const sanitize = (value?: string) => {
        const trimmed = value?.trim();
        return (trimmed && trimmed.length > 0) 
          ? trimmed.replace(/[./]/g, '_') 
          : 'Unknown';
      };
  
      this.preferenceBuffer.purchaseCategories.add(sanitize(category));
      this.preferenceBuffer.purchaseSubcategories.add(sanitize(subcategory));
      this.preferenceBuffer.purchaseSubsubcategories.add(sanitize(subsubcategory));
  
      this.schedulePreferenceFlush();
    }
  
    private schedulePreferenceFlush(): void {
      if (this.preferenceFlushTimer) return;
      
      this.preferenceFlushTimer = setTimeout(() => {
        this.flushPreferences();
      }, this.PREFERENCE_FLUSH_INTERVAL);
    }
  
    async flushPreferences(): Promise<void> {
      if (!this.currentUserId) return;
  
      const hasClickData = 
        this.preferenceBuffer.category.size > 0 ||
        this.preferenceBuffer.subcategory.size > 0 ||
        this.preferenceBuffer.subsubcategory.size > 0;
  
      const hasPurchaseData = 
        this.preferenceBuffer.purchaseCategories.size > 0 ||
        this.preferenceBuffer.purchaseSubcategories.size > 0 ||
        this.preferenceBuffer.purchaseSubsubcategories.size > 0;
  
      if (!hasClickData && !hasPurchaseData) return;
  
      // Copy and clear buffers
      const categoryClicks = new Map(this.preferenceBuffer.category);
      const subcategoryClicks = new Map(this.preferenceBuffer.subcategory);
      const subsubcategoryClicks = new Map(this.preferenceBuffer.subsubcategory);
      const purchaseCategories = new Set(this.preferenceBuffer.purchaseCategories);
      const purchaseSubcategories = new Set(this.preferenceBuffer.purchaseSubcategories);
      const purchaseSubsubcategories = new Set(this.preferenceBuffer.purchaseSubsubcategories);
  
      this.preferenceBuffer.category.clear();
      this.preferenceBuffer.subcategory.clear();
      this.preferenceBuffer.subsubcategory.clear();
      this.preferenceBuffer.purchaseCategories.clear();
      this.preferenceBuffer.purchaseSubcategories.clear();
      this.preferenceBuffer.purchaseSubsubcategories.clear();
  
      if (this.preferenceFlushTimer) {
        clearTimeout(this.preferenceFlushTimer);
        this.preferenceFlushTimer = null;
      }
  
      try {
        const response = await RetryHelper.fetchWithRetry(
          '/api/analytics/preferences',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: this.currentUserId,
              categoryClicks: Object.fromEntries(categoryClicks),
              subcategoryClicks: Object.fromEntries(subcategoryClicks),
              subsubcategoryClicks: Object.fromEntries(subsubcategoryClicks),
              purchaseCategories: Array.from(purchaseCategories),
              purchaseSubcategories: Array.from(purchaseSubcategories),
              purchaseSubsubcategories: Array.from(purchaseSubsubcategories),
            }),
          },
          3
        );
  
        if (!response.ok) throw new Error('Failed to flush preferences');
        
        console.log(`✅ Flushed ${categoryClicks.size} preference clicks and ${purchaseCategories.size} purchases`);
      } catch (error) {
        console.error('❌ Error flushing preferences:', error);
        
        // Re-add failed data
        categoryClicks.forEach((count, key) => {
          this.preferenceBuffer.category.set(
            key,
            (this.preferenceBuffer.category.get(key) || 0) + count
          );
        });
        subcategoryClicks.forEach((count, key) => {
          this.preferenceBuffer.subcategory.set(
            key,
            (this.preferenceBuffer.subcategory.get(key) || 0) + count
          );
        });
        subsubcategoryClicks.forEach((count, key) => {
          this.preferenceBuffer.subsubcategory.set(
            key,
            (this.preferenceBuffer.subsubcategory.get(key) || 0) + count
          );
        });
        purchaseCategories.forEach(cat => this.preferenceBuffer.purchaseCategories.add(cat));
        purchaseSubcategories.forEach(sub => this.preferenceBuffer.purchaseSubcategories.add(sub));
        purchaseSubsubcategories.forEach(subsub => this.preferenceBuffer.purchaseSubsubcategories.add(subsub));
      }
    }
  
    // ============= LIFECYCLE MANAGEMENT =============
    
    private handleVisibilityChange = (): void => {
      if (document.hidden) {
        console.log('📱 App backgrounding - flushing all analytics');
        this.flushAll();
      }
    };
  
    private handleBeforeUnload = (): void => {
      // Use sendBeacon for guaranteed delivery on page unload
      this.flushAllWithBeacon();
    };
  
    async flushAll(): Promise<void> {
      await Promise.all([
        
        this.flushClicks(),
        this.flushDetailViews(),
        this.flushPreferences(),
      ]);
    }
  
    private flushAllWithBeacon(): void {
     
  
      if (this.clickBuffer.size > 0) {
        const clicks: Record<string, number> = {};
        const shopIds: Record<string, string> = {};
        this.clickBuffer.forEach((data, id) => {
          clicks[id] = data.count;
          if (data.shopId) shopIds[id] = data.shopId;
        });
        navigator.sendBeacon(
          '/api/analytics/clicks',
          JSON.stringify({ clicks, shopIds })
        );
      }
    }
  
    dispose(): void {
      console.log('🗑️ AnalyticsBatcher: Disposing...');
      
      this.isDisposed = true;
      
      // Flush everything before cleanup
      this.flushAllWithBeacon();
      
      // Clear all timers
      
      if (this.clickFlushTimer) clearTimeout(this.clickFlushTimer);
      if (this.detailViewFlushTimer) clearTimeout(this.detailViewFlushTimer);
      if (this.preferenceFlushTimer) clearTimeout(this.preferenceFlushTimer);
      
      // Clear all buffers
      
      this.clickBuffer.clear();
      this.detailViewBuffer.clear();
      this.lastClickTime.clear();
      this.preferenceBuffer.category.clear();
      this.preferenceBuffer.subcategory.clear();
      this.preferenceBuffer.subsubcategory.clear();
      this.preferenceBuffer.purchaseCategories.clear();
      this.preferenceBuffer.purchaseSubcategories.clear();
      this.preferenceBuffer.purchaseSubsubcategories.clear();
      
      // Remove event listeners
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('beforeunload', this.handleBeforeUnload);
      }
      
      console.log('✅ AnalyticsBatcher: Disposal complete');
    }
  }
  
  export const analyticsBatcher = AnalyticsBatcher.getInstance();