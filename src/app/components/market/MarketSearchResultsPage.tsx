// components/market/MarketSearchResultsPage.tsx
//
// Web port of lib/screens/market/market_search_results_screen.dart.
//
// Global search across all categories (uses searchItemsGlobal + fetchFacetsGlobal).
// Three facet groups: category, brand, type — all disjunctive via multi_search.
//
// Web deviations from Flutter:
//   • URL is the source of truth: `?q=<query>` is read on mount and pushed back
//     on submit. This keeps the browser back/forward buttons working correctly
//     and makes results shareable. Flutter passes `initialQuery` as a ctor arg.
//   • Responsive grid (2 → 3 → 4 → 5 cols) — matches the category detail page.
//   • Typing in the search field debounces 300ms before re-querying, so a user
//     who types "to" doesn't kick off three successive searches for "t", "to".
//     Flutter submits only on keyboard-search (onSubmitted). I match behavior
//     for the URL-sync (only updates on submit) but debounce locally for the
//     query string so you can refine without hitting Enter each time.
//   • Cart FAB becomes a bottom-bar on mobile, corner pill on desktop — same
//     pattern we used for the category detail page.
//   • Infinite scroll uses IntersectionObserver on a sentinel div, same as
//     category detail.
//   • Reuses MarketItemCard (extracted earlier from the category detail page).
//
// If you haven't extracted MarketItemCard into its own file yet, see the
// companion note — it's a rote copy-out with a one-line path change.

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  Search,
  SearchX,
  ShoppingBag,
  X,
} from "lucide-react";

import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/context/UserProvider";
import { useMarketCart } from "@/context/MarketCartProvider";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import {
  MARKET_GLOBAL_FACETS_EMPTY,
  type MarketFacetValue,
  type MarketGlobalFacets,
  type MarketItem,
  type MarketSortOption,
} from "@/lib/typesense_market_service";
import { MARKET_CATEGORY_MAP } from "@/constants/marketCategories";
import MarketItemCard from "./MarketItemCard";
import LoginModal from "../../components/LoginModal";

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const SENTINEL_MARGIN = "400px"; // matches Flutter's 400px lookahead

// ════════════════════════════════════════════════════════════════════════════
// PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function MarketSearchResultsPage() {
  const t = useTranslations("market");
  const isDarkMode = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const cart = useMarketCart();

  const urlQuery = searchParams.get("q") ?? "";

  // ── State ────────────────────────────────────────────────────────────────
  const [queryInput, setQueryInput] = useState(urlQuery);
  const [activeQuery, setActiveQuery] = useState(urlQuery);

  const [items, setItems] = useState<MarketItem[]>([]);
  const [facets, setFacets] = useState<MarketGlobalFacets>(
    MARKET_GLOBAL_FACETS_EMPTY,
  );

  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(),
  );

  const [sortOption] = useState<MarketSortOption>("newest");

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const [showLogin, setShowLogin] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const pageRef = useRef(0);
  const fetchTokenRef = useRef(0); // cancel stale in-flight requests
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Derived ──────────────────────────────────────────────────────────────
  const hasFilters =
    selectedBrands.size > 0 ||
    selectedTypes.size > 0 ||
    selectedCategories.size > 0;

  // ── Auth gate for cards ──────────────────────────────────────────────────
  const requireAuth = useCallback((): boolean => {
    if (user) return true;
    setShowLogin(true);
    return false;
  }, [user]);

  // ── URL sync (q) ─────────────────────────────────────────────────────────
  // When the URL's `q` changes externally (browser back, deep link), mirror
  // it into local state. When the user submits, we push a new URL entry.
  useEffect(() => {
    setQueryInput(urlQuery);
    setActiveQuery(urlQuery);
  }, [urlQuery]);

  const submitQuery = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed === activeQuery) return;
      // Push so the back button undoes the search.
      router.push(
        trimmed ? `/market-search?q=${encodeURIComponent(trimmed)}` : "/market-search",
      );
    },
    [activeQuery, router],
  );

  const handleFormSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      submitQuery(queryInput);
    },
    [queryInput, submitQuery],
  );

  // ── Fetch ────────────────────────────────────────────────────────────────

  const buildArgs = useCallback(
    (page: number) => ({
      query: activeQuery,
      sort: sortOption,
      page,
      hitsPerPage: PAGE_SIZE,
      brands: selectedBrands.size ? Array.from(selectedBrands) : undefined,
      types: selectedTypes.size ? Array.from(selectedTypes) : undefined,
      categories: selectedCategories.size
        ? Array.from(selectedCategories)
        : undefined,
    }),
    [
      activeQuery,
      sortOption,
      selectedBrands,
      selectedTypes,
      selectedCategories,
    ],
  );

  // Kick off a fresh page-0 load whenever the query / filters / sort change.
  useEffect(() => {
    fetchTokenRef.current += 1;
    const token = fetchTokenRef.current;

    pageRef.current = 0;
    setIsLoading(true);
    setHasMore(false);

    const svc = TypeSenseServiceManager.instance.marketService;

    const run = async () => {
      try {
        const [page, nextFacets] = await Promise.all([
          svc.searchItemsGlobal(buildArgs(0)),
          svc.fetchFacetsGlobal({
            query: activeQuery,
            selectedBrands: selectedBrands.size
              ? Array.from(selectedBrands)
              : undefined,
            selectedTypes: selectedTypes.size
              ? Array.from(selectedTypes)
              : undefined,
            selectedCategories: selectedCategories.size
              ? Array.from(selectedCategories)
              : undefined,
          }),
        ]);

        if (token !== fetchTokenRef.current) return;

        setItems(page.items);
        setFacets(nextFacets);
        setHasMore(
          page.items.length >= PAGE_SIZE && page.page + 1 < page.nbPages,
        );
      } catch (err) {
        if (token !== fetchTokenRef.current) return;
        console.warn("[MarketSearch] fetch error:", err);
        setItems([]);
      } finally {
        if (token === fetchTokenRef.current) setIsLoading(false);
      }
    };

    void run();
  }, [
    activeQuery,
    sortOption,
    selectedBrands,
    selectedTypes,
    selectedCategories,
    buildArgs,
  ]);

  // ── Infinite scroll ──────────────────────────────────────────────────────

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (isLoading || isLoadingMore || !hasMore) return;

        const token = fetchTokenRef.current;
        setIsLoadingMore(true);

        const svc = TypeSenseServiceManager.instance.marketService;
        const nextPage = pageRef.current + 1;

        svc
          .searchItemsGlobal(buildArgs(nextPage))
          .then((page) => {
            if (token !== fetchTokenRef.current) return;
            pageRef.current = nextPage;
            setItems((prev) => [...prev, ...page.items]);
            setHasMore(
              page.items.length >= PAGE_SIZE && page.page + 1 < page.nbPages,
            );
          })
          .catch((err) => {
            if (token !== fetchTokenRef.current) return;
            console.warn("[MarketSearch] load-more error:", err);
          })
          .finally(() => {
            if (token === fetchTokenRef.current) setIsLoadingMore(false);
          });
      },
      { rootMargin: SENTINEL_MARGIN },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, buildArgs]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const toggleBrand = useCallback((value: string) => {
    setSelectedBrands((prev) => toggleInSet(prev, value));
  }, []);

  const toggleType = useCallback((value: string) => {
    setSelectedTypes((prev) => toggleInSet(prev, value));
  }, []);

  const toggleCategory = useCallback((value: string) => {
    setSelectedCategories((prev) => toggleInSet(prev, value));
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedBrands(new Set());
    setSelectedTypes(new Set());
    setSelectedCategories(new Set());
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <main
      className={`flex-1 min-h-screen ${
        isDarkMode ? "bg-[#1C1A29]" : "bg-[#F5F5F5]"
      }`}
    >
      <TopBar
        queryInput={queryInput}
        setQueryInput={setQueryInput}
        onSubmit={handleFormSubmit}
        onClearQuery={() => {
          setQueryInput("");
          submitQuery("");
        }}
        onBack={() => router.back()}
      />

      <FacetBar
        facets={facets}
        selectedBrands={selectedBrands}
        selectedTypes={selectedTypes}
        selectedCategories={selectedCategories}
        onToggleBrand={toggleBrand}
        onToggleType={toggleType}
        onToggleCategory={toggleCategory}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        isDarkMode={isDarkMode}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28">
        {/* Result count / active query summary */}
        {!isLoading && activeQuery && (
          <p
            className={`mb-4 text-sm ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {items.length > 0
              ? t("searchResultsFor", { query: activeQuery })
              : null}
          </p>
        )}

        {isLoading ? (
          <ResultsGrid>
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} isDarkMode={isDarkMode} />
            ))}
          </ResultsGrid>
        ) : items.length === 0 ? (
          <EmptyState
            isDarkMode={isDarkMode}
            query={activeQuery}
            hasFilters={hasFilters}
            onClearFilters={clearFilters}
          />
        ) : (
          <>
            <ResultsGrid>
              {items.map((item) => (
                <MarketItemCard
                  key={item.id}
                  item={item}
                  isDarkMode={isDarkMode}
                  requireAuth={requireAuth}
                />
              ))}
            </ResultsGrid>

            <div ref={sentinelRef} aria-hidden className="h-px" />
            {isLoadingMore && (
              <div className="flex justify-center py-6">
                <span
                  role="status"
                  aria-label={t("loading")}
                  className="w-6 h-6 border-[3px] border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Cart CTA */}
      {cart.itemCount > 0 && (
        <Link
          href="/market-cart"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-30 inline-flex items-center justify-center sm:justify-start gap-3 px-5 py-3.5 rounded-2xl bg-[#00A86B] text-white font-bold shadow-lg hover:bg-emerald-700 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="tabular-nums">
            {t("cartItemCount", { count: cart.itemCount })} ·{" "}
            {cart.totals.subtotal.toFixed(0)} TL
          </span>
        </Link>
      )}

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TOP BAR (search field)
// ════════════════════════════════════════════════════════════════════════════

function TopBar({
  queryInput,
  setQueryInput,
  onSubmit,
  onClearQuery,
  onBack,
}: {
  queryInput: string;
  setQueryInput: (v: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onClearQuery: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("market");

  return (
    <header className="sticky top-0 z-20 bg-[#00A86B] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("back")}
          className="-ml-2 p-2 rounded-full hover:bg-white/10 outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <form
          onSubmit={onSubmit}
          role="search"
          aria-label={t("search")}
          className="flex-1 min-w-0"
        >
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70 pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder={t("searchHint")}
              aria-label={t("search")}
              autoFocus={!queryInput}
              enterKeyHint="search"
              className="w-full h-10 pl-10 pr-9 rounded-xl bg-white/18 placeholder-white/70 text-white text-sm outline-none focus:bg-white/25 transition-colors"
            />
            {queryInput && (
              <button
                type="button"
                onClick={onClearQuery}
                aria-label={t("clearSearch")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>
    </header>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FACET BAR
// ════════════════════════════════════════════════════════════════════════════

function FacetBar({
  facets,
  selectedBrands,
  selectedTypes,
  selectedCategories,
  onToggleBrand,
  onToggleType,
  onToggleCategory,
  hasFilters,
  onClearFilters,
  isDarkMode,
}: {
  facets: MarketGlobalFacets;
  selectedBrands: Set<string>;
  selectedTypes: Set<string>;
  selectedCategories: Set<string>;
  onToggleBrand: (v: string) => void;
  onToggleType: (v: string) => void;
  onToggleCategory: (v: string) => void;
  hasFilters: boolean;
  onClearFilters: () => void;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");
  const locale = useLocale();

  const anyFacets = useMemo(
    () =>
      facets.categories.length > 0 ||
      facets.brands.length > 0 ||
      facets.types.length > 0,
    [facets],
  );

  if (!anyFacets) return null;

  const categoryLabel = (slug: string): string => {
    const cat = MARKET_CATEGORY_MAP.get(slug);
    if (!cat) return slug;
    return locale === "tr" ? cat.labelTr : cat.label;
  };

  return (
    <div
      className={`border-b ${
        isDarkMode
          ? "bg-[#2D2B3F] border-white/10"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {hasFilters && (
          <div className="flex justify-end mb-1">
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              <X className="w-3 h-3" />
              {t("clearFilters")}
            </button>
          </div>
        )}

        {facets.categories.length > 0 && (
          <FacetSection
            title={t("categoriesHeader")}
            values={facets.categories}
            selected={selectedCategories}
            onToggle={onToggleCategory}
            labelFormatter={categoryLabel}
            isDarkMode={isDarkMode}
          />
        )}
        {facets.brands.length > 0 && (
          <FacetSection
            title={t("facetBrand")}
            values={facets.brands}
            selected={selectedBrands}
            onToggle={onToggleBrand}
            isDarkMode={isDarkMode}
          />
        )}
        {facets.types.length > 0 && (
          <FacetSection
            title={t("facetType")}
            values={facets.types}
            selected={selectedTypes}
            onToggle={onToggleType}
            isDarkMode={isDarkMode}
          />
        )}
      </div>
    </div>
  );
}

function FacetSection({
  title,
  values,
  selected,
  onToggle,
  labelFormatter,
  isDarkMode,
}: {
  title: string;
  values: MarketFacetValue[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  labelFormatter?: (value: string) => string;
  isDarkMode: boolean;
}) {
  return (
    <div className="mt-2 first:mt-0">
      <p
        className={`px-1 mb-1.5 text-[11px] font-bold uppercase tracking-wide ${
          isDarkMode ? "text-gray-500" : "text-gray-500"
        }`}
      >
        {title}
      </p>
      <div
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {values.map((fv) => {
          const isSelected = selected.has(fv.value);
          const label = labelFormatter ? labelFormatter(fv.value) : fv.value;
          return (
            <button
              key={fv.value}
              type="button"
              onClick={() => onToggle(fv.value)}
              aria-pressed={isSelected}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isSelected
                  ? "bg-emerald-600 text-white border border-emerald-600"
                  : isDarkMode
                    ? "bg-[#1C1A29] text-gray-300 border border-white/10 hover:border-gray-500"
                    : "bg-gray-100 text-gray-700 border border-gray-200 hover:border-gray-300"
              }`}
            >
              <span>{label}</span>
              <span
                className={`text-[10px] ${
                  isSelected
                    ? "text-white/75"
                    : isDarkMode
                      ? "text-gray-500"
                      : "text-gray-400"
                }`}
              >
                {fv.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// GRID + SKELETON
// ════════════════════════════════════════════════════════════════════════════

function ResultsGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 items-start"
      style={{ gridAutoRows: "min-content" }}
    >
      {children}
    </div>
  );
}

function CardSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  const bg = isDarkMode ? "bg-[#3A3850]" : "bg-gray-200";
  return (
    <div
      className={`rounded-2xl overflow-hidden animate-pulse ${
        isDarkMode ? "bg-[#2D2B3F]" : "bg-white"
      }`}
    >
      <div className={`aspect-square ${bg}`} />
      <div className="p-3 space-y-2">
        <div className={`h-2.5 w-14 rounded ${bg}`} />
        <div className={`h-3 w-3/4 rounded ${bg}`} />
        <div className={`h-3.5 w-16 rounded mt-3 ${bg}`} />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ════════════════════════════════════════════════════════════════════════════

function EmptyState({
  isDarkMode,
  query,
  hasFilters,
  onClearFilters,
}: {
  isDarkMode: boolean;
  query: string;
  hasFilters: boolean;
  onClearFilters: () => void;
}) {
  const t = useTranslations("market");

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
          isDarkMode ? "bg-[#2D2B3F]" : "bg-gray-100"
        }`}
      >
        <SearchX
          className={`w-7 h-7 ${
            isDarkMode ? "text-gray-500" : "text-gray-400"
          }`}
          aria-hidden
        />
      </div>
      <h2
        className={`mt-4 text-base font-semibold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {t("noProductsFound")}
      </h2>
      <p
        className={`mt-1.5 text-sm max-w-xs ${
          isDarkMode ? "text-gray-500" : "text-gray-500"
        }`}
      >
        {query
          ? t("searchNoResultsSubtitle", { query })
          : t("searchTryAnotherQuery")}
      </p>
      {hasFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
        >
          {t("clearFilters")}
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// UTIL
// ════════════════════════════════════════════════════════════════════════════

function toggleInSet(prev: Set<string>, value: string): Set<string> {
  const next = new Set(prev);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}