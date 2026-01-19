"use client";

import React, { useState, useEffect, useCallback, useRef, useTransition, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
  where,
  Timestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import SecondHeader from "../../components/market_screen/SecondHeader";
import ShopCard from "../../components/shops/ShopCard";
import CreateShopButton from "../../components/shops/CreateShopButton";
import LoadingShopCard from "../../components/shops/LoadingShopCard";
import AlgoliaServiceManager from "@/lib/algolia";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { AllInOneCategoryData } from "@/constants/productData";

interface Shop {
  id: string;
  name: string;
  profileImageUrl: string;
  coverImageUrls: string[];
  address: string;
  averageRating: number;
  reviewCount: number;
  followerCount: number;
  clickCount: number;
  categories: string[];
  contactNo: string;
  ownerId: string;
  isBoosted: boolean;
  createdAt: Timestamp;
  isActive?: boolean;
}

// Get categories from productData
const CATEGORIES = AllInOneCategoryData.kCategories.map((cat) => cat.key);

// Helper function to get the translation key for any category
const getCategoryTranslationKey = (category: string): string => {
  switch (category) {
    case "Women":
      return "buyerCategoryWomen";
    case "Men":
      return "buyerCategoryMen";
    case "Clothing & Fashion":
      return "categoryClothingFashion";
    case "Footwear":
      return "categoryFootwear";
    case "Accessories":
      return "categoryAccessories";
    case "Mother & Child":
      return "categoryMotherChild";
    case "Home & Furniture":
      return "categoryHomeFurniture";
    case "Beauty & Personal Care":
      return "categoryBeautyPersonalCare";
    case "Bags & Luggage":
      return "categoryBagsLuggage";
    case "Electronics":
      return "categoryElectronics";
    case "Sports & Outdoor":
      return "categorySportsOutdoor";
    case "Books, Stationery & Hobby":
      return "categoryBooksStationeryHobby";
    case "Tools & Hardware":
      return "categoryToolsHardware";
    case "Pet Supplies":
      return "categoryPetSupplies";
    case "Automotive":
      return "categoryAutomotive";
    case "Health & Wellness":
      return "categoryHealthWellness";
    case "Kids":
      return "categoryMotherChild";
    case "Beauty":
      return "categoryBeautyPersonalCare";
    case "Jewelry":
      return "categoryAccessories";
    case "Home & Garden":
      return "categoryHomeFurniture";
    case "Sports":
      return "categorySportsOutdoor";
    case "Books":
      return "categoryBooksStationeryHobby";
    default:
      return category;
  }
};

export default function ShopsPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  // Use ref for lastDocument to avoid stale closure issues in IntersectionObserver
  const lastDocumentRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  // Algolia search states
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Shop[]>([]);

  // Use transition to prevent flickering
  const [isPending, startTransition] = useTransition();

  // Track if we're actively filtering to show shimmer
  const [isFiltering, setIsFiltering] = useState(false);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  const t = useTranslations("shops");
  const tRoot = useTranslations();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchAbortRef = useRef<boolean>(false);

  // Track if a fetch is in progress to prevent concurrent requests
  const isFetchingRef = useRef(false);

  // Use refs for values needed in IntersectionObserver callback to avoid stale closures
  const hasMoreRef = useRef(true);
  const isLoadingMoreRef = useRef(false);
  const isLoadingRef = useRef(true);

  const SHOPS_PER_PAGE = 20;


  // Handle theme detection
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    if (typeof document !== "undefined") {
      const savedTheme = localStorage.getItem("theme");
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

      if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      searchAbortRef.current = true;
    };
  }, []);

  // Algolia search function with Firestore enrichment
  const performAlgoliaSearch = useCallback(
    async (query: string, categoryFilter: string | null = null) => {
      if (!query.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      searchAbortRef.current = false;

      try {
        setIsSearching(true);

        const algolia = AlgoliaServiceManager.getInstance();

        // Search shops index using dedicated method
        const algoliaResults = await algolia.searchShops(
          query,
          100,
          0,
          'isActive:true' // ✅ Correct - just pass the string directly
        );

        // Check if search was aborted
        if (searchAbortRef.current) {
          console.log("🚫 Shop search aborted:", query);
          return;
        }

        // Convert Algolia Shop results to component Shop interface
        let shopResults: Shop[] = algoliaResults.map((result) => ({
          id: result.id,
          name: result.name,
          profileImageUrl: result.profileImageUrl,
          coverImageUrls: result.coverImageUrls,
          address: result.address,
          averageRating: result.averageRating,
          reviewCount: result.reviewCount,
          followerCount: result.followerCount,
          clickCount: result.clickCount,
          categories: result.categories,
          contactNo: result.contactNo,
          ownerId: result.ownerId,
          isBoosted: result.isBoosted,
          createdAt: result.createdAt
            ? Timestamp.fromDate(new Date(result.createdAt))
            : Timestamp.now(),
        }));

        // Enrich with Firestore data if cover images are missing
        const shopsNeedingEnrichment = shopResults.filter(
          (shop) => !shop.coverImageUrls || shop.coverImageUrls.length === 0
        );

        if (shopsNeedingEnrichment.length > 0) {
          console.log(
            `🔄 Enriching ${shopsNeedingEnrichment.length} shops with Firestore data...`
          );

          // Batch fetch from Firestore
          const enrichmentPromises = shopsNeedingEnrichment.map(
            async (shop) => {
              try {
                const shopDocRef = doc(db, "shops", shop.id);
                const shopDocSnap = await getDoc(shopDocRef);

                if (shopDocSnap.exists()) {
                  const firestoreData = shopDocSnap.data();
                  return {
                    shopId: shop.id,
                    coverImageUrls: firestoreData.coverImageUrls || [],
                  };
                }
              } catch (err) {
                console.error(`Failed to enrich shop ${shop.id}:`, err);
              }
              return null;
            }
          );

          const enrichmentResults = await Promise.all(enrichmentPromises);

          // Merge enriched data back into results
          const enrichmentMap = new Map(
            enrichmentResults
              .filter((r) => r !== null)
              .map((r) => [r!.shopId, r!.coverImageUrls])
          );

          shopResults = shopResults.map((shop) => ({
            ...shop,
            coverImageUrls: enrichmentMap.get(shop.id) || shop.coverImageUrls,
          }));

          console.log(
            `✅ Enrichment complete: ${enrichmentMap.size} shops updated`
          );
        }

        // Check if search was aborted during enrichment
        if (searchAbortRef.current) {
          console.log("🚫 Shop search aborted during enrichment:", query);
          return;
        }

        // Filter by category if selected
        const filteredResults = categoryFilter
          ? shopResults.filter((shop) =>
              shop.categories.includes(categoryFilter)
            )
          : shopResults;

        console.log(
          `✅ Algolia shop search complete: ${filteredResults.length} shops found`
        );
        setSearchResults(filteredResults);
      } catch (error) {
        console.error("❌ Algolia shop search error:", error);
        if (!searchAbortRef.current) {
          setSearchResults([]);
        }
      } finally {
        if (!searchAbortRef.current) {
          setIsSearching(false);
        }
      }
    },
    []
  );

  // Debounced search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Abort ongoing search
    searchAbortRef.current = true;

    if (!searchTerm.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Set searching state immediately
    setIsSearching(true);

    // Debounce search by 300ms
    searchTimeoutRef.current = setTimeout(() => {
      performAlgoliaSearch(searchTerm, selectedCategory);
    }, 300);

    // Cleanup
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, selectedCategory, performAlgoliaSearch]);

  // Fetch shops function (Firebase - used only when not searching)
  const fetchShops = useCallback(
    async (
      isLoadMore = false,
      categoryFilter: string | null = null
    ) => {
      // Prevent concurrent fetches using ref
      if (isFetchingRef.current) {
        return Promise.resolve();
      }

      // For load more, check if we have a cursor document
      if (isLoadMore && !lastDocumentRef.current) {
        console.log("No more shops to load (no cursor)");
        return Promise.resolve();
      }

      isFetchingRef.current = true;

      try {
        if (!isLoadMore) {
          setIsLoading(true);
          isLoadingRef.current = true;
          setError(null);
        } else {
          setIsLoadingMore(true);
          isLoadingMoreRef.current = true;
        }

        // Build base query
        let shopsQuery;

        if (isLoadMore && lastDocumentRef.current) {
          // Paginated query with cursor
          if (categoryFilter) {
            shopsQuery = query(
              collection(db, "shops"),
              where("isActive", "==", true),
              where("categories", "array-contains", categoryFilter),
              orderBy("createdAt", "desc"),
              startAfter(lastDocumentRef.current),
              limit(SHOPS_PER_PAGE)
            );
          } else {
            shopsQuery = query(
              collection(db, "shops"),
              where("isActive", "==", true),
              orderBy("createdAt", "desc"),
              startAfter(lastDocumentRef.current),
              limit(SHOPS_PER_PAGE)
            );
          }
        } else {
          // Initial query (no cursor)
          if (categoryFilter) {
            shopsQuery = query(
              collection(db, "shops"),
              where("isActive", "==", true),
              where("categories", "array-contains", categoryFilter),
              orderBy("createdAt", "desc"),
              limit(SHOPS_PER_PAGE)
            );
          } else {
            shopsQuery = query(
              collection(db, "shops"),
              where("isActive", "==", true),
              orderBy("createdAt", "desc"),
              limit(SHOPS_PER_PAGE)
            );
          }
        }

        const snapshot = await getDocs(shopsQuery);
        const newShops: Shop[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Shop[];

        // Update cursor ref
        const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
        lastDocumentRef.current = lastDoc;

        // Determine if there are more results
        const hasMoreResults = snapshot.docs.length === SHOPS_PER_PAGE;
        setHasMore(hasMoreResults);
        hasMoreRef.current = hasMoreResults;

        if (isLoadMore) {
          // Deduplicate when adding more shops
          setShops((prev) => {
            const existingIds = new Set(prev.map(shop => shop.id));
            const uniqueNewShops = newShops.filter(shop => !existingIds.has(shop.id));
            return [...prev, ...uniqueNewShops];
          });
        } else {
          // Use transition to prevent flickering
          startTransition(() => {
            setShops(newShops);
          });
        }
      } catch (err) {
        console.error("Error fetching shops:", err);
        setError("Failed to load shops. Please try again.");
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
        isFetchingRef.current = false;
      }
    },
    [startTransition]
  );

  // Track initial mount to prevent filter effect from running
  const isInitialMount = useRef(true);

  // Initial load
  useEffect(() => {
    fetchShops(false, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle category filter changes (only for Firebase, Algolia handles it in search)
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!searchTerm.trim()) {
      // Clear shops immediately to prevent duplicates
      setShops([]);
      lastDocumentRef.current = null;
      setHasMore(true);
      hasMoreRef.current = true;
      fetchShops(false, selectedCategory).finally(() => {
        setIsFiltering(false);
      });
    } else {
      // If searching, make sure to clear filtering state
      setIsFiltering(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, searchTerm]);

  // Intersection Observer for infinite scroll (only when not searching)
  useEffect(() => {
    // Disable infinite scroll when searching with Algolia
    if (searchTerm.trim()) {
      return;
    }

    let debounceTimer: NodeJS.Timeout;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMoreRef.current &&
          !isLoadingMoreRef.current &&
          !isFetchingRef.current
        ) {
          // Debounce to prevent rapid-fire requests
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            console.log("Loading more shops...");
            fetchShops(true, selectedCategory);
          }, 150);
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    const currentTarget = loadMoreRef.current;
    if (currentTarget && shops.length > 0) {
      observer.observe(currentTarget);
    }

    return () => {
      clearTimeout(debounceTimer);
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
      observer.disconnect();
    };
  }, [searchTerm, shops.length, hasMore, isLoadingMore, selectedCategory, fetchShops]);

  const handleRefresh = async () => {
    setShops([]);
    setSearchResults([]);
    lastDocumentRef.current = null;
    setHasMore(true);
    hasMoreRef.current = true;

    if (searchTerm.trim()) {
      await performAlgoliaSearch(searchTerm, selectedCategory);
    } else {
      await fetchShops(false, selectedCategory);
    }
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
  };

  const handleCategoryFilter = (category: string | null) => {
    setIsFiltering(true);
    setIsFilterExpanded(false);
    startTransition(() => {
      setSelectedCategory(category === selectedCategory ? null : category);
    });
  };

  const getGridCols = () => {
    return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";
  };

  // Memoize the displayed shops to prevent unnecessary re-renders
  // Also deduplicate as a safety measure
  const displayedShops = useMemo(() => {
    const shopsList = searchTerm.trim() ? searchResults : shops;

    // Deduplicate by ID as a safety measure
    const uniqueShops = shopsList.reduce((acc, shop) => {
      if (!acc.some(s => s.id === shop.id)) {
        acc.push(shop);
      }
      return acc;
    }, [] as Shop[]);

    return uniqueShops;
  }, [searchTerm, searchResults, shops]);

  if (error && shops.length === 0) {
    return (
      <>
        <SecondHeader />
        <div
          className={`min-h-screen ${
            isDarkMode ? "bg-gray-900" : "bg-gray-50"
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="text-center py-20">
              <div className={`text-5xl mb-4 ${
                isDarkMode ? "text-gray-600" : "text-gray-400"
              }`}>
                ⚠️
              </div>

              <h3
                className={`text-xl font-semibold mb-3 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("errorLoading")}
              </h3>
              <p
                className={`text-sm mb-6 max-w-md mx-auto ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {error}
              </p>
              <button
                onClick={handleRefresh}
                className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
                  isDarkMode
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {t("retry")}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SecondHeader />
      <div
        className={`min-h-screen ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
        style={{
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitFontSmoothing: 'antialiased'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Compact Header Row */}
          <div className="mb-5">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-4">
              {/* Title and Create Button */}
              <div className="flex items-center gap-3">
                <h1
                  className={`text-xl md:text-2xl font-semibold whitespace-nowrap ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("title")}
                </h1>
                <CreateShopButton />
              </div>

              {/* Search and Filter in Same Row */}
              <div className="flex-1 flex items-center gap-3">
                {/* Search Bar */}
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon
                      className={`h-4 w-4 ${
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder={t("searchShops")}
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    className={`w-full pl-9 pr-10 py-2 text-sm rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-700 text-white placeholder-gray-400"
                        : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                    }`}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => handleSearch("")}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      <XMarkIcon
                        className={`h-4 w-4 ${
                          isDarkMode
                            ? "text-gray-400 hover:text-gray-300"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                      />
                    </button>
                  )}
                </div>

                {/* Filter Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
                        : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                    } ${selectedCategory ? "ring-2 ring-blue-500" : ""}`}
                  >
                    <FunnelIcon className="w-4 h-4" />
                    {t("filter")}
                    {selectedCategory && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-600 text-white rounded-full">
                        1
                      </span>
                    )}
                  </button>

                  {/* Filter Dropdown Menu */}
                  {isFilterExpanded && (
                    <>
                      {/* Backdrop */}
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsFilterExpanded(false)}
                      />

                      {/* Dropdown */}
                      <div
                        className={`absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg border shadow-lg z-50 ${
                          isDarkMode
                            ? "bg-gray-800 border-gray-700"
                            : "bg-white border-gray-200"
                        }`}
                      >
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h3
                              className={`font-semibold text-sm ${
                                isDarkMode ? "text-white" : "text-gray-900"
                              }`}
                            >
                              {t("categories")}
                            </h3>
                            {selectedCategory && (
                              <button
                                onClick={() => handleCategoryFilter(null)}
                                className={`text-xs px-2 py-1 rounded transition-colors ${
                                  isDarkMode
                                    ? "text-gray-400 hover:text-white hover:bg-gray-700"
                                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                                }`}
                              >
                                {t("clearFilters")}
                              </button>
                            )}
                          </div>

                          <div className="space-y-1">
                            {CATEGORIES.map((category) => (
                              <button
                                key={category}
                                onClick={() => handleCategoryFilter(category)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                  selectedCategory === category
                                    ? "bg-blue-600 text-white"
                                    : isDarkMode
                                    ? "text-gray-300 hover:bg-gray-700"
                                    : "text-gray-700 hover:bg-gray-100"
                                }`}
                              >
                                {tRoot(getCategoryTranslationKey(category))}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Active Filters Display */}
            {(searchTerm.trim() || selectedCategory) && (
              <div className="flex flex-wrap gap-2">
                {searchTerm.trim() && (
                  <div
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${
                      isDarkMode
                        ? "bg-blue-900/50 text-blue-300"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    <span>&quot;{searchTerm}&quot;</span>
                    <button
                      onClick={() => handleSearch("")}
                      className="ml-1 hover:opacity-70"
                    >
                      <XMarkIcon className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {selectedCategory && (
                  <div
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${
                      isDarkMode
                        ? "bg-green-900/50 text-green-300"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    <span>{tRoot(getCategoryTranslationKey(selectedCategory))}</span>
                    <button
                      onClick={() => handleCategoryFilter(null)}
                      className="ml-1 hover:opacity-70"
                    >
                      <XMarkIcon className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Shops Grid */}
          {(isLoading && shops.length === 0) || isSearching || isFiltering ? (
            <div className={`grid ${getGridCols()} gap-4`}>
              {Array.from({ length: 8 }).map((_, index) => (
                <LoadingShopCard key={index} isDarkMode={isDarkMode} />
              ))}
            </div>
          ) : displayedShops.length === 0 ? (
            <div className="text-center py-16">
              <div className={`text-5xl mb-4 ${
                isDarkMode ? "text-gray-600" : "text-gray-400"
              }`}>
                🏪
              </div>

              <h3
                className={`text-xl font-semibold mb-2 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("noShopsFound")}
              </h3>
              <p
                className={`text-sm max-w-md mx-auto ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {searchTerm || selectedCategory
                  ? t("noShopsMatchFilter")
                  : t("noShopsAvailable")}
              </p>
            </div>
          ) : (
            <>
              {/* Subtle loading indicator when filtering */}
              {isPending && (
                <div className="flex justify-center mb-3">
                  <div className={`px-3 py-2 rounded-lg text-sm ${
                    isDarkMode ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-600"
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-blue-500 border-t-transparent"></div>
                      <span>{t("loading")}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className={`grid ${getGridCols()} gap-4 ${isPending ? 'opacity-60 transition-opacity duration-200' : ''}`}>
                {displayedShops.map((shop) => (
                  <ShopCard key={shop.id} shop={shop} isDarkMode={isDarkMode} />
                ))}
              </div>

              {/* Load More Trigger - only for Firebase pagination */}
              {!searchTerm.trim() && hasMore && (
                <>
                  {/* Invisible sentinel for IntersectionObserver */}
                  {!isLoadingMore && <div ref={loadMoreRef} className="h-10" />}

                  {/* Loading state */}
                  {isLoadingMore && (
                    <div className={`grid ${getGridCols()} gap-4 mt-6`}>
                      {Array.from({ length: 4 }).map((_, index) => (
                        <LoadingShopCard key={`loading-${index}`} isDarkMode={isDarkMode} />
                      ))}
                    </div>
                  )}

                  {/* Fallback Load More button */}
                  {!isLoadingMore && (
                    <div className="flex justify-center py-6">
                      <button
                        onClick={() => fetchShops(true, selectedCategory)}
                        className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                          isDarkMode
                            ? "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700"
                            : "bg-white hover:bg-gray-50 text-gray-900 border border-gray-300"
                        }`}
                      >
                        {t("loadMore") || "Load More"}
                      </button>
                    </div>
                  )}
                </>
              )}

            </>
          )}
        </div>
      </div>
    </>
  );
}
