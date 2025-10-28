"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, Check, Loader2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { useTranslations } from 'next-intl';
import { db } from '@/lib/firebase';
import { useUser } from '@/context/UserProvider';
import { AttributeLocalizationUtils } from '@/constants/AttributeLocalization';
import { Product } from '@/app/models/Product';

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
  selectedMetres?: number;
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
        ${isSelected 
          ? 'border-orange-500 border-3 shadow-lg' 
          : isDarkMode 
            ? 'border-gray-600 hover:border-orange-400' 
            : 'border-gray-300 hover:border-orange-400'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <img
        src={imageUrl}
        alt={label || `${t('color')} ${colorKey}`}
        className="w-full h-full object-cover"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          target.nextElementSibling?.classList.remove('hidden');
        }}
      />
      
      {/* Fallback icon */}
      <div className={`hidden absolute inset-0 flex items-center justify-center ${
        isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
      }`}>
        <div className="w-6 h-6 bg-gray-400 rounded" />
      </div>

      {/* Disabled overlay */}
      {disabled && (
        <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center">
          <span className="text-white text-xs font-bold text-center px-1">
            {t('noStock')}
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
        ${isSelected
          ? 'border-orange-500 border-2 text-orange-500 bg-orange-50 dark:bg-orange-950'
          : isDarkMode
            ? 'border-gray-600 text-gray-300 hover:border-orange-400'
            : 'border-gray-300 text-gray-700 hover:border-orange-400'
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
        setDetectedDarkMode(document.documentElement.classList.contains("dark"));
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
  const t = useCallback((key: string) => {
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
  }, [localization]);

  // Use provided isDarkMode prop or auto-detected value
  const actualDarkMode = isDarkMode || detectedDarkMode;
  const { user } = useUser();
  
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [selectedMetres, setSelectedMetres] = useState(1);
  const [salePreferences, setSalePreferences] = useState<SalePreferences | null>(null);
  const [isLoadingSalePrefs, setIsLoadingSalePrefs] = useState(false);
  

  const isCurtain = useMemo(() => {
    return product.subsubcategory === "Curtains";
  }, [product.subsubcategory]);
  
  const maxMetres = useMemo(() => {    
    return product.maxMetre && product.maxMetre > 0 ? product.maxMetre : 100;
  }, [product.maxMetre]);

  // Initialize default selections and load sale preferences
  useEffect(() => {
    if (!isOpen) return;

    // Initialize default selections for single-option attributes
    const newSelections: Record<string, string> = {};
    Object.entries(product.attributes || {}).forEach(([key, value]) => {
      let options: string[] = [];

      if (Array.isArray(value)) {
        options = value
          .map(item => item.toString())
          .filter(item => item.trim() !== '');
      } else if (typeof value === 'string' && value.trim() !== '') {
        options = value
          .split(',')
          .map(item => item.trim())
          .filter(item => item !== '');
      }

      // Auto-select single options
      if (options.length === 1) {
        newSelections[key] = options[0];
      }
    });

    setSelections(newSelections);
    if (Object.keys(product.colorImages || {}).length === 0 && product.imageUrls && product.imageUrls.length > 0) {
      setSelectedColor('default');
    } else {
      setSelectedColor(null);
    }
    setSelectedQuantity(1);
    setSelectedMetres(1);
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
      if (parentCollection !== 'shop_products') return;

      const salePrefsDoc = await getDoc(
        doc(db, product.reference.path, 'sale_preferences', 'preferences')
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
      console.error('Error loading sale preferences:', error);
    } finally {
      setIsLoadingSalePrefs(false);
    }
  }, [product.reference, selectedQuantity]);

  const getMaxQuantityAllowed = useCallback((prefs?: SalePreferences | null) => {
    const stockQuantity = getMaxQuantity();
    const preferences = prefs || salePreferences;
    
    if (!preferences?.maxQuantity) return stockQuantity;
    
    return Math.min(stockQuantity, preferences.maxQuantity);
  }, [selectedColor, product.quantity, product.colorQuantities, salePreferences]);

  const getMaxQuantity = useCallback(() => {
    if (selectedColor && selectedColor !== 'default') {
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
          .map(item => item.toString())
          .filter(item => item.trim() !== '');
      } else if (typeof value === 'string' && value.trim() !== '') {
        options = value
          .split(',')
          .map(item => item.trim())
          .filter(item => item !== '');
      }

      // Only include attributes with multiple options
      if (options.length > 1) {
        selectableAttrs[key] = options;
      }
    });

    return selectableAttrs;
  }, [product.attributes]);

  const hasColors = useMemo(() => {
    return Object.keys(product.colorImages || {}).length > 0;  // ✅ CHANGED - Only check colorImages
  }, [product.colorImages]);

  const isConfirmEnabled = useMemo(() => {
    if (hasColors && !selectedColor) return false;

    // Check if all selectable attributes have been selected
    for (const key of Object.keys(getSelectableAttributes)) {
      if (!selections[key]) return false;
    }

    return selectedQuantity > 0;
  }, [hasColors, selectedColor, selections, getSelectableAttributes, selectedQuantity]);

  const handleConfirm = useCallback(() => {
    console.log('ProductOptionSelector - Confirm clicked', {
      productId: product.id,
      selectedColor,
      selectedQuantity,
      selectedMetres: isCurtain ? selectedMetres : undefined,  // ✅ ADD THIS LINE
      selections,
    });
  
    const result: OptionSelectorResult = {
      quantity: selectedQuantity,
      selectedMetres: isCurtain ? selectedMetres : undefined,
    };    
    // Add color selection if applicable
    if (selectedColor) {  // ✅ CHANGED - Remove hasColors check
      result.selectedColor = selectedColor;
      
      // Add selected color image URL if color is selected
      if (selectedColor !== 'default') {
        const colorImages = product.colorImages[selectedColor];
        if (colorImages && colorImages.length > 0) {
          result.selectedColorImage = colorImages[0];
        }
      } else if (product.imageUrls && product.imageUrls.length > 0) {
        result.selectedColorImage = product.imageUrls[0];
      }
    }
    
    // ✅ ADD THIS - Include all selected attributes (like size)
    Object.entries(selections).forEach(([key, value]) => {
      result[key] = value;
    });
    
    onConfirm(result);
  }, [isConfirmEnabled, selectedQuantity, selections, hasColors, selectedColor, product, onConfirm, isCurtain, selectedMetres]);

  const handleQuantityChange = useCallback((increment: number) => {
    const maxAllowed = getMaxQuantityAllowed();
    const newQuantity = selectedQuantity + increment;
    
    if (newQuantity >= 1 && newQuantity <= maxAllowed) {
      setSelectedQuantity(newQuantity);
      
      console.log('ProductOptionSelector - Quantity changed:', {
        productId: product.id,
        oldQuantity: selectedQuantity,
        newQuantity,
        maxAllowed
      });
    }
  }, [selectedQuantity, getMaxQuantityAllowed, product.id]);

  // Update selected quantity when color changes (to respect color-specific stock limits)
  useEffect(() => {
    const maxAllowed = getMaxQuantityAllowed();
    if (selectedQuantity > maxAllowed) {
      const adjustedQuantity = Math.max(1, maxAllowed);
      setSelectedQuantity(adjustedQuantity);
      
      console.log('ProductOptionSelector - Quantity adjusted for color/stock:', {
        productId: product.id,
        selectedColor,
        oldQuantity: selectedQuantity,
        newQuantity: adjustedQuantity,
        maxAllowed
      });
    }
  }, [selectedColor, salePreferences, selectedQuantity, getMaxQuantityAllowed, product.id]);

  const renderSalePreferenceInfo = useCallback(() => {
    if (!salePreferences?.discountThreshold || !salePreferences?.discountPercentage) return null;

    const { discountThreshold, discountPercentage } = salePreferences;
    const hasDiscount = selectedQuantity >= discountThreshold;

    return (
      <div className={`mt-4 p-3 rounded-lg border ${
        actualDarkMode 
          ? 'bg-blue-900/20 border-blue-800' 
          : 'bg-blue-50 border-blue-200'
      }`}>
        <div className="text-center">
          <p className={`text-sm font-medium ${
            hasDiscount 
              ? 'text-green-600 dark:text-green-400' 
              : 'text-orange-600 dark:text-orange-400'
          }`}>
            {hasDiscount 
              ? `${t('discountApplied')}: ${discountPercentage}%`
              : `${t('buyText')} ${discountThreshold} ${t('forDiscount')} ${discountPercentage}%!`
            }
          </p>
        </div>
      </div>
    );
  }, [salePreferences, selectedQuantity, t, actualDarkMode]);

  const renderColorSelector = useCallback(() => {
    if (!hasColors) return null;

    return (
      <div className="mb-6">
        <h3 className="text-center text-orange-500 font-bold text-base mb-3">
          {t('selectColor')}
        </h3>
        <div className="flex overflow-x-auto pb-2 px-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {/* Default option - only show if main imageUrls exist */}
          {product.imageUrls && product.imageUrls.length > 0 && (
            <ColorThumb
              colorKey="default"
              imageUrl={product.imageUrls[0]}
              isSelected={selectedColor === 'default'}
              disabled={product.quantity === 0}
              isDarkMode={actualDarkMode}
              onSelect={() => {
                setSelectedColor('default');
                console.log('ProductOptionSelector - Color selected:', { productId: product.id, selectedColor: 'default' });
              }}
              label={t('default')}
              t={t}
            />
          )}
          
          {/* Color options from colorImages */}
          {Object.entries(product.colorImages || {}).map(([colorKey, images]) => {
            const qty = product.colorQuantities[colorKey] || 0;
            return (
              <ColorThumb
                key={colorKey}
                colorKey={colorKey}
                imageUrl={images[0]}
                isSelected={selectedColor === colorKey}
                disabled={qty === 0}
                isDarkMode={actualDarkMode}
                onSelect={() => {
                  setSelectedColor(colorKey);
                  console.log('ProductOptionSelector - Color selected:', { productId: product.id, selectedColor: colorKey, availableQty: qty });
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

  const renderAttributeSelector = useCallback((attributeKey: string, options: string[]) => {
    return (
      <div key={attributeKey} className="mb-6">
        <h3 className="text-center text-orange-500 font-bold text-base mb-3">
          {localization ? AttributeLocalizationUtils.getLocalizedAttributeTitle(attributeKey, localization) : attributeKey}
        </h3>
        <div className="flex flex-wrap justify-center">
          {options.map((option) => (
            <AttributeChip
              key={option}
              label={localization ? AttributeLocalizationUtils.getLocalizedSingleValue(attributeKey, option, localization) : option}
              isSelected={selections[attributeKey] === option}
              isDarkMode={actualDarkMode}
              onSelect={() => {
                setSelections(prev => ({ ...prev, [attributeKey]: option }));
                console.log('ProductOptionSelector - Attribute selected:', { 
                  productId: product.id, 
                  attributeKey, 
                  option,
                  allSelections: { ...selections, [attributeKey]: option }
                });
              }}
            />
          ))}
        </div>
      </div>
    );
  }, [selections, localization, product.id, actualDarkMode]);

  const renderQuantitySelector = useCallback(() => {
    const maxAllowed = getMaxQuantityAllowed();
    
    return (
      <div className="mb-6">
        <h3 className="text-center text-orange-500 font-bold text-base mb-3">
          {t('quantity')}
        </h3>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => handleQuantityChange(-1)}
            disabled={selectedQuantity <= 1}
            className={`p-2 rounded-full border transition-colors ${
              actualDarkMode
                ? 'border-gray-600 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed'
                : 'border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed'
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
                ? 'border-gray-600 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed'
                : 'border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed'
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
  }, [selectedQuantity, getMaxQuantityAllowed, handleQuantityChange, isLoadingSalePrefs, t, actualDarkMode]);

  const renderMetreSelector = useCallback(() => {
    if (!isCurtain) return null;
    
    return (
      <div className="mb-6">
        <h3 className="text-center text-orange-500 font-bold text-base mb-3">
          {t('metres')} {t('max')}: {maxMetres}m
        </h3>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setSelectedMetres(prev => Math.max(1, prev - 1))}
            disabled={selectedMetres <= 1}
            className={`p-2 rounded-full border transition-colors ${
              actualDarkMode
                ? 'border-gray-600 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed'
                : 'border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <Minus size={20} />
          </button>
          
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max={maxMetres}
              value={selectedMetres}
              onChange={(e) => {
                const value = Math.min(Math.max(1, parseInt(e.target.value) || 1), maxMetres);
                setSelectedMetres(value);
              }}
              className={`px-4 py-2 border border-orange-500 rounded-lg w-24 text-center text-lg font-semibold ${
                actualDarkMode 
                  ? 'bg-gray-800 text-white' 
                  : 'bg-white text-gray-900'
              }`}
            />
            <span className={`text-sm ${actualDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              m
            </span>
          </div>
          
          <button
            onClick={() => setSelectedMetres(prev => Math.min(maxMetres, prev + 1))}
            disabled={selectedMetres >= maxMetres}
            className={`p-2 rounded-full border transition-colors ${
              actualDarkMode
                ? 'border-gray-600 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed'
                : 'border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            <Plus size={20} />
          </button>
        </div>
        
        {/* Info text */}
        <p className={`text-xs text-center mt-2 ${
          actualDarkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          {t('metreInfo') || 'Enter the length in metres'}
        </p>
      </div>
    );
  }, [isCurtain, maxMetres, selectedMetres, t, actualDarkMode]);

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
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh]"
          >
            <div className={`rounded-t-2xl shadow-2xl max-w-lg mx-auto ${
              isDarkMode ? 'bg-gray-900' : 'bg-white'
            }`}>
              {/* Header */}
              <div className={`flex items-center justify-between p-4 border-b ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <h2 className={`text-lg font-semibold ${
                  isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  {t('selectOptions')}
                </h2>
                <button
                  onClick={onClose}
                  className={`p-1 rounded-full transition-colors ${
                    isDarkMode 
                      ? 'hover:bg-gray-800 text-gray-500' 
                      : 'hover:bg-gray-100 text-gray-500'
                  }`}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 max-h-[60vh] overflow-y-auto">
                {/* Color selector */}
                {renderColorSelector()}

                {/* Dynamic attribute selectors */}
                {Object.entries(getSelectableAttributes).map(([key, options]) =>
                  renderAttributeSelector(key, options)
                )}

                {/* Quantity selector */}
                {!isCurtain && renderQuantitySelector()}

                {/* Metre selector */}
                {renderMetreSelector()}

                {/* Sale preference info */}
                {renderSalePreferenceInfo()}
              </div>

              {/* Footer */}
              <div className={`p-4 border-t space-y-2 ${
                isDarkMode ? 'border-gray-700' : 'border-gray-200'
              }`}>
                <button
                  onClick={handleConfirm}
                  disabled={!isConfirmEnabled}
                  className={`
                    w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200
                    ${isConfirmEnabled
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : isDarkMode
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }
                  `}
                >
                  {t('confirm')} {selectedQuantity > 1 && `(${selectedQuantity})`}
                </button>
                
                <button
                  onClick={onClose}
                  className={`w-full py-2 px-4 transition-colors ${
                    isDarkMode 
                      ? 'text-gray-400 hover:text-gray-200' 
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  {t('cancel')}
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