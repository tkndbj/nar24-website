// components/CouponSelectionSheet.tsx - Matching Flutter's CouponSelectionSheet

"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  X,
  Truck,
  Ticket,
  Tag,
  Check,
  CircleMinus,
  Gift,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Coupon, UserBenefit, BenefitType } from "@/app/models/coupon";
import { useCoupon, FREE_SHIPPING_MINIMUM } from "@/context/CouponProvider";

// ============================================================================
// TYPES
// ============================================================================

interface CouponSelectionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  cartTotal: number;
  selectedCoupon: Coupon | null;
  useFreeShipping: boolean;
  onCouponSelected: (coupon: Coupon | null) => void;
  onFreeShippingToggled: (use: boolean, benefit?: UserBenefit | null) => void;
  isDarkMode?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const CouponSelectionSheet: React.FC<CouponSelectionSheetProps> = ({
  isOpen,
  onClose,
  cartTotal,
  selectedCoupon,
  useFreeShipping,
  onCouponSelected,
  onFreeShippingToggled,
  isDarkMode = false,
}) => {
  // ========================================================================
  // TRANSLATIONS
  // ========================================================================

  const t = useTranslations("coupons");

  // ========================================================================
  // COUPON SERVICE
  // ========================================================================

  const { 
    coupons, 
    benefits, 
    calculateCouponDiscount,
    isCouponApplicable,
    getMinimumForCoupon,
    isFreeShippingApplicable,
  } = useCoupon();

  // ========================================================================
  // TEMP STATE (before applying)
  // ========================================================================

  const [tempSelectedCoupon, setTempSelectedCoupon] = useState<Coupon | null>(
    selectedCoupon
  );
  const [tempUseFreeShipping, setTempUseFreeShipping] =
    useState(useFreeShipping);

  // Sync temp state when props change (e.g., when sheet reopens)
  useEffect(() => {
    if (isOpen) {
      setTempSelectedCoupon(selectedCoupon);
      setTempUseFreeShipping(useFreeShipping);
    }
  }, [isOpen, selectedCoupon, useFreeShipping]);

  // ========================================================================
  // COMPUTED
  // ========================================================================

  const activeCoupons = useMemo(() => {
    return coupons.filter((c) => c.isValid);
  }, [coupons]);

  const freeShippingBenefits = useMemo(() => {
    return benefits.filter(
      (b) => b.isValid && b.type === BenefitType.FreeShipping
    );
  }, [benefits]);

  // ========================================================================
  // HANDLERS
  // ========================================================================

  const handleApply = useCallback(() => {
    onCouponSelected(tempSelectedCoupon);

    // Find the first valid free shipping benefit if toggled on
    const benefit =
      tempUseFreeShipping && freeShippingBenefits.length > 0
        ? freeShippingBenefits[0]
        : null;

    onFreeShippingToggled(tempUseFreeShipping, benefit);
    onClose();
  }, [
    tempSelectedCoupon,
    tempUseFreeShipping,
    freeShippingBenefits,
    onCouponSelected,
    onFreeShippingToggled,
    onClose,
  ]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // ========================================================================
  // RENDER HELPERS
  // ========================================================================

  const renderFreeShippingSection = () => {
    if (freeShippingBenefits.length === 0) {
      return null;
    }
  
    const isApplicable = isFreeShippingApplicable(cartTotal);
  
    return (
      <div className="mb-5">
        {/* Section Header */}
        <div className="flex items-center space-x-2 mb-2">
          <Truck size={16} className="text-green-500" />
          <span
            className={`text-sm font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("freeShipping")}
          </span>
          <span
            className={`
              px-1.5 py-0.5 rounded-full text-xs font-bold
              ${isDarkMode ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-600"}
            `}
          >
            {freeShippingBenefits.length}
          </span>
        </div>
  
        {/* Free Shipping Toggle Card */}
        <button
          onClick={isApplicable ? () => setTempUseFreeShipping(!tempUseFreeShipping) : undefined}
          disabled={!isApplicable}
          className={`
            w-full p-3 rounded-xl border-2 transition-all duration-200
            ${!isApplicable ? "opacity-50 cursor-not-allowed" : ""}
            ${
              tempUseFreeShipping && isApplicable
                ? "border-green-500 bg-green-500/10"
                : isDarkMode
                  ? "border-gray-700 bg-gray-800 hover:border-gray-600"
                  : "border-gray-200 bg-gray-50 hover:border-gray-300"
            }
          `}
        >
          <div className="flex items-center space-x-3">
            <div
              className={`
                w-10 h-10 rounded-lg flex items-center justify-center
                ${isDarkMode ? "bg-green-500/20" : "bg-green-100"}
              `}
            >
              <Truck size={20} className="text-green-500" />
            </div>
            <div className="flex-1 text-left">
              <p
                className={`text-sm font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("useFreeShipping")}
              </p>
              <p
                className={`text-xs ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {t("freeShippingDescription")}
              </p>
              {/* Show minimum requirement if not applicable */}
              {!isApplicable && (
                <p className="text-xs text-red-500 font-medium mt-1">
                  {t("minimumCartTotal", { amount: FREE_SHIPPING_MINIMUM.toFixed(0) })}
                </p>
              )}
            </div>
            <div
              className={`
                w-5 h-5 rounded flex items-center justify-center transition-colors
                ${
                  tempUseFreeShipping && isApplicable
                    ? "bg-green-500"
                    : isDarkMode
                      ? "border-2 border-gray-600"
                      : "border-2 border-gray-300"
                }
              `}
            >
              {tempUseFreeShipping && isApplicable && (
                <Check size={12} className="text-white" />
              )}
            </div>
          </div>
        </button>
      </div>
    );
  };

  const renderCouponCard = (
    coupon: Coupon | null,
    title: string,
    subtitle: string,
    expiresIn?: number | null,
    isApplicable: boolean = true,
    minimumRequired?: number
  ) => {
    const isSelected =
      coupon === null
        ? tempSelectedCoupon === null
        : tempSelectedCoupon?.id === coupon?.id;
  
    // Can only select if applicable (or if it's the "no coupon" option)
    const canSelect = coupon === null || isApplicable;
  
    return (
      <button
        key={coupon?.id ?? "no-coupon"}
        onClick={canSelect ? () => setTempSelectedCoupon(coupon) : undefined}
        disabled={!canSelect}
        className={`
          w-full p-3 rounded-xl border-2 transition-all duration-200 mb-2
          ${!canSelect ? "opacity-50 cursor-not-allowed" : ""}
          ${
            isSelected && canSelect
              ? "border-orange-500 bg-orange-500/10"
              : isDarkMode
                ? "border-gray-700 bg-gray-800 hover:border-gray-600"
                : "border-gray-200 bg-gray-50 hover:border-gray-300"
          }
        `}
      >
        <div className="flex items-center space-x-3">
          <div
            className={`
              w-10 h-10 rounded-lg flex items-center justify-center
              ${
                coupon === null
                  ? isDarkMode
                    ? "bg-gray-700"
                    : "bg-gray-200"
                  : isDarkMode
                    ? "bg-orange-500/20"
                    : "bg-orange-100"
              }
            `}
          >
            {coupon === null ? (
              <CircleMinus
                size={20}
                className={isDarkMode ? "text-gray-500" : "text-gray-400"}
              />
            ) : (
              <Ticket size={20} className="text-orange-500" />
            )}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="flex items-center space-x-2">
              <p
                className={`text-sm font-semibold truncate ${
                  coupon === null
                    ? isDarkMode
                      ? "text-gray-400"
                      : "text-gray-500"
                    : isDarkMode
                      ? "text-white"
                      : "text-gray-900"
                }`}
              >
                {title}
              </p>
              {expiresIn !== null &&
                expiresIn !== undefined &&
                expiresIn <= 7 && (
                  <span
                    className={`
                    px-1.5 py-0.5 rounded text-xs font-bold whitespace-nowrap
                    ${
                      expiresIn <= 3
                        ? "bg-red-100 text-red-600"
                        : "bg-amber-100 text-amber-600"
                    }
                  `}
                  >
                    {expiresIn === 0
                      ? t("today")
                      : `${expiresIn} ${t("days")}`}
                  </span>
                )}
            </div>
            <p
              className={`text-xs truncate ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {subtitle}
            </p>
            {/* Show minimum requirement if not applicable */}
            {!isApplicable && minimumRequired !== undefined && (
              <p className="text-xs text-red-500 font-medium mt-1">
                {t("minimumCartTotal", { amount: minimumRequired.toFixed(0) })}
              </p>
            )}
          </div>
          <div
            className={`
              w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
              ${
                isSelected && canSelect
                  ? "border-orange-500 bg-orange-500"
                  : isDarkMode
                    ? "border-gray-600"
                    : "border-gray-300"
              }
            `}
          >
            {isSelected && canSelect && <div className="w-2 h-2 rounded-full bg-white" />}
          </div>
        </div>
      </button>
    );
  };

  const renderCouponsSection = () => {
    return (
      <div>
        {/* Section Header */}
        <div className="flex items-center space-x-2 mb-2">
          <Ticket size={16} className="text-orange-500" />
          <span
            className={`text-sm font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("discountCoupons")}
          </span>
          <span
            className={`
              px-1.5 py-0.5 rounded-full text-xs font-bold
              ${isDarkMode ? "bg-orange-500/20 text-orange-400" : "bg-orange-100 text-orange-600"}
            `}
          >
            {activeCoupons.length}
          </span>
        </div>
  
        {activeCoupons.length === 0 ? (
          // Empty State
          <div
            className={`
              p-6 rounded-xl text-center
              ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
            `}
          >
            <Ticket
              size={36}
              className={`mx-auto mb-2 ${
                isDarkMode ? "text-gray-600" : "text-gray-400"
              }`}
            />
            <p
              className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("noCouponsAvailable")}
            </p>
          </div>
        ) : (
          <div>
            {/* "No coupon" option - always applicable */}
            {renderCouponCard(
              null,
              t("noCoupon"),
              t("proceedWithoutDiscount"),
              null,
              true // Always applicable
            )}
  
            {/* Available coupons */}
            {activeCoupons.map((coupon) => {
              const isApplicable = isCouponApplicable(coupon, cartTotal);
              const minimumRequired = getMinimumForCoupon(coupon);
              const discount = calculateCouponDiscount(coupon, cartTotal);
              
              const subtitle =
                coupon.description ??
                (isApplicable
                  ? (discount < coupon.amount
                      ? `${t("willDeduct")} ${discount.toFixed(2)} ${coupon.currency}`
                      : t("discountCouponDesc"))
                  : t("minimumNotMet"));
  
              return renderCouponCard(
                coupon,
                `${coupon.amount.toFixed(0)} ${coupon.currency}`,
                subtitle,
                coupon.daysUntilExpiry,
                isApplicable,
                minimumRequired
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1100] overflow-hidden flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        onClick={handleBackdropClick}
      />

      {/* Sheet - Compact width */}
      <div
        className={`
          relative w-full max-w-md mx-4 mb-4 max-h-[85vh] rounded-2xl
          transform transition-transform duration-300 ease-out
          ${isDarkMode ? "bg-gray-900" : "bg-white"}
          shadow-2xl
        `}
      >
        {/* Header */}
        <div
          className={`
            flex items-center justify-between px-4 py-3 border-b
            ${isDarkMode ? "border-gray-800" : "border-gray-100"}
          `}
        >
          <div className="flex items-center space-x-2">
            <Tag size={20} className="text-orange-500" />
            <h2
              className={`text-base font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("couponsAndBenefits")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`
              p-1.5 rounded-full transition-colors
              ${
                isDarkMode
                  ? "hover:bg-gray-800 text-gray-400"
                  : "hover:bg-gray-100 text-gray-500"
              }
            `}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-4 overflow-y-auto max-h-[55vh]">
          {/* Free Shipping Section */}
          {renderFreeShippingSection()}

          {/* Coupons Section */}
          {renderCouponsSection()}
        </div>

        {/* Footer - Apply Button */}
        <div
          className={`
            px-4 py-3 border-t
            ${isDarkMode ? "border-gray-800 bg-gray-900" : "border-gray-100 bg-white"}
            rounded-b-2xl
          `}
        >
          <button
            onClick={handleApply}
            className="
              w-full py-3 rounded-xl font-semibold text-white text-sm
              bg-gradient-to-r from-orange-500 to-pink-500
              hover:from-orange-600 hover:to-pink-600
              transition-all duration-200 active:scale-[0.98]
            "
          >
            {t("apply")}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// SELECTED DISCOUNTS DISPLAY COMPONENT
// ============================================================================

interface SelectedDiscountsDisplayProps {
  selectedCoupon: Coupon | null;
  useFreeShipping: boolean;
  couponDiscount: number;
  shippingDiscount: number;
  onTap: () => void;
  isDarkMode?: boolean;
}

export const SelectedDiscountsDisplay: React.FC<
  SelectedDiscountsDisplayProps
> = ({
  selectedCoupon,
  useFreeShipping,
  couponDiscount,
  onTap,
  isDarkMode = false,
}) => {
  const t = useTranslations("coupons");

  const hasDiscount = selectedCoupon !== null || useFreeShipping;

  return (
    <button
      onClick={onTap}
      className={`
        w-full p-3 rounded-xl border transition-all duration-200
        ${
          hasDiscount
            ? "border-green-500/30 bg-green-500/10"
            : isDarkMode
              ? "border-gray-700 bg-gray-800 hover:border-gray-600"
              : "border-gray-200 bg-gray-100 hover:border-gray-300"
        }
      `}
    >
      <div className="flex items-center space-x-3">
        {hasDiscount ? (
          <Tag size={18} className="text-green-500" />
        ) : (
          <Gift size={18} className="text-orange-500" />
        )}

        <div className="flex-1 text-left">
          {hasDiscount ? (
            <div className="space-y-1">
              {selectedCoupon && (
                <div className="flex items-center space-x-1">
                  <span
                    className={`text-sm ${
                      isDarkMode ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    {t("coupon")}:
                  </span>
                  <span className="text-sm font-bold text-green-500">
                    -{couponDiscount.toFixed(2)} TL
                  </span>
                </div>
              )}
              {useFreeShipping && (
                <div className="flex items-center space-x-1">
                  <span
                    className={`text-sm ${
                      isDarkMode ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    {t("shipping")}:
                  </span>
                  <span className="text-sm font-bold text-green-500">
                    {t("free")}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <span
              className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("addCouponOrBenefit")}
            </span>
          )}
        </div>

        <svg
          className={`w-5 h-5 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </button>
  );
};

export default CouponSelectionSheet;