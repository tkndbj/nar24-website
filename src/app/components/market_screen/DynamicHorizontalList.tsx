"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ProductCard } from "../ProductCard";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase-lazy";
import { useTheme } from "@/hooks/useTheme";
import { ProductUtils } from "@/app/models/Product";
import type { Product } from "@/app/models/Product";
import type { PrefetchedDynamicListConfig, PrefetchedProduct } from "@/types/MarketLayout";

// ===============================================
// DynamicHorizontalList
// Visually identical to PreferenceProduct
// Progressive loading via IntersectionObserver
// Lazy Firebase for performance
// ===============================================

// ============================================================================
// TYPES
// ============================================================================

interface DynamicListData {
  id: string;
  title: string;
  isActive: boolean;
  order: number;
  gradientStart?: string;
  gradientEnd?: string;
  selectedShopId?: string;
  showViewAllButton?: boolean;
  // Inlined by the `home-list-manifest` Cloud Functions. Same shape the
  // SSR path puts into `prefetchedProducts`; consumed by
  // `hydrateProductsFromManifest`.
  products?: Record<string, unknown>[];
  // Server-prefetched (already-decoded) products — set on the SSR path.
  prefetchedProducts?: PrefetchedProduct[];
}

// ============================================================================
// CONSTANTS — matching PreferenceProduct exactly
// ============================================================================

const MAX_CACHED_LISTS = 10;
const MAX_PRODUCTS_PER_LIST = 20;

const PORTRAIT_IMAGE_HEIGHT = 380;
const INFO_AREA_HEIGHT = 80;
const ROW_HEIGHT = PORTRAIT_IMAGE_HEIGHT + INFO_AREA_HEIGHT + 40; // 500
const SCALE_FACTOR = 0.88;
const OVERRIDE_INNER_SCALE = 1.2;
const CARD_WIDTH = 205;

// ============================================================================
// SHIMMER — uses global CSS classes from globals.css (shimmer-effect)
// ============================================================================

const ShimmerCard = React.memo(({ isDarkMode }: { isDarkMode: boolean }) => {
  const shimmer = `shimmer-effect ${isDarkMode ? "shimmer-effect-dark" : "shimmer-effect-light"}`;
  const imgBg = isDarkMode ? "bg-gray-700" : "bg-gray-100";
  const textBg = isDarkMode ? "bg-gray-700" : "bg-gray-200";

  return (
    <div className={`rounded-xl overflow-hidden shadow-sm ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
      style={{ height: `${(PORTRAIT_IMAGE_HEIGHT + INFO_AREA_HEIGHT) * SCALE_FACTOR}px` }}
    >
      <div className={`w-full relative overflow-hidden ${imgBg}`} style={{ height: `${PORTRAIT_IMAGE_HEIGHT * SCALE_FACTOR}px` }}>
        <div className={shimmer} />
      </div>
      <div className="p-2 space-y-2" style={{ height: `${INFO_AREA_HEIGHT * SCALE_FACTOR}px` }}>
        {[75, 50].map((w, i) => (
          <div key={i} className={`h-3 rounded relative overflow-hidden ${textBg}`} style={{ width: `${w}%` }}>
            <div className={shimmer} />
          </div>
        ))}
        <div className={`h-4 rounded relative overflow-hidden ${textBg}`} style={{ width: "40%" }}>
          <div className={shimmer} />
        </div>
      </div>
    </div>
  );
});
ShimmerCard.displayName = "DynamicShimmerCard";

const ShimmerList = React.memo(({ isDarkMode }: { isDarkMode: boolean }) => (
  <div className="flex gap-2 px-0 lg:px-2 overflow-hidden" style={{ height: `${ROW_HEIGHT - 60}px` }}>
    {[0, 1, 2, 3, 4].map((i) => (
      <div key={i} className="flex-shrink-0" style={{ width: `${CARD_WIDTH}px` }}>
        <ShimmerCard isDarkMode={isDarkMode} />
      </div>
    ))}
  </div>
));
ShimmerList.displayName = "DynamicShimmerList";

// ============================================================================
// LRU CACHE
// ============================================================================

class LRUProductCache {
  private cache = new Map<string, Product[]>();
  private accessTimes = new Map<string, number>();
  private maxSize: number;

  constructor(maxSize: number = MAX_CACHED_LISTS) {
    this.maxSize = maxSize;
  }

  get(listId: string): Product[] | undefined {
    const products = this.cache.get(listId);
    if (products) {
      this.accessTimes.set(listId, Date.now());
    }
    return products;
  }

  set(listId: string, products: Product[]): void {
    this.cache.set(listId, products.slice(0, MAX_PRODUCTS_PER_LIST));
    this.accessTimes.set(listId, Date.now());
    this.evictIfNeeded();
  }

  has(listId: string): boolean {
    return this.cache.has(listId);
  }

  clear(): void {
    this.cache.clear();
    this.accessTimes.clear();
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxSize) return;

    const sorted = [...this.accessTimes.entries()].sort((a, b) => a[1] - b[1]);

    while (this.cache.size > this.maxSize && sorted.length > 0) {
      const [oldestKey] = sorted.shift()!;
      this.cache.delete(oldestKey);
      this.accessTimes.delete(oldestKey);
    }
  }
}

const productCache = new LRUProductCache();

// ============================================================================
// PRODUCT DECODER
// ============================================================================
//
// The home_lists manifest doc embeds product summaries inline. There's no
// separate per-product Firestore fetch on the client anymore — the products
// arrived with the list config in a single read. This function just decodes
// the embedded array into the Product shape the card expects.

function hydrateProductsFromManifest(
  listData: DynamicListData,
): Product[] {
  const raw = (listData as unknown as { products?: unknown }).products;
  if (!Array.isArray(raw)) return [];

  const products: Product[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    try {
      products.push(
        ProductUtils.fromJson(entry as Record<string, unknown>),
      );
    } catch (e) {
      console.warn(
        `[DynamicHorizontalList] skipping malformed product in ${listData.id}:`,
        e,
      );
    }
    if (products.length >= MAX_PRODUCTS_PER_LIST) break;
  }

  return products;
}

// ============================================================================
// DYNAMIC LIST SECTION — visually identical to PreferenceProduct
// ============================================================================

interface DynamicListSectionProps {
  listData: DynamicListData;
  isDarkMode: boolean;
}

const DynamicListSection = React.memo(
  ({ listData, isDarkMode }: DynamicListSectionProps) => {
    // Hydrate server-prefetched products immediately
    const hydratedFromServer = useMemo(() => {
      if (!listData.prefetchedProducts || listData.prefetchedProducts.length === 0) return null;
      return listData.prefetchedProducts
        .map((p) => {
          try {
            return ProductUtils.fromJson(p as unknown as Record<string, unknown>);
          } catch {
            return null;
          }
        })
        .filter((p): p is Product => p !== null);
    }, [listData.prefetchedProducts]);

    // Products are inlined in the manifest doc, so the section has its
    // products from the moment the list config arrives — whether that's
    // SSR-prefetched or fetched client-side in the parent component.
    const productsFromManifest = useMemo(
      () => hydrateProductsFromManifest(listData),
      [listData],
    );

    const initialProducts =
      hydratedFromServer && hydratedFromServer.length > 0
        ? hydratedFromServer
        : productsFromManifest.length > 0
          ? productsFromManifest
          : (productCache.get(listData.id) ?? null);

    const [products, setProducts] = useState<Product[] | null>(initialProducts);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const sectionRef = useRef<HTMLDivElement>(null);

    // Populate LRU cache (server data takes priority, then manifest data).
    useEffect(() => {
      const source =
        hydratedFromServer && hydratedFromServer.length > 0
          ? hydratedFromServer
          : productsFromManifest;
      if (source.length > 0 && !productCache.has(listData.id)) {
        productCache.set(listData.id, source);
      }
    }, [hydratedFromServer, productsFromManifest, listData.id]);

    // If listData updates with new products (parent re-fetch), reflect it.
    useEffect(() => {
      if (productsFromManifest.length > 0) {
        setProducts(productsFromManifest);
      }
    }, [productsFromManifest]);

    // Scroll position check
    const checkScrollPosition = useCallback(() => {
      const el = scrollRef.current;
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 10);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
    }, []);

    useEffect(() => {
      if (!products || products.length === 0) return;
      requestAnimationFrame(checkScrollPosition);
    }, [products, checkScrollPosition]);

    const handleScrollLeft = useCallback(() => {
      scrollRef.current?.scrollBy({ left: -340, behavior: "smooth" });
    }, []);

    const handleScrollRight = useCallback(() => {
      scrollRef.current?.scrollBy({ left: 340, behavior: "smooth" });
    }, []);

    // Parse gradient colors (matches Flutter _parseColor)
    const parseColor = (colorString?: string, fallback = "#FF6B35"): string => {
      if (!colorString) return fallback;
      const clean = colorString.replace("#", "");
      if (/^[0-9a-fA-F]{6}$/.test(clean)) return `#${clean}`;
      if (/^[0-9a-fA-F]{8}$/.test(clean)) return `#${clean.substring(2)}`;
      return fallback;
    };

    const gradientStart = parseColor(listData.gradientStart, "#FF6B35");
    const gradientEnd = parseColor(listData.gradientEnd, "#FF8A65");

    const showShimmer = products === null;
    const isEmpty = products !== null && products.length === 0;

    // Don't render empty lists
    if (isEmpty) return null;

    return (
      <div ref={sectionRef} className="w-full my-2 lg:mx-0 lg:px-6">
        <div className="relative w-full rounded-none lg:rounded-t-3xl overflow-visible">
          {/* Background gradient with vertical fade mask — matching PreferenceProduct */}
          <div
            className="absolute inset-0 rounded-none lg:rounded-t-3xl"
            style={{
              height: `${ROW_HEIGHT * 0.6}px`,
              background: `linear-gradient(to right, ${gradientStart}, ${gradientEnd})`,
              maskImage:
                "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)",
            }}
          />

          <div className="relative py-3">
            {/* Header */}
            <div className="px-0 lg:px-2 mb-2">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-white leading-tight line-clamp-2">
                  {listData.title || "Product List"}
                </h2>
              </div>
            </div>

            {/* Content */}
            {showShimmer ? (
              <ShimmerList isDarkMode={isDarkMode} />
            ) : (
              <div className="relative">
                {/* Desktop scroll arrows — matching PreferenceProduct */}
                {canScrollLeft && (
                  <button
                    onClick={handleScrollLeft}
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

                {canScrollRight && (
                  <button
                    onClick={handleScrollRight}
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

                {/* Scrollable container — matching PreferenceProduct */}
                <div
                  ref={scrollRef}
                  className="overflow-x-auto overflow-y-hidden scrollbar-hide"
                  style={{ height: `${ROW_HEIGHT - 60}px` }}
                  onScroll={checkScrollPosition}
                >
                  <div className="flex gap-0 px-0 lg:px-2 h-full pr-0 lg:pr-2 -ml-2 lg:ml-0 -space-x-2">
                    {products!.map((product, index) => (
                      <div
                        key={product.id}
                        className="flex-shrink-0"
                        style={{ width: `${CARD_WIDTH}px` }}
                      >
                        <ProductCard
                          product={product}
                          scaleFactor={SCALE_FACTOR}
                          internalScaleFactor={1.0}
                          portraitImageHeight={PORTRAIT_IMAGE_HEIGHT}
                          overrideInternalScaleFactor={OVERRIDE_INNER_SCALE}
                          showCartIcon={false}
                          priority={index < 4}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <style jsx global>{`
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }

          .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}</style>
      </div>
    );
  },
);
DynamicListSection.displayName = "DynamicListSection";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DynamicHorizontalList({
  initialConfigs,
}: {
  initialConfigs?: PrefetchedDynamicListConfig[] | null;
} = {}) {
  const ssrLists = useMemo(() => {
    if (!initialConfigs || initialConfigs.length === 0) return [];
    return initialConfigs as DynamicListData[];
  }, [initialConfigs]);

  const [lists, setLists] = useState<DynamicListData[]>(ssrLists);
  const [isLoading, setIsLoading] = useState(ssrLists.length === 0);
  const isDarkMode = useTheme();

  // One-time fetch for the home-screen list manifests (skipped if SSR data
  // is available). Reads `home_lists` — the denormalized collection
  // maintained server-side by the `home-list-manifest` Cloud Functions.
  // Each manifest doc embeds its product summaries inline, so this single
  // query also delivers the products: 1 read per list, regardless of size.
  useEffect(() => {
    if (lists.length > 0) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchManifestLists() {
      try {
        const [db, { collection, query, where, orderBy, getDocs }] =
          await Promise.all([getFirebaseDb(), import("firebase/firestore")]);

        const listsQuery = query(
          collection(db, "home_lists"),
          where("isActive", "==", true),
          orderBy("order"),
        );

        const snapshot = await getDocs(listsQuery);
        if (cancelled) return;

        const fetchedLists: DynamicListData[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as DynamicListData[];

        setLists(fetchedLists);
        setIsLoading(false);
      } catch (e) {
        console.error("Error fetching home list manifests:", e);
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchManifestLists();
    return () => {
      cancelled = true;
    };
  }, []);

  // While config is loading or no lists, render nothing
  if (isLoading || lists.length === 0) return null;

  return (
    <div className="w-full">
      {lists.map((listData) => (
        <DynamicListSection
          key={listData.id}
          listData={listData}
          isDarkMode={isDarkMode}
        />
      ))}
    </div>
  );
}

// Export cache for parent control
export { productCache };
