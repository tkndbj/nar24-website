"use client";

import React from "react";

interface CouponWidgetProps {
  leftText?: string;
  discount: string;
  subtitle?: string;
  validUntil: string;
  code: string;
  primaryColor?: string;
  accentColor?: string;
  isUsed?: boolean;
  className?: string;
}

export const CouponWidget: React.FC<CouponWidgetProps> = ({
  leftText = "Enjoy Your Gift",
  discount,
  subtitle = "Coupon",
  validUntil,
  code,
  primaryColor = "#FFD700", // Gold
  accentColor = "#000000",
  isUsed = false,
  className = "",
}) => {
  // Convert hex to RGB for opacity support
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 255, g: 215, b: 0 };
  };

  const rgb = hexToRgb(primaryColor);
  const bgColor = isUsed ? "#9CA3AF" : primaryColor;

  return (
    <div
      className={`relative w-full max-w-[400px] h-[140px] md:h-[160px] select-none ${className}`}
      style={{ opacity: isUsed ? 0.7 : 1 }}
    >
      {/* Main Coupon Container with Notches */}
      <svg
        viewBox="0 0 400 160"
        className="w-full h-full drop-shadow-lg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Gradient for the main coupon body */}
          <linearGradient id={`couponGradient-${code}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={bgColor} />
            <stop offset="100%" stopColor={isUsed ? "#6B7280" : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.85)`} />
          </linearGradient>
          
          {/* Pattern for subtle texture */}
          <pattern id={`diagonalLines-${code}`} patternUnits="userSpaceOnUse" width="6" height="6">
            <path
              d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2"
              stroke={isUsed ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)"}
              strokeWidth="1"
            />
          </pattern>
        </defs>

        {/* Main Coupon Shape with Notches */}
        <path
          d={`
            M 0 10
            Q 0 0 10 0
            L 390 0
            Q 400 0 400 10
            L 400 60
            A 20 20 0 0 0 400 100
            L 400 150
            Q 400 160 390 160
            L 10 160
            Q 0 160 0 150
            L 0 100
            A 20 20 0 0 0 0 60
            Z
          `}
          fill={`url(#couponGradient-${code})`}
        />
        
        {/* Texture overlay */}
        <path
          d={`
            M 0 10
            Q 0 0 10 0
            L 390 0
            Q 400 0 400 10
            L 400 60
            A 20 20 0 0 0 400 100
            L 400 150
            Q 400 160 390 160
            L 10 160
            Q 0 160 0 150
            L 0 100
            A 20 20 0 0 0 0 60
            Z
          `}
          fill={`url(#diagonalLines-${code})`}
        />

        {/* White Section on Right */}
        <path
          d={`
            M 300 0
            L 390 0
            Q 400 0 400 10
            L 400 60
            A 20 20 0 0 0 400 100
            L 400 150
            Q 400 160 390 160
            L 300 160
            Z
          `}
          fill="white"
        />

        {/* Dashed Line Separator */}
        <line
          x1="72"
          y1="10"
          x2="72"
          y2="150"
          stroke="rgba(0,0,0,0.15)"
          strokeWidth="2"
          strokeDasharray="6,4"
        />

        {/* Vertical Separator before white section */}
        <line
          x1="300"
          y1="10"
          x2="300"
          y2="150"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="1"
        />
      </svg>

      {/* Content Overlay */}
      <div className="absolute inset-0 flex">
        {/* Left Section - Rotated Text */}
        <div className="w-[18%] flex items-center justify-center">
          <span
            className="text-[8px] md:text-[10px] font-bold tracking-wider text-gray-800 whitespace-nowrap"
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              letterSpacing: "0.5px",
            }}
          >
            {leftText.toUpperCase()}
          </span>
        </div>

        {/* Center Section - Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-2 md:px-4">
          {/* Discount Badge */}
          <div
            className="px-3 md:px-4 py-1 md:py-1.5 mb-1 md:mb-2"
            style={{ backgroundColor: accentColor }}
          >
            <span
              className="text-xl md:text-2xl lg:text-3xl font-bold tracking-wide"
              style={{ color: bgColor }}
            >
              {discount.toUpperCase()}
            </span>
          </div>

          {/* Subtitle */}
          <span className="text-lg md:text-xl lg:text-2xl font-bold text-gray-800 mb-1 md:mb-2">
            {subtitle.toUpperCase()}
          </span>

          {/* Valid Until */}
          <span className="text-[8px] md:text-[10px] font-semibold text-gray-600 tracking-widest uppercase">
            {validUntil.toUpperCase()}
          </span>
        </div>

        {/* Right Section - Code */}
        <div className="w-[25%] flex items-center justify-center bg-white rounded-r-lg">
          <span
            className="text-sm md:text-base lg:text-lg font-light text-gray-800 tracking-wide"
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              fontFamily: "'Courier New', Courier, monospace",
            }}
          >
            {code}
          </span>
        </div>
      </div>

      {/* Used Overlay */}
      {isUsed && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="absolute rotate-[-15deg] border-4 border-gray-500 rounded-lg px-4 py-2 opacity-50"
          >
            <span className="text-2xl md:text-3xl font-bold text-gray-500 tracking-wider">
              USED
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CouponWidget;