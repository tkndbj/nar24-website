// components/CouponSelectionSheet.tsx - Matching Flutter's CouponSelectionSheet

"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  X,
  Truck,
  Ticket,
  Tag,
  Check,
  CircleMinus,
  Gift,
  
} from "lucide-react";
import { Coupon, UserBenefit, BenefitType } from "@/app/models/coupon";
import { useCoupon } from "@/context/CouponProvider";

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
  localization?: (key: string) => string;
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
  localization,
}) => {
  // ========================================================================
  // COUPON SERVICE
  // ========================================================================

  const {
    coupons,
    benefits,
    activeFreeShippingBenefits,
    calculateCouponDiscount,
  } = useCoupon();

  // ========================================================================
  // TEMP STATE (before applying)
  // ========================================================================

  const [tempSelectedCoupon, setTempSelectedCoupon] = useState<Coupon | null>(
    selectedCoupon
  );
  const [tempUseFreeShipping, setTempUseFreeShipping] = useState(useFreeShipping);

  // ========================================================================
  // TRANSLATION HELPER
  // ========================================================================

  const t = useCallback(
    (key: string, fallback?: string): string => {
      if (localization) {
        try {
          const result = localization(key);
          if (result && result !== key) return result;
        } catch {}
      }
      return fallback ?? key;
    },
    [localization]
  );

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
    const benefit = tempUseFreeShipping && freeShippingBenefits.length > 0
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

    return (
      <div className="mb-6">
        {/* Section Header */}
        <div className="flex items-center space-x-2 mb-3">
          <Truck size={18} className="text-green-500" />
          <span
            className={`text-sm font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("freeShipping", "Free Shipping")}
          </span>
          <span
            className={`
              px-2 py-0.5 rounded-full text-xs font-bold
              ${isDarkMode ? "bg-green-500/20 text-green-400" : "bg-green-100 text-green-600"}
            `}
          >
            {freeShippingBenefits.length}
          </span>
        </div>

        {/* Free Shipping Toggle Card */}
        <button
          onClick={() => setTempUseFreeShipping(!tempUseFreeShipping)}
          className={`
            w-full p-4 rounded-xl border-2 transition-all duration-200
            ${
              tempUseFreeShipping
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
                w-12 h-12 rounded-xl flex items-center justify-center
                ${isDarkMode ? "bg-green-500/20" : "bg-green-100"}
              `}
            >
              <Truck size={24} className="text-green-500" />
            </div>
            <div className="flex-1 text-left">
              <p
                className={`font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("useFreeShipping", "Use Free Shipping")}
              </p>
              <p
                className={`text-sm ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {t("freeShippingDescription", "Your shipping fee will be waived")}
              </p>
            </div>
            <div
              className={`
                w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors
                ${
                  tempUseFreeShipping
                    ? "bg-green-500 border-green-500"
                    : isDarkMode
                      ? "border-gray-600"
                      : "border-gray-300"
                }
              `}
            >
              {tempUseFreeShipping && <Check size={14} className="text-white" />}
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
    expiresIn?: number | null
  ) => {
    const isSelected =
      coupon === null
        ? tempSelectedCoupon === null
        : tempSelectedCoupon?.id === coupon?.id;

    return (
      <button
        key={coupon?.id ?? "no-coupon"}
        onClick={() => setTempSelectedCoupon(coupon)}
        className={`
          w-full p-4 rounded-xl border-2 transition-all duration-200 mb-2
          ${
            isSelected
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
              w-12 h-12 rounded-xl flex items-center justify-center
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
                size={24}
                className={isDarkMode ? "text-gray-500" : "text-gray-400"}
              />
            ) : (
              <Ticket size={24} className="text-orange-500" />
            )}
          </div>
          <div className="flex-1 text-left">
            <div className="flex items-center space-x-2">
              <p
                className={`font-semibold ${
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
              {expiresIn !== null && expiresIn !== undefined && expiresIn <= 7 && (
                <span
                  className={`
                    px-1.5 py-0.5 rounded text-xs font-bold
                    ${
                      expiresIn <= 3
                        ? "bg-red-100 text-red-600"
                        : "bg-amber-100 text-amber-600"
                    }
                  `}
                >
                  {expiresIn === 0 ? t("today", "Today") : `${expiresIn} ${t("days", "days")}`}
                </span>
              )}
            </div>
            <p
              className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {subtitle}
            </p>
          </div>
          <div
            className={`
              w-5 h-5 rounded-full border-2 flex items-center justify-center
              ${
                isSelected
                  ? "border-orange-500 bg-orange-500"
                  : isDarkMode
                    ? "border-gray-600"
                    : "border-gray-300"
              }
            `}
          >
            {isSelected && (
              <div className="w-2 h-2 rounded-full bg-white" />
            )}
          </div>
        </div>
      </button>
    );
  };

  const renderCouponsSection = () => {
    return (
      <div>
        {/* Section Header */}
        <div className="flex items-center space-x-2 mb-3">
          <Ticket size={18} className="text-orange-500" />
          <span
            className={`text-sm font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("discountCoupons", "Discount Coupons")}
          </span>
          <span
            className={`
              px-2 py-0.5 rounded-full text-xs font-bold
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
              p-8 rounded-xl text-center
              ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
            `}
          >
            <Ticket
              size={48}
              className={`mx-auto mb-3 ${
                isDarkMode ? "text-gray-600" : "text-gray-400"
              }`}
            />
            <p
              className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("noCouponsAvailable", "No coupons available")}
            </p>
          </div>
        ) : (
          <div>
            {/* "No coupon" option */}
            {renderCouponCard(
              null,
              t("noCoupon", "No Coupon"),
              t("proceedWithoutDiscount", "Proceed without discount")
            )}

            {/* Available coupons */}
            {activeCoupons.map((coupon) => {
              const discount = calculateCouponDiscount(coupon, cartTotal);
              const subtitle =
                coupon.description ??
                (discount < coupon.amount
                  ? `${t("willDeduct", "Will deduct")} ${discount.toFixed(2)} ${coupon.currency}`
                  : t("discountCouponDesc", "Discount coupon"));

              return renderCouponCard(
                coupon,
                `${coupon.amount.toFixed(0)} ${coupon.currency}`,
                subtitle,
                coupon.daysUntilExpiry
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
    <div className="fixed inset-0 z-[1100] overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        onClick={handleBackdropClick}
      />

      {/* Sheet */}
      <div
        className={`
          absolute bottom-0 left-0 right-0 max-h-[90vh] rounded-t-3xl
          transform transition-transform duration-300 ease-out
          ${isDarkMode ? "bg-gray-900" : "bg-white"}
          shadow-2xl
        `}
      >
        {/* Handle Bar */}
        <div className="flex justify-center pt-3 pb-2">
          <div
            className={`w-10 h-1 rounded-full ${
              isDarkMode ? "bg-gray-700" : "bg-gray-300"
            }`}
          />
        </div>

        {/* Header */}
        <div
          className={`
            flex items-center justify-between px-6 py-4 border-b
            ${isDarkMode ? "border-gray-800" : "border-gray-100"}
          `}
        >
          <div className="flex items-center space-x-3">
            <Tag size={24} className="text-orange-500" />
            <h2
              className={`text-lg font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("couponsAndBenefits", "Coupons & Benefits")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`
              p-2 rounded-full transition-colors
              ${
                isDarkMode
                  ? "hover:bg-gray-800 text-gray-400"
                  : "hover:bg-gray-100 text-gray-500"
              }
            `}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
          {/* Free Shipping Section */}
          {renderFreeShippingSection()}

          {/* Coupons Section */}
          {renderCouponsSection()}
        </div>

        {/* Footer - Apply Button */}
        <div
          className={`
            px-6 py-4 border-t safe-area-inset-bottom
            ${isDarkMode ? "border-gray-800 bg-gray-900" : "border-gray-100 bg-white"}
          `}
        >
          <button
            onClick={handleApply}
            className="
              w-full py-4 rounded-xl font-semibold text-white
              bg-gradient-to-r from-orange-500 to-pink-500
              hover:from-orange-600 hover:to-pink-600
              transition-all duration-200 active:scale-[0.98]
            "
          >
            {t("apply", "Apply")}
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
  localization?: (key: string) => string;
}

export const SelectedDiscountsDisplay: React.FC<SelectedDiscountsDisplayProps> = ({
  selectedCoupon,
  useFreeShipping,
  couponDiscount,
  shippingDiscount,
  onTap,
  isDarkMode = false,
  localization,
}) => {
  const t = useCallback(
    (key: string, fallback?: string): string => {
      if (localization) {
        try {
          const result = localization(key);
          if (result && result !== key) return result;
        } catch {}
      }
      return fallback ?? key;
    },
    [localization]
  );

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
                    {t("coupon", "Coupon")}:
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
                    {t("shipping", "Shipping")}:
                  </span>
                  <span className="text-sm font-bold text-green-500">
                    {t("free", "Free")}
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
              {t("addCouponOrBenefit", "Add coupon or benefit")}
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