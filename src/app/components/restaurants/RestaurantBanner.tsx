"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import CloudinaryImage from "../CloudinaryImage";
import { db } from "@/lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BannerItem {
  id: string;
  imageUrl: string;
  title: string;
  linkedRestaurantId?: string;
}

const BANNER_INTERVAL = 5000;

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function BannerSkeleton() {
  return (
    <div className="relative w-full aspect-[16/7] sm:aspect-[16/6] overflow-hidden rounded-2xl bg-gray-200 animate-pulse">
      <div className="absolute inset-0 bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200" />
    </div>
  );
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

function BannerFallback() {
  return (
    <div className="relative w-full aspect-[16/7] sm:aspect-[16/6] overflow-hidden rounded-2xl bg-orange-50 flex items-center justify-center border border-orange-100">
      <div className="text-center text-orange-300">
        <svg
          className="w-12 h-12 mx-auto mb-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="text-sm font-medium">Banner yükleniyor...</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RestaurantBanner() {
  const router = useRouter();
  const locale = useLocale();
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // ── One-time Firestore fetch ──────────────────────────────────────────────
  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const q = query(
          collection(db, "restaurant_banners"),
          where("isActive", "==", true),
          orderBy("order", "asc"),
        );
        const snap = await getDocs(q);
        const items: BannerItem[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              imageUrl: (data.imageStoragePath as string) ||
                (data.imageUrl as string) || "",
              title: (data.title as string) ?? "",
              linkedRestaurantId: (data.linkedRestaurantId as string) || undefined,
            };
          })
          .filter((b) => b.imageUrl);
        setBanners(items);
      } catch {
        // leave banners empty → renders fallback
      } finally {
        setLoading(false);
      }
    };

    fetchBanners();
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const goTo = useCallback(
    (index: number) => {
      if (isTransitioning || banners.length === 0) return;
      setIsTransitioning(true);
      setCurrent(index);
      setTimeout(() => setIsTransitioning(false), 600);
    },
    [isTransitioning, banners.length],
  );

  const next = useCallback(() => {
    goTo((current + 1) % banners.length);
  }, [current, goTo, banners.length]);

  const prev = useCallback(() => {
    goTo((current - 1 + banners.length) % banners.length);
  }, [current, goTo, banners.length]);

  // ── Auto-advance ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(next, BANNER_INTERVAL);
    return () => clearInterval(timer);
  }, [next, banners.length]);

  // ── Render states ─────────────────────────────────────────────────────────────
  if (loading) return <BannerSkeleton />;
  if (banners.length === 0) return <BannerFallback />;

  return (
    <div className="relative w-full aspect-[16/7] sm:aspect-[16/6] overflow-hidden rounded-2xl group">
      {banners.map((banner, i) => (
        <div
          key={banner.id}
          className={`absolute inset-0${banner.linkedRestaurantId ? " cursor-pointer" : ""}`}
          style={{
            opacity: i === current ? 1 : 0,
            transform: i === current ? "scale(1)" : "scale(1.05)",
            transition: "opacity 600ms ease-in-out, transform 600ms ease-in-out",
            pointerEvents: i === current ? "auto" : "none",
          }}
          onClick={() => {
            if (banner.linkedRestaurantId) {
              router.push(`/${locale}/restaurantdetail/${banner.linkedRestaurantId}`);
            }
          }}
        >
          <CloudinaryImage.Banner
            source={banner.imageUrl}
            cdnWidth={1600}
            fit="cover"
            priority={i === 0}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1400px"
            alt={banner.title || `Banner ${i + 1}`}
          />
        </div>
      ))}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />

      {/* Navigation arrows — only shown when more than one banner */}
      {banners.length > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Previous banner"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            aria-label="Next banner"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/30"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {/* Dots — only shown when more than one banner */}
      {banners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {banners.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              aria-label={`Go to banner ${i + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === current
                  ? "w-8 bg-white"
                  : "w-2 bg-white/50 hover:bg-white/70"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
