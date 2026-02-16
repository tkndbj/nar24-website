"use client";

import React, { lazy, Suspense, useMemo, useCallback, memo } from "react";
import { useLocale } from "next-intl";
import { useTheme } from "@/hooks/useTheme";
import { MarketWidgetConfig } from "@/types/MarketLayout";

// ============================================================================
// EAGERLY LOADED — above-the-fold critical components
// ============================================================================

import { MarketBubbles } from "./MarketBubbles";
import { PreferenceProduct } from "./PreferenceProduct";

// ============================================================================
// LAZY LOADED — below-the-fold, code-split into separate chunks
// ============================================================================

const MarketBanner = lazy(() => import("./MarketBanner"));
const AdsBanner = lazy(() =>
  import("./MarketTopAdsBanner").then((mod) => ({ default: mod.AdsBanner }))
);
const ThinBanner = lazy(() => import("./MarketThinBanner"));
const BoostedProductCarousel = lazy(() => import("./BoostedProductCarousel"));
const DynamicHorizontalList = lazy(() => import("./DynamicHorizontalList"));
const ShopHorizontalList = lazy(() => import("./ShopHorizontalList"));

// ============================================================================
// LOADING COMPONENTS
// ============================================================================

interface LoaderProps {
  isDark: boolean;
  height?: string;
}

const ComponentLoader = memo(({ isDark, height = "h-40" }: LoaderProps) => (
  <div className="w-full">
    <div className="block lg:hidden px-0">
      <div
        className={`w-full ${height} rounded-lg animate-pulse ${
          isDark ? "bg-gray-800" : "bg-gray-200"
        }`}
      />
    </div>
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
// WIDGET RENDERER
// ============================================================================

interface WidgetRendererProps {
  widget: MarketWidgetConfig;
  isDarkMode: boolean;
  locale: string;
  onNavigation: (index: number) => void;
}

const WidgetRenderer = memo(
  ({ widget, isDarkMode, locale, onNavigation }: WidgetRendererProps) => {
    const bgClass = isDarkMode ? "bg-gray-900" : "bg-gray-50";

    let content: React.ReactNode = null;

    switch (widget.type) {
      case "ads_banner":
        content = (
          <Suspense fallback={<FullWidthLoader isDark={isDarkMode} height="h-48" />}>
            <AdsBanner />
          </Suspense>
        );
        break;

      case "market_bubbles":
        content = (
          <div className={`w-full pt-6 ${bgClass}`}>
            <div className="max-w-7xl mx-auto px-4">
              <MarketBubbles onNavItemTapped={onNavigation} locale={locale} />
            </div>
          </div>
        );
        break;

      case "thin_banner":
        content = (
          <Suspense fallback={<ComponentLoader isDark={isDarkMode} height="h-16" />}>
            <div className={`w-full ${bgClass}`}>
              <div className="max-w-7xl mx-auto px-4">
                <ThinBanner />
              </div>
            </div>
          </Suspense>
        );
        break;

      case "preference_product":
        content = (
          <div className={`w-full ${bgClass}`}>
            <div className="lg:max-w-[1400px] lg:mx-auto">
              <PreferenceProduct keyPrefix="pref-" />
            </div>
          </div>
        );
        break;

      case "boosted_product_carousel":
        content = (
          <Suspense fallback={<ComponentLoader isDark={isDarkMode} height="h-64" />}>
            <div className={`w-full ${bgClass}`}>
              <BoostedProductCarousel />
            </div>
          </Suspense>
        );
        break;

      case "dynamic_product_list":
        content = (
          <Suspense fallback={<ComponentLoader isDark={isDarkMode} height="h-64" />}>
            <div className={`w-full ${bgClass}`}>
              <div className="lg:max-w-[1400px] lg:mx-auto">
                <DynamicHorizontalList keyPrefix="dynamic-" />
              </div>
            </div>
          </Suspense>
        );
        break;

      case "market_banner":
        content = (
          <Suspense fallback={<ComponentLoader isDark={isDarkMode} height="h-48" />}>
            <div className={`w-full ${bgClass}`}>
              <MarketBanner />
            </div>
          </Suspense>
        );
        break;

      case "shop_horizontal_list":
        content = (
          <Suspense fallback={<ComponentLoader isDark={isDarkMode} height="h-32" />}>
            <div className={`w-full ${bgClass}`}>
              <div className="lg:max-w-[1400px] lg:mx-auto">
                <ShopHorizontalList />
              </div>
            </div>
          </Suspense>
        );
        break;

      default:
        return null;
    }

    if (!content) return null;

    return (
      <div data-widget-id={widget.id} data-widget-order={widget.order}>
        {content}
        <div className={`w-full h-5 ${bgClass}`} />
      </div>
    );
  }
);
WidgetRenderer.displayName = "WidgetRenderer";

// ============================================================================
// MAIN CLIENT COMPONENT
// ============================================================================

interface HomeWidgetsProps {
  widgets: MarketWidgetConfig[];
}

export default function HomeWidgets({ widgets }: HomeWidgetsProps) {
  const isDarkMode = useTheme();
  const locale = useLocale();

  const handleNavigation = useCallback((index: number) => {
    console.log("Navigate to:", index);
  }, []);

  const renderedWidgets = useMemo(
    () =>
      widgets.map((widget) => (
        <WidgetRenderer
          key={widget.id}
          widget={widget}
          isDarkMode={isDarkMode}
          locale={locale}
          onNavigation={handleNavigation}
        />
      )),
    [widgets, isDarkMode, locale, handleNavigation]
  );

  return (
    <div className={`flex-1 w-full ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      <div className="w-full">
        {renderedWidgets}
        <div className={`w-full h-8 ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`} />
      </div>
    </div>
  );
}
