"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
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
  onSearchSubmit: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  showSuggestions: boolean;
  onSuggestionClick: (
    suggestion: Suggestion | CategorySuggestion,
    type: "product" | "category"
  ) => void;
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
  onSearchSubmit,
  onKeyPress,
  showSuggestions,
  onSuggestionClick,
  isMobile = false,
  t,
}: SearchBarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Pagination state for search history
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const {
    isLoading,
    suggestions,
    categorySuggestions,
    errorMessage,
    hasNetworkError,
    updateTerm,
  } = useSearchProvider();

  // Search history integration
  const {
    searchEntries,
    isLoadingHistory,
    deleteEntry,
    isDeletingEntry,
  } = useSearchHistory();

  // Body scroll lock when dropdown is active
  useEffect(() => {
    if (isSearching) {
      // Lock body scroll
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore body scroll
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isSearching]);

  // Handle click outside for search
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        onSearchStateChange(false);
        searchInputRef.current?.blur();
        setCurrentPage(0); // Reset pagination when closing
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onSearchStateChange]);

  // Focus input when entering search mode
  useEffect(() => {
    if (isSearching) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      setCurrentPage(0); // Reset pagination when opening
    }
  }, [isSearching]);

  // Reset pagination when search entries change
  useEffect(() => {
    setCurrentPage(0);
  }, [searchEntries]);

  const containerClasses = isMobile
    ? "relative w-full"
    : "relative w-[500px] max-w-[calc(100vw-12rem)]";

  // Handle search history item click
  const handleHistoryItemClick = useCallback((historyTerm: string) => {
    onSearchTermChange(historyTerm);
    onSearchStateChange(false);
    // Navigate to search results
    router.push(`/search-results?q=${encodeURIComponent(historyTerm)}`);
  }, [onSearchTermChange, onSearchStateChange, router]);

  // Handle delete history item
  const handleDeleteHistoryItem = useCallback(async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation(); // Prevent triggering the search
    try {
      await deleteEntry(docId);
    } catch (error) {
      console.error('Failed to delete search history item:', error);
    }
  }, [deleteEntry]);

  // Handle scroll for pagination
  const handleScroll = useCallback(async (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const { scrollTop, scrollHeight, clientHeight } = target;
    
    // Check if we're near the bottom (within 50px)
    if (scrollHeight - scrollTop - clientHeight < 50) {
      const totalPages = Math.ceil(searchEntries.length / ITEMS_PER_PAGE);
      const nextPage = currentPage + 1;
      
      if (nextPage < totalPages && !isLoadingMore) {
        setIsLoadingMore(true);
        // Simulate loading delay for smooth UX
        setTimeout(() => {
          setCurrentPage(nextPage);
          setIsLoadingMore(false);
        }, 300);
      }
    }
  }, [currentPage, searchEntries.length, isLoadingMore]);

  // Get paginated search entries
  const getPaginatedEntries = useCallback(() => {
    const endIndex = (currentPage + 1) * ITEMS_PER_PAGE;
    return searchEntries.slice(0, endIndex);
  }, [searchEntries, currentPage]);

  // Determine what to show in dropdown
  const hasSearchResults = searchTerm.trim() && (suggestions.length > 0 || categorySuggestions.length > 0 || isLoading || errorMessage);
  const showSearchHistory = !searchTerm.trim() && searchEntries.length > 0;
  const paginatedEntries = getPaginatedEntries();
  const hasMoreEntries = paginatedEntries.length < searchEntries.length;

  return (
    <div className={containerClasses} ref={searchContainerRef}>
      <div
        className={`
          relative h-10 rounded-full
          ${
            isDark
              ? "bg-gray-800 border-gray-600"
              : "bg-gray-50 border-gray-300"
          }
          border-2 
          ${
            isSearching
              ? `shadow-lg ${
                  isDark ? "border-blue-500" : "border-blue-400"
                } ring-2 ring-blue-500/20`
              : "hover:shadow-md hover:border-gray-400"
          }
        `}
      >
        <input
          ref={searchInputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          onKeyPress={onKeyPress}
          onFocus={() => !isSearching && onSearchStateChange(true)}
          readOnly={!isSearching}
          placeholder={t('header.searchPlaceholder')}
          className={`
            w-full h-full px-4 pr-12 bg-transparent border-none outline-none
            ${
              isDark
                ? "placeholder:text-gray-400 text-white"
                : "placeholder:text-gray-500 text-gray-900"
            }
            text-sm font-medium rounded-full
          `}
        />

        <button
          onClick={
            isSearching
              ? onSearchSubmit
              : () => onSearchStateChange(true)
          }
          className={`
            absolute right-2 top-1/2 transform -translate-y-1/2
            p-2 rounded-full transition-all duration-200
            ${
              isSearching
                ? "text-blue-500 hover:text-blue-600 hover:bg-blue-50/80 dark:hover:bg-blue-900/30"
                : "text-gray-400 hover:text-blue-500 hover:bg-blue-50/80 dark:hover:bg-blue-900/30"
            }
            active:scale-95
          `}
          aria-label={isSearching ? t('header.search') : t('header.startSearch')}
        >
          <Search
            size={16}
            className={isLoading ? "animate-pulse" : ""}
          />
        </button>
      </div>

      {/* Search Dropdown - Shows when searching */}
      {isSearching && (
        <div
          className={`
            absolute top-full left-0 right-0 mt-2 
            ${isDark ? "bg-gray-800" : "bg-white"}
            border ${isDark ? "border-gray-700" : "border-gray-200"}
            rounded-2xl shadow-2xl backdrop-blur-xl z-50
            max-h-96 overflow-hidden
          `}
        >
          {/* Show search results if user has typed something and there are results */}
          {hasSearchResults ? (
            <>
              {/* Loading State */}
              {isLoading && (
                <div className="p-4">
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Error State */}
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

              {/* Categories Section */}
              {categorySuggestions.length > 0 && (
                <div className="border-b border-gray-200 dark:border-gray-700">
                  <div className="p-3">
                    <div className="flex items-center space-x-2 mb-3">
                      <Grid3x3 size={16} className="text-orange-500" />
                      <span
                        className={`text-sm font-semibold ${
                          isDark ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
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
                          onClick={() =>
                            onSuggestionClick(category, "category")
                          }
                          className={`
                            w-full flex items-center space-x-3 p-2 rounded-lg
                            hover:bg-gray-100 dark:hover:bg-gray-700 
                            transition-colors duration-150
                          `}
                        >
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center">
                            <Grid3x3 size={14} className="text-white" />
                          </div>
                          <div className="flex-1 text-left">
                            <p
                              className={`text-sm font-medium ${
                                isDark ? "text-gray-200" : "text-gray-900"
                              }`}
                            >
                              {category.displayName}
                            </p>
                            <p
                              className={`text-xs ${
                                isDark ? "text-gray-400" : "text-gray-500"
                              }`}
                            >
                              {t('header.levelCategory', { level: category.level })}
                            </p>
                          </div>
                          <TrendingUp
                            size={14}
                            className={`${
                              isDark ? "text-gray-400" : "text-gray-400"
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Products Section */}
              {suggestions.length > 0 && (
                <div className="p-3">
                  <div className="flex items-center space-x-2 mb-3">
                    <ShoppingBag size={16} className="text-blue-500" />
                    <span
                      className={`text-sm font-semibold ${
                        isDark ? "text-gray-300" : "text-gray-700"
                      }`}
                    >
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
                        onClick={() =>
                          onSuggestionClick(suggestion, "product")
                        }
                        className={`
                          w-full flex items-center space-x-3 p-2 rounded-lg
                          hover:bg-gray-100 dark:hover:bg-gray-700 
                          transition-colors duration-150
                        `}
                      >
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                          <ShoppingBag size={14} className="text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <p
                            className={`text-sm font-medium ${
                              isDark ? "text-gray-200" : "text-gray-900"
                            }`}
                          >
                            {suggestion.name}
                          </p>
                          <p
                            className={`text-xs ${
                              isDark ? "text-gray-400" : "text-gray-500"
                            }`}
                          >
                            {t('header.price', { amount: suggestion.price.toFixed(2) })}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* No Results when user has typed something */}
              {!isLoading &&
                !errorMessage &&
                suggestions.length === 0 &&
                categorySuggestions.length === 0 &&
                searchTerm.trim() && (
                  <div className="p-6 text-center">
                    <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                      <Search
                        size={20}
                        className={`${
                          isDark ? "text-gray-400" : "text-gray-500"
                        }`}
                      />
                    </div>
                    <p
                      className={`text-sm font-medium ${
                        isDark ? "text-gray-300" : "text-gray-700"
                      } mb-1`}
                    >
                      {t('header.noResults')}
                    </p>
                    <p
                      className={`text-xs ${
                        isDark ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {t('header.tryDifferentKeywords')}
                    </p>
                  </div>
                )}
            </>
          ) : showSearchHistory ? (
            /* Search History Section with Pagination */
            <div className="p-3">
              <div className="flex items-center space-x-2 mb-3">
                <Clock size={16} className="text-gray-500" />
                <span
                  className={`text-sm font-semibold ${
                    isDark ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {t('header.recentSearches')}
                </span>
                <div className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                    {searchEntries.length}
                  </span>
                </div>
              </div>
              {isLoadingHistory ? (
                <div className="p-4">
                  <div className="flex items-center justify-center space-x-2">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                  </div>
                </div>
              ) : (
                <div 
                  ref={scrollContainerRef}
                  className="space-y-1 max-h-60 overflow-y-auto"
                  onScroll={handleScroll}
                >
                  {paginatedEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`
                        flex items-center space-x-3 p-2 rounded-lg
                        hover:bg-gray-100 dark:hover:bg-gray-700 
                        transition-colors duration-150 group
                      `}
                    >
                      <button
                        onClick={() => handleHistoryItemClick(entry.searchTerm)}
                        className="flex-1 flex items-center space-x-3 text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                          <Clock size={14} className="text-gray-500" />
                        </div>
                        <div className="flex-1">
                          <p
                            className={`text-sm font-medium ${
                              isDark ? "text-gray-200" : "text-gray-900"
                            }`}
                          >
                            {entry.searchTerm}
                          </p>
                        </div>
                      </button>
                      <button
                        onClick={(e) => handleDeleteHistoryItem(e, entry.id)}
                        disabled={isDeletingEntry(entry.id)}
                        className={`
                          p-1 rounded-full opacity-0 group-hover:opacity-100 
                          transition-all duration-200 hover:bg-red-100 dark:hover:bg-red-900/30
                          ${isDeletingEntry(entry.id) ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                        aria-label={t('header.deleteSearchHistory')}
                      >
                        <X size={14} className="text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                  
                  {/* Loading More Indicator */}
                  {isLoadingMore && (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 size={16} className="animate-spin text-gray-500" />
                      <span className={`ml-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {t('header.loadingMore')}
                      </span>
                    </div>
                  )}
                  
                  {/* Load More Button (fallback if scroll doesn't work) */}
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
                          ${isDark 
                            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }
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
            /* Empty state - when user clicks search bar but hasn't typed anything and no history */
            <div className="p-6 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                <Search
                  size={20}
                  className={`${
                    isDark ? "text-gray-400" : "text-gray-500"
                  }`}
                />
              </div>
              <p
                className={`text-sm font-medium ${
                  isDark ? "text-gray-300" : "text-gray-700"
                } mb-1`}
              >
                {t('header.searchPlaceholder')}
              </p>
              <p
                className={`text-xs ${
                  isDark ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {t('header.startTypingPrompt')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}