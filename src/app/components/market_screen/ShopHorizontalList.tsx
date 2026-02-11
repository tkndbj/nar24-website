"use client";

import React, { useState, useEffect, memo, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useShops, Shop } from "@/hooks/useShops";

/**
 * ShopHorizontalList Component
 *
 * Horizontal scrollable shop list - matches Flutter implementation exactly.
 *
 * Features:
 * - Responsive dimensions for tablet vs mobile
 * - Shimmer loading state
 * - Shop cards with rating, product count
 * - "Featured Shops" title
 * - Desktop scroll arrows (like PreferenceProduct)
 */

// ============================================================================
// TYPES
// ============================================================================

interface ShopHorizontalListProps {
  className?: string;
}

interface ResponsiveDimensions {
  containerHeight: number;
  cardWidth: number;
  cardSpacing: number;
  horizontalPadding: number;
  titleFontSize: number;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if device is tablet - matches Flutter logic
 */
function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const checkTablet = () => {
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;

      // Matches Flutter: shortestSide >= 600 || landscape && screenWidth >= 900
      const shortestSide = Math.min(screenWidth, screenHeight);
      const isLandscape = screenWidth > screenHeight;

      setIsTablet(shortestSide >= 600 || (isLandscape && screenWidth >= 900));
    };

    checkTablet();
    window.addEventListener("resize", checkTablet);
    return () => window.removeEventListener("resize", checkTablet);
  }, []);

  return isTablet;
}

/**
 * Get responsive dimensions - matches Flutter _getResponsiveDimensions
 */
function useResponsiveDimensions(): ResponsiveDimensions {
  const isTablet = useIsTablet();
  const [dimensions, setDimensions] = useState<ResponsiveDimensions>({
    containerHeight: 260,
    cardWidth: 180,
    cardSpacing: 12,
    horizontalPadding: 8,
    titleFontSize: 20,
  });

  useEffect(() => {
    const updateDimensions = () => {
      const screenWidth = window.innerWidth;

      if (!isTablet) {
        // Mobile dimensions (unchanged from Flutter)
        setDimensions({
          containerHeight: 260,
          cardWidth: 180,
          cardSpacing: 12,
          horizontalPadding: 8,
          titleFontSize: 20,
        });
      } else {
        // Tablet dimensions - scale based on screen width
        const cardWidth = screenWidth > 1200 ? 240 : 220;
        const containerHeight = screenWidth > 1200 ? 320 : 300;

        setDimensions({
          containerHeight,
          cardWidth,
          cardSpacing: 16,
          horizontalPadding: 12,
          titleFontSize: 22,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [isTablet]);

  return dimensions;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// Shimmer Card
const ShimmerCard = memo(
  ({
    width,
    isDarkMode,
  }: {
    width: number;
    isDarkMode: boolean;
  }) => {
    const baseColor = isDarkMode ? "bg-[#28253a]" : "bg-gray-300";
    const highlightColor = isDarkMode ? "bg-[#3c394e]" : "bg-gray-100";

    return (
      <div
        className={`flex-shrink-0 rounded-lg overflow-hidden ${baseColor}`}
        style={{ width }}
      >
        <div className="relative h-full">
          {/* Avatar shimmer */}
          <div className="flex justify-center pt-4">
            <div
              className={`w-16 h-16 rounded-full ${highlightColor} animate-pulse`}
            />
          </div>
          {/* Text shimmer */}
          <div className="p-4 space-y-2">
            <div
              className={`h-4 w-3/4 mx-auto ${highlightColor} rounded animate-pulse`}
            />
            <div
              className={`h-3 w-1/2 mx-auto ${highlightColor} rounded animate-pulse`}
            />
          </div>
        </div>
      </div>
    );
  }
);
ShimmerCard.displayName = "ShimmerCard";

// Shop Card - matches Flutter ShopCardWidget exactly
const ShopCard = memo(
  ({
    shop,
    width,
    isDarkMode,
  }: {
    shop: Shop;
    width: number;
    isDarkMode: boolean;
  }) => {
    const mainTextColor = isDarkMode ? "text-white" : "text-black";

    // Match Flutter logic: check coverImageUrls (array) first, then coverImageUrl (single)
    const displayCoverImage =
      (shop.coverImageUrls && shop.coverImageUrls.length > 0)
        ? shop.coverImageUrls[0]
        : (shop.coverImageUrl || null);

    // Profile image - Flutter uses 'profileImageUrl', fallback to logoUrl
    const profileImageUrl = shop.profileImageUrl || shop.logoUrl || null;

    return (
      <Link href={`/shopdetail/${shop.id}`} className="block">
        <div
          className="flex-shrink-0 overflow-hidden transition-transform hover:scale-[1.02]"
          style={{
            width,
            margin: 4,
            border: "1px solid #d1d5db",
            borderRadius: 12,
          }}
        >
          {/* Cover Section - 138px total (120px image + 18px for avatar overflow) */}
          <div className="relative" style={{ height: 138 }}>
            {/* Cover Image Area */}
            <div
              className="absolute top-0 left-0 right-0 overflow-hidden"
              style={{
                height: 120,
                borderTopLeftRadius: 11,
                borderTopRightRadius: 11,
              }}
            >
              {displayCoverImage ? (
                <Image
                  src={displayCoverImage}
                  alt={`${shop.name} cover`}
                  fill
                  className="object-cover"
                  sizes={`${width}px`}
                />
              ) : (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Profile Avatar - positioned bottom-right */}
            <div
              className="absolute"
              style={{ right: 16, bottom: 0 }}
            >
              <div
                className="rounded-full border-2 border-white overflow-hidden bg-gray-200"
                style={{
                  width: 48,
                  height: 48,
                  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                }}
              >
                {profileImageUrl ? (
                  <Image
                    src={profileImageUrl}
                    alt={shop.name}
                    width={48}
                    height={48}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Shop Info Section - matches Flutter padding: fromLTRB(12, 8, 12, 12) */}
          <div style={{ padding: "8px 12px 12px 12px" }}>
            {/* Shop Name */}
            <h3
              className={`font-semibold ${mainTextColor}`}
              style={{
                fontSize: 14,
                lineHeight: 1.2,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {shop.name}
            </h3>

            {/* Rating - only show if > 0 */}
            {shop.averageRating > 0 && (
              <div className="flex items-center mt-1" style={{ gap: 4 }}>
                <svg
                  className="text-amber-400"
                  style={{ width: 16, height: 16 }}
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
                <span
                  className={`font-medium ${mainTextColor}`}
                  style={{ fontSize: 12 }}
                >
                  {shop.averageRating.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>
      </Link>
    );
  }
);
ShopCard.displayName = "ShopCard";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ShopHorizontalList = memo(({ className = "" }: ShopHorizontalListProps) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isTablet = useIsTablet();
  const dimensions = useResponsiveDimensions();
  const t = useTranslations("MarketScreen");

  // Theme detection
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

  // Fetch shops
  const { shops, isLoading } = useShops();

  // Check scroll position
  const checkScrollPosition = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  // Scroll handlers
  const scrollLeft = useCallback(() => {
    scrollContainerRef.current?.scrollBy({ left: -200, behavior: "smooth" });
  }, []);

  const scrollRight = useCallback(() => {
    scrollContainerRef.current?.scrollBy({ left: 200, behavior: "smooth" });
  }, []);

  // Check scroll position when shops change
  useEffect(() => {
    if (shops.length > 0) {
      requestAnimationFrame(checkScrollPosition);
    }
  }, [shops.length, checkScrollPosition]);

  // ========================================================================
  // RENDER STATES
  // ========================================================================

  // Loading state with shimmer - matches Flutter
  if (isLoading && shops.length === 0) {
    return (
      <div className={`w-full my-2 lg:mx-0 lg:px-6 ${className}`}>
        <div
          className="w-full"
          style={{ height: dimensions.containerHeight }}
        >
          <div className="flex gap-3 overflow-hidden px-0 lg:px-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <ShimmerCard
                key={i}
                width={dimensions.cardWidth}
                isDarkMode={isDarkMode}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // No shops state - matches Flutter
  if (shops.length === 0) {
    return (
      <div className={`w-full my-2 lg:mx-0 lg:px-6 ${className}`}>
        <div
          className="w-full flex items-center justify-center"
          style={{ height: isTablet ? 280 : 240 }}
        >
          <p
            className={`text-base ${isDarkMode ? "text-white" : "text-gray-900"}`}
            style={{ fontSize: isTablet ? 18 : 16 }}
          >
            {t("featuredShops")}
          </p>
        </div>
      </div>
    );
  }

  // ========================================================================
  // MAIN RENDER
  // ========================================================================

  return (
    <div className={`w-full my-2 lg:mx-0 lg:px-6 ${className}`}>
      <div
        className="w-full"
        style={{ height: dimensions.containerHeight }}
      >
        {/* Title */}
        <div
          className="flex items-center px-0 lg:px-2"
          style={{
            paddingTop: isTablet ? 20 : 16,
            paddingBottom: isTablet ? 12 : 8,
          }}
        >
          <h2
            className={`font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
            style={{ fontSize: dimensions.titleFontSize }}
          >
            {t("featuredShops")}
          </h2>
        </div>

        {/* Shops List with scroll arrows */}
        <div className="relative">
          {/* Desktop scroll arrows */}
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
            className="overflow-x-auto scrollbar-hide"
            onScroll={checkScrollPosition}
          >
            <div className="flex px-0 lg:px-2" style={{ gap: dimensions.cardSpacing }}>
              {shops.map((shop) => (
                <ShopCard
                  key={shop.id}
                  shop={shop}
                  width={dimensions.cardWidth}
                  isDarkMode={isDarkMode}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
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

ShopHorizontalList.displayName = "ShopHorizontalList";

export default ShopHorizontalList;
