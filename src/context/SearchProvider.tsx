"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import AlgoliaServiceManager, {
  Suggestion,
  CategorySuggestion,
} from "@/lib/algolia";
import { circuitBreaker, CIRCUITS } from "@/app/utils/circuitBreaker";
import { requestDeduplicator } from "@/app/utils/requestDeduplicator";
import { debouncer, DEBOUNCE_DELAYS } from "@/app/utils/debouncer";
import { cacheManager, CACHE_NAMES } from "@/app/utils/cacheManager";
import { userActivityService } from "@/services/userActivity";
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

interface SearchContextType {
  term: string;
  suggestions: Suggestion[];
  categorySuggestions: CategorySuggestion[];
  isLoading: boolean;
  errorMessage: string | null;
  hasNetworkError: boolean;
  updateTerm: (newTerm: string) => void;
  search: (searchTerm: string) => Promise<void>;
  clearSearchState: () => void;
  retry: () => Promise<void>;
  clearError: () => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function useSearchProvider() {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error("useSearchProvider must be used within a SearchProvider");
  }
  return context;
}

interface SearchProviderProps {
  children: ReactNode;
}

export function SearchProvider({ children }: SearchProviderProps) {
  const [term, setTerm] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [categorySuggestions, setCategorySuggestions] = useState<
    CategorySuggestion[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasNetworkError, setHasNetworkError] = useState(false);

  const algoliaManagerRef = useRef(AlgoliaServiceManager.getInstance());

  const clearResults = useCallback(() => {
    setSuggestions([]);
    setCategorySuggestions([]);
    setIsLoading(false);
    setErrorMessage(null);
    setHasNetworkError(false);
  }, []);

  const setLoadingState = useCallback(() => {
    setIsLoading(true);
    setErrorMessage(null);
    setHasNetworkError(false);
  }, []);

  const handleError = useCallback(
    (message: string, isNetworkError: boolean = false) => {
      setSuggestions([]);
      setCategorySuggestions([]);
      setIsLoading(false);
      setHasNetworkError(isNetworkError);
      setErrorMessage(message);
    },
    [],
  );

  const performFirestoreSearch = useCallback(
    async (
      searchTerm: string,
    ): Promise<{
      suggestions: Suggestion[];
      categorySuggestions: CategorySuggestion[];
    }> => {
      const db = await getFirebaseDb();
      const lower = searchTerm.toLowerCase();
      const capitalized =
        searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase();
      const searchLimit = 10;

      const queries = [
        getDocs(
          query(
            collection(db, "products"),
            orderBy("productName"),
            startAt(lower),
            endAt(lower + "\uf8ff"),
            limit(searchLimit),
          ),
        ),
        getDocs(
          query(
            collection(db, "products"),
            orderBy("productName"),
            startAt(capitalized),
            endAt(capitalized + "\uf8ff"),
            limit(searchLimit),
          ),
        ),
        getDocs(
          query(
            collection(db, "shop_products"),
            orderBy("productName"),
            startAt(lower),
            endAt(lower + "\uf8ff"),
            limit(searchLimit),
          ),
        ),
        getDocs(
          query(
            collection(db, "shop_products"),
            orderBy("productName"),
            startAt(capitalized),
            endAt(capitalized + "\uf8ff"),
            limit(searchLimit),
          ),
        ),
      ];

      const snapshots = await Promise.all(queries);
      const combined: Suggestion[] = [];
      const seenIds = new Set<string>();

      for (const snapshot of snapshots) {
        for (const doc of snapshot.docs) {
          if (combined.length >= searchLimit) break;
          if (seenIds.has(doc.id)) continue;
          seenIds.add(doc.id);

          const data = doc.data();
          combined.push({
            id: doc.id,
            name: data.productName ?? "",
            price: typeof data.price === "number" ? data.price : 0,
          });
        }
      }

      return { suggestions: combined, categorySuggestions: [] };
    },
    [],
  );

  // REPLACE the entire performSearch function with:
  const performSearch = useCallback(
    async (searchTerm: string) => {
      if (!searchTerm.trim()) return;

      console.log("🔍 SearchProvider: Performing search for:", searchTerm);

      // ✅ Firestore fallback mode
      if (getSearchConfig().provider === "firestore") {
        try {
          const results = await performFirestoreSearch(searchTerm);
          setSuggestions(results.suggestions);
          setCategorySuggestions([]);
          setIsLoading(false);
          setErrorMessage(null);
          setHasNetworkError(false);
          console.log("✅ SearchProvider: Firestore fallback search completed");
          return;
        } catch (error) {
          console.error("❌ Firestore search error:", error);
          handleError("Search error occurred");
          return;
        }
      }

      // ✅ Check cache first
      const cacheKey = `search_${searchTerm}`;
      const cached = cacheManager.get<{
        suggestions: Suggestion[];
        categorySuggestions: CategorySuggestion[];
      }>(CACHE_NAMES.SEARCH, cacheKey);

      if (cached) {
        console.log("✅ Returning cached search results");
        setSuggestions(cached.suggestions);
        setCategorySuggestions(cached.categorySuggestions);
        setIsLoading(false);
        return;
      }

      try {
        // ✅ Deduplicate concurrent searches
        const results = await requestDeduplicator.deduplicate(
          `search-${searchTerm}`,
          async () => {
            // ✅ Use circuit breaker for each Algolia call
            const searchPromises: [
              Promise<Suggestion[]>,
              Promise<Suggestion[]>,
              Promise<CategorySuggestion[]>,
            ] = [
              circuitBreaker.execute(
                CIRCUITS.ALGOLIA_MAIN,
                () =>
                  algoliaManagerRef.current.searchProductSuggestions(
                    searchTerm,
                    "products",
                    "alphabetical",
                    0,
                    5,
                  ),
                async () => [], // Fallback to empty array
              ),
              circuitBreaker.execute(
                CIRCUITS.ALGOLIA_SHOP,
                () =>
                  algoliaManagerRef.current.searchProductSuggestions(
                    searchTerm,
                    "shop_products",
                    "alphabetical",
                    0,
                    5,
                  ),
                async () => [], // Fallback
              ),
              circuitBreaker.execute(
                CIRCUITS.ALGOLIA_MAIN,
                () =>
                  algoliaManagerRef.current.searchCategories(
                    searchTerm,
                    15,
                    "en",
                  ),
                async () => [], // Fallback
              ),
            ];

            return await Promise.all(searchPromises);
          },
        );

        const [productSuggestions, shopSuggestions, categoryResults] = results;

        const combined: Suggestion[] = [];
        const seenIds = new Set<string>();

        for (const suggestion of productSuggestions) {
          if (seenIds.add(suggestion.id)) {
            combined.push(suggestion);
          }
        }

        for (const suggestion of shopSuggestions) {
          if (seenIds.add(suggestion.id)) {
            combined.push(suggestion);
          }
        }

        const finalSuggestions = combined.slice(0, 10);

        // ✅ Cache results for 2 minutes
        cacheManager.set(
          CACHE_NAMES.SEARCH,
          cacheKey,
          {
            suggestions: finalSuggestions,
            categorySuggestions: categoryResults,
          },
          2 * 60 * 1000,
        );

        setSuggestions(finalSuggestions);
        setCategorySuggestions(categoryResults);
        setIsLoading(false);
        setErrorMessage(null);
        setHasNetworkError(false);
        console.log("✅ SearchProvider: Search completed successfully");
      } catch (error) {
        console.error("❌ SearchProvider: Search error:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Search error occurred";
        const isNetworkIssue =
          errorMessage.toLowerCase().includes("failed to fetch") ||
          !navigator.onLine;

        handleError(
          isNetworkIssue
            ? "Connection failed. Please try again."
            : "Search error occurred",
          isNetworkIssue,
        );
      }
    },
    [handleError, performFirestoreSearch],
  );

  const search = useCallback(
    async (searchTerm: string) => {
      const trimmed = searchTerm.trim();
      setTerm(trimmed);

      if (!trimmed) {
        clearResults();
        return;
      }

      userActivityService.trackSearch({
        query: trimmed,
        // resultCount will be added after we get results
      });

      setLoadingState();
      await performSearch(trimmed);
    },
    [clearResults, setLoadingState, performSearch],
  );

  const updateTerm = useCallback(
    (newTerm: string) => {
      const trimmed = newTerm.trim();
      setTerm(trimmed);

      if (!trimmed) {
        clearResults();
        return;
      }

      setLoadingState();

      // Set new timeout
      debouncer.debounce(
        "search-input",
        () => performSearch(trimmed),
        DEBOUNCE_DELAYS.SEARCH, // 300ms
      )();
    },
    [clearResults, setLoadingState, performSearch],
  );

  const clearSearchState = useCallback(() => {
    console.log("🧹 SearchProvider: Clearing search state");
    setTerm("");
    clearResults();

    // ✅ Cancel any pending operations
    debouncer.cancel("search-input");
    requestDeduplicator.cancel(`search-${term}`);
  }, [clearResults, term]);

  const retry = useCallback(async () => {
    const current = term.trim();
    if (current) {
      setLoadingState();
      await performSearch(current);
    } else {
      clearResults();
    }
  }, [term, setLoadingState, performSearch, clearResults]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
    setHasNetworkError(false);
  }, []);

  const value: SearchContextType = {
    term,
    suggestions,
    categorySuggestions,
    isLoading,
    errorMessage,
    hasNetworkError,
    updateTerm,
    search,
    clearSearchState,
    retry,
    clearError,
  };

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

export type { Suggestion, CategorySuggestion };
