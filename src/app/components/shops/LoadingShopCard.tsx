import React from "react";

interface LoadingShopCardProps {
  isDarkMode: boolean;
}

export default function LoadingShopCard({ isDarkMode }: LoadingShopCardProps) {
  return (
    <>
      {/* Mobile Layout - Compact Horizontal Skeleton */}
      <div
        className={`sm:hidden relative rounded-lg overflow-hidden animate-pulse flex ${
          isDarkMode
            ? "bg-gray-800 border border-gray-700"
            : "bg-white border border-gray-200"
        }`}
      >
        {/* Left: Image Skeleton */}
        <div className={`w-28 h-28 flex-shrink-0 ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`} />

        {/* Right: Content Skeleton */}
        <div className="flex-1 p-2.5 flex flex-col justify-between">
          <div className="space-y-2">
            {/* Shop Name */}
            <div
              className={`h-4 w-3/4 rounded ${
                isDarkMode ? "bg-gray-700" : "bg-gray-200"
              }`}
            />
            {/* Rating */}
            <div
              className={`h-3 w-1/2 rounded ${
                isDarkMode ? "bg-gray-700" : "bg-gray-200"
              }`}
            />
            {/* Category */}
            <div
              className={`h-3 w-16 rounded ${
                isDarkMode ? "bg-gray-700" : "bg-gray-200"
              }`}
            />
          </div>
          {/* Stats */}
          <div className="flex gap-3">
            <div
              className={`h-3 w-10 rounded ${
                isDarkMode ? "bg-gray-700" : "bg-gray-200"
              }`}
            />
            <div
              className={`h-3 w-10 rounded ${
                isDarkMode ? "bg-gray-700" : "bg-gray-200"
              }`}
            />
          </div>
        </div>
      </div>

      {/* Desktop/Tablet Layout - Original Vertical Skeleton */}
      <div
        className={`hidden sm:block relative rounded-xl overflow-hidden animate-pulse ${
          isDarkMode
            ? "bg-gray-800 border border-gray-700"
            : "bg-white border border-gray-200"
        }`}
      >
        {/* Cover Image Skeleton */}
        <div className={`h-32 ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`} />

        {/* Profile Image Skeleton */}
        <div className="absolute top-20 left-4">
          <div
            className={`w-16 h-16 rounded-full border-4 border-white ${
              isDarkMode ? "bg-gray-600" : "bg-gray-300"
            }`}
          />
        </div>

        {/* Content Skeleton */}
        <div className="p-4 pt-8 space-y-3">
          {/* Shop Name */}
          <div
            className={`h-6 rounded ${
              isDarkMode ? "bg-gray-700" : "bg-gray-200"
            }`}
          />

          {/* Categories */}
          <div className="flex gap-2">
            <div
              className={`h-5 w-16 rounded-full ${
                isDarkMode ? "bg-gray-700" : "bg-gray-200"
              }`}
            />
            <div
              className={`h-5 w-12 rounded-full ${
                isDarkMode ? "bg-gray-700" : "bg-gray-200"
              }`}
            />
          </div>

          {/* Address */}
          <div
            className={`h-4 w-3/4 rounded ${
              isDarkMode ? "bg-gray-700" : "bg-gray-200"
            }`}
          />

          {/* Stats */}
          <div className={`grid grid-cols-3 gap-2 pt-3 border-t ${isDarkMode ? "border-gray-700" : "border-gray-300"}`}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="text-center space-y-2">
                <div
                  className={`h-4 w-8 mx-auto rounded ${
                    isDarkMode ? "bg-gray-700" : "bg-gray-200"
                  }`}
                />
                <div
                  className={`h-3 w-12 mx-auto rounded ${
                    isDarkMode ? "bg-gray-700" : "bg-gray-200"
                  }`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
