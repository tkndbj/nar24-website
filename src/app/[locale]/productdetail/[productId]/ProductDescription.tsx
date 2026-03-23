"use client";

import React, { useState } from "react";
import { Languages, AlertCircle, X } from "lucide-react";

interface ProductDescriptionProps {
  description: string;
  isTranslated: boolean;
  translatedText: string;
  isTranslating: boolean;
  translationError: string | null;
  onToggleTranslation: () => void;
  t: (key: string) => string;
}

export default function ProductDescription({
  description,
  isTranslated,
  translatedText,
  isTranslating,
  translationError,
  onToggleTranslation,
  t,
}: ProductDescriptionProps) {
  const [showModal, setShowModal] = useState(false);

  const displayText = isTranslated ? translatedText : description;
  const isLong = description.length > 250;

  const translationButton = (
    <button
      onClick={onToggleTranslation}
      disabled={isTranslating}
      className={`flex items-center gap-1.5 px-2 py-1 sm:px-3 rounded-lg text-xs font-medium transition-all duration-200 hover:scale-105 ${
        isTranslating ? "opacity-50 cursor-not-allowed" : ""
      } ${
        isTranslated
          ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border border-orange-300 dark:border-orange-700"
          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-gray-600 hover:text-orange-600 dark:hover:text-orange-400"
      }`}
    >
      <Languages className={`w-3 h-3 ${isTranslating ? "animate-pulse" : ""}`} />
      <span>
        {isTranslating
          ? t("translating")
          : isTranslated
            ? t("original")
            : t("translate")}
      </span>
    </button>
  );

  const shimmerLines = (count: number) => (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`h-3 rounded animate-pulse bg-gray-200 dark:bg-gray-600 ${
            i === count - 1 ? "w-3/4" : "w-full"
          }`}
        />
      ))}
    </div>
  );

  return (
    <>
      <div className="rounded-lg p-2 sm:p-3 border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-1.5 sm:mb-2">
          <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
            {t("productDescription")}
          </h3>
          {translationButton}
        </div>

        <div className="relative">
          {isTranslating ? (
            shimmerLines(Math.min(Math.ceil(description.length / 60), 5))
          ) : (
            <>
              <p className="leading-relaxed text-xs sm:text-sm text-gray-700 dark:text-gray-300 line-clamp-[6]">
                {displayText}
              </p>
              {isLong && !isTranslating && (
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white dark:from-gray-800 via-white/80 dark:via-gray-800/80 to-transparent pointer-events-none" />
              )}
            </>
          )}
        </div>

        {translationError && !isTranslating && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-red-500 dark:text-red-400">
            <AlertCircle className="w-3 h-3" />
            <span>{translationError}</span>
          </div>
        )}

        {isLong && !isTranslating && (
          <button
            onClick={() => setShowModal(true)}
            className="mt-2 text-xs sm:text-sm font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
          >
            {t("readAll") || "Read All"}
          </button>
        )}
      </div>

      {/* Description Modal */}
      {showModal && (
        <>
          <div
            className="fixed inset-0 z-[999]"
            onClick={() => setShowModal(false)}
          />
          <div className="fixed top-20 right-4 z-[1000] max-w-md w-[calc(100vw-2rem)]">
            <div className="rounded-lg shadow-2xl border overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 animate-slideInFromTop">
              <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                  {t("productDescription")}
                </h3>
                <div className="flex items-center gap-2">
                  {translationButton}
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-1 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-3 max-h-[70vh] overflow-y-auto text-gray-700 dark:text-gray-300">
                {isTranslating ? (
                  shimmerLines(Math.min(Math.ceil(description.length / 50), 8))
                ) : (
                  <>
                    <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                      {displayText}
                    </p>
                    {translationError && (
                      <div className="flex items-center gap-1.5 mt-3 text-xs text-red-500 dark:text-red-400">
                        <AlertCircle className="w-3 h-3" />
                        <span>{translationError}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
