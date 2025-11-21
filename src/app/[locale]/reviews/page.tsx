"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Star,
  Filter,
  Calendar,

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
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { httpsCallable, HttpsCallableResult } from "firebase/functions";
import { useTranslations } from "next-intl";
import Image from "next/image";
import imageCompression from "browser-image-compression";

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
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
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
  const { user } = useUser();
  const t = useTranslations("Reviews");

  // ============================================================================
  // STATE
  // ============================================================================

  const [activeTab, setActiveTab] = useState<ReviewTab>("pending");
  const [filters, setFilters] = useState<FilterOptions>({ reviewType: "all" });
  const [isDarkMode, setIsDarkMode] = useState(false);

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
    null
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
          where("buyerId", "==", user.uid)
        );

        // Apply filters
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

        const hasMore = newReviews.length === PAGE_SIZE;
        setPendingHasMore(hasMore);

        if (reset) {
          setPendingReviews(newReviews);
        } else {
          setPendingReviews((prev) => {
            const combined = [...prev, ...newReviews];
            const uniqueMap = new Map();
            combined.forEach((review) => {
              uniqueMap.set(review.id, review);
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
    [user, filters, pendingLoading, pendingLastDoc, pendingHasMore]
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
          where("userId", "==", user.uid)
        );

        // Apply filters based on review type
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

        const hasMore = newReviews.length === PAGE_SIZE;
        setMyReviewsHasMore(hasMore);

        if (reset) {
          setMyReviews(newReviews);
        } else {
          setMyReviews((prev) => {
            const combined = [...prev, ...newReviews];
            const uniqueMap = new Map();
            combined.forEach((review) => {
              uniqueMap.set(review.id, review);
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
    [user, filters, myReviewsLoading, myReviewsLastDoc, myReviewsHasMore]
  );

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

  const formatDate = (timestamp: Timestamp) => {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(timestamp.toDate());
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.productId) count++;
    if (filters.sellerId) count++;
    if (filters.startDate || filters.endDate) count++;
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
  // IMAGE VALIDATION & PROCESSING (Like Flutter)
  // ============================================================================

  const validateFile = (file: File): ImageValidationResult => {
    // Check file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: "file_too_large",
        message: t("imageTooLarge") || "Image is too large (max 10MB)",
      };
    }

    // Check file type
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
      return file; // Return original if compression fails
    }
  };

  const processImage = async (
    imageFile: File,
    storagePath: string,
    index: number
  ): Promise<ImageProcessResult> => {
    if (!user) {
      return {
        success: false,
        error: "no_user",
        message: "User not authenticated",
      };
    }

    try {
      // 1. Validate file first
      const validation = validateFile(imageFile);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          message: validation.message,
        };
      }

      // 2. Compress
      const compressedFile = await compressImage(imageFile);

      // 3. Upload to Storage
      const fileName = `${user.uid}_${Date.now()}_${index}.jpg`;
      const storageRef = ref(storage, `${storagePath}/${fileName}`);

      await uploadBytes(storageRef, compressedFile);
      const imageUrl = await getDownloadURL(storageRef);

      // 4. Moderate via Cloud Function
      const moderateImageFunction = httpsCallable
        <{ imageUrl: string },
        ModerationResult
      >(functions, "moderateImage");

      const result: HttpsCallableResult<ModerationResult> =
        await moderateImageFunction({ imageUrl });
      const data = result.data;

      if (data.approved) {
        // Approved - keep it
        return {
          success: true,
          url: imageUrl,
          ref: storageRef.fullPath,
        };
      } else {
        // Rejected - delete it
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
        t("maxImagesReached") || `Maximum ${MAX_IMAGES} images allowed`
      );
      return;
    }

    const remainingSlots = MAX_IMAGES - currentCount;
    const filesToAdd = files.slice(0, remainingSlots);

    // Validate each file before adding
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
  // REVIEW SUBMISSION (Like Flutter with Two-Modal System)
  // ============================================================================

  const openReviewModal = (
    review: PendingReview,
    type: "product" | "seller"
  ) => {
    setSelectedReview(review);
    setReviewType(type);
    setShowReviewModal(true);
  };

  const handleReviewSubmit = () => {
    // Validate inputs
    if (rating === 0 || reviewText.trim() === "") {
      showErrorToast(
        t("pleaseProvideRatingAndReview") ||
          "Please provide a rating and review text"
      );
      return;
    }

    // Close review modal immediately (like Flutter)
    setShowReviewModal(false);

    // Show loading modal
    setShowLoadingModal(true);

    // Start async submission
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

      // Process images if this is a product review
      if (reviewType === "product" && reviewImages.length > 0) {
        const storagePath = `reviews/${selectedReview.productId}`;

        for (let i = 0; i < reviewImages.length; i++) {
          const result = await processImage(reviewImages[i], storagePath, i);

          if (!result.success) {
            // Clean up previously uploaded images
            for (const refPath of uploadedRefs) {
              try {
                await deleteObject(ref(storage, refPath));
              } catch (error) {
                console.error("Error deleting image:", error);
              }
            }

            setShowLoadingModal(false);

            // Show detailed error message
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

      // Call submitReview Cloud Function (like Flutter)
      const submitReviewFunction = httpsCallable
        <SubmitReviewData,
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
          t("reviewSubmittedSuccessfully") || "Review submitted successfully!"
        );

        // Reset form and refresh data
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
        error instanceof Error
          ? error.message
          : "An unexpected error occurred";
      
      showErrorToast(errorMessage);
      resetReviewForm();
    }
  };

  // ============================================================================
  // TOAST NOTIFICATIONS
  // ============================================================================

  const showSuccessToast = (message: string) => {
    // You can replace this with your toast library
    alert(message);
  };

  const showErrorToast = (message: string) => {
    // You can replace this with your toast library
    alert(message);
  };

  // ============================================================================
  // UI COMPONENTS
  // ============================================================================

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

  const LoadingModal = () => (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className={`
          rounded-2xl p-8 max-w-sm w-full
          ${isDarkMode ? "bg-gray-800" : "bg-white"}
          shadow-2xl
        `}
      >
        <div className="flex flex-col items-center space-y-4">
          {/* Animated Icon */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-green-600 rounded-full blur-xl opacity-50 animate-pulse"></div>
            <div
              className="relative w-20 h-20 bg-gradient-to-r from-green-400 to-green-600 rounded-full flex items-center justify-center animate-spin"
              style={{ animationDuration: "3s" }}
            >
              <Star size={32} className="text-white" />
            </div>
          </div>

          {/* Text */}
          <div className="text-center space-y-2">
            <h3
              className={`
                text-lg font-semibold
                ${isDarkMode ? "text-white" : "text-gray-900"}
              `}
            >
              {t("submittingReview") || "Submitting Review..."}
            </h3>
            <p
              className={`
                text-sm
                ${isDarkMode ? "text-gray-400" : "text-gray-600"}
              `}
            >
              {t("pleaseWaitWhileWeProcessYourReview") ||
                "Please wait while we process your review"}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full animate-pulse"
              style={{
                animation: "progress 2s ease-in-out infinite",
              }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );

  // ============================================================================
  // RENDER
  // ============================================================================

  if (!user) {
    return null;
  }

  const filteredMyReviews = getFilteredMyReviews();

  return (
    <>
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
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
                {pendingReviews.map((review) => (
                  <div
                    key={review.id}
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
          ) : filteredMyReviews.length === 0 && !myReviewsLoading ? (
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
              {filteredMyReviews.map((review) => (
                <div
                  key={review.id}
                  className={`
                      rounded-lg border p-4 space-y-4
                      ${
                        isDarkMode
                          ? "bg-gray-800 border-gray-700"
                          : "bg-white border-gray-200"
                      }
                    `}
                >
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
                      onClick={() =>
                        router.push(`/productdetail/${review.productId}`)
                      }
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
                                    isDarkMode
                                      ? "text-green-400"
                                      : "text-green-600"
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
                </div>
              ))}
            </div>
          )}

          {(pendingLoading || myReviewsLoading) && (
            <div className="flex justify-center py-8">
              <RefreshCw size={24} className="animate-spin text-green-500" />
            </div>
          )}
        </div>
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

                  {reviewImages.length > 0 && (
                    <div className="flex space-x-2 overflow-x-auto">
                      {reviewImages.map((file, index) => (
                        <div
                          key={index}
                          className="relative w-16 h-16 flex-shrink-0"
                        >
                          <Image
                            src={URL.createObjectURL(file)}
                            alt={`New image ${index + 1}`}
                            fill
                            className="object-cover rounded-lg"
                          />
                          <button
                            onClick={() => removeImage(index)}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {reviewImages.length < MAX_IMAGES && (
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
                  onClick={handleReviewSubmit}
                  disabled={rating === 0 || !reviewText.trim()}
                  className="
                      flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg
                      bg-green-500 text-white hover:bg-green-600
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition-colors duration-200
                    "
                >
                  <Send size={16} />
                  <span>{t("submit") || "Submit"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading Modal */}
      {showLoadingModal && <LoadingModal />}
    
    </>
  );
}