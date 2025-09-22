"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Filter,
  SortAsc,
  X,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { ProductCard } from "@/app/components/ProductCard";
import { Product } from "@/app/models/Product";
import { useTranslations } from "next-intl";
import { AllInOneCategoryData } from "@/constants/productData";
import { globalBrands } from "@/constants/brands";

interface FilterState {
  subcategories: string[];
  colors: string[];
  brands: string[];
  minPrice?: number;
  maxPrice?: number;
}

const availableColors = [
  { name: "Blue", color: "#2196F3" },
  { name: "Orange", color: "#FF9800" },
  { name: "Yellow", color: "#FFEB3B" },
  { name: "Black", color: "#000000" },
  { name: "Brown", color: "#795548" },
  { name: "Dark Blue", color: "#00008B" },
  { name: "Gray", color: "#9E9E9E" },
  { name: "Pink", color: "#E91E63" },
  { name: "Red", color: "#F44336" },
  { name: "White", color: "#FFFFFF" },
  { name: "Green", color: "#4CAF50" },
  { name: "Purple", color: "#9C27B0" },
  { name: "Teal", color: "#009688" },
  { name: "Lime", color: "#CDDC39" },
  { name: "Cyan", color: "#00BCD4" },
  { name: "Magenta", color: "#FF00FF" },
  { name: "Indigo", color: "#3F51B5" },
  { name: "Amber", color: "#FFC107" },
  { name: "Deep Orange", color: "#FF5722" },
  { name: "Light Blue", color: "#03A9F4" },
  { name: "Deep Purple", color: "#673AB7" },
  { name: "Light Green", color: "#8BC34A" },
  { name: "Dark Gray", color: "#444444" },
  { name: "Beige", color: "#F5F5DC" },
  { name: "Turquoise", color: "#40E0D0" },
  { name: "Violet", color: "#EE82EE" },
  { name: "Olive", color: "#808000" },
  { name: "Maroon", color: "#800000" },
  { name: "Navy", color: "#000080" },
  { name: "Silver", color: "#C0C0C0" },
];

const DynamicMarketPage: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations();

  // Theme state - detect from system/localStorage
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // Get URL parameters (these won't change frequently)
  const urlParams = useMemo(
    () => ({
      category: searchParams.get("category") || "",
      selectedSubcategory: searchParams.get("subcategory") || "",
      selectedSubSubcategory: searchParams.get("subsubcategory") || "",
      displayName:
        searchParams.get("displayName") ||
        searchParams.get("subSubcategory") ||
        searchParams.get("subcategory") ||
        searchParams.get("category") ||
        "",
      buyerCategory: searchParams.get("buyerCategory") || "",
      buyerSubcategory: searchParams.get("buyerSubcategory") || "",
    }),
    [searchParams]
  );

  // Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [boostedProducts, setBoostedProducts] = useState<Product[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  // Filter and sort states
  const [selectedSortOption, setSelectedSortOption] = useState("None");
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    subcategories: [],
    colors: [],
    brands: [],
    minPrice: undefined,
    maxPrice: undefined,
  });

  // Available subcategories based on selected category
  const [availableSubcategories, setAvailableSubcategories] = useState<
    string[]
  >([]);

  // Filter UI states
  const [expandedSections, setExpandedSections] = useState({
    subcategory: true,
    color: true,
    brand: true,
    price: true,
  });

  const [brandSearch, setBrandSearch] = useState("");
  const [minPriceInput, setMinPriceInput] = useState("");
  const [maxPriceInput, setMaxPriceInput] = useState("");

  // Filter types matching Flutter implementation
  const filterTypes = [
    "",
    "deals",
    "boosted",
    "trending",
    "fiveStar",
    "bestSellers",
  ];
  const sortOptions = [
    "None",
    "Alphabetical",
    "Date",
    "Price Low to High",
    "Price High to Low",
  ];

  // Memoize filter string to avoid unnecessary re-renders
  const filterString = useMemo(() => {
    return JSON.stringify({
      subcategories: filters.subcategories.sort(),
      colors: filters.colors.sort(),
      brands: filters.brands.sort(),
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
    });
  }, [filters]);

  // Set available subcategories based on URL params
  useEffect(() => {
    if (urlParams.category) {
      const formattedCategory = urlParams.category
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      const categoryKey = formattedCategory;
      let subcats: string[] = [];

      if (categoryKey === "Women" || categoryKey === "Men") {
        const buyerSubcategories = AllInOneCategoryData.getSubcategories(
          categoryKey,
          true
        );
        const allSubSubcategories: string[] = [];

        buyerSubcategories.forEach((buyerSub) => {
          const subSubs = AllInOneCategoryData.getSubSubcategories(
            categoryKey,
            buyerSub,
            true
          );
          allSubSubcategories.push(...subSubs);
        });

        subcats = [...new Set(allSubSubcategories)].sort();
      } else {
        subcats = AllInOneCategoryData.getSubcategories(categoryKey, true);
      }

      setAvailableSubcategories(subcats);

      // Reset filters when category changes
      setFilters({
        subcategories: [],
        colors: [],
        brands: [],
        minPrice: undefined,
        maxPrice: undefined,
      });
      setMinPriceInput("");
      setMaxPriceInput("");
    }
  }, [
    urlParams.category,
    urlParams.selectedSubcategory,
    urlParams.selectedSubSubcategory,
  ]);

  // Theme detection from system/localStorage
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    // Initial theme check
    checkTheme();

    // Watch for theme changes
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    return () => observer.disconnect();
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };
  
  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;    
    
    // Close drawer on left swipe (swipe left to close)
    if (isLeftSwipe && showSidebar) {
      setShowSidebar(false);
    }
  };

  // Optimized fetch products function
  const fetchProducts = useCallback(
    async (page: number = 0, reset: boolean = false) => {
      try {
        if (reset) {
          setIsProductsLoading(true);
          setProducts([]);
          setBoostedProducts([]);
          setCurrentPage(0);
          setHasMore(true);
        } else {
          setIsLoadingMore(true);
        }

        // Build query parameters
        const queryParams = new URLSearchParams({
          ...(urlParams.category && { category: urlParams.category }),
          ...(urlParams.selectedSubcategory && {
            subcategory: urlParams.selectedSubcategory,
          }),
          ...(urlParams.selectedSubSubcategory && {
            subsubcategory: urlParams.selectedSubSubcategory,
          }),
          ...(urlParams.buyerCategory && {
            buyerCategory: urlParams.buyerCategory,
          }),
          ...(urlParams.buyerSubcategory && {
            buyerSubcategory: urlParams.buyerSubcategory,
          }),
          page: page.toString(),
          sort: getSortCode(selectedSortOption),
          ...(selectedFilter && { filter: selectedFilter }),
        });

        // Add filter parameters
        if (filters.subcategories.length > 0) {
          queryParams.set(
            "filterSubcategories",
            filters.subcategories.join(",")
          );
        }
        if (filters.colors.length > 0) {
          queryParams.set("colors", filters.colors.join(","));
        }
        if (filters.brands.length > 0) {
          queryParams.set("brands", filters.brands.join(","));
        }
        if (filters.minPrice !== undefined) {
          queryParams.set("minPrice", filters.minPrice.toString());
        }
        if (filters.maxPrice !== undefined) {
          queryParams.set("maxPrice", filters.maxPrice.toString());
        }

        const response = await fetch(
          `/api/fetchDynamicProducts?${queryParams}`
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (reset) {
          setProducts(data.products || []);
          setBoostedProducts(data.boostedProducts || []);
        } else {
          setProducts((prev) => [...prev, ...(data.products || [])]);
        }

        setHasMore(data.hasMore || false);
        setCurrentPage(page);
      } catch (error) {
        console.error("Error fetching products:", error);
        setHasMore(false);
        if (reset) {
          setProducts([]);
          setBoostedProducts([]);
        }
      } finally {
        setIsInitialLoading(false);
        setIsProductsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [urlParams, selectedSortOption, selectedFilter, filters]
  );

  // Convert sort option to API code
  const getSortCode = (option: string): string => {
    switch (option) {
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
  };

  // Initial load effect - only runs when URL params change
  useEffect(() => {
    if (urlParams.category) {
      fetchProducts(0, true);
    }
  }, [
    urlParams.category,
    urlParams.selectedSubcategory,
    urlParams.selectedSubSubcategory,
    urlParams.buyerCategory,
    urlParams.buyerSubcategory,
  ]);

  // Filter and sort change effect - optimized with memoized dependencies
  useEffect(() => {
    if (urlParams.category) {
      fetchProducts(0, true);
    }
  }, [selectedSortOption, selectedFilter, filterString]);

  // Handle back button
  const handleBack = () => {
    router.back();
  };

  // Handle sort selection
  const handleSortSelect = (option: string) => {
    setSelectedSortOption(option);
  };

  // Handle filter selection
  const handleFilterSelect = (filter: string | null) => {
    setSelectedFilter(filter);
  };

  // Handle load more
  const handleLoadMore = () => {
    if (hasMore && !isLoadingMore) {
      fetchProducts(currentPage + 1, false);
    }
  };

  // Handle scroll to load more
  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + document.documentElement.scrollTop >=
        document.documentElement.offsetHeight - 300
      ) {
        if (hasMore && !isLoadingMore) {
          handleLoadMore();
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasMore, isLoadingMore, currentPage]);

  useEffect(() => {
    if (showSidebar) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  
    // Cleanup function to restore scrolling when component unmounts
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showSidebar]);

  // Memoized filter handlers to prevent unnecessary re-renders
  const handleToggleFilter = useCallback(
    (type: keyof FilterState, value: string) => {
      setFilters((prev) => {
        const currentList = prev[type] as string[];
        const newList = currentList.includes(value)
          ? currentList.filter((item) => item !== value)
          : [...currentList, value];

        return { ...prev, [type]: newList };
      });
    },
    []
  );

  const handleSetPriceFilter = useCallback(() => {
    const min = minPriceInput ? parseFloat(minPriceInput) : undefined;
    const max = maxPriceInput ? parseFloat(maxPriceInput) : undefined;

    if (min !== undefined && max !== undefined && min > max) {
      alert(t("DynamicMarket.priceRangeError"));
      return;
    }

    setFilters((prev) => ({
      ...prev,
      minPrice: min,
      maxPrice: max,
    }));
  }, [minPriceInput, maxPriceInput, t]);

  const handleClearAllFilters = useCallback(() => {
    setFilters({
      subcategories: [],
      colors: [],
      brands: [],
      minPrice: undefined,
      maxPrice: undefined,
    });
    setMinPriceInput("");
    setMaxPriceInput("");
  }, []);

  // Get localized color name
  const getLocalizedColorName = (colorName: string): string => {
    const colorKey = `color${colorName.replace(/\s+/g, "")}`;
    try {
      return t(`DynamicMarket.${colorKey}`);
    } catch {
      return colorName;
    }
  };

  // Other handler functions
  const getFilterButtonText = (filter: string) => {
    switch (filter) {
      case "":
        return t("DynamicMarket.filterAll");
      case "deals":
        return t("DynamicMarket.filterDeals");
      case "boosted":
        return t("DynamicMarket.filterFeatured");
      case "trending":
        return t("DynamicMarket.filterTrending");
      case "fiveStar":
        return t("DynamicMarket.filterFiveStar");
      case "bestSellers":
        return t("DynamicMarket.filterBestSellers");
      default:
        return t("DynamicMarket.filterAll");
    }
  };

  const getSortOptionText = (option: string) => {
    switch (option) {
      case "None":
        return t("DynamicMarket.sortNone");
      case "Alphabetical":
        return t("DynamicMarket.sortAlphabetical");
      case "Date":
        return t("DynamicMarket.sortDate");
      case "Price Low to High":
        return t("DynamicMarket.sortPriceLowToHigh");
      case "Price High to Low":
        return t("DynamicMarket.sortPriceHighToLow");
      default:
        return option;
    }
  };

  const handleProductClick = (product: Product) => {
    router.push(`/productdetail/${product.id}`);
  };

  const getActiveFiltersCount = () => {
    return (
      filters.subcategories.length +
      filters.colors.length +
      filters.brands.length +
      (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0)
    );
  };

  const shouldShowCategoriesFilter = () => {
    return (
      urlParams.buyerCategory === "Women" || urlParams.buyerCategory === "Men"
    );
  };

  const getAvailableSubSubcategories = () => {
    if (!shouldShowCategoriesFilter() || !urlParams.selectedSubcategory) {
      return [];
    }

    const formattedCategory = urlParams.category
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    const productCategory =
      AllInOneCategoryData.getBuyerToProductMapping?.(
        urlParams.buyerCategory,
        urlParams.selectedSubcategory,
        ""
      )?.category || formattedCategory;

    const subSubcategoriesMap =
      AllInOneCategoryData.kSubSubcategories?.[productCategory];

    if (subSubcategoriesMap) {
      const subSubcategories =
        subSubcategoriesMap[urlParams.selectedSubcategory] || [];
      return subSubcategories;
    }

    return [];
  };

  const getLocalizedSubcategoryName = (subcategoryKey: string): string => {
    if (
      !shouldShowCategoriesFilter() ||
      !urlParams.buyerCategory ||
      !urlParams.selectedSubcategory
    ) {
      return subcategoryKey;
    }

    const productCategory = AllInOneCategoryData.getBuyerToProductMapping?.(
      urlParams.buyerCategory,
      urlParams.selectedSubcategory,
      ""
    )?.category;

    if (productCategory && AllInOneCategoryData.localizeSubSubcategoryKey) {
      return AllInOneCategoryData.localizeSubSubcategoryKey(
        productCategory,
        urlParams.selectedSubcategory,
        subcategoryKey,
        {}
      );
    }

    return subcategoryKey;
  };

  const filteredBrands = globalBrands.filter((brand) =>
    brand.toLowerCase().includes(brandSearch.toLowerCase())
  );

  // Show initial loading only on first load
  if (isInitialLoading) {
    return (
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      >
        {/* Header */}
        <div
          className={`shadow-sm p-4 flex items-center gap-4 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }`}
        >
          <button
            onClick={handleBack}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
            }`}
          >
            <ArrowLeft
              size={24}
              className={isDarkMode ? "text-gray-300" : "text-gray-600"}
            />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <div className="px-3 py-1 bg-gradient-to-r from-orange-500 to-pink-500 rounded-lg text-white text-sm font-bold shadow-md">
                Nar24
              </div>
              <span
                className={`font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {urlParams.displayName}
              </span>
            </div>
          </div>
        </div>

        {/* Loading skeleton */}
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`rounded-xl shadow-sm animate-pulse ${
                  isDarkMode ? "bg-gray-800" : "bg-white"
                }`}
              >
                <div
                  className={`aspect-[3/4] rounded-t-xl ${
                    isDarkMode ? "bg-gray-700" : "bg-gray-200"
                  }`}
                ></div>
                <div className="p-3 space-y-2">
                  <div
                    className={`h-4 rounded ${
                      isDarkMode ? "bg-gray-700" : "bg-gray-200"
                    }`}
                  ></div>
                  <div
                    className={`h-3 rounded w-3/4 ${
                      isDarkMode ? "bg-gray-700" : "bg-gray-200"
                    }`}
                  ></div>
                  <div
                    className={`h-4 rounded w-1/2 ${
                      isDarkMode ? "bg-gray-700" : "bg-gray-200"
                    }`}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen w-full ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}
    >
      <div className="flex max-w-7xl mx-auto">
        {/* Mobile Filter Button */}
        <div className="lg:hidden fixed bottom-4 right-4 z-50">
          <button
            onClick={() => setShowSidebar(true)}
            className={`p-3 rounded-full shadow-lg ${
              isDarkMode ? "bg-orange-600" : "bg-orange-500"
            } text-white`}
          >
            <Filter size={24} />
            {getActiveFiltersCount() > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                {getActiveFiltersCount()}
              </span>
            )}
          </button>
        </div>

        {/* Sidebar - This stays static and doesn't reload */}
        <div
  className={`
  fixed lg:sticky lg:top-0 lg:h-screen top-0 left-0 h-screen w-64 transform transition-transform duration-300 z-50
  ${
    showSidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
  }
  ${isDarkMode ? "bg-gray-800" : "bg-white"}
  border-r ${isDarkMode ? "border-gray-700" : "border-gray-200"}
  overflow-y-auto overflow-x-hidden flex-shrink-0
`}
  onTouchStart={handleTouchStart}
  onTouchMove={handleTouchMove}
  onTouchEnd={handleTouchEnd}
>
          {/* Sidebar Header */}
          <div
            className={`border-b ${
              isDarkMode ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <div className="p-4 flex items-center justify-between">
              <h2
                className={`font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("DynamicMarket.filters")}
              </h2>
              <button
                onClick={() => setShowSidebar(false)}
                className={`lg:hidden p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Filter Content */}
          <div className="p-3">
            {/* Clear All Filters Button */}
            {getActiveFiltersCount() > 0 && (
              <button
                onClick={handleClearAllFilters}
                className="w-full mb-3 py-1.5 text-xs text-orange-500 border border-orange-500 rounded hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
              >
                {t("DynamicMarket.clearAllFilters")} ({getActiveFiltersCount()})
              </button>
            )}

            <div className="space-y-4">
              {/* Categories Filter (only for Women/Men buyer categories) */}
              {shouldShowCategoriesFilter() &&
                getAvailableSubSubcategories().length > 0 && (
                  <div>
                    <button
                      onClick={() =>
                        setExpandedSections((prev) => ({
                          ...prev,
                          subcategory: !prev.subcategory,
                        }))
                      }
                      className="w-full flex items-center justify-between text-left py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-medium text-xs ${
                            isDarkMode ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {t("DynamicMarket.categories")}
                        </span>
                        {filters.subcategories.length > 0 && (
                          <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                            {filters.subcategories.length}
                          </span>
                        )}
                      </div>
                      {expandedSections.subcategory ? (
                        <ChevronUp size={14} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={14} className="text-gray-400" />
                      )}
                    </button>

                    {expandedSections.subcategory && (
                      <div className="mt-1.5 space-y-1.5">
                        {filters.subcategories.length > 0 && (
                          <button
                            onClick={() => {
                              setFilters((prev) => ({
                                ...prev,
                                subcategories: [],
                              }));
                            }}
                            className="w-full text-left py-1 px-2 text-xs text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors"
                          >
                            {t("DynamicMarket.clearAllCategories")}
                          </button>
                        )}

                        <div className="max-h-40 overflow-y-auto space-y-1.5">
                          {getAvailableSubSubcategories().map(
                            (subSubcategory) => {
                              const localizedName =
                                getLocalizedSubcategoryName(subSubcategory);

                              return (
                                <label
                                  key={subSubcategory}
                                  className="flex items-center space-x-2 cursor-pointer py-0.5"
                                >
                                  <input
                                    type="checkbox"
                                    checked={filters.subcategories.includes(
                                      subSubcategory
                                    )}
                                    onChange={() =>
                                      handleToggleFilter(
                                        "subcategories",
                                        subSubcategory
                                      )
                                    }
                                    className="w-3 h-3 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
                                  />
                                  <span
                                    className={`text-xs ${
                                      isDarkMode
                                        ? "text-gray-300"
                                        : "text-gray-700"
                                    } leading-tight`}
                                  >
                                    {localizedName}
                                  </span>
                                </label>
                              );
                            }
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {/* Subcategories Filter (for non-Women/Men categories) */}
              {!shouldShowCategoriesFilter() &&
                availableSubcategories.length > 0 && (
                  <div>
                    <button
                      onClick={() =>
                        setExpandedSections((prev) => ({
                          ...prev,
                          subcategory: !prev.subcategory,
                        }))
                      }
                      className="w-full flex items-center justify-between text-left py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-medium text-xs ${
                            isDarkMode ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {t("DynamicMarket.subcategories")}
                        </span>
                        {filters.subcategories.length > 0 && (
                          <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                            {filters.subcategories.length}
                          </span>
                        )}
                      </div>
                      {expandedSections.subcategory ? (
                        <ChevronUp size={14} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={14} className="text-gray-400" />
                      )}
                    </button>

                    {expandedSections.subcategory && (
                      <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
                        {availableSubcategories.map((sub) => {
                          const localizedName = sub;

                          return (
                            <label
                              key={sub}
                              className="flex items-center space-x-2 cursor-pointer py-0.5"
                            >
                              <input
                                type="checkbox"
                                checked={filters.subcategories.includes(
                                  localizedName
                                )}
                                onChange={() =>
                                  handleToggleFilter(
                                    "subcategories",
                                    localizedName
                                  )
                                }
                                className="w-3 h-3 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
                              />
                              <span
                                className={`text-xs ${
                                  isDarkMode ? "text-gray-300" : "text-gray-700"
                                } leading-tight`}
                              >
                                {localizedName}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              {/* Brands Filter */}
              <div>
                <button
                  onClick={() =>
                    setExpandedSections((prev) => ({
                      ...prev,
                      brand: !prev.brand,
                    }))
                  }
                  className="w-full flex items-center justify-between text-left py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium text-xs ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {t("DynamicMarket.brands")}
                    </span>
                    {filters.brands.length > 0 && (
                      <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                        {filters.brands.length}
                      </span>
                    )}
                  </div>
                  {expandedSections.brand ? (
                    <ChevronUp size={14} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={14} className="text-gray-400" />
                  )}
                </button>

                {expandedSections.brand && (
                  <div className="mt-1.5 space-y-2">
                    {filters.brands.length > 0 && (
                      <button
                        onClick={() => {
                          setFilters((prev) => ({
                            ...prev,
                            brands: [],
                          }));
                        }}
                        className="w-full text-left py-1 px-2 text-xs text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors"
                      >
                        {t("DynamicMarket.clearAllBrands")}
                      </button>
                    )}

                    <div className="relative">
                      <Search
                        size={14}
                        className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="text"
                        placeholder={t("DynamicMarket.searchBrands")}
                        value={brandSearch}
                        onChange={(e) => setBrandSearch(e.target.value)}
                        className={`
                        w-full pl-8 pr-3 py-1.5 text-xs border rounded
                        ${
                          isDarkMode
                            ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                            : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                        }
                        focus:ring-1 focus:ring-orange-500 focus:border-orange-500
                      `}
                      />
                    </div>

                    <div className="max-h-40 overflow-y-auto space-y-1.5">
                      {filteredBrands.map((brand) => (
                        <label
                          key={brand}
                          className="flex items-center space-x-2 cursor-pointer py-0.5"
                        >
                          <input
                            type="checkbox"
                            checked={filters.brands.includes(brand)}
                            onChange={() => handleToggleFilter("brands", brand)}
                            className="w-3 h-3 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
                          />
                          <span
                            className={`text-xs ${
                              isDarkMode ? "text-gray-300" : "text-gray-700"
                            } leading-tight`}
                          >
                            {brand}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Colors Filter */}
              <div>
                <button
                  onClick={() =>
                    setExpandedSections((prev) => ({
                      ...prev,
                      color: !prev.color,
                    }))
                  }
                  className="w-full flex items-center justify-between text-left py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium text-xs ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {t("DynamicMarket.colors")}
                    </span>
                    {filters.colors.length > 0 && (
                      <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                        {filters.colors.length}
                      </span>
                    )}
                  </div>
                  {expandedSections.color ? (
                    <ChevronUp size={14} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={14} className="text-gray-400" />
                  )}
                </button>

                {expandedSections.color && (
                  <div className="mt-1.5 space-y-2">
                    {filters.colors.length > 0 && (
                      <button
                        onClick={() => {
                          setFilters((prev) => ({
                            ...prev,
                            colors: [],
                          }));
                        }}
                        className="w-full text-left py-1 px-2 text-xs text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors"
                      >
                        {t("DynamicMarket.clearAllColors")}
                      </button>
                    )}

                    <div className="max-h-40 overflow-y-auto">
                      <div className="grid grid-cols-1 gap-1.5">
                        {availableColors.map((colorData) => (
                          <label
                            key={colorData.name}
                            className="flex items-center space-x-2 cursor-pointer py-0.5 px-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={filters.colors.includes(colorData.name)}
                              onChange={() =>
                                handleToggleFilter("colors", colorData.name)
                              }
                              className="w-3 h-3 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
                            />
                            <div
                              className="w-3 h-3 rounded border border-gray-300 flex-shrink-0"
                              style={{ backgroundColor: colorData.color }}
                            />
                            <span
                              className={`text-xs ${
                                isDarkMode ? "text-gray-300" : "text-gray-700"
                              } leading-tight`}
                            >
                              {getLocalizedColorName(colorData.name)}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Price Range Filter */}
              <div>
                <button
                  onClick={() =>
                    setExpandedSections((prev) => ({
                      ...prev,
                      price: !prev.price,
                    }))
                  }
                  className="w-full flex items-center justify-between text-left py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-medium text-xs ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {t("DynamicMarket.priceRange")}
                    </span>
                    {(filters.minPrice !== undefined ||
                      filters.maxPrice !== undefined) && (
                      <div className="bg-orange-500 text-white text-xs px-1 rounded-full">
                        ✓
                      </div>
                    )}
                  </div>
                  {expandedSections.price ? (
                    <ChevronUp size={14} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={14} className="text-gray-400" />
                  )}
                </button>

                {expandedSections.price && (
                  <div className="mt-1.5 space-y-2">
                    {(filters.minPrice !== undefined ||
                      filters.maxPrice !== undefined) && (
                      <div
                        className={`p-2 rounded ${
                          isDarkMode ? "bg-orange-900/30" : "bg-orange-100"
                        } flex items-center justify-between`}
                      >
                        <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                          {filters.minPrice || 0} - {filters.maxPrice || "∞"}{" "}
                          {t("DynamicMarket.currency")}
                        </span>
                        <button
                          onClick={() => {
                            setFilters((prev) => ({
                              ...prev,
                              minPrice: undefined,
                              maxPrice: undefined,
                            }));
                            setMinPriceInput("");
                            setMaxPriceInput("");
                          }}
                          className="text-orange-600 dark:text-orange-400 hover:text-orange-700"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}

                    <div className="flex space-x-1.5 items-center">
                      <input
                        type="number"
                        placeholder={t("DynamicMarket.min")}
                        value={minPriceInput}
                        onChange={(e) => setMinPriceInput(e.target.value)}
                        className={`
                      w-16 px-1.5 py-1.5 text-xs border rounded
                      ${
                        isDarkMode
                          ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                          : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                      }
                      focus:ring-1 focus:ring-orange-500 focus:border-orange-500
                    `}
                      />
                      <span className="text-xs text-gray-500 self-center">
                        -
                      </span>
                      <input
                        type="number"
                        placeholder={t("DynamicMarket.max")}
                        value={maxPriceInput}
                        onChange={(e) => setMaxPriceInput(e.target.value)}
                        className={`
                      w-16 px-1.5 py-1.5 text-xs border rounded
                      ${
                        isDarkMode
                          ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                          : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                      }
                      focus:ring-1 focus:ring-orange-500 focus:border-orange-500
                    `}
                      />
                      <span className="text-xs text-gray-500 self-center">
                        {t("DynamicMarket.currency")}
                      </span>
                    </div>

                    <button
                      onClick={handleSetPriceFilter}
                      className="w-full py-1.5 bg-orange-500 text-white text-xs font-medium rounded hover:bg-orange-600 transition-colors"
                    >
                      {t("DynamicMarket.applyPriceFilter")}
                    </button>

                    <div className="pt-2">
                      <p
                        className={`text-xs mb-2 ${
                          isDarkMode ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {t("DynamicMarket.quickRanges")}:
                      </p>
                      <div className="grid grid-cols-2 gap-1">
                        {[
                          { label: "0-100", min: 0, max: 100 },
                          { label: "100-500", min: 100, max: 500 },
                          { label: "500-1K", min: 500, max: 1000 },
                          { label: "1K+", min: 1000, max: undefined },
                        ].map((range) => {
                          const isSelected =
                            filters.minPrice === range.min &&
                            filters.maxPrice === range.max;
                          return (
                            <button
                              key={range.label}
                              onClick={() => {
                                setFilters((prev) => ({
                                  ...prev,
                                  minPrice: range.min,
                                  maxPrice: range.max,
                                }));
                                setMinPriceInput(range.min.toString());
                                setMaxPriceInput(range.max?.toString() || "");
                              }}
                              className={`px-2 py-1 text-xs rounded transition-colors ${
                                isSelected
                                  ? "bg-orange-500 text-white"
                                  : isDarkMode
                                  ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                              }`}
                            >
                              {range.label} {t("DynamicMarket.currency")}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Overlay for mobile */}
        {showSidebar && (
  <div
    className="lg:hidden fixed inset-0 bg-black bg-opacity-75 z-30"
    onClick={() => setShowSidebar(false)}
  />
)}

        {/* Main Content - This is the only part that reloads when filters change */}
        <div className="flex-1 min-w-0">
          {/* Header - Static, doesn't reload */}
          {/* Header - Static, doesn't reload */}
          <div
            className={`shadow-md sticky top-0 z-10 backdrop-blur-xl ${
              isDarkMode
                ? "bg-gray-800/95 border-gray-700"
                : "bg-white/95 border-gray-200"
            } border-b`}
          >
            <div className="p-4 flex items-center gap-3">
              {/* Back button */}
              <button
                onClick={handleBack}
                className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <ArrowLeft
                  size={24}
                  className={isDarkMode ? "text-gray-300" : "text-gray-600"}
                />
              </button>

              {/* Nar24 Logo */}
              <div className="px-3 py-1 bg-gradient-to-r from-orange-500 to-pink-500 rounded-lg text-white text-sm font-bold shadow-md flex-shrink-0">
                Nar24
              </div>

              {/* Filter buttons - now in the same row */}
              <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1">
                {filterTypes.map((filter) => (
                  <button
                    key={filter}
                    onClick={() =>
                      handleFilterSelect(filter === "" ? null : filter)
                    }
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0 ${
                      selectedFilter === (filter === "" ? null : filter)
                        ? "bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-lg"
                        : isDarkMode
                        ? "bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600"
                        : "bg-white text-gray-700 hover:bg-gray-50 shadow-sm border border-gray-200"
                    }`}
                  >
                    {getFilterButtonText(filter)}
                  </button>
                ))}
              </div>

              {/* Sort button */}
              <div className="relative">
                <button
                  onClick={() => setShowSortDropdown(!showSortDropdown)}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors flex-shrink-0 ${
                    isDarkMode
                      ? "hover:bg-gray-700 text-gray-300"
                      : "hover:bg-gray-100 text-gray-600"
                  } ${
                    showSortDropdown
                      ? isDarkMode
                        ? "bg-gray-700"
                        : "bg-gray-100"
                      : ""
                  }`}
                >
                  <SortAsc size={18} />
                  <span className="hidden sm:inline text-xs font-medium">
                    {selectedSortOption !== "None"
                      ? getSortOptionText(selectedSortOption)
                      : t("DynamicMarket.sort")}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`ml-1 transition-transform ${
                      showSortDropdown ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Dropdown Menu */}
                {showSortDropdown && (
                  <>
                    {/* Backdrop to close dropdown when clicking outside */}
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowSortDropdown(false)}
                    />

                    {/* Dropdown content */}
                    <div
                      className={`absolute right-0 mt-2 w-48 rounded-lg shadow-lg z-20 border ${
                        isDarkMode
                          ? "bg-gray-800 border-gray-700"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <div className="py-1">
                        {sortOptions.map((option) => (
                          <button
                            key={option}
                            onClick={() => {
                              handleSortSelect(option);
                              setShowSortDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between ${
                              selectedSortOption === option
                                ? isDarkMode
                                  ? "bg-gray-700 text-orange-400"
                                  : "bg-orange-50 text-orange-600"
                                : isDarkMode
                                ? "text-gray-300 hover:bg-gray-700"
                                : "text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <span>{getSortOptionText(option)}</span>
                            {selectedSortOption === option && (
                              <div className="w-2 h-2 rounded-full bg-orange-500" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Products Grid - This is the only part that shows loading when filters change */}
          <div className="p-4 relative">
            {/* Loading overlay for products area only */}
            {isProductsLoading && (
              <div
                className={`absolute inset-0 ${
                  isDarkMode ? "bg-gray-900/80" : "bg-white/80"
                } backdrop-blur-sm z-10 flex items-center justify-center`}
              >
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                  <p
                    className={`mt-4 text-sm ${
                      isDarkMode ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    {t("DynamicMarket.updatingProducts")}
                  </p>
                </div>
              </div>
            )}

            {/* Boosted products first (only on default filter) */}
            {selectedFilter === null && boostedProducts.length > 0 && (
              <div className="mb-8">
                <div
                  className={`flex items-center gap-3 mb-4 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  <div className="w-1 h-8 bg-gradient-to-b from-orange-500 to-pink-500 rounded-full"></div>
                  <h3 className="text-xl font-bold">
                    {t("DynamicMarket.featuredProducts")}
                  </h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {boostedProducts.map((product) => (
                    <div
                      key={`boosted-${product.id}`}
                      className={`rounded-xl shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 ${
                        isDarkMode ? "bg-gray-800" : "bg-white"
                      }`}
                    >
                      <ProductCard
                        product={product}
                        onTap={() => handleProductClick(product)}
                        onFavoriteToggle={() => {}}
                        onAddToCart={() => {}}
                        onColorSelect={() => {}}
                        showCartIcon={true}
                        isFavorited={false}
                        isInCart={false}
                        portraitImageHeight={320}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regular products */}
            {products.length > 0 ? (
              <div>
                <div
                  className={`flex items-center gap-3 mb-4 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full"></div>
                  <h3 className="text-xl font-bold">
                    {t("DynamicMarket.allProducts")}
                  </h3>
                  <span
                    className={`text-sm px-3 py-1 rounded-full ${
                      isDarkMode
                        ? "bg-gray-700 text-gray-300"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {products.length} {t("DynamicMarket.products")}
                  </span>
                  {getActiveFiltersCount() > 0 && (
                    <span
                      className={`text-sm px-3 py-1 rounded-full ${
                        isDarkMode
                          ? "bg-orange-900/30 text-orange-400"
                          : "bg-orange-100 text-orange-600"
                      }`}
                    >
                      {getActiveFiltersCount()}{" "}
                      {t("DynamicMarket.filtersApplied")}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className={`rounded-xl shadow-md transition-all duration-200 hover:shadow-lg hover:scale-105 ${
                        isDarkMode ? "bg-gray-800" : "bg-white"
                      }`}
                    >
                      <ProductCard
                        product={product}
                        onTap={() => handleProductClick(product)}
                        onFavoriteToggle={() => {}}
                        onAddToCart={() => {}}
                        onColorSelect={() => {}}
                        showCartIcon={true}
                        isFavorited={false}
                        isInCart={false}
                        portraitImageHeight={320}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              !isProductsLoading && (
                <div className="text-center py-16">
                  <div
                    className={`mb-6 ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    <Filter size={64} className="mx-auto" />
                  </div>
                  <h3
                    className={`text-xl font-semibold mb-2 ${
                      isDarkMode ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    {t("DynamicMarket.noProductsFound")}
                  </h3>
                  <p
                    className={`text-sm mb-4 ${
                      isDarkMode ? "text-gray-500" : "text-gray-500"
                    }`}
                  >
                    {t("DynamicMarket.tryAdjustingFilters")}
                  </p>
                  {getActiveFiltersCount() > 0 && (
                    <button
                      onClick={handleClearAllFilters}
                      className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                    >
                      {t("DynamicMarket.clearAllFilters")}
                    </button>
                  )}
                </div>
              )
            )}

            {/* Loading more indicator */}
            {isLoadingMore && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
                <p
                  className={`mt-2 text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("DynamicMarket.loadingMore")}
                </p>
              </div>
            )}

            {/* Load more button */}
            {hasMore &&
              !isLoadingMore &&
              products.length > 0 &&
              !isProductsLoading && (
                <div className="text-center py-8">
                  <button
                    onClick={handleLoadMore}
                    className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
                      isDarkMode
                        ? "bg-gray-700 hover:bg-gray-600 text-white border border-gray-600"
                        : "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm"
                    }`}
                  >
                    {t("DynamicMarket.loadMore")}
                  </button>
                </div>
              )}
          </div>

          {/* Bottom spacing */}
          <div className="h-20"></div>
        </div>
      </div>
    </div>
  );
};

export default DynamicMarketPage;
