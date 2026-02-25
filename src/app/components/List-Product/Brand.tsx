"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

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
    // Dynamically load the global brands list
    import("@/constants/brands").then((mod) => {
      setBrands(mod.globalBrands);
      setFilteredBrands(mod.globalBrands);
    });

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
    <div
      className={`min-h-screen ${
        isDarkMode
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
          : "bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50"
      }`}
    >
      {/* App Bar */}
      <div
        className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-lg border-b ${
          isDarkMode
            ? "bg-gray-900/90 border-gray-700"
            : "bg-white/90 border-gray-200"
        }`}
      >
        <div className="flex items-center px-4 py-3">
          <button
            onClick={onCancel}
            className={`p-2 mr-2 rounded-lg transition-colors ${
              isDarkMode
                ? "text-gray-300 hover:bg-gray-800"
                : "text-gray-700 hover:bg-gray-100"
            }`}
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
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
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
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
            </div>
            <h1
              className={`text-lg font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("title")}
            </h1>
          </div>
        </div>
      </div>

      {/* Content with proper top spacing */}
      <div className="pt-16 min-h-screen">
        <div className="max-w-lg mx-auto px-3">
          {/* Toggle Buttons */}
          <div
            className={`mb-4 flex rounded-lg p-1 ${
              isDarkMode ? "bg-gray-800" : "bg-white/80"
            }`}
          >
            <button
              onClick={() => setShowManualInput(false)}
              className={`flex-1 py-2 px-3 rounded-md font-medium transition-all text-sm ${
                !showManualInput
                  ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                  : isDarkMode
                  ? "text-gray-300"
                  : "text-gray-600"
              }`}
            >
              {t("selectFromList") || "Select from List"}
            </button>
            <button
              onClick={() => setShowManualInput(true)}
              className={`flex-1 py-2 px-3 rounded-md font-medium transition-all text-sm ${
                showManualInput
                  ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                  : isDarkMode
                  ? "text-gray-300"
                  : "text-gray-600"
              }`}
            >
              {t("enterManually") || "Enter Manually"}
            </button>
          </div>

          {showManualInput ? (
            /* Manual Input Section */
            <div
              className={`rounded-lg shadow-lg border p-4 ${
                isDarkMode
                  ? "bg-gray-800/90 border-gray-700"
                  : "bg-white/90 border-gray-200"
              }`}
            >
              <h3
                className={`text-base font-semibold mb-3 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("enterBrandName") || "Enter Brand Name"}
              </h3>
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    value={manualBrand}
                    onChange={(e) => setManualBrand(e.target.value)}
                    placeholder={
                      t("brandNamePlaceholder") || "Type brand name here..."
                    }
                    maxLength={40}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors ${
                      isDarkMode
                        ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                        : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                    }`}
                  />
                  <div
                    className={`absolute right-3 top-3 text-xs ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    {manualBrand.length}/40
                  </div>
                </div>
                <button
                  onClick={handleManualBrandSubmit}
                  disabled={!manualBrand.trim() || manualBrand.length > 40}
                  className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-lg transition-all disabled:cursor-not-allowed text-sm"
                >
                  {t("confirmBrand") || "Confirm Brand"}
                </button>
              </div>
            </div>
          ) : (
            /* Existing Brand List Section */
            <>
              {/* Search Bar */}
              <div className="mb-4">
                <div className="relative">
                  <input
                    type="text"
                    value={searchController}
                    onChange={(e) => setSearchController(e.target.value)}
                    placeholder={t("searchBrand")}
                    className={`w-full px-4 py-2.5 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors ${
                      isDarkMode
                        ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                        : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                    }`}
                  />
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                    <svg
                      className={`w-4 h-4 ${
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Brands List */}
              <div
                className={`rounded-lg shadow-lg border overflow-hidden ${
                  isDarkMode
                    ? "bg-gray-800/90 border-gray-700"
                    : "bg-white/90 border-gray-200"
                }`}
              >
                <div className="max-h-[60vh] overflow-y-auto">
                  {filteredBrands.map((brand, index) => {
                    const isSelected = selectedBrand === brand;

                    return (
                      <div key={brand} className="group">
                        <button
                          onClick={() => handleSelectBrand(brand)}
                          className={`w-full flex items-center justify-between px-4 py-3 transition-all text-sm ${
                            isSelected
                              ? "bg-purple-500/10 border-l-2 border-purple-500"
                              : isDarkMode
                              ? "hover:bg-gray-700"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          <span
                            className={`text-left font-medium ${
                              isSelected
                                ? "text-purple-600 dark:text-purple-400 font-semibold"
                                : isDarkMode
                                ? "text-gray-200"
                                : "text-gray-700"
                            }`}
                          >
                            {brand}
                          </span>
                          <div className="flex items-center">
                            <div
                              className={`relative w-5 h-5 rounded-md border-2 transition-all ${
                                isSelected
                                  ? "bg-gradient-to-r from-purple-500 to-pink-500 border-purple-500"
                                  : isDarkMode
                                  ? "border-gray-600 bg-gray-700"
                                  : "border-gray-300 bg-white"
                              }`}
                            >
                              {isSelected && (
                                <svg
                                  className="w-3 h-3 text-white absolute inset-0 m-auto"
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
                          <div
                            className={`h-px ${
                              isDarkMode ? "bg-gray-700" : "bg-gray-200"
                            }`}
                          />
                        )}
                      </div>
                    );
                  })}

                  {filteredBrands.length === 0 &&
                    searchController.trim() !== "" && (
                      <div className="p-8 text-center">
                        <div
                          className={`w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3 ${
                            isDarkMode ? "bg-gray-700" : "bg-gray-100"
                          }`}
                        >
                          <svg
                            className={`w-8 h-8 ${
                              isDarkMode ? "text-gray-500" : "text-gray-400"
                            }`}
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
                        <h3
                          className={`text-base font-semibold mb-2 ${
                            isDarkMode ? "text-gray-200" : "text-gray-900"
                          }`}
                        >
                          {t("noBrandsFound")}
                        </h3>
                        <p
                          className={`text-sm mb-3 ${
                            isDarkMode ? "text-gray-400" : "text-gray-600"
                          }`}
                        >
                          {t("tryDifferentSearch")}
                        </p>
                        <button
                          onClick={() => setShowManualInput(true)}
                          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-lg text-sm"
                        >
                          {t("addNewBrand") || "Add New Brand"}
                        </button>
                      </div>
                    )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
