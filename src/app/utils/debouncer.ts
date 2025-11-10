/**
 * Debouncer - Delays execution until after a specified time
 * Matches Flutter's Debouncer class
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any;

type DebouncedFunction<T extends AnyFunction> = {
    (...args: Parameters<T>): void;
    cancel: () => void;
    flush: () => void;
    pending: () => boolean;
  };

  class Debouncer {
    private timers = new Map<string, NodeJS.Timeout>();
    private pendingCalls = new Map<string, { fn: AnyFunction; args: unknown[] }>();
  
    /**
     * Create a debounced function
     */
    debounce<T extends AnyFunction>(
      key: string,
      fn: T,
      delayMs: number
    ): DebouncedFunction<T> {
      const debouncedFn = (...args: Parameters<T>) => {
        // Cancel existing timer
        const existingTimer = this.timers.get(key);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
  
        // Store pending call
        this.pendingCalls.set(key, { fn, args });
  
        // Set new timer
        const timer = setTimeout(() => {
          const pending = this.pendingCalls.get(key);
          if (pending) {
            pending.fn(...pending.args);
            this.pendingCalls.delete(key);
          }
          this.timers.delete(key);
        }, delayMs);
  
        this.timers.set(key, timer);
      };
  
      // Add utility methods
      debouncedFn.cancel = () => this.cancel(key);
      debouncedFn.flush = () => this.flush(key);
      debouncedFn.pending = () => this.pending(key);
  
      return debouncedFn as DebouncedFunction<T>;
    }
  
    /**
     * Run a function after delay (simple version)
     */
    run(key: string, fn: AnyFunction, delayMs: number): void {
      this.cancel(key);
  
      this.pendingCalls.set(key, { fn, args: [] });
  
      const timer = setTimeout(() => {
        const pending = this.pendingCalls.get(key);
        if (pending) {
          pending.fn();
          this.pendingCalls.delete(key);
        }
        this.timers.delete(key);
      }, delayMs);
  
      this.timers.set(key, timer);
    }
  
    /**
     * Cancel a pending debounced call
     */
    cancel(key: string): void {
      const timer = this.timers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
      this.pendingCalls.delete(key);
    }
  
    /**
     * Execute pending call immediately
     */
    flush(key: string): void {
      const timer = this.timers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
  
      const pending = this.pendingCalls.get(key);
      if (pending) {
        pending.fn(...pending.args);
        this.pendingCalls.delete(key);
      }
    }
  
    /**
     * Check if a call is pending
     */
    pending(key: string): boolean {
      return this.timers.has(key);
    }
  
    /**
     * Cancel all pending calls
     */
    cancelAll(): void {
      for (const timer of this.timers.values()) {
        clearTimeout(timer);
      }
      this.timers.clear();
      this.pendingCalls.clear();
    }
  
    /**
     * Get count of pending calls
     */
    getPendingCount(): number {
      return this.timers.size;
    }
  
    /**
     * Dispose and cleanup
     */
    dispose(): void {
      this.cancelAll();
      console.log('✅ Debouncer disposed');
    }
  }
  
  // Singleton instance
  export const debouncer = new Debouncer();
  
  /**
   * React hook for debouncing
   */
  export function useDebounce<T extends AnyFunction>(
    fn: T,
    delayMs: number,
    key?: string
  ): DebouncedFunction<T> {
    const debouncerKey = key || fn.toString();
    return debouncer.debounce(debouncerKey, fn, delayMs);
  }
  
  /**
   * Common debounce delays (matching Flutter)
   */
  export const DEBOUNCE_DELAYS = {
    SEARCH: 300,        // Search input
    SCROLL: 200,        // Scroll events
    RESIZE: 200,        // Window resize
    NOTIFY: 200,        // State notifications
    CART: 500,          // Cart operations
    API_CALL: 300,      // General API calls
  } as const;