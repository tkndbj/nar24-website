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
    <div className="min-h-screen bg-white">
      {/* Enhanced App Bar with glassmorphism */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-lg">
        <div className="flex items-center px-6 py-4">
          <button
            onClick={onCancel}
            className="group p-3 mr-3 text-slate-600 hover:text-slate-800 hover:bg-gray-100/50 rounded-2xl transition-all duration-300 hover:scale-105"
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
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 bg-gradient-to-r ${categoryInfo.color} rounded-2xl flex items-center justify-center shadow-lg`}>
              <svg
                className="w-6 h-6 text-white"
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
            <h1 className="text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
              {t("title")}
            </h1>
          </div>
        </div>
      </div>

      {/* Content with proper top spacing */}
      <div className="pt-20 min-h-screen px-4 pb-8">
        <div className="max-w-lg mx-auto">
          {/* Header section */}
          <div className="mb-8 text-center">
            <div className={`w-16 h-16 bg-gradient-to-r ${categoryInfo.bgColor} rounded-3xl flex items-center justify-center mx-auto mb-4`}>
              <span className="text-3xl">{categoryInfo.icon}</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              {t("selectAvailableSizes")}
            </h2>
            <p className="text-slate-600">
              {categoryInfo.description}
            </p>
            <div className={`inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r ${categoryInfo.bgColor} rounded-full mt-3`}>
              <span className="text-sm font-medium text-slate-700">
                {selectedSizes.length} size{selectedSizes.length !== 1 ? 's' : ''} selected
              </span>
            </div>
          </div>

          {/* Sizes Grid */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden mb-8">
            <div className={`p-6 border-b border-opacity-50 bg-gradient-to-r ${categoryInfo.bgColor}`}>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-3">
                <div className={`w-8 h-8 bg-gradient-to-r ${categoryInfo.color} rounded-xl flex items-center justify-center`}>
                  <span className="text-white text-sm">📏</span>
                </div>
                Available Sizes
              </h3>
              <p className="text-sm text-slate-600 mt-2">
                Select all sizes you have in stock
              </p>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-3 gap-3">
                {sizes.map((size) => {
                  const isSelected = selectedSizes.includes(size);
                  return (
                    <button
                      key={size}
                      onClick={() => handleSizeToggle(size)}
                      className={`relative group aspect-[2.5/1] rounded-2xl border-2 transition-all duration-300 transform hover:scale-105 flex items-center justify-center ${
                        isSelected
                          ? `border-opacity-100 bg-gradient-to-r ${categoryInfo.bgColor} shadow-lg`
                          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                      }`}
                    >
                      <span
                        className={`font-bold text-sm transition-colors duration-300 text-center px-2 ${
                          isSelected
                            ? "text-slate-800"
                            : "text-slate-600 group-hover:text-slate-800"
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