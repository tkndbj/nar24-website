"use client";

import React, { useState, useEffect, useRef } from "react";
import { ProductCard } from "../ProductCard";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase-lazy";
import { useTheme } from "@/hooks/useTheme";
import { Product } from "@/app/models/Product";


interface DynamicListData {
  id: string;
  title: string;
  isActive: boolean;
  order: number;
  gradientStart?: string;
  gradientEnd?: string;
  selectedProductIds?: string[];
  selectedShopId?: string;
  limit?: number;  
}

// Shimmer loading component - matches ProductCard structure with GPU-accelerated shimmer
const ShimmerCard: React.FC<{
  portraitImageHeight: number;
  infoAreaHeight: number;
  scaleFactor: number;
  isDarkMode: boolean;
}> = ({ portraitImageHeight, infoAreaHeight, scaleFactor, isDarkMode }) => {
  const cardHeight = (portraitImageHeight + infoAreaHeight) * scaleFactor;
  const imageHeight = portraitImageHeight * scaleFactor;
  const infoHeight = infoAreaHeight * scaleFactor;
  const shimmerClass = `shimmer-effect ${isDarkMode ? 'shimmer-effect-dark' : 'shimmer-effect-light'}`;

  return (
    <div
      className="rounded-xl overflow-hidden shadow-sm"
      style={{
        height: `${cardHeight}px`,
        backgroundColor: isDarkMode ? '#1f2937' : '#ffffff'
      }}
    >
      {/* Image area with shimmer */}
      <div
        className="w-full relative overflow-hidden"
        style={{
          height: `${imageHeight}px`,
          backgroundColor: isDarkMode ? '#374151' : '#f3f4f6'
        }}
      >
        <div className={shimmerClass} />
      </div>

      {/* Info area */}
      <div className="p-2 space-y-2" style={{ height: `${infoHeight}px` }}>
        {/* Title skeleton */}
        <div
          className="h-3 rounded w-3/4 relative overflow-hidden"
          style={{ backgroundColor: isDarkMode ? '#374151' : '#e5e7eb' }}
        >
          <div className={shimmerClass} />
        </div>
        <div
          className="h-3 rounded w-1/2 relative overflow-hidden"
          style={{ backgroundColor: isDarkMode ? '#374151' : '#e5e7eb' }}
        >
          <div className={shimmerClass} />
        </div>

        {/* Price skeleton */}
        <div
          className="h-4 rounded w-2/5 mt-auto relative overflow-hidden"
          style={{ backgroundColor: isDarkMode ? '#374151' : '#e5e7eb' }}
        >
          <div className={shimmerClass} />
        </div>
      </div>
    </div>
  );
};

const ShimmerList: React.FC<{
  height: number;
  count?: number;
  portraitImageHeight: number;
  infoAreaHeight: number;
  scaleFactor: number;
  isDarkMode: boolean;
}> = ({
  height,
  count = 5,
  portraitImageHeight,
  infoAreaHeight,
  scaleFactor,
  isDarkMode,
}) => {
  return (
    <div
      className="flex gap-2 px-0 lg:px-2 overflow-hidden"
      style={{ height: `${height}px` }}
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex-shrink-0" style={{ width: "190px" }}>
          <ShimmerCard
            portraitImageHeight={portraitImageHeight}
            infoAreaHeight={infoAreaHeight}
            scaleFactor={scaleFactor}
            isDarkMode={isDarkMode}
          />
        </div>
      ))}
    </div>
  );
};

// Single Dynamic List Component
const DynamicList: React.FC<{
  listData: DynamicListData;
  portraitImageHeight: number;
  infoAreaHeight: number;
  rowHeight: number;
  keyPrefix?: string;
  isDarkMode: boolean;
}> = ({ listData, portraitImageHeight, infoAreaHeight, rowHeight, keyPrefix = '', isDarkMode }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Parse colors with fallback
  const parseColor = (colorString?: string): string => {
    if (!colorString) return "#FF6B35";
    try {
      const cleanColor = colorString.replace("#", "");
      if (cleanColor.length === 6) {
        return `#${cleanColor}`;
      } else if (cleanColor.length === 8) {
        return `#${cleanColor}`;
      }
    } catch (e) {
      console.error(`Error parsing color ${colorString}:`, e);
    }
    return "#FF6B35";
  };

  const startColor = parseColor(listData.gradientStart);
  const endColor = parseColor(listData.gradientEnd);

  // Check scroll position
  const checkScrollPosition = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  // Scroll functions
  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -200,
        behavior: "smooth",
      });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 200,
        behavior: "smooth",
      });
    }
  };

  // Fetch products based on list configuration
  const fetchProducts = React.useCallback(async () => {
    setLoading(true);

    try {
      const [db, { collection, query, where, doc, getDoc, getDocs, limit: firestoreLimit }] =
        await Promise.all([
          getFirebaseDb(),
          import("firebase/firestore"),
        ]);

      let fetchedProducts: Product[] = [];

      // Check for individual product IDs (exactly like Flutter)
      if (
        listData.selectedProductIds != null &&
        Array.isArray(listData.selectedProductIds) &&
        listData.selectedProductIds.length > 0
      ) {
        for (const productId of listData.selectedProductIds) {
          try {
            const productDoc = await getDoc(
              doc(db, "shop_products", productId)
            );
            if (productDoc.exists()) {
              fetchedProducts.push({
                id: productDoc.id,
                ...productDoc.data(),
              } as Product);
            }
          } catch (e) {
            console.error(`Error fetching individual product ${productId}:`, e);
          }
        }
      }
      // Check for shop-based products (exactly like Flutter)
      else if (
        listData.selectedShopId != null &&
        listData.selectedShopId.toString().trim() !== ""
      ) {
        const shopId = listData.selectedShopId.toString();
        const limitCount = listData.limit || 10;

        const q = query(
          collection(db, "shop_products"),
          where("shopId", "==", shopId),
          firestoreLimit(limitCount)
        );

        const snapshot = await getDocs(q);
        fetchedProducts = snapshot.docs.map(
          (d) =>
            ({
              id: d.id,
              ...d.data(),
            } as Product)
        );
      }

      setProducts(fetchedProducts);

      // Check scroll after products load
      setTimeout(checkScrollPosition, 100);
    } catch (error) {
      console.error(`Error fetching products for list ${listData.id}:`, error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [listData]);

  // Load products when component mounts
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);


  // Scale factors
  const scaleFactor = 0.88;
  const overrideInnerScale = 1.2;

  return (
    <div className="w-full my-2 lg:mx-0 lg:px-6">
      <div className="relative w-full rounded-none lg:rounded-t-3xl overflow-visible">
        {/* Background gradient with vertical fade mask */}
        <div
          className="absolute inset-0 rounded-none lg:rounded-t-3xl"
          style={{
            height: `${rowHeight * 0.6}px`,
            background: `linear-gradient(to right, ${startColor}, ${endColor})`,
            maskImage: `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
            WebkitMaskImage: `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
          }}
        />

        <div className="relative py-3">
          {/* Title row */}
          <div className="px-0 lg:px-2 mb-2">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white max-w-[70%] truncate">
                {listData.title || "Product List"}
              </h2>
              
            </div>
          </div>

          {/* Product list */}
          {loading ? (
            <ShimmerList
              height={rowHeight - 60}
              count={5}
              portraitImageHeight={portraitImageHeight}
              infoAreaHeight={infoAreaHeight}
              scaleFactor={scaleFactor}
              isDarkMode={isDarkMode}
            />
          ) : products.length === 0 ? (
            <div
              className="flex items-center justify-center text-white px-0 lg:px-0"
              style={{ height: `${rowHeight - 60}px` }}
            >
              <div className="text-center">
                <p className="text-white opacity-70 mb-1">No products found</p>
                {listData.selectedProductIds && (
                  <p className="text-white opacity-50 text-xs">
                    Product IDs: {listData.selectedProductIds.length}
                  </p>
                )}
                {listData.selectedShopId && (
                  <p className="text-white opacity-50 text-xs">
                    Shop ID: {listData.selectedShopId}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="relative">
              {/* Left scroll arrow - hidden on mobile, positioned outside component on desktop */}
              {canScrollLeft && (
                <button
                  onClick={scrollLeft}
                  className="hidden lg:flex absolute top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white rounded-full items-center justify-center transition-all duration-200 hover:scale-105"
                  style={{
                    left: "-30px",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
                  }}
                  aria-label="Scroll left"
                >
                  <ChevronLeft size={28} className="text-gray-700" />
                </button>
              )}

              {/* Right scroll arrow - hidden on mobile, positioned outside component on desktop */}
              {canScrollRight && (
                <button
                  onClick={scrollRight}
                  className="hidden lg:flex absolute top-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-white rounded-full items-center justify-center transition-all duration-200 hover:scale-105"
                  style={{
                    right: "-30px",
                    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
                  }}
                  aria-label="Scroll right"
                >
                  <ChevronRight size={28} className="text-gray-700" />
                </button>
              )}

              {/* Scrollable container - no scrollbars */}
              <div
                ref={scrollContainerRef}
                className="overflow-x-auto overflow-y-hidden"
                style={{
                  height: `${rowHeight - 60}px`,
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                }}
                onScroll={checkScrollPosition}
              >
                <style jsx>{`
                  div::-webkit-scrollbar {
                    display: none;
                  }
                `}</style>
                <div className="flex gap-0 px-0 lg:px-2 h-full pr-0 lg:pr-2 -ml-2 lg:ml-0 -space-x-2">
                  {products.map((product) => (
                    <div
                      key={`${keyPrefix}${product.id}`}
                      className="flex-shrink-0"
                      style={{ width: "205px" }}
                    >
                      <ProductCard
                        product={product}
                        scaleFactor={scaleFactor}
                        internalScaleFactor={1.0}
                        portraitImageHeight={portraitImageHeight}
                        overrideInternalScaleFactor={overrideInnerScale}
                        showCartIcon={false}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Main component
interface DynamicHorizontalListProps {
  keyPrefix?: string;
}

export default function DynamicHorizontalList({ keyPrefix = '' }: DynamicHorizontalListProps) {
  const [dynamicLists, setDynamicLists] = useState<DynamicListData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const isDarkMode = useTheme();

  // Fixed dimensions
  const portraitImageHeight = 380;
  const infoAreaHeight = 80;
  const rowHeight = portraitImageHeight + infoAreaHeight + 40;

  // Set client flag after component mounts
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch dynamic lists from Firestore (one-time fetch, fresh on every page visit)
  useEffect(() => {
    if (!isClient) return;

    const fetchDynamicLists = async () => {
      try {
        const [db, { collection, query, where, getDocs }] = await Promise.all([
          getFirebaseDb(),
          import("firebase/firestore"),
        ]);

        const q = query(
          collection(db, "dynamic_product_lists"),
          where("isActive", "==", true)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          setDynamicLists([]);
        } else {
          const lists = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          } as DynamicListData));

          lists.sort((a, b) => (a.order || 0) - (b.order || 0));
          setDynamicLists(lists);
        }
      } catch (error) {
        console.error("Error fetching dynamic lists:", error);
        setDynamicLists([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDynamicLists();
  }, [isClient]);

  // Don't render until client-side hydration is complete
  if (!isClient) {
    return (
      <>
        {Array.from({ length: 2 }, (_, index) => (
          <div
            key={index}
            className="w-full my-2 lg:mx-0 lg:px-6"
            style={{ height: `${rowHeight}px` }}
          >
            <div className="relative w-full rounded-none lg:rounded-t-3xl overflow-visible">
              <div
                className="absolute inset-0 rounded-none lg:rounded-t-3xl"
                style={{
                  height: `${rowHeight * 0.6}px`,
                  background: `linear-gradient(to right, #f97316, #ec4899)`,
                  maskImage: `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
                  WebkitMaskImage: `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
                }}
              />
              <div className="relative py-3">
                <div className="px-0 lg:px-2 mb-2">
                  <div className="flex justify-between items-center">
                    <div className="h-5 bg-white bg-opacity-30 rounded w-48 relative overflow-hidden">
                      <div className="shimmer-effect shimmer-effect-light" />
                    </div>
                    <div className="h-4 bg-white bg-opacity-30 rounded w-16 relative overflow-hidden">
                      <div className="shimmer-effect shimmer-effect-light" />
                    </div>
                  </div>
                </div>
                <ShimmerList
                  height={rowHeight - 60}
                  count={5}
                  portraitImageHeight={portraitImageHeight}
                  infoAreaHeight={infoAreaHeight}
                  scaleFactor={0.88}
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  // Render loading state
  if (loading) {
    return (
      <>
        {Array.from({ length: 2 }, (_, index) => (
          <div
            key={index}
            className="w-full my-2 lg:mx-0 lg:px-6"
            style={{ height: `${rowHeight}px` }}
          >
            <div className="relative w-full rounded-none lg:rounded-t-3xl overflow-visible">
              <div
                className="absolute inset-0 rounded-none lg:rounded-t-3xl"
                style={{
                  height: `${rowHeight * 0.6}px`,
                  background: `linear-gradient(to right, #f97316, #ec4899)`,
                  maskImage: `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
                  WebkitMaskImage: `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)`,
                }}
              />
              <div className="relative py-3">
                <div className="px-0 lg:px-2 mb-2">
                  <div className="flex justify-between items-center">
                    <div className="h-5 bg-white bg-opacity-30 rounded w-48 relative overflow-hidden">
                      <div className="shimmer-effect shimmer-effect-light" />
                    </div>
                    <div className="h-4 bg-white bg-opacity-30 rounded w-16 relative overflow-hidden">
                      <div className="shimmer-effect shimmer-effect-light" />
                    </div>
                  </div>
                </div>
                <ShimmerList
                  height={rowHeight - 60}
                  count={5}
                  portraitImageHeight={portraitImageHeight}
                  infoAreaHeight={infoAreaHeight}
                  scaleFactor={0.88}
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>
          </div>
        ))}
      </>
    );
  }

  // Render empty state
  if (dynamicLists.length === 0) {
    console.log("Rendering empty state - no dynamic lists");
    return (
      <div className="w-full p-4 text-center">
        <p className="text-gray-500">No dynamic lists found</p>
        <p className="text-sm text-gray-400">
          Check console for debugging info
        </p>
      </div>
    );
  }

  // Render dynamic lists
  return (
    <>
      {dynamicLists.map((listData, index) => (
        <div key={`${keyPrefix}${listData.id}`}>
          <DynamicList
            listData={listData}
            portraitImageHeight={portraitImageHeight}
            infoAreaHeight={infoAreaHeight}
            rowHeight={rowHeight}
            keyPrefix={keyPrefix}
            isDarkMode={isDarkMode}
          />
          {/* Add spacing between lists except after the last one */}
          {index < dynamicLists.length - 1 && <div className="h-3" />}
        </div>
      ))}
    </>
  );
};
