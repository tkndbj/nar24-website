// services/cartfavoritesmetricsEventService.ts

import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";
import { sha256 } from "crypto-hash";

// ── Config (matches Flutter MetricsEventService) ────────────────────────────
const FLUSH_DEBOUNCE_MS = 30_000; // 30s
const ACTION_COOLDOWN_MS = 1_000; // 1s per eventType:productId
const MAX_RETRY_ATTEMPTS = 3;
const MAX_BUFFER_SIZE = 100; // matches server-side max
const PERSIST_KEY = "pending_metrics_events";
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000; // 24h

interface MetricsEvent {
  type: string;
  productId: string;
  shopId?: string;
}

interface PersistedData {
  events: MetricsEvent[];
  timestamp: number;
}

class MetricsEventService {
  private static instance: MetricsEventService | null = null;

  // ── Buffer ──────────────────────────────────────────────────────────────
  private pendingEvents: MetricsEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing = false;

  // ── Cooldown tracking ───────────────────────────────────────────────────
  // Key: "$eventType:$productId" to allow cart and fav on same product
  private lastActionTime = new Map<string, number>();

  // ── Retry state ─────────────────────────────────────────────────────────
  private retryAttempts = 0;

  // Cached auth reference
  private _auth: ReturnType<typeof getAuth> | null = null;

  private get auth() {
    if (!this._auth) {
      this._auth = getAuth();
    }
    return this._auth;
  }

  private constructor() {
    // Load persisted events from previous session
    this.loadPersistedEvents();

    // Persist on page unload
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        this.persistPendingEvents();
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && this.pendingEvents.length > 0) {
          this.persistPendingEvents();
        }
      });
    }
  }

  static getInstance(): MetricsEventService {
    if (!MetricsEventService.instance) {
      MetricsEventService.instance = new MetricsEventService();
    }
    return MetricsEventService.instance;
  }

  // ── Batch ID (matches Flutter: deterministic, 30s window) ──────────────
  private async generateBatchId(): Promise<string> {
    const userId = this.auth.currentUser?.uid ?? "anonymous";
    const timestamp = Date.now();
    const roundedTimestamp = Math.floor(timestamp / 30000) * 30000;
    const input = `${userId}-cart_fav-${roundedTimestamp}`;
    const hash = await sha256(input);
    return `cart_fav_${hash.substring(0, 16)}`;
  }

  // ── Core enqueue (matches Flutter _enqueue) ────────────────────────────
  private enqueue(
    eventType: string,
    productId: string,
    shopId?: string | null,
  ): void {
    if (!this.auth.currentUser) {
      console.warn("⚠️ MetricsEventService: user not authenticated, skipping");
      return;
    }

    const cooldownKey = `${eventType}:${productId}`;
    const now = Date.now();
    const lastAction = this.lastActionTime.get(cooldownKey);

    if (lastAction && now - lastAction < ACTION_COOLDOWN_MS) {
      console.log(`⏱️ MetricsEventService: cooldown active for ${cooldownKey}`);
      return;
    }
    this.lastActionTime.set(cooldownKey, now);

    const event: MetricsEvent = { type: eventType, productId };
    if (shopId) event.shopId = shopId;

    this.pendingEvents.push(event);

    console.log(
      `📥 MetricsEventService: queued ${eventType} for ${productId} (buffer: ${this.pendingEvents.length})`,
    );

    if (this.pendingEvents.length >= MAX_BUFFER_SIZE) {
      console.warn("⚠️ MetricsEventService: buffer full, forcing flush");
      if (this.flushTimer) clearTimeout(this.flushTimer);
      void this.flush();
      return;
    }

    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), FLUSH_DEBOUNCE_MS);
  }

  // ── Flush (matches Flutter _flush) ─────────────────────────────────────
  async flush(): Promise<void> {
    if (this.isFlushing) return;
    if (this.pendingEvents.length === 0) return;

    this.isFlushing = true;

    // Snapshot and clear before async work
    const eventsToSend = [...this.pendingEvents];
    this.pendingEvents = [];

    try {
      const batchId = await this.generateBatchId();

      console.log(
        `📤 MetricsEventService: flushing ${eventsToSend.length} events (batchId: ${batchId})`,
      );

      const functions = getFunctions(undefined, "europe-west3");
      const callable = httpsCallable(functions, "batchCartFavoriteEvents");

      await callable({
        batchId,
        events: eventsToSend,
      });

      this.retryAttempts = 0;
      this.clearPersistedEvents();

      console.log(
        `✅ MetricsEventService: flushed ${eventsToSend.length} events`,
      );
    } catch (error) {
      console.error("❌ MetricsEventService: flush failed —", error);

      // Put events back at front for retry
      this.pendingEvents = [...eventsToSend, ...this.pendingEvents];
      this.retryAttempts++;

      if (this.retryAttempts < MAX_RETRY_ATTEMPTS) {
        const retryDelay = 10_000 * this.retryAttempts;
        console.log(
          `🔄 MetricsEventService: retry ${this.retryAttempts}/${MAX_RETRY_ATTEMPTS} in ${retryDelay / 1000}s`,
        );
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.flushTimer = setTimeout(() => void this.flush(), retryDelay);
      } else {
        console.warn(
          `💾 MetricsEventService: max retries, persisting ${this.pendingEvents.length} events`,
        );
        this.persistPendingEvents();
        this.pendingEvents = [];
        this.retryAttempts = 0;
      }
    } finally {
      this.isFlushing = false;
    }
  }

  // ── Persistence (localStorage, matches Flutter SQLite role) ────────────
  private persistPendingEvents(): void {
    if (this.pendingEvents.length === 0) return;
    try {
      const data: PersistedData = {
        events: this.pendingEvents,
        timestamp: Date.now(),
      };
      localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
      console.log(
        `💾 MetricsEventService: persisted ${this.pendingEvents.length} events`,
      );
    } catch (e) {
      console.error("❌ MetricsEventService: persist failed —", e);
    }
  }

  private loadPersistedEvents(): void {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem(PERSIST_KEY);
      if (!stored) return;

      const data: PersistedData = JSON.parse(stored);

      if (Date.now() - data.timestamp > MAX_EVENT_AGE_MS) {
        localStorage.removeItem(PERSIST_KEY);
        return;
      }

      const toLoad = data.events.slice(0, MAX_BUFFER_SIZE);
      this.pendingEvents.push(...toLoad);
      localStorage.removeItem(PERSIST_KEY);

      if (toLoad.length > 0) {
        console.log(`📦 MetricsEventService: restored ${toLoad.length} events`);
        this.scheduleFlush();
      }
    } catch (e) {
      console.warn("⚠️ MetricsEventService: load persisted failed —", e);
      if (typeof window !== "undefined") {
        localStorage.removeItem(PERSIST_KEY);
      }
    }
  }

  private clearPersistedEvents(): void {
    localStorage.removeItem(PERSIST_KEY);
  }

  // ── Public API (same signatures as before) ─────────────────────────────

  logEvent({
    eventType,
    productId,
    shopId,
  }: {
    eventType: string;
    productId: string;
    shopId?: string | null;
  }): void {
    this.enqueue(eventType, productId, shopId);
  }

  logBatchEvents({
    events,
  }: {
    events: Array<{ type: string; productId: string; shopId?: string | null }>;
  }): void {
    for (const event of events) {
      if (!event.type || !event.productId) {
        console.warn("⚠️ MetricsEventService: skipping invalid event:", event);
        continue;
      }
      this.enqueue(event.type, event.productId, event.shopId);
    }
  }

  logCartAdded({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): void {
    this.enqueue("cart_added", productId, shopId);
  }

  logCartRemoved({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): void {
    this.enqueue("cart_removed", productId, shopId);
  }

  logFavoriteAdded({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): void {
    this.enqueue("favorite_added", productId, shopId);
  }

  logFavoriteRemoved({
    productId,
    shopId,
  }: {
    productId: string;
    shopId?: string | null;
  }): void {
    this.enqueue("favorite_removed", productId, shopId);
  }

  logBatchCartRemovals({
    productIds,
    shopIds,
  }: {
    productIds: string[];
    shopIds: Record<string, string | null | undefined>;
  }): void {
    this.logBatchEvents({
      events: productIds.map((productId) => ({
        type: "cart_removed",
        productId,
        shopId: shopIds[productId] || undefined,
      })),
    });
  }

  logBatchFavoriteRemovals({
    productIds,
    shopIds,
  }: {
    productIds: string[];
    shopIds: Record<string, string | null | undefined>;
  }): void {
    this.logBatchEvents({
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
