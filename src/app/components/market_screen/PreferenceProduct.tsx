// components/market_screen/PreferenceProduct.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ProductCard } from "../ProductCard";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePersonalizedRecommendations } from "@/context/PersonalizedRecommendationsProvider";

// ✅ MATCHES FLUTTER: Shimmer component
const ShimmerCard = React.memo(({ isDarkMode }: { isDarkMode: boolean }) => {
  const baseColor = isDarkMode
    ? "rgba(40, 37, 58, 1)"
    : "rgb(229, 231, 235)";
  const highlightColor = isDarkMode
    ? "rgba(60, 57, 78, 1)"
    : "rgb(243, 244, 246)";

  return (
    <div
      className="rounded-lg w-full h-full"
      style={{
        background: baseColor,
        animation: "shimmer 1.5s infinite",
        backgroundImage: `linear-gradient(90deg, ${baseColor} 25%, ${highlightColor} 50%, ${baseColor} 75%)`,
        backgroundSize: "200% 100%",
      }}
    />
  );
});
ShimmerCard.displayName = 'ShimmerCard';

// ✅ MATCHES FLUTTER: Shimmer list
const ShimmerList = React.memo(({ rowHeight, isDarkMode }: { rowHeight: number; isDarkMode: boolean }) => {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div
      className="flex gap-0 px-0 lg:px-2"
      style={{ height: `${rowHeight - 60}px` }}
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="flex-shrink-0" style={{ width: isMobile ? "180px" : "205px" }}>
          <ShimmerCard isDarkMode={isDarkMode} />
        </div>
      ))}
    </div>
  );
});
ShimmerList.displayName = 'ShimmerList';

interface PreferenceProductProps {
  keyPrefix?: string;
}

export const PreferenceProduct = React.memo(({ keyPrefix = '' }: PreferenceProductProps) => {
  const {
    recommendations,
    isLoading,
    error,
    fetchRecommendations,
    refresh,
  } = usePersonalizedRecommendations();

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t = useTranslations("MarketScreen");
  
  // ✅ MATCHES FLUTTER: Fixed dimensions
  
  const portraitImageHeight = 380;
  const infoAreaHeight = 80;
  const rowHeight = portraitImageHeight + infoAreaHeight + 40;
  const scaleFactor = 0.88;
  const overrideInnerScale = 1.2;

  // ✅ OPTIMIZED: Dark mode detection
  useEffect(() => {
    const updateTheme = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };

    updateTheme();
    
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // ✅ MATCHES FLUTTER: Initial fetch - only once on mount
  useEffect(() => {
    if (!hasInitialized) {
      setHasInitialized(true);
      fetchRecommendations();
    }
  }, [hasInitialized, fetchRecommendations]);

  // ✅ OPTIMIZED: Check scroll position
  const checkScrollPosition = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  // ✅ OPTIMIZED: Scroll handlers
  const scrollLeft = useCallback(() => {
    scrollContainerRef.current?.scrollBy({ left: -200, behavior: "smooth" });
  }, []);

  const scrollRight = useCallback(() => {
    scrollContainerRef.current?.scrollBy({ left: 200, behavior: "smooth" });
  }, []);

  // Check scroll position when recommendations change
  useEffect(() => {
    if (recommendations.length > 0) {
      requestAnimationFrame(checkScrollPosition);
    }
  }, [recommendations.length, checkScrollPosition]);

  // ✅ OPTIMIZED: View all handler
  const handleViewAll = useCallback(() => {
    router.push("/special-for-you");
  }, [router]);

  // ✅ MATCHES FLUTTER: Hide if no products and not loading
  if (recommendations.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="w-full my-2 lg:mx-0 lg:px-6">
      <div className="relative w-full rounded-none lg:rounded-t-3xl overflow-visible">
        {/* ✅ UPDATED: Background gradient with vertical fade mask - matches DynamicList */}
        <div
          className="absolute inset-0 rounded-none lg:rounded-t-3xl"
          style={{
            height: `${rowHeight * 0.6}px`,
            background: "linear-gradient(to right, #f97316, #ec4899)",
            maskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
          }}
        />

        <div className="relative py-3">
          {/* ✅ MATCHES FLUTTER: Header */}
          <div className="px-0 lg:px-2 mb-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">
                  {t("specialProductsForYou")}
                </h2>
                {/* ✅ MATCHES FLUTTER: Loading indicator when refreshing */}
                {isLoading && recommendations.length > 0 && (
                  <div className="w-3 h-3">
                    <svg className="animate-spin text-white/70" viewBox="0 0 24 24">
                      <circle 
                        className="opacity-25" 
                        cx="12" 
                        cy="12" 
                        r="10" 
                        stroke="currentColor" 
                        strokeWidth="4"
                        fill="none"
                      />
                      <path 
                        className="opacity-75" 
                        fill="currentColor" 
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                )}
              </div>
              
              <button
                onClick={handleViewAll}
                className="text-sm font-bold text-white underline decoration-white hover:opacity-80 transition-opacity"
              >
                {t("viewAll")}
              </button>
            </div>
          </div>

          {/* ✅ MATCHES FLUTTER: Content */}
          {isLoading && recommendations.length === 0 ? (
            <ShimmerList rowHeight={rowHeight} isDarkMode={isDarkMode} />
          ) : error && recommendations.length === 0 ? (
            // ✅ MATCHES FLUTTER: Error state
            <div
              className="flex flex-col items-center justify-center text-white px-0 lg:px-0"
              style={{ height: `${rowHeight - 60}px` }}
            >
              <svg className="w-8 h-8 text-white/70 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-white/70 mb-2">{t("failedToLoadRecommendations")}</p>
              <button
                onClick={refresh}
                className="text-white underline hover:opacity-80 transition-opacity"
              >
                {t("retry")}
              </button>
            </div>
          ) : (
            <div className="relative">
              {/* ✅ UPDATED: Desktop scroll arrows - positioned outside component like DynamicList */}
              {canScrollLeft && (
                <button
                  onClick={scrollLeft}
                  className="hidden lg:flex absolute top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white rounded-full items-center justify-center transition-all duration-200 hover:scale-105"
                  style={{
                    left: "-30px",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
                  }}
                  aria-label="Scroll left"
                >
                  <ChevronLeft size={28} className="text-gray-700" />
                </button>
              )}

              {canScrollRight && (
                <button
                  onClick={scrollRight}
                  className="hidden lg:flex absolute top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white rounded-full items-center justify-center transition-all duration-200 hover:scale-105"
                  style={{
                    right: "-30px",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
                  }}
                  aria-label="Scroll right"
                >
                  <ChevronRight size={28} className="text-gray-700" />
                </button>
              )}

              {/* ✅ UPDATED: Scrollable container - no scrollbars, matches DynamicList */}
              <div
                ref={scrollContainerRef}
                className="overflow-x-auto overflow-y-hidden scrollbar-hide"
                style={{
                  height: `${rowHeight - 60}px`,
                }}
                onScroll={checkScrollPosition}
              >
                <div className="flex gap-0 px-0 lg:px-2 h-full pr-0 lg:pr-2 -ml-2 lg:ml-0">
                  {recommendations.map((product) => (
                    <div
                      key={`${keyPrefix}${product.id}`}
                      className="flex-shrink-0"
                      style={{ width: "205px" }}
                    >
                      <ProductCard
                        product={product}
                        scaleFactor={scaleFactor}
                        internalScaleFactor={1.0}
                        portraitImageHeight={portraitImageHeight}
                        overrideInternalScaleFactor={overrideInnerScale}
                        showCartIcon={false}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
});

PreferenceProduct.displayName = 'PreferenceProduct';