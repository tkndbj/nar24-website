// services/cartfavoritesmetricsEventService.ts

import {
  doc,
  writeBatch,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { getAnalytics, logEvent } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";

let analytics: ReturnType<typeof getAnalytics> | null = null;

function getAnalyticsInstance() {
  if (!analytics && typeof window !== "undefined") {
    try {
      analytics = getAnalytics();
    } catch (e) {
      void e;
    }
  }
  return analytics;
}

class MetricsEventService {
  private static instance: MetricsEventService | null = null;

  private lastActionTime = new Map<string, number>();
  private readonly ACTION_COOLDOWN_MS = 1000;
  private readonly MAX_COOLDOWN_ENTRIES = 500;

  private _auth: ReturnType<typeof getAuth> | null = null;
  private get auth() {
    if (!this._auth) this._auth = getAuth();
    return this._auth;
  }

  private constructor() {}

  static getInstance(): MetricsEventService {
    if (!MetricsEventService.instance) {
      MetricsEventService.instance = new MetricsEventService();
    }
    return MetricsEventService.instance;
  }

  // ── Cooldown ──────────────────────────────────────────────────────────────

  private checkCooldown(key: string): boolean {
    const now = Date.now();
    const last = this.lastActionTime.get(key);
    if (last && now - last < this.ACTION_COOLDOWN_MS) return false;
    this.lastActionTime.set(key, now);

    if (this.lastActionTime.size > this.MAX_COOLDOWN_ENTRIES) {
      const sorted = [...this.lastActionTime.entries()].sort(
        (a, b) => a[1] - b[1],
      );
      sorted
        .slice(0, this.lastActionTime.size - this.MAX_COOLDOWN_ENTRIES)
        .forEach(([k]) => this.lastActionTime.delete(k));
    }

    return true;
  }

  // ── GA4 ───────────────────────────────────────────────────────────────────

  private logAnalytics(
    eventType: string,
    productId: string,
    shopId?: string | null,
  ): void {
    const a = getAnalyticsInstance();
    if (a) {
      logEvent(a, eventType, {
        product_id: productId,
        shop_id: shopId ?? "",
      });
    }
  }

  // ── Core write ────────────────────────────────────────────────────────────

  private async incrementMetric(
    productId: string,
    shopId?: string | null,
    options?: { cart?: number; favorite?: number },
  ): Promise<void> {
    if (!this.auth.currentUser) return;

    const cart = options?.cart ?? 0;
    const favorite = options?.favorite ?? 0;
    const collection = shopId ? "shop_products" : "products";

    try {
      const batch = writeBatch(db);

      const updateData: Record<
        string,
        ReturnType<typeof increment> | ReturnType<typeof serverTimestamp>
      > = {
        metricsUpdatedAt: serverTimestamp(),
      };
      if (cart !== 0) updateData.cartCount = increment(cart);
      if (favorite !== 0) updateData.favoritesCount = increment(favorite);

      batch.update(doc(db, collection, productId), updateData);

      if (shopId) {
        const shopUpdate: Record<
          string,
          ReturnType<typeof increment> | ReturnType<typeof serverTimestamp>
        > = {
          "metrics.lastUpdated": serverTimestamp(),
        };
        if (cart > 0) shopUpdate["metrics.totalCartAdditions"] = increment(1);
        if (favorite > 0)
          shopUpdate["metrics.totalFavoriteAdditions"] = increment(1);

        if (Object.keys(shopUpdate).length > 1) {
          batch.update(doc(db, "shops", shopId), shopUpdate);
        }
      }

      await batch.commit();
    } catch (e) {
      console.warn("⚠️ MetricsEventService: write failed —", e);
    }
  }

  // ── Cart ──────────────────────────────────────────────────────────────────

  logCartAdded({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): void {
    if (!this.checkCooldown(`cart_added:${productId}`)) return;
    this.logAnalytics("cart_added", productId, shopId);
    this.incrementMetric(productId, shopId, { cart: 1 });
  }

  logCartRemoved({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): void {
    if (!this.checkCooldown(`cart_removed:${productId}`)) return;
    this.logAnalytics("cart_removed", productId, shopId);
    this.incrementMetric(productId, shopId, { cart: -1 });
  }

  // ── Favorites ─────────────────────────────────────────────────────────────

  logFavoriteAdded({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): void {
    if (!this.checkCooldown(`favorite_added:${productId}`)) return;
    this.logAnalytics("favorite_added", productId, shopId);
    this.incrementMetric(productId, shopId, { favorite: 1 });
  }

  logFavoriteRemoved({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): void {
    if (!this.checkCooldown(`favorite_removed:${productId}`)) return;
    this.logAnalytics("favorite_removed", productId, shopId);
    this.incrementMetric(productId, shopId, { favorite: -1 });
  }

  // ── Batch operations ──────────────────────────────────────────────────────

  logBatchCartRemovals({
    productIds,
    shopIds,
  }: {
    productIds: string[];
    shopIds: Record<string, string | null | undefined>;
  }): void {
    if (!this.auth.currentUser) return;

    const chunks = this.chunkList(productIds, 200);

    for (const chunk of chunks) {
      const batch = writeBatch(db);

      for (const id of chunk) {
        if (!this.checkCooldown(`cart_removed:${id}`)) continue;
        this.logAnalytics("cart_removed", id, shopIds[id]);

        const shopId = shopIds[id];
        const collection = shopId ? "shop_products" : "products";

        batch.update(doc(db, collection, id), {
          cartCount: increment(-1),
          metricsUpdatedAt: serverTimestamp(),
        });

        if (shopId) {
          batch.update(doc(db, "shops", shopId), {
            "metrics.lastUpdated": serverTimestamp(),
          });
        }
      }

      batch.commit().catch((e) => {
        console.warn("⚠️ MetricsEventService: batch cart removal failed —", e);
      });
    }
  }

  logBatchFavoriteRemovals({
    productIds,
    shopIds,
  }: {
    productIds: string[];
    shopIds: Record<string, string | null | undefined>;
  }): void {
    if (!this.auth.currentUser) return;

    const chunks = this.chunkList(productIds, 200);

    for (const chunk of chunks) {
      const batch = writeBatch(db);

      for (const id of chunk) {
        if (!this.checkCooldown(`favorite_removed:${id}`)) continue;
        this.logAnalytics("favorite_removed", id, shopIds[id]);

        const shopId = shopIds[id];
        const collection = shopId ? "shop_products" : "products";

        batch.update(doc(db, collection, id), {
          favoritesCount: increment(-1),
          metricsUpdatedAt: serverTimestamp(),
        });

        if (shopId) {
          batch.update(doc(db, "shops", shopId), {
            "metrics.lastUpdated": serverTimestamp(),
          });
        }
      }

      batch.commit().catch((e) => {
        console.warn(
          "⚠️ MetricsEventService: batch favorite removal failed —",
          e,
        );
      });
    }
  }

  // Backward compatibility
  logEvent({
    eventType,
    productId,
    shopId,
  }: {
    eventType: string;
    productId: string;
    shopId?: string | null;
  }): void {
    switch (eventType) {
      case "cart_added":
        this.logCartAdded({ productId, shopId });
        break;
      case "cart_removed":
        this.logCartRemoved({ productId, shopId });
        break;
      case "favorite_added":
        this.logFavoriteAdded({ productId, shopId });
        break;
      case "favorite_removed":
        this.logFavoriteRemoved({ productId, shopId });
        break;
    }
  }

  logBatchEvents({
    events,
  }: {
    events: Array<{ type: string; productId: string; shopId?: string | null }>;
  }): void {
    for (const event of events) {
      if (!event.type || !event.productId) continue;
      this.logEvent({
        eventType: event.type,
        productId: event.productId,
        shopId: event.shopId,
      });
    }
  }

  // No-ops (no buffer to flush or dispose)
  async flush(): Promise<void> {}
  async dispose(): Promise<void> {}

  // ── Utility ───────────────────────────────────────────────────────────────

  private chunkList<T>(list: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < list.length; i += size) {
      chunks.push(list.slice(i, i + size));
    }
    return chunks;
  }
}

const metricsEventService = MetricsEventService.getInstance();
export default metricsEventService;
export { MetricsEventService };
