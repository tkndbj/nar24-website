"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  SortAsc,
  AlertCircle,
  RefreshCw,
  WifiOff,
  Search,
} from "lucide-react";
import { ProductCard } from "@/app/components/ProductCard";
import {
  SearchResultsProvider,
  useSearchResultsProvider,
  FilterType,
  SortOption,
  Product,
} from "@/context/SearchResultsProvider";

// Algolia hit response interface
interface AlgoliaHit {
  objectID?: string;
  productName?: string;
  price?: string | number;
  originalPrice?: string | number;
  discountPercentage?: string | number;
  currency?: string;
  imageUrls?: string[];
  colorImages?: Record<string, unknown>;
  description?: string;
  brandModel?: string;
  condition?: string;
  quantity?: string | number;
  averageRating?: string | number;
  isBoosted?: boolean;
  deliveryOption?: string;
  campaignName?: string;
  dailyClickCount?: string | number;
  purchaseCount?: string | number;
  createdAt?: string;
}

// Enhanced Algolia Service Manager with production optimizations
class AlgoliaServiceManager {
  private static instance: AlgoliaServiceManager;
  private readonly applicationId = "3QVVGQH4ME";
  private readonly apiKey = "dcca6685e21c2baed748ccea7a6ddef1";
  private cache = new Map<string, { data: Product[]; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private abortController: AbortController | null = null;

  static getInstance() {
    if (!AlgoliaServiceManager.instance) {
      AlgoliaServiceManager.instance = new AlgoliaServiceManager();
    }
    return AlgoliaServiceManager.instance;
  }

  private getCacheKey(query: string, page: number, hitsPerPage: number): string {
    return `${query}-${page}-${hitsPerPage}`;
  }

  private isValidCache(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  async searchProducts(
    query: string,
    page: number = 0,
    hitsPerPage: number = 50,
    indexName: string = "products"
  ): Promise<Product[]> {
    // Cancel previous request
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    const cacheKey = this.getCacheKey(query, page, hitsPerPage);
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isValidCache(cached.timestamp)) {
      console.log(`🎯 Cache hit for: ${cacheKey}`);
      return cached.data;
    }

    const url = `https://${this.applicationId}-dsn.algolia.net/1/indexes/${indexName}/query`;

    const params = new URLSearchParams({
      query,
      page: page.toString(),
      hitsPerPage: hitsPerPage.toString(),
      attributesToRetrieve: [
        "objectID",
        "productName", 
        "price",
        "originalPrice",
        "discountPercentage",
        "currency",
        "imageUrls",
        "colorImages",
        "description",
        "brandModel",
        "condition",
        "quantity",
        "averageRating",
        "isBoosted",
        "deliveryOption",
        "campaignName",
        "dailyClickCount",
        "purchaseCount",
        "createdAt"
      ].join(","),
      attributesToHighlight: "",
    });

    try {
      console.log(`🔍 Searching ${indexName} for: "${query}" (page ${page})`);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-Algolia-Application-Id": this.applicationId,
          "X-Algolia-API-Key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ params: params.toString() }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Algolia request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const hits = data.hits || [];

      const products: Product[] = hits.map((hit: AlgoliaHit) => ({
        id: hit.objectID || `unknown-${Math.random().toString(36).substr(2, 9)}`,
        productName: hit.productName || "Unknown Product",
        price: hit.price ? (typeof hit.price === 'string' ? parseFloat(hit.price) : hit.price) || 0 : 0,
        originalPrice: hit.originalPrice ? (typeof hit.originalPrice === 'string' ? parseFloat(hit.originalPrice) : hit.originalPrice) : undefined,
        discountPercentage: hit.discountPercentage ? (typeof hit.discountPercentage === 'string' ? parseFloat(hit.discountPercentage) : hit.discountPercentage) || 0 : 0,
        currency: hit.currency || "TL",
        imageUrls: Array.isArray(hit.imageUrls) ? hit.imageUrls : [],
        colorImages: hit.colorImages || {},
        description: hit.description || "",
        brandModel: hit.brandModel,
        condition: hit.condition || "new",
        quantity: hit.quantity ? (typeof hit.quantity === 'string' ? parseInt(hit.quantity) : hit.quantity) : undefined,
        averageRating: hit.averageRating ? (typeof hit.averageRating === 'string' ? parseFloat(hit.averageRating) : hit.averageRating) || 0 : 0,
        isBoosted: Boolean(hit.isBoosted),
        deliveryOption: hit.deliveryOption,
        campaignName: hit.campaignName,
        dailyClickCount: hit.dailyClickCount ? (typeof hit.dailyClickCount === 'string' ? parseInt(hit.dailyClickCount) : hit.dailyClickCount) || 0 : 0,
        purchaseCount: hit.purchaseCount ? (typeof hit.purchaseCount === 'string' ? parseInt(hit.purchaseCount) : hit.purchaseCount) || 0 : 0,
        createdAt: hit.createdAt || new Date().toISOString(),
      }));

      // Cache the result
      this.cache.set(cacheKey, { data: products, timestamp: Date.now() });
      
      // Clean old cache entries
      this.cleanOldCache();

      console.log(`✅ Found ${products.length} products`);
      return products;

    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('🚫 Search request aborted');
        throw new Error('Request cancelled');
      }
      console.error(`❌ Algolia search error for "${query}":`, error);
      throw error;
    }
  }

  private cleanOldCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (!this.isValidCache(value.timestamp)) {
        this.cache.delete(key);
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  cancelRequests(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}

// Utility functions
const throttle = <T extends (...args: unknown[]) => unknown>(func: T, limit: number): T => {
  let inThrottle: boolean;
  return ((...args: Parameters<T>) => {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  }) as T;
};

const debounce = <T extends (...args: unknown[]) => unknown>(func: T, delay: number): T => {
  let timeoutId: NodeJS.Timeout;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  }) as T;
};

// Loading shimmer component
const LoadingShimmer: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const shimmerClass = isDarkMode
    ? "bg-gray-700 animate-pulse"
    : "bg-gray-300 animate-pulse";

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="space-y-3">
          <div className={`aspect-[3/4] rounded-lg ${shimmerClass}`} />
          <div className={`h-4 w-3/4 rounded ${shimmerClass}`} />
          <div className={`h-3 w-1/2 rounded ${shimmerClass}`} />
          <div className={`h-4 w-2/3 rounded ${shimmerClass}`} />
        </div>
      ))}
    </div>
  );
};

// Error state component
const ErrorState: React.FC<{
  onRetry: () => void;
  message: string;
  isNetworkError: boolean;
  isDarkMode: boolean;
}> = ({ onRetry, message, isNetworkError, isDarkMode }) => {
  const t = useTranslations("searchResults");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="text-center space-y-6 max-w-md">
        {isNetworkError ? (
          <WifiOff
            size={80}
            className={`mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          />
        ) : (
          <AlertCircle
            size={80}
            className={`mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          />
        )}
        <div className="space-y-3">
          <h3
            className={`text-xl font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {isNetworkError ? (t("noInternet") || "Connection Error") : (t("searchFailedTryAgain") || "Search Failed")}
          </h3>
          <p
            className={`text-sm leading-relaxed ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {message}
          </p>
        </div>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
        >
          <RefreshCw size={16} />
          {t("retry") || "Retry"}
        </button>
      </div>
    </div>
  );
};

// Empty state component with fallback SVG
const EmptyState: React.FC<{ isDarkMode: boolean; query: string }> = ({
  isDarkMode,
  query,
}) => {
  const t = useTranslations("searchResults");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="text-center space-y-6 max-w-md">
        {/* Fallback SVG icon instead of image */}
        <div className={`w-32 h-32 mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
          <Search size={128} strokeWidth={1} />
        </div>
        <div className="space-y-3">
          <h3
            className={`text-xl font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("noProductsFound") || "No Products Found"}
          </h3>
          <p
            className={`text-sm leading-relaxed ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            We couldn't find any products matching "{query}". Try adjusting your search terms.
          </p>
        </div>
      </div>
    </div>
  );
};

// Filter bar component
const FilterBar: React.FC<{
  filterTypes: FilterType[];
  currentFilter: FilterType;
  onFilterChange: (filter: FilterType, index: number) => void;
  isDarkMode: boolean;
}> = ({ filterTypes, currentFilter, onFilterChange, isDarkMode }) => {
  const t = useTranslations("searchResults");
  const scrollRef = useRef<HTMLDivElement>(null);

  const localizedFilterLabel = (key: FilterType): string => {
    switch (key) {
      case "deals":
        return t("deals") || "Deals";
      case "boosted":
        return t("boosted") || "Featured";
      case "trending":
        return t("trending") || "Trending";
      case "fiveStar":
        return t("fiveStar") || "5 Stars";
      case "bestSellers":
        return t("bestSellers") || "Best Sellers";
      default:
        return t("all") || "All";
    }
  };

  return (
    <div className="flex-1">
      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {filterTypes.map((key, index) => {
          const isSelected = key === currentFilter;
          const label = localizedFilterLabel(key);

          return (
            <button
              key={key}
              onClick={() => onFilterChange(key, index)}
              className={`
                flex-shrink-0 px-3 py-1 rounded-full border text-xs font-semibold transition-all duration-200 whitespace-nowrap
                ${
                  isSelected
                    ? "bg-orange-500 text-white border-orange-500"
                    : isDarkMode
                    ? "bg-transparent text-white border-gray-600 hover:border-gray-500"
                    : "bg-transparent text-black border-gray-300 hover:border-gray-400"
                }
              `}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Sort menu component - SINGLE IMPLEMENTATION
const SortMenu: React.FC<{
  sortOptions: SortOption[];
  currentSort: SortOption;
  onSortChange: (sort: SortOption) => void;
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}> = ({ sortOptions, currentSort, onSortChange, isOpen, onClose, isDarkMode }) => {
  const t = useTranslations("searchResults");

  const localizedSortLabel = (opt: SortOption): string => {
    switch (opt) {
      case "None":
        return t("none") || "Relevance";
      case "Alphabetical":
        return t("alphabetical") || "A-Z";
      case "Date":
        return t("date") || "Newest";
      case "Price Low to High":
        return t("priceLowToHigh") || "Price: Low to High";
      case "Price High to Low":
        return t("priceHighToLow") || "Price: High to Low";
      default:
        return opt;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Invisible backdrop for click detection - NO BLACK OVERLAY */}
      <div 
        className="fixed inset-0 z-40" 
        onClick={onClose} 
      />
      
      {/* Menu dropdown positioned relative to button */}
      <div
        className={`
          absolute top-full right-0 mt-2 w-56 z-50 rounded-xl shadow-xl border overflow-hidden
          ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }
        `}
      >
        <div className="py-2">
          <div
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            {t("sortBy") || "Sort by"}
          </div>
          {sortOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => {
                onSortChange(opt);
                onClose();
              }}
              className={`
                w-full px-4 py-3 text-left text-sm transition-colors font-medium
                ${
                  currentSort === opt
                    ? "bg-orange-500 text-white"
                    : isDarkMode
                    ? "text-gray-200 hover:bg-gray-700"
                    : "text-gray-700 hover:bg-gray-50"
                }
              `}
            >
              {localizedSortLabel(opt)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

// Main search results content component
const SearchResultsContent: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("searchResults");
  const {
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
  } = useSearchResultsProvider();

  // State
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  // Constants
  const filterTypes: FilterType[] = ["", "deals", "boosted", "trending", "fiveStar", "bestSellers"];
  const sortOptions: SortOption[] = ["None", "Alphabetical", "Date", "Price Low to High", "Price High to Low"];
  
  const query = searchParams.get("q") || "";
  const algoliaManager = useMemo(() => AlgoliaServiceManager.getInstance(), []);

  // Refs for scroll management
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const fetchInitialCompleteRef = useRef(false);

  // Theme detection
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => observer.disconnect();
  }, []);

  // Connectivity check
  const checkConnectivity = useCallback((): boolean => {
    return navigator.onLine;
  }, []);

  // Fetch search results with enhanced error handling
  const fetchResults = useCallback(
    async (reset: boolean = false) => {
      if (!query.trim()) return;
      if (isLoading && !reset) return;

      // Connectivity check
      if (!checkConnectivity()) {
        setIsNetworkError(true);
        setErrorMessage(t("noInternet") || "No internet connection. Please check your network and try again.");
        setHasError(true);
        return;
      }

      if (reset) {
        clearProducts();
        setCurrentPage(0);
        setHasMore(true);
        setHasError(false);
        setIsNetworkError(false);
        setIsLoading(true);
        fetchInitialCompleteRef.current = false;
      } else {
        setIsLoadingMore(true);
      }

      try {
        const pageToFetch = reset ? 0 : currentPage;
        
        // Try products index first, then shop_products as fallback
        let results: Product[] = [];
        try {
          results = await algoliaManager.searchProducts(query, pageToFetch, 50, "products");
        } catch (error) {
          console.log("Products index failed, trying shop_products...");
          results = await algoliaManager.searchProducts(query, pageToFetch, 50, "shop_products");
        }

        if (reset) {
          setRawProducts(results);
          fetchInitialCompleteRef.current = true;
          // Scroll to top on reset
          if (mainScrollRef.current) {
            mainScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
          }
        } else {
          addMoreProducts(results);
          setCurrentPage(pageToFetch + 1);
        }

        setHasMore(results.length === 50);
        setHasError(false);
        setIsNetworkError(false);

        // Track boosted impressions (analytics placeholder)
        const boostedIds = results.filter(p => p.isBoosted).map(p => p.id);
        if (boostedIds.length > 0) {
          console.log(`📊 Tracking ${boostedIds.length} boosted product impressions`);
        }

      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Request cancelled') {
          return; // Don't show error for cancelled requests
        }
        
        console.error("Search error:", error);
        const errorMsg = error instanceof Error ? error.message : "Search failed";
        const isNetworkIssue = errorMsg.toLowerCase().includes("failed to fetch") || !navigator.onLine;
        
        setErrorMessage(
          isNetworkIssue 
            ? (t("noInternet") || "Connection failed. Please check your internet and try again.")
            : (t("searchFailedTryAgain") || "Search failed. Please try again.")
        );
        setIsNetworkError(isNetworkIssue);
        setHasError(true);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [query, isLoading, currentPage, checkConnectivity, t, algoliaManager, clearProducts, setRawProducts, addMoreProducts]
  );

  // Load more with debouncing
  const loadMoreIfNeeded = useCallback(() => {
    if (!hasMore || isLoading || isLoadingMore || !fetchInitialCompleteRef.current) return;
    
    if (loadMoreDebounceRef.current) {
      clearTimeout(loadMoreDebounceRef.current);
    }

    loadMoreDebounceRef.current = setTimeout(() => {
      fetchResults(false);
    }, 300);
  }, [hasMore, isLoading, isLoadingMore, fetchResults]);

  // Reset and fetch
  const resetAndFetch = useCallback(() => {
    fetchResults(true);
  }, [fetchResults]);

  // Initial fetch only when query changes
  useEffect(() => {
    if (query.trim()) {
      resetAndFetch();
    }
    
    return () => {
      // Cleanup on unmount or query change
      algoliaManager.cancelRequests();
      if (loadMoreDebounceRef.current) {
        clearTimeout(loadMoreDebounceRef.current);
      }
    };
  }, [query]); // Only depend on query, not resetAndFetch to avoid loops

  // Handle filter change
  const handleFilterChange = useCallback((filter: FilterType, index: number) => {
    if (filter === currentFilter) return;
    setFilter(filter);    
  }, [currentFilter, setFilter]);

  // Handle sort change
  const handleSortChange = useCallback((sort: SortOption) => {
    setSortOption(sort);
  }, [setSortOption]);

  // Handle product navigation
  const handleProductTap = useCallback((product: Product) => {
    router.push(`/productdetail/${product.id}`);
  }, [router]);

  // Infinite scroll with throttling
  useEffect(() => {
    const handleScroll = throttle(() => {
      if (
        window.innerHeight + document.documentElement.scrollTop >=
        document.documentElement.offsetHeight - 1000
      ) {
        loadMoreIfNeeded();
      }
    }, 200);

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loadMoreIfNeeded]);

  // Close sort menu on outside click - SIMPLIFIED
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close the menu when clicking outside
      setIsSortMenuOpen(false);
    };

    if (isSortMenuOpen) {
      // Add a small delay to prevent immediate closing
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 10);
      
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isSortMenuOpen]);

  // Render loading state
  if (isLoading && hasNoData) {
    return (
      <div className="space-y-4">
        {/* Header with back button, filters, and sort */}
        <div className="flex items-center gap-4 px-4 py-3">
          {/* Back button */}
          <button
            onClick={() => router.back()}
            className={`flex-shrink-0 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            <ChevronLeft size={20} />
          </button>

          {/* Filter Bar */}
          <FilterBar
            filterTypes={filterTypes}
            currentFilter={currentFilter}
            onFilterChange={handleFilterChange}
            isDarkMode={isDarkMode}
          />

          {/* Sort button */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsSortMenuOpen(!isSortMenuOpen);
              }}
              className={`flex-shrink-0 p-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              <SortAsc size={20} />
            </button>
          </div>
        </div>

        {/* Query display */}
        {query && (
          <div className="px-4">
            <p
              className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {t("searchingFor") || "Searching for"} "{query}"
            </p>
          </div>
        )}

        <LoadingShimmer isDarkMode={isDarkMode} />
      </div>
    );
  }

  // Render error state
  if (hasError) {
    return (
      <div className="space-y-4">
        {/* Header with back button, filters, and sort */}
        <div className="flex items-center gap-4 px-4 py-3">
          {/* Back button */}
          <button
            onClick={() => router.back()}
            className={`flex-shrink-0 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            <ChevronLeft size={20} />
          </button>

          {/* Filter Bar */}
          <FilterBar
            filterTypes={filterTypes}
            currentFilter={currentFilter}
            onFilterChange={handleFilterChange}
            isDarkMode={isDarkMode}
          />

          {/* Sort button */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsSortMenuOpen(!isSortMenuOpen);
              }}
              className={`flex-shrink-0 p-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              <SortAsc size={20} />
            </button>
          </div>
        </div>

        <ErrorState
          onRetry={resetAndFetch}
          message={errorMessage}
          isNetworkError={isNetworkError}
          isDarkMode={isDarkMode}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" ref={mainScrollRef}>
      {/* Header with back button, filters, and sort */}
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className={`flex-shrink-0 ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          <ChevronLeft size={20} />
        </button>

        {/* Filter Bar */}
        <FilterBar
          filterTypes={filterTypes}
          currentFilter={currentFilter}
          onFilterChange={handleFilterChange}
          isDarkMode={isDarkMode}
        />

        {/* Sort button */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsSortMenuOpen(!isSortMenuOpen);
            }}
            className={`flex-shrink-0 p-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            <SortAsc size={20} />
          </button>
          
          {/* Sort Menu positioned relative to this button */}
          <SortMenu
            sortOptions={sortOptions}
            currentSort={sortOption}
            onSortChange={handleSortChange}
            isOpen={isSortMenuOpen}
            onClose={() => setIsSortMenuOpen(false)}
            isDarkMode={isDarkMode}
          />
        </div>
      </div>

      {/* Query display */}
      {query && (
        <div className="px-4">
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {t("searchingFor") || "Searching for"} "{query}"
          </p>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && !isLoading && fetchInitialCompleteRef.current && (
        <EmptyState isDarkMode={isDarkMode} query={query} />
      )}

      {/* Products Grid */}
      {!isEmpty && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-4">
          {filteredProducts.map((product, index) => (
            <ProductCard
              key={`${product.id}-${index}`}
              product={product}
              onTap={() => handleProductTap(product)}
              showCartIcon={true}
              showExtraLabels={false}
            />
          ))}
        </div>
      )}

      {/* Loading more indicator */}
      {isLoadingMore && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
        </div>
      )}

      {/* Load more button (fallback) */}
      {!isLoadingMore && hasMore && !isEmpty && fetchInitialCompleteRef.current && (
        <div className="flex justify-center py-8">
          <button
            onClick={() => loadMoreIfNeeded()}
            className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            {t("loadMore") || "Load More"}
          </button>
        </div>
      )}

      {/* SINGLE Sort Menu Implementation - REMOVED FROM HERE */}
    </div>
  );
};

// Main page component - SINGLE SearchResultsProvider wrapper
export default function SearchResultsPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Theme detection
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => observer.disconnect();
  }, []);

  return (
    <SearchResultsProvider>
      <div
        className={`min-h-screen ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        {/* Content */}
        <div className="pb-8">
          {/* Container with max width for desktop */}
          <div className="max-w-6xl mx-auto">
            <SearchResultsContent />
          </div>
        </div>
      </div>
    </SearchResultsProvider>
  );
}