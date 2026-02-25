"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { AllInOneCategoryData as AllInOneCategoryDataType } from "@/constants/productData";
import { ClothingStepProps, GenericStepResult } from "./stepComponentTypes";

export default function ClothingStep({
  initialAttributes,
  onSave,
  onCancel,
}: ClothingStepProps) {
  const t = useTranslations("clothingStep");

  // Dynamic import for AllInOneCategoryData
  const [AllInOneCategoryData, setAllInOneCategoryData] = useState<typeof AllInOneCategoryDataType | null>(null);
  useEffect(() => {
    import("@/constants/productData").then((mod) => setAllInOneCategoryData(mod.AllInOneCategoryData));
  }, []);

  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedFit, setSelectedFit] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
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

  useEffect(() => {
    // Load from dynamic attributes if provided
    if (initialAttributes) {
      const sizes = initialAttributes.clothingSizes;
      const fit = initialAttributes.clothingFit;
      const type = initialAttributes.clothingType;

      if (Array.isArray(sizes)) {
        setSelectedSizes(
          sizes.filter((size): size is string => typeof size === "string")
        );
      }

      if (typeof fit === "string") {
        setSelectedFit(fit);
      }

      if (typeof type === "string") {
        setSelectedType(type);
      }
    }
  }, [initialAttributes]);

  const handleSaveClothingDetails = () => {
    if (selectedSizes.length === 0 || !selectedFit || !selectedType) {
      alert(t("pleaseSelectAllClothingDetails"));
      return;
    }

    // Return the clothing details as dynamic attributes following the interface
    const result: GenericStepResult = {
      clothingSizes: selectedSizes,
      clothingFit: selectedFit,
      clothingType: selectedType,
    };

    // Include any existing attributes that were passed in
    if (initialAttributes) {
      Object.keys(initialAttributes).forEach((key) => {
        if (
          !result.hasOwnProperty(key) &&
          initialAttributes[key] !== undefined
        ) {
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

  const getSizeDisplay = (size: string) => {
    return t(`sizes.${size}`, { fallback: size });
  };

  const getFitDisplay = (fit: string) => {
    return t(`fits.${fit}`, { fallback: fit });
  };

  const getTypeDisplay = (type: string) => {
    return t(`types.${type}`, { fallback: type });
  };

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
            <div className="w-8 h-8 bg-gradient-to-r from-rose-500 to-pink-500 rounded-lg flex items-center justify-center">
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
          {/* Clothing Size Section */}
          <div className={`rounded-lg shadow-lg border overflow-hidden ${isDarkMode ? "bg-gray-800/90 border-gray-700" : "bg-white/90 border-gray-200"}`}>
            <div className={`p-4 border-b ${isDarkMode ? "border-gray-700 bg-gray-700/50" : "border-rose-100/50 bg-gradient-to-r from-rose-50/50 to-pink-50/50"}`}>
              <h2 className={`text-base font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                <div className="w-7 h-7 bg-gradient-to-r from-rose-400 to-pink-400 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">📏</span>
                </div>
                {t("clothingSize")}
              </h2>
              <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Select all applicable sizes
              </p>
            </div>

            <div className="p-3">
              <div className="grid grid-cols-3 gap-2">
                {(AllInOneCategoryData?.kClothingSizes ?? []).map((size) => {
                  const isSelected = selectedSizes.includes(size);
                  return (
                    <button
                      key={size}
                      onClick={() => handleSizeToggle(size)}
                      className={`relative group p-3 rounded-lg border-2 transition-all text-sm ${
                        isSelected
                          ? "border-rose-400 bg-rose-50 dark:bg-rose-900/20"
                          : isDarkMode ? "border-gray-600 bg-gray-700 hover:border-rose-400" : "border-gray-200 bg-white hover:border-rose-300"
                      }`}
                    >
                      <span
                        className={`font-medium ${
                          isSelected
                            ? "text-rose-700 dark:text-rose-400"
                            : isDarkMode ? "text-gray-200" : "text-gray-700"
                        }`}
                      >
                        {getSizeDisplay(size)}
                      </span>
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-rose-500 to-pink-500 rounded-full flex items-center justify-center">
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

          {/* Clothing Fit Section */}
          <div className={`rounded-lg shadow-lg border overflow-hidden ${isDarkMode ? "bg-gray-800/90 border-gray-700" : "bg-white/90 border-gray-200"}`}>
            <div className={`p-4 border-b ${isDarkMode ? "border-gray-700 bg-gray-700/50" : "border-purple-100/50 bg-gradient-to-r from-purple-50/50 to-indigo-50/50"}`}>
              <h2 className={`text-base font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                <div className="w-7 h-7 bg-gradient-to-r from-purple-400 to-indigo-400 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">👔</span>
                </div>
                {t("clothingFit")}
              </h2>
              <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Choose the fit style
              </p>
            </div>

            <div className="p-3 space-y-2">
              {(AllInOneCategoryData?.kClothingFits ?? []).map((fit) => {
                const isSelected = selectedFit === fit;
                return (
                  <button
                    key={fit}
                    onClick={() => setSelectedFit(fit)}
                    className={`w-full group flex items-center justify-between p-3 rounded-lg border-2 transition-all text-sm ${
                      isSelected
                        ? "border-purple-400 bg-purple-50 dark:bg-purple-900/20"
                        : isDarkMode ? "border-gray-600 bg-gray-700 hover:border-purple-400" : "border-gray-200 bg-white hover:border-purple-300"
                    }`}
                  >
                    <span
                      className={`font-medium ${
                        isSelected
                          ? "text-purple-700 dark:text-purple-400"
                          : isDarkMode ? "text-gray-200" : "text-gray-700"
                      }`}
                    >
                      {getFitDisplay(fit)}
                    </span>
                    <div
                      className={`w-5 h-5 rounded-full border-2 transition-all ${
                        isSelected
                          ? "bg-gradient-to-r from-purple-500 to-indigo-500 border-purple-500"
                          : isDarkMode ? "border-gray-600" : "border-gray-300"
                      } flex items-center justify-center`}
                    >
                      {isSelected && (
                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clothing Type Section */}
          <div className={`rounded-lg shadow-lg border overflow-hidden ${isDarkMode ? "bg-gray-800/90 border-gray-700" : "bg-white/90 border-gray-200"}`}>
            <div className={`p-4 border-b ${isDarkMode ? "border-gray-700 bg-gray-700/50" : "border-emerald-100/50 bg-gradient-to-r from-emerald-50/50 to-teal-50/50"}`}>
              <h2 className={`text-base font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                <div className="w-7 h-7 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">🏷️</span>
                </div>
                {t("clothingType")}
              </h2>
              <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Select the clothing type
              </p>
            </div>

            <div className="p-3 space-y-2">
              {(AllInOneCategoryData?.kClothingTypes ?? []).map((type) => {
                const isSelected = selectedType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={`w-full group flex items-center justify-between p-3 rounded-lg border-2 transition-all text-sm ${
                      isSelected
                        ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                        : isDarkMode ? "border-gray-600 bg-gray-700 hover:border-emerald-400" : "border-gray-200 bg-white hover:border-emerald-300"
                    }`}
                  >
                    <span
                      className={`font-medium ${
                        isSelected
                          ? "text-emerald-700 dark:text-emerald-400"
                          : isDarkMode ? "text-gray-200" : "text-gray-700"
                      }`}
                    >
                      {getTypeDisplay(type)}
                    </span>
                    <div
                      className={`w-5 h-5 rounded-full border-2 transition-all ${
                        isSelected
                          ? "bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-500"
                          : isDarkMode ? "border-gray-600" : "border-gray-300"
                      } flex items-center justify-center`}
                    >
                      {isSelected && (
                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-2">
            <button
              onClick={handleSaveClothingDetails}
              disabled={selectedSizes.length === 0 || !selectedFit || !selectedType}
              className="w-full bg-gradient-to-r from-rose-500 via-purple-500 to-indigo-500 hover:from-rose-600 hover:via-purple-600 hover:to-indigo-600 text-white font-bold py-3 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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

          {/* Progress indicator */}
          <div className="flex justify-center space-x-2 pt-2">
            <div className={`w-2 h-2 rounded-full transition-all ${selectedSizes.length > 0 ? 'bg-rose-400' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`}></div>
            <div className={`w-2 h-2 rounded-full transition-all ${selectedFit ? 'bg-purple-400' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`}></div>
            <div className={`w-2 h-2 rounded-full transition-all ${selectedType ? 'bg-emerald-400' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`}></div>
          </div>
        </div>
      </div>
    </div>
  );
}