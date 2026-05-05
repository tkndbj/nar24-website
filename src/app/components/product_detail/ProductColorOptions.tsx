// src/app/components/product_detail/ProductColorOptions.tsx
//
// Web port of Flutter's product_detail_color_options.dart.
//
// Renders a horizontal row of color thumbnails when the product has
// per-color images. Selecting a swatch is purely a parent-state update —
// the gallery component swaps its source list to that color's images.
//
// Performance contract:
//   • No fetches, no effects — data already lives on the Product object.
//   • Thumbnails reuse SmartImage's CDN-backed pipeline.
//   • Returns null (no DOM) when the product has no colorImages — zero
//     cost for products without color variants.
//
// Mirrors Flutter:
//   • 80 × 100 thumbs, 8 px gap, horizontal scroll.
//   • Orange-2 px border on selected, gray-1 px otherwise.
//   • "Popular" badge on the first swatch.
//   • Header: "Color" label + "<n> Different Colors" hint.

"use client";

import React, { useMemo } from "react";
import { Rocket } from "lucide-react";
import { useTranslations } from "next-intl";
import SmartImage from "@/app/components/SmartImage";
import { Product } from "@/app/models/Product";

interface ProductColorOptionsProps {
  product: Product;
  selectedColor: string | null;
  onSelectColor: (color: string | null) => void;
  /**
   * Pass the next-intl translator from the page so we share the same
   * namespace cache. Interpolation (e.g. `{count}`) goes through this.
   */
  localization: ReturnType<typeof useTranslations>;
}

interface ColorEntry {
  color: string;
  /** First image (storage path or URL) — what the swatch displays. */
  thumbSource: string;
}

/**
 * Translate with namespace fallback, mirroring the page-level `t` helper.
 * Tries `ProductDetailPage.<key>`, then `<key>` at the root, then returns
 * the key itself so the UI never crashes on a missing string.
 */
function translate(
  localization: ReturnType<typeof useTranslations>,
  key: string,
  vars?: Record<string, string | number>,
): string {
  if (!localization) return key;
  try {
    const namespaced = localization(
      `ProductDetailPage.${key}` as never,
      vars as never,
    );
    if (namespaced && namespaced !== `ProductDetailPage.${key}`) {
      return namespaced;
    }
  } catch {
    /* fall through */
  }
  try {
    const root = localization(key as never, vars as never);
    if (root && root !== key) return root;
  } catch {
    /* fall through */
  }
  return key;
}

const ProductColorOptions: React.FC<ProductColorOptionsProps> = ({
  product,
  selectedColor,
  onSelectColor,
  localization,
}) => {
  // Stable list — keyed off colorImages identity, so re-renders from
  // unrelated state changes don't rebuild the array.
  const entries = useMemo<ColorEntry[]>(() => {
    const map = product.colorImages as Record<string, string[]> | undefined;
    if (!map) return [];
    const out: ColorEntry[] = [];
    for (const [color, images] of Object.entries(map)) {
      if (!Array.isArray(images) || images.length === 0) continue;
      const first = images[0];
      if (typeof first !== "string" || first.length === 0) continue;
      out.push({ color, thumbSource: first });
    }
    return out;
  }, [product.colorImages]);

  if (entries.length === 0) return null;

  const labelColor = translate(localization, "color");
  const labelCount = translate(localization, "differentColorsCount", {
    count: entries.length,
  });
  const labelPopular = translate(localization, "popular");

  return (
    <div className="rounded-none sm:rounded-2xl shadow-sm bg-white border border-gray-200 dark:bg-surface-2 dark:border-gray-700 -mx-4 sm:mx-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-base font-bold text-gray-900 dark:text-white">
          {labelColor}
        </span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {labelCount}
        </span>
      </div>

      {/* Swatch row */}
      <div
        className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {entries.map((entry, index) => {
          const isSelected = selectedColor === entry.color;
          const isPopular = index === 0;
          return (
            <button
              key={entry.color}
              type="button"
              onClick={() =>
                onSelectColor(isSelected ? null : entry.color)
              }
              aria-pressed={isSelected}
              aria-label={entry.color}
              className={`relative flex-shrink-0 w-20 h-[100px] rounded-lg overflow-hidden transition-[border,transform] duration-150 active:scale-95 ${
                isSelected
                  ? "border-2 border-orange-500"
                  : "border border-gray-300 dark:border-gray-600"
              }`}
            >
              <SmartImage
                source={entry.thumbSource}
                size="thumbnail"
                alt={entry.color}
                fill
                className="object-cover"
                sizes="80px"
              />
              {isPopular && (
                <span className="absolute top-1 left-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-medium leading-none shadow">
                  <Rocket className="w-3 h-3" strokeWidth={2.5} />
                  {labelPopular}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Memoize: this component re-renders ONLY when colorImages, selectedColor,
// or the t/onSelectColor identities change. Wrapping ProductDetailClient
// state changes (cart toggles, scroll detection, etc.) won't re-run this.
export default React.memo(ProductColorOptions);
