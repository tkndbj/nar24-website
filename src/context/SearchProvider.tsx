"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
} from "react";

// EXPORTED Types
export interface Suggestion {
  id: string;
  name: string;
  price: number;
}

export interface CategorySuggestion {
  id: string;
  categoryKey?: string;
  subcategoryKey?: string;
  subsubcategoryKey?: string;
  displayName: string;
  type: string;
  level: number;
  languageCode?: string;
}

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

// Algolia Service Manager
class AlgoliaServiceManager {
  private static instance: AlgoliaServiceManager;
  private readonly applicationId = "3QVVGQH4ME";
  private readonly apiKey = "dcca6685e21c2baed748ccea7a6ddef1";

  static getInstance() {
    if (!AlgoliaServiceManager.instance) {
      AlgoliaServiceManager.instance = new AlgoliaServiceManager();
    }
    return AlgoliaServiceManager.instance;
  }

  async searchProducts(
    query: string,
    indexName: string = "products",
    sortOption: string = "alphabetical",
    page: number = 0,
    hitsPerPage: number = 5
  ): Promise<Suggestion[]> {
    const replicaIndex = this.getReplicaIndexName(indexName, sortOption);
    const url = `https://${this.applicationId}-dsn.algolia.net/1/indexes/${replicaIndex}/query`;

    const params = new URLSearchParams({
      query,
      page: page.toString(),
      hitsPerPage: hitsPerPage.toString(),
      attributesToRetrieve: "objectID,productName,price",
      attributesToHighlight: "",
    });

    try {
      console.log(`🔍 Searching ${replicaIndex} with query: "${query}"`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-Algolia-Application-Id": this.applicationId,
          "X-Algolia-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ params: params.toString() }),
      });

      if (!response.ok) {
        throw new Error(`Algolia request failed: ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ ${replicaIndex} returned ${data.hits?.length || 0} hits`);

      const hits = data.hits || [];
      return hits.map((hit: Record<string, unknown>) => ({
        id:
          (hit.objectID as string) ||
          `unknown-${Math.random().toString(36).substr(2, 9)}`,
        name: (hit.productName as string) || "Unknown Product",
        price: (hit.price as number) || 0,
      }));
    } catch (error) {
      console.error(`❌ ${replicaIndex} search error:`, error);
      return [];
    }
  }

  async searchCategories(
    query: string,
    hitsPerPage: number = 15,
    languageCode?: string
  ): Promise<CategorySuggestion[]> {
    const url = `https://${this.applicationId}-dsn.algolia.net/1/indexes/categories/query`;

    const params: Record<string, string> = {
      query,
      hitsPerPage: hitsPerPage.toString(),
      attributesToRetrieve:
        "objectID,categoryKey,subcategoryKey,subsubcategoryKey,displayName,type,level,languageCode",
      attributesToHighlight: "displayName,searchableText",
      typoTolerance: "true",
    };

    if (languageCode) {
      params.filters = `languageCode:${languageCode}`;
    }

    try {
      console.log(`🔍 Searching categories with query: "${query}"`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-Algolia-Application-Id": this.applicationId,
          "X-Algolia-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          params: new URLSearchParams(params).toString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Category search failed: ${response.status}`);
      }

      const data = await response.json();
      console.log(`✅ Categories returned ${data.hits?.length || 0} hits`);

      const hits = data.hits || [];
      return hits.map((hit: Record<string, unknown>) => ({
        id: hit.objectID as string,
        categoryKey: hit.categoryKey as string | undefined,
        subcategoryKey: hit.subcategoryKey as string | undefined,
        subsubcategoryKey: hit.subsubcategoryKey as string | undefined,
        displayName: (hit.displayName as string) || "Unknown Category",
        type: (hit.type as string) || "category",
        level: (hit.level as number) || 1,
        languageCode: hit.languageCode as string | undefined,
      }));
    } catch (error) {
      console.error("❌ Category search error:", error);
      return [];
    }
  }

  private getReplicaIndexName(indexName: string, sortOption: string): string {
    if (indexName === "shop_products") {
      return indexName;
    }
    switch (sortOption) {
      case "date":
        return `${indexName}_createdAt_desc`;
      case "alphabetical":
        return `${indexName}_alphabetical`;
      case "price_asc":
        return `${indexName}_price_asc`;
      case "price_desc":
        return `${indexName}_price_desc`;
      default:
        return indexName;
    }
  }
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
          algoliaManager.searchProducts(
            searchTerm,
            "products",
            "alphabetical",
            0,
            5
          ),
          algoliaManager.searchProducts(
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
