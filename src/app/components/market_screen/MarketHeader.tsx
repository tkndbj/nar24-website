"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Search,
  Bell,
  Heart,
  ShoppingCart,
  User,
  LogOut,
  ArrowLeft,
  ShoppingBag,
  Grid3x3,
  TrendingUp,
  Globe, // ADD: Import Globe icon for language switcher
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation"; // ADD: Import usePathname
import { useLocale } from "next-intl"; // ADD: Import useLocale
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUser } from "@/context/UserProvider";
import { useBadgeProvider } from "@/context/BadgeProvider";
import { useCart } from "@/context/CartProvider";
import { useFavorites } from "@/context/FavoritesProvider";
import { FavoritesDrawer } from "../FavoritesDrawer";
import { NotificationDrawer } from "../NotificationDrawer";

import {
  CategorySuggestion,
  Suggestion,
  useSearchProvider,
} from "@/context/SearchProvider";
import { CartDrawer } from "../CartDrawer";

interface MarketHeaderProps {
  onTakePhoto?: () => void;
  onSelectFromAlbum?: () => void;
  backgroundColorNotifier?: string;
  useWhiteColors?: boolean;
  isDefaultView?: boolean;
  className?: string;
}

export default function MarketHeader({ className = "" }: MarketHeaderProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false); // ADD: Language menu state
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null); // ADD: Language menu ref
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const { favoriteCount } = useFavorites();
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname(); // ADD: Get current pathname
  const locale = useLocale(); // ADD: Get current locale

  // Auth and providers
  const { user, isLoading: userLoading } = useUser();
  const { unreadNotificationsCount } = useBadgeProvider();
  const { cartCount } = useCart();
  const {
    updateTerm,
    search,
    isLoading,
    clearSearchState,
    suggestions,
    categorySuggestions,
    errorMessage,
    hasNetworkError,
  } = useSearchProvider();

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

  // Handle click outside for search
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
        searchInputRef.current?.blur();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ADD: Handle click outside for language menu
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
      const hasResults =
        suggestions.length > 0 || categorySuggestions.length > 0;
      const hasError = errorMessage !== null;
      const shouldShow = hasResults || hasError || isLoading;
      setShowSuggestions(shouldShow);
    } else {
      setShowSuggestions(false);
    }
  }, [
    isSearching,
    searchTerm,
    suggestions,
    categorySuggestions,
    errorMessage,
    isLoading,
  ]);

  // ADD: Language switching function
  const switchLanguage = (newLocale: string) => {
    // Remove the current locale from pathname if it exists
    let pathWithoutLocale = pathname;
    if (pathname.startsWith(`/${locale}`)) {
      pathWithoutLocale = pathname.substring(`/${locale}`.length) || "/";
    }

    // Add the new locale to the path
    const newPath = `/${newLocale}${pathWithoutLocale}`;
    router.push(newPath);
    setShowLanguageMenu(false);
  };

  const handleFavoritesClick = () => {
    if (!user) {
      router.push("/login");
      return;
    }
    setIsFavoritesOpen(true);
  };

  const handleNotificationClick = () => {
    if (!user) {
      router.push("/login");
      return;
    }
    setIsNotificationOpen(true);
  };

  const handleSearchStateChange = (searching: boolean) => {
    if (searching) {
      setIsSearching(true);
      setShowSuggestions(true);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      setIsSearching(false);
      setShowSuggestions(false);
      clearSearchAndState();
    }
  };

  const clearSearchAndState = () => {
    setSearchTerm("");
    clearSearchState();
    searchInputRef.current?.blur();
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (isSearching) {
      updateTerm(value);
    }
  };

  const handleSearchSubmit = async () => {
    if (searchTerm.trim()) {
      await search(searchTerm.trim());
      setShowSuggestions(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearchSubmit();
    } else if (e.key === "Escape") {
      handleSearchStateChange(false);
    }
  };

  const handleSuggestionClick = (
    suggestion: Suggestion | CategorySuggestion,
    type: "product" | "category"
  ) => {
    const displayName =
      type === "product"
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
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;

    try {
      setIsLoggingOut(true);
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Error signing out:", error);
      setIsLoggingOut(false);
    }
  };

  const handleNavigation = (path: string) => {
    if (!user) {
      router.push("/login");
      return;
    }
    router.push(path);
  };

  const handleCartClick = () => {
    if (!user) {
      router.push("/login");
      return;
    }
    setIsCartOpen(true);
  };

  // Don't render if user is still loading
  if (userLoading) {
    return (
      <header
        className={`sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b border-gray-200/50 ${className}`}
      >
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
      <header
        className={`
          sticky top-0 z-50 transition-all duration-300 ease-in-out
          ${
            isDark
              ? "bg-gray-900/95 border-gray-700/50"
              : "bg-white/95 border-gray-200/50"
          }
          backdrop-blur-xl border-b shadow-sm ${className}
        `}
      >
        <div className="safe-area-top">
          {/* Mobile Layout (Two Rows) */}
          <div className="lg:hidden">
            {/* First Row - Logo and Icons */}
            <div className="h-16 px-4 flex items-center justify-between">
              {/* Back button when searching */}
              {isSearching && (
                <button
                  onClick={() => handleSearchStateChange(false)}
                  className={`
                    p-2 rounded-full transition-all duration-200 flex-shrink-0
                    ${
                      isDark
                        ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                        : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                    }
                    active:scale-95
                  `}
                  aria-label="Back"
                >
                  <ArrowLeft size={20} />
                </button>
              )}

              {/* Logo/Brand */}
              {!isSearching && (
                <button
                  onClick={() => router.push("/")}
                  className="text-xl font-bold bg-gradient-to-r from-orange-600 to-pink-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
                >
                  Nar24
                </button>
              )}

              {/* Action Icons */}
              {!isSearching && (
                <div className="flex items-center gap-1">
                  {/* Show auth-dependent icons only if user is logged in */}
                  {user ? (
                    <>
                      {/* Notifications */}
                      <div className="relative">
                        <button
                          onClick={handleNotificationClick}
                          className={`
                            relative p-2 rounded-full transition-all duration-200
                            ${
                              isDark
                                ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                                : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                            }
                            active:scale-95 group
                          `}
                          aria-label="Bildirimler"
                        >
                          <Bell size={18} />
                          {unreadNotificationsCount > 0 && (
                            <div className="absolute -top-1 -right-1 min-w-[18px] h-4 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-900">
                              <span className="text-white text-xs font-bold px-1">
                                {unreadNotificationsCount > 10
                                  ? "+10"
                                  : unreadNotificationsCount}
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
                            ${
                              isDark
                                ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                                : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                            }
                            active:scale-95 group
                          `}
                          aria-label="Dil Seçimi"
                        >
                          <Globe size={18} />
                        </button>

                        {/* Language Menu */}
                        {showLanguageMenu && (
                          <div
                            className={`
                              absolute right-0 top-full mt-2 w-32
                              ${isDark ? "bg-gray-800" : "bg-white"}
                              border ${
                                isDark ? "border-gray-700" : "border-gray-200"
                              }
                              rounded-lg shadow-xl backdrop-blur-xl z-50
                              overflow-hidden
                            `}
                          >
                            <button
                              onClick={() => switchLanguage("tr")}
                              className={`
                                w-full flex items-center space-x-3 px-4 py-3 text-left
                                hover:bg-gray-100 dark:hover:bg-gray-700 
                                transition-colors duration-150
                                ${
                                  locale === "tr"
                                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                    : ""
                                }
                              `}
                            >
                              <span className="text-lg">🇹🇷</span>
                              <span
                                className={`text-sm font-medium ${
                                  isDark ? "text-gray-200" : "text-gray-900"
                                }`}
                              >
                                Türkçe
                              </span>
                            </button>
                            <button
                              onClick={() => switchLanguage("en")}
                              className={`
                                w-full flex items-center space-x-3 px-4 py-3 text-left
                                hover:bg-gray-100 dark:hover:bg-gray-700 
                                transition-colors duration-150
                                ${
                                  locale === "en"
                                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                    : ""
                                }
                              `}
                            >
                              <span className="text-lg">🇺🇸</span>
                              <span
                                className={`text-sm font-medium ${
                                  isDark ? "text-gray-200" : "text-gray-900"
                                }`}
                              >
                                English
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
                            ${
                              isDark
                                ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                                : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                            }
                            active:scale-95 group
                          `}
                          aria-label="Favoriler"
                        >
                          <Heart size={18} />
                          {favoriteCount > 0 && (
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
                            ${
                              isDark
                                ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                                : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                            }
                            active:scale-95 group
                          `}
                          aria-label="Sepet"
                        >
                          <ShoppingCart size={18} />
                          {cartCount > 0 && (
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
                            ${
                              isDark
                                ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                                : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                            }
                            active:scale-95 group
                          `}
                          aria-label="Profil"
                        >
                          <User size={18} />
                        </button>
                      </div>

                      {/* Logout */}
                      <div className="relative">
                        <button
                          onClick={handleLogout}
                          disabled={isLoggingOut}
                          className={`
                            relative p-2 rounded-full transition-all duration-200
                            hover:bg-red-50 dark:hover:bg-red-900/30 active:scale-95 group
                            text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300
                            ${
                              isLoggingOut
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }
                          `}
                          aria-label="Çıkış"
                        >
                          <LogOut
                            size={16}
                            className={isLoggingOut ? "animate-pulse" : ""}
                          />
                        </button>
                      </div>
                    </>
                  ) : (
                    /* Login button for non-authenticated users */
                    <div className="flex items-center gap-2">
                      {/* Language Switcher for non-authenticated users too */}
                      <div className="relative" ref={languageMenuRef}>
                        <button
                          onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                          className={`
                            relative p-2 rounded-full transition-all duration-200
                            ${
                              isDark
                                ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                                : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                            }
                            active:scale-95 group
                          `}
                          aria-label="Dil Seçimi"
                        >
                          <Globe size={18} />
                        </button>

                        {/* Language Menu */}
                        {showLanguageMenu && (
                          <div
                            className={`
                              absolute right-0 top-full mt-2 w-32
                              ${isDark ? "bg-gray-800" : "bg-white"}
                              border ${
                                isDark ? "border-gray-700" : "border-gray-200"
                              }
                              rounded-lg shadow-xl backdrop-blur-xl z-50
                              overflow-hidden
                            `}
                          >
                            <button
                              onClick={() => switchLanguage("tr")}
                              className={`
                                w-full flex items-center space-x-3 px-4 py-3 text-left
                                hover:bg-gray-100 dark:hover:bg-gray-700 
                                transition-colors duration-150
                                ${
                                  locale === "tr"
                                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                    : ""
                                }
                              `}
                            >
                              <span className="text-lg">🇹🇷</span>
                              <span
                                className={`text-sm font-medium ${
                                  isDark ? "text-gray-200" : "text-gray-900"
                                }`}
                              >
                                Türkçe
                              </span>
                            </button>
                            <button
                              onClick={() => switchLanguage("en")}
                              className={`
                                w-full flex items-center space-x-3 px-4 py-3 text-left
                                hover:bg-gray-100 dark:hover:bg-gray-700 
                                transition-colors duration-150
                                ${
                                  locale === "en"
                                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                    : ""
                                }
                              `}
                            >
                              <span className="text-lg">🇺🇸</span>
                              <span
                                className={`text-sm font-medium ${
                                  isDark ? "text-gray-200" : "text-gray-900"
                                }`}
                              >
                                English
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => router.push("/login")}
                        className={`
                          px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200
                          bg-gradient-to-r from-orange-500 to-pink-500 text-white
                          hover:from-orange-600 hover:to-pink-600 active:scale-95
                          shadow-md hover:shadow-lg
                        `}
                      >
                        Giriş
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Second Row - Search Bar */}
            <div className="px-4 pb-3">
              <div ref={searchContainerRef} className="relative w-full">
                <div
                  className={`
                    relative h-10 rounded-full transition-all duration-300 ease-in-out
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
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyPress={handleKeyPress}
                    onFocus={() =>
                      !isSearching && handleSearchStateChange(true)
                    }
                    readOnly={!isSearching}
                    placeholder="Ürün ara..."
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
                        ? handleSearchSubmit
                        : () => handleSearchStateChange(true)
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
                    aria-label={isSearching ? "Arama yap" : "Aramaya başla"}
                  >
                    <Search
                      size={16}
                      className={isLoading ? "animate-pulse" : ""}
                    />
                  </button>
                </div>

                {/* Search Suggestions Dropdown - Mobile */}
                {showSuggestions && (
                  <div
                    className={`
                      absolute top-full left-0 right-0 mt-2 
                      ${isDark ? "bg-gray-800" : "bg-white"}
                      border ${isDark ? "border-gray-700" : "border-gray-200"}
                      rounded-2xl shadow-2xl backdrop-blur-xl z-50
                      max-h-96 overflow-hidden
                    `}
                  >
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
                              Try again
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
                              Kategoriler
                            </span>
                            <div className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                              <span className="text-xs font-bold text-orange-600">
                                AI
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            {categorySuggestions.slice(0, 3).map((category) => (
                              <button
                                key={category.id}
                                onClick={() =>
                                  handleSuggestionClick(category, "category")
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
                                    Seviye {category.level} kategori
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
                            Ürünler
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
                                handleSuggestionClick(suggestion, "product")
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
                                  {suggestion.price.toFixed(2)} TL
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No Results */}
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
                            Sonuç bulunamadı
                          </p>
                          <p
                            className={`text-xs ${
                              isDark ? "text-gray-400" : "text-gray-500"
                            }`}
                          >
                            Farklı anahtar kelimeler deneyin
                          </p>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Layout (Single Row) - Unchanged */}
          <div className="hidden lg:flex h-16 px-4 items-center w-full relative">
            {/* Back button when searching */}
            {isSearching && (
              <button
                onClick={() => handleSearchStateChange(false)}
                className={`
                  absolute left-4 z-10 p-2 rounded-full transition-all duration-200 flex-shrink-0
                  ${
                    isDark
                      ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                      : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                  }
                  active:scale-95
                `}
                aria-label="Back"
              >
                <ArrowLeft size={20} />
              </button>
            )}

            {/* Logo/Brand */}
            {!isSearching && (
              <div className="absolute left-4 z-10">
                <button
                  onClick={() => router.push("/")}
                  className="text-xl font-bold bg-gradient-to-r from-orange-600 to-pink-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
                >
                  Nar24
                </button>
              </div>
            )}

            {/* Search Bar */}
            <div className="absolute left-1/2 transform -translate-x-1/2 z-0">
              <div
                ref={searchContainerRef}
                className={`relative transition-all duration-300 ease-in-out ${
                  isSearching
                    ? "w-[700px] max-w-[calc(100vw-8rem)]"
                    : "w-[500px] max-w-[calc(100vw-12rem)]"
                }`}
              >
                <div
                  className={`
                    relative h-10 rounded-full transition-all duration-300 ease-in-out
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
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyPress={handleKeyPress}
                    onFocus={() =>
                      !isSearching && handleSearchStateChange(true)
                    }
                    readOnly={!isSearching}
                    placeholder="Ürün ara..."
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
                        ? handleSearchSubmit
                        : () => handleSearchStateChange(true)
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
                    aria-label={isSearching ? "Arama yap" : "Aramaya başla"}
                  >
                    <Search
                      size={16}
                      className={isLoading ? "animate-pulse" : ""}
                    />
                  </button>
                </div>

                {/* Search Suggestions Dropdown - Desktop */}
                {showSuggestions && (
                  <div
                    className={`
                      absolute top-full left-0 right-0 mt-2 
                      ${isDark ? "bg-gray-800" : "bg-white"}
                      border ${isDark ? "border-gray-700" : "border-gray-200"}
                      rounded-2xl shadow-2xl backdrop-blur-xl z-50
                      max-h-96 overflow-hidden
                    `}
                  >
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
                              Try again
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
                              Kategoriler
                            </span>
                            <div className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 rounded-full">
                              <span className="text-xs font-bold text-orange-600">
                                AI
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            {categorySuggestions.slice(0, 3).map((category) => (
                              <button
                                key={category.id}
                                onClick={() =>
                                  handleSuggestionClick(category, "category")
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
                                    Seviye {category.level} kategori
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
                            Ürünler
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
                                handleSuggestionClick(suggestion, "product")
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
                                  {suggestion.price.toFixed(2)} TL
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* No Results */}
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
                            Sonuç bulunamadı
                          </p>
                          <p
                            className={`text-xs ${
                              isDark ? "text-gray-400" : "text-gray-500"
                            }`}
                          >
                            Farklı anahtar kelimeler deneyin
                          </p>
                        </div>
                      )}
                  </div>
                )}
              </div>
            </div>

            {/* Action Icons - Desktop */}
            {!isSearching && (
              <div className="absolute right-4 z-10 flex items-center gap-1 lg:gap-2">
                {/* Show auth-dependent icons only if user is logged in */}
                {user ? (
                  <>
                    {/* Notifications */}
                    <div className="relative">
                      <button
                        onClick={handleNotificationClick}
                        className={`
                          relative p-2.5 rounded-full transition-all duration-200
                          ${
                            isDark
                              ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                              : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                          }
                          active:scale-95 group
                        `}
                        aria-label="Bildirimler"
                      >
                        <Bell size={20} />
                        {unreadNotificationsCount > 0 && (
                          <div className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-900">
                            <span className="text-white text-xs font-bold px-1">
                              {unreadNotificationsCount > 10
                                ? "+10"
                                : unreadNotificationsCount}
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
                          ${
                            isDark
                              ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                              : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                          }
                          active:scale-95 group
                        `}
                        aria-label="Dil Seçimi"
                      >
                        <Globe size={20} />
                      </button>

                      {/* Language Menu */}
                      {showLanguageMenu && (
                        <div
                          className={`
                            absolute right-0 top-full mt-2 w-32
                            ${isDark ? "bg-gray-800" : "bg-white"}
                            border ${
                              isDark ? "border-gray-700" : "border-gray-200"
                            }
                            rounded-lg shadow-xl backdrop-blur-xl z-50
                            overflow-hidden
                          `}
                        >
                          <button
                            onClick={() => switchLanguage("tr")}
                            className={`
                              w-full flex items-center space-x-3 px-4 py-3 text-left
                              hover:bg-gray-100 dark:hover:bg-gray-700 
                              transition-colors duration-150
                              ${
                                locale === "tr"
                                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                  : ""
                              }
                            `}
                          >
                            <span className="text-lg">🇹🇷</span>
                            <span
                              className={`text-sm font-medium ${
                                isDark ? "text-gray-200" : "text-gray-900"
                              }`}
                            >
                              Türkçe
                            </span>
                          </button>
                          <button
                            onClick={() => switchLanguage("en")}
                            className={`
                              w-full flex items-center space-x-3 px-4 py-3 text-left
                              hover:bg-gray-100 dark:hover:bg-gray-700 
                              transition-colors duration-150
                              ${
                                locale === "en"
                                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                  : ""
                              }
                            `}
                          >
                            <span className="text-lg">🇺🇸</span>
                            <span
                              className={`text-sm font-medium ${
                                isDark ? "text-gray-200" : "text-gray-900"
                              }`}
                            >
                              English
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
                          ${
                            isDark
                              ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                              : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                          }
                          active:scale-95 group
                        `}
                        aria-label="Favoriler"
                      >
                        <Heart size={20} />
                        {favoriteCount > 0 && (
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
                          ${
                            isDark
                              ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                              : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                          }
                          active:scale-95 group
                        `}
                        aria-label="Sepet"
                      >
                        <ShoppingCart size={20} />
                        {cartCount > 0 && (
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
                          ${
                            isDark
                              ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                              : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                          }
                          active:scale-95 group
                        `}
                        aria-label="Profil"
                      >
                        <User size={20} />
                      </button>
                    </div>

                    {/* Logout */}
                    <div className="relative">
                      <button
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className={`
                          relative p-2.5 rounded-full transition-all duration-200
                          hover:bg-red-50 dark:hover:bg-red-900/30 active:scale-95 group
                          text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300
                          ${isLoggingOut ? "opacity-50 cursor-not-allowed" : ""}
                        `}
                        aria-label="Çıkış"
                      >
                        <LogOut
                          size={18}
                          className={isLoggingOut ? "animate-pulse" : ""}
                        />
                      </button>
                    </div>
                  </>
                ) : (
                  /* Login button for non-authenticated users */
                  <div className="flex items-center gap-2">
                    {/* Language Switcher for non-authenticated users too */}
                    <div className="relative" ref={languageMenuRef}>
                      <button
                        onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                        className={`
                          relative p-2.5 rounded-full transition-all duration-200
                          ${
                            isDark
                              ? "hover:bg-gray-700 text-gray-300 hover:text-white"
                              : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                          }
                          active:scale-95 group
                        `}
                        aria-label="Dil Seçimi"
                      >
                        <Globe size={20} />
                      </button>

                      {/* Language Menu */}
                      {showLanguageMenu && (
                        <div
                          className={`
                            absolute right-0 top-full mt-2 w-32
                            ${isDark ? "bg-gray-800" : "bg-white"}
                            border ${
                              isDark ? "border-gray-700" : "border-gray-200"
                            }
                            rounded-lg shadow-xl backdrop-blur-xl z-50
                            overflow-hidden
                          `}
                        >
                          <button
                            onClick={() => switchLanguage("tr")}
                            className={`
                              w-full flex items-center space-x-3 px-4 py-3 text-left
                              hover:bg-gray-100 dark:hover:bg-gray-700 
                              transition-colors duration-150
                              ${
                                locale === "tr"
                                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                  : ""
                              }
                            `}
                          >
                            <span className="text-lg">🇹🇷</span>
                            <span
                              className={`text-sm font-medium ${
                                isDark ? "text-gray-200" : "text-gray-900"
                              }`}
                            >
                              Türkçe
                            </span>
                          </button>
                          <button
                            onClick={() => switchLanguage("en")}
                            className={`
                              w-full flex items-center space-x-3 px-4 py-3 text-left
                              hover:bg-gray-100 dark:hover:bg-gray-700 
                              transition-colors duration-150
                              ${
                                locale === "en"
                                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                  : ""
                              }
                            `}
                          >
                            <span className="text-lg">🇺🇸</span>
                            <span
                              className={`text-sm font-medium ${
                                isDark ? "text-gray-200" : "text-gray-900"
                              }`}
                            >
                              English
                            </span>
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => router.push("/login")}
                      className={`
                        px-4 py-2 rounded-full text-sm font-medium transition-all duration-200
                        bg-gradient-to-r from-orange-500 to-pink-500 text-white
                        hover:from-orange-600 hover:to-pink-600 active:scale-95
                        shadow-md hover:shadow-lg
                      `}
                    >
                      Giriş Yap
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Cart Drawer Component */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        isDarkMode={isDark}
      />
      <FavoritesDrawer
        isOpen={isFavoritesOpen}
        onClose={() => setIsFavoritesOpen(false)}
        isDarkMode={isDark}
      />
      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        isDarkMode={isDark}
      />
    </>
  );
}
