"use client";

import React, { useEffect, useState } from "react";
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
import { ProductCard3 } from "./ProductCard3";
import { useCart } from "@/context/CartProvider";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  isDarkMode = false,
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
  } = useCart();

  const [isClearing, setIsClearing] = useState(false);
  const [removingItems, setRemovingItems] = useState<Set<string>>(new Set());

  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Small delay to trigger enter animation
      setTimeout(() => setIsAnimating(true), 10);
    } else {
      setIsAnimating(false);
      // Wait for exit animation to complete before unmounting
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  // Initialize cart when drawer opens and user is authenticated
  useEffect(() => {
    if (isOpen && user && !isInitialized && !isLoading) {
      initializeCartIfNeeded();
    }
  }, [isOpen, user, isInitialized, isLoading, initializeCartIfNeeded]);

  // Calculate total price
  const totalPrice = cartItems.reduce((total, item) => {
    if (item.product && !item.isOptimistic) {
      return total + item.product.price * item.quantity;
    }
    return total;
  }, 0);

  // Handle item removal with optimistic UI
  const handleRemoveItem = async (productId: string) => {
    setRemovingItems((prev) => new Set(prev).add(productId));
    try {
      await removeFromCart(productId);
    } catch (error) {
      console.error("Failed to remove item:", error);
    } finally {
      setRemovingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    }
  };

  // Handle quantity update
  const handleQuantityChange = async (
    productId: string,
    newQuantity: number
  ) => {
    if (newQuantity < 1) {
      await handleRemoveItem(productId);
      return;
    }
    try {
      await updateQuantity(productId, newQuantity);
    } catch (error) {
      console.error("Failed to update quantity:", error);
    }
  };

  // Handle clear cart
  const handleClearCart = async () => {
    setIsClearing(true);
    try {
      await clearCart();
    } catch (error) {
      console.error("Failed to clear cart:", error);
    } finally {
      setIsClearing(false);
    }
  };

  // Handle navigation to checkout
  const handleCheckout = () => {
    onClose();
    router.push("/checkout");
  };

  // Handle navigation to cart page
  const handleViewFullCart = () => {
    onClose();
    router.push("/cart");
  };

  // Handle navigation to login
  const handleGoToLogin = () => {
    onClose();
    router.push("/login");
  };

  // Backdrop click handler
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

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
    ${isAnimating ? "translate-x-0" : "translate-x-full"} // Changed this line
  `}
        // Remove the inline style={{ transform: ... }}
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
                  Sepetim
                </h2>
                {user && cartCount > 0 && (
                  <p
                    className={`
                      text-sm
                      ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                    `}
                  >
                    {cartCount} ürün
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
                <span>{isClearing ? "Temizleniyor..." : "Sepeti Temizle"}</span>
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
                  Giriş Yapın
                </h3>
                <p
                  className={`
                    text-center mb-8 leading-relaxed
                    ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                  `}
                >
                  Sepetinizi görüntülemek ve alışverişe devam etmek için lütfen
                  giriş yapın.
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
                  <span className="font-medium">Giriş Yap</span>
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
                  Sepetiniz yükleniyor...
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
                  Sepetiniz Boş
                </h3>
                <p
                  className={`
                    text-center mb-8 leading-relaxed
                    ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                  `}
                >
                  Henüz sepetinize ürün eklemediniz. Alışverişe başlamak için
                  ürünleri keşfedin!
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
                  <span className="font-medium">Alışverişe Başla</span>
                </button>
              </div>
            ) : (
              /* Cart Items */
              <div className="px-4 py-4">
                <div className="space-y-4">
                  {cartItems.map((item) => {
                    const isRemoving = removingItems.has(item.productId);

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
                            selectedColor={item.selectedColor}
                            selectedColorImage={item.selectedColorImage}
                            productName={
                              item.product?.productName || "Ürün yükleniyor..."
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
                                    handleQuantityChange(
                                      item.productId,
                                      newQuantity
                                    )
                            }
                            isDarkMode={isDarkMode}
                            scaleFactor={0.9}
                          />

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
                                {isRemoving ? "Kaldırılıyor..." : "Kaldır"}
                              </span>
                            </button>
                          </div>

                          {/* Loading/Error States */}
                          {item.isLoadingProduct && (
                            <div className="mt-2 flex items-center space-x-2 text-xs text-gray-500">
                              <div className="animate-spin w-3 h-3 border border-gray-400 border-t-transparent rounded-full"></div>
                              <span>Ürün bilgileri yükleniyor...</span>
                            </div>
                          )}

                          {item.loadError && (
                            <div className="mt-2 flex items-center space-x-2 text-xs text-red-500">
                              <AlertCircle size={12} />
                              <span>Ürün bilgileri yüklenemedi</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

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
                            <span>Yükleniyor...</span>
                          </div>
                        ) : (
                          "Daha Fazla Göster"
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
                  Toplam:
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
                  Sepeti Görüntüle
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
                  <span>Ödemeye Geç</span>
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
