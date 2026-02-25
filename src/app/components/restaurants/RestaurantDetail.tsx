"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTheme } from "@/hooks/useTheme";
import { Restaurant } from "@/types/Restaurant";
import { Food } from "@/types/Food";
import { FoodCategoryData } from "@/constants/foodData";
import {
  Star,
  MapPin,
  Phone,
  Clock,
  ChevronLeft,
  Search,
  UtensilsCrossed,
  SlidersHorizontal,
  X,
  ChevronDown,
} from "lucide-react";

interface RestaurantDetailProps {
  restaurant: Restaurant | null;
  foods: Food[];
  loading: boolean;
}

// ─── Restaurant Header ──────────────────────────────────────────────────────

function RestaurantHeader({
  restaurant,
  isDarkMode,
}: {
  restaurant: Restaurant;
  isDarkMode: boolean;
}) {
  const t = useTranslations("restaurantDetail");
  const coverImage = restaurant.coverImageUrls?.[0];

  return (
    <div className="relative">
      {/* Cover image */}
      <div className="relative h-52 sm:h-64 md:h-72 overflow-hidden">
        {coverImage ? (
          <Image
            src={coverImage}
            alt={restaurant.name}
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
        ) : (
          <div
            className={`w-full h-full ${
              isDarkMode
                ? "bg-gradient-to-br from-gray-800 to-gray-700"
                : "bg-gradient-to-br from-orange-100 to-orange-50"
            }`}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Back button */}
        <Link
          href="/restaurants"
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
      </div>

      {/* Info overlay */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 relative z-10">
        <div
          className={`rounded-2xl p-5 sm:p-6 ${
            isDarkMode
              ? "bg-gray-900/95 backdrop-blur-sm border border-gray-800"
              : "bg-white/95 backdrop-blur-sm border border-gray-100 shadow-lg"
          }`}
        >
          <div className="flex items-start gap-4">
            {/* Profile image */}
            {restaurant.profileImageUrl && (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-white shadow-md flex-shrink-0 dark:border-gray-700">
                <Image
                  src={restaurant.profileImageUrl}
                  alt={restaurant.name}
                  width={80}
                  height={80}
                  className="object-cover w-full h-full"
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h1
                className={`text-xl sm:text-2xl font-bold truncate ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {restaurant.name}
              </h1>

              {restaurant.categories && restaurant.categories.length > 0 && (
                <p
                  className={`text-sm mt-0.5 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  {restaurant.categories.join(", ")}
                </p>
              )}

              {/* Meta row */}
              <div
                className={`flex items-center flex-wrap gap-x-4 gap-y-1.5 mt-3 text-sm ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {restaurant.averageRating != null && (
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-semibold">
                      {restaurant.averageRating.toFixed(1)}
                    </span>
                    {restaurant.reviewCount != null && restaurant.reviewCount > 0 && (
                      <span>({restaurant.reviewCount} {t("reviews")})</span>
                    )}
                  </span>
                )}
                {restaurant.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    {restaurant.address}
                  </span>
                )}
                {restaurant.contactNo && (
                  <a
                    href={`tel:${restaurant.contactNo}`}
                    className="flex items-center gap-1 hover:text-orange-500 transition-colors"
                  >
                    <Phone className="w-4 h-4 flex-shrink-0" />
                    {restaurant.contactNo}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Food Card ──────────────────────────────────────────────────────────────

function FoodCard({
  food,
  isDarkMode,
}: {
  food: Food;
  isDarkMode: boolean;
}) {
  const t = useTranslations("restaurantDetail");

  // Try to get localized food type name
  const translationKey = FoodCategoryData.kFoodTypeTranslationKeys[food.foodType];
  const tFood = useTranslations();
  const displayType = translationKey ? tFood(translationKey) : food.foodType;

  return (
    <div
      className={`flex gap-4 rounded-2xl p-4 transition-all duration-200 hover:shadow-md ${
        isDarkMode
          ? "bg-gray-800/60 border border-gray-700/50 hover:border-gray-600"
          : "bg-white border border-gray-100 hover:border-gray-200 shadow-sm"
      }`}
    >
      {/* Food image */}
      <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden flex-shrink-0">
        {food.imageUrl ? (
          <Image
            src={food.imageUrl}
            alt={food.name}
            fill
            className="object-cover"
            sizes="128px"
          />
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center ${
              isDarkMode ? "bg-gray-700" : "bg-orange-50"
            }`}
          >
            <UtensilsCrossed
              className={`w-8 h-8 ${
                isDarkMode ? "text-gray-500" : "text-orange-300"
              }`}
            />
          </div>
        )}
      </div>

      {/* Food info */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <h3
            className={`font-semibold text-base truncate ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {food.name}
          </h3>

          <p
            className={`text-xs mt-0.5 ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            {displayType}
          </p>

          {food.description && (
            <p
              className={`text-sm mt-1.5 line-clamp-2 ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {food.description}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between mt-2">
          <span
            className={`text-lg font-bold ${
              isDarkMode ? "text-orange-400" : "text-orange-600"
            }`}
          >
            {food.price.toLocaleString()} TL
          </span>

          {food.preparationTime != null && food.preparationTime > 0 && (
            <span
              className={`flex items-center gap-1 text-xs ${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {food.preparationTime} {t("min")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function LoadingSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  const skeletonBg = isDarkMode ? "bg-gray-700" : "bg-gray-200";

  return (
    <div className="min-h-screen">
      {/* Cover skeleton */}
      <div className={`h-52 sm:h-64 md:h-72 ${skeletonBg} animate-pulse`} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 relative z-10">
        {/* Header card skeleton */}
        <div
          className={`rounded-2xl p-5 sm:p-6 ${
            isDarkMode ? "bg-gray-900 border border-gray-800" : "bg-white border border-gray-100 shadow-lg"
          }`}
        >
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl ${skeletonBg} animate-pulse`} />
            <div className="flex-1 space-y-3">
              <div className={`h-6 w-48 rounded ${skeletonBg} animate-pulse`} />
              <div className={`h-4 w-32 rounded ${skeletonBg} animate-pulse`} />
              <div className={`h-4 w-64 rounded ${skeletonBg} animate-pulse`} />
            </div>
          </div>
        </div>

        {/* Food cards skeleton */}
        <div className="mt-8 space-y-4 pb-10">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className={`flex gap-4 rounded-2xl p-4 ${
                isDarkMode ? "bg-gray-800/60 border border-gray-700/50" : "bg-white border border-gray-100"
              }`}
            >
              <div className={`w-28 h-28 sm:w-32 sm:h-32 rounded-xl ${skeletonBg} animate-pulse flex-shrink-0`} />
              <div className="flex-1 space-y-3 py-1">
                <div className={`h-5 w-40 rounded ${skeletonBg} animate-pulse`} />
                <div className={`h-3 w-24 rounded ${skeletonBg} animate-pulse`} />
                <div className={`h-4 w-full rounded ${skeletonBg} animate-pulse`} />
                <div className={`h-6 w-20 rounded ${skeletonBg} animate-pulse`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Filter Panel ───────────────────────────────────────────────────────────

interface FilterState {
  category: string | null;
  foodTypes: Set<string>;
}

function FilterPanel({
  filters,
  onFiltersChange,
  availableCategories,
  availableFoodTypes,
  isDarkMode,
}: {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  availableCategories: string[];
  availableFoodTypes: Map<string, Set<string>>;
  isDarkMode: boolean;
}) {
  const t = useTranslations("restaurantDetail");
  const tGlobal = useTranslations();
  const [isOpen, setIsOpen] = useState(false);

  const activeFilterCount =
    (filters.category ? 1 : 0) + filters.foodTypes.size;

  // Food types to show: if a category is selected, show its types; otherwise show nothing
  const visibleFoodTypes = useMemo(() => {
    if (!filters.category) return [];
    const typesInCategory = availableFoodTypes.get(filters.category);
    if (!typesInCategory) return [];
    // Order by foodData.ts ordering
    const orderedTypes = FoodCategoryData.kFoodTypes[filters.category] || [];
    return orderedTypes.filter((ft) => typesInCategory.has(ft));
  }, [filters.category, availableFoodTypes]);

  const handleCategorySelect = (cat: string | null) => {
    if (cat === filters.category) {
      // Deselect
      onFiltersChange({ category: null, foodTypes: new Set() });
    } else {
      // New category — clear food type selection
      onFiltersChange({ category: cat, foodTypes: new Set() });
    }
  };

  const handleFoodTypeToggle = (ft: string) => {
    const next = new Set(filters.foodTypes);
    if (next.has(ft)) {
      next.delete(ft);
    } else {
      next.add(ft);
    }
    onFiltersChange({ ...filters, foodTypes: next });
  };

  const clearAll = () => {
    onFiltersChange({ category: null, foodTypes: new Set() });
  };

  return (
    <div className="mb-4">
      {/* Category chips row */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
        {/* Filter toggle button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
            isOpen || activeFilterCount > 0
              ? "bg-orange-500 text-white"
              : isDarkMode
                ? "bg-gray-800 text-gray-300 border border-gray-700 hover:border-gray-600"
                : "bg-gray-100 text-gray-700 border border-gray-200 hover:border-gray-300"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          {t("filter")}
          {activeFilterCount > 0 && (
            <span className="ml-0.5 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>

        {/* All chip */}
        <button
          onClick={() => {
            clearAll();
            setIsOpen(false);
          }}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            !filters.category && filters.foodTypes.size === 0
              ? "bg-orange-500 text-white"
              : isDarkMode
                ? "bg-gray-800 text-gray-300 border border-gray-700 hover:border-gray-600"
                : "bg-gray-100 text-gray-700 border border-gray-200 hover:border-gray-300"
          }`}
        >
          {t("all")}
        </button>

        {/* Category quick chips */}
        {availableCategories.map((cat) => {
          const translationKey = FoodCategoryData.kCategoryTranslationKeys[cat];
          const label = translationKey ? tGlobal(translationKey) : cat;
          return (
            <button
              key={cat}
              onClick={() => handleCategorySelect(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                filters.category === cat
                  ? "bg-orange-500 text-white"
                  : isDarkMode
                    ? "bg-gray-800 text-gray-300 border border-gray-700 hover:border-gray-600"
                    : "bg-gray-100 text-gray-700 border border-gray-200 hover:border-gray-300"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Expanded filter panel */}
      {isOpen && (
        <div
          className={`mt-3 rounded-2xl p-4 sm:p-5 ${
            isDarkMode
              ? "bg-gray-800/80 border border-gray-700/50"
              : "bg-gray-50 border border-gray-200"
          }`}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between mb-4">
            <h3
              className={`text-sm font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("filterByCategory")}
            </h3>
            {activeFilterCount > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-orange-500 hover:text-orange-600 font-medium transition-colors"
              >
                {t("clearAll")}
              </button>
            )}
          </div>

          {/* Category grid */}
          <div className="flex flex-wrap gap-2 mb-2">
            {availableCategories.map((cat) => {
              const translationKey = FoodCategoryData.kCategoryTranslationKeys[cat];
              const label = translationKey ? tGlobal(translationKey) : cat;
              const count = availableFoodTypes.get(cat)?.size || 0;
              return (
                <button
                  key={cat}
                  onClick={() => handleCategorySelect(cat)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filters.category === cat
                      ? "bg-orange-500 text-white"
                      : isDarkMode
                        ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {label}
                  <span className="ml-1 opacity-60">({count})</span>
                </button>
              );
            })}
          </div>

          {/* Food type sub-filters (shown when category is selected) */}
          {filters.category && visibleFoodTypes.length > 0 && (
            <div className="mt-4">
              <h4
                className={`text-xs font-semibold uppercase tracking-wider mb-2.5 ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {t("filterByType")}
              </h4>
              <div className="flex flex-wrap gap-2">
                {visibleFoodTypes.map((ft) => {
                  const translationKey = FoodCategoryData.kFoodTypeTranslationKeys[ft];
                  const label = translationKey ? tGlobal(translationKey) : ft;
                  const isActive = filters.foodTypes.has(ft);
                  return (
                    <button
                      key={ft}
                      onClick={() => handleFoodTypeToggle(ft)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isActive
                          ? "bg-orange-500 text-white"
                          : isDarkMode
                            ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                            : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active filter tags */}
      {activeFilterCount > 0 && !isOpen && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {filters.category && (
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                isDarkMode
                  ? "bg-orange-500/20 text-orange-400"
                  : "bg-orange-50 text-orange-600"
              }`}
            >
              {FoodCategoryData.kCategoryTranslationKeys[filters.category]
                ? tGlobal(FoodCategoryData.kCategoryTranslationKeys[filters.category])
                : filters.category}
              <button
                onClick={() => onFiltersChange({ category: null, foodTypes: new Set() })}
                className="ml-0.5 hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {Array.from(filters.foodTypes).map((ft) => (
            <span
              key={ft}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                isDarkMode
                  ? "bg-blue-500/20 text-blue-400"
                  : "bg-blue-50 text-blue-600"
              }`}
            >
              {FoodCategoryData.kFoodTypeTranslationKeys[ft]
                ? tGlobal(FoodCategoryData.kFoodTypeTranslationKeys[ft])
                : ft}
              <button
                onClick={() => handleFoodTypeToggle(ft)}
                className="ml-0.5 hover:opacity-70"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            onClick={clearAll}
            className={`text-xs font-medium transition-colors ${
              isDarkMode
                ? "text-gray-400 hover:text-gray-300"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t("clearAll")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function RestaurantDetail({
  restaurant,
  foods,
  loading,
}: RestaurantDetailProps) {
  const isDarkMode = useTheme();
  const t = useTranslations("restaurantDetail");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>({
    category: null,
    foodTypes: new Set(),
  });

  // Derive available categories and food types from actual restaurant foods
  const { availableCategories, availableFoodTypes } = useMemo(() => {
    const catSet = new Set<string>();
    const typeMap = new Map<string, Set<string>>();

    for (const food of foods) {
      const cat = food.foodCategory || "";
      if (!cat) continue;
      catSet.add(cat);
      if (!typeMap.has(cat)) typeMap.set(cat, new Set());
      if (food.foodType) typeMap.get(cat)!.add(food.foodType);
    }

    // Sort categories by foodData.ts order
    const categoryOrder = FoodCategoryData.kCategories.map((c) => c.key);
    const sorted = Array.from(catSet).sort((a, b) => {
      const ia = categoryOrder.indexOf(a);
      const ib = categoryOrder.indexOf(b);
      // Unknown categories go to end
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    return { availableCategories: sorted, availableFoodTypes: typeMap };
  }, [foods]);

  // Filter foods based on all active filters + search
  const filteredFoods = useMemo(() => {
    let list = foods;

    // Category filter
    if (filters.category) {
      list = list.filter((f) => f.foodCategory === filters.category);
    }

    // Food type filter
    if (filters.foodTypes.size > 0) {
      list = list.filter((f) => filters.foodTypes.has(f.foodType));
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.foodType.toLowerCase().includes(q) ||
          f.foodCategory.toLowerCase().includes(q) ||
          (f.description?.toLowerCase().includes(q) ?? false)
      );
    }

    return list;
  }, [foods, filters, searchQuery]);

  if (loading) {
    return <LoadingSkeleton isDarkMode={isDarkMode} />;
  }

  if (!restaurant) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center py-20">
        <span className="text-6xl mb-4">🍽️</span>
        <h2
          className={`text-xl font-semibold mb-2 ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {t("notFound")}
        </h2>
        <Link
          href="/restaurants"
          className="mt-4 px-6 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          {t("backToRestaurants")}
        </Link>
      </main>
    );
  }

  const hasActiveFilters = filters.category !== null || filters.foodTypes.size > 0 || searchQuery.trim() !== "";

  return (
    <main className="flex-1">
      {/* Restaurant Header */}
      <RestaurantHeader restaurant={restaurant} isDarkMode={isDarkMode} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* Menu title + search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <h2
            className={`text-xl font-bold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("menu")}
            <span
              className={`ml-2 text-sm font-normal ${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              }`}
            >
              ({filteredFoods.length}{hasActiveFilters ? `/${foods.length}` : ""} {t("items")})
            </span>
          </h2>

          <div className="relative w-full sm:w-72">
            <Search
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchFood")}
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-colors ${
                isDarkMode
                  ? "bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:border-orange-500"
                  : "bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
              }`}
            />
          </div>
        </div>

        {/* Filter panel */}
        {availableCategories.length > 0 && (
          <FilterPanel
            filters={filters}
            onFiltersChange={setFilters}
            availableCategories={availableCategories}
            availableFoodTypes={availableFoodTypes}
            isDarkMode={isDarkMode}
          />
        )}

        {/* Food list */}
        {filteredFoods.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-10">
            {filteredFoods.map((food) => (
              <FoodCard key={food.id} food={food} isDarkMode={isDarkMode} />
            ))}
          </div>
        ) : foods.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <UtensilsCrossed
              className={`w-16 h-16 mb-4 ${
                isDarkMode ? "text-gray-600" : "text-gray-300"
              }`}
            />
            <h3
              className={`text-lg font-semibold mb-1 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("noFoods")}
            </h3>
            <p
              className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("noFoodsSubtitle")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <span className="text-5xl mb-4">🔍</span>
            <h3
              className={`text-lg font-semibold mb-1 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("noResults")}
            </h3>
            <p
              className={`text-sm text-center max-w-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("noResultsSubtitle")}
            </p>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setFilters({ category: null, foodTypes: new Set() });
                  setSearchQuery("");
                }}
                className="mt-4 px-5 py-2 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
              >
                {t("clearAll")}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
