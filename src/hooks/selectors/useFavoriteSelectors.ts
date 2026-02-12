// src/hooks/selectors/useFavoriteSelectors.ts
// Selector hooks for Favorites context - prevent re-renders when only specific values needed

"use client";

import { useMemo, useCallback } from "react";
import { useFavorites } from "@/context/FavoritesProvider";

/**
 * Returns only the favorite count.
 * Component using this hook will only re-render when favorite count changes.
 */
export function useFavoriteCount(): number {
  const { favoriteCount } = useFavorites();
  return favoriteCount;
}

/**
 * Returns the Set of favorited product IDs.
 * Useful for checking multiple products' favorite status efficiently.
 */
export function useFavoriteIds(): Set<string> {
  const { favoriteIds } = useFavorites();
  return favoriteIds;
}

/**
 * Returns whether a specific product is favorited.
 * Component using this hook will only re-render when THIS product's favorite status changes.
 *
 * @param productId - The product ID to check
 */
export function useIsProductFavorited(productId: string): boolean {
  const { favoriteIds } = useFavorites();

  return useMemo(() => {
    return favoriteIds.has(productId);
  }, [favoriteIds, productId]);
}

/**
 * Returns stable favorite action functions that never change reference.
 * Use this when you only need to call favorite methods without reading state.
 * Components using only actions will never re-render due to favorite state changes.
 */
export interface FavoriteActions {
  addToFavorites: ReturnType<typeof useFavorites>["addToFavorites"];
  removeMultipleFromFavorites: ReturnType<typeof useFavorites>["removeMultipleFromFavorites"];
  removeGloballyFromFavorites: ReturnType<typeof useFavorites>["removeGloballyFromFavorites"];
  createFavoriteBasket: ReturnType<typeof useFavorites>["createFavoriteBasket"];
  deleteFavoriteBasket: ReturnType<typeof useFavorites>["deleteFavoriteBasket"];
  setSelectedBasket: ReturnType<typeof useFavorites>["setSelectedBasket"];
  transferToBasket: ReturnType<typeof useFavorites>["transferToBasket"];
  loadNextPage: ReturnType<typeof useFavorites>["loadNextPage"];
  resetPagination: ReturnType<typeof useFavorites>["resetPagination"];
  enableLiveUpdates: ReturnType<typeof useFavorites>["enableLiveUpdates"];
  disableLiveUpdates: ReturnType<typeof useFavorites>["disableLiveUpdates"];
}

export function useFavoriteActions(): FavoriteActions {
  const {
    addToFavorites,
    removeMultipleFromFavorites,
    removeGloballyFromFavorites,
    createFavoriteBasket,
    deleteFavoriteBasket,
    setSelectedBasket,
    transferToBasket,
    loadNextPage,
    resetPagination,
    enableLiveUpdates,
    disableLiveUpdates,
  } = useFavorites();

  // Return memoized object with stable function references
  return useMemo(
    () => ({
      addToFavorites,
      removeMultipleFromFavorites,
      removeGloballyFromFavorites,
      createFavoriteBasket,
      deleteFavoriteBasket,
      setSelectedBasket,
      transferToBasket,
      loadNextPage,
      resetPagination,
      enableLiveUpdates,
      disableLiveUpdates,
    }),
    [
      addToFavorites,
      removeMultipleFromFavorites,
      removeGloballyFromFavorites,
      createFavoriteBasket,
      deleteFavoriteBasket,
      setSelectedBasket,
      transferToBasket,
      loadNextPage,
      resetPagination,
      enableLiveUpdates,
      disableLiveUpdates,
    ]
  );
}

/**
 * Returns paginated favorites list.
 * Use when you need the full list of favorite items.
 */
export function usePaginatedFavorites() {
  const { paginatedFavorites } = useFavorites();
  return paginatedFavorites;
}

/**
 * Returns favorite baskets list.
 */
export function useFavoriteBaskets() {
  const { favoriteBaskets, selectedBasketId } = useFavorites();

  return useMemo(
    () => ({
      favoriteBaskets,
      selectedBasketId,
    }),
    [favoriteBaskets, selectedBasketId]
  );
}

/**
 * Returns favorite loading states.
 */
export function useFavoriteLoadingState() {
  const { isLoading, isLoadingMore, isInitialLoadComplete, hasMoreData } = useFavorites();

  return useMemo(
    () => ({
      isLoading,
      isLoadingMore,
      isInitialLoadComplete,
      hasMoreData,
    }),
    [isLoading, isLoadingMore, isInitialLoadComplete, hasMoreData]
  );
}

/**
 * Convenience hook that returns product favorite status AND actions together.
 * Optimized for ProductCard-like components that need both.
 */
export function useProductFavoriteState(productId: string) {
  const isFavorited = useIsProductFavorited(productId);
  const actions = useFavoriteActions();

  // Create a stable toggle callback for this specific product
  const toggleFavorite = useCallback(
    (attributes?: { quantity?: number; selectedColor?: string; selectedColorImage?: string }) => {
      return actions.addToFavorites(productId, attributes);
    },
    [actions, productId]
  );

  const removeFromFavorites = useCallback(() => {
    return actions.removeGloballyFromFavorites(productId);
  }, [actions, productId]);

  return useMemo(
    () => ({
      isFavorited,
      toggleFavorite,
      removeFromFavorites,
    }),
    [isFavorited, toggleFavorite, removeFromFavorites]
  );
}
