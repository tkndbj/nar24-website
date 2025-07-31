"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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

export const AdsBanner: React.FC<AdsBannerProps> = ({
  onBackgroundColorChange,
}) => {
  const router = useRouter();
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false); // Add client-side check

  // Refs for optimizations
  const cachedUrls = useRef(new Set<string>());
  const carouselInterval = useRef<NodeJS.Timeout | null>(null);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  // Client-side mounting check
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Determine if current device is larger screen (tablet/desktop)
  const isLargerScreen = useCallback(() => {
    if (typeof window === "undefined" || !isClient) return false;
    const { innerWidth, innerHeight } = window;
    const shortestSide = Math.min(innerWidth, innerHeight);
    return shortestSide >= 600 || innerWidth >= 900;
  }, [isClient]);

  // Calculate responsive banner height
  const calculateBannerHeight = useCallback(() => {
    if (typeof window === "undefined" || !isClient) return 220; // Server-side default

    if (!isLargerScreen()) {
      return 220; // Increased from 180 for mobile
    }

    const { innerWidth, innerHeight } = window;
    const isPortrait = innerHeight > innerWidth;

    if (isPortrait) {
      // Tablet portrait: increased height values
      return Math.max(500, Math.min(550, innerWidth * 0.6));
    } else {
      // Tablet landscape: increased height values
      return Math.max(500, Math.min(550, innerHeight * 0.7));
    }
  }, [isLargerScreen, isClient]);

  // Setup Firestore listener
  useEffect(() => {
    console.log("🔥 Setting up Firestore listener for market_top_ads_banners");

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
          console.log("📄 Document data:", data);

          const url = data.imageUrl as string;

          if (!url) {
            console.warn("⚠️ No imageUrl found in document:", doc.id);
            return;
          }

          console.log("🖼️ Processing banner image:", url);

          const cInt = data.dominantColor as number;
          // Fix color conversion - ensure proper hex format
          let color = "#808080"; // default gray
          if (cInt) {
            try {
              // Convert number to hex, ensuring we get RRGGBB format
              const hexValue = Math.abs(cInt).toString(16);
              color = `#${hexValue.padStart(6, "0").substring(0, 6)}`;
              console.log("🎨 Converted color:", cInt, "->", color);
            } catch (e) {
              console.error("Color conversion error:", e);
            }
          }

          // Prefetch images that aren't cached
          if (!cachedUrls.current.has(url)) {
            cachedUrls.current.add(url);
            console.log("💾 Prefetching image:", url);
            // Prefetch with Next.js Image component
            const link = document.createElement("link");
            link.rel = "prefetch";
            link.href = url;
            document.head.appendChild(link);
          }

          items.push({
            url,
            color,
            linkType: data.linkType as string,
            linkId: data.linkId as string,
          });
        });

        console.log("✅ Processed banners:", items.length, items);
        setBanners(items);
        setIsLoading(false);

        // Update background color with first banner
        if (items.length > 0 && onBackgroundColorChange) {
          const firstColor = items[0].color;
          console.log("🎨 Setting background color:", firstColor);
          onBackgroundColorChange(firstColor);

          // Cache in localStorage only on client
          if (isClient) {
            try {
              localStorage.setItem("lastAdsBannerColor", firstColor);
            } catch (error) {
              console.error("Failed to save banner color:", error);
            }
          }
        }
      },
      (error) => {
        console.error("❌ Firestore error in AdsBanner:", error);
        setIsLoading(false);
      }
    );

    // Restore last background color from localStorage only on client
    if (isClient) {
      try {
        const storedColor = localStorage.getItem("lastAdsBannerColor");
        if (storedColor && onBackgroundColorChange) {
          console.log(
            "🔄 Restored background color from storage:",
            storedColor
          );
          onBackgroundColorChange(storedColor);
        }
      } catch (error) {
        console.error("Failed to restore banner color:", error);
      }
    }

    return () => unsubscribe();
  }, [onBackgroundColorChange, isClient]);

  // Auto-slide functionality
  useEffect(() => {
    if (banners.length > 1) {
      carouselInterval.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % banners.length);
      }, 4000);

      return () => {
        if (carouselInterval.current) {
          clearInterval(carouselInterval.current);
        }
      };
    }
  }, [banners.length]);

  // Handle page change
  const handlePageChange = useCallback(
    (index: number) => {
      if (index < banners.length && onBackgroundColorChange) {
        const color = banners[index].color;
        console.log("🎨 Banner changed to index:", index, "color:", color);
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
    [banners, onBackgroundColorChange, isClient]
  );

  // Update background color when index changes
  useEffect(() => {
    handlePageChange(currentIndex);
  }, [currentIndex, handlePageChange]);

  // Handle banner tap/click
  const handleBannerClick = useCallback(
    (item: BannerItem) => {
      if (item.linkType && item.linkId) {
        switch (item.linkType) {
          case "shop":
            router.push(`/shop_detail/${item.linkId}`);
            break;
          case "product":
          case "shop_product":
          default:
            router.push(`/product_detail/${item.linkId}`);
        }
      }
    },
    [router]
  );

  // Touch handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;

    const distance = touchStartX.current - touchEndX.current;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentIndex < banners.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
    if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  // Navigate to specific slide
  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const bannerHeight = calculateBannerHeight();
  const isLarger = isLargerScreen();

  // Loading skeleton
  if (isLoading || banners.length === 0) {
    return (
      <div
        className="w-full bg-gray-200 flex items-center justify-center"
        style={{ height: bannerHeight }}
      >
        <div
          className={`bg-gray-300 rounded-full ${
            isLarger ? "w-10 h-10" : "w-8 h-8"
          }`}
        />
      </div>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: bannerHeight }}
    >
      {/* Banner Container */}
      <div
        className="flex transition-transform duration-300 ease-in-out h-full"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {banners.map((banner, index) => (
          <div
            key={`${banner.url}-${index}`}
            className={`w-full h-full flex-shrink-0 relative ${
              banner.linkType && banner.linkId
                ? "cursor-pointer"
                : "cursor-default"
            }`}
            onClick={() => handleBannerClick(banner)}
          >
            <Image
              src={banner.url}
              alt={`Banner ${index + 1}`}
              fill
              className="object-fill"
              priority={index === 0}
              sizes="100vw"
              unoptimized={true}
              onLoad={() =>
                console.log("✅ Image loaded successfully:", banner.url)
              }
              onError={(e) => {
                console.error("❌ Image failed to load:", banner.url, e);
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
              }}
            />

            {/* Fallback for failed images */}
            <div className="absolute inset-0 bg-gray-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <svg
                className={`text-gray-400 ${isLarger ? "w-8 h-8" : "w-6 h-6"}`}
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
        ))}
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
      {banners.length > 1 && isLarger && (
        <>
          <button
            onClick={() =>
              setCurrentIndex((prev) =>
                prev === 0 ? banners.length - 1 : prev - 1
              )
            }
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
            onClick={() =>
              setCurrentIndex((prev) => (prev + 1) % banners.length)
            }
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
