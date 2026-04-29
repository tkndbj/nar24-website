"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, Filter } from "lucide-react";
import SecondHeader from "../../components/market_screen/SecondHeader";
import ProductCard from "../../components/ProductCard";
import FilterSidebar, {
  FilterState,
  SpecFacets,
  EMPTY_FILTER_STATE,
  getActiveFiltersCount,
} from "@/app/components/FilterSideBar";
import { Product } from "@/app/models/Product";
import { impressionBatcher } from "@/app/utils/impressionBatcher";
import type { AllInOneCategoryData as AllInOneCategoryDataType } from "../../../constants/productData";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ProductsResponse {
  products: Product[];
  hasMore: boolean;
  page: number;
  total: number;
  specFacets?: SpecFacets;
}

interface AppLocalizations {
  [key: string]: string;
}

const createAppLocalizations = (
  t: (key: string) => string,
): AppLocalizations =>
  new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        try {
          return t(prop);
        } catch {
          return prop;
        }
      },
    },
  ) as AppLocalizations;

// Buyer (gender) categories: when URL `category=women|men`, the API expects
// `buyerCategory=Women|Men` instead of `category` so it filters by gender.
const BUYER_CATEGORY_KEYS = new Set(["women", "men"]);

function toBuyerCategory(slug: string): "Women" | "Men" | null {
  if (slug === "women") return "Women";
  if (slug === "men") return "Men";
  return null;
}

function formatPathSegment(seg: string): string {
  return seg
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function DynamicMarketPage() {
  const t = useTranslations();
  const l10n = useMemo(() => createAppLocalizations(t), [t]);

  const searchParams = useSearchParams();
  const router = useRouter();

  const category = searchParams.get("category") || "";
  const subcategory = searchParams.get("subcategory") || "";
  const subsubcategory = searchParams.get("subsubcategory") || "";

  // Lazy import for category localization helpers
  const [AllInOneCategoryData, setAllInOneCategoryData] =
    useState<typeof AllInOneCategoryDataType | null>(null);
  useEffect(() => {
    import("../../../constants/productData").then((mod) =>
      setAllInOneCategoryData(() => mod.AllInOneCategoryData),
    );
  }, []);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [categoryTitle, setCategoryTitle] = useState("Products");

  // ── Product state ──────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isProductsLoading, setIsProductsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTER_STATE);
  const [specFacets, setSpecFacets] = useState<SpecFacets>({});

  // Stable serialised key so fetch effects only re-run when filters truly change
  const filterKey = useMemo(() => {
    const sortedSpecFilters: Record<string, string[]> = {};
    Object.keys(filters.specFilters)
      .sort()
      .forEach((k) => {
        sortedSpecFilters[k] = [...filters.specFilters[k]].sort();
      });
    return JSON.stringify({
      subcategories: [...filters.subcategories].sort(),
      colors: [...filters.colors].sort(),
      brands: [...filters.brands].sort(),
      specFilters: sortedSpecFilters,
      minPrice: filters.minPrice,
      maxPrice: filters.maxPrice,
      minRating: filters.minRating,
    });
  }, [filters]);

  // Concurrency guards
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  // ── Side effects: impressions ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      impressionBatcher.flush();
    };
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) impressionBatcher.flush();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // ── Mobile detection ───────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Theme detection ────────────────────────────────────────────────────────
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

  // ── Lock body scroll while drawer is open ──────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = showMobileSidebar ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showMobileSidebar]);

  // ── Reset filters when context changes ─────────────────────────────────────
  useEffect(() => {
    setFilters(EMPTY_FILTER_STATE);
  }, [category, subcategory, subsubcategory]);

  // ── Localised category title ───────────────────────────────────────────────
  useEffect(() => {
    if (!category) {
      setCategoryTitle("Products");
      return;
    }

    const formattedCategory = formatPathSegment(category);
    let localizedCategory = formattedCategory;

    try {
      const buyerCategories = AllInOneCategoryData?.kBuyerCategories;
      if (
        buyerCategories &&
        Array.isArray(buyerCategories) &&
        AllInOneCategoryData
      ) {
        const isBuyerCategory = buyerCategories.some(
          (cat) => cat.key === formattedCategory,
        );
        if (isBuyerCategory) {
          localizedCategory = AllInOneCategoryData.localizeBuyerCategoryKey(
            formattedCategory,
            l10n,
          );
        }
      }
    } catch {
      /* fall through */
    }

    let title = localizedCategory;

    if (subcategory) {
      const formattedSubcategory = formatPathSegment(subcategory);
      let localizedSubcategory = formattedSubcategory;
      try {
        localizedSubcategory =
          AllInOneCategoryData?.localizeBuyerSubcategoryKey(
            formattedCategory,
            formattedSubcategory,
            l10n,
          ) ?? formattedSubcategory;
      } catch {
        /* keep raw */
      }
      title = `${localizedCategory} - ${localizedSubcategory}`;
    }

    if (subsubcategory) {
      const formattedSubSubcategory = formatPathSegment(subsubcategory);
      let localizedSubSubcategory = formattedSubSubcategory;
      if (
        subcategory &&
        (formattedCategory === "Women" || formattedCategory === "Men")
      ) {
        try {
          localizedSubSubcategory =
            AllInOneCategoryData?.localizeBuyerSubSubcategoryKey(
              formattedCategory,
              formatPathSegment(subcategory),
              formattedSubSubcategory,
              l10n,
            ) ?? formattedSubSubcategory;
        } catch {
          /* keep raw */
        }
      }
      title = `${title} - ${localizedSubSubcategory}`;
    }

    setCategoryTitle(title);
  }, [category, subcategory, subsubcategory, AllInOneCategoryData, l10n]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchProducts = useCallback(
    async (page: number, reset: boolean) => {
      if (!category) return;

      const mySeq = ++seqRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (reset) {
        setIsProductsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const buyerCategory = toBuyerCategory(category);
        const qp = new URLSearchParams();

        // For Women/Men, use buyerCategory (gender filter). For everything
        // else, pass the category slug — the API maps it to the canonical name.
        if (buyerCategory) {
          qp.set("buyerCategory", buyerCategory);
        } else {
          qp.set("category", category);
        }

        if (subcategory) qp.set("subcategory", formatPathSegment(subcategory));
        if (subsubcategory)
          qp.set("subsubcategory", formatPathSegment(subsubcategory));

        qp.set("page", page.toString());
        qp.set("sort", "date");

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
        for (const [field, vals] of Object.entries(filters.specFilters)) {
          if (vals.length > 0) qp.set(`spec_${field}`, vals.join(","));
        }

        const res = await fetch(`/api/fetchDynamicProducts?${qp}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: ProductsResponse = await res.json();

        if (mySeq !== seqRef.current) return;

        if (reset) {
          setProducts(data.products || []);
          if (data.specFacets) setSpecFacets(data.specFacets);
          setCurrentPage(0);
        } else {
          setProducts((prev) => [...prev, ...(data.products || [])]);
          setCurrentPage(page);
        }
        setHasMore(data.hasMore ?? false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        if (mySeq !== seqRef.current) return;
        console.error("[dynamicmarket] fetch error:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch products");
        if (reset) setProducts([]);
        setHasMore(false);
      } finally {
        if (mySeq === seqRef.current) {
          setIsInitialLoading(false);
          setIsProductsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [category, subcategory, subsubcategory, filters],
  );

  // Unified fetch effect — fires on any context/filter change
  useEffect(() => {
    if (!category) {
      setIsInitialLoading(false);
      return;
    }
    fetchProducts(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, subcategory, subsubcategory, filterKey]);

  // Cancel in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Infinite scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    let tid: NodeJS.Timeout;
    const onScroll = () => {
      clearTimeout(tid);
      tid = setTimeout(() => {
        if (
          window.innerHeight + document.documentElement.scrollTop >=
          document.documentElement.offsetHeight - 2500
        ) {
          if (hasMore && !isLoadingMore && !isProductsLoading) {
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
  }, [hasMore, isLoadingMore, isProductsLoading, currentPage, fetchProducts]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const activeCount = getActiveFiltersCount(filters, "dynamicMarket");

  const handleProductClick = useCallback(
    (productId: string) => router.push(`/productdetail/${productId}`),
    [router],
  );

  // The FilterSidebar uses the pretty buyer-category name when relevant
  const buyerCategoryProp = useMemo(() => {
    const bc = toBuyerCategory(category);
    return bc ?? "";
  }, [category]);

  // ── Skeleton ───────────────────────────────────────────────────────────────
  const Skeleton = () => {
    const shimmer = `shimmer-effect ${
      isDarkMode ? "shimmer-effect-dark" : "shimmer-effect-light"
    }`;
    const base = { backgroundColor: isDarkMode ? "#2d2b40" : "#f3f4f6" };
    const base2 = { backgroundColor: isDarkMode ? "#2d2b40" : "#e5e7eb" };
    return (
      <div
        className={`rounded-lg overflow-hidden ${
          isDarkMode ? "bg-gray-800" : "bg-white"
        }`}
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

  // ── No category selected ───────────────────────────────────────────────────
  if (!category) {
    return (
      <>
        <SecondHeader />
        <div
          className={`min-h-screen flex items-center justify-center isolate ${
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <SecondHeader />

      <div
        className={`min-h-screen w-full isolate ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="flex max-w-7xl mx-auto">
          {/* Desktop sidebar */}
          <div className="hidden lg:block w-60 flex-shrink-0">
            <FilterSidebar
              mode="dynamicMarket"
              category={buyerCategoryProp ? "" : category}
              selectedSubcategory={subcategory}
              buyerCategory={buyerCategoryProp}
              filters={filters}
              onFiltersChange={setFilters}
              specFacets={specFacets}
              isDarkMode={isDarkMode}
              className="w-60"
            />
          </div>

          {/* Mobile FAB */}
          <div className="lg:hidden fixed bottom-5 right-5 z-50">
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="relative p-3.5 rounded-full shadow-xl bg-orange-500 text-white"
              aria-label="Open filters"
            >
              <Filter size={22} />
              {activeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] leading-none font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {activeCount}
                </span>
              )}
            </button>
          </div>

          {/* Mobile sidebar (portal drawer) */}
          {isMobile && (
            <FilterSidebar
              mode="dynamicMarket"
              category={buyerCategoryProp ? "" : category}
              selectedSubcategory={subcategory}
              buyerCategory={buyerCategoryProp}
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

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="w-full pt-6 pb-4">
              <div className="px-4">
                <h1
                  className={`text-2xl font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {categoryTitle}
                </h1>
                {products.length > 0 && (
                  <p
                    className={`text-sm mt-1 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {products.length}{" "}
                    {t("DynamicMarket.products") || "products"}
                    {activeCount > 0 &&
                      ` (${activeCount} ${
                        t("DynamicMarket.filtersApplied") || "filters applied"
                      })`}
                  </p>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="px-4 pb-8">
              {/* Initial loading */}
              {isInitialLoading && (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} />
                  ))}
                </div>
              )}

              {/* Filter-change shimmer */}
              {!isInitialLoading && isProductsLoading && (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} />
                  ))}
                </div>
              )}

              {/* Error */}
              {error && !isInitialLoading && !isProductsLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <AlertCircle
                      size={48}
                      className="mx-auto mb-4 text-red-500"
                    />
                    <h2
                      className={`text-xl font-semibold mb-2 ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      Error Loading Products
                    </h2>
                    <p
                      className={`mb-4 ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {error}
                    </p>
                    <button
                      onClick={() => fetchProducts(0, true)}
                      className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}

              {/* Products */}
              {!isInitialLoading &&
                !isProductsLoading &&
                products.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-4">
                    {products.map((p) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        onTap={() => handleProductClick(p.id)}
                        showCartIcon
                        isFavorited={false}
                        isInCart={false}
                        portraitImageHeight={320}
                        isDarkMode={isDarkMode}
                        localization={t}
                      />
                    ))}
                  </div>
                )}

              {/* Empty state */}
              {!isInitialLoading &&
                !isProductsLoading &&
                !error &&
                products.length === 0 && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div
                        className={`text-6xl mb-4 ${
                          isDarkMode ? "text-gray-600" : "text-gray-300"
                        }`}
                      >
                        🛍️
                      </div>
                      <h2
                        className={`text-xl font-semibold mb-2 ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {t("DynamicMarket.noProductsFound") ||
                          "No Products Found"}
                      </h2>
                      <p
                        className={`${
                          isDarkMode ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {t("DynamicMarket.tryAdjustingFilters") ||
                          "No products available with the current filters."}
                      </p>
                      {activeCount > 0 && (
                        <button
                          onClick={() => setFilters(EMPTY_FILTER_STATE)}
                          className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                        >
                          {t("DynamicMarket.clearAllFilters") ||
                            "Clear All Filters"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

              {/* Loading more */}
              {isLoadingMore && (
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
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
