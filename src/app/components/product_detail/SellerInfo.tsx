// src/components/productdetail/ProductDetailSellerInfo.tsx

import React, { useState, useEffect } from "react";
import { ChevronRight, Verified } from "lucide-react";
import { useRouter } from "next/navigation";

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
}

const LoadingSkeleton: React.FC<{ isDarkMode?: boolean }> = ({ 
  isDarkMode = false 
}) => (
  <div className={`w-full shadow-sm border-b ${
    isDarkMode 
      ? "bg-gray-800 border-gray-700" 
      : "bg-white border-gray-100"
  }`}>
    <div className="p-4">
      <div className={`rounded-lg p-3 ${
        isDarkMode ? "bg-gray-700" : "bg-gray-100"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-24 h-4 rounded animate-pulse ${
              isDarkMode ? "bg-gray-600" : "bg-gray-200"
            }`} />
            <div className={`w-12 h-6 rounded animate-pulse ${
              isDarkMode ? "bg-gray-600" : "bg-gray-200"
            }`} />
          </div>
          <div className={`w-4 h-4 rounded animate-pulse ${
            isDarkMode ? "bg-gray-600" : "bg-gray-200"
          }`} />
        </div>
      </div>
    </div>
  </div>
);

const ProductDetailSellerInfo: React.FC<ProductDetailSellerInfoProps> = ({
  sellerId,
  sellerName,
  shopId,
  isLoading = false,
  isDarkMode = false,
}) => {
  const router = useRouter();
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        // Fetch seller information
        const response = await fetch(
          `/api/seller/${sellerId}${shopId ? `?shopId=${shopId}` : ""}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch seller info");
        }

        const data = await response.json();
        setSellerInfo(data);
      } catch (err) {
        console.error("Error fetching seller info:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load seller info"
        );

        // Fallback to basic info
        setSellerInfo({
          sellerName: sellerName || "Unknown Seller",
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
  }, [sellerId, shopId, sellerName]);

  const handleSellerClick = () => {
    if (isShop && shopId) {
      // Navigate to shop detail page
      router.push(`/shop/${shopId}`);
    } else if (sellerId) {
      // Navigate to seller reviews page
      router.push(`/seller/${sellerId}/reviews`);
    }
  };

  if (isLoading || loading) {
    return <LoadingSkeleton isDarkMode={isDarkMode} />;
  }

  if (error && !sellerInfo) {
    return null; // Hide component if there's an error and no fallback data
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
    <div className={`w-full shadow-sm border-b ${
      isDarkMode 
        ? "bg-gray-800 border-gray-700" 
        : "bg-white border-gray-100"
    }`}>
      <div className="p-4">
        <div className={`rounded-lg p-3 ${
          isDarkMode ? "bg-gray-700" : "bg-gray-50"
        }`}>
          <button
            onClick={handleSellerClick}
            disabled={!canNavigate}
            className={`w-full transition-colors rounded-lg ${
              canNavigate 
                ? isDarkMode 
                  ? "hover:bg-gray-600" 
                  : "hover:bg-gray-100"
                : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Seller name and verification */}
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold truncate ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}>
                    {displayName || "Unknown Seller"}
                  </span>

                  {sellerInfo.sellerIsVerified && (
                    <div className="flex-shrink-0">
                      <Verified
                        className="w-4 h-4 text-blue-500"
                        fill="currentColor"
                      />
                    </div>
                  )}
                </div>

                {/* Rating badge */}
                <div className="flex-shrink-0 px-2 py-1 bg-green-500 rounded text-white text-xs font-bold">
                  {displayRating.toFixed(1)}
                </div>
              </div>

              {/* Arrow icon */}
              {canNavigate && (
                <ChevronRight className={`w-4 h-4 flex-shrink-0 ${
                  isDarkMode ? "text-gray-400" : "text-gray-400"
                }`} />
              )}
            </div>

            {/* Additional info row */}
            {(sellerInfo.totalProductsSold > 0 ||
              sellerInfo.totalReviews > 0) && (
              <div className={`flex items-center gap-4 mt-2 text-xs ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}>
                {sellerInfo.totalProductsSold > 0 && (
                  <span>{sellerInfo.totalProductsSold} products sold</span>
                )}
                {sellerInfo.totalReviews > 0 && (
                  <span>{sellerInfo.totalReviews} reviews</span>
                )}
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailSellerInfo;