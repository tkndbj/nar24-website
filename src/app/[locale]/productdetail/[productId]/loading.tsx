// src/app/[locale]/productdetail/[productId]/loading.tsx
//
// Rendered by Next.js immediately when the route starts loading, while the
// server component (page.tsx) is still running. This is where we get
// Flutter-parity instant rendering: we read the product from
// ProductCacheProvider — populated when the user saw the product in a card
// grid — and paint the hero (image, name, brand, price) with zero network.
//
// When page.tsx is ready Next.js swaps this fallback for the full page. The
// hero stays visually identical (same image / name / price), so the swap is
// invisible to the user; the secondary widgets (reviews, related, etc.)
// then mount once and self-fetch.
//
// Cache miss path (direct URL, share link, deep refresh): renders a generic
// skeleton until page.tsx is ready (~150–300ms).

"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import CloudinaryImage from "@/app/components/CloudinaryImage";
import { useProductCache } from "@/context/ProductCacheProvider";
import {
  extractProductIdFromPath,
  normalizeProductId,
} from "@/lib/product-id";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700 ${className}`}
    />
  );
}

export default function ProductDetailLoading() {
  const pathname = usePathname();
  const { getProduct } = useProductCache();

  const cached = useMemo(() => {
    if (!pathname) return null;
    const rawId = extractProductIdFromPath(pathname);
    if (!rawId) return null;
    return getProduct(normalizeProductId(rawId));
  }, [pathname, getProduct]);

  // Pick a hero image source the same way ProductCard / ProductImageGallery do
  const heroSource = cached
    ? (cached.imageStoragePaths?.[0] ?? cached.imageUrls?.[0] ?? null)
    : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface">
      {/* Sticky Header — mirrors ProductDetailClient so the back button
          doesn't move when the swap to page.tsx happens */}
      <div className="sticky sticky-below-market-header-mobile lg:top-[calc(3.25rem+1px)] xl:top-[calc(3.5rem+1px)] z-[60] border-b bg-white/95 dark:bg-surface backdrop-blur-md border-gray-200 dark:border-gray-700">
        <div className="w-full px-3 py-2 sm:max-w-6xl sm:mx-auto sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => window.history.back()}
              className="p-1.5 sm:p-2 rounded-lg transition-colors flex-shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1" />
          </div>
        </div>
      </div>

      <div className="w-full sm:max-w-6xl sm:mx-auto p-2 sm:p-3 lg:p-4 overflow-x-hidden">
        <div className="grid lg:grid-cols-2 gap-3 sm:gap-6 lg:gap-8">
          {/* Image — from cache when available, skeleton otherwise */}
          <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700">
            {heroSource ? (
              <CloudinaryImage.Compat
                source={heroSource}
                size="detail"
                fit="cover"
                alt={cached?.productName ?? ""}
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            ) : (
              <div className="w-full h-full animate-pulse" />
            )}
          </div>

          {/* Right column — title + price from cache */}
          <div className="space-y-3 sm:space-y-4">
            <div className="space-y-1.5 sm:space-y-2">
              {cached?.brandModel ? (
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="text-xs sm:text-sm font-semibold px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-700">
                    {cached.brandModel}
                  </span>
                </div>
              ) : (
                <SkeletonBlock className="h-5 w-24" />
              )}

              {cached?.productName ? (
                <h1 className="text-base sm:text-lg lg:text-xl font-bold leading-tight text-gray-900 dark:text-white">
                  {cached.productName}
                </h1>
              ) : (
                <SkeletonBlock className="h-7 w-3/4" />
              )}

              {cached ? (
                <div className="text-lg sm:text-xl lg:text-2xl font-bold text-orange-600">
                  {cached.price} {cached.currency}
                </div>
              ) : (
                <SkeletonBlock className="h-8 w-32" />
              )}
            </div>

            {/* Below the title block, render skeleton placeholders for the
                sections that page.tsx will populate. Sized to roughly match
                so the layout doesn't jump on swap. */}
            <SkeletonBlock className="h-12 w-full" />
            <SkeletonBlock className="h-24 w-full" />
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-32 w-full" />
          </div>
        </div>

        {/* Bottom sections placeholder */}
        <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
          <SkeletonBlock className="h-40 w-full" />
          <SkeletonBlock className="h-40 w-full" />
        </div>

        <div className="h-20 sm:h-24" />
      </div>
    </div>
  );
}
