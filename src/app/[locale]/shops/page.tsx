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
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import SecondHeader from "../../components/market_screen/SecondHeader";
import ShopCard from "../../components/shops/ShopCard";
import CreateShopButton from "../../components/shops/CreateShopButton";
import SearchAndFilter from "../../components/shops/SearchAndFilter";
import LoadingShopCard from "../../components/shops/LoadingShopCard";

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

  const t = useTranslations("shops");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

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

  // Fetch shops function
  const fetchShops = useCallback(
    async (
      isLoadMore = false,
      searchQuery = "",
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

        // Apply search filter
        if (searchQuery.trim()) {
          shopsQuery = query(
            collection(db, "shops"),
            where("name", ">=", searchQuery),
            where("name", "<=", searchQuery + "\uf8ff"),
            orderBy("name"),
            limit(SHOPS_PER_PAGE)
          );
        }

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
          shopsQuery = query(
            collection(db, "shops"),
            orderBy("createdAt", "desc"),
            startAfter(lastDocument),
            limit(SHOPS_PER_PAGE)
          );
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
    fetchShops(false, searchTerm, selectedCategory);
  }, []);

  // Handle search and filter changes
  useEffect(() => {
    setLastDocument(null);
    setHasMore(true);
    fetchShops(false, searchTerm, selectedCategory);
  }, [searchTerm, selectedCategory]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
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
          fetchShops(true, searchTerm, selectedCategory);
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
    setLastDocument(null);
    setHasMore(true);
    await fetchShops(false, searchTerm, selectedCategory);
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
            <div className="text-center py-12">
              <div
                className={`text-6xl mb-4 ${
                  isDarkMode ? "text-gray-600" : "text-gray-400"
                }`}
              >
                ⚠️
              </div>
              <h3
                className={`text-xl font-semibold mb-2 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("errorLoading")}
              </h3>
              <p
                className={`mb-4 ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {error}
              </p>
              <button
                onClick={handleRefresh}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      >
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1
              className={`text-3xl font-bold mb-6 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("title")}
            </h1>

            {/* Create Shop Button */}
            <CreateShopButton />

            {/* Search and Filter */}
            <SearchAndFilter
              onSearch={handleSearch}
              onCategoryFilter={handleCategoryFilter}
              selectedCategory={selectedCategory}
              isDarkMode={isDarkMode}
            />
          </div>

          {/* Shops Grid */}
          {isLoading && shops.length === 0 ? (
            <div className={`grid ${getGridCols()} gap-6`}>
              {Array.from({ length: 8 }).map((_, index) => (
                <LoadingShopCard key={index} isDarkMode={isDarkMode} />
              ))}
            </div>
          ) : shops.length === 0 ? (
            <div className="text-center py-12">
              <div
                className={`text-6xl mb-4 ${
                  isDarkMode ? "text-gray-600" : "text-gray-400"
                }`}
              >
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
                className={`${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
              >
                {searchTerm || selectedCategory
                  ? t("noShopsMatchFilter")
                  : t("noShopsAvailable")}
              </p>
            </div>
          ) : (
            <>
              <div className={`grid ${getGridCols()} gap-6`}>
                {shops.map((shop) => (
                  <ShopCard key={shop.id} shop={shop} isDarkMode={isDarkMode} />
                ))}
              </div>

              {/* Load More Trigger */}
              <div ref={loadMoreRef} className="mt-8">
                {isLoadingMore && (
                  <div className={`grid ${getGridCols()} gap-6`}>
                    {Array.from({ length: 4 }).map((_, index) => (
                      <LoadingShopCard
                        key={`loading-${index}`}
                        isDarkMode={isDarkMode}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* End Message */}
              {!hasMore && shops.length > 0 && (
                <div className="text-center py-8">
                  <p
                    className={`${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {t("allShopsLoaded")}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
