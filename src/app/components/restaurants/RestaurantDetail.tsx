"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "@/hooks/useTheme";
import { Restaurant } from "@/types/Restaurant";
import { Food } from "@/types/Food";
import { pickLocalized } from "@/utils/foodLocalized";
import { isRestaurantOpen, doesRestaurantDeliver } from "@/utils/restaurant";
import { FoodAddress } from "@/app/models/FoodAddress";
import { FoodCategoryData } from "@/constants/foodData";
import {
  Star,
  Clock,
  ChevronLeft,
  Search,
  UtensilsCrossed,
  Plus,
  Check,
  MapPin,
  Percent,
  AlertTriangle,
  X,
  CupSoda,
} from "lucide-react";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import FilterIcons from "./FilterIcons";
import {
  useFoodCartActions,
  useFoodCartState,
  SelectedExtra,
  FoodCartRestaurant,
} from "@/context/FoodCartProvider";
import FoodExtrasSheet from "./FoodExtrasSheet";
import FoodCartSidebar from "./FoodCartSidebar";
import RestaurantConflictDialog from "./Restaurantconflictdialog";
import RestaurantReviews from "./RestaurantReviews";
import LoginModal from "@/app/components/LoginModal";
import FoodLocationPicker from "./FoodLocationPicker";
import { useUser } from "@/context/UserProvider";
import CloudinaryImage from "../CloudinaryImage";
import { CloudinaryUrl } from "@/utils/cloudinaryUrl";

interface RestaurantDetailProps {
  restaurant: Restaurant | null;
  foods: Food[];
  drinks: DrinkItem[];
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
          isDarkMode ? "border border-gray-700/40" : "border border-gray-200"
        }`}
      >
        <div className="flex items-start gap-4">
          {/* Profile image */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border-2 border-white shadow-md flex-shrink-0 dark:border-gray-700">
            {restaurant.profileImageStoragePath ||
            restaurant.profileImageUrl ? (
              <CloudinaryImage.Banner
                source={
                  restaurant.profileImageStoragePath ||
                  restaurant.profileImageUrl!
                }
                cdnWidth={200}
                fit="cover"
                alt={restaurant.name}
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
                  {restaurant.reviewCount != null &&
                    restaurant.reviewCount > 0 && (
                      <span>
                        ({restaurant.reviewCount} {t("reviews")})
                      </span>
                    )}
                </span>
              )}
              {restaurant.cuisineTypes &&
                restaurant.cuisineTypes.length > 0 && (
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

// ─── Food Image Lightbox ─────────────────────────────────────────────────────

function FoodImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  // Lock body scroll without layout shift
  useEffect(() => {
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10"
        aria-label="Close"
      >
        <X size={20} />
      </button>

      {/* Image */}
      <div
        className="relative max-w-[90vw] max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={CloudinaryUrl.bannerCdn(src, 1600)}
          alt={alt}
          width={800}
          height={800}
          className="object-contain max-h-[85vh] rounded-2xl"
          sizes="90vw"
          priority
          unoptimized
        />
      </div>
    </div>,
    document.body,
  );
}

// ─── Food Card ──────────────────────────────────────────────────────────────

// Pending conflict data stored by parent so the dialog is rendered once
interface PendingConflict {
  food: {
    id: string;
    name: string;
    description?: string;
    price: number;
    imageUrl?: string;
    foodCategory: string;
    foodType: string;
    preparationTime?: number | null;
  };
  restaurant: FoodCartRestaurant;
  quantity: number;
  extras: SelectedExtra[];
  specialNotes: string;
}

interface DrinkItem {
  id: string;
  restaurantId: string;
  name: string;
  price: number;
  isAvailable: boolean;
  /** Auto-translations written by `translateDrinkOnWrite`. May be missing
   *  until the CF has run for this doc. */
  nameTr?: string;
  nameEn?: string;
  nameRu?: string;
}

function FoodCard({
  food,
  isDarkMode,
  restaurant,
  isOpen,
  deliversToUser,
  cartQuantity,
  onConflict,
  onRemoveFromCart,
  onLoginRequired,
  onAddressRequired,
  onNoDelivery,
  isAuthenticated,
  hasFoodAddress,
}: {
  food: Food;
  isDarkMode: boolean;
  restaurant: Restaurant;
  isOpen: boolean;
  deliversToUser: boolean;
  cartQuantity: number;
  onConflict: (pending: PendingConflict) => void;
  onRemoveFromCart: (foodId: string) => void;
  onLoginRequired: () => void;
  onAddressRequired: () => void;
  onNoDelivery: () => void;
  isAuthenticated: boolean;
  hasFoodAddress: boolean;
}) {
  const t = useTranslations("restaurantDetail");
  const locale = useLocale();
  const { addItem } = useFoodCartActions();

  const [extrasOpen, setExtrasOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Localized variants picked from CF-written name_tr / name_en / name_ru
  // (and the description_* counterparts). Falls back to the raw user-typed
  // source when the active locale's translation isn't there yet.
  const displayName = pickLocalized(
    locale,
    food.name,
    food.nameTr,
    food.nameEn,
    food.nameRu,
  );
  const displayDescription = food.description
    ? pickLocalized(
        locale,
        food.description,
        food.descriptionTr,
        food.descriptionEn,
        food.descriptionRu,
      )
    : undefined;

  // Try to get localized food type name
  const translationKey =
    FoodCategoryData.kFoodTypeTranslationKeys[food.foodType];
  const tFood = useTranslations();
  const displayType = translationKey ? tFood(translationKey) : food.foodType;

  // Check if discount is currently active
  const isDiscountActive = useMemo(() => {
    if (!food.discount) return false;
    const now = new Date();
    return now >= food.discount.startDate && now <= food.discount.endDate;
  }, [food.discount]);

  const cartRestaurant: FoodCartRestaurant = useMemo(
    () => ({
      id: restaurant.id,
      name: restaurant.name,
      profileImageUrl: restaurant.profileImageUrl,
    }),
    [restaurant.id, restaurant.name, restaurant.profileImageUrl],
  );

  const handleAddToCart = useCallback(() => {
    if (!isOpen) return;
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }
    if (!hasFoodAddress) {
      onAddressRequired();
      return;
    }
    // Click-time delivery verification — prevents stale-state race conditions
    if (!deliversToUser) {
      onNoDelivery();
      return;
    }
    setExtrasOpen(true);
  }, [
    isOpen,
    isAuthenticated,
    hasFoodAddress,
    deliversToUser,
    onLoginRequired,
    onAddressRequired,
    onNoDelivery,
  ]);

  const handleExtrasConfirm = useCallback(
    async (extras: SelectedExtra[], specialNotes: string, quantity: number) => {
      const foodData = {
        id: food.id,
        name: food.name,
        description: food.description,
        price: food.price,
        imageUrl: food.imageUrl,
        foodCategory: food.foodCategory,
        foodType: food.foodType,
        preparationTime: food.preparationTime,
      };

      const result = await addItem({
        food: foodData,
        restaurant: cartRestaurant,
        quantity,
        extras,
        specialNotes,
      });

      if (result === "restaurant_conflict") {
        onConflict({
          food: foodData,
          restaurant: cartRestaurant,
          quantity,
          extras,
          specialNotes,
        });
      }
    },
    [food, cartRestaurant, addItem, onConflict],
  );

  return (
    <>
      <div
        className={`flex gap-4 rounded-2xl p-4 ${
          isDarkMode ? "border border-gray-700/40" : "border border-gray-200"
        }`}
      >
        {/* Food image — only shown when available */}
        {food.imageUrl && (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-xl overflow-hidden flex-shrink-0 cursor-zoom-in"
          >
            <CloudinaryImage.Banner
              source={food.imageStoragePath || food.imageUrl!}
              cdnWidth={400}
              fit="cover"
              alt={displayName}
            />
            {isDiscountActive && food.discount && (
              <div className="absolute top-1.5 left-1.5 z-10 bg-[#00A86B] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-sm">
                -{food.discount.percentage}%
              </div>
            )}
          </button>
        )}

        {/* Food info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div>
            <h3
              className={`font-semibold text-base truncate ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {displayName}
            </h3>

            <p
              className={`text-xs mt-0.5 ${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              }`}
            >
              {displayType}
            </p>

            {displayDescription && (
              <p
                className={`text-sm mt-1.5 line-clamp-2 ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {displayDescription}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {isDiscountActive && food.discount ? (
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold ${
                      isDarkMode
                        ? "bg-[#00A86B]/15 text-[#34D399]"
                        : "bg-[#00A86B]/10 text-[#00A86B]"
                    }`}
                  >
                    <Percent className="w-3 h-3" />
                    {food.discount.percentage}
                  </span>
                  <span
                    className={`text-sm line-through ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    {food.discount.originalPrice.toLocaleString()} TL
                  </span>
                  <span
                    className={`text-lg font-bold ${
                      isDarkMode ? "text-[#34D399]" : "text-[#00A86B]"
                    }`}
                  >
                    {food.price.toLocaleString()} TL
                  </span>
                </div>
              ) : (
                <span
                  className={`text-lg font-bold ${
                    isDarkMode ? "text-orange-400" : "text-orange-600"
                  }`}
                >
                  {food.price.toLocaleString()} TL
                </span>
              )}

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

            {/* Add to cart / In cart button */}
            <button
              onClick={
                cartQuantity > 0
                  ? () => onRemoveFromCart(food.id)
                  : handleAddToCart
              }
              disabled={!isOpen}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                !isOpen
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500"
                  : !deliversToUser
                    ? isDarkMode
                      ? "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20"
                      : "bg-yellow-50 text-yellow-600 hover:bg-yellow-100 border border-yellow-200"
                    : cartQuantity > 0
                      ? isDarkMode
                        ? "bg-green-500/15 text-green-400 hover:bg-green-500/25"
                        : "bg-green-50 text-green-600 hover:bg-green-100"
                      : isDarkMode
                        ? "bg-orange-500/15 text-orange-400 hover:bg-orange-500/25"
                        : "bg-orange-50 text-orange-600 hover:bg-orange-100"
              }`}
            >
              {!isOpen ? (
                <span>{t("closed")}</span>
              ) : !deliversToUser ? (
                <span>{t("noDeliveryToAddress")}</span>
              ) : cartQuantity > 0 ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  {cartQuantity}
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  {t("add")}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <FoodExtrasSheet
        open={extrasOpen}
        onClose={() => setExtrasOpen(false)}
        onConfirm={handleExtrasConfirm}
        foodName={displayName}
        foodPrice={food.price}
        foodCategory={food.foodCategory}
        allowedExtras={food.extras}
        isDarkMode={isDarkMode}
      />

      {lightboxOpen && food.imageUrl && (
        <FoodImageLightbox
          src={food.imageStoragePath || food.imageUrl}
          alt={displayName}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

function DrinkCard({
  drink,
  isDarkMode,
  isOpen,
  deliversToUser,
  cartQuantity,
  onAdd,
  onRemove,
}: {
  drink: DrinkItem;
  isDarkMode: boolean;
  isOpen: boolean;
  deliversToUser: boolean;
  cartQuantity: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("restaurantDetail");
  const locale = useLocale();
  const displayName = pickLocalized(
    locale,
    drink.name,
    drink.nameTr,
    drink.nameEn,
    drink.nameRu,
  );

  return (
    <div
      className={`flex items-center gap-4 rounded-2xl p-4 ${
        isDarkMode ? "border border-gray-700/40" : "border border-gray-200"
      }`}
    >
      {/* Drink icon */}
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isDarkMode ? "bg-orange-500/10" : "bg-orange-50"
        }`}
      >
        <CupSoda
          className={`w-5 h-5 ${
            isDarkMode ? "text-orange-400" : "text-orange-500"
          }`}
        />
      </div>

      {/* Name + price */}
      <div className="flex-1 min-w-0">
        <h3
          className={`font-semibold text-sm truncate ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {displayName}
        </h3>
        <span
          className={`text-base font-bold mt-0.5 block ${
            isDarkMode ? "text-orange-400" : "text-orange-600"
          }`}
        >
          {drink.price.toLocaleString()} TL
        </span>
      </div>

      {/* Add / in-cart button */}
      <button
        onClick={cartQuantity > 0 ? onRemove : onAdd}
        disabled={!isOpen}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
          !isOpen
            ? "bg-gray-200 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500"
            : !deliversToUser
              ? isDarkMode
                ? "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20"
                : "bg-yellow-50 text-yellow-600 hover:bg-yellow-100 border border-yellow-200"
              : cartQuantity > 0
                ? isDarkMode
                  ? "bg-green-500/15 text-green-400 hover:bg-green-500/25"
                  : "bg-green-50 text-green-600 hover:bg-green-100"
                : isDarkMode
                  ? "bg-orange-500/15 text-orange-400 hover:bg-orange-500/25"
                  : "bg-orange-50 text-orange-600 hover:bg-orange-100"
        }`}
      >
        {!isOpen ? (
          <span>{t("closed")}</span>
        ) : !deliversToUser ? (
          <span>{t("noDeliveryToAddress")}</span>
        ) : cartQuantity > 0 ? (
          <>
            <Check className="w-3.5 h-3.5" />
            {cartQuantity}
          </>
        ) : (
          <>
            <Plus className="w-3.5 h-3.5" />
            {t("add")}
          </>
        )}
      </button>
    </div>
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
            isDarkMode
              ? "bg-gray-900 border border-gray-800"
              : "bg-white border border-gray-100 shadow-lg"
          }`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl ${skeletonBg} animate-pulse`}
            />
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
                isDarkMode
                  ? "bg-gray-800/60 border border-gray-700/50"
                  : "bg-white border border-gray-100"
              }`}
            >
              <div
                className={`w-28 h-28 sm:w-32 sm:h-32 rounded-xl ${skeletonBg} animate-pulse flex-shrink-0`}
              />
              <div className="flex-1 space-y-3 py-1">
                <div
                  className={`h-5 w-40 rounded ${skeletonBg} animate-pulse`}
                />
                <div
                  className={`h-3 w-24 rounded ${skeletonBg} animate-pulse`}
                />
                <div
                  className={`h-4 w-full rounded ${skeletonBg} animate-pulse`}
                />
                <div
                  className={`h-6 w-20 rounded ${skeletonBg} animate-pulse`}
                />
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
  drinks,
  loading,
}: RestaurantDetailProps) {
  const isDarkMode = useTheme();
  const t = useTranslations("restaurantDetail");
  const router = useRouter();
  const { user, profileData } = useUser();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showNoDeliveryModal, setShowNoDeliveryModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIconCategory, setSelectedIconCategory] = useState<
    string | null
  >(null);
  const [restaurantFoodCategories, setRestaurantFoodCategories] = useState<
    string[]
  >([]);
  const [activeTab, setActiveTab] = useState<"menu" | "reviews">("menu");

  const { addItem, clearAndAddFromNewRestaurant, removeItem } =
    useFoodCartActions();

  const { items, currentRestaurant: cartRestaurant } = useFoodCartState();
  // ── Restaurant conflict dialog ──
  const [pendingConflict, setPendingConflict] =
    useState<PendingConflict | null>(null);

  const handleConflict = useCallback((pending: PendingConflict) => {
    setPendingConflict(pending);
  }, []);

  const handleConflictReplace = useCallback(async () => {
    if (!pendingConflict) return;
    await clearAndAddFromNewRestaurant(pendingConflict);
    setPendingConflict(null);
  }, [pendingConflict, clearAndAddFromNewRestaurant]);

  // Parse user's food address for delivery check
  const foodAddress = useMemo(
    () =>
      profileData?.foodAddress
        ? FoodAddress.fromMap(
            profileData.foodAddress as Record<string, unknown>,
          )
        : null,
    [profileData?.foodAddress],
  );

  const deliversToUser = useMemo(
    () =>
      restaurant ? doesRestaurantDeliver(restaurant, foodAddress?.city) : true,
    [restaurant, foodAddress],
  );

  const cartQuantityMap = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => {
      const prev = map.get(i.originalFoodId) ?? 0;
      map.set(i.originalFoodId, prev + i.quantity);
    });
    return map;
  }, [items]);

  const handleRemoveFromCart = useCallback(
    async (foodId: string) => {
      const matching = items.filter((i) => i.originalFoodId === foodId);
      for (const item of matching) {
        await removeItem(item.foodId);
      }
    },
    [items, removeItem],
  );

  const isOpen = useMemo(
    () => (restaurant ? isRestaurantOpen(restaurant) : false),
    [restaurant],
  );

  const handleAddDrinkToCart = useCallback(
    async (drink: DrinkItem) => {
      if (!isOpen) return;
      if (!user) {
        setShowLoginModal(true);
        return;
      }
      if (!foodAddress) {
        setShowLocationPicker(true);
        return;
      }
      if (!deliversToUser) {
        setShowNoDeliveryModal(true);
        return;
      }

      const cartRest: FoodCartRestaurant = {
        id: restaurant!.id,
        name: restaurant!.name,
        profileImageUrl: restaurant!.profileImageUrl,
      };

      const result = await addItem({
        food: {
          id: drink.id,
          name: drink.name,
          price: drink.price,
          foodCategory: "drink",
          foodType: "drink",
        },
        restaurant: cartRest,
        quantity: 1,
        extras: [],
        specialNotes: "",
      });

      if (result === "restaurant_conflict") {
        handleConflict({
          food: {
            id: drink.id,
            name: drink.name,
            price: drink.price,
            foodCategory: "drink",
            foodType: "drink",
          },
          restaurant: cartRest,
          quantity: 1,
          extras: [],
          specialNotes: "",
        });
      }
    },
    [
      isOpen,
      user,
      foodAddress,
      deliversToUser,
      restaurant,
      addItem,
      handleConflict,
    ],
  );

  const handleRemoveDrinkFromCart = useCallback(
    async (drinkId: string) => {
      const matching = items.filter((i) => i.originalFoodId === drinkId);
      for (const item of matching) {
        await removeItem(item.foodId);
      }
    },
    [items, removeItem],
  );

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

  // Typesense search results (only populated when user types a query)
  const [typesenseResults, setTypesenseResults] = useState<Food[] | null>(null);

  useEffect(() => {
    if (!restaurant?.id) return;

    const query = searchQuery.trim();

    // No text search — clear Typesense results, use prop data
    if (!query) {
      setTypesenseResults(null);
      return;
    }

    let cancelled = false;
    const svc = TypeSenseServiceManager.instance.restaurantService;
    svc
      .debouncedSearchFoods({
        query,
        restaurantId: restaurant.id,
        foodCategory: selectedIconCategory ? [selectedIconCategory] : undefined,
        hitsPerPage: 100,
      })
      .then((result) => {
        if (!cancelled) setTypesenseResults(result.items);
      });

    return () => {
      cancelled = true;
    };
  }, [searchQuery, restaurant?.id, selectedIconCategory]);

  // When only icon filter is active (no text), filter the prop data client-side
  const filteredFoods = useMemo(() => {
    if (typesenseResults) return typesenseResults;

    if (selectedIconCategory) {
      return foods.filter((f) => f.foodCategory === selectedIconCategory);
    }

    return foods;
  }, [foods, selectedIconCategory, typesenseResults]);

  const hasActiveFilters = useMemo(
    () => selectedIconCategory !== null || searchQuery.trim() !== "",
    [selectedIconCategory, searchQuery],
  );

  const groupedFoods = useMemo(() => {
    if (hasActiveFilters) return null; // flat list when filtering
    const map = new Map<string, Food[]>();
    FoodCategoryData.kCategories.forEach(({ key }) => {
      const items = foods.filter((f) => f.foodCategory === key);
      if (items.length > 0) map.set(key, items);
    });
    return map;
  }, [foods, hasActiveFilters]);

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

  return (
    <main className="flex-1">
      {/* Restaurant Header */}
      <RestaurantHeader restaurant={restaurant} isDarkMode={isDarkMode} />

      {/* Closed banner */}
      {!isOpen && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div
            className={`flex items-center gap-3 rounded-2xl px-5 py-4 ${
              isDarkMode
                ? "bg-red-500/10 border border-red-500/20"
                : "bg-red-50 border border-red-200"
            }`}
          >
            <Clock
              className={`w-5 h-5 flex-shrink-0 ${
                isDarkMode ? "text-red-400" : "text-red-500"
              }`}
            />
            <div>
              <p
                className={`text-sm font-semibold ${
                  isDarkMode ? "text-red-400" : "text-red-600"
                }`}
              >
                {t("closedBanner")}
              </p>
              <p
                className={`text-xs mt-0.5 ${
                  isDarkMode ? "text-red-400/70" : "text-red-500/70"
                }`}
              >
                {t("closedBannerSubtitle")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No delivery banner */}
      {!deliversToUser && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div
            className={`flex items-center gap-3 rounded-2xl px-5 py-4 ${
              isDarkMode
                ? "bg-yellow-500/10 border border-yellow-500/20"
                : "bg-yellow-50 border border-yellow-200"
            }`}
          >
            <MapPin
              className={`w-5 h-5 flex-shrink-0 ${
                isDarkMode ? "text-yellow-400" : "text-yellow-600"
              }`}
            />
            <div>
              <p
                className={`text-sm font-semibold ${
                  isDarkMode ? "text-yellow-400" : "text-yellow-700"
                }`}
              >
                {t("noDeliveryBanner")}
              </p>
              <p
                className={`text-xs mt-0.5 ${
                  isDarkMode ? "text-yellow-400/70" : "text-yellow-600/70"
                }`}
              >
                {t("noDeliveryBannerSubtitle")}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="flex gap-6">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Tab buttons + search */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab("menu")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                    activeTab === "menu"
                      ? "bg-orange-500 text-white"
                      : isDarkMode
                        ? "text-gray-400 hover:text-white hover:bg-gray-800"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  {t("menu")}
                  <span
                    className={`ml-1.5 text-xs font-normal ${
                      activeTab === "menu"
                        ? "text-white/70"
                        : isDarkMode
                          ? "text-gray-500"
                          : "text-gray-400"
                    }`}
                  >
                    ({foods.length})
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("reviews")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                    activeTab === "reviews"
                      ? "bg-orange-500 text-white"
                      : isDarkMode
                        ? "text-gray-400 hover:text-white hover:bg-gray-800"
                        : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  {t("reviewsTab")}
                </button>
              </div>

              {activeTab === "menu" && (
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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
              )}
            </div>

            {activeTab === "menu" ? (
              <>
                {/* Food category icons */}
                {restaurantFoodCategories.length > 0 && (
                  <FilterIcons
                    selected={selectedIconCategory}
                    onSelect={setSelectedIconCategory}
                    isDarkMode={isDarkMode}
                    categories={restaurantFoodCategories}
                  />
                )}

                {/* Food + Drinks list */}
                {filteredFoods.length > 0 || drinks.length > 0 ? (
                  <>
                    {/* Foods */}
                    {filteredFoods.length > 0 &&
                      (groupedFoods ? (
                        <div className="space-y-8 pb-4">
                          {Array.from(groupedFoods.entries()).map(
                            ([category, items], idx) => (
                              <div key={category}>
                                {idx > 0 && (
                                  <hr
                                    className={`mb-8 border-t ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}
                                  />
                                )}
                                <h3
                                  className={`text-base font-bold mb-3 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                                >
                                  {category}
                                </h3>
                                <div className="grid grid-cols-1 gap-4">
                                  {items.map((food) => (
                                    <FoodCard
                                      key={food.id}
                                      food={food}
                                      isDarkMode={isDarkMode}
                                      restaurant={restaurant}
                                      isOpen={isOpen}
                                      deliversToUser={deliversToUser}
                                      cartQuantity={
                                        cartQuantityMap.get(food.id) ?? 0
                                      }
                                      onConflict={handleConflict}
                                      onRemoveFromCart={handleRemoveFromCart}
                                      isAuthenticated={!!user}
                                      hasFoodAddress={!!foodAddress}
                                      onLoginRequired={() =>
                                        setShowLoginModal(true)
                                      }
                                      onAddressRequired={() =>
                                        setShowLocationPicker(true)
                                      }
                                      onNoDelivery={() =>
                                        setShowNoDeliveryModal(true)
                                      }
                                    />
                                  ))}
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4 pb-4">
                          {filteredFoods.map((food) => (
                            <FoodCard
                              key={food.id}
                              food={food}
                              isDarkMode={isDarkMode}
                              restaurant={restaurant}
                              isOpen={isOpen}
                              deliversToUser={deliversToUser}
                              cartQuantity={cartQuantityMap.get(food.id) ?? 0}
                              onConflict={handleConflict}
                              onRemoveFromCart={handleRemoveFromCart}
                              isAuthenticated={!!user}
                              hasFoodAddress={!!foodAddress}
                              onLoginRequired={() => setShowLoginModal(true)}
                              onAddressRequired={() =>
                                setShowLocationPicker(true)
                              }
                              onNoDelivery={() => setShowNoDeliveryModal(true)}
                            />
                          ))}
                        </div>
                      ))}

                    {/* Drinks section */}
                    {drinks.length > 0 && !hasActiveFilters && (
                      <div className="pb-10">
                        <div className="flex items-center gap-2.5 mb-4 mt-4">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                              isDarkMode ? "bg-orange-500/10" : "bg-orange-50"
                            }`}
                          >
                            <CupSoda
                              className={`w-3.5 h-3.5 ${
                                isDarkMode
                                  ? "text-orange-400"
                                  : "text-orange-600"
                              }`}
                            />
                          </div>
                          <h3
                            className={`text-base font-bold ${
                              isDarkMode ? "text-white" : "text-gray-900"
                            }`}
                          >
                            {t("drinks")}
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          {drinks.map((drink) => (
                            <DrinkCard
                              key={drink.id}
                              drink={drink}
                              isDarkMode={isDarkMode}
                              isOpen={isOpen}
                              deliversToUser={deliversToUser}
                              cartQuantity={cartQuantityMap.get(drink.id) ?? 0}
                              onAdd={() => handleAddDrinkToCart(drink)}
                              onRemove={() =>
                                handleRemoveDrinkFromCart(drink.id)
                              }
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : foods.length === 0 && drinks.length === 0 ? (
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
              </>
            ) : (
              <RestaurantReviews
                restaurantId={restaurant.id}
                isDarkMode={isDarkMode}
              />
            )}
          </div>

          {/* Cart Sidebar — desktop only (sticky right column) */}
          <div className="hidden lg:block w-80 flex-shrink-0">
            <FoodCartSidebar
              isDarkMode={isDarkMode}
              mode="desktop"
              restaurant={restaurant}
            />
          </div>
        </div>
      </div>

      {/* Cart FAB — mobile only */}
      <FoodCartSidebar
        isDarkMode={isDarkMode}
        mode="mobile"
        restaurant={restaurant}
      />

      {/* Restaurant conflict dialog */}
      <RestaurantConflictDialog
        open={!!pendingConflict}
        currentRestaurantName={cartRestaurant?.name ?? ""}
        newRestaurantName={pendingConflict?.restaurant.name ?? ""}
        onReplace={handleConflictReplace}
        onCancel={() => setPendingConflict(null)}
        isDarkMode={isDarkMode}
        t={(key, fallback) => {
          try {
            const v = t(key);
            return v !== key ? v : fallback;
          } catch {
            return fallback;
          }
        }}
      />

      {/* Login modal for unauthenticated users — navigate back to restaurants
          so Typesense re-fetches filtered by the user's delivery region */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={() => {
          setShowLoginModal(false);
          router.replace("/restaurants");
        }}
      />

      {/* Food address picker for users without delivery address */}
      <FoodLocationPicker
        isOpen={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        isDarkMode={isDarkMode}
        required
      />

      {/* No delivery warning modal */}
      {showNoDeliveryModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowNoDeliveryModal(false)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl border shadow-xl overflow-hidden ${
              isDarkMode
                ? "bg-gray-900 border-gray-800"
                : "bg-white border-gray-100"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-6 pb-4 text-center">
              <div
                className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
                  isDarkMode ? "bg-yellow-500/15" : "bg-yellow-50"
                }`}
              >
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
              </div>
              <h3
                className={`text-base font-bold mb-1 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("noDeliveryBanner")}
              </h3>
              <p
                className={`text-sm ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {t("noDeliveryBannerSubtitle")}
              </p>
            </div>
            <div className={`px-5 pb-5 flex gap-3`}>
              <button
                onClick={() => {
                  setShowNoDeliveryModal(false);
                  setShowLocationPicker(true);
                }}
                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors border ${
                  isDarkMode
                    ? "border-gray-700 text-gray-300 hover:bg-gray-800"
                    : "border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t("changeAddress")}
              </button>
              <button
                onClick={() => setShowNoDeliveryModal(false)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
              >
                {t("understood")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
