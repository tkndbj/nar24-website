/**
 * Circuit Breaker - Prevents cascading failures
 * Matches Flutter's Algolia circuit breaker pattern
 */

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  cooldownPeriod?: number;
}

interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  nextAttemptTime: number | null;
}

class CircuitBreaker {
  private circuits = new Map<string, CircuitStats>();
  
  // Default configuration (matching Flutter)
  private readonly DEFAULT_FAILURE_THRESHOLD = 8;
  private readonly DEFAULT_SUCCESS_THRESHOLD = 2;
  private readonly DEFAULT_TIMEOUT = 10000; // 10 seconds
  private readonly DEFAULT_COOLDOWN = 5 * 60 * 1000; // 5 minutes

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    fallback?: () => Promise<T>,
    options?: CircuitBreakerOptions
  ): Promise<T> {
    const {
      failureThreshold = this.DEFAULT_FAILURE_THRESHOLD,
      successThreshold = this.DEFAULT_SUCCESS_THRESHOLD,
      timeout = this.DEFAULT_TIMEOUT,
      cooldownPeriod = this.DEFAULT_COOLDOWN,
    } = options || {};

    const circuit = this.getOrCreateCircuit(key);

    // Check if circuit is open
    if (circuit.state === 'open') {
      const now = Date.now();
      
      // Check if cooldown period has passed
      if (circuit.nextAttemptTime && now >= circuit.nextAttemptTime) {
        console.log(`🔄 Circuit ${key} entering half-open state`);
        circuit.state = 'half-open';
        circuit.successes = 0;
      } else {
        console.warn(`⚡ Circuit ${key} is open, using fallback`);
        if (fallback) {
          return fallback();
        }
        throw new Error(`Circuit breaker open for ${key}`);
      }
    }

    try {
      // Execute with timeout
      const result = await this.withTimeout(fn(), timeout);
      
      this.recordSuccess(key, successThreshold);
      return result;
    } catch (error) {
      this.recordFailure(key, failureThreshold, cooldownPeriod);
      
      if (fallback) {
        console.log(`🔄 Circuit ${key} failed, using fallback`);
        return fallback();
      }
      
      throw error;
    }
  }

  /**
   * Check if circuit is open
   */
  isOpen(key: string): boolean {
    const circuit = this.circuits.get(key);
    if (!circuit) return false;

    if (circuit.state === 'open') {
      const now = Date.now();
      
      // Check if cooldown has passed
      if (circuit.nextAttemptTime && now >= circuit.nextAttemptTime) {
        circuit.state = 'half-open';
        return false;
      }
      
      return true;
    }

    return false;
  }

  /**
   * Get circuit state
   */
  getState(key: string): CircuitState {
    return this.circuits.get(key)?.state || 'closed';
  }

  /**
   * Get circuit statistics
   */
  getStats(key: string): CircuitStats | null {
    return this.circuits.get(key) || null;
  }

  /**
   * Manually reset a circuit
   */
  reset(key: string): void {
    const circuit = this.circuits.get(key);
    if (circuit) {
      circuit.state = 'closed';
      circuit.failures = 0;
      circuit.successes = 0;
      circuit.lastFailureTime = null;
      circuit.nextAttemptTime = null;
      console.log(`🔄 Circuit ${key} manually reset`);
    }
  }

  /**
   * Reset all circuits
   */
  resetAll(): void {
    for (const key of this.circuits.keys()) {
      this.reset(key);
    }
  }

  /**
   * Get or create circuit
   */
  private getOrCreateCircuit(key: string): CircuitStats {
    if (!this.circuits.has(key)) {
      this.circuits.set(key, {
        state: 'closed',
        failures: 0,
        successes: 0,
        lastFailureTime: null,
        nextAttemptTime: null,
      });
    }
    return this.circuits.get(key)!;
  }

  /**
   * Record a successful execution
   */
  private recordSuccess(key: string, successThreshold: number): void {
    const circuit = this.circuits.get(key);
    if (!circuit) return;

    if (circuit.state === 'half-open') {
      circuit.successes++;
      
      if (circuit.successes >= successThreshold) {
        console.log(`✅ Circuit ${key} recovered, closing`);
        circuit.state = 'closed';
        circuit.failures = 0;
        circuit.successes = 0;
        circuit.lastFailureTime = null;
        circuit.nextAttemptTime = null;
      }
    } else if (circuit.state === 'closed') {
      // Reset failure count on success
      circuit.failures = 0;
    }
  }

  /**
   * Record a failed execution
   */
  private recordFailure(
    key: string,
    failureThreshold: number,
    cooldownPeriod: number
  ): void {
    const circuit = this.circuits.get(key);
    if (!circuit) return;

    const now = Date.now();
    circuit.failures++;
    circuit.lastFailureTime = now;

    if (circuit.state === 'half-open') {
      console.warn(`⚡ Circuit ${key} failed in half-open state, reopening`);
      circuit.state = 'open';
      circuit.nextAttemptTime = now + cooldownPeriod;
      circuit.successes = 0;
    } else if (circuit.failures >= failureThreshold) {
      console.warn(
        `⚡ Circuit ${key} opened after ${circuit.failures} failures`
      );
      circuit.state = 'open';
      circuit.nextAttemptTime = now + cooldownPeriod;
    }
  }

  /**
   * Execute function with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * Log all circuit states
   */
  logStats(): void {
    console.group('⚡ Circuit Breaker Statistics');
    
    for (const [key, stats] of this.circuits.entries()) {
      const emoji = 
        stats.state === 'open' ? '🔴' : 
        stats.state === 'half-open' ? '🟡' : 
        '🟢';
      
      console.log(
        `${emoji} ${key}: ${stats.state} (failures: ${stats.failures}, successes: ${stats.successes})`
      );
    }
    
    console.groupEnd();
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.circuits.clear();
    console.log('✅ CircuitBreaker disposed');
  }
}

// Singleton instance
export const circuitBreaker = new CircuitBreaker();

// Named circuit constants
export const CIRCUITS = {
  ALGOLIA_MAIN: 'algolia_main',
  ALGOLIA_SHOP: 'algolia_shop',
  FIREBASE_PRODUCTS: 'firebase_products',
  FIREBASE_SHOP_PRODUCTS: 'firebase_shop_products',
  RECOMMENDATIONS: 'recommendations',
} as const;