"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  ComputerComponentsStepProps,
  GenericStepResult,
} from "./stepComponentTypes";

export default function ComputerComponentsStep({
  initialAttributes,
  onSave,
  onCancel,
}: ComputerComponentsStepProps) {
  const t = useTranslations("computerComponentsStep");

  // raw component keys
  const componentKeys = [
    "CPU",
    "GPU",
    "RAM",
    "Motherboard",
    "SSD",
    "HDD",
    "PowerSupply",
    "CoolingSystem",
    "Case",
    "OpticalDrive",
    "NetworkCard",
    "SoundCard",
    "Webcam",
  ];

  const [selectedComponent, setSelectedComponent] = useState<string | null>(
    null
  );

  useEffect(() => {
    // Load from dynamic attributes if provided
    if (
      initialAttributes &&
      typeof initialAttributes.computerComponent === "string"
    ) {
      setSelectedComponent(initialAttributes.computerComponent);
    }
  }, [initialAttributes]);

  const localizedComponent = (raw: string): string => {
    return t(`components.${raw}`, { fallback: raw });
  };

  const handleSaveComputerComponent = () => {
    if (!selectedComponent) {
      alert(t("pleaseSelectComputerComponent"));
      return;
    }

    // Return the computer component as dynamic attributes following the interface
    const result: GenericStepResult = {
      computerComponent: selectedComponent,
    };

    // Include any existing attributes that were passed in
    if (initialAttributes) {
      Object.keys(initialAttributes).forEach((key) => {
        if (
          key !== "computerComponent" &&
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

  // Get icon for each component
  const getComponentIcon = (component: string) => {
    const iconMap: { [key: string]: string } = {
      CPU: "🖥️",
      GPU: "🎮",
      RAM: "💾",
      Motherboard: "🔌",
      SSD: "💿",
      HDD: "💽",
      PowerSupply: "⚡",
      CoolingSystem: "❄️",
      Case: "📦",
      OpticalDrive: "💿",
      NetworkCard: "🌐",
      SoundCard: "🔊",
      Webcam: "📹",
    };
    return iconMap[component] || "🔧";
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
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg">
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
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
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
            <div className="w-16 h-16 bg-gradient-to-r from-blue-100 to-cyan-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">💻</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              {t("selectComponentType")}
            </h2>
            <p className="text-slate-600">
              Choose the type of computer component you&apos;re selling
            </p>
          </div>

          {/* Components Grid */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden mb-8">
            <div className="p-6 space-y-3">
              {componentKeys.map((component) => {
                const isSelected = selectedComponent === component;
                return (
                  <button
                    key={component}
                    onClick={() => setSelectedComponent(component)}
                    className={`w-full group flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-300 transform hover:scale-[1.02] ${
                      isSelected
                        ? "border-blue-400 bg-gradient-to-r from-blue-50 to-cyan-50 shadow-lg"
                        : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                          isSelected
                            ? "bg-gradient-to-r from-blue-400 to-cyan-400 shadow-lg scale-110"
                            : "bg-gray-100 group-hover:bg-blue-100"
                        }`}
                      >
                        <span className="text-xl">
                          {getComponentIcon(component)}
                        </span>
                      </div>
                      <span
                        className={`font-medium transition-colors duration-300 ${
                          isSelected
                            ? "text-blue-700"
                            : "text-slate-700 group-hover:text-blue-600"
                        }`}
                      >
                        {localizedComponent(component)}
                      </span>
                    </div>
                    <div
                      className={`w-6 h-6 rounded-full border-2 transition-all duration-300 ${
                        isSelected
                          ? "bg-gradient-to-r from-blue-500 to-cyan-500 border-blue-500"
                          : "border-gray-300 group-hover:border-blue-400"
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
              onClick={handleSaveComputerComponent}
              disabled={!selectedComponent}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 hover:from-blue-600 hover:via-cyan-600 hover:to-teal-600 text-white font-bold py-5 px-6 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-2xl hover:shadow-3xl"
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
          {selectedComponent && (
            <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-2xl border border-blue-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-400 to-cyan-400 rounded-xl flex items-center justify-center">
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
                  <p className="font-medium text-blue-700">Selected Component</p>
                  <p className="text-sm text-blue-600">
                    {localizedComponent(selectedComponent)}
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