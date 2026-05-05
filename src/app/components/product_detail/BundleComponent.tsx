// src/app/components/product_detail/BundleComponent.tsx

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import SmartImage from "@/app/components/SmartImage";
import { Sparkles, Package } from "lucide-react";
import { Product } from "@/app/models/Product";
import { useTranslations } from "next-intl";
import {
  fetchActiveBundlesForShopClient,
  fetchProductByIdClient,
} from "@/lib/product-detail-client";

// ✅ NEW: Match Flutter's Bundle structure
interface BundleProduct {
  productId: string;
  productName: string;
  originalPrice: number;
  imageUrl?: string;
}

interface Bundle {
  id: string;
  shopId: string;
  products: BundleProduct[]; // ✅ Changed from mainProductId + bundleItems
  totalBundlePrice: number;
  totalOriginalPrice: number;
  discountPercentage: number;
  currency: string;
  isActive: boolean;
}

// ✅ NEW: Match Flutter's BundleDisplayData
interface BundleDisplayData {
  bundleId: string;
  product: Product;
  totalBundlePrice: number;
  totalOriginalPrice: number;
  discountPercentage: number;
  currency: string;
  totalProductCount: number;
}

interface BundleComponentProps {
  productId: string;
  shopId?: string;
  localization?: ReturnType<typeof useTranslations>;
  prefetchedData?: BundleDisplayData[] | null;
}

interface BundleProductCardProps {
  bundleData: BundleDisplayData;
  onClick: () => void;
  t: (key: string) => string;
}

const BundleProductCard: React.FC<BundleProductCardProps> = ({
  bundleData,
  onClick,
  t,
}) => {
  const {
    product,
    totalBundlePrice,
    totalOriginalPrice,
    discountPercentage,
    currency,
    totalProductCount,
  } = bundleData;
  const savings = totalOriginalPrice - totalBundlePrice;
  const [imageError, setImageError] = useState(false);

  return (
    <div
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl sm:rounded-xl border cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-xl bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:border-orange-300 dark:from-gray-700 dark:to-gray-800 dark:border-gray-600 dark:hover:border-orange-500"
    >
      <div className="flex p-3 sm:p-4">
        {/* Product Image */}
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0">
          <div className="w-full h-full rounded-xl overflow-hidden bg-gray-100">
            {product.imageUrls.length > 0 && !imageError ? (
              <SmartImage
                source={product.imageUrls[0]}
                size="card"
                alt={product.productName}
                fill
                className="object-cover group-hover:scale-110 transition-transform duration-300"
                onFallbackError={() => setImageError(true)}
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-600"
              >
                <Package
                  className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 dark:text-gray-500"
                />
              </div>
            )}
          </div>

          {/* Discount Badge */}
          <div className="absolute -top-2 -right-2 px-1.5 py-0.5 sm:px-2 sm:py-1 bg-gradient-to-r from-green-600 to-green-700 rounded-lg shadow-lg">
            <span className="text-xs font-bold text-white">
              -{discountPercentage.toFixed(0)}%
            </span>
          </div>

          {/* Bundle product count indicator */}
          <div className="absolute -bottom-1 -left-1 px-1.5 py-0.5 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg shadow-lg flex items-center gap-1">
            <Package className="w-3 h-3 text-white" />
            <span className="text-xs font-bold text-white">{totalProductCount}</span>
          </div>
        </div>

        {/* Product Details */}
        <div className="flex-1 ml-3 sm:ml-4 flex flex-col justify-center">
          {/* Product Name */}
          <h4
            className="text-sm sm:text-sm font-semibold mb-1.5 sm:mb-2 line-clamp-2 leading-tight group-hover:text-orange-500 transition-colors text-gray-900 dark:text-white"
          >
            {product.productName}
          </h4>

          {/* Bundle Price Label */}
          <p
            className="text-xs mb-1 text-gray-500 dark:text-gray-400"
          >
            {t("bundlePrice")}
          </p>

          {/* Pricing */}
          <div className="space-y-0.5 sm:space-y-1">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-base sm:text-lg font-bold text-orange-500">
                {totalBundlePrice.toFixed(2)} {currency}
              </span>
              <span
                className="text-xs sm:text-sm line-through text-gray-500 dark:text-gray-400"
              >
                {totalOriginalPrice.toFixed(2)}
              </span>
            </div>

            <div className="text-xs sm:text-sm font-semibold text-green-600">
              {t("youSave")} {savings.toFixed(2)} {currency}
            </div>
          </div>
        </div>
      </div>

      {/* Hover overlay effect */}
      <div
        className="absolute inset-0 bg-gradient-to-r from-orange-500/0 to-orange-500/0 group-hover:from-orange-500/5 group-hover:to-orange-500/10 transition-all duration-300 dark:opacity-50"
      />
    </div>
  );
};

const BundleComponent: React.FC<BundleComponentProps> = ({
  productId,
  shopId,
  localization,
  prefetchedData,
}) => {
  const router = useRouter();
  const [bundles, setBundles] = useState<BundleDisplayData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const t = useCallback(
    (key: string) => {
      if (!localization) return key;
      try {
        const translation = localization(`BundleComponent.${key}`);
        if (translation && translation !== `BundleComponent.${key}`) {
          return translation;
        }
        const directTranslation = localization(key);
        if (directTranslation && directTranslation !== key) {
          return directTranslation;
        }
        return key;
      } catch {
        return key;
      }
    },
    [localization]
  );

  // ✅ NEW: Direct Firestore client reads — mirrors Flutter's
  // _fetchProductBundles. Step 1 fetches active bundles for the shop.
  // Step 2 fans out per-product reads in parallel for the OTHER products
  // in each bundle the current product participates in.
  const fetchProductBundles = useCallback(async (): Promise<BundleDisplayData[]> => {
    try {
      if (!shopId || shopId.trim() === "") {
        return [];
      }

      const allBundles = (await fetchActiveBundlesForShopClient(
        shopId
      )) as unknown as Bundle[];

      // Pair each "other product" with the bundle it came from so we can
      // build the BundleDisplayData after the parallel fetch resolves.
      type Pending = { bundle: Bundle; otherProductId: string };
      const pending: Pending[] = [];
      for (const bundle of allBundles) {
        const inBundle = bundle.products?.some((bp) => bp.productId === productId);
        if (!inBundle) continue;
        for (const bp of bundle.products) {
          if (bp.productId !== productId) {
            pending.push({ bundle, otherProductId: bp.productId });
          }
        }
      }

      if (pending.length === 0) return [];

      const products = await Promise.all(
        pending.map((p) => fetchProductByIdClient(p.otherProductId))
      );

      const bundleDisplayList: BundleDisplayData[] = [];
      products.forEach((product, i) => {
        if (!product || product.paused === true) return;
        const { bundle } = pending[i];
        bundleDisplayList.push({
          bundleId: bundle.id,
          product,
          totalBundlePrice: bundle.totalBundlePrice,
          totalOriginalPrice: bundle.totalOriginalPrice,
          discountPercentage: bundle.discountPercentage,
          currency: bundle.currency,
          totalProductCount: bundle.products.length,
        });
      });

      return bundleDisplayList;
    } catch (err) {
      console.error("Error fetching product bundles:", err);
      return [];
    }
  }, [productId, shopId]);

  useEffect(() => {
    // ✅ PRIORITY 1: Use prefetched data (INSTANT)
    if (prefetchedData && prefetchedData.length > 0) {
      console.log("✅ Bundles: Using prefetched data");
      setBundles(prefetchedData);
      setIsLoading(false);
      return;
    }

    // ✅ PRIORITY 2: Fetch from API (fallback)
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
  }, [fetchProductBundles, t, prefetchedData]);

  const navigateToProduct = useCallback(
    (product: Product) => {
      try {
        if (!product.id || product.id.trim() === "") {
          console.error("Cannot navigate to product with empty ID");
          return;
        }
        // Canonical product detail route — every other entry point uses this
        // path; the previous `/product/${id}` form was a 404.
        router.push(`/productdetail/${product.id}`);
      } catch (err) {
        console.error("Error navigating to bundled product:", err);
      }
    },
    [router]
  );

  // Don't show loading state if no shopId (bundles are shop-only)
  if (!shopId || shopId.trim() === "") {
    return null;
  }

  // Silent load: render nothing while fetching when we don't yet know
  // whether this product has bundles. Prevents the "skeleton flash that
  // collapses to nothing" UX on products without bundles.
  if (isLoading) {
    return null;
  }

  if (error || bundles.length === 0) {
    return null;
  }

  return (
    <div
      className="rounded-none sm:rounded-2xl p-4 sm:p-6 border shadow-sm -mx-4 sm:mx-0 bg-white border-gray-200 dark:bg-surface-2 dark:border-gray-700"
    >
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="p-1.5 sm:p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3
              className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white"
            >
              {t("title")}
            </h3>
            <p
              className="text-xs sm:text-sm text-gray-600 dark:text-gray-400"
            >
              {t("subtitle")}
            </p>
          </div>
        </div>

        {/* Bundle Products List */}
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {bundles.map((bundleData) => (
            <BundleProductCard
              key={`${bundleData.bundleId}-${bundleData.product.id}`}
              bundleData={bundleData}
              onClick={() => navigateToProduct(bundleData.product)}
              t={t}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default BundleComponent;