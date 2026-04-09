// utils/analyticsBatcher.ts

import userActivityService from "@/services/userActivity";
import { getAnalytics, logEvent } from "firebase/analytics";

let analytics: ReturnType<typeof getAnalytics> | null = null;
function getAnalyticsInstance() {
  if (!analytics && typeof window !== "undefined") {
    try {
      analytics = getAnalytics();
    } catch {}
  }
  return analytics;
}

class AnalyticsBatcher {
  private static instance: AnalyticsBatcher;

  // ── Cooldown ──────────────────────────────────────────────────────────────
  private readonly CLICK_COOLDOWN = 1000;
  private lastClickTime: Map<string, number> = new Map();
  private readonly MAX_COOLDOWN_ENTRIES = 500;

  // ── Click buffer (mirrors Flutter ClickService) ───────────────────────────
  private clickBuffer: ClickRecord[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_INTERVAL = 15_000; // 15 seconds
  private readonly MAX_BATCH_SIZE = 30;
  private readonly MAX_RETRIES = 3;
  private retryCount = 0;
  private isSending = false;

  private isDisposed = false;
  private currentUserId: string | null = null;

  // ── Auth helper ───────────────────────────────────────────────────────────
  private async getAuthToken(): Promise<string | null> {
    try {
      const { getAuth } = await import("firebase/auth");
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return null;
      return await user.getIdToken();
    } catch {
      return null;
    }
  }

  private constructor() {
    if (typeof window !== "undefined") {
      // Flush on tab hide
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.flush();
      });

      // Best-effort flush on unload
      window.addEventListener("beforeunload", () => {
        this.persistBuffer();
      });

      this.loadPersistedBuffer();
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

  // ── Product click ─────────────────────────────────────────────────────────
  recordClick(
    productId: string,
    shopId?: string,
    metadata?: {
      productName?: string;
      category?: string;
      subcategory?: string;
      subsubcategory?: string;
      brand?: string;
      gender?: string;
      price?: number;
      source?: string;
    },
  ): void {
    if (this.isDisposed) return;

    const now = Date.now();
    const lastClick = this.lastClickTime.get(productId);
    if (lastClick && now - lastClick < this.CLICK_COOLDOWN) return;
    this.lastClickTime.set(productId, now);
    this.enforceCooldownLimit();

    // User activity tracking (recommendation engine)
    userActivityService.trackClick({
      productId,
      shopId,
      productName: metadata?.productName,
      category: metadata?.category,
      subcategory: metadata?.subcategory,
      subsubcategory: metadata?.subsubcategory,
      brand: metadata?.brand,
      gender: metadata?.gender,
      price: metadata?.price,
      source: metadata?.source,
    });

    // Determine collection — same logic as Flutter
    const cleanId = productId.includes("_")
      ? productId.split("_").pop()!
      : productId;
    const collection = shopId ? "shop_products" : "products";

    const a = getAnalyticsInstance();
    if (a) {
      logEvent(a, "product_click", {
        product_id: productId,
        shop_id: shopId ?? "",
        collection,
        product_name: (metadata?.productName ?? "").substring(0, 100),
        category: metadata?.category ?? "",
        subcategory: metadata?.subcategory ?? "",
        brand: metadata?.brand ?? "",
        gender: metadata?.gender ?? "",
      });
    }

    this.clickBuffer.push({
      productId: cleanId,
      collection,
      shopId: shopId ?? null,
    });

    this.scheduleBatch();

    if (this.clickBuffer.length >= this.MAX_BATCH_SIZE) {
      this.flush();
    }
  }

  // ── Shop click ────────────────────────────────────────────────────────────-
  recordShopClick(shopId: string): void {
    if (this.isDisposed) return;

    const a = getAnalyticsInstance();
    if (a) {
      logEvent(a, "shop_click", { shop_id: shopId });
    }

    const now = Date.now();
    const lastClick = this.lastClickTime.get(shopId);
    if (lastClick && now - lastClick < this.CLICK_COOLDOWN) return;
    this.lastClickTime.set(shopId, now);
    this.enforceCooldownLimit();

    this.clickBuffer.push({
      productId: shopId,
      collection: "shops",
      shopId,
    });

    this.scheduleBatch();
  }

  // ── Batch sending ─────────────────────────────────────────────────────────
  private scheduleBatch(): void {
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.batchTimer = setTimeout(() => this.sendBatch(), this.BATCH_INTERVAL);
  }

  private async sendBatch(): Promise<void> {
    if (this.clickBuffer.length === 0 || this.isSending) return;
    this.isSending = true;

    const toSend = [...this.clickBuffer];
    this.clickBuffer = [];
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      const token = await this.getAuthToken();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // Call the cloud function directly (same one Flutter calls)
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const url = `https://europe-west3-${projectId}.cloudfunctions.net/trackProductClick`;

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            clicks: toSend.map((c) => ({
              productId: c.productId,
              collection: c.collection,
              shopId: c.shopId,
            })),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`trackProductClick returned ${response.status}`);
      }

      console.log(
        `📊 AnalyticsBatcher: sent ${toSend.length} clicks in 1 batch call`,
      );
      this.retryCount = 0;
      localStorage.removeItem("pending_click_buffer");
    } catch (e) {
      console.error("❌ AnalyticsBatcher: batch send failed —", e);

      if (this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        this.clickBuffer.unshift(...toSend);
        setTimeout(() => {
          if (!this.isDisposed) this.sendBatch();
        }, 2000 * this.retryCount);
      } else {
        console.warn(
          `❌ AnalyticsBatcher: max retries, dropping ${toSend.length} clicks`,
        );
        this.retryCount = 0;
      }
    } finally {
      this.isSending = false;
    }
  }

  // ── Persistence (beforeunload recovery) ───────────────────────────────────
  private persistBuffer(): void {
    if (this.clickBuffer.length === 0) {
      localStorage.removeItem("pending_click_buffer");
      return;
    }
    try {
      localStorage.setItem(
        "pending_click_buffer",
        JSON.stringify(this.clickBuffer),
      );
    } catch {}
  }

  private loadPersistedBuffer(): void {
    try {
      const stored = localStorage.getItem("pending_click_buffer");
      if (!stored) return;
      const data: ClickRecord[] = JSON.parse(stored);
      if (Array.isArray(data) && data.length > 0) {
        this.clickBuffer.push(...data);
        console.log(
          `📦 AnalyticsBatcher: restored ${data.length} buffered clicks`,
        );
        this.scheduleBatch();
      }
      localStorage.removeItem("pending_click_buffer");
    } catch {
      localStorage.removeItem("pending_click_buffer");
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private enforceCooldownLimit(): void {
    if (this.lastClickTime.size > this.MAX_COOLDOWN_ENTRIES) {
      const sorted = [...this.lastClickTime.entries()].sort(
        (a, b) => a[1] - b[1],
      );
      sorted
        .slice(0, this.lastClickTime.size - this.MAX_COOLDOWN_ENTRIES)
        .forEach(([k]) => this.lastClickTime.delete(k));
    }
  }

  async flush(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    await this.sendBatch();
  }

  dispose(): void {
    this.isDisposed = true;
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.persistBuffer();
    this.clickBuffer = [];
    this.lastClickTime.clear();
  }
}

interface ClickRecord {
  productId: string;
  collection: string;
  shopId: string | null;
}

export const analyticsBatcher = AnalyticsBatcher.getInstance();
