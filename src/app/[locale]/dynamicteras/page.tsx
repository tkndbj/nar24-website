"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { impressionBatcher } from '@/app/utils/impressionBatcher';
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
  buyerCategory?: string;
  buyerSubcategory?: string;
  buyerSubSubcategory?: string;
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

// Create a wrapper to convert useTranslations to AppLocalizations format
interface AppLocalizations {
  [key: string]: string;
}

const createAppLocalizations = (
  t: (key: string) => string
): AppLocalizations => {
  return new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        try {
          return t(prop);
        } catch {
          return prop; // fallback to the key itself if translation doesn't exist
        }
      },
    }
  ) as AppLocalizations;
};

const DynamicMarketPage: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations();
  const l10n = createAppLocalizations(t);

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
  const [selectedFilter] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    subcategories: [],
    colors: [],
    brands: [],
    minPrice: undefined,
    maxPrice: undefined,
    buyerCategory: undefined,
    buyerSubcategory: undefined,
    buyerSubSubcategory: undefined,
  });

  // Available subcategories based on selected category
  const [availableSubcategories, setAvailableSubcategories] = useState<
    string[]
  >([]);

  // Filter UI states
  const [expandedSections, setExpandedSections] = useState({
    buyerCategory: true,
    subcategory: true,
    color: true,
    brand: true,
    price: true,
  });

  const [brandSearch, setBrandSearch] = useState("");
  const [minPriceInput, setMinPriceInput] = useState("");
  const [maxPriceInput, setMaxPriceInput] = useState("");

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
      buyerCategory: filters.buyerCategory,
      buyerSubcategory: filters.buyerSubcategory,
      buyerSubSubcategory: filters.buyerSubSubcategory,
    });
  }, [filters]);

  useEffect(() => {
    return () => {
      console.log('🧹 DynamicMarketPage: Flushing impressions on unmount');
      impressionBatcher.flush();
    };
  }, []);

  // ✅ Flush when tab becomes hidden (user switches tabs)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('👁️ DynamicMarketPage: Tab hidden, flushing impressions');
        impressionBatcher.flush();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

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
        buyerCategory: undefined,
        buyerSubcategory: undefined,
        buyerSubSubcategory: undefined,
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
        if (filters.buyerCategory) {
          queryParams.set("filterBuyerCategory", filters.buyerCategory);
        }
        if (filters.buyerSubcategory) {
          queryParams.set("filterBuyerSubcategory", filters.buyerSubcategory);
        }
        if (filters.buyerSubSubcategory) {
          queryParams.set("filterBuyerSubSubcategory", filters.buyerSubSubcategory);
        }

        const response = await fetch(
          `/api/fetchDynamicTerasProducts?${queryParams}`
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
    // Always fetch products, even without URL parameters
    fetchProducts(0, true);
  }, [
    urlParams.category,
    urlParams.selectedSubcategory,
    urlParams.selectedSubSubcategory,
    urlParams.buyerCategory,
    urlParams.buyerSubcategory,
  ]);

  // Filter and sort change effect - optimized with memoized dependencies
  useEffect(() => {
    // Always fetch when filters change, regardless of URL params
    fetchProducts(0, true);
  }, [selectedSortOption, selectedFilter, filterString]);

  // Handle back button
  const handleBack = () => {
    router.back();
  };

  // Handle sort selection
  const handleSortSelect = (option: string) => {
    setSelectedSortOption(option);
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
      buyerCategory: undefined,
      buyerSubcategory: undefined,
      buyerSubSubcategory: undefined,
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
      (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0) +
      (filters.buyerCategory ? 1 : 0) +
      (filters.buyerSubcategory ? 1 : 0) +
      (filters.buyerSubSubcategory ? 1 : 0)
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

  // Get available buyer categories
  const getAvailableBuyerCategories = () => {
    return AllInOneCategoryData.kBuyerCategories.map((cat) => cat.key);
  };

  // Get available buyer subcategories based on selected category
  const getAvailableBuyerSubcategories = () => {
    if (!filters.buyerCategory) return [];
    return AllInOneCategoryData.kBuyerSubcategories[filters.buyerCategory] || [];
  };

  // Get available buyer sub-subcategories based on selected category and subcategory
  const getAvailableBuyerSubSubcategories = () => {
    if (!filters.buyerCategory || !filters.buyerSubcategory) return [];
    return (
      AllInOneCategoryData.kBuyerSubSubcategories[filters.buyerCategory]?.[
        filters.buyerSubcategory
      ] || []
    );
  };

  // Localize buyer category name using AllInOneCategoryData
  const getLocalizedBuyerCategoryName = (categoryKey: string): string => {
    return AllInOneCategoryData.localizeBuyerCategoryKey(categoryKey, l10n);
  };

  // Localize buyer subcategory name using AllInOneCategoryData
  const getLocalizedBuyerSubcategoryName = (
    parentCategory: string,
    subcategoryKey: string
  ): string => {
    return AllInOneCategoryData.localizeBuyerSubcategoryKey(
      parentCategory,
      subcategoryKey,
      l10n
    );
  };

  // Localize buyer sub-subcategory name using AllInOneCategoryData
  const getLocalizedBuyerSubSubcategoryName = (
    parentCategory: string,
    parentSubcategory: string,
    subSubcategoryKey: string
  ): string => {
    return AllInOneCategoryData.localizeBuyerSubSubcategoryKey(
      parentCategory,
      parentSubcategory,
      subSubcategoryKey,
      l10n
    );
  };

  // Handle buyer category selection
  const handleBuyerCategorySelect = (category: string) => {
    if (filters.buyerCategory === category) {
      // Deselect if clicking the same category
      setFilters((prev) => ({
        ...prev,
        buyerCategory: undefined,
        buyerSubcategory: undefined,
        buyerSubSubcategory: undefined,
      }));
    } else {
      setFilters((prev) => ({
        ...prev,
        buyerCategory: category,
        buyerSubcategory: undefined,
        buyerSubSubcategory: undefined,
      }));
    }
  };

  // Handle buyer subcategory selection
  const handleBuyerSubcategorySelect = (subcategory: string) => {
    if (filters.buyerSubcategory === subcategory) {
      // Deselect if clicking the same subcategory
      setFilters((prev) => ({
        ...prev,
        buyerSubcategory: undefined,
        buyerSubSubcategory: undefined,
      }));
    } else {
      setFilters((prev) => ({
        ...prev,
        buyerSubcategory: subcategory,
        buyerSubSubcategory: undefined,
      }));
    }
  };

  // Handle buyer sub-subcategory selection
  const handleBuyerSubSubcategorySelect = (subSubcategory: string) => {
    if (filters.buyerSubSubcategory === subSubcategory) {
      // Deselect if clicking the same sub-subcategory
      setFilters((prev) => ({
        ...prev,
        buyerSubSubcategory: undefined,
      }));
    } else {
      setFilters((prev) => ({
        ...prev,
        buyerSubSubcategory: subSubcategory,
      }));
    }
  };

  // Shimmer component for loading skeleton - GPU-accelerated
  const ProductCardSkeleton = () => {
    const shimmerClass = `shimmer-effect ${isDarkMode ? 'shimmer-effect-dark' : 'shimmer-effect-light'}`;

    return (
      <div className="w-full">
        <div
          className="rounded-lg overflow-hidden"
          style={{ backgroundColor: isDarkMode ? '#1f2937' : '#ffffff' }}
        >
          {/* Image skeleton with shimmer effect */}
          <div
            className="w-full relative overflow-hidden"
            style={{
              height: "320px",
              backgroundColor: isDarkMode ? '#374151' : '#f3f4f6'
            }}
          >
            <div className={shimmerClass} />
          </div>

          {/* Content skeleton */}
          <div className="p-3 space-y-2.5">
            {/* Title lines */}
            <div className="space-y-2">
              <div
                className="h-3.5 rounded relative overflow-hidden"
                style={{
                  width: "85%",
                  backgroundColor: isDarkMode ? '#374151' : '#e5e7eb'
                }}
              >
                <div className={shimmerClass} />
              </div>
              <div
                className="h-3.5 rounded relative overflow-hidden"
                style={{
                  width: "60%",
                  backgroundColor: isDarkMode ? '#374151' : '#e5e7eb'
                }}
              >
                <div className={shimmerClass} />
              </div>
            </div>

            {/* Price */}
            <div
              className="h-5 rounded relative overflow-hidden"
              style={{
                width: "45%",
                backgroundColor: isDarkMode ? '#374151' : '#e5e7eb'
              }}
            >
              <div className={shimmerClass} />
            </div>

            {/* Rating and colors */}
            <div className="flex items-center justify-between pt-1">
              <div
                className="h-3 rounded relative overflow-hidden"
                style={{
                  width: "40%",
                  backgroundColor: isDarkMode ? '#374151' : '#e5e7eb'
                }}
              >
                <div className={shimmerClass} />
              </div>
              <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="w-4 h-4 rounded-full relative overflow-hidden"
                    style={{ backgroundColor: isDarkMode ? '#374151' : '#e5e7eb' }}
                  >
                    <div className={shimmerClass} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

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

        {/* Mobile Overlay */}
        {showSidebar && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-[9999]"
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Sidebar - This stays static and doesn't reload */}
        <div
          className={`
          fixed lg:sticky lg:top-0 lg:h-screen top-0 left-0 h-[100dvh] w-64 transform transition-transform duration-300 z-[10000] lg:z-40
          ${
            showSidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          }
          ${isDarkMode ? "bg-gray-800" : "bg-white"}
          border-r ${isDarkMode ? "border-gray-700" : "border-gray-200"}
          overflow-y-auto overflow-x-hidden flex-shrink-0 pb-20
        `}
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
              {/* Buyer Category Filter (hierarchical) */}
              <div>
                <button
                  onClick={() =>
                    setExpandedSections((prev) => ({
                      ...prev,
                      buyerCategory: !prev.buyerCategory,
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
                      {t("DynamicMarket.categoryFilter") || "Category Filter"}
                    </span>
                    {(filters.buyerCategory ||
                      filters.buyerSubcategory ||
                      filters.buyerSubSubcategory) && (
                      <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                        {(filters.buyerCategory ? 1 : 0) +
                          (filters.buyerSubcategory ? 1 : 0) +
                          (filters.buyerSubSubcategory ? 1 : 0)}
                      </span>
                    )}
                  </div>
                  {expandedSections.buyerCategory ? (
                    <ChevronUp size={14} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={14} className="text-gray-400" />
                  )}
                </button>

                {expandedSections.buyerCategory && (
                  <div className="mt-1.5 space-y-2">
                    {/* Clear category filters button */}
                    {(filters.buyerCategory ||
                      filters.buyerSubcategory ||
                      filters.buyerSubSubcategory) && (
                      <button
                        onClick={() => {
                          setFilters((prev) => ({
                            ...prev,
                            buyerCategory: undefined,
                            buyerSubcategory: undefined,
                            buyerSubSubcategory: undefined,
                          }));
                        }}
                        className="w-full text-left py-1 px-2 text-xs text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded transition-colors"
                      >
                        {t("DynamicMarket.clearCategoryFilters") || "Clear Category Filters"}
                      </button>
                    )}

                    {/* Level 1: Buyer Categories */}
                    <div className="space-y-1.5">
                      <p
                        className={`text-xs font-semibold ${
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {t("DynamicMarket.selectCategory") || "Select Category"}
                      </p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {getAvailableBuyerCategories().map((category) => {
                          const isSelected = filters.buyerCategory === category;
                          return (
                            <button
                              key={category}
                              onClick={() => handleBuyerCategorySelect(category)}
                              className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors ${
                                isSelected
                                  ? "bg-orange-500 text-white font-semibold"
                                  : isDarkMode
                                  ? "text-gray-300 hover:bg-gray-700"
                                  : "text-gray-700 hover:bg-gray-100"
                              }`}
                            >
                              {getLocalizedBuyerCategoryName(category)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Level 2: Buyer Subcategories (shown when a category is selected) */}
                    {filters.buyerCategory &&
                      getAvailableBuyerSubcategories().length > 0 && (
                        <div className="space-y-1.5 pl-2 border-l-2 border-orange-500">
                          <p
                            className={`text-xs font-semibold ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            }`}
                          >
                            {t("DynamicMarket.selectSubcategory") || "Select Subcategory"}
                          </p>
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {getAvailableBuyerSubcategories().map(
                              (subcategory) => {
                                const isSelected =
                                  filters.buyerSubcategory === subcategory;
                                return (
                                  <button
                                    key={subcategory}
                                    onClick={() =>
                                      handleBuyerSubcategorySelect(subcategory)
                                    }
                                    className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors ${
                                      isSelected
                                        ? "bg-orange-500 text-white font-semibold"
                                        : isDarkMode
                                        ? "text-gray-300 hover:bg-gray-700"
                                        : "text-gray-700 hover:bg-gray-100"
                                    }`}
                                  >
                                    {getLocalizedBuyerSubcategoryName(
                                      filters.buyerCategory || "",
                                      subcategory
                                    )}
                                  </button>
                                );
                              }
                            )}
                          </div>
                        </div>
                      )}

                    {/* Level 3: Buyer Sub-subcategories (shown when a subcategory is selected) */}
                    {filters.buyerCategory &&
                      filters.buyerSubcategory &&
                      getAvailableBuyerSubSubcategories().length > 0 && (
                        <div className="space-y-1.5 pl-4 border-l-2 border-orange-500">
                          <p
                            className={`text-xs font-semibold ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            }`}
                          >
                            {t("DynamicMarket.selectSubSubcategory") || "Select Sub-subcategory"}
                          </p>
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {getAvailableBuyerSubSubcategories().map(
                              (subSubcategory) => {
                                const isSelected =
                                  filters.buyerSubSubcategory ===
                                  subSubcategory;
                                return (
                                  <button
                                    key={subSubcategory}
                                    onClick={() =>
                                      handleBuyerSubSubcategorySelect(
                                        subSubcategory
                                      )
                                    }
                                    className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors ${
                                      isSelected
                                        ? "bg-orange-500 text-white font-semibold"
                                        : isDarkMode
                                        ? "text-gray-300 hover:bg-gray-700"
                                        : "text-gray-700 hover:bg-gray-100"
                                    }`}
                                  >
                                    {getLocalizedBuyerSubSubcategoryName(
                                      filters.buyerCategory || "",
                                      filters.buyerSubcategory || "",
                                      subSubcategory
                                    )}
                                  </button>
                                );
                              }
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </div>

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


        {/* Main Content - This is the only part that reloads when filters change */}
        <div className="flex-1 min-w-0">
          {/* Header - Static, doesn't reload */}
          <div
            className={`sticky top-0 z-10 border-b ${
              isDarkMode
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-gray-200"
            }`}
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
              <div className="px-3 py-1 bg-purple-600 rounded-lg text-white text-sm font-bold flex-shrink-0">
                Vitrin
              </div>

              <div className="flex-1"></div>

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
            {/* Initial Loading - Show shimmer skeletons */}
            {isInitialLoading && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            )}

            {/* Subsequent loading - Show shimmer skeletons */}
            {!isInitialLoading && isProductsLoading && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
            )}

            {/* All products (boosted + regular) */}
            {!isInitialLoading && (boostedProducts.length > 0 || products.length > 0) ? (
              <div>
                <div
                  className={`flex items-center gap-3 mb-4 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
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
                    {boostedProducts.length + products.length} {t("DynamicMarket.products")}
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {/* Boosted products first */}
                  {boostedProducts.map((product) => (
                    <div key={`boosted-${product.id}`} className="w-full">
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
                  {/* Regular products after */}
                  {products.map((product) => (
                    <div key={product.id} className="w-full">
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
              !isInitialLoading && !isProductsLoading && (
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
            {!isInitialLoading && isLoadingMore && (
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
            {!isInitialLoading &&
              hasMore &&
              !isLoadingMore &&
              products.length > 0 &&
              !isProductsLoading && (
                <div className="text-center py-8">
                  <button
                    onClick={handleLoadMore}
                    className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                      isDarkMode
                        ? "bg-gray-700 hover:bg-gray-600 text-white border border-gray-600"
                        : "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200"
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
