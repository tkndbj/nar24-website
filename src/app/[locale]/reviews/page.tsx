"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Star,
  Filter,
  X,
  Send,
  Store,
  ShoppingBag,
  Camera,
  ArrowLeft,
  Package,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import {
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  collectionGroup,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db, storage, functions } from "@/lib/firebase";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { httpsCallable, HttpsCallableResult } from "firebase/functions";
import { useTranslations } from "next-intl";
import Image from "next/image";
import imageCompression from "browser-image-compression";
import { useTheme } from "@/hooks/useTheme";

// ============================================================================
// TYPES
// ============================================================================

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

interface ImageValidationResult {
  valid: boolean;
  error?: string;
  message?: string;
}

interface ImageProcessResult {
  success: boolean;
  url?: string;
  ref?: string;
  error?: string;
  message?: string;
}

interface ModerationResult {
  approved: boolean;
  rejectionReason?: string;
}

interface SubmitReviewData {
  isProduct: boolean;
  isShopProduct: boolean;
  productId?: string;
  sellerId: string;
  shopId?: string;
  transactionId: string;
  orderId: string;
  rating: number;
  review: string;
  imageUrls: string[];
}

interface SubmitReviewResult {
  success: boolean;
  message?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PAGE_SIZE = 20;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
];
const MAX_IMAGES = 3;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ReviewsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useUser();
  const t = useTranslations("Reviews");
  const isDarkMode = useTheme();

  // ============================================================================
  // STATE
  // ============================================================================

  const [activeTab, setActiveTab] = useState<ReviewTab>("pending");
  const [filters, setFilters] = useState<FilterOptions>({ reviewType: "all" });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Pending reviews state
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingHasMore, setPendingHasMore] = useState(true);
  const [pendingLastDoc, setPendingLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // My reviews state
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [myReviewsLoading, setMyReviewsLoading] = useState(false);
  const [myReviewsHasMore, setMyReviewsHasMore] = useState(true);
  const [myReviewsLastDoc, setMyReviewsLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // Modal states
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(
    null,
  );

  // Review form state
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewImages, setReviewImages] = useState<File[]>([]);
  const [reviewType, setReviewType] = useState<"product" | "seller">("product");

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevFilters = useRef(filters);
  const isLoadingMoreRef = useRef(false);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  const loadPendingReviews = useCallback(
    async (reset = false) => {
      if (!user) return;
      if (pendingLoading) return;
      if (!reset && !pendingHasMore) return;

      setPendingLoading(true);
      try {
        let q = query(
          collectionGroup(db, "items"),
          where("buyerId", "==", user.uid),
          where("deliveryStatus", "==", "delivered"),
          where("needsAnyReview", "==", true),
        );

        if (filters.productId) {
          q = query(q, where("productId", "==", filters.productId));
        }
        if (filters.sellerId) {
          q = query(q, where("sellerId", "==", filters.sellerId));
        }
        if (filters.startDate) {
          q = query(
            q,
            where("timestamp", ">=", Timestamp.fromDate(filters.startDate)),
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

        const hasMore = newReviews.length === PAGE_SIZE;
        setPendingHasMore(hasMore);

        if (reset) {
          setPendingReviews(newReviews);
        } else {
          setPendingReviews((prev) => {
            const combined = [...prev, ...newReviews];
            const uniqueMap = new Map();
            combined.forEach((review) => {
              uniqueMap.set(`${review.orderId}_${review.id}`, review);
            });
            return Array.from(uniqueMap.values());
          });
        }

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
    [user, filters, pendingLoading, pendingLastDoc, pendingHasMore],
  );

  const loadMyReviews = useCallback(
    async (reset = false) => {
      if (!user) return;
      if (myReviewsLoading) return;
      if (!reset && !myReviewsHasMore) return;

      setMyReviewsLoading(true);
      try {
        let q = query(
          collectionGroup(db, "reviews"),
          where("userId", "==", user.uid),
        );

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
            where("timestamp", ">=", Timestamp.fromDate(filters.startDate)),
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
            }) as Review,
        );

        const hasMore = newReviews.length === PAGE_SIZE;
        setMyReviewsHasMore(hasMore);

        if (reset) {
          setMyReviews(newReviews);
        } else {
          setMyReviews((prev) => {
            const combined = [...prev, ...newReviews];
            const uniqueMap = new Map();
            combined.forEach((review) => {
              uniqueMap.set(`${review.orderId}_${review.id}`, review);
            });
            return Array.from(uniqueMap.values());
          });
        }

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
    [user, filters, myReviewsLoading, myReviewsLastDoc, myReviewsHasMore],
  );

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Load initial data when user changes
  useEffect(() => {
    if (user) {
      resetPaginationState();
      loadPendingReviews(true);
      loadMyReviews(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load data when filters change
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, user]);

  // Reset filter when switching tabs
  useEffect(() => {
    if (activeTab !== "myReviews") {
      setFilters((prev) => ({ ...prev, reviewType: "all" }));
    }
  }, [activeTab]);

  // Window scroll handler for infinite loading
  useEffect(() => {
    const handleScroll = () => {
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
    loadPendingReviews,
    loadMyReviews,
  ]);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const resetPaginationState = () => {
    setPendingReviews([]);
    setMyReviews([]);
    setPendingLastDoc(null);
    setMyReviewsLastDoc(null);
    setPendingHasMore(true);
    setMyReviewsHasMore(true);
    isLoadingMoreRef.current = false;
  };

  const resetReviewForm = () => {
    setRating(0);
    setReviewText("");
    setReviewImages([]);
    setSelectedReview(null);
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.productId) count++;
    if (filters.sellerId) count++;
    if (filters.startDate) count++;
    if (filters.endDate) count++;
    if (filters.reviewType !== "all") count++;
    return count;
  };

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

  // ============================================================================
  // IMAGE VALIDATION & PROCESSING
  // ============================================================================

  const validateFile = (file: File): ImageValidationResult => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: "file_too_large",
        message: t("imageTooLarge") || "Image is too large (max 10MB)",
      };
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: "invalid_format",
        message:
          t("invalidImageFormat") ||
          "Invalid image format (JPG, PNG, HEIC, WEBP only)",
      };
    }
    return { valid: true };
  };

  const compressImage = async (file: File): Promise<File> => {
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: "image/jpeg",
      };
      const compressedFile = await imageCompression(file, options);
      return compressedFile;
    } catch (error) {
      console.error("Error compressing image:", error);
      return file;
    }
  };

  const processImage = async (
    imageFile: File,
    storagePath: string,
    index: number,
  ): Promise<ImageProcessResult> => {
    if (!user) {
      return {
        success: false,
        error: "no_user",
        message: "User not authenticated",
      };
    }

    try {
      const validation = validateFile(imageFile);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          message: validation.message,
        };
      }

      const compressedFile = await compressImage(imageFile);

      const fileName = `${user.uid}_${Date.now()}_${index}.jpg`;
      const storageRef = ref(storage, `${storagePath}/${fileName}`);

      await uploadBytes(storageRef, compressedFile);
      const imageUrl = await getDownloadURL(storageRef);

      const moderateImageFunction = httpsCallable<
        { imageUrl: string },
        ModerationResult
      >(functions, "moderateImage");

      const result: HttpsCallableResult<ModerationResult> =
        await moderateImageFunction({ imageUrl });
      const data = result.data;

      if (data.approved) {
        return {
          success: true,
          url: imageUrl,
          ref: storageRef.fullPath,
        };
      } else {
        await deleteObject(storageRef);
        return {
          success: false,
          error: data.rejectionReason || "inappropriate_content",
        };
      }
    } catch (error) {
      console.error("Error processing image:", error);
      return {
        success: false,
        error: "processing_error",
        message: "Failed to process image",
      };
    }
  };

  // ============================================================================
  // DATA LOADING FUNCTIONS
  // ============================================================================

  const refreshReviews = useCallback(() => {
    if (user) {
      resetPaginationState();
      loadPendingReviews(true);
      loadMyReviews(true);
    }
  }, [user, loadPendingReviews, loadMyReviews]);

  // ============================================================================
  // IMAGE UPLOAD HANDLING
  // ============================================================================

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const currentCount = reviewImages.length;

    if (currentCount >= MAX_IMAGES) {
      showErrorToast(
        t("maxImagesReached") || `Maximum ${MAX_IMAGES} images allowed`,
      );
      return;
    }

    const remainingSlots = MAX_IMAGES - currentCount;
    const filesToAdd = files.slice(0, remainingSlots);

    const validFiles: File[] = [];
    for (const file of filesToAdd) {
      const validation = validateFile(file);
      if (validation.valid) {
        validFiles.push(file);
      } else {
        showErrorToast(validation.message || "Invalid file");
      }
    }

    setReviewImages((prev) => [...prev, ...validFiles]);
  };

  const removeImage = (index: number) => {
    setReviewImages((prev) => prev.filter((_, i) => i !== index));
  };

  // ============================================================================
  // REVIEW SUBMISSION
  // ============================================================================

  const openReviewModal = (
    review: PendingReview,
    type: "product" | "seller",
  ) => {
    setSelectedReview(review);
    setReviewType(type);
    setShowReviewModal(true);
  };

  const handleReviewSubmit = () => {
    if (rating === 0 || reviewText.trim() === "") {
      showErrorToast(
        t("pleaseProvideRatingAndReview") ||
          "Please provide a rating and review text",
      );
      return;
    }

    setShowReviewModal(false);
    setShowLoadingModal(true);
    submitReviewAsync();
  };

  const submitReviewAsync = async () => {
    if (!user || !selectedReview) {
      setShowLoadingModal(false);
      showErrorToast("Missing user or review data");
      return;
    }

    try {
      const approvedUrls: string[] = [];
      const uploadedRefs: string[] = [];

      if (reviewType === "product" && reviewImages.length > 0) {
        const storagePath = `reviews/${selectedReview.productId}`;

        for (let i = 0; i < reviewImages.length; i++) {
          const result = await processImage(reviewImages[i], storagePath, i);

          if (!result.success) {
            for (const refPath of uploadedRefs) {
              try {
                await deleteObject(ref(storage, refPath));
              } catch (error) {
                console.error("Error deleting image:", error);
              }
            }

            setShowLoadingModal(false);

            let message = `Image ${i + 1}: `;
            if (result.message) {
              message += result.message;
            } else {
              switch (result.error) {
                case "adult_content":
                  message += "Contains inappropriate adult content";
                  break;
                case "violent_content":
                  message += "Contains violent content";
                  break;
                case "file_too_large":
                  message += "File too large (max 10MB)";
                  break;
                case "invalid_format":
                  message += "Invalid format (JPG, PNG, HEIC, WEBP only)";
                  break;
                case "processing_error":
                  message += "Failed to process image";
                  break;
                default:
                  message += "Inappropriate content detected";
              }
            }

            showErrorToast(message);
            resetReviewForm();
            return;
          }

          if (result.url && result.ref) {
            approvedUrls.push(result.url);
            uploadedRefs.push(result.ref);
          }
        }
      }

      const submitReviewFunction = httpsCallable<
        SubmitReviewData,
        SubmitReviewResult
      >(functions, "submitReview");

      const reviewData: SubmitReviewData = {
        isProduct: reviewType === "product",
        isShopProduct: selectedReview.isShopProduct,
        productId:
          reviewType === "product" ? selectedReview.productId : undefined,
        sellerId: selectedReview.sellerId,
        shopId: selectedReview.shopId,
        transactionId: selectedReview.id,
        orderId: selectedReview.orderId,
        rating,
        review: reviewText.trim(),
        imageUrls: approvedUrls,
      };

      const result = await submitReviewFunction(reviewData);

      setShowLoadingModal(false);

      if (result.data.success) {
        showSuccessToast(
          t("reviewSubmittedSuccessfully") || "Review submitted successfully!",
        );
        resetReviewForm();
        refreshReviews();
      } else {
        showErrorToast(result.data.message || "Failed to submit review");
        resetReviewForm();
      }
    } catch (error) {
      setShowLoadingModal(false);
      console.error("Error submitting review:", error);

      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";

      showErrorToast(errorMessage);
      resetReviewForm();
    }
  };

  // ============================================================================
  // TOAST NOTIFICATIONS
  // ============================================================================

  const showSuccessToast = (message: string) => {
    alert(message);
  };

  const showErrorToast = (message: string) => {
    alert(message);
  };

  // ============================================================================
  // UI HELPERS
  // ============================================================================

  const renderStars = (ratingValue: number, size: "sm" | "md" = "sm") => (
    <div className="flex items-center gap-px">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${size === "sm" ? "w-3 h-3" : "w-5 h-5"} ${
            star <= ratingValue
              ? "fill-amber-400 text-amber-400"
              : "text-gray-200"
          }`}
        />
      ))}
    </div>
  );

  const activeFilterCount = getActiveFiltersCount();
  const currentCount =
    activeTab === "pending"
      ? pendingReviews.length
      : getFilteredMyReviews().length;

  // ============================================================================
  // RENDER
  // ============================================================================

  if (authLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center pt-20 ${isDarkMode ? "bg-gray-950" : "bg-gray-50"}`}>
        <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const filteredMyReviews = getFilteredMyReviews();

  const cardClass = isDarkMode
    ? "bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
    : "bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all";
  const cardBorderClass = isDarkMode ? "border-b border-gray-800" : "border-b border-gray-50";
  const headingColor = isDarkMode ? "text-white" : "text-gray-900";
  const mutedColor = isDarkMode ? "text-gray-500" : "text-gray-400";
  const bodyColor = isDarkMode ? "text-gray-300" : "text-gray-600";
  const thumbBg = isDarkMode ? "bg-gray-800" : "bg-gray-50";
  const inputClass = isDarkMode
    ? "w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
    : "w-full px-3 py-2 text-sm bg-gray-50/80 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 outline-none transition-all";

  return (
    <div className={`min-h-screen ${isDarkMode ? "bg-gray-950" : "bg-gray-50"}`}>
      {/* Sticky Toolbar */}
      <div className={`sticky top-14 z-30 backdrop-blur-xl border-b ${isDarkMode ? "bg-gray-950/80 border-gray-800/80" : "bg-white/80 border-gray-100/80"}`}>
        <div className="max-w-4xl mx-auto">
          {/* Row 1: Nav + Title + Actions */}
          <div className="flex items-center gap-3 px-3 sm:px-6 py-2">
            <button
              onClick={() => router.back()}
              className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${isDarkMode ? "bg-gray-800 border-gray-700 hover:bg-gray-700" : "bg-gray-50 border-gray-200 hover:bg-gray-100"}`}
            >
              <ArrowLeft className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`} />
            </button>
            <h1 className={`text-lg font-bold truncate ${headingColor}`}>
              {t("title") || "My Reviews"}
            </h1>
            {currentCount > 0 && (
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full flex-shrink-0 ${isDarkMode ? "bg-orange-950/50 text-orange-400" : "bg-orange-50 text-orange-600"}`}>
                {currentCount}
              </span>
            )}
            <div className="flex-1" />

            {/* Filter button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`relative w-9 h-9 flex items-center justify-center border rounded-xl transition-all flex-shrink-0 ${
                showFilters
                  ? "bg-orange-500 border-orange-500 text-white"
                  : isDarkMode
                    ? "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700"
                    : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
              }`}
            >
              <Filter className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Row 2: Tab pills */}
          <div className="px-3 sm:px-6 pb-2.5">
            <div className={`flex gap-1 rounded-xl p-1 ${isDarkMode ? "bg-gray-800/80" : "bg-gray-100/80"}`}>
              <button
                onClick={() => setActiveTab("pending")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "pending"
                    ? isDarkMode ? "bg-gray-700 text-white shadow-sm" : "bg-white text-gray-900 shadow-sm"
                    : isDarkMode ? "text-gray-400 hover:text-gray-300" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                {t("toReview") || "To Review"}
                {pendingReviews.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === "pending"
                        ? isDarkMode ? "bg-orange-900/50 text-orange-400" : "bg-orange-100 text-orange-600"
                        : isDarkMode ? "bg-gray-700 text-gray-400" : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {pendingReviews.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("myReviews")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "myReviews"
                    ? isDarkMode ? "bg-gray-700 text-white shadow-sm" : "bg-white text-gray-900 shadow-sm"
                    : isDarkMode ? "text-gray-400 hover:text-gray-300" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Star className="w-3.5 h-3.5" />
                {t("myRatings") || "My Ratings"}
                {filteredMyReviews.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === "myReviews"
                        ? isDarkMode ? "bg-green-900/50 text-green-400" : "bg-green-100 text-green-600"
                        : isDarkMode ? "bg-gray-700 text-gray-400" : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {filteredMyReviews.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4">
        {/* Filter Panel */}
        {showFilters && (
          <div className={`rounded-2xl border p-4 mb-4 ${isDarkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${mutedColor}`}>
                {t("filter") || "Filters"}
              </span>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setFilters({ reviewType: "all" });
                  }}
                  className="text-[11px] text-orange-600 hover:text-orange-700 font-semibold"
                >
                  {t("clearFilters") || "Clear filters"}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {activeTab === "myReviews" && (
                <div>
                  <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                    {t("type") || "Type"}
                  </label>
                  <select
                    value={filters.reviewType}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        reviewType: e.target.value as
                          | "all"
                          | "product"
                          | "seller",
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="all">{t("all") || "All"}</option>
                    <option value="product">{t("product") || "Product"}</option>
                    <option value="seller">{t("seller") || "Seller"}</option>
                  </select>
                </div>
              )}

              <div>
                <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                  {t("startDate") || "Start Date"}
                </label>
                <input
                  type="date"
                  value={filters.startDate?.toISOString().split("T")[0] || ""}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      startDate: e.target.value
                        ? new Date(e.target.value)
                        : undefined,
                    }))
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                  {t("endDate") || "End Date"}
                </label>
                <input
                  type="date"
                  value={filters.endDate?.toISOString().split("T")[0] || ""}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      endDate: e.target.value
                        ? new Date(e.target.value)
                        : undefined,
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}

        {/* Pending Reviews Tab */}
        {activeTab === "pending" ? (
          <div className="space-y-3">
            {pendingReviews.length === 0 && !pendingLoading ? (
              <div className="text-center py-16">
                <Star className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-700" : "text-gray-300"}`} />
                <h3 className={`text-sm font-semibold mb-1 ${headingColor}`}>
                  {t("nothingToReview") || "Nothing to Review"}
                </h3>
                <p className={`text-xs max-w-xs mx-auto ${mutedColor}`}>
                  {t("noUnreviewedPurchases") ||
                    "You have no unreviewed purchases"}
                </p>
              </div>
            ) : (
              pendingReviews.map((review) => (
                <div
                  key={`${review.orderId}_${review.id}`}
                  className={cardClass}
                >
                  {/* Product header */}
                  <div
                    className={`px-4 py-3 ${cardBorderClass} flex items-center gap-3 cursor-pointer`}
                    onClick={() =>
                      router.push(`/productdetail/${review.productId}`)
                    }
                  >
                    <div className={`w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 relative ${thumbBg}`}>
                      {review.productImage ? (
                        <Image
                          src={review.productImage}
                          alt={review.productName}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className={`w-4 h-4 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold text-sm truncate ${headingColor}`}>
                        {review.productName}
                      </h3>
                      <p className="text-xs font-bold text-orange-600 mt-0.5">
                        ₺{review.productPrice.toLocaleString()}
                      </p>
                    </div>
                    <span className={`text-[11px] flex-shrink-0 ${mutedColor}`}>
                      {review.timestamp?.toDate().toLocaleDateString("tr-TR")}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="px-4 py-3 flex items-center gap-2">
                    {review.needsProductReview && (
                      <button
                        onClick={() => openReviewModal(review, "product")}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
                      >
                        <Star className="w-3.5 h-3.5" />
                        {t("writeYourReview") || "Write Your Review"}
                      </button>
                    )}
                    {review.needsSellerReview && (
                      <button
                        onClick={() => openReviewModal(review, "seller")}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl transition-colors text-xs font-medium ${isDarkMode ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                      >
                        <Store className="w-3.5 h-3.5" />
                        {review.isShopProduct
                          ? t("shopReview") || "Shop Review"
                          : t("sellerReview") || "Seller Review"}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}

            {pendingLoading && (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
              </div>
            )}
          </div>
        ) : (
          /* My Reviews Tab */
          <div className="space-y-3">
            {filteredMyReviews.length === 0 && !myReviewsLoading ? (
              <div className="text-center py-16">
                <Star className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-700" : "text-gray-300"}`} />
                <h3 className={`text-sm font-semibold mb-1 ${headingColor}`}>
                  {t("youHaveNoReviews") || "You Have No Reviews"}
                </h3>
                <p className={`text-xs max-w-xs mx-auto ${mutedColor}`}>
                  {t("startReviewingProducts") ||
                    "Start reviewing products you've purchased"}
                </p>
              </div>
            ) : (
              filteredMyReviews.map((review) => (
                <div
                  key={`${review.orderId}_${review.id}`}
                  className={cardClass}
                >
                  {/* Product/Seller header */}
                  {review.productId ? (
                    <div
                      className={`px-4 py-3 ${cardBorderClass} flex items-center gap-3 cursor-pointer`}
                      onClick={() =>
                        router.push(`/productdetail/${review.productId}`)
                      }
                    >
                      <div className={`w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 relative ${thumbBg}`}>
                        {review.productImage ? (
                          <Image
                            src={review.productImage}
                            alt={review.productName || "Product"}
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className={`w-4 h-4 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold text-sm truncate ${headingColor}`}>
                          {review.productName}
                        </h3>
                        {review.productPrice && (
                          <p className="text-xs font-bold text-orange-600 mt-0.5">
                            ₺{review.productPrice.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {renderStars(review.rating)}
                        <span className={`text-[11px] ${mutedColor}`}>
                          {review.timestamp
                            ?.toDate()
                            .toLocaleDateString("tr-TR")}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className={`px-4 py-3 ${cardBorderClass} flex items-center gap-3`}>
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDarkMode ? "bg-orange-950/50" : "bg-orange-50"}`}>
                        <Store className="w-4 h-4 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold text-sm ${headingColor}`}>
                          {t("sellerReview") || "Seller Review"}
                        </h3>
                        <p className={`text-xs mt-0.5 ${mutedColor}`}>
                          {review.sellerName || "Unknown Seller"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {renderStars(review.rating)}
                        <span className={`text-[11px] ${mutedColor}`}>
                          {review.timestamp
                            ?.toDate()
                            .toLocaleDateString("tr-TR")}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Review body */}
                  <div className="px-4 py-3">
                    {review.imageUrls && review.imageUrls.length > 0 && (
                      <div className="flex gap-2 mb-2.5">
                        {review.imageUrls.map((url, idx) => (
                          <button
                            key={idx}
                            onClick={() => setSelectedImage(url)}
                            className={`w-14 h-14 rounded-xl overflow-hidden hover:opacity-80 transition-opacity relative flex-shrink-0 ${thumbBg}`}
                          >
                            <Image
                              src={url}
                              alt={`Review image ${idx + 1}`}
                              fill
                              className="object-cover"
                              sizes="56px"
                            />
                          </button>
                        ))}
                      </div>
                    )}

                    {review.review && (
                      <p className={`text-sm leading-relaxed ${bodyColor}`}>
                        {review.review}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}

            {myReviewsLoading && (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Review Modal */}
      {showReviewModal && selectedReview && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className={`rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto ${isDarkMode ? "bg-gray-900" : "bg-white"}`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}>
              <h3 className={`text-base font-bold ${headingColor}`}>
                {reviewType === "product"
                  ? t("productReview") || "Product Review"
                  : t("sellerReview") || "Seller Review"}
              </h3>
              <button
                onClick={() => {
                  setShowReviewModal(false);
                  resetReviewForm();
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"}`}
              >
                <X className={`w-4 h-4 ${mutedColor}`} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
              {/* Star Rating */}
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          star <= rating
                            ? "fill-amber-400 text-amber-400"
                            : isDarkMode ? "text-gray-600" : "text-gray-200"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <p className={`text-[11px] ${mutedColor}`}>
                  {t("tapToRate") || "Tap to rate"}
                </p>
              </div>

              {/* Review Text */}
              <div>
                <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                  {t("yourReview") || "Your Review"}
                </label>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  placeholder={
                    t("pleaseEnterYourReview") || "Please enter your review..."
                  }
                  rows={4}
                  className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none resize-none transition-all ${isDarkMode ? "bg-gray-800 border-gray-700 text-gray-200 focus:border-orange-500 placeholder-gray-500" : "border-gray-200 focus:border-orange-300"}`}
                />
              </div>

              {/* Image Upload - product reviews only */}
              {reviewType === "product" && (
                <div>
                  <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                    {t("uploadPhotos") || "Upload Photos"}
                  </label>

                  {reviewImages.length > 0 && (
                    <div className="flex gap-2 mb-2.5">
                      {reviewImages.map((file, index) => (
                        <div
                          key={index}
                          className={`w-14 h-14 rounded-xl overflow-hidden relative flex-shrink-0 ${thumbBg}`}
                        >
                          <Image
                            src={URL.createObjectURL(file)}
                            alt={`New image ${index + 1}`}
                            fill
                            className="object-cover"
                            sizes="56px"
                          />
                          <button
                            onClick={() => removeImage(index)}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {reviewImages.length < MAX_IMAGES && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed transition-colors text-xs ${isDarkMode ? "border-gray-700 text-gray-400 hover:border-orange-500" : "border-gray-200 text-gray-500 hover:border-orange-300"}`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {t("addImage") || "Add Image"}
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
            </div>

            {/* Footer */}
            <div className={`flex gap-2 p-4 border-t ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}>
              <button
                onClick={() => {
                  setShowReviewModal(false);
                  resetReviewForm();
                }}
                className={`flex-1 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium ${isDarkMode ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                {t("cancel") || "Cancel"}
              </button>
              <button
                onClick={handleReviewSubmit}
                disabled={rating === 0 || !reviewText.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                <Send className="w-3.5 h-3.5" />
                {t("submit") || "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Modal */}
      {showLoadingModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`rounded-2xl p-8 max-w-sm w-full shadow-2xl ${isDarkMode ? "bg-gray-900" : "bg-white"}`}>
            <div className="flex flex-col items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDarkMode ? "bg-orange-950/50" : "bg-orange-50"}`}>
                <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
              </div>
              <div className="text-center">
                <h3 className={`text-sm font-semibold mb-1 ${headingColor}`}>
                  {t("submittingReview") || "Submitting Review..."}
                </h3>
                <p className={`text-xs ${mutedColor}`}>
                  {t("pleaseWaitWhileWeProcessYourReview") ||
                    "Please wait while we process your review"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <button
            onClick={() => setSelectedImage(null)}
            className="fixed top-4 right-4 z-50 w-9 h-9 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-xl text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div
            className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={selectedImage}
              alt="Review image"
              width={800}
              height={600}
              className="max-w-full max-h-[90vh] w-auto h-auto object-contain rounded-2xl"
              priority
            />
          </div>
        </div>
      )}
    </div>
  );
}
