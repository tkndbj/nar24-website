// components/ProductCard.tsx
"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  memo,
  useRef,
} from "react";
import { BoostedVisibilityWrapper } from "@/app/components/BoostedVisibilityWrapper";
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
import dynamic from "next/dynamic";

const ProductOptionSelector = dynamic(
  () => import("@/app/components/ProductOptionSelector"),
  { ssr: false }
);
import { Product } from "@/app/models/Product";
import { analyticsBatcher } from "@/app/utils/analyticsBatcher";
import { useProductCache } from "@/context/ProductCacheProvider";
import { userActivityService } from "@/services/userActivity";

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

// ✅ Static constants for performance
const NAVIGATION_THROTTLE = 500;
const JADE_GREEN = "#00A86B";

// ✅ Static color map (computed once)
const COLOR_MAP: Record<string, string> = {
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

// ✅ Memoized helper functions
const isFantasyProduct = (product: Product): boolean => {
  return product.subsubcategory?.toLowerCase() === "fantasy";
};

const getColorFromName = (colorName: string): string => {
  return COLOR_MAP[colorName.toLowerCase()] || "#9E9E9E";
};

// ✅ Check if product has selectable options (for cart ONLY)
const hasSelectableOptionsForCart = (product: Product | null): boolean => {
  if (!product) return false;

  const colorImages = product.colorImages;
  const hasColors =
    colorImages != null &&
    typeof colorImages === "object" &&
    Object.keys(colorImages).length > 0;
  if (hasColors) return true;

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

      return options.length > 1;
    }
  );

  return selectableAttrs.length > 0;
};

// ✅ Enhanced image preloader with caching and stable state management
const useImagePreloader = (urls: string[]) => {
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const preloadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!urls.length) return;

    // Filter out already processed URLs to avoid redundant work
    const urlsToProcess = urls.filter((url) => !preloadedRef.current.has(url));

    if (urlsToProcess.length === 0) return;

    urlsToProcess.forEach((url) => {
      // Mark as being processed
      preloadedRef.current.add(url);

      const img = new window.Image();
      img.onload = () => {
        setLoadedImages((prev) => {
          const next = new Set(prev);
          next.add(url);
          return next;
        });
      };
      img.onerror = () => {
        setFailedImages((prev) => {
          const next = new Set(prev);
          next.add(url);
          return next;
        });
      };
      img.src = url;
    });
  }, [urls]);

  return { loadedImages, failedImages };
};

// ✅ Optimized rotating text component
interface RotatingTextProps {
  children: React.ReactNode[];
  duration?: number;
  className?: string;
}

export const RotatingText = memo<RotatingTextProps>(
  ({ children, duration = 1500, className = "" }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastUpdateRef = useRef<number>(0);
    const rafIdRef = useRef<number | null>(null);
    const isVisibleRef = useRef(true);

    useEffect(() => {
      if (children.length <= 1) return;

      const observer = new IntersectionObserver(
        (entries) => {
          isVisibleRef.current = entries[0]?.isIntersecting ?? false;
        },
        { threshold: 0.1 }
      );

      if (containerRef.current) {
        observer.observe(containerRef.current);
      }

      const animate = (timestamp: number) => {
        if (isVisibleRef.current) {
          if (timestamp - lastUpdateRef.current >= duration) {
            setCurrentIndex((prev) => (prev + 1) % children.length);
            lastUpdateRef.current = timestamp;
          }
        } else {
          lastUpdateRef.current = timestamp;
        }

        rafIdRef.current = requestAnimationFrame(animate);
      };

      rafIdRef.current = requestAnimationFrame(animate);

      const handleVisibilityChange = () => {
        if (document.hidden) {
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
        } else {
          lastUpdateRef.current = performance.now();
          rafIdRef.current = requestAnimationFrame(animate);
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
        }
        observer.disconnect();
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
      };
    }, [children.length, duration]);

    if (children.length === 0) return null;
    if (children.length === 1) {
      return <div className={className}>{children[0]}</div>;
    }

    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden ${className}`}
        style={{ height: "18px" }} // ✅ Increased from 16px to 18px
      >
        {children.map((child, index) => (
          <div
            key={index}
            className={`absolute w-full transition-all duration-500 ease-in-out ${
              index === currentIndex
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            }`}
            style={{
              willChange:
                index === currentIndex ? "opacity, transform" : "auto",
              lineHeight: "18px", // ✅ Added explicit line-height to match container
              height: "18px", // ✅ Added explicit height
            }}
          >
            {child}
          </div>
        ))}
      </div>
    );
  }
);

RotatingText.displayName = "RotatingText";

// ✅ Optimized rotating banner
interface RotatingBannerProps {
  children: React.ReactNode[];
  duration?: number;
  height?: number;
}

export const RotatingBanner = memo<RotatingBannerProps>(
  ({ children, duration = 2000, height = 20 }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastUpdateRef = useRef<number>(0);
    const rafIdRef = useRef<number | null>(null);
    const isVisibleRef = useRef(true);

    useEffect(() => {
      if (children.length <= 1) return;

      const observer = new IntersectionObserver(
        (entries) => {
          isVisibleRef.current = entries[0]?.isIntersecting ?? false;
        },
        { threshold: 0.1 }
      );

      if (containerRef.current) {
        observer.observe(containerRef.current);
      }

      const animate = (timestamp: number) => {
        if (isVisibleRef.current) {
          if (timestamp - lastUpdateRef.current >= duration) {
            setCurrentIndex((prev) => (prev + 1) % children.length);
            lastUpdateRef.current = timestamp;
          }
        } else {
          lastUpdateRef.current = timestamp;
        }
        rafIdRef.current = requestAnimationFrame(animate);
      };

      rafIdRef.current = requestAnimationFrame(animate);

      const handleVisibilityChange = () => {
        if (document.hidden) {
          if (rafIdRef.current) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }
        } else {
          lastUpdateRef.current = performance.now();
          rafIdRef.current = requestAnimationFrame(animate);
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current);
        }
        observer.disconnect();
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
      };
    }, [children.length, duration]);

    if (children.length === 0) return null;
    if (children.length === 1) {
      return <div style={{ height }}>{children[0]}</div>;
    }

    return (
      <div
        ref={containerRef}
        style={{ height }}
        className="relative overflow-hidden"
      >
        {children.map((child, index) => (
          <div
            key={index}
            className={`absolute w-full transition-all duration-500 ease-in-out ${
              index === currentIndex
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-full"
            }`}
            style={{
              height,
              willChange:
                index === currentIndex ? "opacity, transform" : "auto",
            }}
          >
            {child}
          </div>
        ))}
      </div>
    );
  }
);

RotatingBanner.displayName = "RotatingBanner";

// ✅ Star rating component
const StarRating = memo<{ rating: number; size?: number }>(
  ({ rating, size = 14 }) => {
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
  }
);
StarRating.displayName = "StarRating";

// ✅ Extra label component
const ExtraLabel = memo<{ text: string; gradientColors: string[] }>(
  ({ text, gradientColors }) => {
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
  }
);
ExtraLabel.displayName = "ExtraLabel";

// ✅ Logo placeholder component
const LogoPlaceholder = memo<{ size?: number }>(({ size = 120 }) => {
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
});
LogoPlaceholder.displayName = "LogoPlaceholder";

// ============= MAIN PRODUCT CARD COMPONENT =============

const ProductCardComponent: React.FC<ProductCardProps> = ({
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
  const { setProduct } = useProductCache();
  const t = useTranslations();

  // Cart, favorites, and user hooks
  const { addProductToCart, removeFromCart, cartProductIds } = useCart();
  const {
    addToFavorites,
    removeMultipleFromFavorites,
    isFavorite: isProductFavorite,
  } = useFavorites();
  const { user } = useUser();

  const isProductInCart = useCallback(
    (productId: string) => cartProductIds.has(productId),
    [cartProductIds]
  );

  const [isDarkModeState, setIsDarkMode] = useState(false);
  const isDarkMode =
    isDarkModeProp !== undefined ? isDarkModeProp : isDarkModeState;

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [internalSelectedColor, setInternalSelectedColor] = useState<
    string | null
  >(selectedColor || null);
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showEnlargedImage, setShowEnlargedImage] = useState(false);
  const [enlargedImagePosition, setEnlargedImagePosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [, setIsMobile] = useState(false);

  // ✅ CRITICAL: Only show selector for CART operations, not favorites
  const [showCartOptionSelector, setShowCartOptionSelector] = useState(false);

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

  // ✅ Navigation throttling (matches Flutter implementation)
  const lastNavigationTimeRef = useRef<number>(0);

  // ✅ Safe color images extraction
  const safeColorImages = useMemo(() => {
    return product.colorImages && typeof product.colorImages === "object"
      ? product.colorImages
      : {};
  }, [product.colorImages]);

  // ✅ Displayed colors (max 4, shuffled) - matches Flutter
  const displayedColors = useMemo(() => {
    const availableColors = Object.keys(safeColorImages);
    if (availableColors.length === 0) return [];

    // Shuffle and take 4 (matches Flutter's Random().shuffle())
    const shuffled = [...availableColors].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 4);
  }, [safeColorImages]);

  // ✅ Current image URLs based on selected color
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
  const { failedImages } = useImagePreloader(currentImageUrls);

  // ✅ Cache product on mount (matches Flutter's ProductDetailProvider pattern)
  useEffect(() => {
    setProduct(product.id, product);
  }, [product, setProduct]);

  // ✅ CRITICAL: Throttled navigation (matches Flutter's 500ms throttle)
  const handleCardClick = useCallback(() => {
    const now = Date.now();

    // Throttle rapid taps
    if (now - lastNavigationTimeRef.current < NAVIGATION_THROTTLE) {
      return;
    }

    lastNavigationTimeRef.current = now;

    userActivityService.trackClick({
      productId: product.id,
      shopId: product.shopId,
      productName: product.productName,
      category: product.category,
      subcategory: product.subcategory,
      subsubcategory: product.subsubcategory,
      brand: product.brandModel,
      price: product.price,
    });

    // Record click analytics (matches Flutter's market.incrementClickCount)
    analyticsBatcher.recordClick(product.id, product.shopId);

    // ✅ Precache hero image (matches Flutter's precacheImage)
    if (product.imageUrls.length > 0) {
      const img = new window.Image();
      img.src = product.imageUrls[0];
    }

    // Navigate
    if (onTap) {
      onTap();
    } else {
      router.push(`/productdetail/${product.id}`);
    }
  }, [product, router, onTap]);

  // ✅ Check theme changes
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

  // ✅ Detect mobile/touch devices to disable hover zoom
  useEffect(() => {
    const checkMobile = () => {
      const isTouchDevice =
        "ontouchstart" in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(isTouchDevice || isSmallScreen);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Reset image index when color changes (matches Flutter's didUpdateWidget)
  useEffect(() => {
    setCurrentImageIndex(0);
    setImageError(false);
    setImageLoaded(false);
  }, [internalSelectedColor, selectedColor]);

  // Update internal selected color when prop changes
  useEffect(() => {
    setInternalSelectedColor(selectedColor || null);
  }, [selectedColor]);

  // ✅ CART OPERATIONS (matches Flutter implementation)
  const performCartOperation = useCallback(
    async (selectedOptions?: { quantity?: number; [key: string]: unknown }) => {
      try {
        setCartButtonState("adding");

        let quantityToAdd = 1;
        let selectedColor: string | undefined;
        const attributes: Record<string, unknown> = {};

        if (selectedOptions) {
          if (typeof selectedOptions.quantity === "number") {
            quantityToAdd = selectedOptions.quantity;
          }

          if (typeof selectedOptions.selectedColor === "string") {
            selectedColor = selectedOptions.selectedColor;
          }

          Object.entries(selectedOptions).forEach(([key, value]) => {
            if (key !== "quantity" && key !== "selectedColor") {
              attributes[key] = value;
            }
          });
        }

        const result = await addProductToCart(
          product,
          quantityToAdd,
          selectedColor,
          attributes
        );

        if (result.includes("Added") || result.includes("Updated")) {
          setCartButtonState("added");
          setTimeout(() => setCartButtonState("idle"), 1500);
        } else {
          setCartButtonState("idle");
        }

        if (onAddToCart) {
          onAddToCart(product.id);
        }
      } catch (error) {
        console.error("Error with cart operation:", error);
        setCartButtonState("idle");
      }
    },
    [product, addProductToCart, onAddToCart]
  );

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

      if (productInCart) {
        await performCartRemoval();
        return;
      }

      // ✅ Show selector ONLY for cart if product has options
      const productHasOptions = hasSelectableOptionsForCart(product);

      if (!productInCart && productHasOptions && !selectedOptions) {
        setShowCartOptionSelector(true);
        return;
      }

      await performCartOperation(selectedOptions);
    },
    [
      user,
      product,
      actualIsInCart,
      router,
      performCartRemoval,
      performCartOperation,
    ]
  );

  // ✅ FAVORITE OPERATIONS (matches Flutter - NO selector, direct add)
  const handleToggleFavorite = useCallback(async () => {
    if (!user) {
      router.push("/login");
      return;
    }

    try {
      const wasInFavorites = actualIsFavorite;

      setFavoriteButtonState(wasInFavorites ? "removing" : "adding");

      let result: string;

      if (wasInFavorites) {
        // Remove from favorites
        result = await removeMultipleFromFavorites([product.id]);
      } else {
        // ✅ CRITICAL: Add directly WITHOUT selector (matches Flutter)
        result = await addToFavorites(product.id, {
          quantity: 1,
          ...(product.imageUrls.length > 0 && {
            selectedColorImage: product.imageUrls[0],
          }),
          // selectedColor and selectedColorImage will be undefined if not set
        });
      }

      if (result.includes("Added")) {
        setFavoriteButtonState("added");
      } else if (result.includes("Removed")) {
        setFavoriteButtonState("removed");
      }

      setTimeout(() => {
        setFavoriteButtonState("idle");
      }, 2000);

      if (onFavoriteToggle) {
        onFavoriteToggle(product.id);
      }
    } catch (error) {
      console.error("Error with favorite operation:", error);
      setFavoriteButtonState("idle");
    }
  }, [
    user,
    product,
    actualIsFavorite,
    router,
    addToFavorites,
    removeMultipleFromFavorites,
    onFavoriteToggle,
  ]);

  // Handle cart option selector confirmations
  const handleCartOptionSelectorConfirm = useCallback(
    async (selectedOptions: { quantity?: number; [key: string]: unknown }) => {
      setShowCartOptionSelector(false);
      await performCartOperation(selectedOptions);
    },
    [performCartOperation]
  );

  const handleCartOptionSelectorClose = useCallback(() => {
    setShowCartOptionSelector(false);
  }, []);

  // ✅ Get cart button content (matches Flutter states)
  const getCartButtonContent = useCallback(() => {
    if (cartButtonState === "adding") {
      return {
        icon: (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        className: isDarkMode ? "text-orange-400" : "text-orange-600",
      };
    }

    if (cartButtonState === "removing") {
      return {
        icon: (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        className: isDarkMode ? "text-red-400" : "text-red-600",
      };
    }

    if (cartButtonState === "added" || cartButtonState === "removed") {
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
      className: isDarkMode ? "text-white" : "text-gray-800",
    };
  }, [cartButtonState, actualIsInCart, isDarkMode]);

  // Check if add to cart should be disabled
  const isAddToCartDisabled = useMemo(() => {
    // Disable if quantity is 0 AND no color options available
    const hasNoStock = product.quantity === 0;
    const hasColorOptions =
      product.colorQuantities &&
      Object.keys(product.colorQuantities).length > 0;

    return hasNoStock && !hasColorOptions;
  }, [product]);

  // ✅ Get favorite button content (matches Flutter states)
  const getFavoriteButtonContent = useCallback(() => {
    if (
      favoriteButtonState === "adding" ||
      favoriteButtonState === "removing"
    ) {
      return {
        icon: (
          <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        className: isDarkMode ? "text-pink-400" : "text-pink-600",
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

  // ✅ Build rotating children for description area (matches Flutter)
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
          className="font-bold truncate"
          style={{ color: JADE_GREEN, fontSize: "12px" }}
        >
          {t("ProductCard.onlyLeft", { quantity })}
        </span>
      );
    }

    return children;
  }, [product.brandModel, product.quantity, t]);

  // ✅ Build banner children (matches Flutter)
  const bannerChildren = useMemo(() => {
    const children: React.ReactNode[] = [];

    if (hasFastDelivery) {
      children.push(
        <div
          key="delivery"
          className="w-full h-full bg-orange-500 flex items-center justify-center text-white text-xs font-medium"
        >
          {t("ProductCard.fastDelivery")}
        </div>
      );
    }

    if (hasDiscountBanner) {
      children.push(
        <div
          key="discount"
          className="w-full h-full flex items-center justify-center text-white text-xs font-medium"
          style={{ backgroundColor: JADE_GREEN }}
        >
          {t("ProductCard.discount")}
        </div>
      );
    }

    return children;
  }, [hasFastDelivery, hasDiscountBanner, t]);

  // ✅ Color selection handler (matches Flutter)
  const handleColorSelect = useCallback(
    (color: string) => {
      const newColor = internalSelectedColor === color ? null : color;
      setInternalSelectedColor(newColor);
      setCurrentImageIndex(0);
      onColorSelect?.(newColor || "");
    },
    [internalSelectedColor, onColorSelect]
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

  const handlePrevImage = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setCurrentImageIndex((prev) =>
        prev === 0 ? currentImageUrls.length - 1 : prev - 1
      );
    },
    [currentImageUrls.length]
  );

  const imageContainerRef = useRef<HTMLDivElement>(null);

  const handleImageHover = useCallback(() => {
    setIsHovered(true);
    // Set timeout to show enlarged image after 1 second
    hoverTimeoutRef.current = setTimeout(() => {
      if (imageContainerRef.current) {
        const rect = imageContainerRef.current.getBoundingClientRect();
        const enlargedWidth = 550;
        const enlargedHeight = 550;
        const padding = 16;

        // Try to position to the right of the card
        let left = rect.right + padding;
        let top = rect.top + rect.height / 2 - enlargedHeight / 2;

        // If it would go off the right edge, position to the left
        if (left + enlargedWidth > window.innerWidth - padding) {
          left = rect.left - enlargedWidth - padding;
        }

        // If it would go off the left edge, fallback to right side overlapping
        if (left < padding) {
          left = rect.right + padding;
        }

        // Ensure it doesn't go above the viewport
        if (top < padding) {
          top = padding;
        }

        // Ensure it doesn't go below the viewport
        if (top + enlargedHeight > window.innerHeight - padding) {
          top = window.innerHeight - enlargedHeight - padding;
        }

        setEnlargedImagePosition({ top, left });
      }
      setShowEnlargedImage(true);
    }, 1000);
  }, []);

  const handleImageLeave = useCallback(() => {
    setIsHovered(false);
    // Clear timeout and hide enlarged image
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setShowEnlargedImage(false);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // ✅ Global mouse position check to ensure enlarged image dismisses properly
  useEffect(() => {
    if (!showEnlargedImage) return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!imageContainerRef.current) {
        setShowEnlargedImage(false);
        return;
      }

      const rect = imageContainerRef.current.getBoundingClientRect();
      const buffer = 20; // Small buffer zone

      const isOutside =
        e.clientX < rect.left - buffer ||
        e.clientX > rect.right + buffer ||
        e.clientY < rect.top - buffer ||
        e.clientY > rect.bottom + buffer;

      if (isOutside) {
        setShowEnlargedImage(false);
        setIsHovered(false);
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
      }
    };

    // Add listener with a small delay to avoid immediate dismissal
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousemove", handleGlobalMouseMove);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, [showEnlargedImage]);

  // ✅ Determine active dot for pagination (matches Flutter logic)
  const getActiveDotIndex = useCallback(() => {
    const imageCount = currentImageUrls.length;
    if (imageCount <= 3) {
      return Math.min(currentImageIndex, imageCount - 1);
    }
    if (currentImageIndex === 0) return 0;
    if (currentImageIndex === imageCount - 1) return 2;
    return 1;
  }, [currentImageUrls.length, currentImageIndex]);

  const currentImageUrl = currentImageUrls[currentImageIndex];
  // Use failedImages from preloader as a hint, but rely on the Image component's own error handling
  const isImageFailed = currentImageUrl && failedImages.has(currentImageUrl);

  // Reset imageLoaded state when currentImageUrl changes
  const prevImageUrlRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevImageUrlRef.current !== currentImageUrl) {
      setImageLoaded(false);
      setImageError(false);
      prevImageUrlRef.current = currentImageUrl;
    }
  }, [currentImageUrl]);

  const cartButtonContent = getCartButtonContent();
  const favoriteButtonContent = getFavoriteButtonContent();

  const isProcessingCart =
    cartButtonState === "adding" || cartButtonState === "removing";

  const isProcessingFavorite =
    favoriteButtonState === "adding" || favoriteButtonState === "removing";

  const isBoosted = product.isBoosted === true;
  const isFantasy = isFantasyProduct(product);

  const cardContent = (
    <>
      <div
        className="w-full cursor-pointer transition-transform duration-200 hover:scale-105"
        onClick={handleCardClick}
        style={{ transform: `scale(${effectiveScaleFactor})` }}
      >
        <div className="flex flex-col w-full">
          {/* Image Section */}
          <div
            ref={imageContainerRef}
            className="relative group h-[28vh] md:h-[38vh]"
            style={imageHeight ? { height: imageHeight } : {}}
            onMouseEnter={handleImageHover}
            onMouseLeave={handleImageLeave}
          >
            <div className="w-full h-full rounded-t-xl overflow-hidden relative">
              {currentImageUrls.length > 0 && currentImageUrl ? (
                <div className="relative w-full h-full">
                  {/* Background placeholder - always visible until image loads */}
                  <div
                    className={`absolute inset-0 flex items-center justify-center bg-gray-100 transition-opacity duration-300 ${
                      imageLoaded && !imageError ? "opacity-0" : "opacity-100"
                    }`}
                    style={{ zIndex: 1 }}
                  >
                    {imageError || isImageFailed ? (
                      <ImageOff size={32} className="text-gray-400" />
                    ) : (
                      <LogoPlaceholder size={80} />
                    )}
                  </div>

                  {/* Main image - always rendered, uses opacity for smooth transition */}
                  {!imageError && !isImageFailed && (
                    <Image
                      key={currentImageUrl}
                      src={currentImageUrl}
                      alt={product.productName}
                      fill
                      className={`object-cover transition-opacity duration-300 ${
                        imageLoaded ? "opacity-100" : "opacity-0"
                      }`}
                      style={{ zIndex: 2 }}
                      onLoad={() => setImageLoaded(true)}
                      onError={() => {
                        setImageError(true);
                        setImageLoaded(false);
                      }}
                      sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                      priority={currentImageIndex === 0}
                    />
                  )}

                  {/* Navigation buttons */}
                  {currentImageUrls.length > 1 && !isFantasy && (
                    <>
                      <button
                        className={`absolute left-2 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-black bg-opacity-50 rounded-full flex items-center justify-center text-white transition-opacity duration-150 ${
                          isHovered ? "opacity-100" : "opacity-0"
                        }`}
                        style={{ zIndex: 5 }}
                        onClick={handlePrevImage}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        className={`absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-black bg-opacity-50 rounded-full flex items-center justify-center text-white transition-opacity duration-150 ${
                          isHovered ? "opacity-100" : "opacity-0"
                        }`}
                        style={{ zIndex: 5 }}
                        onClick={handleNextImage}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </>
                  )}

                  {/* Blur overlay for fantasy products */}
                  {isFantasy && (
                    <div
                      className="absolute inset-0 backdrop-blur-[15px] bg-black/10"
                      style={{
                        backdropFilter: "blur(15px)",
                        WebkitBackdropFilter: "blur(15px)",
                        zIndex: 3,
                      }}
                    />
                  )}

                  {/* +18 Label for fantasy products */}
                  {isFantasy && (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ zIndex: 4 }}
                    >
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
                <div className="w-full h-full flex items-center justify-center bg-gray-100">
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
                  {t("ProductCard.featured")}
                </div>
              </div>
            )}

            {/* Image Dots */}
            {currentImageUrls.length > 1 && !isFantasy && (
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
                      className="font-bold"
                      style={{
                        fontSize: `${12 * textScaleFactor}px`,
                        color: JADE_GREEN,
                      }}
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
                  className={`w-6 h-6 flex items-center justify-center transform -translate-y-1 transition-all hover:scale-110 relative overflow-hidden ${
                    isAddToCartDisabled ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToCart();
                  }}
                  disabled={isProcessingCart || isAddToCartDisabled}
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

      {/* Enlarged Image Preview - Positioned near the product card */}
      {showEnlargedImage && currentImageUrl && enlargedImagePosition && (
        <div
          className="fixed z-[99999]"
          style={{
            top: enlargedImagePosition.top,
            left: enlargedImagePosition.left,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.3)",
              backdropFilter: "blur(4px)",
              borderRadius: "12px",
              padding: "8px",
              display: "inline-block",
            }}
          >
            <img
              src={currentImageUrl}
              alt={product.productName}
              style={{
                objectFit: "contain",
                maxWidth: "550px",
                maxHeight: "550px",
                width: "auto",
                height: "auto",
                display: "block",
                borderRadius: "8px",
                boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
                border: "3px solid white",
              }}
              loading="eager"
            />
          </div>
        </div>
      )}
    </>
  );

  if (isBoosted) {
    return (
      <>
        <BoostedVisibilityWrapper productId={product.id} enabled={true}>
          {cardContent}
        </BoostedVisibilityWrapper>

        {/* ✅ Only Cart Option Selector (no favorite selector) */}
        <ProductOptionSelector
          product={product}
          isOpen={showCartOptionSelector}
          onClose={handleCartOptionSelectorClose}
          onConfirm={handleCartOptionSelectorConfirm}
          isDarkMode={isDarkMode}
          localization={localization}
        />
      </>
    );
  }

  return (
    <>
      {cardContent}

      {/* ✅ Only Cart Option Selector (no favorite selector) */}
      <ProductOptionSelector
        product={product}
        isOpen={showCartOptionSelector}
        onClose={handleCartOptionSelectorClose}
        onConfirm={handleCartOptionSelectorConfirm}
        isDarkMode={isDarkMode}
        localization={localization}
      />
    </>
  );
};

// ✅ Export memoized version for performance
export const ProductCard = memo(ProductCardComponent);
export default ProductCard;
