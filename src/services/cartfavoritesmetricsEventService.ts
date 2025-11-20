// services/cartfavoritesmetricsEventService.ts

import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";

/**
 * Service for logging cart/favorite metrics events to Cloud Functions
 *
 * Events are processed asynchronously by Cloud Functions and aggregated
 * into product/shop metrics every 1-2 minutes.
 *
 * This service is non-blocking and fails silently - metrics logging
 * never affects user operations.
 */
class MetricsEventService {
  private static instance: MetricsEventService | null = null;

  private constructor() {
    if (MetricsEventService.instance) {
      return MetricsEventService.instance;
    }
    MetricsEventService.instance = this;
  }

  static getInstance(): MetricsEventService {
    if (!MetricsEventService.instance) {
      MetricsEventService.instance = new MetricsEventService();
    }
    return MetricsEventService.instance;
  }

  /**
   * Get Cloud Functions instance (europe-west3 region)
   */
  private getFunctionsInstance() {
    return getFunctions(undefined, "europe-west3");
  }

  /**
   * Log a single cart/favorite event
   */
  async logEvent({
    eventType,
    productId,
    shopId,
  }: {
    eventType: string;
    productId: string;
    shopId?: string | null;
  }): Promise<void> {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      console.warn("⚠️ Cannot log metric event: User not authenticated");
      return;
    }

    // Generate deterministic batch ID
    const batchId = `cart_fav_${user.uid}_${Date.now()}`;

    console.log(
      `🔍 MetricsService.logEvent: type=${eventType}, productId=${productId}, shopId=${shopId}`
    );

    // ✅ Fire-and-forget: No await, returns immediately
    const functions = this.getFunctionsInstance();
    const callable = httpsCallable<
      {
        batchId: string;
        events: Array<{
          type: string;
          productId: string;
          shopId?: string;
        }>;
      },
      unknown
    >(functions, "batchCartFavoriteEvents");

    const eventData: {
      type: string;
      productId: string;
      shopId?: string;
    } = {
      type: eventType,
      productId,
    };

    if (shopId) {
      eventData.shopId = shopId;
    }

    callable({
      batchId,
      events: [eventData],
    })
      .then(() => {
        console.log(`✅ Logged ${eventType} event for ${productId}`);
      })
      .catch((error) => {
        console.warn(
          `⚠️ Metrics event logging failed: ${error} (non-critical, ignored)`
        );
      });
  }

  /**
   * Log multiple cart/favorite events in a single batch
   *
   * More efficient than calling logEvent multiple times.
   *
   * Example:
   * ```typescript
   * await metricsEventService.logBatchEvents({
   *   events: [
   *     { type: 'cart_removed', productId: 'abc123', shopId: 'shop456' },
   *     { type: 'cart_removed', productId: 'def789', shopId: 'shop456' },
   *   ],
   * });
   * ```
   */
  async logBatchEvents({
    events,
  }: {
    events: Array<{
      type: string;
      productId: string;
      shopId?: string | null;
    }>;
  }): Promise<void> {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      console.warn("⚠️ Cannot log metric events: User not authenticated");
      return;
    }

    if (events.length === 0) {
      console.warn("⚠️ No events to log");
      return;
    }

    // Validate event structure
    for (const event of events) {
      if (!event.type || !event.productId) {
        console.warn(`⚠️ Invalid event structure:`, event);
        return;
      }
    }

    const batchId = `cart_fav_${user.uid}_${Date.now()}`;

    // ✅ Fire-and-forget: No await, returns immediately
    const functions = this.getFunctionsInstance();
    const callable = httpsCallable<
      {
        batchId: string;
        events: Array<{
          type: string;
          productId: string;
          shopId?: string;
        }>;
      },
      unknown
    >(functions, "batchCartFavoriteEvents");

    // Filter out null shopId values
    const cleanedEvents = events.map((event) => {
      const cleanedEvent: {
        type: string;
        productId: string;
        shopId?: string;
      } = {
        type: event.type,
        productId: event.productId,
      };

      if (event.shopId) {
        cleanedEvent.shopId = event.shopId;
      }

      return cleanedEvent;
    });

    callable({
      batchId,
      events: cleanedEvents,
    })
      .then(() => {
        console.log(`✅ Logged ${events.length} batch events`);
      })
      .catch((error) => {
        console.warn(
          `⚠️ Batch metrics logging failed: ${error} (non-critical, ignored)`
        );
      });
  }

  /**
   * Log cart addition event
   *
   * Convenience wrapper for logEvent with eventType='cart_added'
   */
  async logCartAdded({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): Promise<void> {
    return this.logEvent({
      eventType: "cart_added",
      productId,
      shopId,
    });
  }

  /**
   * Log cart removal event
   *
   * Convenience wrapper for logEvent with eventType='cart_removed'
   */
  async logCartRemoved({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): Promise<void> {
    return this.logEvent({
      eventType: "cart_removed",
      productId,
      shopId,
    });
  }

  /**
   * Log favorite addition event
   *
   * Convenience wrapper for logEvent with eventType='favorite_added'
   */
  async logFavoriteAdded({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): Promise<void> {
    return this.logEvent({
      eventType: "favorite_added",
      productId,
      shopId,
    });
  }

  /**
   * Log favorite removal event
   *
   * Convenience wrapper for logEvent with eventType='favorite_removed'
   */
  async logFavoriteRemoved({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): Promise<void> {
    return this.logEvent({
      eventType: "favorite_removed",
      productId,
      shopId,
    });
  }

  /**
   * Log multiple cart removals (batch operation)
   */
  async logBatchCartRemovals({
    productIds,
    shopIds,
  }: {
    productIds: string[];
    shopIds: Record<string, string | null | undefined>;
  }): Promise<void> {
    return this.logBatchEvents({
      events: productIds.map((productId) => ({
        type: "cart_removed",
        productId,
        shopId: shopIds[productId] || undefined,
      })),
    });
  }

  /**
   * Log multiple favorite removals (batch operation)
   */
  async logBatchFavoriteRemovals({
    productIds,
    shopIds,
  }: {
    productIds: string[];
    shopIds: Record<string, string | null | undefined>;
  }): Promise<void> {
    return this.logBatchEvents({
      events: productIds.map((productId) => ({
        type: "favorite_removed",
        productId,
        shopId: shopIds[productId] || undefined,
      })),
    });
  }
}

// ✅ Export singleton instance
const metricsEventService = MetricsEventService.getInstance();
export default metricsEventService;
export { MetricsEventService };
