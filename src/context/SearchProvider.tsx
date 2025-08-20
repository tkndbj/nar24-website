"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
} from "react";
import AlgoliaServiceManager, { Suggestion, CategorySuggestion } from "@/lib/algolia";

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
  const [debounceTimeout, setDebounceTimeout] = useState<NodeJS.Timeout | null>(
    null
  );

  const algoliaManager = AlgoliaServiceManager.getInstance();

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
    []
  );

  const performSearch = useCallback(
    async (searchTerm: string) => {
      if (!searchTerm.trim()) return;

      console.log("🔍 SearchProvider: Performing search for:", searchTerm);

      try {
        const searchPromises: [
          Promise<Suggestion[]>,
          Promise<Suggestion[]>,
          Promise<CategorySuggestion[]>
        ] = [
          algoliaManager.searchProductSuggestions(
            searchTerm,
            "products",
            "alphabetical",
            0,
            5
          ),
          algoliaManager.searchProductSuggestions(
            searchTerm,
            "shop_products",
            "alphabetical",
            0,
            5
          ),
          algoliaManager.searchCategories(searchTerm, 15, "en"),
        ];

        const results = await Promise.all(searchPromises);
        const [productSuggestions, shopSuggestions, categoryResults] = results;

        console.log("🔍 Raw search results:", {
          products: productSuggestions,
          shop: shopSuggestions,
          categories: categoryResults,
        });

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

        console.log("🔍 Final results:", {
          searchTerm,
          combinedProducts: combined.length,
          categories: categoryResults.length,
        });

        setSuggestions(combined.slice(0, 10));
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
          isNetworkIssue
        );
      }
    },
    [algoliaManager, handleError]
  );

  const search = useCallback(
    async (searchTerm: string) => {
      const trimmed = searchTerm.trim();
      setTerm(trimmed);

      if (!trimmed) {
        clearResults();
        return;
      }

      setLoadingState();
      await performSearch(trimmed);
    },
    [clearResults, setLoadingState, performSearch]
  );

  const updateTerm = useCallback(
    (newTerm: string) => {
      const trimmed = newTerm.trim();
      setTerm(trimmed);

      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      if (!trimmed) {
        clearResults();
        return;
      }

      setLoadingState();

      const timeout = setTimeout(() => {
        performSearch(trimmed);
      }, 300);

      setDebounceTimeout(timeout);
    },
    [debounceTimeout, clearResults, setLoadingState, performSearch]
  );

  const clearSearchState = useCallback(() => {
    console.log("🧹 SearchProvider: Clearing search state");
    setTerm("");
    clearResults();

    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      setDebounceTimeout(null);
    }
  }, [clearResults, debounceTimeout]);

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

// Re-export types for convenience
export type { Suggestion, CategorySuggestion };