"use client";

/**
 * SearchResultsProvider.tsx
 *
 * Mirrors Flutter's SearchResultsProvider exactly:
 *
 *  UNFILTERED PATH  — raw products set externally, sorted/boosted client-side
 *  FILTERED PATH    — dynamic filters sent directly to Typesense via
 *                     searchIdsWithFacets (shop_products collection)
 *
 *  Dynamic filter state:  brands, colors, specFilters, minPrice, maxPrice, minRating
 *  Spec facets:           fetchSpecFacets() scoped to the current query
 *  Mutations:             setDynamicFilter / removeDynamicFilter / clearDynamicFilters
 *
 * No `any` types — Vercel-safe.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  useMemo,
} from "react";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import type {
  TypeSenseDocument,
  FacetCount,
} from "@/lib/typesense_service_manager";
import { Product, ProductUtils } from "@/app/models/Product";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FilterType =
  | ""
  | "deals"
  | "boosted"
  | "trending"
  | "fiveStar"
  | "bestSellers";

export type SortOption =
  | "None"
  | "Alphabetical"
  | "Date"
  | "Price Low to High"
  | "Price High to Low";

/** Per-field facet value list — mirrors Flutter's Map<String, List<Map<String,dynamic>>> */
export type SpecFacets = Record<string, FacetCount[]>;

/** Mirrors Flutter's setDynamicFilter named parameters */
export interface DynamicFilterInput {
  brands?: string[];
  colors?: string[];
  specFilters?: Record<string, string[]>;
  minPrice?: number | null;
  maxPrice?: number | null;
  minRating?: number | null;
}

/** Mirrors Flutter's removeDynamicFilter named parameters */
export interface RemoveDynamicFilterInput {
  brand?: string;
  color?: string;
  specField?: string;
  specValue?: string;
  clearPrice?: boolean;
  clearRating?: boolean;
}

// ── Memory management (web-only, no equivalent in Flutter) ───────────────────
const MAX_PRODUCTS_IN_MEMORY = 200;
const PRODUCTS_TO_REMOVE = 50;

// ── Context shape ─────────────────────────────────────────────────────────────

interface SearchResultsContextType {
  // ── Unfiltered path ──────────────────────────────────────────────────────
  rawProducts: Product[];
  filteredProducts: Product[];
  boostedProducts: Product[];
  currentFilter: FilterType;
  sortOption: SortOption;
  isEmpty: boolean;
  hasNoData: boolean;

  setRawProducts: (products: Product[]) => void;
  addMoreProducts: (products: Product[]) => void;
  clearProducts: () => void;
  setFilter: (filter: FilterType | null) => void;
  setSortOption: (option: SortOption) => void;

  // ── Dynamic filter state ─────────────────────────────────────────────────
  dynamicBrands: string[];
  dynamicColors: string[];
  dynamicSpecFilters: Record<string, string[]>;
  minPrice: number | null;
  maxPrice: number | null;
  minRating: number | null;
  hasDynamicFilters: boolean;
  activeFiltersCount: number;

  setDynamicFilter: (input: DynamicFilterInput) => void;
  removeDynamicFilter: (input: RemoveDynamicFilterInput) => void;
  clearDynamicFilters: () => void;

  // ── Spec facets ──────────────────────────────────────────────────────────
  specFacets: SpecFacets;
  fetchSpecFacets: (query: string) => Promise<void>;

  // ── Filtered path (Typesense direct) ────────────────────────────────────
  fetchFilteredPage: (opts: {
    query: string;
    page: number;
    hitsPerPage?: number;
  }) => Promise<Product[]>;
}

// ── Context + hook ────────────────────────────────────────────────────────────

const SearchResultsContext = createContext<
  SearchResultsContextType | undefined
>(undefined);

export function useSearchResultsProvider(): SearchResultsContextType {
  const ctx = useContext(SearchResultsContext);
  if (!ctx) {
    throw new Error(
      "useSearchResultsProvider must be used within a SearchResultsProvider",
    );
  }
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function SearchResultsProvider({ children }: { children: ReactNode }) {
  const managerRef = useRef(TypeSenseServiceManager.instance);

  // ── Unfiltered path state ─────────────────────────────────────────────────
  const [rawProducts, setRawProductsState] = useState<Product[]>([]);
  const [currentFilter, setCurrentFilterState] = useState<FilterType>("");
  const [sortOption, setSortOptionState] = useState<SortOption>("None");

  // ── Dynamic filter state ──────────────────────────────────────────────────
  const [dynamicBrands, setDynamicBrands] = useState<string[]>([]);
  const [dynamicColors, setDynamicColors] = useState<string[]>([]);
  const [dynamicSpecFilters, setDynamicSpecFilters] = useState<
    Record<string, string[]>
  >({});
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [minRating, setMinRating] = useState<number | null>(null);

  // ── Spec facets ───────────────────────────────────────────────────────────
  const [specFacets, setSpecFacets] = useState<SpecFacets>({});

  // ── Sorting helpers ───────────────────────────────────────────────────────

  /** Mirrors Flutter's _applySorting */
  const applySorting = useCallback(
    (products: Product[], opt: SortOption): Product[] => {
      const sorted = [...products];
      switch (opt) {
        case "Alphabetical":
          sorted.sort((a, b) =>
            a.productName
              .toLowerCase()
              .localeCompare(b.productName.toLowerCase()),
          );
          break;
        case "Date":
          sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          break;
        case "Price Low to High":
          sorted.sort((a, b) => a.price - b.price);
          break;
        case "Price High to Low":
          sorted.sort((a, b) => b.price - a.price);
          break;
        default:
          break;
      }
      return sorted;
    },
    [],
  );

  /** Mirrors Flutter's _prioritizeBoosted — only applied in "None" sort mode */
  const prioritizeBoosted = useCallback((products: Product[]): Product[] => {
    const sorted = [...products];
    sorted.sort((a, b) => {
      if (a.isBoosted && !b.isBoosted) return -1;
      if (!a.isBoosted && b.isBoosted) return 1;
      return 0;
    });
    return sorted;
  }, []);

  // ── Filtered products (unfiltered path) ───────────────────────────────────

  /** Mirrors Flutter's _applyFiltersAndSort */
  const filteredProducts = useMemo(() => {
    let result = applySorting(rawProducts, sortOption);
    // Only prioritize boosted in default (relevance) mode — matches Flutter comment
    if (sortOption === "None") result = prioritizeBoosted(result);
    return result;
  }, [rawProducts, sortOption, applySorting, prioritizeBoosted]);

  const boostedProducts = useMemo(
    () => filteredProducts.filter((p) => p.isBoosted),
    [filteredProducts],
  );

  // ── Derived filter values ─────────────────────────────────────────────────

  /** Mirrors Flutter's hasDynamicFilters getter */
  const hasDynamicFilters = useMemo(
    () =>
      dynamicBrands.length > 0 ||
      dynamicColors.length > 0 ||
      Object.keys(dynamicSpecFilters).length > 0 ||
      minPrice !== null ||
      maxPrice !== null ||
      minRating !== null,
    [
      dynamicBrands,
      dynamicColors,
      dynamicSpecFilters,
      minPrice,
      maxPrice,
      minRating,
    ],
  );

  /** Mirrors Flutter's activeFiltersCount getter */
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    count += dynamicBrands.length;
    count += dynamicColors.length;
    for (const vals of Object.values(dynamicSpecFilters)) count += vals.length;
    if (minPrice !== null || maxPrice !== null) count++;
    if (minRating !== null) count++;
    return count;
  }, [
    dynamicBrands,
    dynamicColors,
    dynamicSpecFilters,
    minPrice,
    maxPrice,
    minRating,
  ]);

  // ── Typesense filter builders ─────────────────────────────────────────────

  /**
   * Mirrors Flutter's _toSortCode.
   * Converts SortOption UI label → Typesense sort_by string key.
   */
  function toSortCode(opt: SortOption): string {
    switch (opt) {
      case "Alphabetical":
        return "alphabetical";
      case "Price Low to High":
        return "price_asc";
      case "Price High to Low":
        return "price_desc";
      case "Date":
        return "date";
      default:
        return "date";
    }
  }

  /**
   * Mirrors Flutter's _buildFacetFilters.
   * Returns OR groups: [[brandModel:Nike, brandModel:Adidas], [availableColors:Red]]
   */
  function buildFacetFilters(
    brands: string[],
    colors: string[],
    specFilters: Record<string, string[]>,
  ): string[][] {
    const groups: string[][] = [];
    if (brands.length > 0) {
      groups.push(brands.map((b) => `brandModel:${b}`));
    }
    if (colors.length > 0) {
      groups.push(colors.map((c) => `availableColors:${c}`));
    }
    for (const [field, vals] of Object.entries(specFilters)) {
      if (vals.length > 0) groups.push(vals.map((v) => `${field}:${v}`));
    }
    return groups;
  }

  /**
   * Mirrors Flutter's _buildNumericFilters.
   * Returns ["price>=100", "price<=500", "averageRating>=4"]
   */
  function buildNumericFilters(
    minP: number | null,
    maxP: number | null,
    minR: number | null,
  ): string[] {
    const filters: string[] = [];
    if (minP !== null) filters.push(`price>=${Math.floor(minP)}`);
    if (maxP !== null) filters.push(`price<=${Math.ceil(maxP)}`);
    if (minR !== null) filters.push(`averageRating>=${minR}`);
    return filters;
  }

  /**
   * Map a raw Typesense document to a fully-typed Product.
   * Delegates to ProductUtils.fromTypeSense so all parsing helpers,
   * spec-field promotion, and colorImagesJson/colorQuantitiesJson decoding
   * are applied identically to Flutter's fromTypeSense factory.
   */
  function mapHitToProduct(doc: TypeSenseDocument): Product {
    return ProductUtils.fromTypeSense(
      doc as unknown as Record<string, unknown>,
    );
  }

  // ── Spec facets ───────────────────────────────────────────────────────────

  /** Mirrors Flutter's fetchSpecFacets — scoped to the current search query */
  const fetchSpecFacets = useCallback(async (query: string) => {
    try {
      const result = await managerRef.current.shopService.fetchSpecFacets({
        indexName: "shop_products",
        query,
      });
      setSpecFacets(result);
    } catch (err) {
      console.warn("Error fetching search spec facets:", err);
      setSpecFacets({});
    }
  }, []);

  // ── Filtered path (Typesense direct) ─────────────────────────────────────

  /**
   * Mirrors Flutter's fetchFilteredPage.
   * Sends dynamic filter state directly to Typesense (shop_products collection)
   * and returns a page of ProductSummary-equivalent Products.
   */
  const fetchFilteredPage = useCallback(
    async ({
      query,
      page,
      hitsPerPage = 50,
    }: {
      query: string;
      page: number;
      hitsPerPage?: number;
    }): Promise<Product[]> => {
      const facetFilters = buildFacetFilters(
        dynamicBrands,
        dynamicColors,
        dynamicSpecFilters,
      );
      const numericFilters = buildNumericFilters(minPrice, maxPrice, minRating);

      try {
        const res = await managerRef.current.shopService.searchIdsWithFacets({
          indexName: "shop_products",
          query,
          page,
          hitsPerPage,
          facetFilters,
          numericFilters,
          sortOption: toSortCode(sortOption),
        });

        return res.hits.map(mapHitToProduct);
      } catch (err) {
        console.warn("Filtered search error:", err);
        return [];
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      dynamicBrands,
      dynamicColors,
      dynamicSpecFilters,
      minPrice,
      maxPrice,
      minRating,
      sortOption,
    ],
  );

  // ── Unfiltered path mutations ─────────────────────────────────────────────

  const setRawProducts = useCallback((products: Product[]) => {
    setRawProductsState(products);
  }, []);

  const addMoreProducts = useCallback((products: Product[]) => {
    setRawProductsState((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const unique = products.filter((p) => !existingIds.has(p.id));
      let updated = [...prev, ...unique];
      // Memory management: sliding window (web-only)
      if (updated.length > MAX_PRODUCTS_IN_MEMORY) {
        updated = updated.slice(
          updated.length - MAX_PRODUCTS_IN_MEMORY + PRODUCTS_TO_REMOVE,
        );
      }
      return updated;
    });
  }, []);

  const clearProducts = useCallback(() => {
    setRawProductsState([]);
  }, []);

  const setFilter = useCallback((filter: FilterType | null) => {
    setCurrentFilterState((prev) => {
      const next: FilterType = filter ?? "";
      return next === prev ? prev : next;
    });
  }, []);

  const setSortOption = useCallback((opt: SortOption) => {
    setSortOptionState((prev) => (opt === prev ? prev : opt));
  }, []);

  // ── Dynamic filter mutations ──────────────────────────────────────────────

  /** Mirrors Flutter's setDynamicFilter */
  const setDynamicFilter = useCallback((input: DynamicFilterInput) => {
    if (input.brands !== undefined) setDynamicBrands([...input.brands]);
    if (input.colors !== undefined) setDynamicColors([...input.colors]);
    if (input.specFilters !== undefined) {
      const cleaned: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(input.specFilters)) {
        if (v.length > 0) cleaned[k] = [...v];
      }
      setDynamicSpecFilters(cleaned);
    }
    if (input.minPrice !== undefined) setMinPrice(input.minPrice);
    if (input.maxPrice !== undefined) setMaxPrice(input.maxPrice);
    if (input.minRating !== undefined) setMinRating(input.minRating);
  }, []);

  /** Mirrors Flutter's removeDynamicFilter */
  const removeDynamicFilter = useCallback((input: RemoveDynamicFilterInput) => {
    if (input.brand) {
      setDynamicBrands((prev) => prev.filter((b) => b !== input.brand));
    }
    if (input.color) {
      setDynamicColors((prev) => prev.filter((c) => c !== input.color));
    }
    if (input.specField && input.specValue) {
      setDynamicSpecFilters((prev) => {
        const list = prev[input.specField!];
        if (!list) return prev;
        const updated = list.filter((v) => v !== input.specValue);
        if (updated.length === 0) {
          const { [input.specField!]: _dropped, ...rest } = prev;
          void _dropped;
          return rest;
        }
        return { ...prev, [input.specField!]: updated };
      });
    }
    if (input.clearPrice) {
      setMinPrice(null);
      setMaxPrice(null);
    }
    if (input.clearRating) {
      setMinRating(null);
    }
  }, []);

  /** Mirrors Flutter's clearDynamicFilters */
  const clearDynamicFilters = useCallback(() => {
    setDynamicBrands([]);
    setDynamicColors([]);
    setDynamicSpecFilters({});
    setMinPrice(null);
    setMaxPrice(null);
    setMinRating(null);
  }, []);

  // ── Dev logging ───────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.log("📊 SearchResultsProvider state:", {
      raw: rawProducts.length,
      filtered: filteredProducts.length,
      boosted: boostedProducts.length,
      currentFilter,
      sortOption,
      activeFiltersCount,
      hasDynamicFilters,
    });
  }, [
    rawProducts.length,
    filteredProducts.length,
    boostedProducts.length,
    currentFilter,
    sortOption,
    activeFiltersCount,
    hasDynamicFilters,
  ]);

  // ── Context value ─────────────────────────────────────────────────────────

  const value: SearchResultsContextType = useMemo(
    () => ({
      // Unfiltered path
      rawProducts,
      filteredProducts,
      boostedProducts,
      currentFilter,
      sortOption,
      isEmpty: filteredProducts.length === 0,
      hasNoData: rawProducts.length === 0,
      setRawProducts,
      addMoreProducts,
      clearProducts,
      setFilter,
      setSortOption,

      // Dynamic filter state
      dynamicBrands,
      dynamicColors,
      dynamicSpecFilters,
      minPrice,
      maxPrice,
      minRating,
      hasDynamicFilters,
      activeFiltersCount,
      setDynamicFilter,
      removeDynamicFilter,
      clearDynamicFilters,

      // Spec facets
      specFacets,
      fetchSpecFacets,

      // Filtered path
      fetchFilteredPage,
    }),
    [
      rawProducts,
      filteredProducts,
      boostedProducts,
      currentFilter,
      sortOption,
      setRawProducts,
      addMoreProducts,
      clearProducts,
      setFilter,
      setSortOption,
      dynamicBrands,
      dynamicColors,
      dynamicSpecFilters,
      minPrice,
      maxPrice,
      minRating,
      hasDynamicFilters,
      activeFiltersCount,
      setDynamicFilter,
      removeDynamicFilter,
      clearDynamicFilters,
      specFacets,
      fetchSpecFacets,
      fetchFilteredPage,
    ],
  );

  return (
    <SearchResultsContext.Provider value={value}>
      {children}
    </SearchResultsContext.Provider>
  );
}

export type { Product };
