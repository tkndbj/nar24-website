"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import {
  X,
  ShoppingCart,
  Trash2,
  ArrowRight,
  ShoppingBag,
  User,
  LogIn,
  Heart,
  RefreshCw,
  Minus,
  Plus,
} from "lucide-react";
import { CompactBundleWidget } from "../CompactBundle";
import { useCart, CartTotals, CartItemTotal } from "@/context/CartProvider";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "@/navigation";
import { useTranslations } from "next-intl";
import { AttributeLocalizationUtils } from "@/constants/AttributeLocalization";
import { db } from "@/lib/firebase";
import Image from "next/image";
import { Product } from "@/app/models/Product";
import { doc, onSnapshot } from "firebase/firestore";

// Lazy load CartValidationDialog - only shown when validation needed
const CartValidationDialog = dynamic(
  () => import("../CartValidationDialog"),
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
  selectedColorImage?: string;
  showSellerHeader?: boolean;
  [key: string]: unknown;
}

interface PaymentItem {
  productId: string;
  quantity: number;
  sellerName: string;
  sellerId: string;
  isShop: boolean;
  selectedMetres?: number;
  selectedColor?: string;
  price?: number;
  productName?: string;
  currency?: string;
  calculatedUnitPrice?: number;
  calculatedTotal?: number;
  isBundleItem?: boolean;
}

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
  localization?: ReturnType<typeof useTranslations>;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  isDarkMode = false,
  localization,
}) => {
  const router = useRouter();
  const { user } = useUser();
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
    validateForPayment, // ✅ ADD THIS
    updateCartCacheFromValidation,
  } = useCart();

  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [salesPaused, setSalesPaused] = useState(false);
const [pauseReason, setPauseReason] = useState("");
const [showSalesPausedDialog, setShowSalesPausedDialog] = useState(false);
const totalsVerificationTimer = useRef<NodeJS.Timeout | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<
    Record<string, boolean>
  >({});

  // Totals state
  const [calculatedTotals, setCalculatedTotals] = useState<CartTotals>({
    total: 0,
    currency: "TL",
    items: [],
  });
  const [isCalculatingTotals, setIsCalculatingTotals] = useState(false);

  const t = useCallback(
    (key: string) => {
      if (!localization) return key;

      try {
        const translation = localization(`CartDrawer.${key}`);
        if (translation && translation !== `CartDrawer.${key}`) {
          return translation;
        }

        const directTranslation = localization(key);
        if (directTranslation && directTranslation !== key) {
          return directTranslation;
        }

        return key;
      } catch (error) {
        console.warn(`Translation error for key: ${key}`, error);
        return key;
      }
    },
    [localization]
  );

  const calculateOptimisticTotals = useCallback((): CartTotals => {
    const selectedIds = Object.entries(selectedProducts)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
  
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
      const discountThreshold = item.salePreferences?.discountThreshold;
      const bulkDiscountPercentage = item.salePreferences?.bulkDiscountPercentage;
  
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
  }, [cartItems, selectedProducts]);

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

  // Handle drawer animation
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsAnimating(true), 10);
    } else {
      setIsAnimating(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.style.top = `-${scrollY}px`;
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.top = "";

      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || "0") * -1);
      }
    }

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.top = "";
    };
  }, [isOpen]);

  // Initialize cart when drawer opens
  useEffect(() => {
    if (isOpen && user && !isInitialized && !isLoading) {
      initializeCartIfNeeded();
    }
  }, [isOpen, user, isInitialized, isLoading, initializeCartIfNeeded]);

  // Sync selections with cart items
  useEffect(() => {
    if (cartItems.length > 0) {
      setSelectedProducts((prev) => {
        const newSelected: Record<string, boolean> = {};
        cartItems.forEach((item) => {
          // Select all by default (matching Flutter)
          newSelected[item.productId] = prev[item.productId] ?? true;
        });
        return newSelected;
      });
    } else {
      setSelectedProducts({});
    }
  }, [cartItems]);

  useEffect(() => {
    return () => {
      if (totalsVerificationTimer.current) {
        clearTimeout(totalsVerificationTimer.current);
      }
    };
  }, []);

  // Calculate totals when selections change
  useEffect(() => {
    const selectedIds = Object.entries(selectedProducts)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
  
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
        const serverTotals = await calculateCartTotals(selectedIds);
        setCalculatedTotals(serverTotals);
      } catch (error) {
        console.error("Server totals failed, using optimistic:", error);
        // Keep optimistic value on error - don't reset to 0
      } finally {
        setIsCalculatingTotals(false);
      }
    }, 500); // 500ms debounce (matches Flutter)
  
    return () => {
      if (totalsVerificationTimer.current) {
        clearTimeout(totalsVerificationTimer.current);
      }
    };
  }, [selectedProducts, cartItems, calculateCartTotals, calculateOptimisticTotals]);

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

  // Handle item removal
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

  // Handle quantity change
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
          typeof value !== "object" && // Skip objects and arrays
          !Array.isArray(value)
        ) {
          // Only include string or number values
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

  const proceedToPayment = useCallback(
    async (freshTotals: CartTotals) => {
      // ✅ Build pricing map from Cloud Function totals
      const pricingMap = new Map<string, CartItemTotal>();
      freshTotals.items.forEach((itemTotal) => {
        pricingMap.set(itemTotal.productId, itemTotal);
      });

      // Get selected IDs
      const selectedIds = Object.entries(selectedProducts)
        .filter(([, selected]) => selected)
        .map(([id]) => id);

      // ✅ Filter cart items to only include those with calculated pricing
      const itemsWithPricing = cartItems.filter(
        (item) =>
          selectedIds.includes(item.productId) && pricingMap.has(item.productId)
      );

      // ✅ Check if we lost any items
      if (itemsWithPricing.length !== selectedIds.length) {
        const missingIds = selectedIds.filter((id) => !pricingMap.has(id));
        console.error("❌ Missing pricing for items:", missingIds);
        alert(
          t("pricingError") ||
            "Some items are missing pricing information. Please refresh and try again."
        );
        return;
      }

      // ✅ DEFINE excludedKeys HERE (matching formatItemAttributes)
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
        "salePreferenceInfo", // ✅ Add this too
        "sellerContactNo",
        "ourComission",
        "unitPrice",
        "currency",
        "addedAt",
        "updatedAt",
        "showSellerHeader",
      ];

      // ✅ Build full payment items with ALL required fields
      const paymentItems: PaymentItem[] = itemsWithPricing.map((item) => {
        // ✅ GET PRICING FIRST
        const calculatedPricing = pricingMap.get(item.productId)!;

        // ✅ Extract ALL attributes from item
        const allAttributes: Record<string, unknown> = {};

        // Add selectedColor from cartData
        if (item.cartData?.selectedColor) {
          allAttributes.selectedColor = item.cartData.selectedColor;
        }

        // Add all other attributes from item root (already flattened by CartProvider)
        Object.entries(item).forEach(([key, value]) => {
          if (
            !excludedKeys.includes(key) &&
            value !== undefined &&
            value !== null &&
            value !== ""
          ) {
            allAttributes[key] = value;
          }
        });

        return {
          productId: item.productId,
          quantity: item.quantity,
          sellerName: item.sellerName,
          sellerId: item.sellerId,
          isShop: item.isShop,

          // ✅ Spread all attributes (size, fit, color, etc.)
          ...allAttributes,

          // ✅ Add complete product data
          product: item.product,

          // ✅ Sale preferences (use salePreferenceInfo if available, fallback to salePreferences)
          salePreferences: item.salePreferenceInfo || item.salePreferences,

          // ✅ Images
          selectedColorImage: item.selectedColorImage,

          // ✅ Cart data (for reference)
          cartData: item.cartData,

          // ✅ Calculated pricing from Cloud Function
          calculatedUnitPrice: calculatedPricing.unitPrice,
          calculatedTotal: calculatedPricing.total,
          isBundleItem: calculatedPricing.isBundleItem || false,
        };
      });

      console.log("✅ Proceeding with items:", paymentItems);
      console.log("✅ Total:", freshTotals.total);

      // Pass complete items + total via URL
      const itemsJson = encodeURIComponent(JSON.stringify(paymentItems));

      router.push(
        `/productpayment?total=${freshTotals.total}&items=${itemsJson}`
      );
      onClose();
    },
    [cartItems, selectedProducts, onClose, router, t]
  );

  const [isValidating, setIsValidating] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    errors: Record<string, ValidationMessage>;
    warnings: Record<string, ValidationMessage>;
    validatedItems: ValidatedCartItem[];
  } | null>(null);

  const handleCheckout = useCallback(async () => {
    const selectedIds = Object.entries(selectedProducts)
      .filter(([, selected]) => selected)
      .map(([id]) => id);
  
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
        
        let freshTotals: CartTotals | null = null;  // ✅ Initialize as null
        let retries = 3;
        
        while (retries > 0) {
          try {
            freshTotals = await calculateCartTotals(selectedIds);
            break;
          } catch (error: any) {
            if (error?.message?.includes("Too many requests") && retries > 1) {
              console.log(`⏳ Rate limited, waiting 2s... (${retries - 1} retries left)`);
              await new Promise((resolve) => setTimeout(resolve, 2000));
              retries--;
            } else {
              throw error;
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
      alert(t("validationFailed") || "Checkout failed. Please wait a moment and try again.");
    }
  }, [
    selectedProducts,
    validateForPayment,
    calculateCartTotals,
    proceedToPayment,
    salesPaused,
    t,
  ]);

  // Sales Paused Dialog Component
const SalesPausedDialog = () => {
  if (!showSalesPausedDialog) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setShowSalesPausedDialog(false)}
      />

      {/* Dialog */}
      <div
        className={`
          relative z-10 w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl
          ${isDarkMode ? "bg-gray-800" : "bg-white"}
        `}
      >
        {/* Header */}
        <div className={`px-6 py-5 ${isDarkMode ? "bg-gray-700" : "bg-orange-50"}`}>
          <div className="flex items-center space-x-3">
            <div
              className={`
                w-12 h-12 rounded-full flex items-center justify-center
                ${isDarkMode ? "bg-orange-500/20" : "bg-orange-100"}
              `}
            >
              <svg
                className="w-6 h-6 text-orange-500"
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
            <div>
              <h3
                className={`text-lg font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("salesPausedTitle") || "Sales Temporarily Paused"}
              </h3>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p
            className={`text-center ${
              isDarkMode ? "text-gray-300" : "text-gray-600"
            }`}
          >
            {pauseReason ||
              t("salesPausedMessage") ||
              "We are currently not accepting orders. Please try again later."}
          </p>
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 ${isDarkMode ? "bg-gray-700/50" : "bg-gray-50"}`}>
          <button
            onClick={() => setShowSalesPausedDialog(false)}
            className="
              w-full py-3 px-4 rounded-xl font-medium transition-all duration-200
              bg-gradient-to-r from-orange-500 to-pink-500 text-white
              hover:from-orange-600 hover:to-pink-600
              active:scale-95
            "
          >
            {t("understood") || "Understood"}
          </button>
        </div>
      </div>
    </div>
  );
};

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
      setSelectedProducts((prev) => {
        const updated = { ...prev };
        errorIds.forEach((id) => delete updated[id]);
        return updated;
      });

      // Get valid IDs
      const validIds = validationResult.validatedItems
        .map((item) => item.productId)
        .filter((id) => !errorIds.includes(id));

      setIsValidating(false);

      if (validIds.length > 0) {
        // ✅ Calculate FRESH totals (like Flutter)
        console.log("💰 Calculating fresh totals after validation...");
        const freshTotals = await calculateCartTotals(validIds);
        console.log("💰 Fresh totals:", freshTotals);

        // ✅ Proceed with fresh totals
        proceedToPayment(freshTotals);
      } else {
        alert(t("noValidItemsToCheckout") || "No valid items to checkout");
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

  // Backdrop click handler
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Render cart items
  const renderCartItems = useMemo(() => {
    return cartItems.map((item) => {
      const isSelected = selectedProducts[item.productId] ?? true;
      const availableStock = getAvailableStock(item);
      const maxQuantity = Math.min(
        availableStock,
        item.salePreferences?.maxQuantity ?? 99
      );
      const attributesDisplay = formatItemAttributes(item);

      return (
        <div
          key={item.productId}
          className={`
            rounded-lg border p-2 transition-all duration-200
            ${
              isDarkMode
                ? "bg-gray-800 border-gray-700"
                : "bg-gray-50 border-gray-200"
            }
            
            ${isSelected ? "border-orange-500" : ""}
          `}
        >
          {/* Seller Header */}
          {item.showSellerHeader && (
            <div
              className={`
                flex items-center space-x-1.5 mb-1.5 px-1.5 py-0.5 rounded-md
                ${isDarkMode ? "bg-gray-700" : "bg-orange-50"}
              `}
            >
              <ShoppingBag size={12} className="text-orange-500" />
              <span
                className={`text-xs font-medium ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                {item.sellerName}
              </span>
            </div>
          )}

          {/* Product Content */}
          <div className="flex items-start space-x-2">
            {/* Checkbox */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setSelectedProducts((prev) => ({
                  ...prev,
                  [item.productId]: !prev[item.productId],
                }));
              }}
              className="flex items-center justify-center cursor-pointer p-1 -m-1"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}}
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 w-4 h-4 text-orange-500 rounded focus:ring-orange-500 pointer-events-none"
              />
            </div>

            {/* Product Image */}
            <div
              className="relative w-16 h-16 flex-shrink-0 rounded-md overflow-hidden cursor-pointer"
              onClick={() => {
                onClose();
                router.push(`/productdetail/${item.productId}`);
              }}
            >
              <Image
                src={
                  item.selectedColorImage || item.product?.imageUrls?.[0] || ""
                }
                alt={item.product?.productName || ""}
                fill
                className="object-cover"
                sizes="64px"
              />
            </div>

            {/* Product Details */}
            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => {
                onClose();
                router.push(`/productdetail/${item.productId}`);
              }}
            >
              {item.product?.brandModel && (
                <p
                  className={`text-xs font-medium mb-0.5 ${
                    isDarkMode ? "text-blue-300" : "text-blue-600"
                  }`}
                >
                  {item.product.brandModel}
                </p>
              )}
              <h3
                className={`text-xs font-semibold line-clamp-2 leading-tight ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {item.product?.productName || t("loadingProduct")}
              </h3>
              <p className="text-sm font-bold text-orange-500 mt-0.5">
                {item.product?.price.toFixed(2)}{" "}
                {item.product?.currency || "TL"}
              </p>
              {availableStock < 10 && (
                <p className="text-xs text-red-500 mt-0.5">
                  {t("onlyLeft")} {availableStock}
                </p>
              )}
            </div>
          </div>

          {/* Attributes */}
          {attributesDisplay && (
            <p
              className={`text-xs mt-1.5 px-1 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {attributesDisplay}
            </p>
          )}

          {/* Quantity Controls */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <span
              className={`text-xs font-medium ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {t("quantity")}:
            </span>
            <div className="flex items-center space-x-1.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.quantity > 1) {
                    handleQuantityChange(item.productId, item.quantity - 1);
                  }
                }}
                disabled={item.quantity <= 1 || item.isOptimistic}
                className={`
                  p-1 rounded-md transition-colors
                  ${
                    isDarkMode
                      ? "hover:bg-gray-700 text-gray-300"
                      : "hover:bg-gray-200 text-gray-700"
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                <Minus size={14} />
              </button>

              <span
                className={`min-w-[32px] text-center text-sm font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
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
                className={`
                  p-1 rounded-md transition-colors
                  ${
                    isDarkMode
                      ? "hover:bg-gray-700 text-gray-300"
                      : "hover:bg-gray-200 text-gray-700"
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Sale Preference Label */}
          {item.salePreferences?.discountThreshold &&
            item.salePreferences?.bulkDiscountPercentage && (
              <div className="mt-1.5">
                <div
                  className={`
                  inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-xs
                  ${
                    item.quantity >= item.salePreferences.discountThreshold
                      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                      : "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
                  }
                `}
                >
                  <span>
                    {item.quantity >= item.salePreferences.discountThreshold
                      ? t("youGotDiscount")
                      : t("buyForDiscount")}
                  </span>
                </div>
              </div>
            )}

          {/* Compact Bundle Widget */}
          {item.isShop && item.sellerId && (
            <CompactBundleWidget
              productId={item.productId}
              shopId={item.sellerId}
              isDarkMode={isDarkMode}
              localization={t}
              db={db}
            />
          )}

          {/* Remove Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveItem(item.productId);
            }}
            disabled={item.isOptimistic}
            className={`
              mt-2 w-full flex items-center justify-center space-x-1.5 px-2 py-1.5 rounded-md text-xs
              transition-colors duration-200
              ${
                isDarkMode
                  ? "text-red-400 hover:bg-red-900/20"
                  : "text-red-500 hover:bg-red-50"
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            <Trash2 size={12} />
            <span>{t("remove")}</span>
          </button>
        </div>
      );
    });
  }, [
    cartItems,
    selectedProducts,
    isDarkMode,
    getAvailableStock,
    formatItemAttributes,
    handleQuantityChange,
    handleRemoveItem,
    onClose,
    router,
    t,
  ]);

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-[1000] overflow-hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleBackdropClick}
      />

      {/* Drawer */}
      <div
        className={`
          absolute right-0 top-0 h-full w-full max-w-md transform transition-transform duration-300 ease-out
          ${isDarkMode ? "bg-gray-900" : "bg-white"}
          shadow-2xl
          ${isAnimating ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header */}
        <div
          className={`
            sticky top-0 z-10 border-b px-6 py-4
            ${
              isDarkMode
                ? "bg-gray-900 border-gray-700"
                : "bg-white border-gray-200"
            }
            backdrop-blur-xl bg-opacity-95
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                className={`p-2 rounded-full ${
                  isDarkMode ? "bg-gray-800" : "bg-gray-100"
                }`}
              >
                <ShoppingCart
                  size={20}
                  className={isDarkMode ? "text-gray-300" : "text-gray-700"}
                />
              </div>
              <div>
                <h2
                  className={`text-lg font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("title")}
                </h2>
                {user && cartCount > 0 && (
                  <p
                    className={`text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    {cartCount} {t("itemsCount")}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className={`
                p-2 rounded-full transition-colors duration-200
                ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                    : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                }
              `}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto">
            {/* Not Authenticated */}
            {!user ? (
              <div className="flex flex-col items-center justify-center h-full px-6 py-12">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
                    isDarkMode ? "bg-gray-800" : "bg-gray-100"
                  }`}
                >
                  <User
                    size={32}
                    className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                  />
                </div>
                <h3
                  className={`text-xl font-bold mb-3 text-center ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("loginRequired")}
                </h3>
                <p
                  className={`text-center mb-8 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("loginToViewCart")}
                </p>
                <button
                  onClick={() => {
                    onClose();
                    router.push("/login");
                  }}
                  className="
                    flex items-center space-x-2 px-6 py-3 rounded-full
                    bg-gradient-to-r from-orange-500 to-pink-500 text-white
                    hover:from-orange-600 hover:to-pink-600
                    transition-all duration-200 shadow-lg hover:shadow-xl
                    active:scale-95
                  "
                >
                  <LogIn size={18} />
                  <span className="font-medium">{t("login")}</span>
                </button>
              </div>
            ) : /* Loading */ isLoading && !isInitialized ? (
              <div className="flex flex-col items-center justify-center h-full px-6 py-12">
                <RefreshCw
                  size={32}
                  className="animate-spin text-orange-500 mb-4"
                />
                <p
                  className={`text-center ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("loading")}
                </p>
              </div>
            ) : /* Empty Cart */ cartCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-6 py-12">
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
                    isDarkMode ? "bg-gray-800" : "bg-gray-100"
                  }`}
                >
                  <ShoppingBag
                    size={32}
                    className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                  />
                </div>
                <h3
                  className={`text-xl font-bold mb-3 text-center ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("emptyCart")}
                </h3>
                <p
                  className={`text-center mb-8 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("emptyCartDescription")}
                </p>
                <button
                  onClick={() => {
                    onClose();
                    router.push("/");
                  }}
                  className="
                    flex items-center space-x-2 px-6 py-3 rounded-full
                    bg-gradient-to-r from-orange-500 to-pink-500 text-white
                    hover:from-orange-600 hover:to-pink-600
                    transition-all duration-200 shadow-lg hover:shadow-xl
                    active:scale-95
                  "
                >
                  <Heart size={18} />
                  <span className="font-medium">{t("startShopping")}</span>
                </button>
              </div>
            ) : (
              /* Cart Items */
              <div className="px-3 py-3">
                <div className="space-y-2.5 pb-32">{renderCartItems}</div>

                {/* Load More */}
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={loadMoreItems}
                      disabled={isLoadingMore}
                      className={`
                        px-4 py-2 rounded-lg text-sm font-medium transition-colors
                        ${
                          isDarkMode
                            ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                    >
                      {isLoadingMore ? (
                        <div className="flex items-center space-x-2">
                          <RefreshCw size={14} className="animate-spin" />
                          <span>{t("loadingMore")}</span>
                        </div>
                      ) : (
                        t("loadMore")
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
{user && cartCount > 0 && (
  <div
    className={`
      sticky bottom-0 border-t px-6 py-4
      ${
        isDarkMode
          ? "bg-gray-900 border-gray-700"
          : "bg-white border-gray-200"
      }
      backdrop-blur-xl bg-opacity-95
    `}
  >
    {/* ✅ ADD: Sales Paused Banner */}
    {salesPaused && (
      <div
        className={`
          mb-4 p-3 rounded-lg border flex items-start space-x-2
          ${
            isDarkMode
              ? "bg-orange-500/10 border-orange-500/30"
              : "bg-orange-50 border-orange-200"
          }
        `}
      >
        <svg
          className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5"
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
        <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">
          {pauseReason ||
            t("salesTemporarilyPaused") ||
            "Sales are temporarily paused"}
        </p>
      </div>
    )}
              {/* Total */}
              <div className="flex items-center justify-between mb-4">
                <span
                  className={`text-lg font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("total")}:
                </span>
                {isCalculatingTotals ? (
                  <RefreshCw
                    size={20}
                    className="animate-spin text-orange-500"
                  />
                ) : (
                  <span className="text-lg font-bold text-orange-500">
                    {calculatedTotals.total.toFixed(2)}{" "}
                    {calculatedTotals.currency}
                  </span>
                )}
              </div>

              {/* Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    onClose();
                    router.push("/cart");
                  }}
                  className={`
                    py-3 px-4 rounded-xl font-medium transition-all duration-200
                    ${
                      isDarkMode
                        ? "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                    }
                    active:scale-95
                  `}
                >
                  {t("viewCart")}
                </button>
                <button
  onClick={handleCheckout}
  disabled={
    isCalculatingTotals ||
    isValidating ||
    salesPaused ||
    Object.values(selectedProducts).filter((v) => v).length === 0
  }
  className={`
    py-3 px-4 rounded-xl font-medium transition-all duration-200
    ${
      salesPaused
        ? "bg-gray-400"
        : "bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600"
    }
    text-white shadow-lg hover:shadow-xl active:scale-95
    flex items-center justify-center space-x-2
    disabled:opacity-50 disabled:cursor-not-allowed
  `}
>
  {isValidating ? (
    <>
      <RefreshCw size={16} className="animate-spin" />
      <span>{t("validating")}</span>
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
      <span>{t("checkoutPaused") || "Checkout Paused"}</span>
    </>
  ) : (
    <>
      <span>{t("checkout")}</span>
      <ArrowRight size={16} />
    </>
  )}
</button>
              </div>
            </div>
          )}
        </div>
      </div>
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
      <SalesPausedDialog />
    </div>
  );
};
