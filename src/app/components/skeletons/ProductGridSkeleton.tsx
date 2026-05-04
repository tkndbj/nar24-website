// components/skeletons/ProductGridSkeleton.tsx
//
// Server-rendered product grid skeleton used by the route-level `loading.tsx`
// of the dynamic-product list pages. No `'use client'` — it must remain a
// server component so it doesn't pull a client bundle into the loading state
// (which would defeat the point of streaming a fast first paint).
//
// Theme: relies on Tailwind's `dark:` variant. The inline theme script in
// `app/layout.tsx` sets `<html class="dark">` before React hydrates, so the
// skeleton respects the user's preference even at the very first paint.

import type { CSSProperties } from "react";

interface Props {
  /** Number of skeleton cards to render. Defaults to 8 — matches the page's
   *  initial-load skeleton count, keeping CLS minimal. */
  count?: number;
  /** Card image height in px. Matches `portraitImageHeight` on ProductCard. */
  imageHeight?: number;
  className?: string;
}

/**
 * Reusable grid of "loading" product placeholders. Pure CSS — no JS, no JS
 * runtime cost in the loading state.
 */
export default function ProductGridSkeleton({
  count = 8,
  imageHeight = 320,
  className = "",
}: Props) {
  // Pre-compute style objects once per render (cheap, but tidier than inlining).
  const imageStyle: CSSProperties = { height: imageHeight };
  const lineWidths = [85, 60] as const;

  return (
    <div
      aria-hidden
      className={
        "grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-4 " +
        className
      }
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg overflow-hidden bg-white dark:bg-gray-800"
        >
          <div
            className="w-full bg-gray-100 dark:bg-[#2d2b40] animate-pulse"
            style={imageStyle}
          />
          <div className="p-3 space-y-2">
            {lineWidths.map((w) => (
              <div
                key={w}
                className="h-3 rounded bg-gray-200 dark:bg-[#2d2b40] animate-pulse"
                style={{ width: `${w}%` }}
              />
            ))}
            <div
              className="h-4 rounded bg-gray-200 dark:bg-[#2d2b40] animate-pulse"
              style={{ width: "45%" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
