"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Cookie, X, Settings, Check } from "lucide-react";
import Link from "next/link";
import { useTheme } from "@/hooks/useTheme";

interface CookiePreferences {
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

export default function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const isDarkMode = useTheme();
  const t = useTranslations("cookieConsent");

  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true, // Always true, cannot be disabled
    functional: false,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // Check if user has already made a choice
    const consentGiven = localStorage.getItem("cookieConsent");
    if (!consentGiven) {
      // Delay showing banner slightly for better UX
      setTimeout(() => setIsVisible(true), 1000);
    } else {
      // Load saved preferences
      try {
        const savedPreferences = JSON.parse(consentGiven);
        setPreferences(savedPreferences);
      } catch (e) {
        console.error("Error loading cookie preferences:", e);
      }
    }

    // Handle opening settings from footer
    const handleOpenSettings = () => {
      setIsVisible(true);
      setShowSettings(true);
    };

    window.addEventListener("openCookieSettings", handleOpenSettings);

    return () => {
      window.removeEventListener("openCookieSettings", handleOpenSettings);
    };
  }, []);

  const savePreferences = (prefs: CookiePreferences) => {
    localStorage.setItem("cookieConsent", JSON.stringify(prefs));
    localStorage.setItem("cookieConsentDate", new Date().toISOString());

    // Trigger analytics update if needed
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("cookieConsentUpdate", { detail: prefs })
      );
    }
  };

  const handleAcceptAll = () => {
    const allAccepted: CookiePreferences = {
      necessary: true,
      functional: true,
      analytics: true,
      marketing: true,
    };
    setPreferences(allAccepted);
    savePreferences(allAccepted);
    setIsVisible(false);
  };

  const handleRejectAll = () => {
    const onlyNecessary: CookiePreferences = {
      necessary: true,
      functional: false,
      analytics: false,
      marketing: false,
    };
    setPreferences(onlyNecessary);
    savePreferences(onlyNecessary);
    setIsVisible(false);
  };

  const handleSavePreferences = () => {
    savePreferences(preferences);
    setIsVisible(false);
  };

  const togglePreference = (key: keyof CookiePreferences) => {
    if (key === "necessary") return; // Cannot disable necessary cookies
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998] animate-fadeIn" />

      {/* Cookie Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-[9999] p-4 md:p-6 animate-slideUp">
        <div
          className={`max-w-6xl mx-auto rounded-2xl shadow-2xl border ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }`}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-4 md:p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-pink-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <Cookie className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2
                  className={`text-lg md:text-xl font-bold mb-1 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("title")}
                </h2>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("description")}
                </p>
              </div>
            </div>
            <button
              onClick={handleRejectAll}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode
                  ? "hover:bg-gray-700 text-gray-400"
                  : "hover:bg-gray-100 text-gray-600"
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="p-4 md:p-6 space-y-4 border-b border-gray-200 dark:border-gray-700">
              {/* Necessary Cookies */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3
                      className={`font-semibold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {t("necessary")}
                    </h3>
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                      {t("alwaysActive")}
                    </span>
                  </div>
                  <p
                    className={`text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {t("necessaryDesc")}
                  </p>
                </div>
                <div className="w-12 h-6 bg-green-500 rounded-full flex items-center px-1 cursor-not-allowed">
                  <div className="w-4 h-4 bg-white rounded-full ml-auto" />
                </div>
              </div>

              {/* Functional Cookies */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3
                    className={`font-semibold mb-1 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("functional")}
                  </h3>
                  <p
                    className={`text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {t("functionalDesc")}
                  </p>
                </div>
                <button
                  onClick={() => togglePreference("functional")}
                  className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors ${
                    preferences.functional
                      ? "bg-orange-500"
                      : isDarkMode
                      ? "bg-gray-600"
                      : "bg-gray-300"
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full transition-transform ${
                      preferences.functional ? "ml-auto" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Analytics Cookies */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3
                    className={`font-semibold mb-1 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("analytics")}
                  </h3>
                  <p
                    className={`text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {t("analyticsDesc")}
                  </p>
                </div>
                <button
                  onClick={() => togglePreference("analytics")}
                  className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors ${
                    preferences.analytics
                      ? "bg-orange-500"
                      : isDarkMode
                      ? "bg-gray-600"
                      : "bg-gray-300"
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full transition-transform ${
                      preferences.analytics ? "ml-auto" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Marketing Cookies */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3
                    className={`font-semibold mb-1 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("marketing")}
                  </h3>
                  <p
                    className={`text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {t("marketingDesc")}
                  </p>
                </div>
                <button
                  onClick={() => togglePreference("marketing")}
                  className={`w-12 h-6 rounded-full flex items-center px-1 transition-colors ${
                    preferences.marketing
                      ? "bg-orange-500"
                      : isDarkMode
                      ? "bg-gray-600"
                      : "bg-gray-300"
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full transition-transform ${
                      preferences.marketing ? "ml-auto" : ""
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                  isDarkMode
                    ? "bg-gray-700 hover:bg-gray-600 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                }`}
              >
                <Settings className="w-4 h-4" />
                {showSettings ? t("hideSettings") : t("customizeSettings")}
              </button>

              <div className="flex-1 flex gap-3">
                <button
                  onClick={handleRejectAll}
                  className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                    isDarkMode
                      ? "bg-gray-700 hover:bg-gray-600 text-white"
                      : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                  }`}
                >
                  {t("rejectAll")}
                </button>

                <button
                  onClick={
                    showSettings ? handleSavePreferences : handleAcceptAll
                  }
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white rounded-lg font-medium transition-all shadow-lg hover:shadow-xl"
                >
                  <Check className="w-4 h-4" />
                  {showSettings ? t("savePreferences") : t("acceptAll")}
                </button>
              </div>
            </div>

            {/* Privacy Policy Link */}
            <p
              className={`text-xs text-center mt-4 ${
                isDarkMode ? "text-gray-500" : "text-gray-500"
              }`}
            >
              {t("learnMore")}{" "}
              <Link
                href="/privacy"
                className="text-orange-500 hover:text-orange-600 underline"
              >
                {t("privacyPolicy")}
              </Link>
            </p>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.4s ease-out;
        }
      `}</style>
    </>
  );
}
