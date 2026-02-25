"use client";

import React, { useState, useEffect, memo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useBoostedProducts, BoostedProduct } from "@/hooks/useBoostedProducts";
import { useTheme } from "@/hooks/useTheme";

/**
 * BoostedProductCarousel Component
 *
 * Carousel showcasing boosted/promoted products - matches Flutter implementation exactly.
 *
 * Features:
 * - Gradient background (orange)
 * - Shimmer loading state
 * - Error state with retry
 * - Horizontal scrollable product list
 * - "BOOSTED" badge on each product
 * - Total count badge if > 10
 * - Responsive design for tablet/mobile
 */

// ============================================================================
// TYPES
// ============================================================================

interface BoostedProductsCarouselProps {
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Gradient matching Flutter: Color(0xFFFF6B35), Color(0xFFFF8C42)
const GRADIENT_COLORS = {
  from: "#FF6B35",
  to: "#FF8C42",
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// Shimmer placeholder
const ShimmerCard = memo(({ isDarkMode }: { isDarkMode: boolean }) => {
  const baseColor = isDarkMode ? "bg-gray-700" : "bg-gray-300";
  const highlightColor = isDarkMode ? "bg-gray-600" : "bg-gray-200";

  return (
    <div
      className={`w-[170px] flex-shrink-0 rounded-lg overflow-hidden ${baseColor}`}
    >
      <div className="relative">
        {/* Image shimmer */}
        <div className={`w-full h-[200px] ${highlightColor} animate-pulse`} />
        {/* Content shimmer */}
        <div className="p-3 space-y-2">
          <div
            className={`h-4 w-3/4 ${highlightColor} rounded animate-pulse`}
          />
          <div
            className={`h-4 w-1/2 ${highlightColor} rounded animate-pulse`}
          />
        </div>
      </div>
    </div>
  );
});
ShimmerCard.displayName = "ShimmerCard";

// Product Card
const ProductCard = memo(
  ({
    product,
    isDarkMode,
  }: {
    product: BoostedProduct;
    isDarkMode: boolean;
  }) => {
    const hasDiscount =
      product.originalPrice && product.originalPrice > product.price;
    const discountPercent = hasDiscount
      ? Math.round(
          ((product.originalPrice! - product.price) / product.originalPrice!) *
            100,
        )
      : 0;

    // Format price
    const formatPrice = (price: number, currency: string) => {
      return new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(price);
    };

    return (
      <Link href={`/product/${product.id}`} className="block">
        <div
          className={`w-[170px] flex-shrink-0 rounded-lg overflow-hidden transition-transform hover:scale-[1.02] ${
            isDarkMode ? "bg-gray-800" : "bg-white"
          }`}
          style={{
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
          }}
        >
          {/* Image Container */}
          <div className="relative w-full h-[200px]">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                className="object-cover"
                sizes="170px"
              />
            ) : (
              <div
                className={`w-full h-full flex items-center justify-center ${
                  isDarkMode ? "bg-gray-700" : "bg-gray-100"
                }`}
              >
                <span className="text-4xl">📦</span>
              </div>
            )}

            {/* BOOSTED Badge - matches Flutter positioning and style */}
            <div
              className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-1 rounded"
              style={{
                backgroundColor: GRADIENT_COLORS.from,
                boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
              }}
            >
              <svg
                className="w-3 h-3 text-white"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-[9px] font-bold text-white tracking-wide">
                BOOSTED
              </span>
            </div>

            {/* Discount Badge */}
            {hasDiscount && (
              <div className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                -{discountPercent}%
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="p-3">
            <h3
              className={`text-sm font-medium line-clamp-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {product.name}
            </h3>

            <div className="mt-1 flex items-center gap-2">
              <span
                className={`text-sm font-bold ${
                  isDarkMode ? "text-green-400" : "text-green-600"
                }`}
              >
                {formatPrice(product.price, product.currency)}
              </span>

              {hasDiscount && (
                <span
                  className={`text-xs line-through ${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  }`}
                >
                  {formatPrice(product.originalPrice!, product.currency)}
                </span>
              )}
            </div>

            {/* Rating */}
            {product.rating && (
              <div className="mt-1 flex items-center gap-1">
                <span className="text-yellow-500 text-xs">⭐</span>
                <span
                  className={`text-xs ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  {product.rating.toFixed(1)}
                  {product.reviewCount && ` (${product.reviewCount})`}
                </span>
              </div>
            )}
          </div>
        </div>
      </Link>
    );
  },
);
ProductCard.displayName = "ProductCard";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const BoostedProductsCarousel = memo(
  ({ className = "" }: BoostedProductsCarouselProps) => {
    const isDarkMode = useTheme();

    // Fetch boosted products
    const {
      boostedProducts,
      isLoading,
      error,
      hasProducts,
      totalBoosted,
      refresh,
    } = useBoostedProducts();

    // Calculate row height based on viewport - matches Flutter logic
    const [rowHeight, setRowHeight] = useState(380);

    useEffect(() => {
      const updateHeight = () => {
        const screenHeight = window.innerHeight;
        const portraitImageHeight = screenHeight * 0.33;
        const infoAreaHeight = 80;
        setRowHeight(portraitImageHeight + infoAreaHeight);
      };

      updateHeight();
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }, []);

    // ========================================================================
    // RENDER STATES
    // ========================================================================

    // Shimmer loading state - matches Flutter: if (provider.isLoading && !provider.hasProducts)
    // Initial loading - render nothing to avoid gradient flash
    if (isLoading && !hasProducts) {
      return null;
    }

    // Hide if no products - matches Flutter: if (!provider.hasProducts && !provider.isLoading) return SizedBox.shrink()
    if (!hasProducts && !isLoading) {
      return null;
    }

    // Error state - matches Flutter: if (provider.error != null && !provider.hasProducts)
    if (error && !hasProducts) {
      return (
        <div className={`relative my-2 ${className}`}>
          <div
            className="w-full flex flex-col items-center justify-center py-8"
            style={{
              height: rowHeight / 2,
              background: `linear-gradient(to right, ${GRADIENT_COLORS.from}, ${GRADIENT_COLORS.to})`,
            }}
          >
            <div className="text-white/70 text-3xl mb-2">⚠️</div>
            <p className="text-white/70 text-sm">Failed to load</p>
            <button
              onClick={refresh}
              className="mt-2 text-white underline text-sm hover:text-white/90"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    // ========================================================================
    // MAIN RENDER
    // ========================================================================

    return (
      <div className={`relative my-2 w-full ${className}`}>
        {/* Background gradient (half height) - matches Flutter Stack */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{
            height: rowHeight / 2,
            background: `linear-gradient(to right, ${GRADIENT_COLORS.from}, ${GRADIENT_COLORS.to})`,
          }}
        />

        {/* Content */}
        <div className="relative py-1.5">
          {/* Header - matches Flutter _buildHeader */}
          <div className="px-2 mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1">
              {/* Bolt icon */}
              <svg
                className="w-5 h-5 text-white"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>

              <span className="text-lg font-bold text-white">
                Boosted Products
              </span>

              {/* Loading indicator when refreshing - matches Flutter */}
              {isLoading && hasProducts && (
                <div className="ml-2 w-3 h-3 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
              )}

              {/* Total count badge if > 10 - matches Flutter */}
              {totalBoosted > 10 && (
                <span className="ml-2 px-1.5 py-0.5 bg-white/25 rounded-full text-xs font-semibold text-white">
                  {totalBoosted}
                </span>
              )}
            </div>
          </div>

          {/* Product List - matches Flutter _buildProductList */}
          <div
            className="flex gap-1.5 overflow-x-auto pl-2 pb-2 scrollbar-hide"
            style={{ height: rowHeight }}
          >
            {boostedProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isDarkMode={isDarkMode}
              />
            ))}
          </div>
        </div>
      </div>
    );
  },
);

BoostedProductsCarousel.displayName = "BoostedProductsCarousel";

export default BoostedProductsCarousel;
