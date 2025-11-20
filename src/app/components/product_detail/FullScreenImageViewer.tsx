// src/components/productdetail/FullScreenImageViewer.tsx

import React, { useState, useEffect, useCallback } from "react";
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
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentImageUrl = imageUrls[currentIndex];
  const hasImageError = imageErrors.has(currentIndex);

  return (
    <div
      className="fixed z-50 bg-black"
      style={{
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        className="absolute left-0 right-0 z-20 bg-black/50 backdrop-blur-sm"
        style={{ top: 0, height: '72px' }}
      >
        <div className="flex items-center justify-between p-4">
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 transition-colors text-white"
            aria-label="Close viewer"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="text-white text-lg font-medium">
            {currentIndex + 1} / {imageUrls.length}
          </div>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Main image area - using viewport units */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center p-4"
        style={{
          top: '72px',
          bottom: imageUrls.length > 1 ? '160px' : '0'
        }}
      >
        {/* Navigation arrows */}
        {imageUrls.length > 1 && (
          <>
            <button
              onClick={goToPrevious}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors text-white"
              aria-label="Previous image"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            <button
              onClick={goToNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors text-white"
              aria-label="Next image"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        {/* Current image */}
        {!hasImageError ? (
          <img
            src={currentImageUrl}
            alt={`Product image ${currentIndex + 1}`}
            onError={() => handleImageError(currentIndex)}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              display: 'block'
            }}
          />
        ) : (
          <div className="w-96 h-96 flex items-center justify-center bg-gray-800 rounded-lg">
            <div className="text-center text-white/60">
              <div className="w-16 h-16 mx-auto mb-2 bg-gray-700 rounded-lg flex items-center justify-center">
                <X className="w-8 h-8" />
              </div>
              <p>Failed to load image</p>
            </div>
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {imageUrls.length > 1 && (
        <div className="absolute left-0 right-0 z-20 bg-black/50 backdrop-blur-sm" style={{ bottom: '30px', height: '140px' }}>
          <div className="flex gap-2 p-4 overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 mx-auto">
              {imageUrls.map((url, index) => (
                <button
                  key={index}
                  onClick={() => goToIndex(index)}
                  className={`relative w-18 h-18 rounded-lg overflow-hidden border-2 transition-all ${
                    index === currentIndex
                      ? "border-orange-500 scale-110"
                      : "border-gray-600 hover:border-gray-400"
                  }`}
                >
                  {!imageErrors.has(index) ? (
                    <Image
                      src={url}
                      alt={`Thumbnail ${index + 1}`}
                      width={72}
                      height={72}
                      className="w-full h-full object-cover"
                      onError={() => handleImageError(index)}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                      <X className="w-4 h-4 text-white/40" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      <div
        className="absolute inset-0 -z-10"
        onClick={onClose}
        aria-label="Close viewer"
      />
    </div>
  );
};

export default FullScreenImageViewer;
