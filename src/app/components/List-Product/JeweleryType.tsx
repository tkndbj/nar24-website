"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { JeweleryTypeStepProps, GenericStepResult } from "./stepComponentTypes";

export default function JeweleryTypeStep({
  initialAttributes,
  onSave,
  onCancel,
}: JeweleryTypeStepProps) {
  const t = useTranslations("jewelryTypeStep");

  // raw type keys
  const typeKeys = [
    "Necklace",
    "Earring",
    "Piercing",
    "Ring",
    "Bracelet",
    "Anklet",
    "NoseRing",
    "Set",
  ];

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
    if (
      initialAttributes &&
      typeof initialAttributes.jewelryType === "string"
    ) {
      setSelectedType(initialAttributes.jewelryType);
    }
  }, [initialAttributes]);

  const localizedType = (raw: string): string => {
    return t(`types.${raw}`, { fallback: raw });
  };

  const handleSaveJewelryType = () => {
    if (!selectedType) {
      alert(t("pleaseSelectJewelryType"));
      return;
    }

    // Return the jewelry type as dynamic attributes following the interface
    const result: GenericStepResult = {
      jewelryType: selectedType,
    };

    // Include any existing attributes that were passed in
    if (initialAttributes) {
      Object.keys(initialAttributes).forEach((key) => {
        if (key !== "jewelryType" && initialAttributes[key] !== undefined) {
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

  // Get icon and styling for each jewelry type
  const getTypeInfo = (type: string) => {
    const typeMap: { [key: string]: { icon: string; color: string; bgColor: string; description: string } } = {
      Necklace: { 
        icon: "📿", 
        color: "from-purple-500 to-violet-500", 
        bgColor: "from-purple-50 to-violet-50",
        description: "Neck jewelry pieces"
      },
      Earring: { 
        icon: "💎", 
        color: "from-pink-500 to-rose-500", 
        bgColor: "from-pink-50 to-rose-50",
        description: "Ear jewelry accessories"
      },
      Piercing: { 
        icon: "⚡", 
        color: "from-indigo-500 to-blue-500", 
        bgColor: "from-indigo-50 to-blue-50",
        description: "Body piercing jewelry"
      },
      Ring: { 
        icon: "💍", 
        color: "from-yellow-500 to-amber-500", 
        bgColor: "from-yellow-50 to-amber-50",
        description: "Finger jewelry rings"
      },
      Bracelet: { 
        icon: "🔗", 
        color: "from-emerald-500 to-teal-500", 
        bgColor: "from-emerald-50 to-teal-50",
        description: "Wrist jewelry pieces"
      },
      Anklet: { 
        icon: "✨", 
        color: "from-cyan-500 to-blue-500", 
        bgColor: "from-cyan-50 to-blue-50",
        description: "Ankle jewelry accessories"
      },
      NoseRing: { 
        icon: "💫", 
        color: "from-red-500 to-pink-500", 
        bgColor: "from-red-50 to-pink-50",
        description: "Nose piercing jewelry"
      },
      Set: { 
        icon: "🎁", 
        color: "from-orange-500 to-red-500", 
        bgColor: "from-orange-50 to-red-50",
        description: "Complete jewelry sets"
      },
    };
    return typeMap[type] || { 
      icon: "💎", 
      color: "from-gray-500 to-slate-500", 
      bgColor: "from-gray-50 to-slate-50",
      description: "Jewelry piece"
    };
  };

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
            <div className="w-8 h-8 bg-gradient-to-r from-rose-500 to-pink-500 rounded-lg flex items-center justify-center shadow-lg">
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
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"
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
          {/* Jewelry Types Grid */}
          <div className={`backdrop-blur-xl rounded-lg shadow-lg border overflow-hidden ${isDarkMode ? "bg-gray-800/90 border-gray-700" : "bg-white/70 border-gray-200/50"}`}>
            <div className={`p-4 border-b ${isDarkMode ? "border-gray-700 bg-gray-700/50" : "border-rose-100/50 bg-gradient-to-r from-rose-50/50 to-pink-50/50"}`}>
              <h3 className={`text-base font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                <div className="w-7 h-7 bg-gradient-to-r from-rose-400 to-pink-400 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">💎</span>
                </div>
                Jewelry Categories
              </h3>
              <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Select the jewelry type that best describes your item
              </p>
            </div>

            <div className="p-3">
              <div className="grid grid-cols-2 gap-3">
                {typeKeys.map((type) => {
                  const isSelected = selectedType === type;
                  const typeInfo = getTypeInfo(type);
                  return (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className={`relative group p-3 rounded-lg border-2 transition-all duration-300 text-sm ${
                        isSelected
                          ? `border-opacity-100 ${isDarkMode ? "bg-rose-900/20" : `bg-gradient-to-r ${typeInfo.bgColor}`} shadow-lg`
                          : isDarkMode ? "border-gray-600 bg-gray-700 hover:border-rose-400" : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div
                          className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                            isSelected
                              ? `bg-gradient-to-r ${typeInfo.color} shadow-lg scale-110`
                              : "bg-gray-100 group-hover:bg-gray-200"
                          }`}
                        >
                          <span className="text-2xl">
                            {typeInfo.icon}
                          </span>
                        </div>
                        <div className="text-center">
                          <span
                            className={`font-semibold transition-colors duration-300 ${
                              isSelected
                                ? isDarkMode ? "text-rose-400" : "text-rose-700"
                                : isDarkMode ? "text-gray-200 group-hover:text-rose-400" : "text-gray-700 group-hover:text-rose-700"
                            }`}
                          >
                            {localizedType(type)}
                          </span>
                          <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                            {typeInfo.description}
                          </p>
                        </div>
                      </div>
                      {isSelected && (
                        <div className={`absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r ${typeInfo.color} rounded-full flex items-center justify-center shadow-lg`}>
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

          {/* Enhanced Save Button */}
          <div className="pt-4">
            <button
              onClick={handleSaveJewelryType}
              disabled={!selectedType}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-rose-500 via-pink-500 to-purple-500 hover:from-rose-600 hover:via-pink-600 hover:to-purple-600 text-white font-bold py-5 px-6 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-2xl hover:shadow-3xl"
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
          {selectedType && (
            <div className={`p-3 rounded-lg border ${isDarkMode ? "bg-rose-900/30 border-rose-800" : "bg-gradient-to-r from-rose-50 to-pink-50 border-rose-200"}`}>
              <div className="flex items-center gap-2">
                <div className={`w-6 h-6 bg-gradient-to-r ${getTypeInfo(selectedType).color} rounded-lg flex items-center justify-center`}>
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
                  <p className={`font-medium text-sm ${isDarkMode ? "text-rose-400" : "text-rose-700"}`}>Selected Type</p>
                  <p className={`text-xs ${isDarkMode ? "text-rose-500" : "text-rose-600"}`}>
                    {localizedType(selectedType)} - {getTypeInfo(selectedType).description}
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