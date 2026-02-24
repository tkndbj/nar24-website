"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { impressionBatcher } from "@/app/utils/impressionBatcher";
import { ArrowLeft, Filter, SortAsc, ChevronDown } from "lucide-react";
import { ProductCard } from "@/app/components/ProductCard";
import { Product } from "@/app/models/Product";
import { useTranslations } from "next-intl";
import FilterSidebar, {
  FilterState,
  SpecFacets,
  EMPTY_FILTER_STATE,
  getActiveFiltersCount,
} from "@/app/components/FilterSideBar";

// ─────────────────────────────────────────────────────────────────────────────
// Sort helpers
// ─────────────────────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  "None",
  "Alphabetical",
  "Date",
  "Price Low to High",
  "Price High to Low",
] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

function toSortCode(opt: SortOption): string {
  switch (opt) {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const DynamicMarketPage: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations();
  const abortRef = useRef<AbortController | null>(null);

  // ── URL params ─────────────────────────────────────────────────────────────
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
    [searchParams],
  );

  // ── Product state ──────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [boostedProducts, setBoostedProducts] = useState<Product[]>([]);
  const [streamedProducts, setStreamedProducts] = useState<Product[]>([]);
  const streamIndexRef = useRef(0);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [selectedSort, setSelectedSort] = useState<SortOption>("None");

  // ── Filter state ───────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTER_STATE);
  const [specFacets, setSpecFacets] = useState<SpecFacets>({});

  /** Stable serialised key so fetch effects only re-run when filters truly change */
  const filterKey = useMemo(
    () =>
      JSON.stringify({
        subcategories: [...filters.subcategories].sort(),
        colors: [...filters.colors].sort(),
        brands: [...filters.brands].sort(),
        specFilters: filters.specFilters,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        minRating: filters.minRating,
      }),
    [filters],
  );

  // ── Streaming: progressively reveal products after each fetch ─────────────
  useEffect(() => {
    if (products.length === 0) {
      setStreamedProducts([]);
      streamIndexRef.current = 0;
      return;
    }
    if (streamIndexRef.current > products.length) {
      streamIndexRef.current = 0;
      setStreamedProducts([]);
    }
    const BATCH = 4;
    const tick = () => {
      const next = streamIndexRef.current + BATCH;
      setStreamedProducts(products.slice(0, Math.min(next, products.length)));
      streamIndexRef.current = next;
      if (next < products.length) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [products]);

  // ── Side effects ───────────────────────────────────────────────────────────
  useEffect(
    () => () => {
      impressionBatcher.flush();
    },
    [],
  );

  useEffect(() => {
    const flush = () => {
      if (document.hidden) impressionBatcher.flush();
    };
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const check = () =>
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflow = showMobileSidebar ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showMobileSidebar]);

  // Reset filters when category context changes
  useEffect(() => {
    setFilters(EMPTY_FILTER_STATE);
  }, [
    urlParams.category,
    urlParams.selectedSubcategory,
    urlParams.selectedSubSubcategory,
  ]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchProducts = useCallback(
    async (page: number = 0, reset = false) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

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

        const qp = new URLSearchParams({
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
          sort: toSortCode(selectedSort),
        });

        if (filters.subcategories.length > 0)
          qp.set("filterSubcategories", filters.subcategories.join(","));
        if (filters.colors.length > 0)
          qp.set("colors", filters.colors.join(","));
        if (filters.brands.length > 0)
          qp.set("brands", filters.brands.join(","));
        if (filters.minPrice !== undefined)
          qp.set("minPrice", filters.minPrice.toString());
        if (filters.maxPrice !== undefined)
          qp.set("maxPrice", filters.maxPrice.toString());
        if (filters.minRating !== undefined)
          qp.set("minRating", filters.minRating.toString());

        // Spec filters: one param per field, comma-separated values
        for (const [field, vals] of Object.entries(filters.specFilters)) {
          if (vals.length > 0) qp.set(`spec_${field}`, vals.join(","));
        }

        const res = await fetch(`/api/fetchDynamicProducts?${qp}`, {
          signal: abortRef.current.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (reset) {
          setProducts(data.products || []);
          setBoostedProducts(data.boostedProducts || []);
          // Spec facets arrive on the initial load response
          if (data.specFacets) setSpecFacets(data.specFacets as SpecFacets);
        } else {
          setProducts((prev) => [...prev, ...(data.products || [])]);
        }

        setHasMore(data.hasMore ?? false);
        setCurrentPage(page);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("DynamicMarketPage fetch error:", err);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [urlParams, selectedSort, filterKey],
  );

  // Initial load
  useEffect(() => {
    if (urlParams.category) fetchProducts(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    urlParams.category,
    urlParams.selectedSubcategory,
    urlParams.selectedSubSubcategory,
    urlParams.buyerCategory,
    urlParams.buyerSubcategory,
  ]);

  // Re-fetch on sort / filter change
  useEffect(() => {
    if (urlParams.category) fetchProducts(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSort, filterKey]);

  // Scroll-based load-more
  useEffect(() => {
    let tid: NodeJS.Timeout;
    const onScroll = () => {
      clearTimeout(tid);
      tid = setTimeout(() => {
        if (
          window.innerHeight + document.documentElement.scrollTop >=
          document.documentElement.offsetHeight - 2500
        ) {
          if (hasMore && !isLoadingMore) fetchProducts(currentPage + 1, false);
        }
      }, 100);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(tid);
    };
  }, [hasMore, isLoadingMore, currentPage, fetchProducts]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const activeCount = getActiveFiltersCount(filters);

  const getSortLabel = (opt: SortOption): string => {
    switch (opt) {
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
    }
  };

  // ── Skeleton ───────────────────────────────────────────────────────────────

  const Skeleton = () => {
    const shimmer = `shimmer-effect ${isDarkMode ? "shimmer-effect-dark" : "shimmer-effect-light"}`;
    const base = { backgroundColor: isDarkMode ? "#374151" : "#f3f4f6" };
    const base2 = { backgroundColor: isDarkMode ? "#374151" : "#e5e7eb" };
    return (
      <div
        className={`rounded-lg overflow-hidden ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
      >
        <div
          className="w-full relative overflow-hidden"
          style={{ height: 320, ...base }}
        >
          <div className={shimmer} />
        </div>
        <div className="p-3 space-y-2">
          {[85, 60].map((w, i) => (
            <div
              key={i}
              className="h-3 rounded relative overflow-hidden"
              style={{ width: `${w}%`, ...base2 }}
            >
              <div className={shimmer} />
            </div>
          ))}
          <div
            className="h-4 rounded relative overflow-hidden"
            style={{ width: "45%", ...base2 }}
          >
            <div className={shimmer} />
          </div>
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={`min-h-screen w-full ${isDarkMode ? "bg-gray-950" : "bg-gray-50"}`}
    >
      <div className="flex max-w-7xl mx-auto">
        {/* ── Desktop sidebar (always rendered, sticky) ── */}
        <div className="hidden lg:block w-60 flex-shrink-0">
          <FilterSidebar
            category={urlParams.category}
            selectedSubcategory={urlParams.selectedSubcategory}
            buyerCategory={urlParams.buyerCategory}
            filters={filters}
            onFiltersChange={setFilters}
            specFacets={specFacets}
            isDarkMode={isDarkMode}
            className="w-60"
          />
        </div>

        {/* ── Mobile FAB ── */}
        <div className="lg:hidden fixed bottom-5 right-5 z-50">
          <button
            onClick={() => setShowMobileSidebar(true)}
            className="relative p-3.5 rounded-full shadow-xl bg-orange-500 text-white"
          >
            <Filter size={22} />
            {activeCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] leading-none font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Mobile sidebar (portal drawer) ── */}
        {isMobile && (
          <FilterSidebar
            category={urlParams.category}
            selectedSubcategory={urlParams.selectedSubcategory}
            buyerCategory={urlParams.buyerCategory}
            filters={filters}
            onFiltersChange={(f) => {
              setFilters(f);
              setShowMobileSidebar(false);
            }}
            specFacets={specFacets}
            isOpen={showMobileSidebar}
            onClose={() => setShowMobileSidebar(false)}
            isDarkMode={isDarkMode}
          />
        )}

        {/* ── Main content ── */}
        <div className="flex-1 min-w-0">
          {/* Header bar */}
          <div
            className={`sticky top-0 z-10 border-b backdrop-blur-xl ${
              isDarkMode
                ? "bg-gray-900/95 border-white/[0.07]"
                : "bg-white/95 border-gray-100"
            }`}
          >
            <div className="px-4 py-3 flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className={`p-2 rounded-lg flex-shrink-0 transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <ArrowLeft
                  size={22}
                  className={isDarkMode ? "text-gray-300" : "text-gray-600"}
                />
              </button>

              <div className="px-3 py-1 bg-gradient-to-r from-orange-500 to-pink-500 rounded-lg text-white text-sm font-bold flex-shrink-0">
                Nar24
              </div>

              {urlParams.displayName && (
                <span
                  className={`text-sm font-semibold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {urlParams.displayName}
                </span>
              )}

              <div className="flex-1" />

              {/* Active filter badge (mobile) */}
              {activeCount > 0 && (
                <button
                  onClick={() => setShowMobileSidebar(true)}
                  className={`lg:hidden text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                    isDarkMode
                      ? "bg-orange-900/40 text-orange-400"
                      : "bg-orange-100 text-orange-600"
                  }`}
                >
                  {activeCount} {t("DynamicMarket.filtersApplied")}
                </button>
              )}

              {/* Sort dropdown */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowSortDropdown((p) => !p)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isDarkMode
                      ? "hover:bg-gray-700 text-gray-300"
                      : "hover:bg-gray-100 text-gray-600"
                  } ${showSortDropdown ? (isDarkMode ? "bg-gray-700" : "bg-gray-100") : ""}`}
                >
                  <SortAsc size={15} />
                  <span className="hidden sm:inline">
                    {selectedSort !== "None"
                      ? getSortLabel(selectedSort)
                      : t("DynamicMarket.sort")}
                  </span>
                  <ChevronDown
                    size={13}
                    className={`transition-transform ${showSortDropdown ? "rotate-180" : ""}`}
                  />
                </button>

                {showSortDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowSortDropdown(false)}
                    />
                    <div
                      className={`absolute right-0 mt-1.5 w-52 rounded-xl shadow-xl z-20 border overflow-hidden ${
                        isDarkMode
                          ? "bg-gray-800 border-gray-700"
                          : "bg-white border-gray-100"
                      }`}
                    >
                      {SORT_OPTIONS.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => {
                            setSelectedSort(opt);
                            setShowSortDropdown(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition-colors ${
                            selectedSort === opt
                              ? isDarkMode
                                ? "bg-gray-700 text-orange-400"
                                : "bg-orange-50 text-orange-600"
                              : isDarkMode
                                ? "text-gray-300 hover:bg-gray-700"
                                : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {getSortLabel(opt)}
                          {selectedSort === opt && (
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Product grid */}
          <div className="p-4 relative">
            {/* Initial skeletons */}
            {isInitialLoading && (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} />
                ))}
              </div>
            )}

            {/* Filter-change overlay */}
            {!isInitialLoading && isProductsLoading && (
              <div
                className={`absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm ${
                  isDarkMode ? "bg-gray-950/80" : "bg-white/80"
                }`}
              >
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
                  <p
                    className={`mt-3 text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                  >
                    {t("DynamicMarket.updatingProducts")}
                  </p>
                </div>
              </div>
            )}

            {/* Boosted products */}
            {!isInitialLoading && boostedProducts.length > 0 && (
              <div className="mb-8">
                <div
                  className={`flex items-center gap-2 mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  <div className="w-1 h-7 bg-gradient-to-b from-orange-500 to-pink-500 rounded-full" />
                  <h3 className="text-base font-bold">
                    {t("DynamicMarket.featuredProducts")}
                  </h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                  {boostedProducts.map((p) => (
                    <ProductCard
                      key={`b-${p.id}`}
                      product={p}
                      onTap={() => router.push(`/productdetail/${p.id}`)}
                      onFavoriteToggle={() => {}}
                      onAddToCart={() => {}}
                      onColorSelect={() => {}}
                      showCartIcon
                      isFavorited={false}
                      isInCart={false}
                      portraitImageHeight={320}
                      isDarkMode={isDarkMode}
                      localization={t}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* All products (streamed) */}
            {!isInitialLoading && streamedProducts.length > 0 && (
              <div>
                <div
                  className={`flex items-center gap-2 mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  <div className="w-1 h-7 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full" />
                  <h3 className="text-base font-bold">
                    {t("DynamicMarket.allProducts")}
                  </h3>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full ${isDarkMode ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"}`}
                  >
                    {products.length}
                  </span>
                  {activeCount > 0 && (
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full ${isDarkMode ? "bg-orange-900/30 text-orange-400" : "bg-orange-100 text-orange-600"}`}
                    >
                      {activeCount} {t("DynamicMarket.filtersApplied")}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-4">
                  {streamedProducts.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      onTap={() => router.push(`/productdetail/${p.id}`)}
                      onFavoriteToggle={() => {}}
                      onAddToCart={() => {}}
                      onColorSelect={() => {}}
                      showCartIcon
                      isFavorited={false}
                      isInCart={false}
                      portraitImageHeight={320}
                      isDarkMode={isDarkMode}
                      localization={t}
                    />
                  ))}
                  {/* Trailing skeletons while streaming */}
                  {streamIndexRef.current < products.length &&
                    Array.from({
                      length: Math.min(
                        4,
                        products.length - streamedProducts.length,
                      ),
                    }).map((_, i) => <Skeleton key={`s-${i}`} />)}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!isInitialLoading &&
              !isProductsLoading &&
              products.length === 0 && (
                <div className="text-center py-20">
                  <Filter
                    size={56}
                    className={`mx-auto mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
                  />
                  <h3
                    className={`text-lg font-semibold mb-1 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
                  >
                    {t("DynamicMarket.noProductsFound")}
                  </h3>
                  <p
                    className={`text-sm mb-5 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                  >
                    {t("DynamicMarket.tryAdjustingFilters")}
                  </p>
                  {activeCount > 0 && (
                    <button
                      onClick={() => setFilters(EMPTY_FILTER_STATE)}
                      className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition-colors"
                    >
                      {t("DynamicMarket.clearAllFilters")}
                    </button>
                  )}
                </div>
              )}

            {/* Loading-more dots */}
            {!isInitialLoading && isLoadingMore && (
              <div className="flex items-center justify-center py-8 gap-2">
                {[0, 150, 300].map((delay) => (
                  <div
                    key={delay}
                    className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            )}

            {/* Manual load-more */}
            {!isInitialLoading &&
              !isLoadingMore &&
              !isProductsLoading &&
              hasMore &&
              products.length > 0 && (
                <div className="text-center py-8">
                  <button
                    onClick={() => fetchProducts(currentPage + 1, false)}
                    className={`px-6 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm"
                    }`}
                  >
                    {t("DynamicMarket.loadMore")}
                  </button>
                </div>
              )}
          </div>
          <div className="h-20" />
        </div>
      </div>
    </div>
  );
};

export default DynamicMarketPage;
