import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  HeartIcon,
  StarIcon,
  MapPinIcon,
  UsersIcon,
  EyeIcon,
  SparklesIcon
} from "@heroicons/react/24/outline";
import {
  HeartIcon as HeartSolidIcon,
  StarIcon as StarSolidIcon
} from "@heroicons/react/24/solid";
import { Timestamp } from "firebase/firestore";

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
      return "categoryMotherChild"; // Map Kids to Mother & Child
    case "Beauty":
      return "categoryBeautyPersonalCare";
    case "Jewelry":
      return "categoryAccessories"; // Jewelry is under Accessories
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
  const [isHovered, setIsHovered] = useState(false);
  const t = useTranslations();

  const handleFavoriteToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFavorite(!isFavorite);
    // TODO: Implement favorite functionality with Firebase
  };

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <div key={i} className="relative">
          {i <= Math.floor(rating) ? (
            <StarSolidIcon className="w-4 h-4 text-yellow-400" />
          ) : i === Math.ceil(rating) && rating % 1 !== 0 ? (
            <div className="relative">
              <StarIcon className="w-4 h-4 text-gray-300" />
              <StarSolidIcon 
                className="w-4 h-4 text-yellow-400 absolute top-0 left-0" 
                style={{ clipPath: `inset(0 ${100 - (rating % 1) * 100}% 0 0)` }}
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
    <Link href={`/shopdetail/${shop.id}`}>
      <div
        className={`relative group cursor-pointer rounded-2xl overflow-hidden transition-all duration-500 transform hover:scale-[1.03] ${
          isDarkMode
            ? "bg-gradient-to-br from-gray-800 via-gray-800 to-gray-700 border border-gray-700/50 shadow-xl"
            : "bg-gradient-to-br from-white via-white to-gray-50 border border-gray-200/50 shadow-lg"
        } hover:shadow-2xl backdrop-blur-sm`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Glow Effect - Only for boosted shops */}
        {shop.isBoosted && (
          <div className={`absolute inset-0 rounded-2xl transition-opacity duration-500 bg-gradient-to-r from-yellow-400/20 to-orange-500/20 ${isHovered ? "opacity-100" : "opacity-0"} blur-xl`} />
        )}

        {/* Boosted Badge */}
        {shop.isBoosted && (
          <div className="absolute top-4 left-4 z-20">
            <div className="relative group/badge">
              <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full blur opacity-75 group-hover/badge:opacity-100 transition duration-300" />
              <div className="relative bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
                <SparklesIcon className="w-3 h-3" />
                <span>{t("shops.boosted")}</span>
                <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full opacity-0 group-hover/badge:opacity-30 blur transition duration-300" />
              </div>
            </div>
          </div>
        )}

        {/* Favorite Button */}
        <button
          onClick={handleFavoriteToggle}
          className="absolute top-4 right-4 z-20 p-2.5 rounded-full backdrop-blur-md transition-all duration-300 hover:scale-110 active:scale-95 group/fav"
          style={{
            background: isDarkMode 
              ? 'rgba(0, 0, 0, 0.4)' 
              : 'rgba(255, 255, 255, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}
        >
          <div className="relative">
            {isFavorite ? (
              <HeartSolidIcon className="w-5 h-5 text-red-500 drop-shadow-sm" />
            ) : (
              <HeartIcon className="w-5 h-5 text-white drop-shadow-sm group-hover/fav:text-red-300 transition-colors" />
            )}
          </div>
        </button>

        {/* Cover Image */}
        <div className="relative h-40 overflow-hidden">
          {shop.coverImageUrls &&
          shop.coverImageUrls.length > 0 &&
          !imageError ? (
            <Image
              src={shop.coverImageUrls[0]}
              alt={`${shop.name} cover`}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-110"
              onError={() => setImageError(true)}
            />
          ) : (
            <div
              className={`w-full h-full flex items-center justify-center ${
                isDarkMode 
                  ? "bg-gradient-to-br from-gray-700 to-gray-600" 
                  : "bg-gradient-to-br from-gray-200 to-gray-100"
              }`}
            >
              <div className="relative">
                <div
                  className={`text-6xl ${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  } transition-transform duration-300 group-hover:scale-110`}
                >
                  🏪
                </div>
                <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12" />
              </div>
            </div>
          )}

          {/* Enhanced Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          
          {/* Floating Elements */}
          <div className="absolute inset-0">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-white/30 rounded-full animate-pulse"
                style={{
                  left: `${20 + i * 30}%`,
                  top: `${20 + i * 20}%`,
                  animationDelay: `${i * 0.5}s`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Profile Image */}
        <div className="absolute top-28 left-4 z-10">
          <div className="relative group/profile">
            <div className="relative w-20 h-20 rounded-full border-4 border-white dark:border-gray-700 overflow-hidden shadow-xl backdrop-blur-sm">
              {shop.profileImageUrl ? (
                <Image
                  src={shop.profileImageUrl}
                  alt={shop.name}
                  fill
                  className="object-cover transition-transform duration-300 group-hover/profile:scale-110"
                />
              ) : (
                <div className={`w-full h-full flex items-center justify-center ${
                  isDarkMode ? "bg-gray-600" : "bg-gray-300"
                }`}>
                  <span className="text-2xl">🏪</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 pt-12 space-y-4">
          {/* Shop Name */}
          <div className="space-y-2">
            <h3
              className={`font-bold text-xl mb-1 truncate transition-colors duration-300 ${
                isDarkMode ? "text-white group-hover:text-blue-300" : "text-gray-900 group-hover:text-blue-600"
              }`}
            >
              {shop.name}
            </h3>

            {/* Rating */}
            {shop.averageRating > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {renderStars(shop.averageRating)}
                </div>
                <span className={`text-sm font-medium ${
                  isDarkMode ? "text-gray-300" : "text-gray-600"
                }`}>
                  {shop.averageRating.toFixed(1)}
                </span>
                {shop.reviewCount > 0 && (
                  <span className={`text-xs ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}>
                    ({shop.reviewCount})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Categories */}
          {shop.categories && shop.categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {shop.categories.slice(0, 2).map((category, index) => (
                <span
                  key={index}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all duration-300 ${
                    isDarkMode
                      ? "bg-blue-900/30 text-blue-300 border border-blue-700/30"
                      : "bg-blue-100 text-blue-800 border border-blue-200"
                  } hover:scale-105`}
                >
                  {t(getCategoryTranslationKey(category))}
                </span>
              ))}
              {shop.categories.length > 2 && (
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    isDarkMode
                      ? "text-gray-400 bg-gray-800/50"
                      : "text-gray-500 bg-gray-100"
                  }`}
                >
                  +{shop.categories.length - 2}
                </span>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-4">
              {shop.followerCount > 0 && (
                <div className="flex items-center gap-1">
                  <UsersIcon className={`w-4 h-4 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`} />
                  <span className={`text-xs ${
                    isDarkMode ? "text-gray-300" : "text-gray-600"
                  }`}>
                    {shop.followerCount}
                  </span>
                </div>
              )}
              
              {shop.clickCount > 0 && (
                <div className="flex items-center gap-1">
                  <EyeIcon className={`w-4 h-4 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`} />
                  <span className={`text-xs ${
                    isDarkMode ? "text-gray-300" : "text-gray-600"
                  }`}>
                    {shop.clickCount}
                  </span>
                </div>
              )}
            </div>

            {/* Address Indicator */}
            {shop.address && (
              <div className="flex items-center gap-1">
                <MapPinIcon className={`w-4 h-4 ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`} />
              </div>
            )}
          </div>
        </div>


        {/* Shimmer Effect on Hover */}
        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 pointer-events-none" />
      </div>
    </Link>
  );
}