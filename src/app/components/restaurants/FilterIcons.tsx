"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FoodCategoryData } from "@/constants/foodData";

// Map each top-level category key to its icon filename in /public/foods/
const CATEGORY_ICONS: Record<string, string> = {
  "Kebabs & Grills": "kebab.png",
  "Pide & Lahmacun": "lahmacun.png",
  "Soups": "soup.png",
  "Salads": "salad.png",
  "Appetizers & Meze": "meze.png",
  "Stews & Casseroles": "stew.png",
  "Dolma & Sarma": "dolma.png",
  "Steak & Roast": "steak.png",
  "Stir Fry & Wok": "stir.png",
  "Fried Chicken": "friedchicken.png",
  "Rice & Pilaf": "rice.png",
  "Noodles": "noodle.png",
  "Sushi & Sashimi": "sushi.png",
  "Curry": "curry.png",
  "Pasta": "pasta.png",
  "Wraps": "wrap.png",
  "Doner": "doner.png",
  "Sandwich & Toast": "sandwich.png",
  "Seafood": "seafood.png",
  "Breakfast": "breakfast.png",
  "Desserts & Pastry": "desert.png",
  "Beverages": "beverages.png",
  "Hamburger": "hamburger.png",
  "Pizza": "pizza.png",
};

const SCROLL_AMOUNT = 300;

interface FilterIconsProps {
  selected: string | null;
  onSelect: (foodType: string | null) => void;
  isDarkMode: boolean;
  /** If provided, only show icons for these category keys */
  categories?: string[];
}

export default function FilterIcons({
  selected,
  onSelect,
  isDarkMode,
  categories,
}: FilterIconsProps) {
  const t = useTranslations();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction === "left" ? -SCROLL_AMOUNT : SCROLL_AMOUNT,
      behavior: "smooth",
    });
  };

  return (
    <div className="relative group/filter mb-2">
      {/* Left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          aria-label="Scroll left"
          className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-opacity ${
            isDarkMode
              ? "bg-gray-800 border border-gray-700 text-gray-300 hover:text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:text-gray-900 shadow-md"
          }`}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          aria-label="Scroll right"
          className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-opacity ${
            isDarkMode
              ? "bg-gray-800 border border-gray-700 text-gray-300 hover:text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:text-gray-900 shadow-md"
          }`}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* Scrollable row */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 px-1 scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {FoodCategoryData.kCategories
          .filter(({ key }) => !categories || categories.includes(key))
          .map(({ key }) => {
          const icon = CATEGORY_ICONS[key];
          const translationKey =
            FoodCategoryData.kCategoryTranslationKeys[key];
          const label = translationKey ? t(translationKey) : key;
          const isActive = selected === key;

          return (
            <button
              key={key}
              onClick={() => onSelect(isActive ? null : key)}
              className={`flex flex-col items-center gap-1.5 min-w-[72px] shrink-0 py-2 px-1 rounded-xl transition-all duration-200 ${
                isActive
                  ? "bg-orange-50 dark:bg-orange-500/10"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
              }`}
            >
              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 ${
                  isActive
                    ? "bg-orange-100 ring-2 ring-orange-500 dark:bg-orange-500/20"
                    : isDarkMode
                      ? "bg-gray-800 border border-gray-700"
                      : "bg-gray-100 border border-gray-200"
                }`}
              >
                {icon && (
                  <Image
                    src={`/foods/${icon}`}
                    alt={label}
                    width={32}
                    height={32}
                    className="object-contain"
                  />
                )}
              </div>
              <span
                className={`text-[11px] leading-tight text-center line-clamp-2 max-w-[72px] ${
                  isActive
                    ? "text-orange-600 font-semibold dark:text-orange-400"
                    : isDarkMode
                      ? "text-gray-400"
                      : "text-gray-600"
                }`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
