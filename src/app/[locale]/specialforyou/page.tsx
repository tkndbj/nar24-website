// app/special-for-you/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import SecondHeader from "../../components/market_screen/SecondHeader";
import ProductCard from "../../components/ProductCard";
import { personalizedFeedService } from "@/services/personalizedFeedService";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { Product } from "@/app/models/Product";
import { AlertCircle, RefreshCw, Sparkles, ChevronUp } from "lucide-react";

// Constants
const BATCH_SIZE = 30; // Firestore whereIn limit
const SCROLL_THRESHOLD = 800;

export default function SpecialForYouPage() {
  const t = useTranslations();
  const router = useRouter();

  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Data states
  const [allProductIds, setAllProductIds] = useState<string[]>([]);
  const [loadedProducts, setLoadedProducts] = useState<Product[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Loading states
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI states
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  // Theme detection
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => observer.disconnect();
  }, []);

  // Fetch product details from Firestore
  const fetchProductDetails = useCallback(
    async (productIds: string[]): Promise<Product[]> => {
      if (productIds.length === 0) return [];

      try {
        const db = getFirestore();
        const productsRef = collection(db, "shop_products");
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
        throw e;
      }
    },
    []
  );

  // Load next batch of products
  const loadNextBatch = useCallback(async () => {
    if (isLoadingMore || !hasMore || allProductIds.length === 0) return;

    setIsLoadingMore(true);

    try {
      const remainingIds = allProductIds.length - currentIndex;

      if (remainingIds <= 0) {
        setHasMore(false);
        setIsLoadingMore(false);
        return;
      }

      const batchSize = Math.min(remainingIds, BATCH_SIZE);
      const nextBatch = allProductIds.slice(
        currentIndex,
        currentIndex + batchSize
      );

      const products = await fetchProductDetails(nextBatch);

      setLoadedProducts((prev) => [...prev, ...products]);
      setCurrentIndex((prev) => prev + batchSize);
      setHasMore(currentIndex + batchSize < allProductIds.length);

      console.log(
        `✅ Loaded batch: ${products.length} products (${
          loadedProducts.length + products.length
        }/${allProductIds.length} total)`
      );
    } catch (e) {
      console.error("Error loading batch:", e);
      setError(t("SpecialForYou.errorLoadingProducts"));
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    allProductIds,
    currentIndex,
    hasMore,
    isLoadingMore,
    fetchProductDetails,
    loadedProducts.length,
    t,
  ]);

  // Initialize - Get all 200 IDs and load first batch
  const initialize = useCallback(async () => {
    setIsInitialLoading(true);
    setError(null);

    try {
      // Initialize service if needed
      await personalizedFeedService.initialize();

      // Get all product IDs from service
      const productIds = await personalizedFeedService.getProductIds();

      if (productIds.length === 0) {
        setAllProductIds([]);
        setHasMore(false);
        setIsInitialLoading(false);
        return;
      }

      setAllProductIds(productIds);

      // Load first batch
      const firstBatch = productIds.slice(0, BATCH_SIZE);
      const products = await fetchProductDetails(firstBatch);

      setLoadedProducts(products);
      setCurrentIndex(BATCH_SIZE);
      setHasMore(BATCH_SIZE < productIds.length);

      console.log(
        `✅ Initialized with ${productIds.length} product IDs, loaded first ${products.length}`
      );
    } catch (e) {
      console.error("Error initializing:", e);
      setError(t("SpecialForYou.errorInitializing"));
    } finally {
      setIsInitialLoading(false);
    }
  }, [fetchProductDetails, t]);

  // Refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      // Force refresh from backend
      await personalizedFeedService.forceRefresh();

      // Reset state
      setAllProductIds([]);
      setLoadedProducts([]);
      setCurrentIndex(0);
      setHasMore(true);
      setError(null);

      // Reload
      await initialize();
    } catch (e) {
      console.error("Error refreshing:", e);
      setError(t("SpecialForYou.errorRefreshing"));
    } finally {
      setIsRefreshing(false);
    }
  }, [initialize, t]);

  // Initial load
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMore &&
          !isLoadingMore &&
          !isInitialLoading
        ) {
          loadNextBatch();
        }
      },
      { threshold: 0.1, rootMargin: `${SCROLL_THRESHOLD}px` }
    );

    if (loadMoreTriggerRef.current) {
      observer.observe(loadMoreTriggerRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, isInitialLoading, loadNextBatch]);

  // Scroll to top visibility
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 500);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Scroll to top handler
  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Product click handler
  const handleProductClick = useCallback(
    (productId: string) => {
      router.push(`/productdetail/${productId}`);
    },
    [router]
  );

  // Shimmer skeleton component
  const ProductCardSkeleton = () => (
    <div className="w-full">
      <div
        className={`rounded-xl overflow-hidden ${
          isDarkMode ? "bg-gray-800" : "bg-gray-200"
        }`}
      >
        {/* Image skeleton */}
        <div
          className={`w-full relative overflow-hidden ${
            isDarkMode ? "bg-gray-700" : "bg-gray-300"
          }`}
          style={{ height: "320px" }}
        >
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"
            style={{ backgroundSize: "200% 100%" }}
          />
        </div>

        {/* Content skeleton */}
        <div className="p-3 space-y-2.5">
          <div className="space-y-2">
            <div
              className={`h-3.5 rounded ${
                isDarkMode ? "bg-gray-700" : "bg-gray-300"
              } relative overflow-hidden`}
              style={{ width: "85%" }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
            </div>
            <div
              className={`h-3.5 rounded ${
                isDarkMode ? "bg-gray-700" : "bg-gray-300"
              } relative overflow-hidden`}
              style={{ width: "60%" }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
            </div>
          </div>

          <div
            className={`h-5 rounded ${
              isDarkMode ? "bg-gray-700" : "bg-gray-300"
            } relative overflow-hidden`}
            style={{ width: "45%" }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
          </div>

          <div className="flex items-center justify-between pt-1">
            <div
              className={`h-3 rounded ${
                isDarkMode ? "bg-gray-700" : "bg-gray-300"
              } relative overflow-hidden`}
              style={{ width: "40%" }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
            </div>
            <div className="flex gap-1">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full ${
                    isDarkMode ? "bg-gray-700" : "bg-gray-300"
                  } relative overflow-hidden`}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <SecondHeader />

      <div
        ref={scrollContainerRef}
        className={`min-h-screen w-full ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        {/* Hero Header with Gradient */}
        <div className="relative w-full overflow-hidden">
          {/* Gradient Background */}
          <div
            className="absolute inset-0 h-48"
            style={{
              background: "linear-gradient(135deg, #f97316 0%, #ec4899 100%)",
              maskImage:
                "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
            }}
          />

          {/* Header Content */}
          <div className="relative max-w-7xl mx-auto px-4 pt-8 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="w-8 h-8 text-white" />
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-white">
                    {t("SpecialForYou.title")}
                  </h1>
                  <p className="text-white/80 text-sm mt-1">
                    {t("SpecialForYou.subtitle")}
                  </p>
                </div>
              </div>

              {/* Progress Badge */}
              {loadedProducts.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="hidden md:block px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full">
                    <span className="text-white font-semibold text-sm">
                      {loadedProducts.length}/{allProductIds.length}{" "}
                      {t("SpecialForYou.products")}
                    </span>
                  </div>

                  {/* Refresh Button */}
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing || isInitialLoading}
                    className={`p-2 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 transition-all ${
                      isRefreshing ? "animate-spin" : ""
                    }`}
                    aria-label={t("SpecialForYou.refresh")}
                  >
                    <RefreshCw className="w-5 h-5 text-white" />
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Progress */}
            {loadedProducts.length > 0 && (
              <div className="md:hidden mt-4">
                <div className="flex items-center justify-between text-white/80 text-xs mb-1">
                  <span>{t("SpecialForYou.progress")}</span>
                  <span>
                    {loadedProducts.length}/{allProductIds.length}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-500"
                    style={{
                      width: `${
                        (loadedProducts.length / allProductIds.length) * 100
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 pb-8">
          {/* Initial Loading State */}
          {isInitialLoading && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6 mt-4">
              {[...Array(8)].map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          )}

          {/* Error State */}
          {error && !isInitialLoading && loadedProducts.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center max-w-md">
                <AlertCircle size={64} className="mx-auto mb-4 text-red-500" />
                <h2
                  className={`text-xl font-semibold mb-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("SpecialForYou.errorTitle")}
                </h2>
                <p
                  className={`mb-6 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {error}
                </p>
                <button
                  onClick={initialize}
                  className="px-6 py-3 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
                >
                  {t("SpecialForYou.retry")}
                </button>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isInitialLoading && !error && loadedProducts.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center max-w-md">
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-orange-500/20 to-pink-500/20 flex items-center justify-center">
                  <Sparkles
                    size={48}
                    className={
                      isDarkMode ? "text-orange-400" : "text-orange-500"
                    }
                  />
                </div>
                <h2
                  className={`text-xl font-semibold mb-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("SpecialForYou.noRecommendationsTitle")}
                </h2>
                <p
                  className={`mb-2 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("SpecialForYou.noRecommendationsSubtitle")}
                </p>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-500" : "text-gray-500"
                  }`}
                >
                  {t("SpecialForYou.noRecommendationsHint")}
                </p>
              </div>
            </div>
          )}

          {/* Products Grid */}
          {loadedProducts.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6 mt-4">
                {loadedProducts.map((product) => (
                  <div key={product.id} className="w-full">
                    <ProductCard
                      product={product}
                      onTap={() => handleProductClick(product.id)}
                      showCartIcon={true}
                      portraitImageHeight={320}
                      isDarkMode={isDarkMode}
                      localization={t}
                    />
                  </div>
                ))}
              </div>

              {/* Load More Trigger */}
              <div ref={loadMoreTriggerRef} className="w-full h-4" />

              {/* Loading More Indicator */}
              {isLoadingMore && (
                <div className="flex items-center justify-center py-8 gap-2">
                  <div
                    className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              )}

              {/* End of Recommendations */}
              {!hasMore && loadedProducts.length > 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-r from-orange-500/20 to-pink-500/20 flex items-center justify-center mb-4">
                    <Sparkles
                      size={32}
                      className={
                        isDarkMode ? "text-orange-400" : "text-orange-500"
                      }
                    />
                  </div>
                  <p
                    className={`text-center font-medium mb-2 ${
                      isDarkMode ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {t("SpecialForYou.endOfRecommendations")}
                  </p>
                  <p
                    className={`text-center text-sm ${
                      isDarkMode ? "text-gray-500" : "text-gray-500"
                    }`}
                  >
                    {t("SpecialForYou.endOfRecommendationsHint")}
                  </p>
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="mt-4 px-6 py-2 text-sm text-orange-500 border border-orange-500 rounded-full hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50"
                  >
                    {isRefreshing
                      ? t("SpecialForYou.refreshing")
                      : t("SpecialForYou.refreshRecommendations")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Scroll to Top Button */}
        {showScrollTop && (
          <button
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 z-50 p-3 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-lg hover:opacity-90 transition-all transform hover:scale-105"
            aria-label={t("SpecialForYou.scrollToTop")}
          >
            <ChevronUp size={24} />
          </button>
        )}
      </div>

      {/* Shimmer Animation Styles */}
      <style jsx global>{`
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        .animate-shimmer {
          animation: shimmer 1.5s infinite;
          background-size: 200% 100%;
        }
      `}</style>
    </>
  );
}
