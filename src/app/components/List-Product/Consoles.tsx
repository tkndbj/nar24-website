"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ConsolesStepProps, GenericStepResult } from "./stepComponentTypes";

export default function ConsolesStep({
  initialAttributes,
  onSave,
  onCancel,
}: ConsolesStepProps) {
  const t = useTranslations("consolesStep");

  // Console brands
  const consoleBrands = [
    "PlayStation",
    "Xbox",
    "Nintendo",
    "PC",
    "Mobile",
    "Retro",
  ];

  // Console variants for each brand
  const consoleVariants: { [key: string]: string[] } = {
    PlayStation: [
      "PS5",
      "PS5_Digital",
      "PS5_Slim",
      "PS5_Pro",
      "PS4",
      "PS4_Slim",
      "PS4_Pro",
      "PS3",
      "PS2",
      "PS1",
      "PSP",
      "PS_Vita",
    ],
    Xbox: [
      "Xbox_Series_X",
      "Xbox_Series_S",
      "Xbox_One_X",
      "Xbox_One_S",
      "Xbox_One",
      "Xbox_360",
      "Xbox_Original",
    ],
    Nintendo: [
      "Switch_OLED",
      "Switch_Standard",
      "Switch_Lite",
      "Wii_U",
      "Wii",
      "GameCube",
      "N64",
      "SNES",
      "NES",
      "3DS_XL",
      "3DS",
      "2DS",
      "DS_Lite",
      "DS",
      "Game_Boy_Advance",
      "Game_Boy_Color",
      "Game_Boy",
    ],
    PC: ["Steam_Deck", "Gaming_PC", "Gaming_Laptop", "Mini_PC"],
    Mobile: ["iOS", "Android", "Steam_Deck"],
    Retro: [
      "Atari_2600",
      "Sega_Genesis",
      "Sega_Dreamcast",
      "Neo_Geo",
      "Arcade_Cabinet",
    ],
  };

  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
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
      if (typeof initialAttributes.consoleBrand === "string") {
        setSelectedBrand(initialAttributes.consoleBrand);
      }
      if (typeof initialAttributes.consoleVariant === "string") {
        setSelectedVariant(initialAttributes.consoleVariant);
      }
    }
  }, [initialAttributes]);

  const localizedBrand = (raw: string): string => {
    return t(`brands.${raw}`, { fallback: raw });
  };

  const localizedVariant = (raw: string): string => {
    return t(`variants.${raw}`, { fallback: raw });
  };

  const handleSaveConsoleSelection = () => {
    if (!selectedBrand) {
      alert(t("pleaseSelectConsoleBrand"));
      return;
    }

    if (!selectedVariant) {
      alert(t("pleaseSelectConsoleVariant"));
      return;
    }

    // Return the console selection as dynamic attributes following the interface
    const result: GenericStepResult = {
      consoleBrand: selectedBrand,
      consoleVariant: selectedVariant,
    };

    // Include any existing attributes that were passed in
    if (initialAttributes) {
      Object.keys(initialAttributes).forEach((key) => {
        if (
          key !== "consoleBrand" &&
          key !== "consoleVariant" &&
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

  const handleBrandChange = (brand: string) => {
    setSelectedBrand(brand);
    setSelectedVariant(null); // Reset variant when brand changes
  };

  // Get icon for each brand
  const getBrandIcon = (brand: string) => {
    const iconMap: { [key: string]: string } = {
      PlayStation: "🎮",
      Xbox: "🎯",
      Nintendo: "🎪",
      PC: "💻",
      Mobile: "📱",
      Retro: "🕹️",
    };
    return iconMap[brand] || "🎮";
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
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center">
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
                  d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M19 10h1a2 2 0 012 2v1a2 2 0 01-2 2h-1m-6 0a2 2 0 102 2v1a2 2 0 01-2 2h-2a2 2 0 01-2-2v-1a2 2 0 102-2h2z"
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
          {/* Console Brand Section */}
          <div className={`rounded-lg shadow-lg border overflow-hidden ${isDarkMode ? "bg-gray-800/90 border-gray-700" : "bg-white/90 border-gray-200"}`}>
            <div className={`p-4 border-b ${isDarkMode ? "border-gray-700 bg-gray-700/50" : "border-purple-100/50 bg-gradient-to-r from-purple-50/50 to-indigo-50/50"}`}>
              <h2 className={`text-base font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                <div className="w-7 h-7 bg-gradient-to-r from-purple-400 to-indigo-400 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">🎮</span>
                </div>
                {t("selectConsoleBrand")}
              </h2>
              <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Choose your gaming platform
              </p>
            </div>

            <div className="p-3 space-y-2">
              {consoleBrands.map((brand) => {
                const isSelected = selectedBrand === brand;
                return (
                  <button
                    key={brand}
                    onClick={() => handleBrandChange(brand)}
                    className={`w-full group flex items-center justify-between p-3 rounded-lg border-2 transition-all text-sm ${
                      isSelected
                        ? "border-purple-400 bg-purple-50 dark:bg-purple-900/20"
                        : isDarkMode ? "border-gray-600 bg-gray-700 hover:border-purple-400" : "border-gray-200 bg-white hover:border-purple-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                          isSelected
                            ? "bg-gradient-to-r from-purple-400 to-indigo-400"
                            : isDarkMode ? "bg-gray-600" : "bg-gray-100"
                        }`}
                      >
                        <span className="text-lg">
                          {getBrandIcon(brand)}
                        </span>
                      </div>
                      <span
                        className={`font-medium ${
                          isSelected
                            ? "text-purple-700 dark:text-purple-400"
                            : isDarkMode ? "text-gray-200" : "text-gray-700"
                        }`}
                      >
                        {localizedBrand(brand)}
                      </span>
                    </div>
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

          {/* Console Variant Section */}
          {selectedBrand && (
            <div className={`rounded-lg shadow-lg border overflow-hidden animate-fadeIn ${isDarkMode ? "bg-gray-800/90 border-gray-700" : "bg-white/90 border-gray-200"}`}>
              <div className={`p-4 border-b ${isDarkMode ? "border-gray-700 bg-gray-700/50" : "border-indigo-100/50 bg-gradient-to-r from-indigo-50/50 to-blue-50/50"}`}>
                <h2 className={`text-base font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  <div className="w-7 h-7 bg-gradient-to-r from-indigo-400 to-blue-400 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm">🎯</span>
                  </div>
                  {t("selectConsoleVariant")}
                </h2>
                <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  Select your specific {localizedBrand(selectedBrand)} model
                </p>
              </div>

              <div className="p-3 space-y-2 max-h-80 overflow-y-auto">
                {(consoleVariants[selectedBrand] || []).map((variant) => {
                  const isSelected = selectedVariant === variant;
                  return (
                    <button
                      key={variant}
                      onClick={() => setSelectedVariant(variant)}
                      className={`w-full group flex items-center justify-between p-3 rounded-lg border-2 transition-all text-sm ${
                        isSelected
                          ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
                          : isDarkMode ? "border-gray-600 bg-gray-700 hover:border-indigo-400" : "border-gray-200 bg-white hover:border-indigo-300"
                      }`}
                    >
                      <span
                        className={`font-medium ${
                          isSelected
                            ? "text-indigo-700 dark:text-indigo-400"
                            : isDarkMode ? "text-gray-200" : "text-gray-700"
                        }`}
                      >
                        {localizedVariant(variant)}
                      </span>
                      <div
                        className={`w-5 h-5 rounded-full border-2 transition-all ${
                          isSelected
                            ? "bg-gradient-to-r from-indigo-500 to-blue-500 border-indigo-500"
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
          )}

          {/* Save Button */}
          <div className="pt-2">
            <button
              onClick={handleSaveConsoleSelection}
              disabled={!selectedBrand || !selectedVariant}
              className="w-full bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 hover:from-purple-600 hover:via-indigo-600 hover:to-blue-600 text-white font-bold py-3 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
            <div className={`w-2 h-2 rounded-full transition-all ${selectedBrand ? 'bg-purple-400' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`}></div>
            <div className={`w-2 h-2 rounded-full transition-all ${selectedVariant ? 'bg-indigo-400' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`}></div>
          </div>

          {/* Selection summary */}
          {selectedBrand && selectedVariant && (
            <div className={`mt-4 p-3 rounded-lg border ${isDarkMode ? "bg-purple-900/30 border-purple-800" : "bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200"}`}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-r from-purple-400 to-indigo-400 rounded-lg flex items-center justify-center">
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
                  <p className={`font-medium text-sm ${isDarkMode ? "text-purple-400" : "text-purple-700"}`}>Selected Console</p>
                  <p className={`text-xs ${isDarkMode ? "text-purple-500" : "text-purple-600"}`}>
                    {localizedBrand(selectedBrand)} - {localizedVariant(selectedVariant)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}