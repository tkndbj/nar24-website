import React from "react";

interface LoadingShopCardProps {
  isDarkMode: boolean;
}

export default function LoadingShopCard({ isDarkMode }: LoadingShopCardProps) {
  return (
    <div
      className={`relative rounded-xl overflow-hidden animate-pulse ${
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
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-300">
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
  );
}
