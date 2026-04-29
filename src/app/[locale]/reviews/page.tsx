"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Star,
  Filter,
  X,
  Send,
  Store,
  ShoppingBag,
  ShoppingBasket,
  Camera,
  ArrowLeft,
  Package,
  UtensilsCrossed,
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
  collection,
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
import SmartImage from "@/app/components/SmartImage";
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

// Food order pending review
interface FoodPendingReview {
  id: string; // order doc id
  restaurantId: string;
  restaurantName: string;
  restaurantProfileImage?: string;
  items: { name: string; quantity: number }[];
  totalPrice: number;
  currency: string;
  createdAt: Timestamp;
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

// Submitted food review (stored under restaurants/{id}/reviews)
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

// Pending market order awaiting review (orders-market with needsReview=true)
interface MarketPendingReview {
  id: string;
  items: { name: string; quantity: number; brand?: string }[];
  totalPrice: number;
  currency: string;
  createdAt: Timestamp;
}

// Submitted market review (stored under nar24market/stats/reviews)
interface MarketReview {
  id: string;
  orderId: string;
  rating: number;
  comment: string;
  imageUrls: string[];
  timestamp: Timestamp;
}

interface FilterOptions {
  productId?: string;
  sellerId?: string;
  startDate?: Date;
  endDate?: Date;
  reviewType: "all" | "product" | "seller" | "food" | "market";
}

type ReviewTab = "pending" | "myReviews";
// "food" and "market" are separate modal categories, not tabs
type ReviewCategory = "product" | "seller" | "food" | "market";

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

interface SubmitFoodReviewData {
  orderId: string;
  restaurantId: string;
  rating: number;
  comment: string;
  imageUrls: string[]; // ← just add this line
}

interface SubmitMarketReviewData {
  orderId: string;
  rating: number;
  comment: string;
  imageUrls: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FOOD_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const PAGE_SIZE = 20;
const FOOD_PAGE_SIZE = 20;
const MARKET_PAGE_SIZE = 20;
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

  // Pending product reviews state
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingHasMore, setPendingHasMore] = useState(true);
  const [pendingLastDoc, setPendingLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // Pending food reviews state
  const [foodPendingReviews, setFoodPendingReviews] = useState<
    FoodPendingReview[]
  >([]);
  const [foodPendingLoading, setFoodPendingLoading] = useState(false);
  const [foodPendingHasMore, setFoodPendingHasMore] = useState(true);
  const [foodPendingLastDoc, setFoodPendingLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // My product reviews state
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [myReviewsLoading, setMyReviewsLoading] = useState(false);
  const [myReviewsHasMore, setMyReviewsHasMore] = useState(true);
  const [myReviewsLastDoc, setMyReviewsLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // My food reviews state
  const [myFoodReviews, setMyFoodReviews] = useState<FoodReview[]>([]);
  const [myFoodReviewsLoading, setMyFoodReviewsLoading] = useState(false);
  const [myFoodReviewsHasMore, setMyFoodReviewsHasMore] = useState(true);
  const [myFoodReviewsLastDoc, setMyFoodReviewsLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // Pending market reviews state (orders-market with needsReview=true)
  const [marketPendingReviews, setMarketPendingReviews] = useState<
    MarketPendingReview[]
  >([]);
  const [marketPendingLoading, setMarketPendingLoading] = useState(false);
  const [marketPendingHasMore, setMarketPendingHasMore] = useState(true);
  const [marketPendingLastDoc, setMarketPendingLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // My market reviews state (nar24market/stats/reviews where buyerId == uid)
  const [myMarketReviews, setMyMarketReviews] = useState<MarketReview[]>([]);
  const [myMarketReviewsLoading, setMyMarketReviewsLoading] = useState(false);
  const [myMarketReviewsHasMore, setMyMarketReviewsHasMore] = useState(true);
  const [myMarketReviewsLastDoc, setMyMarketReviewsLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // Modal states
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(
    null,
  );
  const [selectedFoodReview, setSelectedFoodReview] =
    useState<FoodPendingReview | null>(null);
  const [selectedMarketReview, setSelectedMarketReview] =
    useState<MarketPendingReview | null>(null);

  // Review form state
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewImages, setReviewImages] = useState<File[]>([]);
  const [reviewCategory, setReviewCategory] =
    useState<ReviewCategory>("product");

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevFilters = useRef(filters);
  const isLoadingMoreRef = useRef(false);

  // ============================================================================
  // LOAD FUNCTIONS
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

          // Only include if at least one review is still needed
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

  const loadFoodPendingReviews = useCallback(
    async (reset = false) => {
      if (!user) return;
      if (foodPendingLoading) return;
      if (!reset && !foodPendingHasMore) return;

      setFoodPendingLoading(true);
      try {
        let q = query(
          collection(db, "orders-food"),
          where("buyerId", "==", user.uid),
          where("needsReview", "==", true),
          orderBy("createdAt", "desc"),
          limit(FOOD_PAGE_SIZE),
        );

        if (!reset && foodPendingLastDoc) {
          q = query(q, startAfter(foodPendingLastDoc));
        }

        const snapshot = await getDocs(q);
        const newOrders: FoodPendingReview[] = snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            restaurantId: d.restaurantId || "",
            restaurantName: d.restaurantName || "",
            restaurantProfileImage: d.restaurantProfileImage || "",
            items: Array.isArray(d.items)
              ? d.items.map((i: { name: string; quantity: number }) => ({
                  name: i.name,
                  quantity: i.quantity,
                }))
              : [],
            totalPrice: d.totalPrice || 0,
            currency: d.currency || "TL",
            createdAt: d.createdAt,
          };
        });

        const hasMore = newOrders.length === FOOD_PAGE_SIZE;
        setFoodPendingHasMore(hasMore);

        if (reset) {
          setFoodPendingReviews(newOrders);
        } else {
          setFoodPendingReviews((prev) => {
            const combined = [...prev, ...newOrders];
            const uniqueMap = new Map();
            combined.forEach((o) => uniqueMap.set(o.id, o));
            return Array.from(uniqueMap.values());
          });
        }

        if (newOrders.length > 0) {
          setFoodPendingLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        } else if (reset) {
          setFoodPendingLastDoc(null);
        }
      } catch (error) {
        console.error("Error loading food pending reviews:", error);
      } finally {
        setFoodPendingLoading(false);
      }
    },
    [user, foodPendingLoading, foodPendingLastDoc, foodPendingHasMore],
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
          (doc) => ({ id: doc.id, ...doc.data() }) as Review,
        );

        const hasMore = newReviews.length === PAGE_SIZE;
        setMyReviewsHasMore(hasMore);

        if (reset) {
          setMyReviews(newReviews);
        } else {
          setMyReviews((prev) => {
            const combined = [...prev, ...newReviews];
            const uniqueMap = new Map();
            combined.forEach((r) => uniqueMap.set(`${r.orderId}_${r.id}`, r));
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

  const loadMyFoodReviews = useCallback(
    async (reset = false) => {
      if (!user) return;
      if (myFoodReviewsLoading) return;
      if (!reset && !myFoodReviewsHasMore) return;

      setMyFoodReviewsLoading(true);
      try {
        // Food reviews are stored under restaurants/{id}/reviews with buyerId field
        let q = query(
          collectionGroup(db, "food-reviews"),
          where("buyerId", "==", user.uid),
          orderBy("timestamp", "desc"),
          limit(FOOD_PAGE_SIZE),
        );

        if (!reset && myFoodReviewsLastDoc) {
          q = query(q, startAfter(myFoodReviewsLastDoc));
        }

        const snapshot = await getDocs(q);
        const newReviews = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as FoodReview,
        );

        const hasMore = newReviews.length === FOOD_PAGE_SIZE;
        setMyFoodReviewsHasMore(hasMore);

        if (reset) {
          setMyFoodReviews(newReviews);
        } else {
          setMyFoodReviews((prev) => {
            const combined = [...prev, ...newReviews];
            const uniqueMap = new Map();
            combined.forEach((r) => uniqueMap.set(r.id, r));
            return Array.from(uniqueMap.values());
          });
        }

        if (newReviews.length > 0) {
          setMyFoodReviewsLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        } else if (reset) {
          setMyFoodReviewsLastDoc(null);
        }
      } catch (error) {
        console.error("Error loading food reviews:", error);
      } finally {
        setMyFoodReviewsLoading(false);
      }
    },
    [user, myFoodReviewsLoading, myFoodReviewsLastDoc, myFoodReviewsHasMore],
  );

  // Pending market orders awaiting review — same shape as Flutter's
  // _fetchMarketPendingPage: orders-market filtered by buyerId + needsReview.
  const loadMarketPendingReviews = useCallback(
    async (reset = false) => {
      if (!user) return;
      if (marketPendingLoading) return;
      if (!reset && !marketPendingHasMore) return;

      setMarketPendingLoading(true);
      try {
        let q = query(
          collection(db, "orders-market"),
          where("buyerId", "==", user.uid),
          where("needsReview", "==", true),
          orderBy("createdAt", "desc"),
          limit(MARKET_PAGE_SIZE),
        );

        if (!reset && marketPendingLastDoc) {
          q = query(q, startAfter(marketPendingLastDoc));
        }

        const snapshot = await getDocs(q);
        const newOrders: MarketPendingReview[] = snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            items: Array.isArray(d.items)
              ? d.items.map(
                  (i: { name?: string; quantity?: number; brand?: string }) => ({
                    name: i.name ?? "",
                    quantity: i.quantity ?? 1,
                    brand: i.brand ?? "",
                  }),
                )
              : [],
            totalPrice: d.totalPrice || 0,
            currency: d.currency || "TL",
            createdAt: d.createdAt,
          };
        });

        const hasMore = newOrders.length === MARKET_PAGE_SIZE;
        setMarketPendingHasMore(hasMore);

        if (reset) {
          setMarketPendingReviews(newOrders);
        } else {
          setMarketPendingReviews((prev) => {
            const combined = [...prev, ...newOrders];
            const uniqueMap = new Map<string, MarketPendingReview>();
            combined.forEach((o) => uniqueMap.set(o.id, o));
            return Array.from(uniqueMap.values());
          });
        }

        if (newOrders.length > 0) {
          setMarketPendingLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        } else if (reset) {
          setMarketPendingLastDoc(null);
        }
      } catch (error) {
        console.error("Error loading market pending reviews:", error);
      } finally {
        setMarketPendingLoading(false);
      }
    },
    [user, marketPendingLoading, marketPendingLastDoc, marketPendingHasMore],
  );

  // My submitted market reviews — Flutter reads from nar24market/stats/reviews
  // and filters by buyerId. Same here.
  const loadMyMarketReviews = useCallback(
    async (reset = false) => {
      if (!user) return;
      if (myMarketReviewsLoading) return;
      if (!reset && !myMarketReviewsHasMore) return;

      setMyMarketReviewsLoading(true);
      try {
        let q = query(
          collection(db, "nar24market", "stats", "reviews"),
          where("buyerId", "==", user.uid),
          orderBy("timestamp", "desc"),
          limit(MARKET_PAGE_SIZE),
        );

        if (!reset && myMarketReviewsLastDoc) {
          q = query(q, startAfter(myMarketReviewsLastDoc));
        }

        const snapshot = await getDocs(q);
        const newReviews: MarketReview[] = snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            orderId: (d.orderId as string) ?? "",
            rating: (d.rating as number) ?? 0,
            comment: (d.comment as string) ?? "",
            imageUrls: Array.isArray(d.imageUrls)
              ? (d.imageUrls as unknown[]).filter(
                  (u): u is string => typeof u === "string",
                )
              : [],
            timestamp: d.timestamp as Timestamp,
          };
        });

        const hasMore = newReviews.length === MARKET_PAGE_SIZE;
        setMyMarketReviewsHasMore(hasMore);

        if (reset) {
          setMyMarketReviews(newReviews);
        } else {
          setMyMarketReviews((prev) => {
            const combined = [...prev, ...newReviews];
            const uniqueMap = new Map<string, MarketReview>();
            combined.forEach((r) => uniqueMap.set(r.id, r));
            return Array.from(uniqueMap.values());
          });
        }

        if (newReviews.length > 0) {
          setMyMarketReviewsLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        } else if (reset) {
          setMyMarketReviewsLastDoc(null);
        }
      } catch (error) {
        console.error("Error loading market reviews:", error);
      } finally {
        setMyMarketReviewsLoading(false);
      }
    },
    [
      user,
      myMarketReviewsLoading,
      myMarketReviewsLastDoc,
      myMarketReviewsHasMore,
    ],
  );

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      resetPaginationState();
      loadPendingReviews(true);
      loadFoodPendingReviews(true);
      loadMarketPendingReviews(true);
      loadMyReviews(true);
      loadMyFoodReviews(true);
      loadMyMarketReviews(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (user) {
      const filtersChanged =
        JSON.stringify(filters) !== JSON.stringify(prevFilters.current);
      if (filtersChanged) {
        setMyReviews([]);
        setMyFoodReviews([]);
        setMyMarketReviews([]);
        setMyReviewsLastDoc(null);
        setMyFoodReviewsLastDoc(null);
        setMyMarketReviewsLastDoc(null);

        // Product/seller reviews — query covers both. Hide when the filter
        // explicitly narrows to food or market only.
        if (filters.reviewType !== "food" && filters.reviewType !== "market") {
          setMyReviewsHasMore(true);
          loadMyReviews(true);
        } else {
          setMyReviewsHasMore(false); // prevent scroll from triggering it
        }

        if (filters.reviewType === "all" || filters.reviewType === "food") {
          setMyFoodReviewsHasMore(true);
          loadMyFoodReviews(true);
        } else {
          setMyFoodReviewsHasMore(false);
        }

        if (filters.reviewType === "all" || filters.reviewType === "market") {
          setMyMarketReviewsHasMore(true);
          loadMyMarketReviews(true);
        } else {
          setMyMarketReviewsHasMore(false);
        }

        prevFilters.current = filters;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, user]);

  useEffect(() => {
    if (activeTab !== "myReviews") {
      setFilters((prev) => ({ ...prev, reviewType: "all" }));
    }
  }, [activeTab]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.innerHeight + window.scrollY;
      const threshold = document.documentElement.scrollHeight - 200;

      if (scrollPosition >= threshold) {
        if (activeTab === "pending") {
          if (pendingHasMore && !pendingLoading && !isLoadingMoreRef.current) {
            isLoadingMoreRef.current = true;
            loadPendingReviews(false).finally(() => {
              isLoadingMoreRef.current = false;
            });
          }
          if (
            foodPendingHasMore &&
            !foodPendingLoading &&
            !isLoadingMoreRef.current
          ) {
            isLoadingMoreRef.current = true;
            loadFoodPendingReviews(false).finally(() => {
              isLoadingMoreRef.current = false;
            });
          }
          if (
            marketPendingHasMore &&
            !marketPendingLoading &&
            !isLoadingMoreRef.current
          ) {
            isLoadingMoreRef.current = true;
            loadMarketPendingReviews(false).finally(() => {
              isLoadingMoreRef.current = false;
            });
          }
        } else if (activeTab === "myReviews") {
          if (
            myReviewsHasMore &&
            !myReviewsLoading &&
            !isLoadingMoreRef.current
          ) {
            isLoadingMoreRef.current = true;
            loadMyReviews(false).finally(() => {
              isLoadingMoreRef.current = false;
            });
          }
          if (
            myFoodReviewsHasMore &&
            !myFoodReviewsLoading &&
            !isLoadingMoreRef.current
          ) {
            isLoadingMoreRef.current = true;
            loadMyFoodReviews(false).finally(() => {
              isLoadingMoreRef.current = false;
            });
          }
          if (
            myMarketReviewsHasMore &&
            !myMarketReviewsLoading &&
            !isLoadingMoreRef.current
          ) {
            isLoadingMoreRef.current = true;
            loadMyMarketReviews(false).finally(() => {
              isLoadingMoreRef.current = false;
            });
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [
    activeTab,
    pendingHasMore,
    pendingLoading,
    foodPendingHasMore,
    foodPendingLoading,
    marketPendingHasMore,
    marketPendingLoading,
    myReviewsHasMore,
    myReviewsLoading,
    myFoodReviewsHasMore,
    myFoodReviewsLoading,
    myMarketReviewsHasMore,
    myMarketReviewsLoading,
    loadPendingReviews,
    loadFoodPendingReviews,
    loadMarketPendingReviews,
    loadMyReviews,
    loadMyFoodReviews,
    loadMyMarketReviews,
  ]);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const resetPaginationState = () => {
    setPendingReviews([]);
    setFoodPendingReviews([]);
    setMarketPendingReviews([]);
    setMyReviews([]);
    setMyFoodReviews([]);
    setMyMarketReviews([]);
    setPendingLastDoc(null);
    setFoodPendingLastDoc(null);
    setMarketPendingLastDoc(null);
    setMyReviewsLastDoc(null);
    setMyFoodReviewsLastDoc(null);
    setMyMarketReviewsLastDoc(null);
    setPendingHasMore(true);
    setFoodPendingHasMore(true);
    setMarketPendingHasMore(true);
    setMyReviewsHasMore(true);
    setMyFoodReviewsHasMore(true);
    setMyMarketReviewsHasMore(true);
    isLoadingMoreRef.current = false;
  };

  const resetReviewForm = () => {
    setRating(0);
    setReviewText("");
    setReviewImages([]);
    setSelectedReview(null);
    setSelectedFoodReview(null);
    setSelectedMarketReview(null);
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

  const totalPendingCount =
    pendingReviews.length +
    foodPendingReviews.length +
    marketPendingReviews.length;
  const totalMyReviewsCount =
    myReviews.length +
    (filters.reviewType === "all" || filters.reviewType === "food"
      ? myFoodReviews.length
      : 0) +
    (filters.reviewType === "all" || filters.reviewType === "market"
      ? myMarketReviews.length
      : 0);
  const currentCount =
    activeTab === "pending" ? totalPendingCount : totalMyReviewsCount;

  // ============================================================================
  // IMAGE VALIDATION & PROCESSING
  // ============================================================================

  const validateFile = (
    file: File,
    maxSizeBytes = MAX_FILE_SIZE_BYTES, // ← ADD PARAM
  ): ImageValidationResult => {
    if (file.size > maxSizeBytes) {
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
      return await imageCompression(file, options);
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
    if (!user)
      return {
        success: false,
        error: "no_user",
        message: "User not authenticated",
      };

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
        return { success: true, url: imageUrl, ref: storageRef.fullPath };
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
  // MODAL HANDLERS
  // ============================================================================

  const openProductReviewModal = (
    review: PendingReview,
    type: "product" | "seller",
  ) => {
    setSelectedReview(review);
    setSelectedFoodReview(null);
    setReviewCategory(type);
    setShowReviewModal(true);
  };

  const openFoodReviewModal = (order: FoodPendingReview) => {
    setSelectedFoodReview(order);
    setSelectedReview(null);
    setSelectedMarketReview(null);
    setReviewCategory("food");
    setShowReviewModal(true);
  };

  const openMarketReviewModal = (order: MarketPendingReview) => {
    setSelectedMarketReview(order);
    setSelectedReview(null);
    setSelectedFoodReview(null);
    setReviewCategory("market");
    setShowReviewModal(true);
  };

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

    // ← Use 5MB limit for food reviews
    const maxSize =
      reviewCategory === "food"
        ? FOOD_MAX_FILE_SIZE_BYTES
        : MAX_FILE_SIZE_BYTES;

    const validFiles: File[] = [];
    for (const file of filesToAdd) {
      const validation = validateFile(file, maxSize); // ← PASS maxSize
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

    if (reviewCategory === "food") {
      submitFoodReviewAsync();
    } else if (reviewCategory === "market") {
      submitMarketReviewAsync();
    } else {
      submitReviewAsync();
    }
  };

  // Product/seller review submission
  const submitReviewAsync = async () => {
    if (!user || !selectedReview) {
      setShowLoadingModal(false);
      showErrorToast("Missing user or review data");
      return;
    }

    try {
      const approvedUrls: string[] = [];
      const uploadedRefs: string[] = [];

      if (reviewCategory === "product" && reviewImages.length > 0) {
        const storagePath = `reviews/${selectedReview.productId}`;
        for (let i = 0; i < reviewImages.length; i++) {
          const result = await processImage(reviewImages[i], storagePath, i);
          if (!result.success) {
            for (const refPath of uploadedRefs) {
              try {
                await deleteObject(ref(storage, refPath));
              } catch {
                console.error("Error deleting image:", refPath);
              }
            }
            setShowLoadingModal(false);
            let message = `Image ${i + 1}: `;
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
              default:
                message += result.message || "Inappropriate content detected";
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
        isProduct: reviewCategory === "product",
        isShopProduct: selectedReview.isShopProduct,
        productId:
          reviewCategory === "product" ? selectedReview.productId : undefined,
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

        // Optimistic removal: update or remove this pending item immediately
        setPendingReviews((prev) =>
          prev
            .map((r) => {
              if (r.id !== selectedReview.id) return r;
              const updatedNeeds = {
                ...r,
                needsProductReview:
                  reviewCategory === "product" ? false : r.needsProductReview,
                needsSellerReview:
                  reviewCategory === "seller" ? false : r.needsSellerReview,
              };
              return updatedNeeds;
            })
            .filter((r) => r.needsProductReview || r.needsSellerReview),
        );

        resetReviewForm();
        // Reload my reviews to reflect new submission in tab 2
        setMyReviews([]);
        setMyReviewsLastDoc(null);
        setMyReviewsHasMore(true);
        loadMyReviews(true);
      } else {
        showErrorToast(result.data.message || "Failed to submit review");
        resetReviewForm();
      }
    } catch (error) {
      setShowLoadingModal(false);
      console.error("Error submitting review:", error);
      showErrorToast(
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
      resetReviewForm();
    }
  };

  // Food review submission
  const submitFoodReviewAsync = async () => {
    if (!user || !selectedFoodReview) {
      setShowLoadingModal(false);
      showErrorToast("Missing user or food order data");
      return;
    }

    try {
      // Upload and moderate images
      const approvedUrls: string[] = [];
      const uploadedRefs: string[] = [];

      if (reviewImages.length > 0) {
        const storagePath = `restaurant_reviews/${selectedFoodReview.restaurantId}`;
        for (let i = 0; i < reviewImages.length; i++) {
          const result = await processImage(reviewImages[i], storagePath, i);
          if (!result.success) {
            // Clean up previously uploaded images
            for (const refPath of uploadedRefs) {
              try {
                await deleteObject(ref(storage, refPath));
              } catch {
                console.error("Error deleting image:", refPath);
              }
            }
            setShowLoadingModal(false);
            let message = `Image ${i + 1}: `;
            switch (result.error) {
              case "adult_content":
                message += "Contains inappropriate adult content";
                break;
              case "violent_content":
                message += "Contains violent content";
                break;
              case "file_too_large":
                message += "File too large (max 5MB)";
                break;
              case "invalid_format":
                message += "Invalid format (JPG, PNG, HEIC, WEBP only)";
                break;
              default:
                message += result.message || "Inappropriate content detected";
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

      const submitFoodReviewFunction = httpsCallable<SubmitFoodReviewData,
        { success: boolean }>(functions, "submitRestaurantReview");

      await submitFoodReviewFunction({
        orderId: selectedFoodReview.id,
        restaurantId: selectedFoodReview.restaurantId,
        rating,
        comment: reviewText.trim(),
        imageUrls: approvedUrls, // ← ADD
      });

      setShowLoadingModal(false);
      showSuccessToast(
        t("reviewSubmittedSuccessfully") || "Review submitted successfully!",
      );

      setFoodPendingReviews((prev) =>
        prev.filter((o) => o.id !== selectedFoodReview.id),
      );

      resetReviewForm();

      setMyFoodReviews([]);
      setMyFoodReviewsLastDoc(null);
      setMyFoodReviewsHasMore(true);
      loadMyFoodReviews(true);
    } catch (error) {
      setShowLoadingModal(false);
      console.error("Error submitting food review:", error);
      showErrorToast(
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
      resetReviewForm();
    }
  };

  // Market review submission — same pipeline as Flutter's _submitMarketReview:
  // upload each image to market_reviews/{uid}/, run moderateImage on each
  // resulting URL, then call submitMarketReview with the approved URL list.
  // Storage path layout matches Flutter so any per-user storage rule (or
  // future cleanup job) sees both clients writing to the same place.
  const submitMarketReviewAsync = async () => {
    if (!user || !selectedMarketReview) {
      setShowLoadingModal(false);
      showErrorToast("Missing user or market order data");
      return;
    }

    try {
      const approvedUrls: string[] = [];
      const uploadedRefs: string[] = [];

      if (reviewImages.length > 0) {
        const storagePath = `market_reviews/${user.uid}`;
        for (let i = 0; i < reviewImages.length; i++) {
          const result = await processImage(reviewImages[i], storagePath, i);
          if (!result.success) {
            // Roll back any prior uploads from this same submission so a
            // mid-batch moderation rejection doesn't leave orphans in
            // Storage that nothing references.
            for (const refPath of uploadedRefs) {
              try {
                await deleteObject(ref(storage, refPath));
              } catch {
                console.error("Error deleting image:", refPath);
              }
            }
            setShowLoadingModal(false);
            let message = `Image ${i + 1}: `;
            switch (result.error) {
              case "adult_content":
                message += "Contains inappropriate adult content";
                break;
              case "violent_content":
                message += "Contains violent content";
                break;
              case "file_too_large":
                message += t("imageTooLargeMax10") || "File too large (max 10MB)";
                break;
              case "invalid_format":
                message += "Invalid format (JPG, PNG, HEIC, WEBP only)";
                break;
              default:
                message += result.message || "Inappropriate content detected";
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

      const submitMarketReviewFunction = httpsCallable<
        SubmitMarketReviewData,
        { success: boolean }
      >(functions, "submitMarketReview");

      await submitMarketReviewFunction({
        orderId: selectedMarketReview.id,
        rating,
        comment: reviewText.trim(),
        imageUrls: approvedUrls,
      });

      setShowLoadingModal(false);
      showSuccessToast(
        t("reviewSubmittedSuccessfully") || "Review submitted successfully!",
      );

      setMarketPendingReviews((prev) =>
        prev.filter((o) => o.id !== selectedMarketReview.id),
      );

      resetReviewForm();

      setMyMarketReviews([]);
      setMyMarketReviewsLastDoc(null);
      setMyMarketReviewsHasMore(true);
      loadMyMarketReviews(true);
    } catch (error) {
      setShowLoadingModal(false);
      console.error("Error submitting market review:", error);
      showErrorToast(
        error instanceof Error ? error.message : "An unexpected error occurred",
      );
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

  // ============================================================================
  // RENDER GUARDS
  // ============================================================================

  if (authLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center pt-20 ${isDarkMode ? "bg-gray-950" : "bg-gray-50"}`}
      >
        <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const filteredMyReviews = myReviews;
  const showFoodReviewsInTab2 =
    filters.reviewType === "all" || filters.reviewType === "food";
  const showMarketReviewsInTab2 =
    filters.reviewType === "all" || filters.reviewType === "market";

  // Style helpers
  const cardClass = isDarkMode
    ? "bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
    : "bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all";
  const cardBorderClass = isDarkMode
    ? "border-b border-gray-800"
    : "border-b border-gray-50";
  const headingColor = isDarkMode ? "text-white" : "text-gray-900";
  const mutedColor = isDarkMode ? "text-gray-500" : "text-gray-400";
  const bodyColor = isDarkMode ? "text-gray-300" : "text-gray-600";
  const thumbBg = isDarkMode ? "bg-gray-800" : "bg-gray-50";
  const inputClass = isDarkMode
    ? "w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
    : "w-full px-3 py-2 text-sm bg-gray-50/80 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 outline-none transition-all";

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-950" : "bg-gray-50"}`}
    >
      {/* Sticky Toolbar */}
      <div
        className={`sticky top-14 z-30 backdrop-blur-xl border-b ${isDarkMode ? "bg-gray-950/80 border-gray-800/80" : "bg-white/80 border-gray-100/80"}`}
      >
        <div className="max-w-4xl mx-auto">
          {/* Row 1: Nav + Title + Actions */}
          <div className="flex items-center gap-3 px-3 sm:px-6 py-2">
            <button
              onClick={() => router.back()}
              className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${isDarkMode ? "bg-gray-800 border-gray-700 hover:bg-gray-700" : "bg-gray-50 border-gray-200 hover:bg-gray-100"}`}
            >
              <ArrowLeft
                className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              />
            </button>
            <h1 className={`text-lg font-bold truncate ${headingColor}`}>
              {t("title") || "My Reviews"}
            </h1>
            {currentCount > 0 && (
              <span
                className={`px-2 py-0.5 text-xs font-semibold rounded-full flex-shrink-0 ${isDarkMode ? "bg-orange-950/50 text-orange-400" : "bg-orange-50 text-orange-600"}`}
              >
                {currentCount}
              </span>
            )}
            <div className="flex-1" />
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
            <div
              className={`flex gap-1 rounded-xl p-1 ${isDarkMode ? "bg-gray-800/80" : "bg-gray-100/80"}`}
            >
              <button
                onClick={() => setActiveTab("pending")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "pending"
                    ? isDarkMode
                      ? "bg-gray-700 text-white shadow-sm"
                      : "bg-white text-gray-900 shadow-sm"
                    : isDarkMode
                      ? "text-gray-400 hover:text-gray-300"
                      : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                {t("toReview") || "To Review"}
                {totalPendingCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === "pending"
                        ? isDarkMode
                          ? "bg-orange-900/50 text-orange-400"
                          : "bg-orange-100 text-orange-600"
                        : isDarkMode
                          ? "bg-gray-700 text-gray-400"
                          : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {totalPendingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("myReviews")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "myReviews"
                    ? isDarkMode
                      ? "bg-gray-700 text-white shadow-sm"
                      : "bg-white text-gray-900 shadow-sm"
                    : isDarkMode
                      ? "text-gray-400 hover:text-gray-300"
                      : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Star className="w-3.5 h-3.5" />
                {t("myRatings") || "My Ratings"}
                {totalMyReviewsCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === "myReviews"
                        ? isDarkMode
                          ? "bg-green-900/50 text-green-400"
                          : "bg-green-100 text-green-600"
                        : isDarkMode
                          ? "bg-gray-700 text-gray-400"
                          : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {totalMyReviewsCount}
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
          <div
            className={`rounded-2xl border p-4 mb-4 ${isDarkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className={`text-[11px] font-semibold uppercase tracking-wider ${mutedColor}`}
              >
                {t("filter") || "Filters"}
              </span>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => setFilters({ reviewType: "all" })}
                  className="text-[11px] text-orange-600 hover:text-orange-700 font-semibold"
                >
                  {t("clearFilters") || "Clear filters"}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {activeTab === "myReviews" && (
                <div>
                  <label
                    className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}
                  >
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
                          | "seller"
                          | "food"
                          | "market",
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="all">{t("all") || "All"}</option>
                    <option value="product">{t("product") || "Product"}</option>
                    <option value="seller">{t("seller") || "Seller"}</option>
                    <option value="food">{t("food") || "Food"}</option>
                    <option value="market">{t("market") || "Market"}</option>
                  </select>
                </div>
              )}
              <div>
                <label
                  className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}
                >
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
                <label
                  className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}
                >
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

        {/* ── TAB 1: To Review ── */}
        {activeTab === "pending" ? (
          <div className="space-y-3">
            {totalPendingCount === 0 &&
            !pendingLoading &&
            !foodPendingLoading &&
            !marketPendingLoading ? (
              <div className="text-center py-16">
                <Star
                  className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-700" : "text-gray-300"}`}
                />
                <h3 className={`text-sm font-semibold mb-1 ${headingColor}`}>
                  {t("nothingToReview") || "Nothing to Review"}
                </h3>
                <p className={`text-xs max-w-xs mx-auto ${mutedColor}`}>
                  {t("noUnreviewedPurchases") ||
                    "You have no unreviewed purchases"}
                </p>
              </div>
            ) : (
              <>
                {/* Product pending reviews */}
                {Array.from(
                  new Map(
                    pendingReviews.map((r) => [`${r.orderId}_${r.id}`, r]),
                  ).values(),
                ).map((review) => (
                  <div
                    key={`${review.orderId}_${review.id}`}
                    className={cardClass}
                  >
                    <div
                      className={`px-4 py-3 ${cardBorderClass} flex items-center gap-3 cursor-pointer`}
                      onClick={() =>
                        router.push(`/productdetail/${review.productId}`)
                      }
                    >
                      <div
                        className={`w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 relative ${thumbBg}`}
                      >
                        {review.productImage ? (
                          <SmartImage
                            source={review.productImage}
                            size="thumbnail"
                            alt={review.productName}
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package
                              className={`w-4 h-4 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3
                          className={`font-semibold text-sm truncate ${headingColor}`}
                        >
                          {review.productName}
                        </h3>
                        <p className="text-xs font-bold text-orange-600 mt-0.5">
                          ₺{review.productPrice.toLocaleString()}
                        </p>
                      </div>
                      <span
                        className={`text-[11px] flex-shrink-0 ${mutedColor}`}
                      >
                        {review.timestamp?.toDate().toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                    <div className="px-4 py-3 flex items-center gap-2">
                      {review.needsProductReview && (
                        <button
                          onClick={() =>
                            openProductReviewModal(review, "product")
                          }
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
                        >
                          <Star className="w-3.5 h-3.5" />
                          {t("writeYourReview") || "Write Your Review"}
                        </button>
                      )}
                      {review.needsSellerReview && (
                        <button
                          onClick={() =>
                            openProductReviewModal(review, "seller")
                          }
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
                ))}

                {/* Food pending reviews */}
                {Array.from(
                  new Map(foodPendingReviews.map((r) => [r.id, r])).values(),
                ).map((order) => {
                  const itemsPreview =
                    order.items
                      .slice(0, 2)
                      .map((i) =>
                        i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name,
                      )
                      .join(", ") +
                    (order.items.length > 2
                      ? ` +${order.items.length - 2}`
                      : "");

                  return (
                    <div key={order.id} className={cardClass}>
                      <div
                        className={`px-4 py-3 ${cardBorderClass} flex items-center gap-3`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 relative ${thumbBg}`}
                        >
                          {order.restaurantProfileImage ? (
                            <SmartImage
                              source={order.restaurantProfileImage}
                              size="thumbnail"
                              alt={order.restaurantName}
                              fill
                              className="object-cover"
                              sizes="40px"
                            />
                          ) : (
                            <div
                              className={`w-full h-full flex items-center justify-center ${isDarkMode ? "bg-orange-950/30" : "bg-orange-50"}`}
                            >
                              <UtensilsCrossed className="w-4 h-4 text-orange-500" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3
                            className={`font-semibold text-sm truncate ${headingColor}`}
                          >
                            {order.restaurantName}
                          </h3>
                          <p
                            className={`text-[11px] truncate mt-0.5 ${mutedColor}`}
                          >
                            {itemsPreview}
                          </p>
                          <p className="text-xs font-bold text-orange-600 mt-0.5">
                            {order.totalPrice.toFixed(0)} {order.currency}
                          </p>
                        </div>
                        <span
                          className={`text-[11px] flex-shrink-0 ${mutedColor}`}
                        >
                          {order.createdAt
                            ?.toDate()
                            .toLocaleDateString("tr-TR")}
                        </span>
                      </div>
                      <div className="px-4 py-3">
                        <button
                          onClick={() => openFoodReviewModal(order)}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
                        >
                          <Star className="w-3.5 h-3.5" />
                          {t("writeRestaurantReview") ||
                            "Write Restaurant Review"}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Market pending reviews */}
                {Array.from(
                  new Map(marketPendingReviews.map((r) => [r.id, r])).values(),
                ).map((order) => {
                  const itemsPreview =
                    order.items
                      .slice(0, 2)
                      .map((i) =>
                        i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name,
                      )
                      .join(", ") +
                    (order.items.length > 2
                      ? ` +${order.items.length - 2}`
                      : "");

                  return (
                    <div key={`market-pending-${order.id}`} className={cardClass}>
                      <div
                        className={`px-4 py-3 ${cardBorderClass} flex items-center gap-3`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDarkMode ? "bg-emerald-950/30" : "bg-emerald-50"}`}
                        >
                          <ShoppingBasket className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3
                            className={`font-semibold text-sm truncate ${headingColor}`}
                          >
                            {t("marketOrder") || "Nar24 Market"}
                          </h3>
                          <p
                            className={`text-[11px] truncate mt-0.5 ${mutedColor}`}
                          >
                            {itemsPreview}
                          </p>
                          <p className="text-xs font-bold text-orange-600 mt-0.5">
                            {order.totalPrice.toFixed(0)} {order.currency}
                          </p>
                        </div>
                        <span
                          className={`text-[11px] flex-shrink-0 ${mutedColor}`}
                        >
                          {order.createdAt
                            ?.toDate()
                            .toLocaleDateString("tr-TR")}
                        </span>
                      </div>
                      <div className="px-4 py-3">
                        <button
                          onClick={() => openMarketReviewModal(order)}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors text-xs font-medium"
                        >
                          <Star className="w-3.5 h-3.5" />
                          {t("writeMarketReview") || "Write Market Review"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {(pendingLoading || foodPendingLoading || marketPendingLoading) && (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
              </div>
            )}
          </div>
        ) : (
          /* ── TAB 2: My Reviews ── */
          <div className="space-y-3">
            {filteredMyReviews.length === 0 &&
            myFoodReviews.length === 0 &&
            myMarketReviews.length === 0 &&
            !myReviewsLoading &&
            !myFoodReviewsLoading &&
            !myMarketReviewsLoading ? (
              <div className="text-center py-16">
                <Star
                  className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-700" : "text-gray-300"}`}
                />
                <h3 className={`text-sm font-semibold mb-1 ${headingColor}`}>
                  {t("youHaveNoReviews") || "You Have No Reviews"}
                </h3>
                <p className={`text-xs max-w-xs mx-auto ${mutedColor}`}>
                  {t("startReviewingProducts") ||
                    "Start reviewing products you've purchased"}
                </p>
              </div>
            ) : (
              <>
                {/* Product/seller reviews */}
                {Array.from(
                  new Map(
                    filteredMyReviews.map((r) => [`${r.orderId}_${r.id}`, r]),
                  ).values(),
                ).map((review) => (
                  <div
                    key={`product_${review.orderId}_${review.id}`}
                    className={cardClass}
                  >
                    {review.productId ? (
                      <div
                        className={`px-4 py-3 ${cardBorderClass} flex items-center gap-3 cursor-pointer`}
                        onClick={() =>
                          router.push(`/productdetail/${review.productId}`)
                        }
                      >
                        <div
                          className={`w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 relative ${thumbBg}`}
                        >
                          {review.productImage ? (
                            <SmartImage
                              source={review.productImage}
                              size="thumbnail"
                              alt={review.productName || "Product"}
                              fill
                              className="object-cover"
                              sizes="40px"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package
                                className={`w-4 h-4 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
                              />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3
                            className={`font-semibold text-sm truncate ${headingColor}`}
                          >
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
                      <div
                        className={`px-4 py-3 ${cardBorderClass} flex items-center gap-3`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDarkMode ? "bg-orange-950/50" : "bg-orange-50"}`}
                        >
                          <Store className="w-4 h-4 text-orange-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3
                            className={`font-semibold text-sm ${headingColor}`}
                          >
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
                    <div className="px-4 py-3">
                      {review.imageUrls && review.imageUrls.length > 0 && (
                        <div className="flex gap-2 mb-2.5">
                          {review.imageUrls.map((url, idx) => (
                            <button
                              key={idx}
                              onClick={() => setSelectedImage(url)}
                              className={`w-14 h-14 rounded-xl overflow-hidden hover:opacity-80 transition-opacity relative flex-shrink-0 ${thumbBg}`}
                            >
                              <SmartImage
                                source={url}
                                size="thumbnail"
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
                ))}

                {/* Food reviews */}
                {showFoodReviewsInTab2 &&
                  Array.from(
                    new Map(myFoodReviews.map((r) => [r.id, r])).values(),
                  ).map((review) => (
                    <div key={`food_${review.id}`} className={cardClass}>
                      <div
                        className={`px-4 py-3 ${cardBorderClass} flex items-center gap-3`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDarkMode ? "bg-orange-950/30" : "bg-orange-50"}`}
                        >
                          <UtensilsCrossed className="w-4 h-4 text-orange-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3
                            className={`font-semibold text-sm ${headingColor}`}
                          >
                            {review.restaurantName ||
                              t("restaurantReview") ||
                              "Restaurant Review"}
                          </h3>
                          <p className={`text-xs mt-0.5 ${mutedColor}`}>
                            {t("foodReview") || "Food Review"}
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
                      {review.imageUrls && review.imageUrls.length > 0 && (
                        <div className="px-4 pt-3 flex gap-2">
                          {review.imageUrls.map((url, idx) => (
                            <button
                              key={idx}
                              onClick={() => setSelectedImage(url)}
                              className={`w-14 h-14 rounded-xl overflow-hidden hover:opacity-80 transition-opacity relative flex-shrink-0 ${thumbBg}`}
                            >
                              <SmartImage
                                source={url}
                                size="thumbnail"
                                alt={`Review image ${idx + 1}`}
                                fill
                                className="object-cover"
                                sizes="56px"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                      {review.comment && (
                        <div className="px-4 py-3">
                          <p className={`text-sm leading-relaxed ${bodyColor}`}>
                            {review.comment}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}

                {/* Market reviews */}
                {showMarketReviewsInTab2 &&
                  Array.from(
                    new Map(myMarketReviews.map((r) => [r.id, r])).values(),
                  ).map((review) => (
                    <div key={`market_${review.id}`} className={cardClass}>
                      <div
                        className={`px-4 py-3 ${cardBorderClass} flex items-center gap-3`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDarkMode ? "bg-emerald-950/30" : "bg-emerald-50"}`}
                        >
                          <ShoppingBasket className="w-4 h-4 text-emerald-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3
                            className={`font-semibold text-sm ${headingColor}`}
                          >
                            {t("marketOrder") || "Nar24 Market"}
                          </h3>
                          <p className={`text-xs mt-0.5 ${mutedColor}`}>
                            {t("marketReview") || "Market Review"}
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
                      {review.imageUrls && review.imageUrls.length > 0 && (
                        <div className="px-4 pt-3 flex gap-2">
                          {review.imageUrls.map((url, idx) => (
                            <button
                              key={idx}
                              onClick={() => setSelectedImage(url)}
                              className={`w-14 h-14 rounded-xl overflow-hidden hover:opacity-80 transition-opacity relative flex-shrink-0 ${thumbBg}`}
                            >
                              <SmartImage
                                source={url}
                                size="thumbnail"
                                alt={`Review image ${idx + 1}`}
                                fill
                                className="object-cover"
                                sizes="56px"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                      {review.comment && (
                        <div className="px-4 py-3">
                          <p className={`text-sm leading-relaxed ${bodyColor}`}>
                            {review.comment}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
              </>
            )}

            {(myReviewsLoading ||
              myFoodReviewsLoading ||
              myMarketReviewsLoading) && (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Review Modal ── */}
      {showReviewModal &&
        (selectedReview || selectedFoodReview || selectedMarketReview) && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div
            className={`rounded-2xl max-w-lg w-full shadow-2xl max-h-[90vh] overflow-y-auto ${isDarkMode ? "bg-gray-900" : "bg-white"}`}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between p-4 border-b ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}
            >
              <h3 className={`text-base font-bold ${headingColor}`}>
                {reviewCategory === "product"
                  ? t("productReview") || "Product Review"
                  : reviewCategory === "seller"
                    ? t("sellerReview") || "Seller Review"
                    : reviewCategory === "market"
                      ? t("marketReview") || "Market Review"
                      : t("restaurantReview") || "Restaurant Review"}
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
              {/* Subject preview */}
              {reviewCategory === "food" && selectedFoodReview && (
                <div
                  className={`flex items-center gap-3 p-3 rounded-xl ${isDarkMode ? "bg-gray-800" : "bg-gray-50"}`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? "bg-orange-950/30" : "bg-orange-50"}`}
                  >
                    <UtensilsCrossed className="w-4 h-4 text-orange-500" />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${headingColor}`}>
                      {selectedFoodReview.restaurantName}
                    </p>
                    <p className={`text-[11px] ${mutedColor}`}>
                      {selectedFoodReview.items
                        .slice(0, 2)
                        .map((i) => i.name)
                        .join(", ")}
                      {selectedFoodReview.items.length > 2 &&
                        ` +${selectedFoodReview.items.length - 2}`}
                    </p>
                  </div>
                </div>
              )}

              {reviewCategory === "market" && selectedMarketReview && (
                <div
                  className={`flex items-center gap-3 p-3 rounded-xl ${isDarkMode ? "bg-gray-800" : "bg-gray-50"}`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? "bg-emerald-950/30" : "bg-emerald-50"}`}
                  >
                    <ShoppingBasket className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${headingColor}`}>
                      {t("marketOrder") || "Nar24 Market"}
                    </p>
                    <p className={`text-[11px] ${mutedColor}`}>
                      {selectedMarketReview.items
                        .slice(0, 2)
                        .map((i) =>
                          i.quantity > 1
                            ? `${i.quantity}× ${i.name}`
                            : i.name,
                        )
                        .join(", ")}
                      {selectedMarketReview.items.length > 2 &&
                        ` +${selectedMarketReview.items.length - 2}`}
                    </p>
                  </div>
                </div>
              )}

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
                            : isDarkMode
                              ? "text-gray-600"
                              : "text-gray-200"
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
                <label
                  className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}
                >
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

              {/* Image Upload — supported for product / food / market reviews
                  (seller reviews don't take photos in either client). */}
              {(reviewCategory === "product" ||
                reviewCategory === "food" ||
                reviewCategory === "market") && (
                <div>
                  <label
                    className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}
                  >
                    {t("uploadPhotos") || "Upload Photos"}
                  </label>
                  {reviewImages.length > 0 && (
                    // Extra top padding + horizontal padding so the close
                    // button — which is intentionally pulled outside the
                    // thumb (-top-1.5 / -right-1.5) — has room to render
                    // without clipping. The thumb has `overflow-hidden`
                    // for the rounded-corner crop, but the button lives
                    // in an outer wrapper without overflow clipping.
                    <div className="flex gap-3 mb-2.5 pt-2 px-1.5">
                      {reviewImages.map((file, index) => (
                        <div
                          key={index}
                          className="relative flex-shrink-0"
                        >
                          <div
                            className={`w-14 h-14 rounded-xl overflow-hidden relative ${thumbBg}`}
                          >
                            <Image
                              src={URL.createObjectURL(file)}
                              alt={`New image ${index + 1}`}
                              fill
                              className="object-cover"
                              sizes="56px"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            aria-label={`Remove image ${index + 1}`}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-md ring-2 ring-white dark:ring-gray-900 z-10 transition-colors"
                          >
                            <X className="w-3 h-3" />
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
            <div
              className={`flex gap-2 p-4 border-t ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}
            >
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
          <div
            className={`rounded-2xl p-8 max-w-sm w-full shadow-2xl ${isDarkMode ? "bg-gray-900" : "bg-white"}`}
          >
            <div className="flex flex-col items-center gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDarkMode ? "bg-orange-950/50" : "bg-orange-50"}`}
              >
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
            <SmartImage
              source={selectedImage}
              size="zoom"
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
