// components/market/MarketCategoryDetailPage.tsx
//
// Web port of lib/screens/market/market_category_detail_screen.dart.
//
// DATA ROUTING (identical to Flutter):
//   Default browsing (no search, no filters, sort=newest) → Firestore
//   Search / brand filter / type filter / non-default sort  → Typesense
//   Facets                                                   → always Typesense
//
// WEB DEVIATIONS (intentional — not blind 1:1):
//   • 2-col grid on mobile scales to 3/4/5 on larger screens.
//   • Cart surfaces as a floating bottom bar on mobile and a corner FAB on
//     desktop — same info as Flutter, different placement for thumb vs. cursor.
//   • Login gate: when an unauthenticated user clicks Add, we open LoginModal
//     via the `requireAuth()` pattern.
//   • Nutrition info opens INLINE in the card (per user's answer).
//   • Full-screen image uses our ImageLightbox with pinch-zoom.

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  ArrowLeft,
  ArrowUpDown,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";

import { db } from "@/lib/firebase";
import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/context/UserProvider";
import { useMarketCart } from "@/context/MarketCartProvider";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import {
  MARKET_FACETS_EMPTY,
  type MarketFacetValue,
  type MarketFacets,
  type MarketItem,
  type MarketSortOption,
} from "@/lib/typesense_market_service";
import { MARKET_CATEGORY_MAP } from "@/constants/marketCategories";
import MarketItemCard from "./MarketItemCard";

// ── Import your project's LoginModal. Adjust the path if yours differs. ─────
// Contract expected: `{ isOpen: boolean; onClose: () => void; ... }`
import LoginModal from "../../components/LoginModal";

// ────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const SCROLL_LOAD_MORE_MARGIN = "300px";
const SORT_CYCLE: MarketSortOption[] = [
  "newest",
  "priceAsc",
  "priceDesc",
  "nameAsc",
];

interface Props {
  categorySlug: string;
  /**
   * Optional first page of items, pre-fetched on the server. When provided,
   * we paint immediately and skip the initial client-side Firestore fetch.
   * Pagination then continues using a `createdAt` cursor (since the query
   * orders by `createdAt desc`).
   */
  initialItems?: MarketItem[] | null;
}

export default function MarketCategoryDetailPage({
  categorySlug,
  initialItems,
}: Props) {
  const t = useTranslations("market");
  const locale = useLocale();
  const isDarkMode = useTheme();
  const router = useRouter();
  const { user } = useUser();
  const cart = useMarketCart();

  const category = MARKET_CATEGORY_MAP.get(categorySlug) ?? null;
  const categoryLabel =
    category == null
      ? t("categoryFallbackTitle")
      : locale === "tr"
        ? category.labelTr
        : category.label;

  // ── Seed flag (frozen at first render) ───────────────────────────────────
  // We need a stable reference to "did we receive SSR data?" — taken once at
  // mount so prop identity changes from the parent can't flip the path.
  const seededRef = useRef<boolean>(
    Array.isArray(initialItems) && initialItems.length > 0,
  );
  const seededItemsRef = useRef<MarketItem[]>(
    Array.isArray(initialItems) ? initialItems : [],
  );

  // ── Local state ──────────────────────────────────────────────────────────

  const [items, setItems] = useState<MarketItem[]>(
    () => seededItemsRef.current,
  );
  const [facets, setFacets] = useState<MarketFacets>(() => {
    // Stale-while-revalidate: seed chips from cache for instant paint.
    return (
      TypeSenseServiceManager.instance.marketService.cachedUnfilteredFacets(
        categorySlug,
      ) ?? MARKET_FACETS_EMPTY
    );
  });
  // Tracks whether the first Typesense facets fetch has completed.
  // - Initially true if we already have cached facets (no need to show skeleton).
  // - Flips to true after the first fetchFacets() resolves (success OR error)
  //   so subsequent filter changes update chips in place without flashing the
  //   skeleton again.
  const [hasLoadedFacets, setHasLoadedFacets] = useState(() => {
    const cached =
      TypeSenseServiceManager.instance.marketService.cachedUnfilteredFacets(
        categorySlug,
      );
    return cached != null;
  });
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [sortOption, setSortOption] = useState<MarketSortOption>("newest");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // When seeded, skip the initial full-page skeleton — we already have items.
  const [isLoading, setIsLoading] = useState(() => !seededRef.current);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(
    () => seededItemsRef.current.length >= PAGE_SIZE,
  );
  const [showLogin, setShowLogin] = useState(false);

  // ── Refs for cursor + fetch lifecycle ────────────────────────────────────

  const tsPageRef = useRef(0);
  const lastFsDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  // Fallback cursor for the first paginated fetch after an SSR seed: we don't
  // have a DocumentSnapshot from the server, so we cursor by the last item's
  // `createdAt` (the orderBy field). Once a real client-side page returns,
  // `lastFsDocRef` takes over and this is ignored.
  const lastFsCreatedAtRef = useRef<number | null>(
    seededItemsRef.current.length > 0
      ? seededItemsRef.current[seededItemsRef.current.length - 1].createdAt
      : null,
  );
  const fetchTokenRef = useRef(0); // invalidates stale in-flight fetches
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Derived flags ────────────────────────────────────────────────────────

  const hasActiveFilters =
    debouncedQuery.trim().length > 0 ||
    selectedBrands.size > 0 ||
    selectedTypes.size > 0 ||
    sortOption !== "newest";

  const useFirestore = !hasActiveFilters; // exact mirror of Flutter getter

  // ── Auth gate for cards ──────────────────────────────────────────────────

  const requireAuth = useCallback((): boolean => {
    if (user) return true;
    setShowLogin(true);
    return false;
  }, [user]);

  // ── Debounce search input (300ms, matches Flutter) ───────────────────────

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // ── Firestore fetch (default browsing) ───────────────────────────────────

  const fetchFromFirestore = useCallback(
    async (reset: boolean, token: number): Promise<void> => {
      try {
        let q: Query<DocumentData> = query(
          collection(db, "market-items"),
          where("category", "==", categorySlug),
          where("isAvailable", "==", true),
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE),
        );
        if (!reset) {
          if (lastFsDocRef.current) {
            q = query(q, startAfter(lastFsDocRef.current));
          } else if (lastFsCreatedAtRef.current != null) {
            // First paginated fetch after an SSR seed — cursor by createdAt.
            q = query(q, startAfter(lastFsCreatedAtRef.current));
          }
        }

        const snap = await getDocs(q);
        if (token !== fetchTokenRef.current) return;

        const fetched: MarketItem[] = snap.docs.map((d) =>
          firestoreDocToMarketItem(d),
        );
        if (snap.docs.length > 0) {
          lastFsDocRef.current = snap.docs[snap.docs.length - 1];
          lastFsCreatedAtRef.current = fetched[fetched.length - 1].createdAt;
        }
        setItems((prev) => (reset ? fetched : [...prev, ...fetched]));
        setHasMore(snap.docs.length >= PAGE_SIZE);
      } catch (err) {
        if (token !== fetchTokenRef.current) return;
        console.warn("[MarketDetail] Firestore fetch error:", err);
      }
    },
    [categorySlug],
  );

  // ── Typesense fetch (search / filters / non-default sort) ────────────────

  const fetchFromTypesense = useCallback(
    async (reset: boolean, token: number): Promise<void> => {
      const svc = TypeSenseServiceManager.instance.marketService;
      const nextPage = reset ? 0 : tsPageRef.current + 1;

      try {
        const result = await svc.searchItems({
          category: categorySlug,
          query: debouncedQuery,
          sort: sortOption,
          brands: selectedBrands.size ? Array.from(selectedBrands) : undefined,
          types: selectedTypes.size ? Array.from(selectedTypes) : undefined,
          hitsPerPage: PAGE_SIZE,
          page: nextPage,
        });
        if (token !== fetchTokenRef.current) return;

        tsPageRef.current = nextPage;
        setItems((prev) =>
          reset ? result.items : [...prev, ...result.items],
        );
        setHasMore(nextPage < result.nbPages - 1);
      } catch (err) {
        if (token !== fetchTokenRef.current) return;
        console.warn("[MarketDetail] Typesense fetch error:", err);
      }
    },
    [categorySlug, debouncedQuery, sortOption, selectedBrands, selectedTypes],
  );

  // ── Facets (always Typesense) ────────────────────────────────────────────

  const fetchFacets = useCallback(async (): Promise<void> => {
    const svc = TypeSenseServiceManager.instance.marketService;
    try {
      const next = await svc.fetchFacets({
        category: categorySlug,
        query: debouncedQuery,
        selectedBrands: selectedBrands.size
          ? Array.from(selectedBrands)
          : undefined,
        selectedTypes: selectedTypes.size
          ? Array.from(selectedTypes)
          : undefined,
      });
      setFacets(next);
    } catch (err) {
      console.warn("[MarketDetail] Facets error:", err);
    } finally {
      // Always exit the skeleton state, even on error — otherwise a Typesense
      // outage would leave the chip rows showing skeletons indefinitely.
      setHasLoadedFacets(true);
    }
  }, [categorySlug, debouncedQuery, selectedBrands, selectedTypes]);

  // ── Load first page whenever a filter/search/sort input changes ──────────

  useEffect(() => {
    fetchTokenRef.current += 1;
    const token = fetchTokenRef.current;

    // Fast path: first run with SSR-seeded items and no active filters.
    // Keep painted items, just refresh facets in the background.
    if (seededRef.current && !hasActiveFilters) {
      seededRef.current = false; // one-shot — subsequent runs do real fetches
      void fetchFacets();
      return;
    }

    tsPageRef.current = 0;
    lastFsDocRef.current = null;
    lastFsCreatedAtRef.current = null;
    setHasMore(false);
    setIsSearching(hasActiveFilters); // show skeletons over existing grid
    if (!hasActiveFilters) setIsLoading(true); // first entry shows full skeleton

    const run = async () => {
      await Promise.all([
        useFirestore
          ? fetchFromFirestore(true, token)
          : fetchFromTypesense(true, token),
        fetchFacets(),
      ]);
      if (token === fetchTokenRef.current) {
        setIsLoading(false);
        setIsSearching(false);
      }
    };
    void run();
    // We intentionally depend on the *debounced* query only, so keystrokes
    // don't fire 10 fetches in 300ms.
  }, [
    debouncedQuery,
    sortOption,
    selectedBrands,
    selectedTypes,
    hasActiveFilters,
    useFirestore,
    fetchFromFirestore,
    fetchFromTypesense,
    fetchFacets,
  ]);

  // ── Infinite scroll sentinel ─────────────────────────────────────────────

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (isLoading || isLoadingMore || !hasMore) return;

        const token = fetchTokenRef.current;
        setIsLoadingMore(true);
        const run = async () => {
          if (useFirestore) {
            await fetchFromFirestore(false, token);
          } else {
            await fetchFromTypesense(false, token);
          }
          if (token === fetchTokenRef.current) setIsLoadingMore(false);
        };
        void run();
      },
      { rootMargin: SCROLL_LOAD_MORE_MARGIN },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    hasMore,
    isLoading,
    isLoadingMore,
    useFirestore,
    fetchFromFirestore,
    fetchFromTypesense,
  ]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const toggleBrand = useCallback((brand: string) => {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  }, []);

  const toggleType = useCallback((type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const cycleSort = useCallback(() => {
    setSortOption((prev) => {
      const idx = SORT_CYCLE.indexOf(prev);
      return SORT_CYCLE[(idx + 1) % SORT_CYCLE.length];
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setDebouncedQuery("");
    setSelectedBrands(new Set());
    setSelectedTypes(new Set());
    setSortOption("newest");
  }, []);

  const sortLabel = useMemo(() => {
    switch (sortOption) {
      case "priceAsc":
        return t("sortPriceAsc");
      case "priceDesc":
        return t("sortPriceDesc");
      case "nameAsc":
        return t("sortNameAsc");
      default:
        return t("sortDefault");
    }
  }, [sortOption, t]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <main
      className={`flex-1 min-h-screen ${
        isDarkMode ? "bg-[#1C1A29]" : "bg-[#F5F5F5]"
      }`}
    >
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-[#00A86B] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label={t("back")}
            className="-ml-2 p-2 rounded-full hover:bg-white/10 outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-base sm:text-lg font-semibold truncate">
            {categoryLabel}
          </h1>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 pb-24">
        {/* Search + sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchHint")}
              aria-label={t("search")}
              className={`w-full pl-10 pr-9 py-2.5 rounded-xl text-sm outline-none transition-colors ${
                isDarkMode
                  ? "bg-[#2D2B3F] border border-gray-700 text-white placeholder-gray-500 focus:border-emerald-500"
                  : "bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-emerald-500"
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label={t("clearSearch")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={cycleSort}
            className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              sortOption !== "newest"
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : isDarkMode
                  ? "bg-[#2D2B3F] text-gray-300 border border-gray-700 hover:border-gray-500"
                  : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300"
            }`}
          >
            <ArrowUpDown className="w-4 h-4" />
            <span className="hidden sm:inline">{sortLabel}</span>
          </button>
        </div>

        {/* Facet chips — skeleton on first load to prevent CLS, real chips
            after the first Typesense fetch resolves. Subsequent filter changes
            update chips in place without re-flashing the skeleton. */}
        {!hasLoadedFacets ? (
          <>
            <FacetChipRowSkeleton isDarkMode={isDarkMode} />
            <FacetChipRowSkeleton isDarkMode={isDarkMode} />
          </>
        ) : (
          <>
            {facets.types.length > 0 && (
              <FacetChipRow
                label={t("facetType")}
                facets={facets.types}
                selected={selectedTypes}
                isDarkMode={isDarkMode}
                onToggle={toggleType}
              />
            )}
            {facets.brands.length > 0 && (
              <FacetChipRow
                label={t("facetBrand")}
                facets={facets.brands}
                selected={selectedBrands}
                isDarkMode={isDarkMode}
                onToggle={toggleBrand}
              />
            )}
          </>
        )}

        {/* Clear button */}
        {hasActiveFilters && (
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              <X className="w-3 h-3" />
              {t("clearFilters")}
            </button>
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <ProductGrid>
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} isDarkMode={isDarkMode} />
            ))}
          </ProductGrid>
        ) : isSearching ? (
          <ProductGrid>
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} isDarkMode={isDarkMode} />
            ))}
          </ProductGrid>
        ) : items.length === 0 ? (
          <EmptyState
            isDarkMode={isDarkMode}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearFilters}
          />
        ) : (
          <>
            <ProductGrid>
              {items.map((item) => (
                <MarketItemCard
                  key={item.id}
                  item={item}
                  isDarkMode={isDarkMode}
                  requireAuth={requireAuth}
                />
              ))}
            </ProductGrid>

            {/* Sentinel + trailing loader */}
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

      {/* Cart CTA — bottom bar on mobile, corner FAB on desktop */}
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

      {/* Login modal — your existing component */}
      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
      />
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

function ProductGrid({ children }: { children: React.ReactNode }) {
  // `align-items: start` + `auto-rows: min-content` lets each card have
  // its natural height, so an expanded card doesn't stretch its peers.
  return (
    <div
      className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 items-start"
      style={{ gridAutoRows: "min-content" }}
    >
      {children}
    </div>
  );
}

/**
 * Skeleton placeholder for one facet row (label + horizontally scrolling chips).
 * Renders the same vertical footprint as the real `FacetChipRow` so the chip
 * area doesn't shift when real chips land. Pure CSS — no JS, no animations
 * beyond Tailwind's `animate-pulse`.
 */
function FacetChipRowSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  // Mixed widths to look like real chips of varying length.
  const chipWidths = [56, 80, 64, 96, 72, 60, 88];
  return (
    <div className="mt-4" aria-hidden>
      {/* Label placeholder — matches the [11px font + uppercase] real label */}
      <div
        className={`px-1 mb-1.5 h-3 w-16 rounded ${
          isDarkMode ? "bg-gray-800" : "bg-gray-200"
        } animate-pulse`}
      />
      {/* Chip placeholders — same height (28px) as the real chips */}
      <div
        className="flex gap-2 overflow-hidden pb-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {chipWidths.map((w, i) => (
          <div
            key={i}
            className={`h-7 rounded-full shrink-0 ${
              isDarkMode ? "bg-gray-800" : "bg-gray-100"
            } animate-pulse`}
            style={{ width: w }}
          />
        ))}
      </div>
    </div>
  );
}

function FacetChipRow({
  label,
  facets,
  selected,
  isDarkMode,
  onToggle,
}: {
  label: string;
  facets: MarketFacetValue[];
  selected: Set<string>;
  isDarkMode: boolean;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="mt-4">
      <p
        className={`px-1 mb-1.5 text-[11px] font-bold uppercase tracking-wide ${
          isDarkMode ? "text-gray-500" : "text-gray-500"
        }`}
      >
        {label}
      </p>
      <div
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {facets.map((fv) => {
          const isSelected = selected.has(fv.value);
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
              <span>{fv.value}</span>
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

function EmptyState({
  isDarkMode,
  hasActiveFilters,
  onClearFilters,
}: {
  isDarkMode: boolean;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}) {
  const t = useTranslations("market");
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <span className="text-5xl mb-4" aria-hidden>
        📦
      </span>
      <h2
        className={`text-base font-bold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {t("noProductsFound")}
      </h2>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
        >
          {t("clearFilters")}
        </button>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

function firestoreDocToMarketItem(
  doc: QueryDocumentSnapshot<DocumentData>,
): MarketItem {
  const d = doc.data();
  return {
    id: doc.id,
    name: typeof d.name === "string" ? d.name : "",
    brand: typeof d.brand === "string" ? d.brand : "",
    type: typeof d.type === "string" ? d.type : "",
    category: typeof d.category === "string" ? d.category : "",
    price: typeof d.price === "number" ? d.price : Number(d.price ?? 0),
    stock: typeof d.stock === "number" ? d.stock : Number(d.stock ?? 0),
    description: typeof d.description === "string" ? d.description : "",
    imageUrl: typeof d.imageUrl === "string" ? d.imageUrl : "",
    imageUrls: Array.isArray(d.imageUrls)
      ? (d.imageUrls.filter((v): v is string => typeof v === "string") ?? [])
      : [],
    isAvailable: d.isAvailable !== false,
    // Firestore stores this as Timestamp or number depending on write path.
    // Normalize to number | null. For sorting we only need something stable.
    createdAt:
      typeof d.createdAt === "number"
        ? d.createdAt
        : d.createdAt?.toMillis?.() ?? null,
    nutrition:
      d.nutrition != null && typeof d.nutrition === "object"
        ? (d.nutrition as Record<string, unknown>)
        : {},
  };
}