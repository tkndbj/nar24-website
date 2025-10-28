"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  GenericStepResult,
} from "./stepComponentTypes";

// Define the props interface
interface FantasyWearStepProps {
    initialAttributes?: { [key: string]: unknown };
    onSave: (result: GenericStepResult) => void;
    onCancel: () => void;
    category?: string;        // ✅ Add these
    subcategory?: string;     // ✅ Add these
    subsubcategory?: string;  // ✅ Add these
  }

export default function FantasyWearStep({
  initialAttributes,
  onSave,
  onCancel,
}: FantasyWearStepProps) {
  const t = useTranslations("fantasyWearStep");

  // Raw fantasy wear type keys
  const fantasyWearTypes = [
    "Lingerie",
    "Babydoll",
    "Chemise",
    "Teddy",
    "Bodysuit",
    "Corset",
    "Bustier",
    "Garter",
    "Robe",
    "Kimono",
    "Costume",
    "RolePlay",
    "Sleepwear",
    "Other",
  ];

  const [selectedType, setSelectedType] = useState<string | null>(null);

  useEffect(() => {
    // Load from dynamic attributes if provided
    if (
      initialAttributes &&
      typeof initialAttributes.fantasyWearType === "string"
    ) {
      setSelectedType(initialAttributes.fantasyWearType);
    }
  }, [initialAttributes]);

  const localizedType = (raw: string): string => {
    return t(`types.${raw}`, { fallback: raw });
  };

  const handleSaveFantasyWear = () => {
    if (!selectedType) {
      alert(t("pleaseSelectFantasyWearType"));
      return;
    }

    // Return the fantasy wear type as dynamic attributes following the interface
    const result: GenericStepResult = {
      fantasyWearType: selectedType,
    };

    // Include any existing attributes that were passed in
    if (initialAttributes) {
      Object.keys(initialAttributes).forEach((key) => {
        if (
          key !== "fantasyWearType" &&
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

  // Get icon for each fantasy wear type
  const getFantasyWearIcon = (type: string) => {
    const iconMap: { [key: string]: string } = {
      Lingerie: "👙",
      Babydoll: "💃",
      Chemise: "👗",
      Teddy: "🧸",
      Bodysuit: "🩱",
      Corset: "🎀",
      Bustier: "💎",
      Garter: "🎗️",
      Robe: "🥻",
      Kimono: "👘",
      Costume: "🎭",
      RolePlay: "🎪",
      Sleepwear: "🌙",
      Other: "✨",
    };
    return iconMap[type] || "💫";
  };

  // Get color scheme for each type
  const getColorScheme = (type: string, isSelected: boolean) => {
    const colorMap: { [key: string]: { border: string; bg: string; text: string; icon: string } } = {
      Lingerie: {
        border: isSelected ? "border-pink-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-pink-50 to-rose-50" : "bg-white",
        text: isSelected ? "text-pink-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-pink-400 to-rose-400" : "bg-gray-100",
      },
      Babydoll: {
        border: isSelected ? "border-purple-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-purple-50 to-pink-50" : "bg-white",
        text: isSelected ? "text-purple-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-purple-400 to-pink-400" : "bg-gray-100",
      },
      Chemise: {
        border: isSelected ? "border-rose-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-rose-50 to-pink-50" : "bg-white",
        text: isSelected ? "text-rose-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-rose-400 to-pink-400" : "bg-gray-100",
      },
      Teddy: {
        border: isSelected ? "border-fuchsia-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-fuchsia-50 to-purple-50" : "bg-white",
        text: isSelected ? "text-fuchsia-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-fuchsia-400 to-purple-400" : "bg-gray-100",
      },
      Bodysuit: {
        border: isSelected ? "border-violet-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-violet-50 to-purple-50" : "bg-white",
        text: isSelected ? "text-violet-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-violet-400 to-purple-400" : "bg-gray-100",
      },
      Corset: {
        border: isSelected ? "border-red-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-red-50 to-rose-50" : "bg-white",
        text: isSelected ? "text-red-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-red-400 to-rose-400" : "bg-gray-100",
      },
      Bustier: {
        border: isSelected ? "border-pink-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-pink-50 to-fuchsia-50" : "bg-white",
        text: isSelected ? "text-pink-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-pink-400 to-fuchsia-400" : "bg-gray-100",
      },
      Garter: {
        border: isSelected ? "border-rose-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-rose-50 to-red-50" : "bg-white",
        text: isSelected ? "text-rose-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-rose-400 to-red-400" : "bg-gray-100",
      },
      Robe: {
        border: isSelected ? "border-purple-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-purple-50 to-violet-50" : "bg-white",
        text: isSelected ? "text-purple-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-purple-400 to-violet-400" : "bg-gray-100",
      },
      Kimono: {
        border: isSelected ? "border-indigo-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-indigo-50 to-purple-50" : "bg-white",
        text: isSelected ? "text-indigo-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-indigo-400 to-purple-400" : "bg-gray-100",
      },
      Costume: {
        border: isSelected ? "border-fuchsia-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-fuchsia-50 to-pink-50" : "bg-white",
        text: isSelected ? "text-fuchsia-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-fuchsia-400 to-pink-400" : "bg-gray-100",
      },
      RolePlay: {
        border: isSelected ? "border-purple-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-purple-50 to-fuchsia-50" : "bg-white",
        text: isSelected ? "text-purple-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-purple-400 to-fuchsia-400" : "bg-gray-100",
      },
      Sleepwear: {
        border: isSelected ? "border-blue-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-blue-50 to-indigo-50" : "bg-white",
        text: isSelected ? "text-blue-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-blue-400 to-indigo-400" : "bg-gray-100",
      },
      Other: {
        border: isSelected ? "border-violet-400" : "border-gray-200",
        bg: isSelected ? "bg-gradient-to-r from-violet-50 to-purple-50" : "bg-white",
        text: isSelected ? "text-violet-700" : "text-slate-700",
        icon: isSelected ? "bg-gradient-to-r from-violet-400 to-purple-400" : "bg-gray-100",
      },
    };
    return colorMap[type] || colorMap.Other;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-fuchsia-50">
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
            <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
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
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
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
            <div className="w-16 h-16 bg-gradient-to-r from-pink-100 to-purple-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✨</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              {t("selectFantasyWearType")}
            </h2>
            <p className="text-slate-600">
              {t("description")}
            </p>
          </div>

          {/* Fantasy Wear Types Grid */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 overflow-hidden mb-8">
            <div className="p-6 space-y-3">
              {fantasyWearTypes.map((type) => {
                const isSelected = selectedType === type;
                const colors = getColorScheme(type, isSelected);
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedType(type)}
                    className={`w-full group flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-300 transform hover:scale-[1.02] ${colors.border} ${colors.bg} ${
                      isSelected
                        ? "shadow-lg"
                        : "hover:border-pink-300 hover:bg-pink-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${colors.icon} ${
                          isSelected
                            ? "shadow-lg scale-110"
                            : "group-hover:bg-pink-100"
                        }`}
                      >
                        <span className="text-xl">
                          {getFantasyWearIcon(type)}
                        </span>
                      </div>
                      <span
                        className={`font-medium transition-colors duration-300 ${colors.text} ${
                          !isSelected && "group-hover:text-pink-600"
                        }`}
                      >
                        {localizedType(type)}
                      </span>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border-2 transition-all duration-300 ${
                        isSelected
                          ? "bg-gradient-to-r from-pink-500 to-purple-500 border-pink-500"
                          : "border-gray-300 group-hover:border-pink-400"
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
              onClick={handleSaveFantasyWear}
              disabled={!selectedType}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-pink-500 via-purple-500 to-fuchsia-500 hover:from-pink-600 hover:via-purple-600 hover:to-fuchsia-600 text-white font-bold py-5 px-6 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-2xl hover:shadow-3xl"
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

          {/* Selection indicator */}
          {selectedType && (
            <div className="mt-6 p-4 bg-gradient-to-r from-pink-50 to-purple-50 rounded-2xl border border-pink-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-pink-400 to-purple-400 rounded-xl flex items-center justify-center">
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
                  <p className="font-medium text-pink-700">{t("selectedType")}</p>
                  <p className="text-sm text-pink-600">
                    {localizedType(selectedType)}
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