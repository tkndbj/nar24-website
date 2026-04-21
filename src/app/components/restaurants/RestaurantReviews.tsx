"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Star, MessageSquare, ChevronDown, User, X } from "lucide-react";
import SmartImage from "@/app/components/SmartImage";
import { useTranslations } from "next-intl";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  type DocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase-lazy";

const PAGE_SIZE = 20;

interface FoodReview {
  id: string;
  orderId: string;
  buyerId: string;
  buyerName?: string;
  restaurantId: string;
  restaurantName?: string;
  rating: number;
  comment: string;
  imageUrls?: string[];
  timestamp: Timestamp;
}

// ─── Review Card ────────────────────────────────────────────────────────────

function ReviewCard({
  review,
  isDarkMode,
}: {
  review: FoodReview;
  isDarkMode: boolean;
}) {
  const t = useTranslations("restaurantDetail");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const maskName = (name: string) => {
    const parts = name.trim().split(/\s+/);
    return parts
      .map((part, i) => {
        if (part.length <= 1) return part;
        if (i === 0) return part[0] + "*".repeat(part.length - 1);
        if (i === parts.length - 1)
          return "*".repeat(part.length - 1) + part[part.length - 1];
        return "*".repeat(part.length);
      })
      .join(" ");
  };

  const timeAgo = useCallback(
    (ts: Timestamp) => {
      const now = Date.now();
      const diff = now - ts.toMillis();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return t("justNow");
      if (mins < 60) return `${mins}${t("minuteShort")}`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}${t("hourShort")}`;
      const days = Math.floor(hours / 24);
      if (days < 30) return `${days}${t("dayShort")}`;
      const months = Math.floor(days / 30);
      if (months < 12) return `${months}${t("monthShort")}`;
      const years = Math.floor(months / 12);
      return `${years}${t("yearShort")}`;
    },
    [t],
  );

  return (
    <>
      <div
        className={`rounded-xl border p-4 ${
          isDarkMode
            ? "border-gray-700/50 bg-gray-800/40"
            : "border-gray-200 bg-white"
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-2.5">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
              isDarkMode ? "bg-gray-700" : "bg-gray-100"
            }`}
          >
            <User
              size={16}
              className={isDarkMode ? "text-gray-400" : "text-gray-500"}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-semibold truncate ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {review.buyerName
                ? maskName(review.buyerName)
                : t("anonymousUser")}
            </p>
            <p
              className={`text-[11px] ${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              }`}
            >
              {review.timestamp ? timeAgo(review.timestamp) : ""}
            </p>
          </div>
        </div>

        {/* Stars */}
        <div className="flex items-center gap-0.5 mb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              size={14}
              className={
                i < review.rating
                  ? "fill-yellow-400 text-yellow-400"
                  : isDarkMode
                    ? "text-gray-600"
                    : "text-gray-300"
              }
            />
          ))}
        </div>

        {/* Comment */}
        {review.comment && (
          <p
            className={`text-sm leading-relaxed ${
              isDarkMode ? "text-gray-300" : "text-gray-600"
            }`}
          >
            {review.comment}
          </p>
        )}

        {/* Image thumbnails */}
        {review.imageUrls && review.imageUrls.length > 0 && (
          <div className="flex gap-2 mt-3">
            {review.imageUrls.map((url, idx) => (
              <button
                key={idx}
                onClick={() => setLightboxUrl(url)}
                className={`w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 relative hover:opacity-80 transition-opacity ${
                  isDarkMode ? "bg-gray-700" : "bg-gray-100"
                }`}
              >
                <SmartImage
                  source={url}
                  size="thumbnail"
                  alt={`Review photo ${idx + 1}`}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X size={20} />
          </button>
          <div
            className="relative max-w-[90vw] max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <SmartImage
              source={lightboxUrl}
              size="zoom"
              alt="Review photo"
              width={800}
              height={800}
              className="object-contain max-h-[85vh] rounded-2xl"
              sizes="90vw"
              priority
            />
          </div>
        </div>
      )}
    </>
  );
}

// ─── Shimmer Skeleton ───────────────────────────────────────────────────────

function ReviewsSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  const bg = isDarkMode ? "bg-gray-700" : "bg-gray-200";
  const cardBg = isDarkMode
    ? "border-gray-700/50 bg-gray-800/40"
    : "border-gray-200 bg-white";

  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={`rounded-xl border p-4 ${cardBg}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-9 h-9 rounded-full ${bg}`} />
            <div className="flex-1 space-y-1.5">
              <div className={`h-3.5 w-28 rounded ${bg}`} />
              <div className={`h-2.5 w-16 rounded ${bg}`} />
            </div>
          </div>
          <div className="flex gap-0.5 mb-2.5">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className={`w-3.5 h-3.5 rounded ${bg}`} />
            ))}
          </div>
          <div className="space-y-1.5">
            <div className={`h-3 w-full rounded ${bg}`} />
            <div className={`h-3 w-3/4 rounded ${bg}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function RestaurantReviews({
  restaurantId,
  isDarkMode,
}: {
  restaurantId: string;
  isDarkMode: boolean;
}) {
  const t = useTranslations("restaurantDetail");

  const [reviews, setReviews] = useState<FoodReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const lastDocRef = useRef<DocumentSnapshot | null>(null);

  const fetchReviews = useCallback(
    async (reset: boolean) => {
      if (reset) {
        setIsLoading(true);
        lastDocRef.current = null;
      } else {
        setIsLoadingMore(true);
      }

      try {
        const db = await getFirebaseDb();
        const col = collection(db, "restaurants", restaurantId, "food-reviews");

        const q =
          !reset && lastDocRef.current
            ? query(
                col,
                orderBy("timestamp", "desc"),
                startAfter(lastDocRef.current),
                limit(PAGE_SIZE),
              )
            : query(col, orderBy("timestamp", "desc"), limit(PAGE_SIZE));

        const snapshot = await getDocs(q);

        const fetched: FoodReview[] = snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            orderId: (d.orderId as string) ?? "",
            buyerId: (d.buyerId as string) ?? "",
            buyerName: d.buyerName as string | undefined,
            restaurantId: (d.restaurantId as string) ?? "",
            restaurantName: d.restaurantName as string | undefined,
            rating: (d.rating as number) ?? 0,
            comment: (d.comment as string) ?? "",
            imageUrls: Array.isArray(d.imageUrls) ? d.imageUrls : [],
            timestamp: d.timestamp as Timestamp,
          };
        });

        if (snapshot.docs.length > 0) {
          lastDocRef.current = snapshot.docs[snapshot.docs.length - 1];
        }

        setHasMore(snapshot.docs.length === PAGE_SIZE);
        setReviews((prev) => (reset ? fetched : [...prev, ...fetched]));
      } catch (err) {
        console.error("[RestaurantReviews] Fetch error:", err);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [restaurantId],
  );

  useEffect(() => {
    fetchReviews(true);
  }, [fetchReviews]);

  // Initial loading
  if (isLoading) {
    return <ReviewsSkeleton isDarkMode={isDarkMode} />;
  }

  // Empty state
  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
            isDarkMode ? "bg-gray-800" : "bg-gray-100"
          }`}
        >
          <MessageSquare
            size={28}
            className={isDarkMode ? "text-gray-600" : "text-gray-300"}
          />
        </div>
        <h3
          className={`text-lg font-semibold mb-1 ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {t("noReviews")}
        </h3>
        <p
          className={`text-sm text-center max-w-sm ${
            isDarkMode ? "text-gray-400" : "text-gray-500"
          }`}
        >
          {t("noReviewsSubtitle")}
        </p>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="space-y-3">
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} isDarkMode={isDarkMode} />
        ))}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => fetchReviews(false)}
            disabled={isLoadingMore}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              isDarkMode
                ? "bg-gray-800 text-gray-300 border border-gray-700 hover:border-gray-500"
                : "bg-white text-gray-700 border border-gray-200 hover:border-gray-300"
            } disabled:opacity-60`}
          >
            {isLoadingMore ? (
              <div className="w-4 h-4 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
            ) : (
              <ChevronDown size={16} />
            )}
            {isLoadingMore ? t("loadingMore") : t("loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
