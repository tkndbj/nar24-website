"use client";

// ═══════════════════════════════════════════════════════════════════════════
// ShopsPage
//
// Mirrors Flutter's ShopProvider + shop list screen:
//
//   BROWSE  (no query): Firestore cursor-pagination, optional category filter
//           Mirrors _getShopsQuery() / _fetchInitialShops() / _fetchMoreShops()
//
//   SEARCH  (query typed): Typesense via /api/shopsList
//           Mirrors performAlgoliaSearch(query, category)
//           Debounced 300 ms, category filter applied after results
//
//   Category filter: inline pill row (same as Flutter's category selector)
//   Infinite scroll: IntersectionObserver — browse only
// ═══════════════════════════════════════════════════════════════════════════

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useTranslations } from "next-intl";
import { Timestamp } from "firebase/firestore";
import {
  Search,
  X,
  Filter,
  RefreshCw,
  Store,
  AlertCircle,
  WifiOff,
  Check,
  ChevronDown,
} from "lucide-react";
import SecondHeader from "../../components/market_screen/SecondHeader";
import ShopCard from "../../components/shops/ShopCard";
import CreateShopButton from "../../components/shops/CreateShopButton";
import LoadingShopCard from "../../components/shops/LoadingShopCard";
import { AllInOneCategoryData } from "@/constants/productData";

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
  createdAt: Timestamp;
  isActive?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static data
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = AllInOneCategoryData.kCategories.map((c) => c.key);

const CATEGORY_I18N_KEYS: Record<string, string> = {
  "Clothing & Fashion": "categoryClothingFashion",
  Footwear: "categoryFootwear",
  Accessories: "categoryAccessories",
  "Mother & Child": "categoryMotherChild",
  "Home & Furniture": "categoryHomeFurniture",
  "Beauty & Personal Care": "categoryBeautyPersonalCare",
  "Bags & Luggage": "categoryBagsLuggage",
  Electronics: "categoryElectronics",
  "Sports & Outdoor": "categorySportsOutdoor",
  "Books, Stationery & Hobby": "categoryBooksStationeryHobby",
  "Tools & Hardware": "categoryToolsHardware",
  "Pet Supplies": "categoryPetSupplies",
  Automotive: "categoryAutomotive",
  "Health & Wellness": "categoryHealthWellness",
};

// ─────────────────────────────────────────────────────────────────────────────
// Normalise API shop → component Shop (reconstruct Timestamp)
// ─────────────────────────────────────────────────────────────────────────────

function toShop(raw: Record<string, unknown>): Shop {
  const ct = raw.createdAt as { seconds?: number; nanoseconds?: number } | null;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    profileImageUrl: String(raw.profileImageUrl ?? ""),
    coverImageUrls: (raw.coverImageUrls as string[]) ?? [],
    address: String(raw.address ?? ""),
    averageRating: Number(raw.averageRating ?? 0),
    reviewCount: Number(raw.reviewCount ?? 0),
    followerCount: Number(raw.followerCount ?? 0),
    clickCount: Number(raw.clickCount ?? 0),
    categories: (raw.categories as string[]) ?? [],
    contactNo: String(raw.contactNo ?? ""),
    ownerId: String(raw.ownerId ?? ""),
    isBoosted: Boolean(raw.isBoosted ?? false),
    isActive: raw.isActive !== false,
    createdAt:
      ct?.seconds !== undefined
        ? new Timestamp(ct.seconds, ct.nanoseconds ?? 0)
        : Timestamp.now(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ShopsPage() {
  const t = useTranslations("shops");
  const tRoot = useTranslations();

  // ── Theme ──────────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  // ── Shop state ─────────────────────────────────────────────────────────────
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNetworkErr, setIsNetworkErr] = useState(false);
  const cursorRef = useRef<string | null>(null);

  // ── Search state ───────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Shop[]>([]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showCategoryPanel, setShowCategoryPanel] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const loadMoreEl = useRef<HTMLDivElement>(null);
  const fetchingRef = useRef(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Search debounce — 300 ms (mirrors Flutter)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tid = setTimeout(() => setDebouncedQ(searchQuery.trim()), 300);
    return () => clearTimeout(tid);
  }, [searchQuery]);

  // ─────────────────────────────────────────────────────────────────────────
  // Close category panel on outside click
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showCategoryPanel) return;
    const handler = () => setShowCategoryPanel(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showCategoryPanel]);

  // ─────────────────────────────────────────────────────────────────────────
  // BROWSE fetch — Firestore via /api/shopsList (no query param)
  // ─────────────────────────────────────────────────────────────────────────
  const fetchBrowse = useCallback(
    async (loadMore = false) => {
      if (fetchingRef.current) return;
      if (loadMore && !cursorRef.current) return;

      fetchingRef.current = true;
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        if (!loadMore) {
          setIsLoading(true);
          setError(null);
          setIsNetworkErr(false);
          cursorRef.current = null;
        } else {
          setIsLoadingMore(true);
        }

        const qp = new URLSearchParams();
        if (selectedCategory) qp.set("category", selectedCategory);
        if (loadMore && cursorRef.current) qp.set("cursor", cursorRef.current);

        const res = await fetch(`/api/shopsList?${qp}`, {
          signal: abortRef.current.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const newShops: Shop[] = (data.shops ?? []).map(toShop);
        cursorRef.current = data.cursor ?? null;
        setHasMore(data.hasMore ?? false);

        if (loadMore) {
          setShops((prev) => {
            const ids = new Set(prev.map((s) => s.id));
            return [...prev, ...newShops.filter((s) => !ids.has(s.id))];
          });
        } else {
          setShops(newShops);
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        const isNet =
          !navigator.onLine ||
          (err instanceof Error && err.message.includes("fetch"));
        setIsNetworkErr(isNet);
        setError("Failed to load shops");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        fetchingRef.current = false;
      }
    },
    [selectedCategory],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SEARCH fetch — Typesense via /api/shopsList?q=…
  // ─────────────────────────────────────────────────────────────────────────
  const fetchSearch = useCallback(
    async (q: string) => {
      if (!q) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setIsSearching(true);

      try {
        const qp = new URLSearchParams({ q });
        if (selectedCategory) qp.set("category", selectedCategory);

        const res = await fetch(`/api/shopsList?${qp}`, {
          signal: abortRef.current.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        setSearchResults((data.shops ?? []).map(toShop));
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [selectedCategory],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Trigger: initial browse + on category change
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!debouncedQ) fetchBrowse(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  // Initial load
  useEffect(() => {
    fetchBrowse(false);
  }, []); // eslint-disable-line

  // ─────────────────────────────────────────────────────────────────────────
  // Trigger: search when debounced query changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (debouncedQ) {
      fetchSearch(debouncedQ);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, selectedCategory]);

  // ─────────────────────────────────────────────────────────────────────────
  // Infinite scroll (browse only)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (debouncedQ) return; // Algolia/Typesense returns all results at once

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMore &&
          !isLoadingMore &&
          !fetchingRef.current
        ) {
          fetchBrowse(true);
        }
      },
      { threshold: 0.1, rootMargin: "150px" },
    );

    const el = loadMoreEl.current;
    if (el && shops.length > 0) observer.observe(el);
    return () => {
      if (el) observer.unobserve(el);
      observer.disconnect();
    };
  }, [debouncedQ, hasMore, isLoadingMore, shops.length, fetchBrowse]);

  // ─────────────────────────────────────────────────────────────────────────
  // Displayed list
  // ─────────────────────────────────────────────────────────────────────────
  const displayedShops = useMemo(() => {
    const base = debouncedQ ? searchResults : shops;
    // Deduplicate as safety measure
    const seen = new Set<string>();
    return base.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }, [debouncedQ, searchResults, shops]);

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────
  const handleCategorySelect = (cat: string | null) => {
    setShowCategoryPanel(false);
    const next = cat === selectedCategory ? null : cat;
    setSelectedCategory(next);
    if (!debouncedQ) {
      setShops([]);
      cursorRef.current = null;
      setHasMore(true);
    }
  };

  const handleRetry = () => {
    setError(null);
    setShops([]);
    cursorRef.current = null;
    setHasMore(true);
    fetchBrowse(false);
  };

  const catLabel = (key: string) => {
    const i18nKey = CATEGORY_I18N_KEYS[key];
    return i18nKey ? tRoot(i18nKey) || key : key;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render: full error
  // ─────────────────────────────────────────────────────────────────────────
  if (error && shops.length === 0) {
    return (
      <>
        <SecondHeader />
        <div
          className={`min-h-screen ${isDark ? "bg-gray-900" : "bg-gray-50"}`}
        >
          <div className="max-w-7xl mx-auto px-4 py-20 flex flex-col items-center gap-5 text-center">
            {isNetworkErr ? (
              <WifiOff
                size={64}
                className={isDark ? "text-gray-600" : "text-gray-300"}
              />
            ) : (
              <AlertCircle size={64} className="text-red-400" />
            )}
            <h3
              className={`text-lg font-semibold ${isDark ? "text-white" : "text-gray-900"}`}
            >
              {t("errorLoading")}
            </h3>
            <p
              className={`text-sm max-w-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
            >
              {error}
            </p>
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw size={15} />
              {t("retry")}
            </button>
          </div>
        </div>
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render: main
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <SecondHeader />
      <div className={`min-h-screen ${isDark ? "bg-gray-900" : "bg-gray-50"}`}>
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* ── Page header ── */}
          <div className="mb-5 space-y-3">
            {/* Row 1: title + create + search + filter */}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              {/* Title + create */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <h1
                  className={`text-xl md:text-2xl font-semibold ${isDark ? "text-white" : "text-gray-900"}`}
                >
                  {t("title")}
                </h1>
                <CreateShopButton />
              </div>

              {/* Search + filter */}
              <div className="flex-1 flex items-center gap-2">
                {/* Search bar */}
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    {isSearching ? (
                      <RefreshCw
                        size={15}
                        className="text-orange-500 animate-spin"
                      />
                    ) : (
                      <Search
                        size={15}
                        className={isDark ? "text-gray-400" : "text-gray-500"}
                      />
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder={t("searchShops")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-9 pr-9 py-2 text-sm rounded-lg border transition-colors focus:ring-2 focus:ring-orange-400 focus:outline-none ${
                      isDark
                        ? "bg-gray-800 border-gray-700 text-white placeholder-gray-400"
                        : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                    }`}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      <X
                        size={14}
                        className={
                          isDark
                            ? "text-gray-400 hover:text-gray-300"
                            : "text-gray-400 hover:text-gray-700"
                        }
                      />
                    </button>
                  )}
                </div>

                {/* Category filter button */}
                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setShowCategoryPanel((v) => !v)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap ${
                      selectedCategory
                        ? "border-orange-400 text-orange-500 bg-orange-50 dark:bg-orange-900/20 ring-1 ring-orange-400"
                        : isDark
                          ? "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                          : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Filter size={14} />
                    {t("filter")}
                    {selectedCategory && (
                      <span className="ml-0.5 px-1.5 py-0.5 text-[10px] bg-orange-500 text-white rounded-full font-bold">
                        1
                      </span>
                    )}
                    <ChevronDown
                      size={12}
                      className={`transition-transform ${showCategoryPanel ? "rotate-180" : ""}`}
                    />
                  </button>

                  {/* Category dropdown */}
                  {showCategoryPanel && (
                    <div
                      className={`absolute right-0 mt-2 w-72 max-h-96 overflow-y-auto rounded-xl border shadow-xl z-50 ${
                        isDark
                          ? "bg-gray-800 border-gray-700"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-2 px-1">
                          <span
                            className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-gray-400" : "text-gray-500"}`}
                          >
                            {t("categories")}
                          </span>
                          {selectedCategory && (
                            <button
                              onClick={() => handleCategorySelect(null)}
                              className="text-xs text-orange-500 hover:text-orange-600 font-medium"
                            >
                              {t("clearFilters")}
                            </button>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {CATEGORIES.map((cat) => (
                            <button
                              key={cat}
                              onClick={() => handleCategorySelect(cat)}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                                selectedCategory === cat
                                  ? "bg-orange-500 text-white font-medium"
                                  : isDark
                                    ? "text-gray-300 hover:bg-gray-700"
                                    : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              {catLabel(cat)}
                              {selectedCategory === cat && <Check size={14} />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2: active filter chips */}
            {(searchQuery.trim() || selectedCategory) && (
              <div className="flex flex-wrap gap-2">
                {searchQuery.trim() && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      isDark
                        ? "bg-blue-900/40 text-blue-300"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    &ldquo;{searchQuery}&rdquo;
                    <button
                      onClick={() => setSearchQuery("")}
                      className="hover:opacity-70"
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}
                {selectedCategory && (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      isDark
                        ? "bg-orange-900/40 text-orange-300"
                        : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    {catLabel(selectedCategory)}
                    <button
                      onClick={() => handleCategorySelect(null)}
                      className="hover:opacity-70"
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Category pills (horizontal scroll) ── */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-3 mb-4 -mx-4 px-4">
            <button
              onClick={() => handleCategorySelect(null)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                !selectedCategory
                  ? "bg-orange-500 text-white border-orange-500"
                  : isDark
                    ? "bg-transparent border-gray-600 text-gray-300 hover:border-gray-400"
                    : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              All
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategorySelect(cat)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
                  selectedCategory === cat
                    ? "bg-orange-500 text-white border-orange-500"
                    : isDark
                      ? "bg-transparent border-gray-600 text-gray-300 hover:border-gray-400"
                      : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                }`}
              >
                {catLabel(cat)}
              </button>
            ))}
          </div>

          {/* ── Grid ── */}
          {(isLoading && shops.length === 0) || isSearching ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <LoadingShopCard key={i} isDarkMode={isDark} />
              ))}
            </div>
          ) : displayedShops.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-64 gap-4 py-16 text-center">
              <Store
                size={64}
                strokeWidth={1}
                className={isDark ? "text-gray-700" : "text-gray-300"}
              />
              <h3
                className={`text-lg font-semibold ${isDark ? "text-white" : "text-gray-900"}`}
              >
                {t("noShopsFound")}
              </h3>
              <p
                className={`text-sm max-w-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}
              >
                {searchQuery || selectedCategory
                  ? t("noShopsMatchFilter")
                  : t("noShopsAvailable")}
              </p>
              {(searchQuery || selectedCategory) && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    handleCategorySelect(null);
                  }}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {t("clearFilters")}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {displayedShops.map((shop) => (
                  <ShopCard key={shop.id} shop={shop} isDarkMode={isDark} />
                ))}
              </div>

              {/* Load more — browse only */}
              {!debouncedQ && hasMore && (
                <>
                  {!isLoadingMore && (
                    <div ref={loadMoreEl} className="h-10 mt-4" />
                  )}
                  {isLoadingMore && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 mt-4">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <LoadingShopCard key={i} isDarkMode={isDark} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* End of results message */}
              {!hasMore &&
                !isLoadingMore &&
                shops.length > 0 &&
                !debouncedQ && (
                  <p
                    className={`text-center text-xs py-8 ${isDark ? "text-gray-600" : "text-gray-400"}`}
                  >
                    All shops loaded
                  </p>
                )}

              {/* Search result count */}
              {debouncedQ && displayedShops.length > 0 && (
                <p
                  className={`text-center text-xs py-6 ${isDark ? "text-gray-500" : "text-gray-400"}`}
                >
                  {displayedShops.length}{" "}
                  {displayedShops.length === 1 ? "shop" : "shops"} found
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
