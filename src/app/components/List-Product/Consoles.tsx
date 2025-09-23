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
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg">
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
                  d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M19 10h1a2 2 0 012 2v1a2 2 0 01-2 2h-1m-6 0a2 2 0 102 2v1a2 2 0 01-2 2h-2a2 2 0 01-2-2v-1a2 2 0 102-2h2z"
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
          {/* Console Brand Section */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden">
            <div className="p-6 border-b border-purple-100/50 bg-gradient-to-r from-purple-50/50 to-indigo-50/50">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-indigo-400 rounded-xl flex items-center justify-center">
                  <span className="text-white text-sm">🎮</span>
                </div>
                {t("selectConsoleBrand")}
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                Choose your gaming platform
              </p>
            </div>

            <div className="p-6 space-y-3">
              {consoleBrands.map((brand) => {
                const isSelected = selectedBrand === brand;
                return (
                  <button
                    key={brand}
                    onClick={() => handleBrandChange(brand)}
                    className={`w-full group flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-300 transform hover:scale-[1.02] ${
                      isSelected
                        ? "border-purple-400 bg-gradient-to-r from-purple-50 to-indigo-50 shadow-lg"
                        : "border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                          isSelected
                            ? "bg-gradient-to-r from-purple-400 to-indigo-400 shadow-lg scale-110"
                            : "bg-gray-100 group-hover:bg-purple-100"
                        }`}
                      >
                        <span className="text-xl">
                          {getBrandIcon(brand)}
                        </span>
                      </div>
                      <span
                        className={`font-medium transition-colors duration-300 ${
                          isSelected
                            ? "text-purple-700"
                            : "text-slate-700 group-hover:text-purple-600"
                        }`}
                      >
                        {localizedBrand(brand)}
                      </span>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border-2 transition-all duration-300 ${
                        isSelected
                          ? "bg-gradient-to-r from-purple-500 to-indigo-500 border-purple-500"
                          : "border-gray-300 group-hover:border-purple-400"
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

          {/* Console Variant Section */}
          {selectedBrand && (
            <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden animate-fadeIn">
              <div className="p-6 border-b border-indigo-100/50 bg-gradient-to-r from-indigo-50/50 to-blue-50/50">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-indigo-400 to-blue-400 rounded-xl flex items-center justify-center">
                    <span className="text-white text-sm">🎯</span>
                  </div>
                  {t("selectConsoleVariant")}
                </h2>
                <p className="text-sm text-slate-600 mt-2">
                  Select your specific {localizedBrand(selectedBrand)} model
                </p>
              </div>

              <div className="p-6 space-y-3 max-h-80 overflow-y-auto">
                {(consoleVariants[selectedBrand] || []).map((variant) => {
                  const isSelected = selectedVariant === variant;
                  return (
                    <button
                      key={variant}
                      onClick={() => setSelectedVariant(variant)}
                      className={`w-full group flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-300 transform hover:scale-[1.02] ${
                        isSelected
                          ? "border-indigo-400 bg-gradient-to-r from-indigo-50 to-blue-50 shadow-lg"
                          : "border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50"
                      }`}
                    >
                      <span
                        className={`font-medium transition-colors duration-300 ${
                          isSelected
                            ? "text-indigo-700"
                            : "text-slate-700 group-hover:text-indigo-600"
                        }`}
                      >
                        {localizedVariant(variant)}
                      </span>
                      <div
                        className={`w-6 h-6 rounded-full border-2 transition-all duration-300 ${
                          isSelected
                            ? "bg-gradient-to-r from-indigo-500 to-blue-500 border-indigo-500"
                            : "border-gray-300 group-hover:border-indigo-400"
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
          )}

          {/* Enhanced Save Button */}
          <div className="pt-4">
            <button
              onClick={handleSaveConsoleSelection}
              disabled={!selectedBrand || !selectedVariant}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 hover:from-purple-600 hover:via-indigo-600 hover:to-blue-600 text-white font-bold py-5 px-6 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-2xl hover:shadow-3xl"
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
            <div className={`w-3 h-3 rounded-full transition-all duration-300 ${selectedBrand ? 'bg-purple-400' : 'bg-gray-200'}`}></div>
            <div className={`w-3 h-3 rounded-full transition-all duration-300 ${selectedVariant ? 'bg-indigo-400' : 'bg-gray-200'}`}></div>
          </div>

          {/* Selection summary */}
          {selectedBrand && selectedVariant && (
            <div className="mt-6 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-2xl border border-purple-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-indigo-400 rounded-xl flex items-center justify-center">
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
                  <p className="font-medium text-purple-700">Selected Console</p>
                  <p className="text-sm text-purple-600">
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