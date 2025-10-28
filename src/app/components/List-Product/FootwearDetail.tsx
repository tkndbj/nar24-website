"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { FootwearStepProps, GenericStepResult } from "./stepComponentTypes";

export default function FootwearDetailStep({
  category,
  subcategory,
  initialAttributes,
  onSave,
  onCancel,
}: FootwearStepProps) {
  const t = useTranslations("footwearSizeStep");

  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  const womenSizes = ["35", "36", "37", "38", "39", "40", "41", "42", "43"];
  const menSizes = ["39", "40", "41", "42", "43", "44", "45", "46", "47", "48"];
  const kidsSizes = ["28", "29", "30", "31", "32", "33", "34", "35", "36"];
  const allSizes = [
    "35",
    "36",
    "37",
    "38",
    "39",
    "40",
    "41",
    "42",
    "43",
    "44",
    "45",
    "46",
    "47",
    "48",
  ];

  useEffect(() => {
    // Load from dynamic attributes if provided
    if (initialAttributes && Array.isArray(initialAttributes.footwearSizes)) {
      const sizes = initialAttributes.footwearSizes.filter(
        (size): size is string => typeof size === "string"
      );
      setSelectedSizes(sizes);
    }
  }, [initialAttributes]);

  const getAvailableSizes = (): string[] => {
    if (
      (category === "Women" && subcategory === "Footwear") ||
      (category === "Shoes & Bags" && subcategory === "Women's Shoes")
    ) {
      return womenSizes;
    } else if (
      (category === "Men" && subcategory === "Footwear") ||
      (category === "Shoes & Bags" && subcategory === "Men's Shoes")
    ) {
      return menSizes;
    } else if (category === "Shoes & Bags" && subcategory === "Kids' Shoes") {
      return kidsSizes;
    } else if (category === "Shoes & Bags" && subcategory === "Sports Shoes") {
      return allSizes;
    }
    return allSizes; // default
  };

  const handleSaveFootwearSizes = () => {
    if (selectedSizes.length === 0) {
      alert(t("pleaseSelectAtLeastOneSize"));
      return;
    }

    // Return the footwear sizes as dynamic attributes following the interface
    const result: GenericStepResult = {
      footwearSizes: selectedSizes,
    };

    // Include any existing attributes that were passed in
    if (initialAttributes) {
      Object.keys(initialAttributes).forEach((key) => {
        if (key !== "footwearSizes" && initialAttributes[key] !== undefined) {
          const value = initialAttributes[key];
          if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean" ||
            Array.isArray(value)
          ) {
            result[key] = value;
          }
        }
      });
    }

    onSave(result);
  };

  const handleSizeToggle = (size: string) => {
    setSelectedSizes((prev) => {
      if (prev.includes(size)) {
        return prev.filter((s) => s !== size);
      } else {
        return [...prev, size];
      }
    });
  };

  const availableSizes = getAvailableSizes();

  // Get category type for styling
  const getCategoryInfo = () => {
    if (category === "Women" || (category === "Shoes & Bags" && subcategory === "Women's Shoes")) {
      return { type: "women", color: "from-pink-500 to-rose-500", bgColor: "from-pink-50 to-rose-50", icon: "👠" };
    } else if (category === "Men" || (category === "Shoes & Bags" && subcategory === "Men's Shoes")) {
      return { type: "men", color: "from-blue-500 to-indigo-500", bgColor: "from-blue-50 to-indigo-50", icon: "👞" };
    } else if (category === "Shoes & Bags" && subcategory === "Kids' Shoes") {
      return { type: "kids", color: "from-yellow-500 to-orange-500", bgColor: "from-yellow-50 to-orange-50", icon: "👟" };
    } else {
      return { type: "sports", color: "from-green-500 to-emerald-500", bgColor: "from-green-50 to-emerald-50", icon: "👟" };
    }
  };

  const categoryInfo = getCategoryInfo();

  return (
    <div className={`min-h-screen ${isDarkMode ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" : "bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50"}`}>
      {/* App Bar */}
      <div className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-lg border-b ${isDarkMode ? "bg-gray-900/90 border-gray-700" : "bg-white/90 border-gray-200"}`}>
        <div className="flex items-center px-4 py-3">
          <button
            onClick={onCancel}
            className={`p-2 mr-2 rounded-lg transition-colors ${isDarkMode ? "text-gray-300 hover:bg-gray-800" : "text-gray-700 hover:bg-gray-100"}`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 bg-gradient-to-r ${categoryInfo.color} rounded-lg flex items-center justify-center`}>
              <span className="text-white text-sm">{categoryInfo.icon}</span>
            </div>
            <h1 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {t("title")}
            </h1>
          </div>
        </div>
      </div>

      {/* Content with proper top spacing */}
      <div className="pt-16 min-h-screen px-3 pb-6">
        <div className="max-w-lg mx-auto space-y-4">

          {/* Sizes Grid */}
          <div className={`rounded-lg shadow-lg border overflow-hidden ${isDarkMode ? "bg-gray-800/90 border-gray-700" : "bg-white/90 border-gray-200"}`}>
            <div className={`p-4 border-b ${isDarkMode ? "border-gray-700 bg-gray-700/50" : "border-purple-100/50 bg-gradient-to-r from-purple-50/50 to-indigo-50/50"}`}>
              <h2 className={`text-base font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                <div className={`w-7 h-7 bg-gradient-to-r ${categoryInfo.color} rounded-lg flex items-center justify-center`}>
                  <span className="text-white text-sm">📏</span>
                </div>
                {t("selectAvailableSizes")}
              </h2>
              <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                {selectedSizes.length} size{selectedSizes.length !== 1 ? 's' : ''} selected ({categoryInfo.type})
              </p>
            </div>

            <div className="p-3">
              <div className="grid grid-cols-4 gap-2">
                {availableSizes.map((size) => {
                  const isSelected = selectedSizes.includes(size);
                  return (
                    <button
                      key={size}
                      onClick={() => handleSizeToggle(size)}
                      className={`relative group p-3 rounded-lg border-2 transition-all text-sm ${
                        isSelected
                          ? `border-purple-400 ${isDarkMode ? "bg-purple-900/20" : "bg-purple-50"}`
                          : isDarkMode ? "border-gray-600 bg-gray-700 hover:border-purple-400" : "border-gray-200 bg-white hover:border-purple-300"
                      }`}
                    >
                      <span
                        className={`font-bold ${
                          isSelected
                            ? isDarkMode ? "text-purple-400" : "text-purple-700"
                            : isDarkMode ? "text-gray-200" : "text-gray-700"
                        }`}
                      >
                        {size}
                      </span>
                      {isSelected && (
                        <div className={`absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r ${categoryInfo.color} rounded-full flex items-center justify-center`}>
                          <svg
                            className="w-2.5 h-2.5 text-white"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-2">
            <button
              onClick={handleSaveFootwearSizes}
              disabled={selectedSizes.length === 0}
              className={`w-full bg-gradient-to-r ${categoryInfo.color} hover:opacity-90 text-white font-bold py-3 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm`}
            >
              <span className="flex items-center justify-center gap-2">
                {t("save")}
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </span>
            </button>
          </div>

          {/* Selection Summary */}
          {selectedSizes.length > 0 && (
            <div className={`mt-4 p-3 rounded-lg border ${isDarkMode ? "bg-purple-900/30 border-purple-800" : "bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200"}`}>
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 bg-gradient-to-r ${categoryInfo.color} rounded-lg flex items-center justify-center`}>
                  <svg
                    className="w-3 h-3 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <p className={`font-medium text-sm ${isDarkMode ? "text-purple-400" : "text-purple-700"}`}>Selected Sizes</p>
                  <p className={`text-xs ${isDarkMode ? "text-purple-500" : "text-purple-600"}`}>
                    {selectedSizes.sort((a, b) => parseInt(a) - parseInt(b)).join(", ")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}