// src/components/TwoFactorSettings.tsx

"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
  CogIcon,
  KeyIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import useTwoFactor from "@/hooks/useTwoFactor";

interface TwoFactorSettingsProps {
  className?: string;
}

export default function TwoFactorSettings({
  className = "",
}: TwoFactorSettingsProps) {
  const t = useTranslations();
  const {
    isLoading,
    is2FAEnabled,
    isTotpEnabled,
    setup2FA,
    disable2FA,
    check2FAStatus,
  } = useTwoFactor();

  const handleToggle2FA = async () => {
    if (is2FAEnabled) {
      await disable2FA();
    } else {
      await setup2FA();
    }
    // Refresh status after action
    setTimeout(() => check2FAStatus(), 1000);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 2FA Status Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div
              className={`p-3 rounded-full ${
                is2FAEnabled
                  ? "bg-green-100 dark:bg-green-900/30"
                  : "bg-gray-100 dark:bg-gray-700"
              }`}
            >
              {is2FAEnabled ? (
                <ShieldCheckIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
              ) : (
                <ShieldExclamationIcon className="w-6 h-6 text-gray-600 dark:text-gray-400" />
              )}
            </div>

            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t("Settings.twoFactorAuthentication") ||
                  "Two-Factor Authentication"}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {is2FAEnabled
                  ? t("Settings.twoFactorEnabledDescription") ||
                    "Your account is protected with two-factor authentication"
                  : t("Settings.twoFactorDisabledDescription") ||
                    "Add an extra layer of security to your account"}
              </p>

              {/* Current Method Info */}
              {is2FAEnabled && (
                <div className="mt-3 flex items-center space-x-2">
                  <div
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      isTotpEnabled
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
                        : "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300"
                    }`}
                  >
                    {isTotpEnabled ? (
                      <>
                        <KeyIcon className="w-3 h-3 mr-1" />
                        {t("Settings.authenticatorApp") || "Authenticator App"}
                      </>
                    ) : (
                      <>
                        <EnvelopeIcon className="w-3 h-3 mr-1" />
                        {t("Settings.emailVerification") ||
                          "Email Verification"}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Toggle Button */}
          <button
            onClick={handleToggle2FA}
            disabled={isLoading}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 flex items-center space-x-2 ${
              is2FAEnabled
                ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50"
                : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50"
            } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <CogIcon className="w-4 h-4" />
            )}
            <span>
              {is2FAEnabled
                ? t("Settings.disable") || "Disable"
                : t("Settings.enable") || "Enable"}
            </span>
          </button>
        </div>
      </div>

      {/* Security Recommendations */}
      {!is2FAEnabled && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-xl p-4">
          <div className="flex items-start space-x-3">
            <ShieldExclamationIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {t("Settings.securityRecommendation") ||
                  "Security Recommendation"}
              </h4>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                {t("Settings.twoFactorRecommendationText") ||
                  "We strongly recommend enabling two-factor authentication to keep your account secure. It only takes a few minutes to set up."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2FA Methods Information */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-6">
        <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {t("Settings.availableMethods") || "Available Methods"}
        </h4>

        <div className="space-y-4">
          {/* Authenticator App */}
          <div className="flex items-start space-x-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <KeyIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t("Settings.authenticatorApp") || "Authenticator App"}
              </h5>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {t("Settings.authenticatorDescription") ||
                  "Use apps like Google Authenticator, Authy, or 1Password for secure offline codes."}
              </p>
              <div className="mt-2">
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                  {t("Settings.recommended") || "Recommended"}
                </span>
              </div>
            </div>
          </div>

          {/* Email Verification */}
          <div className="flex items-start space-x-4">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <EnvelopeIcon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="flex-1">
              <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {t("Settings.emailVerification") || "Email Verification"}
              </h5>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {t("Settings.emailDescription") ||
                  "Receive verification codes via email. Available as a fallback method."}
              </p>
              <div className="mt-2">
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300">
                  {t("Settings.fallback") || "Fallback"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Help Text */}
      <div className="text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("Settings.twoFactorHelpText") ||
            "Need help setting up two-factor authentication?"}{" "}
          <button className="text-blue-600 dark:text-blue-400 hover:underline">
            {t("Settings.viewGuide") || "View our guide"}
          </button>
        </p>
      </div>
    </div>
  );
}
