"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  QuerySnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface BannerItem {
  url: string;
  color: string;
  linkType?: string;
  linkId?: string;
}

interface AdsBannerProps {
  onBackgroundColorChange?: (color: string) => void;
  headerHeight?: number;
}

// Optimize color conversion with memoization
const convertDominantColor = (cInt: number): string => {
  if (!cInt) return "#808080";
  try {
    const hexValue = Math.abs(cInt).toString(16);
    return `#${hexValue.padStart(6, "0").substring(0, 6)}`;
  } catch (e) {
    console.error("Color conversion error:", e);
    return "#808080";
  }
};

// Create optimized image preloader
const preloadImage = (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
};

export const AdsBanner: React.FC<AdsBannerProps> = ({
  onBackgroundColorChange,
}) => {
  const router = useRouter();
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [preloadedImages, setPreloadedImages] = useState<Set<string>>(
    new Set()
  );

  // Refs for optimizations
  // const cachedUrls = useRef(new Set<string>());
  const carouselInterval = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Client-side mounting check with immediate effect
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Memoize screen size calculations
  const screenInfo = useMemo(() => {
    if (typeof window === "undefined" || !isClient) {
      return { isLarger: false, bannerHeight: 220 };
    }

    const { innerWidth, innerHeight } = window;
    const shortestSide = Math.min(innerWidth, innerHeight);
    const isLarger = shortestSide >= 600 || innerWidth >= 900;

    let bannerHeight = 220;
    if (!isLarger) {
      bannerHeight = 150;
    } else {
      const isPortrait = innerHeight > innerWidth;
      if (isPortrait) {
        bannerHeight = Math.max(300, Math.min(350, innerWidth * 0.4));
      } else {
        bannerHeight = Math.max(300, Math.min(350, innerHeight * 0.5));
      }
    }

    return { isLarger, bannerHeight };
  }, [isClient]);

  // Optimized background color handler with debouncing
  const updateBackgroundColor = useCallback(
    (color: string) => {
      if (onBackgroundColorChange) {
        onBackgroundColorChange(color);

        if (isClient) {
          try {
            localStorage.setItem("lastAdsBannerColor", color);
          } catch (error) {
            console.error("Failed to save banner color:", error);
          }
        }
      }
    },
    [onBackgroundColorChange, isClient]
  );

  // Bulk preload images with concurrent loading
  const preloadBannerImages = useCallback(
    async (items: BannerItem[]) => {
      const imageUrls = items
        .map((item) => item.url)
        .filter((url) => !preloadedImages.has(url));

      if (imageUrls.length === 0) return;

      // Preload first 3 images immediately, others in background
      const priorityUrls = imageUrls.slice(0, 3);
      const backgroundUrls = imageUrls.slice(3);

      try {
        // Preload priority images first
        await Promise.allSettled(priorityUrls.map(preloadImage));

        setPreloadedImages((prev) => {
          const newSet = new Set(prev);
          priorityUrls.forEach((url) => newSet.add(url));
          return newSet;
        });

        // Preload remaining images in background
        if (backgroundUrls.length > 0) {
          Promise.allSettled(backgroundUrls.map(preloadImage)).then(() => {
            setPreloadedImages((prev) => {
              const newSet = new Set(prev);
              backgroundUrls.forEach((url) => newSet.add(url));
              return newSet;
            });
          });
        }
      } catch (error) {
        console.error("Error preloading images:", error);
      }
    },
    [preloadedImages]
  );

  // Optimized Firestore listener with better error handling
  useEffect(() => {
    if (!isClient) return;

    console.log("🔥 Setting up Firestore listener for market_top_ads_banners");

    // Restore background color immediately
    try {
      const storedColor = localStorage.getItem("lastAdsBannerColor");
      if (storedColor && onBackgroundColorChange) {
        onBackgroundColorChange(storedColor);
      }
    } catch (error) {
      console.error("Failed to restore banner color:", error);
    }

    const q = query(
      collection(db, "market_top_ads_banners"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot) => {
        console.log(
          "📸 Firestore snapshot received:",
          snapshot.docs.length,
          "documents"
        );

        const items: BannerItem[] = [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const url = data.imageUrl as string;

          if (!url) {
            console.warn("⚠️ No imageUrl found in document:", doc.id);
            return;
          }

          const color = convertDominantColor(data.dominantColor as number);

          items.push({
            url,
            color,
            linkType: data.linkType as string | undefined,
            linkId: data.linkId as string | undefined,
          });
        });

        console.log("✅ Processed banners:", items.length);
        setBanners(items);
        setIsLoading(false);

        // Update background color with first banner
        if (items.length > 0) {
          updateBackgroundColor(items[0].color);
        }

        // Preload images
        if (items.length > 0) {
          preloadBannerImages(items);
        }
      },
      (error) => {
        console.error("❌ Firestore error in AdsBanner:", error);
        setIsLoading(false);
      }
    );

    unsubscribeRef.current = unsubscribe;
    return () => unsubscribe();
  }, [
    isClient,
    onBackgroundColorChange,
    updateBackgroundColor,
    preloadBannerImages,
  ]);

  // Optimized auto-slide with cleanup
  useEffect(() => {
    // Clear existing interval
    if (carouselInterval.current) {
      clearInterval(carouselInterval.current);
      carouselInterval.current = null;
    }

    if (banners.length > 1) {
      carouselInterval.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      }, 4000);
    }

    return () => {
      if (carouselInterval.current) {
        clearInterval(carouselInterval.current);
        carouselInterval.current = null;
      }
    };
  }, [banners.length]);

  // Optimized page change handler
  const handlePageChange = useCallback(
    (index: number) => {
      if (index < banners.length && index >= 0) {
        updateBackgroundColor(banners[index].color);
      }
    },
    [banners, updateBackgroundColor]
  );

  // Update background color when index changes
  useEffect(() => {
    handlePageChange(currentIndex);
  }, [currentIndex, handlePageChange]);

  // Optimized banner click handler
  const handleBannerClick = useCallback(
    (item: BannerItem) => {
      if (!item.linkType || !item.linkId) return;

      const route =
        item.linkType === "shop"
          ? `/shop_detail/${item.linkId}`
          : `/product_detail/${item.linkId}`;

      router.push(route);
    },
    [router]
  );

  // Optimized touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = 0;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!touchStartX.current || !touchEndX.current) return;

    const distance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(distance) < minSwipeDistance) return;

    setCurrentIndex((prev) => {
      if (distance > 0) {
        // Left swipe (next)
        return prev < banners.length - 1 ? prev + 1 : prev;
      } else {
        // Right swipe (previous)
        return prev > 0 ? prev - 1 : prev;
      }
    });
  }, [banners.length]);

  // Optimized slide navigation
  const goToSlide = useCallback(
    (index: number) => {
      if (index >= 0 && index < banners.length) {
        setCurrentIndex(index);
      }
    },
    [banners.length]
  );

  // Navigation handlers
  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? banners.length - 1 : prev - 1));
  }, [banners.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  }, [banners.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (carouselInterval.current) {
        clearInterval(carouselInterval.current);
      }
    };
  }, []);

  // Show loading skeleton with proper height
  if (isLoading || banners.length === 0) {
    return (
      <div
        className="w-full bg-gray-200 flex items-center justify-center animate-pulse"
        style={{ height: screenInfo.bannerHeight }}
      >
        <div
          className={`bg-gray-300 rounded-full ${
            screenInfo.isLarger ? "w-10 h-10" : "w-8 h-8"
          }`}
        />
      </div>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: screenInfo.bannerHeight }}
    >
      {/* Banner Container */}
      <div
        className="flex transition-transform duration-300 ease-in-out h-full"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {banners.map((banner, index) => {
          const isActive = index === currentIndex;
          const isAdjacent = Math.abs(index - currentIndex) <= 1;

          return (
            <div
              key={`${banner.url}-${index}`}
              className={`w-full h-full flex-shrink-0 relative ${
                banner.linkType && banner.linkId
                  ? "cursor-pointer"
                  : "cursor-default"
              }`}
              onClick={() => handleBannerClick(banner)}
            >
              {/* Only render images for active and adjacent slides for performance */}
              {isAdjacent && (
                <Image
                  src={banner.url}
                  alt={`Banner ${index + 1}`}
                  fill
                  className="object-fill"
                  priority={index === 0}
                  sizes="100vw"
                  quality={isActive ? 85 : 75}
                  loading={index === 0 ? "eager" : "lazy"}
                  onLoad={() => {
                    if (isActive) {
                      console.log("✅ Image loaded successfully:", banner.url);
                    }
                  }}
                  onError={(e) => {
                    console.error("❌ Image failed to load:", banner.url);
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                  }}
                />
              )}

              {/* Fallback for failed images */}
              <div className="absolute inset-0 bg-gray-200 flex items-center justify-center opacity-0 transition-opacity">
                <svg
                  className={`text-gray-400 ${
                    screenInfo.isLarger ? "w-8 h-8" : "w-6 h-6"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation Dots */}
      {banners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
          {banners.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-2 h-2 rounded-full transition-all duration-200 ${
                index === currentIndex
                  ? "bg-white scale-125 shadow-lg"
                  : "bg-white/50 hover:bg-white/75"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Navigation Arrows for Desktop */}
      {banners.length > 1 && screenInfo.isLarger && (
        <>
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white p-2 rounded-full transition-all duration-200"
            aria-label="Previous slide"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white p-2 rounded-full transition-all duration-200"
            aria-label="Next slide"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </>
      )}
    </div>
  );
};
