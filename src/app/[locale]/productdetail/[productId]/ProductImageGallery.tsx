"use client";

import React, { useState, useCallback, lazy, Suspense } from "react";
import { Play } from "lucide-react";
import { Product } from "@/app/models/Product";
import SmartImage from "@/app/components/SmartImage";

const FullScreenImageViewer = lazy(
  () => import("../../../components/product_detail/FullScreenImageViewer"),
);

interface ProductImageGalleryProps {
  product: Product;
  t: (key: string) => string;
}

export default function ProductImageGallery({
  product,
  t,
}: ProductImageGalleryProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [previousImageIndex, setPreviousImageIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState<"left" | "right">(
    "right",
  );
  const [showFullScreenViewer, setShowFullScreenViewer] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  // Track which image indices have finished loading so we can hide the
  // spinner overlay once the new image paints. Index 0 starts marked so
  // the initial render doesn't flash a spinner while the priority image
  // is already in-flight.
  const [imagesLoaded, setImagesLoaded] = useState<Set<number>>(
    () => new Set([0]),
  );

  // Prefer storage paths (post-migration); legacy `imageUrls` are
  // accepted by SmartImage too — it extracts the storage path from
  // Firebase download URLs and still routes the request through the CDN.
  const sources = React.useMemo<string[]>(() => {
    if (product.imageStoragePaths && product.imageStoragePaths.length > 0) {
      return product.imageStoragePaths;
    }
    return product.imageUrls || [];
  }, [product.imageStoragePaths, product.imageUrls]);

  const handleImageError = useCallback((index: number) => {
    setImageErrors((prev) => new Set(prev).add(index));
  }, []);

  const handleImageLoaded = useCallback((index: number) => {
    setImagesLoaded((prev) => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  }, []);

  const handleImageChange = useCallback(
    (index: number) => {
      const direction = index > currentImageIndex ? "right" : "left";
      setSlideDirection(direction);
      setPreviousImageIndex(currentImageIndex);
      setCurrentImageIndex(index);
    },
    [currentImageIndex],
  );

  return (
    <div className="space-y-2 sm:space-y-3 overflow-x-hidden">
      {/* Main Image */}
      <div className="relative w-full h-[400px] sm:h-[480px] lg:h-[560px] rounded-lg overflow-hidden">
        {sources.length > 0 && !imageErrors.has(currentImageIndex) ? (
          <div className="relative w-full h-full overflow-hidden">
            {previousImageIndex !== currentImageIndex && (
              <div className="absolute inset-0">
                <SmartImage
                  key={`prev-${previousImageIndex}`}
                  source={sources[previousImageIndex]}
                  size="detail"
                  alt={product.productName}
                  fill
                  className="object-contain"
                  style={{
                    animation:
                      slideDirection === "right"
                        ? "slideOutToLeft 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards"
                        : "slideOutToRight 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards",
                  }}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
              </div>
            )}

            <div className="absolute inset-0">
              <SmartImage
                key={`current-${currentImageIndex}`}
                source={sources[currentImageIndex]}
                size="detail"
                alt={product.productName}
                fill
                className="object-contain cursor-pointer hover:scale-105 transition-transform duration-300"
                // Only slide-animate when an actual image change happened.
                // On first mount (or when this is the only image), don't
                // animate — otherwise it competes with the loading.tsx
                // hero hand-off and looks like the image renders twice.
                style={
                  previousImageIndex !== currentImageIndex
                    ? {
                        animation:
                          slideDirection === "right"
                            ? "slideInFromRight 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards"
                            : "slideInFromLeft 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards",
                      }
                    : undefined
                }
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                onClick={() => setShowFullScreenViewer(true)}
                onFallbackError={() => handleImageError(currentImageIndex)}
                onLoad={() => handleImageLoaded(currentImageIndex)}
                priority
              />
            </div>

            {/* Loading spinner — shown only while the current image has
                not finished loading. Positioned above the sliding Image
                layers so it's visible during the transition. */}
            {!imagesLoaded.has(currentImageIndex) && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/5 backdrop-blur-[2px]">
                <div className="w-10 h-10 border-4 border-gray-200/60 border-t-orange-500 rounded-full animate-spin" />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-2 rounded-lg bg-gray-300 dark:bg-gray-600" />
              <p className="text-sm sm:text-base">{t("noImageAvailable")}</p>
            </div>
          </div>
        )}

        {/* Video Play Button */}
        {(product.videoStoragePath || product.videoUrl) && (
          <button
            onClick={() => setShowVideoModal(true)}
            className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 p-2 sm:p-3 bg-black/60 backdrop-blur-sm rounded-full text-white hover:bg-black/80 transition-all hover:scale-110"
          >
            <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
          </button>
        )}

        {/* Best Seller Badge */}
        {product.bestSellerRank && product.bestSellerRank <= 10 && (
          <div className="absolute top-3 left-3 sm:top-4 sm:left-4 px-2 py-0.5 sm:px-3 sm:py-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white text-xs sm:text-sm font-bold rounded-full shadow-lg">
            #{product.bestSellerRank} {t("bestSeller")}
          </div>
        )}
      </div>

      {/* Thumbnail Images */}
      {sources.length > 1 && (
        <div className="flex justify-center w-full overflow-x-hidden lg:overflow-x-visible">
          <div
            className="flex gap-1.5 sm:gap-2 overflow-x-auto py-2 px-2 scrollbar-hide max-w-full"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {sources.map((s, index) => (
              <button
                key={index}
                onClick={() => handleImageChange(index)}
                onMouseEnter={() => handleImageChange(index)}
                className={`flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-md overflow-hidden border-2 transition-all duration-300 ${
                  index === currentImageIndex
                    ? "border-orange-500 shadow-lg scale-105"
                    : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                }`}
              >
                <SmartImage
                  source={s}
                  size="thumbnail"
                  alt={`${t("productImage")} ${index + 1}`}
                  width={56}
                  height={56}
                  className="w-full h-full object-cover"
                  onFallbackError={() => handleImageError(index)}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Video Modal */}
      {showVideoModal && product.videoUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3 sm:p-4">
          <div className="relative w-full max-w-4xl aspect-video bg-black rounded-lg sm:rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowVideoModal(false)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 p-2 sm:p-3 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
            >
              <span className="w-5 h-5 sm:w-6 sm:h-6">✕</span>
            </button>
            <video
              src={product.videoUrl}
              controls
              autoPlay
              className="w-full h-full"
            />
          </div>
        </div>
      )}

      {/* FullScreen Viewer */}
      {showFullScreenViewer && (
        <Suspense fallback={null}>
          <FullScreenImageViewer
            sources={sources}
            initialIndex={currentImageIndex}
            isOpen={showFullScreenViewer}
            onClose={() => setShowFullScreenViewer(false)}
          />
        </Suspense>
      )}

      <style jsx>{`
        @keyframes slideInFromRight {
          0% {
            transform: translateX(100%);
          }
          100% {
            transform: translateX(0);
          }
        }
        @keyframes slideInFromLeft {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(0);
          }
        }
        @keyframes slideOutToLeft {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-100%);
          }
        }
        @keyframes slideOutToRight {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  );
}
