// src/components/productdetail/ProductDetailReviewsTab.tsx

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Star,
  StarHalf,
  ThumbsUp,
  Languages,
  ChevronLeft,
  ChevronRight,
  X,
  MessageSquare,
  Shield,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

interface Review {
  id: string;
  rating: number;
  review: string;
  timestamp: string;
  imageUrls: string[];
  likes: string[];
  userId: string;
}

interface ProductDetailReviewsTabProps {
  productId: string;
  isLoading?: boolean;
  isDarkMode?: boolean;
  localization?: ReturnType<typeof useTranslations>;
}

interface ReviewTileProps {
  review: Review;
  onLike: (reviewId: string) => void;
  currentUserId?: string;
  isDarkMode?: boolean;
  t: (key: string) => string;
}

const StarRating: React.FC<{ rating: number; size?: number }> = ({
  rating,
  size = 16,
}) => {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: fullStars }, (_, i) => (
        <Star
          key={`full-${i}`}
          size={size}
          className="fill-amber-400 text-amber-400"
        />
      ))}
      {hasHalfStar && (
        <StarHalf size={size} className="fill-amber-400 text-amber-400" />
      )}
      {Array.from({ length: emptyStars }, (_, i) => (
        <Star key={`empty-${i}`} size={size} className="text-gray-300" />
      ))}
    </div>
  );
};

interface FullScreenImageModalProps {
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
  t: (key: string) => string;
}

const FullScreenImageModal: React.FC<FullScreenImageModalProps> = ({ 
  imageUrl, 
  isOpen, 
  onClose, 
  t 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center backdrop-blur-sm">
      <div className="relative max-w-full max-h-full p-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-3 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        <Image
          src={imageUrl}
          alt={t("reviewImage")}
          width={800}
          height={600}
          className="max-w-full max-h-full object-contain rounded-xl"
        />
      </div>
      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
};

const ReviewTile: React.FC<ReviewTileProps> = ({
  review,
  onLike,
  currentUserId,
  isDarkMode = false,
  t,
}) => {
  const [isTranslated, setIsTranslated] = useState(false);
  const [translatedText, setTranslatedText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);

  const isLiked = currentUserId ? review.likes.includes(currentUserId) : false;
  const likeCount = review.likes.length;
  const isLongReview = review.review.length > 150;

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  const handleTranslate = async () => {
    if (isTranslating) return;

    if (isTranslated) {
      setIsTranslated(false);
      return;
    }

    setIsTranslating(true);
    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: review.review,
          targetLanguage: navigator.language.split("-")[0],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setTranslatedText(data.translatedText);
        setIsTranslated(true);
      }
    } catch (error) {
      console.error("Translation error:", error);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleImageClick = (imageUrl: string) => {
    setSelectedImageUrl(imageUrl);
  };

  return (
    <>
      <div className={`group min-w-80 w-80 rounded-2xl p-5 border transition-all duration-300 hover:shadow-lg hover:scale-[1.02] ${
        isDarkMode 
          ? "bg-gradient-to-br from-gray-800 to-gray-850 border-gray-700 hover:border-orange-500" 
          : "bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:border-orange-300"
      }`}>
        {/* Header with rating, date, and verified badge */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <StarRating rating={review.rating} />
            <span className={`text-sm font-medium ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}>
              {formatDate(review.timestamp)}
            </span>
          </div>
          
          <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${
            isDarkMode ? "bg-green-900/20 text-green-400 border border-green-800" : "bg-green-50 text-green-700 border border-green-200"
          }`}>
            <Shield className="w-3 h-3" />
            <span className="text-xs font-medium">{t("verified")}</span>
          </div>
        </div>

        {/* Review images */}
        {review.imageUrls.length > 0 && (
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {review.imageUrls.slice(0, 4).map((imageUrl, index) => (
              <div
                key={index}
                className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden cursor-pointer hover:opacity-80 transition-all duration-200 hover:scale-105"
                onClick={() => handleImageClick(imageUrl)}
              >
                <Image
                  src={imageUrl}
                  alt={`${t("reviewImage")} ${index + 1}`}
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
            {review.imageUrls.length > 4 && (
              <div className={`flex-shrink-0 w-16 h-16 rounded-xl flex items-center justify-center border-2 border-dashed cursor-pointer hover:scale-105 transition-transform ${
                isDarkMode ? "border-gray-600 text-gray-400" : "border-gray-300 text-gray-500"
              }`}>
                <span className="text-xs font-medium">+{review.imageUrls.length - 4}</span>
              </div>
            )}
          </div>
        )}

        {/* Review text */}
        <div className="mb-4">
          <p className={`text-sm leading-relaxed ${isLongReview ? 'line-clamp-4' : ''} ${
            isDarkMode ? "text-gray-300" : "text-gray-700"
          }`}>
            {isTranslated ? translatedText : review.review}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Translation button */}
            <button
              onClick={handleTranslate}
              disabled={isTranslating}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 hover:scale-105 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-orange-400"
                  : "bg-gray-100 text-gray-600 hover:bg-orange-50 hover:text-orange-600"
              }`}
            >
              <Languages className="w-3 h-3" />
              {isTranslating
                ? t("translating")
                : isTranslated
                ? t("original")
                : t("translate")}
            </button>

            {/* Like button */}
            <button
              onClick={() => onLike(review.id)}
              className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200 hover:scale-105 ${
                isLiked
                  ? "bg-blue-50 text-blue-600 border border-blue-200"
                  : isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:bg-blue-900/20 hover:text-blue-400"
                  : "bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600"
              }`}
            >
              <ThumbsUp className={`w-3 h-3 ${isLiked ? "fill-blue-600" : ""}`} />
              {likeCount}
            </button>
          </div>

          {/* Read more link */}
          {isLongReview && (
            <button className={`text-xs font-semibold underline transition-colors ${
              isDarkMode
                ? "text-orange-400 hover:text-orange-300"
                : "text-orange-600 hover:text-orange-700"
            }`}>
              {t("readMore")}
            </button>
          )}
        </div>
      </div>

      {/* Full screen image modal */}
      <FullScreenImageModal
        imageUrl={selectedImageUrl || ""}
        isOpen={!!selectedImageUrl}
        onClose={() => setSelectedImageUrl(null)}
        isDarkMode={isDarkMode}
        t={t}
      />
    </>
  );
};

const LoadingSkeleton: React.FC<{ isDarkMode?: boolean }> = ({ 
  isDarkMode = false 
}) => (
  <div className={`rounded-2xl p-6 border shadow-sm ${
    isDarkMode 
      ? "bg-gray-800 border-gray-700" 
      : "bg-white border-gray-200"
  }`}>
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`} />
          <div className={`w-32 h-6 rounded animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`} />
        </div>
        <div className={`w-24 h-8 rounded-xl animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`} />
      </div>

      {/* Reviews skeleton */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className={`min-w-80 w-80 h-48 rounded-2xl animate-pulse ${
              isDarkMode ? "bg-gray-700" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  </div>
);

const ProductDetailReviewsTab: React.FC<ProductDetailReviewsTabProps> = ({
  productId,
  isLoading = false,
  isDarkMode = false,
  localization,
}) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalReviewCount, setTotalReviewCount] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ✅ FIXED: Proper nested translation function that uses JSON files
  const t = useCallback((key: string) => {
    if (!localization) {
      return key;
    }

    try {
      // Try to get the nested ProductDetailReviewsTab translation
      const translation = localization(`ProductDetailReviewsTab.${key}`);
      
      // Check if we got a valid translation (not the same as the key we requested)
      if (translation && translation !== `ProductDetailReviewsTab.${key}`) {
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

  const checkScrollPosition = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  const scrollLeft = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -350, behavior: "smooth" });
    }
  }, []);

  const scrollRight = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 350, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      checkScrollPosition();
      container.addEventListener("scroll", checkScrollPosition);
      return () => container.removeEventListener("scroll", checkScrollPosition);
    }
  }, [reviews, checkScrollPosition]);

  useEffect(() => {
    const fetchReviews = async () => {
      if (!productId) return;

      try {
        setLoading(true);

        const response = await fetch(`/api/reviews/${productId}`);
        if (!response.ok) {
          throw new Error(t("failedToFetchReviews"));
        }

        const data = await response.json();
        setReviews(data.reviews || []);
        setTotalReviewCount(data.totalCount || 0);
      } catch (error) {
        console.error("Error fetching reviews:", error);
        setReviews([]);
        setTotalReviewCount(0);
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, [productId, t]);

  const handleLike = useCallback(async (reviewId: string) => {
    try {
      const response = await fetch("/api/reviews/toggle-like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, productId }),
      });

      if (response.ok) {
        setReviews((prev) =>
          prev.map((review) => {
            if (review.id === reviewId) {
              const currentUserId = "current-user";
              const isLiked = review.likes.includes(currentUserId);
              return {
                ...review,
                likes: isLiked
                  ? review.likes.filter((id) => id !== currentUserId)
                  : [...review.likes, currentUserId],
              };
            }
            return review;
          })
        );
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  }, [productId]);

  const handleSeeAllReviews = useCallback(() => {
    // Using Next.js router would be better, but if not available:
    window.location.href = `/all-reviews?productId=${productId}`;
  }, [productId]);

  if (isLoading || loading) {
    return <LoadingSkeleton isDarkMode={isDarkMode} />;
  }

  if (totalReviewCount === 0) {
    return null;
  }

  return (
    <div className={`rounded-2xl p-6 border shadow-sm ${
      isDarkMode 
        ? "bg-gray-800 border-gray-700" 
        : "bg-white border-gray-200"
    }`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${
              isDarkMode 
                ? "bg-orange-900/20 text-orange-400" 
                : "bg-orange-100 text-orange-600"
            }`}>
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-xl font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}>
                {t("title")}
              </h3>
              <p className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}>
                {totalReviewCount} {t("verifiedReviews")}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleSeeAllReviews}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-105 ${
              isDarkMode
                ? "bg-orange-900/20 text-orange-400 hover:bg-orange-900/30 border border-orange-700"
                : "bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200"
            }`}
          >
            {t("viewAll")} ({totalReviewCount})
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Reviews horizontal scroll with navigation */}
        <div className="relative group">
          {/* Left scroll button */}
          {canScrollLeft && (
            <button
              onClick={scrollLeft}
              className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 shadow-xl rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400 border border-gray-600"
                  : "bg-white text-gray-600 hover:text-orange-600 border border-gray-200"
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Right scroll button */}
          {canScrollRight && (
            <button
              onClick={scrollRight}
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 shadow-xl rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400 border border-gray-600"
                  : "bg-white text-gray-600 hover:text-orange-600 border border-gray-200"
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* Scrollable container */}
          <div
            ref={scrollContainerRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 scroll-smooth [&::-webkit-scrollbar]:hidden"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {reviews.map((review) => (
              <ReviewTile
                key={review.id}
                review={review}
                onLike={handleLike}
                currentUserId="current-user"
                isDarkMode={isDarkMode}
                t={t}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailReviewsTab;