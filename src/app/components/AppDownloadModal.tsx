"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";

// Custom X icon
const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const STORAGE_KEY = "nar24_app_modal_dismissed";

// Google Play link
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.cts.emlak";

// iOS App Store link - using the app ID format
// Team ID: 7BY492QQ9Z, Bundle ID: com.ects.nar24
const APP_STORE_URL = "https://apps.apple.com/app/nar24/id6744136498";

/**
 * Detects if the device is a mobile phone or tablet (not a laptop with small screen)
 * Uses user agent detection combined with touch capability checks
 */
function isMobileOrTablet(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const userAgent = navigator.userAgent.toLowerCase();

  // Check for specific mobile/tablet user agent patterns
  const mobilePatterns = [
    /android/i,
    /webos/i,
    /iphone/i,
    /ipad/i,
    /ipod/i,
    /blackberry/i,
    /windows phone/i,
    /opera mini/i,
    /iemobile/i,
    /mobile/i,
    /tablet/i,
  ];

  const isMobileUA = mobilePatterns.some((pattern) => pattern.test(userAgent));

  // Additional check: iPadOS 13+ reports as desktop Safari
  // Detect by checking for touch support + Safari on MacIntel
  const isIPadOS =
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints > 1;

  // Check for touch capability (mobile devices have touch)
  // But also ensure we're not on a laptop with touchscreen
  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  // Laptops with touchscreen usually have mouse/trackpad too
  // Mobile devices typically don't report mouse pointer
  const hasMousePointer = window.matchMedia("(pointer: fine)").matches;

  // Mobile/tablet detection logic:
  // 1. User agent says mobile/tablet, OR
  // 2. iPadOS detection (MacIntel with touch), OR
  // 3. Has touch but no fine pointer (rules out touchscreen laptops)
  if (isMobileUA || isIPadOS) {
    return true;
  }

  // Additional heuristic: touch device without fine pointer is likely mobile
  if (hasTouch && !hasMousePointer) {
    return true;
  }

  return false;
}

/**
 * Detects if the device is running iOS
 */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;

  const userAgent = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * Detects if the device is running Android
 */
function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/.test(navigator.userAgent.toLowerCase());
}

export default function AppDownloadModal() {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const t = useTranslations();

  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDark(document.documentElement.classList.contains("dark"));
      }
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Check if we should show the modal
    const checkAndShow = () => {
      // Only show on mobile/tablet devices
      if (!isMobileOrTablet()) {
        return;
      }

      // Check if user has already dismissed the modal this session
      if (sessionStorage.getItem(STORAGE_KEY)) {
        return;
      }

      // Show the modal with animation delay
      setTimeout(() => {
        setIsVisible(true);
        // Trigger animation after mount
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      }, 1500); // Show after 1.5 seconds
    };

    checkAndShow();
  }, []);

  const handleDismiss = () => {
    // Start close animation
    setIsAnimating(false);

    // Remove from DOM after animation
    setTimeout(() => {
      setIsVisible(false);
      // Mark as dismissed for this session
      sessionStorage.setItem(STORAGE_KEY, "1");
    }, 300);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleDismiss();
    }
  };

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  const deviceIsIOS = isIOS();
  const deviceIsAndroid = isAndroid();

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 transition-all duration-300 ${
        isAnimating ? "bg-black/50 backdrop-blur-sm" : "bg-black/0"
      }`}
      onClick={handleBackdropClick}
    >
      <div
        className={`w-full max-w-md rounded-3xl shadow-2xl overflow-hidden transition-all duration-300 ${
          isDark ? "bg-gray-900" : "bg-white"
        } ${
          isAnimating
            ? "opacity-100 translate-y-0 scale-100"
            : "opacity-0 translate-y-8 scale-95"
        }`}
      >
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4">
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${
              isDark
                ? "bg-gray-800 hover:bg-gray-700"
                : "bg-gray-100 hover:bg-gray-200"
            }`}
            aria-label={t("common.cancel")}
          >
            <XIcon className={`w-5 h-5 ${isDark ? "text-gray-400" : "text-gray-600"}`} />
          </button>

          {/* Logo */}
          <div className="flex justify-center mb-4">
            <Image
              src={isDark ? "/images/beyazlogo.png" : "/images/siyahlogo.png"}
              alt="Nar24"
              width={64}
              height={64}
              className="w-16 h-16 object-contain"
            />
          </div>

          {/* Title */}
          <h2 className={`text-xl font-bold text-center mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
            {t("appDownload.title")}
          </h2>

          {/* Description */}
          <p className={`text-center text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
            {t("appDownload.description")}
          </p>
        </div>

        {/* Features */}
        <div className="px-6 pb-4">
          <div className={`rounded-2xl p-4 space-y-3 ${isDark ? "bg-gray-800/50" : "bg-gray-50"}`}>
            <FeatureItem text={t("appDownload.feature1")} isDark={isDark} />
            <FeatureItem text={t("appDownload.feature2")} isDark={isDark} />
            <FeatureItem text={t("appDownload.feature3")} isDark={isDark} />
          </div>
        </div>

        {/* Store Buttons */}
        <div className="px-6 pb-6">
          <div className="flex flex-col gap-3">
            {/* Show primary store button based on device, with secondary as fallback */}
            {deviceIsIOS ? (
              <>
                <StoreButton
                  href={APP_STORE_URL}
                  imageSrc="/appstore.png"
                  alt="Download on the App Store"
                  primary
                  isDark={isDark}
                />
                <StoreButton
                  href={GOOGLE_PLAY_URL}
                  imageSrc="/googleplay.png"
                  alt="Get it on Google Play"
                  isDark={isDark}
                />
              </>
            ) : deviceIsAndroid ? (
              <>
                <StoreButton
                  href={GOOGLE_PLAY_URL}
                  imageSrc="/googleplay.png"
                  alt="Get it on Google Play"
                  primary
                  isDark={isDark}
                />
                <StoreButton
                  href={APP_STORE_URL}
                  imageSrc="/appstore.png"
                  alt="Download on the App Store"
                  isDark={isDark}
                />
              </>
            ) : (
              // Unknown device - show both equally
              <>
                <StoreButton
                  href={APP_STORE_URL}
                  imageSrc="/appstore.png"
                  alt="Download on the App Store"
                  primary
                  isDark={isDark}
                />
                <StoreButton
                  href={GOOGLE_PLAY_URL}
                  imageSrc="/googleplay.png"
                  alt="Get it on Google Play"
                  primary
                  isDark={isDark}
                />
              </>
            )}
          </div>
        </div>

        {/* Maybe Later */}
        <div className="px-6 pb-6">
          <button
            onClick={handleDismiss}
            className={`w-full py-3 text-sm font-medium transition-colors ${
              isDark
                ? "text-gray-400 hover:text-gray-300"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t("appDownload.maybeLater")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FeatureItem({ text, isDark = false }: { text: string; isDark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
        isDark ? "bg-green-900/30" : "bg-green-100"
      }`}>
        <svg
          className={`w-3 h-3 ${isDark ? "text-green-400" : "text-green-600"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>{text}</span>
    </div>
  );
}

function StoreButton({
  href,
  imageSrc,
  alt,
  primary = false,
  isDark = false,
}: {
  href: string;
  imageSrc: string;
  alt: string;
  primary?: boolean;
  isDark?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-center h-14 rounded-xl transition-all duration-200 ${
        primary
          ? isDark
            ? "bg-white hover:bg-gray-100"
            : "bg-gray-900 hover:bg-gray-800"
          : isDark
            ? "bg-gray-800 hover:bg-gray-700"
            : "bg-gray-100 hover:bg-gray-200"
      }`}
    >
      <Image
        src={imageSrc}
        alt={alt}
        width={140}
        height={42}
        className="h-10 w-auto object-contain"
      />
    </a>
  );
}
