// app/utils/impressionBatcher.ts

interface ImpressionData {
    productId: string;
    timestamp: number;
  }
  
  interface UserDemographics {
    gender?: string;
    age?: number;
  }
  
  class ImpressionBatcherClass {
    private static instance: ImpressionBatcherClass;
    
    // Buffers
    private impressionBuffer: Map<string, number> = new Map();
    private sessionImpressions: Set<string> = new Set();
    
    // Timers
    private batchTimer: NodeJS.Timeout | null = null;
    private sessionCleanupTimer: NodeJS.Timeout | null = null;
    
    // Tracking
    private lastImpressionTime: Map<string, number> = new Map();
    
    // Configuration (matching Flutter)
    private readonly BATCH_INTERVAL = 30000; // 30 seconds
    private readonly SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    private readonly MAX_BATCH_SIZE = 100;
    private readonly IMPRESSION_COOLDOWN = 5 * 60 * 1000; // 5 minutes
    private readonly MAX_RETRIES = 3;
    
    // Retry mechanism
    private retryCount = 0;
    private isDisposed = false;
    
    // Session storage keys
    private readonly SESSION_KEY = 'impression_session';
    private readonly SESSION_CLEAR_KEY = 'last_session_clear';
  
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
  
      this.loadSessionCache();
      this.startSessionCleanup();
  
      // Flush on page unload
      window.addEventListener('beforeunload', () => {
        this.flush();
      });
  
      // Flush on visibility change (tab switching)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.flush();
        }
      });
    }
  
    private loadSessionCache(): void {
      try {
        const cached = sessionStorage.getItem(this.SESSION_KEY);
        if (cached) {
          const ids = JSON.parse(cached) as string[];
          ids.forEach(id => this.sessionImpressions.add(id));
        }
  
        // Check if session needs clearing
        const lastClear = parseInt(sessionStorage.getItem(this.SESSION_CLEAR_KEY) || '0');
        const now = Date.now();
  
        if (now - lastClear > this.SESSION_DURATION) {
          this.clearSessionCache();
        }
      } catch (e) {
        console.error('Error loading session cache:', e);
      }
    }
  
    private clearSessionCache(): void {
      try {
        sessionStorage.removeItem(this.SESSION_KEY);
        sessionStorage.setItem(this.SESSION_CLEAR_KEY, Date.now().toString());
        this.sessionImpressions.clear();
        this.lastImpressionTime.clear();
      } catch (e) {
        console.error('Error clearing session cache:', e);
      }
    }
  
    private persistSessionCache(): void {
      try {
        const ids = Array.from(this.sessionImpressions);
        sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(ids));
      } catch (e) {
        console.error('Error persisting session cache:', e);
      }
    }
  
    private startSessionCleanup(): void {
      if (this.sessionCleanupTimer) {
        clearInterval(this.sessionCleanupTimer);
      }
  
      this.sessionCleanupTimer = setInterval(() => {
        this.clearSessionCache();
      }, this.SESSION_DURATION);
    }
  
    /**
     * Add an impression to the buffer
     */
    public addImpression(productId: string): void {
      // Check cooldown period
      const lastTime = this.lastImpressionTime.get(productId);
      if (lastTime) {
        const timeSince = Date.now() - lastTime;
        if (timeSince < this.IMPRESSION_COOLDOWN) {
          return; // Still in cooldown
        }
      }
  
      // Check if already tracked in this session
      if (this.sessionImpressions.has(productId)) {
        return; // Already counted in this session
      }
  
      // Add to buffer
      const currentCount = this.impressionBuffer.get(productId) || 0;
      this.impressionBuffer.set(productId, currentCount + 1);
      
      this.sessionImpressions.add(productId);
      this.lastImpressionTime.set(productId, Date.now());
  
      // Persist session cache
      this.persistSessionCache();
  
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
  
    private async getUserDemographics(): Promise<UserDemographics> {
      try {
        // Try to get from localStorage first (set during login)
        const cached = localStorage.getItem('user_demographics');
        if (cached) {
          return JSON.parse(cached);
        }
  
        // Fallback: fetch from API if user is logged in
        const response = await fetch('/api/user/demographics');
        if (response.ok) {
          const data = await response.json();
          
          // Calculate age if birthDate exists
          let age: number | undefined;
          if (data.birthDate) {
            const birthDate = new Date(data.birthDate);
            const today = new Date();
            age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              age--;
            }
          }
  
          return {
            gender: data.gender,
            age: age
          };
        }
      } catch (e) {
        console.error('Error getting user demographics:', e);
      }
  
      return {}; // Return empty if not available
    }
  
    private async sendBatch(): Promise<void> {
      if (this.impressionBuffer.size === 0 || this.isDisposed) {
        return;
      }
  
      // Create copy and clear buffer
      const idsToSend = Array.from(this.impressionBuffer.keys());
      const bufferCopy = new Map(this.impressionBuffer);
      this.impressionBuffer.clear();
  
      try {
        // Get user demographics at send time (like Flutter)
        const demographics = await this.getUserDemographics();
  
        // Send to backend
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
        console.log(
          `📊 Sent batch of ${idsToSend.length} impressions (${totalViews} total views) - Gender: ${demographics.gender || 'unknown'}, Age: ${demographics.age || 'unknown'}`
        );
        
        this.retryCount = 0; // Reset on success
      } catch (e) {
        console.error('❌ Error sending impression batch:', e);
  
        // Retry with exponential backoff
        if (this.retryCount < this.MAX_RETRIES) {
          this.retryCount++;
          const delay = 2000 * this.retryCount; // 2s, 4s, 6s
  
          console.log(
            `🔄 Retrying impression batch in ${delay / 1000}s (attempt ${this.retryCount}/${this.MAX_RETRIES})`
          );
  
          // Re-add failed impressions to buffer
          bufferCopy.forEach((count, id) => {
            const current = this.impressionBuffer.get(id) || 0;
            this.impressionBuffer.set(id, current + count);
          });
  
          // Schedule retry
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
  
    /**
     * Manually flush all pending impressions
     */
    public async flush(): Promise<void> {
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
      await this.sendBatch();
    }
  
    /**
     * Clean up resources
     */
    public dispose(): void {
      this.isDisposed = true;
  
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = null;
      }
  
      if (this.sessionCleanupTimer) {
        clearInterval(this.sessionCleanupTimer);
        this.sessionCleanupTimer = null;
      }
  
      this.impressionBuffer.clear();
      this.sessionImpressions.clear();
      this.lastImpressionTime.clear();
    }
  }
  
  // Export singleton instance
  export const impressionBatcher = ImpressionBatcherClass.getInstance();