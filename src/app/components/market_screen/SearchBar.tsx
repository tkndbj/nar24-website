"use client";

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
  TrendingUp,
  Loader2,
  Sparkles,
  ArrowUpRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  CategorySuggestion,
  Suggestion,
  useSearchProvider,
} from "@/context/SearchProvider";
import { useSearchHistory } from "@/context/SearchHistoryProvider";
import { useSearchConfig } from "@/hooks/useSearchConfig";

interface SearchBarProps {
  isDark: boolean;
  isSearching: boolean;
  onSearchStateChange: (searching: boolean) => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  onSearchSubmit?: () => void;
  isMobile?: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const ITEMS_PER_PAGE = 6;

export default function SearchBar({
  isDark,
  isSearching,
  onSearchStateChange,
  searchTerm,
  onSearchTermChange,
  isMobile = false,
  t,
}: SearchBarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { useFirestore: isFirestoreMode } = useSearchConfig();

  const [currentPage, setCurrentPage] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  const {
    isLoading,
    suggestions,
    categorySuggestions,
    errorMessage,
    hasNetworkError,
    updateTerm,
  } = useSearchProvider();

  const {
    searchEntries,
    isLoadingHistory,
    deleteEntry,
    isDeletingEntry,
    saveSearchTerm,
  } = useSearchHistory();

  // Body scroll lock
  useEffect(() => {
    if (isSearching && isMobile) {
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
    }
  }, [isSearching, isMobile]);

  // Dropdown position
  useEffect(() => {
    if (!isSearching || !searchContainerRef.current) {
      setDropdownPosition(null);
      return;
    }

    const updatePosition = () => {
      requestAnimationFrame(() => {
        if (searchContainerRef.current) {
          const rect = searchContainerRef.current.getBoundingClientRect();
          // Skip if element is hidden (display:none returns zero rect)
          if (rect.width === 0 && rect.height === 0) {
            setDropdownPosition(null);
            return;
          }
          setDropdownPosition({
            top: rect.bottom + 6,
            left: rect.left,
            width: Math.max(rect.width, 380),
          });
        }
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition, { passive: true });
    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isSearching]);

  // Click outside
  useEffect(() => {
    if (!isSearching) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const searchAction = target.closest("[data-search-action]");
      if (searchAction) return;
      if (dropdownRef.current?.contains(target)) return;
      if (searchContainerRef.current?.contains(target)) return;

      onSearchStateChange(false);
      searchInputRef.current?.blur();
      setCurrentPage(0);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearching, onSearchStateChange]);

  // Focus management
  useEffect(() => {
    if (isSearching) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 100);
      setCurrentPage(0);
      return () => clearTimeout(timer);
    }
  }, [isSearching]);

  // Reset pagination
  useEffect(() => {
    setCurrentPage(0);
  }, [searchEntries]);

  const handleSearchSubmit = useCallback(
    async (term?: string) => {
      const searchQuery = (term || searchTerm).trim();
      if (!searchQuery || isSubmitting) return;
      setIsSubmitting(true);
      try {
        saveSearchTerm(searchQuery).catch(console.error);
        onSearchStateChange(false);
        if (term && term !== searchTerm) onSearchTermChange(term);
        router.push(`/search-results?q=${encodeURIComponent(searchQuery)}`);
      } catch (error) {
        console.error("Search submission error:", error);
      } finally {
        setTimeout(() => setIsSubmitting(false), 500);
      }
    },
    [searchTerm, isSubmitting, saveSearchTerm, onSearchStateChange, onSearchTermChange, router]
  );

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearchSubmit();
      } else if (e.key === "Escape") {
        onSearchStateChange(false);
      }
    },
    [handleSearchSubmit, onSearchStateChange]
  );

  const handleSearchButtonClick = useCallback(() => {
    if (isSearching) handleSearchSubmit();
    else onSearchStateChange(true);
  }, [isSearching, handleSearchSubmit, onSearchStateChange]);

  const handleHistoryItemClick = useCallback(
    (historyTerm: string) => {
      saveSearchTerm(historyTerm).catch(console.error);
      onSearchStateChange(false);
      router.push(`/search-results?q=${encodeURIComponent(historyTerm)}`);
    },
    [saveSearchTerm, onSearchStateChange, router]
  );

  const handleDeleteHistoryItem = useCallback(
    async (e: React.MouseEvent, docId: string) => {
      e.stopPropagation();
      try {
        await deleteEntry(docId);
      } catch (error) {
        console.error("Failed to delete search history:", error);
      }
    },
    [deleteEntry]
  );

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      const { scrollTop, scrollHeight, clientHeight } = target;
      if (scrollHeight - scrollTop - clientHeight < 50 && !isLoadingMore) {
        const totalPages = Math.ceil(searchEntries.length / ITEMS_PER_PAGE);
        const nextPage = currentPage + 1;
        if (nextPage < totalPages) {
          setIsLoadingMore(true);
          setTimeout(() => {
            setCurrentPage(nextPage);
            setIsLoadingMore(false);
          }, 300);
        }
      }
    },
    [currentPage, searchEntries.length, isLoadingMore]
  );

  const handleSuggestionClick = useCallback(
    (suggestion: Suggestion | CategorySuggestion, type: "product" | "category") => {
      const displayName =
        type === "product"
          ? (suggestion as Suggestion).name
          : (suggestion as CategorySuggestion).displayName;
      onSearchTermChange(displayName || "");
      onSearchStateChange(false);
      const path =
        type === "product"
          ? `/productdetail/${suggestion.id}`
          : `/category/${suggestion.id}`;
      router.push(path);
    },
    [onSearchTermChange, onSearchStateChange, router]
  );

  const paginatedEntries = useMemo(() => {
    return searchEntries.slice(0, (currentPage + 1) * ITEMS_PER_PAGE);
  }, [searchEntries, currentPage]);

  const containerClasses = useMemo(
    () => (isMobile ? "relative w-full" : "relative w-full"),
    [isMobile]
  );

  const hasSearchResults = useMemo(
    () =>
      searchTerm.trim() &&
      (suggestions.length > 0 || categorySuggestions.length > 0 || isLoading || errorMessage),
    [searchTerm, suggestions.length, categorySuggestions.length, isLoading, errorMessage]
  );

  const showSearchHistory = useMemo(
    () => !searchTerm.trim() && searchEntries.length > 0,
    [searchTerm, searchEntries.length]
  );

  const hasMoreEntries = useMemo(
    () => paginatedEntries.length < searchEntries.length,
    [paginatedEntries.length, searchEntries.length]
  );

  // ========================================================================
  // SHARED STYLES
  // ========================================================================

  const dropdownBg = isDark ? "bg-gray-900" : "bg-white";
  const dropdownBorder = isDark ? "border-gray-700/60" : "border-gray-200/80";
  const hoverRow = isDark ? "hover:bg-white/5" : "hover:bg-gray-50";
  const mutedText = isDark ? "text-gray-500" : "text-gray-400";
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500";
  const primaryText = isDark ? "text-gray-100" : "text-gray-900";
  const labelText = isDark ? "text-gray-400" : "text-gray-500";

  return (
    <div className={containerClasses} ref={searchContainerRef}>
      {/* ================================================================
          SEARCH INPUT
          ================================================================ */}
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
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {isSubmitting ? (
            <Loader2 size={15} className={`animate-spin ${isDark ? "text-orange-400" : "text-orange-500"}`} />
          ) : (
            <Search
              size={15}
              className={`transition-colors duration-200 ${
                isSearching
                  ? isDark ? "text-orange-400" : "text-orange-500"
                  : isDark ? "text-gray-500" : "text-gray-400"
              } ${isLoading ? "animate-pulse" : ""}`}
            />
          )}
        </div>

        <input
          ref={searchInputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          onKeyDown={handleKeyPress}
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

        {/* Clear / Submit button */}
        {isSearching && searchTerm.trim() && (
          <button
            onClick={handleSearchButtonClick}
            disabled={isSubmitting}
            className={`
              absolute right-1.5 top-1/2 -translate-y-1/2
              h-7 px-2.5 rounded-xl text-[11px] font-semibold
              transition-all duration-200 active:scale-95
              ${isDark
                ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
                : "bg-orange-500 text-white hover:bg-orange-600"
              }
              ${isSubmitting ? "cursor-not-allowed opacity-60" : ""}
            `}
            aria-label={t("header.search")}
          >
            {isSubmitting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ArrowUpRight size={14} />
            )}
          </button>
        )}
      </div>

      {/* ================================================================
          DROPDOWN — portaled to body
          ================================================================ */}
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
              rounded-2xl shadow-2xl z-[9999]
              max-h-[420px] overflow-hidden
              animate-in fade-in slide-in-from-top-2 duration-200
            `}
          >
            {/* Firestore fallback banner */}
            {isFirestoreMode && (
              <div className="px-4 pt-3 pb-1">
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium
                    ${isDark ? "bg-orange-500/10 text-orange-300 border border-orange-500/15" : "bg-amber-50 text-amber-700 border border-amber-200/60"}`}
                >
                  <Sparkles size={12} />
                  <span>{t("header.limitedSearchMode") || "Limited search mode"}</span>
                </div>
              </div>
            )}

            {/* ============================================================
                SEARCH RESULTS
                ============================================================ */}
            {hasSearchResults ? (
              <div className="overflow-y-auto max-h-[400px] overscroll-contain">
                {/* Loading dots */}
                {isLoading && (
                  <div className="px-4 py-5 flex items-center justify-center gap-1.5">
                    {[0, 0.15, 0.3].map((delay, i) => (
                      <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full animate-bounce ${isDark ? "bg-orange-400" : "bg-orange-500"}`}
                        style={{ animationDelay: `${delay}s` }}
                      />
                    ))}
                  </div>
                )}

                {/* Error */}
                {errorMessage && (
                  <div className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm ${isDark ? "bg-red-500/10" : "bg-red-50"}`}>
                        {hasNetworkError ? "📡" : "⚠️"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${isDark ? "text-red-400" : "text-red-600"}`}>
                          {errorMessage}
                        </p>
                        <button
                          onClick={() => updateTerm(searchTerm)}
                          className={`text-xs font-medium mt-0.5 ${isDark ? "text-orange-400 hover:text-orange-300" : "text-orange-600 hover:text-orange-700"}`}
                        >
                          {t("header.tryAgain")}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Categories */}
                {categorySuggestions.length > 0 && !isFirestoreMode && (
                  <div className={`border-b ${isDark ? "border-gray-800" : "border-gray-100"}`}>
                    <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                      <span className={`text-[11px] font-semibold uppercase tracking-wider ${labelText}`}>
                        {t("header.categories")}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isDark ? "bg-orange-500/15 text-orange-400" : "bg-orange-100 text-orange-600"}`}>
                        AI
                      </span>
                    </div>
                    <div className="px-2 pb-2">
                      {categorySuggestions.slice(0, 3).map((category) => (
                        <button
                          key={category.id}
                          onClick={() => handleSuggestionClick(category, "category")}
                          data-search-action="category-suggestion"
                          className={`
                            w-full flex items-center gap-3 px-2.5 py-2 rounded-xl
                            ${hoverRow} transition-colors duration-150
                          `}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? "bg-orange-500/10" : "bg-orange-50"}`}>
                            <Grid3x3 size={14} className={isDark ? "text-orange-400" : "text-orange-500"} />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className={`text-[13px] font-medium truncate ${primaryText}`}>
                              {category.displayName}
                            </p>
                            <p className={`text-[11px] ${secondaryText}`}>
                              {t("header.levelCategory", { level: category.level })}
                            </p>
                          </div>
                          <TrendingUp size={13} className={mutedText} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Products */}
                {suggestions.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                      <span className={`text-[11px] font-semibold uppercase tracking-wider ${labelText}`}>
                        {t("header.products")}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isDark ? "bg-blue-500/15 text-blue-400" : "bg-blue-50 text-blue-600"}`}>
                        {suggestions.length}
                      </span>
                    </div>
                    <div className="px-2 pb-2 max-h-60 overflow-y-auto overscroll-contain">
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion.id}
                          onClick={() => handleSuggestionClick(suggestion, "product")}
                          data-search-action="product-suggestion"
                          className={`
                            w-full flex items-center gap-3 px-2.5 py-2 rounded-xl
                            ${hoverRow} transition-colors duration-150
                          `}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? "bg-blue-500/10" : "bg-blue-50"}`}>
                            <ShoppingBag size={14} className={isDark ? "text-blue-400" : "text-blue-500"} />
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className={`text-[13px] font-medium truncate ${primaryText}`}>
                              {suggestion.name}
                            </p>
                            <p className={`text-[11px] ${secondaryText}`}>
                              {t("header.price", { amount: suggestion.price.toFixed(2) })}
                            </p>
                          </div>
                          <ArrowUpRight size={13} className={mutedText} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* No results */}
                {!isLoading &&
                  !errorMessage &&
                  suggestions.length === 0 &&
                  categorySuggestions.length === 0 &&
                  searchTerm.trim() && (
                    <div className="px-4 py-8 text-center">
                      <div className={`w-11 h-11 mx-auto rounded-2xl flex items-center justify-center mb-3 ${isDark ? "bg-white/5" : "bg-gray-100"}`}>
                        <Search size={18} className={mutedText} />
                      </div>
                      <p className={`text-sm font-medium ${primaryText} mb-0.5`}>
                        {t("header.noResults")}
                      </p>
                      <p className={`text-xs ${secondaryText}`}>
                        {t("header.tryDifferentKeywords")}
                      </p>
                    </div>
                  )}
              </div>
            ) : showSearchHistory ? (
              /* ============================================================
                 SEARCH HISTORY
                 ============================================================ */
              <div>
                <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                  <Clock size={13} className={mutedText} />
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${labelText}`}>
                    {t("header.recentSearches")}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>
                    {searchEntries.length}
                  </span>
                </div>
                {isLoadingHistory ? (
                  <div className="px-4 py-6 flex justify-center">
                    <Loader2 size={18} className={`animate-spin ${mutedText}`} />
                  </div>
                ) : (
                  <div
                    ref={scrollContainerRef}
                    className="px-2 pb-2 max-h-64 overflow-y-auto overscroll-contain"
                    onScroll={handleScroll}
                  >
                    {paginatedEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`
                          flex items-center gap-3 px-2.5 py-2 rounded-xl group
                          ${hoverRow} transition-colors duration-150
                        `}
                      >
                        <button
                          onClick={() => handleHistoryItemClick(entry.searchTerm)}
                          data-search-action="history-item"
                          className="flex-1 flex items-center gap-3 text-left cursor-pointer min-w-0"
                        >
                          <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${isDark ? "bg-white/5" : "bg-gray-100"}`}>
                            <Clock size={13} className={mutedText} />
                          </div>
                          <p className={`text-[13px] font-medium truncate ${primaryText}`}>
                            {entry.searchTerm}
                          </p>
                        </button>
                        <button
                          onClick={(e) => handleDeleteHistoryItem(e, entry.id)}
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
                            <Loader2 size={12} className={`animate-spin ${mutedText}`} />
                          ) : (
                            <X size={12} className={`${mutedText} hover:text-red-500`} />
                          )}
                        </button>
                      </div>
                    ))}

                    {isLoadingMore && (
                      <div className="flex justify-center py-3">
                        <Loader2 size={14} className={`animate-spin ${mutedText}`} />
                      </div>
                    )}

                    {hasMoreEntries && !isLoadingMore && (
                      <div className="flex justify-center pt-1 pb-2">
                        <button
                          onClick={() => {
                            setIsLoadingMore(true);
                            setTimeout(() => {
                              setCurrentPage((prev) => prev + 1);
                              setIsLoadingMore(false);
                            }, 300);
                          }}
                          className={`
                            text-[11px] font-medium px-3 py-1.5 rounded-lg
                            ${isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}
                            transition-colors duration-200
                          `}
                        >
                          {t("header.loadMore")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* ============================================================
                 EMPTY STATE
                 ============================================================ */
              <div className="px-4 py-8 text-center">
                <div className={`w-11 h-11 mx-auto rounded-2xl flex items-center justify-center mb-3 ${isDark ? "bg-white/5" : "bg-gray-100"}`}>
                  <Search size={18} className={mutedText} />
                </div>
                <p className={`text-sm font-medium ${primaryText} mb-0.5`}>
                  {t("header.searchPlaceholder")}
                </p>
                <p className={`text-xs ${secondaryText}`}>
                  {t("header.startTypingPrompt")}
                </p>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}