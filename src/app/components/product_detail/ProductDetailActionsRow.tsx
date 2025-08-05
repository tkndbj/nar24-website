// src/components/productdetail/ProductDetailActionsRow.tsx

import React, { useState, useEffect } from "react";
import { Heart, Share2, Star, StarHalf, Check} from "lucide-react";
import { useFavorites } from "@/context/FavoritesProvider";
import { useUser } from "@/context/UserProvider";
import ProductOptionSelector from "@/app/components/ProductOptionSelector";
import { Product } from "@/app/models/Product"; // ✅ FIXED: Import Product from your model

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
  isDarkMode?: boolean;
}

// ✅ FIXED: Helper function to check if product has selectable options
const hasSelectableOptions = (product: Product | null): boolean => {
  if (!product) return false;

  // Check for colors
  const hasColors = Object.keys(product.colorImages || {}).length > 0;
  if (hasColors) return true;

  // Check for selectable attributes (attributes with multiple options)
  const selectableAttrs = Object.entries(product.attributes || {}).filter(([key, value]) => {
    let options: string[] = [];

    if (Array.isArray(value)) {
      options = value
        .map(item => item.toString())
        .filter(item => item.trim() !== '');
    } else if (typeof value === 'string' && value.trim() !== '') {
      options = value
        .split(',')
        .map(item => item.trim())
        .filter(item => item !== '');
    }

    // Only include attributes with multiple options
    return options.length > 1;
  });

  return selectableAttrs.length > 0;
};

const RotatingCountText: React.FC<RotatingCountTextProps> = ({
  cartCount,
  favoriteCount,
  purchaseCount,
  isDarkMode = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const messages = [];
  if (cartCount > 0) {
    messages.push({
      text: `${cartCount} in cart`,
      color: isDarkMode ? "text-orange-400" : "text-orange-600",
    });
  }
  if (favoriteCount > 0) {
    messages.push({
      text: `${favoriteCount} favorites`,
      color: isDarkMode ? "text-pink-400" : "text-pink-600",
    });
  }
  if (purchaseCount > 0) {
    messages.push({
      text: `${purchaseCount} purchased`,
      color: isDarkMode ? "text-blue-400" : "text-blue-600",
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
    <div className="min-h-[16px] flex items-center overflow-hidden">
      <div
        className={`transition-all duration-150 ${
          isVisible
            ? "translate-y-0 opacity-100"
            : "-translate-y-full opacity-0"
        }`}
      >
        <span className={`text-xs font-bold whitespace-nowrap ${messages[currentIndex]?.color}`}>
          {messages[currentIndex]?.text}
        </span>
      </div>
    </div>
  );
};

const StarRating: React.FC<{ rating: number; isDarkMode?: boolean }> = ({ 
  rating, 
  isDarkMode = false 
}) => {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  const emptyStarColor = isDarkMode ? "text-gray-600" : "text-gray-300";

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: fullStars }).map((_, i) => (
        <Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" />
      ))}
      {hasHalfStar && (
        <StarHalf className="w-3 h-3 fill-amber-400 text-amber-400" />
      )}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <Star key={i} className={`w-3 h-3 ${emptyStarColor}`} />
      ))}
    </div>
  );
};

const DetailChip: React.FC<{ 
  title: string; 
  value: string; 
  isDarkMode?: boolean;
}> = ({
  title,
  value,
  isDarkMode = false,
}) => (
  <div className={`inline-flex flex-col px-2 py-1 rounded border ${
    isDarkMode 
      ? "bg-orange-900/20 border-orange-700" 
      : "bg-orange-50 border-orange-200"
  }`}>
    <span className={`text-[9px] leading-tight ${
      isDarkMode ? "text-orange-300" : "text-orange-800"
    }`}>
      {title}
    </span>
    <span className={`text-[10px] leading-tight ${
      isDarkMode ? "text-gray-300" : "text-gray-700"
    }`}>
      {value}
    </span>
  </div>
);

const LoadingSkeleton: React.FC<{ isDarkMode?: boolean }> = ({ 
  isDarkMode = false 
}) => (
  <div className={`w-full p-4 shadow-sm border-b ${
    isDarkMode 
      ? "bg-gray-800 border-gray-700" 
      : "bg-white border-gray-100"
  }`}>
    <div className="flex items-start justify-between">
      <div className="flex-1 space-y-3">
        {/* Rating skeleton */}
        <div className="flex items-center gap-3">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded animate-pulse ${
                  isDarkMode ? "bg-gray-700" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
          <div className={`w-8 h-4 rounded animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`} />
          <div className={`w-16 h-4 rounded animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`} />
        </div>

        {/* Chips skeleton */}
        <div className="flex gap-2">
          <div className={`w-20 h-10 rounded animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`} />
          <div className={`w-24 h-10 rounded animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`} />
        </div>
      </div>

      {/* Action buttons skeleton */}
      <div className="flex gap-2 ml-4">
        <div className={`w-10 h-10 rounded-full animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`} />
        <div className={`w-10 h-10 rounded-full animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`} />
      </div>
    </div>
  </div>
);

const ProductDetailActionsRow: React.FC<ProductDetailActionsRowProps> = ({
  product,
  isLoading = false,
  onShare,
  onToggleFavorite,
  isDarkMode = false,
}) => {
  const { addToFavorites, isFavorite: isProductFavorite } = useFavorites();
  const { user } = useUser();

  // State for option selector modal
  const [showOptionSelector, setShowOptionSelector] = useState(false);

  const [favoriteButtonState, setFavoriteButtonState] = useState<'idle' | 'adding' | 'added' | 'removing' | 'removed'>('idle');
  const [showFavoriteAnimation, setShowFavoriteAnimation] = useState(false);

  const actualIsFavorite = product ? isProductFavorite(product.id) : false;

  // Enhanced favorite functionality with option selector logic
  const handleToggleFavorite = async () => {
    if (!user) {
      console.log("Please log in to add favorites");
      return;
    }

    if (!product) return;

    // ✅ FIXED: Only show option selector when ADDING to favorites (not removing)
    if (!actualIsFavorite && hasSelectableOptions(product)) {
      // Show option selector modal only when adding to favorites
      setShowOptionSelector(true);
      return;
    }

    // Direct favorite toggle for products without options OR when removing from favorites
    await performFavoriteToggle();
  };

  // Separated favorite toggle logic
  const performFavoriteToggle = async (selectedOptions?: any) => {
    if (!product) return;

    try {
      const wasInFavorites = actualIsFavorite;
      
      setFavoriteButtonState(wasInFavorites ? 'removing' : 'adding');
      setShowFavoriteAnimation(true);

      // Pass selected options if available
      const result = await addToFavorites(product.id, selectedOptions);
      
      if (result.includes('Added')) {
        setFavoriteButtonState('added');
      } else if (result.includes('Removed')) {
        setFavoriteButtonState('removed');
      }

      setTimeout(() => {
        setFavoriteButtonState('idle');
        setShowFavoriteAnimation(false);
      }, 2000);

      if (onToggleFavorite) {
        onToggleFavorite();
      }

    } catch (error) {
      console.error("Error with favorite operation:", error);
      setFavoriteButtonState('idle');
      setShowFavoriteAnimation(false);
    }
  };

  // Handle option selector confirmation
  const handleOptionSelectorConfirm = async (selectedOptions: any) => {
    setShowOptionSelector(false);
    await performFavoriteToggle(selectedOptions);
  };

  // Handle option selector close
  const handleOptionSelectorClose = () => {
    setShowOptionSelector(false);
  };

  const getFavoriteButtonContent = () => {
    if (favoriteButtonState === 'adding') {
      return {
        icon: <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />,
        className: isDarkMode ? "text-pink-400" : "text-pink-600",
      };
    }

    if (favoriteButtonState === 'removing') {
      return {
        icon: <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />,
        className: isDarkMode ? "text-gray-400" : "text-gray-600",
      };
    }

    if (favoriteButtonState === 'added') {
      return {
        icon: <Check className="w-5 h-5" />,
        className: "text-green-500",
      };
    }

    if (favoriteButtonState === 'removed') {
      return {
        icon: <Check className="w-5 h-5" />,
        className: "text-green-500",
      };
    }

    return {
      icon: (
        <Heart
          className={`w-5 h-5 transition-all duration-300 ${
            actualIsFavorite
              ? "fill-red-500 text-red-500"
              : isDarkMode 
                ? "text-gray-400"
                : "text-gray-600"
          } ${showFavoriteAnimation ? 'scale-110' : ''}`}
        />
      ),
      className: "",
    };
  };

  if (isLoading || !product) {
    return <LoadingSkeleton isDarkMode={isDarkMode} />;
  }

  const favoriteButtonContent = getFavoriteButtonContent();

  return (
    <>
      <div className={`w-full p-4 shadow-sm border-b ${
        isDarkMode 
          ? "bg-gray-800 border-gray-700" 
          : "bg-white border-gray-100"
      }`}>
        <div className="flex items-start justify-between">
          {/* Left side: rating and details */}
          <div className="flex-1 space-y-3">
            {/* Star rating row */}
            <div className="flex items-center gap-3">
              <StarRating rating={product.averageRating} isDarkMode={isDarkMode} />
              <span className={`text-sm font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}>
                {product.averageRating.toFixed(1)}
              </span>
              <RotatingCountText
                cartCount={product.cartCount}
                favoriteCount={product.favoritesCount}
                purchaseCount={product.purchaseCount}
                isDarkMode={isDarkMode}
              />
            </div>

            {/* Detail chips */}
            <div className="flex gap-2 flex-wrap">
              <DetailChip 
                title="Brand" 
                value={product.brandModel || "-"} 
                isDarkMode={isDarkMode}
              />
              <DetailChip
                title="Delivery"
                value={product.deliveryOption || "-"}
                isDarkMode={isDarkMode}
              />
            </div>
          </div>

          {/* Right side: action buttons */}
          <div className="flex gap-2 ml-4">
            <button
              onClick={onShare}
              className={`p-2 rounded-full transition-colors ${
                isDarkMode 
                  ? "hover:bg-gray-700 text-gray-400" 
                  : "hover:bg-gray-100 text-gray-600"
              }`}
              aria-label="Share product"
            >
              <Share2 className="w-5 h-5" />
            </button>

            <button
              onClick={handleToggleFavorite}
              disabled={favoriteButtonState === 'adding' || favoriteButtonState === 'removing'}
              className={`
                p-2 rounded-full transition-all duration-300 relative overflow-hidden
                ${
                  isDarkMode 
                    ? "hover:bg-gray-700" 
                    : "hover:bg-gray-100"
                }
                ${favoriteButtonContent.className}
                ${(favoriteButtonState === 'adding' || favoriteButtonState === 'removing') ? 'opacity-75 cursor-not-allowed' : ''}
                ${showFavoriteAnimation ? 'transform scale-105' : ''}
              `}
              aria-label={actualIsFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <span className={`transition-all duration-300 ${showFavoriteAnimation ? 'animate-pulse' : ''}`}>
                {favoriteButtonContent.icon}
              </span>
              
              {(favoriteButtonState === 'added' || favoriteButtonState === 'removed') && (
                <div className="absolute inset-0 bg-green-500/10 animate-pulse rounded-full" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ✅ FIXED: Product Option Selector Modal - Pass complete product directly */}
      {product && (
        <ProductOptionSelector
          product={product}
          isOpen={showOptionSelector}
          onClose={handleOptionSelectorClose}
          onConfirm={handleOptionSelectorConfirm}
          isBuyNow={false}
        />
      )}
    </>
  );
};

export default ProductDetailActionsRow;