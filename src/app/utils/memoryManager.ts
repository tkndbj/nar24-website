// utils/memoryManager.ts
/**
 * Memory Manager - Monitors and manages memory usage
 * Mimics Flutter's MemoryManager for React with aggressive cleanup
 */

import { cacheManager } from './cacheManager';
import { analyticsBatcher } from './analyticsBatcher';

class MemoryManager {
  private static instance: MemoryManager;
  private checkInterval: NodeJS.Timeout | null = null;
  private scheduledCleanupTimer: NodeJS.Timeout | null = null;
  
  // ✅ Reduced from 60s to 30s (matching Flutter)
  private readonly CHECK_INTERVAL_MS = 30000; // 30 seconds
  
  // ✅ Scheduled cleanup every 5 minutes (like Flutter)
  private readonly SCHEDULED_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  
  // ✅ Lower threshold from 70% to 60%
  private readonly MEMORY_THRESHOLD = 60; // 60%

  private constructor() {
    this.setupMemoryManagement();
  }

  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager();
    }
    return MemoryManager.instance;
  }

  setupMemoryManagement(): void {
    if (typeof window === 'undefined') return;

    // ✅ Check memory usage every 30 seconds
    this.checkInterval = setInterval(() => {
      this.checkAndClearIfNeeded();
    }, this.CHECK_INTERVAL_MS);

    // ✅ NEW: Scheduled cleanup every 5 minutes (like Flutter)
    this.scheduledCleanupTimer = setInterval(() => {
      console.log('🕐 Scheduled memory cleanup (5 min interval)');
      this.performScheduledCleanup();
    }, this.SCHEDULED_CLEANUP_INTERVAL);

    // Listen for visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ App visible, running memory check');
        this.checkAndClearIfNeeded();
      }
    });

    console.log('🧠 Memory Manager initialized (30s checks, 5min cleanups)');
  }

  async checkAndClearIfNeeded(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // Use Performance API if available
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const usedMB = memory.usedJSHeapSize / 1024 / 1024;
        const limitMB = memory.jsHeapSizeLimit / 1024 / 1024;
        const percentUsed = (usedMB / limitMB) * 100;

        console.log(
          `🧠 Memory: ${usedMB.toFixed(2)}MB / ${limitMB.toFixed(2)}MB (${percentUsed.toFixed(1)}%)`
        );

        // ✅ Trigger cleanup at 60% (was 70%)
        if (percentUsed > this.MEMORY_THRESHOLD) {
          console.warn(`⚠️ High memory usage (${percentUsed.toFixed(1)}%), triggering cleanup`);
          this.performCleanup();
        }
      }
    } catch (error) {
      console.error('❌ Error checking memory:', error);
    }
  }

  private performCleanup(): void {
    console.log('🧹 Starting emergency memory cleanup...');

    try {
      // 1. ✅ NEW: Clear CacheManager caches
      this.clearCacheManagerCaches();

      // 2. Clear browser image caches
      this.clearImageCaches();

      // 3. ✅ NEW: Flush analytics to free buffers
      this.flushAnalytics();

      // 4. Dispatch cleanup event for components to handle
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('memory-cleanup'));
      }

      // 5. Force garbage collection if available (only in Chrome with flag)
      if (typeof window !== 'undefined' && 'gc' in window) {
        (window as any).gc();
        console.log('🗑️ Forced garbage collection');
      }

      console.log('✅ Emergency memory cleanup complete');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }

  /**
   * ✅ NEW: Scheduled cleanup every 5 minutes (like Flutter)
   */
  private performScheduledCleanup(): void {
    console.log('🧹 Starting scheduled memory cleanup...');

    try {
      // Clear static caches
      this.clearCacheManagerCaches();

      // Log cache statistics
      console.log('📊 Cache stats after cleanup:');
      cacheManager.logStats();

      console.log('✅ Scheduled cleanup complete');
    } catch (error) {
      console.error('❌ Error during scheduled cleanup:', error);
    }
  }

  /**
   * ✅ NEW: Clear CacheManager caches
   */
  private clearCacheManagerCaches(): void {
    try {
      const cacheNames = cacheManager.getCacheNames();
      const initialCount = cacheNames.length;

      // Get memory estimate before
      const memoryBefore = cacheManager.getMemoryEstimate();

      // Clear all caches
      cacheManager.clearAll();

      // Get memory estimate after
      const memoryAfter = cacheManager.getMemoryEstimate();
      const freedKB = (memoryBefore - memoryAfter) / 1024;

      console.log(
        `🗑️ Cleared ${initialCount} cache(s), freed ~${freedKB.toFixed(2)}KB`
      );
    } catch (error) {
      console.error('❌ Error clearing cache manager:', error);
    }
  }

  /**
   * ✅ NEW: Flush analytics buffers
   */
  private flushAnalytics(): void {
    try {
      analyticsBatcher.flushAll().catch((error) => {
        console.error('❌ Error flushing analytics:', error);
      });
      console.log('📤 Analytics buffers flushed');
    } catch (error) {
      console.error('❌ Error flushing analytics:', error);
    }
  }

  private clearImageCaches(): void {
    // Clear blob URLs that might be cached
    if (typeof window !== 'undefined' && window.caches) {
      window.caches.keys().then((names) => {
        names.forEach((name) => {
          if (name.includes('image') || name.includes('asset')) {
            window.caches.delete(name);
          }
        });
      });
    }
  }

  /**
   * Get current memory usage percentage
   */
  getMemoryUsage(): number | null {
    if (typeof window === 'undefined') return null;

    try {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const usedMB = memory.usedJSHeapSize / 1024 / 1024;
        const limitMB = memory.jsHeapSizeLimit / 1024 / 1024;
        return (usedMB / limitMB) * 100;
      }
    } catch (error) {
      console.error('❌ Error getting memory usage:', error);
    }

    return null;
  }

  dispose(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.scheduledCleanupTimer) {
      clearInterval(this.scheduledCleanupTimer);
      this.scheduledCleanupTimer = null;
    }

    console.log('✅ Memory Manager disposed');
  }
}

export const memoryManager = MemoryManager.getInstance();