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
            <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg">
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
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
              {t("title", { fallback: "Select Gender" })}
            </h1>
          </div>
        </div>
      </div>

      {/* Content with proper top spacing */}
      <div className="pt-20 min-h-screen px-4 pb-8">
        <div className="max-w-lg mx-auto">
          {/* Header section */}
          <div className="mb-8 text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-emerald-100 to-teal-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🎯</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              {t("selectGender", { fallback: "Select Gender" })}
            </h2>
            <p className="text-slate-600">
              Choose the target gender for your product
            </p>
          </div>

          {/* Gender Options */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden mb-8">
            <div className="p-6 space-y-4">
              {genderOptions.map((option) => {
                const isSelected = selectedGender === option.key;
                return (
                  <button
                    key={option.key}
                    onClick={() => handleSelectGender(option.key)}
                    className={`w-full group flex items-center justify-between p-6 rounded-2xl border-2 transition-all duration-300 transform hover:scale-[1.02] ${
                      isSelected
                        ? `border-opacity-100 bg-gradient-to-r ${option.bgColor} shadow-lg`
                        : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all duration-300 ${
                          isSelected
                            ? `bg-gradient-to-r ${option.color} shadow-lg scale-110`
                            : "bg-gray-100 group-hover:bg-gray-200"
                        }`}
                      >
                        <span className="text-2xl">
                          {isSelected ? "✨" : option.icon}
                        </span>
                      </div>
                      <div className="text-left">
                        <span
                          className={`font-bold text-lg transition-colors duration-300 ${
                            isSelected
                              ? "text-slate-800"
                              : "text-slate-700 group-hover:text-slate-800"
                          }`}
                        >
                          {option.label}
                        </span>
                        <p className="text-sm text-slate-500 mt-1">
                          {option.key === "Women" && "Products for women"}
                          {option.key === "Men" && "Products for men"}
                          {option.key === "Unisex" && "Products for everyone"}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`w-8 h-8 rounded-full border-2 transition-all duration-300 ${
                        isSelected
                          ? `bg-gradient-to-r ${option.color} border-transparent`
                          : "border-gray-300 group-hover:border-gray-400"
                      } flex items-center justify-center`}
                    >
                      {isSelected && (
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
              <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-emerald-100 to-teal-100 rounded-2xl border border-emerald-200">
                <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
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
                  <p className="font-medium text-emerald-700">Gender Selected</p>
                  <p className="text-sm text-emerald-600">
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