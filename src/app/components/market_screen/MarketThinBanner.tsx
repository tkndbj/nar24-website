"use client";

import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getFirebaseDb } from "@/lib/firebase-lazy";
import type { PrefetchedBannerItem } from "@/types/MarketLayout";

/**
 * MarketThinBanner Component
 *
 * Slim promotional banner carousel - matches Flutter implementation exactly.
 *
 * Features:
 * - One-time Firestore fetch from `market_thin_banners` collection
 * - Auto-play with vsync-like control (4 second intervals)
 * - Infinite scroll simulation
 * - Click tracking and navigation (shop/product links)
 * - Gradient background matching Flutter
 */

// ============================================================================
// TYPES
// ============================================================================

interface ThinBannerItem {
  id: string;
  url: string;
  linkType?: string | null;
  linkId?: string | null;
}

interface MarketThinBannerProps {
  shouldAutoPlay?: boolean;
  className?: string;
  initialData?: PrefetchedBannerItem[] | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BANNER_HEIGHT = 48; // Matches Flutter: const double bannerHeight = 48
const AUTO_PLAY_INTERVAL = 4000; // Matches Flutter: Duration(seconds: 4)
const TRANSITION_DURATION = 300; // Matches Flutter: Duration(milliseconds: 300)

// Gradient matching Flutter:
// LinearGradient(colors: [Colors.orange, Colors.pink, Color.fromARGB(255, 252, 178, 18)])
const GRADIENT_STYLE =
  "linear-gradient(to right, #FF9800, #E91E63, #FCB212)";

// ============================================================================
// ANALYTICS SERVICE (placeholder - implement your actual tracking)
// ============================================================================

const AdAnalyticsService = {
  trackAdClick: (params: {
    adId: string;
    adType: string;
    linkedType?: string | null;
    linkedId?: string | null;
  }) => {
    // Implement your analytics tracking here
    console.log("[AdAnalytics] Click tracked:", params);
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

const MarketThinBanner = memo(
  ({ shouldAutoPlay = true, className = "", initialData }: MarketThinBannerProps) => {
    const router = useRouter();

    // Convert server-prefetched data
    const ssrBanners = useMemo(() => {
      if (!initialData || initialData.length === 0) return [];
      return initialData.map((item) => ({
        id: item.id,
        url: item.imageUrl,
        linkType: item.linkType,
        linkId: item.linkedShopId || item.linkedProductId,
      }));
    }, [initialData]);

    // State — use SSR data as initial values
    const [banners, setBanners] = useState<ThinBannerItem[]>(ssrBanners);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Refs for cleanup and control
    const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isMountedRef = useRef(true);

    // ========================================================================
    // FIRESTORE ONE-TIME FETCH
    // ========================================================================

    useEffect(() => {
      isMountedRef.current = true;

      // Skip client fetch if we have server-prefetched data
      if (banners.length > 0) return;

      const fetchBanners = async () => {
        try {
          const [db, { collection, query, where, orderBy, getDocs }] =
            await Promise.all([getFirebaseDb(), import("firebase/firestore")]);

          if (!isMountedRef.current) return;

          const bannersQuery = query(
            collection(db, "market_thin_banners"),
            where("isActive", "==", true),
            orderBy("createdAt", "desc")
          );

          const snapshot = await getDocs(bannersQuery);

          if (!isMountedRef.current) return;

          const items: ThinBannerItem[] = [];

          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const url = data.imageUrl as string | undefined;

            if (!url || url.trim() === "") return;

            items.push({
              id: doc.id,
              url: url,
              linkType: data.linkType as string | undefined,
              linkId: data.linkedShopId || data.linkedProductId,
            });
          });

          setBanners(items);
        } catch (error) {
          console.error("[MarketThinBanner] Fetch error:", error);
        }
      };

      fetchBanners();

      return () => {
        isMountedRef.current = false;
      };
    }, []);

    // ========================================================================
    // AUTO-PLAY LOGIC
    // ========================================================================

    useEffect(() => {
      // Clear existing timer
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }

      // Only auto-play if enabled and we have multiple banners
      if (!shouldAutoPlay || banners.length <= 1) return;

      autoPlayTimerRef.current = setInterval(() => {
        if (!isMountedRef.current) return;

        setIsTransitioning(true);
        setCurrentIndex((prev) => (prev + 1) % banners.length);

        // Reset transition state after animation
        setTimeout(() => {
          if (isMountedRef.current) {
            setIsTransitioning(false);
          }
        }, TRANSITION_DURATION);
      }, AUTO_PLAY_INTERVAL);

      return () => {
        if (autoPlayTimerRef.current) {
          clearInterval(autoPlayTimerRef.current);
          autoPlayTimerRef.current = null;
        }
      };
    }, [shouldAutoPlay, banners.length]);

    // ========================================================================
    // NAVIGATION HANDLER
    // ========================================================================

    const handleBannerTap = useCallback(
      (item: ThinBannerItem) => {
        // Track click - matches Flutter: AdAnalyticsService.trackAdClick
        AdAnalyticsService.trackAdClick({
          adId: item.id,
          adType: "thinBanner",
          linkedType: item.linkType,
          linkedId: item.linkId,
        });

        // Navigate based on linkType - matches Flutter switch statement
        if (item.linkType && item.linkId) {
          switch (item.linkType) {
            case "shop":
              router.push(`/shop/${item.linkId}`);
              break;
            case "product":
            case "shop_product":
            default:
              router.push(`/product/${item.linkId}`);
              break;
          }
        }
      },
      [router]
    );

    // ========================================================================
    // SWIPE HANDLERS (for manual navigation)
    // ========================================================================

    const touchStartRef = useRef<number>(0);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
      touchStartRef.current = e.touches[0].clientX;
    }, []);

    const handleTouchEnd = useCallback(
      (e: React.TouchEvent) => {
        if (banners.length <= 1) return;

        const touchEnd = e.changedTouches[0].clientX;
        const diff = touchStartRef.current - touchEnd;

        // Swipe threshold
        if (Math.abs(diff) > 50) {
          setIsTransitioning(true);

          if (diff > 0) {
            // Swipe left - next
            setCurrentIndex((prev) => (prev + 1) % banners.length);
          } else {
            // Swipe right - previous
            setCurrentIndex(
              (prev) => (prev - 1 + banners.length) % banners.length
            );
          }

          // Reset auto-play timer on manual swipe
          if (autoPlayTimerRef.current) {
            clearInterval(autoPlayTimerRef.current);
            autoPlayTimerRef.current = setInterval(() => {
              if (!isMountedRef.current) return;
              setIsTransitioning(true);
              setCurrentIndex((prev) => (prev + 1) % banners.length);
              setTimeout(() => {
                if (isMountedRef.current) setIsTransitioning(false);
              }, TRANSITION_DURATION);
            }, AUTO_PLAY_INTERVAL);
          }

          setTimeout(() => {
            if (isMountedRef.current) setIsTransitioning(false);
          }, TRANSITION_DURATION);
        }
      },
      [banners.length]
    );

    // ========================================================================
    // RENDER
    // ========================================================================

    // Don't render if no banners - matches Flutter: if (_banners.isEmpty) return SizedBox.shrink()
    if (banners.length === 0) {
      return null;
    }

    const currentBanner = banners[currentIndex];

    return (
      <div className={`w-full ${className}`}>
        {/* Outer container for centering on larger screens */}
        <div className="max-w-3xl mx-auto px-4">
          <div
            className="relative w-full rounded-xl overflow-hidden cursor-pointer"
            style={{
              height: BANNER_HEIGHT,
              background: GRADIENT_STYLE,
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.1)",
            }}
            onClick={() => handleBannerTap(currentBanner)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Banner Image */}
            <div
              className={`absolute inset-0 transition-opacity ${
                isTransitioning ? "duration-300" : "duration-0"
              }`}
              style={{ opacity: isTransitioning ? 0.7 : 1 }}
            >
              <Image
                src={currentBanner.url}
                alt="Promotional banner"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 768px"
                priority={currentIndex === 0}
                onError={(e) => {
                  // Hide broken images
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>

            {/* Dots indicator for multiple banners */}
            {banners.length > 1 && (
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
                {banners.map((_, index) => (
                  <button
                    key={index}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentIndex(index);
                    }}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      index === currentIndex
                        ? "bg-white w-3"
                        : "bg-white/50 hover:bg-white/70"
                    }`}
                    aria-label={`Go to banner ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

MarketThinBanner.displayName = "MarketThinBanner";

export default MarketThinBanner;