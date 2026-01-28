"use client";

import React, { useState, useEffect, memo } from "react";
import Image from "next/image";
import Link from "next/link";
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

// Shop Card - matches Flutter ShopCardWidget
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
    return (
      <Link href={`/shop/${shop.id}`} className="block">
        <div
          className={`flex-shrink-0 rounded-lg overflow-hidden transition-transform hover:scale-[1.02] ${
            isDarkMode ? "bg-gray-800" : "bg-white"
          }`}
          style={{
            width,
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
          }}
        >
          {/* Cover Image or Gradient */}
          <div className="relative h-20 overflow-hidden">
            {shop.coverImageUrl ? (
              <Image
                src={shop.coverImageUrl}
                alt={`${shop.name} cover`}
                fill
                className="object-cover"
                sizes={`${width}px`}
              />
            ) : (
              <div
                className="w-full h-full"
                style={{
                  background:
                    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                }}
              />
            )}

            {/* Verified Badge */}
            {shop.isVerified && (
              <div className="absolute top-2 right-2 bg-blue-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Logo Avatar - positioned to overlap cover */}
          <div className="relative flex justify-center -mt-8">
            <div
              className={`w-16 h-16 rounded-full border-4 overflow-hidden ${
                isDarkMode ? "border-gray-800 bg-gray-700" : "border-white bg-gray-100"
              }`}
            >
              {shop.logoUrl ? (
                <Image
                  src={shop.logoUrl}
                  alt={shop.name}
                  width={64}
                  height={64}
                  className="object-cover w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl">
                  🏪
                </div>
              )}
            </div>
          </div>

          {/* Shop Info */}
          <div className="p-3 pt-2 text-center">
            {/* Shop Name */}
            <h3
              className={`font-semibold text-sm truncate ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {shop.name}
            </h3>

            {/* Rating */}
            <div className="flex items-center justify-center gap-1 mt-1">
              <span className="text-yellow-500 text-xs">⭐</span>
              <span
                className={`text-xs font-medium ${
                  isDarkMode ? "text-gray-300" : "text-gray-600"
                }`}
              >
                {shop.averageRating.toFixed(1)}
              </span>
              {shop.reviewCount > 0 && (
                <span
                  className={`text-xs ${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  }`}
                >
                  ({shop.reviewCount})
                </span>
              )}
            </div>

            {/* Product Count */}
            <p
              className={`text-xs mt-1 ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {shop.productCount} products
            </p>
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
  const isTablet = useIsTablet();
  const dimensions = useResponsiveDimensions();

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
  const { shops, isLoading, error } = useShops();

  // ========================================================================
  // RENDER STATES
  // ========================================================================

  // Loading state with shimmer - matches Flutter
  if (isLoading && shops.length === 0) {
    return (
      <div
        className={`w-full ${className}`}
        style={{ height: dimensions.containerHeight }}
      >
        <div
          className="flex gap-3 overflow-hidden"
          style={{ paddingLeft: dimensions.horizontalPadding }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <ShimmerCard
              key={i}
              width={dimensions.cardWidth}
              isDarkMode={isDarkMode}
            />
          ))}
        </div>
      </div>
    );
  }

  // No shops state - matches Flutter
  if (shops.length === 0) {
    return (
      <div
        className={`w-full flex items-center justify-center ${className}`}
        style={{ height: isTablet ? 280 : 240 }}
      >
        <p
          className={`text-base ${isDarkMode ? "text-white" : "text-gray-900"}`}
          style={{ fontSize: isTablet ? 18 : 16 }}
        >
          Featured Shops
        </p>
      </div>
    );
  }

  // ========================================================================
  // MAIN RENDER
  // ========================================================================

  return (
    <div
      className={`w-full ${className}`}
      style={{ height: dimensions.containerHeight }}
    >
      {/* Title - matches Flutter */}
      <div
        className="flex items-center"
        style={{
          paddingLeft: dimensions.horizontalPadding,
          paddingRight: 16,
          paddingTop: isTablet ? 20 : 16,
          paddingBottom: isTablet ? 12 : 8,
        }}
      >
        <h2
          className={`font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
          style={{ fontSize: dimensions.titleFontSize }}
        >
          Featured Shops
        </h2>
      </div>

      {/* Shops List - horizontal scroll */}
      <div
        className="flex-1 overflow-x-auto scrollbar-hide"
        style={{ paddingLeft: dimensions.horizontalPadding }}
      >
        <div className="flex" style={{ gap: dimensions.cardSpacing }}>
          {shops.map((shop, index) => (
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
  );
});

ShopHorizontalList.displayName = "ShopHorizontalList";

export default ShopHorizontalList;