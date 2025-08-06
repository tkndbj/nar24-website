// src/app/product/[productId]/page.tsx

"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Share2,
  ShoppingCart,
  Play,
  X,
  Check,
  Minus,
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
import ProductOptionSelector from "@/app/components/ProductOptionSelector";
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
  const selectableAttrs = Object.entries(product.attributes || {}).filter(([, value]) => {
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

const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ params }) => {
  const router = useRouter();
  const [productId, setProductId] = useState<string>("");

  // Cart and user hooks
  const {
    addToCart,
    isInCart,
    isOptimisticallyAdding,
    isOptimisticallyRemoving,
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
      const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

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
          throw new Error("Product not found");
        }

        const productData = await response.json();
        const parsedProduct = ProductUtils.fromJson(productData);
        setProduct(parsedProduct);

        // Record analytics
        recordDetailView(parsedProduct);
      } catch (err) {
        console.error("Error fetching product:", err);
        setError(err instanceof Error ? err.message : "Failed to load product");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProduct();
  }, [productId]);

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
    setImageErrors(prev => new Set(prev).add(index));
  }, []);

  // Share functionality
  const handleShare = useCallback(async () => {
    try {
      if (navigator.share && product) {
        await navigator.share({
          title: product.productName,
          text: `Check out this ${product.productName}`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
      }
    } catch (error) {
      console.error("Error sharing:", error);
    }
  }, [product]);

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
        setIsFavorite(prev => !prev);
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  }, [product?.id]);

  // Enhanced cart functionality with proper state management
  const handleAddToCart = useCallback(async (selectedOptions?: { quantity?: number; [key: string]: any }) => {
    if (!user) {
      router.push("/login");
      return;
    }

    if (!product) return;

    const productInCart = isInCart(product.id);

    // Only show option selector when ADDING to cart (not removing)
    if (!productInCart && hasSelectableOptions(product) && !selectedOptions) {
      setShowCartOptionSelector(true);
      return;
    }

    // Perform cart operation
    await performCartOperation(selectedOptions);
  }, [user, product, isInCart, router]);

  // Separated cart operation logic - simplified and fixed
  const performCartOperation = useCallback(async (selectedOptions?: { quantity?: number; [key: string]: any }) => {
    if (!product) return;

    try {
      const wasInCart = isInCart(product.id);

      // Set loading state immediately
      setCartButtonState(wasInCart ? "removing" : "adding");

      // Extract quantity from selectedOptions if provided
      let quantityToAdd = 1;
      const attributesToAdd = selectedOptions;

      if (selectedOptions && typeof selectedOptions.quantity === 'number') {
        quantityToAdd = selectedOptions.quantity;
        
        console.log('ProductDetailPage - Extracted quantity from options:', {
          productId: product.id,
          selectedOptions,
          quantityToAdd,
          wasInCart
        });
      }

      // Call the cart function with the correct quantity
      const result = await addToCart(product.id, quantityToAdd, attributesToAdd);
      
      console.log('ProductDetailPage - Cart operation result:', {
        productId: product.id,
        quantityToAdd,
        attributesToAdd,
        result
      });

      // Set success state based on result
      if (result.includes("Added")) {
        setCartButtonState("added");
        setTimeout(() => setCartButtonState("idle"), 1500);
      } else if (result.includes("Removed")) {
        setCartButtonState("removed");
        setTimeout(() => setCartButtonState("idle"), 1500);
      } else {
        // If no clear success message, reset to idle
        setCartButtonState("idle");
      }

    } catch (error) {
      console.error("Error with cart operation:", error);
      setCartButtonState("idle");
    }
  }, [product, isInCart, addToCart]);

  // Handle cart option selector confirmation
  const handleCartOptionSelectorConfirm = useCallback(async (selectedOptions: { quantity?: number; [key: string]: any }) => {
    setShowCartOptionSelector(false);
    await performCartOperation(selectedOptions);
  }, [performCartOperation]);

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
    if (!product) return { icon: <ShoppingCart className="w-5 h-5" />, text: "Sepete Ekle" };

    const productInCart = isInCart(product.id);
    const isOptimisticAdd = isOptimisticallyAdding(product.id);
    const isOptimisticRemove = isOptimisticallyRemoving(product.id);

    if (cartButtonState === "adding" || isOptimisticAdd) {
      return {
        icon: <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />,
        text: "Ekleniyor...",
      };
    }

    if (cartButtonState === "removing" || isOptimisticRemove) {
      return {
        icon: <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />,
        text: "Çıkarılıyor...",
      };
    }

    if (cartButtonState === "added") {
      return {
        icon: <Check className="w-5 h-5" />,
        text: "Sepete Eklendi!",
      };
    }

    if (cartButtonState === "removed") {
      return {
        icon: <Check className="w-5 h-5" />,
        text: "Sepetten Çıkarıldı!",
      };
    }

    if (productInCart) {
      return {
        icon: <Minus className="w-5 h-5" />,
        text: "Sepetten Çıkar",
      };
    }

    return {
      icon: <ShoppingCart className="w-5 h-5" />,
      text: "Sepete Ekle",
    };
  }, [product, isInCart, isOptimisticallyAdding, isOptimisticallyRemoving, cartButtonState]);

  // 🚀 SIMPLIFIED: Single effect to handle state resets
  useEffect(() => {
    if (!product) return;

    const productInCart = isInCart(product.id);
    const isOptimisticAdd = isOptimisticallyAdding(product.id);
    const isOptimisticRemove = isOptimisticallyRemoving(product.id);

    // Only reset if we're in a loading state but no optimistic operations are happening
    if ((cartButtonState === "adding" || cartButtonState === "removing") && 
        !isOptimisticAdd && !isOptimisticRemove) {
      console.log('ProductDetailPage - Resetting button state:', {
        productId: product.id,
        cartButtonState,
        productInCart,
        isOptimisticAdd,
        isOptimisticRemove
      });
      setCartButtonState("idle");
    }
  }, [product?.id, isInCart, isOptimisticallyAdding, isOptimisticallyRemoving, cartButtonState]);

  // Loading skeleton component
  const LoadingSkeleton = useMemo(() => (
    <div className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      <div className={`sticky top-0 z-10 border-b ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
        <div className="flex items-center justify-between p-4">
          <div className={`w-6 h-6 rounded animate-pulse ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`} />
          <div className={`w-24 h-6 rounded animate-pulse ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`} />
          <div className={`w-6 h-6 rounded animate-pulse ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`} />
        </div>
      </div>
      <div className={`w-full h-96 animate-pulse ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`} />
      <div className="space-y-4 p-4">
        <div className={`h-6 rounded animate-pulse ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`} />
        <div className={`h-16 rounded animate-pulse ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`} />
        <div className={`h-20 rounded animate-pulse ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`} />
      </div>
    </div>
  ), [isDarkMode]);

  if (isLoading) {
    return LoadingSkeleton;
  }

  if (error || !product) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        <div className="text-center">
          <h1 className={`text-2xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            Product Not Found
          </h1>
          <p className={`mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            {error || "The product you're looking for doesn't exist."}
          </p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const productInCart = isInCart(product.id);
  const isProcessing = cartButtonState === "adding" || cartButtonState === "removing" ||
                     isOptimisticallyAdding(product.id) || isOptimisticallyRemoving(product.id);

  return (
    <div className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      {/* Header */}
      <div className={`sticky top-0 z-10 border-b shadow-sm ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => router.back()}
            className={`p-2 rounded-lg transition-colors ${isDarkMode ? "hover:bg-gray-700 text-gray-300" : "hover:bg-gray-100 text-gray-700"}`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <h1 className={`text-lg font-semibold truncate mx-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            Product Details
          </h1>

          <button
            onClick={handleShare}
            className={`p-2 rounded-lg transition-colors ${isDarkMode ? "hover:bg-gray-700 text-gray-300" : "hover:bg-gray-100 text-gray-700"}`}
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-2">
        {/* Image section */}
        <div className={`relative w-full h-96 lg:h-[500px] ${isDarkMode ? "bg-gray-800" : "bg-white"}`}>
          {product.imageUrls.length > 0 && !imageErrors.has(currentImageIndex) ? (
            <Image
              src={product.imageUrls[currentImageIndex]}
              alt={product.productName}
              fill
              className="object-contain cursor-pointer"
              onClick={() => setShowFullScreenViewer(true)}
              onError={() => handleImageError(currentImageIndex)}
              priority
            />
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`}>
              <div className={`text-center ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                <div className={`w-16 h-16 mx-auto mb-2 rounded-lg ${isDarkMode ? "bg-gray-600" : "bg-gray-300"}`} />
                <p>No image available</p>
              </div>
            </div>
          )}

          {product.videoUrl && (
            <button
              onClick={() => setShowVideoModal(true)}
              className="absolute bottom-4 right-4 p-3 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-black/70 transition-colors"
            >
              <Play className="w-6 h-6 fill-current" />
            </button>
          )}

          {product.bestSellerRank && product.bestSellerRank <= 10 && (
            <div className="absolute top-4 right-4 px-3 py-1 bg-orange-600 text-white text-sm font-bold rounded-full">
              #{product.bestSellerRank} Best Seller
            </div>
          )}

          {product.imageUrls.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {product.imageUrls.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentImageIndex(index)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentImageIndex
                      ? "bg-orange-600"
                      : "bg-white/50 hover:bg-white/70"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Product header */}
        <div className={`p-4 border-b ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}>
          <div className="flex items-start gap-2 mb-2">
            <span className={`text-lg font-bold ${isDarkMode ? "text-blue-400" : "text-blue-600"}`}>
              {product.brandModel}
            </span>
            <span className={`text-lg font-bold ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
              {product.productName}
            </span>
          </div>
          <div className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {product.price} {product.currency}
          </div>
        </div>

        <ProductDetailActionsRow
          product={product}
          onShare={handleShare}
          onToggleFavorite={handleToggleFavorite}
          isFavorite={isFavorite}
          isDarkMode={isDarkMode}
        />

        <ProductDetailSellerInfo
          sellerId={product.userId}
          sellerName={product.sellerName}
          shopId={product.shopId}
          isDarkMode={isDarkMode}
        />

        <DynamicAttributesWidget product={product} isDarkMode={isDarkMode} />

        <ProductCollectionWidget
          productId={product.id}
          shopId={product.shopId}
          isDarkMode={isDarkMode}
        />

        {product.description && (
          <div className={`p-4 border-b ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}>
            <h3 className={`text-lg font-bold mb-3 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              Description
            </h3>
            <p className={`leading-relaxed ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
              {product.description}
            </p>
          </div>
        )}

        <ProductDetailReviewsTab productId={product.id} isDarkMode={isDarkMode} />

        <ProductQuestionsWidget
          productId={product.id}
          sellerId={product.shopId || product.userId}
          isShop={!!product.shopId}
          isDarkMode={isDarkMode}
        />

        <ProductDetailRelatedProducts
          productId={product.id}
          category={product.category}
          subcategory={product.subcategory}
          isDarkMode={isDarkMode}
        />

        <div className="h-24" />
      </div>

      {/* Bottom action bar */}
      <div className={`fixed bottom-0 left-0 right-0 border-t p-4 safe-area-pb ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
        <div className="max-w-6xl mx-auto px-2 flex gap-3">
          {/* Cart Button */}
          <button
            onClick={() => handleAddToCart()}
            disabled={isProcessing}
            className={`
              flex-1 py-3 px-4 rounded-lg border font-semibold transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden
              ${
                productInCart && cartButtonState === "idle"
                  ? isDarkMode
                    ? "border-red-500 text-red-400 hover:bg-red-900/20"
                    : "border-red-500 text-red-600 hover:bg-red-50"
                  : cartButtonState === "added" || cartButtonState === "removed"
                  ? "border-green-500 text-green-600 bg-green-50"
                  : isDarkMode
                  ? "border-orange-500 text-orange-400 hover:bg-orange-900/20"
                  : "border-orange-500 text-orange-600 hover:bg-orange-50"
              }
              ${isProcessing ? "opacity-75 cursor-not-allowed" : ""}
              ${cartButtonState === "added" || cartButtonState === "removed" ? "transform scale-105" : ""}
            `}
          >
            <span className={`transition-all duration-300 ${cartButtonState === "added" || cartButtonState === "removed" ? "animate-pulse" : ""}`}>
              {cartButtonContent.icon}
            </span>
            <span className="transition-all duration-300">
              {cartButtonContent.text}
            </span>

            {/* Success animation overlay */}
            {(cartButtonState === "added" || cartButtonState === "removed") && (
              <div className="absolute inset-0 bg-green-500/10 animate-pulse" />
            )}
          </button>

          {/* Buy Now Button */}
          <button
            onClick={handleBuyNow}
            className="flex-1 py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
          >
            Şimdi Satın Al
          </button>
        </div>
      </div>

      <FullScreenImageViewer
        imageUrls={product.imageUrls}
        initialIndex={currentImageIndex}
        isOpen={showFullScreenViewer}
        onClose={() => setShowFullScreenViewer(false)}
        isDarkMode={isDarkMode}
      />

      {showVideoModal && product.videoUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="relative w-full max-w-4xl aspect-video bg-black rounded-lg overflow-hidden">
            <button
              onClick={() => setShowVideoModal(false)}
              className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
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

      {/* Cart Option Selector Modal */}
      {product && (
        <ProductOptionSelector
          product={product}
          isOpen={showCartOptionSelector}
          onClose={handleCartOptionSelectorClose}
          onConfirm={handleCartOptionSelectorConfirm}
          isBuyNow={false}
        />
      )}
    </div>
  );
};

export default ProductDetailPage;