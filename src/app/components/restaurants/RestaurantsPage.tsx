"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTheme } from "@/hooks/useTheme";
import { Restaurant } from "@/types/Restaurant";
import { isRestaurantOpen, doesRestaurantDeliver } from "@/utils/restaurant";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import type { FacetValue } from "@/lib/typesense_restaurant_service";
import { Star, ChevronLeft, ChevronRight, ArrowUpDown, Search, MapPin } from "lucide-react";
import type { RestaurantSortOption } from "@/lib/typesense_restaurant_service";
import FilterIcons from "./FilterIcons";
import FoodLocationPicker from "./FoodLocationPicker";
import { useUser } from "@/context/UserProvider";
import { FoodAddress } from "@/app/models/FoodAddress";

const BANNER_IMAGES = ["/images/1.png", "/images/2.png", "/images/3.png"];
const BANNER_INTERVAL = 5000;

interface RestaurantsPageProps {
  restaurants?: Restaurant[];
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
    <div className="relative w-full aspect-[16/7] sm:aspect-[16/6] overflow-hidden rounded-2xl group">
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

// ─── Cuisine Pill Button ─────────────────────────────────────────────────────

function CuisinePill({
  label,
  count,
  isActive,
  isDarkMode,
  onClick,
}: {
  label: string;
  count?: number;
  isActive: boolean;
  isDarkMode: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
        isActive
          ? "bg-orange-500 text-white"
          : isDarkMode
            ? "bg-gray-800 text-gray-300 border border-gray-700 hover:border-gray-500 hover:text-white"
            : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:text-gray-900"
      }`}
    >
      {label}
      {count != null && (
        <span
          className={`text-xs ${
            isActive
              ? "text-white/80"
              : isDarkMode
                ? "text-gray-500"
                : "text-gray-400"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ─── Restaurant Card ────────────────────────────────────────────────────────

function RestaurantCard({
  restaurant,
  isDarkMode,
  userMainRegion,
  userSubregion,
  deliversToUser,
}: {
  restaurant: Restaurant;
  isDarkMode: boolean;
  userMainRegion?: string;
  userSubregion?: string;
  deliversToUser: boolean;
}) {
  const t = useTranslations("restaurants");
  const isOpen = isRestaurantOpen(restaurant);

  // Lookup min order: exact subregion match first, then any mainRegion match
  const minOrder = (() => {
    if (!restaurant.minOrderPrices?.length) return undefined;
    if (userSubregion) {
      const bySubregion = restaurant.minOrderPrices.find((p) => p.subregion === userSubregion);
      if (bySubregion) return bySubregion.minOrderPrice;
    }
    if (userMainRegion) {
      const byRegion = restaurant.minOrderPrices.find((p) => p.mainRegion === userMainRegion);
      if (byRegion) return byRegion.minOrderPrice;
    }
    return undefined;
  })();

  return (
    <Link
      href={`/restaurantdetail/${restaurant.id}`}
      className={`group relative flex items-center gap-4 rounded-2xl p-4 block ${
        isDarkMode
          ? "border border-gray-700/40"
          : "border border-gray-200"
      }`}
    >
      {/* Profile Image */}
      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden flex-shrink-0">
        {restaurant.profileImageUrl ? (
          <Image
            src={restaurant.profileImageUrl}
            alt={restaurant.name}
            fill
            className={`object-cover transition-transform duration-500 group-hover:scale-105 ${
              !isOpen ? "grayscale opacity-60" : ""
            }`}
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
        <h3
          className={`font-bold text-base truncate ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {restaurant.name}
        </h3>

        {restaurant.cuisineTypes && restaurant.cuisineTypes.length > 0 && (
          <p
            className={`text-sm mt-0.5 truncate ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            {restaurant.cuisineTypes.join(", ")}
          </p>
        )}

        {restaurant.foodType && restaurant.foodType.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {restaurant.foodType.map((ft) => (
              <span
                key={ft}
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  isDarkMode
                    ? "bg-gray-700 text-gray-300"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {ft}
              </span>
            ))}
          </div>
        )}

        {/* Star rating */}
        <div className="flex items-center gap-1.5 mt-2">
          <div className="flex items-center">
            {Array.from({ length: 5 }).map((_, i) => {
              const rating = restaurant.averageRating ?? 0;
              const fill = Math.min(Math.max(rating - i, 0), 1);
              return (
                <div key={i} className="relative w-4 h-4">
                  <Star className="absolute inset-0 w-4 h-4 text-gray-300 dark:text-gray-600" />
                  {fill > 0 && (
                    <div
                      className="absolute inset-0 overflow-hidden"
                      style={{ width: `${fill * 100}%` }}
                    >
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {restaurant.averageRating != null && restaurant.averageRating > 0 && (
            <span
              className={`text-xs font-semibold ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {restaurant.averageRating.toFixed(1)}
            </span>
          )}
          {restaurant.reviewCount != null && restaurant.reviewCount > 0 && (
            <span
              className={`text-xs ${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              }`}
            >
              ({restaurant.reviewCount})
            </span>
          )}
        </div>
      </div>

      {/* No delivery badge */}
      {!deliversToUser && (
        <span className={`absolute top-2 right-2 px-2 py-1 text-[10px] font-semibold rounded-lg backdrop-blur-sm ${
          isDarkMode
            ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
            : "bg-yellow-50 text-yellow-700 border border-yellow-200"
        }`}>
          {t("noDeliveryToAddress")}
        </span>
      )}

      {/* Min order badge */}
      {deliversToUser && minOrder != null && (
        <span className={`absolute bottom-2 right-2 px-2 py-0.5 text-[11px] font-semibold rounded-lg backdrop-blur-sm ${
          !isOpen ? "bottom-9" : "bottom-2"
        } bg-emerald-500/90 text-white`}>
          {t("minOrder")} {minOrder} TL
        </span>
      )}

      {/* Closed badge */}
      {!isOpen && (
        <span className="absolute bottom-2 right-2 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-red-500/90 text-white backdrop-blur-sm">
          {t("closed")}
        </span>
      )}
    </Link>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const HITS_PER_PAGE = 30;

export default function RestaurantsPage({ restaurants: serverRestaurants }: RestaurantsPageProps) {
  const isDarkMode = useTheme();
  const t = useTranslations("restaurants");
  const { user, profileData, isLoading: isUserLoading } = useUser();

  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [selectedFoodType, setSelectedFoodType] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<RestaurantSortOption>("default");
  const [searchQuery, setSearchQuery] = useState("");
  const [cuisineFacets, setCuisineFacets] = useState<FacetValue[]>([]);
  const [filteredRestaurants, setFilteredRestaurants] = useState<Restaurant[]>(serverRestaurants ?? []);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const locationPromptShown = useRef(false);
  const initialLoadDone = useRef(false);
  const currentPageRef = useRef(0);
  const filterVersionRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Parse typed FoodAddress from profile data
  const foodAddress = profileData?.foodAddress
    ? FoodAddress.fromMap(profileData.foodAddress as Record<string, unknown>)
    : null;
  const userMainRegion = foodAddress?.mainRegion;
  const userCity = foodAddress?.city;

  // Build delivery filter regions from user's foodAddress: [city, mainRegion]
  const deliveryFilterRegions = React.useMemo(() => {
    const regions: string[] = [];
    if (userCity) regions.push(userCity);
    if (userMainRegion) regions.push(userMainRegion);
    return regions.length > 0 ? regions : undefined;
  }, [userCity, userMainRegion]);

  const pillsRef = useRef<HTMLDivElement>(null);

  // Show location picker on first visit if user is logged in but hasn't set foodAddress
  useEffect(() => {
    if (isUserLoading || locationPromptShown.current) return;
    if (user && profileData && !profileData.foodAddress) {
      locationPromptShown.current = true;
      setShowLocationPicker(true);
    }
  }, [user, profileData, isUserLoading]);

  // Fetch cuisine facets (with delivery region filter)
  useEffect(() => {
    if (isUserLoading) return;
    const svc = TypeSenseServiceManager.instance.restaurantService;
    svc.fetchRestaurantFacets({ deliveryRegions: deliveryFilterRegions }).then((facets) => {
      setCuisineFacets(facets.cuisineTypes ?? []);
    });
  }, [isUserLoading, deliveryFilterRegions]);

  // Initial load + filter/search/sort changes — fetch page 0, replace results
  useEffect(() => {
    if (isUserLoading) return;

    // Bump filter version to invalidate any in-flight load-more requests
    filterVersionRef.current += 1;
    currentPageRef.current = 0;

    let cancelled = false;
    setIsLoading(true);
    setHasMore(false);

    const svc = TypeSenseServiceManager.instance.restaurantService;
    const query = searchQuery.trim();
    const searchFn = query
      ? svc.debouncedSearchRestaurants.bind(svc)
      : svc.searchRestaurants.bind(svc);

    searchFn({
      query: query || undefined,
      cuisineTypes: selectedCuisine ? [selectedCuisine] : undefined,
      foodType: selectedFoodType ? [selectedFoodType] : undefined,
      isActive: true,
      sort: sortOption,
      hitsPerPage: HITS_PER_PAGE,
      page: 0,
      deliveryRegions: deliveryFilterRegions,
    })
      .then((result) => {
        if (!cancelled) {
          setFilteredRestaurants(result.items);
          setHasMore(result.page < result.nbPages - 1);
          initialLoadDone.current = true;
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCuisine, selectedFoodType, sortOption, searchQuery, isUserLoading, deliveryFilterRegions]);

  // Load next page — called by IntersectionObserver
  const loadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;

    const version = filterVersionRef.current;
    const nextPage = currentPageRef.current + 1;
    setIsLoadingMore(true);

    const svc = TypeSenseServiceManager.instance.restaurantService;
    svc
      .searchRestaurants({
        query: searchQuery.trim() || undefined,
        cuisineTypes: selectedCuisine ? [selectedCuisine] : undefined,
        foodType: selectedFoodType ? [selectedFoodType] : undefined,
        isActive: true,
        sort: sortOption,
        hitsPerPage: HITS_PER_PAGE,
        page: nextPage,
        deliveryRegions: deliveryFilterRegions,
      })
      .then((result) => {
        // Discard if filters changed while this was in flight
        if (filterVersionRef.current !== version) return;
        currentPageRef.current = nextPage;
        setFilteredRestaurants((prev) => [...prev, ...result.items]);
        setHasMore(result.page < result.nbPages - 1);
      })
      .finally(() => {
        if (filterVersionRef.current === version) {
          setIsLoadingMore(false);
        }
      });
  }, [isLoadingMore, hasMore, searchQuery, selectedCuisine, selectedFoodType, sortOption, deliveryFilterRegions]);

  // IntersectionObserver to trigger loadMore when sentinel is visible
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleCuisineClick = (cuisine: string | null) => {
    setSelectedCuisine(cuisine);
  };

  return (
    <main className="flex-1">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Banner */}
        <BannerCarousel />

        {/* Title + Search + Sort */}
        <div className="mt-8 mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
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
            {/* Delivery area indicator */}
            {user && (
              <button
                onClick={() => setShowLocationPicker(true)}
                className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  foodAddress
                    ? isDarkMode
                      ? "bg-orange-500/15 text-orange-400 hover:bg-orange-500/25"
                      : "bg-orange-50 text-orange-600 hover:bg-orange-100"
                    : isDarkMode
                      ? "bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-200"
                }`}
              >
                <MapPin className="w-3 h-3" />
                {foodAddress?.displayLabel || t("selectDeliveryAddress")}
                {foodAddress && (
                  <span className={`${isDarkMode ? "text-orange-500/60" : "text-orange-400"}`}>
                    &middot; {t("changeAddress")}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Search bar */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchRestaurants")}
                className={`w-full pl-10 pr-4 py-2 rounded-xl text-sm outline-none transition-colors ${
                  isDarkMode
                    ? "bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:border-orange-500"
                    : "bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
                }`}
              />
            </div>

            {/* Sort toggle */}
            <button
              onClick={() => {
                const cycle: RestaurantSortOption[] = ["default", "rating_desc", "rating_asc"];
                const idx = cycle.indexOf(sortOption);
                setSortOption(cycle[(idx + 1) % cycle.length]);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                sortOption !== "default"
                  ? "bg-orange-500 text-white"
                  : isDarkMode
                    ? "bg-gray-800 text-gray-300 border border-gray-700 hover:border-gray-500"
                    : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300"
              }`}
            >
              <ArrowUpDown className="w-4 h-4" />
              {sortOption === "rating_desc"
                ? t("sortRatingDesc")
                : sortOption === "rating_asc"
                  ? t("sortRatingAsc")
                  : t("sort")}
            </button>
          </div>
        </div>

        {/* Cuisine Pills */}
        {cuisineFacets.length > 0 && (
          <div
            ref={pillsRef}
            className="flex gap-2 overflow-x-auto pb-4 mb-2 scrollbar-none"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <CuisinePill
              label={t("all")}
              isActive={selectedCuisine === null}
              isDarkMode={isDarkMode}
              onClick={() => handleCuisineClick(null)}
            />
            {cuisineFacets.map((facet) => (
              <CuisinePill
                key={facet.value}
                label={facet.value}
                count={facet.count}
                isActive={selectedCuisine === facet.value}
                isDarkMode={isDarkMode}
                onClick={() => handleCuisineClick(facet.value)}
              />
            ))}
          </div>
        )}

        {/* Food Type Icons */}
        <FilterIcons
          selected={selectedFoodType}
          onSelect={setSelectedFoodType}
          isDarkMode={isDarkMode}
        />

        {/* Restaurant Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pb-10">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`animate-pulse rounded-2xl p-4 flex items-center gap-4 ${
                  isDarkMode
                    ? "bg-gray-800/80 border border-gray-700/50"
                    : "bg-white border border-gray-100 shadow-sm"
                }`}
              >
                <div
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex-shrink-0 ${
                    isDarkMode ? "bg-gray-700" : "bg-gray-200"
                  }`}
                />
                <div className="flex-1 space-y-2">
                  <div
                    className={`h-4 rounded w-3/4 ${
                      isDarkMode ? "bg-gray-700" : "bg-gray-200"
                    }`}
                  />
                  <div
                    className={`h-3 rounded w-1/2 ${
                      isDarkMode ? "bg-gray-700" : "bg-gray-200"
                    }`}
                  />
                  <div
                    className={`h-3 rounded w-2/3 ${
                      isDarkMode ? "bg-gray-700" : "bg-gray-200"
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : filteredRestaurants.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 pb-2">
              {filteredRestaurants.map((restaurant) => (
                <RestaurantCard
                  key={restaurant.id}
                  restaurant={restaurant}
                  isDarkMode={isDarkMode}
                  userMainRegion={userMainRegion}
                  userSubregion={userCity}
                  deliversToUser={doesRestaurantDeliver(restaurant, userMainRegion, userCity)}
                />
              ))}
            </div>

            {/* Sentinel for infinite scroll */}
            <div ref={sentinelRef} className="h-px" />

            {/* Loading more indicator */}
            {isLoadingMore && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 py-4 pb-10">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className={`animate-pulse rounded-2xl p-4 flex items-center gap-4 ${
                      isDarkMode
                        ? "bg-gray-800/80 border border-gray-700/50"
                        : "bg-white border border-gray-100 shadow-sm"
                    }`}
                  >
                    <div
                      className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex-shrink-0 ${
                        isDarkMode ? "bg-gray-700" : "bg-gray-200"
                      }`}
                    />
                    <div className="flex-1 space-y-2">
                      <div className={`h-4 rounded w-3/4 ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`} />
                      <div className={`h-3 rounded w-1/2 ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!hasMore && !isLoadingMore && <div className="pb-10" />}
          </>
        ) : !initialLoadDone.current ? (
          /* Empty state - no restaurants at all */
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
          /* No results for the selected cuisine */
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

      {/* Food Location Picker Modal */}
      <FoodLocationPicker
        isOpen={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        isDarkMode={isDarkMode}
        required={!profileData?.foodAddress}
      />
    </main>
  );
}
