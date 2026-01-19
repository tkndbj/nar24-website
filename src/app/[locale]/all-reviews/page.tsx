// src/app/[locale]/all-reviews/page.tsx

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  ArrowLeft,
  Star,
  StarHalf,
  ThumbsUp,
  Languages,
  
  Camera,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  
  Award,
} from "lucide-react";
import Image from "next/image";
import { format } from "date-fns";
import { useUser } from "@/context/UserProvider";
import translationService, {
  RateLimitException,
  TranslationException,
} from "@/services/translation_service";

interface Review {
  id: string;
  productId: string;
  userId: string;
  userName?: string;
  userImage?: string;
  rating: number;
  review: string;
  imageUrls?: string[];
  timestamp: Date;
  likes: string[];
  helpful?: number;
  verified?: boolean;
  sellerResponse?: string;
  sellerResponseDate?: Date;
}

interface ProductInfo {
  id: string;
  name: string;
  averageRating: number;
  totalReviews: number;
}

interface AllReviewsPageProps {
  params: Promise<{ locale: string }>;
}

const AllReviewsPage: React.FC<AllReviewsPageProps> = ({ }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const localization = useTranslations();
  const locale = useLocale();
  const { user } = useUser();

  // Extract query parameters - use URL as source of truth for server-side filtering
  const productId = searchParams.get("productId") || "";
  const sortBy = (searchParams.get("sortBy") as "recent" | "helpful" | "rating") || "recent";
  const filterRatingParam = searchParams.get("rating");
  const filterRating = filterRatingParam ? parseInt(filterRatingParam, 10) : null;

  // States
  const [reviews, setReviews] = useState<Review[]>([]);
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDocId, setLastDocId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [translatedReviews, setTranslatedReviews] = useState<Record<string, string>>({});
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [translationError, setTranslationError] = useState<string | null>(null);

  const [imageGallery, setImageGallery] = useState<{ urls: string[], index: number } | null>(null);

  // Set up translation service with current user
  useEffect(() => {
    translationService.setUser(user);
  }, [user]);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isFetchingRef = useRef(false);

  const PAGE_SIZE = 20;

  // Translation helper
  const t = useCallback((key: string) => {
    try {
      return localization(`AllReviewsPage.${key}`);
    } catch {
      return localization(key);
    }
  }, [localization]);

  // URL update helpers for server-side filtering
  const updateFilters = useCallback((newSortBy?: string, newRating?: number | null) => {
    const params = new URLSearchParams(searchParams.toString());

    if (newSortBy !== undefined) {
      if (newSortBy === "recent") {
        params.delete("sortBy"); // "recent" is the default, no need to include in URL
      } else {
        params.set("sortBy", newSortBy);
      }
    }

    if (newRating !== undefined) {
      if (newRating === null) {
        params.delete("rating");
      } else {
        params.set("rating", newRating.toString());
      }
    }

    router.replace(`/${locale}/all-reviews?${params.toString()}`, { scroll: false });
  }, [searchParams, router, locale]);

  const handleSortChange = useCallback((newSortBy: "recent" | "helpful" | "rating") => {
    updateFilters(newSortBy, undefined);
  }, [updateFilters]);

  const handleRatingFilter = useCallback((rating: number) => {
    // Toggle: if same rating is clicked, clear the filter
    const newRating = filterRating === rating ? null : rating;
    updateFilters(undefined, newRating);
  }, [updateFilters, filterRating]);

  // Dark mode detection - only check document class (app's theme preference)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const detectDarkMode = () => {
      // Only check the document class - this is managed by the app's theme toggle
      const isDark = document.documentElement.classList.contains("dark");
      setIsDarkMode(isDark);
    };

    detectDarkMode();

    const observer = new MutationObserver(detectDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  // Fetch product info
  useEffect(() => {
    const fetchProductInfo = async () => {
      if (!productId) return;

      try {
        const response = await fetch(`/api/products/${productId}`);
        if (response.ok) {
          const data = await response.json();
          setProductInfo({
            id: data.id,
            name: data.productName,
            averageRating: data.averageRating || 0,
            totalReviews: data.totalReviews || 0,
          });
        }
      } catch (error) {
        console.error("Error fetching product info:", error);
      }
    };

    fetchProductInfo();
  }, [productId]);

  // Initial fetch and refetch on filter change
  useEffect(() => {
    if (!productId) return;

    // Abort any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const fetchInitialReviews = async () => {
      isFetchingRef.current = true;
      setIsLoading(true);
      setReviews([]);
      setLastDocId(null);
      setHasMore(true);

      try {
        const params = new URLSearchParams({
          limit: PAGE_SIZE.toString(),
          sortBy,
        });

        if (filterRating) {
          params.append("rating", filterRating.toString());
        }

        const response = await fetch(`/api/reviews/${productId}?${params}`, {
          signal: abortController.signal,
        });

        if (!response.ok) throw new Error("Failed to fetch reviews");

        const data = await response.json();
        const newReviews = data.reviews.map((r: Review) => ({
          ...r,
          timestamp: new Date(r.timestamp),
          sellerResponseDate: r.sellerResponseDate ? new Date(r.sellerResponseDate) : undefined,
        }));

        // Only update state if this request wasn't aborted
        if (!abortController.signal.aborted) {
          setReviews(newReviews);
          setHasMore(newReviews.length === PAGE_SIZE);
          if (newReviews.length > 0) {
            setLastDocId(newReviews[newReviews.length - 1].id);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          // Request was aborted, ignore
          return;
        }
        console.error("Error fetching reviews:", error);
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
          isFetchingRef.current = false;
        }
      }
    };

    fetchInitialReviews();

    return () => {
      abortController.abort();
    };
  }, [productId, sortBy, filterRating]);

  // Load more reviews (for infinite scroll)
  const loadMoreReviews = useCallback(async () => {
    if (!productId || !hasMore || isLoadingMore || isFetchingRef.current) return;

    setIsLoadingMore(true);

    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
        sortBy,
      });

      if (filterRating) {
        params.append("rating", filterRating.toString());
      }

      if (lastDocId) {
        params.append("lastDocId", lastDocId);
      }

      const response = await fetch(`/api/reviews/${productId}?${params}`);

      if (!response.ok) throw new Error("Failed to fetch reviews");

      const data = await response.json();
      const newReviews = data.reviews.map((r: Review) => ({
        ...r,
        timestamp: new Date(r.timestamp),
        sellerResponseDate: r.sellerResponseDate ? new Date(r.sellerResponseDate) : undefined,
      }));

      setReviews(prev => [...prev, ...newReviews]);
      setHasMore(newReviews.length === PAGE_SIZE);

      if (newReviews.length > 0) {
        setLastDocId(newReviews[newReviews.length - 1].id);
      }
    } catch (error) {
      console.error("Error loading more reviews:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [productId, sortBy, filterRating, lastDocId, hasMore, isLoadingMore]);

  // Infinite scroll observer
  useEffect(() => {
    const trigger = loadMoreTriggerRef.current;
    if (!trigger) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore && !isLoadingMore && !isFetchingRef.current) {
          loadMoreReviews();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observerRef.current.observe(trigger);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoadingMore, loadMoreReviews]);

  // Toggle like
  const toggleLike = useCallback(async (reviewId: string) => {
    if (!user) {
      router.push("/login");
      return;
    }

    // Store previous state for rollback
    const previousReviews = reviews;

    // Optimistic update
    setReviews(prev => prev.map(review => {
      if (review.id === reviewId) {
        const likes = [...review.likes];
        const userIndex = likes.indexOf(user.uid);

        if (userIndex > -1) {
          likes.splice(userIndex, 1);
        } else {
          likes.push(user.uid);
        }

        return { ...review, likes };
      }
      return review;
    }));

    // API call
    try {
      await fetch("/api/reviews/toggle-like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, userId: user.uid }),
      });
    } catch (error) {
      console.error("Error toggling like:", error);
      // Revert optimistic update on error
      setReviews(previousReviews);
    }
  }, [user, router, reviews]);

  // Translate review
  const translateReview = useCallback(async (reviewId: string, text: string) => {
    if (translatedReviews[reviewId]) {
      // Toggle off translation
      setTranslatedReviews(prev => {
        const newTranslations = { ...prev };
        delete newTranslations[reviewId];
        return newTranslations;
      });
      setTranslationError(null);
      return;
    }

    // Check if user is authenticated
    if (!user) {
      setTranslationError(t("loginRequired"));
      return;
    }

    setTranslatingIds(prev => new Set(prev).add(reviewId));
    setTranslationError(null);

    try {
      const translatedText = await translationService.translate(text, locale);

      if (translatedText) {
        setTranslatedReviews(prev => ({ ...prev, [reviewId]: translatedText }));
      }
    } catch (error) {
      console.error("Error translating review:", error);
      if (error instanceof RateLimitException) {
        setTranslationError(t("rateLimitExceeded"));
      } else if (error instanceof TranslationException) {
        setTranslationError(error.message || t("translationFailed"));
      } else {
        setTranslationError(t("translationFailed"));
      }
    } finally {
      setTranslatingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(reviewId);
        return newSet;
      });
    }
  }, [translatedReviews, locale, user, t]);

  // Rating statistics
  const ratingStats = React.useMemo(() => {
    const stats = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(review => {
      const rating = Math.floor(review.rating);
      if (rating >= 1 && rating <= 5) {
        stats[rating as keyof typeof stats]++;
      }
    });
    return stats;
  }, [reviews]);

  // Colors
  const colors = {
    background: isDarkMode ? "bg-gray-900" : "bg-gray-50",
    containerBg: isDarkMode ? "bg-gray-800" : "bg-white",
    cardBg: isDarkMode ? "bg-gray-700" : "bg-gray-100",
    border: isDarkMode ? "border-gray-700" : "border-gray-200",
    text: isDarkMode ? "text-gray-100" : "text-gray-900",
    textSecondary: isDarkMode ? "text-gray-400" : "text-gray-600",
    hover: isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100",
  };

  // Star rating component
  const StarRating = ({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating - fullStars >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    const starSize = size === "lg" ? "w-6 h-6" : "w-4 h-4";

    return (
      <div className="flex items-center gap-0.5">
        {[...Array(fullStars)].map((_, i) => (
          <Star key={`full-${i}`} className={`${starSize} fill-yellow-400 text-yellow-400`} />
        ))}
        {hasHalfStar && <StarHalf className={`${starSize} fill-yellow-400 text-yellow-400`} />}
        {[...Array(emptyStars)].map((_, i) => (
          <Star key={`empty-${i}`} className={`${starSize} text-gray-300`} />
        ))}
      </div>
    );
  };

  // Review card component
  const ReviewCard = ({ review }: { review: Review }) => {
    const isLiked = user && review.likes.includes(user.uid);
    const isTranslated = !!translatedReviews[review.id];
    const isTranslating = translatingIds.has(review.id);
    const displayText = isTranslated ? translatedReviews[review.id] : review.review;

    return (
      <div className={`${colors.containerBg} rounded-lg md:rounded-xl shadow-sm border ${colors.border} overflow-hidden`}>
        <div className="p-3 md:p-6 space-y-2.5 md:space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2 md:gap-3">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full overflow-hidden bg-gradient-to-br from-orange-400 to-orange-600 flex-shrink-0">
                {review.userImage ? (
                  <Image
                    src={review.userImage}
                    alt={review.userName || "User"}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white font-semibold text-sm md:text-base">
                    {(review.userName || "U")[0].toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                  <p className={`font-semibold text-sm md:text-base ${colors.text}`}>
                    {review.userName || t("anonymous")}
                  </p>
                  {review.verified && (
                    <span className="px-1.5 py-0.5 md:px-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] md:text-xs rounded-full flex items-center gap-0.5 md:gap-1">
                      <Award className="w-2.5 h-2.5 md:w-3 md:h-3" />
                      {t("verifiedPurchase")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 md:gap-3 mt-0.5 md:mt-1">
                  <StarRating rating={review.rating} />
                  <span className={`text-xs md:text-sm ${colors.textSecondary}`}>
                    {format(review.timestamp, "MMM dd, yyyy")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Review text */}
          <p className={`${colors.text} text-sm md:text-base leading-relaxed whitespace-pre-wrap`}>
            {displayText}
          </p>

          {/* Images */}
          {review.imageUrls && review.imageUrls.length > 0 && (
            <div className="flex gap-1.5 md:gap-2 overflow-x-auto py-1 md:py-2">
              {review.imageUrls.map((url, index) => (
                <button
                  key={index}
                  onClick={() => setImageGallery({ urls: review.imageUrls!, index })}
                  className="relative w-20 h-20 md:w-24 md:h-24 rounded-lg overflow-hidden flex-shrink-0 border-2 border-transparent hover:border-orange-500 transition-colors"
                >
                  <Image
                    src={url}
                    alt={`Review image ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                  {review.imageUrls!.length > 1 && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
                      <Camera className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Seller response */}
          {review.sellerResponse && (
            <div className={`${colors.cardBg} rounded-lg p-2.5 md:p-4 border-l-4 border-orange-500`}>
              <div className="flex items-center gap-1.5 md:gap-2 mb-1 md:mb-2">
                <span className="text-xs md:text-sm font-semibold text-orange-600">
                  {t("sellerResponse")}
                </span>
                {review.sellerResponseDate && (
                  <span className={`text-[10px] md:text-xs ${colors.textSecondary}`}>
                    {format(review.sellerResponseDate, "MMM dd, yyyy")}
                  </span>
                )}
              </div>
              <p className={`${colors.text} text-xs md:text-sm`}>{review.sellerResponse}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1 md:pt-2">
            <div className="flex items-center gap-3 md:gap-4">
              <button
                onClick={() => translateReview(review.id, review.review)}
                disabled={isTranslating}
                className={`flex items-center gap-1 md:gap-1.5 text-xs md:text-sm ${colors.textSecondary} hover:text-orange-600 transition-colors`}
              >
                {isTranslating ? (
                  <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin" />
                ) : (
                  <Languages className="w-3.5 h-3.5 md:w-4 md:h-4" />
                )}
                <span>{isTranslated ? t("original") : t("translate")}</span>
              </button>

              <button
                onClick={() => toggleLike(review.id)}
                className={`flex items-center gap-1 md:gap-1.5 text-xs md:text-sm transition-colors ${
                  isLiked ? "text-blue-600" : colors.textSecondary
                } hover:text-blue-600`}
              >
                <ThumbsUp className={`w-3.5 h-3.5 md:w-4 md:h-4 ${isLiked ? "fill-current" : ""}`} />
                <span>{review.likes.length}</span>
              </button>
            </div>

            {review.helpful !== undefined && (
              <span className={`text-xs md:text-sm ${colors.textSecondary}`}>
                {t("helpful")} {review.helpful}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Loading skeleton
  const LoadingSkeleton = () => (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className={`${colors.containerBg} rounded-xl p-6 space-y-4 animate-pulse`}>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-full ${colors.cardBg}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-4 ${colors.cardBg} rounded w-32`} />
              <div className={`h-3 ${colors.cardBg} rounded w-24`} />
            </div>
          </div>
          <div className={`h-20 ${colors.cardBg} rounded`} />
          <div className="flex gap-4">
            <div className={`h-3 ${colors.cardBg} rounded w-20`} />
            <div className={`h-3 ${colors.cardBg} rounded w-16`} />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className={`min-h-screen ${colors.background}`}>
      {/* Header */}
      <div className={`sticky top-0 z-20 ${colors.containerBg} border-b ${colors.border} backdrop-blur-md bg-opacity-95`}>
        <div className="px-2 py-2 md:px-4 md:py-3">
          <div className="flex items-center justify-between max-w-6xl mx-auto">
            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={() => router.back()}
                className={`p-1.5 md:p-2 rounded-lg transition-colors ${colors.hover}`}
              >
                <ArrowLeft className={`w-5 h-5 ${colors.text}`} />
              </button>
              <h1 className={`text-base md:text-lg font-semibold ${colors.text}`}>
                {t("allReviews")}
              </h1>
            </div>

            {productInfo && (
              <div className="flex items-center gap-1.5 md:gap-2">
                <StarRating rating={productInfo.averageRating} />
                <span className={`text-xs md:text-sm ${colors.text}`}>
                  {productInfo.averageRating.toFixed(1)}
                </span>
                <span className={`text-xs md:text-sm ${colors.textSecondary}`}>
                  ({productInfo.totalReviews})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="px-2 py-1.5 md:px-4 md:py-2 border-t border-gray-200 dark:border-gray-700">
          <div className="max-w-6xl mx-auto flex gap-1.5 md:gap-2 overflow-x-auto">
            {/* Sort buttons */}
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value as "recent" | "helpful" | "rating")}
              className={`px-2 py-1 md:px-3 md:py-1.5 rounded-lg text-xs md:text-sm ${colors.cardBg} ${colors.text} border ${colors.border}`}
            >
              <option value="recent">{t("sortRecent")}</option>
              <option value="helpful">{t("sortHelpful")}</option>
              <option value="rating">{t("sortRating")}</option>
            </select>

            {/* Rating filter */}
            <div className="flex gap-0.5 md:gap-1">
              {[5, 4, 3, 2, 1].map((rating) => (
                <button
                  key={rating}
                  onClick={() => handleRatingFilter(rating)}
                  className={`px-2 py-1 md:px-3 md:py-1.5 rounded-lg text-xs md:text-sm flex items-center gap-0.5 md:gap-1 transition-colors ${
                    filterRating === rating
                      ? "bg-orange-600 text-white"
                      : `${colors.cardBg} ${colors.text} hover:bg-orange-100 dark:hover:bg-orange-900/20`
                  }`}
                >
                  <Star className="w-2.5 h-2.5 md:w-3 md:h-3 fill-current" />
                  {rating}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-2 py-2 md:p-4">
        {isLoading ? (
          <LoadingSkeleton />
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 md:py-20">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3 md:mb-4">
              <Star className="w-10 h-10 md:w-12 md:h-12 text-gray-400" />
            </div>
            <h2 className={`text-lg md:text-xl font-semibold mb-2 ${colors.text}`}>
              {t("noReviewsYet")}
            </h2>
            <p className={`text-center text-sm md:text-base ${colors.textSecondary}`}>
              {t("beFirstToReview")}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5 md:space-y-4">
            {/* Rating summary */}
            {productInfo && reviews.length > 0 && (
              <div className={`${colors.containerBg} rounded-lg md:rounded-xl p-3 md:p-6 border ${colors.border}`}>
                <h3 className={`font-semibold text-sm md:text-base mb-2.5 md:mb-4 ${colors.text}`}>
                  {t("ratingBreakdown")}
                </h3>
                <div className="space-y-1.5 md:space-y-2">
                  {[5, 4, 3, 2, 1].map((rating) => {
                    const count = ratingStats[rating as keyof typeof ratingStats];
                    const percentage = (count / reviews.length) * 100;

                    return (
                      <div key={rating} className="flex items-center gap-2 md:gap-3">
                        <div className="flex items-center gap-0.5 md:gap-1 w-9 md:w-12">
                          <span className={`text-xs md:text-sm ${colors.text}`}>{rating}</span>
                          <Star className="w-2.5 h-2.5 md:w-3 md:h-3 fill-yellow-400 text-yellow-400" />
                        </div>
                        <div className="flex-1 h-1.5 md:h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className={`text-xs md:text-sm ${colors.textSecondary} w-8 md:w-12 text-right`}>
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reviews list */}
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}

            {/* Load more trigger */}
            {hasMore && (
              <div ref={loadMoreTriggerRef} className="py-4 md:py-8 flex justify-center">
                {isLoadingMore && (
                  <div className="flex items-center gap-2 text-orange-600">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">{t("loadingMore")}</span>
                  </div>
                )}
              </div>
            )}

            {!hasMore && reviews.length > 0 && (
              <div className="py-4 md:py-8 text-center">
                <p className={`${colors.textSecondary} text-sm`}>
                  {t("allReviewsLoaded")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image gallery modal */}
      {imageGallery && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
          <button
            onClick={() => setImageGallery(null)}
            className="absolute top-4 right-4 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          {imageGallery.index > 0 && (
            <button
              onClick={() => setImageGallery({ ...imageGallery, index: imageGallery.index - 1 })}
              className="absolute left-4 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          <div className="relative w-full max-w-4xl aspect-square">
            <Image
              src={imageGallery.urls[imageGallery.index]}
              alt={`Review image ${imageGallery.index + 1}`}
              fill
              className="object-contain"
            />
          </div>

          {imageGallery.index < imageGallery.urls.length - 1 && (
            <button
              onClick={() => setImageGallery({ ...imageGallery, index: imageGallery.index + 1 })}
              className="absolute right-4 p-2 bg-black/50 rounded-full text-white hover:bg-black/70 transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
            {imageGallery.urls.map((_, index) => (
              <button
                key={index}
                onClick={() => setImageGallery({ ...imageGallery, index })}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === imageGallery.index ? "bg-white" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AllReviewsPage;