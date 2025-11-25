// components/market_screen/PreferenceProduct.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ProductCard } from "../ProductCard";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { personalizedFeedService } from "@/services/personalizedFeedService";
import {
  getFirestore,
  query,
  where,
  getDocs,
  collection,
} from "firebase/firestore";
import type { Product } from "@/app/models/Product";

// Shimmer loading component - matches ProductCard structure
const ShimmerCard = React.memo(
  ({
    portraitImageHeight,
    infoAreaHeight,
    scaleFactor,
  }: {
    portraitImageHeight: number;
    infoAreaHeight: number;
    scaleFactor: number;
  }) => {
    const cardHeight = (portraitImageHeight + infoAreaHeight) * scaleFactor;
    const imageHeight = portraitImageHeight * scaleFactor;
    const infoHeight = infoAreaHeight * scaleFactor;

    return (
      <div
        className="bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm"
        style={{ height: `${cardHeight}px` }}
      >
        {/* Image area */}
        <div
          className="w-full bg-gray-200 dark:bg-gray-700 animate-pulse"
          style={{ height: `${imageHeight}px` }}
        />

        {/* Info area */}
        <div className="p-2 space-y-2" style={{ height: `${infoHeight}px` }}>
          {/* Title skeleton */}
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/2" />

          {/* Price skeleton */}
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/5 mt-auto" />
        </div>
      </div>
    );
  }
);
ShimmerCard.displayName = "ShimmerCard";

// Shimmer list
const ShimmerList = React.memo(
  ({
    rowHeight,
    portraitImageHeight,
    infoAreaHeight,
    scaleFactor,
  }: {
    rowHeight: number;
    portraitImageHeight: number;
    infoAreaHeight: number;
    scaleFactor: number;
  }) => {
    return (
      <div
        className="flex gap-2 px-0 lg:px-2 overflow-hidden"
        style={{ height: `${rowHeight - 60}px` }}
      >
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="flex-shrink-0" style={{ width: "190px" }}>
            <ShimmerCard
              portraitImageHeight={portraitImageHeight}
              infoAreaHeight={infoAreaHeight}
              scaleFactor={scaleFactor}
            />
          </div>
        ))}
      </div>
    );
  }
);
ShimmerList.displayName = "ShimmerList";

interface PreferenceProductProps {
  keyPrefix?: string;
}

let cachedProducts: Product[] | null = null;
let productsCacheExpiry: Date | null = null;
const PRODUCTS_CACHE_DURATION = 60 * 60 * 1000;

export const PreferenceProduct = React.memo(
  ({ keyPrefix = "" }: PreferenceProductProps) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const t = useTranslations("MarketScreen");

    // Fixed dimensions (matches Flutter)
    const portraitImageHeight = 380;
    const infoAreaHeight = 80;
    const rowHeight = portraitImageHeight + infoAreaHeight + 40;
    const scaleFactor = 0.88;
    const overrideInnerScale = 1.2;

    /**
     * Get random sample from array
     */
    const getRandomSample = useCallback(
      (items: string[], sampleSize: number): string[] => {
        if (items.length <= sampleSize) {
          return [...items];
        }

        const indices = new Set<number>();
        while (indices.size < sampleSize) {
          indices.add(Math.floor(Math.random() * items.length));
        }

        return Array.from(indices).map((i) => items[i]);
      },
      []
    );

    /**
     * Fetch product details from Firestore
     */
    const fetchProductDetails = useCallback(
      async (productIds: string[]): Promise<Product[]> => {
        if (productIds.length === 0) return [];

        try {
          const db = getFirestore();
          const productsRef = collection(db, "shop_products");

          // Firestore whereIn limit is 30
          const q = query(productsRef, where("__name__", "in", productIds));
          const snapshot = await getDocs(q);

          const products: Product[] = [];
          snapshot.docs.forEach((doc) => {
            try {
              products.push({ id: doc.id, ...doc.data() } as Product);
            } catch (e) {
              console.error(`Error parsing product ${doc.id}:`, e);
            }
          });

          // Maintain order from productIds
          const productMap = new Map(products.map((p) => [p.id, p]));
          return productIds
            .filter((id) => productMap.has(id))
            .map((id) => productMap.get(id)!);
        } catch (e) {
          console.error("Error fetching product details:", e);
          return [];
        }
      },
      []
    );

    /**
     * Load recommendations
     */
    const loadRecommendations = useCallback(async () => {
      // ✅ CHECK CACHE FIRST
      if (
        cachedProducts &&
        cachedProducts.length > 0 &&
        productsCacheExpiry &&
        productsCacheExpiry > new Date()
      ) {
        console.log(
          `✅ Using cached preference products (${cachedProducts.length})`
        );
        setProducts(cachedProducts);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const productIds = await personalizedFeedService.getProductIds();

        if (productIds.length === 0) {
          setProducts([]);
          setIsLoading(false);
          return;
        }

        const randomProductIds = getRandomSample(productIds, 30);
        const fetchedProducts = await fetchProductDetails(randomProductIds);

        // ✅ CACHE THE PRODUCTS
        cachedProducts = fetchedProducts;
        productsCacheExpiry = new Date(Date.now() + PRODUCTS_CACHE_DURATION);
        console.log(
          `📦 Cached ${fetchedProducts.length} preference products for 1 hour`
        );

        setProducts(fetchedProducts);
        setIsLoading(false);
      } catch (e) {
        console.error("Error loading personalized feed:", e);
        setError(e instanceof Error ? e.message : "Unknown error");
        setIsLoading(false);
      }
    }, [getRandomSample, fetchProductDetails]);

    /**
     * Force refresh
     */
    const refresh = useCallback(async () => {
      // ✅ Clear local cache FIRST
      cachedProducts = null;
      productsCacheExpiry = null;

      await personalizedFeedService.forceRefresh();
      await loadRecommendations();
    }, [loadRecommendations]);

    /**
     * Initial load
     */
    useEffect(() => {
      loadRecommendations();
    }, [loadRecommendations]);

    /**
     * Check scroll position
     */
    const checkScrollPosition = useCallback(() => {
      if (scrollContainerRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } =
          scrollContainerRef.current;
        setCanScrollLeft(scrollLeft > 0);
        setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
      }
    }, []);

    /**
     * Scroll handlers
     */
    const scrollLeft = useCallback(() => {
      scrollContainerRef.current?.scrollBy({ left: -200, behavior: "smooth" });
    }, []);

    const scrollRight = useCallback(() => {
      scrollContainerRef.current?.scrollBy({ left: 200, behavior: "smooth" });
    }, []);

    /**
     * Check scroll position when products change
     */
    useEffect(() => {
      if (products.length > 0) {
        requestAnimationFrame(checkScrollPosition);
      }
    }, [products.length, checkScrollPosition]);

    /**
     * View all handler
     */
    const handleViewAll = useCallback(() => {
      router.push("/specialforyou");
    }, [router]);

    // Hide if no products and not loading
    if (products.length === 0 && !isLoading) {
      return null;
    }

    return (
      <div className="w-full my-2 lg:mx-0 lg:px-6">
        <div className="relative w-full rounded-none lg:rounded-t-3xl overflow-visible">
          {/* Background gradient with vertical fade mask */}
          <div
            className="absolute inset-0 rounded-none lg:rounded-t-3xl"
            style={{
              height: `${rowHeight * 0.6}px`,
              background: "linear-gradient(to right, #f97316, #ec4899)",
              maskImage:
                "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
            }}
          />

          <div className="relative py-3">
            {/* Header */}
            <div className="px-0 lg:px-2 mb-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">
                    {t("specialProductsForYou")}
                  </h2>
                  {/* Loading indicator when refreshing */}
                  {isLoading && products.length > 0 && (
                    <div className="w-3 h-3">
                      <svg
                        className="animate-spin text-white/70"
                        viewBox="0 0 24 24"
                      >
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

            {/* Content */}
            {isLoading && products.length === 0 ? (
              <ShimmerList
                rowHeight={rowHeight}
                portraitImageHeight={portraitImageHeight}
                infoAreaHeight={infoAreaHeight}
                scaleFactor={scaleFactor}
              />
            ) : error && products.length === 0 ? (
              // Error state
              <div
                className="flex flex-col items-center justify-center text-white px-0 lg:px-0"
                style={{ height: `${rowHeight - 60}px` }}
              >
                <svg
                  className="w-8 h-8 text-white/70 mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-white/70 mb-2">
                  {t("failedToLoadRecommendations")}
                </p>
                <button
                  onClick={refresh}
                  className="text-white underline hover:opacity-80 transition-opacity"
                >
                  {t("retry")}
                </button>
              </div>
            ) : (
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
                  className="overflow-x-auto overflow-y-hidden scrollbar-hide"
                  style={{
                    height: `${rowHeight - 60}px`,
                  }}
                  onScroll={checkScrollPosition}
                >
                  <div className="flex gap-0 px-0 lg:px-2 h-full pr-0 lg:pr-2 -ml-2 lg:ml-0">
                    {products.map((product) => (
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
  }
);

PreferenceProduct.displayName = "PreferenceProduct";

export function clearPreferenceProductsCache() {
  cachedProducts = null;
  productsCacheExpiry = null;
  console.log("🧹 Cleared preference products cache");
}
