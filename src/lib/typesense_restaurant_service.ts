/**
 * typesense_restaurant_service.ts
 *
 * Dedicated Typesense service for restaurant and food search.
 * Uses the same direct-HTTP approach as typesense_service.ts but with
 * restaurant/food-specific document types, query fields, sort options,
 * and facet support for cuisineTypes and foodType.
 */

import type { Restaurant } from "@/types/Restaurant";
import type { Food } from "@/types/Food";

// ── Public types ────────────────────────────────────────────────────────────

export interface RestaurantSearchPage {
  items: Restaurant[];
  ids: string[];
  page: number;
  nbPages: number;
  total: number;
}

export interface FoodSearchPage {
  items: Food[];
  ids: string[];
  page: number;
  nbPages: number;
  total: number;
}

export interface RestaurantFacets {
  cuisineTypes?: FacetValue[];
  foodType?: FacetValue[];
  workingDays?: FacetValue[];
}

export interface FoodFacets {
  foodCategory?: FacetValue[];
  foodType?: FacetValue[];
}

export interface FacetValue {
  value: string;
  count: number;
}

// ── Sort options ────────────────────────────────────────────────────────────

export type RestaurantSortOption =
  | "rating_desc"
  | "rating_asc"
  | "name_asc"
  | "name_desc"
  | "newest"
  | "default";

export type FoodSortOption =
  | "price_asc"
  | "price_desc"
  | "name_asc"
  | "newest"
  | "default";

// ── Internal Typesense response shapes ──────────────────────────────────────

interface TypesenseHit {
  document: Record<string, unknown>;
}

interface TypesenseSearchResponse {
  hits?: TypesenseHit[];
  found?: number;
  facet_counts?: Array<{
    field_name?: string;
    counts?: Array<{ value?: unknown; count?: unknown }>;
  }>;
}

// ── Retry helper ────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayFactor = 500,
): Promise<T> {
  let lastErr: Error = new Error("unknown");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const msg = lastErr.message;
      const retryable =
        msg.includes("fetch failed") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("Failed to fetch") ||
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("5");
      if (!retryable || attempt === maxAttempts) throw lastErr;
      const jitter = 1 + (Math.random() * 0.2 - 0.1);
      await sleep(delayFactor * Math.pow(2, attempt - 1) * jitter);
    }
  }
  throw lastErr;
}

// ── Service config ──────────────────────────────────────────────────────────

export interface RestaurantServiceConfig {
  typesenseHost: string;
  typesenseSearchKey: string;
}

// ── RestaurantTypesenseService ──────────────────────────────────────────────

export class RestaurantTypesenseService {
  private readonly host: string;
  private readonly searchKey: string;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceDuration = 300;

  constructor(config: RestaurantServiceConfig) {
    this.host = config.typesenseHost;
    this.searchKey = config.typesenseSearchKey;
  }

  // ── URL & headers ───────────────────────────────────────────────────────

  private searchUrl(collection: string): string {
    if (typeof window !== "undefined") {
      return `/api/typesense/${collection}`;
    }
    return `https://${this.host}/collections/${collection}/documents/search`;
  }

  private get headers(): HeadersInit {
    if (typeof window !== "undefined") {
      return { "Content-Type": "application/json" };
    }
    return {
      "X-TYPESENSE-API-KEY": this.searchKey,
      "Content-Type": "application/json",
    };
  }

  // ── Sort mapping ────────────────────────────────────────────────────────

  private restaurantSortBy(sort: RestaurantSortOption): string {
    switch (sort) {
      case "rating_desc":
        return "averageRating:desc";
      case "rating_asc":
        return "averageRating:asc";
      case "name_asc":
        return "name:asc";
      case "name_desc":
        return "name:desc";
      case "newest":
        return "createdAt:desc";
      default:
        return "averageRating:desc,createdAt:desc";
    }
  }

  private foodSortBy(sort: FoodSortOption): string {
    switch (sort) {
      case "price_asc":
        return "price:asc";
      case "price_desc":
        return "price:desc";
      case "name_asc":
        return "name:asc";
      case "newest":
        return "createdAt:desc";
      default:
        return "createdAt:desc";
    }
  }

  // ── ID extraction ───────────────────────────────────────────────────────

  private extractFirestoreId(
    typesenseId: string,
    collection: string,
  ): string {
    const prefix = `${collection}_`;
    return typesenseId.startsWith(prefix)
      ? typesenseId.slice(prefix.length)
      : typesenseId;
  }

  // ── Core fetch helper ───────────────────────────────────────────────────

  private async fetchTypesense(
    collection: string,
    params: URLSearchParams,
  ): Promise<TypesenseSearchResponse> {
    const url = `${this.searchUrl(collection)}?${params.toString()}`;

    return withRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      try {
        const res = await fetch(url, {
          headers: this.headers,
          signal: controller.signal,
        });
        if (res.status >= 500) {
          throw new Error(`Typesense server error: ${res.status}`);
        }
        if (!res.ok) {
          const errBody = await res.text().catch(() => "(unreadable)");
          console.error(
            `Typesense ${res.status} on ${collection}:\n  ${errBody}`,
          );
          return { hits: [], found: 0 };
        }
        return (await res.json()) as TypesenseSearchResponse;
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  // ── Filter builder ──────────────────────────────────────────────────────

  private buildFilterBy(parts: string[]): string | undefined {
    return parts.length ? parts.join(" && ") : undefined;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ── RESTAURANTS ─────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Search restaurants with optional filters for cuisineTypes, foodType,
   * and sorting by averageRating, name, or date.
   */
  async searchRestaurants(opts: {
    query?: string;
    sort?: RestaurantSortOption;
    page?: number;
    hitsPerPage?: number;
    cuisineTypes?: string[];
    foodType?: string[];
    isActive?: boolean;
  }): Promise<RestaurantSearchPage> {
    const {
      query = "",
      sort = "default",
      page = 0,
      hitsPerPage = 20,
      cuisineTypes,
      foodType,
      isActive,
    } = opts;

    const filterParts: string[] = [];

    if (isActive !== undefined) {
      filterParts.push(`isActive:=${isActive}`);
    }

    if (cuisineTypes?.length) {
      const orParts = cuisineTypes.map((c) => `cuisineTypes:=${c}`);
      if (orParts.length === 1) filterParts.push(orParts[0]);
      else filterParts.push(`(${orParts.join(" || ")})`);
    }

    if (foodType?.length) {
      const orParts = foodType.map((f) => `foodType:=${f}`);
      if (orParts.length === 1) filterParts.push(orParts[0]);
      else filterParts.push(`(${orParts.join(" || ")})`);
    }

    const params = new URLSearchParams({
      q: query.trim() || "*",
      query_by: "name,address",
      sort_by: this.restaurantSortBy(sort),
      per_page: String(hitsPerPage),
      page: String(page + 1),
      include_fields:
        "id,name,address,contactNo,profileImageUrl,ownerId,isActive,isBoosted," +
        "latitude,longitude,averageRating,reviewCount,clickCount,followerCount," +
        "foodType,cuisineTypes,workingDays,createdAt",
    });

    const filterBy = this.buildFilterBy(filterParts);
    if (filterBy) params.set("filter_by", filterBy);

    try {
      const data = await this.fetchTypesense("restaurants", params);
      const rawHits = data.hits ?? [];
      const found = data.found ?? 0;

      const ids: string[] = [];
      const items: Restaurant[] = [];

      for (const h of rawHits) {
        const doc = h.document;
        const tsId = String(doc["id"] ?? "");
        const firestoreId = this.extractFirestoreId(tsId, "restaurants");
        ids.push(firestoreId);

        items.push({
          id: firestoreId,
          name: String(doc["name"] ?? ""),
          address: doc["address"] != null ? String(doc["address"]) : undefined,
          contactNo:
            doc["contactNo"] != null ? String(doc["contactNo"]) : undefined,
          profileImageUrl:
            doc["profileImageUrl"] != null
              ? String(doc["profileImageUrl"])
              : undefined,
          ownerId:
            doc["ownerId"] != null ? String(doc["ownerId"]) : undefined,
          isActive: doc["isActive"] === true,
          isBoosted: doc["isBoosted"] === true,
          latitude:
            doc["latitude"] != null ? Number(doc["latitude"]) : undefined,
          longitude:
            doc["longitude"] != null ? Number(doc["longitude"]) : undefined,
          averageRating:
            doc["averageRating"] != null
              ? Number(doc["averageRating"])
              : undefined,
          reviewCount:
            doc["reviewCount"] != null
              ? Number(doc["reviewCount"])
              : undefined,
          clickCount:
            doc["clickCount"] != null
              ? Number(doc["clickCount"])
              : undefined,
          followerCount:
            doc["followerCount"] != null
              ? Number(doc["followerCount"])
              : undefined,
          foodType: Array.isArray(doc["foodType"])
            ? (doc["foodType"] as string[])
            : undefined,
          cuisineTypes: Array.isArray(doc["cuisineTypes"])
            ? (doc["cuisineTypes"] as string[])
            : undefined,
          workingDays: Array.isArray(doc["workingDays"])
            ? (doc["workingDays"] as string[])
            : undefined,
        });
      }

      const perPage = Math.max(hitsPerPage, 1);
      const nbPages = Math.max(Math.ceil(found / perPage), 1);

      return { items, ids, page, nbPages, total: found };
    } catch (err) {
      console.warn("Typesense searchRestaurants error:", err);
      return { items: [], ids: [], page, nbPages: 1, total: 0 };
    }
  }

  /** Debounced version for search-as-you-type */
  debouncedSearchRestaurants(
    opts: Parameters<typeof this.searchRestaurants>[0],
  ): Promise<RestaurantSearchPage> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        resolve(await this.searchRestaurants(opts));
      }, this.debounceDuration);
    });
  }

  /**
   * Fetch facet counts for restaurant filters.
   * Returns available values + counts for cuisineTypes, foodType, workingDays.
   */
  async fetchRestaurantFacets(opts?: {
    query?: string;
    cuisineTypes?: string[];
    foodType?: string[];
  }): Promise<RestaurantFacets> {
    const filterParts: string[] = [];
    filterParts.push("isActive:=true");

    if (opts?.cuisineTypes?.length) {
      const orParts = opts.cuisineTypes.map((c) => `cuisineTypes:=${c}`);
      if (orParts.length === 1) filterParts.push(orParts[0]);
      else filterParts.push(`(${orParts.join(" || ")})`);
    }

    if (opts?.foodType?.length) {
      const orParts = opts.foodType.map((f) => `foodType:=${f}`);
      if (orParts.length === 1) filterParts.push(orParts[0]);
      else filterParts.push(`(${orParts.join(" || ")})`);
    }

    const params = new URLSearchParams({
      q: opts?.query?.trim() || "*",
      query_by: "name,address",
      per_page: "0",
      facet_by: "cuisineTypes,foodType,workingDays",
      max_facet_values: "50",
    });

    const filterBy = this.buildFilterBy(filterParts);
    if (filterBy) params.set("filter_by", filterBy);

    try {
      const data = await this.fetchTypesense("restaurants", params);
      const result: RestaurantFacets = {};

      for (const facet of data.facet_counts ?? []) {
        const fieldName = facet.field_name as keyof RestaurantFacets;
        const counts: FacetValue[] = (facet.counts ?? [])
          .map((c) => ({
            value: String(c.value ?? ""),
            count:
              typeof c.count === "number" ? c.count : Number(c.count ?? 0),
          }))
          .filter((c) => c.value && c.count > 0);

        if (counts.length) {
          result[fieldName] = counts;
        }
      }

      return result;
    } catch (err) {
      console.warn("Typesense fetchRestaurantFacets error:", err);
      return {};
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ── FOODS ──────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Search foods with optional filters for foodCategory, foodType,
   * restaurantId, availability, and price range.
   */
  async searchFoods(opts: {
    query?: string;
    sort?: FoodSortOption;
    page?: number;
    hitsPerPage?: number;
    restaurantId?: string;
    foodCategory?: string[];
    foodType?: string[];
    isAvailable?: boolean;
    minPrice?: number;
    maxPrice?: number;
  }): Promise<FoodSearchPage> {
    const {
      query = "",
      sort = "default",
      page = 0,
      hitsPerPage = 20,
      restaurantId,
      foodCategory,
      foodType,
      isAvailable,
      minPrice,
      maxPrice,
    } = opts;

    const filterParts: string[] = [];

    if (restaurantId) {
      filterParts.push(`restaurantId:=${restaurantId}`);
    }

    if (isAvailable !== undefined) {
      filterParts.push(`isAvailable:=${isAvailable}`);
    }

    if (foodCategory?.length) {
      const orParts = foodCategory.map((c) => `foodCategory:=${c}`);
      if (orParts.length === 1) filterParts.push(orParts[0]);
      else filterParts.push(`(${orParts.join(" || ")})`);
    }

    if (foodType?.length) {
      const orParts = foodType.map((f) => `foodType:=${f}`);
      if (orParts.length === 1) filterParts.push(orParts[0]);
      else filterParts.push(`(${orParts.join(" || ")})`);
    }

    if (minPrice !== undefined) {
      filterParts.push(`price:>=${minPrice}`);
    }
    if (maxPrice !== undefined) {
      filterParts.push(`price:<=${maxPrice}`);
    }

    const params = new URLSearchParams({
      q: query.trim() || "*",
      query_by: "name,description,foodCategory,foodType",
      sort_by: this.foodSortBy(sort),
      per_page: String(hitsPerPage),
      page: String(page + 1),
      include_fields:
        "id,name,description,price,foodCategory,foodType,imageUrl," +
        "isAvailable,preparationTime,restaurantId,extras,createdAt",
    });

    const filterBy = this.buildFilterBy(filterParts);
    if (filterBy) params.set("filter_by", filterBy);

    try {
      const data = await this.fetchTypesense("foods", params);
      const rawHits = data.hits ?? [];
      const found = data.found ?? 0;

      const ids: string[] = [];
      const items: Food[] = [];

      for (const h of rawHits) {
        const doc = h.document;
        const tsId = String(doc["id"] ?? "");
        const firestoreId = this.extractFirestoreId(tsId, "foods");
        ids.push(firestoreId);

        items.push({
          id: firestoreId,
          name: String(doc["name"] ?? ""),
          description:
            doc["description"] != null
              ? String(doc["description"])
              : undefined,
          price: Number(doc["price"] ?? 0),
          foodCategory: String(doc["foodCategory"] ?? ""),
          foodType: String(doc["foodType"] ?? ""),
          imageUrl:
            doc["imageUrl"] != null ? String(doc["imageUrl"]) : undefined,
          isAvailable: doc["isAvailable"] === true,
          preparationTime:
            doc["preparationTime"] != null
              ? Number(doc["preparationTime"])
              : undefined,
          restaurantId: String(doc["restaurantId"] ?? ""),
          extras: Array.isArray(doc["extras"])
            ? (doc["extras"] as string[])
            : undefined,
        });
      }

      const perPage = Math.max(hitsPerPage, 1);
      const nbPages = Math.max(Math.ceil(found / perPage), 1);

      return { items, ids, page, nbPages, total: found };
    } catch (err) {
      console.warn("Typesense searchFoods error:", err);
      return { items: [], ids: [], page, nbPages: 1, total: 0 };
    }
  }

  /** Debounced version for search-as-you-type */
  debouncedSearchFoods(
    opts: Parameters<typeof this.searchFoods>[0],
  ): Promise<FoodSearchPage> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        resolve(await this.searchFoods(opts));
      }, this.debounceDuration);
    });
  }

  /**
   * Fetch facet counts for food filters.
   * Returns available values + counts for foodCategory and foodType.
   */
  async fetchFoodFacets(opts?: {
    query?: string;
    restaurantId?: string;
    foodCategory?: string[];
    foodType?: string[];
  }): Promise<FoodFacets> {
    const filterParts: string[] = [];
    filterParts.push("isAvailable:=true");

    if (opts?.restaurantId) {
      filterParts.push(`restaurantId:=${opts.restaurantId}`);
    }

    if (opts?.foodCategory?.length) {
      const orParts = opts.foodCategory.map((c) => `foodCategory:=${c}`);
      if (orParts.length === 1) filterParts.push(orParts[0]);
      else filterParts.push(`(${orParts.join(" || ")})`);
    }

    if (opts?.foodType?.length) {
      const orParts = opts.foodType.map((f) => `foodType:=${f}`);
      if (orParts.length === 1) filterParts.push(orParts[0]);
      else filterParts.push(`(${orParts.join(" || ")})`);
    }

    const params = new URLSearchParams({
      q: opts?.query?.trim() || "*",
      query_by: "name,description,foodCategory,foodType",
      per_page: "0",
      facet_by: "foodCategory,foodType",
      max_facet_values: "50",
    });

    const filterBy = this.buildFilterBy(filterParts);
    if (filterBy) params.set("filter_by", filterBy);

    try {
      const data = await this.fetchTypesense("foods", params);
      const result: FoodFacets = {};

      for (const facet of data.facet_counts ?? []) {
        const fieldName = facet.field_name as keyof FoodFacets;
        const counts: FacetValue[] = (facet.counts ?? [])
          .map((c) => ({
            value: String(c.value ?? ""),
            count:
              typeof c.count === "number" ? c.count : Number(c.count ?? 0),
          }))
          .filter((c) => c.value && c.count > 0);

        if (counts.length) {
          result[fieldName] = counts;
        }
      }

      return result;
    } catch (err) {
      console.warn("Typesense fetchFoodFacets error:", err);
      return {};
    }
  }

  // ── Health check ────────────────────────────────────────────────────────

  async isServiceReachable(): Promise<boolean> {
    try {
      const params = new URLSearchParams({
        q: "*",
        query_by: "name",
        per_page: "1",
      });
      const url = `${this.searchUrl("restaurants")}?${params.toString()}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      try {
        const res = await fetch(url, {
          headers: this.headers,
          signal: controller.signal,
        });
        return res.status < 500;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return false;
    }
  }
}
