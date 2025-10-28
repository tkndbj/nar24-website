"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  CurtainDimensionsStepProps,
  GenericStepResult,
} from "./stepComponentTypes";

export default function CurtainDimensionsStep({
  initialAttributes,
  onSave,
  onCancel,
}: CurtainDimensionsStepProps) {
  const t = useTranslations("curtainDimensionsStep");

  const [maxWidth, setMaxWidth] = useState("");
  const [maxHeight, setMaxHeight] = useState("");

  useEffect(() => {
    // Load from dynamic attributes if provided
    if (initialAttributes) {
      if (typeof initialAttributes.curtainMaxWidth === "number") {
        setMaxWidth(initialAttributes.curtainMaxWidth.toString());
      } else if (typeof initialAttributes.curtainMaxWidth === "string") {
        setMaxWidth(initialAttributes.curtainMaxWidth);
      }

      if (typeof initialAttributes.curtainMaxHeight === "number") {
        setMaxHeight(initialAttributes.curtainMaxHeight.toString());
      } else if (typeof initialAttributes.curtainMaxHeight === "string") {
        setMaxHeight(initialAttributes.curtainMaxHeight);
      }
    }
  }, [initialAttributes]);

  const handleSaveCurtainDimensions = () => {
    // Validate inputs
    const widthValue = parseFloat(maxWidth);
    const heightValue = parseFloat(maxHeight);

    if (!maxWidth || isNaN(widthValue) || widthValue <= 0) {
      alert(t("pleaseEnterValidWidth"));
      return;
    }

    if (!maxHeight || isNaN(heightValue) || heightValue <= 0) {
      alert(t("pleaseEnterValidHeight"));
      return;
    }

    // Return the curtain dimensions as dynamic attributes following the interface
    const result: GenericStepResult = {
      curtainMaxWidth: widthValue,
      curtainMaxHeight: heightValue,
    };

    // Include any existing attributes that were passed in
    if (initialAttributes) {
      Object.keys(initialAttributes).forEach((key) => {
        if (
          key !== "curtainMaxWidth" &&
          key !== "curtainMaxHeight" &&
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

  const handleWidthChange = (value: string) => {
    // Allow only numbers and one decimal point
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setMaxWidth(value);
    }
  };

  const handleHeightChange = (value: string) => {
    // Allow only numbers and one decimal point
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setMaxHeight(value);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
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
            <div className="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
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
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
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
          {/* Header section */}
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">📏</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              {t("subtitle")}
            </h2>
            <p className="text-slate-600">{t("description")}</p>
          </div>

          {/* Dimensions Input Section */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 overflow-hidden">
            <div className="p-6 space-y-6">
              {/* Width Input */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <div className="w-8 h-8 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-xl flex items-center justify-center">
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
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                      />
                    </svg>
                  </div>
                  {t("maxWidth")}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={maxWidth}
                    onChange={(e) => handleWidthChange(e.target.value)}
                    placeholder={t("widthPlaceholder")}
                    className="w-full px-4 py-4 pr-16 text-lg border-2 border-slate-200 rounded-2xl focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all duration-300 outline-none bg-white"
                  />
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-500 font-medium">
                    {t("metersUnit")}
                  </div>
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {t("widthHint")}
                </p>
              </div>

              {/* Height Input */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <div className="w-8 h-8 bg-gradient-to-r from-purple-400 to-pink-400 rounded-xl flex items-center justify-center">
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
                        d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                      />
                    </svg>
                  </div>
                  {t("maxHeight")}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={maxHeight}
                    onChange={(e) => handleHeightChange(e.target.value)}
                    placeholder={t("heightPlaceholder")}
                    className="w-full px-4 py-4 pr-16 text-lg border-2 border-slate-200 rounded-2xl focus:border-purple-400 focus:ring-4 focus:ring-purple-100 transition-all duration-300 outline-none bg-white"
                  />
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-500 font-medium">
                    {t("metersUnit")}
                  </div>
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <svg
                    className="w-3 h-3"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {t("heightHint")}
                </p>
              </div>

              {/* Visual Preview */}
              {maxWidth && maxHeight && (
                <div className="mt-6 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg
                        className="w-5 h-5 text-white"
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
                    <div className="flex-1">
                      <p className="font-semibold text-indigo-700">
                        {t("dimensionsSummary")}
                      </p>
                      <p className="text-sm text-indigo-600">
                        {maxWidth}m × {maxHeight}m
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Enhanced Save Button */}
          <div className="pt-4">
            <button
              onClick={handleSaveCurtainDimensions}
              disabled={!maxWidth || !maxHeight}
              className="w-full group relative overflow-hidden bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white font-bold py-5 px-6 rounded-3xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-2xl hover:shadow-3xl"
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
            <div
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                maxWidth ? "bg-indigo-400" : "bg-slate-200"
              }`}
            ></div>
            <div
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                maxHeight ? "bg-purple-400" : "bg-slate-200"
              }`}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
}
