"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { WhiteGoodsStepProps, GenericStepResult } from "./stepComponentTypes";

export default function WhiteGoodsStep({
  initialAttributes,
  onSave,
  onCancel,
}: WhiteGoodsStepProps) {
  const t = useTranslations("whiteGoodsStep");

  // white goods appliance keys
  const whiteGoodsKeys = [
    "Refrigerator",
    "WashingMachine",
    "Dishwasher",
    "Dryer",
    "Freezer",
  ];

  const [selectedWhiteGood, setSelectedWhiteGood] = useState<string | null>(
    null
  );

  useEffect(() => {
    // Load from dynamic attributes if provided
    if (initialAttributes && typeof initialAttributes.whiteGood === "string") {
      setSelectedWhiteGood(initialAttributes.whiteGood);
    }
  }, [initialAttributes]);

  const localizedWhiteGood = (raw: string): string => {
    return t(`whiteGoods.${raw}`, { fallback: raw });
  };

  const handleSaveWhiteGood = () => {
    if (!selectedWhiteGood) {
      alert(t("pleaseSelectWhiteGood"));
      return;
    }

    // Return the white good as dynamic attributes following the interface
    const result: GenericStepResult = {
      whiteGood: selectedWhiteGood,
    };

    // Include any existing attributes that were passed in
    if (initialAttributes) {
      Object.keys(initialAttributes).forEach((key) => {
        if (key !== "whiteGood" && initialAttributes[key] !== undefined) {
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

  // Get icon and styling for each white good
  const getWhiteGoodInfo = (whiteGood: string) => {
    const whiteGoodMap: { [key: string]: { icon: string; color: string; bgColor: string; description: string } } = {
      Refrigerator: { 
        icon: "🧊", 
        color: "from-blue-500 to-cyan-500", 
        bgColor: "from-blue-50 to-cyan-50",
        description: "Keep food fresh and cold"
      },
      WashingMachine: { 
        icon: "🌀", 
        color: "from-indigo-500 to-blue-500", 
        bgColor: "from-indigo-50 to-blue-50",
        description: "Clean clothes efficiently"
      },
      Dishwasher: { 
        icon: "🍽️", 
        color: "from-green-500 to-emerald-500", 
        bgColor: "from-green-50 to-emerald-50",
        description: "Automated dish cleaning"
      },
      Dryer: { 
        icon: "🔥", 
        color: "from-orange-500 to-red-500", 
        bgColor: "from-orange-50 to-red-50",
        description: "Dry clothes quickly"
      },
      Freezer: { 
        icon: "❄️", 
        color: "from-cyan-500 to-blue-500", 
        bgColor: "from-cyan-50 to-blue-50",
        description: "Long-term food storage"
      },
    };
    return whiteGoodMap[whiteGood] || { 
      icon: "🏠", 
      color: "from-gray-500 to-slate-500", 
      bgColor: "from-gray-50 to-slate-50",
      description: "Home appliance"
    };
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
            <div className="w-10 h-10 bg-gradient-to-r from-slate-500 to-gray-500 rounded-2xl flex items-center justify-center shadow-lg">
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
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2zm0 0V9a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"
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
            <div className="w-16 h-16 bg-gradient-to-r from-slate-100 to-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🏠</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              {t("selectWhiteGoodType")}
            </h2>
            <p className="text-slate-600">
              Choose the major appliance you&apos;re selling
            </p>
          </div>

          {/* White Goods Grid */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden mb-8">
            <div className="p-6 border-b border-slate-100/50 bg-gradient-to-r from-slate-50/50 to-gray-50/50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-slate-400 to-gray-400 rounded-xl flex items-center justify-center">
                  <span className="text-white text-sm">🏠</span>
                </div>
                White Goods & Major Appliances
              </h3>
              <p className="text-sm text-slate-600 mt-2">
                Large household appliances
              </p>
            </div>
            
            <div className="p-6">
              <div className="space-y-4">
                {whiteGoodsKeys.map((whiteGood) => {
                  const isSelected = selectedWhiteGood === whiteGood;
                  const whiteGoodInfo = getWhiteGoodInfo(whiteGood);
                  return (
                    <button
                      key={whiteGood}
                      onClick={() => setSelectedWhiteGood(whiteGood)}
                      className={`w-full group flex items-center justify-between p-6 rounded-2xl border-2 transition-all duration-300 transform hover:scale-[1.02] ${
                        isSelected
                          ? `border-opacity-100 bg-gradient-to-r ${whiteGoodInfo.bgColor} shadow-lg`
                          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-16 h-16 rounded-3xl flex items-center justify-center transition-all duration-300 ${
                            isSelected
                              ? `bg-gradient-to-r ${whiteGoodInfo.color} shadow-lg scale-110`
                              : "bg-gray-100 group-hover:bg-gray-200"
                          }`}
                        >
                          <span className="text-2xl">
                            {whiteGoodInfo.icon}
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
                            {localizedWhiteGood(whiteGood)}
                          </span>
                          <p className="text-sm text-slate-500 mt-1">
                            {whiteGoodInfo.description}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`w-8 h-8 rounded-full border-2 transition-all duration-300 ${
                          isSelected
                            ? `bg-gradient-to-r ${whiteGoodInfo.color} border-transparent`
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
          </div>

          {/* Appliance Info */}
          <div className="mb-6 p-4 bg-gradient-to-r from-slate-50 to-gray-50 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-r from-slate-400 to-gray-400 rounded-xl flex items-center justify-center">
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
                <p className="font-medium text-slate-700">White Goods</p>
                <p className="text-sm text-slate-600">
                  Large household appliances that are typically white in color
                </p>
              </div>
            </div>
          </div>

          {/* Enhanced Save Button */}
          <div className="pt-4">
            <button
              onClick={handleSaveWhiteGood}
              disabled={!selectedWhiteGood}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-slate-500 via-gray-500 to-slate-600 hover:from-slate-600 hover:via-gray-600 hover:to-slate-700 text-white font-bold py-5 px-6 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-2xl hover:shadow-3xl"
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
          {selectedWhiteGood && (
            <div className="mt-6 p-4 bg-gradient-to-r from-slate-50 to-gray-50 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 bg-gradient-to-r ${getWhiteGoodInfo(selectedWhiteGood).color} rounded-xl flex items-center justify-center`}>
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
                  <p className="font-medium text-slate-700">Selected Appliance</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-lg">{getWhiteGoodInfo(selectedWhiteGood).icon}</span>
                    <span className="text-sm text-slate-600">
                      {localizedWhiteGood(selectedWhiteGood)} - {getWhiteGoodInfo(selectedWhiteGood).description}
                    </span>
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