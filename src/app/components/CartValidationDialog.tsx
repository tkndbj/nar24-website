// components/CartValidationDialog.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Product } from '@/app/models/Product';

// ==================== CUSTOM SVG ICONS ====================
const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const AlertCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const AlertTriangleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const CheckCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ShoppingCartIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  </svg>
);

const InfoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ArrowRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);

const BlockIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
  </svg>
);

const ImageOffIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

// ==================== INTERFACES ====================
interface ValidationError {
  key: string;
  params: Record<string, unknown>;
}

interface ValidatedItem {
  productId: string;
  unitPrice?: number;
  bundlePrice?: number;
  discountPercentage?: number;
  discountThreshold?: number;
  bulkDiscountPercentage?: number;
  maxQuantity?: number;
  selectedColor?: string;
  colorImage?: string;
}

interface CartItem {
  productId: string;
  quantity: number;
  product?: Product | null;
  cartData?: {
    selectedColor?: string;
  };
}

interface CartValidationDialogProps {
  open: boolean;
  errors: Record<string, ValidationError>;
  warnings: Record<string, ValidationError>;
  validatedItems: ValidatedItem[];
  cartItems: CartItem[];
  onContinue: () => void;
  onCancel: () => void;
}

interface ParsedWarning {
  label: string;
  oldValue: string;
  newValue: string;
}

// ==================== MAIN COMPONENT ====================
const CartValidationDialog: React.FC<CartValidationDialogProps> = ({
  open,
  errors,
  warnings,
  validatedItems,
  cartItems,
  onContinue,
  onCancel,
}) => {
  const t = useTranslations();
  const [confirmedWarnings, setConfirmedWarnings] = useState<Set<string>>(new Set());

  const hasErrors = Object.keys(errors).length > 0;
  const hasWarnings = Object.keys(warnings).length > 0;
  const allWarningsConfirmed = !hasWarnings || confirmedWarnings.size === Object.keys(warnings).length;
  const hasValidProducts = cartItems.length > Object.keys(errors).length;

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  // Find product by ID
  const findProduct = (productId: string): Product | undefined => {
    const item = cartItems.find((item) => item.productId === productId);
    return item?.product ?? undefined;
  };

  // Find validated item by ID
  const findValidatedItem = (productId: string): ValidatedItem | undefined => {
    return validatedItems.find((item) => item.productId === productId);
  };

  // Toggle warning confirmation
  const toggleWarningConfirmation = (productId: string) => {
    setConfirmedWarnings((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  // Localize validation messages
  const localizeValidationMessage = (message: ValidationError): string => {
    if (!message || !message.key) return t('validation.unknownError');

    const key = message.key;
    const params = message.params || {};

    // Helper functions for safe type extraction
    const safeInt = (key: string, defaultValue: number = 0): number => {
      const value = params[key];
      if (value === null || value === undefined) return defaultValue;
      if (typeof value === 'number') return Math.floor(value);
      if (typeof value === 'string') return parseInt(value, 10) || defaultValue;
      return defaultValue;
    };

    const safeString = (key: string, defaultValue: string = ''): string => {
      const value = params[key];
      if (value === null || value === undefined) return defaultValue;
      return String(value);
    };

    try {
      switch (key) {
        // ========== ERRORS ==========
        case 'product_not_available':
          return t('validation.productNotAvailable');

        case 'product_unavailable':
          return t('validation.productCurrentlyUnavailable');

        case 'out_of_stock':
          return t('validation.outOfStock');

        case 'insufficient_stock':
          const available = safeInt('available', 0);
          const requested = safeInt('requested', 0);
          return t('validation.insufficientStock', { available, requested });

        case 'max_quantity_exceeded':
          const maxQuantity = safeInt('maxQuantity', 1);
          return t('validation.maxQuantityExceeded', { maxQuantity });

        // ========== WARNINGS ==========
        case 'price_changed':
          const currency = safeString('currency', 'TL');
          const oldPrice = safeString('oldPrice', '0.00');
          const newPrice = safeString('newPrice', '0.00');
          return t('validation.priceChanged', { currency, oldPrice, newPrice });

        case 'bundle_price_changed':
          const bundleCurrency = safeString('currency', 'TL');
          const bundleOldPrice = safeString('oldPrice', '0.00');
          const bundleNewPrice = safeString('newPrice', '0.00');
          return t('validation.bundlePriceChanged', { 
            currency: bundleCurrency, 
            oldPrice: bundleOldPrice, 
            newPrice: bundleNewPrice 
          });

        case 'discount_updated':
          const oldDiscount = safeInt('oldDiscount', 0);
          const newDiscount = safeInt('newDiscount', 0);
          return t('validation.discountUpdated', { oldDiscount, newDiscount });

        case 'discount_threshold_changed':
          const oldThreshold = safeInt('oldThreshold', 0);
          const newThreshold = safeInt('newThreshold', 0);
          return t('validation.discountThresholdChanged', { oldThreshold, newThreshold });

        case 'max_quantity_reduced':
          const oldMax = safeInt('oldMax', 0);
          const newMax = safeInt('newMax', 0);
          return t('validation.maxQuantityReduced', { oldMax, newMax });

        // ========== SPECIAL CASES ==========
        case 'reservation_failed':
          return t('validation.reservationFailed') || 'Failed to reserve stock. Please try again.';

        case 'legacy_message':
          return safeString('message', 'Unknown error');

        case 'unknown':
        default:
          const fallbackMessage = safeString('message');
          if (fallbackMessage) return fallbackMessage;
          return `Validation error: ${key}`;
      }
    } catch (error) {
      console.error('Error localizing message:', error, 'key:', key, 'params:', params);
      return t('validation.errorOccurred');
    }
  };

  // Parse warning for old/new value display
  const parseLocalizedWarning = (warningData: ValidationError): ParsedWarning | null => {
    if (!warningData || !warningData.key) return null;

    const key = warningData.key;
    const params = warningData.params || {};

    const safeString = (key: string, defaultValue: string = '0'): string => {
      const value = params[key];
      if (value === null || value === undefined) return defaultValue;
      return String(value);
    };

    try {
      switch (key) {
        case 'price_changed':
        case 'bundle_price_changed':
          const currency = safeString('currency', 'TL');
          const oldPrice = safeString('oldPrice', '0.00');
          const newPrice = safeString('newPrice', '0.00');

          return {
            label: key === 'price_changed' ? t('validation.price') : t('validation.bundlePrice'),
            oldValue: `${currency} ${oldPrice}`,
            newValue: `${currency} ${newPrice}`,
          };

        case 'discount_updated':
          const oldDiscount = safeString('oldDiscount', '0');
          const newDiscount = safeString('newDiscount', '0');

          return {
            label: t('validation.discount'),
            oldValue: `${oldDiscount}%`,
            newValue: `${newDiscount}%`,
          };

        case 'discount_threshold_changed':
          const oldThreshold = safeString('oldThreshold', '0');
          const newThreshold = safeString('newThreshold', '0');

          return {
            label: t('validation.discountThreshold'),
            oldValue: `${t('validation.buy')} ${oldThreshold}+`,
            newValue: `${t('validation.buy')} ${newThreshold}+`,
          };

        case 'max_quantity_reduced':
          const oldMax = safeString('oldMax', '0');
          const newMax = safeString('newMax', '0');

          return {
            label: t('validation.maxQuantity'),
            oldValue: oldMax,
            newValue: newMax,
          };

        default:
          return null;
      }
    } catch (error) {
      console.error('Error parsing warning:', error, 'key:', key);
      return null;
    }
  };

  // Build header subtitle
  const headerSubtitle = useMemo(() => {
    const errorCount = Object.keys(errors).length;
    const warningCount = Object.keys(warnings).length;

    if (hasErrors && hasWarnings) {
      return t('validation.bothIssues', { errorCount, warningCount });
    } else if (hasErrors) {
      return t('validation.errorsCount', { count: errorCount });
    } else {
      return t('validation.warningsCount', { count: warningCount });
    }
  }, [errors, warnings, hasErrors, hasWarnings, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                hasErrors
                  ? 'bg-red-100 dark:bg-red-900/20'
                  : 'bg-orange-100 dark:bg-orange-900/20'
              }`}
            >
              {hasErrors ? (
                <AlertCircleIcon className="w-6 h-6 text-red-600 dark:text-red-500" />
              ) : (
                <AlertTriangleIcon className="w-6 h-6 text-orange-600 dark:text-orange-500" />
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {t('validation.issuesDetected')}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                {headerSubtitle}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Error Products */}
          {hasErrors && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircleIcon className="w-4.5 h-4.5 text-red-600" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  {t('validation.errorsTitle')}
                </h3>
              </div>
              <div className="space-y-3">
                {Object.entries(errors).map(([productId, errorData]) => (
                  <ErrorProductCard
                    key={productId}
                    productId={productId}
                    errorData={errorData}
                    product={findProduct(productId)}
                    validatedItem={findValidatedItem(productId)}
                    localizeMessage={localizeValidationMessage}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Warning Products */}
          {hasWarnings && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangleIcon className="w-4.5 h-4.5 text-orange-600" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  {t('validation.warningsTitle')}
                </h3>
              </div>
              <div className="space-y-3">
                {Object.entries(warnings).map(([productId, warningData]) => (
                  <WarningProductCard
                    key={productId}
                    productId={productId}
                    warningData={warningData}
                    product={findProduct(productId)}
                    validatedItem={findValidatedItem(productId)}
                    isConfirmed={confirmedWarnings.has(productId)}
                    onToggleConfirm={() => toggleWarningConfirmation(productId)}
                    localizeMessage={localizeValidationMessage}
                    parseWarning={parseLocalizedWarning}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="flex flex-col gap-3">
            {hasValidProducts && (
              <button
                onClick={onContinue}
                disabled={(hasWarnings && !allWarningsConfirmed) || !hasValidProducts}
                className="w-full h-12 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed"
              >
                {hasErrors ? (
                  <>
                    <ShoppingCartIcon className="w-5 h-5" />
                    {t('validation.continueWithoutErrors')}
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-5 h-5" />
                    {t('validation.continueWithChanges')}
                  </>
                )}
              </button>
            )}
            <button
              onClick={onCancel}
              className="w-full h-12 font-semibold rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== ERROR PRODUCT CARD ====================
interface ErrorProductCardProps {
    productId: string;
    errorData: ValidationError;
    product?: Product;
    validatedItem?: ValidatedItem;
    localizeMessage: (message: ValidationError) => string;
    t: (key: string, options?: Record<string, string | number | Date>) => string; // ✅ FIX HERE
  }

const ErrorProductCard: React.FC<ErrorProductCardProps> = ({  
  errorData,
  product,
  validatedItem,
  localizeMessage,
  t,
}) => {
  const errorMessage = localizeMessage(errorData);
  const colorImage = validatedItem?.colorImage;
  const selectedColor = validatedItem?.selectedColor;

  return (
    <div className="rounded-2xl border-2 border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 overflow-hidden">
      {/* Product Info */}
      <div className="p-3 flex gap-3">
        <ProductImage
          colorImage={colorImage}
          product={product}
          size={60}
        />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
            {product?.productName || t('validation.unknownProduct')}
          </h4>
          {selectedColor && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {t('validation.color')}: {selectedColor}
            </p>
          )}
          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 bg-red-100 dark:bg-red-900/30 rounded-lg">
            <BlockIcon className="w-3 h-3 text-red-600" />
            <span className="text-xs font-semibold text-red-600 line-clamp-2">
              {errorMessage}
            </span>
          </div>
        </div>
      </div>

      {/* Notice Banner */}
      <div className="px-3 py-2.5 bg-red-100 dark:bg-red-900/20 flex items-center gap-2">
        <InfoIcon className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
        <span className="text-xs font-medium text-red-600">
          {t('validation.willBeRemoved')}
        </span>
      </div>
    </div>
  );
};

// ==================== WARNING PRODUCT CARD ====================
interface WarningProductCardProps {
    productId: string;
    warningData: ValidationError;
    product?: Product;
    validatedItem?: ValidatedItem;
    isConfirmed: boolean;
    onToggleConfirm: () => void;
    localizeMessage: (message: ValidationError) => string;
    parseWarning: (warningData: ValidationError) => ParsedWarning | null;
    t: (key: string, options?: Record<string, string | number | Date>) => string; // ✅ FIX HERE
  }

const WarningProductCard: React.FC<WarningProductCardProps> = ({
  
  warningData,
  product,
  validatedItem,
  isConfirmed,
  onToggleConfirm,
  localizeMessage,
  parseWarning,
  t,
}) => {
  const warningMessage = localizeMessage(warningData);
  const parsedWarning = parseWarning(warningData);
  const colorImage = validatedItem?.colorImage;
  const selectedColor = validatedItem?.selectedColor;

  return (
    <div
      className={`rounded-2xl border-2 overflow-hidden transition-all ${
        isConfirmed
          ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10'
          : 'border-orange-300 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10'
      }`}
    >
      {/* Product Info */}
      <div className="p-3 flex gap-3">
        <ProductImage
          colorImage={colorImage}
          product={product}
          size={60}
        />
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
            {product?.productName || t('validation.unknownProduct')}
          </h4>
          {selectedColor && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {t('validation.color')}: {selectedColor}
            </p>
          )}
          <div className="mt-2">
            {parsedWarning ? (
              <WarningDetail parsedWarning={parsedWarning} />
            ) : (
              <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <AlertTriangleIcon className="w-3 h-3 text-orange-600" />
                <span className="text-xs font-semibold text-orange-600 line-clamp-2">
                  {warningMessage}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Checkbox */}
      <button
        onClick={onToggleConfirm}
        className={`w-full px-3 py-3 flex items-center gap-2 transition-colors ${
          isConfirmed
            ? 'bg-emerald-100 dark:bg-emerald-900/20 hover:bg-emerald-200 dark:hover:bg-emerald-900/30'
            : 'bg-orange-100 dark:bg-orange-900/20 hover:bg-orange-200 dark:hover:bg-orange-900/30'
        }`}
      >
        <div
          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
            isConfirmed
              ? 'bg-emerald-600 border-emerald-600'
              : 'bg-transparent border-gray-400'
          }`}
        >
          {isConfirmed && <CheckCircleIcon className="w-3.5 h-3.5 text-white" />}
        </div>
        <span
          className={`text-xs font-semibold ${
            isConfirmed ? 'text-emerald-700 dark:text-emerald-400' : 'text-orange-700 dark:text-orange-400'
          }`}
        >
          {t('validation.acceptChange')}
        </span>
      </button>
    </div>
  );
};

// ==================== WARNING DETAIL ====================
interface WarningDetailProps {
  parsedWarning: ParsedWarning;
}

const WarningDetail: React.FC<WarningDetailProps> = ({ parsedWarning }) => {
  return (
    <div className="p-2.5 bg-orange-100 dark:bg-orange-900/30 rounded-lg border border-orange-200 dark:border-orange-800">
      <p className="text-[10px] font-bold text-orange-800 dark:text-orange-400 uppercase tracking-wide mb-1.5">
        {parsedWarning.label}
      </p>
      <div className="flex items-center gap-2">
        {/* Old Value */}
        <div className="flex-1 p-2 bg-gray-200 dark:bg-gray-800 rounded-lg">
          <p className="text-[9px] font-semibold text-gray-600 dark:text-gray-500 mb-0.5">
            OLD
          </p>
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 line-through">
            {parsedWarning.oldValue}
          </p>
        </div>
        <ArrowRightIcon className="w-4 h-4 text-orange-600 flex-shrink-0" />
        {/* New Value */}
        <div className="flex-1 p-2 bg-orange-200 dark:bg-orange-900/40 rounded-lg">
          <p className="text-[9px] font-semibold text-orange-800 dark:text-orange-400 mb-0.5">
            NEW
          </p>
          <p className="text-xs font-bold text-orange-900 dark:text-orange-300">
            {parsedWarning.newValue}
          </p>
        </div>
      </div>
    </div>
  );
};

// ==================== PRODUCT IMAGE ====================
interface ProductImageProps {
  colorImage?: string;
  product?: Product;
  size: number;
}

const ProductImage: React.FC<ProductImageProps> = ({ colorImage, product, size }) => {
  const imageUrl = colorImage || (product?.imageUrls && product.imageUrls.length > 0 ? product.imageUrls[0] : null);

  if (!imageUrl) {
    return (
      <div
        className="flex items-center justify-center bg-gray-200 dark:bg-gray-800 rounded-xl flex-shrink-0"
        style={{ width: size, height: size }}
      >
        <ImageOffIcon className="w-6 h-6 text-gray-500" />
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt="Product"
      className="rounded-xl object-cover flex-shrink-0"
      style={{ width: size, height: size }}
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        target.style.display = 'none';
        const parent = target.parentElement;
        if (parent) {
          parent.innerHTML = `
            <div class="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-800 rounded-xl">
              <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
          `;
        }
      }}
    />
  );
};

export default CartValidationDialog;