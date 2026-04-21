// services/cartfavoritesmetricsEventService.ts

import { getFunctions, httpsCallable } from "firebase/functions";
import { getAnalytics, logEvent } from "firebase/analytics";
import { getAuth } from "firebase/auth";

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

interface EventRecord {
  productId: string;
  collection: "products" | "shop_products";
  shopId: string | null;
  type: "cart" | "favorite";
  delta: 1 | -1;
}

class MetricsEventService {
  private static instance: MetricsEventService | null = null;

  // ── Cooldown ──────────────────────────────────────────────────────────────
  private lastActionTime = new Map<string, number>();
  private readonly ACTION_COOLDOWN_MS = 1000;
  private readonly MAX_COOLDOWN_ENTRIES = 500;

  // ── Buffer (mirrors analyticsBatcher pattern) ─────────────────────────────
  private buffer: EventRecord[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_INTERVAL = 15_000;
  private readonly MAX_BATCH_SIZE = 30;
  private readonly MAX_RETRIES = 3;
  private retryCount = 0;
  private isSending = false;
  private isDisposed = false;

  private _auth: ReturnType<typeof getAuth> | null = null;
  private get auth() {
    if (!this._auth) this._auth = getAuth();
    return this._auth;
  }

  private _callable: ReturnType<typeof httpsCallable> | null = null;
  private get callable() {
    if (!this._callable) {
      const functions = getFunctions(undefined, "europe-west3");
      this._callable = httpsCallable(functions, "trackCartFavEvent");
    }
    return this._callable;
  }

  private constructor() {
    if (typeof window !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.flush();
      });

      window.addEventListener("beforeunload", () => {
        this.persistBuffer();
      });

      this.loadPersistedBuffer();
    }
  }

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

  // ── Core: enqueue event ───────────────────────────────────────────────────

  private enqueue(event: EventRecord): void {
    if (this.isDisposed) return;
    if (!this.auth.currentUser) return;

    this.buffer.push(event);
    this.scheduleBatch();

    if (this.buffer.length >= this.MAX_BATCH_SIZE) {
      this.sendBatch();
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  logCartAdded({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): void {
    if (!this.checkCooldown(`cart_added:${productId}`)) return;
    this.logAnalytics("cart_added", productId, shopId);
    this.enqueue({
      productId,
      collection: shopId ? "shop_products" : "products",
      shopId: shopId ?? null,
      type: "cart",
      delta: 1,
    });
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
    this.enqueue({
      productId,
      collection: shopId ? "shop_products" : "products",
      shopId: shopId ?? null,
      type: "cart",
      delta: -1,
    });
  }

  logFavoriteAdded({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): void {
    if (!this.checkCooldown(`favorite_added:${productId}`)) return;
    this.logAnalytics("favorite_added", productId, shopId);
    this.enqueue({
      productId,
      collection: shopId ? "shop_products" : "products",
      shopId: shopId ?? null,
      type: "favorite",
      delta: 1,
    });
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
    this.enqueue({
      productId,
      collection: shopId ? "shop_products" : "products",
      shopId: shopId ?? null,
      type: "favorite",
      delta: -1,
    });
  }

  // ── Batch operations ──────────────────────────────────────────────────────

  logBatchCartRemovals({
    productIds,
    shopIds,
  }: {
    productIds: string[];
    shopIds: Record<string, string | null | undefined>;
  }): void {
    for (const id of productIds) {
      this.logCartRemoved({ productId: id, shopId: shopIds[id] });
    }
  }

  logBatchFavoriteRemovals({
    productIds,
    shopIds,
  }: {
    productIds: string[];
    shopIds: Record<string, string | null | undefined>;
  }): void {
    for (const id of productIds) {
      this.logFavoriteRemoved({ productId: id, shopId: shopIds[id] });
    }
  }

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

  // ── Batch sending ─────────────────────────────────────────────────────────

  private scheduleBatch(): void {
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.batchTimer = setTimeout(() => this.sendBatch(), this.BATCH_INTERVAL);
  }

  private async sendBatch(): Promise<void> {
    if (this.buffer.length === 0 || this.isSending) return;
    if (!this.auth.currentUser) return;

    this.isSending = true;

    const toSend = [...this.buffer];
    this.buffer = [];
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      await this.callable({ events: toSend });

      console.log(
        `📊 MetricsEventService: sent ${toSend.length} events in 1 batch call`,
      );
      this.retryCount = 0;
      localStorage.removeItem("pending_cartfav_buffer");
    } catch (e) {
      console.error("❌ MetricsEventService: batch send failed —", e);

      if (this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        this.buffer.unshift(...toSend);
        setTimeout(() => {
          if (!this.isDisposed) this.sendBatch();
        }, 2000 * this.retryCount);
      } else {
        console.warn(
          `❌ MetricsEventService: max retries, dropping ${toSend.length} events`,
        );
        this.retryCount = 0;
      }
    } finally {
      this.isSending = false;
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private persistBuffer(): void {
    if (this.buffer.length === 0) {
      localStorage.removeItem("pending_cartfav_buffer");
      return;
    }
    try {
      localStorage.setItem(
        "pending_cartfav_buffer",
        JSON.stringify(this.buffer),
      );
    } catch {}
  }

  private loadPersistedBuffer(): void {
    try {
      const stored = localStorage.getItem("pending_cartfav_buffer");
      if (!stored) return;
      const data: EventRecord[] = JSON.parse(stored);
      if (Array.isArray(data) && data.length > 0) {
        this.buffer.push(...data);
        console.log(
          `📦 MetricsEventService: restored ${data.length} buffered events`,
        );
        this.scheduleBatch();
      }
      localStorage.removeItem("pending_cartfav_buffer");
    } catch {
      localStorage.removeItem("pending_cartfav_buffer");
    }
  }

  async flush(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    await this.sendBatch();
  }

  async dispose(): Promise<void> {
    this.isDisposed = true;
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.persistBuffer();
    this.buffer = [];
    this.lastActionTime.clear();
  }
}

const metricsEventService = MetricsEventService.getInstance();
export default metricsEventService;
export { MetricsEventService };