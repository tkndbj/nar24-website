// app/utils/impressionBatcher.ts

interface UserDemographics {
    gender?: string;
    age?: number;
  }
  
  // NEW: Track per-page impressions
  interface PageImpressionData {
    pageUrl: string;
    timestamp: number;
  }
  
  class ImpressionBatcherClass {
    private static instance: ImpressionBatcherClass;
    
    // Buffers
    private impressionBuffer: Map<string, number> = new Map();
    
    // Timers
    private batchTimer: NodeJS.Timeout | null = null;
    private cleanupTimer: NodeJS.Timeout | null = null;
    
    // NEW: Track impressions per page per product
    private pageImpressions: Map<string, PageImpressionData[]> = new Map();
    
    // User tracking
    private currentUserId: string | null = null;
    
    // Configuration
    private readonly BATCH_INTERVAL = 30000; // 30 seconds
    private readonly IMPRESSION_COOLDOWN = 60 * 60 * 1000; // 1 HOUR
    private readonly MAX_IMPRESSIONS_PER_HOUR = 4; // Max 4 impressions per product per hour
    private readonly MAX_BATCH_SIZE = 100;
    private readonly MAX_RETRIES = 3;
    
    // Retry mechanism
    private retryCount = 0;
    private isDisposed = false;
    
    // LocalStorage key prefix
    private readonly PAGE_IMPRESSIONS_PREFIX = 'page_impressions_';
  
    private constructor() {
      this.initialize();
    }
  
    public static getInstance(): ImpressionBatcherClass {
      if (!ImpressionBatcherClass.instance) {
        ImpressionBatcherClass.instance = new ImpressionBatcherClass();
      }
      return ImpressionBatcherClass.instance;
    }
  
    private initialize(): void {
      if (typeof window === 'undefined') return;
  
      this.startCleanupTimer();
  
      // Flush on page unload
      window.addEventListener('beforeunload', () => {
        this.flush();
      });
  
      // Flush on visibility change
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.flush();
        }
      });
    }
  
    /**
     * Set the current user ID
     */
    public setUserId(userId: string | null): void {
      if (this.currentUserId === userId) return;
      
      console.log(`👤 ImpressionBatcher: User changed from ${this.currentUserId} to ${userId}`);
      
      // Clear in-memory data when user changes
      this.pageImpressions.clear();
      
      this.currentUserId = userId;
      
      // Load data for new user
      if (userId) {
        this.loadPageImpressions();
      }
    }
  
    /**
     * Get the storage key for current user
     */
    private getStorageKey(): string {
      const userId = this.currentUserId || 'anonymous';
      return `${this.PAGE_IMPRESSIONS_PREFIX}${userId}`;
    }
  
    /**
     * Get current page identifier (path without query params)
     */
    private getCurrentPageKey(): string {
      if (typeof window === 'undefined') return 'unknown';
      return window.location.pathname; // e.g., "/search" or "/category/electronics"
    }
  
    /**
     * Load page impressions from localStorage
     */
    private loadPageImpressions(): void {
      try {
        const storageKey = this.getStorageKey();
        const stored = localStorage.getItem(storageKey);
        
        if (stored) {
          const data = JSON.parse(stored) as Record<string, PageImpressionData[]>;
          const now = Date.now();
          let expiredCount = 0;
          
          // Clean expired impressions and load into memory
          Object.entries(data).forEach(([productId, pages]) => {
            const validPages = pages.filter(page => {
              const age = now - page.timestamp;
              if (age < this.IMPRESSION_COOLDOWN) {
                return true;
              } else {
                expiredCount++;
                return false;
              }
            });
            
            if (validPages.length > 0) {
              this.pageImpressions.set(productId, validPages);
            }
          });
          
          console.log(`📊 Loaded ${this.pageImpressions.size} products with impressions for user ${this.currentUserId} (${expiredCount} expired)`);
        }
      } catch (e) {
        console.error('Error loading page impressions:', e);
      }
    }
  
    /**
     * Persist page impressions to localStorage
     */
    private persistPageImpressions(): void {
      try {
        const storageKey = this.getStorageKey();
        const data: Record<string, PageImpressionData[]> = {};
        
        this.pageImpressions.forEach((pages, productId) => {
          data[productId] = pages;
        });
        
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch (e) {
        console.error('Error persisting page impressions:', e);
      }
    }
  
    /**
     * Start cleanup timer
     */
    private startCleanupTimer(): void {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
      }
      
      // Clean up every 10 minutes
      this.cleanupTimer = setInterval(() => {
        const now = Date.now();
        let cleaned = 0;
        
        this.pageImpressions.forEach((pages, productId) => {
          const validPages = pages.filter(page => {
            const age = now - page.timestamp;
            if (age < this.IMPRESSION_COOLDOWN) {
              return true;
            } else {
              cleaned++;
              return false;
            }
          });
          
          if (validPages.length === 0) {
            this.pageImpressions.delete(productId);
          } else {
            this.pageImpressions.set(productId, validPages);
          }
        });
        
        if (cleaned > 0) {
          console.log(`🧹 Cleaned ${cleaned} expired page impressions for user ${this.currentUserId}`);
          this.persistPageImpressions();
        }
      }, 10 * 60 * 1000);
    }
  
    /**
     * Add an impression to the buffer
     * Allows up to 4 impressions per product per hour (one per unique page)
     */
    public addImpression(productId: string): void {
      const now = Date.now();
      const currentPage = this.getCurrentPageKey();
      
      // Get existing page impressions for this product
      const existingPages = this.pageImpressions.get(productId) || [];
      
      // Clean old impressions (> 1 hour)
      const validPages = existingPages.filter(page => {
        const age = now - page.timestamp;
        return age < this.IMPRESSION_COOLDOWN;
      });
      
      // Check if already recorded on THIS PAGE within the cooldown
      const alreadyRecordedOnThisPage = validPages.some(page => {
        return page.pageUrl === currentPage;
      });
      
      if (alreadyRecordedOnThisPage) {
        console.log(`⏳ Product ${productId} already recorded on page ${currentPage} for user ${this.currentUserId || 'anonymous'}`);
        return;
      }
      
      // Check if we've reached the max impressions per hour (4 different pages)
      if (validPages.length >= this.MAX_IMPRESSIONS_PER_HOUR) {
        const oldestImpression = validPages[0];
        const remainingMs = this.IMPRESSION_COOLDOWN - (now - oldestImpression.timestamp);
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        
        console.log(`⚠️ Product ${productId} has reached max impressions (${this.MAX_IMPRESSIONS_PER_HOUR}) for user ${this.currentUserId || 'anonymous'}. Wait ${remainingMinutes}m for oldest to expire.`);
        return;
      }
  
      // Record new impression
      validPages.push({
        pageUrl: currentPage,
        timestamp: now,
      });
      
      this.pageImpressions.set(productId, validPages);
      
      // Add to buffer for sending
      const currentCount = this.impressionBuffer.get(productId) || 0;
      this.impressionBuffer.set(productId, currentCount + 1);
      
      // Persist to localStorage
      this.persistPageImpressions();
      
      console.log(`✅ Recorded impression #${validPages.length} for product ${productId} on page ${currentPage} by user ${this.currentUserId || 'anonymous'} (${this.MAX_IMPRESSIONS_PER_HOUR - validPages.length} remaining in this hour)`);
  
      // Schedule batch send
      this.scheduleBatch();
  
      // Force flush if buffer gets too large
      if (this.impressionBuffer.size >= this.MAX_BATCH_SIZE) {
        console.warn('⚠️ Buffer size limit reached, forcing flush');
        this.flush();
      }
    }
  
    private scheduleBatch(): void {
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
      }
  
      this.batchTimer = setTimeout(() => {
        this.sendBatch();
      }, this.BATCH_INTERVAL);
    }
  
    /**
     * Get user demographics
     */
    private async getUserDemographics(): Promise<{ gender?: string; age?: number }> {
      try {
        const response = await fetch('/api/analytics/user/demographics');
        
        if (response.status === 404 || response.status === 401) {
          console.log('ℹ️ User demographics not available (not logged in or not set)');
          return {};
        }
        
        if (!response.ok) {
          throw new Error(`Failed to fetch demographics: ${response.status}`);
        }
  
        const data = await response.json();
        
        const demographics: { gender?: string; age?: number } = {};
        
        if (data.gender) {
          demographics.gender = data.gender;
        }
        
        if (data.age) {
          demographics.age = data.age;
        }
        
        return demographics;
      } catch (error) {
        console.error('⚠️ Error fetching user demographics:', error);
        return {};
      }
    }
  
    private async sendBatch(): Promise<void> {
      if (this.impressionBuffer.size === 0 || this.isDisposed) {
        return;
      }
  
      const idsToSend = Array.from(this.impressionBuffer.keys());
      const bufferCopy = new Map(this.impressionBuffer);
      this.impressionBuffer.clear();
  
      try {
        const demographics = await this.getUserDemographics();
  
        const response = await fetch('/api/analytics/impressions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            productIds: idsToSend,
            userGender: demographics.gender,
            userAge: demographics.age,
            timestamp: Date.now(),
          }),
        });
  
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
  
        const totalViews = Array.from(bufferCopy.values()).reduce((a, b) => a + b, 0);
        
        const genderStr = demographics.gender || 'not specified';
        const ageStr = demographics.age ? demographics.age.toString() : 'not specified';
        
        console.log(
          `📊 Sent batch of ${idsToSend.length} impressions (${totalViews} total views) from user ${this.currentUserId || 'anonymous'} - Gender: ${genderStr}, Age: ${ageStr}`
        );
        
        this.retryCount = 0;
      } catch (e) {
        console.error('❌ Error sending impression batch:', e);
  
        if (this.retryCount < this.MAX_RETRIES) {
          this.retryCount++;
          const delay = 2000 * this.retryCount;
  
          console.log(
            `🔄 Retrying impression batch in ${delay / 1000}s (attempt ${this.retryCount}/${this.MAX_RETRIES})`
          );
  
          bufferCopy.forEach((count, id) => {
            const current = this.impressionBuffer.get(id) || 0;
            this.impressionBuffer.set(id, current + count);
          });
  
          setTimeout(() => {
            if (!this.isDisposed) {
              this.sendBatch();
            }
          }, delay);
        } else {
          console.error(`❌ Max retries reached, dropping ${idsToSend.length} impressions`);
          this.retryCount = 0;
        }
      }
    }
  
    public async flush(): Promise<void> {
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      await this.sendBatch();
    }
  
    public dispose(): void {
      this.isDisposed = true;
  
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
  
      this.impressionBuffer.clear();
      this.pageImpressions.clear();
    }
    
    /**
     * Debug: Get impression status for a product
     */
    public getImpressionStatus(productId: string): { 
      impressionCount: number;
      pages: string[];
      remainingSlots: number;
      oldestImpressionAge: number | null;
      userId: string | null;
    } {
      const pages = this.pageImpressions.get(productId) || [];
      const now = Date.now();
      
      const validPages = pages.filter(page => {
        const age = now - page.timestamp;
        return age < this.IMPRESSION_COOLDOWN;
      });
      
      const oldestAge = validPages.length > 0 
        ? now - validPages[0].timestamp 
        : null;
      
      return {
        impressionCount: validPages.length,
        pages: validPages.map(p => p.pageUrl),
        remainingSlots: this.MAX_IMPRESSIONS_PER_HOUR - validPages.length,
        oldestImpressionAge: oldestAge,
        userId: this.currentUserId,
      };
    }
  }
  
  export const impressionBatcher = ImpressionBatcherClass.getInstance();