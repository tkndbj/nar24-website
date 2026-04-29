"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  UIEvent,
} from "react";
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
import { useCart, CartTotals } from "@/context/CartProvider";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "@/navigation";
import { useTranslations } from "next-intl";
import type { AttributeLocalizationUtils as AttributeLocalizationUtilsType } from "@/constants/AttributeLocalization";
import { db } from "@/lib/firebase";
import Image from "next/image";
import SmartImage from "@/app/components/SmartImage";
import { Product } from "@/app/models/Product";
import { doc, onSnapshot } from "firebase/firestore";

import { useDiscountSelection } from "@/context/DiscountSelectionProvider";
import { CouponSelectionSheet } from "@/app/components/CouponSelectionSheet";
import { Coupon, UserBenefit } from "@/app/models/coupon";
import { useCoupon } from "@/context/CouponProvider";
import { CouponProviders } from "@/context/CouponProviders";
import Footer from "@/app/components/Footer";

// Lazy load CartValidationDialog
const CartValidationDialog = dynamic(
  () => import("@/app/components/CartValidationDialog"),
  { ssr: false },
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
  const { user } = useUser();
  return (
    <CouponProviders user={user} db={db}>
      <CartPageContent />
    </CouponProviders>
  );
}

function CartPageContent() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useUser();
  const localization = useTranslations();

  const [AttributeLocalizationUtils, setAttributeLocalizationUtils] = useState<
    typeof AttributeLocalizationUtilsType | null
  >(null);
  useEffect(() => {
    import("@/constants/AttributeLocalization").then((mod) =>
      setAttributeLocalizationUtils(() => mod.AttributeLocalizationUtils),
    );
  }, []);

  const {
    cartItems,
    cartCount,
    isLoading,
    isLoadingMore,
    hasMore,
    isInitialized,
    cartTotals,
    isTotalsLoading,
    updateQuantity,
    removeFromCart,
    loadCart,
    loadMoreItems,
    calculateCartTotals,
    updateTotalsForExcluded,
    validateForPayment,
    updateCartCacheFromValidation,   
  } = useCart();

  const {
    activeCoupons,
    activeFreeShippingBenefits,
    isFreeShippingApplicable,
  } = useCoupon();

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

  const [isDark, setIsDark] = useState(false);
  const [showCouponSheet, setShowCouponSheet] = useState(false);

  const [salesPaused, setSalesPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [showSalesPausedDialog, setShowSalesPausedDialog] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const isLoadingMoreRef = useRef(false);

  const [deselectedProducts, setDeselectedProducts] = useState<Set<string>>(
    new Set(),
  );

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
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }
    const checkTheme = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
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
    [localization],
  );

  // ========================================================================
  // COMPUTED VALUES
  // ========================================================================

  const hasAnyCouponsOrBenefits = useMemo(() => {
    return activeCoupons.length > 0 || activeFreeShippingBenefits.length > 0;
  }, [activeCoupons, activeFreeShippingBenefits]);

  const selectedIds = useMemo(() => {
    return cartItems
      .filter((item) => !deselectedProducts.has(item.productId))
      .map((item) => item.productId);
  }, [cartItems, deselectedProducts]);


const displayTotals = useMemo(() => {
  return {
    total: cartTotals?.total ?? 0,
    currency: cartTotals?.currency ?? "TL",
  };
}, [cartTotals]);

  const couponDiscount = useMemo(() => {
    return calculateCouponDiscount(displayTotals.total);
  }, [calculateCouponDiscount, displayTotals.total]);

  const finalTotal = useMemo(() => {
    return calculateFinalTotal(displayTotals.total);
  }, [calculateFinalTotal, displayTotals.total]);

  // Auto-clear coupon if no longer applicable
  useEffect(() => {
    if (selectedCoupon && couponDiscount === 0 && displayTotals.total > 0) {
      selectCoupon(null);
    }
  }, [selectedCoupon, couponDiscount, displayTotals.total, selectCoupon]);

  // Auto-clear free shipping if no longer applicable
  useEffect(() => {
    if (
      useFreeShipping &&
      !isFreeShippingApplicable(displayTotals.total) &&
      displayTotals.total > 0
    ) {
      setFreeShipping(false);
    }
  }, [
    useFreeShipping,
    displayTotals.total,
    isFreeShippingApplicable,
    setFreeShipping,
  ]);

  // ========================================================================
  // EFFECTS
  // ========================================================================

  // Revalidate selections on focus (matches Flutter's didChangeAppLifecycleState)
  useEffect(() => {
    const handleFocus = () => {
      revalidateSelections();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [revalidateSelections]);

  // Sales config — kept as live listener per user preference (better UX than Flutter's on-demand)
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
      },
    );
    return () => unsubscribe();
  }, []);

  // Call loadCart() on every page mount (matches Flutter's didChangeDependencies behavior).
  // loadCart has its own dedup guard inside the provider, so this is safe.
  useEffect(() => {
    if (!user) return;
    loadCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // Sync selections with cart items (matches Flutter's _syncSelections)
  useEffect(() => {
    if (cartItems.length === 0) {
      setDeselectedProducts(new Set());
      return;
    }
    const currentProductIds = new Set(cartItems.map((item) => item.productId));
    setDeselectedProducts((prev) => {
      const newDeselected = new Set<string>();
      prev.forEach((id) => {
        if (currentProductIds.has(id)) {
          newDeselected.add(id);
        }
      });
      return newDeselected;
    });
  }, [cartItems]);

  const hasInitializedTotalsRef = useRef(false);

  useEffect(() => {
    const excludedIds = Array.from(deselectedProducts);
    
    // Initial calculation — no debounce, fire immediately
    if (!hasInitializedTotalsRef.current && cartItems.length > 0) {
      hasInitializedTotalsRef.current = true;
      updateTotalsForExcluded(excludedIds);
      return;
    }
    
    // Subsequent updates — debounced
    const timer = setTimeout(() => {
      updateTotalsForExcluded(excludedIds);
    }, 400);
  
    return () => clearTimeout(timer);
  }, [deselectedProducts, cartItems, updateTotalsForExcluded]);

  useEffect(() => {
    if (!user) {
      hasInitializedTotalsRef.current = false;
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user || cartItems.length === 0) {
      hasInitializedTotalsRef.current = false;
    }
  }, [user?.uid, cartItems.length]);

  // ========================================================================
  // INFINITE SCROLL
  // ========================================================================

  const handleLoadMore = useCallback(async () => {
    if (isLoadingMoreRef.current || !hasMore || isLoadingMore) {
      return;
    }
    isLoadingMoreRef.current = true;
    try {
      await loadMoreItems();
    } finally {
      setTimeout(() => {
        isLoadingMoreRef.current = false;
      }, 100);
    }
  }, [hasMore, isLoadingMore, loadMoreItems]);

  useEffect(() => {
    if (!user || cartCount === 0 || !hasMore) {
      return;
    }
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (
          entry.isIntersecting &&
          hasMore &&
          !isLoadingMore &&
          !isLoadingMoreRef.current
        ) {
          console.log("📜 Sentinel visible, loading more items...");
          handleLoadMore();
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: "200px",
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [user, cartCount, hasMore, isLoadingMore, handleLoadMore]);

  const handleScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      if (!hasMore || isLoadingMore || isLoadingMoreRef.current) return;
      const target = e.target as HTMLDivElement;
      const { scrollTop, scrollHeight, clientHeight } = target;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      if (distanceFromBottom < 300) {
        handleLoadMore();
      }
    },
    [hasMore, isLoadingMore, handleLoadMore],
  );

  // ========================================================================
  // HELPER FUNCTIONS
  // ========================================================================

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
        "selectedAttributes",
      ];
      const displayValues: string[] = [];

      if (
        item.cartData?.selectedColor &&
        item.cartData.selectedColor !== "default"
      ) {
        displayValues.push(item.cartData.selectedColor);
      }
      if (item.cartData?.selectedSize) {
        displayValues.push(item.cartData.selectedSize);
      }

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
            const localizedValue = AttributeLocalizationUtils
              ? AttributeLocalizationUtils.getLocalizedAttributeValue(
                  key,
                  value,
                  localization,
                )
              : String(value);
            if (
              localizedValue.trim() !== "" &&
              !displayValues.includes(localizedValue)
            ) {
              displayValues.push(localizedValue);
            }
          }
        }
      });
      return displayValues.join(", ");
    },
    [localization, AttributeLocalizationUtils],
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
    [removeFromCart],
  );

  const handleQuantityChange = useCallback(
    async (productId: string, newQuantity: number) => {
      try {
        await updateQuantity(productId, newQuantity);
      } catch (error) {
        console.error("Failed to update quantity:", error);
      }
    },
    [updateQuantity],
  );

  // ========================================================================
  // COUPON HANDLERS
  // ========================================================================

  const handleCouponSelected = useCallback(
    (coupon: Coupon | null) => {
      selectCoupon(coupon);
    },
    [selectCoupon],
  );

  const handleFreeShippingToggled = useCallback(
    (use: boolean, benefit?: UserBenefit | null) => {
      const benefitToUse =
        use && !benefit && activeFreeShippingBenefits.length > 0
          ? activeFreeShippingBenefits[0]
          : benefit;
      setFreeShipping(use, benefitToUse);
    },
    [setFreeShipping, activeFreeShippingBenefits],
  );

  const showCouponSelectionSheet = useCallback(() => {
    setShowCouponSheet(true);
  }, []);

  // ========================================================================
  // CHECKOUT — Matches Flutter's _proceedToCheckout
  // ========================================================================

  const proceedToPayment = useCallback(
    async (freshTotals: CartTotals) => {
      if (freshTotals.total <= 0) {
        alert(
          t(
            "totalCalculationFailed",
            "Invalid total. Please refresh and try again.",
          ),
        );
        return;
      }
  
      // Build the set of every productId covered by freshTotals — including
      // those rolled up under bundle entries (which use productIds[] plural).
      const coveredProductIds = new Set<string>();
      freshTotals.items.forEach((itemTotal) => {
        // Non-bundle entry: has productId
        const single = (itemTotal as { productId?: string }).productId;
        if (single) coveredProductIds.add(single);
  
        // Bundle entry: has productIds[]
        const bundleIds = (itemTotal as { productIds?: string[] }).productIds;
        if (Array.isArray(bundleIds)) {
          bundleIds.forEach((id) => coveredProductIds.add(id));
        }
      });
  
      const missingIds = selectedIds.filter((id) => !coveredProductIds.has(id));
      if (missingIds.length > 0) {
        console.error("❌ Missing pricing for items:", missingIds);
        alert(
          t(
            "pricingError",
            "Some items are missing pricing information. Please refresh and try again.",
          ),
        );
        return;
      }
  
      if (typeof window !== "undefined") {
        sessionStorage.setItem(
          "checkoutSelectedIds",
          JSON.stringify({
            selectedIds,
            timestamp: Date.now(),
          }),
        );
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
          }),
        );
      }
  
      router.push("/productpayment");
    },
    [
      cartItems,
      selectedIds,
      selectedCoupon,
      selectedBenefit,
      useFreeShipping,
      router,
      t,
    ],
  );

  const handleCheckout = useCallback(async () => {
    if (selectedIds.length === 0) return;

    if (salesPaused) {
      setShowSalesPausedDialog(true);
      return;
    }

    setIsValidating(true);

    try {
      const validation = await validateForPayment(selectedIds, false);

      // Check for system error (validation service failed)
      const systemError = validation.errors._system;
      if (systemError?.key === "validation_service_unavailable") {
        setIsValidating(false);
        alert(
          t(
            "serviceUnavailable",
            "Service temporarily unavailable. Please try again.",
          ),
        );
        return;
      }

      if (
        validation.isValid &&
        Object.keys(validation.warnings).length === 0
      ) {
        // Calculate fresh totals before payment
        console.log("💰 Calculating fresh totals before payment...");

        const excludedIds = Array.from(deselectedProducts);
        const freshTotals = await calculateCartTotals(
          excludedIds.length > 0 ? excludedIds : undefined,
        );

        if (!freshTotals || freshTotals.total <= 0) {
          setIsValidating(false);
          alert(
            t(
              "totalCalculationFailed",
              "Could not calculate total. Please try again.",
            ),
          );
          return;
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
      alert(
        t(
          "validationFailed",
          "Checkout failed. Please wait a moment and try again.",
        ),
      );
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
      // Update cache with fresh validated values (matches Flutter)
      if (validationResult.validatedItems.length > 0) {
        await updateCartCacheFromValidation(validationResult.validatedItems);
      }

      // Remove error items from selection
      const errorIds = Object.keys(validationResult.errors).filter(
        (k) => k !== "_system",
      );
      setDeselectedProducts((prev) => {
        const newSet = new Set(prev);
        errorIds.forEach((id) => newSet.add(id));
        return newSet;
      });

      // Use validatedItems (which have fresh prices) — matches Flutter
      const validIds = validationResult.validatedItems
        .map((item) => item.productId)
        .filter((id) => !errorIds.includes(id));

      if (validIds.length === 0) {
        setIsValidating(false);
        alert(t("noValidItemsToCheckout", "No valid items to checkout"));
        return;
      }

      // Calculate totals from validated items (using their IDs as the selected set)
      const allProductIds = cartItems.map((item) => item.productId);
      const excludedForTotals = allProductIds.filter(
        (id) => !validIds.includes(id),
      );
      const freshTotals = await calculateCartTotals(
        excludedForTotals.length > 0 ? excludedForTotals : undefined,
      );

      if (!freshTotals || freshTotals.total <= 0) {
        setIsValidating(false);
        alert(
          t(
            "totalCalculationFailed",
            "Could not calculate total. Please try again.",
          ),
        );
        return;
      }

      setIsValidating(false);
      proceedToPayment(freshTotals);
    } catch (error) {
      setIsValidating(false);
      console.error("❌ Validation continue error:", error);
      alert(
        t(
          "validationFailed",
          "Checkout failed. Please wait a moment and try again.",
        ),
      );
    }
  }, [
    validationResult,
    updateCartCacheFromValidation,
    calculateCartTotals,
    proceedToPayment,
    user,
    cartItems,
    t,
  ]);

  // ========================================================================
  // PRICE BREAKDOWN
  // ========================================================================

  const renderPriceBreakdown = useCallback(() => {
    if (!hasAnyDiscount) return null;
    const subtotal = displayTotals.total;

    return (
      <div
        className={`p-4 rounded-xl mb-4 border ${
          isDark
            ? "bg-emerald-900/15 border-emerald-800/40"
            : "bg-emerald-50/60 border-emerald-200"
        }`}
      >
        <div className="flex justify-between items-center">
          <span
            className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}
          >
            {t("subtotal", "Subtotal")}
          </span>
          <span
            className={`text-xs font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}
          >
            {subtotal.toFixed(2)} {displayTotals.currency}
          </span>
        </div>

        {couponDiscount > 0 && (
          <div className="flex justify-between items-center mt-2">
            <div className="flex items-center gap-1.5">
              <Tag size={13} className="text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {selectedCoupon?.code || t("coupon", "Coupon")}
              </span>
            </div>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              -{couponDiscount.toFixed(2)} {displayTotals.currency}
            </span>
          </div>
        )}

        {useFreeShipping && (
          <div className="flex justify-between items-center mt-2">
            <div className="flex items-center gap-1.5">
              <Truck size={13} className="text-emerald-500" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {t("freeShipping", "Free Shipping")}
              </span>
            </div>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {t("applied", "Applied")}
            </span>
          </div>
        )}
      </div>
    );
  }, [
    hasAnyDiscount,
    displayTotals,
    couponDiscount,
    selectedCoupon,
    useFreeShipping,
    isDark,
    t,
  ]);

  const renderCompactCouponButton = useCallback(() => {
    if (!hasAnyCouponsOrBenefits) return null;
    const appliedCount = (selectedCoupon ? 1 : 0) + (useFreeShipping ? 1 : 0);

    return (
      <button
        onClick={showCouponSelectionSheet}
        className={`flex-shrink-0 px-3 py-2 rounded-xl border transition-all hover:shadow-sm ${
          hasAnyDiscount
            ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15"
            : "border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/15"
        }`}
      >
        <div className="flex items-center gap-1.5">
          {hasAnyDiscount ? (
            <Check size={13} className="text-emerald-500" />
          ) : (
            <Ticket size={13} className="text-orange-500" />
          )}
          <span
            className={`text-xs font-semibold ${
              hasAnyDiscount ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400"
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
        salePrefs?.maxQuantity ?? 99,
      );
      const attributesDisplay = formatItemAttributes(item);

      let effectivePrice = item.product?.price || 0;
      const hasBulkDiscount =
        salePrefs?.discountThreshold &&
        salePrefs?.bulkDiscountPercentage &&
        item.quantity >= salePrefs.discountThreshold;
      if (hasBulkDiscount) {
        effectivePrice =
          effectivePrice * (1 - salePrefs!.bulkDiscountPercentage! / 100);
      }
      const subtotal = effectivePrice * item.quantity;
      const currency = item.product?.currency || "TL";

      return (
        <div key={item.productId}>
          {item.showSellerHeader && (
            <div
              className={`flex items-center gap-2 px-3 py-2 mt-3 rounded-lg ${
                isDark ? "bg-gray-800/70" : "bg-orange-50"
              }`}
            >
              {item.isShop ? (
                <ShoppingBag
                  size={13}
                  className={isDark ? "text-orange-400" : "text-orange-500"}
                />
              ) : (
                <User
                  size={13}
                  className={isDark ? "text-orange-400" : "text-orange-500"}
                />
              )}
              <span
                className={`text-xs font-semibold ${
                  isDark ? "text-gray-200" : "text-orange-700"
                }`}
              >
                {item.sellerName}
              </span>
            </div>
          )}

          <div
            className={`py-5 ${
              index < cartItems.length - 1
                ? `border-b ${isDark ? "border-gray-800/60" : "border-gray-100"}`
                : ""
            }`}
          >
            {/* Desktop layout */}
            <div className="hidden lg:grid lg:grid-cols-[auto_auto_1fr_100px_120px_100px_auto] lg:items-center lg:gap-4">
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

              <div
                className={`relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden cursor-pointer border ${
                  isDark ? "border-gray-800 bg-gray-800" : "border-gray-100 bg-gray-50"
                }`}
                onClick={() => router.push(`/productdetail/${item.productId}`)}
              >
                <SmartImage
                  source={
                    item.selectedColorImage ||
                    item.product?.imageUrls?.[0] ||
                    ""
                  }
                  size="thumbnail"
                  alt={item.product?.productName || ""}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>

              <div
                className="min-w-0 cursor-pointer"
                onClick={() => router.push(`/productdetail/${item.productId}`)}
              >
                {item.product?.brandModel && (
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${
                      isDark ? "text-blue-400" : "text-blue-600"
                    }`}
                  >
                    {item.product.brandModel}
                  </p>
                )}
                <h3
                  className={`text-sm font-semibold line-clamp-2 leading-snug ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {item.product?.productName ||
                    t("loadingProduct", "Loading...")}
                </h3>
                {attributesDisplay && (
                  <p
                    className={`text-xs mt-1 ${
                      isDark ? "text-gray-500" : "text-gray-500"
                    }`}
                  >
                    {attributesDisplay}
                  </p>
                )}
                {availableStock < 10 && (
                  <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                    {t("onlyLeft", "Only")} {availableStock}{" "}
                    {t("left", "left")}
                  </span>
                )}
              </div>

              <div className="text-right">
                <span
                  className={`text-sm font-semibold ${
                    isDark ? "text-gray-200" : "text-gray-800"
                  }`}
                >
                  {effectivePrice.toFixed(2)} {currency}
                </span>
                {hasBulkDiscount && (
                  <p
                    className={`text-[11px] line-through ${
                      isDark ? "text-gray-600" : "text-gray-400"
                    }`}
                  >
                    {item.product?.price.toFixed(2)} {currency}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center">
                <div
                  className={`inline-flex items-center rounded-lg border ${
                    isDark ? "border-gray-700 bg-gray-800/40" : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.quantity > 1) {
                        handleQuantityChange(item.productId, item.quantity - 1);
                      }
                    }}
                    disabled={item.quantity <= 1 || item.isOptimistic}
                    className={`p-2 transition-colors ${
                      isDark
                        ? "hover:bg-gray-700 text-gray-300"
                        : "hover:bg-gray-200 text-gray-600"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <Minus size={14} />
                  </button>
                  <span
                    className={`min-w-[36px] text-center text-sm font-bold ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
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
                    className={`p-2 transition-colors ${
                      isDark
                        ? "hover:bg-gray-700 text-gray-300"
                        : "hover:bg-gray-200 text-gray-600"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              <div className="text-right">
                <span
                  className={`text-base font-bold ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {subtotal.toFixed(2)} {currency}
                </span>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveItem(item.productId);
                }}
                disabled={item.isOptimistic}
                className={`p-2 rounded-lg transition-colors ${
                  isDark
                    ? "text-gray-500 hover:text-red-400 hover:bg-red-900/20"
                    : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label={t("remove", "Remove")}
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Mobile layout */}
            <div className="lg:hidden">
              <div className="flex items-start gap-3">
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
                  className="cursor-pointer pt-1.5"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500 pointer-events-none"
                  />
                </div>

                <div
                  className={`relative w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden cursor-pointer border ${
                    isDark ? "border-gray-800 bg-gray-800" : "border-gray-100 bg-gray-50"
                  }`}
                  onClick={() =>
                    router.push(`/productdetail/${item.productId}`)
                  }
                >
                  <SmartImage
                    source={
                      item.selectedColorImage ||
                      item.product?.imageUrls?.[0] ||
                      ""
                    }
                    size="thumbnail"
                    alt={item.product?.productName || ""}
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(`/productdetail/${item.productId}`)
                    }
                  >
                    {item.product?.brandModel && (
                      <p
                        className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${
                          isDark ? "text-blue-400" : "text-blue-600"
                        }`}
                      >
                        {item.product.brandModel}
                      </p>
                    )}
                    <h3
                      className={`text-sm font-semibold line-clamp-2 leading-snug ${
                        isDark ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {item.product?.productName ||
                        t("loadingProduct", "Loading...")}
                    </h3>
                    {attributesDisplay && (
                      <p
                        className={`text-xs mt-1 ${
                          isDark ? "text-gray-500" : "text-gray-500"
                        }`}
                      >
                        {attributesDisplay}
                      </p>
                    )}
                  </div>

                  <div className="flex items-baseline gap-2 mt-2 flex-wrap">
                    <span className="text-base font-bold text-orange-500">
                      {subtotal.toFixed(2)} {currency}
                    </span>
                    {item.quantity > 1 && (
                      <span
                        className={`text-[11px] ${
                          isDark ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        ({effectivePrice.toFixed(2)} × {item.quantity})
                      </span>
                    )}
                  </div>

                  {availableStock < 10 && (
                    <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                      {t("onlyLeft", "Only")} {availableStock}{" "}
                      {t("left", "left")}
                    </span>
                  )}

                  <div className="flex items-center justify-between mt-3">
                    <div
                      className={`inline-flex items-center rounded-lg border ${
                        isDark ? "border-gray-700 bg-gray-800/40" : "border-gray-200 bg-gray-50"
                      }`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.quantity > 1) {
                            handleQuantityChange(
                              item.productId,
                              item.quantity - 1,
                            );
                          }
                        }}
                        disabled={item.quantity <= 1 || item.isOptimistic}
                        className={`p-1.5 transition-colors ${
                          isDark
                            ? "hover:bg-gray-700 text-gray-300"
                            : "hover:bg-gray-200 text-gray-600"
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        <Minus size={14} />
                      </button>
                      <span
                        className={`min-w-[32px] text-center text-sm font-bold ${
                          isDark ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {item.quantity}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.quantity < maxQuantity) {
                            handleQuantityChange(
                              item.productId,
                              item.quantity + 1,
                            );
                          }
                        }}
                        disabled={
                          item.quantity >= maxQuantity || item.isOptimistic
                        }
                        className={`p-1.5 transition-colors ${
                          isDark
                            ? "hover:bg-gray-700 text-gray-300"
                            : "hover:bg-gray-200 text-gray-600"
                        } disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveItem(item.productId);
                      }}
                      disabled={item.isOptimistic}
                      className={`p-2 rounded-lg transition-colors ${
                        isDark
                          ? "text-gray-500 hover:text-red-400 hover:bg-red-900/20"
                          : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      aria-label={t("remove", "Remove")}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sale Preference Label */}
            {salePrefs?.discountThreshold &&
              salePrefs?.bulkDiscountPercentage && (
                <div className="mt-2 lg:ml-[128px]">
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
                        ? t(
                            "youGotDiscount",
                            `You got ${salePrefs.bulkDiscountPercentage}% discount!`,
                          )
                        : t(
                            "buyForDiscount",
                            `Buy ${salePrefs.discountThreshold}+ for ${salePrefs.bulkDiscountPercentage}% off`,
                          )}
                    </span>
                  </div>
                </div>
              )}

            {item.isShop && item.sellerId && (
              <div className="mt-2 lg:ml-[128px]">
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
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isDark ? "bg-gray-950" : "bg-gray-50"
      }`}
    >
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-10 pt-6 pb-10 lg:pt-10 lg:pb-16 flex-1">
        <div className="mb-6 lg:mb-8">
          <button
            onClick={() => router.back()}
            className={`inline-flex items-center gap-2 pl-2.5 pr-3.5 py-2 rounded-full text-sm font-medium transition-colors border ${
              isDark
                ? "bg-gray-900 hover:bg-gray-800 text-gray-300 border-gray-800"
                : "bg-white hover:bg-gray-100 text-gray-700 border-gray-200"
            }`}
          >
            <ArrowLeft className="w-4 h-4" />           
          </button>
        </div>

        {isAuthLoading ? (
          <div className="flex flex-col items-center py-32">
            <div className="w-8 h-8 border-[2.5px] border-orange-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : !user ? (
          <div
            className={`max-w-md mx-auto rounded-3xl border shadow-sm p-10 text-center ${
              isDark
                ? "bg-gray-900 border-gray-800"
                : "bg-white border-gray-100"
            }`}
          >
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
                isDark ? "bg-gray-800" : "bg-orange-50"
              }`}
            >
              <User
                size={32}
                className={isDark ? "text-gray-500" : "text-orange-500"}
              />
            </div>
            <h3
              className={`text-xl font-bold mb-2 ${
                isDark ? "text-white" : "text-gray-900"
              }`}
            >
              {t("loginRequired", "Login Required")}
            </h3>
            <p
              className={`text-sm mb-7 leading-relaxed ${
                isDark ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("loginToViewCart", "Please log in to view your cart")}
            </p>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors shadow-sm"
            >
              <LogIn size={16} />
              <span>{t("login", "Login")}</span>
            </button>
          </div>
        ) : isLoading && !isInitialized ? (
          <div className="flex flex-col items-center py-32">
            <div className="w-8 h-8 border-[2.5px] border-orange-200 border-t-orange-500 rounded-full animate-spin mb-4" />
            <p
              className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
            >
              {t("loading", "Loading...")}
            </p>
          </div>
        ) : cartCount === 0 ? (
          <div
            className={`flex flex-col items-center justify-center py-20 px-6 rounded-3xl border ${
              isDark
                ? "bg-gray-900/50 border-gray-800"
                : "bg-white border-gray-100"
            }`}
          >
            <Image
              src="/images/empty-product2.png"
              alt="Empty cart"
              width={200}
              height={200}
              className="mb-7 opacity-90"
            />
            <h3
              className={`text-xl font-bold mb-2 ${
                isDark ? "text-white" : "text-gray-900"
              }`}
            >
              {t("emptyCart", "Your cart is empty")}
            </h3>
            <p
              className={`text-sm mb-7 max-w-sm text-center ${
                isDark ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("emptyCartDescription", "Start shopping to add items")}
            </p>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors shadow-sm"
            >
              <Heart size={16} />
              <span>{t("startShopping", "Start Shopping")}</span>
            </button>
          </div>
        ) : (
          <>
            {/* Page Title */}
            <div className="mb-6 lg:mb-8">
              <div className="flex items-end gap-3 flex-wrap">
                <h1
                  className={`text-3xl lg:text-4xl font-bold tracking-tight ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("title", "My Cart")}
                </h1>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold mb-1.5 ${
                    isDark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {cartCount} {t("itemsCount", "items")}
                </span>
              </div>
              <div
                className={`mt-3 h-px w-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}
              />
            </div>

            <div className="flex flex-col lg:flex-row lg:gap-8">
              {/* Left: Cart Items */}
              <div className="flex-1 min-w-0">
                <div
                  className={`rounded-2xl border overflow-hidden ${
                    isDark
                      ? "bg-gray-900 border-gray-800"
                      : "bg-white border-gray-100 shadow-sm"
                  }`}
                >
                  <div
                    className={`hidden lg:grid lg:grid-cols-[auto_auto_1fr_100px_120px_100px_auto] lg:gap-4 lg:items-center px-5 py-3 border-b ${
                      isDark
                        ? "border-gray-800 bg-gray-900/50"
                        : "border-gray-100 bg-gray-50/50"
                    }`}
                  >
                    <div className="w-4" />
                    <div className="w-16" />
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-wider ${
                        isDark ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      {t("product", "Product")}
                    </span>
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-wider text-right ${
                        isDark ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      {t("price", "Price")}
                    </span>
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-wider text-center ${
                        isDark ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      {t("quantity", "Quantity")}
                    </span>
                    <span
                      className={`text-[11px] font-semibold uppercase tracking-wider text-right ${
                        isDark ? "text-gray-500" : "text-gray-500"
                      }`}
                    >
                      {t("subtotal", "Subtotal")}
                    </span>
                    <div className="w-[30px]" />
                  </div>

                  <div
                    ref={scrollContainerRef}
                    onScroll={
                      handleScroll as unknown as React.UIEventHandler<HTMLDivElement>
                    }
                    className="px-3 sm:px-5"
                  >
                    {renderCartItems}

                    {hasMore && (
                      <div
                        ref={loadMoreSentinelRef}
                        className="flex justify-center py-5"
                        aria-hidden="true"
                      >
                        {isLoadingMore ? (
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 border-[2px] border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                            <span
                              className={`text-xs ${
                                isDark ? "text-gray-400" : "text-gray-500"
                              }`}
                            >
                              {t("loadingMore", "Loading more...")}
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={handleLoadMore}
                            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                              isDark
                                ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            {t("loadMore", "Load More")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Order Summary */}
              <div className="w-full lg:w-[380px] lg:flex-shrink-0 mt-6 lg:mt-0">
                <div className="lg:sticky lg:top-6">
                  <div
                    className={`rounded-2xl border ${
                      isDark
                        ? "bg-gray-900 border-gray-800"
                        : "bg-white border-gray-100 shadow-sm"
                    }`}
                  >
                    <div className="px-5 py-5 sm:px-6 sm:py-6">
                      <h2
                        className={`text-base font-bold mb-5 ${
                          isDark ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {t("orderSummary", "Order Summary")}
                      </h2>

                      {salesPaused && (
                        <div
                          className={`mb-4 p-3.5 rounded-xl border flex items-start gap-2.5 ${
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
                          <p
                            className={`text-xs font-medium leading-relaxed ${
                              isDark ? "text-orange-400" : "text-orange-700"
                            }`}
                          >
                            {pauseReason ||
                              t(
                                "salesTemporarilyPaused",
                                "Sales are temporarily paused",
                              )}
                          </p>
                        </div>
                      )}

                      {renderPriceBreakdown()}

                      <div
                        className={`flex items-end justify-between gap-3 pb-4 mb-4 border-b border-dashed ${
                          isDark ? "border-gray-800" : "border-gray-200"
                        }`}
                      >
                        <div className="flex flex-col min-w-0">
                          <span
                            className={`text-[11px] font-medium uppercase tracking-wide ${
                              isDark ? "text-gray-500" : "text-gray-400"
                            }`}
                          >
                            {selectedIds.length} {t("items", "items")} • {t("total", "Total")}
                          </span>
                          <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                            {couponDiscount > 0 && (
                              <span
                                className={`text-xs line-through ${
                                  isDark ? "text-gray-600" : "text-gray-400"
                                }`}
                              >
                                {displayTotals.total.toFixed(2)}{" "}
                                {displayTotals.currency}
                              </span>
                            )}
                            <span
                              className={`text-2xl font-bold ${
                                hasAnyDiscount
                                  ? "text-emerald-500"
                                  : "text-orange-500"
                              }`}
                            >
                              {finalTotal.toFixed(2)} {displayTotals.currency}
                            </span>
                          </div>
                        </div>
                        {renderCompactCouponButton()}
                      </div>

                      <button
                        onClick={handleCheckout}
                        disabled={
                          isTotalsLoading ||
                          isValidating ||
                          salesPaused ||
                          selectedIds.length === 0
                        }
                        className={`w-full py-3.5 px-4 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${
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
                            <span>
                              {t("checkoutPaused", "Checkout Paused")}
                            </span>
                          </>
                        ) : (
                          <>
                            <span>{t("checkout", "Checkout")}</span>
                            <ArrowRight size={16} />
                          </>
                        )}
                      </button>

                      <p
                        className={`mt-3 text-[11px] text-center ${
                          isDark ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        {t("secureCheckout", "Secure encrypted checkout")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {showSalesPausedDialog && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowSalesPausedDialog(false)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl border shadow-lg overflow-hidden ${
              isDark
                ? "bg-gray-900 border-gray-800"
                : "bg-white border-gray-100"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`px-5 py-4 ${isDark ? "bg-gray-800" : "bg-orange-50"}`}
            >
              <div className="flex items-center space-x-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isDark ? "bg-orange-500/20" : "bg-orange-100"
                  }`}
                >
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
                <h3
                  className={`text-base font-bold ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("salesPausedTitle", "Sales Temporarily Paused")}
                </h3>
              </div>
            </div>

            <div className="px-5 py-4">
              <p
                className={`text-sm text-center ${
                  isDark ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {pauseReason ||
                  t(
                    "salesPausedMessage",
                    "We are currently not accepting orders. Please try again later.",
                  )}
              </p>
            </div>

            <div
              className={`px-5 py-4 ${
                isDark ? "bg-gray-800/50" : "bg-gray-50"
              }`}
            >
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

      <CouponSelectionSheet
        isOpen={showCouponSheet}
        onClose={() => setShowCouponSheet(false)}
        cartTotal={displayTotals.total}
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