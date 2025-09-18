// src/app/components/BundleComponent.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Sparkles, ShoppingBag, Package } from 'lucide-react';
import { Product } from '@/app/models/Product';

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
}

const BundleComponent: React.FC<BundleComponentProps> = ({
  productId,
  shopId,
  isDarkMode = false,
}) => {
  const router = useRouter();
  const [bundles, setBundles] = useState<BundleData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError(err instanceof Error ? err.message : 'Failed to load bundles');
      } finally {
        setIsLoading(false);
      }
    };

    loadBundles();
  }, [fetchProductBundles]);

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
      <div className={`rounded-2xl p-6 border shadow-sm ${
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
    <div className={`rounded-2xl p-6 border shadow-sm ${
      isDarkMode 
        ? "bg-gray-800 border-gray-700" 
        : "bg-white border-gray-200"
    }`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className={`text-xl font-bold ${
              isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              Bundle Deals
            </h3>
            <p className={`text-sm ${
              isDarkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Save more when you buy together
            </p>
          </div>
          
          <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${
            isDarkMode ? "bg-green-900/20 text-green-400 border border-green-800" : "bg-green-50 text-green-700 border border-green-200"
          }`}>
            <ShoppingBag className="w-3 h-3" />
            <span className="text-xs font-medium">Special Offer</span>
          </div>
        </div>

        {/* Bundle Products List */}
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {bundles.map((bundleData) => (
            <BundleProductCard
              key={`${bundleData.bundleId}-${bundleData.product.id}`}
              bundleData={bundleData}
              onClick={() => navigateToProduct(bundleData.product)}
              isDarkMode={isDarkMode}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface BundleProductCardProps {
  bundleData: BundleData;
  onClick: () => void;
  isDarkMode: boolean;
}

const BundleProductCard: React.FC<BundleProductCardProps> = ({
  bundleData,
  onClick,
  isDarkMode,
}) => {
  const { product, bundlePrice, originalPrice, discountPercentage, currency, isMainProduct } = bundleData;
  const savings = originalPrice - bundlePrice;
  const [imageError, setImageError] = useState(false);

  return (
    <div
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${
        isDarkMode
          ? 'bg-gradient-to-br from-gray-700 to-gray-800 border-gray-600 hover:border-orange-500'
          : 'bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:border-orange-300'
      }`}
    >
      <div className="flex p-4">
        {/* Product Image */}
        <div className="relative w-24 h-24 flex-shrink-0">
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
                <Package className={`w-8 h-8 ${
                  isDarkMode ? 'text-gray-500' : 'text-gray-400'
                }`} />
              </div>
            )}
          </div>

          {/* Discount Badge */}
          <div className="absolute -top-2 -right-2 px-2 py-1 bg-gradient-to-r from-green-600 to-green-700 rounded-lg shadow-lg">
            <span className="text-xs font-bold text-white">
              -{discountPercentage.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Product Details */}
        <div className="flex-1 ml-4 flex flex-col justify-center">
          {/* Product Type Badge */}
          <div className="flex items-center gap-2 mb-2">
            {isMainProduct && (
              <div className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                isDarkMode 
                  ? "bg-orange-900/20 text-orange-400" 
                  : "bg-orange-100 text-orange-600"
              }`}>
                MAIN
              </div>
            )}
            <div className={`px-2 py-0.5 rounded-md text-xs font-medium ${
              isDarkMode 
                ? "bg-blue-900/20 text-blue-400" 
                : "bg-blue-100 text-blue-600"
            }`}>
              Bundle Item
            </div>
          </div>

          {/* Product Name */}
          <h4 className={`text-sm font-semibold mb-2 line-clamp-2 leading-tight group-hover:text-orange-500 transition-colors ${
            isDarkMode ? 'text-white' : 'text-gray-900'
          }`}>
            {product.productName}
          </h4>

          {/* Pricing */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-orange-500">
                {bundlePrice.toFixed(2)} {currency}
              </span>
              <span className={`text-sm line-through ${
                isDarkMode ? 'text-gray-400' : 'text-gray-500'
              }`}>
                {originalPrice.toFixed(2)}
              </span>
            </div>

            <div className="text-sm font-semibold text-green-600">
              You Save {savings.toFixed(2)} {currency}
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

export default BundleComponent;