"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
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
import { useCart, CartTotals } from "@/context/CartProvider";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AttributeLocalizationUtils } from "@/constants/AttributeLocalization";
import { db } from "@/lib/firebase";
import Image from "next/image";
import { Product } from "@/app/models/Product";
import CartValidationDialog from "../CartValidationDialog";

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
    validateForPayment,              // ✅ ADD THIS
  updateCartCacheFromValidation,
  } = useCart();

  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
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

  // Calculate totals when selections change
  useEffect(() => {
    const calculateTotals = async () => {
      const selectedIds = Object.entries(selectedProducts)
        .filter(([, selected]) => selected)
        .map(([id]) => id);

      if (selectedIds.length === 0) {
        setCalculatedTotals({ total: 0, currency: "TL", items: [] });
        return;
      }

      setIsCalculatingTotals(true);
      try {
        const totals = await calculateCartTotals(selectedIds);
        setCalculatedTotals(totals);
      } catch (error) {
        console.error("Failed to calculate totals:", error);
      } finally {
        setIsCalculatingTotals(false);
      }
    };

    calculateTotals();
  }, [selectedProducts, cartItems, calculateCartTotals]);

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
        "sellerContactNo",
        "ourComission",
        "unitPrice",
        "currency",
        "addedAt",
        "updatedAt",
        "showSellerHeader",
      ];

      const attributes: Record<string, unknown> = {};

      Object.entries(item).forEach(([key, value]) => {
        if (
          !excludedKeys.includes(key) &&
          value !== undefined &&
          value !== null &&
          value !== "" &&
          typeof value !== "boolean"
        ) {
          attributes[key] = value;
        }
      });

      // Handle selected color
      if (
        item.cartData?.selectedColor &&
        item.cartData.selectedColor !== "default"
      ) {
        attributes["selectedColor"] = item.cartData.selectedColor;
      }

      if (Object.keys(attributes).length === 0) return "";

      const displayValues: string[] = [];
      Object.entries(attributes).forEach(([key, value]) => {
        const localizedValue =
          AttributeLocalizationUtils.getLocalizedAttributeValue(
            key,
            value,
            localization
          );
        if (localizedValue.trim() !== "") {
          displayValues.push(localizedValue);
        }
      });

      return displayValues.join(", ");
    },
    [localization]
  );

  const [isValidating, setIsValidating] = useState(false);
const [showValidationDialog, setShowValidationDialog] = useState(false);
const [validationResult, setValidationResult] = useState<{
  isValid: boolean;
  errors: Record<string, ValidationMessage>;
  warnings: Record<string, ValidationMessage>;
  validatedItems: ValidatedCartItem[];
} | null>(null);

// Replace handleCheckout function
const handleCheckout = useCallback(async () => {
  const selectedIds = Object.entries(selectedProducts)
    .filter(([, selected]) => selected)
    .map(([id]) => id);

  if (selectedIds.length === 0) return;

  // ✅ STEP 1: Set loading state
  setIsValidating(true);

  try {
    // ✅ STEP 2: Validate cart with Cloud Function
    const validation = await validateForPayment(selectedIds, false);

    setIsValidating(false);

    // ✅ STEP 3: Check if validation passed
    if (
      validation.isValid &&
      Object.keys(validation.warnings).length === 0
    ) {
      // No issues - proceed directly to payment
      proceedToPayment(calculatedTotals);
    } else {
      // Has errors or warnings - show validation dialog
      setValidationResult(validation);
      setShowValidationDialog(true);
    }
  } catch (error) {
    setIsValidating(false);
    console.error("❌ Checkout validation error:", error);
    // Show error to user
    alert(t("validationFailed") || "Validation failed. Please try again.");
  }
}, [selectedProducts, validateForPayment, t]);

const proceedToPayment = useCallback(
  async (freshTotals: CartTotals) => {
    // ✅ Build pricing map from Cloud Function totals
    const pricingMap = new Map();
    freshTotals.items.forEach((itemTotal) => {
      pricingMap.set(itemTotal.productId, itemTotal);
    });

    // ✅ Get selected IDs
    const selectedIds = Object.entries(selectedProducts)
      .filter(([, selected]) => selected)
      .map(([id]) => id);

    // ✅ Build full payment items with ALL required fields
    const paymentItems: PaymentItem[] = cartItems
      .filter((item) => selectedIds.includes(item.productId))
      .map((item) => {
        const paymentItem: PaymentItem = {
          productId: item.productId,
          quantity: item.quantity,
          sellerName: item.sellerName,      // ✅ From cart
          sellerId: item.sellerId,          // ✅ From cart
          isShop: item.isShop,              // ✅ From cart
        };

        // Add optional attributes
        if (item.cartData?.selectedMetres) {
          paymentItem.selectedMetres = item.cartData.selectedMetres;
        }
        if (item.cartData?.selectedColor) {
          paymentItem.selectedColor = item.cartData.selectedColor;
        }

        // Add product info
        if (item.product) {
          paymentItem.price = item.product.price;
          paymentItem.productName = item.product.productName;
          paymentItem.currency = item.product.currency;
        }

        // ✅ Add calculated pricing from Cloud Function
        const calculatedPricing = pricingMap.get(item.productId);
        if (calculatedPricing) {
          paymentItem.calculatedUnitPrice = calculatedPricing.unitPrice;
          paymentItem.calculatedTotal = calculatedPricing.total;
          paymentItem.isBundleItem = calculatedPricing.isBundleItem || false;
        }

        return paymentItem;
      });

    // ✅ Pass complete items + total via URL
    const itemsJson = encodeURIComponent(JSON.stringify(paymentItems));
    
    router.push(
      `/productpayment?total=${freshTotals.total}&items=${itemsJson}`
    );
    onClose();
  },
  [cartItems, selectedProducts, onClose, router]  // ✅ Add dependencies
);

// ✅ NEW: Handle validation dialog continue
const handleValidationContinue = useCallback(async () => {
  if (!validationResult) return;

  setIsValidating(true);
  setShowValidationDialog(false);

  try {
    // Update cart cache with fresh values
    if (validationResult.validatedItems.length > 0) {
      await updateCartCacheFromValidation(validationResult.validatedItems);
    }

    // Remove error items from selection
    const errorIds = Object.keys(validationResult.errors);
    setSelectedProducts((prev) => {
      const updated = { ...prev };
      errorIds.forEach((id) => delete updated[id]);
      return updated;
    });

    // Get valid items only
    const validIds = validationResult.validatedItems
      .map((item) => item.productId)
      .filter((id) => !errorIds.includes(id));

    setIsValidating(false);

    if (validIds.length > 0) {
      // Recalculate totals with fresh data
      const totals = await calculateCartTotals(validIds);
      setCalculatedTotals(totals);

      // Proceed to payment
      proceedToPayment(totals);
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
    <div className="fixed inset-0 z-50 overflow-hidden">
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
    isValidating ||  // ✅ ADD THIS
    Object.values(selectedProducts).filter((v) => v).length === 0
  }
  className="
    py-3 px-4 rounded-xl font-medium transition-all duration-200
    bg-gradient-to-r from-orange-500 to-pink-500 text-white
    hover:from-orange-600 hover:to-pink-600
    shadow-lg hover:shadow-xl active:scale-95
    flex items-center justify-center space-x-2
    disabled:opacity-50 disabled:cursor-not-allowed
  "
>
  {isValidating ? (  // ✅ ADD THIS
    <>
      <RefreshCw size={16} className="animate-spin" />
      <span>{t("validating")}</span>
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
  />
)}
    </div>
    
  );
};
