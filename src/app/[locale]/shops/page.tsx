"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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
import SearchAndFilter from "../../components/shops/SearchAndFilter";
import LoadingShopCard from "../../components/shops/LoadingShopCard";
import AlgoliaServiceManager from "@/lib/algolia";

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
}

export default function ShopsPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [lastDocument, setLastDocument] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // Algolia search states
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Shop[]>([]);

  const t = useTranslations("shops");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const searchAbortRef = useRef<boolean>(false);

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
          100, // hitsPerPage
          0 // page
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
      try {
        if (!isLoadMore) {
          setIsLoading(true);
          setError(null);
        } else {
          setIsLoadingMore(true);
        }

        let shopsQuery = query(
          collection(db, "shops"),
          orderBy("createdAt", "desc"),
          limit(SHOPS_PER_PAGE)
        );

        // Apply category filter
        if (categoryFilter) {
          shopsQuery = query(
            collection(db, "shops"),
            where("categories", "array-contains", categoryFilter),
            orderBy("createdAt", "desc"),
            limit(SHOPS_PER_PAGE)
          );
        }

        // Add pagination
        if (isLoadMore && lastDocument) {
          if (categoryFilter) {
            shopsQuery = query(
              collection(db, "shops"),
              where("categories", "array-contains", categoryFilter),
              orderBy("createdAt", "desc"),
              startAfter(lastDocument),
              limit(SHOPS_PER_PAGE)
            );
          } else {
            shopsQuery = query(
              collection(db, "shops"),
              orderBy("createdAt", "desc"),
              startAfter(lastDocument),
              limit(SHOPS_PER_PAGE)
            );
          }
        }

        const snapshot = await getDocs(shopsQuery);
        const newShops: Shop[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Shop[];

        if (isLoadMore) {
          setShops((prev) => [...prev, ...newShops]);
        } else {
          setShops(newShops);
        }

        setLastDocument(snapshot.docs[snapshot.docs.length - 1] || null);
        setHasMore(snapshot.docs.length === SHOPS_PER_PAGE);
      } catch (err) {
        console.error("Error fetching shops:", err);
        setError("Failed to load shops. Please try again.");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [lastDocument]
  );

  // Initial load
  useEffect(() => {
    fetchShops(false, selectedCategory);
  }, []);

  // Handle category filter changes (only for Firebase, Algolia handles it in search)
  useEffect(() => {
    if (!searchTerm.trim()) {
      setLastDocument(null);
      setHasMore(true);
      fetchShops(false, selectedCategory);
    }
  }, [selectedCategory]);

  // Intersection Observer for infinite scroll (only when not searching)
  useEffect(() => {
    // Disable infinite scroll when searching with Algolia
    if (searchTerm.trim()) {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      return;
    }

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMore &&
          !isLoadingMore &&
          !isLoading
        ) {
          fetchShops(true, selectedCategory);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [
    hasMore,
    isLoadingMore,
    isLoading,
    searchTerm,
    selectedCategory,
    fetchShops,
  ]);

  const handleRefresh = async () => {
    setShops([]);
    setSearchResults([]);
    setLastDocument(null);
    setHasMore(true);

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
    setSelectedCategory(category);
  };

  const getGridCols = () => {
    return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";
  };

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
              <div className={`text-6xl mb-6 ${
                isDarkMode ? "text-gray-600" : "text-gray-400"
              }`}>
                ⚠️
              </div>

              <h3
                className={`text-2xl font-semibold mb-4 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("errorLoading")}
              </h3>
              <p
                className={`text-base mb-8 max-w-md mx-auto ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {error}
              </p>
              <button
                onClick={handleRefresh}
                className={`px-6 py-3 rounded-lg font-medium transition-colors ${
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
      >
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            {/* Title Section */}
            <div className="text-center mb-8">
              <h1
                className={`text-3xl md:text-4xl font-bold mb-6 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("title")}
              </h1>
            </div>

            {/* Create Shop Button */}
            <div className="flex justify-center mb-6">
              <CreateShopButton />
            </div>

            {/* Search and Filter */}
            <div className={`rounded-lg p-6 border ${
              isDarkMode
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-gray-200"
            }`}>
              <SearchAndFilter
                onSearch={handleSearch}
                onCategoryFilter={handleCategoryFilter}
                selectedCategory={selectedCategory}
                isDarkMode={isDarkMode}
              />
            </div>
          </div>

          {/* Shops Grid */}
          {(isLoading && shops.length === 0) || isSearching ? (
            <div className={`grid ${getGridCols()} gap-6`}>
              {Array.from({ length: 8 }).map((_, index) => (
                <LoadingShopCard key={index} isDarkMode={isDarkMode} />
              ))}
            </div>
          ) : (searchTerm.trim() ? searchResults : shops).length === 0 ? (
            <div className="text-center py-20">
              <div className={`text-6xl mb-6 ${
                isDarkMode ? "text-gray-600" : "text-gray-400"
              }`}>
                🏪
              </div>

              <h3
                className={`text-2xl font-semibold mb-4 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("noShopsFound")}
              </h3>
              <p
                className={`text-base max-w-md mx-auto ${
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
              <div className={`grid ${getGridCols()} gap-6`}>
                {(searchTerm.trim() ? searchResults : shops).map((shop) => (
                  <ShopCard key={shop.id} shop={shop} isDarkMode={isDarkMode} />
                ))}
              </div>

              {/* Load More Trigger - only for Firebase pagination */}
              {!searchTerm.trim() && (
                <div ref={loadMoreRef} className="mt-8">
                  {isLoadingMore && (
                    <div className={`grid ${getGridCols()} gap-6`}>
                      {Array.from({ length: 4 }).map((_, index) => (
                        <LoadingShopCard key={`loading-${index}`} isDarkMode={isDarkMode} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* End Message */}
              {!hasMore && !searchTerm.trim() && shops.length > 0 && (
                <div className="text-center py-12">
                  <div className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg ${
                    isDarkMode
                      ? "bg-gray-800 border border-gray-700 text-gray-300"
                      : "bg-white border border-gray-200 text-gray-600"
                  }`}>
                    <span className="font-medium">{t("allShopsLoaded")}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}