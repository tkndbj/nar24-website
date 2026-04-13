"use client";

import React, { useState } from "react";
import { Languages, AlertCircle } from "lucide-react";

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
  const [expanded, setExpanded] = useState(false);

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
    <div className="rounded-lg p-2 sm:p-3 border bg-white dark:bg-surface border-gray-200 dark:border-gray-700">
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
            <p
              className={`leading-relaxed text-xs sm:text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap ${
                expanded ? "" : "line-clamp-[6]"
              }`}
            >
              {displayText}
            </p>
            {isLong && !isTranslating && !expanded && (
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
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs sm:text-sm font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
        >
          {expanded
            ? t("showLess") || "Show Less"
            : t("readAll") || "Read All"}
        </button>
      )}
    </div>
  );
}
