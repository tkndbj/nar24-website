"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
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

interface MarketHeaderProps {
  className?: string;
}

export default function MarketHeader({ className = "" }: MarketHeaderProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  
  // ✅ OPTIMIZED: Context hooks - data comes from providers
  const { user, isLoading: userLoading } = useUser();
  const { unreadNotificationsCount } = useBadgeProvider();
  const { cartCount } = useCart();
  const { favoriteCount } = useFavorites();

  // ✅ SIMPLIFIED: Minimal UI state
  const [isDark, setIsDark] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  
  // Drawer states
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  
  const languageMenuRef = useRef<HTMLDivElement>(null);

  // ✅ OPTIMIZED: Simplified theme detection without localStorage reads
  useEffect(() => {
    const updateTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    updateTheme();
    
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // ✅ OPTIMIZED: Click outside handler with proper cleanup (mobile + desktop)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        languageMenuRef.current &&
        !languageMenuRef.current.contains(event.target as Node)
      ) {
        setShowLanguageMenu(false);
      }
    };

    if (showLanguageMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("touchstart", handleClickOutside);
      };
    }
  }, [showLanguageMenu]);

  // ✅ OPTIMIZED: Simplified language switching
  const switchLanguage = useCallback((newLocale: string) => {
    const pathWithoutLocale = pathname.startsWith(`/${locale}`)
      ? pathname.substring(`/${locale}`.length) || "/"
      : pathname;
    
    const newPath = `/${newLocale}${pathWithoutLocale}`;
    const queryString = window.location.search;
    const finalPath = queryString ? `${newPath}${queryString}` : newPath;
    
    window.location.href = finalPath;
  }, [pathname, locale]);

  // ✅ SIMPLIFIED: Search handlers
  const handleSearchStateChange = useCallback((searching: boolean) => {
    setIsSearching(searching);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const handleSearchSubmit = useCallback((term?: string) => {
    const searchQuery = (term || searchTerm).trim();
    if (searchQuery) {
      setIsSearching(false);
      router.push(`/search-results?q=${encodeURIComponent(searchQuery)}`);
      if (!term) {
        setSearchTerm("");
      }
    }
  }, [searchTerm, router]);

  // ✅ OPTIMIZED: Logout handler with proper error handling
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

  // ✅ MEMOIZED: Badge components to prevent unnecessary re-renders
  const NotificationBadge = useMemo(() => {
    if (!user || unreadNotificationsCount === 0) return null;
    
    return (
      <div className="absolute -top-1 -right-1 min-w-[18px] lg:min-w-[20px] h-4 lg:h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-900">
        <span className="text-white text-xs font-bold px-1">
          {unreadNotificationsCount > 10 ? "+10" : unreadNotificationsCount}
        </span>
      </div>
    );
  }, [user, unreadNotificationsCount]);

  const FavoriteBadge = useMemo(() => {
    if (!user || favoriteCount === 0) return null;
    
    return (
      <div className="absolute -top-1 -right-1 min-w-[18px] lg:min-w-[20px] h-4 lg:h-5 bg-pink-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-900">
        <span className="text-white text-xs font-bold px-1">
          {favoriteCount > 99 ? "99+" : favoriteCount}
        </span>
      </div>
    );
  }, [user, favoriteCount]);

  const CartBadge = useMemo(() => {
    if (!user || cartCount === 0) return null;
    
    return (
      <div className="absolute -top-1 -right-1 min-w-[18px] lg:min-w-[20px] h-4 lg:h-5 bg-orange-500 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-900">
        <span className="text-white text-xs font-bold px-1">
          {cartCount > 99 ? "99+" : cartCount}
        </span>
      </div>
    );
  }, [user, cartCount]);

  // ✅ OPTIMIZED: Loading state with minimal UI
  if (userLoading) {
    return (
      <header className={`sticky top-0 z-50 ${isDark ? "bg-gray-900/95" : "bg-white/95"} backdrop-blur-xl border-b ${isDark ? "border-gray-700/50" : "border-gray-200/50"} ${className}`}>
        <div className="safe-area-top">
          <div className="h-16 px-4 flex items-center justify-center">
            <div className={`animate-pulse h-8 w-20 rounded ${isDark ? "bg-gray-800" : "bg-gray-200"}`}></div>
          </div>
        </div>
      </header>
    );
  }

  // ✅ MEMOIZED: Icon button styles
  const iconButtonClass = `
    relative p-2 lg:p-2.5 rounded-full transition-all duration-200
    ${isDark
      ? "hover:bg-gray-700 text-gray-300 hover:text-white"
      : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"}
    active:scale-95 group
  `;

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
              {/* Logo */}
              <button
                onClick={() => router.push("/")}
                className="text-xl font-bold bg-gradient-to-r from-orange-600 to-pink-600 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
              >
                Nar24
              </button>

              {/* Action Icons */}
              <div className="flex items-center gap-1">
                {/* Language */}
                <div className="relative" ref={languageMenuRef}>
                  <button
                    onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      setShowLanguageMenu(!showLanguageMenu);
                    }}
                    className={iconButtonClass}
                    aria-label={t("header.languageSelection")}
                  >
                    <Globe size={18} />
                  </button>

                  {showLanguageMenu && (
                    <div className={`
                      absolute right-0 top-full mt-2 w-32
                      ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}
                      border rounded-lg shadow-xl backdrop-blur-xl z-50
                      overflow-hidden
                    `}>
                      <button
                        onClick={() => switchLanguage("tr")}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          switchLanguage("tr");
                        }}
                        className={`
                          w-full flex items-center space-x-3 px-4 py-3 text-left
                          hover:bg-gray-100 dark:hover:bg-gray-700
                          transition-colors duration-150
                          ${locale === "tr" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : ""}
                        `}
                      >
                        <span className="text-lg">🇹🇷</span>
                        <span className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                          {t("header.turkish")}
                        </span>
                      </button>
                      <button
                        onClick={() => switchLanguage("en")}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          switchLanguage("en");
                        }}
                        className={`
                          w-full flex items-center space-x-3 px-4 py-3 text-left
                          hover:bg-gray-100 dark:hover:bg-gray-700
                          transition-colors duration-150
                          ${locale === "en" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : ""}
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

                {/* Notifications */}
                <button
                  onClick={() => setIsNotificationOpen(true)}
                  className={iconButtonClass}
                  aria-label={t("header.notifications")}
                >
                  <Bell size={18} />
                  {NotificationBadge}
                </button>

                {/* Favorites */}
                <button
                  onClick={() => setIsFavoritesOpen(true)}
                  className={iconButtonClass}
                  aria-label={t("header.favorites")}
                >
                  <Heart size={18} />
                  {FavoriteBadge}
                </button>

                {/* Cart */}
                <button
                  onClick={() => setIsCartOpen(true)}
                  className={iconButtonClass}
                  aria-label={t("header.cart")}
                >
                  <ShoppingCart size={18} />
                  {CartBadge}
                </button>

                {/* Profile */}
                <button
                  onClick={() => router.push("/profile")}
                  className={iconButtonClass}
                  aria-label={t("header.profile")}
                >
                  <User size={18} />
                </button>

                {/* Login/Logout */}
                {user ? (
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className={`
                      relative p-2 rounded-full transition-all duration-200
                      hover:bg-red-50 dark:hover:bg-red-900/30 active:scale-95
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
                    className={iconButtonClass}
                    aria-label={t("header.login")}
                  >
                    <LogIn size={16} />
                  </button>
                )}
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
                isMobile={true}
                t={t}
              />
            </div>
          </div>

          {/* Desktop Layout (Single Row) */}
          <div className="hidden lg:flex h-16 px-4 items-center w-full relative">
            {/* Logo - Positioned absolute left */}
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
                isMobile={false}
                t={t}
              />
            </div>

            {/* Action Icons - Desktop */}
            <div className="absolute right-4 z-10 flex items-center gap-2">
              {/* Language */}
              <div className="relative" ref={languageMenuRef}>
                <button
                  onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                  className={iconButtonClass}
                  aria-label={t("header.languageSelection")}
                >
                  <Globe size={20} />
                </button>

                {showLanguageMenu && (
                  <div className={`
                    absolute right-0 top-full mt-2 w-32
                    ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}
                    border rounded-lg shadow-xl backdrop-blur-xl z-50
                    overflow-hidden
                  `}>
                    <button
                      onClick={() => switchLanguage("tr")}
                      className={`
                        w-full flex items-center space-x-3 px-4 py-3 text-left
                        hover:bg-gray-100 dark:hover:bg-gray-700
                        transition-colors duration-150
                        ${locale === "tr" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : ""}
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
                        ${locale === "en" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : ""}
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

              {/* Notifications */}
              <button
                onClick={() => setIsNotificationOpen(true)}
                className={iconButtonClass}
                aria-label={t("header.notifications")}
              >
                <Bell size={20} />
                {NotificationBadge}
              </button>

              {/* Favorites */}
              <button
                onClick={() => setIsFavoritesOpen(true)}
                className={iconButtonClass}
                aria-label={t("header.favorites")}
              >
                <Heart size={20} />
                {FavoriteBadge}
              </button>

              {/* Cart */}
              <button
                onClick={() => setIsCartOpen(true)}
                className={iconButtonClass}
                aria-label={t("header.cart")}
              >
                <ShoppingCart size={20} />
                {CartBadge}
              </button>

              {/* Profile */}
              <button
                onClick={() => router.push("/profile")}
                className={iconButtonClass}
                aria-label={t("header.profile")}
              >
                <User size={20} />
              </button>

              {/* Login/Logout */}
              {user ? (
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className={`
                    relative p-2.5 rounded-full transition-all duration-200
                    hover:bg-red-50 dark:hover:bg-red-900/30 active:scale-95
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
                  className={iconButtonClass}
                  aria-label={t("header.login")}
                >
                  <LogIn size={18} />
                </button>
              )}
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