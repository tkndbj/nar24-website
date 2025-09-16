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
import { SparklesIcon, ShoppingBagIcon } from "@heroicons/react/24/outline";

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
  const [scrollY, setScrollY] = useState(0);

  const t = useTranslations("shops");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const SHOPS_PER_PAGE = 20;

  // Handle scroll for parallax effect
  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
          className={`min-h-screen relative overflow-hidden ${
            isDarkMode ? "bg-gray-900" : "bg-gray-50"
          }`}
        >
          {/* Animated Background Elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className={`absolute -top-40 -right-40 w-80 h-80 rounded-full blur-3xl opacity-20 ${
              isDarkMode ? "bg-red-500" : "bg-red-400"
            }`} style={{ transform: `translateY(${scrollY * 0.5}px)` }} />
            <div className={`absolute top-1/2 -left-40 w-60 h-60 rounded-full blur-3xl opacity-20 ${
              isDarkMode ? "bg-purple-500" : "bg-purple-400"
            }`} style={{ transform: `translateY(${scrollY * -0.3}px)` }} />
          </div>

          <div className="max-w-7xl mx-auto px-4 py-8 relative z-10">
            <div className="text-center py-20">
              <div className="relative inline-block mb-8">
                <div
                  className={`text-8xl mb-4 animate-bounce ${
                    isDarkMode ? "text-gray-600" : "text-gray-400"
                  }`}
                >
                  ⚠️
                </div>
                <div className="absolute -inset-4 bg-gradient-to-r from-red-400 to-purple-500 rounded-full blur opacity-20 animate-pulse" />
              </div>
              
              <h3
                className={`text-3xl font-bold mb-4 bg-gradient-to-r ${
                  isDarkMode 
                    ? "from-white to-gray-300 bg-clip-text text-transparent" 
                    : "from-gray-900 to-gray-600 bg-clip-text text-transparent"
                }`}
              >
                {t("errorLoading")}
              </h3>
              <p
                className={`text-lg mb-8 max-w-md mx-auto ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {error}
              </p>
              <button
                onClick={handleRefresh}
                className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-semibold transition-all duration-300 hover:scale-105 hover:shadow-2xl overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <span className="relative flex items-center gap-2">
                  <SparklesIcon className="w-5 h-5" />
                  {t("retry")}
                </span>
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
        className={`min-h-screen relative overflow-hidden ${
          isDarkMode 
            ? "bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800" 
            : "bg-gradient-to-br from-gray-50 via-white to-gray-100"
        }`}
      >
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className={`absolute -top-40 -right-40 w-80 h-80 rounded-full blur-3xl opacity-10 ${
            isDarkMode ? "bg-blue-500" : "bg-blue-400"
          }`} style={{ transform: `translateY(${scrollY * 0.5}px)` }} />
          <div className={`absolute top-1/2 -left-40 w-60 h-60 rounded-full blur-3xl opacity-10 ${
            isDarkMode ? "bg-purple-500" : "bg-purple-400"
          }`} style={{ transform: `translateY(${scrollY * -0.3}px)` }} />
          <div className={`absolute bottom-0 right-1/4 w-40 h-40 rounded-full blur-3xl opacity-10 ${
            isDarkMode ? "bg-green-500" : "bg-green-400"
          }`} style={{ transform: `translateY(${scrollY * 0.2}px)` }} />
        </div>

        {/* Floating Particles */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className={`absolute w-2 h-2 rounded-full opacity-20 animate-pulse ${
                isDarkMode ? "bg-blue-400" : "bg-blue-500"
              }`}
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 4}s`,
              }}
            />
          ))}
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8 relative z-10">
          {/* Header */}
          <div className="mb-12">
            {/* Title Section */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center p-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full mb-6">
                <ShoppingBagIcon className="w-8 h-8 text-white" />
              </div>
              
              <h1
                className={`text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r ${
                  isDarkMode
                    ? "from-white via-blue-200 to-purple-200 bg-clip-text text-transparent"
                    : "from-gray-900 via-blue-600 to-purple-600 bg-clip-text text-transparent"
                } animate-gradient`}
              >
                {t("title")}
              </h1>
              
              <p className={`text-xl max-w-2xl mx-auto ${
                isDarkMode ? "text-gray-300" : "text-gray-600"
              }`}>
                Discover amazing local businesses and connect with your community
              </p>
            </div>

            {/* Create Shop Button */}
            <div className="flex justify-center mb-8">
              <CreateShopButton />
            </div>

            {/* Search and Filter */}
            <div className="backdrop-blur-lg bg-white/10 dark:bg-gray-800/10 rounded-3xl p-6 border border-white/20 dark:border-gray-700/20">
              <SearchAndFilter
                onSearch={handleSearch}
                onCategoryFilter={handleCategoryFilter}
                selectedCategory={selectedCategory}
                isDarkMode={isDarkMode}
              />
            </div>
          </div>

          {/* Shops Grid */}
          {isLoading && shops.length === 0 ? (
            <div className={`grid ${getGridCols()} gap-8`}>
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-fadeInUp"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <LoadingShopCard isDarkMode={isDarkMode} />
                </div>
              ))}
            </div>
          ) : shops.length === 0 ? (
            <div className="text-center py-20">
              <div className="relative inline-block mb-8">
                <div
                  className={`text-8xl mb-4 animate-bounce ${
                    isDarkMode ? "text-gray-600" : "text-gray-400"
                  }`}
                >
                  🏪
                </div>
                <div className="absolute -inset-4 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full blur opacity-20 animate-pulse" />
              </div>
              
              <h3
                className={`text-3xl font-bold mb-4 bg-gradient-to-r ${
                  isDarkMode 
                    ? "from-white to-gray-300 bg-clip-text text-transparent" 
                    : "from-gray-900 to-gray-600 bg-clip-text text-transparent"
                }`}
              >
                {t("noShopsFound")}
              </h3>
              <p
                className={`text-lg max-w-md mx-auto ${
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
              <div className={`grid ${getGridCols()} gap-8`}>
                {shops.map((shop, index) => (
                  <div
                    key={shop.id}
                    className="animate-fadeInUp"
                    style={{ animationDelay: `${(index % 20) * 0.05}s` }}
                  >
                    <ShopCard shop={shop} isDarkMode={isDarkMode} />
                  </div>
                ))}
              </div>

              {/* Load More Trigger */}
              <div ref={loadMoreRef} className="mt-12">
                {isLoadingMore && (
                  <div className={`grid ${getGridCols()} gap-8`}>
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`loading-${index}`}
                        className="animate-fadeInUp"
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        <LoadingShopCard isDarkMode={isDarkMode} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* End Message */}
              {!hasMore && shops.length > 0 && (
                <div className="text-center py-12">
                  <div className={`inline-flex items-center gap-2 px-6 py-3 rounded-full ${
                    isDarkMode 
                      ? "bg-gray-800/50 border border-gray-700/50 text-gray-300" 
                      : "bg-white/50 border border-gray-200/50 text-gray-600"
                  } backdrop-blur-lg`}>
                    <SparklesIcon className="w-5 h-5" />
                    <span className="font-medium">{t("allShopsLoaded")}</span>
                    <SparklesIcon className="w-5 h-5" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes gradient {
          0%, 100% {
            background-size: 200% 200%;
            background-position: left center;
          }
          50% {
            background-size: 200% 200%;
            background-position: right center;
          }
        }
        
        .animate-fadeInUp {
          animation: fadeInUp 0.6s ease-out forwards;
          opacity: 0;
        }
        
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}