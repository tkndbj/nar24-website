"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { PantDetailStepProps, GenericStepResult } from "./stepComponentTypes";

export default function PantDetailStep({
  category,
  initialAttributes,
  onSave,
  onCancel,
}: PantDetailStepProps) {
  const t = useTranslations("pantDetailsStep");

  const womenSizes = [
    "XXS / 32",
    "XS / 34",
    "S / 36",
    "M / 38",
    "L / 40",
    "XL / 42",
    "XXL / 44",
    "XXXL / 46",
    "4XL / 48",
    "5XL / 50",
    "24",
    "6XL / 52",
    "25",
    "7XL / 54",
    "26",
    "8XL / 56",
    "27",
    "9XL / 58",
    "28",
    "10XL / 60",
    "29",
    "30",
    "31",
    "32",
    "33",
  ];

  const menSizes = [
    "L",
    "L/XL",
    "XL",
    "XXL",
    "2XL",
    "3XL",
    "4XL",
    "5XL",
    "6XL",
    "7XL",
    "29",
    "30",
    "31",
    "32",
    "33",
    "34",
    "36",
    "38",
    "40",
    "42",
    "44",
    "46",
    "48",
    "50",
    "52",
    "54",
    "56",
    "58",
    "XXXL",
    "8XL",
    "XS",
    "S",
    "S/M",
    "M",
  ];

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

  // Pick which size-list to show based on category
  const sizes = category === "Men" ? menSizes : womenSizes;

  useEffect(() => {
    // Load from dynamic attributes if provided
    if (initialAttributes && Array.isArray(initialAttributes.pantSizes)) {
      const pantSizes = initialAttributes.pantSizes.filter(
        (size): size is string => typeof size === "string"
      );
      setSelectedSizes(pantSizes);
    }
  }, [initialAttributes]);

  const handleSavePantSizes = () => {
    if (selectedSizes.length === 0) {
      alert(t("pleaseSelectPantSizes"));
      return;
    }

    // Return the pant sizes as dynamic attributes following the interface
    const result: GenericStepResult = {
      pantSizes: [...selectedSizes],
    };

    // Include any existing attributes that were passed in
    if (initialAttributes) {
      Object.keys(initialAttributes).forEach((key) => {
        if (key !== "pantSizes" && initialAttributes[key] !== undefined) {
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

  // Get category styling
  const getCategoryInfo = () => {
    if (category === "Men") {
      return { 
        type: "men", 
        color: "from-blue-500 to-indigo-500", 
        bgColor: "from-blue-50 to-indigo-50", 
        icon: "👖",
        description: "Men's Pants & Trousers"
      };
    } else {
      return { 
        type: "women", 
        color: "from-pink-500 to-rose-500", 
        bgColor: "from-pink-50 to-rose-50", 
        icon: "👗",
        description: "Women's Pants & Bottoms"
      };
    }
  };

  const categoryInfo = getCategoryInfo();

  return (
    <div className={`min-h-screen ${isDarkMode ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" : "bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50"}`}>
      {/* Enhanced App Bar with glassmorphism */}
      <div className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b shadow-lg ${isDarkMode ? "bg-gray-900/90 border-gray-700" : "bg-white/80 border-gray-200/50"}`}>
        <div className="flex items-center px-4 py-3">
          <button
            onClick={onCancel}
            className={`group p-2 mr-2 rounded-lg transition-all duration-300 hover:scale-105 ${isDarkMode ? "text-gray-300 hover:text-gray-100 hover:bg-gray-800" : "text-slate-600 hover:text-slate-800 hover:bg-gray-100/50"}`}
          >
            <svg
              className="w-6 h-6 transform group-hover:-translate-x-1 transition-transform duration-300"
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
            <div className={`w-8 h-8 bg-gradient-to-r ${categoryInfo.color} rounded-lg flex items-center justify-center shadow-lg`}>
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
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
          <div className={`backdrop-blur-xl rounded-lg shadow-lg border overflow-hidden ${isDarkMode ? "bg-gray-800/90 border-gray-700" : "bg-white/70 border-gray-200/50"}`}>
            <div className={`p-4 border-b ${isDarkMode ? "border-gray-700 bg-gray-700/50" : `border-opacity-50 bg-gradient-to-r ${categoryInfo.bgColor}`}`}>
              <h3 className={`text-base font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                <div className={`w-7 h-7 bg-gradient-to-r ${categoryInfo.color} rounded-lg flex items-center justify-center`}>
                  <span className="text-white text-sm">📏</span>
                </div>
                Available Sizes
              </h3>
              <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                {selectedSizes.length} size{selectedSizes.length !== 1 ? 's' : ''} selected
              </p>
            </div>

            <div className="p-3">
              <div className="grid grid-cols-3 gap-2">
                {sizes.map((size) => {
                  const isSelected = selectedSizes.includes(size);
                  return (
                    <button
                      key={size}
                      onClick={() => handleSizeToggle(size)}
                      className={`relative group aspect-[2.5/1] rounded-lg border-2 transition-all duration-300 text-sm flex items-center justify-center ${
                        isSelected
                          ? `border-opacity-100 ${isDarkMode ? `bg-${categoryInfo.color.split('-')[1]}-900/20` : `bg-gradient-to-r ${categoryInfo.bgColor}`} shadow-lg`
                          : isDarkMode ? "border-gray-600 bg-gray-700 hover:border-gray-500" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                      }`}
                    >
                      <span
                        className={`font-bold transition-colors duration-300 text-center px-2 ${
                          isSelected
                            ? isDarkMode ? `text-${categoryInfo.color.split('-')[1]}-400` : `text-${categoryInfo.color.split('-')[1]}-700`
                            : isDarkMode ? "text-gray-200 group-hover:text-gray-100" : "text-gray-600 group-hover:text-gray-800"
                        }`}
                      >
                        {size}
                      </span>
                      {isSelected && (
                        <div className={`absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r ${categoryInfo.color} rounded-full flex items-center justify-center shadow-lg`}>
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
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Size Guide Info */}
          <div className={`mb-6 p-4 bg-gradient-to-r ${categoryInfo.bgColor} rounded-2xl border border-opacity-30`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 bg-gradient-to-r ${categoryInfo.color} rounded-xl flex items-center justify-center`}>
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-slate-700">Size Guide</p>
                <p className="text-sm text-slate-600">
                  {category === "Men" 
                    ? "Includes waist measurements and letter sizes" 
                    : "Includes EU sizes and waist measurements"}
                </p>
              </div>
            </div>
          </div>

          {/* Enhanced Save Button */}
          <div className="pt-4">
            <button
              onClick={handleSavePantSizes}
              disabled={selectedSizes.length === 0}
              className={`w-full group relative overflow-hidden bg-gradient-to-r ${categoryInfo.color} hover:opacity-90 text-white font-bold py-5 px-6 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-2xl hover:shadow-3xl`}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <span className="relative flex items-center justify-center gap-3">
                {t("save")}
                <svg
                  className="w-5 h-5 transform group-hover:translate-x-1 transition-transform duration-300"
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
            <div className={`mt-6 p-4 bg-gradient-to-r ${categoryInfo.bgColor} rounded-2xl border border-opacity-50`}>
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 bg-gradient-to-r ${categoryInfo.color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <svg
                    className="w-4 h-4 text-white"
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
                  <p className="font-medium text-slate-700">Selected Sizes</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedSizes.slice(0, 8).map((size) => (
                      <span
                        key={size}
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${categoryInfo.color} text-white`}
                      >
                        {size}
                      </span>
                    ))}
                    {selectedSizes.length > 8 && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-600">
                        +{selectedSizes.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}