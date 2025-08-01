import React, { useState, useEffect } from "react";
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
}> = ({ listViewHeight, cardWidth }) => (
  <div className="flex gap-4 overflow-hidden">
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="flex-shrink-0 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse"
        style={{
          width: `${cardWidth}px`,
          height: `${listViewHeight - 20}px`,
        }}
      >
        <div className="p-3 space-y-3 h-full flex flex-col">
          {/* Image placeholder */}
          <div className="flex-1 bg-gray-300 dark:bg-gray-600 rounded-lg" />

          {/* Text placeholders */}
          <div className="space-y-2">
            <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-full" />
            <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-3/4" />
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/2" />
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
  isDarkMode: _isDarkMode = false, // eslint-disable-line @typescript-eslint/no-unused-vars
}) => {
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calculate responsive dimensions - matches Flutter logic
  const getResponsiveDimensions = () => {
    if (typeof window === "undefined") {
      return { listViewHeight: 320, cardWidth: 160, scaleFactor: 0.85 };
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
    const textSectionHeight = 80 * effectiveScaleFactor * internalScaleFactor;

    // Total card height with padding
    const estimatedCardHeight = actualImageHeight + textSectionHeight + 20;

    // Clamp to reasonable bounds (matches Flutter's clamp)
    const listViewHeight = Math.max(280, Math.min(400, estimatedCardHeight));

    // Card width calculation
    const cardWidth = 160; // Fixed width like Flutter

    return {
      listViewHeight,
      cardWidth,
      scaleFactor: cardScaleFactor,
      internalScaleFactor,
    };
  };

  const { listViewHeight, cardWidth, scaleFactor, internalScaleFactor } =
    getResponsiveDimensions();

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
    <div className="w-full bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700">
      <div className="p-4 space-y-4">
        {/* Header - always show */}
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Related Products
        </h3>

        {/* Products horizontal scroll */}
        <div
          className="overflow-hidden"
          style={{ height: `${listViewHeight}px` }}
        >
          {isLoading || loading ? (
            // Show loading skeleton
            <LoadingSkeleton
              listViewHeight={listViewHeight}
              cardWidth={cardWidth}
            />
          ) : relatedProducts.length > 0 ? (
            // Show actual products
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 h-full">
              {relatedProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{ width: `${cardWidth}px` }}
                >
                  <ProductCard
                    product={product}
                    scaleFactor={scaleFactor}
                    internalScaleFactor={internalScaleFactor}
                    showCartIcon={true}
                    showExtraLabels={false}
                    onTap={() => {
                      window.location.href = `/productdetail/${product.id}`;
                    }}
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
              <div className="text-center text-gray-500 dark:text-gray-400">
                <p className="text-sm">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-2 text-blue-500 hover:text-blue-600 text-sm underline"
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
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProductDetailRelatedProducts;
