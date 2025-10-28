"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { GenderStepProps, GenericStepResult } from "./stepComponentTypes";

export default function GenderStep({
  initialAttributes,
  onSave,
  onCancel,
}: GenderStepProps) {
  const t = useTranslations("genderStep");

  const [selectedGender, setSelectedGender] = useState<string | null>(null);
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

  // Available gender options matching the original component
  const genderOptions = [
    { 
      key: "Women", 
      label: t("women", { fallback: "Women" }),
      icon: "👩",
      color: "from-pink-500 to-rose-500",
      bgColor: "from-pink-50 to-rose-50"
    },
    { 
      key: "Men", 
      label: t("men", { fallback: "Men" }),
      icon: "👨",
      color: "from-blue-500 to-indigo-500",
      bgColor: "from-blue-50 to-indigo-50"
    },
    { 
      key: "Unisex", 
      label: t("unisex", { fallback: "Unisex" }),
      icon: "👫",
      color: "from-purple-500 to-violet-500",
      bgColor: "from-purple-50 to-violet-50"
    },
  ];

  useEffect(() => {
    // Load from dynamic attributes if provided
    if (initialAttributes && typeof initialAttributes.gender === "string") {
      setSelectedGender(initialAttributes.gender);
    }
  }, [initialAttributes]);

  const handleSelectGender = (gender: string) => {
    setSelectedGender(gender);

    // Create the result following the interface
    const result: GenericStepResult = {
      gender: gender,
    };

    // Include any existing attributes that were passed in
    if (initialAttributes) {
      Object.keys(initialAttributes).forEach((key) => {
        if (key !== "gender" && initialAttributes[key] !== undefined) {
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
            <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
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
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                />
              </svg>
            </div>
            <h1 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {t("title", { fallback: "Select Gender" })}
            </h1>
          </div>
        </div>
      </div>

      {/* Content with proper top spacing */}
      <div className="pt-16 min-h-screen px-3 pb-6">
        <div className="max-w-lg mx-auto">
          {/* Header section */}
          <div className="mb-4 text-center">
            <div className={`w-14 h-14 rounded-lg flex items-center justify-center mx-auto mb-3 ${isDarkMode ? "bg-emerald-900/30" : "bg-gradient-to-r from-emerald-100 to-teal-100"}`}>
              <span className="text-2xl">🎯</span>
            </div>
            <h2 className={`text-lg font-bold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {t("selectGender", { fallback: "Select Gender" })}
            </h2>
            <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              Choose the target gender for your product
            </p>
          </div>

          {/* Gender Options */}
          <div className={`rounded-lg shadow-lg border overflow-hidden mb-6 ${isDarkMode ? "bg-gray-800/90 border-gray-700" : "bg-white/90 border-gray-200"}`}>
            <div className="p-4 space-y-3">
              {genderOptions.map((option) => {
                const isSelected = selectedGender === option.key;
                return (
                  <button
                    key={option.key}
                    onClick={() => handleSelectGender(option.key)}
                    className={`w-full group flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                      isSelected
                        ? `border-opacity-100 ${isDarkMode ? "bg-opacity-10" : `bg-gradient-to-r ${option.bgColor}`} border-${option.color.split('-')[1]}-500`
                        : isDarkMode ? "border-gray-700 bg-gray-700/50 hover:border-gray-600" : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-12 h-12 rounded-lg flex items-center justify-center transition-all ${
                          isSelected
                            ? `bg-gradient-to-r ${option.color}`
                            : isDarkMode ? "bg-gray-600" : "bg-gray-100"
                        }`}
                      >
                        <span className="text-xl">
                          {isSelected ? "✨" : option.icon}
                        </span>
                      </div>
                      <div className="text-left">
                        <span
                          className={`font-bold text-base transition-colors ${
                            isSelected
                              ? isDarkMode ? "text-white" : "text-gray-900"
                              : isDarkMode ? "text-gray-200" : "text-gray-700"
                          }`}
                        >
                          {option.label}
                        </span>
                        <p className={`text-xs mt-0.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                          {option.key === "Women" && "Products for women"}
                          {option.key === "Men" && "Products for men"}
                          {option.key === "Unisex" && "Products for everyone"}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        isSelected
                          ? `bg-gradient-to-r ${option.color} border-transparent`
                          : isDarkMode ? "border-gray-600" : "border-gray-300"
                      } flex items-center justify-center`}
                    >
                      {isSelected && (
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
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selection confirmation */}
          {selectedGender && (
            <div className="text-center">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${isDarkMode ? "bg-emerald-900/30 border-emerald-800" : "bg-gradient-to-r from-emerald-100 to-teal-100 border-emerald-200"}`}>
                <div className="w-6 h-6 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
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
                  <p className={`font-medium text-sm ${isDarkMode ? "text-emerald-400" : "text-emerald-700"}`}>Gender Selected</p>
                  <p className={`text-xs ${isDarkMode ? "text-emerald-500" : "text-emerald-600"}`}>
                    {genderOptions.find(opt => opt.key === selectedGender)?.label}
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