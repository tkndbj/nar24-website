"use client";

import React from "react";
import { Clock, X } from "lucide-react";

interface RestaurantClosedAlertDialogProps {
  open: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
  t: (key: string, fallback: string) => string;
}

export default function RestaurantClosedAlertDialog({
  open,
  onClose,
  isDarkMode = false,
  t,
}: RestaurantClosedAlertDialogProps) {
  if (!open) return null;

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
          className={`px-5 py-4 ${isDarkMode ? "bg-gray-800" : "bg-red-50"}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isDarkMode ? "bg-red-500/20" : "bg-red-100"
                }`}
              >
                <Clock className="w-5 h-5 text-red-500" />
              </div>
              <h3
                className={`text-base font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("restaurantClosedTitle", "Restaurant Closed")}
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
              "restaurantClosedMessage",
              "This restaurant is currently closed. You can keep your cart items and place your order when the restaurant reopens.",
            )}
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
            {t("restaurantClosedOk", "Got It")}
          </button>
        </div>
      </div>
    </div>
  );
}
