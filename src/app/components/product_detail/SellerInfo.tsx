// src/components/productdetail/ProductDetailSellerInfo.tsx

import React, { useState, useEffect, useCallback } from "react";
import { ChevronRight, Verified, Store, User, Star, Package, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface SellerInfo {
  sellerName: string;
  sellerAverageRating: number;
  shopAverageRating: number;
  sellerIsVerified: boolean;
  totalProductsSold: number;
  totalReviews: number;
}

interface ProductDetailSellerInfoProps {
  sellerId: string;
  sellerName: string;
  shopId?: string;
  isLoading?: boolean;
  isDarkMode?: boolean;
  localization?: ReturnType<typeof useTranslations>;
}

const LoadingSkeleton: React.FC<{ isDarkMode?: boolean }> = ({ 
  isDarkMode = false 
}) => (
  <div className={`rounded-2xl p-6 border animate-pulse ${
    isDarkMode 
      ? "bg-gray-800 border-gray-700" 
      : "bg-white border-gray-200"
  }`}>
    <div className="flex items-center gap-4">
      <div className={`w-12 h-12 rounded-full ${
        isDarkMode ? "bg-gray-700" : "bg-gray-200"
      }`} />
      <div className="flex-1 space-y-2">
        <div className={`w-32 h-4 rounded ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`} />
        <div className={`w-24 h-3 rounded ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`} />
      </div>
      <div className={`w-6 h-6 rounded ${
        isDarkMode ? "bg-gray-700" : "bg-gray-200"
      }`} />
    </div>
  </div>
);

const ProductDetailSellerInfo: React.FC<ProductDetailSellerInfoProps> = ({
  sellerId,
  sellerName,
  shopId,
  isLoading = false,
  isDarkMode = false,
  localization,
}) => {
  const router = useRouter();
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ FIXED: Proper nested translation function that uses JSON files
  const t = useCallback((key: string) => {
    if (!localization) {
      return key;
    }

    try {
      // Try to get the nested ProductDetailSellerInfo translation
      const translation = localization(`ProductDetailSellerInfo.${key}`);
      
      // Check if we got a valid translation (not the same as the key we requested)
      if (translation && translation !== `ProductDetailSellerInfo.${key}`) {
        return translation;
      }
      
      // If nested translation doesn't exist, try direct key
      const directTranslation = localization(key);
      if (directTranslation && directTranslation !== key) {
        return directTranslation;
      }
      
      // Return the key as fallback
      return key;
    } catch (error) {
      console.warn(`Translation error for key: ${key}`, error);
      return key;
    }
  }, [localization]);

  const isShop = shopId && shopId.trim().length > 0;

  useEffect(() => {
    const fetchSellerInfo = async () => {
      if (!sellerId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/seller/${sellerId}${shopId ? `?shopId=${shopId}` : ""}`
        );

        if (!response.ok) {
          throw new Error(t("failedToFetchSellerInfo"));
        }

        const data = await response.json();
        setSellerInfo(data);
      } catch (err) {
        console.error("Error fetching seller info:", err);
        setError(
          err instanceof Error ? err.message : t("failedToLoadSellerInfo")
        );

        setSellerInfo({
          sellerName: sellerName || t("unknownSeller"),
          sellerAverageRating: 0,
          shopAverageRating: 0,
          sellerIsVerified: false,
          totalProductsSold: 0,
          totalReviews: 0,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSellerInfo();
  }, [sellerId, shopId, sellerName, t]);

  const handleSellerClick = useCallback(() => {
    if (isShop && shopId) {
      router.push(`/shop/${shopId}`);
    } else if (sellerId) {
      router.push(`/seller/${sellerId}/reviews`);
    }
  }, [isShop, shopId, sellerId, router]);

  if (isLoading || loading) {
    return <LoadingSkeleton isDarkMode={isDarkMode} />;
  }

  if (error && !sellerInfo) {
    return null;
  }

  if (!sellerInfo || !sellerId) {
    return null;
  }

  const displayName = isShop
    ? sellerName || sellerInfo.sellerName
    : sellerInfo.sellerName;

  const displayRating = isShop
    ? sellerInfo.shopAverageRating
    : sellerInfo.sellerAverageRating;

  const canNavigate = (isShop && shopId) || sellerId;

  return (
    <div className={`rounded-2xl p-6 border shadow-sm transition-all duration-200 hover:shadow-md ${
      isDarkMode 
        ? "bg-gray-800 border-gray-700" 
        : "bg-white border-gray-200"
    }`}>
      <button
        onClick={handleSellerClick}
        disabled={!canNavigate}
        className={`w-full group ${
          canNavigate 
            ? "cursor-pointer"
            : "cursor-default"
        }`}
      >
        <div className="flex items-center gap-4">
          {/* Seller Avatar/Icon */}
          <div className={`relative p-3 rounded-full transition-all duration-200 ${
            isDarkMode 
              ? "bg-gradient-to-br from-orange-900/20 to-orange-800/20 text-orange-400" 
              : "bg-gradient-to-br from-orange-100 to-orange-200 text-orange-600"
          } ${canNavigate ? "group-hover:scale-105" : ""}`}>
            {isShop ? (
              <Store className="w-6 h-6" />
            ) : (
              <User className="w-6 h-6" />
            )}
            
            {sellerInfo.sellerIsVerified && (
              <div className="absolute -top-1 -right-1 bg-blue-500 rounded-full p-1">
                <Verified className="w-3 h-3 text-white" fill="currentColor" />
              </div>
            )}
          </div>

          {/* Seller Info */}
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2 mb-1">
              <h4 className={`font-bold text-lg truncate ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}>
                {displayName || t("unknownSeller")}
              </h4>
              
              <span className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}>
                {isShop ? t("officialStore") : t("individualSeller")}
              </span>
            </div>

            {/* Rating and Stats */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className={`font-semibold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}>
                    {displayRating.toFixed(1)}
                  </span>
                </div>
                
                {sellerInfo.totalReviews > 0 && (
                  <span className={`${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}>
                    ({sellerInfo.totalReviews})
                  </span>
                )}
              </div>

              {sellerInfo.totalProductsSold > 0 && (
                <div className="flex items-center gap-1">
                  <Package className="w-3 h-3" />
                  <span className={`${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}>
                    {sellerInfo.totalProductsSold} {t("sold")}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Arrow Icon */}
          {canNavigate && (
            <div className={`transition-all duration-200 ${
              isDarkMode 
                ? "text-gray-400 group-hover:text-orange-400" 
                : "text-gray-400 group-hover:text-orange-600"
            } group-hover:translate-x-1`}>
              <ChevronRight className="w-5 h-5" />
            </div>
          )}
        </div>

        {/* Trust Indicators */}
        <div className="mt-4 flex items-center gap-3">
          <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
            isDarkMode 
              ? "bg-green-900/20 text-green-400 border border-green-800" 
              : "bg-green-50 text-green-700 border border-green-200"
          }`}>
            <Verified className="w-3 h-3" />
            {t("verified")} {isShop ? t("store") : t("seller")}
          </div>
          
          <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
            isDarkMode 
              ? "bg-blue-900/20 text-blue-400 border border-blue-800" 
              : "bg-blue-50 text-blue-700 border border-blue-200"
          }`}>
            <MessageCircle className="w-3 h-3" />
            {t("fastResponse")}
          </div>
        </div>
      </button>
    </div>
  );
};

export default ProductDetailSellerInfo;