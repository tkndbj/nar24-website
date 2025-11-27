import React, { useState, useEffect, useCallback, useRef } from "react";
import NextImage from "next/image";
import {
  getFirestore,
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

// Market Banner Item interface
interface MarketBannerItem {
  url: string;
  linkType?: string;
  linkId?: string;
  id: string;
}

// Shimmer loading component
const ShimmerCard = ({ isDarkMode }: { isDarkMode: boolean }) => {
  return (
    <div
      className={`animate-pulse rounded-none lg:rounded-lg overflow-hidden ${
        isDarkMode ? "bg-gray-800" : "bg-gray-300"
      }`}
    >
      <div
        className={`h-40 w-full ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`}
      ></div>
    </div>
  );
};

// Error placeholder component
const ErrorCard = ({ isDarkMode }: { isDarkMode: boolean }) => {
  return (
    <div
      className={`h-40 w-full rounded-none lg:rounded-lg flex items-center justify-center ${
        isDarkMode ? "bg-gray-800" : "bg-gray-200"
      }`}
    >
      <svg
        className={`w-8 h-8 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
};

// Hook for Firebase collection listener - matches Flutter provider exactly
const useMarketBanners = () => {
  const [banners, setBanners] = useState<MarketBannerItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [, setPrefetchedUrls] = useState<Set<string>>(new Set());

  const BATCH_SIZE = 20;
  const PREFETCH_COUNT = 3;

  // Prefetch images to smooth scrolling (matches Flutter's approach)
  const prefetchImage = useCallback((url: string) => {
    setPrefetchedUrls((prev) => {
      if (prev.has(url)) return prev;
      const img = new Image();
      img.src = url;
      return new Set(prev).add(url);
    });
  }, []);

  // Fetch banners from Firebase - matches Flutter fetchNextPage exactly
  const fetchNextPage = useCallback(async () => {
    if (!hasMore || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const firestore = getFirestore();
      const bannersRef = collection(firestore, "market_banners");

      // ✅ FIXED: Only fetch active ads, descending order (newest first)
      let q = query(
        bannersRef,
        where("isActive", "==", true),
        orderBy("createdAt", "desc"),
        limit(BATCH_SIZE)
      );

      // Pagination: start after last document
      if (lastDoc) {
        q = query(
          bannersRef,
          where("isActive", "==", true),
          orderBy("createdAt", "desc"),
          startAfter(lastDoc),
          limit(BATCH_SIZE)
        );
      }

      const snapshot = await getDocs(q);

      // Process documents exactly like Flutter
      const processedBanners: MarketBannerItem[] = snapshot.docs
        .map((doc): MarketBannerItem | null => {
          const data = doc.data();
          const url = data.imageUrl || "";

          if (!url) return null;

          return {
            id: doc.id,
            url: url,
            linkType: data.linkType as string | undefined,
            linkId: (data.linkedShopId || data.linkedProductId) as
              | string
              | undefined,
          };
        })
        .filter((banner): banner is MarketBannerItem => banner !== null);

      // Update banners list - filter out duplicates to prevent key errors
      setBanners((prev) => {
        const existingIds = new Set(prev.map((b) => b.id));
        const newBanners = processedBanners.filter(
          (b) => !existingIds.has(b.id)
        );
        return [...prev, ...newBanners];
      });

      // Update pagination state
      const hasMoreData = snapshot.docs.length === BATCH_SIZE;
      setHasMore(hasMoreData);

      if (snapshot.docs.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }

      // Prefetch first few images for smooth scrolling (matches Flutter)
      const toPrefetch = processedBanners.slice(0, PREFETCH_COUNT);
      toPrefetch.forEach((banner) => prefetchImage(banner.url));

      console.log("Fetched banners:", processedBanners.length);
    } catch (err) {
      let errorMessage =
        err instanceof Error ? err.message : "Failed to load banners";

      // Provide helpful index error message (matches Flutter)
      if (errorMessage.includes("index")) {
        errorMessage =
          "Database index required. Check console for index creation link.";
        console.error("🔥 FIRESTORE INDEX REQUIRED 🔥");
        console.error("Create this index in Firebase Console:");
        console.error("Collection: market_banners");
        console.error("Fields: isActive (Ascending) + createdAt (Descending)");
      }

      setError(errorMessage);
      console.error("Error fetching banners:", err);
    } finally {
      setIsLoading(false);
    }
  }, [hasMore, isLoading, lastDoc, prefetchImage]);

  // Refresh - reset everything and fetch from beginning
  const refresh = useCallback(async () => {
    setBanners([]);
    setLastDoc(null);
    setHasMore(true);
    setError(null);
    setPrefetchedUrls(new Set());
    await fetchNextPage();
  }, [fetchNextPage]);

  // Initial load - matches Flutter's behavior
  useEffect(() => {
    // Only fetch if we haven't loaded anything yet
    if (!isLoading && banners.length === 0 && hasMore) {
      fetchNextPage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency to run once on mount

  return { banners, isLoading, error, hasMore, fetchNextPage, refresh };
};

// Main Market Banner component
export default function MarketBannerGrid() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const { banners, isLoading, error, hasMore, fetchNextPage } =
    useMarketBanners();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

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

  // Infinite scroll - automatically load more when reaching bottom
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [hasMore, isLoading, fetchNextPage]);

  // Handle banner tap - matches Flutter exactly
  const handleBannerTap = useCallback((item: MarketBannerItem) => {
    // Note: Add AdAnalyticsService.trackAdClick here when available
    console.log(
      "Banner tapped - linkType:",
      item.linkType,
      "linkId:",
      item.linkId
    );

    if (item.linkType && item.linkId) {
      try {
        switch (item.linkType) {
          case "shop":
            console.log("Navigating to shop:", item.linkId);
            window.location.href = `/shopdetail/${item.linkId}`;
            break;
          case "product":
            console.log("Navigating to product:", item.linkId);
            window.location.href = `/productdetail/${item.linkId}`;
            break;
          case "shop_product":
            console.log("Navigating to shop_product:", item.linkId);
            window.location.href = `/productdetail/${item.linkId}`;
            break;
          default:
            console.log("Unknown link type:", item.linkType);
            window.location.href = `/productdetail/${item.linkId}`;
        }
      } catch (e) {
        console.error("Navigation error:", e);
      }
    } else {
      console.log(
        "Banner has no link - linkType:",
        item.linkType,
        "linkId:",
        item.linkId
      );
    }
  }, []);

  const handleImageLoad = useCallback((imageId: string) => {
    setLoadingImages((prev) => {
      const newSet = new Set(prev);
      newSet.delete(imageId);
      return newSet;
    });
  }, []);

  const handleImageError = useCallback((imageId: string) => {
    setImageErrors((prev) => new Set(prev).add(imageId));
    setLoadingImages((prev) => {
      const newSet = new Set(prev);
      newSet.delete(imageId);
      return newSet;
    });
  }, []);

  // Error state (matches Flutter: empty + error)
  if (error && banners.length === 0) {
    return (
      <div className={`w-full ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        <div className="max-w-4xl mx-auto px-0 lg:px-4 py-8">
          <div
            className={`text-center px-4 ${
              isDarkMode ? "text-red-400" : "text-red-600"
            }`}
          >
            Error: {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      <div className="max-w-4xl mx-auto px-0 lg:px-4 py-0 lg:py-6">
        {/* Initial loading state with shimmer (matches Flutter) */}
        {isLoading && banners.length === 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-4">
            {Array.from({ length: 6 }, (_, index) => (
              <ShimmerCard key={index} isDarkMode={isDarkMode} />
            ))}
          </div>
        ) : (
          <>
            {/* Banner grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-4">
              {banners.map((banner) => (
                <div
                  key={banner.id}
                  className="cursor-pointer transform transition-transform duration-200 hover:scale-105"
                  onClick={() => handleBannerTap(banner)}
                >
                  <div className="relative rounded-none lg:rounded-lg overflow-hidden shadow-none lg:shadow-md">
                    {/* Loading placeholder */}
                    {loadingImages.has(banner.id) && (
                      <div
                        className={`absolute inset-0 flex items-center justify-center ${
                          isDarkMode ? "bg-gray-800" : "bg-gray-200"
                        }`}
                      >
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      </div>
                    )}

                    {/* Error state */}
                    {imageErrors.has(banner.id) ? (
                      <ErrorCard isDarkMode={isDarkMode} />
                    ) : (
                      <div className="relative w-full h-40">
                        <NextImage
                          src={banner.url}
                          alt={`Banner ${banner.id}`}
                          fill
                          className="object-cover"
                          onLoad={() => handleImageLoad(banner.id)}
                          onError={() => handleImageError(banner.id)}
                          loading="lazy"
                          sizes="(max-width: 1024px) 100vw, 50vw"
                          quality={85}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Infinite scroll trigger + loading indicator (matches Flutter) */}
            {hasMore && (
              <div
                ref={loadMoreRef}
                className="flex justify-center mt-0 lg:mt-6 py-6 lg:py-4"
              >
                {isLoading && (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                    <span
                      className={isDarkMode ? "text-gray-300" : "text-gray-600"}
                    >
                      Loading...
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
