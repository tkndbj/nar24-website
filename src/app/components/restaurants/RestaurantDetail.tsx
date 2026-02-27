"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTheme } from "@/hooks/useTheme";
import { Restaurant } from "@/types/Restaurant";
import { Food } from "@/types/Food";
import { FoodCategoryData } from "@/constants/foodData";
import {
  Star,
  Clock,
  ChevronLeft,
  Search,
  UtensilsCrossed,
  Plus,
} from "lucide-react";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import FilterIcons from "./FilterIcons";
import { useFoodCartActions, useFoodCartState, SelectedExtra, FoodCartRestaurant } from "@/context/FoodCartProvider";
import FoodExtrasSheet from "./FoodExtrasSheet";

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
      {/* Back button */}
      <Link
        href="/restaurants"
        className={`inline-flex items-center gap-1 mb-4 text-sm font-medium transition-colors ${
          isDarkMode
            ? "text-gray-400 hover:text-white"
            : "text-gray-500 hover:text-gray-900"
        }`}
      >
        <ChevronLeft className="w-4 h-4" />
        {t("backToRestaurants")}
      </Link>

      <div
        className={`rounded-2xl p-5 sm:p-6 ${
          isDarkMode
            ? "border border-gray-700/40"
            : "border border-gray-200"
        }`}
      >
        <div className="flex items-start gap-4">
          {/* Profile image */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-white shadow-md flex-shrink-0 dark:border-gray-700">
            {restaurant.profileImageUrl ? (
              <Image
                src={restaurant.profileImageUrl}
                alt={restaurant.name}
                width={80}
                height={80}
                className="object-cover w-full h-full"
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

            {/* Rating + cuisine + food type */}
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
              {restaurant.cuisineTypes && restaurant.cuisineTypes.length > 0 && (
                <span className="truncate">
                  {restaurant.cuisineTypes.join(", ")}
                </span>
              )}
              {restaurant.foodType && restaurant.foodType.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {restaurant.foodType.map((ft) => (
                    <span
                      key={ft}
                      className={`text-xs px-2 py-0.5 rounded-full ${
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
  restaurant,
}: {
  food: Food;
  isDarkMode: boolean;
  restaurant: Restaurant;
}) {
  const t = useTranslations("restaurantDetail");
  const { addItem, clearAndAddFromNewRestaurant } = useFoodCartActions();
  const { items } = useFoodCartState();
  const [extrasOpen, setExtrasOpen] = useState(false);

  // Try to get localized food type name
  const translationKey = FoodCategoryData.kFoodTypeTranslationKeys[food.foodType];
  const tFood = useTranslations();
  const displayType = translationKey ? tFood(translationKey) : food.foodType;

  // Check quantity already in cart for this food
  const cartQuantity = useMemo(() => {
    const item = items.find((i) => i.foodId === food.id);
    return item?.quantity ?? 0;
  }, [items, food.id]);

  const cartRestaurant: FoodCartRestaurant = useMemo(() => ({
    id: restaurant.id,
    name: restaurant.name,
    profileImageUrl: restaurant.profileImageUrl,
  }), [restaurant.id, restaurant.name, restaurant.profileImageUrl]);

  const handleAddToCart = useCallback(() => {
    setExtrasOpen(true);
  }, []);

  const handleExtrasConfirm = useCallback(
    async (extras: SelectedExtra[], specialNotes: string, quantity: number) => {
      const result = await addItem({
        food: {
          id: food.id,
          name: food.name,
          description: food.description,
          price: food.price,
          imageUrl: food.imageUrl,
          foodCategory: food.foodCategory,
          foodType: food.foodType,
          preparationTime: food.preparationTime,
        },
        restaurant: cartRestaurant,
        quantity,
        extras,
        specialNotes,
      });

      if (result === "restaurant_conflict") {
        // Auto-replace for simplicity — could show a confirmation dialog
        await clearAndAddFromNewRestaurant({
          food: {
            id: food.id,
            name: food.name,
            description: food.description,
            price: food.price,
            imageUrl: food.imageUrl,
            foodCategory: food.foodCategory,
            foodType: food.foodType,
            preparationTime: food.preparationTime,
          },
          restaurant: cartRestaurant,
          quantity,
          extras,
          specialNotes,
        });
      }
    },
    [food, cartRestaurant, addItem, clearAndAddFromNewRestaurant],
  );

  return (
    <>
      <div
        className={`flex gap-4 rounded-2xl p-4 ${
          isDarkMode
            ? "border border-gray-700/40"
            : "border border-gray-200"
        }`}
      >
        {/* Food image — only shown when available */}
        {food.imageUrl && (
          <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden flex-shrink-0">
            <Image
              src={food.imageUrl}
              alt={food.name}
              fill
              className="object-cover"
              sizes="128px"
            />
          </div>
        )}

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
            <div className="flex items-center gap-2">
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

            {/* Add to cart button */}
            <button
              onClick={handleAddToCart}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                cartQuantity > 0
                  ? "bg-orange-500 text-white hover:bg-orange-600"
                  : isDarkMode
                    ? "bg-orange-500/15 text-orange-400 hover:bg-orange-500/25"
                    : "bg-orange-50 text-orange-600 hover:bg-orange-100"
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              {cartQuantity > 0 ? cartQuantity : t("add")}
            </button>
          </div>
        </div>
      </div>

      <FoodExtrasSheet
        open={extrasOpen}
        onClose={() => setExtrasOpen(false)}
        onConfirm={handleExtrasConfirm}
        foodName={food.name}
        foodPrice={food.price}
        foodCategory={food.foodCategory}
        isDarkMode={isDarkMode}
      />
    </>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────────────────

function LoadingSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  const skeletonBg = isDarkMode ? "bg-gray-700" : "bg-gray-200";

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        {/* Back link skeleton */}
        <div className={`h-4 w-32 rounded ${skeletonBg} animate-pulse mb-4`} />

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

// ─── Main Component ─────────────────────────────────────────────────────────

export default function RestaurantDetail({
  restaurant,
  foods,
  loading,
}: RestaurantDetailProps) {
  const isDarkMode = useTheme();
  const t = useTranslations("restaurantDetail");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIconCategory, setSelectedIconCategory] = useState<string | null>(null);
  const [restaurantFoodCategories, setRestaurantFoodCategories] = useState<string[]>([]);

  // Fetch this restaurant's food categories from Typesense facets
  useEffect(() => {
    if (!restaurant?.id) return;
    const svc = TypeSenseServiceManager.instance.restaurantService;
    svc.fetchFoodFacets({ restaurantId: restaurant.id }).then((facets) => {
      if (facets.foodCategory?.length) {
        setRestaurantFoodCategories(facets.foodCategory.map((f) => f.value));
      }
    });
  }, [restaurant?.id]);

  // Filter foods based on icon filter + search
  const filteredFoods = useMemo(() => {
    let list = foods;

    if (selectedIconCategory) {
      list = list.filter((f) => f.foodCategory === selectedIconCategory);
    }

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
  }, [foods, selectedIconCategory, searchQuery]);

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

  const hasActiveFilters = selectedIconCategory !== null || searchQuery.trim() !== "";

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

        {/* Food category icons */}
        {restaurantFoodCategories.length > 0 && (
          <FilterIcons
            selected={selectedIconCategory}
            onSelect={setSelectedIconCategory}
            isDarkMode={isDarkMode}
            categories={restaurantFoodCategories}
          />
        )}

        {/* Food list */}
        {filteredFoods.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-10">
            {filteredFoods.map((food) => (
              <FoodCard key={food.id} food={food} isDarkMode={isDarkMode} restaurant={restaurant} />
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
                  setSelectedIconCategory(null);
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
