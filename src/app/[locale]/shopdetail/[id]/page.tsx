"use client";

// ═══════════════════════════════════════════════════════════════════════════
// ShopDetailPage
//
// Mirrors Flutter's ShopDetailScreen + ShopProvider exactly:
//
//  Products  → always /api/shopProducts (Typesense, shopId-scoped)
//              Mirrors _fetchProductsFromTypesense()
//  Search    → debounced 300 ms, Typesense via same route (q param)
//              Mirrors _performTypesenseSearch()
//  SpecFacets → fetched on page-0 response, scoped to shopId
//              Mirrors _fetchSpecFacets()
//
//  Tabs      → Home (only if homeImageUrls), All Products, Collections,
//               Deals, Best Sellers, Reviews
//  Filters   → Sort | Filter (FilterSidebar) | Category
//  Layout    → Desktop: sticky cover + sidebar + grid
//              Mobile : FAB → portal drawer
// ═══════════════════════════════════════════════════════════════════════════

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Filter,
  Search,
  X,
  Star,
  Users,
  ChevronDown,
  RefreshCw,
  Layers,
  ShoppingBag,
  Tag,
  Award,
  MessageSquare,
  Home,
  AlertCircle,
  WifiOff,
  ThumbsUp,
  Globe,
  Check,
} from "lucide-react";
import { ProductCard } from "@/app/components/ProductCard";
import { Product, ProductUtils } from "@/app/models/Product";
import FilterSidebar, {
  FilterState,
  SpecFacets,
  EMPTY_FILTER_STATE,
  getActiveFiltersCount,
} from "@/app/components/FilterSideBar";
import { impressionBatcher } from "@/app/utils/impressionBatcher";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ShopData {
  id: string;
  name: string;
  profileImageUrl: string;
  coverImageUrls: string[];
  homeImageUrls?: string[];
  homeImageLinks?: Record<string, string>;
  address?: string;
  averageRating: number;
  reviewCount?: number;
  followerCount?: number;
  categories: string[];
  contactNo?: string;
  ownerId?: string;
  isActive?: boolean;
}

interface Collection {
  id: string;
  name: string;
  imageUrl?: string;
  productIds?: string[];
}

interface Review {
  id: string;
  rating: number;
  review: string;
  timestamp: number;
  likes?: string[];
  userId?: string;
}

type TabId =
  | "home"
  | "allProducts"
  | "collections"
  | "deals"
  | "bestSellers"
  | "reviews";

// ─────────────────────────────────────────────────────────────────────────────
// Sort helpers – mirror Flutter's ShopProvider.setSortOption
// ─────────────────────────────────────────────────────────────────────────────

type SortOption = "date" | "alphabetical" | "price_asc" | "price_desc";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "date", label: "Newest" },
  { value: "alphabetical", label: "A–Z" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const ProductShimmer: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const base = isDark ? "bg-gray-700" : "bg-gray-200";
  const card = isDark ? "bg-gray-800" : "bg-white";
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className={`rounded-xl overflow-hidden ${card} animate-pulse`}
        >
          <div className={`w-full h-52 ${base}`} />
          <div className="p-3 space-y-2">
            <div className={`h-3 rounded ${base} w-4/5`} />
            <div className={`h-3 rounded ${base} w-3/5`} />
            <div className={`h-4 rounded ${base} w-2/5`} />
          </div>
        </div>
      ))}
    </div>
  );
};

const EmptyState: React.FC<{
  icon: React.ReactNode;
  message: string;
  subMessage?: string;
  onClear?: () => void;
  isDark: boolean;
}> = ({ icon, message, subMessage, onClear, isDark }) => (
  <div className="flex flex-col items-center justify-center min-h-64 gap-4 py-16 px-4 text-center">
    <div className={isDark ? "text-gray-600" : "text-gray-300"}>{icon}</div>
    <p
      className={`text-base font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}
    >
      {message}
    </p>
    {subMessage && (
      <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
        {subMessage}
      </p>
    )}
    {onClear && (
      <button
        onClick={onClear}
        className="mt-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
      >
        Clear Filters
      </button>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface ShopDetailPageProps {
  shopId: string;
}

export default function ShopDetailPage({ shopId }: ShopDetailPageProps) {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const fetchDoneRef = useRef(false);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("allProducts");

  // ── Shop ──────────────────────────────────────────────────────────────────
  const [shopData, setShopData] = useState<ShopData | null>(null);
  const [shopLoading, setShopLoading] = useState(true);
  const [shopError, setShopError] = useState(false);

  // ── Products ──────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [productError, setProductError] = useState(false);
  const [searchResultCount, setSearchResultCount] = useState<number | null>(
    null,
  );

  // ── Collections ───────────────────────────────────────────────────────────
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);

  // ── Reviews ───────────────────────────────────────────────────────────────
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTER_STATE);
  const [specFacets, setSpecFacets] = useState<SpecFacets>({});
  const [sortOption, setSortOption] = useState<SortOption>("date");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(
    null,
  );

  // ── Available subcategories (derived from products) ───────────────────────
  const [availableSubcategories, setAvailableSubcategories] = useState<
    string[]
  >([]);

  // ─────────────────────────────────────────────────────────────────────────
  // Stable filter key to prevent excess renders
  // ─────────────────────────────────────────────────────────────────────────
  const filterKey = useMemo(
    () =>
      JSON.stringify({
        colors: [...filters.colors].sort(),
        brands: [...filters.brands].sort(),
        specFilters: filters.specFilters,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        subcategory: selectedSubcategory,
        sort: sortOption,
      }),
    [filters, selectedSubcategory, sortOption],
  );

  const activeFilterCount =
    getActiveFiltersCount(filters) + (selectedSubcategory ? 1 : 0);

  // ─────────────────────────────────────────────────────────────────────────
  // Theme / responsive setup
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflow = showMobileSidebar ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [showMobileSidebar]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = () => {
      setShowSortDropdown(false);
      setShowCategoryMenu(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Flush impressions
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(
    () => () => {
      impressionBatcher.flush();
    },
    [],
  );
  useEffect(() => {
    const f = () => {
      if (document.hidden) impressionBatcher.flush();
    };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Search debounce — 300ms (mirrors Flutter)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tid = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(tid);
  }, [searchQuery]);

  // ─────────────────────────────────────────────────────────────────────────
  // Shop data fetch
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shopId) return;
    setShopLoading(true);
    setShopError(false);
    fetch(`/api/shops/${shopId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data) => {
        const shop = data.shop ?? data;
        setShopData({
          id: shopId,
          name: shop.name ?? "",
          profileImageUrl: shop.profileImageUrl ?? "",
          coverImageUrls: shop.coverImageUrls ?? [],
          homeImageUrls: shop.homeImageUrls ?? [],
          homeImageLinks: shop.homeImageLinks ?? {},
          address: shop.address ?? "",
          averageRating: shop.averageRating ?? 0,
          reviewCount: shop.reviewCount ?? 0,
          followerCount: shop.followerCount ?? 0,
          categories: shop.categories ?? [],
          contactNo: shop.contactNo ?? "",
          ownerId: shop.ownerId ?? "",
          isActive: shop.isActive ?? true,
        });
        // If shop has home images, make Home tab default
        if ((shop.homeImageUrls ?? []).length > 0) {
          setActiveTab("home");
        }
      })
      .catch(() => setShopError(true))
      .finally(() => setShopLoading(false));
  }, [shopId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Collections fetch (Firestore via existing API or direct)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shopId) return;
    setCollectionsLoading(true);
    fetch(`/api/shops/${shopId}/collections`)
      .then((r) => (r.ok ? r.json() : { collections: [] }))
      .then((data) => setCollections(data.collections ?? []))
      .catch(() => setCollections([]))
      .finally(() => setCollectionsLoading(false));
  }, [shopId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Reviews fetch
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shopId) return;
    setReviewsLoading(true);
    fetch(`/api/shops/${shopId}/reviews`)
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((data) => setReviews(data.reviews ?? []))
      .catch(() => setReviews([]))
      .finally(() => setReviewsLoading(false));
  }, [shopId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Products fetch — mirrors Flutter's _fetchProductsFromTypesense()
  // Always Typesense (via /api/shopProducts), scoped to shopId
  // ─────────────────────────────────────────────────────────────────────────
  const fetchProducts = useCallback(
    async (page: number, reset: boolean) => {
      if (!shopId) return;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        if (reset) {
          setIsLoadingProducts(true);
          setProducts([]);
          setCurrentPage(0);
          setHasMore(false);
          setProductError(false);
          setSearchResultCount(null);
          fetchDoneRef.current = false;
        } else {
          setIsLoadingMore(true);
        }

        const qp = new URLSearchParams({
          shopId,
          page: page.toString(),
          hitsPerPage: "20",
          sort: sortOption,
        });

        if (debouncedQuery) qp.set("q", debouncedQuery);
        if (selectedSubcategory) qp.set("subcategory", selectedSubcategory);
        if (filters.colors.length > 0)
          qp.set("colors", filters.colors.join(","));
        if (filters.brands.length > 0)
          qp.set("brands", filters.brands.join(","));
        if (filters.minPrice !== undefined)
          qp.set("minPrice", String(filters.minPrice));
        if (filters.maxPrice !== undefined)
          qp.set("maxPrice", String(filters.maxPrice));
        for (const [field, vals] of Object.entries(filters.specFilters)) {
          if (vals.length > 0) qp.set(`spec_${field}`, vals.join(","));
        }

        const res = await fetch(`/api/shopProducts?${qp}`, {
          signal: abortRef.current.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const newProducts: Product[] = (data.products ?? []).map(
          (raw: Record<string, unknown>) => ProductUtils.fromJson(raw),
        );

        if (reset) {
          setProducts(newProducts);
          // SpecFacets arrive on page 0 (mirrors Flutter _fetchSpecFacets)
          if (data.specFacets) setSpecFacets(data.specFacets as SpecFacets);
          if (debouncedQuery) setSearchResultCount(newProducts.length);
          // Derive available subcategories from product data
          const subs = Array.from(
            new Set(newProducts.map((p) => p.subcategory).filter(Boolean)),
          ).sort() as string[];
          if (subs.length > 0) setAvailableSubcategories(subs);
        } else {
          setProducts((prev) => [...prev, ...newProducts]);
        }

        setHasMore(data.hasMore ?? false);
        setCurrentPage(page);
        fetchDoneRef.current = true;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setProductError(true);
      } finally {
        setIsLoadingProducts(false);
        setIsLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shopId, sortOption, debouncedQuery, filterKey],
  );

  // Trigger fetch on any filter / sort / query change
  useEffect(() => {
    fetchProducts(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, sortOption, debouncedQuery, filterKey]);

  // Infinite scroll
  useEffect(() => {
    let tid: NodeJS.Timeout;
    const onScroll = () => {
      clearTimeout(tid);
      tid = setTimeout(() => {
        if (
          window.innerHeight + document.documentElement.scrollTop >=
          document.documentElement.offsetHeight - 2000
        ) {
          if (hasMore && !isLoadingMore && fetchDoneRef.current) {
            fetchProducts(currentPage + 1, false);
          }
        }
      }, 100);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(tid);
    };
  }, [hasMore, isLoadingMore, currentPage, fetchProducts]);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived product lists — mirrors Flutter's dealProducts / bestSellers
  // ─────────────────────────────────────────────────────────────────────────
  const dealProducts = useMemo(
    () => products.filter((p) => (p.discountPercentage ?? 0) > 0),
    [products],
  );
  const bestSellers = useMemo(
    () =>
      [...products].sort(
        (a, b) => (b.purchaseCount ?? 0) - (a.purchaseCount ?? 0),
      ),
    [products],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Tab config — Home tab only shown if shop has homeImageUrls (mirrors Flutter)
  // ─────────────────────────────────────────────────────────────────────────
  const hasHomeTab = (shopData?.homeImageUrls?.length ?? 0) > 0;
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    ...(hasHomeTab
      ? [{ id: "home" as TabId, label: "Home", icon: <Home size={14} /> }]
      : []),
    {
      id: "allProducts",
      label: "All Products",
      icon: <ShoppingBag size={14} />,
    },
    { id: "collections", label: "Collections", icon: <Layers size={14} /> },
    { id: "deals", label: "Deals", icon: <Tag size={14} /> },
    { id: "bestSellers", label: "Best Sellers", icon: <Award size={14} /> },
    { id: "reviews", label: "Reviews", icon: <MessageSquare size={14} /> },
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────
  const handleClearAllFilters = () => {
    setFilters(EMPTY_FILTER_STATE);
    setSelectedSubcategory(null);
    setSortOption("date");
  };

  const isProductTab =
    activeTab === "allProducts" ||
    activeTab === "deals" ||
    activeTab === "bestSellers";
  const activeProducts =
    activeTab === "deals"
      ? dealProducts
      : activeTab === "bestSellers"
        ? bestSellers
        : products;

  // ─────────────────────────────────────────────────────────────────────────
  // Render: error / loading states
  // ─────────────────────────────────────────────────────────────────────────
  if (shopError) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${isDark ? "bg-gray-950" : "bg-gray-50"}`}
      >
        <div className="text-center space-y-4 px-4">
          <AlertCircle size={64} className="mx-auto text-red-400" />
          <h2
            className={`text-lg font-semibold ${isDark ? "text-white" : "text-gray-900"}`}
          >
            Failed to load shop
          </h2>
          <p
            className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
          >
            Please check your connection and try again.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium"
            >
              Go back
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      className={`min-h-screen ${isDark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-900"}`}
    >
      {/* ── Cover / Header ── */}
      <div className="relative">
        {/* Cover image */}
        <div className="relative w-full h-44 sm:h-56 md:h-64 overflow-hidden">
          {shopLoading ? (
            <div
              className={`w-full h-full ${isDark ? "bg-gray-800" : "bg-gray-200"} animate-pulse`}
            />
          ) : shopData?.coverImageUrls?.[0] ? (
            <Image
              src={shopData.coverImageUrls[0]}
              alt={shopData.name}
              fill
              className="object-cover"
              priority
            />
          ) : (
            <div
              className={`w-full h-full ${isDark ? "bg-gray-800" : "bg-gray-300"}`}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
        </div>

        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 p-2 rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Shop info overlay */}
        <div className="absolute bottom-4 left-4 flex items-end gap-3">
          {/* Profile image */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 border-white shadow-lg flex-shrink-0 bg-gray-300">
            {shopData?.profileImageUrl && (
              <Image
                src={shopData.profileImageUrl}
                alt={shopData.name ?? ""}
                width={64}
                height={64}
                className="w-full h-full object-cover"
              />
            )}
          </div>
          {/* Name + stats */}
          <div className="pb-0.5">
            {shopLoading ? (
              <div className="space-y-1.5">
                <div className="h-5 w-40 bg-white/40 rounded animate-pulse" />
                <div className="h-3 w-28 bg-white/30 rounded animate-pulse" />
              </div>
            ) : (
              <>
                <h1 className="text-white font-bold text-base sm:text-lg leading-tight drop-shadow">
                  {shopData?.name}
                </h1>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1 text-white text-xs">
                    <Star
                      size={12}
                      className="fill-yellow-400 text-yellow-400"
                    />
                    {(shopData?.averageRating ?? 0).toFixed(1)}
                  </span>
                  <span className="flex items-center gap-1 text-white text-xs">
                    <Users size={12} />
                    {shopData?.followerCount?.toLocaleString() ?? 0} followers
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div
        className={`sticky top-0 z-20 px-4 py-2.5 ${
          isDark
            ? "bg-gray-900/95 border-b border-white/10"
            : "bg-white/95 border-b border-gray-100"
        } backdrop-blur-xl`}
      >
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
            isDark ? "bg-gray-800" : "bg-gray-100"
          }`}
        >
          {isLoadingProducts && searchQuery ? (
            <RefreshCw
              size={16}
              className="text-orange-500 animate-spin flex-shrink-0"
            />
          ) : (
            <Search
              size={16}
              className={`flex-shrink-0 ${isDark ? "text-gray-400" : "text-gray-500"}`}
            />
          )}
          <input
            type="text"
            placeholder="Search in store…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400 ${
              isDark ? "text-white" : "text-gray-900"
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className={`p-0.5 rounded-full ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
            >
              <X
                size={14}
                className={isDark ? "text-gray-400" : "text-gray-500"}
              />
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div
        className={`sticky top-[57px] z-20 ${isDark ? "bg-gray-900 border-b border-white/10" : "bg-white border-b border-gray-100"}`}
      >
        <div className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-0 min-w-max px-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? "border-orange-500 text-orange-500"
                      : `border-transparent ${isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700"}`
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Filter row — only for product tabs */}
        {isProductTab && (
          <div
            className={`flex items-center gap-2 px-4 pb-2.5 pt-1 ${
              isDark ? "bg-gray-900" : "bg-white"
            }`}
          >
            {/* Sort button */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => {
                  setShowSortDropdown((v) => !v);
                  setShowCategoryMenu(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  sortOption !== "date"
                    ? "border-orange-400 text-orange-500 bg-orange-50 dark:bg-orange-900/20"
                    : isDark
                      ? "border-gray-600 text-gray-300"
                      : "border-gray-300 text-gray-600"
                }`}
              >
                <ChevronDown size={12} />
                {SORT_OPTIONS.find((o) => o.value === sortOption)?.label ??
                  "Sort"}
              </button>
              {showSortDropdown && (
                <div
                  className={`absolute top-full left-0 mt-1.5 w-40 rounded-xl shadow-xl border overflow-hidden z-50 ${
                    isDark
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-100"
                  }`}
                >
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSortOption(opt.value);
                        setShowSortDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                        sortOption === opt.value
                          ? "text-orange-500 font-medium"
                          : isDark
                            ? "text-gray-300 hover:bg-gray-700"
                            : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {opt.label}
                      {sortOption === opt.value && (
                        <Check size={13} className="text-orange-500" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filter button */}
            <button
              onClick={() => setShowMobileSidebar(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                activeFilterCount > 0
                  ? "border-orange-400 text-orange-500 bg-orange-50 dark:bg-orange-900/20"
                  : isDark
                    ? "border-gray-600 text-gray-300"
                    : "border-gray-300 text-gray-600"
              }`}
            >
              <Filter size={12} />
              Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>

            {/* Category button */}
            {availableSubcategories.length > 0 && (
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    setShowCategoryMenu((v) => !v);
                    setShowSortDropdown(false);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedSubcategory
                      ? "border-orange-400 text-orange-500 bg-orange-50 dark:bg-orange-900/20"
                      : isDark
                        ? "border-gray-600 text-gray-300"
                        : "border-gray-300 text-gray-600"
                  }`}
                >
                  <Layers size={12} />
                  {selectedSubcategory ?? "Category"}
                </button>
                {showCategoryMenu && (
                  <div
                    className={`absolute top-full left-0 mt-1.5 w-48 rounded-xl shadow-xl border overflow-hidden z-50 max-h-64 overflow-y-auto ${
                      isDark
                        ? "bg-gray-800 border-gray-700"
                        : "bg-white border-gray-100"
                    }`}
                  >
                    <button
                      onClick={() => {
                        setSelectedSubcategory(null);
                        setShowCategoryMenu(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                        !selectedSubcategory
                          ? "text-orange-500 font-medium"
                          : isDark
                            ? "text-gray-300 hover:bg-gray-700"
                            : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      All
                      {!selectedSubcategory && (
                        <Check size={13} className="text-orange-500" />
                      )}
                    </button>
                    {availableSubcategories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          setSelectedSubcategory(cat);
                          setShowCategoryMenu(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                          selectedSubcategory === cat
                            ? "text-orange-500 font-medium"
                            : isDark
                              ? "text-gray-300 hover:bg-gray-700"
                              : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {cat}
                        {selectedSubcategory === cat && (
                          <Check size={13} className="text-orange-500" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Main layout ── */}
      <div className="flex max-w-7xl mx-auto">
        {/* ── Desktop FilterSidebar ── */}
        {isProductTab && (
          <div className="hidden lg:block w-60 flex-shrink-0">
            <FilterSidebar
              category={shopData?.categories?.[0] ?? ""}
              buyerCategory=""
              filters={filters}
              onFiltersChange={setFilters}
              specFacets={specFacets}
              isDarkMode={isDark}
              className="w-60"
            />
          </div>
        )}

        {/* ── Mobile sidebar FAB ── */}
        {isProductTab && (
          <div className="lg:hidden fixed bottom-6 right-5 z-50">
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="relative p-3.5 rounded-full shadow-xl bg-orange-500 text-white"
            >
              <Filter size={20} />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* ── Mobile sidebar drawer ── */}
        {isMobile && (
          <FilterSidebar
            category={shopData?.categories?.[0] ?? ""}
            buyerCategory=""
            filters={filters}
            onFiltersChange={(f) => {
              setFilters(f);
              setShowMobileSidebar(false);
            }}
            specFacets={specFacets}
            isOpen={showMobileSidebar}
            onClose={() => setShowMobileSidebar(false)}
            isDarkMode={isDark}
          />
        )}

        {/* ── Tab content ── */}
        <div className="flex-1 min-w-0 px-3 sm:px-4 py-4">
          {/* ───── HOME TAB ───── */}
          {activeTab === "home" && (
            <div className="space-y-2">
              {(shopData?.homeImageUrls ?? []).length === 0 ? (
                <EmptyState
                  icon={<Home size={64} strokeWidth={1} />}
                  message="No home content available"
                  isDark={isDark}
                />
              ) : (
                shopData!.homeImageUrls!.map((url, i) => {
                  const linkedProductId = shopData?.homeImageLinks?.[url];
                  const img = (
                    <Image
                      key={i}
                      src={url}
                      alt={`Home image ${i + 1}`}
                      width={1200}
                      height={600}
                      className="w-full object-cover"
                    />
                  );
                  return linkedProductId ? (
                    <Link key={i} href={`/product/${linkedProductId}`}>
                      {img}
                    </Link>
                  ) : (
                    <div key={i}>{img}</div>
                  );
                })
              )}
            </div>
          )}

          {/* ───── ALL PRODUCTS / DEALS / BEST SELLERS ───── */}
          {isProductTab && (
            <>
              {/* Search results header */}
              {debouncedQuery && searchResultCount !== null && (
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-3 ${
                    isDark
                      ? "bg-teal-900/30 border border-teal-700/40"
                      : "bg-teal-50 border border-teal-200"
                  }`}
                >
                  <Search size={14} className="text-teal-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-teal-600 dark:text-teal-400">
                    {searchResultCount}{" "}
                    {searchResultCount === 1 ? "result" : "results"} for &ldquo;
                    {debouncedQuery}&rdquo;
                  </span>
                </div>
              )}

              {/* Active filter chips */}
              {activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {filters.colors.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs"
                    >
                      {c}
                      <button
                        onClick={() =>
                          setFilters((f) => ({
                            ...f,
                            colors: f.colors.filter((x) => x !== c),
                          }))
                        }
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {filters.brands.map((b) => (
                    <span
                      key={b}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs"
                    >
                      {b}
                      <button
                        onClick={() =>
                          setFilters((f) => ({
                            ...f,
                            brands: f.brands.filter((x) => x !== b),
                          }))
                        }
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {selectedSubcategory && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs">
                      {selectedSubcategory}
                      <button onClick={() => setSelectedSubcategory(null)}>
                        <X size={10} />
                      </button>
                    </span>
                  )}
                  {(filters.minPrice !== undefined ||
                    filters.maxPrice !== undefined) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs">
                      {filters.minPrice ?? "0"} – {filters.maxPrice ?? "∞"} TL
                      <button
                        onClick={() =>
                          setFilters((f) => ({
                            ...f,
                            minPrice: undefined,
                            maxPrice: undefined,
                          }))
                        }
                      >
                        <X size={10} />
                      </button>
                    </span>
                  )}
                  <button
                    onClick={handleClearAllFilters}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      isDark
                        ? "border-gray-600 text-gray-400 hover:bg-gray-700"
                        : "border-gray-300 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    Clear all
                  </button>
                </div>
              )}

              {/* Products grid */}
              {isLoadingProducts && products.length === 0 ? (
                <ProductShimmer isDark={isDark} />
              ) : productError ? (
                <div className="flex flex-col items-center justify-center min-h-64 gap-4">
                  <WifiOff
                    size={48}
                    className={isDark ? "text-gray-600" : "text-gray-300"}
                  />
                  <p
                    className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
                  >
                    Failed to load products
                  </p>
                  <button
                    onClick={() => fetchProducts(0, true)}
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm"
                  >
                    Retry
                  </button>
                </div>
              ) : activeProducts.length === 0 ? (
                <EmptyState
                  icon={<ShoppingBag size={64} strokeWidth={1} />}
                  message={
                    debouncedQuery
                      ? `No results for "${debouncedQuery}"`
                      : activeTab === "deals"
                        ? "No deals available right now"
                        : activeTab === "bestSellers"
                          ? "No best sellers yet"
                          : "No products found"
                  }
                  subMessage={
                    activeFilterCount > 0
                      ? "Try removing some filters"
                      : undefined
                  }
                  onClear={
                    activeFilterCount > 0 ? handleClearAllFilters : undefined
                  }
                  isDark={isDark}
                />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-4">
                  {activeProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      isDarkMode={isDark}
                    />
                  ))}
                </div>
              )}

              {/* Load more spinner */}
              {isLoadingMore && (
                <div className="flex justify-center py-8">
                  <RefreshCw
                    size={24}
                    className="text-orange-500 animate-spin"
                  />
                </div>
              )}

              {/* End of results */}
              {!hasMore && !isLoadingProducts && products.length > 0 && (
                <p
                  className={`text-center text-xs py-8 ${isDark ? "text-gray-600" : "text-gray-400"}`}
                >
                  All products loaded
                </p>
              )}
            </>
          )}

          {/* ───── COLLECTIONS TAB ───── */}
          {activeTab === "collections" && (
            <>
              {collectionsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-20 rounded-xl animate-pulse ${isDark ? "bg-gray-800" : "bg-gray-200"}`}
                    />
                  ))}
                </div>
              ) : collections.length === 0 ? (
                <EmptyState
                  icon={<Layers size={64} strokeWidth={1} />}
                  message="No collections available"
                  isDark={isDark}
                />
              ) : (
                <div className="space-y-3">
                  {collections.map((col) => (
                    <Link
                      key={col.id}
                      href={`/collection/${col.id}?shopId=${shopId}&name=${encodeURIComponent(col.name)}`}
                      className={`flex items-center gap-4 p-4 rounded-xl shadow-sm transition-colors ${
                        isDark
                          ? "bg-gray-800 hover:bg-gray-750"
                          : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      <div
                        className={`w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 ${
                          isDark ? "bg-gray-700" : "bg-gray-100"
                        }`}
                      >
                        {col.imageUrl ? (
                          <Image
                            src={col.imageUrl}
                            alt={col.name}
                            width={64}
                            height={64}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Layers
                              size={24}
                              className={
                                isDark ? "text-gray-600" : "text-gray-400"
                              }
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`font-semibold text-sm truncate ${isDark ? "text-white" : "text-gray-900"}`}
                        >
                          {col.name}
                        </p>
                        <p
                          className={`text-xs mt-0.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}
                        >
                          {col.productIds?.length ?? 0}{" "}
                          {(col.productIds?.length ?? 0) === 1
                            ? "product"
                            : "products"}
                        </p>
                      </div>
                      <ChevronDown
                        size={16}
                        className={`rotate-[-90deg] flex-shrink-0 ${isDark ? "text-gray-500" : "text-gray-400"}`}
                      />
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ───── REVIEWS TAB ───── */}
          {activeTab === "reviews" && (
            <>
              {reviewsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-24 rounded-xl animate-pulse ${isDark ? "bg-gray-800" : "bg-gray-200"}`}
                    />
                  ))}
                </div>
              ) : reviews.length === 0 ? (
                <EmptyState
                  icon={<MessageSquare size={64} strokeWidth={1} />}
                  message="No reviews yet"
                  isDark={isDark}
                />
              ) : (
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <ReviewCard
                      key={review.id}
                      review={review}
                      shopId={shopId}
                      isDark={isDark}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReviewCard — mirrors Flutter's _ReviewTile
// ─────────────────────────────────────────────────────────────────────────────

function ReviewCard({
  review,
  shopId,
  isDark,
}: {
  review: Review;
  shopId: string;
  isDark: boolean;
}) {
  const [likeCount, setLikeCount] = useState(review.likes?.length ?? 0);
  const [liked, setLiked] = useState(false);

  const handleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    try {
      await fetch(`/api/shops/${shopId}/reviews/${review.id}/like`, {
        method: "POST",
        body: JSON.stringify({ like: next }),
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // revert on error
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
    }
  };

  const date = new Date(review.timestamp).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
      <div className="flex items-center justify-between mb-2">
        <StarRating rating={review.rating} />
        <span
          className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}
        >
          {date}
        </span>
      </div>
      <p
        className={`text-sm leading-relaxed mb-3 ${isDark ? "text-gray-200" : "text-gray-700"}`}
      >
        {review.review}
      </p>
      <div className="flex items-center gap-4">
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 text-xs transition-colors ${
            liked
              ? "text-blue-500"
              : isDark
                ? "text-gray-400 hover:text-gray-200"
                : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <ThumbsUp size={13} className={liked ? "fill-blue-500" : ""} />
          {likeCount}
        </button>
        <button
          className={`flex items-center gap-1.5 text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}
        >
          <Globe size={13} />
          Translate
        </button>
      </div>
    </div>
  );
}

function StarRating({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          className={
            i < Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "text-gray-300"
          }
        />
      ))}
    </span>
  );
}
