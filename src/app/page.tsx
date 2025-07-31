"use client";

import React, { useState, useEffect } from "react";
import { MarketBubbles } from "./components/market_screen/MarketBubbles";
import { PreferenceProduct } from "./components/market_screen/PreferenceProduct";

export default function Home() {
  const [isDarkMode, setIsDarkMode] = useState(false);

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
    <div
      className={`min-h-screen w-full ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}
    >
      {/* Top spacing with explicit background */}
      <div
        className={`w-full h-5 ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      ></div>

      {/* Market Bubbles with background wrapper */}
      <div className={`w-full ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        <MarketBubbles onNavItemTapped={handleNavigation} locale="en" />
      </div>

      {/* Middle spacing with explicit background */}
      <div
        className={`w-full h-5 ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      ></div>

      {/* Preference Product with background wrapper */}
      <div className={`w-full ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        <PreferenceProduct />
      </div>

      {/* Bottom padding */}
      <div
        className={`w-full h-8 ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      ></div>
    </div>
  );
}
