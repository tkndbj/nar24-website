// components/market_screen/PreferenceProduct.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ProductCard } from "../ProductCard";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { personalizedFeedService } from "@/services/personalizedFeedService";
import { getFirebaseDb } from "@/lib/firebase-lazy";
import { useTheme } from "@/hooks/useTheme";
import { ProductUtils } from "@/app/models/Product";
import type { Product } from "@/app/models/Product";
import type { PrefetchedProduct } from "@/types/MarketLayout";

// Shimmer skeleton — uses global CSS classes from globals.css (shimmer-effect)
const ShimmerCard = React.memo(({ isDarkMode }: { isDarkMode: boolean }) => {
  const shimmer = `shimmer-effect ${isDarkMode ? "shimmer-effect-dark" : "shimmer-effect-light"}`;
  const imgBg = isDarkMode ? "bg-gray-700" : "bg-gray-100";
  const textBg = isDarkMode ? "bg-gray-700" : "bg-gray-200";

  return (
    <div className={`rounded-xl overflow-hidden shadow-sm ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
      style={{ height: `${(380 + 80) * 0.88}px` }}
    >
      <div className={`w-full relative overflow-hidden ${imgBg}`} style={{ height: `${380 * 0.88}px` }}>
        <div className={shimmer} />
      </div>
      <div className="p-2 space-y-2" style={{ height: `${80 * 0.88}px` }}>
        {[75, 50].map((w, i) => (
          <div key={i} className={`h-3 rounded relative overflow-hidden ${textBg}`} style={{ width: `${w}%` }}>
            <div className={shimmer} />
          </div>
        ))}
        <div className={`h-4 rounded relative overflow-hidden ${textBg}`} style={{ width: "40%" }}>
          <div className={shimmer} />
        </div>
      </div>
    </div>
  );
});
ShimmerCard.displayName = "ShimmerCard";

const ShimmerList = React.memo(({ isDarkMode }: { isDarkMode: boolean }) => (
  <div className="flex gap-2 px-0 lg:px-2 overflow-hidden" style={{ height: `${380 + 80 + 40 - 60}px` }}>
    {[0, 1, 2, 3, 4].map((i) => (
      <div key={i} className="flex-shrink-0" style={{ width: "190px" }}>
        <ShimmerCard isDarkMode={isDarkMode} />
      </div>
    ))}
  </div>
));
ShimmerList.displayName = "ShimmerList";

interface PreferenceProductProps {
  keyPrefix?: string;
  initialProducts?: PrefetchedProduct[] | null;
}

/** Hydrate server-prefetched products into Product objects */
function hydrateProducts(prefetched: PrefetchedProduct[]): Product[] {
  return prefetched
    .map((p) => {
      try {
        return ProductUtils.fromJson(p as unknown as Record<string, unknown>);
      } catch {
        return null;
      }
    })
    .filter((p): p is Product => p !== null);
}

let cachedProducts: Product[] | null = null;
let productsCacheExpiry: Date | null = null;
const PRODUCTS_CACHE_DURATION = 60 * 60 * 1000;

export const PreferenceProduct = React.memo(
  ({ keyPrefix = "", initialProducts }: PreferenceProductProps) => {
    // Hydrate server data immediately (no loading state, no shimmer)
    const hydratedFromServer = React.useMemo(() => {
      if (!initialProducts || initialProducts.length === 0) return null;
      return hydrateProducts(initialProducts);
    }, [initialProducts]);

    const [products, setProducts] = useState<Product[]>(() => {
      // Priority: server data > module cache > empty
      if (hydratedFromServer && hydratedFromServer.length > 0) return hydratedFromServer;
      if (cachedProducts && cachedProducts.length > 0 && productsCacheExpiry && productsCacheExpiry > new Date()) return cachedProducts;
      return [];
    });
    const [isLoading, setIsLoading] = useState(
      // No loading if we have server data or valid cache
      !(hydratedFromServer && hydratedFromServer.length > 0) &&
      !(cachedProducts && cachedProducts.length > 0 && productsCacheExpiry && productsCacheExpiry > new Date())
    );
    const [error, setError] = useState<string | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const isDarkMode = useTheme();

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
          const [db, { collection, query, where, getDocs }] = await Promise.all([
            getFirebaseDb(),
            import("firebase/firestore"),
          ]);
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
     * Load recommendations (skipped when server data is available)
     */
    const loadRecommendations = useCallback(async () => {
      // ✅ CHECK CACHE FIRST (includes server-hydrated data)
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
        // Client-side fallback: fetch trending IDs then product details
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
     * Populate module cache from server-hydrated data (once)
     */
    useEffect(() => {
      if (hydratedFromServer && hydratedFromServer.length > 0 && !cachedProducts) {
        cachedProducts = hydratedFromServer;
        productsCacheExpiry = new Date(Date.now() + PRODUCTS_CACHE_DURATION);
      }
    }, [hydratedFromServer]);

    /**
     * Initial load — skipped when server data is available
     */
    useEffect(() => {
      // If we already have products (from server or cache), skip client fetch
      if (products.length > 0 && !isLoading) return;
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
                isDarkMode={isDarkMode}
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
                  <div className="flex gap-0 px-0 lg:px-2 h-full pr-0 lg:pr-2 -ml-2 lg:ml-0 -space-x-2">
                    {products.map((product, index) => (
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
                          priority={index < 4}
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
