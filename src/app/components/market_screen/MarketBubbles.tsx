"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface MarketBubblesProps {
  onNavItemTapped: (index: number) => void;
  locale?: string;
}

interface BubbleData {
  label: string;
  image: string;
  borderColor: string;
  backgroundColor: string;
  showComingSoon: boolean;
}

export const MarketBubbles: React.FC<MarketBubblesProps> = ({
  onNavItemTapped,
}) => {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Handle theme detection - same logic as other components
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

  const bubbles: BubbleData[] = [
    {
      label: "Mağazalar",
      image: "/images/shopbubble.png",
      borderColor: "#f97316", // orange-500
      backgroundColor: "rgba(249, 115, 22, 0.2)", // orange-500 with opacity
      showComingSoon: false,
    },
    {
      label: "Vitrin",
      image: "/images/vitrinbubble.png",
      borderColor: "#22c55e", // green-500
      backgroundColor: "rgba(34, 197, 94, 0.2)", // green-500 with opacity
      showComingSoon: false,
    },
    {
      label: "Yemek",
      image: "/images/foodbubble.png",
      borderColor: "#3b82f6", // blue-500
      backgroundColor: "rgba(59, 130, 246, 0.2)", // blue-500 with opacity
      showComingSoon: true,
    },
    {
      label: "Market",
      image: "/images/marketbubble.png",
      borderColor: "#ec4899", // pink-500
      backgroundColor: "rgba(236, 72, 153, 0.2)", // pink-500 with opacity
      showComingSoon: true,
    },
  ];

  const handleBubbleClick = (index: number) => {
    if (index === 0) {
      router.push("/shop"); // Navigate to /shop for Mağazalar bubble
    } else if (index === 1) {
      onNavItemTapped(4); // Use the callback for Vitrin bubble
    }
    // Other bubbles with coming soon don't have actions yet
  };

  return (
    <div className="flex justify-evenly items-center w-full px-4">
      {bubbles.map((bubble, index) => (
        <div
          key={index}
          className={`flex flex-col items-center cursor-pointer transition-transform duration-200 hover:scale-105 ${
            bubble.showComingSoon ? "cursor-default opacity-75" : ""
          }`}
          onClick={() => !bubble.showComingSoon && handleBubbleClick(index)}
        >
          {/* Bubble Container */}
          <div className="relative">
            <div
              className="w-20 h-20 rounded-full border-2 flex items-center justify-center relative overflow-hidden transition-all duration-200 hover:shadow-lg"
              style={{
                borderColor: bubble.borderColor,
                backgroundColor: bubble.backgroundColor,
              }}
            >
              {/* Bubble Image */}
              <div className="relative w-12 h-12">
                <Image
                  src={bubble.image}
                  alt={bubble.label}
                  fill
                  className="object-contain"
                  sizes="48px"
                />
              </div>
            </div>

            {/* Coming Soon Badge */}
            {bubble.showComingSoon && (
              <div
                className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 px-2 py-1 rounded-lg text-white text-xs font-semibold whitespace-nowrap"
                style={{ backgroundColor: bubble.borderColor }}
              >
                Yakında
              </div>
            )}
          </div>

          {/* Label */}
          <div className="mt-2">
            <span
              className={`text-xs font-semibold text-center block leading-tight ${
                isDarkMode ? "text-white" : "text-black"
              }`}
            >
              {bubble.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

// Alternative version with icons if you don't have the image assets
export const MarketBubblesWithIcons: React.FC<MarketBubblesProps> = ({
  onNavItemTapped,
}) => {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Handle theme detection
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

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

  const bubbles = [
    {
      label: "Mağazalar",
      icon: (
        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
          <path d="M7 4V2C7 1.45 7.45 1 8 1H16C16.55 1 17 1.45 17 2V4H20C20.55 4 21 4.45 21 5S20.55 6 20 6H19V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V6H4C3.45 6 3 5.55 3 5S3.45 4 4 4H7ZM9 3V4H15V3H9ZM7 6V19H17V6H7Z" />
        </svg>
      ),
      borderColor: "#f97316",
      backgroundColor: "rgba(249, 115, 22, 0.2)",
      showComingSoon: false,
    },
    {
      label: "Vitrin",
      icon: (
        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L2 7V10C2 16 6 20.5 12 22C18 20.5 22 16 22 10V7L12 2ZM12 4.3L18.6 7.8L12 11.3L5.4 7.8L12 4.3ZM12 20C8 18.8 4 15.4 4 10V8.5L12 12.5L20 8.5V10C20 15.4 16 18.8 12 20Z" />
        </svg>
      ),
      borderColor: "#22c55e",
      backgroundColor: "rgba(34, 197, 94, 0.2)",
      showComingSoon: false,
    },
    {
      label: "Yemek",
      icon: (
        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8.1 13.34L11 16.17L7.84 19.34C7.64 19.54 7.34 19.54 7.14 19.34L4.66 16.86C4.46 16.66 4.46 16.35 4.66 16.15L8.1 13.34ZM14.24 12L17.17 9.07C17.58 8.66 17.58 8.03 17.17 7.62L16.83 7.28C16.42 6.87 15.79 6.87 15.38 7.28L12.45 10.21L14.24 12ZM15.36 13.42L12.8 10.86L5.5 18.16C5.09 18.57 5.09 19.2 5.5 19.61L5.84 19.95C6.25 20.36 6.88 20.36 7.29 19.95L15.36 13.42Z" />
        </svg>
      ),
      borderColor: "#3b82f6",
      backgroundColor: "rgba(59, 130, 246, 0.2)",
      showComingSoon: true,
    },
    {
      label: "Market",
      icon: (
        <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 7H18V6C18 3.79 16.21 2 14 2H10C7.79 2 6 3.79 6 6V7H5C4.45 7 4 7.45 4 8S4.45 9 5 9H6V19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V9H19C19.55 9 20 8.55 20 8S19.55 7 19 7ZM8 6C8 4.9 8.9 4 10 4H14C15.1 4 16 4.9 16 6V7H8V6ZM16 19H8V9H16V19Z" />
        </svg>
      ),
      borderColor: "#ec4899",
      backgroundColor: "rgba(236, 72, 153, 0.2)",
      showComingSoon: true,
    },
  ];

  const handleBubbleClick = (index: number) => {
    if (index === 0) {
      router.push("/shop");
    } else if (index === 1) {
      onNavItemTapped(4);
    }
  };

  return (
    <div className="flex justify-evenly items-center w-full px-4">
      {bubbles.map((bubble, index) => (
        <div
          key={index}
          className={`flex flex-col items-center cursor-pointer transition-transform duration-200 hover:scale-105 ${
            bubble.showComingSoon ? "cursor-default opacity-75" : ""
          }`}
          onClick={() => !bubble.showComingSoon && handleBubbleClick(index)}
        >
          <div className="relative">
            <div
              className="w-20 h-20 rounded-full border-2 flex items-center justify-center relative transition-all duration-200 hover:shadow-lg"
              style={{
                borderColor: bubble.borderColor,
                backgroundColor: bubble.backgroundColor,
                color: bubble.borderColor,
              }}
            >
              {bubble.icon}
            </div>

            {bubble.showComingSoon && (
              <div
                className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 px-2 py-1 rounded-lg text-white text-xs font-semibold whitespace-nowrap"
                style={{ backgroundColor: bubble.borderColor }}
              >
                Yakında
              </div>
            )}
          </div>

          <div className="mt-2">
            <span
              className={`text-xs font-semibold text-center block leading-tight ${
                isDarkMode ? "text-white" : "text-black"
              }`}
            >
              {bubble.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
