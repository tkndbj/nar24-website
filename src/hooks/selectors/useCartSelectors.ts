// src/hooks/selectors/useCartSelectors.ts
// Selector hooks for Cart context - prevent re-renders when only specific values needed

"use client";

import { useMemo, useCallback } from "react";
import { useCart } from "@/context/CartProvider";

/**
 * Returns only the cart item count.
 * Component using this hook will only re-render when cart count changes.
 */
export function useCartCount(): number {
  const { cartCount } = useCart();
  return cartCount;
}

/**
 * Returns the Set of product IDs currently in cart.
 * Useful for checking multiple products' cart status efficiently.
 */
export function useCartProductIds(): Set<string> {
  const { cartProductIds } = useCart();
  return cartProductIds;
}

/**
 * Returns whether a specific product is in the cart.
 * Component using this hook will only re-render when THIS product's cart status changes.
 *
 * @param productId - The product ID to check
 */
export function useIsProductInCart(productId: string): boolean {
  const { cartProductIds } = useCart();

  return useMemo(() => {
    return cartProductIds.has(productId);
  }, [cartProductIds, productId]);
}

/**
 * Returns stable cart action functions that never change reference.
 * Use this when you only need to call cart methods without reading state.
 * Components using only actions will never re-render due to cart state changes.
 */
export interface CartActions {
  addProductToCart: ReturnType<typeof useCart>["addProductToCart"];
  addToCartById: ReturnType<typeof useCart>["addToCartById"];
  removeFromCart: ReturnType<typeof useCart>["removeFromCart"];
  updateQuantity: ReturnType<typeof useCart>["updateQuantity"];
  removeMultipleFromCart: ReturnType<typeof useCart>["removeMultipleFromCart"];
  calculateCartTotals: ReturnType<typeof useCart>["calculateCartTotals"];
  validateForPayment: ReturnType<typeof useCart>["validateForPayment"];
  updateCartCacheFromValidation: ReturnType<typeof useCart>["updateCartCacheFromValidation"];
  refresh: ReturnType<typeof useCart>["refresh"];
  enableLiveUpdates: ReturnType<typeof useCart>["enableLiveUpdates"];
  disableLiveUpdates: ReturnType<typeof useCart>["disableLiveUpdates"];
  initializeCartIfNeeded: ReturnType<typeof useCart>["initializeCartIfNeeded"];
  loadMoreItems: ReturnType<typeof useCart>["loadMoreItems"];
}

export function useCartActions(): CartActions {
  const {
    addProductToCart,
    addToCartById,
    removeFromCart,
    updateQuantity,
    removeMultipleFromCart,
    calculateCartTotals,
    validateForPayment,
    updateCartCacheFromValidation,
    refresh,
    enableLiveUpdates,
    disableLiveUpdates,
    initializeCartIfNeeded,
    loadMoreItems,
  } = useCart();

  // Return memoized object with stable function references
  return useMemo(
    () => ({
      addProductToCart,
      addToCartById,
      removeFromCart,
      updateQuantity,
      removeMultipleFromCart,
      calculateCartTotals,
      validateForPayment,
      updateCartCacheFromValidation,
      refresh,
      enableLiveUpdates,
      disableLiveUpdates,
      initializeCartIfNeeded,
      loadMoreItems,
    }),
    [
      addProductToCart,
      addToCartById,
      removeFromCart,
      updateQuantity,
      removeMultipleFromCart,
      calculateCartTotals,
      validateForPayment,
      updateCartCacheFromValidation,
      refresh,
      enableLiveUpdates,
      disableLiveUpdates,
      initializeCartIfNeeded,
      loadMoreItems,
    ]
  );
}

/**
 * Returns cart items array.
 * Use when you need the full list of items.
 */
export function useCartItems() {
  const { cartItems } = useCart();
  return cartItems;
}

/**
 * Returns cart loading states.
 */
export function useCartLoadingState() {
  const { isLoading, isLoadingMore, isInitialized, hasMore } = useCart();

  return useMemo(
    () => ({
      isLoading,
      isLoadingMore,
      isInitialized,
      hasMore,
    }),
    [isLoading, isLoadingMore, isInitialized, hasMore]
  );
}

/**
 * Convenience hook that returns product cart status AND actions together.
 * Optimized for ProductCard-like components that need both.
 */
export function useProductCartState(productId: string) {
  const isInCart = useIsProductInCart(productId);
  const actions = useCartActions();

  // Create a stable addToCart callback for this specific product
  const addToCart = useCallback(
    (quantity?: number, selectedColor?: string, attributes?: Record<string, unknown>) => {
      return actions.addToCartById(productId, quantity, selectedColor, attributes);
    },
    [actions, productId]
  );

  const removeFromCart = useCallback(() => {
    return actions.removeFromCart(productId);
  }, [actions, productId]);

  return useMemo(
    () => ({
      isInCart,
      addToCart,
      removeFromCart,
      addProductToCart: actions.addProductToCart,
    }),
    [isInCart, addToCart, removeFromCart, actions.addProductToCart]
  );
}
