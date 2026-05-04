// app/[locale]/search-results/loading.tsx
//
// Streaming fallback. See dynamicmarket/loading.tsx for the rationale.

import ProductGridSkeleton from "@/app/components/skeletons/ProductGridSkeleton";

export default function Loading() {
  return (
    <div className="min-h-screen w-full bg-gray-50 dark:bg-gray-950">
      <div className="flex max-w-7xl mx-auto">
        {/* Sidebar placeholder (desktop only) */}
        <aside
          aria-hidden
          className="hidden lg:block w-60 flex-shrink-0 p-4 space-y-3"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-7 rounded bg-gray-200 dark:bg-gray-800 animate-pulse"
            />
          ))}
        </aside>

        {/* Main content placeholder */}
        <div className="flex-1 min-w-0">
          {/* Sticky header bar placeholder (back arrow + query + sort) */}
          <div
            aria-hidden
            className="sticky top-0 z-10 border-b backdrop-blur-xl bg-white/95 dark:bg-gray-900/95 border-gray-100 dark:border-white/[0.07]"
          >
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
              <div className="flex-1 h-5 rounded bg-gray-200 dark:bg-gray-800 animate-pulse" />
              <div className="w-24 h-9 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
            </div>
          </div>

          <div className="px-4 pt-4 pb-8">
            <ProductGridSkeleton count={8} />
          </div>
        </div>
      </div>
    </div>
  );
}
