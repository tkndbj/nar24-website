"use client";

import React, { useState, useEffect, lazy, Suspense } from "react";
import { useLocale } from "next-intl";
import SecondHeader from "../components/market_screen/SecondHeader";
import { MarketBubbles } from "../components/market_screen/MarketBubbles";
import { PreferenceProduct } from "../components/market_screen/PreferenceProduct";

// ✅ LAZY LOAD: Heavy components below the fold
const MarketBanner = lazy(() => import("../components/market_screen/MarketBanner"));
const DynamicHorizontalList = lazy(() => import("../components/market_screen/DynamicHorizontalList"));
const AdsBanner = lazy(() => import("../components/market_screen/MarketTopAdsBanner").then(mod => ({ default: mod.AdsBanner })));

// ✅ OPTIMIZED: Simple loading fallback component
const ComponentLoader = ({ isDark }: { isDark: boolean }) => (
  <div className="w-full">
    <div className="max-w-6xl mx-auto px-4">
      <div className={`w-full h-40 rounded-lg animate-pulse ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />
    </div>
  </div>
);

export default function Home() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  const locale = useLocale();

  // ✅ OPTIMIZED: Simplified theme detection without localStorage reads on every render
  useEffect(() => {
    const updateTheme = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };

    // Initial check
    updateTheme();

    // Watch for theme changes
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // ✅ NEW: Detect scroll to lazy load below-the-fold content
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 200 && !hasScrolled) {
        setHasScrolled(true);
      }
    };

    // Check immediately in case page loads scrolled
    handleScroll();

    // On large viewports, load content immediately to avoid empty space below the fold
    if (window.innerHeight > 900) {
      setHasScrolled(true);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasScrolled]);

  const handleNavigation = (index: number) => {
    console.log("Navigate to:", index);
  };

  return (
    <>
      {/* SecondHeader - Always visible */}
      <SecondHeader />

      {/* ✅ LAZY LOADED: AdsBanner */}
      <Suspense fallback={<ComponentLoader isDark={isDarkMode} />}>
        <div className={`w-full ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
          {/* Mobile: full width */}
          <div className="block lg:hidden">
            <AdsBanner />
          </div>

          {/* Desktop: centered layout */}
          <div className="hidden lg:block">
            <div className="mx-auto px-4" style={{ maxWidth: "1120px" }}>
              <AdsBanner />
            </div>
          </div>
        </div>
      </Suspense>

      <div
        className={`min-h-screen w-full ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="w-full">
          {/* Market Bubbles - Critical, always render */}
          <div
            className={`w-full pt-6 ${
              isDarkMode ? "bg-gray-900" : "bg-gray-50"
            }`}
          >
            <div className="max-w-6xl mx-auto px-4">
              <MarketBubbles
                onNavItemTapped={handleNavigation}
                locale={locale}
              />
            </div>
          </div>

          {/* Spacing */}
          <div
            className={`w-full h-5 ${
              isDarkMode ? "bg-gray-900" : "bg-gray-50"
            }`}
          />

          {/* Preference Product - Critical, always render */}
          <div
            className={`w-full ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
          >
            {/* Mobile: full width */}
            <div className="block lg:hidden">
              <PreferenceProduct keyPrefix="mobile-" />
            </div>

            {/* Desktop: centered layout */}
            <div className="hidden lg:block">
              <div className="max-w-6xl mx-auto px-4">
                <PreferenceProduct keyPrefix="desktop-" />
              </div>
            </div>
          </div>

          {/* ✅ LAZY LOADED: DynamicHorizontalList (loads after scroll or immediately if critical) */}
          {hasScrolled && (
            <Suspense fallback={<ComponentLoader isDark={isDarkMode} />}>
              <div
                className={`w-full ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
              >
                <DynamicHorizontalList keyPrefix="main-" />
              </div>
            </Suspense>
          )}

          {/* ✅ LAZY LOADED: Market Banner (loads after scroll) */}
          {hasScrolled && (
            <Suspense fallback={<ComponentLoader isDark={isDarkMode} />}>
              <div
                className={`w-full ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
              >
                <MarketBanner />
              </div>
            </Suspense>
          )}

          {/* Bottom padding */}
          <div
            className={`w-full h-8 ${
              isDarkMode ? "bg-gray-900" : "bg-gray-50"
            }`}
          />
        </div>
      </div>
    </>
  );
}