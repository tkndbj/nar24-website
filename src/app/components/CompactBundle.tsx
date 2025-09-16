"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs, doc, getDoc, type Firestore, type DocumentSnapshot, type DocumentData } from "firebase/firestore";

interface BundleItem {
  productId: string;
  productName: string;
  originalPrice: number;
  bundlePrice: number;
  imageUrl?: string;
  currency: string;
  discountPercentage?: number;
}

interface Bundle {
  id: string;
  shopId: string;
  mainProductId: string;
  bundleItems: BundleItem[];
  isActive: boolean;
}

interface Product {
  id: string;
  productName: string;
  price: number;
  currency: string;
  imageUrls: string[];
  colorImages?: Record<string, string[]>;
  averageRating?: number;
  [key: string]: unknown;
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

interface CompactBundleWidgetProps {
  productId: string;
  shopId?: string;
  isDarkMode?: boolean;
  localization?: (key: string) => string;
  db: Firestore;
}

// Static cache for performance optimization
const globalCache = new Map<string, Promise<BundleData[]>>();
const cacheTimestamps = new Map<string, Date>();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

export const CompactBundleWidget: React.FC<CompactBundleWidgetProps> = ({ 
  productId, 
  shopId, 
  isDarkMode = false,
  localization = (key: string) => key,
  db
}) => {
  const router = useRouter();
  const [bundleData, setBundleData] = useState<BundleData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoized cache key
  const cacheKey = useMemo(
    () => `${productId}_${shopId || 'null'}`,
    [productId, shopId]
  );

  // Bundle from JSON converter
  const bundleFromDocument = useCallback((doc: DocumentSnapshot<DocumentData>): Bundle => {
    const data = doc.data();
    if (!data) {
      throw new Error(`Bundle document ${doc.id} has no data`);
    }
    return {
      id: doc.id,
      shopId: data.shopId || "",
      mainProductId: data.mainProductId || "",
      bundleItems: data.bundleItems || [],
      isActive: data.isActive || false,
    };
  }, []);

  // Product from document converter  
  const productFromDocument = useCallback((doc: DocumentSnapshot<DocumentData>): Product => {
    const data = doc.data();
    if (!data) {
      throw new Error(`Product document ${doc.id} has no data`);
    }
    return {
      id: doc.id,
      productName: data.productName || "",
      price: data.price || 0,
      currency: data.currency || "TL",
      imageUrls: data.imageUrls || [],
      colorImages: data.colorImages || {},
      averageRating: data.averageRating || 0,
      ...data,
    };
  }, []);

  // Process bundle item
  const processBundleItem = useCallback(
    async (
      bundleItem: BundleItem,
      bundleId: string,
      isMainProduct: boolean
    ): Promise<BundleData | null> => {
      try {
        const productDoc = await getDoc(doc(db, "shop_products", bundleItem.productId));

        if (productDoc.exists()) {
          const product = productFromDocument(productDoc);

          return {
            bundleId,
            product,
            bundlePrice: bundleItem.bundlePrice,
            originalPrice: bundleItem.originalPrice,
            discountPercentage: bundleItem.discountPercentage || 
              Math.round(((bundleItem.originalPrice - bundleItem.bundlePrice) / bundleItem.originalPrice) * 100),
            currency: bundleItem.currency,
            isMainProduct,
          };
        }
      } catch (error) {
        console.error(`Error processing bundle item ${bundleItem.productId}:`, error);
      }
      return null;
    },
    [db, productFromDocument]
  );

  // Process main product
  const processMainProduct = useCallback(
    async (bundle: Bundle, matchingItem: BundleItem): Promise<BundleData | null> => {
      try {
        const mainProductDoc = await getDoc(doc(db, "shop_products", bundle.mainProductId));

        if (mainProductDoc.exists()) {
          const mainProduct = productFromDocument(mainProductDoc);

          return {
            bundleId: bundle.id,
            product: mainProduct,
            bundlePrice: matchingItem.bundlePrice,
            originalPrice: matchingItem.originalPrice,
            discountPercentage: matchingItem.discountPercentage || 
              Math.round(((matchingItem.originalPrice - matchingItem.bundlePrice) / matchingItem.originalPrice) * 100),
            currency: matchingItem.currency,
            isMainProduct: true,
          };
        }
      } catch (error) {
        console.error(`Error processing main product ${bundle.mainProductId}:`, error);
      }
      return null;
    },
    [db, productFromDocument]
  );

  // Fetch bundle data with caching
  const fetchProductBundles = useCallback(async (): Promise<BundleData[]> => {
    // Check global cache first
    if (globalCache.has(cacheKey)) {
      const timestamp = cacheTimestamps.get(cacheKey);
      if (timestamp && Date.now() - timestamp.getTime() < CACHE_EXPIRY) {
        return globalCache.get(cacheKey)!;
      } else {
        globalCache.delete(cacheKey);
        cacheTimestamps.delete(cacheKey);
      }
    }

    // Create and cache new promise
    const promise = performBundleFetch();
    globalCache.set(cacheKey, promise);
    cacheTimestamps.set(cacheKey, new Date());

    return promise;
  }, [cacheKey]);

  // Perform bundle fetch - matching Flutter implementation
  const performBundleFetch = useCallback(async (): Promise<BundleData[]> => {
    try {
      if (!shopId?.trim()) {
        return [];
      }

      const bundleDataList: BundleData[] = [];

      // Batch both queries for better performance
      const [mainProductBundles, allBundles] = await Promise.all([
        // Main product bundles
        getDocs(
          query(
            collection(db, "bundles"),
            where("shopId", "==", shopId),
            where("mainProductId", "==", productId),
            where("isActive", "==", true)
          )
        ),
        // All shop bundles (for complementary products)
        getDocs(
          query(
            collection(db, "bundles"),
            where("shopId", "==", shopId),
            where("isActive", "==", true)
          )
        ),
      ]);

      // Process main product bundles
      const productPromises: Promise<void>[] = [];

      for (const bundleDoc of mainProductBundles.docs) {
        const bundle = bundleFromDocument(bundleDoc);

        for (const bundleItem of bundle.bundleItems) {
          productPromises.push(
            (async () => {
              const bundleData = await processBundleItem(bundleItem, bundle.id, false);
              if (bundleData) {
                bundleDataList.push(bundleData);
              }
            })()
          );
        }
      }

      // Process complementary product bundles
      for (const bundleDoc of allBundles.docs) {
        const bundle = bundleFromDocument(bundleDoc);

        const matchingItem = bundle.bundleItems.find(
          item => item.productId === productId
        );

        if (matchingItem) {
          productPromises.push(
            (async () => {
              const bundleData = await processMainProduct(bundle, matchingItem);
              if (bundleData) {
                bundleDataList.push(bundleData);
              }
            })()
          );
        }
      }

      // Wait for all product fetches to complete
      await Promise.all(productPromises);

      // Remove duplicates and limit results
      const seen = new Set<string>();
      return bundleDataList
        .filter(bundle => seen.add(bundle.product.id))
        .slice(0, 5); // Limit to prevent UI overflow
    } catch (error) {
      console.error("Error fetching product bundles:", error);
      return [];
    }
  }, [shopId, productId, db, bundleFromDocument, processBundleItem, processMainProduct]);

  // Load bundles effect
  useEffect(() => {
    let isMounted = true;

    const loadBundles = async () => {
      if (!productId || !shopId) return;

      setIsLoading(true);
      setError(null);

      try {
        const bundles = await fetchProductBundles();
        
        if (isMounted) {
          setBundleData(bundles);
        }
      } catch (err) {
        if (isMounted) {
          setError("Failed to load bundles");
          console.error("Error loading bundles:", err);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadBundles();

    return () => {
      isMounted = false;
    };
  }, [productId, shopId, fetchProductBundles]);

  // Navigation handler
  const handleNavigateToProduct = useCallback((product: Product) => {
    try {
      if (!product.id?.trim()) {
        console.error("Cannot navigate to product with empty ID");
        return;
      }

      router.push(`/products/${product.id}`);
    } catch (error) {
      console.error("Error navigating to bundled product:", error);
    }
  }, [router]);

  // Cleanup cache on unmount
  useEffect(() => {
    return () => {
      const currentTime = new Date();
      const keysToRemove: string[] = [];

      cacheTimestamps.forEach((timestamp, key) => {
        if (currentTime.getTime() - timestamp.getTime() > CACHE_EXPIRY) {
          keysToRemove.push(key);
        }
      });

      keysToRemove.forEach(key => {
        globalCache.delete(key);
        cacheTimestamps.delete(key);
      });
    };
  }, []);

  // Don't render if no data, loading, or error
  if (isLoading || error || bundleData.length === 0) {
    return null;
  }

  return (
    <div
      className={`
        mt-2 p-3 rounded-xl border transition-all duration-200
        ${isDarkMode 
          ? "bg-gray-800 border-orange-500/20" 
          : "bg-gray-50 border-orange-500/20"
        }
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-1.5">
          <div className="p-1 rounded-md bg-gradient-to-r from-orange-500 to-orange-600">
            <Sparkles 
              size={12} 
              className="text-white" 
            />
          </div>
          <span 
            className={`
              text-xs font-semibold
              ${isDarkMode ? "text-white" : "text-gray-900"}
            `}
          >
            {localization("buyTogetherAndSave")}
          </span>
        </div>
        <span 
          className={`
            text-xs font-medium
            ${isDarkMode ? "text-gray-300" : "text-gray-600"}
          `}
        >
          +{bundleData.length}
        </span>
      </div>

      {/* Bundle Products List */}
      <div className="flex space-x-2 overflow-x-auto pb-1">
        {bundleData.map((bundle, index) => (
          <CompactBundleProductCard
            key={`${bundle.product.id}-${index}`}
            bundleData={bundle}
            isDarkMode={isDarkMode}
            localization={localization}
            onNavigate={() => handleNavigateToProduct(bundle.product)}
          />
        ))}
      </div>
    </div>
  );
};

// Compact Bundle Product Card Component - matching Flutter implementation
interface CompactBundleProductCardProps {
  bundleData: BundleData;
  isDarkMode: boolean;
  localization: (key: string) => string;
  onNavigate: () => void;
}

const CompactBundleProductCard: React.FC<CompactBundleProductCardProps> = ({
  bundleData,
  isDarkMode,
  localization,
  onNavigate,
}) => {
  const { product, bundlePrice, originalPrice, discountPercentage, currency } = bundleData;
  const savings = originalPrice - bundlePrice;

  return (
    <div
      onClick={onNavigate}
      className={`
        flex-shrink-0 w-44 h-15 rounded-lg border cursor-pointer
        transition-all duration-200 hover:scale-[1.02] hover:shadow-md
        ${isDarkMode 
          ? "bg-gradient-to-br from-gray-700 to-gray-800 border-orange-500/30" 
          : "bg-gradient-to-br from-white to-gray-50 border-orange-500/30"
        }
      `}
    >
      <div className="flex h-full">
        {/* Product Image */}
        <div className="relative w-15 h-15 flex-shrink-0">
          <div className="w-full h-full rounded-l-lg overflow-hidden">
            {product.imageUrls.length > 0 ? (
              <img
                src={product.imageUrls[0]}
                alt={product.productName}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.src = "/placeholder-product.png"; // fallback image
                }}
              />
            ) : (
              <div 
                className={`
                  w-full h-full flex items-center justify-center
                  ${isDarkMode ? "bg-gray-600" : "bg-gray-200"}
                `}
              >
                <div className="w-4 h-4 bg-gray-400 rounded" />
              </div>
            )}
          </div>

          {/* Discount Badge */}
          <div className="absolute top-0.5 left-0.5">
            <div className="px-1 py-0.5 bg-gradient-to-r from-green-500 to-green-600 rounded text-white">
              <span className="text-[8px] font-bold">
                -{discountPercentage.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* Product Details */}
        <div className="flex-1 p-2 flex flex-col justify-center min-w-0">
          {/* Product Name */}
          <h4 
            className={`
              text-[10px] font-semibold leading-tight mb-0.5 line-clamp-2
              ${isDarkMode ? "text-white" : "text-gray-900"}
            `}
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {product.productName}
          </h4>

          {/* Pricing Row */}
          <div className="flex items-center space-x-1 mb-0.5">
            {/* Bundle Price */}
            <span className="text-[10px] font-bold text-orange-500">
              {bundlePrice.toFixed(0)} {currency}
            </span>
            
            {/* Original Price */}
            <span 
              className={`
                text-[8px] line-through
                ${isDarkMode ? "text-gray-400" : "text-gray-500"}
              `}
            >
              {originalPrice.toFixed(0)}
            </span>
          </div>

          {/* Savings */}
          <div className="text-[8px] font-semibold text-green-500">
            {localization("save")} {savings.toFixed(0)} {currency}
          </div>
        </div>
      </div>
    </div>
  );
};