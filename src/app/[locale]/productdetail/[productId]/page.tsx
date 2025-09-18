// src/app/product/[productId]/page.tsx

"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import ProductCollectionWidget from "../../../components/product_detail/ProductCollectionWidget";
import FullScreenImageViewer from "../../../components/product_detail/FullScreenImageViewer";
import ProductDetailReviewsTab from "../../../components/product_detail/Reviews";
import ProductDetailSellerInfo from "../../../components/product_detail/SellerInfo";
import ProductQuestionsWidget from "../../../components/product_detail/Questions";
import ProductDetailRelatedProducts from "../../../components/product_detail/RelatedProducts";
import BundleComponent from '@/app/components/product_detail/BundleComponent';
import ProductOptionSelector from "@/app/components/ProductOptionSelector";
import AskToSellerBubble from '@/app/components/product_detail/AskToSeller';
import { useCart } from "@/context/CartProvider";
import { useUser } from "@/context/UserProvider";
import { Product, ProductUtils } from "@/app/models/Product";

interface ProductDetailPageProps {
  params: Promise<{ productId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

// Enhanced helper function to check if product has selectable options
const hasSelectableOptions = (product: Product | null): boolean => {
  if (!product) return false;

  // Check for colors
  const hasColors = Object.keys(product.colorImages || {}).length > 0;
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

const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ params }) => {
  const router = useRouter();
  const localization = useTranslations();
  const [productId, setProductId] = useState<string>("");

  // ✅ FIXED: Proper nested translation function that uses JSON files
  const t = useCallback((key: string) => {
    if (!localization) {
      return key;
    }

    try {
      // Try to get the nested ProductDetailPage translation
      const translation = localization(`ProductDetailPage.${key}`);
      
      // Check if we got a valid translation (not the same as the key we requested)
      if (translation && translation !== `ProductDetailPage.${key}`) {
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

  // Cart and user hooks
  const {
    addToCart,
    isInCart,
    isOptimisticallyAdding,
    isOptimisticallyRemoving,
    removeFromCart,
  } = useCart();
  const { user } = useUser();

  // Animation states - simplified
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

  // Resolve params
  useEffect(() => {
    params.then((resolvedParams) => {
      setProductId(resolvedParams.productId);
    });
  }, [params]);

  // Dark mode detection - optimized
  useEffect(() => {
    if (typeof window === "undefined") return;

    const detectDarkMode = () => {
      const htmlElement = document.documentElement;
      const darkModeMediaQuery = window.matchMedia(
        "(prefers-color-scheme: dark)"
      );

      const isDark =
        htmlElement.classList.contains("dark") ||
        htmlElement.getAttribute("data-theme") === "dark" ||
        darkModeMediaQuery.matches;

      setIsDarkMode(isDark);
    };

    detectDarkMode();

    const observer = new MutationObserver(detectDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => detectDarkMode();
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  // Scroll to top when product changes
  useEffect(() => {
    if (productId) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [productId]);

  // Fetch product data
  useEffect(() => {
    if (!productId) return;

    const fetchProduct = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/products/${productId}`);

        if (!response.ok) {
          throw new Error(t("productNotFound"));
        }

        const productData = await response.json();
        const parsedProduct = ProductUtils.fromJson(productData);
        setProduct(parsedProduct);

        // Record analytics
        recordDetailView(parsedProduct);
      } catch (err) {
        console.error("Error fetching product:", err);
        setError(err instanceof Error ? err.message : t("failedToLoadProduct"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchProduct();
  }, [productId, t]);

  // Analytics recording
  const recordDetailView = useCallback(async (product: Product) => {
    try {
      await fetch("/api/analytics/detail-view", {
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
      });
    } catch (error) {
      console.error("Error recording detail view:", error);
    }
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

  // Favorite toggle
  const handleToggleFavorite = useCallback(async () => {
    try {
      const response = await fetch("/api/favorites/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: product?.id,
        }),
      });

      if (response.ok) {
        setIsFavorite((prev) => !prev);
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
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
  
        console.log("ProductDetailPage - Add to cart result:", {
          productId: product.id,
          quantityToAdd,
          attributesToAdd,
          result,
        });
  
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
  
  // Handle cart removal
  const performCartRemoval = useCallback(
    async () => {
      if (!product) return;
  
      try {
        setCartButtonState("removing");
  
        const result = await removeFromCart(product.id);
  
        console.log("ProductDetailPage - Remove from cart result:", {
          productId: product.id,
          result,
        });
  
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

  // Enhanced cart functionality with proper state management
  const handleAddToCart = useCallback(
    async (selectedOptions?: { quantity?: number; [key: string]: unknown }) => {
      if (!user) {
        router.push("/login");
        return;
      }
  
      if (!product) return;
  
      const productInCart = isInCart(product.id);
  
      // If product is in cart, remove it
      if (productInCart) {
        await performCartRemoval();
        return;
      }
  
      // Show option selector if product has selectable options and no options provided
      if (!productInCart && hasSelectableOptions(product) && !selectedOptions) {
        setShowCartOptionSelector(true);
        return;
      }
  
      // Add to cart
      await performCartAddition(selectedOptions);
    },
    [user, product, isInCart, router, performCartRemoval, performCartAddition, setShowCartOptionSelector]
  );

  // Handle cart option selector confirmation
  const handleCartOptionSelectorConfirm = useCallback(
    async (selectedOptions: { quantity?: number; [key: string]: unknown }) => {
      setShowCartOptionSelector(false);
      await performCartAddition(selectedOptions); // Only for additions
    },
    [performCartAddition]
  );

  // Handle cart option selector close
  const handleCartOptionSelectorClose = useCallback(() => {
    setShowCartOptionSelector(false);
  }, []);

  // Buy now functionality
  const handleBuyNow = useCallback(async () => {
    if (!user) {
      router.push("/login");
      return;
    }

    if (!product) return;

    try {
      // Add to cart first if not already in cart
      if (!isInCart(product.id)) {
        await addToCart(product.id, 1);
      }

      // Redirect to checkout
      router.push(`/checkout?productId=${product.id}&quantity=1`);
    } catch (error) {
      console.error("Error with buy now:", error);
    }
  }, [user, product, isInCart, addToCart, router]);

  // Get current cart button content - simplified and fixed
  const cartButtonContent = useMemo(() => {
    if (!product)
      return {
        icon: <ShoppingCart className="w-5 h-5" />,
        text: t("addToCart"),
      };

    const productInCart = isInCart(product.id);
    const isOptimisticAdd = isOptimisticallyAdding(product.id);
    const isOptimisticRemove = isOptimisticallyRemoving(product.id);

    if (cartButtonState === "adding" || isOptimisticAdd) {
      return {
        icon: (
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        text: t("adding"),
      };
    }

    if (cartButtonState === "removing" || isOptimisticRemove) {
      return {
        icon: (
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        text: t("removing"),
      };
    }

    if (cartButtonState === "added") {
      return {
        icon: <Check className="w-5 h-5" />,
        text: t("addedToCart"),
      };
    }

    if (cartButtonState === "removed") {
      return {
        icon: <Check className="w-5 h-5" />,
        text: t("removedFromCart"),
      };
    }

    if (productInCart) {
      return {
        icon: <Minus className="w-5 h-5" />,
        text: t("removeFromCart"),
      };
    }

    return {
      icon: <ShoppingCart className="w-5 h-5" />,
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

  // 🚀 SIMPLIFIED: Single effect to handle state resets
  useEffect(() => {
    if (!product) return;

    const productInCart = isInCart(product.id);
    const isOptimisticAdd = isOptimisticallyAdding(product.id);
    const isOptimisticRemove = isOptimisticallyRemoving(product.id);

    // Only reset if we're in a loading state but no optimistic operations are happening
    if (
      (cartButtonState === "adding" || cartButtonState === "removing") &&
      !isOptimisticAdd &&
      !isOptimisticRemove
    ) {
      console.log("ProductDetailPage - Resetting button state:", {
        productId: product.id,
        cartButtonState,
        productInCart,
        isOptimisticAdd,
        isOptimisticRemove,
      });
      setCartButtonState("idle");
    }
  }, [
    product?.id,
    isInCart,
    isOptimisticallyAdding,
    isOptimisticallyRemoving,
    cartButtonState,
  ]);

  // Loading skeleton component
  const LoadingSkeleton = useMemo(
    () => (
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      >
        <div
          className={`sticky top-0 z-10 border-b ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }`}
        >
          <div className="flex items-center justify-between p-4">
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
        <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto p-4">
          <div
            className={`w-full h-96 lg:h-[500px] animate-pulse ${
              isDarkMode ? "bg-gray-700" : "bg-gray-200"
            }`}
          />
          <div className="space-y-4">
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
    ),
    [isDarkMode]
  );

  if (isLoading) {
    return LoadingSkeleton;
  }

  if (error || !product) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="text-center">
          <h1
            className={`text-2xl font-bold mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("productNotFound")}
          </h1>
          <p
            className={`mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
          >
            {error || t("productNotFoundDescription")}
          </p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
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
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* Header - Clean and minimal */}
      <div
        className={`sticky top-0 z-10 backdrop-blur-md border-b ${
          isDarkMode
            ? "bg-gray-900/95 border-gray-700"
            : "bg-white/95 border-gray-200"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode
                  ? "hover:bg-gray-800 text-gray-300"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleFavorite}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-300"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <Heart className={`w-5 h-5 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} />
              </button>
              
              <button
                onClick={handleShare}
                className={`p-2 rounded-lg transition-colors ${
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

      {/* Main Content - Modern two-column layout */}
      <div className="max-w-6xl mx-auto p-4 lg:p-6">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left Column - Images */}
          <div className="space-y-4">
            {/* Main Image */}
            <div
              className={`relative w-full aspect-square rounded-2xl overflow-hidden ${
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
                      className={`w-16 h-16 mx-auto mb-2 rounded-lg ${
                        isDarkMode ? "bg-gray-600" : "bg-gray-300"
                      }`}
                    />
                    <p>{t("noImageAvailable")}</p>
                  </div>
                </div>
              )}

              {/* Video Play Button */}
              {product.videoUrl && (
                <button
                  onClick={() => setShowVideoModal(true)}
                  className="absolute bottom-4 right-4 p-3 bg-black/60 backdrop-blur-sm rounded-full text-white hover:bg-black/80 transition-all hover:scale-110"
                >
                  <Play className="w-6 h-6 fill-current" />
                </button>
              )}

              {/* Best Seller Badge */}
              {product.bestSellerRank && product.bestSellerRank <= 10 && (
                <div className="absolute top-4 left-4 px-3 py-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white text-sm font-bold rounded-full shadow-lg">
                  #{product.bestSellerRank} {t("bestSeller")}
                </div>
              )}
            </div>

            {/* Thumbnail Images */}
            {product.imageUrls.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {product.imageUrls.map((url, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
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
            )}
          </div>

          {/* Right Column - Product Info */}
          <div className="space-y-6">
            {/* Product Title & Brand */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span
                  className={`text-sm font-semibold px-3 py-1 rounded-full ${
                    isDarkMode 
                      ? "bg-blue-900/30 text-blue-400 border border-blue-700" 
                      : "bg-blue-50 text-blue-700 border border-blue-200"
                  }`}
                >
                  {product.brandModel}
                </span>
              </div>
              
              <h1
                className={`text-2xl lg:text-3xl font-bold leading-tight ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {product.productName}
              </h1>
              
              <div
                className={`text-3xl lg:text-4xl font-bold text-orange-600`}
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
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => handleAddToCart()}
                disabled={isProcessing}
                className={`
                  flex-1 py-4 px-6 rounded-xl font-semibold text-lg transition-all duration-300 flex items-center justify-center gap-3 relative overflow-hidden
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

                {/* Success animation overlay */}
                {(cartButtonState === "added" || cartButtonState === "removed") && (
                  <div className="absolute inset-0 bg-green-500/10 animate-pulse rounded-xl" />
                )}
              </button>

              <button
                onClick={handleBuyNow}
                className="flex-1 py-4 px-6 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-xl font-semibold text-lg transition-all duration-300 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
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

            {/* Product Attributes */}
            <DynamicAttributesWidget 
              product={product} 
              isDarkMode={isDarkMode}
              localization={localization}              
            />
          </div>
        </div>

        {/* Bottom Sections */}
        <div className="mt-12 space-y-8">
          {/* Description */}
          {product.description && (
            <div
              className={`rounded-2xl p-6 ${
                isDarkMode
                  ? "bg-gray-800 border border-gray-700"
                  : "bg-white border border-gray-200"
              } shadow-sm`}
            >
              <h3
                className={`text-xl font-bold mb-4 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("productDescription")}
              </h3>
              <p
                className={`leading-relaxed text-base ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                {product.description}
              </p>
            </div>
          )}

          <ProductCollectionWidget
            productId={product.id}
            shopId={product.shopId}
            isDarkMode={isDarkMode}
            localization={localization}
          />

          <BundleComponent
            productId={product.id}
            shopId={product.shopId}
            isDarkMode={isDarkMode}
            localization={localization}
          />

          <ProductDetailReviewsTab
            productId={product.id}
            isDarkMode={isDarkMode}
            localization={localization}
          />

          <ProductQuestionsWidget
            productId={product.id}
            sellerId={product.shopId || product.userId}
            isShop={!!product.shopId}
            isDarkMode={isDarkMode}
            localization={localization}
          />

          <ProductDetailRelatedProducts
            productId={product.id}
            category={product.category}
            subcategory={product.subcategory}
            isDarkMode={isDarkMode}
            localization={localization}
          />
        </div>

        <div className="h-24" />
      </div>

      {/* Modals */}
      <FullScreenImageViewer
        imageUrls={product.imageUrls}
        initialIndex={currentImageIndex}
        isOpen={showFullScreenViewer}
        onClose={() => setShowFullScreenViewer(false)}
        isDarkMode={isDarkMode}        
      />

      {showVideoModal && product.videoUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <div className="relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowVideoModal(false)}
              className="absolute top-4 right-4 z-10 p-3 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
            >
              <X className="w-6 h-6" />
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

      <AskToSellerBubble
        onTap={() => {
          // Determine seller ID and whether it's a shop
          const sellerId = product.shopId || product.userId;
          const isShop = !!product.shopId;
          
          router.push(`/asktoseller?productId=${product.id}&sellerId=${sellerId}&isShop=${isShop}`);
        }}
        isDarkMode={isDarkMode}
        localization={localization}
      />
    </div>
  );
};

export default ProductDetailPage;