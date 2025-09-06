import React, { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image"; // Add this import
import {
  Heart,
  ShoppingCart,
  Check,
  Star,
  StarHalf,
  ImageOff,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";

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

// Enhanced image preloader hook
const useImagePreloader = (urls: string[]) => {
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!urls.length) return;

    const preloadImages = async () => {
      const promises = urls.map((url) => {
        return new Promise<{ url: string; success: boolean }>((resolve) => {
          const img = new window.Image();
          img.onload = () => resolve({ url, success: true });
          img.onerror = () => resolve({ url, success: false });
          img.src = url;
        });
      });

      const results = await Promise.all(promises);
      const loaded = new Set<string>();
      const failed = new Set<string>();

      results.forEach(({ url, success }) => {
        if (success) {
          loaded.add(url);
        } else {
          failed.add(url);
        }
      });

      setLoadedImages(loaded);
      setFailedImages(failed);
    };

    preloadImages();
  }, [urls]);

  return { loadedImages, failedImages };
};

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

// Optimized rotating text component
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
      {children.map((child, index) => (
        <div
          key={index}
          className={`absolute w-full h-4 flex items-center transition-all duration-500 ease-in-out ${
            index === currentIndex
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4"
          }`}
          style={{ lineHeight: "16px" }}
        >
          {child}
        </div>
      ))}
    </div>
  );
};

// Optimized rotating banner component
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
      {children.map((child, index) => (
        <div
          key={index}
          className={`absolute w-full transition-all duration-500 ease-in-out ${
            index === currentIndex
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-full"
          }`}
          style={{ height }}
        >
          {child}
        </div>
      ))}
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

// Logo placeholder component - FIXED VERSION
const LogoPlaceholder: React.FC<{ size?: number }> = ({ size = 120 }) => {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div
        className="flex items-center justify-center bg-gray-100 rounded-lg"
        style={{ width: size, height: size }}
      >
        <div className="w-8 h-8 text-gray-400">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center bg-gray-100 rounded-lg relative"
      style={{ width: size, height: size }}
    >
      <Image
        src="/images/narsiyah.png"
        alt="Narsiyah Logo"
        width={size * 0.8}
        height={size * 0.8}
        className="object-contain"
        onError={() => setImageError(true)}
        priority={false}
        sizes={`${size}px`}
      />
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
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [internalSelectedColor, setInternalSelectedColor] = useState<
    string | null
  >(selectedColor || null);
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false); // Add this state

  // Compute displayed colors (max 4, shuffled)
  const displayedColors = useMemo(() => {
    const availableColors = Object.keys(product.colorImages || {});
    const shuffled = [...availableColors].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }, [product.colorImages]);

  // Get current image URLs based on selected color
  const currentImageUrls = useMemo(() => {
    const colorToUse = internalSelectedColor || selectedColor;
    const colorImages = product.colorImages || {};
    if (colorToUse && colorImages[colorToUse]?.length) {
      return colorImages[colorToUse];
    }
    return product.imageUrls || [];
  }, [
    internalSelectedColor,
    selectedColor,
    product.colorImages,
    product.imageUrls,
  ]);

  // Preload all images
  const { loadedImages, failedImages } = useImagePreloader(currentImageUrls);

  const handleCardClick = useCallback(() => {
    if (onTap) {
      onTap();
    } else {
      console.log("Navigating to:", `/productdetail/${product.id}`);
      router.push(`/productdetail/${product.id}`);
    }
  }, [onTap, product.id, router]);

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

  // Reset image index when color changes with faster transition
  useEffect(() => {
    setCurrentImageIndex(0);
    setImageError(false); // Reset image error when color changes
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

  // Build rotating children for description area
  const rotatingChildren = useMemo(() => {
    const children: React.ReactNode[] = [];
    const quantity = product.quantity ?? 1;

    if (product.brandModel) {
      children.push(
        <span key="brand" className="text-gray-500 text-xs truncate">
          {product.brandModel}
        </span>
      );
    }

    if (quantity <= 5 && quantity > 0) {
      children.push(
        <span
          key="stock"
          className="text-emerald-600 text-xs font-bold truncate"
        >
          Only {quantity} left
        </span>
      );
    }

    return children;
  }, [product.brandModel, product.quantity]);

  // Build banner children
  const bannerChildren = useMemo(() => {
    const children: React.ReactNode[] = [];

    if (hasFastDelivery) {
      children.push(
        <div
          key="delivery"
          className="w-full h-full bg-orange-500 flex items-center justify-center text-white text-xs font-medium"
        >
          Fast Delivery
        </div>
      );
    }

    if (hasDiscountBanner) {
      children.push(
        <div
          key="discount"
          className="w-full h-full bg-emerald-600 flex items-center justify-center text-white text-xs font-medium"
        >
          {product.discountPercentage}% OFF
        </div>
      );
    }

    return children;
  }, [hasFastDelivery, hasDiscountBanner, product.discountPercentage]);

  const handleColorSelect = useCallback(
    (color: string) => {
      const newColor = internalSelectedColor === color ? null : color;
      setInternalSelectedColor(newColor);
      onColorSelect?.(newColor || "");
    },
    [internalSelectedColor, onColorSelect]
  );

  const handlePrevImage = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setCurrentImageIndex((prev) =>
        prev === 0 ? currentImageUrls.length - 1 : prev - 1
      );
    },
    [currentImageUrls.length]
  );

  const handleNextImage = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setCurrentImageIndex((prev) =>
        prev === currentImageUrls.length - 1 ? 0 : prev + 1
      );
    },
    [currentImageUrls.length]
  );

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

  const currentImageUrl = currentImageUrls[currentImageIndex];
  const isImageLoaded = currentImageUrl && loadedImages.has(currentImageUrl);
  const isImageFailed = currentImageUrl && failedImages.has(currentImageUrl);

  return (
    <div
      className="w-full cursor-pointer transition-transform duration-200 hover:scale-105"
      onClick={handleCardClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ transform: `scale(${effectiveScaleFactor})` }}
    >
      <div className="flex flex-col w-full">
        {/* Image Section */}
        <div className="relative group" style={{ height: imageHeight }}>
          <div className="w-full h-full rounded-t-xl overflow-hidden bg-gray-200 relative">
            {currentImageUrls.length > 0 ? (
              <div className="relative w-full h-full">
                {/* Image with smooth transition - FIXED VERSION */}
                <div className="relative w-full h-full">
                  {isImageLoaded && !imageError ? (
                    <Image
                      src={currentImageUrl}
                      alt={product.productName}
                      fill
                      className="object-cover transition-opacity duration-300"
                      onError={() => setImageError(true)}
                      sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                      priority={currentImageIndex === 0} // Prioritize first image
                    />
                  ) : isImageFailed || imageError ? (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <ImageOff size={32} className="text-gray-400" />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <LogoPlaceholder size={80} />
                    </div>
                  )}
                </div>

                {/* Navigation buttons - show on hover instantly for multiple images */}
                {currentImageUrls.length > 1 && (
                  <>
                    <button
                      className={`absolute left-2 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-black bg-opacity-50 rounded-full flex items-center justify-center text-white transition-opacity duration-150 ${
                        isHovered ? "opacity-100" : "opacity-0"
                      }`}
                      onClick={handlePrevImage}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      className={`absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-black bg-opacity-50 rounded-full flex items-center justify-center text-white transition-opacity duration-150 ${
                        isHovered ? "opacity-100" : "opacity-0"
                      }`}
                      onClick={handleNextImage}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <LogoPlaceholder size={80} />
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
                    className={`w-5 h-5 rounded-full border-2 transition-all duration-200 ${
                      isSelected
                        ? "border-orange-500 scale-110"
                        : "border-white hover:scale-105"
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
              <div className="px-2 py-1 bg-gray-600 bg-opacity-80 rounded-full flex gap-1">
                {Array.from(
                  { length: Math.min(currentImageUrls.length, 3) },
                  (_, i) => {
                    const isActive = i === getActiveDotIndex();
                    return (
                      <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                          isActive
                            ? "bg-orange-500 scale-125"
                            : "bg-white bg-opacity-60"
                        }`}
                      />
                    );
                  }
                )}
              </div>
            </div>
          )}

          {/* Bottom Banner */}
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

          {/* Rotating Description */}
          {rotatingChildren.length > 0 && (
            <RotatingText duration={1500}>{rotatingChildren}</RotatingText>
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
                className="w-6 h-6 flex items-center justify-center transform -translate-y-1 transition-transform hover:scale-110"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToCart?.(product.id);
                }}
              >
                {isInCart ? (
                  <Check size={16} className="text-green-600" />
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

export default ProductCard;
