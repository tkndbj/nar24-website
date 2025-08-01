import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProductCard from "../../components/ProductCard"; // Adjust path to your ProductCard

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

interface ProductDetailRelatedProductsProps {
  productId?: string;
  category?: string;
  subcategory?: string;
  isLoading?: boolean;
  isDarkMode?: boolean;
}

const LoadingSkeleton: React.FC<{
  listViewHeight: number;
  cardWidth: number;
  isDarkMode?: boolean;
}> = ({ listViewHeight, cardWidth, isDarkMode = false }) => (
  <div className="flex gap-4 overflow-hidden">
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className={`flex-shrink-0 rounded-xl animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`}
        style={{
          width: `${cardWidth}px`,
          height: `${listViewHeight - 40}px`, // Account for container padding
        }}
      >
        <div className="p-3 space-y-3 h-full flex flex-col">
          {/* Image placeholder */}
          <div className={`flex-1 rounded-lg ${
            isDarkMode ? "bg-gray-600" : "bg-gray-300"
          }`} />

          {/* Text placeholders */}
          <div className="space-y-2">
            <div className={`h-3 rounded w-full ${
              isDarkMode ? "bg-gray-600" : "bg-gray-300"
            }`} />
            <div className={`h-3 rounded w-3/4 ${
              isDarkMode ? "bg-gray-600" : "bg-gray-300"
            }`} />
            <div className={`h-4 rounded w-1/2 ${
              isDarkMode ? "bg-gray-600" : "bg-gray-300"
            }`} />
          </div>
        </div>
      </div>
    ))}
  </div>
);

const ProductDetailRelatedProducts: React.FC<
  ProductDetailRelatedProductsProps
> = ({
  productId,
  category,
  subcategory,
  isLoading = false,
  isDarkMode = false,
}) => {
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Calculate responsive dimensions - matches Flutter logic
  const getResponsiveDimensions = () => {
    if (typeof window === "undefined") {
      return { listViewHeight: 420, cardWidth: 240, scaleFactor: 0.85 };
    }

    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const isLandscape = screenWidth > screenHeight;

    // Scale factors matching Flutter implementation
    const cardScaleFactor = 0.85;
    const internalScaleFactor = 1.1;

    // Calculate dynamic factor (same logic as Flutter)
    let dynamicFactor = screenWidth / 375;
    dynamicFactor = Math.max(0.8, Math.min(1.2, dynamicFactor));

    if (isLandscape && dynamicFactor > 1.0) {
      dynamicFactor = 1.0;
    }

    const effectiveScaleFactor = dynamicFactor * cardScaleFactor;

    // Calculate image height (matches Flutter calculation)
    const baseImageHeight = screenHeight * 0.35;
    const actualImageHeight = baseImageHeight * effectiveScaleFactor;

    // Calculate text section height
    const textSectionHeight = 90 * effectiveScaleFactor * internalScaleFactor;

    // Total card height with padding - more generous calculation
    const estimatedCardHeight = actualImageHeight + textSectionHeight + 40;

    // Clamp to reasonable bounds - ensure enough height for scaled cards
    const listViewHeight = Math.max(400, Math.min(500, estimatedCardHeight));

    // Card width calculation - significantly wider to make gaps appear smaller
    const cardWidth = 240; // Increased from 200 to 240 for much wider cards

    return {
      listViewHeight,
      cardWidth,
      scaleFactor: cardScaleFactor,
      internalScaleFactor,
    };
  };

  const { listViewHeight, cardWidth, scaleFactor, internalScaleFactor } =
    getResponsiveDimensions();

  // Scroll position checking
  const checkScrollPosition = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      // Fixed scroll amount - one card width + smaller gap
      const scrollAmount = cardWidth + 16; // 16px gap (reduced from 24px)
      scrollContainerRef.current.scrollBy({ 
        left: -scrollAmount,
        behavior: "smooth" 
      });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      // Fixed scroll amount - one card width + smaller gap
      const scrollAmount = cardWidth + 16; // 16px gap (reduced from 24px)
      scrollContainerRef.current.scrollBy({ 
        left: scrollAmount,
        behavior: "smooth" 
      });
    }
  };

  // Update scroll position when products change
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      checkScrollPosition();
      container.addEventListener("scroll", checkScrollPosition);
      return () => container.removeEventListener("scroll", checkScrollPosition);
    }
  }, [relatedProducts]);

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

        // Add timeout to prevent hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(`/api/relatedproducts/${productId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          // Log the response for debugging
          const errorText = await response.text();
          console.error("API Error Response:", errorText);
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Handle the case where API returns error but with 200 status
        if (data.error) {
          console.warn("API returned error:", data.error);
          setRelatedProducts(data.products || []);
          setError(null); // Don't show error if we got some products
        } else {
          setRelatedProducts(data.products || []);
        }
      } catch (err) {
        console.error("Error fetching related products:", err);

        // Set specific error messages based on error type
        if (err instanceof Error) {
          if (err.name === "AbortError") {
            setError("Request timeout - please try again");
          } else if (err.message.includes("Failed to fetch")) {
            setError("Network error - check your connection");
          } else {
            setError(err.message);
          }
        } else {
          setError("Failed to load related products");
        }

        // Always ensure we have an empty array on error
        setRelatedProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRelatedProducts();
  }, [productId, category, subcategory]);

  // Always render the container - matches Flutter behavior
  return (
    <div className={`w-full shadow-sm border-b ${
      isDarkMode 
        ? "bg-gray-800 border-gray-700" 
        : "bg-white border-gray-100"
    }`}>
      <div className="p-4">
  {/* Header - always show */}
  <h3 className={`text-lg font-semibold mb-1 ${  // <- Add mb-1, mb-2, mb-3, etc. here
    isDarkMode ? "text-white" : "text-gray-900"
  }`}>
    Related Products
  </h3>

        {/* Products horizontal scroll with navigation - FIXED HEIGHT */}
        <div className="relative group">
          {/* Left scroll button */}
          {canScrollLeft && (
            <button
              onClick={scrollLeft}
              className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 shadow-lg rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400"
                  : "bg-white text-gray-600 hover:text-orange-600"
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Right scroll button */}
          {canScrollRight && (
            <button
              onClick={scrollRight}
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 shadow-lg rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400"
                  : "bg-white text-gray-600 hover:text-orange-600"
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* Products container with FIXED HEIGHT - no vertical scrolling */}
          <div 
            className="overflow-hidden"
            style={{ 
              height: `${listViewHeight}px`, // Fixed height based on calculated dimensions
              minHeight: `${listViewHeight}px`, // Ensure minimum height
              maxHeight: `${listViewHeight}px` // Prevent expansion
            }}
          >
            {isLoading || loading ? (
              // Show loading skeleton
              <LoadingSkeleton
                listViewHeight={listViewHeight}
                cardWidth={cardWidth}
                isDarkMode={isDarkMode}
              />
            ) : relatedProducts.length > 0 ? (
              // Show actual products with proper spacing and consistent gaps
              <div 
                ref={scrollContainerRef}
                className="flex gap-1 overflow-x-auto h-full scroll-smooth"
                style={{
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  paddingBottom: "0", // Remove bottom padding to prevent vertical scroll
                }}
              >
                {/* Hide scrollbar for webkit browsers */}
                <style jsx>{`
                  div::-webkit-scrollbar {
                    display: none;
                  }
                `}</style>
                
                {relatedProducts.map((product, index) => (
                  <div
                    key={`${product.id}-${index}`}
                    className="flex-shrink-0"
                    style={{ 
                      width: `${cardWidth}px`, // Increased width (200px instead of 180px)
                      minWidth: `${cardWidth}px`, // Prevent shrinking
                      height: "fit-content", // Let the card determine its own height
                    }}
                  >
                    <ProductCard
                      product={product}
                      scaleFactor={scaleFactor}
                      internalScaleFactor={internalScaleFactor}
                      showCartIcon={true}
                      showExtraLabels={false}
                      
                      onFavoriteToggle={(productId) => {
                        console.log("Toggle favorite for:", productId);
                        // Implement favorite toggle logic
                      }}
                      onAddToCart={(productId) => {
                        console.log("Add to cart:", productId);
                        // Implement add to cart logic
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : error ? (
              // Show error state but keep container
              <div className="flex items-center justify-center h-full">
                <div className={`text-center ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}>
                  <p className="text-sm">{error}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className={`mt-2 text-sm underline transition-colors ${
                      isDarkMode 
                        ? "text-blue-400 hover:text-blue-300" 
                        : "text-blue-500 hover:text-blue-600"
                    }`}
                  >
                    Try again
                  </button>
                </div>
              </div>
            ) : (
              // Show shimmer when no products (matches Flutter behavior)
              <LoadingSkeleton
                listViewHeight={listViewHeight}
                cardWidth={cardWidth}
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