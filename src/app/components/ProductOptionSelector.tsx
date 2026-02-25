"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  X,
  Plus,
  Minus,
  Check,
  MoveHorizontal,
  MoveVertical,
  AlertCircle,
  ShoppingBag,
} from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { useTranslations } from "next-intl";
import { db } from "@/lib/firebase";
import { useUser } from "@/context/UserProvider";
import type { AttributeLocalizationUtils as AttributeLocalizationUtilsType } from "@/constants/AttributeLocalization";
import { Product, ProductUtils } from "@/app/models/Product";

interface SalePreferences {
  maxQuantity?: number;
  discountThreshold?: number;
  bulkDiscountPercentage?: number;
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

// ============================================================================
// COLOR THUMBNAIL COMPONENT
// ============================================================================
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
        relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border transition-all duration-200 mx-1
        ${
          isSelected
            ? "border-orange-500 border-[3px] shadow-lg"
            : isDarkMode
              ? "border-gray-600 border-2 hover:border-orange-400"
              : "border-gray-300 border-2 hover:border-orange-400"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      <img
        src={imageUrl}
        alt={label || `${t("color")} ${colorKey}`}
        className={`w-full h-full object-cover ${disabled ? "grayscale" : ""}`}
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
        <AlertCircle className="w-6 h-6 text-gray-400" />
      </div>

      {/* Disabled overlay (matches Flutter's black overlay) */}
      {disabled && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
          <span className="text-white text-[11px] font-bold text-center px-2 py-1">
            {t("noStock")}
          </span>
        </div>
      )}

      {/* Selected indicator (matches Flutter's check circle) */}
      {isSelected && !disabled && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-white rounded-full p-0.5">
            <Check className="w-5 h-5 text-orange-500" strokeWidth={3} />
          </div>
        </div>
      )}
    </button>
  );
};

// ============================================================================
// ATTRIBUTE CHIP COMPONENT
// ============================================================================
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
        px-4 py-2.5 rounded-full border transition-all duration-200 text-sm mx-1 mb-2
        ${
          isSelected
            ? "border-orange-500 border-2 text-orange-500 font-semibold"
            : isDarkMode
              ? "border-gray-600 border text-gray-300 hover:border-orange-400 font-medium"
              : "border-gray-300 border text-gray-700 hover:border-orange-400 font-medium"
        }
      `}
    >
      {label}
    </button>
  );
};

// ============================================================================
// LOADING SHIMMER COMPONENT (matches Flutter)
// ============================================================================
const LoadingShimmer: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  return (
    <div className="p-4 space-y-4">
      {/* Color selector shimmer */}
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-20 h-20 rounded-xl animate-pulse ${
              isDarkMode ? "bg-gray-700" : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      {/* Options shimmer */}
      <div
        className={`w-full h-10 rounded-lg animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`}
      />
      <div
        className={`w-full h-10 rounded-lg animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`}
      />
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const ProductOptionSelector: React.FC<ProductOptionSelectorProps> = ({
  product: initialProduct,
  isOpen,
  onClose,
  onConfirm,
  isDarkMode = false,
  localization,
}) => {
  const { user } = useUser();

  // Dynamic import for AttributeLocalizationUtils
  const [AttributeLocalizationUtils, setAttributeLocalizationUtils] = useState<typeof AttributeLocalizationUtilsType | null>(null);
  useEffect(() => {
    import("@/constants/AttributeLocalization").then((mod) => setAttributeLocalizationUtils(() => mod.AttributeLocalizationUtils));
  }, []);

  // ============================================================================
  // STATE - Matching Flutter exactly
  // ============================================================================
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);

  // Curtain dimensions
  const [curtainWidth, setCurtainWidth] = useState("");
  const [curtainHeight, setCurtainHeight] = useState("");

  // Sale preferences
  const [salePreferences, setSalePreferences] =
    useState<SalePreferences | null>(null);

  // ✅ CRITICAL: Fresh product state (matches Flutter)
  const [freshProduct, setFreshProduct] = useState<Product | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ✅ Use fresh product with fallback (matches Flutter)
  const currentProduct = freshProduct || initialProduct;

  // ============================================================================
  // TRANSLATION HELPER
  // ============================================================================
  const t = useCallback(
    (key: string) => {
      if (!localization) return key;

      try {
        const translation = localization(`ProductOptionSelector.${key}`);
        if (translation && translation !== `ProductOptionSelector.${key}`) {
          return translation;
        }

        const directTranslation = localization(key);
        if (directTranslation && directTranslation !== key) {
          return directTranslation;
        }

        return key;
      } catch (error) {
        console.warn(`Translation error for key: ${key}`, error);
        return key;
      }
    },
    [localization],
  );

  // ============================================================================
  // COMPUTED PROPERTIES (matching Flutter getters)
  // ============================================================================
  const hasColors = useMemo(() => {
    const colorImages = currentProduct.colorImages;
    return (
      colorImages != null &&
      typeof colorImages === "object" &&
      Object.keys(colorImages).length > 0
    );
  }, [currentProduct.colorImages]);

  const isCurtain = useMemo(() => {
    return currentProduct.subsubcategory?.toLowerCase() === "curtains";
  }, [currentProduct.subsubcategory]);

  const getSelectableAttributes = useMemo((): Record<string, string[]> => {
    const selectableAttrs: Record<string, string[]> = {};

    const nonSelectableKeys = new Set([
      "clothingType",
      "clothingTypes",
      "pantFabricType",
      "pantFabricTypes",
      "gender",
      "clothingFit",
      "productType",
      "consoleBrand",
      "curtainMaxWidth",
      "curtainMaxHeight",
    ]);

    // Top-level spec arrays — buyer-selectable
    const addIfMultiple = (key: string, values?: string[]) => {
      if (values && values.length > 1) selectableAttrs[key] = values;
    };

    addIfMultiple("clothingSizes", currentProduct.clothingSizes);
    addIfMultiple("pantSizes", currentProduct.pantSizes);
    addIfMultiple("footwearSizes", currentProduct.footwearSizes);
    addIfMultiple("jewelryMaterials", currentProduct.jewelryMaterials);

    // Backward compat — attributes map for old products
    Object.entries(currentProduct.attributes || {}).forEach(([key, value]) => {
      if (nonSelectableKeys.has(key)) return;

      let options: string[] = [];
      if (Array.isArray(value)) {
        options = value
          .map((item) => item?.toString() || "")
          .filter((item) => item.trim() !== "");
      } else if (typeof value === "string" && value.trim() !== "") {
        options = value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item !== "");
      }

      if (options.length > 1) selectableAttrs[key] = options;
    });

    return selectableAttrs;
  }, [currentProduct]);

  // ============================================================================
  // FETCH FRESH PRODUCT DATA (matches Flutter exactly)
  // ============================================================================
  const fetchFreshProductData = useCallback(async () => {
    try {
      setIsLoadingProduct(true);
      setLoadError(null);

      // ✅ Try shop_products first (optimization matching Flutter)
      const shopProductDoc = await getDoc(
        doc(db, "shop_products", initialProduct.id),
      );

      let validDoc = null;

      if (shopProductDoc.exists()) {
        validDoc = shopProductDoc;
      } else {
        // Fallback to products collection
        const productsDoc = await getDoc(
          doc(db, "products", initialProduct.id),
        );
        if (productsDoc.exists()) {
          validDoc = productsDoc;
        }
      }

      if (!validDoc || !validDoc.exists()) {
        setLoadError("Product not found");
        setIsLoadingProduct(false);
        return;
      }

      // Parse fresh product
      const data = validDoc.data();
      const fresh = ProductUtils.fromJson({
        ...data,
        id: validDoc.id,
      });

      setFreshProduct(fresh);
      setIsLoadingProduct(false);
    } catch (error) {
      console.error("❌ Error fetching fresh product:", error);
      setLoadError("Failed to load product details");
      setIsLoadingProduct(false);
    }
  }, [initialProduct.id]);

  // ============================================================================
  // LOAD SALE PREFERENCES (matches Flutter)
  // ============================================================================
  const loadSalePreferencesFromProduct = useCallback(() => {
    if (
      currentProduct.maxQuantity != null ||
      currentProduct.discountThreshold != null ||
      currentProduct.bulkDiscountPercentage != null
    ) {
      const prefs: SalePreferences = {};

      if (currentProduct.maxQuantity != null) {
        prefs.maxQuantity = currentProduct.maxQuantity;
      }
      if (currentProduct.discountThreshold != null) {
        prefs.discountThreshold = currentProduct.discountThreshold;
      }
      if (currentProduct.bulkDiscountPercentage != null) {
        prefs.bulkDiscountPercentage = currentProduct.bulkDiscountPercentage;
      }

      setSalePreferences(prefs);
      // ✅ REMOVED the quantity adjustment - let the useEffect handle it
    }
  }, [
    currentProduct.maxQuantity,
    currentProduct.discountThreshold,
    currentProduct.bulkDiscountPercentage,
    // ✅ REMOVED selectedQuantity dependency
  ]);

  // ============================================================================
  // INITIALIZE DEFAULT SELECTIONS (matches Flutter)
  // ============================================================================
  const initializeDefaultSelections = useCallback(() => {
    const newSelections: Record<string, string> = {};

    // Auto-select top-level spec arrays if single option
    const autoSelectIfSingle = (key: string, values?: string[]) => {
      if (values && values.length === 1) newSelections[key] = values[0];
    };

    autoSelectIfSingle("clothingSizes", currentProduct.clothingSizes);
    autoSelectIfSingle("pantSizes", currentProduct.pantSizes);
    autoSelectIfSingle("footwearSizes", currentProduct.footwearSizes);
    autoSelectIfSingle("jewelryMaterials", currentProduct.jewelryMaterials);

    // Backward compat — attributes map for old products
    Object.entries(currentProduct.attributes || {}).forEach(([key, value]) => {
      let options: string[] = [];
      if (Array.isArray(value)) {
        options = value
          .map((item) => item?.toString() || "")
          .filter((item) => item.trim() !== "");
      } else if (typeof value === "string" && value.trim() !== "") {
        options = value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item !== "");
      }
      if (options.length === 1) newSelections[key] = options[0];
    });

    setSelections(newSelections);

    if (!hasColors) {
      setSelectedColor("default");
    } else {
      setSelectedColor(null);
    }
  }, [currentProduct, hasColors]);

  // ============================================================================
  // QUANTITY HELPERS (matching Flutter)
  // ============================================================================
  const getMaxQuantity = useCallback((): number => {
    if (selectedColor && selectedColor !== "default") {
      return currentProduct.colorQuantities?.[selectedColor] || 0;
    }
    return currentProduct.quantity || 0;
  }, [selectedColor, currentProduct.quantity, currentProduct.colorQuantities]);

  const getMaxQuantityAllowed = useCallback(
    (prefs?: SalePreferences | null): number => {
      const stockQuantity = getMaxQuantity();
      const preferences = prefs || salePreferences;

      if (!preferences?.maxQuantity) return stockQuantity;

      return Math.min(stockQuantity, preferences.maxQuantity);
    },
    [getMaxQuantity, salePreferences],
  );

  // ============================================================================
  // CURTAIN VALIDATION (matches Flutter)
  // ============================================================================
  const validateCurtainDimensions = useCallback((): boolean => {
    if (!isCurtain) return true;

    const widthText = curtainWidth.trim();
    const heightText = curtainHeight.trim();

    if (!widthText || !heightText) return false;

    const width = parseFloat(widthText);
    const height = parseFloat(heightText);

    if (isNaN(width) || width <= 0) return false;
    if (isNaN(height) || height <= 0) return false;

    const maxWidth =
      currentProduct.curtainMaxWidth ??
      currentProduct.attributes?.curtainMaxWidth;
    const maxHeight =
      currentProduct.curtainMaxHeight ??
      currentProduct.attributes?.curtainMaxHeight;

    if (maxWidth != null) {
      const maxW = parseFloat(maxWidth.toString());
      if (!isNaN(maxW) && width > maxW) return false;
    }

    if (maxHeight != null) {
      const maxH = parseFloat(maxHeight.toString());
      if (!isNaN(maxH) && height > maxH) return false;
    }

    return true;
  }, [isCurtain, curtainWidth, curtainHeight, currentProduct]);

  // ============================================================================
  // CONFIRM ENABLED CHECK (matches Flutter exactly)
  // ============================================================================
  const isConfirmEnabled = useMemo(() => {
    if (isCurtain) {
      if (!validateCurtainDimensions()) return false;
    }

    if (hasColors && selectedColor == null) return false;

    const selectableAttrs = getSelectableAttributes;
    for (const key of Object.keys(selectableAttrs)) {
      if (selections[key] == null) return false;
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

  // ============================================================================
  // INITIALIZATION EFFECT (matches Flutter)
  // ============================================================================
  useEffect(() => {
    if (!isOpen) return;

    // Reset state
    setSelectedQuantity(1);
    setCurtainWidth("");
    setCurtainHeight("");
    setSalePreferences(null);

    // Fetch fresh product data
    fetchFreshProductData();
  }, [isOpen, fetchFreshProductData]);

  // Initialize after fresh data loaded
  useEffect(() => {
    if (!isLoadingProduct && freshProduct) {
      loadSalePreferencesFromProduct();
      initializeDefaultSelections();
    }
  }, [
    isLoadingProduct,
    freshProduct,
    loadSalePreferencesFromProduct,
    initializeDefaultSelections,
  ]);

  useEffect(() => {
    setSelectedQuantity((prevQuantity) => {
      // Calculate current max
      let stockQuantity = 0;

      if (selectedColor && selectedColor !== "default") {
        stockQuantity = currentProduct.colorQuantities?.[selectedColor] || 0;
      } else {
        stockQuantity = currentProduct.quantity || 0;
      }

      let maxAllowed = stockQuantity;
      if (salePreferences?.maxQuantity) {
        maxAllowed = Math.min(stockQuantity, salePreferences.maxQuantity);
      }

      // Only change if current quantity exceeds max
      if (prevQuantity > maxAllowed && maxAllowed > 0) {
        return maxAllowed;
      }

      // If no stock, set to 1 (will be disabled by UI)
      if (maxAllowed === 0) {
        return 1;
      }

      // Otherwise keep current quantity
      return prevQuantity;
    });
  }, [
    selectedColor,
    currentProduct.quantity,
    currentProduct.colorQuantities,
    salePreferences,
  ]);

  // ============================================================================
  // HANDLERS
  // ============================================================================
  const handleQuantityChange = useCallback(
    (increment: number) => {
      setSelectedQuantity((prevQuantity) => {
        // ✅ Calculate max stock directly here (fresh values)
        let stockQuantity = 0;

        if (selectedColor && selectedColor !== "default") {
          // Use color-specific quantity
          stockQuantity = currentProduct.colorQuantities?.[selectedColor] || 0;
        } else {
          // Use default quantity
          stockQuantity = currentProduct.quantity || 0;
        }

        // Apply sale preferences limit if exists
        let maxAllowed = stockQuantity;
        if (salePreferences?.maxQuantity) {
          maxAllowed = Math.min(stockQuantity, salePreferences.maxQuantity);
        }

        // Calculate new quantity
        const newQuantity = prevQuantity + increment;

        // Clamp between 1 and maxAllowed
        const clampedQuantity = Math.max(1, Math.min(newQuantity, maxAllowed));

        console.log("🔢 Quantity change:", {
          prevQuantity,
          increment,
          newQuantity,
          selectedColor,
          stockQuantity,
          maxAllowed,
          clampedQuantity,
        });

        return clampedQuantity;
      });
    },
    [
      selectedColor,
      currentProduct.quantity,
      currentProduct.colorQuantities,
      salePreferences,
    ],
  );

  const handleConfirm = useCallback(() => {
    if (!isConfirmEnabled) return;

    const result: OptionSelectorResult = {
      ...selections,
      quantity: isCurtain ? 1 : selectedQuantity,
    };

    if (isCurtain) {
      result.curtainWidth = parseFloat(curtainWidth.trim());
      result.curtainHeight = parseFloat(curtainHeight.trim());
    }

    if (hasColors && selectedColor) {
      result.selectedColor = selectedColor;

      // Add selected color image
      if (selectedColor !== "default") {
        const colorImages = currentProduct.colorImages?.[selectedColor];
        if (
          colorImages &&
          Array.isArray(colorImages) &&
          colorImages.length > 0
        ) {
          result.selectedColorImage = colorImages[0];
        }
      } else if (
        currentProduct.imageUrls &&
        currentProduct.imageUrls.length > 0
      ) {
        result.selectedColorImage = currentProduct.imageUrls[0];
      }
    }

    onConfirm(result);
  }, [
    isConfirmEnabled,
    selections,
    isCurtain,
    selectedQuantity,
    curtainWidth,
    curtainHeight,
    hasColors,
    selectedColor,
    currentProduct,
    onConfirm,
  ]);

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================
  const renderSalePreferenceInfo = useCallback(() => {
    if (
      !salePreferences?.discountThreshold ||
      !salePreferences?.bulkDiscountPercentage
    )
      return null;

    const { discountThreshold, bulkDiscountPercentage } = salePreferences;
    const hasDiscount = selectedQuantity >= discountThreshold;

    return (
      <div
        className={`mt-2 p-2 rounded-lg border ${
          isDarkMode
            ? "bg-blue-900/20 border-blue-800"
            : "bg-blue-50 border-blue-200"
        }`}
      >
        <p
          className={`text-[13px] font-medium text-center ${
            hasDiscount
              ? "text-green-600 dark:text-green-400"
              : "text-orange-600 dark:text-orange-400"
          }`}
        >
          {hasDiscount
            ? `${t("discountApplied")}: ${bulkDiscountPercentage}%`
            : `${t("buyText")} ${discountThreshold} ${t(
                "forDiscount",
              )} ${bulkDiscountPercentage}%!`}
        </p>
      </div>
    );
  }, [salePreferences, selectedQuantity, t, isDarkMode]);

  const renderColorSelector = useCallback(() => {
    if (!hasColors) return null;

    const safeColorImages = currentProduct.colorImages || {};
    const safeColorQuantities = currentProduct.colorQuantities || {};

    return (
      <div className="mb-6">
        <h3 className="text-center text-orange-500 font-bold text-base mb-3">
          {t("selectColor")}
        </h3>
        <div
          className="flex overflow-x-auto pb-2 px-1"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {/* Default option */}
          {currentProduct.imageUrls && currentProduct.imageUrls.length > 0 && (
            <ColorThumb
              colorKey="default"
              imageUrl={currentProduct.imageUrls[0]}
              isSelected={selectedColor === "default"}
              disabled={currentProduct.quantity === 0}
              isDarkMode={isDarkMode}
              onSelect={() => setSelectedColor("default")}
              label={t("default")}
              t={t}
            />
          )}

          {/* Color options */}
          {Object.entries(safeColorImages).map(([colorKey, images]) => {
            if (!images || !Array.isArray(images) || images.length === 0) {
              return null;
            }

            const qty = safeColorQuantities[colorKey] || 0;

            return (
              <ColorThumb
                key={colorKey}
                colorKey={colorKey}
                imageUrl={images[0]}
                isSelected={selectedColor === colorKey}
                disabled={qty === 0}
                isDarkMode={isDarkMode}
                onSelect={() => setSelectedColor(colorKey)}
                label={colorKey}
                t={t}
              />
            );
          })}
        </div>
      </div>
    );
  }, [hasColors, currentProduct, selectedColor, t, isDarkMode]);

  const renderAttributeSelector = useCallback(
    (attributeKey: string, options: string[]) => {
      return (
        <div key={attributeKey} className="mb-6">
          <h3 className="text-center text-orange-500 font-bold text-base mb-3">
            {localization && AttributeLocalizationUtils
              ? AttributeLocalizationUtils.getLocalizedAttributeTitle(
                  attributeKey,
                  localization,
                )
              : attributeKey}
          </h3>
          <div className="flex flex-wrap justify-center">
            {options.map((option) => (
              <AttributeChip
                key={option}
                label={
                  localization && AttributeLocalizationUtils
                    ? AttributeLocalizationUtils.getLocalizedSingleValue(
                        attributeKey,
                        option,
                        localization,
                      )
                    : option
                }
                isSelected={selections[attributeKey] === option}
                isDarkMode={isDarkMode}
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
    [selections, localization, isDarkMode],
  );

  const renderCurtainDimensionsInput = useCallback(() => {
    if (!isCurtain) return null;

    const maxWidth =
      currentProduct.curtainMaxWidth ??
      currentProduct.attributes?.curtainMaxWidth;
    const maxHeight =
      currentProduct.curtainMaxHeight ??
      currentProduct.attributes?.curtainMaxHeight;

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
          className={`p-3 rounded-xl border ${
            isDarkMode
              ? "bg-gray-800/50 border-gray-700"
              : "bg-gray-50 border-gray-200"
          }`}
        >
          {/* Width */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <MoveHorizontal className="text-orange-500" size={20} />
              <label
                className={`text-sm font-medium ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
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
              className={`w-full px-3 py-2 rounded-lg border-2 focus:outline-none ${
                widthExceedsMax
                  ? "border-red-500 focus:border-red-500"
                  : "border-orange-500 focus:border-orange-500"
              } ${
                isDarkMode ? "bg-gray-900 text-white" : "bg-white text-gray-900"
              }`}
            />
            {maxWidth != null && (
              <p
                className={`text-xs mt-1 ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
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

          {/* Height */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MoveVertical className="text-orange-500" size={20} />
              <label
                className={`text-sm font-medium ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
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
              className={`w-full px-3 py-2 rounded-lg border-2 focus:outline-none ${
                heightExceedsMax
                  ? "border-red-500 focus:border-red-500"
                  : "border-orange-500 focus:border-orange-500"
              } ${
                isDarkMode ? "bg-gray-900 text-white" : "bg-white text-gray-900"
              }`}
            />
            {maxHeight != null && (
              <p
                className={`text-xs mt-1 ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
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
  }, [isCurtain, curtainWidth, curtainHeight, currentProduct, t, isDarkMode]);

  const renderQuantitySelector = useCallback(() => {
    if (isCurtain) return null;

    const safeMax = getMaxQuantityAllowed();

    return (
      <div className="mb-6">
        <h3 className="text-center text-orange-500 font-bold text-base mb-3">
          {t("quantity")}
        </h3>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => handleQuantityChange(-1)}
            disabled={selectedQuantity <= 1}
            className={`p-2 rounded-full transition-colors ${
              isDarkMode
                ? "text-white disabled:opacity-50 disabled:cursor-not-allowed"
                : "text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            <Minus size={24} />
          </button>

          <div className="px-4 py-2 border-2 border-orange-500 rounded-lg min-w-[60px] text-center">
            <span
              className={`text-lg font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {selectedQuantity}
            </span>
          </div>

          <button
            onClick={() => handleQuantityChange(1)}
            disabled={selectedQuantity >= safeMax}
            className={`p-2 rounded-full transition-colors ${
              isDarkMode
                ? "text-white disabled:opacity-50 disabled:cursor-not-allowed"
                : "text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            <Plus size={24} />
          </button>
        </div>

        {renderSalePreferenceInfo()}
      </div>
    );
  }, [
    isCurtain,
    selectedQuantity,
    getMaxQuantityAllowed,
    handleQuantityChange,
    t,
    isDarkMode,
    renderSalePreferenceInfo,
  ]);

  // ============================================================================
  // CHECK TOTAL STOCK (matches Flutter)
  // ============================================================================
  const totalStock = useMemo(() => {
    let total = currentProduct.quantity || 0;
    Object.values(currentProduct.colorQuantities || {}).forEach((qty) => {
      total += qty || 0;
    });
    return total;
  }, [currentProduct.quantity, currentProduct.colorQuantities]);

  // ============================================================================
  // ANIMATION STATE FOR CSS TRANSITIONS
  // ============================================================================
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle open/close animations
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Small delay to ensure DOM is ready for animation
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else if (shouldRender) {
      setIsAnimating(false);
      // Wait for exit animation to complete before unmounting
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 250); // Match exit animation duration
      return () => clearTimeout(timer);
    }
  }, [isOpen, shouldRender]);

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  if (!user) return null;

  if (!shouldRender) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={onClose}
        className={`fixed inset-0 z-[9998] bg-black/50 ${
          isAnimating ? "modal-backdrop-enter" : "modal-backdrop-exit"
        }`}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className={`fixed inset-x-0 bottom-0 z-[9999] max-h-[90vh] ${
          isAnimating ? "modal-content-enter" : "modal-content-exit"
        }`}
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
              className={`text-base font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("selectOptions")}
            </h2>
            <button
              onClick={onClose}
              className={`p-1 rounded-full transition-colors ${
                isDarkMode
                  ? "hover:bg-gray-800 text-gray-400"
                  : "hover:bg-gray-100 text-gray-500"
              }`}
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[60vh] overflow-y-auto">
            {/* Loading state */}
            {isLoadingProduct ? (
              <LoadingShimmer isDarkMode={isDarkMode} />
            ) : /* Error state */ loadError ? (
              <div className="p-6 flex flex-col items-center">
                <AlertCircle size={48} className="text-red-500 mb-4" />
                <p
                  className={`text-base font-medium text-center ${
                    isDarkMode ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  {loadError}
                </p>
              </div>
            ) : /* Out of stock */ totalStock <= 0 ? (
              <div className="p-6 flex flex-col items-center">
                <div
                  className={`p-3 rounded-full mb-4 ${
                    isDarkMode ? "bg-gray-800" : "bg-gray-100"
                  }`}
                >
                  <ShoppingBag size={32} className="text-gray-500" />
                </div>
                <p
                  className={`text-base font-medium text-center ${
                    isDarkMode ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  {t("productOutOfStock")}
                </p>
              </div>
            ) : (
              /* Main content */
              <div className="p-4">
                {renderColorSelector()}

                {Object.entries(getSelectableAttributes).map(([key, options]) =>
                  renderAttributeSelector(key, options),
                )}

                {isCurtain
                  ? renderCurtainDimensionsInput()
                  : renderQuantitySelector()}
              </div>
            )}
          </div>

          {/* Footer */}
          {!isLoadingProduct && !loadError && totalStock > 0 && (
            <div
              className={`p-4 border-t ${
                isDarkMode ? "border-gray-700" : "border-gray-200"
              }`}
            >
              <button
                onClick={handleConfirm}
                disabled={!isConfirmEnabled}
                className={`
                  w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 text-base
                  ${
                    isConfirmEnabled
                      ? `${
                          isDarkMode ? "text-white" : "text-white"
                        } bg-orange-500 hover:bg-orange-600`
                      : `${
                          isDarkMode
                            ? "bg-gray-700 text-gray-500"
                            : "bg-gray-300 text-gray-500"
                        } cursor-not-allowed`
                  }
                `}
              >
                {t("confirm")}
              </button>

              <button
                onClick={onClose}
                className={`w-full py-2 mt-2 text-sm transition-colors ${
                  isDarkMode
                    ? "text-gray-400 hover:text-gray-200"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                {t("cancel")}
              </button>
            </div>
          )}

          {/* Error/Loading footer */}
          {(isLoadingProduct || loadError || totalStock <= 0) && (
            <div
              className={`p-4 border-t ${
                isDarkMode ? "border-gray-700" : "border-gray-200"
              }`}
            >
              <button
                onClick={onClose}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                  isDarkMode
                    ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {t("close")}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ProductOptionSelector;
