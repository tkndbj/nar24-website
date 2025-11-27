"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  
  useRef,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  orderBy,
  limit,
  startAfter,
  DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslations } from "next-intl";
import { useUser } from "@/context/UserProvider";
import { Product } from "@/app/models/Product";
import ProductCard from "@/app/components/ProductCard";
import Image from "next/image";
import {
  ArrowLeft,
  Heart,
  Flag,
  Search,
  User,
  ImageIcon,
  ListX,
  X,
  Loader2,
 
  Package,
  
  Verified,
} from "lucide-react";

interface UserData {
  displayName: string;
  profileImage?: string;
  verified?: boolean;
  email?: string;
}

interface SellerStats {
  averageRating: number;
  reviewCount: number;
  totalProductsSold: number;
  totalListings: number;
}

const PRODUCTS_PER_PAGE = 12;

export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations();
  const { user } = useUser();
  const userId = params?.userId as string;

  // State
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [sellerStats, setSellerStats] = useState<SellerStats>({
    averageRating: 0,
    reviewCount: 0,
    totalProductsSold: 0,
    totalListings: 0,
  });

  // Pagination state
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [isTogglingFollow, setIsTogglingFollow] = useState(false);

  // Report modal state
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Scroll ref for infinite scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Check if viewing own profile
  const isCurrentUser = user?.uid === userId;

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

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    if (!userId) return;

    try {
      const userDoc = await getDoc(doc(db, "users", userId));
      if (userDoc.exists()) {
        setUserData(userDoc.data() as UserData);
      } else {
        setUserData(null);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      setUserData(null);
    }
  }, [userId]);

  // Fetch seller stats (rating, reviews, products sold)
  const fetchSellerStats = useCallback(async () => {
    if (!userId) return;

    try {
      // Fetch reviews for rating
      const reviewsSnapshot = await getDocs(
        collection(db, "users", userId, "reviews")
      );

      let totalRating = 0;
      const reviewCount = reviewsSnapshot.size;

      reviewsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        totalRating += data.rating || 0;
      });

      const averageRating = reviewCount > 0 ? totalRating / reviewCount : 0;

      // Fetch seller stats from user document or orders
      const userDoc = await getDoc(doc(db, "users", userId));
      const userData = userDoc.data();
      const totalProductsSold = userData?.totalProductsSold || 0;

      setSellerStats((prev) => ({
        ...prev,
        averageRating,
        reviewCount,
        totalProductsSold,
      }));
    } catch (error) {
      console.error("Error fetching seller stats:", error);
    }
  }, [userId]);

  // Fetch products
  const fetchProducts = useCallback(
    async (isInitial = true) => {
      if (!userId) return;

      try {
        if (isInitial) {
          setIsLoading(true);
        } else {
          setIsLoadingMore(true);
        }

        let productsQuery = query(
          collection(db, "products"),
          where("userId", "==", userId),
          where("isActive", "==", true),
          orderBy("createdAt", "desc"),
          limit(PRODUCTS_PER_PAGE)
        );

        if (!isInitial && lastDoc) {
          productsQuery = query(
            collection(db, "products"),
            where("userId", "==", userId),
            where("isActive", "==", true),
            orderBy("createdAt", "desc"),
            startAfter(lastDoc),
            limit(PRODUCTS_PER_PAGE)
          );
        }

        const snapshot = await getDocs(productsQuery);
        const fetchedProducts: Product[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Product[];

        if (isInitial) {
          setProducts(fetchedProducts);
          setFilteredProducts(fetchedProducts);
        } else {
          setProducts((prev) => [...prev, ...fetchedProducts]);
          setFilteredProducts((prev) => [...prev, ...fetchedProducts]);
        }

        // Update pagination state
        if (snapshot.docs.length > 0) {
          setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        }
        setHasMoreProducts(snapshot.docs.length === PRODUCTS_PER_PAGE);

        // Update total listings in stats
        if (isInitial) {
          // Get total count
          const countQuery = query(
            collection(db, "products"),
            where("userId", "==", userId),
            where("isActive", "==", true)
          );
          const countSnapshot = await getDocs(countQuery);
          setSellerStats((prev) => ({
            ...prev,
            totalListings: countSnapshot.size,
          }));
        }
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [userId, lastDoc]
  );

  // Check if current user is following this profile
  const checkFollowStatus = useCallback(async () => {
    if (!user?.uid || !userId || isCurrentUser) return;

    try {
      const currentUserDoc = await getDoc(doc(db, "users", user.uid));
      if (currentUserDoc.exists()) {
        const following = currentUserDoc.data()?.following || [];
        setIsFollowing(following.includes(userId));
      }
    } catch (error) {
      console.error("Error checking follow status:", error);
    }
  }, [user?.uid, userId, isCurrentUser]);

  // Initial data fetch
  useEffect(() => {
    fetchUserData();
    fetchSellerStats();
    fetchProducts(true);
    checkFollowStatus();
  }, [fetchUserData, fetchSellerStats, fetchProducts, checkFollowStatus]);

  // Search filtering with debounce
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      if (searchQuery.trim() === "") {
        setFilteredProducts(products);
      } else {
        const query = searchQuery.toLowerCase();
        const filtered = products.filter(
          (product) =>
            product.productName.toLowerCase().includes(query) ||
            product.brandModel?.toLowerCase().includes(query) ||
            product.category?.toLowerCase().includes(query)
        );
        setFilteredProducts(filtered);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchQuery, products]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || isLoadingMore || !hasMoreProducts) return;

    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;

    if (scrollTop + clientHeight >= scrollHeight * 0.8) {
      fetchProducts(false);
    }
  }, [fetchProducts, isLoadingMore, hasMoreProducts]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, [handleScroll]);

  // Toggle follow
  const handleToggleFollow = async () => {
    if (!user?.uid) {
      router.push("/login");
      return;
    }

    if (isTogglingFollow) return;

    setIsTogglingFollow(true);
    const wasFollowing = isFollowing;

    // Optimistic update
    setIsFollowing(!wasFollowing);

    try {
      const currentUserRef = doc(db, "users", user.uid);
      const targetUserRef = doc(db, "users", userId);

      if (wasFollowing) {
        await updateDoc(currentUserRef, {
          following: arrayRemove(userId),
        });
        await updateDoc(targetUserRef, {
          followers: arrayRemove(user.uid),
        });
      } else {
        await updateDoc(currentUserRef, {
          following: arrayUnion(userId),
        });
        await updateDoc(targetUserRef, {
          followers: arrayUnion(user.uid),
        });
      }
    } catch (error) {
      console.error("Error toggling follow:", error);
      // Revert on error
      setIsFollowing(wasFollowing);
    } finally {
      setIsTogglingFollow(false);
    }
  };

  // Report options
  const reportOptions = [
    {
      type: "inappropriate_profile_image",
      icon: ImageIcon,
      label: t("UserProfile.inappropriateProfileImage"),
    },
    {
      type: "inappropriate_listings",
      icon: ListX,
      label: t("UserProfile.inappropriateListings"),
    },
  ];

  // Submit report
  const handleSubmitReport = async (reportType: string) => {
    if (!user?.uid) {
      alert(t("UserProfile.pleaseLoginFirst"));
      return;
    }

    setIsSubmittingReport(true);
    try {
      await addDoc(collection(db, "users", userId, "reports"), {
        reporterId: user.uid,
        reportType,
        timestamp: serverTimestamp(),
      });
      setIsReportModalOpen(false);
      alert(t("UserProfile.reportSubmittedSuccessfully"));
    } catch (error) {
      console.error("Error submitting report:", error);
      alert(t("UserProfile.errorSubmittingReport"));
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Gradient text component
  const GradientText = ({
    children,
    className = "",
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <span
      className={`bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent ${className}`}
    >
      {children}
    </span>
  );

  if (isLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!userData) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <User
          className={`w-16 h-16 mb-4 ${
            isDarkMode ? "text-gray-600" : "text-gray-400"
          }`}
        />
        <p
          className={`text-lg ${
            isDarkMode ? "text-gray-400" : "text-gray-600"
          }`}
        >
          {t("UserProfile.userNotFound")}
        </p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
        >
          {t("UserProfile.goBack")}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      className={`min-h-screen overflow-y-auto ${
        isDarkMode ? "bg-gray-900" : "bg-gray-100"
      }`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-40 ${
          isDarkMode ? "bg-gray-800/95" : "bg-white/95"
        } backdrop-blur-md border-b ${
          isDarkMode ? "border-gray-700" : "border-gray-200"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
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

              {/* User avatar and name in header */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-200">
                  {userData.profileImage ? (
                    <Image
                      src={userData.profileImage}
                      alt={userData.displayName}
                      width={36}
                      height={36}
                      className="object-cover w-full h-full"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-orange-400 to-pink-500">
                      <span className="text-white font-bold text-sm">
                        {userData.displayName?.[0]?.toUpperCase() || "U"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <h1
                    className={`text-base font-semibold truncate max-w-[150px] md:max-w-none ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {userData.displayName || t("UserProfile.noUserName")}
                  </h1>
                  {userData.verified && (
                    <Verified className="w-4 h-4 text-blue-500 fill-blue-500" />
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            {!isCurrentUser && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleFollow}
                  disabled={isTogglingFollow}
                  className={`p-2 rounded-full transition-colors ${
                    isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                  }`}
                >
                  <Heart
                    className={`w-5 h-5 transition-colors ${
                      isFollowing
                        ? "text-red-500 fill-red-500"
                        : isDarkMode
                        ? "text-white"
                        : "text-gray-900"
                    }`}
                  />
                </button>
                <button
                  onClick={() => setIsReportModalOpen(true)}
                  className={`p-2 rounded-full transition-colors ${
                    isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                  }`}
                >
                  <Flag
                    className={`w-5 h-5 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Seller Info Card - Matches Flutter SellerInfoCard */}
        <div
          className={`${
            isDarkMode ? "bg-[#211f31]" : "bg-white"
          } mt-2`}
        >
          <div className="py-4 px-2">
            <div className="grid grid-cols-4 divide-x divide-gray-300">
              {/* Rating */}
              <div className="flex flex-col items-center px-2">
                <span
                  className={`text-xs mb-1 ${
                    isDarkMode ? "text-white" : "text-gray-600"
                  }`}
                >
                  {t("UserProfile.rating")}
                </span>
                <GradientText className="font-bold text-sm">
                  {sellerStats.averageRating.toFixed(1)}
                </GradientText>
              </div>

              {/* Products Sold */}
              <div className="flex flex-col items-center px-2">
                <span
                  className={`text-xs mb-1 ${
                    isDarkMode ? "text-white" : "text-gray-600"
                  }`}
                >
                  {t("UserProfile.productsSold")}
                </span>
                <GradientText className="font-bold text-sm">
                  {sellerStats.totalProductsSold}
                </GradientText>
              </div>

              {/* Total Listings */}
              <div className="flex flex-col items-center px-2">
                <span
                  className={`text-xs mb-1 ${
                    isDarkMode ? "text-white" : "text-gray-600"
                  }`}
                >
                  {t("UserProfile.totalListings")}
                </span>
                <GradientText className="font-bold text-sm">
                  {sellerStats.totalListings}
                </GradientText>
              </div>

              {/* Reviews */}
              <div className="flex flex-col items-center px-2">
                <span
                  className={`text-xs mb-1 ${
                    isDarkMode ? "text-white" : "text-gray-600"
                  }`}
                >
                  {t("UserProfile.userReviews")}
                </span>
                <GradientText className="font-bold text-sm">
                  {sellerStats.reviewCount}
                </GradientText>
              </div>
            </div>
          </div>
        </div>

        {/* Search Box */}
        <div className="px-3 py-2">
          <div
            className={`relative rounded-full overflow-hidden ${
              isDarkMode ? "bg-[#211f31]" : "bg-gray-200"
            } ${isSearchFocused ? "ring-2 ring-orange-500" : ""}`}
          >
            <Search
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder={t("UserProfile.searchProducts")}
              className={`w-full pl-10 pr-4 py-2.5 text-sm bg-transparent outline-none ${
                isDarkMode
                  ? "text-white placeholder-gray-500"
                  : "text-gray-900 placeholder-gray-500"
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-300"
                }`}
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* Products Grid */}
        <div className="px-3 pb-8">
          {filteredProducts.length === 0 ? (
            <div
              className={`flex flex-col items-center justify-center py-16 ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              <Package className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-base">
                {searchQuery
                  ? t("UserProfile.noProductsFound")
                  : t("UserProfile.noProductsYet")}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className={`rounded-xl overflow-hidden shadow-md ${
                      isDarkMode ? "bg-gray-800" : "bg-white"
                    }`}
                  >
                    <ProductCard
                      product={product}
                      isDarkMode={isDarkMode}
                      showCartIcon={true}
                    />
                  </div>
                ))}
              </div>

              {/* Loading more indicator */}
              {isLoadingMore && (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
                </div>
              )}

              {/* End of list */}
              {!hasMoreProducts && filteredProducts.length > 0 && (
                <div className="py-6 text-center">
                  <p
                    className={`text-sm ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    {t("UserProfile.endOfProducts")}
                  </p>
                </div>
              )}
            </>
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
            } shadow-2xl animate-in slide-in-from-bottom duration-300`}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 md:hidden">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div
              className={`flex items-center justify-between px-6 py-4 border-b ${
                isDarkMode ? "border-gray-700" : "border-gray-200"
              }`}
            >
              <h3
                className={`text-lg font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("UserProfile.report")}
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