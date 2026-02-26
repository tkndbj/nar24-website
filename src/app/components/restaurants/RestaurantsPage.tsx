"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTheme } from "@/hooks/useTheme";
import { Restaurant } from "@/types/Restaurant";
import { Star, MapPin, ChevronLeft, ChevronRight, Search } from "lucide-react";

const BANNER_IMAGES = ["/images/1.png", "/images/2.png", "/images/3.png"];
const BANNER_INTERVAL = 5000;

interface RestaurantsPageProps {
  restaurants: Restaurant[];
}

// ─── Banner Carousel ────────────────────────────────────────────────────────

function BannerCarousel() {
  const [current, setCurrent] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const goTo = useCallback(
    (index: number) => {
      if (isTransitioning) return;
      setIsTransitioning(true);
      setCurrent(index);
      setTimeout(() => setIsTransitioning(false), 600);
    },
    [isTransitioning]
  );

  const next = useCallback(() => {
    goTo((current + 1) % BANNER_IMAGES.length);
  }, [current, goTo]);

  const prev = useCallback(() => {
    goTo((current - 1 + BANNER_IMAGES.length) % BANNER_IMAGES.length);
  }, [current, goTo]);

  useEffect(() => {
    const timer = setInterval(next, BANNER_INTERVAL);
    return () => clearInterval(timer);
  }, [next]);

  return (
    <div className="relative w-full h-[220px] sm:h-[300px] md:h-[380px] lg:h-[440px] overflow-hidden rounded-2xl group">
      {BANNER_IMAGES.map((src, i) => (
        <div
          key={src}
          className="absolute inset-0 transition-all duration-600 ease-in-out"
          style={{
            opacity: i === current ? 1 : 0,
            transform: i === current ? "scale(1)" : "scale(1.05)",
            transitionDuration: "600ms",
          }}
        >
          <Image
            src={src}
            alt={`Banner ${i + 1}`}
            fill
            className="object-cover"
            priority={i === 0}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1400px"
          />
        </div>
      ))}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

      {/* Navigation arrows */}
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

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {BANNER_IMAGES.map((_, i) => (
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
    </div>
  );
}

// ─── Restaurant Card ────────────────────────────────────────────────────────

function RestaurantCard({
  restaurant,
  isDarkMode,
}: {
  restaurant: Restaurant;
  isDarkMode: boolean;
}) {
  const t = useTranslations("restaurants");

  return (
    <Link
      href={`/restaurantdetail/${restaurant.id}`}
      className={`group flex items-center gap-4 rounded-2xl p-4 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 block ${
        isDarkMode
          ? "bg-gray-800/80 border border-gray-700/50 hover:border-gray-600"
          : "bg-white border border-gray-100 hover:border-gray-200 shadow-sm"
      }`}
    >
      {/* Profile Image */}
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden flex-shrink-0">
        {restaurant.profileImageUrl ? (
          <Image
            src={restaurant.profileImageUrl}
            alt={restaurant.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="80px"
          />
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center ${
              isDarkMode ? "bg-gray-700" : "bg-gray-100"
            }`}
          >
            <span className="text-2xl">🍽️</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3
            className={`font-bold text-base truncate ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {restaurant.name}
          </h3>
          {restaurant.averageRating != null && restaurant.averageRating > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-semibold flex-shrink-0">
              <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
              {restaurant.averageRating.toFixed(1)}
            </span>
          )}
        </div>

        {restaurant.categories && restaurant.categories.length > 0 && (
          <p
            className={`text-sm mt-0.5 truncate ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            {restaurant.categories.join(", ")}
          </p>
        )}

        {/* Meta info row */}
        <div
          className={`flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 text-xs ${
            isDarkMode ? "text-gray-400" : "text-gray-500"
          }`}
        >
          {restaurant.address && (
            <span className="flex items-center gap-1 truncate max-w-[220px]">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              {restaurant.address}
            </span>
          )}
          {restaurant.reviewCount != null && restaurant.reviewCount > 0 && (
            <span>
              {restaurant.reviewCount} {t("reviews")}
            </span>
          )}
          {restaurant.followerCount != null && restaurant.followerCount > 0 && (
            <span>
              {restaurant.followerCount} {t("followers")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function RestaurantsPage({ restaurants }: RestaurantsPageProps) {
  const isDarkMode = useTheme();
  const t = useTranslations("restaurants");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = restaurants.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.categories?.some((c) => c.toLowerCase().includes(q)) ?? false) ||
      (r.address?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <main className="flex-1">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Banner */}
        <BannerCarousel />

        {/* Title + Search */}
        <div className="mt-8 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1
              className={`text-2xl sm:text-3xl font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("title")}
            </h1>
            <p
              className={`mt-1 text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("subtitle")}
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-80">
            <Search
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
                isDarkMode ? "text-gray-400" : "text-gray-400"
              }`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-colors ${
                isDarkMode
                  ? "bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:border-orange-500"
                  : "bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
              }`}
            />
          </div>
        </div>

        {/* Restaurant Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pb-10">
            {filtered.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                isDarkMode={isDarkMode}
              />
            ))}
          </div>
        ) : restaurants.length === 0 ? (
          /* Empty state - no restaurants in Firestore */
          <div className="flex flex-col items-center justify-center py-20">
            <span className="text-6xl mb-4">🍽️</span>
            <h2
              className={`text-xl font-semibold mb-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("emptyTitle")}
            </h2>
            <p
              className={`text-sm text-center max-w-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("emptySubtitle")}
            </p>
          </div>
        ) : (
          /* No results for search query */
          <div className="flex flex-col items-center justify-center py-20">
            <span className="text-5xl mb-4">🔍</span>
            <h2
              className={`text-xl font-semibold mb-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("noResults")}
            </h2>
            <p
              className={`text-sm text-center max-w-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("noResultsSubtitle")}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
