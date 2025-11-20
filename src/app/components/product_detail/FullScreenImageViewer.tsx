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
  isDarkMode = false,
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

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflow: 'auto'
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: -1
        }}
        className="bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative rounded-2xl shadow-2xl overflow-hidden ${
          isDarkMode ? "bg-gray-900" : "bg-white"
        }`}
        style={{
          width: '100%',
          maxWidth: "1152px",
          maxHeight: "90vh",
          zIndex: 1
        }}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-2.5 border-b ${
            isDarkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <div
            className={`text-sm font-medium ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {currentIndex + 1} / {imageUrls.length}
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isDarkMode
                ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
            }`}
            aria-label="Close viewer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Image Area */}
        <div
          className={`relative flex items-center justify-center ${
            isDarkMode ? "bg-gray-800" : "bg-gray-50"
          }`}
          style={{ height: "600px" }}
        >
          {/* Navigation Arrows */}
          {hasMultipleImages && (
            <>
              <button
                onClick={goToPrevious}
                className={`absolute left-4 z-10 p-3 rounded-full transition-colors ${
                  isDarkMode
                    ? "bg-gray-700 hover:bg-gray-600 text-white"
                    : "bg-white hover:bg-gray-100 text-gray-900 shadow-lg"
                }`}
                aria-label="Previous image"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <button
                onClick={goToNext}
                className={`absolute right-4 z-10 p-3 rounded-full transition-colors ${
                  isDarkMode
                    ? "bg-gray-700 hover:bg-gray-600 text-white"
                    : "bg-white hover:bg-gray-100 text-gray-900 shadow-lg"
                }`}
                aria-label="Next image"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Current Image */}
          {!hasImageError ? (
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <img
                src={currentImageUrl}
                alt={`Product image ${currentIndex + 1}`}
                onError={() => handleImageError(currentIndex)}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <div
              className={`flex items-center justify-center w-64 h-64 rounded-lg ${
                isDarkMode ? "bg-gray-700" : "bg-gray-200"
              }`}
            >
              <div
                className={`text-center ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                <div
                  className={`w-16 h-16 mx-auto mb-2 rounded-lg flex items-center justify-center ${
                    isDarkMode ? "bg-gray-600" : "bg-gray-300"
                  }`}
                >
                  <X className="w-8 h-8" />
                </div>
                <p>Failed to load image</p>
              </div>
            </div>
          )}
        </div>

        {/* Thumbnails */}
        {hasMultipleImages && (
          <div
            className={`px-6 py-5 border-t ${
              isDarkMode ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"
            }`}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                overflowX: 'auto',
                overflowY: 'hidden',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch'
              }}
              className="[&::-webkit-scrollbar]:hidden"
            >
              <div className="flex gap-3 justify-center" style={{ padding: '2px' }}>
                {imageUrls.map((url, index) => (
                  <button
                    key={index}
                    onClick={() => goToIndex(index)}
                    className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                      index === currentIndex
                        ? "border-orange-500"
                        : isDarkMode
                        ? "border-gray-700 hover:border-gray-600"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                    style={{
                      width: "80px",
                      height: "80px",
                    }}
                  >
                    {!imageErrors.has(index) ? (
                      <div className="relative w-full h-full">
                        <Image
                          src={url}
                          alt={`Thumbnail ${index + 1}`}
                          fill
                          className="object-cover"
                          onError={() => handleImageError(index)}
                          sizes="80px"
                        />
                      </div>
                    ) : (
                      <div
                        className={`w-full h-full flex items-center justify-center ${
                          isDarkMode ? "bg-gray-700" : "bg-gray-200"
                        }`}
                      >
                        <X
                          className={`w-4 h-4 ${
                            isDarkMode ? "text-gray-500" : "text-gray-400"
                          }`}
                        />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default FullScreenImageViewer;
