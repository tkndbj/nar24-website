"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ProductCard } from "../ProductCard";
import { ChevronRight } from "lucide-react";
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
  const router = useRouter();

  // Fixed dimensions to prevent hydration mismatch
  const portraitImageHeight = 240; // Fixed height instead of calculating from window
  const infoAreaHeight = 80;
  const rowHeight = portraitImageHeight + infoAreaHeight + 40; // Added extra padding

  // Set client flag after component mounts
  useEffect(() => {
    setIsClient(true);
  }, []);

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
      params.append("maxProducts", "10"); // Limited to 10 products

      const response = await fetch(`/api/recommendations?${params.toString()}`);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch recommendations: ${response.statusText}`
        );
      }

      const data = await response.json();
      // Limit to maximum 10 products
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

  // Scale factors (fixed values to prevent hydration issues)
  const { scaleFactor, overrideInnerScale } = useMemo(() => {
    return {
      scaleFactor: 0.88, // Fixed scale factor
      overrideInnerScale: 1.2,
    };
  }, []);

  const handleViewAll = () => {
    router.push("/special-for-you");
  };

  const handleProductTap = (product: Product) => {
    // Navigate to product detail page
    router.push(`/products/${product.id}`);
  };

  // Don't render until client-side hydration is complete
  if (!isClient) {
    return (
      <div className="w-full my-2" style={{ height: `${rowHeight}px` }}>
        <div className="relative w-full">
          {/* Background gradient (top half) */}
          <div
            className="absolute inset-0 bg-gradient-to-r from-orange-500 to-pink-500"
            style={{ height: `${rowHeight / 2}px` }}
          />

          {/* Content */}
          <div className="relative py-3">
            {/* Title row with shimmer */}
            <div className="px-2 mb-2">
              <div className="flex justify-between items-center">
                <div className="h-5 bg-white bg-opacity-30 rounded animate-pulse w-48" />
                <div className="h-4 bg-white bg-opacity-30 rounded animate-pulse w-16" />
              </div>
            </div>

            {/* Shimmer product list */}
            <ShimmerList height={rowHeight - 60} count={5} />
          </div>
        </div>
      </div>
    );
  }

  // Render loading state
  if (loading) {
    return (
      <div className="w-full my-2" style={{ height: `${rowHeight}px` }}>
        <div className="relative w-full">
          {/* Background gradient (top half) */}
          <div
            className="absolute inset-0 bg-gradient-to-r from-orange-500 to-pink-500"
            style={{ height: `${rowHeight / 2}px` }}
          />

          {/* Content */}
          <div className="relative py-3">
            {/* Title row with shimmer */}
            <div className="px-2 mb-2">
              <div className="flex justify-between items-center">
                <div className="h-5 bg-white bg-opacity-30 rounded animate-pulse w-48" />
                <div className="h-4 bg-white bg-opacity-30 rounded animate-pulse w-16" />
              </div>
            </div>

            {/* Shimmer product list */}
            <ShimmerList height={rowHeight - 60} count={5} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full my-2">
      <div className="relative w-full">
        {/* Background gradient (top half) */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-orange-500 to-pink-500"
          style={{ height: `${rowHeight / 2}px` }}
        />

        {/* Content */}
        <div className="relative py-3">
          {/* Title row */}
          <div className="px-2 mb-2">
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
              className="flex items-center justify-center text-white"
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
            <div
              className="overflow-x-auto scrollbar-hide"
              style={{ height: `${rowHeight - 60}px` }}
            >
              <div className="flex gap-1.5 px-2 h-full justify-center">
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
                      onTap={() => handleProductTap(product)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
