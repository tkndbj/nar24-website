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
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { ProductCard3 } from "../ProductCard3";
import { useCart } from "@/context/CartProvider";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AttributeLocalizationUtils } from "@/constants/AttributeLocalization";

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
    clearCart,
    initializeCartIfNeeded,
    loadMoreItems,
    isOptimisticallyRemoving,
  } = useCart();

  const [isClearing, setIsClearing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // ✅ FIXED: Proper nested translation function that uses JSON files
  const t = useCallback((key: string) => {
    if (!localization) {
      // Return the key itself if no localization function is provided
      return key;
    }

    try {
      // Try to get the nested CartDrawer translation
      const translation = localization(`CartDrawer.${key}`);
      
      // Check if we got a valid translation (not the same as the key we requested)
      if (translation && translation !== `CartDrawer.${key}`) {
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

  // Initialize cart when drawer opens and user is authenticated
  useEffect(() => {
    if (isOpen && user && !isInitialized && !isLoading) {
      initializeCartIfNeeded();
    }
  }, [isOpen, user, isInitialized, isLoading, initializeCartIfNeeded]);

  // Calculate total price with memoization
  const totalPrice = useMemo(() => {
    return cartItems.reduce((total, item) => {
      if (item.product && !item.isOptimistic && !isOptimisticallyRemoving(item.productId)) {
        return total + item.product.price * item.quantity;
      }
      return total;
    }, 0);
  }, [cartItems, isOptimisticallyRemoving]);

  // Handle item removal
  const handleRemoveItem = useCallback(async (productId: string) => {
    try {
      console.log('CartDrawer - Removing item:', { productId });
      const result = await removeFromCart(productId);
      console.log('CartDrawer - Remove result:', { productId, result });
    } catch (error) {
      console.error("CartDrawer - Failed to remove item:", error);
    }
  }, [removeFromCart]);

  // Handle quantity update
  const handleQuantityChange = useCallback(async (
    productId: string,
    newQuantity: number
  ) => {
    if (newQuantity < 1) {
      await handleRemoveItem(productId);
      return;
    }
    
    try {
      console.log('CartDrawer - Updating quantity:', { productId, newQuantity });
      await updateQuantity(productId, newQuantity);
    } catch (error) {
      console.error("CartDrawer - Failed to update quantity:", error);
    }
  }, [handleRemoveItem, updateQuantity]);

  // Handle clear cart
  const handleClearCart = useCallback(async () => {
    setIsClearing(true);
    try {
      console.log('CartDrawer - Clearing entire cart');
      await clearCart();
    } catch (error) {
      console.error("CartDrawer - Failed to clear cart:", error);
    } finally {
      setIsClearing(false);
    }
  }, [clearCart]);

  // Handle navigation functions
  const handleCheckout = useCallback(() => {
    console.log('CartDrawer - Navigating to checkout');
    
    // Prepare cart items for payment page - pass ALL fields from cart documents
    const paymentItems = cartItems
      .filter(item => !item.isOptimistic && item.product && !isOptimisticallyRemoving(item.productId))
      .map(item => {
        // Create a copy of the entire item object
        const paymentItem = { ...item };
        
        // Add essential product info from the product object
        if (item.product) {
          paymentItem.price = item.product.price;
          paymentItem.productName = item.product.productName;
          paymentItem.currency = item.product.currency;
        }
        
        // Remove only the fields that shouldn't be sent to payment
        delete (paymentItem as Record<string, unknown>).product; // Remove the full product object (too large)
        delete (paymentItem as Record<string, unknown>).cartData; // Remove internal cart metadata
        delete (paymentItem as Record<string, unknown>).isOptimistic; // Remove UI state
        delete (paymentItem as Record<string, unknown>).isLoadingProduct; // Remove UI state
        delete (paymentItem as Record<string, unknown>).loadError; // Remove UI state
        delete (paymentItem as Record<string, unknown>).selectedColorImage; // Remove UI-specific field
        
        return paymentItem;
      });
  
    console.log('CartDrawer - Payment items prepared:', paymentItems);
  
    // Calculate total for verification
    const totalPrice = paymentItems.reduce((sum, item) => sum + ((item as Record<string, unknown>).price as number * item.quantity), 0);
    
    // Save to localStorage as backup
    localStorage.setItem('cartItems', JSON.stringify(paymentItems));
    localStorage.setItem('cartTotal', totalPrice.toString());
    
    onClose();
    
    // Navigate to payment page
    try {
      const itemsParam = encodeURIComponent(JSON.stringify(paymentItems));
      // Check if URL would be too long (most browsers limit to ~2000 chars)
      if (itemsParam.length < 1500) {
        router.push(`/productpayment?items=${itemsParam}&total=${totalPrice}`);
      } else {
        // For large carts, use localStorage only
        router.push(`/productpayment?total=${totalPrice}`);
      }
    } catch (error) {
      console.error('Error encoding cart items for URL:', error);
      // Fallback to localStorage only
      router.push(`/productpayment?total=${totalPrice}`);
    }
  }, [cartItems, isOptimisticallyRemoving, onClose, router]);

  const handleViewFullCart = useCallback(() => {
    console.log('CartDrawer - Navigating to full cart page');
    onClose();
    router.push("/cart");
  }, [onClose, router]);

  const handleGoToLogin = useCallback(() => {
    console.log('CartDrawer - Navigating to login');
    onClose();
    router.push("/login");
  }, [onClose, router]);

  // Backdrop click handler
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Format dynamic attributes for display
  const formatItemAttributes = useCallback((item: Record<string, unknown>) => {
    if (!localization) return '';

    const attributes: Record<string, unknown> = {};
    const excludedKeys = [
      'productId', 'cartData', 'product', 'quantity', 'sellerName', 
      'sellerId', 'isShop', 'isOptimistic', 'isLoadingProduct', 
      'loadError', 'selectedColor', 'selectedColorImage', 'gender'
    ];

    // Collect all non-excluded attributes
    Object.entries(item).forEach(([key, value]) => {
      if (!excludedKeys.includes(key) && 
          value !== undefined && 
          value !== null && 
          value !== '' && 
          typeof value !== 'boolean') {
        attributes[key] = value;
      }
    });

    // Handle selected color separately
    if (typeof item.selectedColor === 'string' && item.selectedColor !== 'default') {
      attributes['selectedColor'] = item.selectedColor;
    }

    if (Object.keys(attributes).length === 0) return '';

    // Get localized values only (without titles)
    const displayValues: string[] = [];
    Object.entries(attributes).forEach(([key, value]) => {
      const localizedValue = AttributeLocalizationUtils.getLocalizedAttributeValue(key, value, localization);
      if (localizedValue.trim() !== '') {
        displayValues.push(localizedValue);
      }
    });

    return displayValues.join(', ');
  }, [localization]);

  // Memoize cart items rendering
  const renderCartItems = useMemo(() => {
    return cartItems.map((item) => {
      const isRemoving = isOptimisticallyRemoving(item.productId);
      const attributesDisplay = formatItemAttributes(item);
      
      return (
        <div
          key={item.productId}
          className={`
            transition-all duration-300 transform
            ${
              isRemoving || item.isOptimistic
                ? "opacity-50 scale-95"
                : "opacity-100 scale-100"
            }
          `}
        >
          <div
            className={`
              rounded-xl border p-3 transition-all duration-200
              ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700 hover:border-gray-600"
                  : "bg-gray-50 border-gray-200 hover:border-gray-300"
              }
              ${item.isOptimistic ? "border-dashed" : ""}
            `}
          >
            <ProductCard3
              imageUrl={item.product?.imageUrls?.[0] || ""}
              colorImages={item.product?.colorImages || {}} 
              selectedColorImage={typeof item.selectedColorImage === 'string' ? item.selectedColorImage : undefined}
              productName={
                item.product?.productName || t("loadingProduct")
              }
              brandModel={
                item.product?.brandModel || item.sellerName
              }
              price={item.product?.price || 0}
              currency={item.product?.currency || "TL"}
              averageRating={item.product?.averageRating || 0}
              quantity={item.quantity}
              maxQuantityAllowed={99}
              onQuantityChanged={
                item.isOptimistic || isRemoving
                  ? undefined
                  : (newQuantity) =>
                      handleQuantityChange(item.productId, newQuantity)
              }
              isDarkMode={isDarkMode}
              scaleFactor={0.9}
            />

            {/* Display attributes in one line */}
            {attributesDisplay && (
              <div className="mt-2 text-xs text-gray-500">
                <span className="font-medium">
                  
                </span> {attributesDisplay}
              </div>
            )}

            {/* Remove Button */}
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => handleRemoveItem(item.productId)}
                disabled={isRemoving || item.isOptimistic}
                className={`
                  flex items-center space-x-2 px-3 py-2 rounded-lg text-sm
                  transition-colors duration-200
                  ${
                    isDarkMode
                      ? "text-red-400 hover:text-red-300 hover:bg-red-900/20"
                      : "text-red-500 hover:text-red-600 hover:bg-red-50"
                  }
                  ${
                    isRemoving || item.isOptimistic
                      ? "opacity-50 cursor-not-allowed"
                      : ""
                  }
                `}
              >
                {isRemoving ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                <span>
                  {isRemoving 
                    ? t("removing")
                    : t("remove")
                  }
                </span>
              </button>
            </div>

            {/* Loading/Error States */}
            {item.isLoadingProduct === true && (
              <div className="mt-2 flex items-center space-x-2 text-xs text-gray-500">
                <div className="animate-spin w-3 h-3 border border-gray-400 border-t-transparent rounded-full"></div>
                <span>{t("loadingProductInfo")}</span>
              </div>
            )}

            {item.loadError === true && (
              <div className="mt-2 flex items-center space-x-2 text-xs text-red-500">
                <AlertCircle size={12} />
                <span>{t("productInfoError")}</span>
              </div>
            )}
          </div>
        </div>
      );
    });
  }, [cartItems, isOptimisticallyRemoving, isDarkMode, handleQuantityChange, handleRemoveItem, formatItemAttributes, t]);

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
                className={`
                  p-2 rounded-full
                  ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
                `}
              >
                <ShoppingCart
                  size={20}
                  className={isDarkMode ? "text-gray-300" : "text-gray-700"}
                />
              </div>
              <div>
                <h2
                  className={`
                    text-lg font-bold
                    ${isDarkMode ? "text-white" : "text-gray-900"}
                  `}
                >
                  {t("title")}
                </h2>
                {user && cartCount > 0 && (
                  <p
                    className={`
                      text-sm
                      ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                    `}
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

          {/* Clear Cart Button */}
          {user && cartCount > 0 && (
            <div className="mt-4">
              <button
                onClick={handleClearCart}
                disabled={isClearing}
                className={`
                  flex items-center space-x-2 text-sm transition-colors duration-200
                  ${
                    isDarkMode
                      ? "text-red-400 hover:text-red-300"
                      : "text-red-500 hover:text-red-600"
                  }
                  ${isClearing ? "opacity-50 cursor-not-allowed" : ""}
                `}
              >
                {isClearing ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                <span>
                  {isClearing 
                    ? t("clearing")
                    : t("clearCart")
                  }
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto">
            {/* Not Authenticated State */}
            {!user ? (
              <div className="flex flex-col items-center justify-center h-full px-6 py-12">
                <div
                  className={`
                    w-20 h-20 rounded-full flex items-center justify-center mb-6
                    ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
                  `}
                >
                  <User
                    size={32}
                    className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                  />
                </div>
                <h3
                  className={`
                    text-xl font-bold mb-3 text-center
                    ${isDarkMode ? "text-white" : "text-gray-900"}
                  `}
                >
                  {t("loginRequired")}
                </h3>
                <p
                  className={`
                    text-center mb-8 leading-relaxed
                    ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                  `}
                >
                  {t("loginToViewCart")}
                </p>
                <button
                  onClick={handleGoToLogin}
                  className="
                    flex items-center space-x-2 px-6 py-3 rounded-full
                    bg-gradient-to-r from-orange-500 to-pink-500 text-white
                    hover:from-orange-600 hover:to-pink-600
                    transition-all duration-200 shadow-lg hover:shadow-xl
                    active:scale-95
                  "
                >
                  <LogIn size={18} />
                  <span className="font-medium">
                    {t("login")}
                  </span>
                </button>
              </div>
            ) : /* Loading State */ isLoading && !isInitialized ? (
              <div className="flex flex-col items-center justify-center h-full px-6 py-12">
                <div className="animate-spin w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full mb-4"></div>
                <p
                  className={`
                    text-center
                    ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                  `}
                >
                  {t("loading")}
                </p>
              </div>
            ) : /* Empty Cart State */ cartCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-6 py-12">
                <div
                  className={`
                    w-20 h-20 rounded-full flex items-center justify-center mb-6
                    ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
                  `}
                >
                  <ShoppingBag
                    size={32}
                    className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                  />
                </div>
                <h3
                  className={`
                    text-xl font-bold mb-3 text-center
                    ${isDarkMode ? "text-white" : "text-gray-900"}
                  `}
                >
                  {t("emptyCart")}
                </h3>
                <p
                  className={`
                    text-center mb-8 leading-relaxed
                    ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                  `}
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
                  <span className="font-medium">
                    {t("startShopping")}
                  </span>
                </button>
              </div>
            ) : (
              /* Cart Items */
              <div className="px-4 py-4">
                <div className="space-y-4">
                  {renderCartItems}

                  {/* Load More Button */}
                  {hasMore && (
                    <div className="flex justify-center pt-4">
                      <button
                        onClick={loadMoreItems}
                        disabled={isLoadingMore}
                        className={`
                          px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200
                          ${
                            isDarkMode
                              ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }
                          ${
                            isLoadingMore ? "opacity-50 cursor-not-allowed" : ""
                          }
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
              </div>
            )}
          </div>

          {/* Footer - Show only when there are items */}
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
                  className={`
                    text-lg font-bold
                    ${isDarkMode ? "text-white" : "text-gray-900"}
                  `}
                >
                  {t("total")}:
                </span>
                <span className="text-lg font-bold text-orange-500">
                  {totalPrice.toFixed(2)} TL
                </span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleViewFullCart}
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
                  className="
                    py-3 px-4 rounded-xl font-medium transition-all duration-200
                    bg-gradient-to-r from-orange-500 to-pink-500 text-white
                    hover:from-orange-600 hover:to-pink-600
                    shadow-lg hover:shadow-xl active:scale-95
                    flex items-center justify-center space-x-2
                  "
                >
                  <span>{t("checkout")}</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};