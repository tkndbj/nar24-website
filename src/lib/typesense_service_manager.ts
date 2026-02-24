/**
 * typesense_service_manager.ts
 *
 * Singleton manager that owns all TypeSenseService instances and exposes them
 * by concern (products, shop products, orders, shops).
 *
 * Mirrors the Flutter TypeSenseServiceManager exactly.
 * No `any` types — Vercel-safe.
 */

import { TypeSenseService } from "./typesense_service";

export { TypeSenseService } from "./typesense_service";
export type {
  TypeSensePage,
  TypeSenseDocument,
  CategorySuggestion,
  FacetCount,
} from "./typesense_service";

// ── Configuration ─────────────────────────────────────────────────────────────
// Read from environment variables so secrets never live in source code.
// Set NEXT_PUBLIC_TYPESENSE_HOST and NEXT_PUBLIC_TYPESENSE_SEARCH_KEY in your
// .env.local (or Vercel project settings).
//
// If the env vars are absent we fall back to the same values that are
// hard-coded in the Flutter app so the service still works during dev.

const TYPESENSE_HOST =
  process.env.NEXT_PUBLIC_TYPESENSE_HOST ??
  "o17xr5q8psytcabup-1.a2.typesense.net";

const TYPESENSE_SEARCH_KEY =
  process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_KEY ??
  "wYjR4e0aCTTy9GVCImW1U30xlBQTYK51";

// ── TypeSenseServiceManager ───────────────────────────────────────────────────

class TypeSenseServiceManager {
  private static _instance: TypeSenseServiceManager | null = null;

  // Lazily-created service instances — one per Typesense collection group
  private _mainService: TypeSenseService | null = null;
  private _shopService: TypeSenseService | null = null;
  private _ordersService: TypeSenseService | null = null;
  private _shopsService: TypeSenseService | null = null;

  private constructor() {
    // Private — use TypeSenseServiceManager.instance
  }

  static get instance(): TypeSenseServiceManager {
    if (!TypeSenseServiceManager._instance) {
      TypeSenseServiceManager._instance = new TypeSenseServiceManager();
    }
    return TypeSenseServiceManager._instance;
  }

  // ── Service accessors (lazy) ────────────────────────────────────────────────

  /** Main product catalogue (`products` collection) */
  get mainService(): TypeSenseService {
    if (!this._mainService) {
      this._mainService = new TypeSenseService({
        typesenseHost: TYPESENSE_HOST,
        typesenseSearchKey: TYPESENSE_SEARCH_KEY,
        mainIndexName: "products",
        categoryIndexName: "categories",
      });
    }
    return this._mainService;
  }

  /** Shop-specific products (`shop_products` collection) */
  get shopService(): TypeSenseService {
    if (!this._shopService) {
      this._shopService = new TypeSenseService({
        typesenseHost: TYPESENSE_HOST,
        typesenseSearchKey: TYPESENSE_SEARCH_KEY,
        mainIndexName: "shop_products",
        categoryIndexName: "categories",
      });
    }
    return this._shopService;
  }

  /** Orders search (`orders` collection) */
  get ordersService(): TypeSenseService {
    if (!this._ordersService) {
      this._ordersService = new TypeSenseService({
        typesenseHost: TYPESENSE_HOST,
        typesenseSearchKey: TYPESENSE_SEARCH_KEY,
        mainIndexName: "orders",
        categoryIndexName: "categories",
      });
    }
    return this._ordersService;
  }

  /** Shop directory search (`shops` collection) */
  get shopsService(): TypeSenseService {
    if (!this._shopsService) {
      this._shopsService = new TypeSenseService({
        typesenseHost: TYPESENSE_HOST,
        typesenseSearchKey: TYPESENSE_SEARCH_KEY,
        mainIndexName: "shops",
        categoryIndexName: "categories",
      });
    }
    return this._shopsService;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  get isInitialized(): boolean {
    return (
      this._mainService !== null &&
      this._shopService !== null &&
      this._ordersService !== null &&
      this._shopsService !== null
    );
  }

  /**
   * Tear down all service instances.
   * Useful in tests or when reconfiguring connection details at runtime.
   */
  resetServices(): void {
    this._mainService = null;
    this._shopService = null;
    this._ordersService = null;
    this._shopsService = null;
  }

  /**
   * Ping all four collections in parallel.
   * Returns `true` only when every collection responds with a non-5xx status.
   * Times out after 5 seconds (mirrors Flutter implementation).
   */
  async isHealthy(): Promise<boolean> {
    try {
      const results = await Promise.all([
        this.mainService.isServiceReachable(),
        this.shopService.isServiceReachable(),
        this.ordersService.isServiceReachable(),
        this.shopsService.isServiceReachable(),
      ]);
      return results.every(Boolean);
    } catch (err) {
      console.warn("TypeSenseServiceManager health check failed:", err);
      return false;
    }
  }
}

export default TypeSenseServiceManager;
