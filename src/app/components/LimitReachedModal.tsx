"use client";

import React, { useState, useEffect, useCallback } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";

interface LimitReachedModalProps {
  onClose: () => void;
  type: "cart" | "favorites";
  maxItems: number;
}

/**
 * Lightweight modal shown when the user hits the cart (300) or favorites (500) cap.
 * Designed to be **conditionally mounted** — the parent renders it only when the
 * limit is reached, and the component calls `onClose` after its exit animation.
 */
export default function LimitReachedModal({
  onClose,
  type,
  maxItems,
}: LimitReachedModalProps) {
  const t = useTranslations("limits");
  const [isAnimating, setIsAnimating] = useState(false);

  // Animate in on mount, restore scroll on unmount
  useEffect(() => {
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    });
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  // Animate out → wait for transition → unmount via onClose
  const handleClose = useCallback(() => {
    setIsAnimating(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  // Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [handleClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  const title = type === "cart" ? t("cartLimitTitle") : t("favoritesLimitTitle");
  const description =
    type === "cart"
      ? t("cartLimitDescription", { max: maxItems })
      : t("favoritesLimitDescription", { max: maxItems });

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-colors duration-200 ${
        isAnimating ? "bg-black/50" : "bg-transparent"
      }`}
      onClick={handleBackdropClick}
    >
      <div
        className={`relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl transition-all duration-200 dark:bg-gray-800 ${
          isAnimating ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          aria-label={t("close")}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
          <svg
            className="h-6 w-6 text-orange-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>

        <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>

        <p className="mb-5 text-center text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>

        <button
          onClick={handleClose}
          className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 active:bg-orange-700"
        >
          {t("understood")}
        </button>
      </div>
    </div>
  );
}
