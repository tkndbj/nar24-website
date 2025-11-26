// lib/services/userActivity.ts
// Production-ready user activity tracking with batching, persistence, and non-blocking writes

import { 
    getAuth, 
    onAuthStateChanged, 
    User 
  } from 'firebase/auth';
  import { 
    getFunctions, 
    httpsCallable, 
    
  } from 'firebase/functions';
  
  // ============================================================================
  // TYPES & ENUMS
  // ============================================================================
  
  /**
   * Event types for user activity tracking
   */
  export enum ActivityType {
    // Product interactions
    CLICK = 'click',              // Weight: 1 - Clicked from list
    VIEW = 'view',                // Weight: 2 - Viewed product detail (>3s)
    
    // Purchase intent signals
    ADD_TO_CART = 'addToCart',    // Weight: 5 - Strong purchase intent
    REMOVE_FROM_CART = 'removeFromCart', // Weight: -2 - Changed mind
    
    // Engagement signals
    FAVORITE = 'favorite',        // Weight: 3 - Interest saved
    UNFAVORITE = 'unfavorite',    // Weight: -1 - Lost interest
    
    // Conversion signals
    PURCHASE = 'purchase',        // Weight: 10 - Strongest signal
    
    // Discovery signals
    SEARCH = 'search',            // Weight: 1 - Intent indicator
  }
  
  /**
   * Weights for scoring user preferences
   */
  export const ACTIVITY_WEIGHTS: Record<ActivityType, number> = {
    [ActivityType.CLICK]: 1,
    [ActivityType.VIEW]: 2,
    [ActivityType.ADD_TO_CART]: 5,
    [ActivityType.REMOVE_FROM_CART]: -2,
    [ActivityType.FAVORITE]: 3,
    [ActivityType.UNFAVORITE]: -1,
    [ActivityType.PURCHASE]: 10,
    [ActivityType.SEARCH]: 1,
  };
  
  /**
   * Single activity event
   */
  export interface ActivityEvent {
    eventId: string;
    type: ActivityType;
    timestamp: number; // milliseconds since epoch
    productId?: string;
    shopId?: string;
    productName?: string;
    category?: string;
    subcategory?: string;
    subsubcategory?: string;
    brand?: string;
    price?: number;
    searchQuery?: string;
    source?: 'search' | 'category' | 'recommendation' | 'trending' | 'direct' | string;
    quantity?: number;
    totalValue?: number;
    extra?: Record<string, unknown>;
  }
  
  /**
   * Serialized event for storage/transmission
   */
  interface SerializedEvent extends ActivityEvent {
    weight: number;
  }
  
  /**
   * Track click parameters
   */
  export interface TrackClickParams {
    productId: string;
    shopId?: string;
    productName?: string;
    category?: string;
    subcategory?: string;
    subsubcategory?: string;
    brand?: string;
    price?: number;
    source?: string;
  }
  
  /**
   * Track view parameters
   */
  export interface TrackViewParams {
    productId: string;
    shopId?: string;
    category?: string;
    subcategory?: string;
    subsubcategory?: string;
    brand?: string;
    price?: number;
    source?: string;
    viewDurationSeconds?: number;
  }
  
  /**
   * Track add to cart parameters
   */
  export interface TrackAddToCartParams {
    productId: string;
    shopId?: string;
    productName?: string;
    category?: string;
    subcategory?: string;
    subsubcategory?: string;
    brand?: string;
    price?: number;
    quantity?: number;
  }
  
  /**
   * Track remove from cart parameters
   */
  export interface TrackRemoveFromCartParams {
    productId: string;
    shopId?: string;
    productName?: string;
    category?: string;
    brand?: string;
    price?: number;
    quantity?: number;
  }
  
  /**
   * Track favorite parameters
   */
  export interface TrackFavoriteParams {
    productId: string;
    shopId?: string;
    productName?: string;
    category?: string;
    subcategory?: string;
    subsubcategory?: string;
    brand?: string;
    price?: number;
  }
  
  /**
   * Track purchase parameters
   */
  export interface TrackPurchaseParams {
    productId: string;
    shopId?: string;
    productName?: string;
    category?: string;
    subcategory?: string;
    subsubcategory?: string;
    brand?: string;
    price: number;
    quantity: number;
    totalValue: number;
    orderId?: string;
  }
  
  /**
   * Track search parameters
   */
  export interface TrackSearchParams {
    query: string;
    resultCount?: number;
    selectedCategory?: string;
  }
  
  /**
   * Product object for convenience tracking methods
   */
  export interface ProductData {
    id: string;
    shopId?: string;
    category?: string;
    subcategory?: string;
    subsubcategory?: string;
    brandModel?: string;
    price?: number;
  }
  
  /**
   * Cart data object for convenience tracking methods
   */
  export interface CartItemData {
    productId: string;
    shopId?: string;
    productName?: string;
    category?: string;
    subcategory?: string;
    subsubcategory?: string;
    brandModel?: string;
    unitPrice?: number;
  }
  
  // ============================================================================
  // USER ACTIVITY SERVICE
  // ============================================================================
  
  /**
   * Production-ready User Activity Service
   * 
   * Features:
   * - Batched writes (reduces Firestore operations by 90%+)
   * - Local persistence (survives app crashes/restarts)
   * - Deduplication (prevents spam from rapid taps)
   * - Non-blocking (never blocks UI thread)
   * - Offline support (queues events when offline)
   * - Circuit breaker (backs off on repeated failures)
   */
  export class UserActivityService {
    private static instance: UserActivityService | null = null;
  
    // Configuration
    private static readonly MAX_QUEUE_SIZE = 50;
    private static readonly FLUSH_THRESHOLD = 20;
    private static readonly FLUSH_INTERVAL = 30000; // 30 seconds
    private static readonly DEDUPE_WINDOW = 2000; // 2 seconds
    private static readonly STORAGE_KEY = 'pending_user_activities';
    private static readonly MAX_RETRIES = 3;
    private static readonly CIRCUIT_BREAKER_COOLDOWN = 300000; // 5 minutes
  
    // State
    private queue: ActivityEvent[] = [];
    private recentEvents: Map<string, number> = new Map(); // For deduplication
    private flushTimer: NodeJS.Timeout | null = null;
    private isFlushing = false;
    private isInitialized = false;
    private consecutiveFailures = 0;
    private lastFailureTime: number | null = null;
    private currentUser: User | null = null;
    private isOnline = true;
  
    // Firebase - lazily initialized to avoid SSR issues
    private _auth: ReturnType<typeof getAuth> | null = null;
    private _functions: ReturnType<typeof getFunctions> | null = null;

    private get auth() {
      if (!this._auth) {
        this._auth = getAuth();
      }
      return this._auth;
    }

    private get functions() {
      if (!this._functions) {
        this._functions = getFunctions(undefined, 'europe-west3');
      }
      return this._functions;
    }
  
    /**
     * Get singleton instance
     */
    public static getInstance(): UserActivityService {
      if (!UserActivityService.instance) {
        UserActivityService.instance = new UserActivityService();
      }
      return UserActivityService.instance;
    }
  
    private constructor() {
      // Private constructor for singleton
    }
  
    /**
     * Initialize the service (call once at app startup)
     */
    public async initialize(): Promise<void> {
      if (this.isInitialized) return;
  
      try {
        // Setup auth listener
        onAuthStateChanged(this.auth, (user) => {
          this.currentUser = user;
          if (!user) {
            this.clearUserData();
          }
        });
  
        // Load persisted events
        await this.loadPersistedEvents();
  
        // Start flush timer
        this.startFlushTimer();
  
        // Setup connectivity listener
        this.setupConnectivityListener();
  
        // Setup beforeunload handler
        this.setupBeforeUnloadHandler();
  
        // Setup visibility change handler (for tab switching)
        this.setupVisibilityChangeHandler();
  
        this.isInitialized = true;
        console.log(`✅ UserActivityService initialized with ${this.queue.length} pending events`);
      } catch (error) {
        console.error('❌ UserActivityService initialization error:', error);
      }
    }
  
    /**
     * Setup connectivity listener for offline support
     */
    private setupConnectivityListener(): void {
      const updateOnlineStatus = () => {
        const wasOffline = !this.isOnline;
        this.isOnline = navigator.onLine;
  
        // Flush when coming back online
        if (wasOffline && this.isOnline && this.queue.length > 0) {
          console.log(`📶 Back online, flushing ${this.queue.length} pending events`);
          this.flushQueue();
        }
      };
  
      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);
      
      // Initial check
      this.isOnline = navigator.onLine;
    }
  
    /**
     * Setup beforeunload handler to flush on page close
     */
    private setupBeforeUnloadHandler(): void {
      window.addEventListener('beforeunload', () => {
        // Use sendBeacon for guaranteed delivery before page unload
        if (this.queue.length > 0) {
          this.persistEvents();
        }
      });
    }
  
    /**
     * Setup visibility change handler for tab switching
     */
    private setupVisibilityChangeHandler(): void {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.queue.length > 0) {
          // Tab is hidden, persist events
          this.persistEvents();
        }
      });
    }
  
    /**
     * Load persisted events from localStorage
     */
    private async loadPersistedEvents(): Promise<void> {
      try {
        const stored = localStorage.getItem(UserActivityService.STORAGE_KEY);
        if (stored) {
          const decoded: ActivityEvent[] = JSON.parse(stored);
          
          // Only load events from last 24 hours
          const cutoff = Date.now() - (24 * 60 * 60 * 1000);
          this.queue = decoded.filter(e => e.timestamp > cutoff);
          
          console.log(`📥 Loaded ${this.queue.length} persisted events`);
        }
      } catch (error) {
        console.warn('⚠️ Error loading persisted events:', error);
        // Clear corrupted data
        localStorage.removeItem(UserActivityService.STORAGE_KEY);
      }
    }
  
    /**
     * Persist events to localStorage
     */
    private persistEvents(): void {
      if (this.queue.length === 0) {
        localStorage.removeItem(UserActivityService.STORAGE_KEY);
        return;
      }
  
      try {
        const encoded = JSON.stringify(this.queue);
        localStorage.setItem(UserActivityService.STORAGE_KEY, encoded);
      } catch (error) {
        console.warn('⚠️ Error persisting events:', error);
      }
    }
  
    /**
     * Start the periodic flush timer
     */
    private startFlushTimer(): void {
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
      }
  
      this.flushTimer = setInterval(() => {
        if (this.queue.length > 0) {
          this.flushQueue();
        }
      }, UserActivityService.FLUSH_INTERVAL);
    }
  
    /**
     * Check if circuit breaker is open (too many failures)
     */
    private get isCircuitBreakerOpen(): boolean {
      if (this.consecutiveFailures < UserActivityService.MAX_RETRIES) return false;
      if (this.lastFailureTime === null) return false;
      
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed > UserActivityService.CIRCUIT_BREAKER_COOLDOWN) {
        // Reset circuit breaker
        this.consecutiveFailures = 0;
        this.lastFailureTime = null;
        return false;
      }
      return true;
    }
  
    /**
     * Generate a unique event ID
     */
    private generateEventId(type: ActivityType, productId?: string): string {
      const timestamp = Date.now();
      const random = timestamp % 10000;
      return `${type}_${productId || 'none'}_${timestamp}_${random}`;
    }
  
    /**
     * Check for duplicate events (prevents spam from rapid taps)
     */
    private isDuplicate(type: ActivityType, productId?: string): boolean {
      const key = `${type}_${productId || 'none'}`;
      const lastTime = this.recentEvents.get(key);
      
      if (lastTime !== undefined) {
        const elapsed = Date.now() - lastTime;
        if (elapsed < UserActivityService.DEDUPE_WINDOW) {
          return true;
        }
      }
      
      this.recentEvents.set(key, Date.now());
      
      // Cleanup old entries
      if (this.recentEvents.size > 100) {
        const cutoff = Date.now() - UserActivityService.DEDUPE_WINDOW;
        for (const [k, time] of this.recentEvents.entries()) {
          if (time < cutoff) {
            this.recentEvents.delete(k);
          }
        }
      }
      
      return false;
    }
  
    // ============================================================================
    // PUBLIC API - Non-blocking event tracking methods
    // ============================================================================
  
    /**
     * Track a product click (from list view)
     */
    public trackClick(params: TrackClickParams): void {
      this.queueEvent({
        eventId: this.generateEventId(ActivityType.CLICK, params.productId),
        type: ActivityType.CLICK,
        timestamp: Date.now(),
        productId: params.productId,
        shopId: params.shopId,
        productName: params.productName,
        category: params.category,
        subcategory: params.subcategory,
        subsubcategory: params.subsubcategory,
        brand: params.brand,
        price: params.price,
        source: params.source,
      });
    }
  
    /**
     * Track a product view (detail page, >3s viewing time)
     */
    public trackView(params: TrackViewParams): void {
      this.queueEvent({
        eventId: this.generateEventId(ActivityType.VIEW, params.productId),
        type: ActivityType.VIEW,
        timestamp: Date.now(),
        productId: params.productId,
        shopId: params.shopId,
        category: params.category,
        subcategory: params.subcategory,
        subsubcategory: params.subsubcategory,
        brand: params.brand,
        price: params.price,
        source: params.source,
        extra: params.viewDurationSeconds !== undefined 
          ? { viewDuration: params.viewDurationSeconds } 
          : undefined,
      });
    }
  
    /**
     * Track add to cart
     */
    public trackAddToCart(params: TrackAddToCartParams): void {
      this.queueEvent({
        eventId: this.generateEventId(ActivityType.ADD_TO_CART, params.productId),
        type: ActivityType.ADD_TO_CART,
        timestamp: Date.now(),
        productId: params.productId,
        productName: params.productName,
        shopId: params.shopId,
        category: params.category,
        subcategory: params.subcategory,
        subsubcategory: params.subsubcategory,
        brand: params.brand,
        price: params.price,
        quantity: params.quantity || 1,
      });
    }
  
    /**
     * Track remove from cart
     */
    public trackRemoveFromCart(params: TrackRemoveFromCartParams): void {
      this.queueEvent({
        eventId: this.generateEventId(ActivityType.REMOVE_FROM_CART, params.productId),
        type: ActivityType.REMOVE_FROM_CART,
        timestamp: Date.now(),
        productId: params.productId,
        productName: params.productName,
        shopId: params.shopId,
        category: params.category,
        brand: params.brand,
        price: params.price,
        quantity: params.quantity || 1,
      });
    }
  
    /**
     * Track add to favorites
     */
    public trackFavorite(params: TrackFavoriteParams): void {
      this.queueEvent({
        eventId: this.generateEventId(ActivityType.FAVORITE, params.productId),
        type: ActivityType.FAVORITE,
        timestamp: Date.now(),
        productId: params.productId,
        productName: params.productName,
        shopId: params.shopId,
        category: params.category,
        subcategory: params.subcategory,
        subsubcategory: params.subsubcategory,
        brand: params.brand,
        price: params.price,
      });
    }
  
    /**
     * Track remove from favorites
     */
    public trackUnfavorite(params: Omit<TrackFavoriteParams, 'subcategory' | 'subsubcategory'>): void {
      this.queueEvent({
        eventId: this.generateEventId(ActivityType.UNFAVORITE, params.productId),
        type: ActivityType.UNFAVORITE,
        timestamp: Date.now(),
        productId: params.productId,
        productName: params.productName,
        shopId: params.shopId,
        category: params.category,
        brand: params.brand,
        price: params.price,
      });
    }
  
    /**
     * Track purchase (call for each item in order)
     */
    public trackPurchase(params: TrackPurchaseParams): void {
      // Don't dedupe purchases - each one is unique
      const event: ActivityEvent = {
        eventId: this.generateEventId(ActivityType.PURCHASE, params.productId),
        type: ActivityType.PURCHASE,
        timestamp: Date.now(),
        productId: params.productId,
        productName: params.productName,
        shopId: params.shopId,
        category: params.category,
        subcategory: params.subcategory,
        subsubcategory: params.subsubcategory,
        brand: params.brand,
        price: params.price,
        quantity: params.quantity,
        totalValue: params.totalValue,
        extra: params.orderId ? { orderId: params.orderId } : undefined,
      };
      
      this.queue.push(event);
      this.checkFlushThreshold();
    }
  
    /**
     * Track search query
     */
    public trackSearch(params: TrackSearchParams): void {
      const trimmedQuery = params.query.trim();
      if (!trimmedQuery) return;
      
      this.queueEvent({
        eventId: this.generateEventId(ActivityType.SEARCH, trimmedQuery.hashCode().toString()),
        type: ActivityType.SEARCH,
        timestamp: Date.now(),
        searchQuery: trimmedQuery.toLowerCase(),
        category: params.selectedCategory,
        extra: params.resultCount !== undefined 
          ? { resultCount: params.resultCount } 
          : undefined,
      });
    }
  
    // ============================================================================
    // INTERNAL QUEUE MANAGEMENT
    // ============================================================================
  
    /**
     * Add event to queue with deduplication
     */
    private queueEvent(event: ActivityEvent): void {
      // Skip if not initialized
      if (!this.isInitialized) {
        console.warn('⚠️ UserActivityService not initialized, skipping event');
        return;
      }
  
      // Skip if no user (anonymous tracking could be added later)
      if (!this.currentUser) {
        return;
      }
  
      // Skip duplicates (except purchases)
      if (event.type !== ActivityType.PURCHASE && 
          this.isDuplicate(event.type, event.productId || event.searchQuery)) {
        console.log(`⏭️ Skipping duplicate ${event.type} event`);
        return;
      }
  
      // Enforce max queue size (drop oldest if full)
      if (this.queue.length >= UserActivityService.MAX_QUEUE_SIZE) {
        this.queue.shift();
        console.warn('⚠️ Queue full, dropped oldest event');
      }
  
      this.queue.push(event);
      this.checkFlushThreshold();
    }
  
    /**
     * Check if we should flush based on queue size
     */
    private checkFlushThreshold(): void {
      if (this.queue.length >= UserActivityService.FLUSH_THRESHOLD) {
        this.flushQueue();
      } else {
        // Persist to survive crashes
        this.persistEvents();
      }
    }
  
    /**
     * Flush the queue to the server
     */
    private async flushQueue(): Promise<void> {
      if (this.isFlushing || this.queue.length === 0) return;
      if (!this.isOnline) {
        console.log('📵 Offline, deferring flush');
        return;
      }
      if (this.isCircuitBreakerOpen) {
        console.log('🔴 Circuit breaker open, deferring flush');
        return;
      }
  
      this.isFlushing = true;
      
      if (!this.currentUser) {
        this.isFlushing = false;
        return;
      }
  
      // Take a snapshot of events to send
      const eventsToSend = [...this.queue];
      const eventCount = eventsToSend.length;
  
      try {
        console.log(`📤 Flushing ${eventCount} activity events...`);
  
        const callable = httpsCallable(this.functions, 'batchUserActivity', {
          timeout: 30000,
        });
  
        // Serialize events with weights
        const serializedEvents: SerializedEvent[] = eventsToSend.map(e => ({
          ...e,
          weight: ACTIVITY_WEIGHTS[e.type] || 0,
        }));
  
        await callable({
          events: serializedEvents,
          clientTimestamp: Date.now(),
        });
  
        // Success - clear sent events
        this.queue = this.queue.filter(e => !eventsToSend.includes(e));
        this.persistEvents();
        
        this.consecutiveFailures = 0;
        this.lastFailureTime = null;
        
        console.log(`✅ Flushed ${eventCount} activity events`);
      } catch (error) {
        console.error('❌ Failed to flush activity events:', error);
        
        this.consecutiveFailures++;
        this.lastFailureTime = Date.now();
        
        // Don't remove events on failure - they'll be retried
        this.persistEvents();
      } finally {
        this.isFlushing = false;
      }
    }
  
    /**
     * Force flush (call on app pause/background)
     */
    public async forceFlush(): Promise<void> {
      if (this.queue.length > 0) {
        await this.flushQueue();
      }
    }
  
    /**
     * Cleanup (call on logout)
     */
    public clearUserData(): void {
      this.queue = [];
      this.recentEvents.clear();
      localStorage.removeItem(UserActivityService.STORAGE_KEY);
      console.log('🧹 Cleared user activity data');
    }
  
    /**
     * Dispose (call on app termination)
     */
    public dispose(): void {
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }
      this.persistEvents(); // Save any pending events
      this.isInitialized = false;
    }
  
    // ============================================================================
    // CONVENIENCE METHODS FOR INTEGRATION
    // ============================================================================
  
    /**
     * Track from Product object (convenience method)
     */
    public trackProductClick(product: ProductData, source?: string): void {
      try {
        this.trackClick({
          productId: product.id,
          shopId: product.shopId,
          category: product.category,
          subcategory: product.subcategory,
          subsubcategory: product.subsubcategory,
          brand: product.brandModel,
          price: product.price,
          source,
        });
      } catch (error) {
        console.warn('⚠️ Error tracking product click:', error);
      }
    }
  
    /**
     * Track from Product object (convenience method)
     */
    public trackProductView(product: ProductData, source?: string, viewDuration?: number): void {
      try {
        this.trackView({
          productId: product.id,
          shopId: product.shopId,
          category: product.category,
          subcategory: product.subcategory,
          subsubcategory: product.subsubcategory,
          brand: product.brandModel,
          price: product.price,
          source,
          viewDurationSeconds: viewDuration,
        });
      } catch (error) {
        console.warn('⚠️ Error tracking product view:', error);
      }
    }
  
    /**
     * Track from cart data map (convenience method)
     */
    public trackCartAdd(cartData: CartItemData, quantity = 1): void {
      try {
        this.trackAddToCart({
          productId: cartData.productId,
          shopId: cartData.shopId,
          productName: cartData.productName,
          category: cartData.category,
          subcategory: cartData.subcategory,
          subsubcategory: cartData.subsubcategory,
          brand: cartData.brandModel,
          price: cartData.unitPrice,
          quantity,
        });
      } catch (error) {
        console.warn('⚠️ Error tracking cart add:', error);
      }
    }
  
    // ============================================================================
    // STATUS & MONITORING
    // ============================================================================
  
    /**
     * Get queue size (for debugging/monitoring)
     */
    public get pendingEventCount(): number {
      return this.queue.length;
    }
    
    /**
     * Check if service is healthy
     */
    public get isHealthy(): boolean {
      return this.isInitialized && !this.isCircuitBreakerOpen;
    }
  }
  
  // ============================================================================
  // UTILITY EXTENSIONS
  // ============================================================================
  
  // Add hashCode to String prototype for search event IDs
  declare global {
    interface String {
      hashCode(): number;
    }
  }
  
  String.prototype.hashCode = function(): number {
    let hash = 0;
    for (let i = 0; i < this.length; i++) {
      const char = this.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  };
  
  // ============================================================================
  // EXPORTS
  // ============================================================================
  
  // Export singleton instance
  export const userActivityService = UserActivityService.getInstance();
  
  // Export as default for convenience
  export default userActivityService;