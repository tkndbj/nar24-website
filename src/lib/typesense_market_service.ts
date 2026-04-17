/**
 * lib/typesense_market_service.ts
 *
 * Market items search via Typesense. Matches the routing pattern of
 * lib/typesense_service.ts exactly:
 *
 *   • Browser → /api/typesense/{collection}?...  (GET-only proxy adds key)
 *   • Server  → https://{host}/collections/{collection}/documents/search?...
 *
 * Disjunctive facets are implemented as N parallel GETs rather than one
 * POST /multi_search — the project's proxy route is GET-only. Conceptually
 * identical: each group's facet counts are computed with the *other*
 * groups' filters applied. For the category-scoped page that's 2 GETs
 * (brand + type). For the global search that's 3 GETs (brand + type +
 * category). They run concurrently with Promise.all.
 *
 * Port-of-Flutter notes (kept intentionally):
 *   • Page size 20
 *   • Retry with jittered exponential backoff, ×3
 *   • 300ms debounce on debouncedSearchItems
 *   • Sort map: newest→createdAt:desc, priceAsc/Desc, nameAsc
 *   • Typesense IDs are prefixed `market_items_<firestoreId>`; we strip it
 *   • In-memory cache for the "first-paint" (unfiltered, no-query) facet
 *     state so the chip row renders instantly on return visits
 *
 * No `any`. Vercel-safe.
 */

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC TYPES
// ════════════════════════════════════════════════════════════════════════════

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
  /** Free-form nutrition map */
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

// ════════════════════════════════════════════════════════════════════════════
// NUTRITION HELPER (equivalent of MarketItem.hasNutritionData)
// ════════════════════════════════════════════════════════════════════════════

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
  if (!n || typeof n !== "object") return false;
  for (const key of NUTRITION_KEYS) {
    const raw = (n as Record<string, unknown>)[key];
    if (raw == null) continue;
    const num = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(num) && num > 0) return true;
  }
  return false;
}

// ════════════════════════════════════════════════════════════════════════════
// INTERNAL TYPESENSE RESPONSE SHAPES
// ════════════════════════════════════════════════════════════════════════════

interface TypesenseHit {
  document: Record<string, unknown>;
}

interface TypesenseFacetCountRaw {
  field_name?: string;
  counts?: Array<{ value?: unknown; count?: unknown }>;
}

interface TypesenseSearchResponse {
  hits?: TypesenseHit[];
  found?: number;
  facet_counts?: TypesenseFacetCountRaw[];
}

// ════════════════════════════════════════════════════════════════════════════
// RETRY / SLEEP HELPERS (match typesense_service.ts)
// ════════════════════════════════════════════════════════════════════════════

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type RetryableError = Error | { message: string };

function isRetryable(err: RetryableError): boolean {
  const msg = err instanceof Error ? err.message : (err.message ?? "");
  return (
    msg.includes("fetch failed") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("Failed to fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    /\b5\d\d\b/.test(msg)
  );
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayFactor = 500,
): Promise<T> {
  let lastErr: RetryableError = new Error("unknown");
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (!isRetryable(lastErr) || attempt === maxAttempts) throw lastErr;
      const jitter = 1 + (Math.random() * 0.2 - 0.1);
      await sleep(delayFactor * Math.pow(2, attempt - 1) * jitter);
    }
  }
  throw lastErr;
}

// ════════════════════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════════════════════

export interface MarketTypesenseConfig {
  typesenseHost: string;
  typesenseSearchKey: string;
}

const COLLECTION = "market_items";
const PAGE_SIZE = 20;
const FACET_MAX_VALUES = 50;
const INCLUDE_FIELDS =
  "id,name,brand,type,category,price,stock,description," +
  "imageUrl,imageUrls,isAvailable,createdAt,nutrition";
const QUERY_BY = "name,brand,type,description";

/** Cache key for the first-paint facet snapshot on a category page. */
function cacheKeyForCategory(category: string): string {
  return `cat:${category}`;
}

// ════════════════════════════════════════════════════════════════════════════
// MARKET TYPESENSE SERVICE
// ════════════════════════════════════════════════════════════════════════════

export class MarketTypesenseService {
  private readonly host: string;
  private readonly searchKey: string;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceDuration = 300; // ms

  /**
   * Stale-while-revalidate cache for the initial (unfiltered, empty query)
   * facet snapshot per category. Keyed by cacheKeyForCategory(category).
   * Populated on the first `fetchFacets()` call that has no filters.
   */
  private readonly unfilteredFacetCache = new Map<string, MarketFacets>();

  constructor(config: MarketTypesenseConfig) {
    this.host = config.typesenseHost;
    this.searchKey = config.typesenseSearchKey;
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.unfilteredFacetCache.clear();
  }

  // ════════════════════════════════════════════════════════════════════════
  // URL + HEADERS — mirrors typesense_service.ts exactly
  // ════════════════════════════════════════════════════════════════════════

  private searchUrl(): string {
    if (typeof window !== "undefined") {
      return `/api/typesense/${COLLECTION}`;
    }
    return `https://${this.host}/collections/${COLLECTION}/documents/search`;
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

  // ════════════════════════════════════════════════════════════════════════
  // SORT / FILTER HELPERS
  // ════════════════════════════════════════════════════════════════════════

  private sortBy(sort: MarketSortOption): string {
    switch (sort) {
      case "priceAsc":
        return "price:asc";
      case "priceDesc":
        return "price:desc";
      case "nameAsc":
        return "name:asc";
      case "newest":
      default:
        return "createdAt:desc";
    }
  }

  /**
   * Build an OR group for string values: `field:=[v1,v2]` (Typesense accepts
   * this bracket syntax for IN-list matching). Empty → empty string.
   */
  private orGroup(field: string, values: readonly string[] | undefined): string {
    if (!values || values.length === 0) return "";
    // Escape backticks/commas inside values defensively.
    const escaped = values.map((v) => `\`${v.replace(/`/g, "")}\``).join(",");
    return `${field}:=[${escaped}]`;
  }

  private andJoin(parts: (string | undefined | null | false)[]): string {
    return parts.filter((p): p is string => !!p && p.length > 0).join(" && ");
  }

  /**
   * Strip the `{collection}_` prefix Typesense adds to document IDs.
   * Matches the behavior of TypeSenseService.extractFirestoreId.
   */
  private extractFirestoreId(typesenseId: string): string {
    const prefix = `${COLLECTION}_`;
    return typesenseId.startsWith(prefix)
      ? typesenseId.slice(prefix.length)
      : typesenseId;
  }

  private parseItem(raw: Record<string, unknown>): MarketItem {
    const imageUrls = Array.isArray(raw.imageUrls)
      ? (raw.imageUrls as unknown[]).map((x) => String(x))
      : [];
    const imageUrl =
      typeof raw.imageUrl === "string" && raw.imageUrl
        ? raw.imageUrl
        : imageUrls[0] ?? "";

    const id = this.extractFirestoreId(String(raw.id ?? ""));

    let createdAt: number | null = null;
    if (typeof raw.createdAt === "number") createdAt = raw.createdAt;
    else if (typeof raw.createdAt === "string") {
      const n = Number(raw.createdAt);
      createdAt = Number.isFinite(n) ? n : null;
    }

    const nutrition =
      raw.nutrition && typeof raw.nutrition === "object"
        ? (raw.nutrition as Record<string, unknown>)
        : {};

    return {
      id,
      name: String(raw.name ?? ""),
      brand: String(raw.brand ?? ""),
      type: String(raw.type ?? ""),
      category: String(raw.category ?? ""),
      price: typeof raw.price === "number" ? raw.price : Number(raw.price ?? 0),
      stock: typeof raw.stock === "number" ? raw.stock : Number(raw.stock ?? 0),
      description: String(raw.description ?? ""),
      imageUrl,
      imageUrls,
      // IMPORTANT: default to true. If the Typesense schema doesn't carry the
      // `isAvailable` field at all, absence is treated as "available".
      isAvailable: raw.isAvailable !== false,
      createdAt,
      nutrition,
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // LOW-LEVEL GET — single search request through the proxy
  // ════════════════════════════════════════════════════════════════════════

  private async get(
    params: URLSearchParams,
  ): Promise<TypesenseSearchResponse | null> {
    const url = `${this.searchUrl()}?${params.toString()}`;

    try {
      const resp = await withRetry(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        try {
          const r = await fetch(url, {
            headers: this.headers,
            signal: controller.signal,
          });
          if (r.status >= 500) throw new Error(`Typesense 5xx: ${r.status}`);
          return r;
        } finally {
          clearTimeout(timeout);
        }
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => "(unreadable)");
        console.warn(
          `[MarketTypesense] ${resp.status} — filter_by: ${params.get(
            "filter_by",
          )} — ${body}`,
        );
        return null;
      }

      return (await resp.json()) as TypesenseSearchResponse;
    } catch (err) {
      console.warn("[MarketTypesense] request failed:", err);
      return null;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // SEARCH — category-scoped
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Search inside a single category with optional brand/type filters.
   *
   * NOTE: we deliberately don't add an `isAvailable:true` filter. Your
   * product service handles unavailable items by removing/pausing them
   * upstream; adding a bool filter here was causing 400s because the
   * field type / presence isn't consistent in the indexed docs.
   */
  async searchItems(args: {
    category: string;
    query: string;
    sort: MarketSortOption;
    page: number;
    hitsPerPage?: number;
    brands?: string[];
    types?: string[];
  }): Promise<MarketSearchPage> {
    const hitsPerPage = args.hitsPerPage ?? PAGE_SIZE;

    const filterBy = this.andJoin([
      `category:=${args.category}`,
      this.orGroup("brand", args.brands),
      this.orGroup("type", args.types),
    ]);

    const params = new URLSearchParams({
      q: args.query.trim() || "*",
      query_by: QUERY_BY,
      sort_by: this.sortBy(args.sort),
      per_page: String(hitsPerPage),
      page: String(args.page + 1), // Typesense pages are 1-based
      include_fields: INCLUDE_FIELDS,
    });
    if (filterBy) params.set("filter_by", filterBy);

    const data = await this.get(params);
    return this.toPage(data, args.page, hitsPerPage);
  }

  /**
   * Global search (across all categories).
   */
  async searchItemsGlobal(args: {
    query: string;
    sort: MarketSortOption;
    page: number;
    hitsPerPage?: number;
    brands?: string[];
    types?: string[];
    categories?: string[];
  }): Promise<MarketSearchPage> {
    const hitsPerPage = args.hitsPerPage ?? PAGE_SIZE;

    const filterBy = this.andJoin([
      this.orGroup("category", args.categories),
      this.orGroup("brand", args.brands),
      this.orGroup("type", args.types),
    ]);

    const params = new URLSearchParams({
      q: args.query.trim() || "*",
      query_by: QUERY_BY,
      sort_by: this.sortBy(args.sort),
      per_page: String(hitsPerPage),
      page: String(args.page + 1),
      include_fields: INCLUDE_FIELDS,
    });
    if (filterBy) params.set("filter_by", filterBy);

    const data = await this.get(params);
    return this.toPage(data, args.page, hitsPerPage);
  }

  /**
   * 300ms debounced wrapper for live typing.
   */
  debouncedSearchItems(args: Parameters<typeof this.searchItems>[0]): Promise<MarketSearchPage> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        resolve(await this.searchItems(args));
      }, this.debounceDuration);
    });
  }

  private toPage(
    data: TypesenseSearchResponse | null,
    page: number,
    hitsPerPage: number,
  ): MarketSearchPage {
    if (!data) {
      return { items: [], page, nbPages: page + 1, total: 0 };
    }
    const items = (data.hits ?? []).map((h) => this.parseItem(h.document));
    const total = data.found ?? 0;
    const nbPages = Math.max(1, Math.min(9_999, Math.ceil(total / hitsPerPage)));
    return { items, page, nbPages, total };
  }

  // ════════════════════════════════════════════════════════════════════════
  // FACET FETCHES — disjunctive, implemented as N parallel GETs
  // ════════════════════════════════════════════════════════════════════════

  /**
   * Category-scoped facets. Two GET calls:
   *   (a) counts for brand ← filters: category + selected types
   *   (b) counts for type  ← filters: category + selected brands
   *
   * Result: selecting a brand doesn't collapse the brand chip counts —
   * only types narrow. Classic disjunctive faceting UX.
   */
  async fetchFacets(args: {
    category: string;
    query?: string;
    selectedBrands?: string[];
    selectedTypes?: string[];
  }): Promise<MarketFacets> {
    const { category, query = "" } = args;
    const baseFilter = `category:=${category}`;
    const typeFilter = this.orGroup("type", args.selectedTypes);
    const brandFilter = this.orGroup("brand", args.selectedBrands);

    // First-paint cache: empty query + no selections → serve from cache.
    const isFirstPaint =
      !query.trim() &&
      !args.selectedBrands?.length &&
      !args.selectedTypes?.length;
    if (isFirstPaint) {
      const cached = this.unfilteredFacetCache.get(cacheKeyForCategory(category));
      if (cached) return cached;
    }

    const [brandData, typeData] = await Promise.all([
      // Brand facet — apply everything EXCEPT selected brands.
      this.get(
        this.facetParams({
          query,
          facetField: "brand",
          filterBy: this.andJoin([baseFilter, typeFilter]),
        }),
      ),
      // Type facet — apply everything EXCEPT selected types.
      this.get(
        this.facetParams({
          query,
          facetField: "type",
          filterBy: this.andJoin([baseFilter, brandFilter]),
        }),
      ),
    ]);

    const out: MarketFacets = {
      brands: this.extractFacetCounts(brandData, "brand"),
      types: this.extractFacetCounts(typeData, "type"),
    };

    if (isFirstPaint) {
      this.unfilteredFacetCache.set(cacheKeyForCategory(category), out);
    }
    return out;
  }

  /**
   * Global facets (search page). Three GET calls — one per group.
   */
  async fetchFacetsGlobal(args: {
    query?: string;
    selectedBrands?: string[];
    selectedTypes?: string[];
    selectedCategories?: string[];
  }): Promise<MarketGlobalFacets> {
    const { query = "" } = args;
    const brandFilter = this.orGroup("brand", args.selectedBrands);
    const typeFilter = this.orGroup("type", args.selectedTypes);
    const categoryFilter = this.orGroup("category", args.selectedCategories);

    const [brandData, typeData, categoryData] = await Promise.all([
      this.get(
        this.facetParams({
          query,
          facetField: "brand",
          filterBy: this.andJoin([typeFilter, categoryFilter]),
        }),
      ),
      this.get(
        this.facetParams({
          query,
          facetField: "type",
          filterBy: this.andJoin([brandFilter, categoryFilter]),
        }),
      ),
      this.get(
        this.facetParams({
          query,
          facetField: "category",
          filterBy: this.andJoin([brandFilter, typeFilter]),
        }),
      ),
    ]);

    return {
      brands: this.extractFacetCounts(brandData, "brand"),
      types: this.extractFacetCounts(typeData, "type"),
      categories: this.extractFacetCounts(categoryData, "category"),
    };
  }

  private facetParams(args: {
    query: string;
    facetField: string;
    filterBy: string;
  }): URLSearchParams {
    const p = new URLSearchParams({
      q: args.query.trim() || "*",
      query_by: QUERY_BY,
      per_page: "0", // counts only, no documents
      facet_by: args.facetField,
      max_facet_values: String(FACET_MAX_VALUES),
    });
    if (args.filterBy) p.set("filter_by", args.filterBy);
    return p;
  }

  private extractFacetCounts(
    data: TypesenseSearchResponse | null,
    field: string,
  ): MarketFacetValue[] {
    if (!data?.facet_counts) return [];
    const facet = data.facet_counts.find((f) => f.field_name === field);
    if (!facet?.counts) return [];
    return facet.counts
      .map((c) => ({
        value: String(c.value ?? ""),
        count: typeof c.count === "number" ? c.count : Number(c.count ?? 0),
      }))
      .filter((c) => c.value && c.count > 0);
  }

  // ════════════════════════════════════════════════════════════════════════
  // HEALTH CHECK (used by TypeSenseServiceManager.isHealthy)
  // ════════════════════════════════════════════════════════════════════════

  async isServiceReachable(): Promise<boolean> {
    try {
      const params = new URLSearchParams({
        q: "*",
        query_by: "id",
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
}