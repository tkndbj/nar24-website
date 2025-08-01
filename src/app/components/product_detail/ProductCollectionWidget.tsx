// src/components/productdetail/ProductCollectionWidget.tsx

import React, { useState, useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import Image from "next/image";

interface Product {
  id: string;
  productName: string;
  price: number;
  currency: string;
  imageUrls: string[];
}

interface CollectionData {
  id: string;
  name: string;
  imageUrl?: string;
  products: Product[];
}

interface ProductCollectionWidgetProps {
  productId: string;
  shopId?: string;
  isLoading?: boolean;
  isDarkMode?: boolean;
}

interface CollectionProductCardProps {
  product: Product;
  onProductClick: (productId: string) => void;
  isDarkMode?: boolean;
}

const CollectionProductCard: React.FC<CollectionProductCardProps> = ({
  product,
  onProductClick,
  isDarkMode = false,
}) => {
  const [imageError, setImageError] = useState(false);

  return (
    <div
      className={`flex min-w-64 w-64 h-24 border rounded-xl overflow-hidden cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200 ${
        isDarkMode 
          ? "bg-gray-700 border-gray-600" 
          : "bg-white border-gray-200"
      }`}
      onClick={() => onProductClick(product.id)}
    >
      {/* Product image */}
      <div className={`w-24 h-24 flex-shrink-0 relative ${
        isDarkMode ? "bg-gray-800" : "bg-gray-100"
      }`}>
        {product.imageUrls.length > 0 && !imageError ? (
          <Image
            src={product.imageUrls[0]}
            alt={product.productName}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${
            isDarkMode ? "bg-gray-800" : "bg-gray-100"
          }`}>
            <div className={`w-6 h-6 rounded ${
              isDarkMode ? "bg-gray-600" : "bg-gray-300"
            }`} />
          </div>
        )}
      </div>

      {/* Product details */}
      <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
        <h4 className={`text-sm font-medium line-clamp-2 mb-2 leading-tight ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}>
          {product.productName}
        </h4>
        <p className={`text-sm font-bold ${
          isDarkMode ? "text-orange-400" : "text-orange-600"
        }`}>
          {product.price} {product.currency}
        </p>
      </div>
    </div>
  );
};

const LoadingSkeleton: React.FC<{ isDarkMode?: boolean }> = ({ 
  isDarkMode = false 
}) => (
  <div className={`w-full shadow-sm border-b ${
    isDarkMode 
      ? "bg-gray-800 border-gray-700" 
      : "bg-white border-gray-100"
  }`}>
    <div className="p-4 space-y-4">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className={`w-40 h-5 rounded animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`} />
        <div className={`w-16 h-4 rounded animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`} />
      </div>

      {/* Products list skeleton */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={`min-w-64 w-64 h-24 rounded-xl animate-pulse ${
              isDarkMode ? "bg-gray-700" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  </div>
);

const ProductCollectionWidget: React.FC<ProductCollectionWidgetProps> = ({
  productId,
  shopId,
  isLoading = false,
  isDarkMode = false,
}) => {
  const [collectionData, setCollectionData] = useState<CollectionData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
      scrollContainerRef.current.scrollBy({ left: -280, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 280, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      checkScrollPosition();
      container.addEventListener("scroll", checkScrollPosition);
      return () => container.removeEventListener("scroll", checkScrollPosition);
    }
  }, [collectionData]);

  useEffect(() => {
    const fetchProductCollection = async () => {
      if (!shopId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/collections/by-product`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            productId,
            shopId,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch collection");
        }

        const data = await response.json();
        setCollectionData(data);
      } catch (err) {
        console.error("Error fetching product collection:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load collection"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchProductCollection();
  }, [productId, shopId]);

  const handleProductClick = (clickedProductId: string) => {
    window.location.href = `/productdetail/${clickedProductId}`;
  };

  const handleViewAll = () => {
    if (collectionData && shopId) {
      window.location.href = `/collection/${collectionData.id}?shopId=${shopId}`;
    }
  };

  if (isLoading || loading) {
    return <LoadingSkeleton isDarkMode={isDarkMode} />;
  }

  if (error || !collectionData || collectionData.products.length === 0) {
    return null;
  }

  return (
    <div className={`w-full shadow-sm border-b ${
      isDarkMode 
        ? "bg-gray-800 border-gray-700" 
        : "bg-white border-gray-100"
    }`}>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h3 className={`text-lg font-bold ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}>
            See from this Collection
          </h3>
          <button
            onClick={handleViewAll}
            className={`flex items-center gap-1 text-sm font-bold transition-colors ${
              isDarkMode
                ? "text-orange-400 hover:text-orange-300"
                : "text-orange-600 hover:text-orange-700"
            }`}
          >
            View All
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Products horizontal scroll with navigation */}
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
              <ChevronRight className="w-5 h-5 rotate-180" />
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

          {/* Scrollable container */}
          <div
            ref={scrollContainerRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 scroll-smooth [&::-webkit-scrollbar]:hidden"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {collectionData.products.map((product) => (
              <CollectionProductCard
                key={product.id}
                product={product}
                onProductClick={handleProductClick}
                isDarkMode={isDarkMode}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCollectionWidget;