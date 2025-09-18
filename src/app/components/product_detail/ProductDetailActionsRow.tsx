// src/components/productdetail/ProductDetailActionsRow.tsx

import React, { useState, useEffect } from "react";
import { Heart, Star, StarHalf, Shield, Truck, Award} from "lucide-react";
import { useFavorites } from "@/context/FavoritesProvider";
import { useUser } from "@/context/UserProvider";
import ProductOptionSelector from "@/app/components/ProductOptionSelector";
import { Product } from "@/app/models/Product";

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


const RotatingCountText: React.FC<RotatingCountTextProps> = ({
  cartCount,
  favoriteCount,
  purchaseCount,
  isDarkMode = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  const messages = [];
  if (purchaseCount > 0) {
    messages.push({
      text: `${purchaseCount} purchased`,
      color: isDarkMode ? "text-green-400" : "text-green-600",
      icon: <Award className="w-3 h-3" />,
    });
  }
  if (favoriteCount > 0) {
    messages.push({
      text: `${favoriteCount} favorites`,
      color: isDarkMode ? "text-pink-400" : "text-pink-600",
      icon: <Heart className="w-3 h-3" />,
    });
  }
  if (cartCount > 0) {
    messages.push({
      text: `${cartCount} in cart`,
      color: isDarkMode ? "text-orange-400" : "text-orange-600",
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

const StarRating: React.FC<{ rating: number; reviewCount?: number; isDarkMode?: boolean }> = ({ 
  rating, 
  reviewCount,
  isDarkMode = false 
}) => {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  const emptyStarColor = isDarkMode ? "text-gray-600" : "text-gray-300";

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
          <Star key={i} className={`w-4 h-4 ${emptyStarColor}`} />
        ))}
      </div>
      
      <div className="flex items-center gap-2">
        <span className={`text-lg font-bold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}>
          {rating.toFixed(1)}
        </span>
        {reviewCount && (
          <span className={`text-sm ${
            isDarkMode ? "text-gray-400" : "text-gray-500"
          }`}>
            ({reviewCount} reviews)
          </span>
        )}
      </div>
    </div>
  );
};

const TrustBadge: React.FC<{ 
  icon: React.ReactNode;
  title: string; 
  value: string; 
  isDarkMode?: boolean;
}> = ({
  icon,
  title,
  value,
  isDarkMode = false,
}) => (
  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
    isDarkMode 
      ? "bg-gray-800 border border-gray-700" 
      : "bg-gray-50 border border-gray-200"
  }`}>
    <div className={`${isDarkMode ? "text-orange-400" : "text-orange-600"}`}>
      {icon}
    </div>
    <div className="flex flex-col">
      <span className={`text-xs font-medium ${
        isDarkMode ? "text-gray-400" : "text-gray-600"
      }`}>
        {title}
      </span>
      <span className={`text-sm font-semibold ${
        isDarkMode ? "text-white" : "text-gray-900"
      }`}>
        {value}
      </span>
    </div>
  </div>
);

const LoadingSkeleton: React.FC<{ isDarkMode?: boolean }> = ({ 
  isDarkMode = false 
}) => (
  <div className={`space-y-4 ${
    isDarkMode ? "text-white" : "text-gray-900"
  }`}>
    <div className="flex items-center gap-4">
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded animate-pulse ${
              isDarkMode ? "bg-gray-700" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <div className={`w-12 h-5 rounded animate-pulse ${
        isDarkMode ? "bg-gray-700" : "bg-gray-200"
      }`} />
    </div>

    <div className="flex gap-3">
      <div className={`w-24 h-12 rounded-xl animate-pulse ${
        isDarkMode ? "bg-gray-700" : "bg-gray-200"
      }`} />
      <div className={`w-32 h-12 rounded-xl animate-pulse ${
        isDarkMode ? "bg-gray-700" : "bg-gray-200"
      }`} />
    </div>
  </div>
);

const ProductDetailActionsRow: React.FC<ProductDetailActionsRowProps> = ({
  product,
  isLoading = false,
  
  onToggleFavorite,
  isDarkMode = false,
}) => {
  const { addToFavorites, isFavorite: isProductFavorite } = useFavorites();
  

  const [showOptionSelector, setShowOptionSelector] = useState(false);
  const [, setFavoriteButtonState] = useState<'idle' | 'adding' | 'added' | 'removing' | 'removed'>('idle');
  const [, setShowFavoriteAnimation] = useState(false);

  const actualIsFavorite = product ? isProductFavorite(product.id) : false;

  

  const performFavoriteToggle = async (selectedOptions?: { selectedColor?: string; selectedColorImage?: string; quantity: number; [key: string]: unknown }) => {
    if (!product) return;

    try {
      const wasInFavorites = actualIsFavorite;
      
      setFavoriteButtonState(wasInFavorites ? 'removing' : 'adding');
      setShowFavoriteAnimation(true);

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

  const handleOptionSelectorConfirm = async (selectedOptions: { selectedColor?: string; selectedColorImage?: string; quantity: number; [key: string]: unknown }) => {
    setShowOptionSelector(false);
    await performFavoriteToggle(selectedOptions);
  };

  const handleOptionSelectorClose = () => {
    setShowOptionSelector(false);
  };

  if (isLoading || !product) {
    return <LoadingSkeleton isDarkMode={isDarkMode} />;
  }

  return (
    <>
      <div className="space-y-6">
        {/* Rating Section */}
        <div className="space-y-3">
          <StarRating 
            rating={product.averageRating} 
            reviewCount={product.reviewCount || undefined}
            isDarkMode={isDarkMode} 
          />
          
          <RotatingCountText
            cartCount={product.cartCount}
            favoriteCount={product.favoritesCount}
            purchaseCount={product.purchaseCount}
            isDarkMode={isDarkMode}
          />
        </div>

        {/* Trust Badges */}
        <div className="grid grid-cols-2 gap-3">
          <TrustBadge
            icon={<Shield className="w-4 h-4" />}
            title="Brand"
            value={product.brandModel || "Generic"}
            isDarkMode={isDarkMode}
          />
          <TrustBadge
            icon={<Truck className="w-4 h-4" />}
            title="Delivery"
            value={product.deliveryOption || "Standard"}
            isDarkMode={isDarkMode}
          />
        </div>
      </div>

      {product && (
        <ProductOptionSelector
          product={product}
          isOpen={showOptionSelector}
          onClose={handleOptionSelectorClose}
          onConfirm={handleOptionSelectorConfirm}
        />
      )}
    </>
  );
};

export default ProductDetailActionsRow;