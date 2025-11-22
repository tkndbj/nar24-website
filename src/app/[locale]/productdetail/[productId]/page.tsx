// src/app/product/[productId]/page.tsx

"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from "react";
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
import { useLocale } from "next-intl";
import ProductDetailActionsRow from "../../../components/product_detail/ProductDetailActionsRow";
import DynamicAttributesWidget from "../../../components/product_detail/DynamicAttributesWidget";
import ProductDetailSellerInfo from "../../../components/product_detail/SellerInfo";
import ProductOptionSelector from "@/app/components/ProductOptionSelector";
import { useCart } from "@/context/CartProvider";
import { useUser } from "@/context/UserProvider";
import { useFavorites } from "@/context/FavoritesProvider";
import { Product, ProductUtils } from "@/app/models/Product";
import { useProductCache } from "@/context/ProductCacheProvider";

// ✅ LAZY LOAD: Heavy components that aren't immediately visible
const ProductCollectionWidget = lazy(
  () => import("../../../components/product_detail/ProductCollectionWidget")
);
const FullScreenImageViewer = lazy(
  () => import("../../../components/product_detail/FullScreenImageViewer")
);
const ProductDetailReviewsTab = lazy(
  () => import("../../../components/product_detail/Reviews")
);
const ProductQuestionsWidget = lazy(
  () => import("../../../components/product_detail/Questions")
);
const ProductDetailRelatedProducts = lazy(
  () => import("../../../components/product_detail/RelatedProducts")
);
const BundleComponent = lazy(
  () => import("@/app/components/product_detail/BundleComponent")
);
const AskToSellerBubble = lazy(
  () => import("@/app/components/product_detail/AskToSeller")
);

interface ProductDetailPageProps {
  params: Promise<{ productId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

// Enhanced helper function to check if product has selectable options
const hasSelectableOptions = (product: Product | null): boolean => {
  if (!product) return false;

  if (product.subsubcategory === "Curtains") return true;

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
const LoadingSkeleton = React.memo(
  ({ isDarkMode }: { isDarkMode: boolean }) => (
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
  )
);
LoadingSkeleton.displayName = "LoadingSkeleton";

const ProductDetailPage: React.FC<ProductDetailPageProps> = ({ params }) => {
  const router = useRouter();
  const locale = useLocale();
  const localization = useTranslations();
  const { getProduct, setProduct: setProductCache } = useProductCache();
  const [productId, setProductId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    params.then((resolvedParams) => {
      if (!mounted) return;

      const id = resolvedParams.productId;
      setProductId(id);

      // ✅ Synchronous cache check
      const cached = getProduct(id);
      if (cached) {
        console.log("✅ INSTANT: In-memory cache");
        setProduct(cached);
        setIsLoading(false);
        fetchFreshData(id);
        return;
      }

      // ✅ Synchronous sessionStorage check
      try {
        const stored = sessionStorage.getItem(`product_${id}`);
        const time = sessionStorage.getItem(`product_${id}_timestamp`);

        if (stored && time && Date.now() - parseInt(time) < 300000) {
          console.log("✅ FAST: sessionStorage");
          const parsed = ProductUtils.fromJson(JSON.parse(stored));
          setProduct(parsed);
          setIsLoading(false);
          setProductCache(id, parsed);
          fetchFreshData(id);
          return;
        }
      } catch (e) {
        console.error("Cache error:", e);
      }

      // ✅ Network fallback
      console.log("⏳ SLOW: Network fetch");
      fetchProduct(id);
    });

    return () => {
      mounted = false;
    };
  }, [params, getProduct, setProductCache]);

  // ✅ OPTIMIZED: Translation function with better caching
  const t = useCallback(
    (key: string) => {
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
      } catch {
        return key;
      }
    },
    [localization]
  );

  // Cart and user hooks
  const { addProductToCart, removeFromCart, cartProductIds } = useCart();
  const { user } = useUser();
  const { addToFavorites, removeMultipleFromFavorites, isFavorite } =
    useFavorites();

  // Animation states
  const [cartButtonState, setCartButtonState] = useState<
    "idle" | "adding" | "added" | "removing" | "removed"
  >("idle");

  // Option selector state
  const [showCartOptionSelector, setShowCartOptionSelector] = useState(false);

  // UI states
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [previousImageIndex, setPreviousImageIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">(
    "right"
  );
  const [showFullScreenViewer, setShowFullScreenViewer] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  // ✅ NEW: Track if user has scrolled down to lazy load components
  const [hasScrolled, setHasScrolled] = useState(false);

  // ✅ NEW: Track if user has scrolled past action buttons
  const [showHeaderButtons, setShowHeaderButtons] = useState(false);
  const actionButtonsRef = useRef<HTMLDivElement>(null);

  // ✅ OPTIMIZED: Dark mode detection with debouncing
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initialize theme from localStorage
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;

    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    let timeoutId: NodeJS.Timeout;

    const detectDarkMode = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const htmlElement = document.documentElement;
        const darkModeMediaQuery = window.matchMedia(
          "(prefers-color-scheme: dark)"
        );

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

      // Check if user has scrolled past the action buttons
      if (actionButtonsRef.current) {
        const buttonRect = actionButtonsRef.current.getBoundingClientRect();
        // Responsive header height: mobile has smaller headers
        const isMobileView = window.innerWidth < 640;
        const marketHeaderHeight = 64; // MarketHeader height
        const productHeaderHeight = isMobileView ? 48 : 52; // Product detail header
        const headerHeight = marketHeaderHeight + productHeaderHeight;

        // Show header buttons when original buttons scroll above viewport + header
        if (buttonRect.bottom < headerHeight) {
          setShowHeaderButtons(true);
        } else {
          setShowHeaderButtons(false);
        }
      }
    };

    // Check immediately in case already scrolled
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasScrolled]);

  // Scroll to top when product changes
  useEffect(() => {
    if (productId) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [productId]);

  const fetchProduct = useCallback(
    async (id: string) => {
      const abortController = new AbortController();

      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`/api/products/${id}`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(t("productNotFound"));
        }

        const productData = await response.json();
        const parsedProduct = ProductUtils.fromJson(productData);
        setProduct(parsedProduct);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        console.error("Error fetching product:", err);
        setError(err instanceof Error ? err.message : t("failedToLoadProduct"));
      } finally {
        setIsLoading(false);
      }

      return () => {
        abortController.abort();
      };
    },
    [t]
  );

  const fetchFreshData = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/products/${id}`);

      if (response.ok) {
        const productData = await response.json();
        const freshProduct = ProductUtils.fromJson(productData);

        // Update if data changed
        setProduct((prevProduct) => {
          if (!prevProduct) return freshProduct;

          // Compare prices, stock, etc. - update if different
          if (
            prevProduct.price !== freshProduct.price ||
            prevProduct.quantity !== freshProduct.quantity
          ) {
            return freshProduct;
          }

          return prevProduct;
        });

        // Update cache
        sessionStorage.setItem(`product_${id}`, JSON.stringify(productData));
        sessionStorage.setItem(
          `product_${id}_timestamp`,
          Date.now().toString()
        );
      }
    } catch (error) {
      console.error("Error fetching fresh data:", error);
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

  // ✅ OPTIMIZED: Favorite toggle with FavoritesProvider
  const handleToggleFavorite = useCallback(async () => {
    if (!product?.id) return;
    if (!user) {
      router.push("/login");
      return;
    }

    const isCurrentlyFavorite = isFavorite(product.id);

    try {
      if (isCurrentlyFavorite) {
        // Remove from favorites
        await removeMultipleFromFavorites([product.id]);
      } else {
        // Add to favorites
        await addToFavorites(product.id);
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
    }
  }, [
    product?.id,
    user,
    router,
    isFavorite,
    addToFavorites,
    removeMultipleFromFavorites,
  ]);

  const navigateToBuyNow = useCallback(
    (selectedOptions: { quantity?: number; [key: string]: unknown }) => {
      if (!product) return;

      // ✅ Build cart-like item structure (matching CartProvider format)
      const cartLikeItem = {
        productId: product.id,
        quantity: selectedOptions.quantity || 1,

        // Product data (matching buildProductDataForCart in CartProvider)
        productName: product.productName,
        unitPrice: product.price,
        currency: product.currency,
        description: product.description || "",
        condition: product.condition || "New",
        brandModel: product.brandModel || "",
        category: product.category || "Uncategorized",
        subcategory: product.subcategory || "",
        subsubcategory: product.subsubcategory || "",
        allImages: product.imageUrls || [],
        productImage: product.imageUrls?.[0] || "",
        availableStock: product.quantity || 0,
        averageRating: product.averageRating || 0,
        reviewCount: product.reviewCount || 0,
        sellerId: product.userId || product.shopId || "unknown",
        sellerName: product.sellerName || "Seller",
        isShop: product.shopId != null,
        ilanNo: product.ilanNo || "N/A",
        deliveryOption: product.deliveryOption || "Standard",

        // ✅ Optional product fields - FIXED
        ...(product.originalPrice !== undefined &&
        product.originalPrice !== null
          ? { originalPrice: product.originalPrice }
          : {}),
        ...(product.discountPercentage !== undefined &&
        product.discountPercentage !== null
          ? { discountPercentage: product.discountPercentage }
          : {}),
        ...(product.colorImages && Object.keys(product.colorImages).length > 0
          ? { colorImages: product.colorImages }
          : {}),
        ...(product.videoUrl ? { videoUrl: product.videoUrl } : {}),
        ...(product.colorQuantities &&
        Object.keys(product.colorQuantities).length > 0
          ? { colorQuantities: product.colorQuantities }
          : {}),
        ...(product.availableColors && product.availableColors.length > 0
          ? { availableColors: product.availableColors }
          : {}),
        ...(product.maxQuantity !== undefined && product.maxQuantity !== null
          ? { maxQuantity: product.maxQuantity }
          : {}),
        ...(product.discountThreshold !== undefined &&
        product.discountThreshold !== null
          ? { discountThreshold: product.discountThreshold }
          : {}),
        ...(product.bulkDiscountPercentage !== undefined &&
        product.bulkDiscountPercentage !== null
          ? { bulkDiscountPercentage: product.bulkDiscountPercentage }
          : {}),
        ...(product.bundleIds && product.bundleIds.length > 0
          ? { bundleIds: product.bundleIds }
          : {}),
        ...(product.bundleData && product.bundleData.length > 0
          ? { bundleData: product.bundleData }
          : {}),
        ...(product.shopId ? { shopId: product.shopId } : {}),

        // ✅ Selected options (flattened to root - matching cart structure!) - FIXED
        ...(selectedOptions.selectedColor
          ? { selectedColor: selectedOptions.selectedColor as string }
          : {}),
        ...(selectedOptions.selectedColorImage
          ? { selectedColorImage: selectedOptions.selectedColorImage as string }
          : {}),

        // ✅ Flatten ALL other attributes to root level (matching cart!)
        ...Object.fromEntries(
          Object.entries(selectedOptions).filter(
            ([key]) =>
              !["quantity", "selectedColor", "selectedColorImage"].includes(key)
          )
        ),
      };

      // ✅ Encode as base64 to pass via URL (avoid query string length limits)
      const encodedData = btoa(JSON.stringify(cartLikeItem));

      // ✅ Navigate to payment page
      router.push(`/${locale}/productpayment?buyNowData=${encodedData}`);
    },
    [product, router]
  );

  const handleAddToCart = useCallback(
    async (selectedOptions?: { quantity?: number; [key: string]: unknown }) => {
      if (!user) {
        router.push("/login");
        return;
      }

      if (!product) return;

      // ✅ Prevent double-clicks
      if (cartButtonState === "adding" || cartButtonState === "removing") {
        return;
      }

      const productInCart = cartProductIds.has(product.id);
      const isAdding = !productInCart;

      // ✅ Handle options modal FIRST (if needed)
      if (isAdding && hasSelectableOptions(product) && !selectedOptions) {
        setShowCartOptionSelector(true);
        return;
      }

      try {
        // ✅ Set button state BEFORE operation
        setCartButtonState(isAdding ? "adding" : "removing");

        // ✅ Haptic feedback
        if (isAdding && navigator.vibrate) {
          navigator.vibrate(10);
        }

        // ✅ Perform operation
        let result: string;

        if (isAdding) {
          let quantityToAdd = 1;
          const attributesToAdd: Record<string, unknown> = {};

          if (selectedOptions) {
            if (typeof selectedOptions.quantity === "number") {
              quantityToAdd = selectedOptions.quantity;
            }

            Object.entries(selectedOptions).forEach(([key, value]) => {
              if (key !== "quantity") {
                attributesToAdd[key] = value;
              }
            });
          }

          const selectedColor = attributesToAdd.selectedColor as
            | string
            | undefined;
          delete attributesToAdd.selectedColor;

          result = await addProductToCart(
            product,
            quantityToAdd,
            selectedColor,
            Object.keys(attributesToAdd).length > 0
              ? attributesToAdd
              : undefined
          );
        } else {
          result = await removeFromCart(product.id);
        }

        // ✅ Check result
        if (
          result.includes("Added") ||
          result.includes("Removed") ||
          result.includes("cart")
        ) {
          // Success
          setCartButtonState(isAdding ? "added" : "removed");

          // Reset after animation
          setTimeout(() => {
            setCartButtonState("idle");
          }, 1500);
        } else {
          // Failed
          setCartButtonState("idle");

          if (result === "Please log in first") {
            router.push("/login");
          }
        }
      } catch (error) {
        console.error("Cart operation error:", error);
        setCartButtonState("idle");
      }
    },
    [
      user,
      product,
      cartProductIds,
      cartButtonState,
      router,
      addProductToCart,
      removeFromCart,
    ]
  );

  const handleCartOptionSelectorConfirm = useCallback(
    async (selectedOptions: { quantity?: number; [key: string]: unknown }) => {
      setShowCartOptionSelector(false);
      // ✅ Pass the selected options to handleAddToCart
      await handleAddToCart(selectedOptions);
    },
    [handleAddToCart] // ✅ Fixed dependency
  );

  const handleCartOptionSelectorClose = useCallback(() => {
    setShowCartOptionSelector(false);
  }, []);

  const [showBuyNowOptionSelector, setShowBuyNowOptionSelector] =
    useState(false);

  const handleBuyNow = useCallback(() => {
    if (!user) {
      router.push("/login");
      return;
    }

    if (!product) return;

    // ✅ Check if product has selectable options
    if (hasSelectableOptions(product)) {
      // Show option selector for Buy Now
      setShowBuyNowOptionSelector(true);
    } else {
      // No options needed - navigate directly with default values
      navigateToBuyNow({
        quantity: 1,
      });
    }
  }, [user, product, router, navigateToBuyNow]);

  const handleBuyNowOptionSelectorConfirm = useCallback(
    (selectedOptions: { quantity?: number; [key: string]: unknown }) => {
      setShowBuyNowOptionSelector(false);
      navigateToBuyNow(selectedOptions);
    },
    [navigateToBuyNow]
  );

  // ✅ ADD: Handler for Buy Now option selector close
  const handleBuyNowOptionSelectorClose = useCallback(() => {
    setShowBuyNowOptionSelector(false);
  }, []);

  const cartButtonContent = useMemo(() => {
    if (!product) {
      return {
        icon: <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />,
        text: t("addToCart"),
      };
    }

    const productInCart = cartProductIds.has(product.id);

    // Show state based on button state first, then actual cart state
    if (cartButtonState === "adding") {
      return {
        icon: (
          <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        text: t("adding"),
      };
    }

    if (cartButtonState === "removing") {
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

    // Default state based on actual cart
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
  }, [product, cartProductIds, cartButtonState, t]);

  // Check if add to cart button should be disabled
  const isAddToCartDisabled = useMemo(() => {
    if (!product) return false;

    // Disable while processing
    if (cartButtonState === "adding" || cartButtonState === "removing") {
      return true;
    }

    // Disable if no stock and no color options
    const hasNoStock = product.quantity === 0;
    const hasColorOptions =
      product.colorQuantities &&
      Object.keys(product.colorQuantities).length > 0;

    return hasNoStock && !hasColorOptions;
  }, [product, cartButtonState]);

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
            className={`mb-4 text-sm sm:text-base ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
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

  const productInCart = product ? cartProductIds.has(product.id) : false;
  const isProcessing =
    cartButtonState === "adding" || cartButtonState === "removing";

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* Header */}
      <div
        className={`sticky top-16 z-[60] backdrop-blur-md border-b transition-all duration-300 ${
          isDarkMode
            ? "bg-gray-900/95 border-gray-700"
            : "bg-white/95 border-gray-200"
        }`}
        style={{ position: "sticky" }}
      >
        <div className="w-full px-3 py-2 sm:max-w-6xl sm:mx-auto sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => router.back()}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors flex-shrink-0 ${
                isDarkMode
                  ? "hover:bg-gray-800 text-gray-300"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            {/* Spacer to push buttons to the right */}
            <div className="flex-1"></div>

            {/* Action Buttons - Show when scrolled past original buttons */}
            <div
              className={`flex items-center gap-1.5 sm:gap-2 transition-all duration-500 ease-in-out overflow-hidden ${
                showHeaderButtons
                  ? "max-w-[400px] sm:max-w-[420px] opacity-100"
                  : "max-w-0 opacity-0"
              }`}
              style={{
                transitionProperty: "max-width, opacity",
              }}
            >
              <button
                onClick={() => handleAddToCart()}
                disabled={isProcessing || isAddToCartDisabled}
                className={`
                  py-2 px-3 rounded-lg font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 whitespace-nowrap flex-shrink-0
                  ${
                    productInCart && cartButtonState === "idle"
                      ? isDarkMode
                        ? "border border-red-500 text-red-400 hover:bg-red-900/20"
                        : "border border-red-500 text-red-600 hover:bg-red-50"
                      : cartButtonState === "added" ||
                        cartButtonState === "removed"
                      ? "border border-green-500 text-green-600 bg-green-50"
                      : isDarkMode
                      ? "border border-orange-500 text-orange-400 hover:bg-orange-900/20"
                      : "border border-orange-500 text-orange-600 hover:bg-orange-50"
                  }
                  ${
                    isProcessing || isAddToCartDisabled
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }
                `}
              >
                <span className="inline">{cartButtonContent.icon}</span>
                <span>{cartButtonContent.text}</span>
              </button>

              <button
                onClick={handleBuyNow}
                className={`py-2 px-3 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-lg font-semibold text-xs transition-all duration-300 flex items-center justify-center whitespace-nowrap shadow-lg flex-shrink-0`}
              >
                {t("buyNow")}
              </button>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <button
                onClick={handleToggleFavorite}
                className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-300"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <Heart
                  className={`w-5 h-5 ${
                    product && isFavorite(product.id)
                      ? "fill-red-500 text-red-500"
                      : ""
                  }`}
                />
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
      <div className="w-full sm:max-w-6xl sm:mx-auto p-2 sm:p-3 lg:p-4">
        <div className="grid lg:grid-cols-2 gap-3 sm:gap-6 lg:gap-8">
          {/* Left Column - Images */}
          <div className="space-y-2 sm:space-y-3">
            {/* Main Image */}
            <div className="relative w-full h-[400px] sm:h-[480px] lg:h-[560px] rounded-lg overflow-hidden">
              {product.imageUrls.length > 0 &&
              !imageErrors.has(currentImageIndex) ? (
                <div className="relative w-full h-full overflow-hidden">
                  {/* Previous Image - Sliding Out */}
                  {previousImageIndex !== currentImageIndex && (
                    <div className="absolute inset-0">
                      <Image
                        key={`prev-${previousImageIndex}`}
                        src={product.imageUrls[previousImageIndex]}
                        alt={product.productName}
                        fill
                        className="object-contain"
                        style={{
                          animation:
                            slideDirection === "right"
                              ? "slideOutToLeft 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards"
                              : "slideOutToRight 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards",
                        }}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    </div>
                  )}

                  {/* Current Image - Sliding In */}
                  <div className="absolute inset-0">
                    <Image
                      key={`current-${currentImageIndex}`}
                      src={product.imageUrls[currentImageIndex]}
                      alt={product.productName}
                      fill
                      className="object-contain cursor-pointer hover:scale-105 transition-transform duration-300"
                      style={{
                        animation:
                          slideDirection === "right"
                            ? "slideInFromRight 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards"
                            : "slideInFromLeft 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards",
                      }}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      onClick={() => setShowFullScreenViewer(true)}
                      onError={() => handleImageError(currentImageIndex)}
                      priority
                    />
                  </div>

                  <style jsx>{`
                    @keyframes slideInFromRight {
                      0% {
                        transform: translateX(100%);
                      }
                      100% {
                        transform: translateX(0);
                      }
                    }
                    @keyframes slideInFromLeft {
                      0% {
                        transform: translateX(-100%);
                      }
                      100% {
                        transform: translateX(0);
                      }
                    }
                    @keyframes slideOutToLeft {
                      0% {
                        transform: translateX(0);
                      }
                      100% {
                        transform: translateX(-100%);
                      }
                    }
                    @keyframes slideOutToRight {
                      0% {
                        transform: translateX(0);
                      }
                      100% {
                        transform: translateX(100%);
                      }
                    }
                  `}</style>
                </div>
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
                    <p className="text-sm sm:text-base">
                      {t("noImageAvailable")}
                    </p>
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
              <div className="flex justify-center">
                <div
                  className="flex gap-1.5 sm:gap-2 overflow-x-auto py-2 px-2 scrollbar-hide"
                  style={{ WebkitOverflowScrolling: "touch" }}
                >
                  {product.imageUrls.map((url, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        const direction =
                          index > currentImageIndex ? "right" : "left";
                        setSlideDirection(direction);
                        setPreviousImageIndex(currentImageIndex);
                        setCurrentImageIndex(index);
                      }}
                      onMouseEnter={() => {
                        const direction =
                          index > currentImageIndex ? "right" : "left";
                        setSlideDirection(direction);
                        setPreviousImageIndex(currentImageIndex);
                        setCurrentImageIndex(index);
                      }}
                      className={`flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-md overflow-hidden border-2 transition-all duration-300 ${
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
                        width={56}
                        height={56}
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
          <div className="space-y-3 sm:space-y-4">
            {/* Product Title & Brand */}
            <div className="space-y-1.5 sm:space-y-2">
              {product.brandModel && (
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
              )}

              <h1
                className={`text-base sm:text-lg lg:text-xl font-bold leading-tight ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {product.productName}
              </h1>

              <div
                className={`text-lg sm:text-xl lg:text-2xl font-bold text-orange-600`}
              >
                {product.price} {product.currency}
              </div>
            </div>

            {/* Actions Row */}
            <ProductDetailActionsRow
              product={product}
              onShare={handleShare}
              onToggleFavorite={handleToggleFavorite}
              isFavorite={isFavorite(product.id)}
              isDarkMode={isDarkMode}
              localization={localization}
            />

            {/* Action Buttons */}
            <div
              ref={actionButtonsRef}
              className="flex gap-2 sm:gap-3 pt-1 sm:pt-2"
            >
              <button
                onClick={() => handleAddToCart()}
                disabled={isProcessing || isAddToCartDisabled}
                className={`
                  flex-1 py-2 px-3 sm:py-2.5 sm:px-4 rounded-lg font-semibold text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 relative overflow-hidden
                  ${
                    productInCart && cartButtonState === "idle"
                      ? isDarkMode
                        ? "border-2 border-red-500 text-red-400 hover:bg-red-900/20"
                        : "border-2 border-red-500 text-red-600 hover:bg-red-50"
                      : cartButtonState === "added" ||
                        cartButtonState === "removed"
                      ? "border-2 border-green-500 text-green-600 bg-green-50"
                      : isDarkMode
                      ? "border-2 border-orange-500 text-orange-400 hover:bg-orange-900/20"
                      : "border-2 border-orange-500 text-orange-600 hover:bg-orange-50"
                  }
                  ${
                    isProcessing || isAddToCartDisabled
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }
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

                {(cartButtonState === "added" ||
                  cartButtonState === "removed") && (
                  <div className="absolute inset-0 bg-green-500/10 animate-pulse rounded-lg sm:rounded-xl" />
                )}
              </button>

              <button
                onClick={handleBuyNow}
                className="flex-1 py-2 px-3 sm:py-2.5 sm:px-4 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-lg font-semibold text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
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

            {/* Attributes Widget */}
            <DynamicAttributesWidget
              product={product}
              isDarkMode={isDarkMode}
              localization={localization}
            />

            {/* Description */}
            {product.description && (
              <div
                className={`rounded-lg p-2 sm:p-3 border ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <h3
                  className={`text-xs sm:text-sm font-bold mb-1.5 sm:mb-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("productDescription")}
                </h3>
                <div className="relative">
                  <p
                    className={`leading-relaxed text-xs sm:text-sm ${
                      isDarkMode ? "text-gray-300" : "text-gray-700"
                    } line-clamp-[6]`}
                  >
                    {product.description}
                  </p>
                  {product.description.length > 250 && (
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t ${
                        isDarkMode
                          ? "from-gray-800 via-gray-800/80 to-transparent"
                          : "from-white via-white/80 to-transparent"
                      } pointer-events-none`}
                    />
                  )}
                </div>
                {product.description.length > 250 && (
                  <button
                    onClick={() => setShowDescriptionModal(true)}
                    className={`mt-2 text-xs sm:text-sm font-semibold transition-colors ${
                      isDarkMode
                        ? "text-orange-400 hover:text-orange-300"
                        : "text-orange-600 hover:text-orange-700"
                    }`}
                  >
                    {t("readAll") || "Read All"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ✅ OPTIMIZED: Bottom sections lazy loaded */}
        <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
          {/* ✅ LAZY LOADED: Heavy components below the fold */}
          {hasScrolled && (
            <Suspense
              fallback={
                <div className="h-40 animate-pulse bg-gray-200 rounded-lg" />
              }
            >
              <ProductCollectionWidget
                productId={product.id}
                shopId={product.shopId}
                isDarkMode={isDarkMode}
                localization={localization}
              />
            </Suspense>
          )}

          {hasScrolled && (
            <Suspense
              fallback={
                <div className="h-40 animate-pulse bg-gray-200 rounded-lg" />
              }
            >
              <BundleComponent
                productId={product.id}
                shopId={product.shopId}
                isDarkMode={isDarkMode}
                localization={localization}
              />
            </Suspense>
          )}

          {hasScrolled && (
            <Suspense
              fallback={
                <div className="h-40 animate-pulse bg-gray-200 rounded-lg" />
              }
            >
              <ProductDetailReviewsTab
                productId={product.id}
                isDarkMode={isDarkMode}
                localization={localization}
              />
            </Suspense>
          )}

          {hasScrolled && (
            <Suspense
              fallback={
                <div className="h-40 animate-pulse bg-gray-200 rounded-lg" />
              }
            >
              <ProductQuestionsWidget
                productId={product.id}
                sellerId={product.userId}
                shopId={product.shopId}
                isShop={!!product.shopId}
                isDarkMode={isDarkMode}
                localization={localization}
              />
            </Suspense>
          )}

          {hasScrolled && (
            <Suspense
              fallback={
                <div className="h-40 animate-pulse bg-gray-200 rounded-lg" />
              }
            >
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
      {product && (
        <ProductOptionSelector
          product={product}
          isOpen={showBuyNowOptionSelector}
          onClose={handleBuyNowOptionSelectorClose}
          onConfirm={handleBuyNowOptionSelectorConfirm}
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

              router.push(
                `/asktoseller?productId=${product.id}&sellerId=${sellerId}&isShop=${isShop}`
              );
            }}
            isDarkMode={isDarkMode}
            localization={localization}
          />
        </Suspense>
      )}

      {/* Description Modal */}
      {showDescriptionModal && product.description && (
        <div className="fixed top-4 right-4 z-50 max-w-md w-[calc(100vw-2rem)] animate-slideInFromTop">
          <div
            className={`rounded-lg shadow-2xl border overflow-hidden ${
              isDarkMode
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-gray-200"
            }`}
            style={{
              animation: "slideInFromTop 0.3s ease-out forwards",
            }}
          >
            <div
              className={`flex items-center justify-between p-3 border-b ${
                isDarkMode ? "border-gray-700" : "border-gray-200"
              }`}
            >
              <h3
                className={`text-sm sm:text-base font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("productDescription")}
              </h3>
              <button
                onClick={() => setShowDescriptionModal(false)}
                className={`p-1 rounded-lg transition-colors ${
                  isDarkMode
                    ? "hover:bg-gray-700 text-gray-400"
                    : "hover:bg-gray-100 text-gray-600"
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div
              className={`p-3 max-h-[70vh] overflow-y-auto ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                {product.description}
              </p>
            </div>
          </div>
          <style jsx>{`
            @keyframes slideInFromTop {
              0% {
                transform: translateY(-100%);
                opacity: 0;
              }
              100% {
                transform: translateY(0);
                opacity: 1;
              }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};

export default ProductDetailPage;
