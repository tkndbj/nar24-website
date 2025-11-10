/**
 * Request Deduplicator - Prevents duplicate in-flight requests
 * Matches Flutter's _RequestDeduplicator pattern
 */

type PendingRequest<T> = {
    promise: Promise<T>;
    timestamp: number;
    abortController?: AbortController;
  };
  
  class RequestDeduplicator {
    private static instance: RequestDeduplicator;
    private pending = new Map<string, PendingRequest<unknown>>();
    private readonly STALE_REQUEST_TIMEOUT_MS = 30000; // 30 seconds
    private cleanupTimer: NodeJS.Timeout | null = null;
  
    private constructor() {
      this.startPeriodicCleanup();
    }
  
    static getInstance(): RequestDeduplicator {
      if (!RequestDeduplicator.instance) {
        RequestDeduplicator.instance = new RequestDeduplicator();
      }
      return RequestDeduplicator.instance;
    }
  
    /**
     * Deduplicate a request - returns existing promise if in progress
     */
    async deduplicate<T>(
      key: string,
      request: (signal?: AbortSignal) => Promise<T>,
      options?: {
        timeout?: number;
        forceRefresh?: boolean;
      }
    ): Promise<T> {
      const { timeout = this.STALE_REQUEST_TIMEOUT_MS, forceRefresh = false } = options || {};
  
      // Force refresh bypasses deduplication
      if (forceRefresh) {
        return this.executeRequest(key, request, timeout);
      }
  
      // Return existing request if in progress
      const existing = this.pending.get(key);
      if (existing) {
        const age = Date.now() - existing.timestamp;

        // If request is too old, abort and restart
        if (age > timeout) {
          console.warn(`⏰ Request ${key} timed out, restarting`);
          existing.abortController?.abort();
          this.pending.delete(key);
        } else {
          return existing.promise as Promise<T>;
        }
      }
  
      return this.executeRequest(key, request, timeout);
    }
  
    /**
     * Execute a new request with tracking
     */
    private async executeRequest<T>(
      key: string,
      request: (signal?: AbortSignal) => Promise<T>,
      timeout: number
    ): Promise<T> {
      const abortController = new AbortController();
      
      const promise = (async () => {
        try {
          // Add timeout
          const timeoutId = setTimeout(() => {
            abortController.abort();
          }, timeout);
  
          const result = await request(abortController.signal);
          
          clearTimeout(timeoutId);
          return result;
        } finally {
          this.pending.delete(key);
        }
      })();
  
      this.pending.set(key, {
        promise,
        timestamp: Date.now(),
        abortController,
      });
  
      return promise;
    }
  
    /**
     * Check if a request is currently pending
     */
    isPending(key: string): boolean {
      return this.pending.has(key);
    }
  
    /**
     * Cancel a pending request
     */
    cancel(key: string): boolean {
      const pending = this.pending.get(key);
      if (pending) {
        pending.abortController?.abort();
        this.pending.delete(key);
        return true;
      }
      return false;
    }
  
    /**
     * Cancel all pending requests
     */
    cancelAll(): void {
      for (const pending of this.pending.values()) {
        pending.abortController?.abort();
      }
      this.pending.clear();
    }
  
    /**
     * Clear completed/stale requests
     */
    clear(): void {
      this.pending.clear();
    }
  
    /**
     * Get count of pending requests
     */
    getPendingCount(): number {
      return this.pending.size;
    }
  
    /**
     * Periodic cleanup of stale requests
     */
    private startPeriodicCleanup(): void {
      if (this.cleanupTimer) return;
  
      this.cleanupTimer = setInterval(() => {
        const now = Date.now();
        let cleaned = 0;
  
        for (const [key, pending] of this.pending.entries()) {
          const age = now - pending.timestamp;
          if (age > this.STALE_REQUEST_TIMEOUT_MS) {
            pending.abortController?.abort();
            this.pending.delete(key);
            cleaned++;
          }
        }
  
        if (cleaned > 0) {
          console.log(`🧹 Cleaned ${cleaned} stale requests`);
        }
      }, 60000); // Check every minute
    }
  
    /**
     * Dispose and cleanup
     */
    dispose(): void {
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
      this.cancelAll();
      console.log('✅ RequestDeduplicator disposed');
    }
  }
  
  // Singleton instance
  export const requestDeduplicator = RequestDeduplicator.getInstance();
  
  /**
   * React hook for deduplicating requests
   */
  export function useDeduplicate() {
    return {
      deduplicate: requestDeduplicator.deduplicate.bind(requestDeduplicator),
      isPending: requestDeduplicator.isPending.bind(requestDeduplicator),
      cancel: requestDeduplicator.cancel.bind(requestDeduplicator),
    };
  }