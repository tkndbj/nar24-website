// src/app/providers/FavoriteProvider.tsx

"use client";

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
} from "react";

interface FavoriteState {
  globalFavorites: Set<string>;
  basketFavorites: Record<string, Set<string>>; // basketName -> productIds
  isLoading: boolean;
}

type FavoriteAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "ADD_GLOBAL_FAVORITE"; payload: string }
  | { type: "REMOVE_GLOBAL_FAVORITE"; payload: string }
  | { type: "SET_GLOBAL_FAVORITES"; payload: string[] }
  | {
      type: "ADD_BASKET_FAVORITE";
      payload: { basketName: string; productId: string };
    }
  | {
      type: "REMOVE_BASKET_FAVORITE";
      payload: { basketName: string; productId: string };
    };

const initialState: FavoriteState = {
  globalFavorites: new Set(),
  basketFavorites: {},
  isLoading: false,
};

const favoriteReducer = (
  state: FavoriteState,
  action: FavoriteAction
): FavoriteState => {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, isLoading: action.payload };

    case "ADD_GLOBAL_FAVORITE":
      return {
        ...state,
        globalFavorites: new Set([...state.globalFavorites, action.payload]),
      };

    case "REMOVE_GLOBAL_FAVORITE":
      const newGlobalFavorites = new Set(state.globalFavorites);
      newGlobalFavorites.delete(action.payload);
      return { ...state, globalFavorites: newGlobalFavorites };

    case "SET_GLOBAL_FAVORITES":
      return { ...state, globalFavorites: new Set(action.payload) };

    case "ADD_BASKET_FAVORITE":
      const { basketName, productId } = action.payload;
      const currentBasket = state.basketFavorites[basketName] || new Set();
      return {
        ...state,
        basketFavorites: {
          ...state.basketFavorites,
          [basketName]: new Set([...currentBasket, productId]),
        },
      };

    case "REMOVE_BASKET_FAVORITE":
      const { basketName: rmBasketName, productId: rmProductId } =
        action.payload;
      const rmCurrentBasket = state.basketFavorites[rmBasketName] || new Set();
      const newBasket = new Set(rmCurrentBasket);
      newBasket.delete(rmProductId);
      return {
        ...state,
        basketFavorites: {
          ...state.basketFavorites,
          [rmBasketName]: newBasket,
        },
      };

    default:
      return state;
  }
};

interface AddToFavoritesOptions {
  quantity: number;
  selectedColor?: string;
  selectedColorImage?: string;
  additionalAttributes: Record<string, unknown>;
}

interface FavoriteContextType extends FavoriteState {
  isGloballyFavorited: (productId: string) => boolean;
  isFavoritedInBasket: (productId: string) => Promise<boolean>;
  getBasketNameForProduct: (productId: string) => Promise<string | null>;
  removeGloballyFromFavorites: (productId: string) => Promise<void>;
  addToFavorites: (
    productId: string,
    options: AddToFavoritesOptions
  ) => Promise<void>;
}

const FavoriteContext = createContext<FavoriteContextType | undefined>(
  undefined
);

export const FavoriteProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(favoriteReducer, initialState);

  const isGloballyFavorited = useCallback(
    (productId: string): boolean => {
      return state.globalFavorites.has(productId);
    },
    [state.globalFavorites]
  );

  const isFavoritedInBasket = useCallback(
    async (productId: string): Promise<boolean> => {
      // Check if product exists in any basket
      return Object.values(state.basketFavorites).some((basket) =>
        basket.has(productId)
      );
    },
    [state.basketFavorites]
  );

  const getBasketNameForProduct = useCallback(
    async (productId: string): Promise<string | null> => {
      // Find which basket contains this product
      for (const [basketName, basket] of Object.entries(
        state.basketFavorites
      )) {
        if (basket.has(productId)) {
          return basketName;
        }
      }
      return null;
    },
    [state.basketFavorites]
  );

  const removeGloballyFromFavorites = useCallback(
    async (productId: string): Promise<void> => {
      dispatch({ type: "SET_LOADING", payload: true });

      try {
        // TODO: Make API call to remove from favorites
        await fetch(`/api/favorites/${productId}`, { method: "DELETE" });

        dispatch({ type: "REMOVE_GLOBAL_FAVORITE", payload: productId });

        // Also remove from all baskets
        Object.keys(state.basketFavorites).forEach((basketName) => {
          if (state.basketFavorites[basketName].has(productId)) {
            dispatch({
              type: "REMOVE_BASKET_FAVORITE",
              payload: { basketName, productId },
            });
          }
        });
      } catch (error) {
        console.error("Error removing from favorites:", error);
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    },
    [state.basketFavorites]
  );

  const addToFavorites = useCallback(
    async (
      productId: string,
      options: AddToFavoritesOptions
    ): Promise<void> => {
      dispatch({ type: "SET_LOADING", payload: true });

      try {
        // TODO: Make API call to add to favorites
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, ...options }),
        });

        dispatch({ type: "ADD_GLOBAL_FAVORITE", payload: productId });

        // Add to default basket for now
        dispatch({
          type: "ADD_BASKET_FAVORITE",
          payload: { basketName: "Default", productId },
        });
      } catch (error) {
        console.error("Error adding to favorites:", error);
      } finally {
        dispatch({ type: "SET_LOADING", payload: false });
      }
    },
    []
  );

  const contextValue: FavoriteContextType = {
    ...state,
    isGloballyFavorited,
    isFavoritedInBasket,
    getBasketNameForProduct,
    removeGloballyFromFavorites,
    addToFavorites,
  };

  return (
    <FavoriteContext.Provider value={contextValue}>
      {children}
    </FavoriteContext.Provider>
  );
};

export const useFavoriteProvider = () => {
  const context = useContext(FavoriteContext);
  if (context === undefined) {
    throw new Error(
      "useFavoriteProvider must be used within a FavoriteProvider"
    );
  }
  return context;
};
