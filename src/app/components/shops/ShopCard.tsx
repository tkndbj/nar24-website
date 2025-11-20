import React, { useState, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  HeartIcon,
  StarIcon,
  MapPinIcon,
  UsersIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import {
  HeartIcon as HeartSolidIcon,
  StarIcon as StarSolidIcon,
} from "@heroicons/react/24/solid";
import { Timestamp } from "firebase/firestore";
import { analyticsBatcher } from "@/app/utils/analyticsBatcher";

interface Shop {
  id: string;
  name: string;
  profileImageUrl: string;
  coverImageUrls: string[];
  address: string;
  averageRating: number;
  reviewCount: number;
  followerCount: number;
  clickCount: number;
  categories: string[];
  contactNo: string;
  ownerId: string;
  isBoosted: boolean;
  createdAt: Timestamp;
}

interface ShopCardProps {
  shop: Shop;
  isDarkMode: boolean;
}

// Helper function to get the translation key for any category
const getCategoryTranslationKey = (category: string): string => {
  switch (category) {
    // Buyer categories
    case "Women":
      return "buyerCategoryWomen";
    case "Men":
      return "buyerCategoryMen";

    // Product categories
    case "Clothing & Fashion":
      return "categoryClothingFashion";
    case "Footwear":
      return "categoryFootwear";
    case "Accessories":
      return "categoryAccessories";
    case "Mother & Child":
      return "categoryMotherChild";
    case "Home & Furniture":
      return "categoryHomeFurniture";
    case "Beauty & Personal Care":
      return "categoryBeautyPersonalCare";
    case "Bags & Luggage":
      return "categoryBagsLuggage";
    case "Electronics":
      return "categoryElectronics";
    case "Sports & Outdoor":
      return "categorySportsOutdoor";
    case "Books, Stationery & Hobby":
      return "categoryBooksStationeryHobby";
    case "Tools & Hardware":
      return "categoryToolsHardware";
    case "Pet Supplies":
      return "categoryPetSupplies";
    case "Automotive":
      return "categoryAutomotive";
    case "Health & Wellness":
      return "categoryHealthWellness";

    // Legacy/alternative category names
    case "Kids":
      return "categoryMotherChild";
    case "Beauty":
      return "categoryBeautyPersonalCare";
    case "Jewelry":
      return "categoryAccessories";
    case "Home & Garden":
      return "categoryHomeFurniture";
    case "Sports":
      return "categorySportsOutdoor";
    case "Books":
      return "categoryBooksStationeryHobby";

    default:
      return category;
  }
};

export default function ShopCard({ shop, isDarkMode }: ShopCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [lastNavigationTime, setLastNavigationTime] = useState<number>(0);

  const t = useTranslations();
  const router = useRouter();

  const NAVIGATION_THROTTLE = 500;

  const handleFavoriteToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFavorite(!isFavorite);
    // TODO: Implement favorite functionality with Firebase
  };

  const handleShopClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();

      const now = Date.now();

      // Throttle rapid taps (same as Flutter)
      if (now - lastNavigationTime < NAVIGATION_THROTTLE) {
        return;
      }

      setLastNavigationTime(now);

      // ✅ Record shop click BEFORE navigation
      analyticsBatcher.recordShopClick(shop.id);

      // Navigate after recording
      router.push(`/shopdetail/${shop.id}`);
    },
    [shop.id, router, lastNavigationTime, NAVIGATION_THROTTLE]
  );

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <div key={i} className="relative">
          {i <= Math.floor(rating) ? (
            <StarSolidIcon className="w-4 h-4 text-amber-400" />
          ) : i === Math.ceil(rating) && rating % 1 !== 0 ? (
            <div className="relative">
              <StarIcon className="w-4 h-4 text-gray-300" />
              <StarSolidIcon
                className="w-4 h-4 text-amber-400 absolute top-0 left-0"
                style={{
                  clipPath: `inset(0 ${100 - (rating % 1) * 100}% 0 0)`,
                }}
              />
            </div>
          ) : (
            <StarIcon className="w-4 h-4 text-gray-300" />
          )}
        </div>
      );
    }
    return stars;
  };

  return (
    <div
      onClick={handleShopClick}
      className={`relative group cursor-pointer rounded-lg overflow-hidden transition-all duration-200 ${
        isDarkMode
          ? "bg-gray-800 border border-gray-700 hover:border-gray-600"
          : "bg-white border border-gray-200 hover:border-gray-300"
      } hover:shadow-lg`}
    >
      {/* Boosted Badge */}
      {shop.isBoosted && (
        <div className="absolute top-3 left-3 z-20">
          <div
            className={`text-xs font-medium px-2.5 py-1 rounded-md ${
              isDarkMode
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}
          >
            {t("shops.boosted")}
          </div>
        </div>
      )}

      {/* Favorite Button */}
      <button
        onClick={handleFavoriteToggle}
        className={`absolute top-3 right-3 z-20 p-2 rounded-lg transition-colors ${
          isDarkMode
            ? "bg-gray-900/60 hover:bg-gray-900/80 backdrop-blur-sm"
            : "bg-white/60 hover:bg-white/80 backdrop-blur-sm"
        }`}
      >
        {isFavorite ? (
          <HeartSolidIcon className="w-5 h-5 text-red-500" />
        ) : (
          <HeartIcon
            className={`w-5 h-5 ${
              isDarkMode ? "text-gray-300" : "text-gray-600"
            }`}
          />
        )}
      </button>

      {/* Cover Image */}
      <div className="relative h-40 overflow-hidden bg-gray-100 dark:bg-gray-700">
        {shop.coverImageUrls &&
        shop.coverImageUrls.length > 0 &&
        !imageError ? (
          <Image
            src={shop.coverImageUrls[0]}
            alt={`${shop.name} cover`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center ${
              isDarkMode ? "bg-gray-700" : "bg-gray-100"
            }`}
          >
            <div
              className={`text-5xl ${
                isDarkMode ? "text-gray-600" : "text-gray-300"
              }`}
            >
              🏪
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
      </div>

      {/* Profile Image */}
      <div className="absolute top-32 left-4 z-10">
        <div
          className={`relative w-16 h-16 rounded-full border-3 overflow-hidden shadow-md ${
            isDarkMode ? "border-gray-800" : "border-white"
          }`}
        >
          {shop.profileImageUrl ? (
            <Image
              src={shop.profileImageUrl}
              alt={shop.name}
              fill
              className="object-cover"
            />
          ) : (
            <div
              className={`w-full h-full flex items-center justify-center ${
                isDarkMode ? "bg-gray-700" : "bg-gray-200"
              }`}
            >
              <span className="text-xl">🏪</span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 pt-10">
        {/* Shop Name */}
        <h3
          className={`font-semibold text-base mb-2 truncate ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {shop.name}
        </h3>

        {/* Rating */}
        {shop.averageRating > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-0.5">
              {renderStars(shop.averageRating)}
            </div>
            <span
              className={`text-sm font-medium ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {shop.averageRating.toFixed(1)}
            </span>
            {shop.reviewCount > 0 && (
              <span
                className={`text-xs ${
                  isDarkMode ? "text-gray-500" : "text-gray-500"
                }`}
              >
                ({shop.reviewCount})
              </span>
            )}
          </div>
        )}

        {/* Categories */}
        {shop.categories && shop.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {shop.categories.slice(0, 2).map((category, index) => (
              <span
                key={index}
                className={`text-xs px-2 py-1 rounded-md ${
                  isDarkMode
                    ? "bg-gray-700 text-gray-300"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                {t(getCategoryTranslationKey(category))}
              </span>
            ))}
            {shop.categories.length > 2 && (
              <span
                className={`text-xs px-2 py-1 rounded-md ${
                  isDarkMode
                    ? "bg-gray-700 text-gray-400"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                +{shop.categories.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Stats & Address */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            {shop.followerCount > 0 && (
              <div className="flex items-center gap-1">
                <UsersIcon
                  className={`w-4 h-4 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                />
                <span
                  className={`text-xs ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {shop.followerCount}
                </span>
              </div>
            )}

            {shop.clickCount > 0 && (
              <div className="flex items-center gap-1">
                <EyeIcon
                  className={`w-4 h-4 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                />
                <span
                  className={`text-xs ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {shop.clickCount}
                </span>
              </div>
            )}
          </div>

          {/* Address Indicator */}
          {shop.address && (
            <MapPinIcon
              className={`w-4 h-4 ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
