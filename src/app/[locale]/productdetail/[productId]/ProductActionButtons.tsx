"use client";

import React, { useMemo } from "react";
import { ShoppingCart, Check, Minus } from "lucide-react";

interface ProductActionButtonsProps {
  cartButtonState: "idle" | "adding" | "added" | "removing" | "removed";
  isProcessing: boolean;
  productInCart: boolean;
  isAddToCartDisabled: boolean;
  isOutOfStock: boolean;
  salesPaused: boolean;
  onAddToCart: () => void;
  onBuyNow: () => void;
  t: (key: string) => string;
}

export default function ProductActionButtons({
  cartButtonState,
  isProcessing,
  productInCart,
  isAddToCartDisabled,
  isOutOfStock,
  salesPaused,
  onAddToCart,
  onBuyNow,
  t,
}: ProductActionButtonsProps) {
  const cartButtonContent = useMemo(() => {
    if (cartButtonState === "adding") {
      return {
        icon: (
          <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        text: t("adding"),
      };
    }
    if (cartButtonState === "removing") {
      return {
        icon: (
          <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ),
        text: t("removing"),
      };
    }
    if (cartButtonState === "added") {
      return {
        icon: <Check className="w-4 h-4 sm:w-5 sm:h-5" />,
        text: t("addedToCart"),
      };
    }
    if (cartButtonState === "removed") {
      return {
        icon: <Check className="w-4 h-4 sm:w-5 sm:h-5" />,
        text: t("removedFromCart"),
      };
    }
    if (productInCart) {
      return {
        icon: <Minus className="w-4 h-4 sm:w-5 sm:h-5" />,
        text: t("removeFromCart"),
      };
    }
    return {
      icon: <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />,
      text: t("addToCart"),
    };
  }, [cartButtonState, productInCart, t]);

  const isSuccess =
    cartButtonState === "added" || cartButtonState === "removed";

  return (
    <div className="flex gap-2 sm:gap-3 pt-1 sm:pt-2">
      <button
        onClick={onAddToCart}
        disabled={isProcessing || isAddToCartDisabled}
        className={`
          flex-1 py-2 px-3 sm:py-2.5 sm:px-4 rounded-lg font-semibold text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 relative overflow-hidden
          ${
            productInCart && cartButtonState === "idle"
              ? "border-2 border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              : isSuccess
                ? "border-2 border-green-500 text-green-600 bg-green-50"
                : "border-2 border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
          }
          ${isProcessing || isAddToCartDisabled ? "opacity-50 cursor-not-allowed" : ""}
          ${isSuccess ? "transform scale-105" : ""}
        `}
      >
        <span className={`transition-all duration-300 ${isSuccess ? "animate-pulse" : ""}`}>
          {cartButtonContent.icon}
        </span>
        <span className="transition-all duration-300">{cartButtonContent.text}</span>
        {isSuccess && (
          <div className="absolute inset-0 bg-green-500/10 animate-pulse rounded-lg" />
        )}
      </button>

      <button
        onClick={onBuyNow}
        disabled={isOutOfStock || salesPaused}
        className={`flex-1 py-2 px-3 sm:py-2.5 sm:px-4 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-lg font-semibold text-xs sm:text-sm transition-all duration-300 flex items-center justify-center gap-1.5 sm:gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 ${
          isOutOfStock || salesPaused
            ? "opacity-50 cursor-not-allowed !from-gray-400 !to-gray-500"
            : ""
        }`}
      >
        {isOutOfStock
          ? t("ProductDetailPage.outOfStock")
          : salesPaused
            ? t("salesPaused") || "Sales Paused"
            : t("ProductDetailPage.buyNow")}
      </button>
    </div>
  );
}
