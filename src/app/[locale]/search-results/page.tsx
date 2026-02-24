"use client";

// ═══════════════════════════════════════════════════════════════════════════
// SearchResultsPage
//
// Mirrors Flutter's SearchResultsScreen exactly:
//
//   Layout:  desktop two-column (FilterSidebar + results)
//            mobile FAB → portal drawer
//
//   Fetch:   /api/searchProducts (Typesense)
//              • unfiltered → both indexes merged, boosted first
//              • filtered / sorted → shop_products only
//              • specFacets returned on page 0 → populates sidebar
//
//   Shops:   Typesense via /api/searchProducts — returned in data.shops on page 0
//
//   Filter:  FilterSidebar (reusable, same as DynamicMarketPage)
//            No category context → "Categories" section hidden
//            specFacets are query-scoped
//
//   Active filter chips: handled inside FilterSidebar header
// ═══════════════════════════════════════════════════════════════════════════

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { impressionBatcher } from "@/app/utils/impressionBatcher";
import {
  ArrowLeft,
  Filter,
  SortAsc,
  ChevronDown,
  AlertCircle,
  RefreshCw,
  WifiOff,
  Search,
  Store,
} from "lucide-react";
import { ProductCard } from "@/app/components/ProductCard";
import { Product, ProductUtils } from "@/app/models/Product";
import ShopCard from "@/app/components/shops/ShopCard";
import { Timestamp } from "firebase/firestore";
import FilterSidebar, {
  FilterState,
  SpecFacets,
  EMPTY_FILTER_STATE,
  getActiveFiltersCount,
} from "@/app/components/FilterSideBar";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Shop {
  id: string;
  name: string;
  profileImageUrl: string;
  coverImageUrls: string[];
  address: string;
  averageRating: number;
  reviewCount: number;
  followerCount: number;
  clickCount: number;
  categories: string[];
  contactNo: string;
  ownerId: string;
  isBoosted: boolean;
  isActive?: boolean;
  createdAt: Timestamp;
}

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
      return "relevance";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const LoadingShimmer: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const shimmer = `shimmer-effect ${isDarkMode ? "shimmer-effect-dark" : "shimmer-effect-light"}`;
  const base = { backgroundColor: isDarkMode ? "#374151" : "#f3f4f6" };
  const base2 = { backgroundColor: isDarkMode ? "#374151" : "#e5e7eb" };
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={`rounded-lg overflow-hidden ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
        >
          <div
            className="w-full relative overflow-hidden"
            style={{ height: 300, ...base }}
          >
            <div className={shimmer} />
          </div>
          <div className="p-3 space-y-2">
            {[80, 55].map((w, j) => (
              <div
                key={j}
                className="h-3 rounded relative overflow-hidden"
                style={{ width: `${w}%`, ...base2 }}
              >
                <div className={shimmer} />
              </div>
            ))}
            <div
              className="h-4 rounded relative overflow-hidden"
              style={{ width: "42%", ...base2 }}
            >
              <div className={shimmer} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const ErrorState: React.FC<{
  onRetry: () => void;
  isNetworkError: boolean;
  isDarkMode: boolean;
  t: ReturnType<typeof useTranslations>;
}> = ({ onRetry, isNetworkError, isDarkMode, t }) => (
  <div className="flex flex-col items-center justify-center min-h-[50vh] px-4">
    <div className="text-center space-y-5 max-w-sm">
      {isNetworkError ? (
        <WifiOff
          size={72}
          className={`mx-auto ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
        />
      ) : (
        <AlertCircle
          size={72}
          className={`mx-auto ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
        />
      )}
      <div className="space-y-2">
        <h3
          className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
        >
          {isNetworkError
            ? t("noInternet") || "Connection Error"
            : t("searchFailedTryAgain") || "Search Failed"}
        </h3>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
      >
        <RefreshCw size={15} />
        {t("retry") || "Retry"}
      </button>
    </div>
  </div>
);

const EmptyState: React.FC<{
  query: string;
  hasFilters: boolean;
  onClearFilters: () => void;
  isDarkMode: boolean;
  t: ReturnType<typeof useTranslations>;
}> = ({ query, hasFilters, onClearFilters, isDarkMode, t }) => (
  <div className="flex flex-col items-center justify-center min-h-[50vh] px-4">
    <div className="text-center space-y-5 max-w-sm">
      <Search
        size={72}
        strokeWidth={1}
        className={`mx-auto ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
      />
      <div className="space-y-2">
        <h3
          className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
        >
          {t("noProductsFound") || "No Products Found"}
        </h3>
        <p
          className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
        >
          {hasFilters
            ? "Try removing some filters to see more results."
            : `We couldn't find anything matching "${query}".`}
        </p>
      </div>
      {hasFilters && (
        <button
          onClick={onClearFilters}
          className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          {t("clearAllFilters") || "Clear Filters"}
        </button>
      )}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function SearchResultsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations();
  const abortRef = useRef<AbortController | null>(null);

  const query = (searchParams.get("q") || "").trim();

  // ── UI state ───────────────────────────────────────────────────────────────
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [selectedSort, setSelectedSort] = useState<SortOption>("None");

  // ── Product state ──────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [streamedProducts, setStreamedProducts] = useState<Product[]>([]);
  const streamIndexRef = useRef(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [isNetworkError, setIsNetworkError] = useState(false);
  const fetchDoneRef = useRef(false);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTER_STATE);
  const [specFacets, setSpecFacets] = useState<SpecFacets>({});

  // ── Shop state (populated from /api/searchProducts on page 0) ─────────────
  const [shops, setShops] = useState<Shop[]>([]);

  // Stable filter key to avoid excess re-renders
  const filterKey = useMemo(
    () =>
      JSON.stringify({
        colors: [...filters.colors].sort(),
        brands: [...filters.brands].sort(),
        specFilters: filters.specFilters,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        minRating: filters.minRating,
        // Note: subcategories not used in search (no category context)
      }),
    [filters],
  );

  // ── Streaming ──────────────────────────────────────────────────────────────
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
    const f = () => {
      if (document.hidden) impressionBatcher.flush();
    };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
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

  // ── Product search ─────────────────────────────────────────────────────────

  const fetchProducts = useCallback(
    async (page: number, reset: boolean) => {
      if (!query) return;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        if (reset) {
          setIsProductsLoading(true);
          setProducts([]);
          setCurrentPage(0);
          setHasMore(false);
          setHasError(false);
          setIsNetworkError(false);
          fetchDoneRef.current = false;
        } else {
          setIsLoadingMore(true);
        }

        const qp = new URLSearchParams({
          q: query,
          page: page.toString(),
          sort: toSortCode(selectedSort),
        });

        if (filters.colors.length > 0)
          qp.set("colors", filters.colors.join(","));
        if (filters.brands.length > 0)
          qp.set("brands", filters.brands.join(","));
        if (filters.minPrice !== undefined)
          qp.set("minPrice", String(filters.minPrice));
        if (filters.maxPrice !== undefined)
          qp.set("maxPrice", String(filters.maxPrice));
        if (filters.minRating !== undefined)
          qp.set("minRating", String(filters.minRating));
        for (const [field, vals] of Object.entries(filters.specFilters)) {
          if (vals.length > 0) qp.set(`spec_${field}`, vals.join(","));
        }

        const res = await fetch(`/api/searchProducts?${qp}`, {
          signal: abortRef.current.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const newProducts: Product[] = (data.products ?? []).map(
          (raw: Record<string, unknown>) => ProductUtils.fromJson(raw),
        );

        if (reset) {
          setProducts(newProducts);
          if (data.specFacets) setSpecFacets(data.specFacets as SpecFacets);
          // Shops arrive in the page-0 API response — reconstruct Timestamp objects
          if (Array.isArray(data.shops)) {
            const shopResults = (
              data.shops as Array<
                Omit<Shop, "createdAt"> & {
                  createdAt: { seconds: number; nanoseconds: number };
                }
              >
            ).map((s) => ({
              ...s,
              createdAt: new Timestamp(
                s.createdAt.seconds,
                s.createdAt.nanoseconds,
              ),
            }));
            setShops(shopResults);
          }
        } else {
          setProducts((prev) => [...prev, ...newProducts]);
        }

        setHasMore(data.hasMore ?? false);
        setCurrentPage(page);
        fetchDoneRef.current = true;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const isNet =
          !navigator.onLine ||
          (err instanceof Error && err.message.toLowerCase().includes("fetch"));
        setIsNetworkError(isNet);
        setHasError(true);
      } finally {
        setIsInitialLoading(false);
        setIsProductsLoading(false);
        setIsLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, selectedSort, filterKey],
  );

  // ── Trigger effects ────────────────────────────────────────────────────────

  // Reset + fetch when query changes
  useEffect(() => {
    if (query) {
      setFilters(EMPTY_FILTER_STATE);
      setSpecFacets({});
      setIsInitialLoading(true);
      fetchProducts(0, true); // shops arrive in data.shops on page 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Re-fetch when sort or filters change (query stayed the same)
  useEffect(() => {
    if (query) fetchProducts(0, true);
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
          if (hasMore && !isLoadingMore && fetchDoneRef.current) {
            fetchProducts(currentPage + 1, false);
          }
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
        return t("DynamicMarket.sortNone") || "Relevance";
      case "Alphabetical":
        return t("DynamicMarket.sortAlphabetical") || "A–Z";
      case "Date":
        return t("DynamicMarket.sortDate") || "Newest";
      case "Price Low to High":
        return t("DynamicMarket.sortPriceLowToHigh") || "Price ↑";
      case "Price High to Low":
        return t("DynamicMarket.sortPriceHighToLow") || "Price ↓";
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className={`min-h-screen w-full ${isDarkMode ? "bg-gray-950" : "bg-gray-50"}`}
    >
      <div className="flex max-w-7xl mx-auto">
        {/* ── Desktop sidebar ── */}
        <div className="hidden lg:block w-60 flex-shrink-0">
          <FilterSidebar
            // No category context → Categories section hidden automatically
            category=""
            buyerCategory=""
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
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Mobile sidebar drawer ── */}
        {isMobile && (
          <FilterSidebar
            category=""
            buyerCategory=""
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
          {/* ── Sticky header ── */}
          <div
            className={`sticky top-0 z-10 border-b backdrop-blur-xl ${
              isDarkMode
                ? "bg-gray-900/95 border-white/[0.07]"
                : "bg-white/95 border-gray-100"
            }`}
          >
            <div className="px-4 py-3 flex items-center gap-3">
              {/* Back */}
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

              {/* Query display */}
              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm font-semibold truncate block ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {query ? (
                    <>
                      <span
                        className={`font-normal ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                      >
                        {t("searchResults.searchingFor") || "Results for"}{" "}
                      </span>
                      &ldquo;{query}&rdquo;
                    </>
                  ) : (
                    t("searchResults.title") || "Search Results"
                  )}
                </span>
              </div>

              {/* Mobile active-filter badge */}
              {activeCount > 0 && (
                <button
                  onClick={() => setShowMobileSidebar(true)}
                  className={`lg:hidden flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-semibold ${
                    isDarkMode
                      ? "bg-orange-900/40 text-orange-400"
                      : "bg-orange-100 text-orange-600"
                  }`}
                >
                  {activeCount} {t("DynamicMarket.filtersApplied") || "filters"}
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
                      : t("DynamicMarket.sort") || "Sort"}
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

          {/* ── Content area ── */}
          <div className="p-4 relative space-y-6">
            {/* ── Filter-change overlay ── */}
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
                    {t("DynamicMarket.updatingProducts") || "Updating…"}
                  </p>
                </div>
              </div>
            )}

            {/* ── Initial skeleton ── */}
            {isInitialLoading && <LoadingShimmer isDarkMode={isDarkMode} />}

            {/* ── Error ── */}
            {!isInitialLoading && hasError && (
              <ErrorState
                onRetry={() => {
                  setHasError(false);
                  fetchProducts(0, true);
                }}
                isNetworkError={isNetworkError}
                isDarkMode={isDarkMode}
                t={t}
              />
            )}

            {/* ── Shops section ── */}
            {!isInitialLoading && !hasError && shops.length > 0 && (
              <div>
                <div
                  className={`flex items-center gap-2 mb-3 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  <Store size={15} className="text-orange-400 flex-shrink-0" />
                  <h3 className="text-sm font-bold">
                    {t("searchResults.relatedShops") || "Related Shops"}
                  </h3>
                  {shops.length > 0 && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"}`}
                    >
                      {shops.length}
                    </span>
                  )}
                </div>

                {
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
                    {shops.map((shop) => (
                      <div key={shop.id} className="flex-shrink-0 w-72">
                        <ShopCard shop={shop} isDarkMode={isDarkMode} />
                      </div>
                    ))}
                  </div>
                }
              </div>
            )}

            {/* ── Products ── */}
            {!isInitialLoading && !hasError && (
              <>
                {/* Section header */}
                {(streamedProducts.length > 0 || fetchDoneRef.current) && (
                  <div
                    className={`flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    <div className="w-1 h-6 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full" />
                    <h3 className="text-sm font-bold">
                      {t("DynamicMarket.allProducts") || "Products"}
                    </h3>
                    {products.length > 0 && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"}`}
                      >
                        {products.length}
                        {hasMore ? "+" : ""}
                      </span>
                    )}
                    {activeCount > 0 && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${isDarkMode ? "bg-orange-900/30 text-orange-400" : "bg-orange-100 text-orange-600"}`}
                      >
                        {activeCount}{" "}
                        {t("DynamicMarket.filtersApplied") || "filters"}
                      </span>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {fetchDoneRef.current &&
                  products.length === 0 &&
                  !isProductsLoading && (
                    <EmptyState
                      query={query}
                      hasFilters={activeCount > 0}
                      onClearFilters={() => setFilters(EMPTY_FILTER_STATE)}
                      isDarkMode={isDarkMode}
                      t={t}
                    />
                  )}

                {/* Product grid */}
                {streamedProducts.length > 0 && (
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
                        portraitImageHeight={300}
                        isDarkMode={isDarkMode}
                        localization={t}
                      />
                    ))}
                    {/* Trailing stream skeletons */}
                    {streamIndexRef.current < products.length &&
                      Array.from({
                        length: Math.min(
                          4,
                          products.length - streamedProducts.length,
                        ),
                      }).map((_, i) => (
                        <LoadingShimmer
                          key={`s-${i}`}
                          isDarkMode={isDarkMode}
                        />
                      ))}
                  </div>
                )}
              </>
            )}

            {/* ── Load-more dots ── */}
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

            {/* ── Manual load-more button ── */}
            {!isInitialLoading &&
              !isLoadingMore &&
              !isProductsLoading &&
              hasMore &&
              products.length > 0 && (
                <div className="text-center py-4">
                  <button
                    onClick={() => fetchProducts(currentPage + 1, false)}
                    className={`px-6 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm"
                    }`}
                  >
                    {t("DynamicMarket.loadMore") || "Load More"}
                  </button>
                </div>
              )}
          </div>
          <div className="h-20" />
        </div>
      </div>
    </div>
  );
}
