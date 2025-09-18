// src/app/components/BundleComponent.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Sparkles, ShoppingBag, Package } from 'lucide-react';
import { Product } from '@/app/models/Product';
import { useTranslations } from 'next-intl';

interface BundleItem {
  productId: string;
  productName: string;
  originalPrice: number;
  bundlePrice: number;
  discountPercentage: number;
  imageUrl?: string;
  currency: string;
}

interface Bundle {
  id: string;
  mainProductId: string;
  bundleItems: BundleItem[];
  isActive: boolean;
  shopId: string;
}

interface BundleData {
  bundleId: string;
  product: Product;
  bundlePrice: number;
  originalPrice: number;
  discountPercentage: number;
  currency: string;
  isMainProduct: boolean;
}

interface BundleComponentProps {
  productId: string;
  shopId?: string;
  isDarkMode?: boolean;
  localization?: ReturnType<typeof useTranslations>;
}

interface BundleProductCardProps {
  bundleData: BundleData;
  onClick: () => void;
  isDarkMode: boolean;
  t: (key: string) => string;
}

const BundleProductCard: React.FC<BundleProductCardProps> = ({
  bundleData,
  onClick,
  isDarkMode,
  t,
}) => {
  const { product, bundlePrice, originalPrice, discountPercentage, currency, isMainProduct } = bundleData;
  const savings = originalPrice - bundlePrice;
  const [imageError, setImageError] = useState(false);

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl sm:rounded-none border cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${
        isDarkMode
          ? 'bg-gradient-to-br from-gray-700 to-gray-800 border-gray-600 hover:border-orange-500'
          : 'bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:border-orange-300'
      }`}
    >
      <div className="flex p-3 sm:p-4">
        {/* Product Image */}
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0">
          <div className="w-full h-full rounded-xl overflow-hidden bg-gray-100">
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
                isDarkMode ? 'bg-gray-600' : 'bg-gray-200'
              }`}>
                <Package className={`w-6 h-6 sm:w-8 sm:h-8 ${
                  isDarkMode ? 'text-gray-500' : 'text-gray-400'
                }`} />
              </div>
            )}
          </div>

          {/* Discount Badge */}
          <div className="absolute -top-2 -right-2 px-1.5 py-0.5 sm:px-2 sm:py-1 bg-gradient-to-r from-green-600 to-green-700 rounded-lg shadow-lg">
            <span className="text-xs font-bold text-white">
              -{discountPercentage.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Product Details */}
        <div className="flex-1 ml-3 sm:ml-4 flex flex-col justify-center">
          {/* Product Type Badge */}
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            {isMainProduct && (
              <div className={`px-1.5 py-0.5 sm:px-2 rounded-md text-xs font-semibold ${
                isDarkMode 
                  ? "bg-orange-900/20 text-orange-400" 
                  : "bg-orange-100 text-orange-600"
              }`}>
                {t("main")}
              </div>
            )}
            <div className={`px-1.5 py-0.5 sm:px-2 rounded-md text-xs font-medium ${
              isDarkMode 
                ? "bg-blue-900/20 text-blue-400" 
                : "bg-blue-100 text-blue-600"
            }`}>
              {t("bundleItem")}
            </div>
          </div>

          {/* Product Name */}
          <h4 className={`text-sm sm:text-sm font-semibold mb-1.5 sm:mb-2 line-clamp-2 leading-tight group-hover:text-orange-500 transition-colors ${
            isDarkMode ? 'text-white' : 'text-gray-900'
          }`}>
            {product.productName}
          </h4>

          {/* Pricing */}
          <div className="space-y-0.5 sm:space-y-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-base sm:text-lg font-bold text-orange-500">
                {bundlePrice.toFixed(2)} {currency}
              </span>
              <span className={`text-xs sm:text-sm line-through ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}>
                {originalPrice.toFixed(2)}
              </span>
            </div>

            <div className="text-xs sm:text-sm font-semibold text-green-600">
              {t("youSave")} {savings.toFixed(2)} {currency}
            </div>
          </div>
        </div>
      </div>

      {/* Hover overlay effect */}
      <div className={`absolute inset-0 bg-gradient-to-r from-orange-500/0 to-orange-500/0 group-hover:from-orange-500/5 group-hover:to-orange-500/10 transition-all duration-300 ${
        isDarkMode ? "opacity-50" : ""
      }`} />
    </div>
  );
};

const BundleComponent: React.FC<BundleComponentProps> = ({
  productId,
  shopId,
  isDarkMode = false,
  localization,
}) => {
  const router = useRouter();
  const [bundles, setBundles] = useState<BundleData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ FIXED: Proper nested translation function that uses JSON files
  const t = useCallback((key: string) => {
    if (!localization) {
      return key;
    }

    try {
      // Try to get the nested BundleComponent translation
      const translation = localization(`BundleComponent.${key}`);
      
      // Check if we got a valid translation (not the same as the key we requested)
      if (translation && translation !== `BundleComponent.${key}`) {
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

  const fetchProductBundles = useCallback(async (): Promise<BundleData[]> => {
    try {
      if (!shopId || shopId.trim() === '') {
        return [];
      }

      const bundleDataList: BundleData[] = [];

      const mainProductBundlesResponse = await fetch(
        `/api/bundles?shopId=${shopId}&mainProductId=${productId}&isActive=true`
      );

      if (mainProductBundlesResponse.ok) {
        const mainProductBundles: Bundle[] = await mainProductBundlesResponse.json();

        for (const bundle of mainProductBundles) {
          for (const bundleItem of bundle.bundleItems) {
            try {
              const productResponse = await fetch(`/api/products/${bundleItem.productId}`);
              
              if (productResponse.ok) {
                const product: Product = await productResponse.json();
                
                bundleDataList.push({
                  bundleId: bundle.id,
                  product: product,
                  bundlePrice: bundleItem.bundlePrice,
                  originalPrice: bundleItem.originalPrice,
                  discountPercentage: ((bundleItem.originalPrice - bundleItem.bundlePrice) / bundleItem.originalPrice) * 100,
                  currency: bundleItem.currency,
                  isMainProduct: false,
                });
              }
            } catch (error) {
              console.error(`Error fetching bundled product ${bundleItem.productId}:`, error);
            }
          }
        }
      }

      const allBundlesResponse = await fetch(
        `/api/bundles?shopId=${shopId}&isActive=true`
      );

      if (allBundlesResponse.ok) {
        const allBundles: Bundle[] = await allBundlesResponse.json();

        for (const bundle of allBundles) {
          const matchingItem = bundle.bundleItems.find(
            (item) => item.productId === productId
          );

          if (matchingItem) {
            try {
              const mainProductResponse = await fetch(`/api/products/${bundle.mainProductId}`);

              if (mainProductResponse.ok) {
                const mainProduct: Product = await mainProductResponse.json();
                
                bundleDataList.push({
                  bundleId: bundle.id,
                  product: mainProduct,
                  bundlePrice: matchingItem.bundlePrice,
                  originalPrice: matchingItem.originalPrice,
                  discountPercentage: ((matchingItem.originalPrice - matchingItem.bundlePrice) / matchingItem.originalPrice) * 100,
                  currency: matchingItem.currency,
                  isMainProduct: true,
                });
              }
            } catch (error) {
              console.error(`Error fetching main product ${bundle.mainProductId}:`, error);
            }
          }
        }
      }

      return bundleDataList;
    } catch (error) {
      console.error('Error fetching product bundles:', error);
      return [];
    }
  }, [productId, shopId]);

  useEffect(() => {
    const loadBundles = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const bundleData = await fetchProductBundles();
        setBundles(bundleData);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("failedToLoadBundles"));
      } finally {
        setIsLoading(false);
      }
    };

    loadBundles();
  }, [fetchProductBundles, t]);

  const navigateToProduct = useCallback((product: Product) => {
    try {
      if (!product.id || product.id.trim() === '') {
        console.error('Cannot navigate to product with empty ID');
        return;
      }

      router.push(`/product/${product.id}`);
    } catch (error) {
      console.error('Error navigating to bundled product:', error);
    }
  }, [router]);

  if (isLoading) {
    return (
      <div className={`rounded-2xl sm:rounded-none p-4 sm:p-6 border shadow-sm -mx-4 sm:mx-0 ${
        isDarkMode 
          ? "bg-gray-800 border-gray-700" 
          : "bg-white border-gray-200"
      }`}>
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || bundles.length === 0) {
    return null;
  }

  return (
    <div className={`rounded-none sm:rounded-2xl p-4 sm:p-6 border shadow-sm -mx-4 sm:mx-0 ${
      isDarkMode 
        ? "bg-gray-800 border-gray-700" 
        : "bg-white border-gray-200"
    }`}>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className={`text-lg sm:text-xl font-bold ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              {t("title")}
            </h3>
            <p className={`text-xs sm:text-sm ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              {t("subtitle")}
            </p>
          </div>
          
          <div className={`flex items-center gap-1 px-2 py-1 sm:px-3 rounded-full ${
            isDarkMode ? "bg-green-900/20 text-green-400 border border-green-800" : "bg-green-50 text-green-700 border border-green-200"
          }`}>
            <ShoppingBag className="w-3 h-3" />
            <span className="text-xs font-medium">{t("specialOffer")}</span>
          </div>
        </div>

        {/* Bundle Products List */}
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {bundles.map((bundleData) => (
            <BundleProductCard
              key={`${bundleData.bundleId}-${bundleData.product.id}`}
              bundleData={bundleData}
              onClick={() => navigateToProduct(bundleData.product)}
              isDarkMode={isDarkMode}
              t={t}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default BundleComponent;