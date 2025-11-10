"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from "react";
import { Product } from "@/app/models/Product";

// Filter types matching Flutter implementation
export type FilterType = '' | 'deals' | 'boosted' | 'trending' | 'fiveStar' | 'bestSellers';

// Sort options matching Flutter implementation
export type SortOption = 'None' | 'Alphabetical' | 'Date' | 'Price Low to High' | 'Price High to Low';

// Memory management constants - prevent unbounded growth
const MAX_PRODUCTS_IN_MEMORY = 200; // Limit for extended browsing sessions
const PRODUCTS_TO_REMOVE = 50; // Remove oldest 50 when limit exceeded

interface SearchResultsContextType {
  // State
  rawProducts: Product[];
  filteredProducts: Product[];
  boostedProducts: Product[];
  currentFilter: FilterType;
  sortOption: SortOption;
  isEmpty: boolean;
  hasNoData: boolean;
  
  // Actions
  setRawProducts: (products: Product[]) => void;
  addMoreProducts: (products: Product[]) => void;
  clearProducts: () => void;
  setFilter: (filter: FilterType | null) => void;
  setSortOption: (sortOption: SortOption) => void;
}

const SearchResultsContext = createContext<SearchResultsContextType | undefined>(undefined);

export function useSearchResultsProvider() {
  const context = useContext(SearchResultsContext);
  if (context === undefined) {
    throw new Error('useSearchResultsProvider must be used within a SearchResultsProvider');
  }
  return context;
}

interface SearchResultsProviderProps {
  children: ReactNode;
}

export function SearchResultsProvider({ children }: SearchResultsProviderProps) {
  // Raw search results from API
  const [rawProducts, setRawProductsState] = useState<Product[]>([]);
  
  // Current filter state
  const [currentFilter, setCurrentFilterState] = useState<FilterType>('');
  
  // Sort option
  const [sortOption, setSortOptionState] = useState<SortOption>('None');

  // Apply filter logic based on filter type - Enhanced to match Flutter exactly
  const applyFilterLogic = useCallback((products: Product[], filter: FilterType): Product[] => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 Applying filter: ${filter} to ${products.length} products`);
    }

    let filtered: Product[];

    switch (filter) {
      case 'deals':
        filtered = products.filter((p) => (p.discountPercentage ?? 0) > 0);
        break;
      case 'boosted':
        filtered = products.filter((p) => p.isBoosted);
        break;
      case 'trending':
        filtered = products.filter((p) => p.dailyClickCount >= 10);
        break;
      case 'fiveStar':
        filtered = products.filter((p) => p.averageRating === 5);
        break;
      case 'bestSellers':
        // Sort by purchaseCount descending for best sellers
        filtered = [...products].sort((a, b) => b.purchaseCount - a.purchaseCount);
        break;
      default:
        filtered = [...products]; // 'All' filter or empty filter
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ Filter ${filter} resulted in ${filtered.length} products`);
    }
    return filtered;
  }, []);

  // Apply sorting to the list - Enhanced to match Flutter exactly
  const applySorting = useCallback((products: Product[], sortOpt: SortOption): Product[] => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 Applying sort: ${sortOpt} to ${products.length} products`);
    }

    const sorted = [...products];

    switch (sortOpt) {
      case 'Alphabetical':
        sorted.sort((a, b) =>
          a.productName.toLowerCase().localeCompare(b.productName.toLowerCase())
        );
        break;
      case 'Date':
        sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      case 'Price Low to High':
        sorted.sort((a, b) => a.price - b.price);
        break;
      case 'Price High to Low':
        sorted.sort((a, b) => b.price - a.price);
        break;
      case 'None':
      default:
        // Keep original order for relevance ranking
        break;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ Sort ${sortOpt} completed`);
    }
    return sorted;
  }, []);

  // Prioritize boosted products - Matches Flutter implementation exactly
  const prioritizeBoosted = useCallback((products: Product[]): Product[] => {
    const sorted = [...products];
    sorted.sort((a, b) => {
      // Boosted products come first
      if (a.isBoosted && !b.isBoosted) return -1;
      if (!a.isBoosted && b.isBoosted) return 1;
      return 0; // Keep original order for products with same boost status
    });

    if (process.env.NODE_ENV === 'development') {
      const boostedCount = sorted.filter(p => p.isBoosted).length;
      console.log(`✅ Prioritized ${boostedCount} boosted products`);
    }
    return sorted;
  }, []);

  // Compute filtered products with memoization - Enhanced to match Flutter flow
  const filteredProducts = useMemo(() => {
    // Start with raw products
    let result = [...rawProducts];

    // Apply filter logic
    result = applyFilterLogic(result, currentFilter);

    // Apply sorting
    result = applySorting(result, sortOption);

    // Prioritize boosted products
    result = prioritizeBoosted(result);

    return result;
  }, [rawProducts, currentFilter, sortOption, applyFilterLogic, applySorting, prioritizeBoosted]);

  // Set the raw products from search API
  const setRawProducts = useCallback((products: Product[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`📝 Setting ${products.length} raw products`);
    }
    setRawProductsState(products);
  }, []);

  // Add more products (for pagination) with memory management
  const addMoreProducts = useCallback((products: Product[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`➕ Adding ${products.length} more products`);
    }

    setRawProductsState(prev => {
      // Deduplicate by ID to prevent duplicates from multiple index searches
      const existingIds = new Set(prev.map(p => p.id));
      const newProducts = products.filter(p => !existingIds.has(p.id));

      if (process.env.NODE_ENV === 'development') {
        console.log(`➕ After deduplication: ${newProducts.length} new unique products`);
      }

      let updatedProducts = [...prev, ...newProducts];

      // Memory management: Implement sliding window to prevent unbounded growth
      if (updatedProducts.length > MAX_PRODUCTS_IN_MEMORY) {
        // Remove oldest products (those added first) to stay under limit
        const excessCount = updatedProducts.length - MAX_PRODUCTS_IN_MEMORY + PRODUCTS_TO_REMOVE;
        updatedProducts = updatedProducts.slice(excessCount);

        if (process.env.NODE_ENV === 'development') {
          console.log(`🗑️ Memory limit reached. Removed ${excessCount} oldest products. Current: ${updatedProducts.length}`);
        }
      }

      return updatedProducts;
    });
  }, []);

  // Clear all products
  const clearProducts = useCallback(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🧹 Clearing all products`);
    }
    setRawProductsState([]);
  }, []);

  // Apply a quick filter
  const setFilter = useCallback((filter: FilterType | null) => {
    const newFilter: FilterType = filter || '';

    if (newFilter === currentFilter) {
      return; // No change, skip
    }

    setCurrentFilterState(newFilter);
  }, [currentFilter]);

  // Set sort option
  const setSortOption = useCallback((sortOpt: SortOption) => {
    if (sortOpt === sortOption) {
      return; // No change, skip
    }

    setSortOptionState(sortOpt);
  }, [sortOption]);

  // Get boosted products from filtered list
  const boostedProducts = useMemo(() => {
    return filteredProducts.filter((p) => p.isBoosted);
  }, [filteredProducts]);

  // Check if filtered list is empty
  const isEmpty = filteredProducts.length === 0;

  // Check if raw products are empty
  const hasNoData = rawProducts.length === 0;

  // Development-only state logging
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`📊 SearchResultsProvider State:`, {
        rawProducts: rawProducts.length,
        filteredProducts: filteredProducts.length,
        boostedProducts: boostedProducts.length,
        currentFilter,
        sortOption,
        isEmpty,
        hasNoData
      });
    }
  }, [rawProducts.length, filteredProducts.length, boostedProducts.length, currentFilter, sortOption, isEmpty, hasNoData]);

  const value: SearchResultsContextType = useMemo(() => ({
    rawProducts,
    filteredProducts,
    boostedProducts,
    currentFilter,
    sortOption,
    isEmpty,
    hasNoData,
    setRawProducts,
    addMoreProducts,
    clearProducts,
    setFilter,
    setSortOption,
  }), [
    rawProducts,
    filteredProducts,
    boostedProducts,
    currentFilter,
    sortOption,
    isEmpty,
    hasNoData,
    setRawProducts,
    addMoreProducts,
    clearProducts,
    setFilter,
    setSortOption,
  ]);

  return (
    <SearchResultsContext.Provider value={value}>
      {children}
    </SearchResultsContext.Provider>
  );
}

// Re-export types for convenience
export type { Product };