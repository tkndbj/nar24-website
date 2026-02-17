"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef, UIEvent } from "react";
import dynamic from "next/dynamic";
import {
  Trash2,
  ArrowRight,
  ShoppingBag,
  User,
  LogIn,
  Heart,
  Minus,
  Plus,
  Tag,
  Truck,
  Check,
  Ticket,
  ArrowLeft,
} from "lucide-react";
import { CompactBundleWidget } from "@/app/components/CompactBundle";
import { useCart, CartTotals, CartItemTotal } from "@/context/CartProvider";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "@/navigation";
import { useTranslations } from "next-intl";
import { AttributeLocalizationUtils } from "@/constants/AttributeLocalization";
import { db } from "@/lib/firebase";
import Image from "next/image";
import { Product } from "@/app/models/Product";
import { doc, onSnapshot } from "firebase/firestore";

import { useDiscountSelection } from "@/context/DiscountSelectionProvider";
import { CouponSelectionSheet } from "@/app/components/CouponSelectionSheet";
import { Coupon, UserBenefit } from "@/app/models/coupon";
import { useCoupon } from "@/context/CouponProvider";
import Footer from "@/app/components/Footer";

// Lazy load CartValidationDialog - only shown when validation needed
const CartValidationDialog = dynamic(
  () => import("@/app/components/CartValidationDialog"),
  { ssr: false }
);

interface ValidationMessage {
  key: string;
  params: Record<string, unknown>;
}

interface ValidatedCartItem {
  productId: string;
  unitPrice?: number;
  bundlePrice?: number;
  discountPercentage?: number;
  discountThreshold?: number;
  bulkDiscountPercentage?: number;
  maxQuantity?: number;
  [key: string]: unknown;
}

// Type definitions matching CartProvider
interface SalePreferences {
  discountThreshold?: number;
  bulkDiscountPercentage?: number;
  maxQuantity?: number;
}

interface CartData {
  quantity: number;
  selectedColor?: string;
  selectedSize?: string;
  selectedMetres?: number;
  [key: string]: unknown;
}

interface CartItem {
  productId: string;
  cartData: CartData;
  product: Product | null;
  quantity: number;
  sellerName: string;
  sellerId: string;
  isShop: boolean;
  isOptimistic?: boolean;
  salePreferences?: SalePreferences | null;
  salePreferenceInfo?: SalePreferences | null;
  selectedColorImage?: string;
  showSellerHeader?: boolean;
  [key: string]: unknown;
}

export default function CartPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useUser();
  const localization = useTranslations();
  const {
    cartItems,
    cartCount,
    isLoading,
    isLoadingMore,
    hasMore,
    isInitialized,
    updateQuantity,
    removeFromCart,
    initializeCartIfNeeded,
    loadMoreItems,
    calculateCartTotals,
    validateForPayment,
    updateCartCacheFromValidation,
  } = useCart();

  // ✅ Coupon Service - for available coupons/benefits
  const {
    activeCoupons,
    activeFreeShippingBenefits,
    isFreeShippingApplicable,
  } = useCoupon();

  // ✅ Discount Selection Service - for selected discounts (matches Flutter's DiscountSelectionService)
  const {
    selectedCoupon,
    selectedBenefit,
    useFreeShipping,
    hasAnyDiscount,
    selectCoupon,
    setFreeShipping,
    calculateCouponDiscount,
    calculateFinalTotal,
    revalidateSelections,
  } = useDiscountSelection();

  // ✅ Theme detection
  const [isDark, setIsDark] = useState(false);

  // ✅ Coupon sheet state
  const [showCouponSheet, setShowCouponSheet] = useState(false);

  const [salesPaused, setSalesPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [showSalesPausedDialog, setShowSalesPausedDialog] = useState(false);
  const totalsVerificationTimer = useRef<NodeJS.Timeout | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const isLoadingMoreRef = useRef(false); // Prevents race conditions
  const [deselectedProducts, setDeselectedProducts] = useState<Set<string>>(
    new Set()
  );

  // Totals state
  const [calculatedTotals, setCalculatedTotals] = useState<CartTotals>({
    total: 0,
    currency: "TL",
    items: [],
  });
  const [isCalculatingTotals, setIsCalculatingTotals] = useState(false);

  const [isValidating, setIsValidating] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    errors: Record<string, ValidationMessage>;
    warnings: Record<string, ValidationMessage>;
    validatedItems: ValidatedCartItem[];
  } | null>(null);

  // ========================================================================
  // THEME DETECTION
  // ========================================================================

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }
    const checkTheme = () => setIsDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // ========================================================================
  // TRANSLATION HELPER
  // ========================================================================

  const t = useCallback(
    (key: string, fallback?: string) => {
      if (!localization) return fallback ?? key;

      try {
        const translation = localization(`CartDrawer.${key}`);
        if (translation && translation !== `CartDrawer.${key}`) {
          return translation;
        }

        const directTranslation = localization(key);
        if (directTranslation && directTranslation !== key) {
          return directTranslation;
        }

        return fallback ?? key;
      } catch (error) {
        console.warn(`Translation error for key: ${key}`, error);
        return fallback ?? key;
      }
    },
    [localization]
  );

  // ========================================================================
  // COMPUTED VALUES (matching Flutter)
  // ========================================================================

  // Check if user has any coupons or benefits available
  const hasAnyCouponsOrBenefits = useMemo(() => {
    return activeCoupons.length > 0 || activeFreeShippingBenefits.length > 0;
  }, [activeCoupons, activeFreeShippingBenefits]);

  // Get selected item count
  const selectedIds = useMemo(() => {
    return cartItems
      .filter((item) => !deselectedProducts.has(item.productId))
      .map((item) => item.productId);
  }, [cartItems, deselectedProducts]);

  // Calculate coupon discount amount
  const couponDiscount = useMemo(() => {
    return calculateCouponDiscount(calculatedTotals.total);
  }, [calculateCouponDiscount, calculatedTotals.total]);

  // Calculate final total after discounts
  const finalTotal = useMemo(() => {
    return calculateFinalTotal(calculatedTotals.total);
  }, [calculateFinalTotal, calculatedTotals.total]);

  useEffect(() => {
    if (selectedCoupon && couponDiscount === 0 && calculatedTotals.total > 0) {
      // Coupon selected but not applicable
      selectCoupon(null);
    }
  }, [selectedCoupon, couponDiscount, calculatedTotals.total, selectCoupon]);

  // Auto-clear free shipping if no longer applicable
  useEffect(() => {
    if (useFreeShipping && !isFreeShippingApplicable(calculatedTotals.total) && calculatedTotals.total > 0) {
      setFreeShipping(false);
    }
  }, [useFreeShipping, calculatedTotals.total, isFreeShippingApplicable, setFreeShipping]);

  // ========================================================================
  // EFFECTS
  // ========================================================================

  // Revalidate selections on app resume/focus (matching Flutter's didChangeAppLifecycleState)
  useEffect(() => {
    const handleFocus = () => {
      revalidateSelections();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [revalidateSelections]);

  // Listen to sales config in real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "settings", "salesConfig"),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSalesPaused(data.salesPaused || false);
          setPauseReason(data.pauseReason || "");
        } else {
          setSalesPaused(false);
          setPauseReason("");
        }
      },
      (error) => {
        console.error("Error listening to sales config:", error);
        setSalesPaused(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Initialize cart on mount
  useEffect(() => {
    if (user && !isInitialized && !isLoading) {
      initializeCartIfNeeded();
    }
  }, [user, isInitialized, isLoading, initializeCartIfNeeded]);

  // Sync selections with cart items (matching Flutter's _syncSelections)
  useEffect(() => {
    if (cartItems.length === 0) {
      setDeselectedProducts(new Set());
      return;
    }

    const currentProductIds = new Set(
      cartItems.map((item) => item.productId)
    );

    setDeselectedProducts((prev) => {
      const newDeselected = new Set<string>();
      prev.forEach((id) => {
        // Only keep deselection if item still exists in cart
        if (currentProductIds.has(id)) {
          newDeselected.add(id);
        }
      });
      return newDeselected;
    });
  }, [cartItems]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (totalsVerificationTimer.current) {
        clearTimeout(totalsVerificationTimer.current);
      }
    };
  }, []);

  // ========================================================================
  // INFINITE SCROLL - IntersectionObserver for reliable pagination
  // ========================================================================

  // Stable loadMore handler that prevents race conditions
  const handleLoadMore = useCallback(async () => {
    // Guard against concurrent loads using ref (more reliable than state)
    if (isLoadingMoreRef.current || !hasMore || isLoadingMore) {
      return;
    }

    isLoadingMoreRef.current = true;
    try {
      await loadMoreItems();
    } finally {
      // Small delay before allowing next load to prevent rapid-fire calls
      setTimeout(() => {
        isLoadingMoreRef.current = false;
      }, 100);
    }
  }, [hasMore, isLoadingMore, loadMoreItems]);

  // IntersectionObserver for automatic infinite scroll
  useEffect(() => {
    if (!user || cartCount === 0 || !hasMore) {
      return;
    }

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !isLoadingMore && !isLoadingMoreRef.current) {
          console.log("📜 Sentinel visible, loading more items...");
          handleLoadMore();
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: "200px", // Trigger 200px before reaching the sentinel
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [user, cartCount, hasMore, isLoadingMore, handleLoadMore]);

  // Fallback scroll handler for browsers with IntersectionObserver issues
  const handleScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      if (!hasMore || isLoadingMore || isLoadingMoreRef.current) {
        return;
      }

      const target = e.target as HTMLDivElement;
      const { scrollTop, scrollHeight, clientHeight } = target;

      // Trigger load when user is within 300px of the bottom
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      if (distanceFromBottom < 300) {
        handleLoadMore();
      }
    },
    [hasMore, isLoadingMore, handleLoadMore]
  );

  useEffect(() => {
    // Step 1: Immediate optimistic update
    const optimistic = calculateOptimisticTotals();
    setCalculatedTotals(optimistic);

    if (selectedIds.length === 0) {
      return;
    }

    // Step 2: Debounced server verification
    setIsCalculatingTotals(true);

    // Clear previous timer
    if (totalsVerificationTimer.current) {
      clearTimeout(totalsVerificationTimer.current);
    }

    totalsVerificationTimer.current = setTimeout(async () => {
      try {
        // ✅ Pass excluded IDs to Cloud Function (matching Flutter)
        const excludedIds = Array.from(deselectedProducts);
        const serverTotals = await calculateCartTotals(
          excludedIds.length > 0 ? excludedIds : undefined
        );
        setCalculatedTotals(serverTotals);
      } catch (error) {
        console.error("Server totals failed, using optimistic:", error);
      } finally {
        setIsCalculatingTotals(false);
      }
    }, 500); // 500ms debounce (matches Flutter)

    return () => {
      if (totalsVerificationTimer.current) {
        clearTimeout(totalsVerificationTimer.current);
      }
    };
  }, [deselectedProducts, cartItems, calculateCartTotals, selectedIds.length]);

  // ========================================================================
  // HELPER FUNCTIONS
  // ========================================================================

  const calculateOptimisticTotals = useCallback((): CartTotals => {
    if (selectedIds.length === 0) {
      return { total: 0, currency: "TL", items: [] };
    }

    const selectedItems = cartItems.filter((item) =>
      selectedIds.includes(item.productId)
    );

    let total = 0;
    const currency = selectedItems[0]?.product?.currency || "TL";
    const items: CartItemTotal[] = [];

    for (const item of selectedItems) {
      const quantity = item.quantity || 1;
      let unitPrice = item.product?.price || 0;

      // Apply bulk discount if applicable
      const salePrefs = item.salePreferences || item.salePreferenceInfo;
      const discountThreshold = salePrefs?.discountThreshold;
      const bulkDiscountPercentage = salePrefs?.bulkDiscountPercentage;

      if (
        discountThreshold &&
        bulkDiscountPercentage &&
        quantity >= discountThreshold
      ) {
        unitPrice = unitPrice * (1 - bulkDiscountPercentage / 100);
      }

      const itemTotal = unitPrice * quantity;
      total += itemTotal;

      items.push({
        productId: item.productId,
        unitPrice,
        total: itemTotal,
        quantity,
        isBundleItem: false,
      });
    }

    return {
      total: Math.round(total * 100) / 100,
      currency,
      items,
    };
  }, [cartItems, selectedIds]);

  // Get available stock for item (matching Flutter logic)
  const getAvailableStock = useCallback((item: CartItem): number => {
    const product = item.product;
    if (!product) return 0;

    const selectedColor = item.cartData?.selectedColor;

    if (
      selectedColor &&
      selectedColor !== "" &&
      selectedColor !== "default" &&
      product.colorQuantities?.[selectedColor] !== undefined
    ) {
      return product.colorQuantities[selectedColor] || 0;
    }

    return product.quantity || 0;
  }, []);

  // Format attributes for display
  const formatItemAttributes = useCallback(
    (item: CartItem) => {
      if (!localization) return "";

      const excludedKeys = [
        "productId",
        "cartData",
        "product",
        "quantity",
        "sellerName",
        "sellerId",
        "isShop",
        "isOptimistic",
        "selectedColorImage",
        "salePreferences",
        "salePreferenceInfo",
        "sellerContactNo",
        "ourComission",
        "unitPrice",
        "currency",
        "addedAt",
        "updatedAt",
        "showSellerHeader",
      ];

      const displayValues: string[] = [];

      // Handle selected color from cartData
      if (
        item.cartData?.selectedColor &&
        item.cartData.selectedColor !== "default"
      ) {
        displayValues.push(item.cartData.selectedColor);
      }

      // Handle selected size from cartData
      if (item.cartData?.selectedSize) {
        displayValues.push(item.cartData.selectedSize);
      }

      // Process other attributes - only include primitive values (string/number)
      Object.entries(item).forEach(([key, value]) => {
        if (
          !excludedKeys.includes(key) &&
          value !== undefined &&
          value !== null &&
          value !== "" &&
          typeof value !== "boolean" &&
          typeof value !== "object" &&
          !Array.isArray(value)
        ) {
          if (typeof value === "string" || typeof value === "number") {
            const localizedValue =
              AttributeLocalizationUtils.getLocalizedAttributeValue(
                key,
                value,
                localization
              );
            if (localizedValue.trim() !== "" && !displayValues.includes(localizedValue)) {
              displayValues.push(localizedValue);
            }
          }
        }
      });

      return displayValues.join(", ");
    },
    [localization]
  );

  // ========================================================================
  // CART OPERATIONS
  // ========================================================================

  const handleRemoveItem = useCallback(
    async (productId: string) => {
      try {
        await removeFromCart(productId);
      } catch (error) {
        console.error("Failed to remove item:", error);
      }
    },
    [removeFromCart]
  );

  const handleQuantityChange = useCallback(
    async (productId: string, newQuantity: number) => {
      try {
        await updateQuantity(productId, newQuantity);
      } catch (error) {
        console.error("Failed to update quantity:", error);
      }
    },
    [updateQuantity]
  );

  // ========================================================================
  // COUPON HANDLERS (matching Flutter)
  // ========================================================================

  const handleCouponSelected = useCallback(
    (coupon: Coupon | null) => {
      selectCoupon(coupon);
    },
    [selectCoupon]
  );

  const handleFreeShippingToggled = useCallback(
    (use: boolean, benefit?: UserBenefit | null) => {
      // Find the first valid free shipping benefit if toggling on and no benefit provided
      const benefitToUse = use && !benefit && activeFreeShippingBenefits.length > 0
        ? activeFreeShippingBenefits[0]
        : benefit;
      setFreeShipping(use, benefitToUse);
    },
    [setFreeShipping, activeFreeShippingBenefits]
  );

  const showCouponSelectionSheet = useCallback(() => {
    setShowCouponSheet(true);
  }, []);

  // ========================================================================
  // CHECKOUT (matching Flutter's _proceedToCheckout)
  // ========================================================================

  const proceedToPayment = useCallback(
    async (freshTotals: CartTotals) => {
      // Build pricing map from Cloud Function totals
      const pricingMap = new Map<string, CartItemTotal>();
      freshTotals.items.forEach((itemTotal) => {
        pricingMap.set(itemTotal.productId, itemTotal);
      });

      // Filter cart items to only include those with calculated pricing
      const itemsWithPricing = cartItems.filter(
        (item) =>
          selectedIds.includes(item.productId) && pricingMap.has(item.productId)
      );

      // Check if we lost any items
      if (itemsWithPricing.length !== selectedIds.length) {
        const missingIds = selectedIds.filter((id) => !pricingMap.has(id));
        console.error("❌ Missing pricing for items:", missingIds);
        alert(
          t("pricingError", "Some items are missing pricing information. Please refresh and try again.")
        );
        return;
      }

      // Store checkout data in sessionStorage
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "checkoutSelectedIds",
          JSON.stringify({
            selectedIds,
            timestamp: Date.now(),
          })
        );

        // ✅ Store discount selections (matching Flutter's passing to ProductPaymentScreen)
        sessionStorage.setItem(
          "checkoutDiscounts",
          JSON.stringify({
            couponId: selectedCoupon?.id ?? null,
            couponAmount: selectedCoupon?.amount ?? 0,
            couponCurrency: selectedCoupon?.currency ?? "TL",
            couponCode: selectedCoupon?.code ?? null,
            useFreeShipping: useFreeShipping,
            benefitId: selectedBenefit?.id ?? null,
            timestamp: Date.now(),
          })
        );
      }

      router.push("/productpayment");
    },
    [cartItems, selectedIds, selectedCoupon, selectedBenefit, useFreeShipping, router, t]
  );

  const handleCheckout = useCallback(async () => {
    if (selectedIds.length === 0) return;

    if (salesPaused) {
      setShowSalesPausedDialog(true);
      return;
    }

    setIsValidating(true);

    try {
      // STEP 1: Validate cart
      const validation = await validateForPayment(selectedIds, false);

      if (validation.isValid && Object.keys(validation.warnings).length === 0) {
        // STEP 2: Calculate FRESH totals with retry
        console.log("💰 Calculating fresh totals before payment...");

        let freshTotals: CartTotals | null = null;
        let retries = 3;

        const excludedIds = Array.from(deselectedProducts);

        while (retries > 0) {
          try {
            freshTotals = await calculateCartTotals(
              excludedIds.length > 0 ? excludedIds : undefined
            );
            break;
          } catch (error) {
            if (error instanceof Error && error.message.includes("Too many requests") && retries > 1) {
              console.log(`⏳ Rate limited, waiting 2s... (${retries - 1} retries left)`);
              await new Promise((resolve) => setTimeout(resolve, 2000));
              retries--;
            } else {
              throw new Error("Failed to calculate fresh totals");
            }
          }
        }

        // STEP 3: Validate totals before proceeding
        if (!freshTotals || freshTotals.total <= 0) {
          throw new Error("Invalid totals calculated");
        }

        console.log("💰 Fresh totals:", freshTotals);
        setIsValidating(false);
        proceedToPayment(freshTotals);
      } else {
        setIsValidating(false);
        setValidationResult(validation);
        setShowValidationDialog(true);
      }
    } catch (error) {
      setIsValidating(false);
      console.error("❌ Checkout error:", error);
      alert(t("validationFailed", "Checkout failed. Please wait a moment and try again."));
    }
  }, [
    selectedIds,
    deselectedProducts,
    validateForPayment,
    calculateCartTotals,
    proceedToPayment,
    salesPaused,
    t,
  ]);

  const handleValidationContinue = useCallback(async () => {
    if (!validationResult) return;

    setIsValidating(true);
    setShowValidationDialog(false);

    try {
      // Update cart cache
      if (validationResult.validatedItems.length > 0) {
        await updateCartCacheFromValidation(validationResult.validatedItems);
      }

      // Remove error items
      const errorIds = Object.keys(validationResult.errors);
      setDeselectedProducts((prev) => {
        const newSet = new Set(prev);
        errorIds.forEach((id) => newSet.add(id));
        return newSet;
      });

      // Get valid IDs
      const validIds = validationResult.validatedItems
        .map((item) => item.productId)
        .filter((id) => !errorIds.includes(id));

      setIsValidating(false);

      if (validIds.length > 0) {
        // ✅ Calculate FRESH totals with excluded IDs (matching Flutter)
        console.log("💰 Calculating fresh totals after validation...");
        const allProductIds = cartItems.map((item) => item.productId);
        const excludedForTotals = allProductIds.filter(
          (id) => !validIds.includes(id)
        );
        const freshTotals = await calculateCartTotals(
          excludedForTotals.length > 0 ? excludedForTotals : undefined
        );
        console.log("💰 Fresh totals:", freshTotals);

        // Proceed with fresh totals
        proceedToPayment(freshTotals);
      } else {
        alert(t("noValidItemsToCheckout", "No valid items to checkout"));
      }
    } catch (error) {
      setIsValidating(false);
      console.error("❌ Cache update error:", error);
    }
  }, [
    validationResult,
    updateCartCacheFromValidation,
    calculateCartTotals,
    proceedToPayment,
    t,
  ]);

  // ========================================================================
  // PRICE BREAKDOWN COMPONENT (matching Flutter's _buildPriceBreakdown)
  // ========================================================================

  const renderPriceBreakdown = useCallback(() => {
    if (!hasAnyDiscount) return null;

    const subtotal = calculatedTotals.total;

    return (
      <div className={`p-3 rounded-xl mb-3 border ${isDark ? "bg-emerald-900/15 border-emerald-800/40" : "bg-emerald-50/50 border-emerald-200"}`}>
        {/* Subtotal row */}
        <div className="flex justify-between items-center">
          <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            {t("subtotal", "Subtotal")}
          </span>
          <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            {subtotal.toFixed(2)} {calculatedTotals.currency}
          </span>
        </div>

        {/* Coupon discount row */}
        {couponDiscount > 0 && (
          <div className="flex justify-between items-center mt-1.5">
            <div className="flex items-center space-x-1">
              <Tag size={12} className="text-emerald-500" />
              <span className="text-xs font-medium text-emerald-600">
                {selectedCoupon?.code || t("coupon", "Coupon")}
              </span>
            </div>
            <span className="text-xs font-semibold text-emerald-600">
              -{couponDiscount.toFixed(2)} {calculatedTotals.currency}
            </span>
          </div>
        )}

        {/* Free shipping row */}
        {useFreeShipping && (
          <div className="flex justify-between items-center mt-1.5">
            <div className="flex items-center space-x-1">
              <Truck size={12} className="text-emerald-500" />
              <span className="text-xs font-medium text-emerald-600">
                {t("freeShipping", "Free Shipping")}
              </span>
            </div>
            <span className="text-xs font-semibold text-emerald-600">
              {t("applied", "Applied")}
            </span>
          </div>
        )}
      </div>
    );
  }, [
    hasAnyDiscount,
    calculatedTotals,
    couponDiscount,
    selectedCoupon,
    useFreeShipping,
    isDark,
    t,
  ]);

  // ========================================================================
  // COMPACT COUPON BUTTON (matching Flutter's _buildCompactCouponButton)
  // ========================================================================

  const renderCompactCouponButton = useCallback(() => {
    if (!hasAnyCouponsOrBenefits) return null;

    // Count applied discounts (matching Flutter logic)
    const appliedCount = (selectedCoupon ? 1 : 0) + (useFreeShipping ? 1 : 0);

    return (
      <button
        onClick={showCouponSelectionSheet}
        className={`px-2.5 py-1.5 rounded-lg border transition-colors ${
          hasAnyDiscount
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-orange-500/30 bg-orange-500/10"
        }`}
      >
        <div className="flex items-center space-x-1.5">
          {hasAnyDiscount ? (
            <Check size={12} className="text-emerald-500" />
          ) : (
            <Ticket size={12} className="text-orange-500" />
          )}
          <span
            className={`text-[11px] font-semibold ${
              hasAnyDiscount ? "text-emerald-600" : "text-orange-600"
            }`}
          >
            {hasAnyDiscount
              ? `${appliedCount} ${t("applied", "applied")}`
              : t("addDiscount", "Add discount")}
          </span>
        </div>
      </button>
    );
  }, [
    hasAnyCouponsOrBenefits,
    hasAnyDiscount,
    selectedCoupon,
    useFreeShipping,
    showCouponSelectionSheet,
    t,
  ]);

  // ========================================================================
  // RENDER CART ITEMS
  // ========================================================================

  const renderCartItems = useMemo(() => {
    return cartItems.map((item, index) => {
      const isSelected = !deselectedProducts.has(item.productId);
      const availableStock = getAvailableStock(item);
      const salePrefs = item.salePreferences || item.salePreferenceInfo;
      const maxQuantity = Math.min(
        availableStock,
        salePrefs?.maxQuantity ?? 99
      );
      const attributesDisplay = formatItemAttributes(item);

      // Calculate effective unit price and subtotal
      let effectivePrice = item.product?.price || 0;
      const hasBulkDiscount =
        salePrefs?.discountThreshold &&
        salePrefs?.bulkDiscountPercentage &&
        item.quantity >= salePrefs.discountThreshold;
      if (hasBulkDiscount) {
        effectivePrice = effectivePrice * (1 - (salePrefs!.bulkDiscountPercentage! / 100));
      }
      const subtotal = effectivePrice * item.quantity;
      const currency = item.product?.currency || "TL";

      return (
        <div key={item.productId}>
          {/* Seller Header - spans full width */}
          {item.showSellerHeader && (
            <div
              className={`flex items-center space-x-1.5 px-2 py-1.5 mb-1 rounded-lg ${
                isDark ? "bg-gray-800/60" : "bg-orange-50/80"
              }`}
            >
              <ShoppingBag size={11} className="text-orange-500" />
              <span className={`text-[11px] font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                {item.sellerName}
              </span>
            </div>
          )}

          {/* Item Row */}
          <div className={`py-4 ${index < cartItems.length - 1 ? `border-b ${isDark ? "border-gray-800/60" : "border-gray-100"}` : ""}`}>
            {/* Desktop layout */}
            <div className="hidden lg:grid lg:grid-cols-[auto_auto_1fr_100px_120px_100px_auto] lg:items-center lg:gap-4">
              {/* Checkbox */}
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setDeselectedProducts((prev) => {
                    const newSet = new Set(prev);
                    if (newSet.has(item.productId)) {
                      newSet.delete(item.productId);
                    } else {
                      newSet.add(item.productId);
                    }
                    return newSet;
                  });
                }}
                className="cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => {}}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500 pointer-events-none"
                />
              </div>

              {/* Image */}
              <div
                className={`relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden cursor-pointer border ${
                  isDark ? "border-gray-700" : "border-gray-200"
                }`}
                onClick={() => router.push(`/productdetail/${item.productId}`)}
              >
                <Image
                  src={item.selectedColorImage || item.product?.imageUrls?.[0] || ""}
                  alt={item.product?.productName || ""}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>

              {/* Product Info */}
              <div
                className="min-w-0 cursor-pointer"
                onClick={() => router.push(`/productdetail/${item.productId}`)}
              >
                {item.product?.brandModel && (
                  <p className={`text-[10px] font-medium mb-0.5 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                    {item.product.brandModel}
                  </p>
                )}
                <h3 className={`text-sm font-medium line-clamp-2 leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                  {item.product?.productName || t("loadingProduct", "Loading...")}
                </h3>
                {attributesDisplay && (
                  <p className={`text-[11px] mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    {attributesDisplay}
                  </p>
                )}
                {availableStock < 10 && (
                  <p className="text-[10px] text-red-500 mt-0.5">
                    {t("onlyLeft", "Only")} {availableStock} {t("left", "left")}
                  </p>
                )}
              </div>

              {/* Price */}
              <div className="text-right">
                <span className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                  {effectivePrice.toFixed(2)} {currency}
                </span>
                {hasBulkDiscount && (
                  <p className={`text-[10px] line-through ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                    {item.product?.price.toFixed(2)} {currency}
                  </p>
                )}
              </div>

              {/* Quantity */}
              <div className="flex items-center justify-center">
                <div className={`inline-flex items-center rounded-lg border ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.quantity > 1) {
                        handleQuantityChange(item.productId, item.quantity - 1);
                      }
                    }}
                    disabled={item.quantity <= 1 || item.isOptimistic}
                    className={`p-1.5 transition-colors ${
                      isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <Minus size={13} />
                  </button>
                  <span className={`min-w-[32px] text-center text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                    {item.quantity}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.quantity < maxQuantity) {
                        handleQuantityChange(item.productId, item.quantity + 1);
                      }
                    }}
                    disabled={item.quantity >= maxQuantity || item.isOptimistic}
                    className={`p-1.5 transition-colors ${
                      isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>

              {/* Subtotal */}
              <div className="text-right">
                <span className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {subtotal.toFixed(2)} {currency}
                </span>
              </div>

              {/* Remove */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveItem(item.productId);
                }}
                disabled={item.isOptimistic}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDark ? "text-gray-600 hover:text-red-400 hover:bg-red-900/20" : "text-gray-300 hover:text-red-500 hover:bg-red-50"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Mobile layout */}
            <div className="lg:hidden">
              <div className="flex items-start space-x-3">
                {/* Checkbox */}
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeselectedProducts((prev) => {
                      const newSet = new Set(prev);
                      if (newSet.has(item.productId)) {
                        newSet.delete(item.productId);
                      } else {
                        newSet.add(item.productId);
                      }
                      return newSet;
                    });
                  }}
                  className="cursor-pointer pt-1"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500 pointer-events-none"
                  />
                </div>

                {/* Image */}
                <div
                  className={`relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden cursor-pointer border ${
                    isDark ? "border-gray-700" : "border-gray-200"
                  }`}
                  onClick={() => router.push(`/productdetail/${item.productId}`)}
                >
                  <Image
                    src={item.selectedColorImage || item.product?.imageUrls?.[0] || ""}
                    alt={item.product?.productName || ""}
                    fill
                    className="object-cover"
                    sizes="80px"
                  />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div
                    className="cursor-pointer"
                    onClick={() => router.push(`/productdetail/${item.productId}`)}
                  >
                    {item.product?.brandModel && (
                      <p className={`text-[10px] font-medium mb-0.5 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                        {item.product.brandModel}
                      </p>
                    )}
                    <h3 className={`text-sm font-medium line-clamp-2 leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                      {item.product?.productName || t("loadingProduct", "Loading...")}
                    </h3>
                    {attributesDisplay && (
                      <p className={`text-[11px] mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                        {attributesDisplay}
                      </p>
                    )}
                  </div>

                  <p className="text-sm font-bold text-orange-500 mt-1">
                    {subtotal.toFixed(2)} {currency}
                    {item.quantity > 1 && (
                      <span className={`text-[10px] font-normal ml-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                        ({effectivePrice.toFixed(2)} x {item.quantity})
                      </span>
                    )}
                  </p>

                  {availableStock < 10 && (
                    <p className="text-[10px] text-red-500 mt-0.5">
                      {t("onlyLeft", "Only")} {availableStock} {t("left", "left")}
                    </p>
                  )}

                  {/* Mobile: Quantity + Remove row */}
                  <div className="flex items-center justify-between mt-2">
                    <div className={`inline-flex items-center rounded-lg border ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.quantity > 1) {
                            handleQuantityChange(item.productId, item.quantity - 1);
                          }
                        }}
                        disabled={item.quantity <= 1 || item.isOptimistic}
                        className={`p-1 transition-colors ${
                          isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        <Minus size={13} />
                      </button>
                      <span className={`min-w-[28px] text-center text-xs font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                        {item.quantity}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.quantity < maxQuantity) {
                            handleQuantityChange(item.productId, item.quantity + 1);
                          }
                        }}
                        disabled={item.quantity >= maxQuantity || item.isOptimistic}
                        className={`p-1 transition-colors ${
                          isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveItem(item.productId);
                      }}
                      disabled={item.isOptimistic}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isDark ? "text-gray-600 hover:text-red-400" : "text-gray-400 hover:text-red-500"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sale Preference Label */}
            {salePrefs?.discountThreshold && salePrefs?.bulkDiscountPercentage && (
              <div className="mt-2 lg:ml-[88px]">
                <div
                  className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    item.quantity >= salePrefs.discountThreshold
                      ? isDark
                        ? "bg-emerald-900/40 text-emerald-300"
                        : "bg-emerald-50 text-emerald-700"
                      : isDark
                      ? "bg-orange-900/40 text-orange-300"
                      : "bg-orange-50 text-orange-700"
                  }`}
                >
                  <span>
                    {item.quantity >= salePrefs.discountThreshold
                      ? t("youGotDiscount", `You got ${salePrefs.bulkDiscountPercentage}% discount!`)
                      : t("buyForDiscount", `Buy ${salePrefs.discountThreshold}+ for ${salePrefs.bulkDiscountPercentage}% off`)}
                  </span>
                </div>
              </div>
            )}

            {/* Compact Bundle Widget */}
            {item.isShop && item.sellerId && (
              <div className="mt-2 lg:ml-[88px]">
                <CompactBundleWidget
                  productId={item.productId}
                  shopId={item.sellerId}
                  isDarkMode={isDark}
                  localization={t}
                  db={db}
                />
              </div>
            )}
          </div>
        </div>
      );
    });
  }, [
    cartItems,
    deselectedProducts,
    isDark,
    getAvailableStock,
    formatItemAttributes,
    handleQuantityChange,
    handleRemoveItem,
    router,
    t,
  ]);

  // ========================================================================
  // MAIN RENDER
  // ========================================================================

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${isDark ? "bg-gray-950" : "bg-gray-50"}`}>
      <div className="max-w-6xl mx-auto px-2 sm:px-4 pt-4 pb-6 lg:px-8 lg:pt-8 lg:pb-8 flex-1">
        {/* Back Button */}
        <div className="mb-4 lg:mb-6">
          <button
            onClick={() => router.back()}
            className={`p-2 rounded-lg transition-colors border ${
              isDark
                ? "bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-500 border-gray-200"
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Auth Loading */}
        {isAuthLoading ? (
          <div className="flex flex-col items-center py-20">
            <div className="w-6 h-6 border-[2px] border-orange-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : !user ? (
          /* Not Authenticated */
          <div className={`max-w-md mx-auto rounded-2xl border shadow-sm p-8 text-center ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
              <User size={24} className={isDark ? "text-gray-500" : "text-gray-400"} />
            </div>
            <h3 className={`text-base font-bold mb-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>
              {t("loginRequired", "Login Required")}
            </h3>
            <p className={`text-sm mb-5 leading-relaxed ${isDark ? "text-gray-500" : "text-gray-500"}`}>
              {t("loginToViewCart", "Please log in to view your cart")}
            </p>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
            >
              <LogIn size={16} />
              <span>{t("login", "Login")}</span>
            </button>
          </div>
        ) : isLoading && !isInitialized ? (
          /* Cart Loading */
          <div className="flex flex-col items-center py-20">
            <div className="w-6 h-6 border-[2px] border-orange-200 border-t-orange-500 rounded-full animate-spin mb-3" />
            <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              {t("loading", "Loading...")}
            </p>
          </div>
        ) : cartCount === 0 ? (
          /* Empty Cart */
          <div className="flex flex-col items-center py-16">
            <Image
              src="/images/empty-product2.png"
              alt="Empty cart"
              width={180}
              height={180}
              className="mb-6 opacity-90"
            />
            <h3 className={`text-lg font-bold mb-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>
              {t("emptyCart", "Your cart is empty")}
            </h3>
            <p className={`text-sm mb-6 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              {t("emptyCartDescription", "Start shopping to add items")}
            </p>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
            >
              <Heart size={16} />
              <span>{t("startShopping", "Start Shopping")}</span>
            </button>
          </div>
        ) : (
          /* Cart with Items - Two Column Layout */
          <div className="flex flex-col lg:flex-row lg:gap-8">
            {/* Left: Cart Items */}
            <div className="flex-1 min-w-0">
              {/* Title */}
              <div className="flex items-center space-x-3 mb-4">
                <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {t("title", "My Cart")}
                </h1>
                <span className={`text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  ({cartCount} {t("itemsCount", "items")})
                </span>
              </div>

              {/* Column Headers - desktop only */}
              <div className={`hidden lg:grid lg:grid-cols-[auto_auto_1fr_100px_120px_100px_auto] lg:gap-4 lg:items-center px-0 pb-3 mb-1 border-b ${isDark ? "border-gray-800" : "border-gray-200"}`}>
                <div className="w-4" />
                <div className="w-16" />
                <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {t("product", "Product")}
                </span>
                <span className={`text-xs font-semibold uppercase tracking-wider text-right ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {t("price", "Price")}
                </span>
                <span className={`text-xs font-semibold uppercase tracking-wider text-center ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {t("quantity", "Quantity")}
                </span>
                <span className={`text-xs font-semibold uppercase tracking-wider text-right ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {t("subtotal", "Subtotal")}
                </span>
                <div className="w-[30px]" />
              </div>

              {/* Items List */}
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll as unknown as React.UIEventHandler<HTMLDivElement>}
              >
                {renderCartItems}

                {/* Infinite Scroll Sentinel & Loading Indicator */}
                {hasMore && (
                  <div
                    ref={loadMoreSentinelRef}
                    className="flex justify-center py-4"
                    aria-hidden="true"
                  >
                    {isLoadingMore ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-[2px] border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                        <span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                          {t("loadingMore", "Loading more...")}
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={handleLoadMore}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isDark
                            ? "bg-gray-800 text-gray-400 hover:bg-gray-700"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {t("loadMore", "Load More")}
                      </button>
                    )}
                  </div>
                )}

                {/* End of list indicator */}
                {!hasMore && cartItems.length > 0 && (
                  <div className="flex justify-center py-3">
                    <span className={`text-[10px] ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                      {t("allItemsLoaded", "All items loaded")}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Order Summary */}
            <div className="w-full lg:w-[380px] lg:flex-shrink-0 mt-4 lg:mt-0">
              <div className="lg:sticky lg:top-6">
                <div className={`rounded-2xl border shadow-sm ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
                  <div className="px-5 py-4 sm:px-6 sm:py-5">
                    {/* Order Summary Title */}
                    <h2 className={`text-sm font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>
                      {t("orderSummary", "Order Summary")}
                    </h2>

                    {/* Sales Paused Banner */}
                    {salesPaused && (
                      <div
                        className={`mb-3 p-3 rounded-xl border flex items-start space-x-2 ${
                          isDark
                            ? "bg-orange-900/15 border-orange-800/40"
                            : "bg-orange-50 border-orange-200"
                        }`}
                      >
                        <svg
                          className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className={`text-xs font-medium ${isDark ? "text-orange-400" : "text-orange-700"}`}>
                          {pauseReason || t("salesTemporarilyPaused", "Sales are temporarily paused")}
                        </p>
                      </div>
                    )}

                    {/* Price Breakdown */}
                    {renderPriceBreakdown()}

                    {/* Total Row + Coupon Button */}
                    <div className="flex items-end justify-between mb-4">
                      <div className="flex flex-col">
                        <span className={`text-[10px] ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                          {selectedIds.length} {t("items", "items")}
                        </span>
                        <div className="flex items-baseline space-x-2 mt-0.5">
                          {couponDiscount > 0 && (
                            <span className={`text-xs line-through ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                              {calculatedTotals.total.toFixed(2)} {calculatedTotals.currency}
                            </span>
                          )}
                          {isCalculatingTotals ? (
                            <div className="w-5 h-5 border-[2px] border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                          ) : (
                            <span className={`text-xl font-bold ${hasAnyDiscount ? "text-emerald-500" : "text-orange-500"}`}>
                              {finalTotal.toFixed(2)} {calculatedTotals.currency}
                            </span>
                          )}
                        </div>
                      </div>
                      {renderCompactCouponButton()}
                    </div>

                    {/* Checkout Button */}
                    <button
                      onClick={handleCheckout}
                      disabled={
                        isCalculatingTotals ||
                        isValidating ||
                        salesPaused ||
                        selectedIds.length === 0
                      }
                      className={`w-full py-2.5 sm:py-3 px-4 rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                        salesPaused
                          ? isDark
                            ? "bg-gray-700 text-gray-400"
                            : "bg-gray-300 text-gray-500"
                          : "bg-orange-500 hover:bg-orange-600 text-white"
                      }`}
                    >
                      {isValidating ? (
                        <>
                          <div className="w-4 h-4 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
                          <span>{t("validating", "Validating...")}</span>
                        </>
                      ) : salesPaused ? (
                        <>
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span>{t("checkoutPaused", "Checkout Paused")}</span>
                        </>
                      ) : (
                        <>
                          <span>{t("checkout", "Checkout")}</span>
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================
          MODALS & OVERLAYS
          ================================================================ */}

      {/* Sales Paused Dialog */}
      {showSalesPausedDialog && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowSalesPausedDialog(false)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl border shadow-lg overflow-hidden ${
              isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-5 py-4 ${isDark ? "bg-gray-800" : "bg-orange-50"}`}>
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDark ? "bg-orange-500/20" : "bg-orange-100"}`}>
                  <svg
                    className="w-5 h-5 text-orange-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {t("salesPausedTitle", "Sales Temporarily Paused")}
                </h3>
              </div>
            </div>

            {/* Content */}
            <div className="px-5 py-4">
              <p className={`text-sm text-center ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {pauseReason || t("salesPausedMessage", "We are currently not accepting orders. Please try again later.")}
              </p>
            </div>

            {/* Footer */}
            <div className={`px-5 py-4 ${isDark ? "bg-gray-800/50" : "bg-gray-50"}`}>
              <button
                onClick={() => setShowSalesPausedDialog(false)}
                className="w-full py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
              >
                {t("understood", "Understood")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Dialog */}
      {showValidationDialog && validationResult && (
        <CartValidationDialog
          open={showValidationDialog}
          errors={validationResult.errors}
          warnings={validationResult.warnings}
          validatedItems={validationResult.validatedItems}
          cartItems={cartItems}
          onContinue={handleValidationContinue}
          onCancel={() => {
            setShowValidationDialog(false);
            setValidationResult(null);
          }}
          localization={localization}
        />
      )}

      {/* Coupon Selection Sheet (matching Flutter's CouponSelectionSheet) */}
      <CouponSelectionSheet
        isOpen={showCouponSheet}
        onClose={() => setShowCouponSheet(false)}
        cartTotal={calculatedTotals.total}
        selectedCoupon={selectedCoupon}
        useFreeShipping={useFreeShipping}
        onCouponSelected={handleCouponSelected}
        onFreeShippingToggled={handleFreeShippingToggled}
        isDarkMode={isDark}
      />

      <Footer />
    </div>
  );
}