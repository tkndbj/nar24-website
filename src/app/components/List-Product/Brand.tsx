"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { globalBrands } from "@/constants/brands";
import { BrandStepProps, BrandStepResult } from "./stepComponentTypes";

export default function BrandStep({
  initialBrand,
  initialAttributes,
  onSave,
  onCancel,
}: BrandStepProps) {
  const t = useTranslations("brandStep");

  const [searchController, setSearchController] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [filteredBrands, setFilteredBrands] = useState<string[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualBrand, setManualBrand] = useState("");

  useEffect(() => {
    // Use the single global brands list for all categories
    // This provides access to all 3000+ brands regardless of category
    setBrands(globalBrands);
    setFilteredBrands(globalBrands);

    // Set initial brand
    setSelectedBrand(initialBrand || null);
  }, [initialBrand]);

  useEffect(() => {
    // Filter brands based on search
    if (searchController.trim() === "") {
      setFilteredBrands(brands);
    } else {
      const filtered = brands.filter((brand) =>
        brand.toLowerCase().includes(searchController.toLowerCase())
      );
      setFilteredBrands(filtered);
    }
  }, [searchController, brands]);

  const handleSelectBrand = (brand: string) => {
    setSelectedBrand(brand);

    // Create the result following the interface
    const result: BrandStepResult = {
      brand: brand,
    };

    // Include any existing attributes that were passed in
    if (initialAttributes) {
      Object.keys(initialAttributes).forEach((key) => {
        if (key !== "brand" && initialAttributes[key] !== undefined) {
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

  const handleManualBrandSubmit = () => {
    if (manualBrand.trim() && manualBrand.trim().length <= 40) {
      handleSelectBrand(manualBrand.trim());
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
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
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg">
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
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
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
      <div className="pt-20 min-h-screen">
        <div className="max-w-lg mx-auto px-4">
          {/* Toggle Buttons */}
          <div className="mb-6 flex bg-white/60 backdrop-blur-xl rounded-2xl p-1 shadow-lg">
            <button
              onClick={() => setShowManualInput(false)}
              className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all duration-300 ${
                !showManualInput
                  ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              {t("selectFromList") || "Select from List"}
            </button>
            <button
              onClick={() => setShowManualInput(true)}
              className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all duration-300 ${
                showManualInput
                  ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              {t("enterManually") || "Enter Manually"}
            </button>
          </div>

          {showManualInput ? (
            /* Manual Input Section */
            <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">
                {t("enterBrandName") || "Enter Brand Name"}
              </h3>
              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    value={manualBrand}
                    onChange={(e) => setManualBrand(e.target.value)}
                    placeholder={
                      t("brandNamePlaceholder") || "Type brand name here..."
                    }
                    maxLength={40}
                    className="w-full px-4 py-4 bg-white/70 backdrop-blur-sm border border-white/30 rounded-2xl text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent shadow-lg transition-all duration-300"
                  />
                  <div className="absolute right-3 top-4 text-sm text-slate-400">
                    {manualBrand.length}/40
                  </div>
                </div>
                <button
                  onClick={handleManualBrandSubmit}
                  disabled={!manualBrand.trim() || manualBrand.length > 40}
                  className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-slate-300 disabled:to-slate-400 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 disabled:cursor-not-allowed"
                >
                  {t("confirmBrand") || "Confirm Brand"}
                </button>
              </div>
            </div>
          ) : (
            /* Existing Brand List Section */
            <>
              {/* Enhanced Search Bar */}
              <div className="mb-8">
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-3xl blur opacity-20 group-hover:opacity-30 transition-opacity duration-300"></div>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchController}
                      onChange={(e) => setSearchController(e.target.value)}
                      placeholder={t("searchBrand")}
                      className="w-full px-6 py-4 pl-14 bg-white/70 backdrop-blur-sm border border-white/30 rounded-3xl text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent shadow-xl hover:shadow-2xl transition-all duration-300"
                    />
                    <div className="absolute left-5 top-1/2 transform -translate-y-1/2">
                      <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                        <svg
                          className="w-4 h-4 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Enhanced Brands List */}
              <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 overflow-hidden">
                <div className="max-h-[60vh] overflow-y-auto">
                  {filteredBrands.map((brand, index) => {
                    const isSelected = selectedBrand === brand;

                    return (
                      <div key={brand} className="group">
                        <button
                          onClick={() => handleSelectBrand(brand)}
                          className={`w-full flex items-center justify-between px-6 py-4 transition-all duration-300 ${
                            isSelected
                              ? "bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-l-4 border-purple-500"
                              : "hover:bg-gradient-to-r hover:from-slate-50 hover:to-blue-50/50"
                          }`}
                        >
                          <span
                            className={`text-left font-medium transition-colors duration-300 ${
                              isSelected
                                ? "text-purple-700 font-semibold"
                                : "text-slate-700 group-hover:text-slate-900"
                            }`}
                          >
                            {brand}
                          </span>
                          <div className="flex items-center">
                            <div
                              className={`relative w-6 h-6 rounded-xl border-2 transition-all duration-300 ${
                                isSelected
                                  ? "bg-gradient-to-r from-purple-500 to-pink-500 border-purple-500 shadow-lg"
                                  : "border-slate-300 group-hover:border-purple-400 bg-white"
                              }`}
                            >
                              {isSelected && (
                                <svg
                                  className="w-4 h-4 text-white absolute inset-0 m-auto"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              )}
                            </div>
                          </div>
                        </button>
                        {index < filteredBrands.length - 1 && (
                          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                        )}
                      </div>
                    );
                  })}

                  {filteredBrands.length === 0 &&
                    searchController.trim() !== "" && (
                      <div className="p-12 text-center">
                        <div className="w-20 h-20 bg-gradient-to-r from-slate-100 to-slate-200 rounded-3xl flex items-center justify-center mx-auto mb-4">
                          <svg
                            className="w-10 h-10 text-slate-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.291-1.1-5.7-2.836"
                            />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-700 mb-2">
                          {t("noBrandsFound")}
                        </h3>
                        <p className="text-sm text-slate-500 mb-4">
                          {t("tryDifferentSearch")}
                        </p>
                        <button
                          onClick={() => setShowManualInput(true)}
                          className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                        >
                          {t("addNewBrand") || "Add New Brand"}
                        </button>
                      </div>
                    )}
                </div>
              </div>
            </>
          )}

          {/* Floating action hint */}
          {selectedBrand && (
            <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-2xl shadow-xl animate-bounce">
              <div className="flex items-center gap-2">
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span className="font-medium">Brand selected!</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
