// app/[locale]/dynamicmarket/loading.tsx
//
// Streaming fallback for /dynamicmarket. Next wraps the route in a Suspense
// boundary using this file, so the browser receives this skeleton HTML
// immediately while the page's server-side prefetch (in page.tsx) continues
// in the background. As soon as the prefetch resolves, the real page tree is
// streamed in to replace this skeleton — no client-side waterfall, no blank
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

      <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-900">
        <div className="flex max-w-7xl mx-auto">
          {/* Sidebar placeholder (desktop only) */}
          <aside
            aria-hidden
            className="hidden lg:block w-60 flex-shrink-0 p-4 space-y-3"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-7 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"
              />
            ))}
          </aside>

          {/* Main content placeholder */}
          <div className="flex-1 min-w-0">
            <div className="w-full pt-6 pb-4 px-4">
              <div className="h-7 w-1/3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-2" />
              <div className="h-4 w-1/4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
            </div>
            <div className="px-4 pb-8">
              <ProductGridSkeleton count={8} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
