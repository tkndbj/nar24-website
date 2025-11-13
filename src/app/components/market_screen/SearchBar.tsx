"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  Clock,
  X,
  ShoppingBag,
  Grid3x3,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  CategorySuggestion,
  Suggestion,
  useSearchProvider,
} from "@/context/SearchProvider";
import { useSearchHistory } from "@/context/SearchHistoryProvider";

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
  
  // ✅ SIMPLIFIED: Minimal state
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // ✅ OPTIMIZED: Body scroll lock only when needed
  useEffect(() => {
    if (isSearching && isMobile) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      
      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isSearching, isMobile]);

  // ✅ OPTIMIZED: Click outside handler with conditional setup
  useEffect(() => {
    if (!isSearching) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Check if clicked element or any parent has data-search-action attribute
      const searchAction = target.closest('[data-search-action]');

      console.log('👆 Click detected:', {
        target: target.tagName,
        hasSearchAction: !!searchAction,
        searchAction: searchAction?.getAttribute('data-search-action'),
        isInDropdown: dropdownRef.current?.contains(target),
        isInContainer: searchContainerRef.current?.contains(target),
      });

      // Don't close if clicking on a search action element (history item, suggestion, etc.)
      if (searchAction) {
        console.log('✋ Prevented close - search action element');
        return;
      }

      // Don't close if clicking inside the dropdown
      if (dropdownRef.current?.contains(target)) {
        console.log('✋ Prevented close - click inside dropdown');
        return;
      }

      // Don't close if clicking on the search input/button
      if (searchContainerRef.current?.contains(target)) {
        console.log('✋ Prevented close - click in search container');
        return;
      }

      console.log('🚪 Closing dropdown - outside click');
      onSearchStateChange(false);
      searchInputRef.current?.blur();
      setCurrentPage(0);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearching, onSearchStateChange]);

  // ✅ OPTIMIZED: Focus management
  useEffect(() => {
    if (isSearching) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      setCurrentPage(0);
      return () => clearTimeout(timer);
    }
  }, [isSearching]);

  // Reset pagination when entries change
  useEffect(() => {
    setCurrentPage(0);
  }, [searchEntries]);

  // ✅ OPTIMIZED: Search submission with debouncing
  const handleSearchSubmit = useCallback(async (term?: string) => {
    const searchQuery = (term || searchTerm).trim();
    
    if (!searchQuery || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Save to history (non-blocking)
      saveSearchTerm(searchQuery).catch(console.error);

      // Close dropdown
      onSearchStateChange(false);
      
      // Update term if different
      if (term && term !== searchTerm) {
        onSearchTermChange(term);
      }

      // Navigate
      router.push(`/search-results?q=${encodeURIComponent(searchQuery)}`);
      
    } catch (error) {
      console.error('Search submission error:', error);
    } finally {
      // Reset after a delay to prevent rapid submissions
      setTimeout(() => setIsSubmitting(false), 500);
    }
  }, [searchTerm, isSubmitting, saveSearchTerm, onSearchStateChange, onSearchTermChange, router]);

  // ✅ SIMPLIFIED: Key press handler
  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchSubmit();
    } else if (e.key === 'Escape') {
      onSearchStateChange(false);
    }
  }, [handleSearchSubmit, onSearchStateChange]);

  // ✅ SIMPLIFIED: Search button handler
  const handleSearchButtonClick = useCallback(() => {
    if (isSearching) {
      handleSearchSubmit();
    } else {
      onSearchStateChange(true);
    }
  }, [isSearching, handleSearchSubmit, onSearchStateChange]);

  // ✅ OPTIMIZED: History item click
  const handleHistoryItemClick = useCallback((historyTerm: string) => {
    console.log('🔍 History item clicked:', historyTerm);
    saveSearchTerm(historyTerm).catch(console.error);
    onSearchStateChange(false);
    router.push(`/search-results?q=${encodeURIComponent(historyTerm)}`);
  }, [saveSearchTerm, onSearchStateChange, router]);

  // ✅ OPTIMIZED: Delete history with event propagation stop
  const handleDeleteHistoryItem = useCallback(async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    try {
      await deleteEntry(docId);
    } catch (error) {
      console.error('Failed to delete search history:', error);
    }
  }, [deleteEntry]);

  // ✅ OPTIMIZED: Scroll handler with throttling
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
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
  }, [currentPage, searchEntries.length, isLoadingMore]);

  // ✅ OPTIMIZED: Suggestion click handler
  const handleSuggestionClick = useCallback((
    suggestion: Suggestion | CategorySuggestion,
    type: "product" | "category"
  ) => {
    const displayName = type === "product"
      ? (suggestion as Suggestion).name
      : (suggestion as CategorySuggestion).displayName;

    onSearchTermChange(displayName || "");
    onSearchStateChange(false);

    const path = type === "product" 
      ? `/productdetail/${suggestion.id}`
      : `/category/${suggestion.id}`;
    
    router.push(path);
  }, [onSearchTermChange, onSearchStateChange, router]);

  // ✅ MEMOIZED: Paginated entries
  const paginatedEntries = useMemo(() => {
    const endIndex = (currentPage + 1) * ITEMS_PER_PAGE;
    return searchEntries.slice(0, endIndex);
  }, [searchEntries, currentPage]);

  // ✅ MEMOIZED: Container classes
  const containerClasses = useMemo(() => 
    isMobile ? "relative w-full" : "relative w-[500px] max-w-[calc(100vw-12rem)]",
    [isMobile]
  );

  // ✅ MEMOIZED: Computed flags
  const hasSearchResults = useMemo(() => 
    searchTerm.trim() && (suggestions.length > 0 || categorySuggestions.length > 0 || isLoading || errorMessage),
    [searchTerm, suggestions.length, categorySuggestions.length, isLoading, errorMessage]
  );

  const showSearchHistory = useMemo(() => 
    !searchTerm.trim() && searchEntries.length > 0,
    [searchTerm, searchEntries.length]
  );

  const hasMoreEntries = useMemo(() => 
    paginatedEntries.length < searchEntries.length,
    [paginatedEntries.length, searchEntries.length]
  );

  return (
    <div className={containerClasses} ref={searchContainerRef}>
      <div
        className={`
          relative h-10 rounded-full
          ${isDark ? "bg-gray-800 border-gray-600" : "bg-gray-50 border-gray-300"}
          border-2 
          ${isSearching
            ? `shadow-lg ${isDark ? "border-blue-500" : "border-blue-400"} ring-2 ring-blue-500/20`
            : "hover:shadow-md hover:border-gray-400"
          }
        `}
      >
        <input
          ref={searchInputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          onKeyDown={handleKeyPress}
          onFocus={() => !isSearching && onSearchStateChange(true)}
          readOnly={!isSearching}
          disabled={isSubmitting}
          placeholder={t('header.searchPlaceholder')}
          className={`
            w-full h-full px-4 pr-12 bg-transparent border-none outline-none
            ${isDark ? "placeholder:text-gray-400 text-white" : "placeholder:text-gray-500 text-gray-900"}
            text-sm font-medium rounded-full
            ${isSubmitting ? 'cursor-not-allowed opacity-75' : ''}
          `}
        />

        <button
          onClick={handleSearchButtonClick}
          disabled={isSubmitting}
          className={`
            absolute right-2 top-1/2 transform -translate-y-1/2
            p-2 rounded-full transition-all duration-200
            ${isSearching
              ? "text-blue-500 hover:text-blue-600 hover:bg-blue-50/80 dark:hover:bg-blue-900/30"
              : "text-gray-400 hover:text-blue-500 hover:bg-blue-50/80 dark:hover:bg-blue-900/30"
            }
            active:scale-95
            ${isSubmitting ? 'cursor-not-allowed opacity-75' : ''}
          `}
          aria-label={isSearching ? t('header.search') : t('header.startSearch')}
        >
          {isSubmitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Search size={16} className={isLoading ? "animate-pulse" : ""} />
          )}
        </button>
      </div>

      {/* Search Dropdown */}
      {isSearching && (
        <div
          ref={dropdownRef}
          className={`
            absolute top-full left-0 right-0 mt-2
            ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}
            border rounded-2xl shadow-2xl backdrop-blur-xl z-50
            max-h-96 overflow-hidden
          `}
        >
          {/* Search Results */}
          {hasSearchResults ? (
            <>
              {/* Loading */}
              {isLoading && (
                <div className="p-4 flex justify-center">
                  <div className="flex space-x-2">
                    {[0, 0.1, 0.2].map((delay, i) => (
                      <div
                        key={i}
                        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: `${delay}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {errorMessage && (
                <div className="p-4">
                  <div className="flex items-center space-x-3 text-red-500">
                    <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      {hasNetworkError ? "📡" : "⚠️"}
                    </div>
                    <div>
                      <p className="font-medium">{errorMessage}</p>
                      <button
                        onClick={() => updateTerm(searchTerm)}
                        className="text-sm text-blue-500 hover:text-blue-600 mt-1"
                      >
                        {t('header.tryAgain')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Categories */}
              {categorySuggestions.length > 0 && (
                <div className="border-b border-gray-200 dark:border-gray-700 p-3">
                  <div className="flex items-center space-x-2 mb-3">
                    <Grid3x3 size={16} className="text-orange-500" />
                    <span className={`text-sm font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                      {t('header.categories')}
                    </span>
                    <div className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                      <span className="text-xs font-bold text-orange-600">
                        {t('header.aiPowered')}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {categorySuggestions.slice(0, 3).map((category) => (
                      <button
                        key={category.id}
                        onClick={() => handleSuggestionClick(category, "category")}
                        data-search-action="category-suggestion"
                        className={`
                          w-full flex items-center space-x-3 p-2 rounded-lg
                          ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"}
                          transition-colors duration-150
                        `}
                      >
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center">
                          <Grid3x3 size={14} className="text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                            {category.displayName}
                          </p>
                          <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                            {t('header.levelCategory', { level: category.level })}
                          </p>
                        </div>
                        <TrendingUp size={14} className="text-gray-400" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Products */}
              {suggestions.length > 0 && (
                <div className="p-3">
                  <div className="flex items-center space-x-2 mb-3">
                    <ShoppingBag size={16} className="text-blue-500" />
                    <span className={`text-sm font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                      {t('header.products')}
                    </span>
                    <div className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                      <span className="text-xs font-bold text-blue-600">
                        {suggestions.length}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        onClick={() => handleSuggestionClick(suggestion, "product")}
                        data-search-action="product-suggestion"
                        className={`
                          w-full flex items-center space-x-3 p-2 rounded-lg
                          ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"}
                          transition-colors duration-150
                        `}
                      >
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                          <ShoppingBag size={14} className="text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                            {suggestion.name}
                          </p>
                          <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                            {t('header.price', { amount: suggestion.price.toFixed(2) })}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* No Results */}
              {!isLoading && !errorMessage && suggestions.length === 0 && categorySuggestions.length === 0 && searchTerm.trim() && (
                <div className="p-6 text-center">
                  <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                    <Search size={20} className="text-gray-500" />
                  </div>
                  <p className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"} mb-1`}>
                    {t('header.noResults')}
                  </p>
                  <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    {t('header.tryDifferentKeywords')}
                  </p>
                </div>
              )}
            </>
          ) : showSearchHistory ? (
            /* Search History */
            <div className="p-3">
              <div className="flex items-center space-x-2 mb-3">
                <Clock size={16} className="text-gray-500" />
                <span className={`text-sm font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                  {t('header.recentSearches')}
                </span>
                <div className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                    {searchEntries.length}
                  </span>
                </div>
              </div>
              {isLoadingHistory ? (
                <div className="p-4 flex justify-center">
                  <Loader2 size={20} className="animate-spin text-gray-500" />
                </div>
              ) : (
                <div ref={scrollContainerRef} className="space-y-1 max-h-60 overflow-y-auto" onScroll={handleScroll}>
                  {paginatedEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-center space-x-3 p-2 rounded-lg ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"} transition-colors duration-150 group`}
                    >
                      <button
                        onClick={() => handleHistoryItemClick(entry.searchTerm)}
                        data-search-action="history-item"
                        className="flex-1 flex items-center space-x-3 text-left cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                          <Clock size={14} className="text-gray-500" />
                        </div>
                        <p className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                          {entry.searchTerm}
                        </p>
                      </button>
                      <button
                        onClick={(e) => handleDeleteHistoryItem(e, entry.id)}
                        disabled={isDeletingEntry(entry.id)}
                        className={`
                          p-1 rounded-full transition-all duration-200 ${isDark ? "hover:bg-red-900/30" : "hover:bg-red-100"} flex-shrink-0
                          ${isDeletingEntry(entry.id)
                            ? 'opacity-50 cursor-not-allowed'
                            : 'opacity-0 group-hover:opacity-100 cursor-pointer pointer-events-none group-hover:pointer-events-auto'
                          }
                        `}
                      >
                        {isDeletingEntry(entry.id) ? (
                          <Loader2 size={14} className="animate-spin text-gray-400" />
                        ) : (
                          <X size={14} className="text-gray-400 hover:text-red-500" />
                        )}
                      </button>
                    </div>
                  ))}
                  
                  {isLoadingMore && (
                    <div className="flex justify-center py-2">
                      <Loader2 size={16} className="animate-spin text-gray-500" />
                    </div>
                  )}
                  
                  {hasMoreEntries && !isLoadingMore && (
                    <div className="flex justify-center py-2">
                      <button
                        onClick={() => {
                          setIsLoadingMore(true);
                          setTimeout(() => {
                            setCurrentPage(prev => prev + 1);
                            setIsLoadingMore(false);
                          }, 300);
                        }}
                        className={`
                          text-xs px-3 py-1 rounded-full 
                          ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}
                          transition-colors duration-200
                        `}
                      >
                        {t('header.loadMore')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Empty State */
            <div className="p-6 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                <Search size={20} className="text-gray-500" />
              </div>
              <p className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"} mb-1`}>
                {t('header.searchPlaceholder')}
              </p>
              <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {t('header.startTypingPrompt')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}