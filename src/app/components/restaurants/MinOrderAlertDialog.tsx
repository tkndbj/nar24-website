"use client";

import React from "react";
import { AlertTriangle, X } from "lucide-react";

interface MinOrderAlertDialogProps {
  open: boolean;
  minOrderPrice: number;
  currentTotal: number;
  currency: string;
  onClose: () => void;
  isDarkMode?: boolean;
  t: (key: string, fallback: string) => string;
}

export default function MinOrderAlertDialog({
  open,
  minOrderPrice,
  currentTotal,
  currency,
  onClose,
  isDarkMode = false,
  t,
}: MinOrderAlertDialogProps) {
  if (!open) return null;

  const remaining = Math.max(0, minOrderPrice - currentTotal);

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
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
                {t("minOrderTitle", "Minimum Order Not Met")}
              </h3>
            </div>
            <button
              onClick={onClose}
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
              "minOrderMessage",
              "This restaurant requires a minimum order of {minOrder} {currency}. Your current total is {currentTotal} {currency}. Please add {remaining} {currency} more to proceed.",
            )
              .replace("{minOrder}", minOrderPrice.toFixed(2))
              .replace("{currentTotal}", currentTotal.toFixed(2))
              .replace("{remaining}", remaining.toFixed(2))
              .replaceAll("{currency}", currency)}
          </p>
        </div>

        {/* Action */}
        <div
          className={`px-5 py-4 ${
            isDarkMode ? "bg-gray-800/50" : "bg-gray-50"
          }`}
        >
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
          >
            {t("minOrderOk", "Add More Items")}
          </button>
        </div>
      </div>
    </div>
  );
}
