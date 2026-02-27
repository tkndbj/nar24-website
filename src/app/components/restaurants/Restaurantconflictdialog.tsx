"use client";

import React from "react";
import { AlertTriangle, X } from "lucide-react";

interface RestaurantConflictDialogProps {
  open: boolean;
  currentRestaurantName: string;
  newRestaurantName: string;
  onReplace: () => void;
  onCancel: () => void;
  isDarkMode?: boolean;
  /** Pass your translation function; falls back to English defaults */
  t?: (key: string, fallback: string) => string;
}

export default function RestaurantConflictDialog({
  open,
  currentRestaurantName,
  newRestaurantName,
  onReplace,
  onCancel,
  isDarkMode = false,
  t = (_k, fb) => fb,
}: RestaurantConflictDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className={`w-full max-w-sm rounded-2xl border shadow-lg overflow-hidden ${
          isDarkMode
            ? "bg-gray-900 border-gray-800"
            : "bg-white border-gray-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`px-5 py-4 ${isDarkMode ? "bg-gray-800" : "bg-orange-50"}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isDarkMode ? "bg-orange-500/20" : "bg-orange-100"
                }`}
              >
                <AlertTriangle className="w-5 h-5 text-orange-500" />
              </div>
              <h3
                className={`text-base font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("differentRestaurant", "Different Restaurant")}
              </h3>
            </div>
            <button
              onClick={onCancel}
              className={`p-1 rounded-lg transition-colors ${
                isDarkMode
                  ? "hover:bg-gray-700 text-gray-400"
                  : "hover:bg-gray-200 text-gray-400"
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <p
            className={`text-sm leading-relaxed ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            {t(
              "restaurantConflictMessage",
              `Your food cart contains items from "${currentRestaurantName}". Would you like to clear your cart and add items from "${newRestaurantName}" instead?`,
            )
              .replace("{current}", currentRestaurantName)
              .replace("{new}", newRestaurantName)}
          </p>
        </div>

        {/* Actions */}
        <div
          className={`px-5 py-4 flex gap-3 ${
            isDarkMode ? "bg-gray-800/50" : "bg-gray-50"
          }`}
        >
          <button
            onClick={onCancel}
            className={`flex-1 py-2.5 px-4 rounded-xl text-[13px] font-semibold transition-colors border ${
              isDarkMode
                ? "border-gray-700 text-gray-300 hover:bg-gray-800"
                : "border-gray-200 text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t("keepCurrent", "Keep Current")}
          </button>
          <button
            onClick={onReplace}
            className="flex-1 py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
          >
            {t("clearAndAdd", "Clear & Add New")}
          </button>
        </div>
      </div>
    </div>
  );
}