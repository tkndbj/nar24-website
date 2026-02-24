"use client";

/**
 * SearchProvider.tsx
 *
 * Mirrors Flutter's SearchProvider (search_provider.dart) exactly:
 *  - 300 ms debounce on keystrokes
 *  - Parallel fetch: products (main + shop), categories, shops
 *  - Pagination: _initialPageSize=10, _loadMorePageSize=5, _maxSuggestions=20
 *  - Firestore fallback mode
 *  - CategorySearchScorer for ranked category suggestions
 *  - ShopSuggestion type exposed in context
 *
 * No `any` types — Vercel-safe.
 */

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import type {
  TypeSenseDocument,
  CategorySuggestion,
} from "@/lib/typesense_service_manager";
import { circuitBreaker, CIRCUITS } from "@/app/utils/circuitBreaker";
import { requestDeduplicator } from "@/app/utils/requestDeduplicator";
import { debouncer, DEBOUNCE_DELAYS } from "@/app/utils/debouncer";
import { cacheManager, CACHE_NAMES } from "@/app/utils/cacheManager";
import { getSearchConfig } from "@/hooks/useSearchConfig";
import { getFirebaseDb } from "@/lib/firebase-lazy";
import {
  collection,
  query,
  orderBy,
  startAt,
  endAt,
  limit,
  getDocs,
} from "firebase/firestore";

// ── Domain types ──────────────────────────────────────────────────────────────

export interface Suggestion {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
}

export interface ShopSuggestion {
  id: string;
  name: string;
  profileImageUrl?: string;
  categories: string[];
}

export type { CategorySuggestion };

// ── Constants (mirror Flutter) ────────────────────────────────────────────────

const INITIAL_PAGE_SIZE = 10;
const LOAD_MORE_PAGE_SIZE = 5;
const MAX_SUGGESTIONS = 20;

// ── CategorySearchScorer (mirrors Flutter's enhanced_category_search.dart) ───

interface ScoredCategory {
  suggestion: CategorySuggestion;
  score: number;
}

const CategorySearchScorer = {
  /**
   * Score a single category suggestion against the search term.
   * Higher score = better match.
   */
  score(suggestion: CategorySuggestion, query: string): number {
    const q = query.toLowerCase().trim();
    const display = suggestion.displayName.toLowerCase();
    const catKey = (suggestion.categoryKey ?? "").toLowerCase();
    const subKey = (suggestion.subcategoryKey ?? "").toLowerCase();
    const subsubKey = (suggestion.subsubcategoryKey ?? "").toLowerCase();

    let score = 0;

    // Exact full display-name match — highest possible
    if (display === q) score += 100;

    // Starts-with match on display name
    if (display.startsWith(q)) score += 50;

    // Starts-with match on individual key segments
    if (catKey.startsWith(q)) score += 30;
    if (subKey.startsWith(q)) score += 25;
    if (subsubKey.startsWith(q)) score += 20;

    // Contains match
    if (display.includes(q)) score += 15;
    if (catKey.includes(q) || subKey.includes(q) || subsubKey.includes(q))
      score += 10;

    // Prefer shallower levels when tie-breaking (top-level = most general)
    // Flutter sorts more-specific first when scores are equal, so invert:
    score -= suggestion.level * 2;

    return score;
  },

  sortAndLimitResults(
    suggestions: CategorySuggestion[],
    query: string,
    maxResults: number = 15,
  ): CategorySuggestion[] {
    const scored: ScoredCategory[] = suggestions
      .map((s) => ({
        suggestion: s,
        score: CategorySearchScorer.score(s, query),
      }))
      .filter((s) => s.score > 0);

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, maxResults).map((s) => s.suggestion);
  },

  debugPrintScores(suggestions: CategorySuggestion[], query: string): void {
    if (process.env.NODE_ENV !== "development") return;
    const scored = suggestions.map((s) => ({
      name: s.displayName,
      score: CategorySearchScorer.score(s, query),
    }));
    console.debug("CategorySearchScorer scores:", scored);
  },
};

// ── Context shape ─────────────────────────────────────────────────────────────

interface SearchContextType {
  term: string;
  suggestions: Suggestion[];
  categorySuggestions: CategorySuggestion[];
  shopSuggestions: ShopSuggestion[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMoreProducts: boolean;
  errorMessage: string | null;
  hasNetworkError: boolean;
  /** Keystroke handler — 300 ms debounced */
  updateTerm: (newTerm: string, languageCode?: string) => void;
  /** Immediate search (submit / chip tap) */
  search: (searchTerm: string, languageCode?: string) => Promise<void>;
  /** Load the next page of product suggestions */
  loadMoreSuggestions: (languageCode?: string) => Promise<void>;
  clearSearchState: () => void;
  retry: (languageCode?: string) => Promise<void>;
  clearError: () => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function useSearchProvider(): SearchContextType {
  const ctx = useContext(SearchContext);
  if (!ctx)
    throw new Error("useSearchProvider must be used within a SearchProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function SearchProvider({ children }: { children: ReactNode }) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<
    CategorySuggestion[]
  >([]);
  const [shopSuggestions, setShopSuggestions] = useState<ShopSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasNetworkError, setHasNetworkError] = useState(false);

  // Pagination bookkeeping (not reactive state — avoids extra renders)
  const currentProductCountRef = useRef(0);
  const lastSearchTermRef = useRef<string | null>(null);

  // Stable ref to the singleton manager
  const managerRef = useRef(TypeSenseServiceManager.instance);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const clearResults = useCallback(() => {
    setSuggestions([]);
    setCategorySuggestions([]);
    setShopSuggestions([]);
    setIsLoading(false);
    setIsLoadingMore(false);
    setHasMoreProducts(true);
    setErrorMessage(null);
    setHasNetworkError(false);
    currentProductCountRef.current = 0;
    lastSearchTermRef.current = null;
  }, []);

  const setLoadingState = useCallback(() => {
    setIsLoading(true);
    setErrorMessage(null);
    setHasNetworkError(false);
  }, []);

  const resetPagination = useCallback(() => {
    currentProductCountRef.current = 0;
    setHasMoreProducts(true);
    setIsLoadingMore(false);
  }, []);

  const handleError = useCallback((message: string, isNetworkError = false) => {
    setSuggestions([]);
    setCategorySuggestions([]);
    setShopSuggestions([]);
    setIsLoading(false);
    setHasNetworkError(isNetworkError);
    setErrorMessage(message);
    currentProductCountRef.current = 0;
    setHasMoreProducts(true);
    setIsLoadingMore(false);
  }, []);

  // ── Firestore fallback ─────────────────────────────────────────────────────

  const performFirestoreSearch = useCallback(
    async (searchTerm: string): Promise<Suggestion[]> => {
      const db = await getFirebaseDb();
      const lower = searchTerm.toLowerCase();
      const capitalized =
        searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase();

      const snapshots = await Promise.all([
        getDocs(
          query(
            collection(db, "products"),
            orderBy("productName"),
            startAt(lower),
            endAt(lower + "\uf8ff"),
            limit(INITIAL_PAGE_SIZE),
          ),
        ),
        getDocs(
          query(
            collection(db, "products"),
            orderBy("productName"),
            startAt(capitalized),
            endAt(capitalized + "\uf8ff"),
            limit(INITIAL_PAGE_SIZE),
          ),
        ),
        getDocs(
          query(
            collection(db, "shop_products"),
            orderBy("productName"),
            startAt(lower),
            endAt(lower + "\uf8ff"),
            limit(INITIAL_PAGE_SIZE),
          ),
        ),
        getDocs(
          query(
            collection(db, "shop_products"),
            orderBy("productName"),
            startAt(capitalized),
            endAt(capitalized + "\uf8ff"),
            limit(INITIAL_PAGE_SIZE),
          ),
        ),
      ]);

      const combined: Suggestion[] = [];
      const seenIds = new Set<string>();

      for (const snapshot of snapshots) {
        for (const doc of snapshot.docs) {
          if (combined.length >= INITIAL_PAGE_SIZE) break;
          if (seenIds.has(doc.id)) continue;
          seenIds.add(doc.id);

          const data = doc.data() as Record<string, unknown>;
          const imageUrls = data["imageUrls"];
          combined.push({
            id: doc.id,
            name:
              typeof data["productName"] === "string"
                ? data["productName"]
                : "",
            price: typeof data["price"] === "number" ? data["price"] : 0,
            imageUrl:
              Array.isArray(imageUrls) && imageUrls.length > 0
                ? String(imageUrls[0])
                : undefined,
          });
        }
      }

      return combined;
    },
    [],
  );

  // ── Typesense fetchers ─────────────────────────────────────────────────────

  /** Map a TypeSenseDocument to a Suggestion */
  const mapToSuggestion = (doc: TypeSenseDocument): Suggestion => ({
    id: doc.id,
    name: doc.productName ?? "",
    price: doc.price ?? 0,
    imageUrl:
      Array.isArray(doc.imageUrls) && doc.imageUrls.length > 0
        ? doc.imageUrls[0]
        : undefined,
  });

  /** Fetch initial product suggestions (both indexes in parallel) */
  const fetchProductSuggestions = useCallback(
    async (searchTerm: string, fetchLimit: number): Promise<Suggestion[]> => {
      const [mainResults, shopResults] = await Promise.all([
        circuitBreaker.execute(
          CIRCUITS.ALGOLIA_MAIN,
          () =>
            managerRef.current.mainService.searchProducts({
              query: searchTerm,
              sortOption: "",
              page: 0,
              hitsPerPage: fetchLimit,
            }),
          async () => [] as TypeSenseDocument[],
        ),
        circuitBreaker.execute(
          CIRCUITS.ALGOLIA_SHOP,
          () =>
            managerRef.current.shopService.searchProducts({
              query: searchTerm,
              sortOption: "",
              page: 0,
              hitsPerPage: fetchLimit,
            }),
          async () => [] as TypeSenseDocument[],
        ),
      ]);

      return combineProductResults(
        [mainResults, shopResults],
        fetchLimit,
        /* existingSuggestions */ [],
      );
    },
    [],
  );

  /**
   * Fetch more product suggestions for pagination.
   * Flutter fetches the full page (maxSuggestions) and slices — we mirror that.
   */
  const fetchMoreProductSuggestions = useCallback(
    async (
      searchTerm: string,
      offset: number,
      fetchLimit: number,
      existing: Suggestion[],
    ): Promise<Suggestion[]> => {
      const [mainResults, shopResults] = await Promise.all([
        managerRef.current.mainService
          .searchProducts({
            query: searchTerm,
            sortOption: "",
            page: 0,
            hitsPerPage: MAX_SUGGESTIONS,
          })
          .catch(() => [] as TypeSenseDocument[]),
        managerRef.current.shopService
          .searchProducts({
            query: searchTerm,
            sortOption: "",
            page: 0,
            hitsPerPage: MAX_SUGGESTIONS,
          })
          .catch(() => [] as TypeSenseDocument[]),
      ]);

      // Slice from offset so we return only the "new" page
      const all = combineProductResults(
        [mainResults, shopResults],
        MAX_SUGGESTIONS,
        /* existingSuggestions */ [],
      );
      return all
        .slice(offset, offset + fetchLimit)
        .filter((s) => !existing.some((e) => e.id === s.id));
    },
    [],
  );

  /** Combine results from multiple indexes, deduplicating by ID */
  function combineProductResults(
    resultSets: TypeSenseDocument[][],
    fetchLimit: number,
    existingSuggestions: Suggestion[],
  ): Suggestion[] {
    const combined: Suggestion[] = [];
    const seenIds = new Set<string>(existingSuggestions.map((s) => s.id));

    for (const results of resultSets) {
      for (const doc of results) {
        if (combined.length >= fetchLimit) break;
        if (seenIds.has(doc.id)) continue;
        seenIds.add(doc.id);
        combined.push(mapToSuggestion(doc));
      }
      if (combined.length >= fetchLimit) break;
    }

    return combined;
  }

  /** Fetch shop suggestions (mirrors Flutter's _fetchShopSuggestions) */
  const fetchShopSuggestions = useCallback(
    async (
      searchTerm: string,
      languageCode = "en",
    ): Promise<ShopSuggestion[]> => {
      const results = await managerRef.current.shopsService
        .searchShops({ query: searchTerm, hitsPerPage: 5 })
        .catch(() => [] as TypeSenseDocument[]);

      return results.map((hit) => {
        const localKey =
          `categories_${languageCode}` as keyof TypeSenseDocument;
        const localCats = hit[localKey];
        const cats: string[] = Array.isArray(localCats)
          ? (localCats as string[])
          : Array.isArray(hit.categories)
            ? hit.categories
            : [];

        return {
          id: hit.id.replace("shops_", ""),
          name: hit.name ?? "",
          profileImageUrl: hit.profileImageUrl,
          categories: cats,
        };
      });
    },
    [],
  );

  /** Fetch + score category suggestions (mirrors Flutter's _fetchEnhancedCategorySuggestions) */
  const fetchEnhancedCategorySuggestions = useCallback(
    async (
      searchTerm: string,
      languageCode = "en",
    ): Promise<CategorySuggestion[]> => {
      console.debug(`🔍 Fetching category suggestions for: "${searchTerm}"`);

      const rawResults = await managerRef.current.mainService
        .searchCategories({ query: searchTerm, hitsPerPage: 50, languageCode })
        .catch(() => [] as CategorySuggestion[]);

      console.debug(`   Raw Typesense results: ${rawResults.length}`);

      const scored = CategorySearchScorer.sortAndLimitResults(
        rawResults,
        searchTerm,
        /* maxResults */ 15,
      );

      console.debug(`   Scored results: ${scored.length}`);
      CategorySearchScorer.debugPrintScores(rawResults, searchTerm);

      return scored;
    },
    [],
  );

  // ── Core search ────────────────────────────────────────────────────────────

  const performInitialSearch = useCallback(
    async (searchTerm: string, languageCode = "en") => {
      if (!searchTerm) return;

      resetPagination();
      lastSearchTermRef.current = searchTerm;

      // ── Firestore fallback ──────────────────────────────────────────────
      if (getSearchConfig().provider === "firestore") {
        try {
          const productSuggestions = await performFirestoreSearch(searchTerm);
          if (lastSearchTermRef.current !== searchTerm) return; // stale
          setSuggestions(productSuggestions);
          setCategorySuggestions([]);
          setShopSuggestions([]);
          currentProductCountRef.current = productSuggestions.length;
          if (productSuggestions.length < INITIAL_PAGE_SIZE)
            setHasMoreProducts(false);
          setIsLoading(false);
          setErrorMessage(null);
          setHasNetworkError(false);
        } catch (err) {
          console.error("❌ Firestore search error:", err);
          handleError("Search error occurred");
        }
        return;
      }

      // ── Cache check ─────────────────────────────────────────────────────
      const cacheKey = `search_${searchTerm}_${languageCode}`;
      const cached = cacheManager.get<{
        suggestions: Suggestion[];
        categorySuggestions: CategorySuggestion[];
        shopSuggestions: ShopSuggestion[];
      }>(CACHE_NAMES.SEARCH, cacheKey);

      if (cached) {
        console.log("✅ Returning cached search results");
        setSuggestions(cached.suggestions);
        setCategorySuggestions(cached.categorySuggestions);
        setShopSuggestions(cached.shopSuggestions);
        currentProductCountRef.current = cached.suggestions.length;
        if (cached.suggestions.length < INITIAL_PAGE_SIZE)
          setHasMoreProducts(false);
        setIsLoading(false);
        return;
      }

      // ── Typesense parallel fetch ─────────────────────────────────────────
      try {
        const [productSuggestions, categorySugs, shopSugs] =
          await requestDeduplicator.deduplicate(
            `search-${searchTerm}-${languageCode}`,
            () =>
              Promise.all([
                fetchProductSuggestions(searchTerm, INITIAL_PAGE_SIZE),
                fetchEnhancedCategorySuggestions(searchTerm, languageCode),
                fetchShopSuggestions(searchTerm, languageCode),
              ]),
          );

        if (lastSearchTermRef.current !== searchTerm) return; // stale

        setSuggestions(productSuggestions);
        setCategorySuggestions(categorySugs);
        setShopSuggestions(shopSugs);
        currentProductCountRef.current = productSuggestions.length;
        if (productSuggestions.length < INITIAL_PAGE_SIZE)
          setHasMoreProducts(false);
        setIsLoading(false);
        setErrorMessage(null);
        setHasNetworkError(false);

        // Cache for 2 minutes
        cacheManager.set(
          CACHE_NAMES.SEARCH,
          cacheKey,
          {
            suggestions: productSuggestions,
            categorySuggestions: categorySugs,
            shopSuggestions: shopSugs,
          },
          2 * 60 * 1000,
        );

        console.log("✅ SearchProvider: Search completed successfully");
      } catch (err) {
        if (lastSearchTermRef.current !== searchTerm) return;
        console.error("❌ SearchProvider: Search error:", err);
        const msg =
          err instanceof Error ? err.message : "Search error occurred";
        const isNetworkIssue =
          msg.toLowerCase().includes("failed to fetch") ||
          (typeof navigator !== "undefined" && !navigator.onLine);
        handleError(
          isNetworkIssue
            ? "Connection failed. Please try again."
            : "Search error occurred",
          isNetworkIssue,
        );
      }
    },
    [
      resetPagination,
      performFirestoreSearch,
      fetchProductSuggestions,
      fetchEnhancedCategorySuggestions,
      fetchShopSuggestions,
      handleError,
    ],
  );

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Immediate search — mirrors Flutter's search() */
  const search = useCallback(
    async (searchTerm: string, languageCode = "en") => {
      const trimmed = searchTerm.trim();
      setTerm(trimmed);

      if (!trimmed) {
        clearResults();
        return;
      }

      setLoadingState();
      await performInitialSearch(trimmed, languageCode);
    },
    [clearResults, setLoadingState, performInitialSearch],
  );

  /** Debounced keystroke handler — mirrors Flutter's updateTerm() */
  const updateTerm = useCallback(
    (newTerm: string, languageCode = "en") => {
      const trimmed = newTerm.trim();

      // Deduplicate: skip if term hasn't changed (prevents infinite rebuild loops)
      setTerm((prev) => {
        if (prev === trimmed) return prev;
        return trimmed;
      });

      if (!trimmed) {
        clearResults();
        return;
      }

      setLoadingState();

      debouncer.debounce(
        "search-input",
        () => performInitialSearch(trimmed, languageCode),
        DEBOUNCE_DELAYS.SEARCH, // 300 ms
      )();
    },
    [clearResults, setLoadingState, performInitialSearch],
  );

  /** Load next page of product suggestions — mirrors Flutter's loadMoreSuggestions() */
  const loadMoreSuggestions = useCallback(
    async (languageCode = "en") => {
      if (isLoadingMore) return;
      if (!hasMoreProducts) return;
      if (suggestions.length >= MAX_SUGGESTIONS) return;
      if (!term) return;

      // No pagination in Firestore fallback mode
      if (getSearchConfig().provider === "firestore") {
        setHasMoreProducts(false);
        return;
      }

      setIsLoadingMore(true);

      try {
        const remaining = MAX_SUGGESTIONS - suggestions.length;
        const fetchCount = Math.min(remaining, LOAD_MORE_PAGE_SIZE);

        const newSuggestions = await fetchMoreProductSuggestions(
          term,
          currentProductCountRef.current,
          fetchCount,
          suggestions,
        );

        // Stale check
        if (lastSearchTermRef.current !== term) {
          setIsLoadingMore(false);
          return;
        }

        if (newSuggestions.length === 0) {
          setHasMoreProducts(false);
        } else {
          setSuggestions((prev) => {
            const existingIds = new Set(prev.map((s) => s.id));
            const unique = newSuggestions.filter((s) => !existingIds.has(s.id));
            return [...prev, ...unique];
          });
          currentProductCountRef.current += newSuggestions.length;
          if (newSuggestions.length < fetchCount) setHasMoreProducts(false);
        }
      } catch (err) {
        console.warn("❌ Load more error:", err);
      } finally {
        setIsLoadingMore(false);
      }

      void languageCode; // consumed by fetchMoreProductSuggestions indirectly
    },
    [
      isLoadingMore,
      hasMoreProducts,
      suggestions,
      term,
      fetchMoreProductSuggestions,
    ],
  );

  const clearSearchState = useCallback(() => {
    setTerm("");
    clearResults();
    debouncer.cancel("search-input");
    requestDeduplicator.cancel(`search-${term}`);
  }, [clearResults, term]);

  const retry = useCallback(
    async (languageCode = "en") => {
      const current = term.trim();
      if (current) {
        setLoadingState();
        await performInitialSearch(current, languageCode);
      } else {
        clearResults();
      }
    },
    [term, setLoadingState, performInitialSearch, clearResults],
  );

  const clearError = useCallback(() => {
    setErrorMessage(null);
    setHasNetworkError(false);
  }, []);

  // ── Context value ──────────────────────────────────────────────────────────

  const value: SearchContextType = {
    term,
    suggestions,
    categorySuggestions,
    shopSuggestions,
    isLoading,
    isLoadingMore,
    hasMoreProducts: hasMoreProducts && suggestions.length < MAX_SUGGESTIONS,
    errorMessage,
    hasNetworkError,
    updateTerm,
    search,
    loadMoreSuggestions,
    clearSearchState,
    retry,
    clearError,
  };

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}
