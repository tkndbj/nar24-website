// app/[locale]/shopdetail/[id]/loading.tsx
//
// Streaming fallback for /shopdetail/[id]. Next wraps the route in a Suspense
// boundary using this file, so the browser receives this skeleton HTML
// immediately while page.tsx's bundle prefetch resolves. The real page tree
// streams in to replace this skeleton — no client-side waterfall, no blank
// screen during TTFB.
//
// Pure server component. Tailwind's `dark:` variant works at first paint
// because the inline theme script in app/layout.tsx sets the `dark` class on
// `<html>` before React hydrates.

import ProductGridSkeleton from "@/app/components/skeletons/ProductGridSkeleton";

export default function Loading() {
  return (
    <>
      {/* SecondHeader placeholder stripe (real header renders client-side) */}
      <div
        aria-hidden
        className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
      />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto">
          {/* Cover-image placeholder */}
          <div
            aria-hidden
            className="relative h-80 bg-gradient-to-br from-orange-200 to-pink-200 dark:from-gray-700 dark:to-gray-800 animate-pulse"
          />

          {/* Body */}
          <div className="flex">
            {/* Sidebar placeholder (desktop only) */}
            <aside
              aria-hidden
              className="hidden lg:block w-72 flex-shrink-0 p-4 space-y-3"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-7 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"
                />
              ))}
            </aside>

            <div className="flex-1 min-w-0">
              {/* Search-bar placeholder */}
              <div className="px-4 py-3">
                <div className="h-12 w-full rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
              </div>
              {/* Tab-bar placeholder */}
              <div className="px-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex gap-3 py-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-7 w-20 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"
                    />
                  ))}
                </div>
              </div>
              {/* Product grid placeholder */}
              <div className="p-4">
                <ProductGridSkeleton count={8} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
