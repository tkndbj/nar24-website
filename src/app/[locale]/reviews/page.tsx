"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Star,
  Filter,
  Calendar,
  Edit,
  X,
  Send,
  Store,
  ShoppingBag,
  RefreshCw,
  Camera,
  ArrowLeft,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  serverTimestamp,
  collectionGroup,
  Timestamp,
  QueryDocumentSnapshot,
  addDoc,
} from "firebase/firestore";
import { db, storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useTranslations } from "next-intl";
import Image from "next/image";

// Types
interface PendingReview {
  id: string;
  productId: string;
  sellerId: string;
  shopId?: string;
  orderId: string;
  productName: string;
  productImage: string;
  productPrice: number;
  currency: string;
  needsProductReview: boolean;
  needsSellerReview: boolean;
  isShopProduct: boolean;
  timestamp: Timestamp;
}

interface Review {
  id: string;
  rating: number;
  review: string;
  imageUrls: string[];
  productId?: string;
  productName?: string;
  productImage?: string;
  productPrice?: number;
  currency?: string;
  sellerId: string;
  sellerName?: string;
  shopId?: string;
  orderId: string;
  timestamp: Timestamp;
  userId: string;
}

interface FilterOptions {
  productId?: string;
  sellerId?: string;
  startDate?: Date;
  endDate?: Date;
  reviewType: "all" | "product" | "seller";
}

type ReviewTab = "pending" | "myReviews";

const PAGE_SIZE = 20;

export default function ReviewsPage() {
  const router = useRouter();
  const { user, profileData } = useUser();
  const t = useTranslations("Reviews");

  // State
  const [activeTab, setActiveTab] = useState<ReviewTab>("pending");
  const [filters, setFilters] = useState<FilterOptions>({ reviewType: "all" });
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Pending reviews state
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingHasMore, setPendingHasMore] = useState(true);
  const [pendingLastDoc, setPendingLastDoc] =
    useState<QueryDocumentSnapshot | null>(null);

  // My reviews state
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [myReviewsLoading, setMyReviewsLoading] = useState(false);
  const [myReviewsHasMore, setMyReviewsHasMore] = useState(true);
  const [myReviewsLastDoc, setMyReviewsLastDoc] =
    useState<QueryDocumentSnapshot | null>(null);

  // Modal states
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedReview, setSelectedReview] = useState<
    PendingReview | Review | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Review form state
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewImages, setReviewImages] = useState<File[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [reviewType, setReviewType] = useState<"product" | "seller">("product");

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevFilters = useRef(filters);
  const isLoadingMoreRef = useRef(false);

  // Check dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  // Load initial data when user changes
  useEffect(() => {
    if (user) {
      // Reset state when user changes
      resetPaginationState();
      loadPendingReviews(true);
      loadMyReviews(true);
    }
  }, [user]);

  // Load data when filters change (optimized like Flutter)
  useEffect(() => {
    if (user) {
      const filtersChanged =
        JSON.stringify(filters) !== JSON.stringify(prevFilters.current);
      if (filtersChanged) {
        resetPaginationState();
        loadPendingReviews(true);
        loadMyReviews(true);
        prevFilters.current = filters;
      }
    }
  }, [filters, user]);

  // Reset filter when switching tabs (like Flutter)
  useEffect(() => {
    if (activeTab !== "myReviews") {
      setFilters((prev) => ({ ...prev, reviewType: "all" }));
    }
  }, [activeTab]);

  // Window scroll handler for infinite loading
  useEffect(() => {
    const handleScroll = () => {
      // Check if we're near the bottom (200px threshold)
      const scrollPosition = window.innerHeight + window.scrollY;
      const threshold = document.documentElement.scrollHeight - 200;

      if (scrollPosition >= threshold) {
        if (
          activeTab === "pending" &&
          pendingHasMore &&
          !pendingLoading &&
          !isLoadingMoreRef.current
        ) {
          isLoadingMoreRef.current = true;
          loadPendingReviews(false).finally(() => {
            isLoadingMoreRef.current = false;
          });
        } else if (
          activeTab === "myReviews" &&
          myReviewsHasMore &&
          !myReviewsLoading &&
          !isLoadingMoreRef.current
        ) {
          isLoadingMoreRef.current = true;
          loadMyReviews(false).finally(() => {
            isLoadingMoreRef.current = false;
          });
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [
    activeTab,
    pendingHasMore,
    pendingLoading,
    myReviewsHasMore,
    myReviewsLoading,
  ]);

  // Helper function to reset pagination state
  const resetPaginationState = () => {
    setPendingReviews([]);
    setMyReviews([]);
    setPendingLastDoc(null);
    setMyReviewsLastDoc(null);
    setPendingHasMore(true);
    setMyReviewsHasMore(true);
    isLoadingMoreRef.current = false;
  };

  // Load pending reviews (optimized like Flutter)
  const loadPendingReviews = useCallback(
    async (reset = false) => {
      if (!user) return;
      if (pendingLoading) return;
      if (!reset && !pendingHasMore) return; // Prevent unnecessary calls

      setPendingLoading(true);
      try {
        let q = query(
          collectionGroup(db, "items"),
          where("buyerId", "==", user.uid)
        );

        // Apply filters (server-side filtering like Flutter ReviewProvider)
        if (filters.productId) {
          q = query(q, where("productId", "==", filters.productId));
        }
        if (filters.sellerId) {
          q = query(q, where("sellerId", "==", filters.sellerId));
        }
        if (filters.startDate) {
          q = query(
            q,
            where("timestamp", ">=", Timestamp.fromDate(filters.startDate))
          );
        }
        if (filters.endDate) {
          const endOfDay = new Date(filters.endDate);
          endOfDay.setHours(23, 59, 59, 999);
          q = query(q, where("timestamp", "<=", Timestamp.fromDate(endOfDay)));
        }

        q = query(q, orderBy("timestamp", "desc"), limit(PAGE_SIZE));

        if (!reset && pendingLastDoc) {
          q = query(q, startAfter(pendingLastDoc));
        }

        const snapshot = await getDocs(q);
        const newReviews: PendingReview[] = [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const needsProductReview = data.needsProductReview ?? false;
          const needsSellerReview = data.needsSellerReview ?? false;

          if (needsProductReview || needsSellerReview) {
            newReviews.push({
              id: doc.id,
              productId: data.productId,
              sellerId: data.sellerId,
              shopId: data.shopId,
              orderId: data.orderId,
              productName: data.productName,
              productImage: data.productImage,
              productPrice: data.price,
              currency: data.currency,
              needsProductReview,
              needsSellerReview,
              isShopProduct: !!data.shopId,
              timestamp: data.timestamp,
            });
          }
        });

        // Set hasMore based on actual results length
        const hasMore = newReviews.length === PAGE_SIZE;
        setPendingHasMore(hasMore);

        if (reset) {
          setPendingReviews(newReviews);
        } else {
          // Use Map to ensure uniqueness (like Flutter's approach)
          setPendingReviews((prev) => {
            const combined = [...prev, ...newReviews];
            const uniqueMap = new Map();
            combined.forEach((review) => {
              uniqueMap.set(review.id, review);
            });
            return Array.from(uniqueMap.values());
          });
        }

        // Set last document for pagination
        if (newReviews.length > 0) {
          setPendingLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        } else if (reset) {
          setPendingLastDoc(null);
        }
      } catch (error) {
        console.error("Error loading pending reviews:", error);
      } finally {
        setPendingLoading(false);
      }
    },
    [user, filters, pendingLoading, pendingLastDoc, pendingHasMore]
  );

  // Load my reviews (optimized like Flutter)
  const loadMyReviews = useCallback(
    async (reset = false) => {
      if (!user) return;
      if (myReviewsLoading) return;
      if (!reset && !myReviewsHasMore) return; // Prevent unnecessary calls

      setMyReviewsLoading(true);
      try {
        let q = query(
          collectionGroup(db, "reviews"),
          where("userId", "==", user.uid)
        );

        // Apply filters based on review type (like Flutter's switch statement)
        if (filters.reviewType === "product") {
          q = query(q, where("productId", "!=", null));
        } else if (filters.reviewType === "seller") {
          q = query(q, where("productId", "==", null));
        }

        if (filters.productId) {
          q = query(q, where("productId", "==", filters.productId));
        }
        if (filters.sellerId) {
          q = query(q, where("sellerId", "==", filters.sellerId));
        }
        if (filters.startDate) {
          q = query(
            q,
            where("timestamp", ">=", Timestamp.fromDate(filters.startDate))
          );
        }
        if (filters.endDate) {
          const endOfDay = new Date(filters.endDate);
          endOfDay.setHours(23, 59, 59, 999);
          q = query(q, where("timestamp", "<=", Timestamp.fromDate(endOfDay)));
        }

        q = query(q, orderBy("timestamp", "desc"), limit(PAGE_SIZE));

        if (!reset && myReviewsLastDoc) {
          q = query(q, startAfter(myReviewsLastDoc));
        }

        const snapshot = await getDocs(q);
        const newReviews = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            } as Review)
        );

        // Set hasMore based on actual results length
        const hasMore = newReviews.length === PAGE_SIZE;
        setMyReviewsHasMore(hasMore);

        if (reset) {
          setMyReviews(newReviews);
        } else {
          // Use Map to ensure uniqueness (like Flutter's approach)
          setMyReviews((prev) => {
            const combined = [...prev, ...newReviews];
            const uniqueMap = new Map();
            combined.forEach((review) => {
              uniqueMap.set(review.id, review);
            });
            return Array.from(uniqueMap.values());
          });
        }

        // Set last document for pagination
        if (newReviews.length > 0) {
          setMyReviewsLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        } else if (reset) {
          setMyReviewsLastDoc(null);
        }
      } catch (error) {
        console.error("Error loading my reviews:", error);
      } finally {
        setMyReviewsLoading(false);
      }
    },
    [user, filters, myReviewsLoading, myReviewsLastDoc, myReviewsHasMore]
  );

  // Refresh function (like Flutter's refreshPendingReviews)
  const refreshReviews = useCallback(() => {
    if (user) {
      resetPaginationState();
      loadPendingReviews(true);
      loadMyReviews(true);
    }
  }, [user, loadPendingReviews, loadMyReviews]);

  // Handle image upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const maxImages = 3;
    const currentCount = reviewImages.length + existingImageUrls.length;

    if (currentCount >= maxImages) {
      alert(t("maxImagesReached") || `Maximum ${maxImages} images allowed`);
      return;
    }

    const remainingSlots = maxImages - currentCount;
    const filesToAdd = files.slice(0, remainingSlots);

    setReviewImages((prev) => [...prev, ...filesToAdd]);
  };

  // Remove image
  const removeImage = (index: number, isExisting = false) => {
    if (isExisting) {
      setExistingImageUrls((prev) => prev.filter((_, i) => i !== index));
    } else {
      setReviewImages((prev) => prev.filter((_, i) => i !== index));
    }
  };

  // Submit review
  const handleSubmitReview = async () => {
    if (!user || !selectedReview || rating === 0 || !reviewText.trim()) {
      alert(
        t("pleaseProvideRatingAndReview") ||
          "Please provide a rating and review text"
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // Upload images first
      const uploadedUrls: string[] = [];
      for (const image of reviewImages) {
        const fileName = `${user.uid}_${Date.now()}_${image.name}`;
        const imageRef = ref(storage, `reviews/${fileName}`);
        await uploadBytes(imageRef, image);
        const downloadURL = await getDownloadURL(imageRef);
        uploadedUrls.push(downloadURL);
      }

      const allImageUrls = [...existingImageUrls, ...uploadedUrls];

      // Determine collection path
      const isProductReview = reviewType === "product";
      let collectionPath: string;

      if (isProductReview) {
        const pending = selectedReview as PendingReview;
        collectionPath = pending.isShopProduct
          ? `shop_products/${pending.productId}/reviews`
          : `products/${pending.productId}/reviews`;
      } else {
        const pending = selectedReview as PendingReview;
        collectionPath = pending.shopId
          ? `shops/${pending.shopId}/reviews`
          : `users/${pending.sellerId}/reviews`;
      }

      // Create review document
      const reviewData = {
        userId: user.uid,
        userName: profileData?.displayName || "Anonymous",
        userProfileImage: profileData?.profileImage || "",
        rating,
        review: reviewText.trim(),
        imageUrls: allImageUrls,
        timestamp: serverTimestamp(),
        orderId: selectedReview.id,
        ...(isProductReview && {
          productId: (selectedReview as PendingReview).productId,
          productName: (selectedReview as PendingReview).productName,
          productImage: (selectedReview as PendingReview).productImage,
          productPrice: (selectedReview as PendingReview).productPrice,
          currency: (selectedReview as PendingReview).currency,
        }),
        sellerId: (selectedReview as PendingReview).sellerId,
        ...((selectedReview as PendingReview).shopId && {
          shopId: (selectedReview as PendingReview).shopId,
        }),
      };

      await addDoc(collection(db, collectionPath), reviewData);

      // Reset form and close modal
      resetReviewForm();
      setShowReviewModal(false);

      // Refresh data (like Flutter's approach)
      refreshReviews();

      alert(
        t("reviewSubmittedSuccessfully") || "Review submitted successfully!"
      );
    } catch (error) {
      console.error("Error submitting review:", error);
      alert(t("errorSubmittingReview") || "Error submitting review");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form
  const resetReviewForm = () => {
    setRating(0);
    setReviewText("");
    setReviewImages([]);
    setExistingImageUrls([]);
    setSelectedReview(null);
  };

  // Open review modal
  const openReviewModal = (
    review: PendingReview,
    type: "product" | "seller"
  ) => {
    setSelectedReview(review);
    setReviewType(type);
    setShowReviewModal(true);
  };

  // Open edit modal (placeholder for future implementation)
  const openEditModal = (review: Review) => {
    // TODO: Implement edit functionality
    console.log("Edit review:", review);
  };

  // Format date
  const formatDate = (timestamp: Timestamp) => {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(timestamp.toDate());
  };

  // Get active filters count
  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.productId) count++;
    if (filters.sellerId) count++;
    if (filters.startDate || filters.endDate) count++;
    if (filters.reviewType !== "all") count++;
    return count;
  };

  // Filter my reviews based on current filter (client-side like Flutter)
  const getFilteredMyReviews = () => {
    return myReviews.filter((review) => {
      switch (filters.reviewType) {
        case "product":
          return review.productId != null;
        case "seller":
          return review.productId == null;
        case "all":
        default:
          return true;
      }
    });
  };

  // Product Card Component
  const ProductCard = ({ review }: { review: PendingReview }) => (
    <div
      className={`
        p-4 rounded-lg border cursor-pointer transition-colors duration-200
        ${
          isDarkMode
            ? "bg-gray-800 border-gray-700 hover:border-gray-600"
            : "bg-white border-gray-200 hover:border-gray-300"
        }
      `}
      onClick={() => router.push(`/productdetail/${review.productId}`)}
    >
      <div className="flex space-x-3">
        <div className="relative w-16 h-16 flex-shrink-0">
          <Image
            src={review.productImage || "/placeholder-product.png"}
            alt={review.productName}
            fill
            className="object-cover rounded-lg"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h4
            className={`
            font-medium text-sm line-clamp-2
            ${isDarkMode ? "text-white" : "text-gray-900"}
          `}
          >
            {review.productName}
          </h4>
          <div className="flex items-center space-x-2 mt-1">
            <span
              className={`
              font-bold text-sm
              ${isDarkMode ? "text-green-400" : "text-green-600"}
            `}
            >
              ₺{review.productPrice.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  // Star Rating Component
  const StarRating = ({
    value,
    onChange,
    readonly = false,
  }: {
    value: number;
    onChange?: (rating: number) => void;
    readonly?: boolean;
  }) => (
    <div className="flex space-x-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => !readonly && onChange?.(star)}
          className={`
            ${readonly ? "cursor-default" : "cursor-pointer hover:scale-110"}
            transition-transform duration-150
          `}
        >
          <Star
            size={24}
            className={`
              ${
                star <= value ? "text-yellow-400 fill-current" : "text-gray-300"
              }
            `}
          />
        </button>
      ))}
    </div>
  );

  if (!user) {
    return null; // Will redirect to login
  }

  const filteredMyReviews = getFilteredMyReviews();

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      style={{
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* Header */}
      <div
        className={`
        sticky top-0 z-10 border-b
        ${
          isDarkMode
            ? "bg-gray-900 border-gray-700"
            : "bg-white border-gray-200"
        }
      `}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => router.back()}
                className={`
                  p-2 rounded-lg transition-colors
                  ${
                    isDarkMode
                      ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                      : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                  }
                `}
              >
                <ArrowLeft size={20} />
              </button>
              <h1
                className={`
                text-xl font-bold
                ${isDarkMode ? "text-white" : "text-gray-900"}
              `}
              >
                {t("title") || "My Reviews"}
              </h1>
            </div>
            <button
              className={`
                p-2 rounded-lg transition-colors
                ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                    : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                }
              `}
            >
              <Calendar size={20} />
            </button>
          </div>

          {/* Tab Bar */}
          <div
            className={`
            mt-4 p-1 rounded-lg
            ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
          `}
          >
            <div className="flex">
              {(["pending", "myReviews"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`
                    flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200
                    ${
                      activeTab === tab
                        ? "bg-green-500 text-white shadow-lg"
                        : isDarkMode
                        ? "text-gray-400 hover:text-white hover:bg-gray-700"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                    }
                  `}
                >
                  {tab === "pending" ? (
                    <>
                      <ShoppingBag size={16} />
                      <span>{t("toReview") || "To Review"}</span>
                    </>
                  ) : (
                    <>
                      <Star size={16} />
                      <span>{t("myRatings") || "My Ratings"}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-2 mt-4">
            <button
              className={`
                flex items-center space-x-2 px-4 py-2 rounded-full text-sm font-medium border transition-colors
                ${
                  getActiveFiltersCount() > 0
                    ? "bg-orange-500 text-white border-orange-500"
                    : isDarkMode
                    ? "border-gray-600 text-gray-300 hover:bg-gray-800"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }
              `}
            >
              <Filter size={16} />
              <span>
                {getActiveFiltersCount() > 0
                  ? `${t("filter")} (${getActiveFiltersCount()})`
                  : t("filter") || "Filter"}
              </span>
            </button>

            {activeTab === "myReviews" && (
              <>
                <button
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      reviewType:
                        prev.reviewType === "product" ? "all" : "product",
                    }))
                  }
                  className={`
                    px-4 py-2 rounded-full text-sm font-medium border transition-colors
                    ${
                      filters.reviewType === "product"
                        ? "bg-orange-500 text-white border-orange-500"
                        : isDarkMode
                        ? "border-gray-600 text-gray-300 hover:bg-gray-800"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                    }
                  `}
                >
                  {t("product") || "Product"}
                </button>

                <button
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      reviewType:
                        prev.reviewType === "seller" ? "all" : "seller",
                    }))
                  }
                  className={`
                    px-4 py-2 rounded-full text-sm font-medium border transition-colors
                    ${
                      filters.reviewType === "seller"
                        ? "bg-orange-500 text-white border-orange-500"
                        : isDarkMode
                        ? "border-gray-600 text-gray-300 hover:bg-gray-800"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                    }
                  `}
                >
                  {t("seller") || "Seller"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 pb-16">
        {activeTab === "pending" ? (
          // Pending Reviews Tab
          pendingReviews.length === 0 && !pendingLoading ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div
                className={`
                w-24 h-24 rounded-full flex items-center justify-center mb-6
                ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
              `}
              >
                <Star
                  size={32}
                  className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                />
              </div>
              <h3
                className={`
                text-lg font-medium mb-2
                ${isDarkMode ? "text-white" : "text-gray-900"}
              `}
              >
                {t("nothingToReview") || "Nothing to Review"}
              </h3>
              <p
                className={`
                text-center
                ${isDarkMode ? "text-gray-400" : "text-gray-600"}
              `}
              >
                {t("noUnreviewedPurchases") ||
                  "You have no unreviewed purchases"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingReviews.map((review, index) => (
                <div
                  key={`pending-${review.id}-${index}`} // More unique key
                  className={`
                    rounded-lg border p-4 space-y-4
                    ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-700"
                        : "bg-white border-gray-200"
                    }
                  `}
                >
                  <ProductCard review={review} />

                  <div className="flex space-x-2">
                    {review.needsProductReview && (
                      <button
                        onClick={() => openReviewModal(review, "product")}
                        className="
                          flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg text-sm font-medium
                          bg-green-500 text-white hover:bg-green-600 transition-colors
                        "
                      >
                        <Star size={16} />
                        <span>
                          {t("writeYourReview") || "Write Your Review"}
                        </span>
                      </button>
                    )}

                    {review.needsSellerReview && (
                      <button
                        onClick={() => openReviewModal(review, "seller")}
                        className="
                          flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg text-sm font-medium
                          bg-orange-500 text-white hover:bg-orange-600 transition-colors
                        "
                      >
                        <Store size={16} />
                        <span>
                          {review.isShopProduct
                            ? t("shopReview") || "Shop Review"
                            : t("sellerReview") || "Seller Review"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : // My Reviews Tab
        filteredMyReviews.length === 0 && !myReviewsLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className={`
                w-24 h-24 rounded-full flex items-center justify-center mb-6
                ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
              `}
            >
              <Star
                size={32}
                className={isDarkMode ? "text-gray-400" : "text-gray-500"}
              />
            </div>
            <h3
              className={`
                text-lg font-medium mb-2
                ${isDarkMode ? "text-white" : "text-gray-900"}
              `}
            >
              {t("youHaveNoReviews") || "You Have No Reviews"}
            </h3>
            <p
              className={`
                text-center
                ${isDarkMode ? "text-gray-400" : "text-gray-600"}
              `}
            >
              {t("startReviewingProducts") ||
                "Start reviewing products you've purchased"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMyReviews.map((review, index) => (
              <div
                key={`myreview-${review.id}-${index}`} // More unique key
                className={`
                    rounded-lg border p-4 space-y-4
                    ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-700"
                        : "bg-white border-gray-200"
                    }
                  `}
              >
                {/* Product or Seller Info */}
                {review.productId ? (
                  <div
                    className={`
                        p-4 rounded-lg border cursor-pointer transition-colors duration-200
                        ${
                          isDarkMode
                            ? "bg-gray-700 border-gray-600 hover:border-gray-500"
                            : "bg-gray-50 border-gray-200 hover:border-gray-300"
                        }
                      `}
                    onClick={() => router.push(`/productdetail/${review.productId}`)}
                  >
                    <div className="flex space-x-3">
                      <div className="relative w-16 h-16 flex-shrink-0">
                        <Image
                          src={
                            review.productImage || "/placeholder-product.png"
                          }
                          alt={review.productName || "Product"}
                          fill
                          className="object-cover rounded-lg"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4
                          className={`
                            font-medium text-sm line-clamp-2
                            ${isDarkMode ? "text-white" : "text-gray-900"}
                          `}
                        >
                          {review.productName}
                        </h4>
                        {review.productPrice && (
                          <div className="flex items-center space-x-2 mt-1">
                            <span
                              className={`
                                font-bold text-sm
                                ${
                                  isDarkMode ? "text-green-400" : "text-green-600"
                                }
                              `}
                            >
                              ₺{review.productPrice.toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`
                      p-4 rounded-lg
                      ${isDarkMode ? "bg-gray-700" : "bg-gray-50"}
                    `}
                  >
                    <p
                      className={`
                        font-medium
                        ${isDarkMode ? "text-white" : "text-gray-900"}
                      `}
                    >
                      {t("sellerReview")}:{" "}
                      {review.sellerName || "Unknown Seller"}
                    </p>
                  </div>
                )}

                {/* Review Content */}
                <div
                  className={`
                    p-4 rounded-lg
                    ${isDarkMode ? "bg-gray-700" : "bg-gray-50"}
                  `}
                >
                  <div className="flex items-center justify-between mb-3">
                    <StarRating value={review.rating} readonly />
                    <span
                      className={`
                        text-xs
                        ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                      `}
                    >
                      {formatDate(review.timestamp)}
                    </span>
                  </div>

                  <p
                    className={`
                      text-sm mb-3
                      ${isDarkMode ? "text-gray-200" : "text-gray-800"}
                    `}
                  >
                    {review.review}
                  </p>

                  {/* Review Images */}
                  {review.imageUrls && review.imageUrls.length > 0 && (
                    <div className="flex space-x-2 overflow-x-auto">
                      {review.imageUrls.map((url, index) => (
                        <div
                          key={index}
                          className="relative w-16 h-16 flex-shrink-0"
                        >
                          <Image
                            src={url}
                            alt={`Review image ${index + 1}`}
                            fill
                            className="object-cover rounded-lg cursor-pointer"
                            onClick={() => window.open(url, "_blank")}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Edit Button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => openEditModal(review)}
                    className="
                        p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors
                      "
                  >
                    <Edit size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading indicator at bottom */}
        {(pendingLoading || myReviewsLoading) && (
          <div className="flex justify-center py-8">
            <RefreshCw size={24} className="animate-spin text-green-500" />
          </div>
        )}

        {activeTab === "myReviews" &&
          filteredMyReviews.length > 0 &&
          !myReviewsHasMore &&
          !myReviewsLoading && (
            <div className="flex justify-center py-8">
              <p
                className={`text-sm ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              ></p>
            </div>
          )}
      </div>

      {/* Review Modal */}
      {showReviewModal && selectedReview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className={`
            w-full max-w-md rounded-xl p-6
            ${isDarkMode ? "bg-gray-800" : "bg-white"}
            shadow-2xl max-h-[90vh] overflow-y-auto
          `}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className={`
                text-lg font-bold
                ${isDarkMode ? "text-white" : "text-gray-900"}
              `}
              >
                {reviewType === "product"
                  ? t("productReview") || "Product Review"
                  : t("sellerReview") || "Seller Review"}
              </h3>
              <button
                onClick={() => {
                  setShowReviewModal(false);
                  resetReviewForm();
                }}
                className={`
                  p-1 rounded-full transition-colors
                  ${
                    isDarkMode
                      ? "hover:bg-gray-700 text-gray-400"
                      : "hover:bg-gray-100 text-gray-500"
                  }
                `}
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Star Rating */}
              <div className="flex flex-col items-center space-y-2">
                <StarRating value={rating} onChange={setRating} />
                <p
                  className={`
                  text-sm
                  ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                `}
                >
                  {t("tapToRate") || "Tap to rate"}
                </p>
              </div>

              {/* Review Text */}
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder={
                  t("pleaseEnterYourReview") || "Please enter your review..."
                }
                rows={4}
                className={`
                  w-full px-3 py-2 rounded-lg border resize-none
                  ${
                    isDarkMode
                      ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                  }
                  focus:ring-2 focus:ring-green-500 focus:border-transparent
                `}
              />

              {/* Image Upload (only for products) */}
              {reviewType === "product" && (
                <div className="space-y-3">
                  <p
                    className={`
                    text-sm font-medium
                    ${isDarkMode ? "text-white" : "text-gray-900"}
                  `}
                  >
                    {t("uploadPhotos") || "Upload Photos"}
                  </p>

                  {/* Image Preview */}
                  {(existingImageUrls.length > 0 ||
                    reviewImages.length > 0) && (
                    <div className="flex space-x-2 overflow-x-auto">
                      {existingImageUrls.map((url, index) => (
                        <div
                          key={`existing-${index}`}
                          className="relative w-16 h-16 flex-shrink-0"
                        >
                          <Image
                            src={url}
                            alt={`Review image ${index + 1}`}
                            fill
                            className="object-cover rounded-lg"
                          />
                          <button
                            onClick={() => removeImage(index, true)}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      {reviewImages.map((file, index) => (
                        <div
                          key={`new-${index}`}
                          className="relative w-16 h-16 flex-shrink-0"
                        >
                          <Image
                            src={URL.createObjectURL(file)}
                            alt={`New image ${index + 1}`}
                            fill
                            className="object-cover rounded-lg"
                          />
                          <button
                            onClick={() => removeImage(index, false)}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Image Button */}
                  {existingImageUrls.length + reviewImages.length < 3 && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="
                        flex items-center space-x-2 px-4 py-2 rounded-lg border-2 border-dashed
                        border-gray-300 hover:border-green-500 transition-colors
                      "
                    >
                      <Camera size={16} className="text-gray-400" />
                      <span
                        className={`
                        text-sm
                        ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                      `}
                      >
                        {t("addImage") || "Add Image"}
                      </span>
                    </button>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>
              )}

              {/* Submit Button */}
              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowReviewModal(false);
                    resetReviewForm();
                  }}
                  className={`
                    flex-1 py-2 px-4 rounded-lg
                    ${
                      isDarkMode
                        ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }
                    transition-colors duration-200
                  `}
                >
                  {t("cancel") || "Cancel"}
                </button>
                <button
                  onClick={handleSubmitReview}
                  disabled={isSubmitting || rating === 0 || !reviewText.trim()}
                  className="
                    flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg
                    bg-green-500 text-white hover:bg-green-600
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors duration-200
                  "
                >
                  {isSubmitting ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  <span>{t("submit") || "Submit"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
