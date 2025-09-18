// src/components/productdetail/ProductCollectionWidget.tsx

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";

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
  localization?: ReturnType<typeof useTranslations>;
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
      className={`group flex min-w-72 w-72 h-28 border rounded-2xl md:rounded-2xl rounded-lg overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-[1.02] ${
        isDarkMode 
          ? "bg-gradient-to-br from-gray-800 to-gray-850 border-gray-700 hover:border-orange-500" 
          : "bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:border-orange-300"
      }`}
      onClick={() => onProductClick(product.id)}
    >
      {/* Product image */}
      <div className={`w-28 h-28 flex-shrink-0 relative ${
        isDarkMode ? "bg-gray-800" : "bg-gray-100"
      }`}>
        {product.imageUrls.length > 0 && !imageError ? (
          <Image
            src={product.imageUrls[0]}
            alt={product.productName}
            fill
            className="object-cover group-hover:scale-110 transition-transform duration-300"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center ${
            isDarkMode ? "bg-gray-800" : "bg-gray-100"
          }`}>
            <Package className={`w-8 h-8 md:w-8 md:h-8 w-6 h-6 ${
              isDarkMode ? "text-gray-600" : "text-gray-400"
            }`} />
          </div>
        )}
        
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Product details */}
      <div className="flex-1 p-4 md:p-4 p-3 flex flex-col justify-center min-w-0">
        <h4 className={`text-sm md:text-sm text-xs font-semibold line-clamp-2 mb-2 md:mb-2 mb-1 leading-tight transition-colors ${
          isDarkMode ? "text-white group-hover:text-orange-400" : "text-gray-900 group-hover:text-orange-600"
        }`}>
          {product.productName}
        </h4>
        <p className={`text-base md:text-base text-sm font-bold ${
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
  <div className={`rounded-2xl md:rounded-2xl rounded-none p-6 md:p-6 px-0 py-4 border md:border border-0 shadow-sm md:shadow-sm shadow-none ${
    isDarkMode 
      ? "bg-gray-800 border-gray-700" 
      : "bg-white border-gray-200"
  }`}>
    <div className="space-y-6 md:space-y-6 space-y-4">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3 md:gap-3 gap-2">
          <div className={`w-10 h-10 md:w-10 md:h-10 w-8 h-8 rounded-xl animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`} />
          <div className={`w-40 md:w-40 w-32 h-6 md:h-6 h-5 rounded animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`} />
        </div>
        <div className={`w-16 md:w-16 w-12 h-4 rounded animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`} />
      </div>

      {/* Products list skeleton */}
      <div className="flex gap-4 md:gap-4 gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={`min-w-72 w-72 h-28 rounded-2xl md:rounded-2xl rounded-lg animate-pulse ${
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
  localization,
}) => {
  const router = useRouter();
  const [collectionData, setCollectionData] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ✅ FIXED: Proper nested translation function that uses JSON files
  const t = useCallback((key: string) => {
    if (!localization) {
      return key;
    }

    try {
      // Try to get the nested ProductCollectionWidget translation
      const translation = localization(`ProductCollectionWidget.${key}`);
      
      // Check if we got a valid translation (not the same as the key we requested)
      if (translation && translation !== `ProductCollectionWidget.${key}`) {
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

  const checkScrollPosition = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  const scrollLeft = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -300, behavior: "smooth" });
    }
  }, []);

  const scrollRight = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 300, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      checkScrollPosition();
      container.addEventListener("scroll", checkScrollPosition);
      return () => container.removeEventListener("scroll", checkScrollPosition);
    }
  }, [collectionData, checkScrollPosition]);

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
          throw new Error(t("failedToFetchCollection"));
        }

        const data = await response.json();
        setCollectionData(data);
      } catch (err) {
        console.error("Error fetching product collection:", err);
        setError(err instanceof Error ? err.message : t("failedToLoadCollection"));
      } finally {
        setLoading(false);
      }
    };

    fetchProductCollection();
  }, [productId, shopId, t]);

  const handleProductClick = useCallback((clickedProductId: string) => {
    router.push(`/productdetail/${clickedProductId}`);
  }, [router]);

  const handleViewAll = useCallback(() => {
    if (collectionData && shopId) {
      sessionStorage.setItem('collectionShopId', shopId);
      sessionStorage.setItem('collectionName', collectionData.name);
      router.push(`/collections/${collectionData.id}`);
    }
  }, [collectionData, shopId, router]);

  if (isLoading || loading) {
    return <LoadingSkeleton isDarkMode={isDarkMode} />;
  }

  if (error || !collectionData || collectionData.products.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-2xl md:rounded-2xl rounded-none p-6 md:p-6 p-4 border md:border border-0 shadow-sm md:shadow-sm shadow-none ${
      isDarkMode 
        ? "bg-gray-800 border-gray-700" 
        : "bg-white border-gray-200"
    }`}>
      <div className="space-y-6 md:space-y-6 space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3 md:gap-3 gap-2">
            <div className={`p-2 md:p-2 p-1.5 rounded-xl ${
              isDarkMode 
                ? "bg-orange-900/20 text-orange-400" 
                : "bg-orange-100 text-orange-600"
            }`}>
              <Package className="w-5 h-5 md:w-5 md:h-5 w-4 h-4" />
            </div>
            <div>
              <h3 className={`text-xl md:text-xl text-lg font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}>
                {t("title")}
              </h3>
              <p className={`text-sm md:text-sm text-xs ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}>
                {collectionData.name}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleViewAll}
            className={`flex items-center gap-2 md:gap-2 gap-1.5 px-4 md:px-4 px-3 py-2 md:py-2 py-1.5 rounded-xl font-semibold text-sm md:text-sm text-xs transition-all duration-200 hover:scale-105 ${
              isDarkMode
                ? "bg-orange-900/20 text-orange-400 hover:bg-orange-900/30 border border-orange-700"
                : "bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200"
            }`}
          >
            {t("viewAll")}
            <ChevronRight className="w-4 h-4 md:w-4 md:h-4 w-3 h-3" />
          </button>
        </div>

        {/* Products horizontal scroll with navigation */}
        <div className="relative group">
          {/* Left scroll button */}
          {canScrollLeft && (
            <button
              onClick={scrollLeft}
              className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 md:w-10 md:h-10 w-8 h-8 shadow-xl rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400 border border-gray-600"
                  : "bg-white text-gray-600 hover:text-orange-600 border border-gray-200"
              }`}
            >
              <ChevronLeft className="w-5 h-5 md:w-5 md:h-5 w-4 h-4" />
            </button>
          )}

          {/* Right scroll button */}
          {canScrollRight && (
            <button
              onClick={scrollRight}
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 md:w-10 md:h-10 w-8 h-8 shadow-xl rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400 border border-gray-600"
                  : "bg-white text-gray-600 hover:text-orange-600 border border-gray-200"
              }`}
            >
              <ChevronRight className="w-5 h-5 md:w-5 md:h-5 w-4 h-4" />
            </button>
          )}

          {/* Scrollable container */}
          <div
            ref={scrollContainerRef}
            className="flex gap-4 md:gap-4 gap-3 overflow-x-auto scrollbar-hide pb-2 scroll-smooth [&::-webkit-scrollbar]:hidden"
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