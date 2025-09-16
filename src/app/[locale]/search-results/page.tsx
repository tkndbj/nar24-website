"use client";

import AlgoliaServiceManager from "@/lib/algolia";
import React, { useState, useEffect, useCallback, useRef } from "react";
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
} from "@/context/SearchResultsProvider";

import { Product, ProductUtils } from "@/app/models/Product";

// Import the Algolia Product type and create a converter function
import { Product as AlgoliaProduct } from "@/lib/algolia";

// Converter function from Algolia Product to Model Product
const convertAlgoliaProduct = (algoliaProduct: AlgoliaProduct): Product => {
  return {
    id: algoliaProduct.id,
    sourceCollection: algoliaProduct.collection,
    productName: algoliaProduct.productName,
    description: algoliaProduct.description,
    price: algoliaProduct.price,
    currency: algoliaProduct.currency,
    condition: algoliaProduct.condition,
    brandModel: algoliaProduct.brandModel,
    imageUrls: algoliaProduct.imageUrls,
    averageRating: algoliaProduct.averageRating,
    reviewCount: algoliaProduct.reviewCount || 0,
    originalPrice: algoliaProduct.originalPrice,
    discountPercentage: algoliaProduct.discountPercentage,
    colorQuantities: {},
    boostClickCountAtStart: 0,
    availableColors: [],
    gender: undefined,
    bundleIds: [],
    bundlePrice: undefined,
    userId: algoliaProduct.userId || '',
    discountThreshold: undefined,
    rankingScore: algoliaProduct.rankingScore || 0,
    promotionScore: 0,
    campaign: undefined,
    campaignDiscount: undefined,
    campaignPrice: undefined,
    ownerId: algoliaProduct.userId || '',
    shopId: algoliaProduct.shopId,
    ilanNo: algoliaProduct.id,
    searchIndex: [],
    createdAt: algoliaProduct.createdAt ? new Date(algoliaProduct.createdAt) : new Date(),
    sellerName: algoliaProduct.sellerName || 'Unknown',
    category: algoliaProduct.category || 'Uncategorized',
    subcategory: algoliaProduct.subcategory || '',
    subsubcategory: algoliaProduct.subsubcategory || '',
    quantity: algoliaProduct.quantity || 0,
    bestSellerRank: undefined,
    sold: false,
    clickCount: algoliaProduct.clickCount || 0,
    clickCountAtStart: 0,
    favoritesCount: 0,
    cartCount: 0,
    purchaseCount: algoliaProduct.purchaseCount,
    deliveryOption: algoliaProduct.deliveryOption || 'Self Delivery',
    boostedImpressionCount: 0,
    boostImpressionCountAtStart: 0,
    isFeatured: false,
    isTrending: false,
    isBoosted: algoliaProduct.isBoosted,
    boostStartTime: undefined,
    boostEndTime: undefined,
    dailyClickCount: algoliaProduct.dailyClickCount,
    lastClickDate: undefined,
    paused: false,
    campaignName: algoliaProduct.campaignName,
    colorImages: algoliaProduct.colorImages,
    videoUrl: undefined,
    attributes: {},
    reference: undefined,
  };
};


// Enhanced utility functions
const throttle = <T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): T => {
  let inThrottle: boolean;
  return ((...args: Parameters<T>) => {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  }) as T;
};

// Loading shimmer component
const LoadingShimmer: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const shimmerClass = isDarkMode
    ? "bg-gray-700 animate-pulse"
    : "bg-gray-300 animate-pulse";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="space-y-3">
          <div
            className={`aspect-[3/4] lg:aspect-[3/5] rounded-lg ${shimmerClass}`}
          />
          <div className={`h-4 w-3/4 rounded ${shimmerClass}`} />
          <div className={`h-3 w-1/2 rounded ${shimmerClass}`} />
          <div className={`h-4 w-2/3 rounded ${shimmerClass}`} />
        </div>
      ))}
    </div>
  );
};

// Enhanced Error state component
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
            className={`mx-auto ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          />
        ) : (
          <AlertCircle
            size={80}
            className={`mx-auto ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          />
        )}
        <div className="space-y-3">
          <h3
            className={`text-xl font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {isNetworkError
              ? t("noInternet") || "Connection Error"
              : t("searchFailedTryAgain") || "Search Failed"}
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

// Enhanced Empty state component
const EmptyState: React.FC<{ isDarkMode: boolean; query: string }> = ({
  isDarkMode,
  query,
}) => {
  const t = useTranslations("searchResults");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="text-center space-y-6 max-w-md">
        <div
          className={`w-32 h-32 mx-auto ${
            isDarkMode ? "text-gray-400" : "text-gray-500"
          }`}
        >
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
            We couldn&apos;t find any products matching &quot;{query}&quot;. Try
            adjusting your search terms or removing filters.
          </p>
        </div>
      </div>
    </div>
  );
};

// Enhanced Filter bar component
const FilterBar: React.FC<{
  filterTypes: FilterType[];
  currentFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
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
    <div className="flex-1 min-w-0">
      {" "}
      {/* Added min-w-0 to allow shrinking */}
      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto scrollbar-hide pb-1" // Added pb-1 for better touch scrolling
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          // Ensure the container doesn't expand beyond its parent
          maxWidth: "100%",
        }}
      >
        {filterTypes.map((key) => {
          const isSelected = key === currentFilter;
          const label = localizedFilterLabel(key);

          return (
            <button
              key={key}
              onClick={() => onFilterChange(key)}
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

// Enhanced Sort menu component
const SortMenu: React.FC<{
  sortOptions: SortOption[];
  currentSort: SortOption;
  onSortChange: (sort: SortOption) => void;
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}> = ({
  sortOptions,
  currentSort,
  onSortChange,
  isOpen,
  onClose,
  isDarkMode,
}) => {
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
      <div className="fixed inset-0 z-40" onClick={onClose} />

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

// Main search results content component - Enhanced
const SearchResultsContent: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("searchResults");
  const {
    filteredProducts,
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

  // Enhanced State Management
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isNetworkError, setIsNetworkError] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  // Constants - Match Flutter exactly
  const filterTypes: FilterType[] = [
    "",
    "deals",
    "boosted",
    "trending",
    "fiveStar",
    "bestSellers",
  ];
  const sortOptions: SortOption[] = [
    "None",
    "Alphabetical",
    "Date",
    "Price Low to High",
    "Price High to Low",
  ];

  const query = searchParams.get("q") || "";
  const algoliaManager = AlgoliaServiceManager.getInstance();

  // Enhanced Refs for better scroll management
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const fetchInitialCompleteRef = useRef(false);
  const lastQueryRef = useRef<string>("");

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

  // Enhanced connectivity check
  const checkConnectivity = useCallback((): boolean => {
    return navigator.onLine;
  }, []);

  // Enhanced fetch results function that mirrors Flutter's searchOnly method
  const fetchResults = useCallback(
    async (reset: boolean = false) => {
      if (!query.trim()) {
        console.log("❌ Empty query, skipping search");
        return;
      }

      if (isLoading && !reset) {
        console.log("⏳ Already loading, skipping duplicate request");
        return;
      }

      console.log(
        `🔍 Fetching results for "${query}", reset: ${reset}, page: ${
          reset ? 0 : currentPage
        }`
      );

      // Connectivity check
      if (!checkConnectivity()) {
        console.log("❌ No internet connection");
        setIsNetworkError(true);
        setErrorMessage(
          t("noInternet") ||
            "No internet connection. Please check your network and try again."
        );
        setHasError(true);
        return;
      }

      if (reset) {
        console.log("🧹 Resetting search state");
        clearProducts();
        setCurrentPage(0);
        setHasMore(true);
        setHasError(false);
        setIsNetworkError(false);
        setIsLoading(true);
        fetchInitialCompleteRef.current = false;
        lastQueryRef.current = query;
      } else {
        setIsLoadingMore(true);
      }

      try {
        const pageToFetch = reset ? 0 : currentPage;

        // Enhanced search strategy matching Flutter's dual-index approach
        console.log(
          `🔍 Starting enhanced search for "${query}" page ${pageToFetch}`
        );

        // Search with current filter applied server-side when possible
        const serverSideFilterType = currentFilter || undefined;

        // Try products index first with enhanced error handling
        let results: Product[] = [];
        try {
          console.log(
            `🔍 Searching products index with filter: ${serverSideFilterType}`
          );
          const algoliaResults = await algoliaManager.searchProducts(
            query,
            pageToFetch,
            50,
            "products",
            serverSideFilterType,
            sortOption === "None" ? "None" : sortOption
          );
          results = algoliaResults.map(convertAlgoliaProduct);
          console.log(`✅ Products index returned ${results.length} results`);
        } catch (productError) {
          console.warn("❌ Products index failed:", productError);

          // Fallback to shop_products index
          try {
            console.log(`🔍 Fallback: Searching shop_products index`);
            const algoliaResults = await algoliaManager.searchProducts(
              query,
              pageToFetch,
              50,
              "shop_products",
              serverSideFilterType,
              sortOption === "None" ? "None" : sortOption
            );
            results = algoliaResults.map(convertAlgoliaProduct);
            console.log(
              `✅ Shop_products index returned ${results.length} results`
            );
          } catch (shopError) {
            console.error("❌ Both indexes failed:", {
              productError,
              shopError,
            });
            throw new Error("All search indexes failed");
          }
        }

        if (reset) {
          console.log(`📝 Setting ${results.length} raw products (reset)`);
          setRawProducts(results);
          fetchInitialCompleteRef.current = true;

          // Scroll to top on reset
          if (mainScrollRef.current) {
            mainScrollRef.current.scrollTo({ top: 0, behavior: "auto" });
          }
        } else {
          console.log(`➕ Adding ${results.length} more products (pagination)`);
          addMoreProducts(results);
          setCurrentPage(pageToFetch + 1);
        }

        setHasMore(results.length === 50);
        setHasError(false);
        setIsNetworkError(false);

        // Track boosted impressions (analytics placeholder)
        const boostedIds = results.filter((p) => p.isBoosted).map((p) => p.id);
        if (boostedIds.length > 0) {
          console.log(
            `📊 Tracking ${boostedIds.length} boosted product impressions`
          );
          // TODO: Implement analytics tracking similar to Flutter's incrementImpressionCount
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "Request cancelled") {
          console.log("⏹️ Request cancelled, not showing error");
          return;
        }

        console.error("❌ Search error:", error);
        const errorMsg =
          error instanceof Error ? error.message : "Search failed";
        const isNetworkIssue =
          errorMsg.toLowerCase().includes("failed to fetch") ||
          errorMsg.toLowerCase().includes("network") ||
          !navigator.onLine;

        setErrorMessage(
          isNetworkIssue
            ? t("noInternet") ||
                "Connection failed. Please check your internet and try again."
            : t("searchFailedTryAgain") || "Search failed. Please try again."
        );
        setIsNetworkError(isNetworkIssue);
        setHasError(true);

        if (reset) {
          console.log("❌ Initial search failed, showing error state");
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [
      query,
      isLoading,
      currentPage,
      currentFilter,
      sortOption,
      checkConnectivity,
      t,
      algoliaManager,
      clearProducts,
      setRawProducts,
      addMoreProducts,
    ]
  );

  // Enhanced load more with debouncing
  const loadMoreIfNeeded = useCallback(() => {
    if (
      !hasMore ||
      isLoading ||
      isLoadingMore ||
      !fetchInitialCompleteRef.current
    ) {
      return;
    }

    console.log("📄 Loading more results...");

    if (loadMoreDebounceRef.current) {
      clearTimeout(loadMoreDebounceRef.current);
    }

    loadMoreDebounceRef.current = setTimeout(() => {
      fetchResults(false);
    }, 300);
  }, [hasMore, isLoading, isLoadingMore, fetchResults]);

  // Enhanced initial fetch with query change detection
  useEffect(() => {
    if (query.trim() && query !== lastQueryRef.current) {
      console.log(
        `🔄 Query changed from "${lastQueryRef.current}" to "${query}"`
      );
      fetchResults(true);
    }

    return () => {
      // Enhanced cleanup
      if (loadMoreDebounceRef.current) {
        clearTimeout(loadMoreDebounceRef.current);
      }
    };
  }, [query, fetchResults]);

  // Enhanced filter change handler
  const handleFilterChange = useCallback(
    (filter: FilterType) => {
      if (filter === currentFilter) return;

      console.log(`🎯 Filter changed from "${currentFilter}" to "${filter}"`);
      setFilter(filter);

      // Reset pagination when filter changes to get fresh server-side filtered results
      setCurrentPage(0);
      setHasMore(true);

      // Fetch new results with the filter applied server-side when possible
      if (query.trim()) {
        fetchResults(true);
      }
    },
    [currentFilter, setFilter, query, fetchResults]
  );

  // Enhanced sort change handler
  const handleSortChange = useCallback(
    (sort: SortOption) => {
      if (sort === sortOption) return;

      console.log(`📊 Sort changed from "${sortOption}" to "${sort}"`);
      setSortOption(sort);

      // Reset and fetch with new sort option
      if (query.trim()) {
        setCurrentPage(0);
        setHasMore(true);
        fetchResults(true);
      }
    },
    [sortOption, setSortOption, query, fetchResults]
  );

  // Handle product navigation
  const handleProductTap = useCallback(
    (product: Product) => {
      console.log(`👆 Product tapped: ${product.productName} (${product.id})`);
      router.push(`/productdetail/${product.id}`);
    },
    [router]
  );

  // Enhanced infinite scroll with throttling
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

  // Enhanced sort menu click outside handler
  useEffect(() => {
    const handleClickOutside = () => {
      setIsSortMenuOpen(false);
    };

    if (isSortMenuOpen) {
      setTimeout(() => {
        document.addEventListener("click", handleClickOutside);
      }, 10);

      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [isSortMenuOpen]);

  // Render loading state
  if (isLoading && hasNoData) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4 px-4 py-3">
          <button
            onClick={() => router.back()}
            className={`flex-shrink-0 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            <ChevronLeft size={20} />
          </button>

          <FilterBar
            filterTypes={filterTypes}
            currentFilter={currentFilter}
            onFilterChange={handleFilterChange}
            isDarkMode={isDarkMode}
          />

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

        {query && (
          <div className="px-4">
            <p
              className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {t("searchingFor") || "Searching for"} &quot;{query}&quot;
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
        <div className="flex items-center gap-4 px-4 py-3">
          <button
            onClick={() => router.back()}
            className={`flex-shrink-0 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            <ChevronLeft size={20} />
          </button>

          <FilterBar
            filterTypes={filterTypes}
            currentFilter={currentFilter}
            onFilterChange={handleFilterChange}
            isDarkMode={isDarkMode}
          />

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
          onRetry={() => fetchResults(true)}
          message={errorMessage}
          isNetworkError={isNetworkError}
          isDarkMode={isDarkMode}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" ref={mainScrollRef}>
      {/* Enhanced Header */}
      <div className="flex items-center gap-4 px-4 py-3">
        <button
          onClick={() => router.back()}
          className={`flex-shrink-0 ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          <ChevronLeft size={20} />
        </button>

        <FilterBar
          filterTypes={filterTypes}
          currentFilter={currentFilter}
          onFilterChange={handleFilterChange}
          isDarkMode={isDarkMode}
        />

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

      {/* Enhanced Query display */}
      {query && (
        <div className="px-4">
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {t("searchingFor") || "Searching for"} &quot;{query}&quot;
            {filteredProducts.length > 0 && (
              <span className="ml-2 font-medium">
                ({filteredProducts.length}{" "}
                {filteredProducts.length === 1 ? "result" : "results"})
              </span>
            )}
          </p>
        </div>
      )}

      {/* Enhanced Empty state */}
      {isEmpty && !isLoading && fetchInitialCompleteRef.current && (
        <EmptyState isDarkMode={isDarkMode} query={query} />
      )}

      {/* Enhanced Products Grid */}
      {!isEmpty && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4">
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

      {/* Enhanced Loading more indicator */}
      {isLoadingMore && (
        <div className="flex justify-center py-8">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
            <span
              className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Loading more products...
            </span>
          </div>
        </div>
      )}

      {/* Enhanced Load more button (fallback) */}
      {!isLoadingMore &&
        hasMore &&
        !isEmpty &&
        fetchInitialCompleteRef.current && (
          <div className="flex justify-center py-8">
            <button
              onClick={() => loadMoreIfNeeded()}
              className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              {t("loadMore") || "Load More"}
            </button>
          </div>
        )}

      {/* End of results indicator */}
      {!hasMore && !isEmpty && fetchInitialCompleteRef.current && (
        <div className="flex justify-center py-8">
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            You&apos;ve reached the end of the results
          </p>
        </div>
      )}
    </div>
  );
};

// Main page component with enhanced provider wrapper
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
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      >
        <div className="pb-8">
          <div className="max-w-6xl mx-auto">
            <SearchResultsContent />
          </div>
        </div>
      </div>
    </SearchResultsProvider>
  );
}
