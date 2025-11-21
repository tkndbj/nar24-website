// src/components/productdetail/FullScreenImageViewer.tsx

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";

interface FullScreenImageViewerProps {
  imageUrls: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

const FullScreenImageViewer: React.FC<FullScreenImageViewerProps> = ({
  imageUrls,
  initialIndex = 0,
  isOpen,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : imageUrls.length - 1));
  }, [imageUrls.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < imageUrls.length - 1 ? prev + 1 : 0));
  }, [imageUrls.length]);

  const goToIndex = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const handleImageError = useCallback((index: number) => {
    setImageErrors((prev) => new Set(prev).add(index));
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          goToPrevious();
          break;
        case "ArrowRight":
          goToNext();
          break;
      }
    },
    [isOpen, onClose, goToPrevious, goToNext]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const currentImageUrl = imageUrls[currentIndex];
  const hasImageError = imageErrors.has(currentIndex);
  const hasMultipleImages = imageUrls.length > 1;

  const viewerContent = (
    <div
      className="bg-black flex flex-col"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 99999,
        overflow: "hidden",
        touchAction: "none",
        margin: 0,
        padding: 0,
      }}
    >
        {/* Close Button - Top Left */}
        <div className="absolute top-4 left-4 z-50 md:top-6 md:left-6">
          <button
            onClick={onClose}
            className="p-2 md:p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 text-white"
            aria-label="Close viewer"
          >
            <X className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>

        {/* Image Counter - Top Center (Mobile) / Top Right (Desktop) */}
        <div className="absolute top-4 right-4 z-50 md:top-6 md:right-6">
          <div className="px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-white/10 backdrop-blur-sm text-white text-sm md:text-base font-medium">
            {currentIndex + 1} / {imageUrls.length}
          </div>
        </div>

        {/* Main Image Container */}
        <div
          className="flex items-center justify-center relative"
          style={{
            position: 'absolute',
            top: '60px',
            left: 0,
            right: 0,
            bottom: hasMultipleImages ? '120px' : '60px',
            padding: '0 16px'
          }}
        >
          {/* Previous Button */}
          {hasMultipleImages && (
            <button
              onClick={goToPrevious}
              className="absolute left-2 md:left-6 z-40 p-2 md:p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 text-white"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-6 h-6 md:w-8 md:h-8" />
            </button>
          )}

          {/* Current Image */}
          <div className="relative w-full h-full flex items-center justify-center">
            {!hasImageError ? (
              <img
                src={currentImageUrl}
                alt={`Product image ${currentIndex + 1}`}
                onError={() => handleImageError(currentIndex)}
                className="object-contain select-none"
                style={{
                  maxHeight: "100%",
                  maxWidth: "100%",
                  width: "auto",
                  height: "auto"
                }}
              />
            ) : (
              <div className="flex items-center justify-center w-48 h-48 md:w-64 md:h-64 rounded-lg bg-white/5">
                <div className="text-center text-white/60">
                  <div className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-2 rounded-lg flex items-center justify-center bg-white/10">
                    <X className="w-6 h-6 md:w-8 md:h-8" />
                  </div>
                  <p className="text-sm md:text-base">Failed to load image</p>
                </div>
              </div>
            )}
          </div>

          {/* Next Button */}
          {hasMultipleImages && (
            <button
              onClick={goToNext}
              className="absolute right-2 md:right-6 z-40 p-2 md:p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 text-white"
              aria-label="Next image"
            >
              <ChevronRight className="w-6 h-6 md:w-8 md:h-8" />
            </button>
          )}
        </div>

        {/* Thumbnails Strip - Bottom */}
        {hasMultipleImages && (
          <div className="absolute bottom-0 left-0 right-0 z-50 pb-4 md:pb-6">
            <div
              className="overflow-x-auto overflow-y-hidden px-4 md:px-6 scrollbar-hide"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <div className="flex gap-2 md:gap-3 justify-start md:justify-center min-w-min">
                {imageUrls.map((url, index) => (
                  <button
                    key={index}
                    onClick={() => goToIndex(index)}
                    className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                      index === currentIndex
                        ? "border-orange-500 scale-105"
                        : "border-white/20 hover:border-white/40"
                    }`}
                    style={{
                      width: "60px",
                      height: "60px",
                    }}
                    aria-label={`View image ${index + 1}`}
                  >
                    {!imageErrors.has(index) ? (
                      <div className="relative w-full h-full bg-white/5">
                        <Image
                          src={url}
                          alt={`Thumbnail ${index + 1}`}
                          fill
                          className="object-cover"
                          onError={() => handleImageError(index)}
                          sizes="60px"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-white/5">
                        <X className="w-4 h-4 text-white/40" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Swipe Indicator (Mobile Only) */}
        {hasMultipleImages && (
          <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 md:hidden">
            <div className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-sm text-white/60 text-xs">
              Swipe to navigate
            </div>
          </div>
        )}
      </div>
  );

  return createPortal(viewerContent, document.body);
};

export default FullScreenImageViewer;
