"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { getFirebaseDb } from "@/lib/firebase-lazy";
import { useRouter } from "next/navigation";
import Image from "next/image";

interface BannerItem {
  id: string;
  url: string;
  color: string;
  linkType?: string;
  linkId?: string;
}

interface AdsBannerProps {
  onBackgroundColorChange?: (color: string) => void;
}

// ✅ OPTIMIZED: Color conversion with validation
const convertDominantColor = (cInt: number | null | undefined): string => {
  if (!cInt || cInt === 0) return "#808080";
  
  try {
    // Handle negative values by using absolute value
    const absValue = Math.abs(cInt);
    const hexValue = absValue.toString(16).padStart(8, "0");
    // Extract RGB (skip alpha channel)
    return `#${hexValue.substring(2, 8)}`;
  } catch (e) {
    console.error("Color conversion error:", e);
    return "#808080";
  }
};

export const AdsBanner: React.FC<AdsBannerProps> = ({
  onBackgroundColorChange,
}) => {
  const router = useRouter();
  
  // ✅ OPTIMIZED: Minimal state
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  // ✅ OPTIMIZED: Refs for cleanup and performance
  const cachedUrls = useRef(new Set<string>());
  const carouselInterval = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const lastColorRef = useRef<string>("");

  // Client-side mounting check
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Screen size detection for conditional rendering (arrows, sizes)
  const isLargerScreen = useMemo(() => {
    if (typeof window === "undefined" || !isClient) {
      return false;
    }
    const { innerWidth, innerHeight } = window;
    const shortestSide = Math.min(innerWidth, innerHeight);
    return shortestSide >= 600 || innerWidth >= 900;
  }, [isClient]);

  // ✅ OPTIMIZED: Background color handler with localStorage caching
  const updateBackgroundColor = useCallback(
    (color: string) => {
      // Prevent unnecessary updates
      if (color === lastColorRef.current) return;
      
      lastColorRef.current = color;

      if (onBackgroundColorChange) {
        onBackgroundColorChange(color);
      }

      if (isClient) {
        try {
          localStorage.setItem("lastAdsBannerColor", color);
        } catch (error) {
          console.error("Failed to save banner color:", error);
        }
      }
    },
    [onBackgroundColorChange, isClient]
  );

  // ✅ OPTIMIZED: One-time Firestore fetch
  useEffect(() => {
    if (!isClient) return;

    // Restore last background color from localStorage
    try {
      const storedColor = localStorage.getItem("lastAdsBannerColor");
      if (storedColor) {
        updateBackgroundColor(storedColor);
      }
    } catch (error) {
      console.error("Failed to restore banner color:", error);
    }

    let cancelled = false;

    (async () => {
      try {
        const [db, { collection, query, where, orderBy, getDocs }] =
          await Promise.all([getFirebaseDb(), import("firebase/firestore")]);

        const q = query(
          collection(db, "market_top_ads_banners"),
          where("isActive", "==", true),
          orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(q);

        if (cancelled) return;

        const items: BannerItem[] = [];

        snapshot.docs.forEach((doc, index) => {
          const data = doc.data();
          const url = data.imageUrl as string;

          if (!url) return;

          const color = convertDominantColor(data.dominantColor as number);
          const linkId = data.linkedShopId || data.linkedProductId;

          items.push({
            id: doc.id,
            url,
            color,
            linkType: data.linkType as string | undefined,
            linkId: linkId as string | undefined,
          });

          if (!cachedUrls.current.has(url)) {
            cachedUrls.current.add(url);
            if (index > 0) {
              setTimeout(() => {
                const img = new window.Image();
                img.src = url;
              }, index * 100);
            }
          }
        });

        setBanners(items);
        setIsLoading(false);

        if (items.length > 0) {
          updateBackgroundColor(items[0].color);
        }
      } catch (error) {
        console.error("Failed to fetch AdsBanner data:", error);
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isClient, updateBackgroundColor]);

  // ✅ OPTIMIZED: Auto-slide with proper cleanup
  useEffect(() => {
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

  // ✅ MATCHES FLUTTER: Update background color on page change
  useEffect(() => {
    if (currentIndex < banners.length && currentIndex >= 0) {
      const color = banners[currentIndex].color;
      updateBackgroundColor(color);
    }
  }, [currentIndex, banners, updateBackgroundColor]);

  // ✅ MATCHES FLUTTER: Banner click handler with analytics tracking point
  const handleBannerClick = useCallback(
    (item: BannerItem) => {
      // ✅ TODO: Add AdAnalyticsService.trackAdClick here when available
      // AdAnalyticsService.trackAdClick({
      //   adId: item.id,
      //   adType: 'topBanner',
      //   linkedType: item.linkType,
      //   linkedId: item.linkId,
      // });

      console.log('Banner tapped - linkType:', item.linkType, 'linkId:', item.linkId);

      if (!item.linkType || !item.linkId) {
        console.log('Banner has no link');
        return;
      }

      // ✅ MATCHES FLUTTER: Exact same routing logic
      try {
        switch (item.linkType) {
          case 'shop':
            console.log('Navigating to shop:', item.linkId);
            router.push(`/shopdetail/${item.linkId}`);
            break;
          case 'product':
          case 'shop_product':
          default:
            console.log('Navigating to product:', item.linkId);
            router.push(`/productdetail/${item.linkId}`);
            break;
        }
      } catch (error) {
        console.error('Navigation error:', error);
      }
    },
    [router]
  );

  // ✅ OPTIMIZED: Touch handlers for swipe gestures
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
        return prev < banners.length - 1 ? prev + 1 : prev;
      } else {
        return prev > 0 ? prev - 1 : prev;
      }
    });
  }, [banners.length]);

  // Navigation handlers
  const goToSlide = useCallback(
    (index: number) => {
      if (index >= 0 && index < banners.length) {
        setCurrentIndex(index);
      }
    },
    [banners.length]
  );

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? banners.length - 1 : prev - 1));
  }, [banners.length]);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  }, [banners.length]);

  // ✅ OPTIMIZED: Image error handler
  const handleImageError = useCallback((index: number) => {
    setImageErrors(prev => new Set(prev).add(index));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (carouselInterval.current) {
        clearInterval(carouselInterval.current);
      }
    };
  }, []);

  // Loading skeleton with CSS-based responsive height (prevents CLS)
  if (isLoading || banners.length === 0) {
    return (
      <div
        className="w-full bg-gray-200 flex items-center justify-center animate-pulse h-[150px] min-[600px]:h-[300px] lg:h-[350px]"
      >
        <div
          className="bg-gray-300 rounded-full w-8 h-8 min-[600px]:w-10 min-[600px]:h-10"
        />
      </div>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden h-[150px] min-[600px]:h-[300px] lg:h-[350px]"
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
          const hasError = imageErrors.has(index);

          return (
            <div
              key={`${banner.id}-${index}`}
              className={`w-full h-full flex-shrink-0 relative ${
                banner.linkType && banner.linkId
                  ? "cursor-pointer"
                  : "cursor-default"
              }`}
              onClick={() => handleBannerClick(banner)}
            >
              {/* ✅ RESTORED: Original image rendering */}
              {isAdjacent && !hasError ? (
                <Image
                  src={banner.url}
                  alt={`Banner ${index + 1}`}
                  fill
                  className="object-fill"
                  priority={index === 0}
                  sizes="(min-width: 600px) 90vw, 100vw"
                  quality={isActive ? 85 : 75}
                  loading={index === 0 ? "eager" : "lazy"}
                  onError={() => handleImageError(index)}
                />
              ) : hasError ? (
                // Error placeholder
                <div className="absolute inset-0 bg-gray-200 flex items-center justify-center">
                  <svg
                    className="text-gray-400 w-6 h-6 min-[600px]:w-8 min-[600px]:h-8"
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
              ) : null}

              {/* Loading placeholder */}
              {!isActive && !hasError && (
                <div className="absolute inset-0 bg-gray-200" />
              )}
            </div>
          );
        })}
      </div>

      {/* Navigation Dots - using transform for GPU-accelerated animations */}
      {banners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2 z-10">
          {banners.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`h-2 rounded-full transition-all duration-200 ${
                index === currentIndex
                  ? "w-6 bg-white shadow-lg"
                  : "w-2 bg-white/50 hover:bg-white/75"
              }`}
              style={{
                transform: index === currentIndex ? 'scaleX(1)' : 'scaleX(1)',
                willChange: 'transform, opacity'
              }}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Navigation Arrows for Desktop */}
      {banners.length > 1 && isLargerScreen && (
        <>
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white p-2 rounded-full transition-all duration-200 z-10"
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
            className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/20 hover:bg-black/40 text-white p-2 rounded-full transition-all duration-200 z-10"
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