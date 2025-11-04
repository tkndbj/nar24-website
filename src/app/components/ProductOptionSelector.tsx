"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Plus,
  Minus,
  Check,
  Loader2,
  MoveHorizontal,
  MoveVertical,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { useTranslations } from "next-intl";
import { db } from "@/lib/firebase";
import { useUser } from "@/context/UserProvider";
import { AttributeLocalizationUtils } from "@/constants/AttributeLocalization";
import { Product } from "@/app/models/Product";

interface SalePreferences {
  maxQuantity?: number;
  discountThreshold?: number;
  discountPercentage?: number;
  acceptOffers?: boolean;
  minOffer?: number;
  quickSale?: boolean;
}

interface OptionSelectorResult {
  selectedColor?: string;
  selectedColorImage?: string;
  quantity: number;
  curtainWidth?: number;
  curtainHeight?: number;
  [key: string]: unknown;
}

interface ProductOptionSelectorProps {
  product: Product;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (result: OptionSelectorResult) => void;
  isDarkMode?: boolean;
  localization?: ReturnType<typeof useTranslations>;
}

interface ColorThumbProps {
  colorKey: string;
  imageUrl: string;
  isSelected: boolean;
  disabled: boolean;
  onSelect: () => void;
  label?: string;
  isDarkMode?: boolean;
  t: (key: string) => string;
}

interface AttributeChipProps {
  label: string;
  isSelected: boolean;
  onSelect: () => void;
  isDarkMode?: boolean;
}

const ColorThumb: React.FC<ColorThumbProps> = ({
  colorKey,
  imageUrl,
  isSelected,
  disabled,
  onSelect,
  label,
  isDarkMode = false,
  t,
}) => {
  return (
    <button
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      className={`
        relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 transition-all duration-200 mx-1
        ${
          isSelected
            ? "border-orange-500 border-3 shadow-lg"
            : isDarkMode
            ? "border-gray-600 hover:border-orange-400"
            : "border-gray-300 hover:border-orange-400"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      <img
        src={imageUrl}
        alt={label || `${t("color")} ${colorKey}`}
        className="w-full h-full object-cover"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = "none";
          target.nextElementSibling?.classList.remove("hidden");
        }}
      />

      {/* Fallback icon */}
      <div
        className={`hidden absolute inset-0 flex items-center justify-center ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`}
      >
        <div className="w-6 h-6 bg-gray-400 rounded" />
      </div>

      {/* Disabled overlay */}
      {disabled && (
        <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center">
          <span className="text-white text-xs font-bold text-center px-1">
            {t("noStock")}
          </span>
        </div>
      )}

      {/* Selected indicator */}
      {isSelected && !disabled && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Check className="w-6 h-6 text-orange-500 bg-white rounded-full p-1" />
        </div>
      )}
    </button>
  );
};

const AttributeChip: React.FC<AttributeChipProps> = ({
  label,
  isSelected,
  onSelect,
  isDarkMode = false,
}) => {
  return (
    <button
      onClick={onSelect}
      className={`
        px-4 py-2 rounded-full border transition-all duration-200 text-sm font-medium mx-1 mb-2
        ${
          isSelected
            ? "border-orange-500 border-2 text-orange-500 bg-orange-50 dark:bg-orange-950"
            : isDarkMode
            ? "border-gray-600 text-gray-300 hover:border-orange-400"
            : "border-gray-300 text-gray-700 hover:border-orange-400"
        }
      `}
    >
      {label}
    </button>
  );
};

const ProductOptionSelector: React.FC<ProductOptionSelectorProps> = ({
  product,
  isOpen,
  onClose,
  onConfirm,
  isDarkMode = false,
  localization,
}) => {
  // Auto-detect dark mode if not provided as prop
  const [detectedDarkMode, setDetectedDarkMode] = React.useState(false);

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      const checkTheme = () => {
        setDetectedDarkMode(
          document.documentElement.classList.contains("dark")
        );
      };

      checkTheme();
      const observer = new MutationObserver(checkTheme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });

      return () => observer.disconnect();
    }
  }, []);

  // ✅ FIXED: Proper nested translation function that uses JSON files
  const t = useCallback(
    (key: string) => {
      if (!localization) {
        return key;
      }

      try {
        // Try to get the nested ProductOptionSelector translation
        const translation = localization(`ProductOptionSelector.${key}`);

        // Check if we got a valid translation (not the same as the key we requested)
        if (translation && translation !== `ProductOptionSelector.${key}`) {
          return translation;
        }

        // If nested translation doesn't exist, try direct key
        const directTranslation = localization(key);
        if (directTranslation && directTranslation !== key) {
          return directTranslation;
        }

        // Return the key as fallback
        return key;
      } catch (error) {
        console.warn(`Translation error for key: ${key}`, error);
        return key;
      }
    },
    [localization]
  );

  // Use provided isDarkMode prop or auto-detected value
  const actualDarkMode = isDarkMode || detectedDarkMode;
  const { user } = useUser();

  const [selections, setSelections] = useState<Record<string, string>>({});
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);

  // Curtain dimension states
  const [curtainWidth, setCurtainWidth] = useState("");
  const [curtainHeight, setCurtainHeight] = useState("");

  const [salePreferences, setSalePreferences] =
    useState<SalePreferences | null>(null);
  const [isLoadingSalePrefs, setIsLoadingSalePrefs] = useState(false);

  // Check if product is a curtain
  const isCurtain = useMemo(() => {
    return product.subsubcategory?.toLowerCase() === "curtains";
  }, [product.subsubcategory]);

  // Initialize default selections and load sale preferences
  useEffect(() => {
    if (!isOpen) return;

    // Initialize default selections for single-option attributes
    const newSelections: Record<string, string> = {};
    Object.entries(product.attributes || {}).forEach(([key, value]) => {
      let options: string[] = [];

      if (Array.isArray(value)) {
        options = value
          .map((item) => item.toString())
          .filter((item) => item.trim() !== "");
      } else if (typeof value === "string" && value.trim() !== "") {
        options = value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item !== "");
      }

      // Auto-select single options
      if (options.length === 1) {
        newSelections[key] = options[0];
      }
    });

    setSelections(newSelections);

    // Auto-select default color if no color options available
    if (Object.keys(product.colorImages || {}).length === 0) {
      setSelectedColor("default");
    } else {
      setSelectedColor(null);
    }

    setSelectedQuantity(1);
    setCurtainWidth("");
    setCurtainHeight("");
    setSalePreferences(null);

    // Load sale preferences for shop products
    loadSalePreferences();
  }, [isOpen, product]);

  const loadSalePreferences = useCallback(async () => {
    if (!product.reference) return;

    try {
      setIsLoadingSalePrefs(true);

      // Check if this is a shop product
      const parentCollection = product.reference.parent?.id;
      if (parentCollection !== "shop_products") return;

      const salePrefsDoc = await getDoc(
        doc(db, product.reference.path, "sale_preferences", "preferences")
      );

      if (salePrefsDoc.exists()) {
        const prefs = salePrefsDoc.data() as SalePreferences;
        setSalePreferences(prefs);

        // Adjust quantity if needed
        const maxAllowed = getMaxQuantityAllowed(prefs);
        if (selectedQuantity > maxAllowed) {
          setSelectedQuantity(maxAllowed);
        }
      }
    } catch (error) {
      console.error("Error loading sale preferences:", error);
    } finally {
      setIsLoadingSalePrefs(false);
    }
  }, [product.reference, selectedQuantity]);

  const getMaxQuantityAllowed = useCallback(
    (prefs?: SalePreferences | null) => {
      const stockQuantity = getMaxQuantity();
      const preferences = prefs || salePreferences;

      if (!preferences?.maxQuantity) return stockQuantity;

      return Math.min(stockQuantity, preferences.maxQuantity);
    },
    [selectedColor, product.quantity, product.colorQuantities, salePreferences]
  );

  const getMaxQuantity = useCallback(() => {
    if (selectedColor && selectedColor !== "default") {
      return product.colorQuantities[selectedColor] || 0;
    }
    return product.quantity;
  }, [selectedColor, product.quantity, product.colorQuantities]);

  const getSelectableAttributes = useMemo((): Record<string, string[]> => {
    const selectableAttrs: Record<string, string[]> = {};

    Object.entries(product.attributes || {}).forEach(([key, value]) => {
      let options: string[] = [];

      if (Array.isArray(value)) {
        options = value
          .map((item) => item.toString())
          .filter((item) => item.trim() !== "");
      } else if (typeof value === "string" && value.trim() !== "") {
        options = value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item !== "");
      }

      // Only include attributes with multiple options
      if (options.length > 1) {
        selectableAttrs[key] = options;
      }
    });

    return selectableAttrs;
  }, [product.attributes]);

  const hasColors = useMemo(() => {
    // ✅ Add defensive check
    const colorImages = product.colorImages;
    return colorImages != null && 
           typeof colorImages === 'object' && 
           Object.keys(colorImages).length > 0;
  }, [product.colorImages]);

  // Validate curtain dimensions
  const validateCurtainDimensions = useCallback(() => {
    if (!isCurtain) return true;

    const widthText = curtainWidth.trim();
    const heightText = curtainHeight.trim();

    if (!widthText || !heightText) return false;

    const width = parseFloat(widthText);
    const height = parseFloat(heightText);

    if (isNaN(width) || width <= 0) return false;
    if (isNaN(height) || height <= 0) return false;

    // Check against max dimensions from attributes
    const maxWidth = product.attributes?.curtainMaxWidth;
    const maxHeight = product.attributes?.curtainMaxHeight;

    if (maxWidth != null) {
      const maxW = parseFloat(maxWidth.toString());
      if (!isNaN(maxW) && width > maxW) return false;
    }

    if (maxHeight != null) {
      const maxH = parseFloat(maxHeight.toString());
      if (!isNaN(maxH) && height > maxH) return false;
    }

    return true;
  }, [isCurtain, curtainWidth, curtainHeight, product.attributes]);

  const isConfirmEnabled = useMemo(() => {
    // For curtains, check dimensions instead of quantity
    if (isCurtain) {
      if (!validateCurtainDimensions()) return false;
    }

    // Only check color if product has color options
    if (hasColors && !selectedColor) return false;

    // Check if all selectable attributes have been selected
    for (const key of Object.keys(getSelectableAttributes)) {
      if (!selections[key]) return false;
    }

    return true;
  }, [
    isCurtain,
    validateCurtainDimensions,
    hasColors,
    selectedColor,
    selections,
    getSelectableAttributes,
  ]);

  const handleConfirm = useCallback(() => {
   
  
    const result: OptionSelectorResult = {
      quantity: isCurtain ? 1 : selectedQuantity,
      ...selections,
    };
  
    if (isCurtain) {
      result.curtainWidth = parseFloat(curtainWidth.trim());
      result.curtainHeight = parseFloat(curtainHeight.trim());
    }
  
    if (selectedColor) {
      result.selectedColor = selectedColor;
  
      // ✅ ADD SAFE ACCESS to colorImages
      if (selectedColor !== "default") {
        const colorImages = product.colorImages?.[selectedColor];
        if (colorImages && Array.isArray(colorImages) && colorImages.length > 0) {
          result.selectedColorImage = colorImages[0];
        }
      } else if (product.imageUrls && product.imageUrls.length > 0) {
        result.selectedColorImage = product.imageUrls[0];
      }
    }
  
    onConfirm(result);
  }, [
    isConfirmEnabled,
    selectedQuantity,
    selections,
    selectedColor,
    product,
    onConfirm,
    isCurtain,
    curtainWidth,
    curtainHeight,
  ]);

  const handleQuantityChange = useCallback(
    (increment: number) => {
      const maxAllowed = getMaxQuantityAllowed();
      const newQuantity = selectedQuantity + increment;

      if (newQuantity >= 1 && newQuantity <= maxAllowed) {
        setSelectedQuantity(newQuantity);

      }
    },
    [selectedQuantity, getMaxQuantityAllowed, product.id]
  );

  // Update selected quantity when color changes (to respect color-specific stock limits)
  useEffect(() => {
    const maxAllowed = getMaxQuantityAllowed();
    if (selectedQuantity > maxAllowed) {
      const adjustedQuantity = Math.max(1, maxAllowed);
      setSelectedQuantity(adjustedQuantity);

      
    }
  }, [
    selectedColor,
    salePreferences,
    selectedQuantity,
    getMaxQuantityAllowed,
    product.id,
  ]);

  const renderSalePreferenceInfo = useCallback(() => {
    if (
      !salePreferences?.discountThreshold ||
      !salePreferences?.discountPercentage
    )
      return null;

    const { discountThreshold, discountPercentage } = salePreferences;
    const hasDiscount = selectedQuantity >= discountThreshold;

    return (
      <div
        className={`mt-4 p-3 rounded-lg border ${
          actualDarkMode
            ? "bg-blue-900/20 border-blue-800"
            : "bg-blue-50 border-blue-200"
        }`}
      >
        <div className="text-center">
          <p
            className={`text-sm font-medium ${
              hasDiscount
                ? "text-green-600 dark:text-green-400"
                : "text-orange-600 dark:text-orange-400"
            }`}
          >
            {hasDiscount
              ? `${t("discountApplied")}: ${discountPercentage}%`
              : `${t("buyText")} ${discountThreshold} ${t(
                  "forDiscount"
                )} ${discountPercentage}%!`}
          </p>
        </div>
      </div>
    );
  }, [salePreferences, selectedQuantity, t, actualDarkMode]);

  const renderColorSelector = useCallback(() => {
    if (!hasColors) return null;
  
    // ✅ CRITICAL FIX: Add defensive check for colorImages AND colorQuantities
    const safeColorImages = product.colorImages || {};
    const safeColorQuantities = product.colorQuantities || {};
  
  
  
    return (
      <div className="mb-6">
        <h3 className="text-center text-orange-500 font-bold text-base mb-3">
          {t("selectColor")}
        </h3>
        <div
          className="flex overflow-x-auto pb-2 px-1"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {/* Default option - only show if main imageUrls exist */}
          {product.imageUrls && product.imageUrls.length > 0 && (
            <ColorThumb
              colorKey="default"
              imageUrl={product.imageUrls[0]}
              isSelected={selectedColor === "default"}
              disabled={product.quantity === 0}
              isDarkMode={actualDarkMode}
              onSelect={() => {
                setSelectedColor("default");
                
              }}
              label={t("default")}
              t={t}
            />
          )}
  
          {/* Color options from colorImages - ✅ USE SAFE ACCESS */}
          {Object.entries(safeColorImages).map(([colorKey, images]) => {
  // ✅ Ensure images is an array with items
  if (!images || !Array.isArray(images) || images.length === 0) {
    return null;
  }

  // ✅ FIX: Use safeColorQuantities instead of product.colorQuantities
  const qty = safeColorQuantities[colorKey] || 0;
  
  
            
            return (
              <ColorThumb
                key={colorKey}
                colorKey={colorKey}
                imageUrl={images[0]}
                isSelected={selectedColor === colorKey}
                disabled={qty === 0}  // ✅ This should now correctly show qty=1 for "Gray"
                isDarkMode={actualDarkMode}
                onSelect={() => {
                  setSelectedColor(colorKey);
                 
                }}
                label={colorKey}
                t={t}
              />
            );
          })}
        </div>
      </div>
    );
  }, [hasColors, product, selectedColor, t, actualDarkMode]);

  const renderAttributeSelector = useCallback(
    (attributeKey: string, options: string[]) => {
      return (
        <div key={attributeKey} className="mb-6">
          <h3 className="text-center text-orange-500 font-bold text-base mb-3">
            {localization
              ? AttributeLocalizationUtils.getLocalizedAttributeTitle(
                  attributeKey,
                  localization
                )
              : attributeKey}
          </h3>
          <div className="flex flex-wrap justify-center">
            {options.map((option) => (
              <AttributeChip
                key={option}
                label={
                  localization
                    ? AttributeLocalizationUtils.getLocalizedSingleValue(
                        attributeKey,
                        option,
                        localization
                      )
                    : option
                }
                isSelected={selections[attributeKey] === option}
                isDarkMode={actualDarkMode}
                onSelect={() => {
                  setSelections((prev) => ({
                    ...prev,
                    [attributeKey]: option,
                  }));
                 
                }}
              />
            ))}
          </div>
        </div>
      );
    },
    [selections, localization, product.id, actualDarkMode]
  );

  const renderCurtainDimensionsInput = useCallback(() => {
    if (!isCurtain) return null;

    const maxWidth = product.attributes?.curtainMaxWidth;
    const maxHeight = product.attributes?.curtainMaxHeight;

    const widthValue = parseFloat(curtainWidth);
    const heightValue = parseFloat(curtainHeight);
    const maxWidthValue = maxWidth ? parseFloat(maxWidth.toString()) : null;
    const maxHeightValue = maxHeight ? parseFloat(maxHeight.toString()) : null;

    const widthExceedsMax =
      !isNaN(widthValue) &&
      maxWidthValue !== null &&
      widthValue > maxWidthValue;
    const heightExceedsMax =
      !isNaN(heightValue) &&
      maxHeightValue !== null &&
      heightValue > maxHeightValue;

    return (
      <div className="mb-6">
        <h3 className="text-center text-orange-500 font-bold text-base mb-3">
          {t("curtainDimensions")}
        </h3>
        <div
          className={`p-3 rounded-lg border ${
            actualDarkMode
              ? "bg-gray-800/50 border-gray-700"
              : "bg-gray-50 border-gray-200"
          }`}
        >
          {/* Width input */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <MoveHorizontal className="text-orange-500" size={20} />
              <label
                className={`text-sm font-medium ${
                  actualDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                {t("maxWidth")}
              </label>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={curtainWidth}
              onChange={(e) => setCurtainWidth(e.target.value)}
              placeholder={`${t("enterValue")} (${t("metersUnit")})`}
              className={`w-full px-3 py-2 rounded-lg border ${
                widthExceedsMax
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                  : "border-orange-500 focus:border-orange-500 focus:ring-orange-500"
              } focus:ring-2 focus:outline-none ${
                actualDarkMode
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-900"
              }`}
            />
            {maxWidth != null && (
              <p
                className={`text-xs mt-1 ${
                  actualDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {t("maximum")}: {maxWidth.toString()} {t("metersUnit")}
              </p>
            )}
            {widthExceedsMax && (
              <p className="text-xs text-red-500 mt-1">
                {t("widthExceedsMaximum")}!
              </p>
            )}
          </div>

          {/* Height input */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MoveVertical className="text-orange-500" size={20} />
              <label
                className={`text-sm font-medium ${
                  actualDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                {t("maxHeight")}
              </label>
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={curtainHeight}
              onChange={(e) => setCurtainHeight(e.target.value)}
              placeholder={`${t("enterValue")} (${t("metersUnit")})`}
              className={`w-full px-3 py-2 rounded-lg border ${
                heightExceedsMax
                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                  : "border-orange-500 focus:border-orange-500 focus:ring-orange-500"
              } focus:ring-2 focus:outline-none ${
                actualDarkMode
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-900"
              }`}
            />
            {maxHeight != null && (
              <p
                className={`text-xs mt-1 ${
                  actualDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {t("maximum")}: {maxHeight.toString()} {t("metersUnit")}
              </p>
            )}
            {heightExceedsMax && (
              <p className="text-xs text-red-500 mt-1">
                {t("heightExceedsMaximum")}!
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }, [
    isCurtain,
    curtainWidth,
    curtainHeight,
    product.attributes,
    t,
    actualDarkMode,
  ]);

  const renderQuantitySelector = useCallback(() => {
    if (isCurtain) return null; // Don't show for curtains

    const maxAllowed = getMaxQuantityAllowed();

    return (
      <div className="mb-6">
        <h3 className="text-center text-orange-500 font-bold text-base mb-3">
          {t("quantity")}
        </h3>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => handleQuantityChange(-1)}
            disabled={selectedQuantity <= 1}
            className={`p-2 rounded-full border transition-colors ${
              actualDarkMode
                ? "border-gray-600 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                : "border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            <Minus size={20} />
          </button>

          <div className="px-4 py-2 border border-orange-500 rounded-lg min-w-[60px] text-center">
            <span className="text-lg font-semibold">{selectedQuantity}</span>
          </div>

          <button
            onClick={() => handleQuantityChange(1)}
            disabled={selectedQuantity >= maxAllowed}
            className={`p-2 rounded-full border transition-colors ${
              actualDarkMode
                ? "border-gray-600 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                : "border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Loading indicator for sale preferences */}
        {isLoadingSalePrefs && (
          <div className="flex justify-center mt-2">
            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          </div>
        )}
      </div>
    );
  }, [
    isCurtain,
    selectedQuantity,
    getMaxQuantityAllowed,
    handleQuantityChange,
    isLoadingSalePrefs,
    t,
    actualDarkMode,
  ]);

  // Redirect to login if user is not authenticated
  useEffect(() => {
    if (isOpen && !user) {
      onClose();
    }
  }, [isOpen, user, onClose]);

  if (!user) {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh]"
          >
            <div
              className={`rounded-t-2xl shadow-2xl max-w-lg mx-auto ${
                isDarkMode ? "bg-gray-900" : "bg-white"
              }`}
            >
              {/* Header */}
              <div
                className={`flex items-center justify-between p-4 border-b ${
                  isDarkMode ? "border-gray-700" : "border-gray-200"
                }`}
              >
                <h2
                  className={`text-lg font-semibold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("selectOptions")}
                </h2>
                <button
                  onClick={onClose}
                  className={`p-1 rounded-full transition-colors ${
                    isDarkMode
                      ? "hover:bg-gray-800 text-gray-500"
                      : "hover:bg-gray-100 text-gray-500"
                  }`}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 max-h-[60vh] overflow-y-auto">
                {/* Color selector - only show if product has color options */}
                {renderColorSelector()}

                {/* Dynamic attribute selectors */}
                {Object.entries(getSelectableAttributes).map(([key, options]) =>
                  renderAttributeSelector(key, options)
                )}

                {/* Conditional rendering: Curtain dimensions OR Quantity selector */}
                {isCurtain ? (
                  renderCurtainDimensionsInput()
                ) : (
                  <>
                    {renderQuantitySelector()}
                    {/* Sale preference info */}
                    {renderSalePreferenceInfo()}
                  </>
                )}
              </div>

              {/* Footer */}
              <div
                className={`p-4 border-t space-y-2 ${
                  isDarkMode ? "border-gray-700" : "border-gray-200"
                }`}
              >
                <button
                  onClick={handleConfirm}
                  disabled={!isConfirmEnabled}
                  className={`
                    w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200
                    ${
                      isConfirmEnabled
                        ? "bg-orange-500 hover:bg-orange-600 text-white"
                        : isDarkMode
                        ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }
                  `}
                >
                  {t("confirm")}{" "}
                  {!isCurtain &&
                    selectedQuantity > 1 &&
                    `(${selectedQuantity})`}
                </button>

                <button
                  onClick={onClose}
                  className={`w-full py-2 px-4 transition-colors ${
                    isDarkMode
                      ? "text-gray-400 hover:text-gray-200"
                      : "text-gray-600 hover:text-gray-800"
                  }`}
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ProductOptionSelector;
