import React, { useState, useEffect, useCallback } from "react";
import {
  getFirestore,
  collection,
  query,
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

// Hook for Firebase collection listener
const useMarketBanners = () => {
  const [banners, setBanners] = useState<MarketBannerItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  const BATCH_SIZE = 20;

  // Fetch banners from Firebase
  const fetchBanners = useCallback(
    async (isInitial = false) => {
      try {
        setIsLoading(true);
        setError(null);

        const firestore = getFirestore();
        const bannersRef = collection(firestore, "market_banners");

        let q = query(bannersRef, orderBy("createdAt"), limit(BATCH_SIZE));

        // For pagination, start after last document
        if (!isInitial && lastDoc) {
          q = query(
            bannersRef,
            orderBy("createdAt"),
            startAfter(lastDoc),
            limit(BATCH_SIZE)
          );
        }

        const snapshot = await getDocs(q);

        // Process the documents exactly like Flutter version
        const processedBanners: MarketBannerItem[] = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            console.log(
              "Processing banner - URL:",
              data.imageUrl,
              "linkType:",
              data.linkType,
              "linkId:",
              data.linkId
            );

            return {
              id: doc.id,
              url: data.imageUrl || "",
              linkType: data.linkType,
              linkId: data.linkId,
            };
          })
          .filter((banner) => banner.url); // Filter out empty URLs

        if (isInitial) {
          setBanners(processedBanners);
        } else {
          setBanners((prev) => [...prev, ...processedBanners]);
        }

        // Update pagination state
        const hasMoreData = snapshot.docs.length === BATCH_SIZE;
        setHasMore(hasMoreData);

        if (snapshot.docs.length > 0) {
          setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        }

        console.log(
          "Updated banners count:",
          isInitial
            ? processedBanners.length
            : banners.length + processedBanners.length
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load banners");
        console.error("Error fetching banners:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [lastDoc, banners.length]
  );

  // Load more banners
  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchBanners(false);
    }
  }, [fetchBanners, isLoading, hasMore]);

  // Refresh - reset everything and fetch from beginning
  const refresh = useCallback(async () => {
    setBanners([]);
    setLastDoc(null);
    setHasMore(true);
    setError(null);
    await fetchBanners(true);
  }, []);

  useEffect(() => {
    fetchBanners(true);
  }, []);

  return { banners, isLoading, error, hasMore, loadMore, refresh };
};

// Main Market Banner component
export default function MarketBannerGrid() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const { banners, isLoading, error, hasMore, loadMore } = useMarketBanners();

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

  // Handle banner tap - using Next.js router for SPA navigation
  const handleBannerTap = useCallback((item: MarketBannerItem) => {
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
            window.location.href = `/shop_detail/${item.linkId}`;
            break;
          case "product":
            console.log("Navigating to product:", item.linkId);
            window.location.href = `/product_detail/${item.linkId}`;
            break;
          case "shop_product":
            console.log("Navigating to shop_product:", item.linkId);
            window.location.href = `/product_detail/${item.linkId}`;
            break;
          default:
            console.log("Unknown link type:", item.linkType);
            window.location.href = `/product_detail/${item.linkId}`;
        }
      } catch (e) {
        console.error("Navigation error:", e);
        console.error(`Navigation error: ${e}`);
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

  const handleImageLoadStart = useCallback((imageId: string) => {
    setLoadingImages((prev) => new Set(prev).add(imageId));
  }, []);

  // Error state
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
        {/* Initial loading state */}
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
                      <img
                        src={banner.url}
                        alt={`Banner ${banner.id}`}
                        className="w-full h-40 object-cover"
                        onLoad={() => handleImageLoad(banner.id)}
                        onError={() => handleImageError(banner.id)}
                        onLoadStart={() => handleImageLoadStart(banner.id)}
                        loading="lazy"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Load more indicator */}
            {hasMore && (
              <div className="flex justify-center mt-0 lg:mt-6 py-6 lg:py-0">
                <button
                  onClick={loadMore}
                  disabled={isLoading}
                  className={`px-6 py-2 mx-4 lg:mx-0 rounded-lg transition-colors ${
                    isDarkMode
                      ? "bg-blue-600 hover:bg-blue-700 text-white"
                      : "bg-blue-500 hover:bg-blue-600 text-white"
                  } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {isLoading ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Loading...</span>
                    </div>
                  ) : (
                    "Load More"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
