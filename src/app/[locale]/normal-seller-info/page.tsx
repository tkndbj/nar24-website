"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Star,
  StarHalf,
  User,
  Flag,
  ThumbsUp,
  Languages,
  Package,
  UserX,
  FileWarning,
  Truck,
  X,
  Verified,
  ExternalLink,
  Loader2,
} from "lucide-react";
import Link from "next/link";

interface Review {
  reviewId: string;
  rating: number;
  review: string;
  timestamp: Timestamp | number | null;
  likes: string[];
}

interface SellerData {
  displayName: string;
  profileImage?: string;
  isVerified?: boolean;
}

export default function SellerInfoPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations();
  const sellerId = params?.sellerId as string;

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sellerData, setSellerData] = useState<SellerData | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Theme detection
  useEffect(() => {
    const updateTheme = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // Fetch seller info
  const fetchSellerInfo = useCallback(async () => {
    if (!sellerId) return;

    try {
      const userDoc = await getDoc(doc(db, "users", sellerId));
      if (userDoc.exists()) {
        setSellerData(userDoc.data() as SellerData);
      } else {
        setSellerData({ displayName: "Seller" });
      }
    } catch (error) {
      console.error("Error fetching seller info:", error);
      setSellerData({ displayName: "Seller" });
    }
  }, [sellerId]);

  // Fetch reviews
  const fetchReviews = useCallback(async () => {
    if (!sellerId) return;

    try {
      const reviewsSnapshot = await getDocs(
        collection(db, "users", sellerId, "reviews")
      );

      const reviewsData: Review[] = [];
      let totalRating = 0;

      reviewsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        reviewsData.push({
          reviewId: doc.id,
          rating: data.rating || 0,
          review: data.review || "",
          timestamp: data.timestamp,
          likes: data.likes || [],
        });
        totalRating += data.rating || 0;
      });

      const count = reviewsData.length;
      setReviews(reviewsData);
      setTotalReviews(count);
      setAverageRating(count > 0 ? totalRating / count : 0);
    } catch (error) {
      console.error("Error fetching reviews:", error);
    } finally {
      setIsLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    fetchSellerInfo();
    fetchReviews();
  }, [fetchSellerInfo, fetchReviews]);

  // Report options
  const reportOptions = [
    {
      type: "inappropriate_products",
      icon: Package,
      label: t("SellerInfo.inappropriateProducts"),
    },
    {
      type: "inappropriate_name",
      icon: UserX,
      label: t("SellerInfo.inappropriateName"),
    },
    {
      type: "inappropriate_product_information",
      icon: FileWarning,
      label: t("SellerInfo.inappropriateProductInformation"),
    },
    {
      type: "unsuccessful_delivery",
      icon: Truck,
      label: t("SellerInfo.unsuccessfulDelivery"),
    },
  ];

  const handleSubmitReport = async (reportType: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert(t("SellerInfo.pleaseLogin"));
      return;
    }

    setIsSubmittingReport(true);
    try {
      await addDoc(collection(db, "users", sellerId, "reports"), {
        reporterId: currentUser.uid,
        reportType,
        timestamp: serverTimestamp(),
      });
      setIsReportModalOpen(false);
      alert(t("SellerInfo.reportSubmittedSuccessfully"));
    } catch (error) {
      console.error("Error submitting report:", error);
      alert(t("SellerInfo.errorSubmittingReport"));
    } finally {
      setIsSubmittingReport(false);
    }
  };

  if (isLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-40 ${
          isDarkMode ? "bg-gray-800/95" : "bg-white/95"
        } backdrop-blur-md border-b ${
          isDarkMode ? "border-gray-700" : "border-gray-200"
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className={`p-2 rounded-full transition-colors ${
                isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
              }`}
            >
              <ArrowLeft
                className={`w-5 h-5 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              />
            </button>

            <h1
              className={`text-lg font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("SellerInfo.sellerReviews")}
            </h1>

            <div className="flex items-center gap-2">
              <Link
                href={`/user_profile/${sellerId}`}
                className={`p-2 rounded-full transition-colors ${
                  isDarkMode
                    ? "bg-gray-700 hover:bg-gray-600"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                <User
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-white" : "text-gray-600"
                  }`}
                />
              </Link>
              <button
                onClick={() => setIsReportModalOpen(true)}
                className="p-2 rounded-full bg-red-500/10 hover:bg-red-500/20 transition-colors"
              >
                <Flag className="w-5 h-5 text-red-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Seller Profile Card */}
        <div
          className={`rounded-2xl overflow-hidden shadow-lg mb-6 ${
            isDarkMode ? "bg-gray-800" : "bg-white"
          }`}
        >
          {/* Gradient Background */}
          <div className="h-24 md:h-32 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 relative">
            <div className="absolute inset-0 bg-black/10" />
          </div>

          {/* Profile Info */}
          <div className="relative px-6 pb-6">
            <div className="flex flex-col items-center -mt-12 md:-mt-14">
              {/* Avatar */}
              <div
                className={`w-24 h-24 md:w-28 md:h-28 rounded-full p-1 ${
                  isDarkMode ? "bg-gray-800" : "bg-white"
                } shadow-xl`}
              >
                <div className="w-full h-full rounded-full border-3 border-emerald-500 flex items-center justify-center bg-gradient-to-br from-emerald-400/20 to-teal-400/20">
                  <span className="text-3xl md:text-4xl font-bold text-emerald-500">
                    {sellerData?.displayName?.[0]?.toUpperCase() || "S"}
                  </span>
                </div>
              </div>

              {/* Name */}
              <h2
                className={`text-xl md:text-2xl font-bold mt-4 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {sellerData?.displayName || "Seller"}
              </h2>

              {/* Verified Badge */}
              <div className="mt-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center gap-1.5">
                <Verified className="w-4 h-4 text-white" />
                <span className="text-sm font-medium text-white">
                  {t("SellerInfo.verifiedSeller")}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Rating Card */}
        <div className="rounded-2xl overflow-hidden shadow-lg mb-6 bg-gradient-to-br from-emerald-500 to-teal-500 p-[1px]">
          <div
            className={`rounded-2xl p-6 ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            }`}
          >
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <span
                    className={`text-4xl md:text-5xl font-bold ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {averageRating.toFixed(1)}
                  </span>
                </div>
                <div>
                  <StarRating rating={averageRating} size="lg" />
                  <p
                    className={`text-sm mt-1 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {t("SellerInfo.reviews")} • {totalReviews}
                  </p>
                </div>
              </div>

              <Link
                href={`/user_profile/${sellerId}`}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium hover:opacity-90 transition-opacity"
              >
                <span>{t("SellerInfo.viewProfile")}</span>
                <ExternalLink className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        {/* Reviews Section */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3
              className={`text-lg font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("SellerInfo.allReviews")}
            </h3>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                isDarkMode ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-900"
              }`}
            >
              {totalReviews}
            </span>
          </div>

          {reviews.length === 0 ? (
            <div
              className={`rounded-2xl p-8 text-center ${
                isDarkMode ? "bg-gray-800" : "bg-white"
              } shadow-md`}
            >
              <Star
                className={`w-16 h-16 mx-auto mb-4 ${
                  isDarkMode ? "text-gray-600" : "text-gray-300"
                }`}
              />
              <p
                className={`text-lg ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {t("SellerInfo.noReviewsYet")}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((review) => (
                <ReviewCard
                  key={review.reviewId}
                  review={review}
                  sellerId={sellerId}
                  isDarkMode={isDarkMode}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Report Modal */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsReportModalOpen(false)}
          />
          <div
            className={`relative w-full max-w-md mx-4 rounded-t-3xl md:rounded-2xl ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            } shadow-2xl animate-in slide-in-from-bottom md:slide-in-from-bottom-0 duration-300`}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 md:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3
                className={`text-lg font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("SellerInfo.report")}
              </h3>
              <button
                onClick={() => setIsReportModalOpen(false)}
                className={`p-2 rounded-full transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <X
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                />
              </button>
            </div>

            {/* Options */}
            <div className="p-4 space-y-2">
              {reportOptions.map((option) => (
                <button
                  key={option.type}
                  onClick={() => handleSubmitReport(option.type)}
                  disabled={isSubmittingReport}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors ${
                    isDarkMode
                      ? "hover:bg-gray-700 active:bg-gray-600"
                      : "hover:bg-gray-50 active:bg-gray-100"
                  } disabled:opacity-50`}
                >
                  <div className="p-2.5 rounded-xl bg-red-500/10">
                    <option.icon className="w-5 h-5 text-red-500" />
                  </div>
                  <span
                    className={`flex-1 text-left font-medium ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {option.label}
                  </span>
                  <ArrowLeft
                    className={`w-4 h-4 rotate-180 ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  />
                </button>
              ))}
            </div>

            <div className="h-6 md:h-4" />
          </div>
        </div>
      )}
    </div>
  );
}

// Star Rating Component
function StarRating({
  rating,
  size = "md",
}: {
  rating: number;
  size?: "sm" | "md" | "lg";
}) {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  const sizeClasses = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <div className="flex items-center gap-0.5">
      {[...Array(fullStars)].map((_, i) => (
        <Star
          key={`full-${i}`}
          className={`${sizeClasses[size]} fill-amber-400 text-amber-400`}
        />
      ))}
      {hasHalfStar && (
        <StarHalf
          className={`${sizeClasses[size]} fill-amber-400 text-amber-400`}
        />
      )}
      {[...Array(emptyStars)].map((_, i) => (
        <Star
          key={`empty-${i}`}
          className={`${sizeClasses[size]} text-gray-300`}
        />
      ))}
    </div>
  );
}

// Review Card Component
function ReviewCard({
  review,
  sellerId,
  isDarkMode,
  t,
}: {
  review: Review;
  sellerId: string;
  isDarkMode: boolean;
  t: (key: string) => string;
}) {
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(review.likes?.length || 0);
  const [isTranslated, setIsTranslated] = useState(false);
  const [translatedText, setTranslatedText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser && review.likes?.includes(currentUser.uid)) {
      setIsLiked(true);
    }
  }, [review.likes]);

  const handleToggleLike = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert(t("SellerInfo.pleaseLoginToLike"));
      return;
    }

    const previousLiked = isLiked;
    setIsLiked(!isLiked);
    setLikeCount((prev) => (isLiked ? prev - 1 : prev + 1));

    try {
      const reviewRef = doc(db, "users", sellerId, "reviews", review.reviewId);
      if (previousLiked) {
        await updateDoc(reviewRef, {
          likes: arrayRemove(currentUser.uid),
        });
      } else {
        await updateDoc(reviewRef, {
          likes: arrayUnion(currentUser.uid),
        });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      setIsLiked(previousLiked);
      setLikeCount((prev) => (previousLiked ? prev + 1 : prev - 1));
    }
  };

  const handleTranslate = async () => {
    if (isTranslated) {
      setIsTranslated(false);
      return;
    }

    if (translatedText) {
      setIsTranslated(true);
      return;
    }

    setIsTranslating(true);
    try {
      // You can integrate your translation API here
      // For now, we'll simulate a translation
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: review.review }),
      });

      if (response.ok) {
        const data = await response.json();
        setTranslatedText(data.translation);
        setIsTranslated(true);
      }
    } catch (error) {
      console.error("Translation error:", error);
      alert(t("SellerInfo.translationError"));
    } finally {
      setIsTranslating(false);
    }
  };

  const formatDate = (timestamp: Timestamp | number | null) => {
    if (!timestamp) return "";

    let date: Date;
    if (timestamp && typeof timestamp === "object" && "toDate" in timestamp) {
      date = timestamp.toDate();
    } else if (typeof timestamp === "number") {
      date = new Date(timestamp);
    } else {
      date = new Date();
    }

    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <div
      className={`rounded-2xl p-5 shadow-md transition-all hover:shadow-lg ${
        isDarkMode ? "bg-gray-800" : "bg-white"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <StarRating rating={review.rating} size="sm" />
        <span
          className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
            isDarkMode ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"
          }`}
        >
          {formatDate(review.timestamp)}
        </span>
      </div>

      {/* Review Text */}
      <p
        className={`text-sm md:text-base leading-relaxed mb-4 ${
          isDarkMode ? "text-gray-300" : "text-gray-700"
        }`}
      >
        {isTranslated ? translatedText : review.review}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleTranslate}
          disabled={isTranslating}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
            isDarkMode
              ? "bg-gray-700 hover:bg-gray-600"
              : "bg-gray-100 hover:bg-gray-200"
          }`}
        >
          {isTranslating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Languages
              className={`w-4 h-4 ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            />
          )}
          <span
            className={`text-sm font-medium ${
              isDarkMode ? "text-gray-300" : "text-gray-600"
            }`}
          >
            {isTranslated ? t("SellerInfo.seeOriginal") : t("SellerInfo.translate")}
          </span>
        </button>

        <button
          onClick={handleToggleLike}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
            isLiked
              ? "bg-emerald-500/10 border border-emerald-500/30"
              : isDarkMode
              ? "bg-gray-700 hover:bg-gray-600"
              : "bg-gray-100 hover:bg-gray-200"
          }`}
        >
          <ThumbsUp
            className={`w-4 h-4 ${
              isLiked
                ? "text-emerald-500 fill-emerald-500"
                : isDarkMode
                ? "text-gray-400"
                : "text-gray-500"
            }`}
          />
          <span
            className={`text-sm font-medium ${
              isLiked
                ? "text-emerald-500"
                : isDarkMode
                ? "text-gray-300"
                : "text-gray-600"
            }`}
          >
            {likeCount}
          </span>
        </button>
      </div>
    </div>
  );
}