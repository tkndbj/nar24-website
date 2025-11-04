import React, { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import {
  Heart,
  ShoppingCart,
  Check,
  Star,
  StarHalf,
  ImageOff,
  ChevronLeft,
  ChevronRight,
  Minus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCart } from "@/context/CartProvider";
import { useFavorites } from "@/context/FavoritesProvider";
import { useUser } from "@/context/UserProvider";
import ProductOptionSelector from "@/app/components/ProductOptionSelector";

// Import the complete Product type from your models
import { Product } from "@/app/models/Product";

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
  isDarkMode?: boolean;
  localization?: ReturnType<typeof useTranslations>;
}

const isFantasyProduct = (product: Product): boolean => {
  return product.subsubcategory?.toLowerCase() === "fantasy";
};

// Enhanced helper function to check if product has selectable options
const hasSelectableOptions = (product: Product | null): boolean => {
  if (!product) return false;

  // Check for colors - ensure colorImages exists and is an object
  const colorImages = product.colorImages;
  const hasColors = colorImages != null && 
                    typeof colorImages === 'object' && 
                    Object.keys(colorImages).length > 0;
  if (hasColors) return true;

  // Check for selectable attributes (attributes with multiple options)
  const selectableAttrs = Object.entries(product.attributes || {}).filter(
    ([, value]) => {
      let options: string[] = [];

      if (Array.isArray(value)) {
        options = value
          .map((item) => item.toString())
          .filter((item) => item.trim() !== "");
      } else if (typeof value === "string" && value.trim() !== "") {
        options = value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item !== "");
      }

      // Only include attributes with multiple options
      return options.length > 1;
    }
  );

  return selectableAttrs.length > 0;
};


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
        sizes={`${Math.round(size * 0.8)}px`}
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
  isDarkMode: isDarkModeProp,
  localization,
}) => {
  const router = useRouter();

  // Cart, favorites, and user hooks
  const {
    addToCart,
    isInCart: isProductInCart,
    isOptimisticallyAdding,
    isOptimisticallyRemoving,
    removeFromCart,
  } = useCart();
  const { addToFavorites, isFavorite: isProductFavorite } = useFavorites();
  const { user } = useUser();

  const [isDarkModeState, setIsDarkMode] = useState(false);
  // Use prop value if provided, otherwise use state
  const isDarkMode = isDarkModeProp !== undefined ? isDarkModeProp : isDarkModeState;

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [internalSelectedColor, setInternalSelectedColor] = useState<
    string | null
  >(selectedColor || null);
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Option selector states
  const [showCartOptionSelector, setShowCartOptionSelector] = useState(false);
  const [showFavoriteOptionSelector, setShowFavoriteOptionSelector] =
    useState(false);

  // Animation states
  const [cartButtonState, setCartButtonState] = useState<
    "idle" | "adding" | "added" | "removing" | "removed"
  >("idle");
  const [favoriteButtonState, setFavoriteButtonState] = useState<
    "idle" | "adding" | "added" | "removing" | "removed"
  >("idle");

  // Get actual states from context
  const actualIsInCart = isProductInCart(product.id);
  const actualIsFavorite = isProductFavorite(product.id);

  const safeColorImages = useMemo(() => {
    return product.colorImages && typeof product.colorImages === 'object' 
      ? product.colorImages 
      : {};
  }, [product.colorImages]);

  // ✅ MODIFY: Use safeColorImages instead of product.colorImages
  const displayedColors = useMemo(() => {
    const availableColors = Object.keys(safeColorImages);
    const shuffled = [...availableColors].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }, [safeColorImages]);

  // ✅ MODIFY: Use safeColorImages
  const currentImageUrls = useMemo(() => {
    const colorToUse = internalSelectedColor || selectedColor;
    if (colorToUse && safeColorImages[colorToUse]?.length) {
      return safeColorImages[colorToUse];
    }
    return product.imageUrls || [];
  }, [
    internalSelectedColor,
    selectedColor,
    safeColorImages,
    product.imageUrls,
  ]);

  // Preload all images
  const { loadedImages, failedImages } = useImagePreloader(currentImageUrls);

  const handleCardClick = useCallback(() => {
    if (onTap) {
      onTap();
    } else {
      
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
    setImageError(false);
  }, [internalSelectedColor, selectedColor]);



  // Update internal selected color when prop changes
  useEffect(() => {
    setInternalSelectedColor(selectedColor || null);
  }, [selectedColor]);

  // Separated cart operation logic
  const performCartOperation = useCallback(
    async (selectedOptions?: { quantity?: number; [key: string]: unknown }) => {
      try {
        // Set loading state immediately
        setCartButtonState("adding");

        // Extract quantity from selectedOptions if provided
        let quantityToAdd = 1;
        const attributesToAdd = selectedOptions;

        if (selectedOptions && typeof selectedOptions.quantity === "number") {
          quantityToAdd = selectedOptions.quantity;
        }

        // Call the cart function with the correct quantity
        const result = await addToCart(
          product.id,
          quantityToAdd,
          attributesToAdd
        );

        // Set success state based on result
        if (result.includes("Added") || result.includes("Updated")) {
          setCartButtonState("added");
          setTimeout(() => setCartButtonState("idle"), 1500);
        } else {
          setCartButtonState("idle");
        }

        // Call prop callback if provided
        if (onAddToCart) {
          onAddToCart(product.id);
        }
      } catch (error) {
        console.error("Error with cart operation:", error);
        setCartButtonState("idle");
      }
    },
    [product, addToCart, onAddToCart]
  );

  // Add this new function to handle removal:
  const performCartRemoval = useCallback(async () => {
    try {
      setCartButtonState("removing");

      const result = await removeFromCart(product.id);

      if (result.includes("Removed")) {
        setCartButtonState("removed");
        setTimeout(() => setCartButtonState("idle"), 1500);
      } else {
        setCartButtonState("idle");
      }

      // Call prop callback if provided
      if (onAddToCart) {
        onAddToCart(product.id);
      }
    } catch (error) {
      console.error("Error removing from cart:", error);
      setCartButtonState("idle");
    }
  }, [product.id, removeFromCart, onAddToCart]);

  const handleAddToCart = useCallback(
    async (selectedOptions?: { quantity?: number; [key: string]: unknown }) => {
      if (!user) {
        router.push("/login");
        return;
      }
  
      const productInCart = actualIsInCart;
  
      // If product is in cart, remove it directly (toggle off)
      if (productInCart) {
        await performCartRemoval();
        return;
      }
  
      // ✅ CRITICAL FIX: Check if product has selectable options
      // Only show selector when ADDING and has options
      const productHasOptions = hasSelectableOptions(product);
     
  
      if (!productInCart && productHasOptions && !selectedOptions) {
        
        setShowCartOptionSelector(true);
        return;
      }
  
      // Perform cart addition with or without options
      await performCartOperation(selectedOptions);
    },
    [
      user,
      product,
      actualIsInCart,
      router,
      performCartRemoval,
      performCartOperation,
      setShowCartOptionSelector,
    ]
  );

  // Enhanced favorite functionality
  const handleToggleFavorite = useCallback(async () => {
    if (!user) {
      router.push("/login");
      return;
    }

    // Only show option selector when ADDING to favorites (not removing)
    if (!actualIsFavorite && hasSelectableOptions(product)) {
      setShowFavoriteOptionSelector(true);
      return;
    }

    // Direct favorite toggle for products without options OR when removing from favorites
    await performFavoriteToggle();
  }, [user, actualIsFavorite, product, router]);

  // Separated favorite toggle logic
  const performFavoriteToggle = useCallback(
    async (selectedOptions?: {
      selectedColor?: string;
      selectedColorImage?: string;
      quantity: number;
      [key: string]: unknown;
    }) => {
      try {
        const wasInFavorites = actualIsFavorite;

        setFavoriteButtonState(wasInFavorites ? "removing" : "adding");

        // Pass selected options if available
        const result = await addToFavorites(product.id, selectedOptions);

        if (result.includes("Added")) {
          setFavoriteButtonState("added");
        } else if (result.includes("Removed")) {
          setFavoriteButtonState("removed");
        }

        setTimeout(() => {
          setFavoriteButtonState("idle");
        }, 2000);

        // Call prop callback if provided
        if (onFavoriteToggle) {
          onFavoriteToggle(product.id);
        }
      } catch (error) {
        console.error("Error with favorite operation:", error);
        setFavoriteButtonState("idle");
      }
    },
    [product, actualIsFavorite, addToFavorites, onFavoriteToggle]
  );

  // Handle option selector confirmations
  const handleCartOptionSelectorConfirm = useCallback(
    async (selectedOptions: { quantity?: number; [key: string]: unknown }) => {
      setShowCartOptionSelector(false);
      await performCartOperation(selectedOptions);
    },
    [performCartOperation]
  );

  const handleFavoriteOptionSelectorConfirm = useCallback(
    async (selectedOptions: {
      selectedColor?: string;
      selectedColorImage?: string;
      quantity: number;
      [key: string]: unknown;
    }) => {
      setShowFavoriteOptionSelector(false);
      await performFavoriteToggle(selectedOptions);
    },
    [performFavoriteToggle]
  );

  // Handle option selector closes
  const handleCartOptionSelectorClose = useCallback(() => {
    setShowCartOptionSelector(false);
  }, []);

  const handleFavoriteOptionSelectorClose = useCallback(() => {
    setShowFavoriteOptionSelector(false);
  }, []);

  // Get cart button content
  const getCartButtonContent = useCallback(() => {
    const isOptimisticAdd = isOptimisticallyAdding(product.id);
    const isOptimisticRemove = isOptimisticallyRemoving(product.id);

    if (cartButtonState === "adding" || isOptimisticAdd) {
      return {
        icon: (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        className: isDarkMode ? "text-orange-400" : "text-orange-600",
      };
    }

    if (cartButtonState === "removing" || isOptimisticRemove) {
      return {
        icon: (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        className: isDarkMode ? "text-red-400" : "text-red-600",
      };
    }

    if (cartButtonState === "added") {
      return {
        icon: <Check size={16} />,
        className: "text-green-500",
      };
    }

    if (cartButtonState === "removed") {
      return {
        icon: <Check size={16} />,
        className: "text-green-500",
      };
    }

    if (actualIsInCart) {
      return {
        icon: <Minus size={16} />,
        className: isDarkMode ? "text-red-400" : "text-red-600",
      };
    }

    return {
      icon: <ShoppingCart size={16} />,
      className: isDarkMode ? "text-white" : "text-gray-800", // White in dark mode
    };
  }, [
    cartButtonState,
    actualIsInCart,
    isOptimisticallyAdding,
    isOptimisticallyRemoving,
    product.id,
    isDarkMode,
  ]);

  // Get favorite button content
  const getFavoriteButtonContent = useCallback(() => {
    if (favoriteButtonState === "adding") {
      return {
        icon: (
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        className: isDarkMode ? "text-pink-400" : "text-pink-600",
      };
    }

    if (favoriteButtonState === "removing") {
      return {
        icon: (
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        className: isDarkMode ? "text-gray-400" : "text-gray-600",
      };
    }

    if (favoriteButtonState === "added" || favoriteButtonState === "removed") {
      return {
        icon: <Check size={12} />,
        className: "text-green-500",
      };
    }

    return {
      icon: (
        <Heart
          size={12}
          className={
            actualIsFavorite ? "fill-red-500 text-red-500" : "text-gray-500"
          }
        />
      ),
      className: "",
    };
  }, [favoriteButtonState, actualIsFavorite, isDarkMode]);

  // Reset button states when optimistic operations complete
  useEffect(() => {
    const isOptimisticAdd = isOptimisticallyAdding(product.id);
    const isOptimisticRemove = isOptimisticallyRemoving(product.id);

    // Only reset if we're in a loading state but no optimistic operations are happening
    if (
      (cartButtonState === "adding" || cartButtonState === "removing") &&
      !isOptimisticAdd &&
      !isOptimisticRemove
    ) {
      setCartButtonState("idle");
    }
  }, [
    product.id,
    isOptimisticallyAdding,
    isOptimisticallyRemoving,
    cartButtonState,
  ]);

  const effectiveScaleFactor = scaleFactor;
  const finalInternalScaleFactor =
    overrideInternalScaleFactor ?? internalScaleFactor;
  const textScaleFactor = effectiveScaleFactor * 0.9 * finalInternalScaleFactor;

  const hasDiscount = (product.discountPercentage ?? 0) > 0;
  const hasFastDelivery = product.deliveryOption === "Fast Delivery";
  const hasDiscountBanner = (product.discountPercentage ?? 0) >= 10;

  const imageHeight = portraitImageHeight
    ? `${portraitImageHeight * effectiveScaleFactor}px`
    : undefined;

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

  const handleNextImage = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Don't allow navigation for fantasy products
    if (isFantasyProduct(product)) return;

    setCurrentImageIndex((prev) =>
      prev === currentImageUrls.length - 1 ? 0 : prev + 1
    );
  };

  const handlePrevImage = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Don't allow navigation for fantasy products
    if (isFantasyProduct(product)) return;

    setCurrentImageIndex((prev) =>
      prev === 0 ? currentImageUrls.length - 1 : prev - 1
    );
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

  const currentImageUrl = currentImageUrls[currentImageIndex];
  const isImageLoaded = currentImageUrl && loadedImages.has(currentImageUrl);
  const isImageFailed = currentImageUrl && failedImages.has(currentImageUrl);

  const cartButtonContent = getCartButtonContent();
  const favoriteButtonContent = getFavoriteButtonContent();

  const isProcessingCart =
    cartButtonState === "adding" ||
    cartButtonState === "removing" ||
    isOptimisticallyAdding(product.id) ||
    isOptimisticallyRemoving(product.id);

  const isProcessingFavorite =
    favoriteButtonState === "adding" || favoriteButtonState === "removing";

  return (
    <>
      <div
        className="w-full cursor-pointer transition-transform duration-200 hover:scale-105"
        onClick={handleCardClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{ transform: `scale(${effectiveScaleFactor})` }}
      >
        <div className="flex flex-col w-full">
          {/* Image Section */}
          <div
            className="relative group h-[28vh] lg:h-[38vh]"
            style={imageHeight ? { height: imageHeight } : {}}
          >
            <div className="w-full h-full rounded-t-xl overflow-hidden bg-gray-200 relative">
              {currentImageUrls.length > 0 ? (
                <div className="relative w-full h-full">
                  {/* Image with smooth transition */}
                  <div className="relative w-full h-full">
                    {isImageLoaded && !imageError ? (
                      <Image
                        src={currentImageUrl}
                        alt={product.productName}
                        fill
                        className="object-cover transition-opacity duration-300"
                        onError={() => setImageError(true)}
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                        priority={currentImageIndex === 0}
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

                  {/* Navigation buttons - hide for fantasy products, show on hover for others */}
                  {currentImageUrls.length > 1 &&
                    !isFantasyProduct(product) && (
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

                  {/* Blur overlay for fantasy products */}
                  {isFantasyProduct(product) && (
                    <div
                      className="absolute inset-0 backdrop-blur-[15px] bg-black/10"
                      style={{
                        backdropFilter: "blur(15px)",
                        WebkitBackdropFilter: "blur(15px)",
                      }}
                    />
                  )}

                  {/* +18 Label for fantasy products */}
                  {isFantasyProduct(product) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div
                        className="px-6 py-3 bg-red-600/90 rounded-xl border-2 border-white"
                        style={{
                          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
                        }}
                      >
                        <span
                          className="text-white font-bold"
                          style={{
                            fontSize: "32px",
                            letterSpacing: "2px",
                          }}
                        >
                          +18
                        </span>
                      </div>
                    </div>
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
                className="w-7 h-7 bg-white bg-opacity-90 rounded-full flex items-center justify-center shadow-sm hover:bg-opacity-100 transition-all relative overflow-hidden"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFavorite();
                }}
                disabled={isProcessingFavorite}
              >
                <span
                  className={`transition-all duration-300 ${
                    favoriteButtonState === "added" ||
                    favoriteButtonState === "removed"
                      ? "animate-pulse"
                      : ""
                  } ${favoriteButtonContent.className}`}
                >
                  {favoriteButtonContent.icon}
                </span>

                {/* Success animation overlay */}
                {(favoriteButtonState === "added" ||
                  favoriteButtonState === "removed") && (
                  <div className="absolute inset-0 bg-green-500/10 animate-pulse rounded-full" />
                )}
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
                  className="w-6 h-6 flex items-center justify-center transform -translate-y-1 transition-all hover:scale-110 relative overflow-hidden"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToCart();
                  }}
                  disabled={isProcessingCart}
                >
                  <span
                    className={`transition-all duration-300 ${
                      cartButtonState === "added" ||
                      cartButtonState === "removed"
                        ? "animate-pulse"
                        : ""
                    } ${cartButtonContent.className}`}
                  >
                    {cartButtonContent.icon}
                  </span>

                  {/* Success animation overlay */}
                  {(cartButtonState === "added" ||
                    cartButtonState === "removed") && (
                    <div className="absolute inset-0 bg-green-500/10 animate-pulse rounded-full" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Option Selector Modals */}
      <ProductOptionSelector
        product={product}
        isOpen={showCartOptionSelector}
        onClose={handleCartOptionSelectorClose}
        onConfirm={handleCartOptionSelectorConfirm}
        isDarkMode={isDarkMode}
        localization={localization}
      />

      <ProductOptionSelector
        product={product}
        isOpen={showFavoriteOptionSelector}
        onClose={handleFavoriteOptionSelectorClose}
        onConfirm={handleFavoriteOptionSelectorConfirm}
        isDarkMode={isDarkMode}
        localization={localization}
      />
    </>
  );
};

export default ProductCard;
