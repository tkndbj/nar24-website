/**
 * lib/typesense_market_service.ts
 *
 * Direct port of lib/services/market_typesense_service.dart.
 *
 * Responsibilities:
 *   • Search the `market_items` Typesense collection (category-scoped or global)
 *   • Fetch disjunctive brand/type facets via /multi_search
 *   • In-memory stale-while-revalidate cache for "unfiltered" facet results
 *     so the chip row paints instantly on re-entry
 *
 * Deliberate mirrors of the Flutter behavior (don't change without reason):
 *   • Page size 20, retry ×3 w/ exponential backoff
 *   • 300ms debounce on debouncedSearchItems
 *   • sort_by map: newest→createdAt:desc, priceAsc, priceDesc, nameAsc
 *   • Typesense IDs are prefixed `market_items_<firestoreId>`; we strip it
 *   • Facet cache keyed ONLY by the first-paint state (empty query,
 *     no selected brands, no selected types). Any filter combination is
 *     dynamic and not worth caching.
 *
 * Browser vs. server routing matches your existing typesense_service.ts:
 *   • In the browser we go through `/api/typesense/*` so the API key stays
 *     off the HTML (your NEXT_PUBLIC_ fallback still works, but the proxy
 *     is the recommended path).
 *   • Server-side we hit Typesense directly.
 */

// ============================================================================
// PUBLIC TYPES
// ============================================================================

export interface MarketItem {
    id: string;
    name: string;
    brand: string;
    type: string;
    category: string;
    price: number;
    stock: number;
    description: string;
    imageUrl: string;
    imageUrls: string[];
    isAvailable: boolean;
    createdAt: number | null;
    /** Free-form nutrition map; values are coerced to number in hasNutritionData() */
    nutrition: Record<string, unknown>;
  }
  
  export interface MarketSearchPage {
    items: MarketItem[];
    page: number;
    nbPages: number;
    total: number;
  }
  
  export interface MarketFacetValue {
    value: string;
    count: number;
  }
  
  export interface MarketFacets {
    brands: MarketFacetValue[];
    types: MarketFacetValue[];
  }
  
  export interface MarketGlobalFacets {
    brands: MarketFacetValue[];
    types: MarketFacetValue[];
    categories: MarketFacetValue[];
  }
  
  export type MarketSortOption =
    | "newest"
    | "priceAsc"
    | "priceDesc"
    | "nameAsc";
  
  export const MARKET_FACETS_EMPTY: MarketFacets = { brands: [], types: [] };
  export const MARKET_GLOBAL_FACETS_EMPTY: MarketGlobalFacets = {
    brands: [],
    types: [],
    categories: [],
  };
  
  // ============================================================================
  // NUTRITION HELPER (equivalent of MarketItem.hasNutritionData)
  // ============================================================================
  
  const NUTRITION_KEYS = [
    "calories",
    "protein",
    "carbs",
    "sugar",
    "fat",
    "fiber",
    "salt",
  ] as const;
  
  export function hasNutritionData(item: Pick<MarketItem, "nutrition">): boolean {
    const n = item.nutrition;
    if (!n || Object.keys(n).length === 0) return false;
    for (const k of NUTRITION_KEYS) {
      const v = n[k];
      const num =
        typeof v === "number"
          ? v
          : typeof v === "string"
            ? Number.parseFloat(v)
            : null;
      if (num != null && !Number.isNaN(num) && num > 0) return true;
    }
    return false;
  }
  
  // ============================================================================
  // INTERNAL HTTP SHAPES
  // ============================================================================
  
  interface TypesenseHit {
    document: Record<string, unknown>;
  }
  
  interface TypesenseSearchResponse {
    hits?: TypesenseHit[];
    found?: number;
    facet_counts?: TypesenseFacetCount[];
  }
  
  interface TypesenseFacetCount {
    field_name?: string;
    counts?: Array<{ value?: unknown; count?: unknown }>;
  }
  
  interface TypesenseMultiSearchResponse {
    results?: TypesenseSearchResponse[];
  }
  
  // ============================================================================
  // RETRY HELPER (same contract as typesense_service.ts)
  // ============================================================================
  
  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));
  
  function isRetryable(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes("fetch failed") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("Failed to fetch") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("5xx") ||
      msg.includes(" 5") // crude 5xx — we format errors with "Typesense 5xx: 500"
    );
  }
  
  async function withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    delayFactor = 500,
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (!isRetryable(err) || attempt === maxAttempts) throw err;
        const jitter = 1 + (Math.random() * 0.2 - 0.1);
        await sleep(delayFactor * Math.pow(2, attempt - 1) * jitter);
      }
    }
    // Unreachable — loop either returns or throws.
    throw lastErr;
  }
  
  // ============================================================================
  // SERVICE
  // ============================================================================
  
  const COLLECTION = "market_items";
  const PAGE_SIZE_DEFAULT = 20;
  const MAX_FACET_VALUES = 100;
  const DEBOUNCE_MS = 300;
  
  export interface MarketTypesenseServiceConfig {
    typesenseHost: string;
    typesenseSearchKey: string;
  }
  
  /**
   * In-memory cache of unfiltered facets per category.
   * Lives on the module, so the singleton service created by the manager
   * shares it across the app's lifetime. Matches the static Map in Flutter.
   */
  const unfilteredFacetCache = new Map<string, MarketFacets>();
  
  export class MarketTypesenseService {
    private readonly host: string;
    private readonly searchKey: string;
  
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  
    constructor(config: MarketTypesenseServiceConfig) {
      this.host = config.typesenseHost;
      this.searchKey = config.typesenseSearchKey;
    }
  
    // ─── URL + headers ────────────────────────────────────────────────────────
  
    private searchUrl(): string {
      if (typeof window !== "undefined") {
        return `/api/typesense/${COLLECTION}`;
      }
      return `https://${this.host}/collections/${COLLECTION}/documents/search`;
    }
  
    private multiSearchUrl(): string {
      if (typeof window !== "undefined") {
        // Assumes you have (or will add) /api/typesense/multi_search/route.ts
        // that forwards to https://{host}/multi_search.
        return `/api/typesense/multi_search?collection=${COLLECTION}`;
      }
      return `https://${this.host}/multi_search?collection=${COLLECTION}`;
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
  
    // ─── Sort mapping ─────────────────────────────────────────────────────────
  
    private sortBy(sort: MarketSortOption): string {
      switch (sort) {
        case "newest":
          return "createdAt:desc";
        case "priceAsc":
          return "price:asc";
        case "priceDesc":
          return "price:desc";
        case "nameAsc":
          return "name:asc";
      }
    }
  
    // ─── ID normalization ─────────────────────────────────────────────────────
  
    private extractId(typesenseId: string): string {
      const prefix = `${COLLECTION}_`;
      return typesenseId.startsWith(prefix)
        ? typesenseId.slice(prefix.length)
        : typesenseId;
    }
  
    // ─── Document parsing ─────────────────────────────────────────────────────
  
    private toMarketItem(
      raw: Record<string, unknown>,
      id: string,
    ): MarketItem {
      const imageUrls = Array.isArray(raw.imageUrls)
        ? (raw.imageUrls.filter((v) => typeof v === "string") as string[])
        : [];
      const nutrition =
        raw.nutrition != null && typeof raw.nutrition === "object"
          ? (raw.nutrition as Record<string, unknown>)
          : {};
  
      return {
        id,
        name: typeof raw.name === "string" ? raw.name : "",
        brand: typeof raw.brand === "string" ? raw.brand : "",
        type: typeof raw.type === "string" ? raw.type : "",
        category: typeof raw.category === "string" ? raw.category : "",
        price: typeof raw.price === "number" ? raw.price : Number(raw.price ?? 0),
        stock: typeof raw.stock === "number" ? raw.stock : Number(raw.stock ?? 0),
        description: typeof raw.description === "string" ? raw.description : "",
        imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : "",
        imageUrls,
        isAvailable: raw.isAvailable !== false,
        createdAt:
          typeof raw.createdAt === "number"
            ? raw.createdAt
            : raw.createdAt != null
              ? Number(raw.createdAt)
              : null,
        nutrition,
      };
    }
  
    // ─── Filter-building primitives ───────────────────────────────────────────
  
    private orFilter(field: string, values: string[]): string | null {
      if (!values.length) return null;
      // Backticks match the Flutter code — required for values with spaces.
      const parts = values.map((v) => `${field}:=\`${v}\``);
      return parts.length === 1 ? parts[0] : `(${parts.join(" || ")})`;
    }
  
    private andJoin(parts: Array<string | null | undefined>): string {
      return parts.filter((p): p is string => !!p && p.length > 0).join(" && ");
    }
  
    // ─── Core GET fetch ───────────────────────────────────────────────────────
  
    private async fetchGet(
      params: URLSearchParams,
    ): Promise<TypesenseSearchResponse> {
      const url = `${this.searchUrl()}?${params.toString()}`;
      return withRetry(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        try {
          const res = await fetch(url, {
            headers: this.headers,
            signal: controller.signal,
          });
          if (res.status >= 500) {
            throw new Error(`Typesense 5xx: ${res.status}`);
          }
          if (!res.ok) {
            console.warn(`[MarketTypesense] ${res.status} — returning empty`);
            return { hits: [], found: 0 };
          }
          return (await res.json()) as TypesenseSearchResponse;
        } finally {
          clearTimeout(timeout);
        }
      });
    }
  
    // ─── Multi-search POST ────────────────────────────────────────────────────
  
    private async fetchMultiSearch(
      searches: Array<Record<string, unknown>>,
    ): Promise<TypesenseMultiSearchResponse> {
      return withRetry(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6_000);
        try {
          const res = await fetch(this.multiSearchUrl(), {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify({ searches }),
            signal: controller.signal,
          });
          if (res.status >= 500) {
            throw new Error(`Typesense multi_search 5xx: ${res.status}`);
          }
          if (!res.ok) {
            console.warn(`[MarketTypesense] multi_search ${res.status}`);
            return { results: [] };
          }
          return (await res.json()) as TypesenseMultiSearchResponse;
        } finally {
          clearTimeout(timeout);
        }
      });
    }
  
    // ─── Facet-count parser ───────────────────────────────────────────────────
  
    private parseFacets(counts: unknown): MarketFacetValue[] {
      if (!Array.isArray(counts)) return [];
      return counts
        .map((c) => {
          const obj = c as { value?: unknown; count?: unknown };
          const value = obj.value == null ? "" : String(obj.value);
          const count =
            typeof obj.count === "number" ? obj.count : Number(obj.count ?? 0);
          return { value, count };
        })
        .filter((fv) => fv.value.length > 0 && fv.count > 0);
    }
  
    // ============================================================================
    // SEARCH — CATEGORY SCOPED
    // ============================================================================
  
    /**
     * Search market items within one category with optional search, brand/type
     * facet filters, sort, and pagination.
     */
    async searchItems(opts: {
      category: string;
      query?: string;
      sort?: MarketSortOption;
      page?: number;
      hitsPerPage?: number;
      brands?: string[];
      types?: string[];
    }): Promise<MarketSearchPage> {
      const {
        category,
        query = "",
        sort = "newest",
        page = 0,
        hitsPerPage = PAGE_SIZE_DEFAULT,
        brands,
        types,
      } = opts;
  
      const filterBy = this.andJoin([
        "isAvailable:=true",
        `category:=${category}`,
        brands?.length ? this.orFilter("brand", brands) : null,
        types?.length ? this.orFilter("type", types) : null,
      ]);
  
      const params = new URLSearchParams({
        q: query.trim() || "*",
        query_by: "name,brand,type,description",
        sort_by: this.sortBy(sort),
        per_page: String(hitsPerPage),
        page: String(page + 1), // Typesense pages are 1-indexed
        filter_by: filterBy,
        include_fields:
          "id,name,brand,type,category,price,stock,description,imageUrl,imageUrls,isAvailable,createdAt,nutrition",
      });
  
      try {
        const data = await this.fetchGet(params);
        const items: MarketItem[] = (data.hits ?? []).map((h) => {
          const doc = h.document;
          const tsId = typeof doc.id === "string" ? doc.id : "";
          return this.toMarketItem(doc, this.extractId(tsId));
        });
        const found = data.found ?? 0;
        const perPage = Math.max(hitsPerPage, 1);
        const nbPages = Math.min(Math.max(Math.ceil(found / perPage), 1), 9_999);
  
        return { items, page, nbPages, total: found };
      } catch (err) {
        console.warn("[MarketTypesense] searchItems error:", err);
        return { items: [], page, nbPages: 1, total: 0 };
      }
    }
  
    /** 300ms-debounced variant for search-as-you-type. */
    debouncedSearchItems(opts: {
      category: string;
      query?: string;
      sort?: MarketSortOption;
      page?: number;
      hitsPerPage?: number;
      brands?: string[];
      types?: string[];
    }): Promise<MarketSearchPage> {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      return new Promise((resolve) => {
        this.debounceTimer = setTimeout(async () => {
          try {
            resolve(await this.searchItems(opts));
          } catch {
            resolve({ items: [], page: opts.page ?? 0, nbPages: 1, total: 0 });
          }
        }, DEBOUNCE_MS);
      });
    }
  
    // ============================================================================
    // SEARCH — GLOBAL (no category constraint)
    // ============================================================================
  
    async searchItemsGlobal(opts: {
      query: string;
      sort?: MarketSortOption;
      page?: number;
      hitsPerPage?: number;
      brands?: string[];
      types?: string[];
      categories?: string[];
    }): Promise<MarketSearchPage> {
      const {
        query,
        sort = "newest",
        page = 0,
        hitsPerPage = PAGE_SIZE_DEFAULT,
        brands,
        types,
        categories,
      } = opts;
  
      const filterBy = this.andJoin([
        "isAvailable:=true",
        brands?.length ? this.orFilter("brand", brands) : null,
        types?.length ? this.orFilter("type", types) : null,
        categories?.length ? this.orFilter("category", categories) : null,
      ]);
  
      const params = new URLSearchParams({
        q: query.trim() || "*",
        query_by: "name,brand,type,description",
        sort_by: this.sortBy(sort),
        per_page: String(hitsPerPage),
        page: String(page + 1),
        filter_by: filterBy,
        include_fields:
          "id,name,brand,type,category,price,stock,description,imageUrl,imageUrls,isAvailable,createdAt,nutrition",
      });
  
      try {
        const data = await this.fetchGet(params);
        const items: MarketItem[] = (data.hits ?? []).map((h) => {
          const doc = h.document;
          const tsId = typeof doc.id === "string" ? doc.id : "";
          return this.toMarketItem(doc, this.extractId(tsId));
        });
        const found = data.found ?? 0;
        const perPage = Math.max(hitsPerPage, 1);
        const nbPages = Math.min(Math.max(Math.ceil(found / perPage), 1), 9_999);
        return { items, page, nbPages, total: found };
      } catch (err) {
        console.warn("[MarketTypesense] searchItemsGlobal error:", err);
        return { items: [], page, nbPages: 1, total: 0 };
      }
    }
  
    // ============================================================================
    // FACETS — CATEGORY SCOPED (disjunctive brand + type)
    // ============================================================================
  
    /**
     * Disjunctive faceting via multi_search: selecting a brand doesn't collapse
     * the type facets, and vice versa.
     *
     * Query layout:
     *   0. Main (used only for count; we throw away per_page=0)
     *   1. Brand facets  — all filters EXCEPT brand  → correct brand counts
     *   2. Type  facets  — all filters EXCEPT type   → correct type counts
     */
    async fetchFacets(opts: {
      category: string;
      query?: string;
      selectedBrands?: string[];
      selectedTypes?: string[];
    }): Promise<MarketFacets> {
      const { category, query = "", selectedBrands, selectedTypes } = opts;
  
      const baseFilter = `isAvailable:=true && category:=${category}`;
      const brandFilter = selectedBrands?.length
        ? this.orFilter("brand", selectedBrands)
        : null;
      const typeFilter = selectedTypes?.length
        ? this.orFilter("type", selectedTypes)
        : null;
      const q = query.trim() || "*";
      const queryBy = "name,brand,type,description";
  
      const searches: Array<Record<string, unknown>> = [
        // 0: main (count only)
        {
          q,
          query_by: queryBy,
          per_page: 0,
          filter_by: this.andJoin([baseFilter, brandFilter, typeFilter]),
        },
        // 1: brand facets (exclude brand filter)
        {
          q,
          query_by: queryBy,
          per_page: 0,
          facet_by: "brand",
          max_facet_values: MAX_FACET_VALUES,
          filter_by: this.andJoin([baseFilter, typeFilter]),
        },
        // 2: type facets (exclude type filter)
        {
          q,
          query_by: queryBy,
          per_page: 0,
          facet_by: "type",
          max_facet_values: MAX_FACET_VALUES,
          filter_by: this.andJoin([baseFilter, brandFilter]),
        },
      ];
  
      try {
        const body = await this.fetchMultiSearch(searches);
        const results = body.results ?? [];
  
        const findFacet = (
          resultIdx: number,
          fieldName: string,
        ): MarketFacetValue[] => {
          if (results.length <= resultIdx) return [];
          const facets = results[resultIdx].facet_counts ?? [];
          for (const f of facets) {
            if (f.field_name === fieldName) {
              return this.parseFacets(f.counts);
            }
          }
          return [];
        };
  
        const result: MarketFacets = {
          brands: findFacet(1, "brand"),
          types: findFacet(2, "type"),
        };
  
        // Cache only the unfiltered "first paint" state.
        const isUnfiltered =
          !query.trim() &&
          (selectedBrands == null || selectedBrands.length === 0) &&
          (selectedTypes == null || selectedTypes.length === 0);
        if (isUnfiltered) {
          unfilteredFacetCache.set(category, result);
        }
  
        return result;
      } catch (err) {
        console.warn("[MarketTypesense] fetchFacets error:", err);
        return MARKET_FACETS_EMPTY;
      }
    }
  
    /** Returns cached unfiltered facets for [category], or null if never fetched. */
    cachedUnfilteredFacets(category: string): MarketFacets | null {
      return unfilteredFacetCache.get(category) ?? null;
    }
  
    // ============================================================================
    // FACETS — GLOBAL (disjunctive brand + type + category)
    // ============================================================================
  
    async fetchFacetsGlobal(opts: {
      query: string;
      selectedBrands?: string[];
      selectedTypes?: string[];
      selectedCategories?: string[];
    }): Promise<MarketGlobalFacets> {
      const { query, selectedBrands, selectedTypes, selectedCategories } = opts;
  
      const baseFilter = "isAvailable:=true";
      const brandFilter = selectedBrands?.length
        ? this.orFilter("brand", selectedBrands)
        : null;
      const typeFilter = selectedTypes?.length
        ? this.orFilter("type", selectedTypes)
        : null;
      const categoryFilter = selectedCategories?.length
        ? this.orFilter("category", selectedCategories)
        : null;
      const q = query.trim() || "*";
      const queryBy = "name,brand,type,description";
  
      const searches: Array<Record<string, unknown>> = [
        // 0: brand facets (exclude brand filter)
        {
          q,
          query_by: queryBy,
          per_page: 0,
          facet_by: "brand",
          max_facet_values: MAX_FACET_VALUES,
          filter_by: this.andJoin([baseFilter, typeFilter, categoryFilter]),
        },
        // 1: type facets (exclude type filter)
        {
          q,
          query_by: queryBy,
          per_page: 0,
          facet_by: "type",
          max_facet_values: MAX_FACET_VALUES,
          filter_by: this.andJoin([baseFilter, brandFilter, categoryFilter]),
        },
        // 2: category facets (exclude category filter)
        {
          q,
          query_by: queryBy,
          per_page: 0,
          facet_by: "category",
          max_facet_values: MAX_FACET_VALUES,
          filter_by: this.andJoin([baseFilter, brandFilter, typeFilter]),
        },
      ];
  
      try {
        const body = await this.fetchMultiSearch(searches);
        const results = body.results ?? [];
  
        const findFacet = (
          resultIdx: number,
          fieldName: string,
        ): MarketFacetValue[] => {
          if (results.length <= resultIdx) return [];
          const facets = results[resultIdx].facet_counts ?? [];
          for (const f of facets) {
            if (f.field_name === fieldName) return this.parseFacets(f.counts);
          }
          return [];
        };
  
        return {
          brands: findFacet(0, "brand"),
          types: findFacet(1, "type"),
          categories: findFacet(2, "category"),
        };
      } catch (err) {
        console.warn("[MarketTypesense] fetchFacetsGlobal error:", err);
        return MARKET_GLOBAL_FACETS_EMPTY;
      }
    }
  
    // ============================================================================
    // HEALTH
    // ============================================================================
  
    async isServiceReachable(): Promise<boolean> {
      try {
        const params = new URLSearchParams({
          q: "*",
          query_by: "name",
          per_page: "1",
        });
        const url = `${this.searchUrl()}?${params.toString()}`;
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
      } catch (err) {
        console.warn("[MarketTypesense] unreachable:", err);
        return false;
      }
    }
  
    dispose(): void {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }