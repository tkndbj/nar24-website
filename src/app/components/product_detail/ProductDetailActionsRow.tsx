// src/components/productdetail/ProductDetailActionsRow.tsx

import React, { useState, useEffect } from "react";
import { Heart, Share2, Star, StarHalf } from "lucide-react";

interface Product {
  id: string;
  averageRating: number;
  cartCount: number;
  favoritesCount: number;
  purchaseCount: number;
  brandModel?: string;
  deliveryOption?: string;
}

interface ProductDetailActionsRowProps {
  product: Product | null;
  isLoading?: boolean;
  onShare?: () => void;
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
  isDarkMode?: boolean;
}

interface RotatingCountTextProps {
  cartCount: number;
  favoriteCount: number;
  purchaseCount: number;
}

const RotatingCountText: React.FC<RotatingCountTextProps> = ({
  cartCount,
  favoriteCount,
  purchaseCount,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const messages = [];
  if (cartCount > 0) {
    messages.push({
      text: `${cartCount} in cart`,
      color: "text-orange-600 dark:text-orange-400",
    });
  }
  if (favoriteCount > 0) {
    messages.push({
      text: `${favoriteCount} favorites`,
      color: "text-pink-600 dark:text-pink-400",
    });
  }
  if (purchaseCount > 0) {
    messages.push({
      text: `${purchaseCount} purchased`,
      color: "text-blue-600 dark:text-blue-400",
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
    }, 2000);

    return () => clearInterval(interval);
  }, [messages.length]);

  if (messages.length === 0) return null;

  return (
    <div className="h-4 overflow-hidden">
      <div
        className={`transition-all duration-150 ${
          isVisible
            ? "translate-y-0 opacity-100"
            : "-translate-y-full opacity-0"
        }`}
      >
        <span className={`text-xs font-bold ${messages[currentIndex]?.color}`}>
          {messages[currentIndex]?.text}
        </span>
      </div>
    </div>
  );
};

const StarRating: React.FC<{ rating: number }> = ({ rating }) => {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: fullStars }).map((_, i) => (
        <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
      ))}
      {hasHalfStar && (
        <StarHalf className="w-3 h-3 fill-amber-400 text-amber-400" />
      )}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <Star key={i} className="w-3 h-3 text-gray-300 dark:text-gray-600" />
      ))}
    </div>
  );
};

const DetailChip: React.FC<{ title: string; value: string }> = ({
  title,
  value,
}) => (
  <div className="inline-flex flex-col px-2 py-1 bg-orange-50 dark:bg-orange-900/20 rounded border border-orange-200 dark:border-orange-700">
    <span className="text-[9px] text-orange-800 dark:text-orange-300 leading-tight">
      {title}
    </span>
    <span className="text-[10px] text-gray-700 dark:text-gray-300 leading-tight">
      {value}
    </span>
  </div>
);

const LoadingSkeleton: React.FC = () => (
  <div className="w-full p-4 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700">
    <div className="flex items-start justify-between">
      <div className="flex-1 space-y-3">
        {/* Rating skeleton */}
        <div className="flex items-center gap-3">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
              />
            ))}
          </div>
          <div className="w-8 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>

        {/* Chips skeleton */}
        <div className="flex gap-2">
          <div className="w-20 h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="w-24 h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
      </div>

      {/* Action buttons skeleton */}
      <div className="flex gap-2 ml-4">
        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
      </div>
    </div>
  </div>
);

const ProductDetailActionsRow: React.FC<ProductDetailActionsRowProps> = ({
  product,
  isLoading = false,
  onShare,
  onToggleFavorite,
  isFavorite = false,
  isDarkMode: _isDarkMode = false, // eslint-disable-line @typescript-eslint/no-unused-vars
}) => {
  if (isLoading || !product) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="w-full p-4 bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700">
      <div className="flex items-start justify-between">
        {/* Left side: rating and details */}
        <div className="flex-1 space-y-3">
          {/* Star rating row */}
          <div className="flex items-center gap-3">
            <StarRating rating={product.averageRating} />
            <span className="text-sm font-bold text-gray-900 dark:text-white">
              {product.averageRating.toFixed(1)}
            </span>
            <RotatingCountText
              cartCount={product.cartCount}
              favoriteCount={product.favoritesCount}
              purchaseCount={product.purchaseCount}
            />
          </div>

          {/* Detail chips */}
          <div className="flex gap-2 flex-wrap">
            <DetailChip title="Brand" value={product.brandModel || "-"} />
            <DetailChip
              title="Delivery"
              value={product.deliveryOption || "-"}
            />
          </div>
        </div>

        {/* Right side: action buttons */}
        <div className="flex gap-2 ml-4">
          <button
            onClick={onShare}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Share product"
          >
            <Share2 className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>

          <button
            onClick={onToggleFavorite}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Toggle favorite"
          >
            <Heart
              className={`w-5 h-5 transition-colors ${
                isFavorite
                  ? "fill-red-500 text-red-500"
                  : "text-gray-600 dark:text-gray-400"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailActionsRow;
