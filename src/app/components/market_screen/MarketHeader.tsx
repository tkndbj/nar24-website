"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
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
import { getFirebaseAuth } from "@/lib/firebase-lazy";
import { useUser } from "@/context/UserProvider";
import { useTheme } from "@/hooks/useTheme";
import { useBadgeProvider } from "@/context/BadgeProvider";
import { useCartCount } from "@/hooks/selectors/useCartSelectors";
import { useFavoriteCount } from "@/hooks/selectors/useFavoriteSelectors";
import dynamic from "next/dynamic";
import SearchBar from "./SearchBar";

const NotificationDrawer = dynamic(
  () => import("../NotificationDrawer").then((mod) => ({ default: mod.NotificationDrawer })),
  { ssr: false }
);

interface MarketHeaderProps {
  className?: string;
}

export default function MarketHeader({ className = "" }: MarketHeaderProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  const { user, isLoading: userLoading } = useUser();
  const { unreadNotificationsCount } = useBadgeProvider();
  const cartCount = useCartCount();
  const favoriteCount = useFavoriteCount();
  const isDark = useTheme();

  const [isSearching, setIsSearching] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const languageMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pathname.includes("/search-results")) {
      setSearchTerm("");
      setIsSearching(false);
    }
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target as Node)) {
        setShowLanguageMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const switchLanguage = useCallback(
    (newLocale: string) => {
      setShowLanguageMenu(false);
      setTimeout(() => {
        let pathWithoutLocale = pathname;
        if (pathname.startsWith(`/${locale}`)) {
          pathWithoutLocale = pathname.substring(`/${locale}`.length) || "/";
        }
        router.push(`/${newLocale}${pathWithoutLocale}`);
      }, 50);
    },
    [pathname, locale, router]
  );

  const handleSearchStateChange = useCallback((searching: boolean) => {
    setIsSearching(searching);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const handleSearchSubmit = useCallback(
    (term?: string) => {
      const searchQuery = (term || searchTerm).trim();
      if (searchQuery) {
        setIsSearching(false);
        router.push(`/search-results?q=${encodeURIComponent(searchQuery)}`);
        if (!term) setSearchTerm("");
      }
    },
    [searchTerm, router]
  );

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    try {
      setIsLoggingOut(true);
      const [{ signOut }, auth] = await Promise.all([
        import("firebase/auth"),
        getFirebaseAuth(),
      ]);
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Error signing out:", error);
      setIsLoggingOut(false);
    }
  }, [isLoggingOut, router]);

  const NotificationBadge = useMemo(() => {
    if (!user || unreadNotificationsCount === 0) return null;
    return (
      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-emerald-500 rounded-full flex items-center justify-center ring-[1.5px] ring-white dark:ring-gray-900">
        <span className="text-white text-[8px] font-bold leading-none px-[3px]">
          {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
        </span>
      </span>
    );
  }, [user, unreadNotificationsCount]);

  const FavoriteBadge = useMemo(() => {
    if (!user || favoriteCount === 0) return null;
    return (
      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-pink-500 rounded-full flex items-center justify-center ring-[1.5px] ring-white dark:ring-gray-900">
        <span className="text-white text-[8px] font-bold leading-none px-[3px]">
          {favoriteCount > 9 ? "9+" : favoriteCount}
        </span>
      </span>
    );
  }, [user, favoriteCount]);

  const CartBadge = useMemo(() => {
    if (!user || cartCount === 0) return null;
    return (
      <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] bg-orange-500 rounded-full flex items-center justify-center ring-[1.5px] ring-white dark:ring-gray-900">
        <span className="text-white text-[8px] font-bold leading-none px-[3px]">
          {cartCount > 9 ? "9+" : cartCount}
        </span>
      </span>
    );
  }, [user, cartCount]);

  if (userLoading) {
    return (
      <header className={`sticky top-0 z-[100] ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"} border-b ${className}`}>
        <div className="safe-area-top">
          <div className="h-12 px-4 flex items-center justify-center">
            <div className={`animate-pulse h-5 w-14 rounded ${isDark ? "bg-gray-800" : "bg-gray-100"}`} />
          </div>
        </div>
      </header>
    );
  }

  const LanguageDropdown = () => (
    <div className={`absolute right-0 top-full mt-1 w-[108px] rounded-lg border shadow-lg overflow-hidden z-50 ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}>
      <button
        onClick={() => switchLanguage("tr")}
        className={`w-full flex items-center gap-1.5 px-2.5 py-2 text-left text-[11px] transition-colors ${
          locale === "tr"
            ? isDark ? "bg-orange-900/20 text-orange-400" : "bg-orange-50 text-orange-600"
            : isDark ? "text-gray-300 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span className="text-xs leading-none">🇹🇷</span>
        <span className="font-medium">{t("header.turkish")}</span>
      </button>
      <div className={`mx-2 ${isDark ? "border-gray-700" : "border-gray-100"} border-t`} />
      <button
        onClick={() => switchLanguage("en")}
        className={`w-full flex items-center gap-1.5 px-2.5 py-2 text-left text-[11px] transition-colors ${
          locale === "en"
            ? isDark ? "bg-orange-900/20 text-orange-400" : "bg-orange-50 text-orange-600"
            : isDark ? "text-gray-300 hover:bg-gray-700" : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        <span className="text-xs leading-none">🇺🇸</span>
        <span className="font-medium">{t("header.english")}</span>
      </button>
    </div>
  );

  const ActionIcons = ({ iconSize = 17 }: { iconSize?: number }) => {
    const btnCls = `relative p-2 rounded-xl transition-colors ${
      isDark
        ? "hover:bg-gray-800 text-gray-400 hover:text-gray-200"
        : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
    }`;

    const sep = <div className={`w-px h-4 mx-0.5 flex-shrink-0 ${isDark ? "bg-gray-800" : "bg-gray-200/80"}`} />;

    return (
      <div className="flex items-center flex-shrink-0">
        <div className="relative" ref={languageMenuRef}>
          <button onClick={() => setShowLanguageMenu(!showLanguageMenu)} className={btnCls} aria-label={t("header.languageSelection")}>
            <Globe size={iconSize} />
          </button>
          {showLanguageMenu && <LanguageDropdown />}
        </div>
        {sep}
        <button onClick={() => setIsNotificationOpen(true)} className={btnCls} aria-label={t("header.notifications")}>
          <Bell size={iconSize} />
          {NotificationBadge}
        </button>
        <button onClick={() => router.push("/favorite-products")} className={btnCls} aria-label={t("header.favorites")}>
          <Heart size={iconSize} />
          {FavoriteBadge}
        </button>
        <button onClick={() => router.push("/cart")} className={btnCls} aria-label={t("header.cart")}>
          <ShoppingCart size={iconSize} />
          {CartBadge}
        </button>
        {sep}
        <button onClick={() => router.push("/profile")} className={btnCls} aria-label={t("header.profile")}>
          <User size={iconSize} />
        </button>
        {user ? (
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-label={t("header.logout")}
            className={`p-2 rounded-xl transition-colors ${isDark ? "text-red-400 hover:bg-red-900/20" : "text-red-500 hover:bg-red-50"} ${isLoggingOut ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            <LogOut size={iconSize - 1} className={isLoggingOut ? "animate-pulse" : ""} />
          </button>
        ) : (
          <button onClick={() => router.push("/login")} className={btnCls} aria-label={t("header.login")}>
            <LogIn size={iconSize - 1} />
          </button>
        )}
      </div>
    );
  };

  const Logo = ({ size = "md" }: { size?: "sm" | "md" | "lg" }) => {
    const textSize = size === "sm" ? "text-[15px]" : size === "lg" ? "text-[22px]" : "text-lg";
    return (
      <button onClick={() => router.push("/")} className="flex items-center flex-shrink-0">
        <span className={`${textSize} font-extrabold tracking-tight font-[family-name:var(--font-figtree)] ${isDark ? "text-white" : "text-gray-900"}`}>
          Nar
        </span>
        <span className={`${textSize} font-extrabold tracking-tight text-orange-500 font-[family-name:var(--font-figtree)]`}>
          24
        </span>
      </button>
    );
  };

  return (
    <>
      <header
        className={`sticky top-0 z-[900] ${
          isDark ? "bg-gray-900/95 border-gray-800" : "bg-white/95 border-gray-100"
        } backdrop-blur-md border-b ${className}`}
      >
        <div className="safe-area-top">
          {/* ==============================================================
              MOBILE (< md)
              Row 1: Logo + Icons centered
              Row 2: Search full-width centered
              ============================================================== */}
          <div className="md:hidden">
            <div className="h-11 px-2 flex items-center justify-center">
              <div className="flex items-center gap-2 w-full max-w-lg">
                <Logo size="sm" />
                <div className="flex-1" />
                <ActionIcons iconSize={16} />
              </div>
            </div>
            <div className="px-2 pb-2 flex justify-center">
              <div className="w-full max-w-lg">
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
          </div>

          {/* ==============================================================
              TABLET (md – lg)
              Relative container with logo/icons in flow,
              search absolutely centered within the container.
              ============================================================== */}
          <div className="hidden md:flex lg:hidden h-12 items-center justify-center px-4">
            <div className="relative flex items-center w-full max-w-3xl">
              {/* Logo left, Icons right — in normal flow */}
              <Logo size="md" />
              <div className="flex-1" />
              <ActionIcons iconSize={17} />

              {/* Search — absolutely centered, ignores logo/icon widths */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-full max-w-[45%] pointer-events-auto">
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
              </div>
            </div>
          </div>

          {/* ==============================================================
              DESKTOP (≥ lg)
              Same approach: logo/icons in flow, search absolutely centered.
              ============================================================== */}
          <div className="hidden lg:flex h-13 xl:h-14 items-center justify-center px-6">
            <div className="relative flex items-center w-full max-w-5xl xl:max-w-6xl">
              {/* Logo left, Icons right — in normal flow */}
              <Logo size="lg" />
              <div className="flex-1" />
              <ActionIcons iconSize={18} />

              {/* Search — absolutely centered */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-full max-w-[40%] xl:max-w-[45%] pointer-events-auto">
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
              </div>
            </div>
          </div>
        </div>
      </header>

      <NotificationDrawer
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        isDarkMode={isDark}
      />
    </>
  );
}