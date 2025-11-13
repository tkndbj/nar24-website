// utils/analyticsBatcher.ts

import { sha256 } from "crypto-hash";
import { circuitBreaker } from "./circuitBreaker";
import { batchUpdateClicksCallable } from "@/lib/firebase-callable";

interface ClickData {
  productId: string;
  shopId?: string;
  count: number;
  isShopClick?: boolean; // ✅ NEW: Flag to identify direct shop clicks
}

class AnalyticsBatcher {
  private static instance: AnalyticsBatcher;

  // Batch ID management (matches Flutter)
  private currentBatchId: string | null = null;
  private batchIdCreatedAt: number | null = null;
  private readonly BATCH_ID_TTL = 30000; // 30 seconds

  // Click tracking
  private clickBuffer: Map<string, ClickData> = new Map();
  private clickFlushTimer: NodeJS.Timeout | null = null;
  private readonly CLICK_FLUSH_INTERVAL = 20000; // 20 seconds (matches Flutter)
  private readonly CLICK_COOLDOWN = 1000; // 1 second cooldown per product
  private lastClickTime: Map<string, number> = new Map();

  private lastSuccessfulFlush: number | null = null;

  // Retry management
  private retryAttempts = 0;
  private readonly MAX_RETRY_ATTEMPTS = 3;

  private isDisposed = false;
  private currentUserId: string | null = null;

  // Buffer limits (matches Flutter)
  private readonly MAX_BUFFER_SIZE = 500;
  private readonly MAX_MEMORY_BYTES = 512 * 1024; // 512KB

  // Circuit breaker key
  private readonly CIRCUIT_KEY = "click_tracking";

  private constructor() {
    // Setup visibility change listener for background flushing
    if (typeof window !== "undefined") {
      document.addEventListener(
        "visibilitychange",
        this.handleVisibilityChange
      );
      window.addEventListener("beforeunload", this.handleBeforeUnload);
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

    // Throttle rapid clicks (matches Flutter cooldown)
    const now = Date.now();
    const lastClick = this.lastClickTime.get(productId);
    if (lastClick && now - lastClick < this.CLICK_COOLDOWN) {
      return;
    }

    this.lastClickTime.set(productId, now);

    // Extract clean product ID (matches Flutter logic)
    const cleanId = productId.includes("_")
      ? productId.split("_").pop()!
      : productId;

    // Check buffer limits before adding (matches Flutter)
    const totalBuffered = this.getTotalBufferedCount();
    if (this.shouldForceFlush(totalBuffered)) {
      console.warn("⚠️ Buffer limit reached, forcing flush");
      void this.flushClicks();
    }

    const existing = this.clickBuffer.get(cleanId);
    this.clickBuffer.set(cleanId, {
      productId: cleanId,
      shopId: shopId || existing?.shopId,
      count: (existing?.count || 0) + 1,
      isShopClick: false, // ✅ This is a product click
    });

    this.scheduleClickFlush();
  }

  // ✅ NEW: Record shop clicks (matches Flutter's trackShopClick)
  recordShopClick(shopId: string): void {
    if (this.isDisposed) return;

    // Throttle rapid clicks (matches Flutter cooldown)
    const now = Date.now();
    const lastClick = this.lastClickTime.get(shopId);
    if (lastClick && now - lastClick < this.CLICK_COOLDOWN) {
      return;
    }

    this.lastClickTime.set(shopId, now);

    // Extract clean shop ID (matches Flutter logic)
    const cleanId = shopId.includes("_") ? shopId.split("_").pop()! : shopId;

    // Check buffer limits before adding
    const totalBuffered = this.getTotalBufferedCount();
    if (this.shouldForceFlush(totalBuffered)) {
      console.warn("⚠️ Buffer limit reached, forcing flush");
      void this.flushClicks();
    }

    const existing = this.clickBuffer.get(cleanId);
    this.clickBuffer.set(cleanId, {
      productId: cleanId, // Store shop ID in productId field
      shopId: undefined,
      count: (existing?.count || 0) + 1,
      isShopClick: true, // ✅ Flag as shop click
    });

    this.scheduleClickFlush();
  }

  private getTotalBufferedCount(): number {
    return this.clickBuffer.size;
  }

  private shouldForceFlush(totalBuffered: number): boolean {
    const estimatedMemory = totalBuffered * 100; // Rough estimate

    return (
      totalBuffered >= this.MAX_BUFFER_SIZE ||
      estimatedMemory >= this.MAX_MEMORY_BYTES ||
      (this.lastSuccessfulFlush !== null &&
        Date.now() - this.lastSuccessfulFlush > 5 * 60 * 1000) // 5 minutes
    );
  }

  private scheduleClickFlush(): void {
    if (this.clickFlushTimer) return;

    this.clickFlushTimer = setTimeout(() => {
      void this.flushClicks();
    }, this.CLICK_FLUSH_INTERVAL);
  }

  async flushClicks(): Promise<void> {
    if (this.clickBuffer.size === 0) return;

    // Check circuit breaker using utility
    if (circuitBreaker.isOpen(this.CIRCUIT_KEY)) {
      console.warn("🔴 Circuit breaker open, skipping flush");
      return;
    }

    const clicksToFlush = new Map(this.clickBuffer);
    this.clickBuffer.clear();

    if (this.clickFlushTimer) {
      clearTimeout(this.clickFlushTimer);
      this.clickFlushTimer = null;
    }

    try {
      // Build payload matching Flutter structure
      const productClicks: Record<string, number> = {};
      const shopProductClicks: Record<string, number> = {};
      const shopClicks: Record<string, number> = {}; // ✅ NOW WE USE THIS
      const shopIds: Record<string, string> = {};

      clicksToFlush.forEach((data, itemId) => {
        // ✅ NEW: Route to correct bucket based on isShopClick flag
        if (data.isShopClick) {
          // Direct shop click
          shopClicks[itemId] = data.count;
        } else if (data.shopId) {
          // Product click with shop association
          shopProductClicks[itemId] = data.count;
          shopIds[itemId] = data.shopId;
        } else {
          // Regular product click
          productClicks[itemId] = data.count;
        }
      });

      const totalClicks =
        Object.keys(productClicks).length +
        Object.keys(shopProductClicks).length +
        Object.keys(shopClicks).length;

      // Generate batch ID for idempotency
      const batchId = await this.generateBatchId();

      const payload = {
        batchId,
        productClicks,
        shopProductClicks,
        shopClicks,
        shopIds,
      };

      const payloadSize = JSON.stringify(payload).length;

      // Chunk if too large (matches Flutter logic)
      if (totalClicks > 500 || payloadSize > 1000000) {
        await this.flushInChunks(
          productClicks,
          shopProductClicks,
          shopClicks,
          shopIds
        );
      } else {
        // Wrap in circuit breaker
        await circuitBreaker.execute(
          this.CIRCUIT_KEY,
          async () => {
            await this.sendToFunction(payload);
          },
          async () => {
            // Fallback: Re-add clicks to buffer
            console.warn("⚡ Circuit open, re-adding clicks to buffer");
            clicksToFlush.forEach((data, itemId) => {
              const existing = this.clickBuffer.get(itemId);
              this.clickBuffer.set(itemId, {
                productId: itemId,
                shopId: data.shopId || existing?.shopId,
                count: (existing?.count || 0) + data.count,
                isShopClick: data.isShopClick || false,
              });
            });
          },
          {
            failureThreshold: 8,
            successThreshold: 2,
            timeout: 10000,
            cooldownPeriod: 5 * 60 * 1000,
          }
        );
      }

      // Reset on success
      this.retryAttempts = 0;
      this.lastSuccessfulFlush = Date.now();

      console.log(`✅ Flushed ${totalClicks} clicks with batch ID: ${batchId}`);
    } catch (error) {
      console.error("❌ Error flushing clicks:", error);

      // Retry logic
      this.retryAttempts++;
      if (this.retryAttempts < this.MAX_RETRY_ATTEMPTS) {
        const retryDelay = 10000 * this.retryAttempts; // 10s, 20s, 30s
        console.log(`🔄 Retrying in ${retryDelay / 1000}s`);

        setTimeout(() => {
          void this.flushClicks();
        }, retryDelay);
      } else {
        console.warn("⚠️ Max retries reached, clicks lost");
        this.retryAttempts = 0;
      }

      // Re-add failed clicks
      clicksToFlush.forEach((data, itemId) => {
        const existing = this.clickBuffer.get(itemId);
        this.clickBuffer.set(itemId, {
          productId: itemId,
          shopId: data.shopId || existing?.shopId,
          count: (existing?.count || 0) + data.count,
          isShopClick: data.isShopClick || false,
        });
      });
    }
  }

  private async flushInChunks(
    productClicks: Record<string, number>,
    shopProductClicks: Record<string, number>,
    shopClicks: Record<string, number>,
    shopIds: Record<string, string>
  ): Promise<void> {
    console.log("📦 Chunking large payload");

    const chunkSize = 500;
    const allItems: Array<{
      id: string;
      type: "product" | "shop_product" | "shop";
      count: number;
    }> = [];

    Object.entries(productClicks).forEach(([id, count]) => {
      allItems.push({ id, type: "product", count });
    });
    Object.entries(shopProductClicks).forEach(([id, count]) => {
      allItems.push({ id, type: "shop_product", count });
    });
    Object.entries(shopClicks).forEach(([id, count]) => {
      allItems.push({ id, type: "shop", count });
    });

    // Generate base batch ID once
    const baseBatchId = await this.generateBatchId();
    let chunkIndex = 0;

    for (let i = 0; i < allItems.length; i += chunkSize) {
      const chunk = allItems.slice(i, i + chunkSize);

      const chunkPayload = {
        batchId: `${baseBatchId}_chunk_${chunkIndex}`,
        productClicks: {} as Record<string, number>,
        shopProductClicks: {} as Record<string, number>,
        shopClicks: {} as Record<string, number>,
        shopIds: {} as Record<string, string>,
      };
      chunkIndex++;

      chunk.forEach((item) => {
        if (item.type === "product") {
          chunkPayload.productClicks[item.id] = item.count;
        } else if (item.type === "shop_product") {
          chunkPayload.shopProductClicks[item.id] = item.count;
          if (shopIds[item.id]) {
            chunkPayload.shopIds[item.id] = shopIds[item.id];
          }
        } else if (item.type === "shop") {
          chunkPayload.shopClicks[item.id] = item.count;
        }
      });

      // Wrap each chunk in circuit breaker
      await circuitBreaker.execute(
        this.CIRCUIT_KEY,
        async () => {
          await this.sendToFunction(chunkPayload);
        },
        async () => {
          console.warn(`⚡ Circuit open, skipping chunk ${chunkIndex}`);
          throw new Error("Circuit open");
        },
        {
          failureThreshold: 8,
          successThreshold: 2,
          timeout: 10000,
          cooldownPeriod: 5 * 60 * 1000,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private async sendToFunction(payload: {
    batchId: string;
    productClicks: Record<string, number>;
    shopProductClicks: Record<string, number>;
    shopClicks: Record<string, number>;
    shopIds: Record<string, string>;
  }): Promise<void> {
    try {
      const result = await batchUpdateClicksCallable(payload);

      console.log("✅ Cloud Function response:", result.data);

      if (!result.data.success) {
        throw new Error(result.data.error || "Cloud Function returned failure");
      }
    } catch (error) {
      console.error("❌ sendToFunction failed:", error);
      throw error;
    }
  }

  private async generateBatchId(): Promise<string> {
    const now = Date.now();

    // Reuse current batch ID if within TTL
    if (this.currentBatchId && this.batchIdCreatedAt) {
      if (now - this.batchIdCreatedAt < this.BATCH_ID_TTL) {
        return this.currentBatchId;
      }
    }

    // Create new deterministic batch ID
    const userId = this.currentUserId || "anonymous";
    const roundedTimestamp = Math.floor(now / 30000) * 30000;

    const input = `${userId}-${roundedTimestamp}`;
    const hash = await sha256(input);

    this.currentBatchId = `batch_${hash.substring(0, 16)}`;
    this.batchIdCreatedAt = now;

    return this.currentBatchId;
  }

  // ============= LIFECYCLE MANAGEMENT =============

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      console.log("📱 App backgrounding - flushing all analytics");
      void this.flushAll();
    }
  };

  private handleBeforeUnload = (): void => {
    this.flushAllWithBeacon();
  };

  async flushAll(): Promise<void> {
    await Promise.all([this.flushClicks()]);
  }

  private async flushAllWithBeacon(): Promise<void> {
    if (this.clickBuffer.size === 0) return;

    try {
      const productClicks: Record<string, number> = {};
      const shopProductClicks: Record<string, number> = {};
      const shopClicks: Record<string, number> = {};
      const shopIds: Record<string, string> = {};

      this.clickBuffer.forEach((data, id) => {
        // ✅ NEW: Route to correct bucket based on isShopClick flag
        if (data.isShopClick) {
          shopClicks[id] = data.count;
        } else if (data.shopId) {
          shopProductClicks[id] = data.count;
          shopIds[id] = data.shopId;
        } else {
          productClicks[id] = data.count;
        }
      });

      const batchId = await this.generateBatchId();

      const payload = {
        batchId,
        productClicks,
        shopProductClicks,
        shopClicks,
        shopIds,
      };

      const projectId =
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "emlak-mobile-app";
      const functionUrl = `https://europe-west3-${projectId}.cloudfunctions.net/batchUpdateClicks`;

      const success = navigator.sendBeacon(
        functionUrl,
        JSON.stringify({ data: payload })
      );

      if (success) {
        console.log("✅ Final flush via sendBeacon successful");
      } else {
        console.warn("⚠️ sendBeacon failed, data may be lost");
      }
    } catch (error) {
      console.error("❌ Error in flushAllWithBeacon:", error);
    }
  }

  dispose(): void {
    console.log("🗑️ AnalyticsBatcher: Disposing...");

    this.isDisposed = true;

    void this.flushAllWithBeacon();

    if (this.clickFlushTimer) clearTimeout(this.clickFlushTimer);

    this.clickBuffer.clear();
    this.lastClickTime.clear();

    if (typeof window !== "undefined") {
      document.removeEventListener(
        "visibilitychange",
        this.handleVisibilityChange
      );
      window.removeEventListener("beforeunload", this.handleBeforeUnload);
    }

    console.log("✅ AnalyticsBatcher: Disposal complete");
  }

  // ============= METRICS =============

  getMetrics(): {
    bufferedClicks: number;
    circuitOpen: boolean;
    circuitState: string;
    retryAttempts: number;
    lastSuccess: string | null;
  } {
    const circuitStats = circuitBreaker.getStats(this.CIRCUIT_KEY);

    return {
      bufferedClicks: this.getTotalBufferedCount(),
      circuitOpen: circuitBreaker.isOpen(this.CIRCUIT_KEY),
      circuitState: circuitStats?.state || "closed",
      retryAttempts: this.retryAttempts,
      lastSuccess: this.lastSuccessfulFlush
        ? new Date(this.lastSuccessfulFlush).toISOString()
        : null,
    };
  }
}

export const analyticsBatcher = AnalyticsBatcher.getInstance();
