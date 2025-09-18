// components/PreferenceProduct.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ProductCard } from "../ProductCard";
import { ChevronRight, ChevronLeft, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePersonalizedRecommendations } from "@/context/PersonalizedRecommendationsProvider";
import { Product } from "@/app/models/Product";

// Shimmer loading component
const ShimmerCard: React.FC<{ width?: number }> = ({ width = 205 }) => (
  <div
    className="animate-pulse rounded-lg"
    style={{ 
      width: `${width}px`,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
    }}
  />
);

const ShimmerList: React.FC<{ height: number; count?: number }> = ({
  height,
  count = 5,
}) => (
  <div
    className="flex gap-6 px-2"
    style={{ height: `${height}px` }}
  >
    {Array.from({ length: count }, (_, index) => (
      <ShimmerCard key={index} />
    ))}
  </div>
);

export const PreferenceProduct: React.FC = () => {
  const {
    recommendations,
    isLoading,
    error,
    fetchPersonalizedRecommendations,
    refreshRecommendations,
    hasValidCache,
  } = usePersonalizedRecommendations();

  const [isClient, setIsClient] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [hasInitialized, setHasInitialized] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t = useTranslations("MarketScreen");
  
  // Fixed dimensions matching Flutter version
  const portraitImageHeight = 380;
  const infoAreaHeight = 80;
  const rowHeight = portraitImageHeight + infoAreaHeight + 40;
  const scaleFactor = 0.88;
  const overrideInnerScale = 1.2;

  // Set client flag after component mounts
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Initial fetch - only once when component first mounts
  useEffect(() => {
    if (isClient && !hasInitialized) {
      setHasInitialized(true);
      // Only fetch if we don't have valid cached data
      if (!hasValidCache && recommendations.length === 0) {
        fetchPersonalizedRecommendations({ limit: 20 });
      }
    }
  }, [isClient, hasInitialized, hasValidCache, recommendations.length, fetchPersonalizedRecommendations]);

  // Check scroll position to show/hide arrows
  const checkScrollPosition = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  // Handle scroll navigation
  const scrollLeft = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -200,
        behavior: "smooth",
      });
    }
  }, []);

  const scrollRight = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 200,
        behavior: "smooth",
      });
    }
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshRecommendations();
    setIsRefreshing(false);
  }, [refreshRecommendations]);

  // Check scroll position when products change
  useEffect(() => {
    if (recommendations.length > 0) {
      // Use requestAnimationFrame for better performance
      requestAnimationFrame(() => {
        checkScrollPosition();
      });
    }
  }, [recommendations, checkScrollPosition]);

  // Handle page visibility changes (like Flutter's AppLifecycleState)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !hasValidCache) {
        fetchPersonalizedRecommendations();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasValidCache, fetchPersonalizedRecommendations]);

  const handleViewAll = () => {
    router.push("/special-for-you");
  };

  // Don't render until client-side hydration is complete
  if (!isClient) {
    return (
      <div className="w-full my-2 px-0 lg:px-6" style={{ height: `${rowHeight}px` }}>
        <div className="relative w-full rounded-none lg:rounded-t-3xl overflow-visible">
          <div
            className="absolute inset-0 rounded-none lg:rounded-t-3xl"
            style={{
              height: `${rowHeight * 0.6}px`,
              background: `linear-gradient(to right, #f97316, #ec4899)`,
              maskImage: `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
              WebkitMaskImage: `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
            }}
          />
          <div className="relative py-3">
            <div className="px-0 lg:px-2 mb-2">
              <div className="flex justify-between items-center">
                <div className="h-5 bg-white bg-opacity-30 rounded animate-pulse w-48" />
                <div className="h-4 bg-white bg-opacity-30 rounded animate-pulse w-16" />
              </div>
            </div>
            <ShimmerList height={rowHeight - 60} count={5} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="w-full my-2 lg:mx-0 lg:px-6"
      style={{
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 300ms',
      }}
    >
      <div className="relative w-full rounded-none lg:rounded-t-3xl overflow-visible">
        {/* Background gradient matching Flutter */}
        <div
          className="absolute inset-0 rounded-none lg:rounded-t-3xl"
          style={{
            height: `${rowHeight * 0.5}px`,
            background: `linear-gradient(to right, #f97316, #ec4899)`,
          }}
        />
        
        <div
          className="absolute inset-0 rounded-none lg:rounded-t-3xl"
          style={{
            height: `${rowHeight * 0.6}px`,
            background: `linear-gradient(to right, #f97316, #ec4899)`,
            maskImage: `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
            WebkitMaskImage: `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
          }}
        />

        <div className="relative py-3">
          {/* Header */}
          <div className="px-2 lg:px-2 mb-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">
                  {t("specialProductsForYou")}
                </h2>
                {/* Loading indicator when refreshing in background */}
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
              
              <div className="flex items-center gap-2">
                {/* Refresh button */}
                {!isLoading && (
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="p-1 text-white hover:bg-white/10 rounded transition-colors disabled:opacity-50"
                    aria-label="Refresh recommendations"
                  >
                    <RefreshCw 
                      size={18} 
                      className={isRefreshing ? 'animate-spin' : ''}
                    />
                  </button>
                )}
                
                {/* View All button */}
                <button
                  onClick={handleViewAll}
                  className="flex items-center text-sm font-bold text-white underline decoration-white hover:opacity-80 transition-opacity"
                >
                  {t("viewAll")}
                </button>
              </div>
            </div>
          </div>

          {/* Products or Loading State */}
          {isLoading && recommendations.length === 0 ? (
            <ShimmerList height={rowHeight - 60} count={5} />
          ) : error && recommendations.length === 0 ? (
            <div
              className="flex items-center justify-center text-white"
              style={{ height: `${rowHeight - 60}px` }}
            >
              <div className="text-center">
                <p className="mb-2">{t("failedToLoadRecommendations")}</p>
                <button
                  onClick={() => fetchPersonalizedRecommendations({ forceRefresh: true })}
                  className="px-4 py-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-all"
                >
                  {t("tryAgain")}
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* Scroll arrows - desktop only */}
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

              {/* Scrollable container */}
              <div
                ref={scrollContainerRef}
                className="overflow-x-auto overflow-y-hidden"
                style={{
                  height: `${rowHeight - 60}px`,
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                } as React.CSSProperties}
                onScroll={checkScrollPosition}
              >
                <div className="flex gap-0 px-0 lg:px-2 h-full -ml-2 lg:ml-0">
                  {recommendations.map((product, index) => (
                    <div
                      key={`${product.id}-${index}`}
                      className="flex-shrink-0"
                      style={{ 
                        width: "205px",
                        animation: `fadeIn 0.3s ease-out forwards`,
                        animationDelay: `${index * 50}ms`,
                      }}
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
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        
        /* Hide scrollbar for Chrome, Safari and Opera */
        .overflow-x-auto::-webkit-scrollbar {
          display: none;
        }
        
        /* Hide scrollbar for IE, Edge and Firefox */
        .overflow-x-auto {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
      `}</style>
    </div>
  );
};