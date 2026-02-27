"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { X, Minus, Plus, ShoppingCart, StickyNote } from "lucide-react";
import { useTranslations } from "next-intl";
import { FoodExtrasData } from "@/constants/foodExtras";
import { SelectedExtra } from "@/context/FoodCartProvider";

interface FoodExtrasSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (extras: SelectedExtra[], specialNotes: string, quantity: number) => void;
  allowedExtras?: string[];
  foodName: string;
  foodPrice: number;
  foodCategory: string;
  currency?: string;
  isDarkMode?: boolean;

  /** Initial extras (for editing an existing cart item) */
  initialExtras?: SelectedExtra[];
  initialNotes?: string;
  initialQuantity?: number;
}

export default function FoodExtrasSheet({
  open,
  onClose,
  onConfirm,
  foodName,
  foodPrice,
  foodCategory,
  currency = "TL",
  isDarkMode = false,
  initialExtras = [],
  initialNotes = "",
  initialQuantity = 1,
  allowedExtras = [],
}: FoodExtrasSheetProps) {
  const t = useTranslations("restaurantDetail");
  const tRoot = useTranslations();
  const [selectedExtras, setSelectedExtras] = useState<Map<string, SelectedExtra>>(new Map());
  const [notes, setNotes] = useState(initialNotes);
  const [quantity, setQuantity] = useState(initialQuantity);

  // Available extras for this food category
  const availableExtras = useMemo(() => {
    const categoryExtras = FoodExtrasData.kExtras[foodCategory] ?? [];
    // If the food has a specific allowed list, filter to only those
    if (allowedExtras && allowedExtras.length > 0) {
      const allowedSet = new Set(allowedExtras);
      return categoryExtras.filter((e) => allowedSet.has(e));
    }
    return categoryExtras;
  }, [foodCategory, allowedExtras]);

  // Translate extra name
  const getExtraName = useCallback(
    (key: string): string => {
      const tKey = FoodExtrasData.kExtrasTranslationKeys[key];
      if (!tKey) return key;
      try {
        const translated = tRoot(tKey);
        return translated !== tKey ? translated : key;
      } catch {
        return key;
      }
    },
    [tRoot],
  );

  // Reset state when sheet opens
  const prevOpenRef = React.useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      const map = new Map<string, SelectedExtra>();
      initialExtras.forEach((ext) => map.set(ext.name, { ...ext }));
      setSelectedExtras(map);
      setNotes(initialNotes);
      setQuantity(initialQuantity);
    }
    prevOpenRef.current = open;
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle an extra on/off
  const toggleExtra = useCallback((extraName: string) => {
    setSelectedExtras((prev) => {
      const next = new Map(prev);
      if (next.has(extraName)) {
        next.delete(extraName);
      } else {
        next.set(extraName, { name: extraName, quantity: 1, price: 0 });
      }
      return next;
    });
  }, []);

  // Calculate total
  const totalPrice = useMemo(() => {
    const extrasTotal = Array.from(selectedExtras.values()).reduce(
      (sum, ext) => sum + ext.price * ext.quantity,
      0,
    );
    return (foodPrice + extrasTotal) * quantity;
  }, [foodPrice, selectedExtras, quantity]);

  const handleConfirm = useCallback(() => {
    onConfirm(Array.from(selectedExtras.values()), notes, quantity);
    onClose();
  }, [selectedExtras, notes, quantity, onConfirm, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`relative w-full sm:max-w-md max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden ${
          isDarkMode ? "bg-gray-900" : "bg-white"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isDarkMode ? "border-gray-800" : "border-gray-100"
          }`}
        >
          <div className="min-w-0 flex-1">
            <h3
              className={`text-base font-bold truncate ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {foodName}
            </h3>
            <p className="text-sm font-semibold text-orange-500 mt-0.5">
              {foodPrice.toFixed(2)} {currency}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode
                ? "hover:bg-gray-800 text-gray-400"
                : "hover:bg-gray-100 text-gray-400"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Quantity selector */}
          <div>
            <label
              className={`text-xs font-semibold uppercase tracking-wider ${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              }`}
            >
              {t("quantity")}
            </label>
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${
                  isDarkMode
                    ? "border-gray-700 text-gray-400 hover:bg-gray-800"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                } disabled:opacity-40`}
              >
                <Minus className="w-4 h-4" />
              </button>
              <span
                className={`min-w-[40px] text-center text-lg font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {quantity}
              </span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${
                  isDarkMode
                    ? "border-gray-700 text-gray-400 hover:bg-gray-800"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Extras */}
          {availableExtras.length > 0 && (
            <div>
              <label
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isDarkMode ? "text-gray-500" : "text-gray-400"
                }`}
              >
                {t("extras")}
                {selectedExtras.size > 0 && (
                  <span className="ml-2 text-orange-500 normal-case">
                    ({selectedExtras.size} {t("selected")})
                  </span>
                )}
              </label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {availableExtras.map((extra) => {
                  const isSelected = selectedExtras.has(extra);
                  return (
                    <button
                      key={extra}
                      type="button"
                      onClick={() => toggleExtra(extra)}
                      className={`px-3 py-2.5 rounded-xl text-[12px] font-medium border transition-all text-left ${
                        isSelected
                          ? isDarkMode
                            ? "bg-orange-500/15 border-orange-500/40 text-orange-400"
                            : "bg-orange-50 border-orange-300 text-orange-700"
                          : isDarkMode
                            ? "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                            : "bg-white border-gray-200 text-gray-600 hover:border-orange-200"
                      }`}
                    >
                      <span className="mr-1.5">
                        {isSelected ? "✓" : "+"}
                      </span>
                      {getExtraName(extra)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Special notes */}
          <div>
            <label
              className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              }`}
            >
              <StickyNote className="w-3.5 h-3.5" />
              {t("specialNotes")}
              <span
                className={`text-[10px] font-medium normal-case px-1.5 py-0.5 rounded-full ${
                  isDarkMode ? "bg-gray-800 text-gray-500" : "bg-gray-100 text-gray-400"
                }`}
              >
                {t("optional")}
              </span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("notesPlaceholder")}
              className={`w-full mt-2 px-3 py-2.5 rounded-xl border text-[13px] transition-all resize-none ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-orange-500"
                  : "bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400 focus:border-orange-400"
              } focus:ring-2 focus:ring-orange-500/20`}
            />
          </div>
        </div>

        {/* Footer: Add to Cart */}
        <div
          className={`px-5 py-4 border-t ${
            isDarkMode ? "border-gray-800" : "border-gray-100"
          }`}
        >
          <button
            onClick={handleConfirm}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[14px] font-semibold transition-colors"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>
              {t("addToCart")} · {totalPrice.toFixed(2)} {currency}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}