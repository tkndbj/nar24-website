"use client";

import React, { useState, useEffect } from "react";
import { useLocale } from "next-intl";
import SecondHeader from "../components/market_screen/SecondHeader";
import { MarketBubbles } from "../components/market_screen/MarketBubbles";
import { PreferenceProduct } from "../components/market_screen/PreferenceProduct";
import MarketBanner from "../components/market_screen/MarketBanner";

export default function Home() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const locale = useLocale();

  // Handle theme detection - same logic as ProfilePage and Header
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    // Initialize theme from localStorage or system preference
    if (typeof document !== "undefined") {
      const savedTheme = localStorage.getItem("theme");
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

      if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => observer.disconnect();
  }, []);

  const handleNavigation = (index: number) => {
    console.log("Navigate to:", index);
  };

  return (
    <>
      {/* Add SecondHeader here */}
      <SecondHeader />

      <div
        className={`min-h-screen w-full ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="w-full pt-10">
          {/* Market Bubbles with centered wrapper */}
          <div
            className={`w-full ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
          >
            <div className="max-w-6xl mx-auto px-4">
              <MarketBubbles
                onNavItemTapped={handleNavigation}
                locale={locale}
              />
            </div>
          </div>

          {/* Middle spacing with explicit background */}
          <div
            className={`w-full h-5 ${
              isDarkMode ? "bg-gray-900" : "bg-gray-50"
            }`}
          ></div>

          {/* Preference Product with centered wrapper */}
          <div
            className={`w-full ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
          >
            {/* Mobile: full width */}
            <div className="block lg:hidden">
              <PreferenceProduct />
            </div>

            {/* Desktop and up: centered layout */}
            <div className="hidden lg:block">
              <div className="max-w-6xl mx-auto px-4">
                <PreferenceProduct />
              </div>
            </div>
          </div>

          {/* Market Banner remains full-width */}
          <div
            className={`w-full ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
          >
            <MarketBanner />
          </div>

          {/* Bottom padding */}
          <div
            className={`w-full h-8 ${
              isDarkMode ? "bg-gray-900" : "bg-gray-50"
            }`}
          ></div>
        </div>
      </div>
    </>
  );
}
