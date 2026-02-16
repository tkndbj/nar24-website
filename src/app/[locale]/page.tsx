"use client";

import React, { useState, useEffect, lazy, Suspense, useMemo, useCallback, memo } from "react";
import { useLocale } from "next-intl";
import SecondHeader from "../components/market_screen/SecondHeader";
import Footer from "../components/Footer";
import { useMarketLayout } from "@/hooks/useMarketLayout";
import { useTheme } from "@/hooks/useTheme";
import { MarketWidgetConfig, WidgetType } from "@/types/MarketLayout";

// ============================================================================
// LAZY LOADED COMPONENTS
// ============================================================================

// Critical above-the-fold components — loaded eagerly
import { MarketBubbles } from "../components/market_screen/MarketBubbles";
import { PreferenceProduct } from "../components/market_screen/PreferenceProduct";

// Below-the-fold components — lazy loaded (only fetched when needed)
const MarketBanner = lazy(() => import("../components/market_screen/MarketBanner"));
const AdsBanner = lazy(() =>
  import("../components/market_screen/MarketTopAdsBanner").then(mod => ({ default: mod.AdsBanner }))
);
const ThinBanner = lazy(() => import("../components/market_screen/MarketThinBanner"));
const BoostedProductCarousel = lazy(() => import("../components/market_screen/BoostedProductCarousel"));
const DynamicHorizontalList = lazy(() => import("../components/market_screen/DynamicHorizontalList"));
const ShopHorizontalList = lazy(() => import("../components/market_screen/ShopHorizontalList"));

// ============================================================================
// LOADING COMPONENTS
// ============================================================================

interface LoaderProps {
  isDark: boolean;
  height?: string;
}

const ComponentLoader = memo(({ isDark, height = "h-40" }: LoaderProps) => (
  <div className="w-full">
    {/* Mobile: full width with padding */}
    <div className="block lg:hidden px-0">
      <div
        className={`w-full ${height} rounded-lg animate-pulse ${
          isDark ? "bg-gray-800" : "bg-gray-200"
        }`}
      />
    </div>
    {/* Desktop: centered layout matching components */}
    <div className="hidden lg:block">
      <div className="max-w-[1400px] mx-auto px-6">
        <div
          className={`w-full ${height} rounded-lg animate-pulse ${
            isDark ? "bg-gray-800" : "bg-gray-200"
          }`}
        />
      </div>
    </div>
  </div>
));
ComponentLoader.displayName = "ComponentLoader";

const FullWidthLoader = memo(({ isDark, height = "h-40" }: LoaderProps) => (
  <div 
    className={`w-full ${height} animate-pulse ${
      isDark ? "bg-gray-800" : "bg-gray-200"
    }`} 
  />
));
FullWidthLoader.displayName = "FullWidthLoader";

// ============================================================================
// WIDGET RENDERER COMPONENT
// ============================================================================

interface WidgetRendererProps {
  widget: MarketWidgetConfig;
  isDarkMode: boolean;
  locale: string;
  onNavigation: (index: number) => void;
  hasScrolled: boolean;
}

const WidgetRenderer = memo(({ 
  widget, 
  isDarkMode, 
  locale, 
  onNavigation,
  hasScrolled 
}: WidgetRendererProps) => {
  const bgClass = isDarkMode ? "bg-gray-900" : "bg-gray-50";

  // Determine if this widget should be lazy loaded
  const shouldLazyLoad = useCallback((type: WidgetType): boolean => {
    // Critical widgets that should never be lazy loaded
    const criticalWidgets: WidgetType[] = ["market_bubbles", "preference_product"];
    return !criticalWidgets.includes(type);
  }, []);

  // If widget requires scroll and user hasn't scrolled, don't render yet
  if (shouldLazyLoad(widget.type) && !hasScrolled) {
    return null;
  }

  const renderWidget = () => {
    switch (widget.type) {
      case "ads_banner":
        return (
          <Suspense fallback={<FullWidthLoader isDark={isDarkMode} height="h-48" />}>
            <AdsBanner />
          </Suspense>
        );

      case "market_bubbles":
        return (
          <div className={`w-full pt-6 ${bgClass}`}>
            <div className="max-w-7xl mx-auto px-4">
              <MarketBubbles
                onNavItemTapped={onNavigation}
                locale={locale}
              />
            </div>
          </div>
        );

      case "thin_banner":
        return (
          <Suspense fallback={<ComponentLoader isDark={isDarkMode} height="h-16" />}>
            <div className={`w-full ${bgClass}`}>
              <div className="max-w-7xl mx-auto px-4">
                <ThinBanner />
              </div>
            </div>
          </Suspense>
        );

      case "preference_product":
        return (
          <div className={`w-full ${bgClass}`}>
            <div className="lg:max-w-[1400px] lg:mx-auto">
              <PreferenceProduct keyPrefix="pref-" />
            </div>
          </div>
        );

      case "boosted_product_carousel":
        return (
          <Suspense fallback={<ComponentLoader isDark={isDarkMode} height="h-64" />}>
            <div className={`w-full ${bgClass}`}>
              <BoostedProductCarousel />
            </div>
          </Suspense>
        );

      case "dynamic_product_list":
        return (
          <Suspense fallback={<ComponentLoader isDark={isDarkMode} height="h-64" />}>
            <div className={`w-full ${bgClass}`}>
              <div className="lg:max-w-[1400px] lg:mx-auto">
                <DynamicHorizontalList keyPrefix="dynamic-" />
              </div>
            </div>
          </Suspense>
        );

      case "market_banner":
        return (
          <Suspense fallback={<ComponentLoader isDark={isDarkMode} height="h-48" />}>
            <div className={`w-full ${bgClass}`}>
              <MarketBanner />
            </div>
          </Suspense>
        );

      case "shop_horizontal_list":
        return (
          <Suspense fallback={<ComponentLoader isDark={isDarkMode} height="h-32" />}>
            <div className={`w-full ${bgClass}`}>
              <div className="lg:max-w-[1400px] lg:mx-auto">
                <ShopHorizontalList />
              </div>
            </div>
          </Suspense>
        );

      default:
        // Unknown widget type - skip silently in production
        if (process.env.NODE_ENV === "development") {
          console.warn(`[Home] Unknown widget type: ${widget.type}`);
        }
        return null;
    }
  };

  const content = renderWidget();
  
  if (!content) return null;

  return (
    <div key={widget.id} data-widget-id={widget.id} data-widget-order={widget.order}>
      {content}
      {/* Spacing between widgets */}
      <div className={`w-full h-5 ${bgClass}`} />
    </div>
  );
});
WidgetRenderer.displayName = "WidgetRenderer";

// ============================================================================
// ERROR BOUNDARY COMPONENT
// ============================================================================

interface ErrorFallbackProps {
  isDarkMode: boolean;
  onRetry: () => void;
}

const ErrorFallback = memo(({ isDarkMode, onRetry }: ErrorFallbackProps) => (
  <div className={`w-full py-12 ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
    <div className="max-w-md mx-auto text-center px-4">
      <div className={`text-4xl mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}>
        ⚠️
      </div>
      <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
        Layout Error
      </h3>
      <p className={`text-sm mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
        Unable to load the page layout. Please try again.
      </p>
      <button
        onClick={onRetry}
        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
          isDarkMode 
            ? "bg-blue-600 hover:bg-blue-700 text-white" 
            : "bg-blue-500 hover:bg-blue-600 text-white"
        }`}
      >
        Retry
      </button>
    </div>
  </div>
));
ErrorFallback.displayName = "ErrorFallback";

// ============================================================================
// LOADING STATE COMPONENT
// ============================================================================

interface LoadingStateProps {
  isDarkMode: boolean;
}

const LoadingState = memo(({ isDarkMode }: LoadingStateProps) => (
  <div className={`w-full py-8 ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
    {/* Mobile: full width */}
    <div className="block lg:hidden px-0 space-y-6">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`w-full h-32 rounded-lg animate-pulse ${
            isDarkMode ? "bg-gray-800" : "bg-gray-200"
          }`}
        />
      ))}
    </div>
    {/* Desktop: centered layout matching components */}
    <div className="hidden lg:block">
      <div className="max-w-[1400px] mx-auto px-6 space-y-6">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`w-full h-32 rounded-lg animate-pulse ${
              isDarkMode ? "bg-gray-800" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  </div>
));
LoadingState.displayName = "LoadingState";

// ============================================================================
// MAIN HOME COMPONENT
// ============================================================================

export default function Home() {
  // Shared theme hook — single MutationObserver for the whole app
  const isDarkMode = useTheme();
  const [hasScrolled, setHasScrolled] = useState(false);

  // Locale
  const locale = useLocale();

  // Market layout hook
  const {
    visibleWidgets,
    isLoading,
    error,
    isInitialized,
    refresh
  } = useMarketLayout({ debug: process.env.NODE_ENV === "development" });

  // ============================================================================
  // SCROLL DETECTION FOR LAZY LOADING
  // ============================================================================
  
  useEffect(() => {
    // Check if already scrolled or on large viewport
    const checkInitialState = () => {
      if (window.scrollY > 200 || window.innerHeight > 900) {
        setHasScrolled(true);
      }
    };

    checkInitialState();

    const handleScroll = () => {
      if (!hasScrolled && window.scrollY > 200) {
        setHasScrolled(true);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasScrolled]);

  // ============================================================================
  // NAVIGATION HANDLER
  // ============================================================================
  
  const handleNavigation = useCallback((index: number) => {
    console.log("Navigate to:", index);
    // Implement navigation logic here
  }, []);

  // ============================================================================
  // MEMOIZED WIDGET LIST
  // ============================================================================
  
  const renderedWidgets = useMemo(() => {
    if (!isInitialized || isLoading) return null;
    
    if (error) {
      return <ErrorFallback isDarkMode={isDarkMode} onRetry={refresh} />;
    }

    return visibleWidgets.map((widget) => (
      <WidgetRenderer
        key={widget.id}
        widget={widget}
        isDarkMode={isDarkMode}
        locale={locale}
        onNavigation={handleNavigation}
        hasScrolled={hasScrolled}
      />
    ));
  }, [
    visibleWidgets, 
    isDarkMode, 
    locale, 
    handleNavigation, 
    hasScrolled, 
    isInitialized, 
    isLoading, 
    error,
    refresh
  ]);

  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div className="min-h-screen flex flex-col">
      {/* SecondHeader - Always visible */}
      <SecondHeader />

      <div
        className={`flex-1 w-full ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="w-full">
          {/* Loading State */}
          {!isInitialized || isLoading ? (
            <LoadingState isDarkMode={isDarkMode} />
          ) : (
            <>
              {/* Dynamic Widgets */}
              {renderedWidgets}

              {/* Bottom padding */}
              <div
                className={`w-full h-8 ${
                  isDarkMode ? "bg-gray-900" : "bg-gray-50"
                }`}
              />
            </>
          )}
        </div>
      </div>

      {/* Footer - Only on home page */}
      <Footer />
    </div>
  );
}