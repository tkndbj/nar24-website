// src/hooks/selectors/index.ts
// Re-exports all selector hooks for convenient imports

// Cart selectors
export {
  useCartCount,
  useCartProductIds,
  useIsProductInCart,
  useCartActions,
  useCartItems,
  useCartLoadingState,
  useProductCartState,
} from "./useCartSelectors";

export type { CartActions } from "./useCartSelectors";

// Favorite selectors
export {
  useFavoriteCount,
  useFavoriteIds,
  useIsProductFavorited,
  useFavoriteActions,
  usePaginatedFavorites,
  useFavoriteBaskets,
  useFavoriteLoadingState,
  useProductFavoriteState,
} from "./useFavoriteSelectors";

export type { FavoriteActions } from "./useFavoriteSelectors";

// User selectors
export {
  useIsAuthenticated,
  useUserId,
  useIsAdmin,
  useUserLoading,
  useIsProfileComplete,
  useProfileData,
  useFirebaseUser,
  useUserActions,
  useSocialAuthState,
  use2FAState,
} from "./useUserSelectors";

export type { UserActions } from "./useUserSelectors";
