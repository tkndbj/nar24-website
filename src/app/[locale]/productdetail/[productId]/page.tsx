// src/app/product/[productId]/page.tsx

"use client";

import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Share2,
  ShoppingCart,
  Play,
  X,
  Check,
  Minus,
  Heart,
} from "lucide-react";
import Image from "next/image";
import ProductDetailActionsRow from "../../../components/product_detail/ProductDetailActionsRow";
import DynamicAttributesWidget from "../../../components/product_detail/DynamicAttributesWidget";
import ProductDetailSellerInfo from "../../../components/product_detail/SellerInfo";
import ProductOptionSelector from "@/app/components/ProductOptionSelector";
import { useCart } from "@/context/CartProvider";
import { useUser } from "@/context/UserProvider";
import { Product, ProductUtils } from "@/app/models/Product";

// ✅ LAZY LOAD: Heavy components that aren't immediately visible
const ProductCollectionWidget = lazy(() => import("../../../components/product_detail/ProductCollectionWidget"));
const FullScreenImageViewer = lazy(() => import("../../../components/product_detail/FullScreenImageViewer"));
const ProductDetailReviewsTab = lazy(() => import("../../../components/product_detail/Reviews"));
const ProductQuestionsWidget = lazy(() => import("../../../components/product_detail/Questions"));
const ProductDetailRelatedProducts = lazy(() => import("../../../components/product_detail/RelatedProducts"));
const BundleComponent = lazy(() => import('@/app/components/product_detail/BundleComponent'));
const AskToSellerBubble = lazy(() => import('@/app/components/product_detail/AskToSeller'));

interface ProductDetailPageProps {
  params: Promise<{ productId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

// Enhanced helper function to check if product has selectable options
const hasSelectableOptions = (product: Product | null): boolean => {
  if (!product) return false;

  const hasColors = Object.keys(product.colorImages || {}).length > 0;
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

// ✅ LOADING SKELETON: Memoized component outside main component
const LoadingSkeleton = React.memo(({ isDarkMode }: { isDarkMode: boolean }) => (
  <div className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
    <div
      className={`sticky top-0 z-10 border-b ${
        isDarkMode
          ? "bg-gray-800 border-gray-700"
          : "bg-white border-gray-200"
      }`}
    >
      <div className="flex items-center justify-between p-3 sm:p-4">
        <div
          className={`w-6 h-6 rounded animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`}
        />
        <div
          className={`w-6 h-6 rounded animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`}
        />
      </div>
    </div>
    <div className="grid lg:grid-cols-2 gap-4 sm:gap-8 max-w-6xl mx-auto p-3 sm:p-4">
      <div
        className={`w-full h-64 sm:h-96 lg:h-[500px] animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`}
      />
      <div className="space-y-3 sm:space-y-4">
        <div
          className={`h-6 rounded animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`}
        />
        <div
          className={`h-16 rounded animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`}
        />
        <div
          className={`h-20 rounded animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`}
        />
      </div>
    </div>
  </div>
));
LoadingSkeleton.displayName = 'LoadingSkeleton';

const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ params }) => {
  const router = useRouter();
  const localization = useTranslations();
  const [productId, setProductId] = useState<string>("");

  // ✅ OPTIMIZED: Translation function with better caching
  const t = useCallback((key: string) => {
    if (!localization) return key;

    try {
      const translation = localization(`ProductDetailPage.${key}`);
      
      if (translation && translation !== `ProductDetailPage.${key}`) {
        return translation;
      }
      
      const directTranslation = localization(key);
      if (directTranslation && directTranslation !== key) {
        return directTranslation;
      }
      
      return key;
    } catch (error) {
      return key;
    }
  }, [localization]);

  // Cart and user hooks
  const {
    addToCart,
    isInCart,
    isOptimisticallyAdding,
    isOptimisticallyRemoving,
    removeFromCart,
  } = useCart();
  const { user } = useUser();

  // Animation states
  const [cartButtonState, setCartButtonState] = useState<
    "idle" | "adding" | "added" | "removing" | "removed"
  >("idle");

  // Option selector state
  const [showCartOptionSelector, setShowCartOptionSelector] = useState(false);

  // UI states
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showFullScreenViewer, setShowFullScreenViewer] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  // ✅ NEW: Track if user has scrolled down to lazy load components
  const [hasScrolled, setHasScrolled] = useState(false);

  // Resolve params
  useEffect(() => {
    params.then((resolvedParams) => {
      setProductId(resolvedParams.productId);
    });
  }, [params]);

  // ✅ OPTIMIZED: Dark mode detection with debouncing
  useEffect(() => {
    if (typeof window === "undefined") return;

    let timeoutId: NodeJS.Timeout;

    const detectDarkMode = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const htmlElement = document.documentElement;
        const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

        const isDark =
          htmlElement.classList.contains("dark") ||
          htmlElement.getAttribute("data-theme") === "dark" ||
          darkModeMediaQuery.matches;

        setIsDarkMode(isDark);
      }, 50); // Debounce by 50ms
    };

    detectDarkMode();

    const observer = new MutationObserver(detectDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", detectDarkMode);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
      mediaQuery.removeEventListener("change", detectDarkMode);
    };
  }, []);

  // ✅ NEW: Scroll detection for lazy loading below-the-fold content
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300 && !hasScrolled) {
        setHasScrolled(true);
      }
    };

    // Check immediately in case already scrolled
    handleScroll();
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasScrolled]);

  // Scroll to top when product changes
  useEffect(() => {
    if (productId) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [productId]);

  // ✅ OPTIMIZED: Fetch product data with AbortController
  useEffect(() => {
    if (!productId) return;

    const abortController = new AbortController();

    const fetchProduct = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/products/${productId}`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(t("productNotFound"));
        }

        const productData = await response.json();
        const parsedProduct = ProductUtils.fromJson(productData);
        setProduct(parsedProduct);

        // ✅ OPTIMIZED: Record analytics without blocking (fire and forget)
        recordDetailView(parsedProduct);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return; // Request was cancelled, ignore
        }
        console.error("Error fetching product:", err);
        setError(err instanceof Error ? err.message : t("failedToLoadProduct"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchProduct();

    return () => {
      abortController.abort();
    };
  }, [productId, t]);

  // ✅ OPTIMIZED: Analytics recording - fire and forget, no await
  const recordDetailView = useCallback((product: Product) => {
    // Don't block rendering for analytics
    fetch("/api/analytics/detail-view", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId: product.id,
        category: product.category,
        subcategory: product.subcategory,
        brand: product.brandModel,
        price: product.price,
      }),
      // Use keepalive to ensure request completes even if user navigates away
      keepalive: true,
    }).catch((error) => {
      console.error("Error recording detail view:", error);
    });
  }, []);

  // Image error handling
  const handleImageError = useCallback((index: number) => {
    setImageErrors((prev) => new Set(prev).add(index));
  }, []);

  // Share functionality
  const handleShare = useCallback(async () => {
    try {
      if (navigator.share && product) {
        await navigator.share({
          title: product.productName,
          text: `${t("checkOutThis")} ${product.productName}`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
      }
    } catch (error) {
      console.error("Error sharing:", error);
    }
  }, [product, t]);

  // ✅ OPTIMIZED: Favorite toggle with optimistic update
  const handleToggleFavorite = useCallback(async () => {
    if (!product?.id) return;

    // Optimistic update
    setIsFavorite((prev) => !prev);

    try {
      const response = await fetch("/api/favorites/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: product.id,
        }),
      });

      if (!response.ok) {
        // Revert on failure
        setIsFavorite((prev) => !prev);
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      // Revert on error
      setIsFavorite((prev) => !prev);
    }
  }, [product?.id]);

  const performCartAddition = useCallback(
    async (selectedOptions?: { quantity?: number; [key: string]: unknown }) => {
      if (!product) return;
  
      try {
        setCartButtonState("adding");
  
        let quantityToAdd = 1;
        const attributesToAdd = selectedOptions;
  
        if (selectedOptions && typeof selectedOptions.quantity === "number") {
          quantityToAdd = selectedOptions.quantity;
        }
  
        const result = await addToCart(
          product.id,
          quantityToAdd,
          attributesToAdd
        );
  
        if (result.includes("Added") || result.includes("Updated")) {
          setCartButtonState("added");
          setTimeout(() => setCartButtonState("idle"), 1500);
        } else {
          setCartButtonState("idle");
        }
      } catch (error) {
        console.error("Error adding to cart:", error);
        setCartButtonState("idle");
      }
    },
    [product, addToCart]
  );
  
  const performCartRemoval = useCallback(
    async () => {
      if (!product) return;
  
      try {
        setCartButtonState("removing");
  
        const result = await removeFromCart(product.id);
  
        if (result.includes("Removed")) {
          setCartButtonState("removed");
          setTimeout(() => setCartButtonState("idle"), 1500);
        } else {
          setCartButtonState("idle");
        }
      } catch (error) {
        console.error("Error removing from cart:", error);
        setCartButtonState("idle");
      }
    },
    [product, removeFromCart]
  );

  const handleAddToCart = useCallback(
    async (selectedOptions?: { quantity?: number; [key: string]: unknown }) => {
      if (!user) {
        router.push("/login");
        return;
      }
  
      if (!product) return;
  
      const productInCart = isInCart(product.id);
  
      if (productInCart) {
        await performCartRemoval();
        return;
      }
  
      if (!productInCart && hasSelectableOptions(product) && !selectedOptions) {
        setShowCartOptionSelector(true);
        return;
      }
  
      await performCartAddition(selectedOptions);
    },
    [user, product, isInCart, router, performCartRemoval, performCartAddition]
  );

  const handleCartOptionSelectorConfirm = useCallback(
    async (selectedOptions: { quantity?: number; [key: string]: unknown }) => {
      setShowCartOptionSelector(false);
      await performCartAddition(selectedOptions);
    },
    [performCartAddition]
  );

  const handleCartOptionSelectorClose = useCallback(() => {
    setShowCartOptionSelector(false);
  }, []);

  const handleBuyNow = useCallback(async () => {
    if (!user) {
      router.push("/login");
      return;
    }

    if (!product) return;

    try {
      if (!isInCart(product.id)) {
        await addToCart(product.id, 1);
      }

      router.push(`/checkout?productId=${product.id}&quantity=1`);
    } catch (error) {
      console.error("Error with buy now:", error);
    }
  }, [user, product, isInCart, addToCart, router]);

  // Get current cart button content
  const cartButtonContent = useMemo(() => {
    if (!product)
      return {
        icon: <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />,
        text: t("addToCart"),
      };

    const productInCart = isInCart(product.id);
    const isOptimisticAdd = isOptimisticallyAdding(product.id);
    const isOptimisticRemove = isOptimisticallyRemoving(product.id);

    if (cartButtonState === "adding" || isOptimisticAdd) {
      return {
        icon: (
          <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        text: t("adding"),
      };
    }

    if (cartButtonState === "removing" || isOptimisticRemove) {
      return {
        icon: (
          <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        text: t("removing"),
      };
    }

    if (cartButtonState === "added") {
      return {
        icon: <Check className="w-4 h-4 sm:w-5 sm:h-5" />,
        text: t("addedToCart"),
      };
    }

    if (cartButtonState === "removed") {
      return {
        icon: <Check className="w-4 h-4 sm:w-5 sm:h-5" />,
        text: t("removedFromCart"),
      };
    }

    if (productInCart) {
      return {
        icon: <Minus className="w-4 h-4 sm:w-5 sm:h-5" />,
        text: t("removeFromCart"),
      };
    }

    return {
      icon: <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />,
      text: t("addToCart"),
    };
  }, [
    product,
    isInCart,
    isOptimisticallyAdding,
    isOptimisticallyRemoving,
    cartButtonState,
    t,
  ]);

  useEffect(() => {
    if (!product) return;

    const productInCart = isInCart(product.id);
    const isOptimisticAdd = isOptimisticallyAdding(product.id);
    const isOptimisticRemove = isOptimisticallyRemoving(product.id);

    if (
      (cartButtonState === "adding" || cartButtonState === "removing") &&
      !isOptimisticAdd &&
      !isOptimisticRemove
    ) {
      setCartButtonState("idle");
    }
  }, [
    product?.id,
    isInCart,
    isOptimisticallyAdding,
    isOptimisticallyRemoving,
    cartButtonState,
  ]);

  if (isLoading) {
    return <LoadingSkeleton isDarkMode={isDarkMode} />;
  }

  if (error || !product) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="text-center px-4">
          <h1
            className={`text-xl sm:text-2xl font-bold mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("productNotFound")}
          </h1>
          <p
            className={`mb-4 text-sm sm:text-base ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
          >
            {error || t("productNotFoundDescription")}
          </p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm sm:text-base"
          >
            {t("goBack")}
          </button>
        </div>
      </div>
    );
  }

  const productInCart = isInCart(product.id);
  const isProcessing =
    cartButtonState === "adding" ||
    cartButtonState === "removing" ||
    isOptimisticallyAdding(product.id) ||
    isOptimisticallyRemoving(product.id);

  return (
    <div
      className={`min-h-screen overflow-x-hidden ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 backdrop-blur-md border-b ${
          isDarkMode
            ? "bg-gray-900/95 border-gray-700"
            : "bg-white/95 border-gray-200"
        }`}
      >
        <div className="w-full px-3 py-2 sm:max-w-6xl sm:mx-auto sm:px-4 sm:py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                isDarkMode
                  ? "hover:bg-gray-800 text-gray-300"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={handleToggleFavorite}
                className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-300"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <Heart className={`w-5 h-5 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} />
              </button>
              
              <button
                onClick={handleShare}
                className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-300"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full sm:max-w-6xl sm:mx-auto p-3 sm:p-4 lg:p-6">
        <div className="grid lg:grid-cols-2 gap-4 sm:gap-8 lg:gap-12">
          {/* Left Column - Images */}
          <div className="space-y-3 sm:space-y-4">
            {/* Main Image */}
            <div
              className={`relative w-full aspect-square rounded-lg sm:rounded-2xl overflow-hidden ${
                isDarkMode ? "bg-gray-800" : "bg-white"
              } shadow-sm border ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}
            >
              {product.imageUrls.length > 0 &&
              !imageErrors.has(currentImageIndex) ? (
                <Image
                  src={product.imageUrls[currentImageIndex]}
                  alt={product.productName}
                  fill
                  className="object-contain cursor-pointer hover:scale-105 transition-transform duration-300"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  onClick={() => setShowFullScreenViewer(true)}
                  onError={() => handleImageError(currentImageIndex)}
                  priority
                />
              ) : (
                <div
                  className={`w-full h-full flex items-center justify-center ${
                    isDarkMode ? "bg-gray-700" : "bg-gray-100"
                  }`}
                >
                  <div
                    className={`text-center ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    <div
                      className={`w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-2 rounded-lg ${
                        isDarkMode ? "bg-gray-600" : "bg-gray-300"
                      }`}
                    />
                    <p className="text-sm sm:text-base">{t("noImageAvailable")}</p>
                  </div>
                </div>
              )}

              {/* Video Play Button */}
              {product.videoUrl && (
                <button
                  onClick={() => setShowVideoModal(true)}
                  className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 p-2 sm:p-3 bg-black/60 backdrop-blur-sm rounded-full text-white hover:bg-black/80 transition-all hover:scale-110"
                >
                  <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
                </button>
              )}

              {/* Best Seller Badge */}
              {product.bestSellerRank && product.bestSellerRank <= 10 && (
                <div className="absolute top-3 left-3 sm:top-4 sm:left-4 px-2 py-0.5 sm:px-3 sm:py-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white text-xs sm:text-sm font-bold rounded-full shadow-lg">
                  #{product.bestSellerRank} {t("bestSeller")}
                </div>
              )}
            </div>

            {/* Thumbnail Images */}
            {product.imageUrls.length > 1 && (
              <div className="relative overflow-hidden">
                <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {product.imageUrls.map((url, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={`flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden border-2 transition-all ${
                        index === currentImageIndex
                          ? "border-orange-500 shadow-lg scale-105"
                          : isDarkMode
                          ? "border-gray-600 hover:border-gray-500"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <Image
                        src={url}
                        alt={`${t("productImage")} ${index + 1}`}
                        width={80}
                        height={80}
                        className="w-full h-full object-cover"
                        onError={() => handleImageError(index)}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Product Info */}
          <div className="space-y-4 sm:space-y-6">
            {/* Product Title & Brand */}
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-start gap-2 sm:gap-3">
                <span
                  className={`text-xs sm:text-sm font-semibold px-2 py-0.5 sm:px-3 sm:py-1 rounded-full ${
                    isDarkMode 
                      ? "bg-blue-900/30 text-blue-400 border border-blue-700" 
                      : "bg-blue-50 text-blue-700 border border-blue-200"
                  }`}
                >
                  {product.brandModel}
                </span>
              </div>
              
              <h1
                className={`text-xl sm:text-2xl lg:text-3xl font-bold leading-tight ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {product.productName}
              </h1>
              
              <div
                className={`text-2xl sm:text-3xl lg:text-4xl font-bold text-orange-600`}
              >
                {product.price} {product.currency}
              </div>
            </div>

            {/* Actions Row */}
            <ProductDetailActionsRow
              product={product}
              onShare={handleShare}
              onToggleFavorite={handleToggleFavorite}
              isFavorite={isFavorite}
              isDarkMode={isDarkMode}
              localization={localization}
            />

            {/* Action Buttons */}
            <div className="flex gap-2 sm:gap-3 pt-2 sm:pt-4">
              <button
                onClick={() => handleAddToCart()}
                disabled={isProcessing}
                className={`
                  flex-1 py-3 px-3 sm:py-4 sm:px-6 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-lg transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3 relative overflow-hidden
                  ${
                    productInCart && cartButtonState === "idle"
                      ? isDarkMode
                        ? "border-2 border-red-500 text-red-400 hover:bg-red-900/20"
                        : "border-2 border-red-500 text-red-600 hover:bg-red-50"
                      : cartButtonState === "added" || cartButtonState === "removed"
                      ? "border-2 border-green-500 text-green-600 bg-green-50"
                      : isDarkMode
                      ? "border-2 border-orange-500 text-orange-400 hover:bg-orange-900/20"
                      : "border-2 border-orange-500 text-orange-600 hover:bg-orange-50"
                  }
                  ${isProcessing ? "opacity-75 cursor-not-allowed" : ""}
                  ${
                    cartButtonState === "added" || cartButtonState === "removed"
                      ? "transform scale-105"
                      : ""
                  }
                `}
              >
                <span
                  className={`transition-all duration-300 ${
                    cartButtonState === "added" || cartButtonState === "removed"
                      ? "animate-pulse"
                      : ""
                  }`}
                >
                  {cartButtonContent.icon}
                </span>
                <span className="transition-all duration-300">
                  {cartButtonContent.text}
                </span>

                {(cartButtonState === "added" || cartButtonState === "removed") && (
                  <div className="absolute inset-0 bg-green-500/10 animate-pulse rounded-lg sm:rounded-xl" />
                )}
              </button>

              <button
                onClick={handleBuyNow}
                className="flex-1 py-3 px-3 sm:py-4 sm:px-6 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-lg sm:rounded-xl font-semibold text-sm sm:text-lg transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                {t("buyNow")}
              </button>
            </div>

            {/* Seller Info */}
            <ProductDetailSellerInfo
              sellerId={product.userId}
              sellerName={product.sellerName}
              shopId={product.shopId}
              isDarkMode={isDarkMode}
              localization={localization}
            />
            
          </div>
        </div>

        {/* ✅ OPTIMIZED: Bottom sections lazy loaded */}
        <div className="mt-8 sm:mt-12 space-y-6 sm:space-y-8">
          {/* Always render attributes (lightweight) */}
          <DynamicAttributesWidget 
            product={product} 
            isDarkMode={isDarkMode}
            localization={localization}              
          />
          
          {/* Description */}
          {product.description && (
            <div
              className={`rounded-lg sm:rounded-2xl p-4 sm:p-6 ${
                isDarkMode
                  ? "bg-gray-800 border border-gray-700"
                  : "bg-white border border-gray-200"
              } shadow-sm`}
            >
              <h3
                className={`text-lg sm:text-xl font-bold mb-3 sm:mb-4 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("productDescription")}
              </h3>
              <p
                className={`leading-relaxed text-sm sm:text-base ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                {product.description}
              </p>
            </div>
          )}

          {/* ✅ LAZY LOADED: Heavy components below the fold */}
          {hasScrolled && (
            <Suspense fallback={<div className="h-40 animate-pulse bg-gray-200 rounded-lg" />}>
              <ProductCollectionWidget
                productId={product.id}
                shopId={product.shopId}
                isDarkMode={isDarkMode}
                localization={localization}
              />
            </Suspense>
          )}

          {hasScrolled && (
            <Suspense fallback={<div className="h-40 animate-pulse bg-gray-200 rounded-lg" />}>
              <BundleComponent
                productId={product.id}
                shopId={product.shopId}
                isDarkMode={isDarkMode}
                localization={localization}
              />
            </Suspense>
          )}

          {hasScrolled && (
            <Suspense fallback={<div className="h-40 animate-pulse bg-gray-200 rounded-lg" />}>
              <ProductDetailReviewsTab
                productId={product.id}
                isDarkMode={isDarkMode}
                localization={localization}
              />
            </Suspense>
          )}

          {hasScrolled && (
            <Suspense fallback={<div className="h-40 animate-pulse bg-gray-200 rounded-lg" />}>
              <ProductQuestionsWidget
                productId={product.id}
                sellerId={product.shopId || product.userId}
                isShop={!!product.shopId}
                isDarkMode={isDarkMode}
                localization={localization}
              />
            </Suspense>
          )}

          {hasScrolled && (
            <Suspense fallback={<div className="h-40 animate-pulse bg-gray-200 rounded-lg" />}>
              <ProductDetailRelatedProducts
                productId={product.id}
                category={product.category}
                subcategory={product.subcategory}
                isDarkMode={isDarkMode}
                localization={localization}
              />
            </Suspense>
          )}
        </div>

        <div className="h-20 sm:h-24" />
      </div>

      {/* ✅ LAZY LOADED: Modals */}
      {showFullScreenViewer && (
        <Suspense fallback={null}>
          <FullScreenImageViewer
            imageUrls={product.imageUrls}
            initialIndex={currentImageIndex}
            isOpen={showFullScreenViewer}
            onClose={() => setShowFullScreenViewer(false)}
            isDarkMode={isDarkMode}        
          />
        </Suspense>
      )}

      {showVideoModal && product.videoUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3 sm:p-4">
          <div className="relative w-full max-w-4xl aspect-video bg-black rounded-lg sm:rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowVideoModal(false)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 p-2 sm:p-3 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <video
              src={product.videoUrl}
              controls
              autoPlay
              className="w-full h-full"
            />
          </div>
        </div>
      )}

      {product && (
        <ProductOptionSelector
          product={product}
          isOpen={showCartOptionSelector}
          onClose={handleCartOptionSelectorClose}
          onConfirm={handleCartOptionSelectorConfirm}
          isDarkMode={isDarkMode}
          localization={localization}
        />
      )}

      {hasScrolled && (
        <Suspense fallback={null}>
          <AskToSellerBubble
            onTap={() => {
              const sellerId = product.shopId || product.userId;
              const isShop = !!product.shopId;
              
              router.push(`/asktoseller?productId=${product.id}&sellerId=${sellerId}&isShop=${isShop}`);
            }}
            isDarkMode={isDarkMode}
            localization={localization}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ProductDetailPage;