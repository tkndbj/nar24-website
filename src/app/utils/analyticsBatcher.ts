// utils/analyticsBatcher.ts

import { writeProductClick, writeShopClick } from "./clickService";
import userActivityService from "@/services/userActivity";

class AnalyticsBatcher {
  private static instance: AnalyticsBatcher;

  private readonly CLICK_COOLDOWN = 1000;
  private lastClickTime: Map<string, number> = new Map();
  private readonly MAX_COOLDOWN_ENTRIES = 500;

  private isDisposed = false;
  private currentUserId: string | null = null;

  private constructor() {}

  static getInstance(): AnalyticsBatcher {
    if (!AnalyticsBatcher.instance) {
      AnalyticsBatcher.instance = new AnalyticsBatcher();
    }
    return AnalyticsBatcher.instance;
  }

  setCurrentUserId(userId: string | null) {
    this.currentUserId = userId;
  }

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
    }
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

    // Direct Firestore write
    const cleanId = productId.includes("_")
      ? productId.split("_").pop()!
      : productId;
    writeProductClick(cleanId, shopId ? "shop_products" : "products", shopId, metadata);
  }

  recordShopClick(shopId: string): void {
    if (this.isDisposed) return;

    const now = Date.now();
    const lastClick = this.lastClickTime.get(shopId);
    if (lastClick && now - lastClick < this.CLICK_COOLDOWN) return;
    this.lastClickTime.set(shopId, now);
    this.enforceCooldownLimit();

    writeShopClick(shopId);
  }

  private enforceCooldownLimit(): void {
    if (this.lastClickTime.size > this.MAX_COOLDOWN_ENTRIES) {
      const sorted = [...this.lastClickTime.entries()].sort(
        (a, b) => a[1] - b[1]
      );
      sorted
        .slice(0, this.lastClickTime.size - this.MAX_COOLDOWN_ENTRIES)
        .forEach(([k]) => this.lastClickTime.delete(k));
    }
  }

  dispose(): void {
    this.isDisposed = true;
    this.lastClickTime.clear();
  }
}

export const analyticsBatcher = AnalyticsBatcher.getInstance();