// src/app/components/productdetail/AskToSeller.tsx
"use client";

import React from "react";
import { MessageCircleQuestion } from "lucide-react";

interface AskSellerBubbleProps {
  onTap: () => void;
  alignment?: "bottomRight" | "bottomLeft" | "topRight" | "topLeft";
  size?: number;
  color?: string;
  isDarkMode?: boolean;
}

const AskSellerBubble: React.FC<AskSellerBubbleProps> = ({
  onTap,
  alignment = "bottomRight",
  size = 64,
  color = "#3b82f6", // blue-500
  
}) => {
  const getAlignmentClasses = () => {
    switch (alignment) {
      case "bottomLeft":
        return "bottom-4 left-4";
      case "topRight":
        return "top-4 right-4";
      case "topLeft":
        return "top-4 left-4";
      case "bottomRight":
      default:
        return "bottom-4 right-4";
    }
  };

  return (
    <div className={`fixed ${getAlignmentClasses()} z-20 p-4`}>
      <button
        onClick={onTap}
        className="relative group transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-4 focus:ring-blue-300 rounded-full"
        style={{ width: size, height: size }}
        aria-label="Ask seller a question"
      >
        {/* Main circle */}
        <div
          className="w-full h-full rounded-full flex items-center justify-center border-2 shadow-lg transition-all duration-300 group-hover:shadow-xl"
          style={{
            backgroundColor: `${color}E6`, // 90% opacity
            borderColor: color,
          }}
        >
          <MessageCircleQuestion
            className="text-white"
            size={size * 0.4}
            strokeWidth={2}
          />
        </div>

        {/* Label at bottom */}
        <div
          className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 px-2 py-1 rounded-lg text-xs font-semibold text-white whitespace-nowrap transition-all duration-300 group-hover:scale-105"
          style={{ backgroundColor: color }}
        >
          Ask Seller
        </div>

        {/* Pulse animation ring */}
        <div
          className="absolute inset-0 rounded-full animate-ping opacity-75"
          style={{ backgroundColor: `${color}40` }} // 25% opacity
        />
      </button>
    </div>
  );
};

export default AskSellerBubble;