"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCart, buildProductDataForCart } from "@/context/CartProvider";
import { useUser } from "@/context/UserProvider";
import { Product } from "@/app/models/Product";

type CartButtonState = "idle" | "adding" | "added" | "removing" | "removed";

interface CartActionsResult {
  cartButtonState: CartButtonState;
  isProcessing: boolean;
  productInCart: boolean;
  isAddToCartDisabled: boolean;
  showCartOptionSelector: boolean;
  showBuyNowOptionSelector: boolean;
  showLoginModal: boolean;
  setShowLoginModal: (v: boolean) => void;
  handleAddToCart: (selectedOptions?: {
    quantity?: number;
    [key: string]: unknown;
  }) => Promise<void>;
  handleBuyNow: () => void;
  handleCartOptionSelectorConfirm: (selectedOptions: {
    quantity?: number;
    [key: string]: unknown;
  }) => Promise<void>;
  handleCartOptionSelectorClose: () => void;
  handleBuyNowOptionSelectorConfirm: (selectedOptions: {
    quantity?: number;
    [key: string]: unknown;
  }) => void;
  handleBuyNowOptionSelectorClose: () => void;
}

function hasSelectableOptions(product: Product | null): boolean {
  if (!product) return false;

  if (product.subsubcategory?.toLowerCase() === "curtains") return true;
  if (Object.keys(product.colorImages || {}).length > 0) return true;

  if ((product.clothingSizes?.length ?? 0) > 1) return true;
  if ((product.pantSizes?.length ?? 0) > 1) return true;
  if ((product.footwearSizes?.length ?? 0) > 1) return true;
  if ((product.jewelryMaterials?.length ?? 0) > 1) return true;

  const nonSelectableKeys = new Set([
    "clothingType",
    "clothingTypes",
    "pantFabricType",
    "pantFabricTypes",
    "gender",
    "clothingFit",
    "productType",
    "consoleBrand",
    "curtainMaxWidth",
    "curtainMaxHeight",
  ]);

  return Object.entries(product.attributes || {}).some(([key, value]) => {
    if (nonSelectableKeys.has(key)) return false;
    if (Array.isArray(value))
      return value.filter((v) => v?.toString().trim()).length > 1;
    if (typeof value === "string")
      return (
        value
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean).length > 1
      );
    return false;
  });
}

export function useCartActions(
  product: Product | null,
  locale: string,
  salesPaused: boolean
): CartActionsResult {
  const router = useRouter();
  const { addProductToCart, removeFromCart, cartProductIds } = useCart();
  const { user } = useUser();

  const [cartButtonState, setCartButtonState] = useState<CartButtonState>("idle");
  const [showCartOptionSelector, setShowCartOptionSelector] = useState(false);
  const [showBuyNowOptionSelector, setShowBuyNowOptionSelector] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const isCartOperationInProgress = useRef(false);

  const productInCart = product ? cartProductIds.has(product.id) : false;
  const isProcessing =
    cartButtonState === "adding" || cartButtonState === "removing";

  const isAddToCartDisabled = useMemo(() => {
    if (!product) return false;
    if (isProcessing) return true;
    if (!product.sellerName || product.sellerName === "Unknown") return true;

    const hasNoStock = product.quantity === 0;
    const hasColorOptions =
      product.colorQuantities &&
      Object.keys(product.colorQuantities).length > 0;

    return hasNoStock && !hasColorOptions;
  }, [product, isProcessing]);

  const navigateToBuyNow = useCallback(
    (selectedOptions: { quantity?: number; [key: string]: unknown }) => {
      if (!product) return;

      try {
        const selectedAttributes: Record<string, unknown> = {};
        Object.entries(selectedOptions).forEach(([key, value]) => {
          if (key !== "quantity" && value !== undefined && value !== null && value !== "") {
            selectedAttributes[key] = value;
          }
        });

        const productData = buildProductDataForCart(
          product,
          selectedOptions.selectedColor as string | undefined,
          undefined
        );

        const buyNowItem = {
          ...productData,
          quantity: selectedOptions.quantity || 1,
          selectedAttributes:
            Object.keys(selectedAttributes).length > 0
              ? selectedAttributes
              : undefined,
        };

        const encodedData = encodeURIComponent(JSON.stringify(buyNowItem));
        router.push(`/${locale}/productpayment?buyNowData=${encodedData}`);
      } catch {
        router.push(`/${locale}/productpayment`);
      }
    },
    [product, router, locale]
  );

  const handleAddToCart = useCallback(
    async (selectedOptions?: { quantity?: number; [key: string]: unknown }) => {
      if (!user) {
        setShowLoginModal(true);
        return;
      }
      if (!product) return;
      if (isCartOperationInProgress.current) return;
      if (isProcessing) return;

      const isInCart = cartProductIds.has(product.id);
      const isAdding = !isInCart;

      if (isAdding && !selectedOptions && hasSelectableOptions(product)) {
        isCartOperationInProgress.current = true;
        setShowCartOptionSelector(true);
        setTimeout(() => {
          isCartOperationInProgress.current = false;
        }, 300);
        return;
      }

      isCartOperationInProgress.current = true;

      try {
        setCartButtonState(isAdding ? "adding" : "removing");

        if (isAdding && navigator.vibrate) {
          navigator.vibrate(10);
        }

        let result: string;

        if (isAdding) {
          let quantityToAdd = 1;
          const attributesToAdd: Record<string, unknown> = {};

          if (selectedOptions) {
            if (typeof selectedOptions.quantity === "number") {
              quantityToAdd = selectedOptions.quantity;
            }
            Object.entries(selectedOptions).forEach(([key, value]) => {
              if (key !== "quantity") attributesToAdd[key] = value;
            });
          }

          const selectedColor = attributesToAdd.selectedColor as string | undefined;
          delete attributesToAdd.selectedColor;

          result = await addProductToCart(
            product,
            quantityToAdd,
            selectedColor,
            Object.keys(attributesToAdd).length > 0 ? attributesToAdd : undefined
          );
        } else {
          result = await removeFromCart(product.id);
        }

        if (
          result.includes("Added") ||
          result.includes("Removed") ||
          result.includes("cart")
        ) {
          setCartButtonState(isAdding ? "added" : "removed");
          setTimeout(() => setCartButtonState("idle"), 1500);
        } else {
          setCartButtonState("idle");
          if (result === "Please log in first") {
            setShowLoginModal(true);
          }
        }
      } catch {
        setCartButtonState("idle");
      } finally {
        isCartOperationInProgress.current = false;
      }
    },
    [user, product, cartProductIds, isProcessing, addProductToCart, removeFromCart]
  );

  const handleBuyNow = useCallback(() => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    if (!product) return;
    if (salesPaused) return;

    if (hasSelectableOptions(product)) {
      setShowBuyNowOptionSelector(true);
    } else {
      navigateToBuyNow({ quantity: 1 });
    }
  }, [user, product, navigateToBuyNow, salesPaused]);

  const handleCartOptionSelectorConfirm = useCallback(
    async (selectedOptions: { quantity?: number; [key: string]: unknown }) => {
      setShowCartOptionSelector(false);
      await handleAddToCart(selectedOptions);
    },
    [handleAddToCart]
  );

  const handleCartOptionSelectorClose = useCallback(() => {
    setShowCartOptionSelector(false);
    isCartOperationInProgress.current = false;
  }, []);

  const handleBuyNowOptionSelectorConfirm = useCallback(
    (selectedOptions: { quantity?: number; [key: string]: unknown }) => {
      setShowBuyNowOptionSelector(false);
      navigateToBuyNow(selectedOptions);
    },
    [navigateToBuyNow]
  );

  const handleBuyNowOptionSelectorClose = useCallback(() => {
    setShowBuyNowOptionSelector(false);
  }, []);

  return {
    cartButtonState,
    isProcessing,
    productInCart,
    isAddToCartDisabled,
    showCartOptionSelector,
    showBuyNowOptionSelector,
    showLoginModal,
    setShowLoginModal,
    handleAddToCart,
    handleBuyNow,
    handleCartOptionSelectorConfirm,
    handleCartOptionSelectorClose,
    handleBuyNowOptionSelectorConfirm,
    handleBuyNowOptionSelectorClose,
  };
}
