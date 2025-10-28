"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ColorStepProps, ColorStepResult } from "./stepComponentTypes";
// Add the compression utility import
import {
  smartCompress,
  shouldCompress,
  formatFileSize,
  CompressionResult,
} from "../../utils/imageCompression";

export default function ColorOptionStep({
  initialSelectedColors,
  onSave,
  onCancel,
}: ColorStepProps) {
  const t = useTranslations("colorOptionStep");

  const availableColors = [
    { name: "Blue", color: "#0000FF" },
    { name: "Orange", color: "#FFA500" },
    { name: "Yellow", color: "#FFFF00" },
    { name: "Black", color: "#000000" },
    { name: "Brown", color: "#A52A2A" },
    { name: "Dark Blue", color: "#00008B" },
    { name: "Gray", color: "#808080" },
    { name: "Pink", color: "#FFC0CB" },
    { name: "Red", color: "#FF0000" },
    { name: "White", color: "#FFFFFF" },
    { name: "Green", color: "#008000" },
    { name: "Purple", color: "#800080" },
    { name: "Teal", color: "#008080" },
    { name: "Lime", color: "#00FF00" },
    { name: "Cyan", color: "#00FFFF" },
    { name: "Magenta", color: "#FF00FF" },
    { name: "Indigo", color: "#4B0082" },
    { name: "Amber", color: "#FFBF00" },
    { name: "Deep Orange", color: "#FF5722" },
    { name: "Light Blue", color: "#ADD8E6" },
    { name: "Deep Purple", color: "#673AB7" },
    { name: "Light Green", color: "#90EE90" },
    { name: "Dark Gray", color: "#444444" },
    { name: "Beige", color: "#F5F5DC" },
    { name: "Turquoise", color: "#40E0D0" },
    { name: "Violet", color: "#EE82EE" },
    { name: "Olive", color: "#808000" },
    { name: "Maroon", color: "#800000" },
    { name: "Navy", color: "#000080" },
    { name: "Silver", color: "#C0C0C0" },
  ];

  // FIXED: Use consistent state structure
  const [selectedColors, setSelectedColors] = useState<{
    [key: string]: { image: File | null; quantity: number };
  }>({});

  const [wantsColorOptions, setWantsColorOptions] = useState<boolean | null>(
    null
  );
  const [compressingColors, setCompressingColors] = useState<Set<string>>(
    new Set()
  );
  const [compressionStats, setCompressionStats] = useState<{
    [colorName: string]: CompressionResult;
  }>({});
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

  // FIXED: Better initialization with proper error handling
  useEffect(() => {
    if (
      initialSelectedColors &&
      Object.keys(initialSelectedColors).length > 0
    ) {
      console.log(
        "🎨 Initializing with colors:",
        Object.keys(initialSelectedColors)
      );

      const initialColors: {
        [key: string]: { image: File | null; quantity: number };
      } = {};

      Object.entries(initialSelectedColors).forEach(([key, file]) => {
        initialColors[key] = {
          image: file,
          quantity: 1, // Default quantity
        };
      });

      setSelectedColors(initialColors);
      setWantsColorOptions(true);
      console.log("🎨 Initialized selectedColors:", initialColors);
    }
  }, [initialSelectedColors]);

  const getLocalizedColorName = (colorName: string): string => {
    return t(`colors.${colorName.replace(/\s+/g, "")}`, {
      fallback: colorName,
    });
  };

  const handleContinue = useCallback(() => {
    if (Object.keys(selectedColors).length === 0) {
      onSave(null);
      return;
    }

    // Validate that all selected colors have images and quantities
    for (const [, data] of Object.entries(selectedColors)) {
      if (!data.image || !data.quantity || data.quantity <= 0) {
        alert(t("colorOptionWarning"));
        return;
      }
    }

    // Create properly typed result following ColorStepResult interface
    const result: ColorStepResult = {};
    Object.entries(selectedColors).forEach(([key, value]) => {
      if (value.image && value.quantity && value.quantity > 0) {
        result[key] = {
          image: value.image,
          quantity: value.quantity,
        };
      }
    });

    // Transform to the expected format for the main form
    const transformedResult: { [key: string]: { [key: string]: unknown } } = {};
    Object.entries(result).forEach(([key, value]) => {
      transformedResult[key] = {
        image: value.image,
        quantity: value.quantity,
      };
    });

    console.log("🎨 Saving color result:", transformedResult);
    onSave(transformedResult);
  }, [selectedColors, onSave, t]);

  const handleNoColorOptions = useCallback(() => {
    setWantsColorOptions(false);
    onSave(null);
  }, [onSave]);

  // FIXED: Simplified and more robust image upload handler
  const handleImageUpload = useCallback(
    async (colorName: string, event: React.ChangeEvent<HTMLInputElement>) => {
      console.log("🎨 Starting image upload for:", colorName);

      const file = event.target.files?.[0];
      if (!file) {
        console.log("🎨 No file selected");
        return;
      }

      // Validate file type
      if (!file.type.startsWith("image/")) {
        console.error("❌ Invalid file type:", file.type);
        alert("Please select a valid image file");
        event.target.value = "";
        return;
      }

      // Check if color exists in selectedColors
      setSelectedColors((currentColors) => {
        if (!currentColors[colorName]) {
          console.error(`❌ Color ${colorName} not found in selectedColors!`);
          alert(`Error: Color ${colorName} not found. Please try again.`);
          return currentColors;
        }

        console.log("🎨 Color exists, proceeding with upload");
        return currentColors;
      });

      // Start compression for this color
      setCompressingColors((prev) => new Set(prev).add(colorName));

      try {
        let finalFile = file;

        if (shouldCompress(file, 200)) {
          console.log(
            `🎨 Compressing ${colorName}: ${formatFileSize(file.size)}`
          );

          const result = await smartCompress(file, "color");
          finalFile = result.compressedFile;

          if (
            !finalFile ||
            !(finalFile instanceof File) ||
            finalFile.size === 0
          ) {
            throw new Error("Compression failed: Invalid result");
          }

          console.log(`✅ Compression successful for ${colorName}`);

          setCompressionStats((prev) => ({
            ...prev,
            [colorName]: result,
          }));
        }

        // FIXED: Use atomic state update with validation
        setSelectedColors((currentColors) => {
          // Validate color still exists
          if (!currentColors[colorName]) {
            console.error(`❌ Color ${colorName} was removed during upload`);
            return currentColors;
          }

          const updatedColors = {
            ...currentColors,
            [colorName]: {
              ...currentColors[colorName],
              image: finalFile,
            },
          };

          console.log(`🎨 Successfully updated image for ${colorName}`);
          return updatedColors;
        });
      } catch (error) {
        console.error(`❌ Image upload error for ${colorName}:`, error);

        // Clear compression stats on error
        setCompressionStats((prev) => {
          const newStats = { ...prev };
          delete newStats[colorName];
          return newStats;
        });

        alert(`Image upload failed for ${colorName}. Please try again.`);
      } finally {
        // Always clean up compression state
        setCompressingColors((prev) => {
          const newSet = new Set(prev);
          newSet.delete(colorName);
          return newSet;
        });

        // Clear the input value
        event.target.value = "";
      }
    },
    []
  );

  // FIXED: Simplified quantity change handler
  const handleQuantityChange = useCallback(
    (colorName: string, quantity: string) => {
      const numQuantity = Math.max(1, parseInt(quantity) || 1);

      setSelectedColors((currentColors) => {
        if (!currentColors[colorName]) {
          console.warn(
            `❌ Quantity change for non-existent color: ${colorName}`
          );
          return currentColors;
        }

        return {
          ...currentColors,
          [colorName]: {
            ...currentColors[colorName],
            quantity: numQuantity,
          },
        };
      });
    },
    []
  );

  // FIXED: More robust color selection toggle
  const toggleColorSelection = useCallback((colorName: string) => {
    console.log("🎨 Toggling color selection:", colorName);

    setSelectedColors((currentColors) => {
      if (currentColors[colorName]) {
        // Remove color
        const newColors = { ...currentColors };
        delete newColors[colorName];

        // Also remove compression stats
        setCompressionStats((prevStats) => {
          const newStats = { ...prevStats };
          delete newStats[colorName];
          return newStats;
        });

        console.log(`🎨 Removed color: ${colorName}`);
        return newColors;
      } else {
        // Add color with default values
        const newColors = {
          ...currentColors,
          [colorName]: {
            image: null,
            quantity: 1, // Default quantity
          },
        };

        console.log(`🎨 Added color: ${colorName}`);
        return newColors;
      }
    });
  }, []);

  // FIXED: Remove image handler
  const handleRemoveImage = useCallback((colorName: string) => {
    console.log(`🎨 Removing image for ${colorName}`);

    setSelectedColors((currentColors) => {
      if (!currentColors[colorName]) {
        return currentColors;
      }

      return {
        ...currentColors,
        [colorName]: {
          ...currentColors[colorName],
          image: null,
        },
      };
    });

    // Clear compression stats
    setCompressionStats((prev) => {
      const newStats = { ...prev };
      delete newStats[colorName];
      return newStats;
    });
  }, []);

  return (
    <div className={`min-h-screen ${isDarkMode ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" : "bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50"}`}>
      {/* Enhanced App Bar with glassmorphism */}
      <div className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b shadow-lg ${isDarkMode ? "bg-gray-900/90 border-gray-700" : "bg-white/80 border-white/20"}`}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button
              onClick={onCancel}
              className={`group p-2 mr-2 rounded-lg transition-all duration-300 hover:scale-105 ${isDarkMode ? "text-gray-300 hover:text-gray-100 hover:bg-gray-800" : "text-slate-600 hover:text-slate-800 hover:bg-white/50"}`}
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
              <div className="w-8 h-8 bg-gradient-to-r from-violet-500 to-purple-500 rounded-lg flex items-center justify-center shadow-lg">
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
                    d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5H9a2 2 0 00-2 2v10a4 4 0 004 4h6a2 2 0 002-2V7a2 2 0 00-2-2z"
                  />
                </svg>
              </div>
              <h1 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                {t("title")}
              </h1>
            </div>
          </div>
          {wantsColorOptions === true && (
            <button
              onClick={handleContinue}
              disabled={compressingColors.size > 0}
              className="group px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 disabled:from-violet-400 disabled:to-purple-400 text-white font-semibold rounded-2xl transition-all duration-300 transform hover:scale-105 disabled:scale-100 shadow-lg hover:shadow-xl disabled:cursor-not-allowed"
            >
              <span className="flex items-center gap-2">
                {compressingColors.size > 0 ? (
                  <>
                    <svg
                      className="w-4 h-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    {t("processing")}
                  </>
                ) : (
                  <>
                    {t("continue")}
                    <svg
                      className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-200"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  </>
                )}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Content with proper top spacing */}
      <div className="pt-16 min-h-screen px-3 pb-6">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Initial Question */}
          <div className={`backdrop-blur-xl rounded-lg shadow-lg border overflow-hidden ${isDarkMode ? "bg-gray-800/90 border-gray-700" : "bg-white/70 border-white/20"}`}>
            <div className={`p-4 border-b ${isDarkMode ? "border-gray-700 bg-gray-700/50" : "border-violet-100/50 bg-gradient-to-r from-violet-50/50 to-purple-50/50"}`}>
              <h2 className={`text-base font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                <div className="w-7 h-7 bg-gradient-to-r from-violet-400 to-purple-400 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm">🎨</span>
                </div>
                {t("moreColorOptions")}
              </h2>
              <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                Do you want to offer different color variations?
              </p>
            </div>

            <div className="p-3 space-y-2">
              <button
                onClick={() => setWantsColorOptions(true)}
                className={`w-full group flex items-center justify-between p-3 rounded-lg border-2 transition-all duration-300 text-sm ${
                  wantsColorOptions === true
                    ? `border-violet-400 ${isDarkMode ? "bg-violet-900/20" : "bg-gradient-to-r from-violet-50 to-purple-50"} shadow-lg`
                    : isDarkMode ? "border-gray-600 bg-gray-700 hover:border-violet-300" : "border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50/50"
                }`}
              >
                <span
                  className={`font-medium transition-colors duration-300 ${
                    wantsColorOptions === true
                      ? isDarkMode ? "text-violet-400" : "text-violet-700"
                      : isDarkMode ? "text-gray-200 group-hover:text-violet-400" : "text-gray-700 group-hover:text-violet-600"
                  }`}
                >
                  {t("yes")}
                </span>
                <div
                  className={`w-6 h-6 rounded-full border-2 transition-all duration-300 ${
                    wantsColorOptions === true
                      ? "bg-gradient-to-r from-violet-500 to-purple-500 border-violet-500"
                      : "border-slate-300 group-hover:border-violet-400"
                  } flex items-center justify-center`}
                >
                  {wantsColorOptions === true && (
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  )}
                </div>
              </button>

              <button
                onClick={handleNoColorOptions}
                className={`w-full group flex items-center justify-between p-3 rounded-lg border-2 transition-all duration-300 text-sm ${
                  wantsColorOptions === false
                    ? isDarkMode ? "border-gray-600 bg-gray-700/50 shadow-lg" : "border-gray-400 bg-gradient-to-r from-gray-50 to-gray-50 shadow-lg"
                    : isDarkMode ? "border-gray-600 bg-gray-700 hover:border-gray-500" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50"
                }`}
              >
                <span
                  className={`font-medium transition-colors duration-300 ${
                    wantsColorOptions === false
                      ? isDarkMode ? "text-gray-300" : "text-gray-700"
                      : isDarkMode ? "text-gray-300 group-hover:text-gray-200" : "text-gray-700 group-hover:text-gray-600"
                  }`}
                >
                  {t("no")}
                </span>
                <div
                  className={`w-6 h-6 rounded-full border-2 transition-all duration-300 ${
                    wantsColorOptions === false
                      ? "bg-gradient-to-r from-slate-500 to-gray-500 border-slate-500"
                      : "border-slate-300 group-hover:border-slate-400"
                  } flex items-center justify-center`}
                >
                  {wantsColorOptions === false && (
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Color Selection Grid */}
          {wantsColorOptions === true && (
            <div className={`backdrop-blur-xl rounded-lg shadow-lg border overflow-hidden ${isDarkMode ? "bg-gray-800/90 border-gray-700" : "bg-white/70 border-white/20"}`}>
              <div className={`p-4 border-b ${isDarkMode ? "border-gray-700 bg-gray-700/50" : "border-fuchsia-100/50 bg-gradient-to-r from-fuchsia-50/50 to-pink-50/50"}`}>
                <h3 className={`text-base font-bold flex items-center gap-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  <div className="w-7 h-7 bg-gradient-to-r from-fuchsia-400 to-pink-400 rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm">🌈</span>
                  </div>
                  {t("selectColors")}
                </h3>
                <p className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  Choose colors for your product variations
                  <span className={`block text-xs mt-1 ${isDarkMode ? "text-violet-400" : "text-violet-600"}`}>
                    {t("imageOptimization")}
                  </span>
                </p>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-5 gap-3 mb-6">
                  {availableColors.map((colorData) => {
                    const isSelected = selectedColors[colorData.name];
                    const localizedName = getLocalizedColorName(colorData.name);

                    return (
                      <button
                        key={colorData.name}
                        onClick={() => toggleColorSelection(colorData.name)}
                        className="group flex flex-col items-center transform hover:scale-110 transition-all duration-300"
                      >
                        <div className="relative w-12 h-12 mb-2">
                          <div
                            className={`w-full h-full rounded-2xl border-3 transition-all duration-300 ${
                              isSelected
                                ? "border-violet-400 shadow-lg scale-110"
                                : "border-slate-300 group-hover:border-violet-300 group-hover:shadow-md"
                            }`}
                            style={{
                              backgroundColor: colorData.color,
                              borderColor: isSelected
                                ? "#8b5cf6"
                                : colorData.name === "White"
                                ? "#d1d5db"
                                : "#9ca3af",
                            }}
                          />
                          {isSelected && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-6 h-6 bg-white rounded-full shadow-lg flex items-center justify-center">
                                <svg
                                  className="w-4 h-4 text-violet-500"
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
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-center text-slate-700 leading-tight font-medium group-hover:text-violet-600 transition-colors duration-300">
                          {localizedName}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* FIXED: Selected Colors Details */}
                {Object.keys(selectedColors).length > 0 && (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-full ${isDarkMode ? "bg-violet-900/30 border border-violet-800" : "bg-gradient-to-r from-violet-100 to-purple-100"}`}>
                        <svg
                          className={`w-4 h-4 ${isDarkMode ? "text-violet-400" : "text-violet-600"}`}
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
                        <span className={`font-medium text-xs ${isDarkMode ? "text-violet-400" : "text-violet-700"}`}>
                          {t("pleaseAddImageForColor")}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {Object.entries(selectedColors).map(
                        ([colorName, data]) => {
                          const colorData = availableColors.find(
                            (c) => c.name === colorName
                          );

                          if (!colorData) {
                            console.warn(
                              `❌ Color data not found for: ${colorName}`
                            );
                            return null;
                          }

                          const localizedName =
                            getLocalizedColorName(colorName);
                          const isCompressing =
                            compressingColors.has(colorName);
                          const compressionStat = compressionStats[colorName];

                          return (
                            <div
                              key={colorName}
                              className={`rounded-lg p-3 border shadow-sm ${isDarkMode ? "bg-gray-700/50 border-violet-800" : "bg-gradient-to-r from-white to-violet-50/30 border-violet-100"}`}
                            >
                              <div className="flex items-center gap-4">
                                {/* Color Circle */}
                                <div
                                  className="w-12 h-12 rounded-2xl border-2 border-violet-200 shadow-md flex-shrink-0"
                                  style={{
                                    backgroundColor: colorData.color,
                                  }}
                                />

                                {/* Color Name and Quantity Input */}
                                <div className="flex-1 space-y-2">
                                  <h4 className={`font-semibold text-sm ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                                    {localizedName}
                                  </h4>
                                  <div>
                                    <label className={`block text-xs font-medium mb-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                                      {t("quantity")}
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={data.quantity}
                                      onChange={(e) =>
                                        handleQuantityChange(
                                          colorName,
                                          e.target.value
                                        )
                                      }
                                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-all duration-200 ${isDarkMode ? "bg-gray-600 border-gray-500 text-white" : "border-violet-200 bg-white/70 text-gray-900"}`}
                                    />
                                    {data.quantity <= 0 && (
                                      <div className="text-xs text-red-500 mt-1 flex items-center gap-1">
                                        <svg
                                          className="w-3 h-3"
                                          fill="currentColor"
                                          viewBox="0 0 20 20"
                                        >
                                          <path
                                            fillRule="evenodd"
                                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                                            clipRule="evenodd"
                                          />
                                        </svg>
                                        {t("required")}
                                      </div>
                                    )}
                                  </div>

                                  {/* Compression Status */}
                                  {compressionStat && (
                                    <div className="text-xs text-green-600 flex items-center gap-1">
                                      <svg
                                        className="w-3 h-3"
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                      >
                                        <path
                                          fillRule="evenodd"
                                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                          clipRule="evenodd"
                                        />
                                      </svg>
                                      {t("optimized", {
                                        reduction:
                                          compressionStat.compressionRatio.toFixed(
                                            1
                                          ),
                                      })}
                                    </div>
                                  )}
                                </div>

                                {/* FIXED: Image Upload Section */}
                                <div className="relative">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) =>
                                      handleImageUpload(colorName, e)
                                    }
                                    disabled={isCompressing}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                    key={`${colorName}-upload-${data.quantity}`} // Stable key
                                  />
                                  <div
                                    className={`w-20 h-20 border-2 border-dashed rounded-lg flex flex-col items-center justify-center hover:bg-violet-50/50 transition-all duration-300 group cursor-pointer ${isDarkMode ? "border-violet-600 bg-gray-700/70" : "border-violet-300 bg-white/70"} ${
                                      isCompressing
                                        ? "opacity-50 cursor-not-allowed"
                                        : ""
                                    }`}
                                  >
                                    {isCompressing ? (
                                      <div className="flex flex-col items-center">
                                        <svg
                                          className="w-6 h-6 animate-spin text-violet-500 mb-1"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                        >
                                          <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                          ></circle>
                                          <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                          ></path>
                                        </svg>
                                        <span className="text-xs text-violet-500 font-medium">
                                          {t("compressing")}
                                        </span>
                                      </div>
                                    ) : data.image &&
                                      data.image instanceof File ? (
                                      <div className="relative w-full h-full rounded-2xl overflow-hidden">
                                        <Image
                                          src={URL.createObjectURL(data.image)}
                                          alt={`${colorName} preview`}
                                          width={96}
                                          height={96}
                                          className="w-full h-full object-cover"
                                          unoptimized
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all duration-300 flex items-center justify-center">
                                          <svg
                                            className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                            />
                                          </svg>
                                        </div>
                                        {/* File size indicator */}
                                        <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-1 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                          {formatFileSize(data.image.size)}
                                        </div>
                                        {/* Remove button */}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveImage(colorName);
                                          }}
                                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-all duration-200 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    ) : (
                                      <>
                                        <svg
                                          className="w-8 h-8 text-violet-400 mb-1 group-hover:text-violet-500 transition-colors duration-300"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                                          />
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                                          />
                                        </svg>
                                        <span className="text-xs text-violet-500 font-medium group-hover:text-violet-600 transition-colors duration-300">
                                          {t("addImage")}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
