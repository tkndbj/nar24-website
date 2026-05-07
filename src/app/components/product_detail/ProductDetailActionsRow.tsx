// src/components/productdetail/ProductDetailActionsRow.tsx

import React, { useState, useEffect, useCallback } from "react";
import { Heart, Star, StarHalf, Shield, Truck, Award, Info, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Product } from "@/app/models/Product";

interface ProductDetailActionsRowProps {
  product: Product | null;
  isLoading?: boolean;
  onShare?: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
  localization?: ReturnType<typeof useTranslations>;
}

interface RotatingCountTextProps {
  cartCount: number;
  favoriteCount: number;
  purchaseCount: number;
  t: (key: string) => string;
}

const RotatingCountText: React.FC<RotatingCountTextProps> = ({
  cartCount,
  favoriteCount,
  purchaseCount,
  t,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const messages = [];
  if (purchaseCount > 0) {
    messages.push({
      text: `${purchaseCount} ${t("purchased")}`,
      color: "text-green-600 dark:text-green-400",
      icon: <Award className="w-3 h-3" />,
    });
  }
  if (favoriteCount > 0) {
    messages.push({
      text: `${favoriteCount} ${t("favorites")}`,
      color: "text-pink-600 dark:text-pink-400",
      icon: <Heart className="w-3 h-3" />,
    });
  }
  if (cartCount > 0) {
    messages.push({
      text: `${cartCount} ${t("inCart")}`,
      color: "text-orange-600 dark:text-orange-400",
      icon: <Truck className="w-3 h-3" />,
    });
  }

  useEffect(() => {
    if (messages.length <= 1) return;

    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % messages.length);
        setIsVisible(true);
      }, 150);
    }, 3000);

    return () => clearInterval(interval);
  }, [messages.length]);

  if (messages.length === 0) return null;

  return (
    <div className="min-h-[20px] flex items-center overflow-hidden">
      <div
        className={`transition-all duration-200 flex items-center gap-1 ${
          isVisible
            ? "translate-y-0 opacity-100"
            : "-translate-y-full opacity-0"
        }`}
      >
        <span className={`${messages[currentIndex]?.color}`}>
          {messages[currentIndex]?.icon}
        </span>
        <span className={`text-sm font-medium whitespace-nowrap ${messages[currentIndex]?.color}`}>
          {messages[currentIndex]?.text}
        </span>
      </div>
    </div>
  );
};

interface StarRatingProps {
  rating: number;
  reviewCount?: number;
  t: (key: string) => string;
}

const StarRating: React.FC<StarRatingProps> = ({
  rating,
  reviewCount,
  t
}) => {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1">
        {Array.from({ length: fullStars }).map((_, i) => (
          <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
        ))}
        {hasHalfStar && (
          <StarHalf className="w-4 h-4 fill-amber-400 text-amber-400" />
        )}
        {Array.from({ length: emptyStars }).map((_, i) => (
          <Star key={i} className="w-4 h-4 text-gray-300 dark:text-gray-600" />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-gray-900 dark:text-white">
          {rating.toFixed(1)}
        </span>
        {reviewCount && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            ({reviewCount} {t("reviews")})
          </span>
        )}
      </div>
    </div>
  );
};

interface TrustBadgeProps {
  icon: React.ReactNode;
  title: string;
  value: string;
}

const TrustBadge: React.FC<TrustBadgeProps> = ({
  icon,
  title,
  value,
}) => (
  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-surface-2 border border-gray-200 dark:border-gray-700">
    <div className="text-orange-600 dark:text-orange-400">
      {icon}
    </div>
    <div className="flex flex-col">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
        {title}
      </span>
      <span className="text-sm font-semibold text-gray-900 dark:text-white">
        {value}
      </span>
    </div>
  </div>
);

const LoadingSkeleton: React.FC = () => (
  <div className="space-y-4 text-gray-900 dark:text-white">
    <div className="flex items-center gap-4">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="w-4 h-4 rounded animate-pulse bg-gray-200 dark:bg-gray-700"
          />
        ))}
      </div>
      <div className="w-12 h-5 rounded animate-pulse bg-gray-200 dark:bg-gray-700" />
    </div>

    <div className="flex gap-3">
      <div className="w-24 h-12 rounded-xl animate-pulse bg-gray-200 dark:bg-gray-700" />
      <div className="w-32 h-12 rounded-xl animate-pulse bg-gray-200 dark:bg-gray-700" />
    </div>
  </div>
);

const ProductDetailActionsRow: React.FC<ProductDetailActionsRowProps> = ({
  product,
  isLoading = false,
  localization,
}) => {
  const [showVitrinModal, setShowVitrinModal] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!showVitrinModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowVitrinModal(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showVitrinModal]);

  // ✅ FIXED: Proper nested translation function that uses JSON files
  const t = useCallback((key: string) => {
    if (!localization) {
      return key;
    }

    try {
      // Try to get the nested ProductDetailActionsRow translation
      const translation = localization(`ProductDetailActionsRow.${key}`);
      
      // Check if we got a valid translation (not the same as the key we requested)
      if (translation && translation !== `ProductDetailActionsRow.${key}`) {
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

  if (isLoading || !product) {
    return <LoadingSkeleton />;
  }

  return (
    <>
      <div className="space-y-6">
        {/* Rating Section */}
        {product.averageRating > 0 && (
          <div className="space-y-3">
            <StarRating
              rating={product.averageRating}
              reviewCount={product.reviewCount || undefined}
              t={t}
            />

            <RotatingCountText
              cartCount={product.cartCount}
              favoriteCount={product.favoritesCount}
              purchaseCount={product.purchaseCount}
              t={t}
            />
          </div>
        )}

        {/* Trust Badges */}
        <div className="grid grid-cols-2 gap-3">
          <TrustBadge
            icon={<Shield className="w-4 h-4" />}
            title={t("brand")}
            value={product.brandModel || t("generic")}
          />
          <TrustBadge
            icon={<Truck className="w-4 h-4" />}
            title={t("delivery")}
            value={product.deliveryOption || t("standard")}
          />
        </div>

        {/* Vitrin badge — only for user-listed products, zero extra reads */}
        {product.sourceCollection === "products" && (
          <button
            onClick={() => setShowVitrinModal(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
          >
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{t("vitrinBadge")}</span>
          </button>
        )}
      </div>

      {/* Vitrin info modal */}
      {showVitrinModal && (
        <div className="fixed inset-0 z-[1200] flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowVitrinModal(false)}
          />
          {/* Sheet */}
          <div className="relative z-10 w-full sm:max-w-md mx-0 sm:mx-4 rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-900 shadow-2xl">
            {/* Handle (mobile only) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-9 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            <div className="px-5 pt-4 pb-6 sm:pt-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-orange-100 dark:bg-orange-900/30 flex-shrink-0">
                    <Info className="w-4 h-4 text-orange-500" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">
                    {t("vitrinSheetTitle")}
                  </h3>
                </div>
                <button
                  onClick={() => setShowVitrinModal(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300 mb-6">
                {t("vitrinSheetBody")}
              </p>

              {/* Dismiss button */}
              <button
                onClick={() => setShowVitrinModal(false)}
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
              >
                {t("gotIt")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProductDetailActionsRow;