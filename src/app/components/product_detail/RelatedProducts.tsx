// src/components/productdetail/ProductDetailRelatedProducts.tsx

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Shuffle } from "lucide-react";
import ProductCard from "../../components/ProductCard";
import { Product } from "@/app/models/Product";
import { useTranslations } from "next-intl";

interface ProductDetailRelatedProductsProps {
  productId?: string;
  category?: string;
  subcategory?: string;
  isLoading?: boolean;
  isDarkMode?: boolean;
  localization?: ReturnType<typeof useTranslations>;
}

const LoadingSkeleton: React.FC<{
  cardCount: number;
  isDarkMode?: boolean;
}> = ({ cardCount, isDarkMode = false }) => (
  <div className="flex gap-2 overflow-hidden">
    {Array.from({ length: cardCount }).map((_, i) => (
      <div
        key={i}
        className={`flex-shrink-0 w-48 sm:w-60 rounded-xl sm:rounded-2xl animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`}
        style={{ height: "180px" }}
      >
        <div className="p-3 sm:p-4 space-y-2 sm:space-y-3 h-full flex flex-col">
          {/* Image placeholder */}
          <div
            className={`flex-1 rounded-lg sm:rounded-xl ${
              isDarkMode ? "bg-gray-600" : "bg-gray-300"
            }`}
          />

          {/* Text placeholders */}
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

const ProductDetailRelatedProducts: React.FC<ProductDetailRelatedProductsProps> = ({
  productId,
  category,
  subcategory,
  isLoading = false,
  isDarkMode = false,
  localization,
}) => {
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ✅ FIXED: Proper nested translation function that uses JSON files
  const t = useCallback((key: string) => {
    if (!localization) {
      return key;
    }

    try {
      // Try to get the nested ProductDetailRelatedProducts translation
      const translation = localization(`ProductDetailRelatedProducts.${key}`);
      
      // Check if we got a valid translation (not the same as the key we requested)
      if (translation && translation !== `ProductDetailRelatedProducts.${key}`) {
        return translation;
      }
      
      // If nested translation doesn't exist, try direct key
      const directTranslation = localization(key);
      if (directTranslation && directTranslation !== key) {
        return directTranslation;
      }
      
      // Return the key as fallback
      return key;
    } catch (error) {
      console.warn(`Translation error for key: ${key}`, error);
      return key;
    }
  }, [localization]);

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Calculate responsive dimensions
  const getResponsiveDimensions = useCallback(() => {
    if (typeof window === "undefined") {
      return {
        listViewHeight: 450, // Increased height
        cardWidth: 240,
        cardCount: 6,
        gap: 8,
      };
    }
  
    const screenWidth = window.innerWidth;
    const mobile = screenWidth < 768;
    
    return {
      listViewHeight: mobile ? 380 : 450, // Increased heights
      cardWidth: mobile ? 200 : 240,
      cardCount: mobile ? 3 : 6,
      gap: mobile ? 8 : 10,
    };
  }, []);

  const { cardWidth, cardCount, gap } = getResponsiveDimensions();

  // Scroll position checking
  const checkScrollPosition = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
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

  // Update scroll position when products change
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      checkScrollPosition();
      container.addEventListener("scroll", checkScrollPosition);
      return () => container.removeEventListener("scroll", checkScrollPosition);
    }
  }, [relatedProducts, checkScrollPosition]);

  useEffect(() => {
    const fetchRelatedProducts = async () => {
      if (!productId || productId.trim() === "") {
        setLoading(false);
        setRelatedProducts([]);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`/api/relatedproducts/${productId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("API Error Response:", errorText);
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.error) {
          console.warn("API returned error:", data.error);
          setRelatedProducts(data.products || []);
          setError(null);
        } else {
          setRelatedProducts(data.products || []);
        }
      } catch (err) {
        console.error("Error fetching related products:", err);

        if (err instanceof Error) {
          if (err.name === "AbortError") {
            setError(t("requestTimeout"));
          } else if (err.message.includes("Failed to fetch")) {
            setError(t("networkError"));
          } else {
            setError(err.message);
          }
        } else {
          setError(t("failedToLoadRelated"));
        }

        setRelatedProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRelatedProducts();
  }, [productId, category, subcategory, t]);

  return (
    <div className={`rounded-none sm:rounded-2xl -mx-3 px-3 py-2 sm:mx-0 sm:px-6 sm:py-3 border-0 sm:border sm:shadow-sm ${
      isDarkMode 
        ? "bg-gray-800 sm:border-gray-700" 
        : "bg-white sm:border-gray-200"
    }`}>
      <div className="space-y-2 sm:space-y-3">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl ${
              isDarkMode 
                ? "bg-orange-900/20 text-orange-400" 
                : "bg-orange-100 text-orange-600"
            }`}>
              <Shuffle className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className={`text-lg sm:text-xl font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}>
                {t("title")}
              </h3>
              <p className={`text-xs sm:text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}>
                {t("subtitle")}
              </p>
            </div>
          </div>
          
          {relatedProducts.length > 4 && (
            <div className={`flex items-center gap-1 px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${
              isDarkMode ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"
            }`}>
              <Shuffle className="w-3 h-3" />
              {relatedProducts.length} {t("items")}
            </div>
          )}
        </div>

        {/* Products container with fixed height */}
        <div className="relative group">
          {/* Left scroll button - hide on mobile for cleaner look */}
          {!isMobile && canScrollLeft && (
            <button
              onClick={scrollLeft}
              className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 shadow-xl rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400 border border-gray-600"
                  : "bg-white text-gray-600 hover:text-orange-600 border border-gray-200"
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Right scroll button - hide on mobile for cleaner look */}
          {!isMobile && canScrollRight && (
            <button
              onClick={scrollRight}
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 shadow-xl rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400 border border-gray-600"
                  : "bg-white text-gray-600 hover:text-orange-600 border border-gray-200"
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* Products container */}
          <div className="overflow-hidden">
            {isLoading || loading ? (
              <LoadingSkeleton
                cardCount={cardCount}
                isDarkMode={isDarkMode}
              />
            ) : relatedProducts.length > 0 ? (
              <div
  ref={scrollContainerRef}
  className="flex gap-2 overflow-x-auto h-full scroll-smooth [&::-webkit-scrollbar]:hidden items-start" // Changed from gap-3 sm:gap-4 to gap-2
  style={{
    scrollbarWidth: "none",
    msOverflowStyle: "none",
    paddingBottom: "0",
    paddingLeft: isMobile ? "4px" : "0",
  }}
>
  {relatedProducts.map((product, index) => (
    <div
      key={`${product.id}-${index}`}
      className="flex-shrink-0 flex items-start"
      style={{
        width: `${cardWidth}px`,
        minWidth: `${cardWidth}px`,
      }}
    >
      <ProductCard
        product={product}
        scaleFactor={isMobile ? 0.80 : 0.85}// Reduced from 0.75/0.85 to make cards smaller
        internalScaleFactor={1.1}
        showCartIcon={true}
        showExtraLabels={false}
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
              <div className="flex items-center justify-center">
                <div className={`text-center space-y-2 sm:space-y-3 ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}>
                  <Shuffle className={`w-10 h-10 sm:w-12 sm:h-12 mx-auto ${
                    isDarkMode ? "text-gray-600" : "text-gray-400"
                  }`} />
                  <div>
                    <p className="font-medium text-sm sm:text-base">{t("noRelatedProductsFound")}</p>
                    <p className="text-xs sm:text-sm">{error}</p>
                  </div>
                  <button
                    onClick={() => window.location.reload()}
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
            ) : (
              <LoadingSkeleton
                cardCount={cardCount}
                isDarkMode={isDarkMode}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailRelatedProducts;