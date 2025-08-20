"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

// Product interface matching your Flutter model
export interface Product {
  id: string;
  productName: string;
  price: number;
  originalPrice?: number;
  discountPercentage?: number;
  currency: string;
  imageUrls: string[];
  colorImages: Record<string, string[]>;
  description: string;
  brandModel?: string;
  condition: string;
  quantity?: number;
  averageRating: number;
  isBoosted: boolean;
  deliveryOption?: string;
  campaignName?: string;
  dailyClickCount: number;
  purchaseCount: number;
  createdAt: string;
}

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
  
  // Filtered and processed products for UI
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  
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
  const applySorting = useCallback((products: Product[], sortOpt: SortOption): void => {
    switch (sortOpt) {
      case 'Alphabetical':
        products.sort((a, b) =>
          a.productName.toLowerCase().localeCompare(b.productName.toLowerCase())
        );
        break;
      case 'Date':
        products.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case 'Price Low to High':
        products.sort((a, b) => a.price - b.price);
        break;
      case 'Price High to Low':
        products.sort((a, b) => b.price - a.price);
        break;
      case 'None':
      default:
        break;
    }
  }, []);

  // Prioritize boosted products
  const prioritizeBoosted = useCallback((products: Product[]): void => {
    products.sort((a, b) => {
      if (a.isBoosted && !b.isBoosted) return -1;
      if (!a.isBoosted && b.isBoosted) return 1;
      return 0;
    });
  }, []);

  // Apply current filter and sort to raw products
  const applyFiltersAndSort = useCallback(() => {
    // Start with raw products
    let result = [...rawProducts];

    // Apply filter logic
    result = applyFilterLogic(result, currentFilter);

    // Apply sorting
    applySorting(result, sortOption);

    // Prioritize boosted products
    prioritizeBoosted(result);

    // Update filtered products
    setFilteredProducts(result);
  }, [rawProducts, currentFilter, sortOption, applyFilterLogic, applySorting, prioritizeBoosted]);

  // Set the raw products from search API
  const setRawProducts = useCallback((products: Product[]) => {
    setRawProductsState([...products]);
  }, []);

  // Add more products (for pagination)
  const addMoreProducts = useCallback((products: Product[]) => {
    setRawProductsState(prev => [...prev, ...products]);
  }, []);

  // Clear all products
  const clearProducts = useCallback(() => {
    setRawProductsState([]);
    setFilteredProducts([]);
  }, []);

  // Apply a quick filter
  const setFilter = useCallback((filter: FilterType | null) => {
    const newFilter: FilterType = filter || '';
    if (currentFilter === newFilter) return;
    setCurrentFilterState(newFilter);
  }, [currentFilter]);

  // Set sort option
  const setSortOption = useCallback((sortOpt: SortOption) => {
    if (sortOption === sortOpt) return;
    setSortOptionState(sortOpt);
  }, [sortOption]);

  // Apply filters and sort whenever dependencies change
  React.useEffect(() => {
    applyFiltersAndSort();
  }, [applyFiltersAndSort]);

  // Get boosted products from filtered list
  const boostedProducts = React.useMemo(() => {
    return filteredProducts.filter((p) => p.isBoosted);
  }, [filteredProducts]);

  // Check if filtered list is empty
  const isEmpty = filteredProducts.length === 0;

  // Check if raw products are empty
  const hasNoData = rawProducts.length === 0;

  const value: SearchResultsContextType = {
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
  };

  return (
    <SearchResultsContext.Provider value={value}>
      {children}
    </SearchResultsContext.Provider>
  );
}