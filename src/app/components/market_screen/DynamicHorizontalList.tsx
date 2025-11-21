"use client";

import React, { useState, useEffect, useRef } from "react";
import { ProductCard } from "../ProductCard";
import { ChevronRight, ChevronLeft } from "lucide-react";

import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  getDocs,
  limit as firestoreLimit,
} from "firebase/firestore";

import { db } from "@/lib/firebase"; // Adjust import path as needed

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

// Shimmer loading component
const ShimmerCard: React.FC<{ width?: number; isMobile?: boolean }> = ({ width, isMobile }) => {
  // Match the actual product card width - wider on mobile for better visibility
  const cardWidth = width || (isMobile ? 180 : 205);

  return (
    <div
      className="animate-pulse bg-gray-300 dark:bg-gray-600 rounded-lg"
      style={{ width: `${cardWidth}px` }}
    />
  );
};

const ShimmerList: React.FC<{ height: number; count?: number }> = ({
  height,
  count = 5,
}) => {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div
      className="flex gap-6 px-2 justify-center"
      style={{ height: `${height}px` }}
    >
      {Array.from({ length: count }, (_, index) => (
        <ShimmerCard key={index} isMobile={isMobile} />
      ))}
    </div>
  );
};

// Single Dynamic List Component
const DynamicList: React.FC<{
  listData: DynamicListData;
  portraitImageHeight: number;
  rowHeight: number;
  keyPrefix?: string;
}> = ({ listData, portraitImageHeight, rowHeight, keyPrefix = '' }) => {
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
    console.log(`Fetching products for list: ${listData.title}`);
    console.log("Full list data:", JSON.stringify(listData, null, 2));

    try {
      let fetchedProducts: Product[] = [];

      // Check for individual product IDs (exactly like Flutter)
      if (
        listData.selectedProductIds != null &&
        Array.isArray(listData.selectedProductIds) &&
        listData.selectedProductIds.length > 0
      ) {
        console.log(
          `Fetching ${listData.selectedProductIds.length} individual products for list ${listData.id}`
        );
        console.log("Product IDs:", listData.selectedProductIds);

        for (const productId of listData.selectedProductIds) {
          try {
            console.log(`Fetching product: ${productId}`);
            const productDoc = await getDoc(
              doc(db, "shop_products", productId)
            );
            if (productDoc.exists()) {
              const productData = {
                id: productDoc.id,
                ...productDoc.data(),
              } as Product;
              fetchedProducts.push(productData);
              console.log(
                `Added individual product: ${productData.productName}`
              );
            } else {
              console.log(`Product not found: ${productId}`);
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

        console.log(
          `Fetching products from shop ${shopId} with limit ${limitCount}`
        );

        const q = query(
          collection(db, "shop_products"),
          where("shopId", "==", shopId),
          firestoreLimit(limitCount)
        );

        const snapshot = await getDocs(q);
        fetchedProducts = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            } as Product)
        );

        console.log(
          `Found ${fetchedProducts.length} products from shop ${shopId}`
        );
      } else {
        console.log(
          "No selectedProductIds or selectedShopId found in list data"
        );
        console.log("selectedProductIds:", listData.selectedProductIds);
        console.log("selectedShopId:", listData.selectedShopId);
      }

      setProducts(fetchedProducts);
      console.log(
        `Total products fetched for list ${listData.id}: ${fetchedProducts.length}`
      );

      // Check scroll after products load
      setTimeout(checkScrollPosition, 100);
    } catch (error) {
      console.error(`Error fetching products for list ${listData.id}:`, error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [listData.id, listData.selectedProductIds, listData.selectedShopId, listData.limit]);

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
        {/* Background gradient - horizontal with vertical fade mask */}
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
            <ShimmerList height={rowHeight - 60} count={5} />
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
                <div className="flex gap-0 px-0 lg:px-2 h-full pr-0 lg:pr-2 -ml-2 lg:ml-0">
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

  // Fixed dimensions
  const portraitImageHeight = 380;
  const infoAreaHeight = 80;
  const rowHeight = portraitImageHeight + infoAreaHeight + 40;

  // Set client flag after component mounts
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch dynamic lists from Firestore
  useEffect(() => {
    if (!isClient) return;

    console.log("Setting up dynamic lists stream");

    // Try without orderBy first to see if that's causing issues
    const q = query(
      collection(db, "dynamic_product_lists"),
      where("isActive", "==", true)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log("Firestore snapshot received");
        console.log("Snapshot size:", snapshot.size);
        console.log("Snapshot empty:", snapshot.empty);
        console.log("Snapshot docs length:", snapshot.docs.length);

        if (snapshot.empty) {
          console.log("No dynamic product lists found or no data available");
          setDynamicLists([]);
        } else {
          const lists = snapshot.docs.map((doc) => {
            const data = doc.data();
            console.log(`Processing list: ${doc.id} - ${data.title}`);
            console.log("List active:", data.isActive);
            console.log("List order:", data.order);
            console.log("Full doc data:", JSON.stringify(data, null, 2));

            return {
              id: doc.id,
              ...data,
            } as DynamicListData;
          });

          // Sort manually by order if needed
          lists.sort((a, b) => (a.order || 0) - (b.order || 0));

          console.log(`Found ${lists.length} dynamic product lists`);
          console.log(
            "All lists:",
            lists.map((l) => ({ id: l.id, title: l.title, active: l.isActive }))
          );
          setDynamicLists(lists);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error in DynamicHorizontalList:", error);
        console.error("Error details:", error.message);
        console.error("Error code:", error.code);
        setDynamicLists([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isClient]);

  // Don't render until client-side hydration is complete
  if (!isClient) {
    return (
      <div className="w-full">
        <div className="max-w-6xl mx-auto">
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
                      <div className="h-5 bg-white bg-opacity-30 rounded animate-pulse w-48" />
                      <div className="h-4 bg-white bg-opacity-30 rounded animate-pulse w-16" />
                    </div>
                  </div>
                  <ShimmerList height={rowHeight - 60} count={5} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Render loading state
  if (loading) {
    return (
      <div className="w-full">
        <div className="max-w-6xl mx-auto">
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
                      <div className="h-5 bg-white bg-opacity-30 rounded animate-pulse w-48" />
                      <div className="h-4 bg-white bg-opacity-30 rounded animate-pulse w-16" />
                    </div>
                  </div>
                  <ShimmerList height={rowHeight - 60} count={5} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
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
    <div className="w-full">
      <div className="max-w-6xl mx-auto">
        {dynamicLists.map((listData, index) => (
          <div key={`${keyPrefix}${listData.id}`}>
            <DynamicList
              listData={listData}
              portraitImageHeight={portraitImageHeight}
              rowHeight={rowHeight}
              keyPrefix={keyPrefix}
            />
            {/* Add spacing between lists except after the last one */}
            {index < dynamicLists.length - 1 && <div className="h-3" />}
          </div>
        ))}
      </div>
    </div>
  );
};
