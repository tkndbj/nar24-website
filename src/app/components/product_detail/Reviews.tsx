// src/components/productdetail/ProductDetailReviewsTab.tsx

import React, { useState, useEffect, useRef } from "react";
import {
  Star,
  StarHalf,
  ThumbsUp,
  Languages,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import Image from "next/image";

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
}

interface ReviewTileProps {
  review: Review;
  onLike: (reviewId: string) => void;
  currentUserId?: string;
  isDarkMode?: boolean;
}

const StarRating: React.FC<{ rating: number; size?: number }> = ({
  rating,
  size = 14,
}) => {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <div className="flex items-center">
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
        <Star key={`empty-${i}`} size={size} className="text-amber-400" />
      ))}
    </div>
  );
};

const FullScreenImageModal: React.FC<{
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}> = ({ imageUrl, isOpen, onClose, isDarkMode = false }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center">
      <div className="relative max-w-full max-h-full">
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 z-10 p-2 rounded-full text-white transition-colors ${
            isDarkMode 
              ? "bg-gray-800 bg-opacity-80 hover:bg-opacity-90" 
              : "bg-black bg-opacity-50 hover:bg-opacity-70"
          }`}
        >
          <X className="w-6 h-6" />
        </button>
        <Image
          src={imageUrl}
          alt="Review image"
          width={800}
          height={600}
          className="max-w-full max-h-full object-contain"
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
      // Mock translation - replace with actual translation service
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
      <div className={`min-w-80 w-80 rounded-lg p-4 border ${
        isDarkMode 
          ? "bg-gray-800 border-gray-700" 
          : "bg-gray-50 border-gray-200"
      }`}>
        {/* Header with rating, date, and badge */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <StarRating rating={review.rating} />
            <span className={`text-sm ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}>
              {formatDate(review.timestamp)}
            </span>
          </div>
          <div className={`px-2 py-1 rounded-full ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`}>
            <span className={`text-xs font-medium ${
              isDarkMode ? "text-gray-300" : "text-gray-600"
            }`}>
              Verified Purchase
            </span>
          </div>
        </div>

        {/* Review images */}
        {review.imageUrls.length > 0 && (
          <div className="flex gap-2 mb-3 overflow-x-auto">
            {review.imageUrls.slice(0, 3).map((imageUrl, index) => (
              <div
                key={index}
                className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => handleImageClick(imageUrl)}
              >
                <Image
                  src={imageUrl}
                  alt={`Review image ${index + 1}`}
                  width={64}
                  height={64}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {/* Review text */}
        <p className={`text-sm mb-3 line-clamp-3 ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}>
          {isTranslated ? translatedText : review.review}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4">
            {/* Translation button */}
            <button
              onClick={handleTranslate}
              disabled={isTranslating}
              className={`flex items-center gap-1 text-xs transition-colors ${
                isDarkMode
                  ? "text-gray-400 hover:text-gray-200"
                  : "text-gray-600 hover:text-gray-800"
              }`}
            >
              <Languages className="w-3 h-3" />
              {isTranslating
                ? "Translating..."
                : isTranslated
                ? "Original"
                : "Translate"}
            </button>

            {/* Like button */}
            <button
              onClick={() => onLike(review.id)}
              className={`flex items-center gap-1 text-xs transition-colors ${
                isLiked
                  ? "text-blue-600"
                  : isDarkMode
                  ? "text-gray-400 hover:text-blue-400"
                  : "text-gray-600 hover:text-blue-600"
              }`}
            >
              <ThumbsUp
                className={`w-3 h-3 ${
                  isLiked ? "fill-blue-600 text-blue-600" : ""
                }`}
              />
              {likeCount}
            </button>
          </div>

          {/* Read all link */}
          {isLongReview && (
            <button className={`text-xs underline transition-colors ${
              isDarkMode
                ? "text-gray-400 hover:text-gray-200"
                : "text-gray-600 hover:text-gray-800"
            }`}>
              Read All
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
      />
    </>
  );
};

const LoadingSkeleton: React.FC<{ isDarkMode?: boolean }> = ({ 
  isDarkMode = false 
}) => (
  <div className={`w-full shadow-sm border-b ${
    isDarkMode 
      ? "bg-gray-800 border-gray-700" 
      : "bg-white border-gray-100"
  }`}>
    <div className="p-4 space-y-4">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className={`w-20 h-5 rounded animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`} />
        <div className={`w-24 h-4 rounded animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`} />
      </div>

      {/* Reviews skeleton */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className={`min-w-80 w-80 h-40 rounded-lg animate-pulse ${
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
}) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalReviewCount, setTotalReviewCount] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const checkScrollPosition = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -340, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 340, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      checkScrollPosition();
      container.addEventListener("scroll", checkScrollPosition);
      return () => container.removeEventListener("scroll", checkScrollPosition);
    }
  }, [reviews]);

  useEffect(() => {
    const fetchReviews = async () => {
      if (!productId) return;

      try {
        setLoading(true);

        const response = await fetch(`/api/reviews/${productId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch reviews");
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
  }, [productId]);

  const handleLike = async (reviewId: string) => {
    try {
      const response = await fetch("/api/reviews/toggle-like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, productId }),
      });

      if (response.ok) {
        // Update local state
        setReviews((prev) =>
          prev.map((review) => {
            if (review.id === reviewId) {
              const currentUserId = "current-user"; // Get from auth context
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
  };

  const handleSeeAllReviews = () => {
    // Navigate to all reviews page
    window.location.href = `/reviews/${productId}`;
  };

  if (isLoading || loading) {
    return <LoadingSkeleton isDarkMode={isDarkMode} />;
  }

  if (totalReviewCount === 0) {
    return null;
  }

  return (
    <div className={`w-full shadow-sm border-b ${
      isDarkMode 
        ? "bg-gray-800 border-gray-700" 
        : "bg-white border-gray-100"
    }`}>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h3 className={`text-lg font-bold ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}>
            Reviews
          </h3>
          <button
            onClick={handleSeeAllReviews}
            className={`text-sm font-bold transition-colors ${
              isDarkMode
                ? "text-orange-400 hover:text-orange-300"
                : "text-orange-600 hover:text-orange-700"
            }`}
          >
            See All ({totalReviewCount})
          </button>
        </div>

        {/* Reviews horizontal scroll with navigation */}
        <div className="relative group">
          {/* Left scroll button */}
          {canScrollLeft && (
            <button
              onClick={scrollLeft}
              className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 shadow-lg rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400"
                  : "bg-white text-gray-600 hover:text-orange-600"
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Right scroll button */}
          {canScrollRight && (
            <button
              onClick={scrollRight}
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 shadow-lg rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400"
                  : "bg-white text-gray-600 hover:text-orange-600"
              }`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* Scrollable container */}
          <div
            ref={scrollContainerRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 scroll-smooth"
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
                currentUserId="current-user" // Get from auth context
                isDarkMode={isDarkMode}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailReviewsTab;