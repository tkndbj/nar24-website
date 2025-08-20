"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from "react";
import { Product } from "@/lib/algolia";

// Filter types matching Flutter implementation
export type FilterType = '' | 'deals' | 'boosted' | 'trending' | 'fiveStar' | 'bestSellers';

// Sort options matching Flutter implementation
export type SortOption = 'None' | 'Alphabetical' | 'Date' | 'Price Low to High' | 'Price High to Low';

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

  // Apply filter logic based on filter type
  const applyFilterLogic = useCallback((products: Product[], filter: FilterType): Product[] => {
    switch (filter) {
      case 'deals':
        return products.filter((p) => (p.discountPercentage ?? 0) > 0);
      case 'boosted':
        return products.filter((p) => p.isBoosted);
      case 'trending':
        return products.filter((p) => p.dailyClickCount >= 10);
      case 'fiveStar':
        return products.filter((p) => p.averageRating === 5);
      case 'bestSellers':
        const sorted = [...products];
        sorted.sort((a, b) => b.purchaseCount - a.purchaseCount);
        return sorted;
      default:
        return products; // 'All' filter or empty filter
    }
  }, []);

  // Apply sorting to the list
  const applySorting = useCallback((products: Product[], sortOpt: SortOption): Product[] => {
    const sorted = [...products];
    switch (sortOpt) {
      case 'Alphabetical':
        sorted.sort((a, b) =>
          a.productName.toLowerCase().localeCompare(b.productName.toLowerCase())
        );
        break;
      case 'Date':
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'Price Low to High':
        sorted.sort((a, b) => a.price - b.price);
        break;
      case 'Price High to Low':
        sorted.sort((a, b) => b.price - a.price);
        break;
      case 'None':
      default:
        break;
    }
    return sorted;
  }, []);

  // Prioritize boosted products
  const prioritizeBoosted = useCallback((products: Product[]): Product[] => {
    const sorted = [...products];
    sorted.sort((a, b) => {
      if (a.isBoosted && !b.isBoosted) return -1;
      if (!a.isBoosted && b.isBoosted) return 1;
      return 0;
    });
    return sorted;
  }, []);

  // Compute filtered products with memoization
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
    setRawProductsState(products);
  }, []);

  // Add more products (for pagination)
  const addMoreProducts = useCallback((products: Product[]) => {
    setRawProductsState(prev => [...prev, ...products]);
  }, []);

  // Clear all products
  const clearProducts = useCallback(() => {
    setRawProductsState([]);
  }, []);

  // Apply a quick filter
  const setFilter = useCallback((filter: FilterType | null) => {
    const newFilter: FilterType = filter || '';
    setCurrentFilterState(newFilter);
  }, []);

  // Set sort option
  const setSortOption = useCallback((sortOpt: SortOption) => {
    setSortOptionState(sortOpt);
  }, []);

  // Get boosted products from filtered list
  const boostedProducts = useMemo(() => {
    return filteredProducts.filter((p) => p.isBoosted);
  }, [filteredProducts]);

  // Check if filtered list is empty
  const isEmpty = filteredProducts.length === 0;

  // Check if raw products are empty
  const hasNoData = rawProducts.length === 0;

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