"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import SecondHeader from "../../components/market_screen/SecondHeader";
import ProductCard from "../../components/ProductCard";
import { AllInOneCategoryData } from "../../../constants/productData";
import { globalBrands } from "../../../constants/brands";
import {
  Loader2,
  AlertCircle,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";

import { Product } from "@/app/models/Product";

interface ProductsResponse {
  products: Product[];
  hasMore: boolean;
  page: number;
  total: number;
}

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
] as const;

// Constants
const PRODUCTS_PER_PAGE = 20;
const SCROLL_THRESHOLD = 1000;
const DEBOUNCE_DELAY = 300;

export default function DynamicMarketPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [categoryTitle, setCategoryTitle] = useState("Products");
  const [showSidebar, setShowSidebar] = useState(false);

  // Filter states
  const [filters, setFilters] = useState<FilterState>({
    subcategories: [],
    colors: [],
    brands: [],
    minPrice: undefined,
    maxPrice: undefined,
  });

  const [availableSubcategories, setAvailableSubcategories] = useState<string[]>([]);

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

  const searchParams = useSearchParams();
  const router = useRouter();

  const category = searchParams.get("category");
  const subcategory = searchParams.get("subcategory");
  const subsubcategory = searchParams.get("subsubcategory");

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Refs for performance optimization
  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoadRef = useRef(true);

  // Memoized filtered brands
  const filteredBrands = useMemo(() => {
    if (!brandSearch) return globalBrands;
    const searchLower = brandSearch.toLowerCase();
    return globalBrands.filter((brand) =>
      brand.toLowerCase().includes(searchLower)
    );
  }, [brandSearch]);

  // Memoized active filters count
  const activeFiltersCount = useMemo(() => {
    return (
      filters.subcategories.length +
      filters.colors.length +
      filters.brands.length +
      (filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0)
    );
  }, [filters]);

  // Theme detection
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    if (typeof document !== "undefined") {
      const savedTheme = localStorage.getItem("theme");
      const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

      if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

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

  // Sidebar scroll lock
  useEffect(() => {
    if (showSidebar) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showSidebar]);

  // Category title and subcategories setup
  useEffect(() => {
    if (category) {
      const formattedCategory = category
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      let title = formattedCategory;

      if (subcategory) {
        const formattedSubcategory = subcategory
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
        title = `${formattedCategory} - ${formattedSubcategory}`;
      }

      if (subsubcategory) {
        const formattedSubSubcategory = subsubcategory
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
        title = `${title} - ${formattedSubSubcategory}`;
      }

      setCategoryTitle(title);

      const categoryKey = formattedCategory;
      let subcats: string[] = [];

      if (categoryKey === "Women" || categoryKey === "Men") {
        const buyerSubcategories = AllInOneCategoryData.getSubcategories(categoryKey, true);
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
  }, [category, subcategory, subsubcategory]);

  // Touch handlers for mobile drawer
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;

    if (isLeftSwipe && showSidebar) {
      setShowSidebar(false);
    }
  }, [touchStart, touchEnd, showSidebar]);

  const getLocalizedSubcategoryName = useCallback(
    (categoryKey: string, subcategoryKey: string): string => {
      return subcategoryKey;
    },
    []
  );

  // Optimized fetch function with abort controller
  const fetchProducts = useCallback(
    async (page: number = 0, append: boolean = false) => {
      if (!category) {
        setError("No category specified");
        setLoading(false);
        return;
      }

      // Abort previous request if exists
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      try {
        if (!append) {
          setLoading(true);
          setError(null);
        } else {
          setLoadingMore(true);
        }

        const params = new URLSearchParams({
          category,
          page: page.toString(),
          limit: PRODUCTS_PER_PAGE.toString(),
        });

        if (subcategory) params.set("subcategory", subcategory);
        if (subsubcategory) params.set("subsubcategory", subsubcategory);

        if (filters.subcategories.length > 0) {
          params.set("filterSubcategories", filters.subcategories.join(","));
        }
        if (filters.colors.length > 0) {
          params.set("colors", filters.colors.join(","));
        }
        if (filters.brands.length > 0) {
          params.set("brands", filters.brands.join(","));
        }
        if (filters.minPrice !== undefined) {
          params.set("minPrice", filters.minPrice.toString());
        }
        if (filters.maxPrice !== undefined) {
          params.set("maxPrice", filters.maxPrice.toString());
        }

        params.set("sort", "date");

        const response = await fetch(`/api/dynamicmarket?${params}`, {
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: ProductsResponse = await response.json();

        if (append) {
          setProducts((prev) => [...prev, ...data.products]);
        } else {
          setProducts(data.products);
        }

        setHasMore(data.hasMore);
        setCurrentPage(page);
        
        if (isFirstLoadRef.current) {
          isFirstLoadRef.current = false;
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return; // Request was cancelled, don't update state
        }
        console.error("Error fetching products:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch products");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category, subcategory, subsubcategory, filters]
  );

  // Initial fetch
  useEffect(() => {
    if (category) {
      setProducts([]);
      setCurrentPage(0);
      setHasMore(true);
      fetchProducts(0, false);
    }

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [category, fetchProducts]);

  // Optimized load more with debouncing
  const loadMore = useCallback(() => {
    if (hasMore && !loadingMore && !loading) {
      fetchProducts(currentPage + 1, true);
    }
  }, [hasMore, loadingMore, loading, currentPage, fetchProducts]);

  // Debounced scroll handler
  useEffect(() => {
    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {
        const scrollPosition = window.innerHeight + window.scrollY;
        const threshold = document.documentElement.offsetHeight - SCROLL_THRESHOLD;

        if (scrollPosition >= threshold && hasMore && !loadingMore && !loading) {
          loadMore();
        }
      }, DEBOUNCE_DELAY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [hasMore, loadingMore, loading, loadMore]);

  // Filter handlers
  const toggleFilter = useCallback((type: keyof FilterState, value: string) => {
    setFilters((prev) => {
      const currentList = prev[type] as string[];
      const newList = currentList.includes(value)
        ? currentList.filter((item) => item !== value)
        : [...currentList, value];

      return { ...prev, [type]: newList };
    });
  }, []);

  const setPriceFilter = useCallback(() => {
    const min = minPriceInput ? parseFloat(minPriceInput) : undefined;
    const max = maxPriceInput ? parseFloat(maxPriceInput) : undefined;

    if (min !== undefined && max !== undefined && min > max) {
      alert("Minimum price cannot be greater than maximum price");
      return;
    }

    setFilters((prev) => ({
      ...prev,
      minPrice: min,
      maxPrice: max,
    }));
  }, [minPriceInput, maxPriceInput]);

  const clearAllFilters = useCallback(() => {
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

  // Product handlers
  const handleProductClick = useCallback(
    (productId: string) => {
      router.push(`/productdetail/${productId}`);
    },
    [router]
  );

  const handleFavoriteToggle = useCallback((productId: string) => {
    console.log("Toggle favorite for product:", productId);
  }, []);

  const handleAddToCart = useCallback((productId: string) => {
    console.log("Add to cart product:", productId);
  }, []);

  const handleColorSelect = useCallback((productId: string, color: string) => {
    console.log("Color selected for product:", productId, color);
  }, []);

  if (!category) {
    return (
      <>
        <SecondHeader />
        <div
          className={`min-h-screen flex items-center justify-center ${
            isDarkMode ? "bg-gray-900" : "bg-gray-50"
          }`}
        >
          <div className="text-center">
            <AlertCircle size={48} className="mx-auto mb-4 text-orange-500" />
            <h2
              className={`text-xl font-semibold mb-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              No Category Selected
            </h2>
            <p className={`${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              Please select a category to view products.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SecondHeader />

      <div className={`min-h-screen w-full ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        <div className="flex max-w-7xl mx-auto">
          {/* Mobile Filter Button */}
          <div className="lg:hidden fixed bottom-4 right-4 z-50">
            <button
              onClick={() => setShowSidebar(true)}
              className={`p-3 rounded-full shadow-lg ${
                isDarkMode ? "bg-orange-600" : "bg-orange-500"
              } text-white`}
              aria-label="Open filters"
            >
              <Filter size={24} />
              {activeFiltersCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter Sidebar */}
          <div
            className={`
              fixed lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] top-0 left-0 h-screen w-64 transform transition-transform duration-300 z-50 lg:z-40
              ${showSidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
              ${isDarkMode ? "bg-gray-800" : "bg-white"}
              border-r ${isDarkMode ? "border-gray-700" : "border-gray-200"}
              overflow-y-auto overflow-x-hidden flex-shrink-0
            `}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Mobile Close Button */}
            <div className="lg:hidden p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className={`font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  Filters
                </h2>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
                  aria-label="Close filters"
                >
                  <X size={18} className={isDarkMode ? "text-gray-400" : "text-gray-600"} />
                </button>
              </div>
            </div>

            {/* Filter Content */}
            <div className="p-3">
              {activeFiltersCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="w-full mb-3 py-1.5 text-xs text-orange-500 border border-orange-500 rounded hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                >
                  Clear All Filters ({activeFiltersCount})
                </button>
              )}

              <div className="space-y-4">
                {/* Subcategories Filter */}
                {availableSubcategories.length > 0 && (
                  <div>
                    <button
                      onClick={() =>
                        setExpandedSections((prev) => ({
                          ...prev,
                          subcategory: !prev.subcategory,
                        }))
                      }
                      className="w-full flex items-center justify-between text-left py-1.5"
                      aria-expanded={expandedSections.subcategory}
                    >
                      <span className={`font-medium text-xs ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                        Subcategories
                      </span>
                      {expandedSections.subcategory ? (
                        <ChevronUp size={14} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={14} className="text-gray-400" />
                      )}
                    </button>

                    {expandedSections.subcategory && (
                      <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
                        {availableSubcategories.map((sub) => {
                          const formattedCategory =
                            category
                              ?.split("-")
                              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                              .join(" ") || "";
                          const localizedName = getLocalizedSubcategoryName(formattedCategory, sub);

                          return (
                            <label
                              key={sub}
                              className="flex items-center space-x-2 cursor-pointer py-0.5"
                            >
                              <input
                                type="checkbox"
                                checked={filters.subcategories.includes(localizedName)}
                                onChange={() => toggleFilter("subcategories", localizedName)}
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
                    aria-expanded={expandedSections.brand}
                  >
                    <span className={`font-medium text-xs ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                      Brands
                    </span>
                    {expandedSections.brand ? (
                      <ChevronUp size={14} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={14} className="text-gray-400" />
                    )}
                  </button>

                  {expandedSections.brand && (
                    <div className="mt-1.5 space-y-2">
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                        />
                        <input
                          type="text"
                          placeholder="Search brands..."
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
                          <label key={brand} className="flex items-center space-x-2 cursor-pointer py-0.5">
                            <input
                              type="checkbox"
                              checked={filters.brands.includes(brand)}
                              onChange={() => toggleFilter("brands", brand)}
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
                    aria-expanded={expandedSections.color}
                  >
                    <span className={`font-medium text-xs ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                      Colors
                    </span>
                    {expandedSections.color ? (
                      <ChevronUp size={14} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={14} className="text-gray-400" />
                    )}
                  </button>

                  {expandedSections.color && (
                    <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
                      {availableColors.map((colorData) => (
                        <label
                          key={colorData.name}
                          className="flex items-center space-x-2 cursor-pointer py-0.5"
                        >
                          <input
                            type="checkbox"
                            checked={filters.colors.includes(colorData.name)}
                            onChange={() => toggleFilter("colors", colorData.name)}
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
                            {colorData.name}
                          </span>
                        </label>
                      ))}
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
                    aria-expanded={expandedSections.price}
                  >
                    <span className={`font-medium text-xs ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                      Price Range
                    </span>
                    {expandedSections.price ? (
                      <ChevronUp size={14} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={14} className="text-gray-400" />
                    )}
                  </button>

                  {expandedSections.price && (
                    <div className="mt-1.5 space-y-2">
                      <div className="flex space-x-1.5">
                        <input
                          type="number"
                          placeholder="Min"
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
                        <span className="text-xs text-gray-500 self-center">-</span>
                        <input
                          type="number"
                          placeholder="Max"
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
                        <span className="text-xs text-gray-500 self-center">TL</span>
                      </div>

                      <button
                        onClick={setPriceFilter}
                        className="w-full py-1.5 bg-orange-500 text-white text-xs font-medium rounded hover:bg-orange-600 transition-colors"
                      >
                        Apply Price Filter
                      </button>

                      {(filters.minPrice !== undefined || filters.maxPrice !== undefined) && (
                        <div className="text-xs text-orange-500 font-medium">
                          {filters.minPrice || 0} TL - {filters.maxPrice || "∞"} TL
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 w-full overflow-hidden">
            {/* Header */}
            <div className="w-full pt-6 pb-4">
              <div className="px-4">
                <h1 className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {categoryTitle}
                </h1>
                {products.length > 0 && (
                  <p className={`text-sm mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                    {products.length} products found
                    {activeFiltersCount > 0 && ` (${activeFiltersCount} filters applied)`}
                  </p>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="px-4 pb-8">
              {/* Loading state */}
              {loading && products.length === 0 && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={32} className="animate-spin text-orange-500" />
                  <span className={`ml-3 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                    Loading products...
                  </span>
                </div>
              )}

              {/* Error state */}
              {error && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <AlertCircle size={48} className="mx-auto mb-4 text-red-500" />
                    <h2 className={`text-xl font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                      Error Loading Products
                    </h2>
                    <p className={`mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>{error}</p>
                    <button
                      onClick={() => fetchProducts(0, false)}
                      className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}

              {/* Products grid */}
              {!loading && products.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
                  {products.map((product) => (
                    <div key={product.id} className="w-full">
                      <ProductCard
                        product={product}
                        onTap={() => handleProductClick(product.id)}
                        onFavoriteToggle={handleFavoriteToggle}
                        onAddToCart={handleAddToCart}
                        onColorSelect={(color) => handleColorSelect(product.id, color)}
                        showCartIcon={true}
                        isFavorited={false}
                        isInCart={false}
                        portraitImageHeight={320}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* No products state */}
              {!loading && products.length === 0 && !error && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <div className={`text-6xl mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}>
                      🛍️
                    </div>
                    <h2 className={`text-xl font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                      No Products Found
                    </h2>
                    <p className={`${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                      No products available with the current filters.
                    </p>
                    {activeFiltersCount > 0 && (
                      <button
                        onClick={clearAllFilters}
                        className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                      >
                        Clear All Filters
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Loading more indicator */}
              {loadingMore && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-orange-500" />
                  <span className={`ml-3 text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                    Loading more products...
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}