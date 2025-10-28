"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  KitchenAppliancesStepProps,
  GenericStepResult,
} from "./stepComponentTypes";

export default function KitchenAppliancesStep({
  initialAttributes,
  onSave,
  onCancel,
}: KitchenAppliancesStepProps) {
  const t = useTranslations("kitchenAppliancesStep");

  // raw appliance keys
  const applianceKeys = [
    "Microwave",
    "CoffeeMachine",
    "Blender",
    "FoodProcessor",
    "Mixer",
    "Toaster",
    "Kettle",
    "RiceCooker",
    "SlowCooker",
    "PressureCooker",
    "AirFryer",
    "Juicer",
    "Grinder",
    "Oven",
    "IceMaker",
    "WaterDispenser",
    "FoodDehydrator",
    "Steamer",
    "Grill",
    "SandwichMaker",
    "Waffle_Iron",
    "Deep_Fryer",
    "Bread_Maker",
    "Yogurt_Maker",
    "Ice_Cream_Maker",
    "Pasta_Maker",
    "Meat_Grinder",
    "Can_Opener",
    "Knife_Sharpener",
    "Scale",
    "Timer",
  ];

  const [selectedAppliance, setSelectedAppliance] = useState<string | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState("");
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
      typeof initialAttributes.kitchenAppliance === "string"
    ) {
      setSelectedAppliance(initialAttributes.kitchenAppliance);
    }
  }, [initialAttributes]);

  const localizedAppliance = (raw: string): string => {
    return t(`appliances.${raw}`, { fallback: raw });
  };

  const handleSaveKitchenAppliance = () => {
    if (!selectedAppliance) {
      alert(t("pleaseSelectKitchenAppliance"));
      return;
    }

    // Return the kitchen appliance as dynamic attributes following the interface
    const result: GenericStepResult = {
      kitchenAppliance: selectedAppliance,
    };

    // Include any existing attributes that were passed in
    if (initialAttributes) {
      Object.keys(initialAttributes).forEach((key) => {
        if (
          key !== "kitchenAppliance" &&
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

  // Get icon for each appliance
  const getApplianceIcon = (appliance: string) => {
    const iconMap: { [key: string]: string } = {
      Microwave: "📡",
      CoffeeMachine: "☕",
      Blender: "🌪️",
      FoodProcessor: "🔄",
      Mixer: "🥄",
      Toaster: "🍞",
      Kettle: "🫖",
      RiceCooker: "🍚",
      SlowCooker: "🍲",
      PressureCooker: "⚡",
      AirFryer: "🍟",
      Juicer: "🧃",
      Grinder: "⚙️",
      Oven: "🔥",
      IceMaker: "🧊",
      WaterDispenser: "💧",
      FoodDehydrator: "🌱",
      Steamer: "💨",
      Grill: "🔥",
      SandwichMaker: "🥪",
      Waffle_Iron: "🧇",
      Deep_Fryer: "🍤",
      Bread_Maker: "🥖",
      Yogurt_Maker: "🥛",
      Ice_Cream_Maker: "🍦",
      Pasta_Maker: "🍝",
      Meat_Grinder: "🥩",
      Can_Opener: "🥫",
      Knife_Sharpener: "🔪",
      Scale: "⚖️",
      Timer: "⏲️",
    };
    return iconMap[appliance] || "🍽️";
  };

  // Filter appliances based on search
  const filteredAppliances = applianceKeys.filter(appliance =>
    localizedAppliance(appliance).toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center shadow-lg">
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
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
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
          {/* Search Bar */}
          <div className="relative group">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search appliances..."
              className={`w-full px-4 py-3 pl-10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all duration-300 ${isDarkMode ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400" : "bg-white border-gray-200 text-gray-900 placeholder-gray-500"} border`}
            />
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
              <svg
                className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
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

          {/* Appliances Grid */}
          <div className={`backdrop-blur-xl rounded-lg shadow-lg border overflow-hidden ${isDarkMode ? "bg-gray-800/90 border-gray-700" : "bg-white/70 border-gray-200/50"}`}>
            <div className={`p-4 border-b ${isDarkMode ? "border-gray-700 bg-gray-700/50" : "border-orange-100/50 bg-gradient-to-r from-orange-50/50 to-red-50/50"}`}>
              <h3 className={`text-base font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                <div className="w-7 h-7 bg-gradient-to-r from-orange-400 to-red-400 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">🍽️</span>
                </div>
                Kitchen Appliances
              </h3>
              <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                {filteredAppliances.length} appliance{filteredAppliances.length !== 1 ? 's' : ''} available
              </p>
            </div>

            <div className="p-3 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                {filteredAppliances.map((appliance) => {
                  const isSelected = selectedAppliance === appliance;
                  return (
                    <button
                      key={appliance}
                      onClick={() => setSelectedAppliance(appliance)}
                      className={`relative group p-3 rounded-lg border-2 transition-all duration-300 text-sm ${
                        isSelected
                          ? isDarkMode ? "border-orange-400 bg-orange-900/20 shadow-lg" : "border-orange-400 bg-gradient-to-r from-orange-50 to-red-50 shadow-lg"
                          : isDarkMode ? "border-gray-600 bg-gray-700 hover:border-orange-300" : "border-gray-200 bg-white hover:border-orange-300 hover:shadow-md"
                      }`}
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                            isSelected
                              ? "bg-gradient-to-r from-orange-400 to-red-400 shadow-lg scale-110"
                              : "bg-gray-100 group-hover:bg-orange-100"
                          }`}
                        >
                          <span className="text-xl">
                            {getApplianceIcon(appliance)}
                          </span>
                        </div>
                        <span
                          className={`font-medium transition-colors duration-300 text-center ${
                            isSelected
                              ? isDarkMode ? "text-orange-400" : "text-orange-700"
                              : isDarkMode ? "text-gray-200 group-hover:text-orange-400" : "text-gray-700 group-hover:text-orange-600"
                          }`}
                        >
                          {localizedAppliance(appliance)}
                        </span>
                      </div>
                      {isSelected && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center shadow-lg">
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

              {filteredAppliances.length === 0 && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                    <svg
                      className="w-8 h-8 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">
                    No appliances found
                  </h3>
                  <p className="text-sm text-slate-500">
                    Try a different search term
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Enhanced Save Button */}
          <div className="pt-4">
            <button
              onClick={handleSaveKitchenAppliance}
              disabled={!selectedAppliance}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 hover:from-orange-600 hover:via-red-600 hover:to-pink-600 text-white font-bold py-5 px-6 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-2xl hover:shadow-3xl"
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
          {selectedAppliance && (
            <div className={`p-3 rounded-lg border ${isDarkMode ? "bg-orange-900/30 border-orange-800" : "bg-gradient-to-r from-orange-50 to-red-50 border-orange-200"}`}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gradient-to-r from-orange-400 to-red-400 rounded-lg flex items-center justify-center">
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
                  <p className={`font-medium text-sm ${isDarkMode ? "text-orange-400" : "text-orange-700"}`}>Selected Appliance</p>
                  <p className={`text-xs ${isDarkMode ? "text-orange-500" : "text-orange-600"}`}>
                    {getApplianceIcon(selectedAppliance)} {localizedAppliance(selectedAppliance)}
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