import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { HeartIcon, CheckBadgeIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
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

export default function ShopCard({ shop, isDarkMode }: ShopCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [imageError, setImageError] = useState(false);
  const t = useTranslations("shops");

  const handleFavoriteToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFavorite(!isFavorite);
    // TODO: Implement favorite functionality with Firebase
  };

  return (
    <Link href={`/shopdetail/${shop.id}`}>
      <div
        className={`relative group cursor-pointer rounded-xl overflow-hidden transition-all duration-300 transform hover:scale-[1.02] hover:shadow-2xl ${
          isDarkMode
            ? "bg-gray-800 border border-gray-700 shadow-lg"
            : "bg-white border border-gray-200 shadow-md"
        }`}
      >
        {/* Boosted Badge */}
        {shop.isBoosted && (
          <div className="absolute top-3 left-3 z-10">
            <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
              <CheckBadgeIcon className="w-3 h-3" />
              {t("boosted")}
            </div>
          </div>
        )}

        {/* Favorite Button */}
        <button
          onClick={handleFavoriteToggle}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/20 backdrop-blur-sm transition-all duration-200 hover:bg-black/40"
        >
          {isFavorite ? (
            <HeartSolidIcon className="w-5 h-5 text-red-500" />
          ) : (
            <HeartIcon className="w-5 h-5 text-white" />
          )}
        </button>

        {/* Cover Image */}
        <div className="relative h-32 overflow-hidden">
          {shop.coverImageUrls &&
          shop.coverImageUrls.length > 0 &&
          !imageError ? (
            <Image
              src={shop.coverImageUrls[0]}
              alt={`${shop.name} cover`}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-110"
              onError={() => setImageError(true)}
            />
          ) : (
            <div
              className={`w-full h-full flex items-center justify-center ${
                isDarkMode ? "bg-gray-700" : "bg-gray-200"
              }`}
            >
              <div
                className={`text-4xl ${
                  isDarkMode ? "text-gray-500" : "text-gray-400"
                }`}
              >
                🏪
              </div>
            </div>
          )}

          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>

        {/* Profile Image */}
        <div className="absolute top-20 left-4">
          <div className="relative w-16 h-16 rounded-full border-4 border-white overflow-hidden shadow-lg">
            {shop.profileImageUrl ? (
              <Image
                src={shop.profileImageUrl}
                alt={shop.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                <span className="text-gray-600 text-xl">🏪</span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 pt-8">
          {/* Shop Name */}
          <h3
            className={`font-bold text-lg mb-1 truncate ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {shop.name}
          </h3>

          {/* Categories */}
          {shop.categories && shop.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {shop.categories.slice(0, 2).map((category, index) => (
                <span
                  key={index}
                  className={`text-xs px-2 py-1 rounded-full ${
                    isDarkMode
                      ? "bg-blue-900/50 text-blue-300"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {category}
                </span>
              ))}
              {shop.categories.length > 2 && (
                <span
                  className={`text-xs ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  +{shop.categories.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Hover Effect Overlay */}
        <div
          className={`absolute inset-0 rounded-xl transition-all duration-300 pointer-events-none ${
            isDarkMode
              ? "group-hover:bg-blue-500/5"
              : "group-hover:bg-blue-500/5"
          }`}
        />
      </div>
    </Link>
  );
}
