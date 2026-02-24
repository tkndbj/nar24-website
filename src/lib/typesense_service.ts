/**
 * typesense_service.ts
 *
 * Direct-HTTP Typesense client — mirrors the Flutter TypeSenseService exactly.
 * No Typesense JS SDK dependency; uses the native fetch API so it works in
 * Next.js (both client and server components / API routes).
 *
 * No `any` types — Vercel-safe.
 */

// ── Public shape types ───────────────────────────────────────────────────────

export interface TypeSensePage {
  ids: string[];
  hits: TypeSenseDocument[];
  page: number;
  nbPages: number;
}

/** Minimal, strongly-typed document coming back from Typesense */
export interface TypeSenseDocument {
  id: string;
  objectID: string;
  productName?: string;
  price?: number;
  originalPrice?: number;
  discountPercentage?: number;
  brandModel?: string;
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  category_en?: string;
  category_tr?: string;
  category_ru?: string;
  subcategory_en?: string;
  subcategory_tr?: string;
  subcategory_ru?: string;
  subsubcategory_en?: string;
  subsubcategory_tr?: string;
  subsubcategory_ru?: string;
  gender?: string;
  availableColors?: string[];
  colorImagesJson?: string;
  colorQuantitiesJson?: string;
  shopId?: string;
  ownerId?: string;
  userId?: string;
  promotionScore?: number;
  createdAt?: number;
  imageUrls?: string[];
  sellerName?: string;
  condition?: string;
  currency?: string;
  quantity?: number;
  averageRating?: number;
  reviewCount?: number;
  isBoosted?: boolean;
  isFeatured?: boolean;
  purchaseCount?: number;
  bestSellerRank?: number;
  deliveryOption?: string;
  paused?: boolean;
  bundleIds?: string[];
  videoUrl?: string;
  campaignName?: string;
  discountThreshold?: number;
  bulkDiscountPercentage?: number;
  timestampForSorting?: number;
  /** Order-related */
  orderId?: string;
  productId?: string;
  buyerId?: string;
  sellerId?: string;
  buyerName?: string;
  searchableText?: string;
  /** Shop-related */
  name?: string;
  profileImageUrl?: string;
  coverImageUrls?: string[];
  address?: string;
  followerCount?: number;
  clickCount?: number;
  categories?: string[];
  contactNo?: string;
  isActive?: boolean;
}

export interface CategorySuggestion {
  categoryKey: string;
  subcategoryKey?: string;
  subsubcategoryKey?: string;
  displayName: string;
  level: number;
  language: string;
}

export interface FacetCount {
  value: string;
  count: number;
}

// ── Internal Typesense API shapes ────────────────────────────────────────────

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

// ── Retry helper ─────────────────────────────────────────────────────────────

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
    msg.includes("5") // crude 5xx check – we throw with status code in message
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

// ── TypeSenseService ──────────────────────────────────────────────────────────

export interface TypeSenseServiceConfig {
  /** e.g. "o17xr5q8psytcabup-1.a2.typesense.net" */
  typesenseHost: string;
  typesenseSearchKey: string;
  mainIndexName: string;
  /** Only kept for API-compatibility – not actively used */
  applicationId?: string;
  apiKey?: string;
  categoryIndexName?: string;
}

export class TypeSenseService {
  private readonly host: string;
  private readonly searchKey: string;
  readonly mainIndexName: string;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceDuration = 300; // ms

  constructor(config: TypeSenseServiceConfig) {
    this.host = config.typesenseHost;
    this.searchKey = config.typesenseSearchKey;
    this.mainIndexName = config.mainIndexName;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private searchUrl(collection: string): string {
    return `https://${this.host}/collections/${collection}/documents/search`;
  }

  private get headers(): HeadersInit {
    return {
      "X-TYPESENSE-API-KEY": this.searchKey,
      "Content-Type": "application/json",
    };
  }

  /** Convert sort option string → Typesense sort_by expression */
  private sortBy(sortOption: string): string {
    switch (sortOption) {
      case "date":
        return "createdAt:desc";
      case "alphabetical":
        return "productName:asc";
      case "price_asc":
        return "price:asc";
      case "price_desc":
        return "price:desc";
      case "timestamp":
        return "timestampForSorting:desc";
      default:
        return "promotionScore:desc,createdAt:desc";
    }
  }

  /**
   * Convert simple `field:"value"` filter strings into Typesense filter_by
   * syntax: `field:=value`.
   */
  private buildFilterBy(filters: string[]): string | undefined {
    if (!filters.length) return undefined;
    const parts = filters
      .map((f) => {
        const colonIdx = f.indexOf(":");
        if (colonIdx < 0) return null;
        const field = f.slice(0, colonIdx).trim();
        const value = f
          .slice(colonIdx + 1)
          .trim()
          .replace(/"/g, "");
        return `${field}:=${value}`;
      })
      .filter((p): p is string => p !== null);
    return parts.join(" && ") || undefined;
  }

  /**
   * Typesense document IDs are prefixed with `{collection}_`.
   * Strip the prefix to get the Firestore document ID.
   */
  private extractFirestoreId(typesenseId: string, collection: string): string {
    const prefix = `${collection}_`;
    return typesenseId.startsWith(prefix)
      ? typesenseId.slice(prefix.length)
      : typesenseId;
  }

  /** Parse a raw Typesense document into a strongly-typed TypeSenseDocument */
  private parseDocument(raw: Record<string, unknown>): TypeSenseDocument {
    const id = String(raw["id"] ?? "");
    return {
      ...(raw as Omit<TypeSenseDocument, "id" | "objectID">),
      id,
      objectID: id,
    } as TypeSenseDocument;
  }

  // ── Core search (generic) ─────────────────────────────────────────────────

  private async searchInIndex<T>(opts: {
    collection: string;
    query: string;
    sortOption: string;
    mapper: (doc: TypeSenseDocument) => T;
    page?: number;
    hitsPerPage?: number;
    filters?: string[];
    queryBy?: string;
  }): Promise<T[]> {
    const {
      collection,
      query,
      sortOption,
      mapper,
      page = 0,
      hitsPerPage = 50,
      filters,
      queryBy = "productName,brandModel,sellerName," +
        "category_en,category_tr,category_ru," +
        "subcategory_en,subcategory_tr,subcategory_ru," +
        "subsubcategory_en,subsubcategory_tr,subsubcategory_ru",
    } = opts;

    const params = new URLSearchParams({
      q: query.trim() || "*",
      query_by: queryBy,
      sort_by: this.sortBy(sortOption),
      per_page: String(hitsPerPage),
      page: String(page + 1), // Typesense pages start at 1
    });

    const filterBy = this.buildFilterBy(filters ?? []);
    if (filterBy) params.set("filter_by", filterBy);

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
        if (!res.ok) return [] as T[];

        const data = (await res.json()) as TypesenseSearchResponse;
        return (data.hits ?? []).map((h) => {
          const doc = this.parseDocument(h.document);
          return mapper(doc);
        });
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async searchProducts(opts: {
    query: string;
    sortOption: string;
    page?: number;
    hitsPerPage?: number;
    filters?: string[];
  }): Promise<TypeSenseDocument[]> {
    try {
      return await this.searchInIndex<TypeSenseDocument>({
        collection: this.mainIndexName,
        query: opts.query,
        sortOption: opts.sortOption,
        mapper: (doc) => doc,
        page: opts.page,
        hitsPerPage: opts.hitsPerPage,
        filters: opts.filters,
      });
    } catch (err) {
      console.warn("Typesense searchProducts error:", err);
      return [];
    }
  }

  debouncedSearchProducts(opts: {
    query: string;
    sortOption: string;
    page?: number;
    hitsPerPage?: number;
    filters?: string[];
  }): Promise<TypeSenseDocument[]> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        try {
          resolve(await this.searchProducts(opts));
        } catch {
          resolve([]);
        }
      }, this.debounceDuration);
    });
  }

  async searchShopProducts(opts: {
    shopId: string;
    query: string;
    sortOption: string;
    page?: number;
    hitsPerPage?: number;
    additionalFilters?: string[];
  }): Promise<TypeSenseDocument[]> {
    try {
      const filters = [
        `shopId:"${opts.shopId}"`,
        ...(opts.additionalFilters ?? []),
      ];
      return await this.searchInIndex<TypeSenseDocument>({
        collection: "shop_products",
        query: opts.query,
        sortOption: opts.sortOption,
        mapper: (doc) => doc,
        page: opts.page,
        hitsPerPage: opts.hitsPerPage ?? 100,
        filters,
      });
    } catch (err) {
      console.warn("Typesense searchShopProducts error:", err);
      return [];
    }
  }

  debouncedSearchShopProducts(opts: {
    shopId: string;
    query: string;
    sortOption: string;
    page?: number;
    hitsPerPage?: number;
    additionalFilters?: string[];
  }): Promise<TypeSenseDocument[]> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        try {
          resolve(await this.searchShopProducts(opts));
        } catch {
          resolve([]);
        }
      }, this.debounceDuration);
    });
  }

  async searchShops(opts: {
    query: string;
    page?: number;
    hitsPerPage?: number;
  }): Promise<TypeSenseDocument[]> {
    try {
      const params = new URLSearchParams({
        q: opts.query.trim() || "*",
        query_by: "name,searchableText",
        per_page: String(opts.hitsPerPage ?? 10),
        page: String((opts.page ?? 0) + 1),
      });

      const url = `${this.searchUrl("shops")}?${params.toString()}`;

      return await withRetry(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        try {
          const res = await fetch(url, {
            headers: this.headers,
            signal: controller.signal,
          });
          if (res.status >= 500)
            throw new Error(`Typesense 5xx: ${res.status}`);
          if (!res.ok) return [];
          const data = (await res.json()) as TypesenseSearchResponse;
          return (data.hits ?? []).map((h) => this.parseDocument(h.document));
        } finally {
          clearTimeout(timeout);
        }
      });
    } catch (err) {
      console.warn("Typesense searchShops error:", err);
      return [];
    }
  }

  async searchOrdersInTypeSense(opts: {
    query: string;
    userId: string;
    isSold: boolean;
    page?: number;
    hitsPerPage?: number;
  }): Promise<TypeSenseDocument[]> {
    try {
      const userField = opts.isSold ? "sellerId" : "buyerId";
      const params = new URLSearchParams({
        q: opts.query.trim() || "*",
        query_by: "searchableText,productName,buyerName,sellerName",
        filter_by: `${userField}:=${opts.userId}`,
        per_page: String(opts.hitsPerPage ?? 20),
        page: String((opts.page ?? 0) + 1),
      });

      const url = `${this.searchUrl("orders")}?${params.toString()}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(url, {
          headers: this.headers,
          signal: controller.signal,
        });
        if (!res.ok) return [];
        const data = (await res.json()) as TypesenseSearchResponse;
        return (data.hits ?? []).map((h) => this.parseDocument(h.document));
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      console.warn("Typesense searchOrders error:", err);
      return [];
    }
  }

  async searchOrdersByShopId(opts: {
    query: string;
    shopId: string;
    page?: number;
    hitsPerPage?: number;
  }): Promise<TypeSenseDocument[]> {
    try {
      const params = new URLSearchParams({
        q: opts.query.trim() || "*",
        query_by: "searchableText,productName,buyerName,sellerName",
        filter_by: `shopId:=${opts.shopId}`,
        per_page: String(opts.hitsPerPage ?? 20),
        page: String((opts.page ?? 0) + 1),
      });

      const url = `${this.searchUrl("orders")}?${params.toString()}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(url, {
          headers: this.headers,
          signal: controller.signal,
        });
        if (!res.ok) return [];
        const data = (await res.json()) as TypesenseSearchResponse;
        return (data.hits ?? []).map((h) => this.parseDocument(h.document));
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      console.warn("Typesense searchOrdersByShopId error:", err);
      return [];
    }
  }

  async searchIdsWithFacets(opts: {
    indexName: string;
    query?: string;
    page?: number;
    hitsPerPage?: number;
    facetFilters?: string[][];
    numericFilters?: string[];
    sortOption?: string;
    additionalFilterBy?: string;
    queryBy?: string;
    includeFields?: string;
  }): Promise<TypeSensePage> {
    const {
      indexName,
      query = "",
      page = 0,
      hitsPerPage = 20,
      facetFilters,
      numericFilters,
      sortOption = "date",
      additionalFilterBy,
      queryBy,
      includeFields,
    } = opts;

    const filterParts: string[] = [];

    if (additionalFilterBy?.trim()) {
      filterParts.push(additionalFilterBy.trim());
    }

    if (facetFilters) {
      for (const group of facetFilters) {
        if (!group.length) continue;
        const orParts = group
          .map((f) => {
            const colonIdx = f.indexOf(":");
            if (colonIdx < 0) return null;
            const field = f.slice(0, colonIdx).trim();
            const value = f
              .slice(colonIdx + 1)
              .trim()
              .replace(/"/g, "");
            return `${field}:=${value}`;
          })
          .filter((p): p is string => p !== null);

        if (orParts.length === 1) filterParts.push(orParts[0]);
        else if (orParts.length > 1)
          filterParts.push(`(${orParts.join(" || ")})`);
      }
    }

    if (numericFilters) {
      for (const nf of numericFilters) {
        const converted = nf
          .replace(
            /(\w+)\s*(>=|<=|>|<|=)\s*(\S+)/g,
            (_, field: string, op: string, val: string) =>
              `${field}:${op}${val}`,
          )
          .trim();
        if (converted) filterParts.push(converted);
      }
    }

    const defaultFields =
      "id,productName,price,originalPrice,discountPercentage,brandModel," +
      "category,subcategory,subsubcategory,gender,availableColors,colorImagesJson,colorQuantitiesJson," +
      "shopId,ownerId,userId,promotionScore,createdAt,imageUrls," +
      "sellerName,condition,currency,quantity,averageRating,reviewCount," +
      "isBoosted,isFeatured,purchaseCount,bestSellerRank,deliveryOption,paused," +
      "bundleIds,videoUrl,campaignName,discountThreshold,bulkDiscountPercentage";

    const params = new URLSearchParams({
      q: query.trim() || "*",
      query_by:
        queryBy ??
        "productName,brandModel,sellerName," +
          "category_en,category_tr,category_ru," +
          "subcategory_en,subcategory_tr,subcategory_ru," +
          "subsubcategory_en,subsubcategory_tr,subsubcategory_ru",
      sort_by: this.sortBy(sortOption),
      per_page: String(hitsPerPage),
      page: String(page + 1),
      include_fields: includeFields ?? defaultFields,
    });

    if (filterParts.length) {
      params.set("filter_by", filterParts.join(" && "));
    }

    const url = `${this.searchUrl(indexName)}?${params.toString()}`;
    console.debug(
      `Typesense request for ${indexName}: filter_by=${params.get("filter_by")}`,
    );

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
        console.warn(`Typesense error ${resp.status}`);
        return { ids: [], hits: [], page, nbPages: page + 1 };
      }

      const data = (await resp.json()) as TypesenseSearchResponse;
      const rawHits = data.hits ?? [];
      const found = data.found ?? 0;

      console.debug(
        `Typesense returned ${rawHits.length} hits (found=${found})`,
      );

      const ids: string[] = [];
      const hits: TypeSenseDocument[] = [];

      for (const h of rawHits) {
        const doc = this.parseDocument(h.document);
        hits.push(doc);
        const firestoreId = this.extractFirestoreId(doc.id, indexName);
        if (firestoreId) ids.push(firestoreId);
      }

      const perPage = Math.max(hitsPerPage, 1);
      const nbPages = Math.min(Math.max(Math.ceil(found / perPage), 1), 9_999);

      return { ids, hits, page, nbPages };
    } catch (err) {
      console.warn("Typesense exception in searchIdsWithFacets:", err);
      return { ids: [], hits: [], page, nbPages: page + 1 };
    }
  }

  async searchCategories(opts: {
    query: string;
    hitsPerPage?: number;
    languageCode?: string;
  }): Promise<CategorySuggestion[]> {
    if (!opts.query.trim()) return [];

    try {
      const lang = opts.languageCode ?? "en";
      const params = new URLSearchParams({
        q: opts.query.trim(),
        query_by: [
          `category_${lang}`,
          `subcategory_${lang}`,
          `subsubcategory_${lang}`,
          "category_en",
          "subcategory_en",
          "subsubcategory_en",
          "productName",
        ].join(","),
        per_page: "50",
        include_fields: [
          "category",
          "subcategory",
          "subsubcategory",
          "category_en",
          "category_tr",
          "category_ru",
          "subcategory_en",
          "subcategory_tr",
          "subcategory_ru",
          "subsubcategory_en",
          "subsubcategory_tr",
          "subsubcategory_ru",
        ].join(","),
      });

      const url = `${this.searchUrl(this.mainIndexName)}?${params.toString()}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3_000);

      let data: TypesenseSearchResponse;
      try {
        const res = await fetch(url, {
          headers: this.headers,
          signal: controller.signal,
        });
        if (!res.ok) return [];
        data = (await res.json()) as TypesenseSearchResponse;
      } finally {
        clearTimeout(timeout);
      }

      const rawHits = data.hits ?? [];
      const seen = new Set<string>();
      const results: CategorySuggestion[] = [];
      const limit = opts.hitsPerPage ?? 10;

      for (const h of rawHits) {
        if (results.length >= limit) break;
        const doc = this.parseDocument(h.document);

        const cat = doc.category ?? "";
        const sub = doc.subcategory ?? "";
        const subsub = doc.subsubcategory ?? "";

        const catKey = `category_${lang}` as keyof TypeSenseDocument;
        const subKey = `subcategory_${lang}` as keyof TypeSenseDocument;
        const subsubKey = `subsubcategory_${lang}` as keyof TypeSenseDocument;

        const catDisplay = String(doc[catKey] ?? doc.category_en ?? cat);
        const subDisplay = String(doc[subKey] ?? doc.subcategory_en ?? sub);
        const subsubDisplay = String(
          doc[subsubKey] ?? doc.subsubcategory_en ?? subsub,
        );

        // sub-subcategory (most specific)
        if (subsub && sub && cat) {
          const key = `${cat}/${sub}/${subsub}`;
          if (seen.size < limit && seen.add(key) && !seen.has(`_${key}`)) {
            results.push({
              categoryKey: cat,
              subcategoryKey: sub,
              subsubcategoryKey: subsub,
              displayName: `${catDisplay} > ${subDisplay} > ${subsubDisplay}`,
              level: 2,
              language: lang,
            });
          }
        }

        // subcategory
        if (sub && cat) {
          const key = `${cat}/${sub}`;
          if (results.length < limit && !seen.has(key)) {
            seen.add(key);
            results.push({
              categoryKey: cat,
              subcategoryKey: sub,
              displayName: `${catDisplay} > ${subDisplay}`,
              level: 1,
              language: lang,
            });
          }
        }

        // top-level category
        if (cat && !seen.has(cat)) {
          seen.add(cat);
          if (results.length < limit) {
            results.push({
              categoryKey: cat,
              displayName: catDisplay,
              level: 0,
              language: lang,
            });
          }
        }
      }

      return results;
    } catch (err) {
      console.warn("Typesense searchCategories error:", err);
      return [];
    }
  }

  /** Alias with higher default limit — mirrors Flutter's searchCategoriesEnhanced */
  async searchCategoriesEnhanced(opts: {
    query: string;
    hitsPerPage?: number;
    languageCode?: string;
  }): Promise<CategorySuggestion[]> {
    return this.searchCategories({
      ...opts,
      hitsPerPage: opts.hitsPerPage ?? 50,
    });
  }

  debouncedSearchCategories(opts: {
    query: string;
    hitsPerPage?: number;
    languageCode?: string;
  }): Promise<CategorySuggestion[]> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        resolve(await this.searchCategories(opts));
      }, this.debounceDuration);
    });
  }

  // ── Facet queries ─────────────────────────────────────────────────────────

  private static readonly SPEC_FACET_FIELDS =
    "productType,consoleBrand,clothingFit,clothingTypes,clothingSizes," +
    "jewelryType,jewelryMaterials,pantSizes,pantFabricTypes,footwearSizes";

  async fetchSpecFacets(opts: {
    indexName: string;
    query?: string;
    facetFilters?: string[][];
    additionalFilterBy?: string;
  }): Promise<Record<string, FacetCount[]>> {
    const { indexName, query = "*", facetFilters, additionalFilterBy } = opts;

    const filterParts: string[] = [];
    if (additionalFilterBy?.trim()) filterParts.push(additionalFilterBy.trim());

    if (facetFilters) {
      for (const group of facetFilters) {
        if (!group.length) continue;
        const orParts = group
          .map((f) => {
            const ci = f.indexOf(":");
            if (ci < 0) return null;
            const field = f.slice(0, ci).trim();
            const value = f
              .slice(ci + 1)
              .trim()
              .replace(/"/g, "");
            return `${field}:=${value}`;
          })
          .filter((p): p is string => p !== null);
        if (orParts.length === 1) filterParts.push(orParts[0]);
        else if (orParts.length > 1)
          filterParts.push(`(${orParts.join(" || ")})`);
      }
    }

    const params = new URLSearchParams({
      q: query.trim() || "*",
      query_by:
        "productName,brandModel,sellerName," +
        "category_en,category_tr,category_ru," +
        "subcategory_en,subcategory_tr,subcategory_ru," +
        "subsubcategory_en,subsubcategory_tr,subsubcategory_ru",
      per_page: "0",
      facet_by: TypeSenseService.SPEC_FACET_FIELDS,
      max_facet_values: "50",
    });

    if (filterParts.length) {
      params.set("filter_by", filterParts.join(" && "));
    }

    const url = `${this.searchUrl(indexName)}?${params.toString()}`;

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
        console.warn(`Typesense facet error ${resp.status}`);
        return {};
      }

      const data = (await resp.json()) as TypesenseSearchResponse;
      const facetCounts = data.facet_counts ?? [];
      const result: Record<string, FacetCount[]> = {};

      for (const facet of facetCounts) {
        const fieldName = facet.field_name ?? "";
        const counts: FacetCount[] = (facet.counts ?? [])
          .map((c) => ({
            value: String(c.value ?? ""),
            count: typeof c.count === "number" ? c.count : Number(c.count ?? 0),
          }))
          .filter((c) => c.value && c.count > 0);
        if (counts.length) result[fieldName] = counts;
      }

      console.debug("Typesense spec facets:", Object.keys(result));
      return result;
    } catch (err) {
      console.warn("Typesense fetchSpecFacets error:", err);
      return {};
    }
  }

  // ── Health check ──────────────────────────────────────────────────────────

  async isServiceReachable(): Promise<boolean> {
    try {
      const params = new URLSearchParams({
        q: "*",
        query_by: "id",
        per_page: "1",
      });
      const url = `${this.searchUrl(this.mainIndexName)}?${params.toString()}`;
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
      console.warn("Typesense unreachable:", err);
      return false;
    }
  }
}
