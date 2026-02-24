"use client";

/**
 * SearchBar.tsx
 *
 * Mirrors Flutter's MarketSearchDelegate + MarketAppBar search behaviour:
 *
 *  - Forwards every keystroke to SearchProvider.updateTerm (post-frame pattern)
 *  - Sections: Shops → Categories (horizontal scroll + breadcrumbs) → Products
 *  - Scroll-based load-more at 200 px from bottom (mirrors _loadMoreThreshold)
 *  - isLoadingMore spinner + hasMoreProducts "Scroll for more" hint
 *  - normalizeProductId strips shop_products_ / products_ prefixes
 *  - Product image from suggestion.imageUrl with graceful fallback
 *  - Firestore mode: no categories/shops, no pagination
 *  - Shop row: avatar + name + categories display (max 3 shops)
 *  - Category card: horizontal chip with breadcrumb display name
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Clock,
  X,
  ShoppingBag,
  Grid3x3,
  Store,
  Loader2,
  Sparkles,
  ArrowUpRight,
  WifiOff,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useSearchProvider,
  type CategorySuggestion,
  type Suggestion,
  type ShopSuggestion,
} from "@/context/SearchProvider";
import { useSearchHistory } from "@/context/SearchHistoryProvider";
import { useSearchConfig } from "@/hooks/useSearchConfig";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchBarProps {
  isDark: boolean;
  isSearching: boolean;
  onSearchStateChange: (searching: boolean) => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  isMobile?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  languageCode?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LOAD_MORE_THRESHOLD = 200; // px — mirrors Flutter's _loadMoreThreshold
const HISTORY_ITEMS_PER_PAGE = 6;
const MAX_SHOPS = 3;
const MAX_CATEGORIES = 6; // horizontal scroll — show more than Flutter's 3

/** Strip Typesense collection prefix from product IDs */
function normalizeProductId(rawId: string): string {
  if (rawId.startsWith("shop_products_"))
    return rawId.slice("shop_products_".length);
  if (rawId.startsWith("products_")) return rawId.slice("products_".length);
  return rawId;
}

/** Extract the most-specific segment of a category display name */
function getCategoryDisplayName(suggestion: CategorySuggestion): string {
  const parts = suggestion.displayName.split(" > ");
  if (suggestion.subsubcategoryKey && parts.length >= 3) return parts[2];
  if (suggestion.subcategoryKey && parts.length >= 2) return parts[1];
  return suggestion.displayName;
}

/** Build breadcrumb label (everything except the last segment) */
function getCategoryBreadcrumb(suggestion: CategorySuggestion): string {
  const parts = suggestion.displayName.split(" > ");
  if (suggestion.level >= 2 && parts.length >= 3)
    return `${parts[0]} • ${parts[1]}`;
  if (suggestion.level >= 1 && parts.length >= 2) return parts[0];
  return "";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SearchBar({
  isDark,
  isSearching,
  onSearchStateChange,
  searchTerm,
  onSearchTermChange,
  isMobile = false,
  t,
  languageCode = "en",
}: SearchBarProps) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { useFirestore: isFirestoreMode } = useSearchConfig();

  // ── Local state ───────────────────────────────────────────────────────────
  const [historyPage, setHistoryPage] = useState(0);
  const [isHistoryLoadingMore, setIsHistoryLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // ── SearchProvider ────────────────────────────────────────────────────────
  const {
    isLoading,
    isLoadingMore,
    hasMoreProducts,
    suggestions,
    categorySuggestions,
    shopSuggestions,
    errorMessage,
    hasNetworkError,
    updateTerm,
    loadMoreSuggestions,
  } = useSearchProvider();

  // ── SearchHistory ─────────────────────────────────────────────────────────
  const {
    searchEntries,
    isLoadingHistory,
    deleteEntry,
    isDeletingEntry,
    saveSearchTerm,
  } = useSearchHistory();

  // ── Mount guard ───────────────────────────────────────────────────────────
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // ── Body scroll lock on mobile ────────────────────────────────────────────
  useEffect(() => {
    if (!isSearching || !isMobile) return;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, [isSearching, isMobile]);

  // ── Dropdown position ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSearching || !searchContainerRef.current) {
      setDropdownPosition(null);
      return;
    }
    const update = () => {
      requestAnimationFrame(() => {
        if (!searchContainerRef.current) return;
        const rect = searchContainerRef.current.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          setDropdownPosition(null);
          return;
        }
        setDropdownPosition({
          top: rect.bottom + 6,
          left: rect.left,
          width: Math.max(rect.width, 380),
        });
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [isSearching]);

  // ── Click outside ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSearching) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-search-action]")) return;
      if (dropdownRef.current?.contains(target)) return;
      if (searchContainerRef.current?.contains(target)) return;
      onSearchStateChange(false);
      searchInputRef.current?.blur();
      setHistoryPage(0);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [isSearching, onSearchStateChange]);

  // ── Focus management ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!isSearching) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 100);
    setHistoryPage(0);
    return () => clearTimeout(t);
  }, [isSearching]);

  // ── Forward input to SearchProvider (mirrors Flutter post-frame callback) ─
  // Flutter: `searchProv.updateTerm(query, l10n: l10n)` in addPostFrameCallback
  // Web equivalent: call after render via useEffect, deduplication is inside updateTerm
  useEffect(() => {
    if (!isSearching) return;
    updateTerm(searchTerm, languageCode);
  }, [searchTerm, isSearching, languageCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchTermChange(e.target.value);
      // updateTerm is called via the useEffect above — same as Flutter's
      // post-frame callback pattern to stay outside the render phase
    },
    [onSearchTermChange],
  );

  const handleSearchSubmit = useCallback(
    async (term?: string) => {
      const q = (term ?? searchTerm).trim();
      if (!q || isSubmitting) return;
      setIsSubmitting(true);
      try {
        saveSearchTerm(q).catch(console.error);
        onSearchStateChange(false);
        if (term && term !== searchTerm) onSearchTermChange(term);
        router.push(`/search-results?q=${encodeURIComponent(q)}`);
      } finally {
        setTimeout(() => setIsSubmitting(false), 500);
      }
    },
    [
      searchTerm,
      isSubmitting,
      saveSearchTerm,
      onSearchStateChange,
      onSearchTermChange,
      router,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearchSubmit();
      } else if (e.key === "Escape") {
        onSearchStateChange(false);
      }
    },
    [handleSearchSubmit, onSearchStateChange],
  );

  const handleHistoryItemClick = useCallback(
    (term: string) => {
      saveSearchTerm(term).catch(console.error);
      onSearchStateChange(false);
      router.push(`/search-results?q=${encodeURIComponent(term)}`);
    },
    [saveSearchTerm, onSearchStateChange, router],
  );

  const handleDeleteHistory = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await deleteEntry(id).catch(console.error);
    },
    [deleteEntry],
  );

  const handleProductClick = useCallback(
    (suggestion: Suggestion) => {
      onSearchStateChange(false);
      const cleanId = normalizeProductId(suggestion.id);
      router.push(`/product/${cleanId}`);
    },
    [onSearchStateChange, router],
  );

  const handleCategoryClick = useCallback(
    (cat: CategorySuggestion) => {
      onSearchStateChange(false);
      const params = new URLSearchParams();
      if (cat.categoryKey) params.set("category", cat.categoryKey);
      if (cat.subcategoryKey) params.set("subcategory", cat.subcategoryKey);
      if (cat.subsubcategoryKey)
        params.set("subsubcategory", cat.subsubcategoryKey);
      router.push(`/category?${params.toString()}`);
    },
    [onSearchStateChange, router],
  );

  const handleShopClick = useCallback(
    (shop: ShopSuggestion) => {
      onSearchStateChange(false);
      router.push(`/shop_detail/${shop.id}`);
    },
    [onSearchStateChange, router],
  );

  /**
   * Scroll handler for the results list.
   * Mirrors Flutter's _onScroll: triggers loadMoreSuggestions when
   * within LOAD_MORE_THRESHOLD px of the bottom.
   */
  const handleResultsScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const distanceFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      if (
        distanceFromBottom <= LOAD_MORE_THRESHOLD &&
        hasMoreProducts &&
        !isLoadingMore
      ) {
        loadMoreSuggestions(languageCode);
      }
    },
    [hasMoreProducts, isLoadingMore, loadMoreSuggestions, languageCode],
  );

  /** History list scroll for client-side pagination */
  const handleHistoryScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (
        el.scrollHeight - el.scrollTop - el.clientHeight < 50 &&
        !isHistoryLoadingMore &&
        paginatedHistory.length < searchEntries.length
      ) {
        setIsHistoryLoadingMore(true);
        setTimeout(() => {
          setHistoryPage((p) => p + 1);
          setIsHistoryLoadingMore(false);
        }, 200);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isHistoryLoadingMore, searchEntries.length],
  );

  // ── Derived values ────────────────────────────────────────────────────────

  const trimmedTerm = searchTerm.trim();

  const hasSearchResults = useMemo(
    () =>
      !!trimmedTerm &&
      (suggestions.length > 0 ||
        categorySuggestions.length > 0 ||
        shopSuggestions.length > 0 ||
        isLoading ||
        !!errorMessage),
    [
      trimmedTerm,
      suggestions,
      categorySuggestions,
      shopSuggestions,
      isLoading,
      errorMessage,
    ],
  );

  const showHistory = !trimmedTerm && searchEntries.length > 0;

  const paginatedHistory = useMemo(
    () => searchEntries.slice(0, (historyPage + 1) * HISTORY_ITEMS_PER_PAGE),
    [searchEntries, historyPage],
  );

  const hasMoreHistory = paginatedHistory.length < searchEntries.length;

  // ── Shared style tokens (mirrors Flutter dark/light theme) ────────────────

  const bg = isDark ? "bg-[#1C1A29]" : "bg-gray-50";
  const cardBg = isDark ? "bg-[#211F31]" : "bg-white";
  const cardBorder = isDark ? "border-white/[0.08]" : "border-gray-200";
  const dropdownBg = isDark ? "bg-gray-900" : "bg-white";
  const dropdownBorder = isDark ? "border-gray-700/60" : "border-gray-200/80";
  const hoverRow = isDark ? "hover:bg-white/5" : "hover:bg-gray-50";
  const mutedText = isDark ? "text-gray-500" : "text-gray-400";
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500";
  const primaryText = isDark ? "text-gray-100" : "text-gray-900";
  const sectionLabel = isDark ? "text-gray-400" : "text-gray-500";

  // ── Section header ─────────────────────────────────────────────────────────

  const SectionHeader = ({
    icon,
    label,
    badge,
    badgeStyle,
  }: {
    icon: React.ReactNode;
    label: string;
    badge?: React.ReactNode;
    badgeStyle?: string;
  }) => (
    <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
      {icon}
      <span
        className={`text-[11px] font-semibold uppercase tracking-wider ${sectionLabel}`}
      >
        {label}
      </span>
      {badge !== undefined && (
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badgeStyle}`}
        >
          {badge}
        </span>
      )}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full" ref={searchContainerRef}>
      {/* ── Search input ── */}
      <div
        className={`
          relative h-10 rounded-2xl transition-all duration-300
          ${isDark ? "bg-white/[0.06]" : "bg-gray-100/80"}
          ${
            isSearching
              ? `ring-2 ${isDark ? "ring-orange-500/40 bg-white/[0.09]" : "ring-orange-400/50 bg-white"} shadow-lg`
              : `ring-1 ${isDark ? "ring-white/[0.06] hover:ring-white/10 hover:bg-white/[0.08]" : "ring-gray-200 hover:ring-gray-300 hover:bg-gray-50"}`
          }
        `}
      >
        {/* Prefix icon */}
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {isSubmitting ? (
            <Loader2
              size={15}
              className={`animate-spin ${isDark ? "text-orange-400" : "text-orange-500"}`}
            />
          ) : (
            <Search
              size={15}
              className={`transition-colors duration-200 ${
                isSearching
                  ? isDark
                    ? "text-orange-400"
                    : "text-orange-500"
                  : isDark
                    ? "text-gray-500"
                    : "text-gray-400"
              } ${isLoading ? "animate-pulse" : ""}`}
            />
          )}
        </div>

        <input
          ref={searchInputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => !isSearching && onSearchStateChange(true)}
          readOnly={!isSearching}
          disabled={isSubmitting}
          placeholder={t("header.searchPlaceholder")}
          className={`
            w-full h-full pl-10 pr-10 bg-transparent border-none outline-none
            ${isDark ? "placeholder:text-gray-500 text-gray-100" : "placeholder:text-gray-400 text-gray-900"}
            text-[13px] font-medium rounded-2xl
            ${isSubmitting ? "cursor-not-allowed opacity-60" : ""}
          `}
        />

        {/* Submit button — shown while searching and term is non-empty */}
        {isSearching && trimmedTerm && (
          <button
            onClick={() => handleSearchSubmit()}
            disabled={isSubmitting}
            className={`
              absolute right-1.5 top-1/2 -translate-y-1/2
              h-7 px-2.5 rounded-xl text-[11px] font-semibold
              transition-all duration-200 active:scale-95
              ${isDark ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30" : "bg-orange-500 text-white hover:bg-orange-600"}
              ${isSubmitting ? "cursor-not-allowed opacity-60" : ""}
            `}
          >
            {isSubmitting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ArrowUpRight size={14} />
            )}
          </button>
        )}
      </div>

      {/* ── Dropdown (portaled to body) ── */}
      {isMounted &&
        isSearching &&
        dropdownPosition &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
            }}
            className={`
              ${dropdownBg} border ${dropdownBorder}
              rounded-2xl shadow-2xl z-[9999] max-h-[460px] overflow-hidden
              animate-in fade-in slide-in-from-top-2 duration-200
            `}
          >
            {/* Firestore fallback banner — mirrors Flutter's maintenance banner */}
            {isFirestoreMode && (
              <div className="px-4 pt-3 pb-1">
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium
                    ${
                      isDark
                        ? "bg-orange-500/10 text-orange-300 border border-orange-500/15"
                        : "bg-amber-50 text-amber-700 border border-amber-200/60"
                    }`}
                >
                  <Sparkles size={12} />
                  <span>{t("header.limitedSearchMode")}</span>
                </div>
              </div>
            )}

            {/* ── Top loading bar (mirrors Flutter LinearProgressIndicator) ── */}
            {isLoading && (
              <div className="h-0.5 w-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-400 to-orange-500 animate-pulse"
                  style={{ width: "100%" }}
                />
              </div>
            )}

            {/* ────────────────────────────────────────────────────────────
                SEARCH RESULTS — order: Shops → Categories → Products
                Mirrors Flutter's _buildSearchSuggestions sliver order
                ──────────────────────────────────────────────────────── */}
            {hasSearchResults ? (
              <div
                ref={scrollContainerRef}
                className="overflow-y-auto max-h-[440px] overscroll-contain"
                onScroll={handleResultsScroll}
              >
                {/* Error state */}
                {errorMessage && (
                  <div className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? "bg-red-500/10" : "bg-red-50"}`}
                      >
                        {hasNetworkError ? (
                          <WifiOff size={16} className="text-orange-400" />
                        ) : (
                          <AlertCircle size={16} className="text-red-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-medium ${isDark ? "text-red-400" : "text-red-600"}`}
                        >
                          {errorMessage}
                        </p>
                        <button
                          onClick={() => updateTerm(searchTerm, languageCode)}
                          className={`text-xs font-medium mt-0.5 ${isDark ? "text-orange-400 hover:text-orange-300" : "text-orange-600 hover:text-orange-700"}`}
                        >
                          {t("header.tryAgain")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── SHOPS (max 3) — mirrors Flutter's shops SliverList ── */}
                {shopSuggestions.length > 0 && !isFirestoreMode && (
                  <div
                    className={`border-b ${isDark ? "border-gray-800" : "border-gray-100"}`}
                  >
                    <SectionHeader
                      icon={<Store size={13} className={sectionLabel} />}
                      label={t("header.shops")}
                      badge={shopSuggestions.length}
                      badgeStyle={
                        isDark
                          ? "bg-orange-500/15 text-orange-400"
                          : "bg-orange-100 text-orange-600"
                      }
                    />
                    <div className="px-2 pb-2">
                      {shopSuggestions.slice(0, MAX_SHOPS).map((shop) => (
                        <button
                          key={shop.id}
                          onClick={() => handleShopClick(shop)}
                          data-search-action="shop-suggestion"
                          className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl ${hoverRow} transition-colors duration-150`}
                        >
                          {/* Shop avatar — mirrors Flutter ClipRRect + Image.network */}
                          <div
                            className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden ${isDark ? "bg-white/10" : "bg-gray-100"}`}
                          >
                            {shop.profileImageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={shop.profileImageUrl}
                                alt={shop.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (
                                    e.currentTarget as HTMLImageElement
                                  ).style.display = "none";
                                }}
                              />
                            ) : (
                              <Store size={18} className={secondaryText} />
                            )}
                          </div>

                          <div className="flex-1 text-left min-w-0">
                            <p
                              className={`text-[13px] font-semibold truncate ${primaryText}`}
                            >
                              {shop.name}
                            </p>
                            {shop.categories.length > 0 && (
                              <p
                                className={`text-[11px] truncate ${secondaryText}`}
                              >
                                {shop.categories.slice(0, 3).join(", ")}
                              </p>
                            )}
                          </div>
                          <ChevronRight size={14} className={mutedText} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── CATEGORIES (horizontal scroll) — mirrors Flutter's SliverToBoxAdapter ListView.builder ── */}
                {categorySuggestions.length > 0 && !isFirestoreMode && (
                  <div
                    className={`border-b ${isDark ? "border-gray-800" : "border-gray-100"}`}
                  >
                    <SectionHeader
                      icon={<Grid3x3 size={13} className={sectionLabel} />}
                      label={t("header.categories")}
                      badge="AI"
                      badgeStyle={
                        isDark
                          ? "bg-orange-500/15 text-orange-400"
                          : "bg-orange-100 text-orange-600"
                      }
                    />
                    {/* Horizontal scroll — mirrors Flutter's horizontal ListView */}
                    <div className="flex gap-2.5 overflow-x-auto px-3 pb-3 scrollbar-none">
                      {categorySuggestions
                        .slice(0, MAX_CATEGORIES)
                        .map((cat, i) => {
                          const displayName = getCategoryDisplayName(cat);
                          const breadcrumb = getCategoryBreadcrumb(cat);
                          return (
                            <button
                              key={`${cat.categoryKey}-${cat.subcategoryKey ?? ""}-${i}`}
                              onClick={() => handleCategoryClick(cat)}
                              data-search-action="category-suggestion"
                              className={`
                              flex-shrink-0 w-44 h-[62px] rounded-[14px] border overflow-hidden
                              flex items-center text-left transition-all duration-150
                              hover:shadow-md active:scale-[0.98]
                              ${cardBg} ${cardBorder}
                            `}
                            >
                              {/* Left colour strip — replaces Flutter's Image.asset */}
                              <div
                                className={`w-14 h-full flex-shrink-0 flex items-center justify-center ${isDark ? "bg-orange-500/10" : "bg-orange-50"}`}
                              >
                                <Grid3x3
                                  size={20}
                                  className={
                                    isDark
                                      ? "text-orange-400"
                                      : "text-orange-500"
                                  }
                                />
                              </div>
                              <div className="flex-1 px-2.5 min-w-0">
                                <p
                                  className={`text-[12px] font-semibold leading-tight line-clamp-2 ${primaryText}`}
                                >
                                  {displayName}
                                </p>
                                {breadcrumb && (
                                  <p
                                    className={`text-[10px] truncate mt-0.5 ${secondaryText}`}
                                  >
                                    {breadcrumb}
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* ── PRODUCTS — mirrors Flutter's SliverList for productSuggestions ── */}
                {suggestions.length > 0 && (
                  <div>
                    <SectionHeader
                      icon={<ShoppingBag size={13} className={sectionLabel} />}
                      label={t("header.products")}
                      badge={suggestions.length}
                      badgeStyle={
                        isDark
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-blue-50 text-blue-600"
                      }
                    />
                    <div className="px-2 pb-1">
                      {suggestions.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleProductClick(s)}
                          data-search-action="product-suggestion"
                          className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-xl ${hoverRow} transition-colors duration-150`}
                        >
                          {/* Product thumbnail — mirrors Flutter's Image.network with loading/error builders */}
                          <div
                            className={`w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden ${isDark ? "bg-white/10" : "bg-gray-100"}`}
                          >
                            {s.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={s.imageUrl}
                                alt={s.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (
                                    e.currentTarget as HTMLImageElement
                                  ).style.display = "none";
                                }}
                              />
                            ) : (
                              <ShoppingBag
                                size={16}
                                className={secondaryText}
                              />
                            )}
                          </div>

                          <div className="flex-1 text-left min-w-0">
                            <p
                              className={`text-[13px] font-semibold truncate ${primaryText}`}
                            >
                              {s.name}
                            </p>
                            <p className={`text-[11px] ${secondaryText}`}>
                              {t("header.price", {
                                amount: s.price.toFixed(2),
                              })}
                            </p>
                          </div>
                          <ArrowUpRight size={13} className={mutedText} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Load-more indicator — mirrors Flutter's SliverToBoxAdapter load-more section */}
                {isLoadingMore && (
                  <div className="flex justify-center py-4">
                    <Loader2
                      size={20}
                      className={`animate-spin ${isDark ? "text-orange-400" : "text-orange-500"}`}
                    />
                  </div>
                )}

                {!isLoadingMore &&
                  hasMoreProducts &&
                  suggestions.length > 0 && (
                    <p className={`text-center text-[11px] py-3 ${mutedText}`}>
                      {t("header.scrollForMore")}
                    </p>
                  )}

                {/* No results */}
                {!isLoading &&
                  !errorMessage &&
                  suggestions.length === 0 &&
                  categorySuggestions.length === 0 &&
                  shopSuggestions.length === 0 &&
                  trimmedTerm && (
                    <div className={`px-4 py-10 text-center ${bg}`}>
                      <div
                        className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3 ${isDark ? "bg-[#211F31]" : "bg-gray-100"}`}
                      >
                        <Search size={22} className={mutedText} />
                      </div>
                      <p
                        className={`text-sm font-semibold ${primaryText} mb-1`}
                      >
                        {t("header.noResults")}
                      </p>
                      <p className={`text-xs ${secondaryText}`}>
                        {t("header.tryDifferentKeywords")}
                      </p>
                    </div>
                  )}
              </div>
            ) : showHistory ? (
              /* ── SEARCH HISTORY — mirrors Flutter's _buildSearchHistory ── */
              <div>
                <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock size={13} className={mutedText} />
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-wider ${sectionLabel}`}
                    >
                      {t("header.recentSearches")}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}
                    >
                      {searchEntries.length}
                    </span>
                  </div>
                </div>

                {isLoadingHistory ? (
                  <div className="flex justify-center py-8">
                    <Loader2
                      size={18}
                      className={`animate-spin ${mutedText}`}
                    />
                  </div>
                ) : (
                  <div
                    className="px-2 pb-2 max-h-64 overflow-y-auto overscroll-contain"
                    onScroll={handleHistoryScroll}
                  >
                    {paginatedHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className={`flex items-center gap-3 px-2.5 py-2 rounded-xl group ${hoverRow} transition-colors duration-150`}
                      >
                        <button
                          onClick={() =>
                            handleHistoryItemClick(entry.searchTerm)
                          }
                          data-search-action="history-item"
                          className="flex-1 flex items-center gap-3 text-left min-w-0"
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${isDark ? "bg-white/5" : "bg-gray-100"}`}
                          >
                            <Clock size={13} className={mutedText} />
                          </div>
                          <p
                            className={`text-[13px] font-medium truncate ${primaryText}`}
                          >
                            {entry.searchTerm}
                          </p>
                        </button>
                        <button
                          onClick={(e) => handleDeleteHistory(e, entry.id)}
                          disabled={isDeletingEntry(entry.id)}
                          className={`
                            p-1.5 rounded-lg flex-shrink-0 transition-all duration-200
                            ${isDark ? "hover:bg-red-500/10" : "hover:bg-red-50"}
                            ${
                              isDeletingEntry(entry.id)
                                ? "opacity-50 cursor-not-allowed"
                                : "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
                            }
                          `}
                        >
                          {isDeletingEntry(entry.id) ? (
                            <Loader2
                              size={12}
                              className={`animate-spin ${mutedText}`}
                            />
                          ) : (
                            <X
                              size={12}
                              className={`${mutedText} hover:text-red-500`}
                            />
                          )}
                        </button>
                      </div>
                    ))}

                    {isHistoryLoadingMore && (
                      <div className="flex justify-center py-2">
                        <Loader2
                          size={14}
                          className={`animate-spin ${mutedText}`}
                        />
                      </div>
                    )}

                    {hasMoreHistory && !isHistoryLoadingMore && (
                      <div className="flex justify-center pt-1 pb-2">
                        <button
                          onClick={() => {
                            setIsHistoryLoadingMore(true);
                            setTimeout(() => {
                              setHistoryPage((p) => p + 1);
                              setIsHistoryLoadingMore(false);
                            }, 200);
                          }}
                          className={`text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors duration-200 ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                        >
                          {t("header.loadMore")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* ── EMPTY STATE — mirrors Flutter's _buildEmptyState ── */
              <div className="px-4 py-10 text-center">
                <div
                  className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3 ${isDark ? "bg-[#211F31]" : "bg-gray-100"}`}
                >
                  <Search size={22} className={mutedText} />
                </div>
                <p className={`text-sm font-semibold ${primaryText} mb-1`}>
                  {t("header.searchPlaceholder")}
                </p>
                <p className={`text-xs ${secondaryText}`}>
                  {t("header.startTypingPrompt")}
                </p>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
