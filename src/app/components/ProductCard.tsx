import React, { useState, useEffect, useMemo } from "react";
import {
  Heart,
  ShoppingCart,
  Check,
  Star,
  StarHalf,
  ImageIcon,
  ImageOff,
} from "lucide-react";

// Product interface based on your Flutter model
interface Product {
  id: string;
  productName: string;
  price: number;
  originalPrice?: number;
  discountPercentage?: number;
  currency: string;
  imageUrls: string[];
  colorImages: Record<string, string[]>;
  description: string;
  brandModel?: string;
  condition: string;
  quantity?: number;
  averageRating: number;
  isBoosted: boolean;
  deliveryOption?: string;
  campaignName?: string;
}

interface ProductCardProps {
  product: Product;
  scaleFactor?: number;
  internalScaleFactor?: number;
  portraitImageHeight?: number;
  overrideInternalScaleFactor?: number;
  showCartIcon?: boolean;
  showExtraLabels?: boolean;
  extraLabel?: string;
  extraLabelGradient?: string[];
  selectedColor?: string;
  onTap?: () => void;
  onColorSelect?: (color: string) => void;
  onFavoriteToggle?: (productId: string) => void;
  onAddToCart?: (productId: string) => void;
  isFavorited?: boolean;
  isInCart?: boolean;
}

// Color mapping function
const getColorFromName = (colorName: string): string => {
  const colorMap: Record<string, string> = {
    blue: "#2196F3",
    orange: "#FF9800",
    yellow: "#FFEB3B",
    black: "#000000",
    brown: "#795548",
    "dark blue": "#00008B",
    gray: "#9E9E9E",
    pink: "#E91E63",
    red: "#F44336",
    white: "#FFFFFF",
    green: "#4CAF50",
    purple: "#9C27B0",
    teal: "#009688",
    lime: "#CDDC39",
    cyan: "#00BCD4",
    magenta: "#FF00FF",
    indigo: "#3F51B5",
    amber: "#FFC107",
    "deep orange": "#FF5722",
    "light blue": "#03A9F4",
    "deep purple": "#673AB7",
    "light green": "#8BC34A",
    "dark gray": "#444444",
    beige: "#F5F5DC",
    turquoise: "#40E0D0",
    violet: "#EE82EE",
    olive: "#808000",
    maroon: "#800000",
    navy: "#000080",
    silver: "#C0C0C0",
  };
  return colorMap[colorName.toLowerCase()] || "#9E9E9E";
};

// Fixed rotating text component
interface RotatingTextProps {
  children: React.ReactNode[];
  duration?: number;
  className?: string;
}

const RotatingText: React.FC<RotatingTextProps> = ({
  children,
  duration = 1500,
  className = "",
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (children.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % children.length);
    }, duration);

    return () => clearInterval(timer);
  }, [children.length, duration]);

  if (children.length === 0) return null;
  if (children.length === 1)
    return <div className={className}>{children[0]}</div>;

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ height: "16px" }}
    >
      <div
        className="transition-transform duration-500 ease-in-out"
        style={{
          transform: `translateY(-${currentIndex * 16}px)`,
        }}
      >
        {children.map((child, index) => (
          <div
            key={index}
            className="h-4 flex items-center"
            style={{ lineHeight: "16px" }}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
};

// Fixed rotating banner component
interface RotatingBannerProps {
  children: React.ReactNode[];
  duration?: number;
  height?: number;
}

const RotatingBanner: React.FC<RotatingBannerProps> = ({
  children,
  duration = 2000,
  height = 20,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (children.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % children.length);
    }, duration);

    return () => clearInterval(timer);
  }, [children.length, duration]);

  if (children.length === 0) return null;
  if (children.length === 1) return <div style={{ height }}>{children[0]}</div>;

  return (
    <div style={{ height }} className="relative overflow-hidden">
      <div
        className="transition-transform duration-500 ease-in-out"
        style={{
          transform: `translateY(-${currentIndex * height}px)`,
        }}
      >
        {children.map((child, index) => (
          <div key={index} style={{ height }}>
            {child}
          </div>
        ))}
      </div>
    </div>
  );
};

// Star rating component
interface StarRatingProps {
  rating: number;
  size?: number;
}

const StarRating: React.FC<StarRatingProps> = ({ rating, size = 14 }) => {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className="flex items-center">
      {Array.from({ length: fullStars }, (_, i) => (
        <Star
          key={`full-${i}`}
          size={size}
          className="fill-amber-400 text-amber-400"
        />
      ))}
      {hasHalfStar && (
        <StarHalf size={size} className="fill-amber-400 text-amber-400" />
      )}
      {Array.from({ length: emptyStars }, (_, i) => (
        <Star key={`empty-${i}`} size={size} className="text-amber-400" />
      ))}
    </div>
  );
};

// Extra label component
interface ExtraLabelProps {
  text: string;
  gradientColors: string[];
}

const ExtraLabel: React.FC<ExtraLabelProps> = ({ text, gradientColors }) => {
  const gradientStyle = {
    background: `linear-gradient(to right, ${gradientColors.join(", ")})`,
  };

  return (
    <div
      className="px-2 py-1 rounded text-white text-xs font-medium"
      style={gradientStyle}
    >
      {text}
    </div>
  );
};

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  scaleFactor = 1.0,
  internalScaleFactor = 1.0,
  portraitImageHeight,
  overrideInternalScaleFactor,
  showCartIcon = true,
  showExtraLabels = false,
  selectedColor,
  onTap,
  onColorSelect,
  onFavoriteToggle,
  onAddToCart,
  isFavorited = false,
  isInCart = false,
}) => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [internalSelectedColor, setInternalSelectedColor] = useState<
    string | null
  >(selectedColor || null);
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // Compute displayed colors (max 4, shuffled)
  const displayedColors = useMemo(() => {
    const availableColors = Object.keys(product.colorImages);
    const shuffled = [...availableColors].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }, [product.colorImages]);

  // Get current image URLs based on selected color
  const currentImageUrls = useMemo(() => {
    const colorToUse = internalSelectedColor || selectedColor;
    if (colorToUse && product.colorImages[colorToUse]?.length) {
      return product.colorImages[colorToUse];
    }
    return product.imageUrls;
  }, [
    internalSelectedColor,
    selectedColor,
    product.colorImages,
    product.imageUrls,
  ]);

  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => observer.disconnect();
  }, []);

  // Reset image index when color changes
  useEffect(() => {
    setCurrentImageIndex(0);
    setImageError(false);
    setImageLoading(true);
  }, [internalSelectedColor, selectedColor]);

  // Update internal selected color when prop changes
  useEffect(() => {
    setInternalSelectedColor(selectedColor || null);
  }, [selectedColor]);

  const effectiveScaleFactor = scaleFactor;
  const finalInternalScaleFactor =
    overrideInternalScaleFactor ?? internalScaleFactor;
  const textScaleFactor = effectiveScaleFactor * 0.9 * finalInternalScaleFactor;

  const hasDiscount = (product.discountPercentage ?? 0) > 0;
  const hasFastDelivery = product.deliveryOption === "Fast Delivery";
  const hasDiscountBanner = (product.discountPercentage ?? 0) >= 10;

  const imageHeight = portraitImageHeight
    ? `${portraitImageHeight * effectiveScaleFactor}px`
    : "35vh";

  // Build rotating children for description area - FIXED (only brand model and stock info)
  const rotatingChildren = useMemo(() => {
    const children: React.ReactNode[] = [];
    const quantity = product.quantity ?? 1;

    // Always add brand model if available
    if (product.brandModel) {
      children.push(
        <span className="text-gray-500 text-xs truncate">
          {product.brandModel}
        </span>
      );
    }

    // Add stock info if low quantity
    if (quantity <= 5 && quantity > 0) {
      children.push(
        <span className="text-emerald-600 text-xs font-bold truncate">
          Only {quantity} left
        </span>
      );
    }

    return children;
  }, [product.brandModel, product.quantity]);

  // Build banner children - FIXED
  const bannerChildren = useMemo(() => {
    const children: React.ReactNode[] = [];

    if (hasFastDelivery) {
      children.push(
        <div className="w-full h-full bg-orange-500 flex items-center justify-center text-white text-xs font-medium">
          Fast Delivery
        </div>
      );
    }

    if (hasDiscountBanner) {
      children.push(
        <div className="w-full h-full bg-emerald-600 flex items-center justify-center text-white text-xs font-medium">
          {product.discountPercentage}% OFF
        </div>
      );
    }

    return children;
  }, [hasFastDelivery, hasDiscountBanner, product.discountPercentage]);

  const handleColorSelect = (color: string) => {
    const newColor = internalSelectedColor === color ? null : color;
    setInternalSelectedColor(newColor);
    onColorSelect?.(newColor || "");
  };

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  // Determine active dot for pagination (max 3 dots)
  const getActiveDotIndex = () => {
    const imageCount = currentImageUrls.length;
    if (imageCount <= 3) {
      return Math.min(currentImageIndex, imageCount - 1);
    }
    if (currentImageIndex === 0) return 0;
    if (currentImageIndex === imageCount - 1) return 2;
    return 1;
  };

  return (
    <div
      className="cursor-pointer"
      onClick={onTap}
      style={{ transform: `scale(${effectiveScaleFactor})` }}
    >
      <div className="flex flex-col">
        {/* Image Section */}
        <div className="relative" style={{ height: imageHeight }}>
          <div className="w-full h-full rounded-t-xl overflow-hidden bg-gray-200">
            {currentImageUrls.length > 0 ? (
              <div className="relative w-full h-full">
                {/* Current Image */}
                <img
                  src={currentImageUrls[currentImageIndex]}
                  alt={product.productName}
                  className={`w-full h-full object-cover transition-opacity duration-300 ${
                    imageLoading || imageError ? "opacity-0" : "opacity-100"
                  }`}
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />

                {/* Loading/Error States */}
                {imageLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                    <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center">
                      <ImageIcon size={32} className="text-gray-400" />
                    </div>
                  </div>
                )}

                {imageError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                    <ImageOff size={32} className="text-gray-400" />
                  </div>
                )}

                {/* Image Navigation */}
                {currentImageUrls.length > 1 && (
                  <>
                    <button
                      className="absolute left-2 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-black bg-opacity-50 rounded-full flex items-center justify-center text-white opacity-0 hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentImageIndex((prev) =>
                          prev === 0 ? currentImageUrls.length - 1 : prev - 1
                        );
                      }}
                    >
                      ‹
                    </button>
                    <button
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-black bg-opacity-50 rounded-full flex items-center justify-center text-white opacity-0 hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentImageIndex((prev) =>
                          prev === currentImageUrls.length - 1 ? 0 : prev + 1
                        );
                      }}
                    >
                      ›
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageOff size={32} className="text-gray-400" />
              </div>
            )}
          </div>

          {/* Top Right Icons */}
          <div className="absolute top-2 right-2 flex items-center gap-2">
            {showExtraLabels && (
              <>
                <ExtraLabel
                  text="Nar24"
                  gradientColors={["#FF9800", "#E91E63"]}
                />
                <ExtraLabel
                  text="Vitrin"
                  gradientColors={["#9C27B0", "#E91E63"]}
                />
              </>
            )}

            {/* Favorite Icon */}
            <button
              className="w-7 h-7 bg-white bg-opacity-90 rounded-full flex items-center justify-center shadow-sm hover:bg-opacity-100 transition-all"
              onClick={(e) => {
                e.stopPropagation();
                onFavoriteToggle?.(product.id);
              }}
            >
              <Heart
                size={12}
                className={
                  isFavorited ? "fill-red-500 text-red-500" : "text-gray-500"
                }
              />
            </button>
          </div>

          {/* Color Options */}
          {displayedColors.length > 0 && (
            <div className="absolute right-2 bottom-16 flex flex-col gap-1">
              {displayedColors.map((color) => {
                const isSelected = internalSelectedColor === color;
                return (
                  <button
                    key={color}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${
                      isSelected ? "border-orange-500" : "border-white"
                    }`}
                    style={{ backgroundColor: getColorFromName(color) }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleColorSelect(color);
                    }}
                  >
                    {isSelected && (
                      <Check size={10} className="text-white m-auto" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Campaign Badge */}
          {product.campaignName && (
            <div className="absolute bottom-12 left-2">
              <div className="px-2 py-1 rounded-lg text-white text-xs font-bold bg-gradient-to-r from-orange-500 to-pink-500">
                {product.campaignName}
              </div>
            </div>
          )}

          {/* Featured Badge */}
          {product.isBoosted && (
            <div className="absolute bottom-8 left-2">
              <div className="px-2 py-1 rounded-lg text-white text-xs font-bold bg-gray-600 bg-opacity-80">
                Featured
              </div>
            </div>
          )}

          {/* Image Dots */}
          {currentImageUrls.length > 1 && (
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
              <div className="px-2 py-1 bg-gray-600 rounded-full flex gap-1">
                {Array.from(
                  { length: Math.min(currentImageUrls.length, 3) },
                  (_, i) => {
                    const isActive = i === getActiveDotIndex();
                    return (
                      <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                          isActive ? "bg-orange-500" : "bg-white bg-opacity-60"
                        }`}
                      />
                    );
                  }
                )}
              </div>
            </div>
          )}

          {/* Bottom Banner - FIXED */}
          {bannerChildren.length > 0 && (
            <div className="absolute bottom-0 left-0 right-0">
              <RotatingBanner height={20} duration={2000}>
                {bannerChildren}
              </RotatingBanner>
            </div>
          )}
        </div>

        {/* Content Section */}
        <div className="p-2">
          {/* Product Name */}
          <h3
            className={`font-semibold truncate mb-1 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
            style={{ fontSize: `${14 * textScaleFactor}px` }}
          >
            {product.productName}
          </h3>

          {/* Rotating Description - FIXED */}
          {rotatingChildren.length > 0 && (
            <RotatingText duration={2000}>{rotatingChildren}</RotatingText>
          )}

          <div className="h-1" />

          {/* Rating Row */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <StarRating
                rating={product.averageRating}
                size={12 * effectiveScaleFactor}
              />
              <span
                className="text-gray-500"
                style={{ fontSize: `${10 * textScaleFactor}px` }}
              >
                {product.averageRating.toFixed(1)}
              </span>
            </div>
          </div>

          <div className="h-1" />

          {/* Price Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1">
              {hasDiscount ? (
                <>
                  <span
                    className="font-semibold text-orange-500"
                    style={{ fontSize: `${14 * textScaleFactor}px` }}
                  >
                    {product.price.toFixed(0)} {product.currency}
                  </span>
                  <span
                    className="text-emerald-600 font-bold"
                    style={{ fontSize: `${12 * textScaleFactor}px` }}
                  >
                    %{product.discountPercentage}
                  </span>
                </>
              ) : (
                <span
                  className="font-semibold text-orange-500"
                  style={{ fontSize: `${14 * textScaleFactor}px` }}
                >
                  {product.price.toFixed(0)} {product.currency}
                </span>
              )}
            </div>

            {/* Cart Icon */}
            {showCartIcon && (
              <button
                className="w-6 h-6 flex items-center justify-center transform -translate-y-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToCart?.(product.id);
                }}
              >
                {isInCart ? (
                  <Check size={16} className="text-gray-800" />
                ) : (
                  <ShoppingCart size={16} className="text-gray-800" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Demo component to show the card in action
const ProductCardDemo = () => {
  const [favorited, setFavorited] = useState(false);
  const [inCart, setInCart] = useState(false);

  const sampleProduct: Product = {
    id: "1",
    productName: "Premium Wireless Headphones",
    price: 299,
    originalPrice: 399,
    discountPercentage: 25,
    currency: "USD",
    imageUrls: [
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400&h=400&fit=crop",
      "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400&h=400&fit=crop",
    ],
    colorImages: {
      black: [
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop",
      ],
      white: [
        "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400&h=400&fit=crop",
      ],
      blue: [
        "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=400&h=400&fit=crop",
      ],
    },
    description: "High-quality wireless headphones with noise cancellation",
    brandModel: "AudioTech Pro Max",
    condition: "New",
    quantity: 3,
    averageRating: 4.5,
    isBoosted: true,
    deliveryOption: "Fast Delivery",
    campaignName: "Summer Sale",
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-sm mx-auto">
        <ProductCard
          product={sampleProduct}
          showExtraLabels={true}
          isFavorited={favorited}
          isInCart={inCart}
          onFavoriteToggle={() => setFavorited(!favorited)}
          onAddToCart={() => setInCart(!inCart)}
          onTap={() => console.log("Product tapped")}
        />
      </div>
    </div>
  );
};

export default ProductCardDemo;
