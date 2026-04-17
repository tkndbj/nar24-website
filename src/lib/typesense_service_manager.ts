/**
 * lib/typesense_service_manager.ts
 *
 * Singleton manager that owns all TypeSenseService instances and exposes them
 * by concern (products, shop products, orders, shops, restaurants, market).
 *
 * Mirrors the Flutter TypeSenseServiceManager exactly.
 * No `any` types — Vercel-safe.
 */

import { TypeSenseService } from "./typesense_service";
import { RestaurantTypesenseService } from "./typesense_restaurant_service";
import { MarketTypesenseService } from "./typesense_market_service";

export { TypeSenseService } from "./typesense_service";
export { RestaurantTypesenseService } from "./typesense_restaurant_service";
export { MarketTypesenseService } from "./typesense_market_service";
export type {
  TypeSensePage,
  TypeSenseDocument,
  CategorySuggestion,
  FacetCount,
} from "./typesense_service";
export type {
  RestaurantSearchPage,
  FoodSearchPage,
  RestaurantFacets,
  FoodFacets,
  FacetValue,
  RestaurantSortOption,
  FoodSortOption,
} from "./typesense_restaurant_service";
export type {
  MarketItem,
  MarketSearchPage,
  MarketFacets,
  MarketGlobalFacets,
  MarketFacetValue,
  MarketSortOption,
} from "./typesense_market_service";

// ── Configuration ─────────────────────────────────────────────────────────────

const TYPESENSE_HOST =
  process.env.NEXT_PUBLIC_TYPESENSE_HOST ??
  "j0xs6ry9275tu4cop.a2.typesense.net";

const TYPESENSE_SEARCH_KEY =
  process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_KEY ??
  "z8Ii7rZ3MUlpxLvbPLu3WOqmsZemMjBZ";

// ── TypeSenseServiceManager ───────────────────────────────────────────────────

class TypeSenseServiceManager {
  private static _instance: TypeSenseServiceManager | null = null;

  private _mainService: TypeSenseService | null = null;
  private _shopService: TypeSenseService | null = null;
  private _ordersService: TypeSenseService | null = null;
  private _shopsService: TypeSenseService | null = null;
  private _restaurantService: RestaurantTypesenseService | null = null;
  private _marketService: MarketTypesenseService | null = null;

  private constructor() {}

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

  /** Restaurant & food search (`restaurants` + `foods` collections) */
  get restaurantService(): RestaurantTypesenseService {
    if (!this._restaurantService) {
      this._restaurantService = new RestaurantTypesenseService({
        typesenseHost: TYPESENSE_HOST,
        typesenseSearchKey: TYPESENSE_SEARCH_KEY,
      });
    }
    return this._restaurantService;
  }

  /** Market items search (`market_items` collection) */
  get marketService(): MarketTypesenseService {
    if (!this._marketService) {
      this._marketService = new MarketTypesenseService({
        typesenseHost: TYPESENSE_HOST,
        typesenseSearchKey: TYPESENSE_SEARCH_KEY,
      });
    }
    return this._marketService;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  get isInitialized(): boolean {
    return (
      this._mainService !== null &&
      this._shopService !== null &&
      this._ordersService !== null &&
      this._shopsService !== null &&
      this._restaurantService !== null &&
      this._marketService !== null
    );
  }

  resetServices(): void {
    this._marketService?.dispose();
    this._mainService = null;
    this._shopService = null;
    this._ordersService = null;
    this._shopsService = null;
    this._restaurantService = null;
    this._marketService = null;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const results = await Promise.all([
        this.mainService.isServiceReachable(),
        this.shopService.isServiceReachable(),
        this.ordersService.isServiceReachable(),
        this.shopsService.isServiceReachable(),
        this.restaurantService.isServiceReachable(),
        this.marketService.isServiceReachable(),
      ]);
      return results.every(Boolean);
    } catch (err) {
      console.warn("TypeSenseServiceManager health check failed:", err);
      return false;
    }
  }
}

export default TypeSenseServiceManager;