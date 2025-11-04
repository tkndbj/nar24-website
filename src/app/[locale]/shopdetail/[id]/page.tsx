"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import SecondHeader from "@/app/components/market_screen/SecondHeader";
import { ProductCard } from "@/app/components/ProductCard";
import AlgoliaServiceManager from "@/lib/algolia";
import {
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  FunnelIcon,
  StarIcon,
  UsersIcon,
  EyeIcon,
  HeartIcon,
  ArrowLeftIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";

interface ShopData {
  id: string;
  name: string;
  profileImageUrl: string;
  coverImageUrls: string[];
  homeImageUrls?: string[];
  address: string;
  averageRating: number;
  reviewCount: number;
  followerCount: number;
  clickCount: number;
  categories: string[];
  contactNo: string;
  ownerId: string;
  isBoosted: boolean;
  createdAt: {
    seconds: number;
    nanoseconds: number;
  };
}

import { Product, ProductUtils } from "@/app/models/Product";

interface Collection {
  id: string;
  name: string;
  imageUrl?: string;
  productIds: string[];
  createdAt: {
    seconds: number;
    nanoseconds: number;
  };
}

interface Review {
  id: string;
  rating: number;
  review: string;
  timestamp: {
    seconds: number;
    nanoseconds: number;
  };
  userId: string;
  userName?: string;
  likes: string[];
}

type TabType =
  | "home"
  | "allProducts"
  | "collections"
  | "deals"
  | "bestSellers"
  | "reviews";

export default function ShopDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("shopDetail");

  const shopId = params.id as string;
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [shopData, setShopData] = useState<ShopData | null>(null);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("allProducts");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [lastProductDoc, setLastProductDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Product[]>([]);

  const observerTarget = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);
  const lastProductDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const currentTabRef = useRef<TabType>(activeTab);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchAbortRef = useRef<boolean>(false);

  // Sync refs with state
  useEffect(() => {
    lastProductDocRef.current = lastProductDoc;
  }, [lastProductDoc]);

  useEffect(() => {
    currentTabRef.current = activeTab;
  }, [activeTab]);

  // Cleanup on unmount or shopId change
  useEffect(() => {
    return () => {
      isFetchingRef.current = false;
      // Cleanup search timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      // Abort ongoing search
      searchAbortRef.current = true;
    };
  }, [shopId]);

  // Handle theme detection
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => observer.disconnect();
  }, []);

  // Handle scroll for header effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch shop data
  const fetchShopData = useCallback(async () => {
    if (!shopId) return;

    try {
      setIsLoading(true);
      setError(null);

      const shopDoc = await getDoc(doc(db, "shops", shopId));

      if (!shopDoc.exists()) {
        setError(t("shopNotFound"));
        return;
      }

      const data = { id: shopDoc.id, ...shopDoc.data() } as ShopData;
      setShopData(data);

      // Set initial tab based on available content
      if (data.homeImageUrls && data.homeImageUrls.length > 0) {
        setActiveTab("home");
      } else {
        setActiveTab("allProducts");
      }
    } catch (err) {
      console.error("Error fetching shop data:", err);
      setError(t("failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  }, [shopId, t]);

  // Fetch products
  const fetchProducts = useCallback(
    async (productType: "all" | "deals" | "bestSellers" = "all", loadMore = false) => {
      if (!shopId) return;
      if (isFetchingRef.current) return; // Prevent duplicate requests

      const fetchStartTab = currentTabRef.current;
      isFetchingRef.current = true;

      try {
        if (loadMore) {
          setIsLoadingMore(true);
        } else {
          setIsLoadingProducts(true);
        }

        let productsQuery = query(
          collection(db, "shop_products"),
          where("shopId", "==", shopId),
          orderBy("createdAt", "desc"),
          limit(20)
        );

        // Add cursor for pagination
        if (loadMore && lastProductDocRef.current) {
          productsQuery = query(
            collection(db, "shop_products"),
            where("shopId", "==", shopId),
            orderBy("createdAt", "desc"),
            startAfter(lastProductDocRef.current),
            limit(20)
          );
        }

        const snapshot = await getDocs(productsQuery);

        // Check if tab changed during fetch - if so, discard results
        if (fetchStartTab !== currentTabRef.current) {
          return;
        }

        let fetchedProducts = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Product[];

        // Store last document for pagination
        if (snapshot.docs.length > 0) {
          setLastProductDoc(snapshot.docs[snapshot.docs.length - 1]);
        }

        // Check if there are more products
        setHasMoreProducts(snapshot.docs.length === 20);

        // Client-side filtering for now
        if (productType === "deals") {
          fetchedProducts = fetchedProducts.filter(
            (p) => (p.discountPercentage || 0) > 0
          );
        } else if (productType === "bestSellers") {
          fetchedProducts = fetchedProducts.sort(
            (a, b) => b.averageRating - a.averageRating
          );
        }

        if (loadMore) {
          setAllProducts((prev) => [...prev, ...fetchedProducts]);
        } else {
          setAllProducts(fetchedProducts);
        }
      } catch (err) {
        console.error("Error fetching products:", err);
        // Don't update hasMoreProducts on error, allow retry
        // Show error in production via toast or error state if needed
        if (loadMore) {
          // On pagination error, allow user to retry
          setHasMoreProducts(true);
        }
      } finally {
        isFetchingRef.current = false;
        setIsLoadingProducts(false);
        setIsLoadingMore(false);
      }
    },
    [shopId]
  );

  // Algolia search function
  const performAlgoliaSearch = useCallback(async (query: string, currentShopId: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Reset abort flag for new search
    searchAbortRef.current = false;

    try {
      setIsSearching(true);

      const algolia = AlgoliaServiceManager.getInstance();

      // Search with shopId filter
      const algoliaResults = await algolia.searchProducts(
        query,
        0, // page
        100, // hitsPerPage - get more results for shop-specific search
        "shop_products", // index name
        undefined, // no filterType
        "None" // sortOption
      );

      // Check if this search was aborted
      if (searchAbortRef.current) {
        console.log('🚫 Search aborted:', query);
        return;
      }

      // Convert Algolia results to app's Product model and filter by shopId
      const convertedResults: Product[] = algoliaResults
        .map((algoliaProduct) => ProductUtils.fromAlgolia(algoliaProduct as unknown as Record<string, unknown>))
        .filter((product) => product.shopId === currentShopId);

      console.log(`✅ Algolia search complete: ${convertedResults.length} products found for shop ${currentShopId}`);
      setSearchResults(convertedResults);
    } catch (error) {
      console.error('❌ Algolia search error:', error);
      // On error, show no results but don't crash
      if (!searchAbortRef.current) {
        setSearchResults([]);
      }
    } finally {
      if (!searchAbortRef.current) {
        setIsSearching(false);
      }
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Abort any ongoing search
    searchAbortRef.current = true;

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Set searching state immediately for better UX
    setIsSearching(true);

    // Debounce search by 300ms
    searchTimeoutRef.current = setTimeout(() => {
      if (shopId) {
        performAlgoliaSearch(searchQuery, shopId);
      }
    }, 300);

    // Cleanup
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, shopId, performAlgoliaSearch]);

  // Determine which products to display
  const products = useMemo(() => {
    // If user is searching, show search results
    if (searchQuery.trim()) {
      return searchResults;
    }
    // Otherwise show regular products
    return allProducts;
  }, [searchQuery, searchResults, allProducts]);

  // Fetch collections
  const fetchCollections = useCallback(async () => {
    if (!shopId) return;

    try {
      const collectionsQuery = query(
        collection(db, "shops", shopId, "collections"),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(collectionsQuery);
      const fetchedCollections = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Collection[];

      setCollections(fetchedCollections);
    } catch (err) {
      console.error("Error fetching collections:", err);
    }
  }, [shopId]);

  // Fetch reviews
  const fetchReviews = useCallback(async () => {
    if (!shopId) return;

    try {
      const reviewsQuery = query(
        collection(db, "shops", shopId, "reviews"),
        orderBy("timestamp", "desc"),
        limit(10)
      );

      const snapshot = await getDocs(reviewsQuery);
      const fetchedReviews = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Review[];

      setReviews(fetchedReviews);
    } catch (err) {
      console.error("Error fetching reviews:", err);
    }
  }, [shopId]);

  // Initial data fetch
  useEffect(() => {
    fetchShopData();
  }, [fetchShopData]);

  // Fetch additional data when shop data is loaded
  useEffect(() => {
    if (shopData) {
      fetchCollections();
      fetchReviews();
      fetchProducts();
    }
  }, [shopData, fetchCollections, fetchReviews, fetchProducts]);

  // Update products when tab changes
  useEffect(() => {
    if (
      shopData &&
      ["allProducts", "deals", "bestSellers"].includes(activeTab)
    ) {
      const productType =
        activeTab === "allProducts"
          ? "all"
          : activeTab === "deals"
          ? "deals"
          : "bestSellers";
      fetchProducts(productType);
    }
  }, [activeTab, shopData, fetchProducts]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    // Reset pagination when changing tabs
    setLastProductDoc(null);
    lastProductDocRef.current = null;
    setHasMoreProducts(true);
  };

  // Load more products function
  const loadMoreProducts = useCallback(() => {
    if (isLoadingMore || !hasMoreProducts || isLoadingProducts) return;

    if (["allProducts", "deals", "bestSellers"].includes(activeTab)) {
      const productType =
        activeTab === "allProducts"
          ? "all"
          : activeTab === "deals"
          ? "deals"
          : "bestSellers";
      fetchProducts(productType, true);
    }
  }, [activeTab, isLoadingMore, hasMoreProducts, isLoadingProducts, fetchProducts]);

  // Infinite scroll observer
  useEffect(() => {
    // Only set up observer if we're on a products tab and have products
    if (!["allProducts", "deals", "bestSellers"].includes(activeTab)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreProducts();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget && allProducts.length > 0) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [loadMoreProducts, activeTab, allProducts.length]);

  const handleFavoriteToggle = () => {
    setIsFavorite(!isFavorite);
    // TODO: Implement Firebase favorite functionality
  };

  const handleBack = () => {
    router.back();
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + "M";
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + "K";
    }
    return num.toString();
  };

  if (isLoading) {
    return (
      <>
        <SecondHeader />
        <div
          className={`min-h-screen ${
            isDarkMode ? "bg-gray-900" : "bg-gray-50"
          }`}
        >
          <div className="max-w-6xl mx-auto">
            <div className="animate-pulse">
              {/* Header skeleton */}
              <div className="h-64 bg-gray-300" />
              <div className="p-4 space-y-4">
                <div className="h-4 bg-gray-300 rounded w-3/4" />
                <div className="h-4 bg-gray-300 rounded w-1/2" />
                <div className="flex space-x-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-8 bg-gray-300 rounded w-20" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (error || !shopData) {
    return (
      <>
        <SecondHeader />
        <div
          className={`min-h-screen flex items-center justify-center ${
            isDarkMode ? "bg-gray-900" : "bg-gray-50"
          }`}
        >
          <div className="text-center">
            <h2
              className={`text-xl font-semibold mb-4 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {error || "Shop not found"}
            </h2>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {t("goBack")}
            </button>
          </div>
        </div>
      </>
    );
  }

  const availableTabs: TabType[] = [];
  if (shopData.homeImageUrls && shopData.homeImageUrls.length > 0) {
    availableTabs.push("home");
  }
  availableTabs.push("allProducts");
  if (collections.length > 0) {
    availableTabs.push("collections");
  }
  availableTabs.push("deals", "bestSellers", "reviews");

  const renderTabContent = () => {
    switch (activeTab) {
      case "home":
        return (
          <div className="space-y-4">
            {shopData.homeImageUrls?.map((imageUrl, index) => (
              <div key={index} className="relative">
                <Image
                  src={imageUrl}
                  alt={`${shopData.name} home image ${index + 1}`}
                  width={800}
                  height={400}
                  className="w-full h-auto rounded-lg"
                />
              </div>
            ))}
          </div>
        );

      case "collections":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {collections.map((collection) => (
              <div
                key={collection.id}
                className={`p-4 rounded-lg border cursor-pointer hover:shadow-lg transition-shadow ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700 hover:border-gray-600"
                    : "bg-white border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200">
                    {collection.imageUrl ? (
                      <Image
                        src={collection.imageUrl}
                        alt={collection.name}
                        width={64}
                        height={64}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PhotoIcon className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div>
                    <h3
                      className={`font-semibold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {collection.name}
                    </h3>
                    <p
                      className={`text-sm ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {collection.productIds.length} {t("products")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );

      case "reviews":
        return (
          <div className="space-y-4">
            {reviews.length === 0 ? (
              <div className="text-center py-8">
                <p
                  className={`${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("noReviewsYet")}
                </p>
              </div>
            ) : (
              reviews.map((review) => (
                <div
                  key={review.id}
                  className={`p-4 rounded-lg ${
                    isDarkMode ? "bg-gray-800" : "bg-white"
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="flex">
                      {[...Array(5)].map((_, i) => (
                        <StarIcon
                          key={i}
                          className={`w-4 h-4 ${
                            i < review.rating
                              ? "text-yellow-400 fill-current"
                              : "text-gray-300"
                          }`}
                        />
                      ))}
                    </div>
                    <span
                      className={`text-sm ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {new Date(
                        review.timestamp.seconds * 1000
                      ).toLocaleDateString()}
                    </span>
                  </div>
                  <p
                    className={`${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {review.review}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className={`text-xs ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {review.userName || t("anonymous")}
                    </span>
                    <span
                      className={`text-xs ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {(review.likes || []).length} {t("likes")}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        );

      default: // Products tabs
        return (
          <div>
            {(isLoadingProducts || isSearching) ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className={`h-48 rounded-t-lg ${isDarkMode ? "bg-gray-700" : "bg-gray-300"}`} />
                    <div className="p-3 space-y-2">
                      <div className={`h-4 rounded ${isDarkMode ? "bg-gray-700" : "bg-gray-300"}`} />
                      <div className={`h-4 rounded w-3/4 ${isDarkMode ? "bg-gray-700" : "bg-gray-300"}`} />
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12">
                <p
                  className={`text-lg ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("noProductsFound")}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onTap={() => router.push(`/productdetail/${product.id}`)}
                      onFavoriteToggle={() => {}}
                      onAddToCart={() => {}}
                      onColorSelect={() => {}}
                      showCartIcon={true}
                      isFavorited={false}
                      isInCart={false}
                      portraitImageHeight={320}
                    />
                  ))}
                </div>

                {/* Infinite scroll trigger - only show when not searching */}
                {!searchQuery.trim() && hasMoreProducts && <div ref={observerTarget} className="h-10" />}
              </>
            )}
          </div>
        );
    }
  };

  return (
    <>
      <SecondHeader />
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      >
        <div className="max-w-6xl mx-auto">
          <div>
            {/* Header with Cover Image */}
            <div className="relative h-64 overflow-hidden bg-gradient-to-br from-orange-500 to-pink-500">
  {shopData.coverImageUrls && shopData.coverImageUrls.length > 0 && (
    <>
      {/* Image */}
      <Image
        src={shopData.coverImageUrls[0]}
        alt={`${shopData.name} cover`}
        fill
        sizes="100vw"
        className="object-cover"
        priority
        unoptimized
        onLoad={() => console.log("✅ Next Image loaded")}
        onError={() => console.error("❌ Next Image failed")}
      />
      
      {/* Overlay using pseudo-element approach */}
      <div className="absolute inset-0 bg-black/30 pointer-events-none" />
    </>
  )}

  {/* Back Button */}
  <button
    onClick={handleBack}
    className="absolute top-4 left-4 z-20 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-all"
  >
    <ArrowLeftIcon className="w-6 h-6" />
  </button>

  {/* Shop Info */}
  <div className="absolute bottom-4 left-4 right-4 z-20">
                <div className="flex items-end space-x-4">
                  {/* Profile Image */}
                  <div className="relative w-20 h-20 rounded-full border-4 border-white overflow-hidden shadow-lg">
                    {shopData.profileImageUrl ? (
                      <Image
                        src={shopData.profileImageUrl}
                        alt={shopData.name}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                        <span className="text-2xl">🏪</span>
                      </div>
                    )}
                  </div>

                  {/* Shop Details */}
                  <div className="flex-1 text-white">
                    <h1 className="text-2xl font-bold mb-2">{shopData.name}</h1>
                    <div className="flex items-center space-x-4 text-sm">
                      <div className="flex items-center space-x-1">
                        <StarIcon className="w-4 h-4 text-yellow-400" />
                        <span>{shopData.averageRating.toFixed(1)}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <UsersIcon className="w-4 h-4" />
                        <span>
                          {formatNumber(shopData.followerCount)} {t("followers")}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <EyeIcon className="w-4 h-4" />
                        <span>{formatNumber(shopData.clickCount)} {t("views")}</span>
                      </div>
                    </div>
                  </div>

                  {/* Follow Button */}
                  <button
                    onClick={handleFavoriteToggle}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                      isFavorite
                        ? "bg-red-500 text-white hover:bg-red-600"
                        : "bg-white text-gray-900 hover:bg-gray-100"
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      {isFavorite ? (
                        <HeartSolidIcon className="w-4 h-4" />
                      ) : (
                        <HeartIcon className="w-4 h-4" />
                      )}
                      <span>{isFavorite ? t("following") : t("follow")}</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* Search Bar */}
            <div
              className={`sticky top-0 z-10 px-4 py-3 transition-all ${
                isScrolled
                  ? "bg-opacity-95 backdrop-blur-sm shadow-sm"
                  : "bg-opacity-50"
              } ${isDarkMode ? "bg-gray-900" : "bg-white"}`}
            >
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t("searchInStore")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-10 pr-4 py-3 rounded-full border ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700 text-white placeholder-gray-400"
                      : "bg-white border-gray-200 text-gray-900 placeholder-gray-500"
                  }`}
                />
              </div>
            </div>

            {/* Tabs */}
            <div
              className={`sticky top-16 z-10 border-b ${
                isDarkMode
                  ? "bg-gray-900 border-gray-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <div className="flex overflow-x-auto">
                {availableTabs.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => handleTabChange(tab)}
                    className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                      activeTab === tab
                        ? "border-orange-500 text-orange-500"
                        : isDarkMode
                        ? "border-transparent text-gray-400 hover:text-gray-300"
                        : "border-transparent text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {t(tab)}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter Row */}
            {["allProducts", "deals", "bestSellers"].includes(activeTab) && (
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex space-x-3">
                  <button
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg border ${
                      isDarkMode
                        ? "border-gray-700 text-gray-300 hover:bg-gray-800"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <AdjustmentsHorizontalIcon className="w-4 h-4 text-orange-500" />
                    <span>{t("sort")}</span>
                  </button>
                  <button
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg border ${
                      isDarkMode
                        ? "border-gray-700 text-gray-300 hover:bg-gray-800"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <FunnelIcon className="w-4 h-4 text-orange-500" />
                    <span>{t("filter")}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="p-4">{renderTabContent()}</div>
          </div>
        </div>
      </div>
    </>
  );
}
