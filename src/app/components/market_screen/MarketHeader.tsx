"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Bell,
  Heart,
  ShoppingCart,
  User,
  LogOut,
  Globe,
  LogIn,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUser } from "@/context/UserProvider";
import { useBadgeProvider } from "@/context/BadgeProvider";
import { useCart } from "@/context/CartProvider";
import { useFavorites } from "@/context/FavoritesProvider";
import { FavoritesDrawer } from "../FavoritesDrawer";
import { NotificationDrawer } from "../NotificationDrawer";
import { CartDrawer } from "../profile/CartDrawer";
import SearchBar from "./SearchBar";
import {
  CategorySuggestion,
  Suggestion,
  useSearchProvider,
} from "@/context/SearchProvider";

interface MarketHeaderProps {
  className?: string;
}

export default function MarketHeader({ className = "" }: MarketHeaderProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  
  // Auth and providers
  const { user, isLoading: userLoading } = useUser();
  const { unreadNotificationsCount } = useBadgeProvider();
  const { cartCount } = useCart();
  const { favoriteCount } = useFavorites();
  const {
    updateTerm,
    isLoading: searchLoading,
    clearSearchState,
    suggestions,
    categorySuggestions,
    errorMessage,
  } = useSearchProvider();

  // UI State
  const [isDark, setIsDark] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  
  // Drawers
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  
  const languageMenuRef = useRef<HTMLDivElement>(null);

  // Handle theme detection
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDark(document.documentElement.classList.contains("dark"));
      }
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => observer.disconnect();
  }, []);

  // Handle click outside for language menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        languageMenuRef.current &&
        !languageMenuRef.current.contains(event.target as Node)
      ) {
        setShowLanguageMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Show/hide suggestions
  useEffect(() => {
    if (isSearching && searchTerm.trim()) {
      const hasResults = suggestions.length > 0 || categorySuggestions.length > 0;
      const hasError = errorMessage !== null;
      const shouldShow = hasResults || hasError || searchLoading;
      setShowSuggestions(shouldShow);
    } else {
      setShowSuggestions(false);
    }
  }, [isSearching, searchTerm, suggestions, categorySuggestions, errorMessage, searchLoading]);

  // Simplified language switching
  const switchLanguage = useCallback((newLocale: string) => {
    let pathWithoutLocale = pathname;
    if (pathname.startsWith(`/${locale}`)) {
      pathWithoutLocale = pathname.substring(`/${locale}`.length) || "/";
    }
    
    const newPath = `/${newLocale}${pathWithoutLocale}`;
    
    // Preserve query parameters
    const currentParams = new URLSearchParams(window.location.search);
    const queryString = currentParams.toString();
    const finalPath = queryString ? `${newPath}?${queryString}` : newPath;
    
    // Use window.location for more reliable navigation during locale switch
    window.location.href = finalPath;
    setShowLanguageMenu(false);
  }, [pathname, locale]);

  // Handle search
  const handleSearchStateChange = useCallback((searching: boolean) => {
    if (searching) {
      setIsSearching(true);
      setShowSuggestions(true);
    } else {
      setIsSearching(false);
      setShowSuggestions(false);      
    }
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (isSearching) {
      updateTerm(value);
    }
  }, [isSearching, updateTerm]);

  const handleSearchSubmit = useCallback(async (term?: string) => {
    const searchQuery = (term || searchTerm).trim();
    if (searchQuery) {
      setShowSuggestions(false);
      setIsSearching(false);
      router.push(`/search-results?q=${encodeURIComponent(searchQuery)}`);
      if (!term) {
        // Only clear if it's a regular search, not from history
        setSearchTerm("");
        clearSearchState();
      }
    }
  }, [searchTerm, router, clearSearchState]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearchSubmit();
    } else if (e.key === "Escape") {
      handleSearchStateChange(false);
    }
  }, [handleSearchSubmit, handleSearchStateChange]);

  const handleSuggestionClick = useCallback((
    suggestion: Suggestion | CategorySuggestion,
    type: "product" | "category"
  ) => {
    const displayName = type === "product"
      ? (suggestion as Suggestion).name
      : (suggestion as CategorySuggestion).displayName;

    setSearchTerm(displayName || "");
    setShowSuggestions(false);
    setIsSearching(false);

    if (type === "product") {
      router.push(`/productdetail/${suggestion.id}`);
    } else {
      router.push(`/category/${suggestion.id}`);
    }
  }, [router]);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    
    try {
      setIsLoggingOut(true);
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Error signing out:", error);
      setIsLoggingOut(false);
    }
  }, [isLoggingOut, router]);

  const handleNavigation = useCallback((path: string) => {
    router.push(path);
  }, [router]);

  const handleCartClick = useCallback(() => {
    setIsCartOpen(true);
  }, []);

  const handleFavoritesClick = useCallback(() => {
    setIsFavoritesOpen(true);
  }, []);

  const handleNotificationClick = useCallback(() => {
    setIsNotificationOpen(true);
  }, []);

  // Loading state
  if (userLoading) {
    return (
      <header className={`sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-gray-200/50 ${className}`}>
        <div className="safe-area-top">
          <div className="h-16 px-4 flex items-center justify-center">
            <div className="animate-pulse h-8 w-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <>
      <header className={`
        sticky top-0 z-50
        ${isDark ? "bg-gray-900/95 border-gray-700/50" : "bg-white/95 border-gray-200/50"}
        backdrop-blur-xl border-b shadow-sm ${className}
      `}>
        <div className="safe-area-top">
          {/* Mobile Layout (Two Rows) */}
          <div className="lg:hidden">
            {/* First Row - Logo and Icons */}
            <div className="h-16 px-4 flex items-center justify-between">
              {/* Logo/Brand */}
              <button
                onClick={() => router.push("/")}
                className="text-xl font-bold bg-gradient-to-r from-orange-600 to-pink-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
              >
                Nar24
              </button>

              {/* Action Icons */}
              <div className="flex items-center gap-1">
                {/* Notifications */}
                <div className="relative">
                  <button
                    onClick={handleNotificationClick}
                    className={`
                      relative p-2 rounded-full transition-all duration-200
                      ${isDark
                        ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                        : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"}
                      active:scale-95 group
                    `}
                    aria-label={t("header.notifications")}
                  >
                    <Bell size={18} />
                    {user && unreadNotificationsCount > 0 && (
                      <div className="absolute -top-1 -right-1 min-w-[18px] h-4 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-900">
                        <span className="text-white text-xs font-bold px-1">
                          {unreadNotificationsCount > 10 ? "+10" : unreadNotificationsCount}
                        </span>
                      </div>
                    )}
                  </button>
                </div>

                {/* Language Switcher */}
                <div className="relative" ref={languageMenuRef}>
                  <button
                    onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                    className={`
                      relative p-2 rounded-full transition-all duration-200
                      ${isDark
                        ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                        : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"}
                      active:scale-95 group
                    `}
                    aria-label={t("header.languageSelection")}
                  >
                    <Globe size={18} />
                  </button>

                  {/* Language Menu */}
                  {showLanguageMenu && (
                    <div className={`
                      absolute right-0 top-full mt-2 w-32
                      ${isDark ? "bg-gray-800" : "bg-white"}
                      border ${isDark ? "border-gray-700" : "border-gray-200"}
                      rounded-lg shadow-xl backdrop-blur-xl z-50
                      overflow-hidden
                    `}>
                      <button
                        onClick={() => switchLanguage("tr")}
                        className={`
                          w-full flex items-center space-x-3 px-4 py-3 text-left
                          hover:bg-gray-100 dark:hover:bg-gray-700 
                          active:bg-gray-200 dark:active:bg-gray-600
                          transition-colors duration-150 cursor-pointer
                          ${locale === "tr"
                            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                            : ""}
                        `}
                      >
                        <span className="text-lg">🇹🇷</span>
                        <span className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                          {t("header.turkish")}
                        </span>
                      </button>
                      <button
                        onClick={() => switchLanguage("en")}
                        className={`
                          w-full flex items-center space-x-3 px-4 py-3 text-left
                          hover:bg-gray-100 dark:hover:bg-gray-700 
                          active:bg-gray-200 dark:active:bg-gray-600
                          transition-colors duration-150 cursor-pointer
                          ${locale === "en"
                            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                            : ""}
                        `}
                      >
                        <span className="text-lg">🇺🇸</span>
                        <span className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                          {t("header.english")}
                        </span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Favorites */}
                <div className="relative">
                  <button
                    onClick={handleFavoritesClick}
                    className={`
                      relative p-2 rounded-full transition-all duration-200
                      ${isDark
                        ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                        : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"}
                      active:scale-95 group
                    `}
                    aria-label={t("header.favorites")}
                  >
                    <Heart size={18} />
                    {user && favoriteCount > 0 && (
                      <div className="absolute -top-1 -right-1 min-w-[18px] h-4 bg-pink-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-900">
                        <span className="text-white text-xs font-bold px-1">
                          {favoriteCount > 99 ? "99+" : favoriteCount}
                        </span>
                      </div>
                    )}
                  </button>
                </div>

                {/* Cart */}
                <div className="relative">
                  <button
                    onClick={handleCartClick}
                    className={`
                      relative p-2 rounded-full transition-all duration-200
                      ${isDark
                        ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                        : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"}
                      active:scale-95 group
                    `}
                    aria-label={t("header.cart")}
                  >
                    <ShoppingCart size={18} />
                    {user && cartCount > 0 && (
                      <div className="absolute -top-1 -right-1 min-w-[18px] h-4 bg-orange-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-900">
                        <span className="text-white text-xs font-bold px-1">
                          {cartCount > 99 ? "99+" : cartCount}
                        </span>
                      </div>
                    )}
                  </button>
                </div>

                {/* Profile */}
                <div className="relative">
                  <button
                    onClick={() => handleNavigation("/profile")}
                    className={`
                      relative p-2 rounded-full transition-all duration-200
                      ${isDark
                        ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                        : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"}
                      active:scale-95 group
                    `}
                    aria-label={t("header.profile")}
                  >
                    <User size={18} />
                  </button>
                </div>

                {/* Login/Logout */}
                <div className="relative">
                  {user ? (
                    <button
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className={`
                        relative p-2 rounded-full transition-all duration-200
                        hover:bg-red-50 dark:hover:bg-red-900/30 active:scale-95 group
                        text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300
                        ${isLoggingOut ? "opacity-50 cursor-not-allowed" : ""}
                      `}
                      aria-label={t("header.logout")}
                    >
                      <LogOut size={16} className={isLoggingOut ? "animate-pulse" : ""} />
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push("/login")}
                      className={`
                        relative p-2 rounded-full transition-all duration-200
                        ${isDark
                          ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                          : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"}
                        active:scale-95 group
                      `}
                      aria-label={t("header.login")}
                    >
                      <LogIn size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Second Row - Search Bar */}
            <div className="px-4 pb-3">
              <SearchBar
                isDark={isDark}
                isSearching={isSearching}
                onSearchStateChange={handleSearchStateChange}
                searchTerm={searchTerm}
                onSearchTermChange={handleSearchChange}
                onSearchSubmit={handleSearchSubmit}
                onKeyPress={handleKeyPress}
                showSuggestions={showSuggestions}
                onSuggestionClick={handleSuggestionClick}
                onHistoryItemClick={handleSearchSubmit}
                isMobile={true}
                t={t}
              />
            </div>
          </div>

          {/* Desktop Layout (Single Row) */}
          <div className="hidden lg:flex h-16 px-4 items-center w-full relative">
            {/* Logo/Brand - Positioned absolute left with offset */}
            <div className="absolute left-1/2 transform -translate-x-1/2 -ml-127 z-10">
              <button
                onClick={() => router.push("/")}
                className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-pink-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
              >
                Nar24
              </button>
            </div>

            {/* Search Bar - Centered */}
            <div className="absolute left-1/2 transform -translate-x-1/2 z-0">
              <SearchBar
                isDark={isDark}
                isSearching={isSearching}
                onSearchStateChange={handleSearchStateChange}
                searchTerm={searchTerm}
                onSearchTermChange={handleSearchChange}
                onSearchSubmit={handleSearchSubmit}
                onKeyPress={handleKeyPress}
                showSuggestions={showSuggestions}
                onSuggestionClick={handleSuggestionClick}
                onHistoryItemClick={handleSearchSubmit}
                isMobile={false}
                t={t}
              />
            </div>

            {/* Action Icons - Desktop */}
            <div className="absolute right-4 z-10 flex items-center gap-1 lg:gap-2">
              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={handleNotificationClick}
                  className={`
                    relative p-2.5 rounded-full transition-all duration-200
                    ${isDark
                      ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                      : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"}
                    active:scale-95 group
                  `}
                  aria-label={t("header.notifications")}
                >
                  <Bell size={20} />
                  {user && unreadNotificationsCount > 0 && (
                    <div className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-900">
                      <span className="text-white text-xs font-bold px-1">
                        {unreadNotificationsCount > 10 ? "+10" : unreadNotificationsCount}
                      </span>
                    </div>
                  )}
                </button>
              </div>

              {/* Language Switcher */}
              <div className="relative" ref={languageMenuRef}>
                <button
                  onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                  className={`
                    relative p-2.5 rounded-full transition-all duration-200
                    ${isDark
                      ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                      : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"}
                    active:scale-95 group
                  `}
                  aria-label={t("header.languageSelection")}
                >
                  <Globe size={20} />
                </button>

                {/* Language Menu */}
                {showLanguageMenu && (
                  <div className={`
                    absolute right-0 top-full mt-2 w-32
                    ${isDark ? "bg-gray-800" : "bg-white"}
                    border ${isDark ? "border-gray-700" : "border-gray-200"}
                    rounded-lg shadow-xl backdrop-blur-xl z-50
                    overflow-hidden
                  `}>
                    <button
                      onClick={() => switchLanguage("tr")}
                      className={`
                        w-full flex items-center space-x-3 px-4 py-3 text-left
                        hover:bg-gray-100 dark:hover:bg-gray-700 
                        transition-colors duration-150
                        ${locale === "tr"
                          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                          : ""}
                      `}
                    >
                      <span className="text-lg">🇹🇷</span>
                      <span className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                        {t("header.turkish")}
                      </span>
                    </button>
                    <button
                      onClick={() => switchLanguage("en")}
                      className={`
                        w-full flex items-center space-x-3 px-4 py-3 text-left
                        hover:bg-gray-100 dark:hover:bg-gray-700 
                        transition-colors duration-150
                        ${locale === "en"
                          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                          : ""}
                      `}
                    >
                      <span className="text-lg">🇺🇸</span>
                      <span className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                        {t("header.english")}
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Favorites */}
              <div className="relative">
                <button
                  onClick={handleFavoritesClick}
                  className={`
                    relative p-2.5 rounded-full transition-all duration-200
                    ${isDark
                      ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                      : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"}
                    active:scale-95 group
                  `}
                  aria-label={t("header.favorites")}
                >
                  <Heart size={20} />
                  {user && favoriteCount > 0 && (
                    <div className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-pink-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-900">
                      <span className="text-white text-xs font-bold px-1">
                        {favoriteCount > 99 ? "99+" : favoriteCount}
                      </span>
                    </div>
                  )}
                </button>
              </div>

              {/* Cart */}
              <div className="relative">
                <button
                  onClick={handleCartClick}
                  className={`
                    relative p-2.5 rounded-full transition-all duration-200
                    ${isDark
                      ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                      : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"}
                    active:scale-95 group
                  `}
                  aria-label={t("header.cart")}
                >
                  <ShoppingCart size={20} />
                  {user && cartCount > 0 && (
                    <div className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-orange-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-900">
                      <span className="text-white text-xs font-bold px-1">
                        {cartCount > 99 ? "99+" : cartCount}
                      </span>
                    </div>
                  )}
                </button>
              </div>

              {/* Profile */}
              <div className="relative">
                <button
                  onClick={() => handleNavigation("/profile")}
                  className={`
                    relative p-2.5 rounded-full transition-all duration-200
                    ${isDark
                      ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                      : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"}
                    active:scale-95 group
                  `}
                  aria-label={t("header.profile")}
                >
                  <User size={20} />
                </button>
              </div>

              {/* Login/Logout */}
              <div className="relative">
                {user ? (
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className={`
                      relative p-2.5 rounded-full transition-all duration-200
                      hover:bg-red-50 dark:hover:bg-red-900/30 active:scale-95 group
                      text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300
                      ${isLoggingOut ? "opacity-50 cursor-not-allowed" : ""}
                    `}
                    aria-label={t("header.logout")}
                  >
                    <LogOut size={18} className={isLoggingOut ? "animate-pulse" : ""} />
                  </button>
                ) : (
                  <button
                    onClick={() => router.push("/login")}
                    className={`
                      relative p-2.5 rounded-full transition-all duration-200
                      ${isDark
                        ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                        : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"}
                      active:scale-95 group
                    `}
                    aria-label={t("header.login")}
                  >
                    <LogIn size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Drawer components */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        isDarkMode={isDark}
        localization={t}
      />
      <FavoritesDrawer
        isOpen={isFavoritesOpen}
        onClose={() => setIsFavoritesOpen(false)}
        isDarkMode={isDark}
        localization={t}
      />
      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        isDarkMode={isDark}
      />
    </>
  );
}