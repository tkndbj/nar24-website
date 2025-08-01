"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { ProductCard } from "../ProductCard";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

// Product interface (should match the one from ProductCard)
interface Product {
  id: string;
  productName: string;
  price: number;
  originalPrice?: number;
  discountPercentage?: number;
  currency: string;
  imageUrls: string[];
  colorImages: Record<string, string[]>;
  description: string;
  brandModel?: string;
  condition: string;
  quantity?: number;
  averageRating: number;
  isBoosted: boolean;
  deliveryOption?: string;
  campaignName?: string;
}

interface PreferenceProductProps {
  userId?: string | null;
  selectedCategory?: string | null;
}

// Shimmer loading component
const ShimmerCard: React.FC<{ width?: number }> = ({ width = 170 }) => (
  <div
    className="animate-pulse bg-gray-300 rounded-lg"
    style={{ width: `${width}px` }}
  />
);

const ShimmerList: React.FC<{ height: number; count?: number }> = ({
  height,
  count = 5,
}) => (
  <div
    className="flex gap-6 px-2 justify-center"
    style={{ height: `${height}px` }}
  >
    {Array.from({ length: count }, (_, index) => (
      <ShimmerCard key={index} />
    ))}
  </div>
);

export const PreferenceProduct: React.FC<PreferenceProductProps> = ({
  userId = null,
  selectedCategory = null,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Fixed dimensions to prevent hydration mismatch
  const portraitImageHeight = 240;
  const infoAreaHeight = 80;
  const rowHeight = portraitImageHeight + infoAreaHeight + 40;

  // Set client flag after component mounts
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check scroll position to show/hide arrows
  const checkScrollPosition = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  // Handle scroll navigation
  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -200,
        behavior: "smooth",
      });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 200,
        behavior: "smooth",
      });
    }
  };

  // Check scroll position when products change
  useEffect(() => {
    if (products.length > 0) {
      setTimeout(checkScrollPosition, 100);
    }
  }, [products]);

  // Fetch recommendations
  const fetchRecommendations = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (userId) {
        params.append("userId", userId);
      }
      if (selectedCategory) {
        params.append("category", selectedCategory);
      }
      params.append("maxProducts", "10");

      const response = await fetch(`/api/recommendations?${params.toString()}`);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch recommendations: ${response.statusText}`
        );
      }

      const data = await response.json();
      setProducts((data.products || []).slice(0, 10));
    } catch (err) {
      console.error("Error fetching recommendations:", err);
      setError(
        err instanceof Error ? err.message : "Failed to fetch recommendations"
      );
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isClient) {
      fetchRecommendations();
    }
  }, [userId, selectedCategory, isClient]);

  // Scale factors
  const { scaleFactor, overrideInnerScale } = useMemo(() => {
    return {
      scaleFactor: 0.88,
      overrideInnerScale: 1.2,
    };
  }, []);

  const handleViewAll = () => {
    router.push("/special-for-you");
  };

  // Don't render until client-side hydration is complete
  if (!isClient) {
    return (
      <div
        className="w-full my-2 px-0 lg:px-6"
        style={{ height: `${rowHeight}px` }}
      >
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
            <div className="px-4 lg:px-2 mb-2">
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

  // Render loading state
  if (loading) {
    return (
      <div
        className="w-full my-2 px-0 lg:px-6"
        style={{ height: `${rowHeight}px` }}
      >
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
            <div className="px-4 lg:px-2 mb-2">
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
    <div className="w-full my-2 -mx-4 lg:mx-0 lg:px-6">
      <div className="relative w-full rounded-none lg:rounded-t-3xl overflow-visible">
        {/* Background gradient - horizontal orange to pink with vertical fade mask */}
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
          {/* Title row */}
          <div className="px-4 lg:px-2 mb-2">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">
                Special Products For You
              </h2>
              <button
                onClick={handleViewAll}
                className="flex items-center text-sm font-bold text-white underline decoration-white hover:opacity-80 transition-opacity"
              >
                View All
                <ChevronRight size={16} className="ml-1" />
              </button>
            </div>
          </div>

          {/* Product list or empty state */}
          {error ? (
            <div
              className="flex items-center justify-center text-white px-4 lg:px-0"
              style={{ height: `${rowHeight - 60}px` }}
            >
              <p className="text-center">
                Failed to load recommendations
                <br />
                <button
                  onClick={fetchRecommendations}
                  className="mt-2 px-4 py-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-all"
                >
                  Try Again
                </button>
              </p>
            </div>
          ) : products.length === 0 ? (
            <ShimmerList height={rowHeight - 60} count={5} />
          ) : (
            <div className="relative">
              {/* Left scroll arrow - hidden on mobile, positioned outside component on desktop */}
              {canScrollLeft && (
                <button
                  onClick={scrollLeft}
                  className="hidden lg:block absolute top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white rounded-full items-center justify-center transition-all duration-200 hover:scale-105"
                  style={{
                    left: "-30px",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
                    display: "none",
                  }}
                  aria-label="Scroll left"
                >
                  <ChevronLeft size={28} className="text-gray-700" />
                </button>
              )}

              {/* Right scroll arrow - hidden on mobile, positioned outside component on desktop */}
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

              {/* Scrollable container - no scrollbars */}
              <div
                ref={scrollContainerRef}
                className="overflow-x-auto overflow-y-hidden"
                style={{
                  height: `${rowHeight - 60}px`,
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                }}
                onScroll={checkScrollPosition}
              >
                <style jsx>{`
                  div::-webkit-scrollbar {
                    display: none;
                  }
                `}</style>
                <div className="flex gap-1.5 px-4 lg:px-2 h-full">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="flex-shrink-0"
                      style={{ width: "170px" }}
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
    </div>
  );
};
