// src/components/productdetail/ProductDetailRelatedProducts.tsx

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import ProductCard from "../../components/ProductCard";
import { Product } from "@/app/models/Product";
import { useTranslations } from "next-intl";

interface ProductDetailRelatedProductsProps {
  productId?: string;
  relatedProductIds?: string[];
  category?: string;
  subcategory?: string;
  isLoading?: boolean;
  isDarkMode?: boolean;
  localization?: ReturnType<typeof useTranslations>;
  prefetchedProducts?: Product[] | null;
}

const LoadingSkeleton: React.FC<{
  cardCount: number;
  isDarkMode?: boolean;
}> = ({ cardCount, isDarkMode = false }) => {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <div className="flex overflow-hidden" style={{ gap: "0px" }}>
      {Array.from({ length: cardCount }).map((_, i) => (
        <div
          key={i}
          className={`flex-shrink-0 w-48 sm:w-60 rounded-xl sm:rounded-2xl animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`}
          style={{ height: isMobile ? "420px" : "380px" }}
        >
          <div className="p-3 sm:p-4 space-y-2 sm:space-y-3 h-full flex flex-col">
            <div
              className={`flex-1 rounded-lg sm:rounded-xl ${
                isDarkMode ? "bg-gray-600" : "bg-gray-300"
              }`}
            />
            <div className="space-y-1.5 sm:space-y-2">
              <div
                className={`h-2.5 sm:h-3 rounded w-full ${
                  isDarkMode ? "bg-gray-600" : "bg-gray-300"
                }`}
              />
              <div
                className={`h-2.5 sm:h-3 rounded w-3/4 ${
                  isDarkMode ? "bg-gray-600" : "bg-gray-300"
                }`}
              />
              <div
                className={`h-3 sm:h-4 rounded w-1/2 ${
                  isDarkMode ? "bg-gray-600" : "bg-gray-300"
                }`}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const ProductDetailRelatedProducts: React.FC<
  ProductDetailRelatedProductsProps
> = ({
  productId,
  relatedProductIds: preloadedIds,
  isDarkMode = false,
  localization,
  prefetchedProducts,
}) => {
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingInitiated, setLoadingInitiated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track the current productId to detect changes
  const previousProductIdRef = useRef<string | undefined>(productId);

  // ✅ CRITICAL: Reset all state when productId changes (fixes navigation between products)
  useEffect(() => {
    if (previousProductIdRef.current !== productId) {
      console.log(`🔄 RelatedProducts: Product changed from ${previousProductIdRef.current} to ${productId}, resetting state`);
      previousProductIdRef.current = productId;

      // Reset all state for new product
      setRelatedProducts([]);
      setLoading(false);
      setLoadingInitiated(false);
      setError(null);
      setCanScrollLeft(false);
      setCanScrollRight(false);

      // Reset scroll position
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = 0;
      }
    }
  }, [productId]);

  const t = useCallback(
    (key: string) => {
      if (!localization) {
        return key;
      }

      try {
        const translation = localization(`ProductDetailRelatedProducts.${key}`);

        if (
          translation &&
          translation !== `ProductDetailRelatedProducts.${key}`
        ) {
          return translation;
        }

        const directTranslation = localization(key);
        if (directTranslation && directTranslation !== key) {
          return directTranslation;
        }

        return key;
      } catch (error) {
        console.warn(`Translation error for key: ${key}`, error);
        return key;
      }
    },
    [localization]
  );

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const getResponsiveDimensions = useCallback(() => {
    if (typeof window === "undefined") {
      return {
        listViewHeight: 450,
        cardWidth: 240,
        cardCount: 6,
        gap: 0,
      };
    }

    const screenWidth = window.innerWidth;
    const mobile = screenWidth < 768;

    return {
      listViewHeight: mobile ? 420 : 450,
      cardWidth: mobile ? 200 : 240,
      cardCount: mobile ? 3 : 6,
      gap: 0,
    };
  }, []);

  const { cardWidth, cardCount, gap } = getResponsiveDimensions();

  const checkScrollPosition = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  const scrollLeft = useCallback(() => {
    if (scrollContainerRef.current) {
      const scrollAmount = cardWidth + gap;
      scrollContainerRef.current.scrollBy({
        left: -scrollAmount,
        behavior: "smooth",
      });
    }
  }, [cardWidth, gap]);

  const scrollRight = useCallback(() => {
    if (scrollContainerRef.current) {
      const scrollAmount = cardWidth + gap;
      scrollContainerRef.current.scrollBy({
        left: scrollAmount,
        behavior: "smooth",
      });
    }
  }, [cardWidth, gap]);

  // ✅ Handle prefetched products - depends on both prefetchedProducts AND productId
  useEffect(() => {
    if (prefetchedProducts && prefetchedProducts.length > 0) {
      console.log(`✅ RelatedProducts: Using prefetched data for product ${productId} (${prefetchedProducts.length} products)`);
      setRelatedProducts(prefetchedProducts);
      setLoadingInitiated(true);
      setLoading(false);
    }
  }, [prefetchedProducts, productId]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      checkScrollPosition();
      container.addEventListener("scroll", checkScrollPosition);
      return () => container.removeEventListener("scroll", checkScrollPosition);
    }
  }, [relatedProducts, checkScrollPosition]);

  const fetchRelatedProducts = useCallback(async () => {
    // ✅ Skip if we already have prefetched products
    if (prefetchedProducts && prefetchedProducts.length > 0) {
      return;
    }

    if (loadingInitiated) return;

    // Need either preloaded IDs or productId to fetch
    if (!preloadedIds?.length && (!productId || productId.trim() === "")) {
      return;
    }

    setLoadingInitiated(true);
    setLoading(true);

    try {
      setError(null);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      let url: string;

      // ✅ If we have pre-loaded IDs, use batch endpoint (faster)
      if (preloadedIds && preloadedIds.length > 0) {
        url = `/api/products/batch?ids=${preloadedIds.slice(0, 10).join(",")}`;
      } else {
        // Fallback to original endpoint
        url = `/api/relatedproducts/${productId}`;
      }

      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setRelatedProducts(data.products || []);
    } catch (err) {
      console.error("Error fetching related products:", err);
      setError(err instanceof Error ? err.message : t("failedToLoadRelated"));
      setRelatedProducts([]);
    } finally {
      setLoading(false);
    }
  }, [productId, preloadedIds, loadingInitiated, t, prefetchedProducts]);

  // ✅ LAZY LOADING: Setup intersection observer
  // Matches Flutter's WidgetsBinding.instance.addPostFrameCallback approach
  useEffect(() => {
    if (!containerRef.current || loadingInitiated) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !loadingInitiated) {
          console.log(
            "Related products widget is visible, loading products..."
          );
          fetchRelatedProducts();
        }
      },
      {
        root: null,
        rootMargin: "100px", // Start loading 100px before visible
        threshold: 0.1,
      }
    );

    observerRef.current.observe(containerRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [fetchRelatedProducts, loadingInitiated]);

  // ✅ Hide widget if loading is complete AND no products found (matches Flutter)
  if (!loading && !loadingInitiated) {
    return <div ref={containerRef} />; // Invisible trigger for intersection observer
  }

  if (!loading && relatedProducts.length === 0) {
    return <div className="hidden" />; // Hide completely if no products
  }

  return (
    <div ref={containerRef} className="py-2 sm:py-3">
      <div className="space-y-2 sm:space-y-3">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl ${
                isDarkMode
                  ? "bg-orange-900/20 text-orange-400"
                  : "bg-orange-100 text-orange-600"
              }`}
            >
              <Shuffle className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3
                className={`text-lg sm:text-xl font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("title")}
              </h3>
              <p
                className={`text-xs sm:text-sm ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {t("subtitle")}
              </p>
            </div>
          </div>

          {relatedProducts.length > 4 && (
            <div
              className={`flex items-center gap-1 px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              <Shuffle className="w-3 h-3" />
              {relatedProducts.length} {t("items")}
            </div>
          )}
        </div>

        {/* Products container */}
        <div className="relative">
          {/* Left Smokey Fade Effect */}
          {!isMobile && canScrollLeft && (
            <div
              className={`absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r ${
                isDarkMode
                  ? "from-gray-900 via-gray-900/80 to-transparent"
                  : "from-gray-50 via-gray-50/80 to-transparent"
              } pointer-events-none z-10`}
            />
          )}

          {/* Right Smokey Fade Effect */}
          {!isMobile && canScrollRight && (
            <div
              className={`absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l ${
                isDarkMode
                  ? "from-gray-900 via-gray-900/80 to-transparent"
                  : "from-gray-50 via-gray-50/80 to-transparent"
              } pointer-events-none z-10`}
            />
          )}

          {/* Left Arrow - Always Visible */}
          {!isMobile && canScrollLeft && (
            <button
              onClick={scrollLeft}
              className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 shadow-xl rounded-full flex items-center justify-center transition-all hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400 border border-gray-600"
                  : "bg-white text-gray-600 hover:text-orange-600 border border-gray-200"
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Right Arrow - Always Visible */}
          {!isMobile && canScrollRight && (
            <button
              onClick={scrollRight}
              className={`absolute right-2 top-1/2 -translate-y-1/2 z-20 w-10 h-10 shadow-xl rounded-full flex items-center justify-center transition-all hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400 border border-gray-600"
                  : "bg-white text-gray-600 hover:text-orange-600 border border-gray-200"
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          <div className="overflow-hidden">
            {loading ? (
              <LoadingSkeleton cardCount={cardCount} isDarkMode={isDarkMode} />
            ) : relatedProducts.length > 0 ? (
              <div
                ref={scrollContainerRef}
                className="flex overflow-x-auto h-full scroll-smooth [&::-webkit-scrollbar]:hidden items-start"
                style={{
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  paddingBottom: "0",
                  paddingLeft: isMobile ? "4px" : "0",
                  gap: isMobile ? "8px" : "0px",
                }}
              >
                {relatedProducts.map((product, index) => (
                  <div
                    key={`${product.id}-${index}`}
                    className="flex-shrink-0"
                    style={{
                      width: `${cardWidth}px`,
                      minWidth: `${cardWidth}px`,
                      marginRight:
                        index < relatedProducts.length - 1
                          ? isMobile
                            ? "0px"
                            : "-20px"
                          : "0px",
                    }}
                  >
                    <ProductCard
                      product={product}
                      scaleFactor={isMobile ? 0.9 : 0.85}
                      internalScaleFactor={1.1}
                      showCartIcon={true}
                      showExtraLabels={false}
                      localization={localization}
                      onFavoriteToggle={(productId) => {
                        console.log("Toggle favorite for:", productId);
                      }}
                      onAddToCart={(productId) => {
                        console.log("Add to cart:", productId);
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-8">
                <div
                  className={`text-center space-y-2 sm:space-y-3 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  <Shuffle
                    className={`w-10 h-10 sm:w-12 sm:h-12 mx-auto ${
                      isDarkMode ? "text-gray-600" : "text-gray-400"
                    }`}
                  />
                  <div>
                    <p className="font-medium text-sm sm:text-base">
                      {t("noRelatedProductsFound")}
                    </p>
                    <p className="text-xs sm:text-sm">{error}</p>
                  </div>
                  <button
                    onClick={() => {
                      setLoadingInitiated(false);
                      fetchRelatedProducts();
                    }}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                      isDarkMode
                        ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {t("tryAgain")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailRelatedProducts;
