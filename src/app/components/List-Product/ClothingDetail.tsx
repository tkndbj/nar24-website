"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AllInOneCategoryData } from "@/constants/productData";
import { ClothingStepProps, GenericStepResult } from "./stepComponentTypes";

export default function ClothingStep({
  initialAttributes,
  onSave,
  onCancel,
}: ClothingStepProps) {
  const t = useTranslations("clothingStep");

  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedFit, setSelectedFit] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);

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
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50">
      {/* Enhanced App Bar with glassmorphism */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-white/20 shadow-lg">
        <div className="flex items-center px-6 py-4">
          <button
            onClick={onCancel}
            className="group p-3 mr-3 text-slate-600 hover:text-slate-800 hover:bg-white/50 rounded-2xl transition-all duration-300 hover:scale-105"
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
            <div className="w-10 h-10 bg-gradient-to-r from-rose-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
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
        <div className="max-w-lg mx-auto space-y-8">
          {/* Clothing Size Section */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 overflow-hidden">
            <div className="p-6 border-b border-rose-100/50 bg-gradient-to-r from-rose-50/50 to-pink-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-rose-400 to-pink-400 rounded-xl flex items-center justify-center">
                  <span className="text-white text-sm">📏</span>
                </div>
                {t("clothingSize")}
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                Select all applicable sizes
              </p>
            </div>
            
            <div className="p-2">
              <div className="grid grid-cols-3 gap-3 p-4">
                {AllInOneCategoryData.kClothingSizes.map((size) => {
                  const isSelected = selectedSizes.includes(size);
                  return (
                    <button
                      key={size}
                      onClick={() => handleSizeToggle(size)}
                      className={`relative group p-4 rounded-2xl border-2 transition-all duration-300 transform hover:scale-105 ${
                        isSelected
                          ? "border-rose-400 bg-gradient-to-r from-rose-50 to-pink-50 shadow-lg"
                          : "border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50/50"
                      }`}
                    >
                      <span
                        className={`font-medium transition-colors duration-300 ${
                          isSelected
                            ? "text-rose-700"
                            : "text-slate-700 group-hover:text-rose-600"
                        }`}
                      >
                        {getSizeDisplay(size)}
                      </span>
                      {isSelected && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-rose-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
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

          {/* Clothing Fit Section */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 overflow-hidden">
            <div className="p-6 border-b border-purple-100/50 bg-gradient-to-r from-purple-50/50 to-indigo-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-indigo-400 rounded-xl flex items-center justify-center">
                  <span className="text-white text-sm">👔</span>
                </div>
                {t("clothingFit")}
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                Choose the fit style
              </p>
            </div>

            <div className="p-6 space-y-3">
              {AllInOneCategoryData.kClothingFits.map((fit) => {
                const isSelected = selectedFit === fit;
                return (
                  <button
                    key={fit}
                    onClick={() => setSelectedFit(fit)}
                    className={`w-full group flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-300 transform hover:scale-[1.02] ${
                      isSelected
                        ? "border-purple-400 bg-gradient-to-r from-purple-50 to-indigo-50 shadow-lg"
                        : "border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50/50"
                    }`}
                  >
                    <span
                      className={`font-medium transition-colors duration-300 ${
                        isSelected
                          ? "text-purple-700"
                          : "text-slate-700 group-hover:text-purple-600"
                      }`}
                    >
                      {getFitDisplay(fit)}
                    </span>
                    <div
                      className={`w-6 h-6 rounded-full border-2 transition-all duration-300 ${
                        isSelected
                          ? "bg-gradient-to-r from-purple-500 to-indigo-500 border-purple-500"
                          : "border-slate-300 group-hover:border-purple-400"
                      } flex items-center justify-center`}
                    >
                      {isSelected && (
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clothing Type Section */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 overflow-hidden">
            <div className="p-6 border-b border-emerald-100/50 bg-gradient-to-r from-emerald-50/50 to-teal-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-xl flex items-center justify-center">
                  <span className="text-white text-sm">🏷️</span>
                </div>
                {t("clothingType")}
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                Select the clothing type
              </p>
            </div>

            <div className="p-6 space-y-3">
              {AllInOneCategoryData.kClothingTypes.map((type) => {
                const isSelected = selectedType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={`w-full group flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-300 transform hover:scale-[1.02] ${
                      isSelected
                        ? "border-emerald-400 bg-gradient-to-r from-emerald-50 to-teal-50 shadow-lg"
                        : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50"
                    }`}
                  >
                    <span
                      className={`font-medium transition-colors duration-300 ${
                        isSelected
                          ? "text-emerald-700"
                          : "text-slate-700 group-hover:text-emerald-600"
                      }`}
                    >
                      {getTypeDisplay(type)}
                    </span>
                    <div
                      className={`w-6 h-6 rounded-full border-2 transition-all duration-300 ${
                        isSelected
                          ? "bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-500"
                          : "border-slate-300 group-hover:border-emerald-400"
                      } flex items-center justify-center`}
                    >
                      {isSelected && (
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Enhanced Save Button */}
          <div className="pt-4">
            <button
              onClick={handleSaveClothingDetails}
              disabled={selectedSizes.length === 0 || !selectedFit || !selectedType}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-rose-500 via-purple-500 to-indigo-500 hover:from-rose-600 hover:via-purple-600 hover:to-indigo-600 text-white font-bold py-5 px-6 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-2xl hover:shadow-3xl"
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

          {/* Progress indicator */}
          <div className="flex justify-center space-x-2 pt-4">
            <div className={`w-3 h-3 rounded-full transition-all duration-300 ${selectedSizes.length > 0 ? 'bg-rose-400' : 'bg-slate-200'}`}></div>
            <div className={`w-3 h-3 rounded-full transition-all duration-300 ${selectedFit ? 'bg-purple-400' : 'bg-slate-200'}`}></div>
            <div className={`w-3 h-3 rounded-full transition-all duration-300 ${selectedType ? 'bg-emerald-400' : 'bg-slate-200'}`}></div>
          </div>
        </div>
      </div>
    </div>
  );
}