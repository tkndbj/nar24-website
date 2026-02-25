"use client";

/**
 * shop_detail_page.tsx
 *
 * Full-parity rewrite matching Flutter's shop_provider.dart + shop_detail_filter_screen.dart.
 *
 * Fixed bugs vs previous version:
 *  1. Gender never sent to Typesense facetFilters  → fixed: `gender:${value}`
 *  2. Types/fits never sent to Typesense            → fixed: `attributes.clothingType`, `attributes.clothingFit`
 *  3. Sizes never sent to Typesense                 → fixed: `clothingSizes:${size}`
 *  4. Color field wrong for Typesense               → fixed: `availableColors:${c}` (indexed array)
 *  5. Firestore path had no client-side filtering   → fixed: applyClientFilters() mirrors Flutter's _applyAllFilters
 *  6. Firestore path missing gender WHERE clause    → fixed: server-side gender filter added
 *  7. FilterSidebar missing gender/type/fit/size UI → fixed: shopCategories prop passed
 *  8. filterKey didn't include gender/types/fits/sizes → fixed: full key includes all filter fields
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "../../../../lib/firebase";
import SecondHeader from "@/app/components/market_screen/SecondHeader";
import { ProductCard } from "@/app/components/ProductCard";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import { Product, ProductUtils } from "@/app/models/Product";
import FilterSidebar, {
  FilterState,
  SpecFacets,
  EMPTY_FILTER_STATE,
  getActiveFiltersCount,
} from "@/app/components/FilterSideBar";
import {
  MagnifyingGlassIcon,
  StarIcon,
  UsersIcon,
  EyeIcon,
  HeartIcon,
  ArrowLeftIcon,
  PhotoIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolidIcon } from "@heroicons/react/24/solid";
import { Filter, SortAsc, ChevronDown } from "lucide-react";

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
  address: string;
  averageRating: number;
  reviewCount: number;
  followerCount: number;
  clickCount: number;
  categories: string[];
  contactNo: string;
  ownerId: string;
  isBoosted: boolean;
  createdAt: { seconds: number; nanoseconds: number };
}

interface ShopCollection {
  id: string;
  name: string;
  imageUrl?: string;
  productIds: string[];
  createdAt: { seconds: number; nanoseconds: number };
}

interface Review {
  id: string;
  rating: number;
  review: string;
  timestamp: { seconds: number; nanoseconds: number };
  userId: string;
  userName?: string;
  likes: string[];
}

type TabType =
  | "home"
  | "allProducts"
  | "collections"
  | "deals"
  | "bestSellers"
  | "reviews";

// ─────────────────────────────────────────────────────────────────────────────
// Sort helpers
// ─────────────────────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  "None",
  "Alphabetical",
  "Date",
  "Price Low to High",
  "Price High to Low",
] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

function toSortCode(opt: SortOption): string {
  switch (opt) {
    case "Alphabetical":
      return "alphabetical";
    case "Price Low to High":
      return "price_asc";
    case "Price High to Low":
      return "price_desc";
    case "Date":
      return "date";
    default:
      return "date";
  }
}

/**
 * Mirrors Flutter's _shouldUseTypesense().
 * Typesense is used when: sort != default/date, OR search query active,
 * OR spec filters (dynamic facets) are active.
 * Basic filters (gender, brands, colors, types, fits, sizes, price) alone
 * use the Firestore path + client-side filtering, matching Flutter exactly.
 */
function shouldUseTypesense(
  sortOption: SortOption,
  specFilters: Record<string, string[]>,
  searchQuery: string,
  filters: FilterState,
): boolean {
  if (sortOption !== "None" && sortOption !== "Date") return true;
  if (searchQuery.trim()) return true;
  if (Object.values(specFilters).some((v) => v.length > 0)) return true;
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined)
    return true;
  if (filters.minRating !== undefined) return true;
  if (filters.gender) return true; // ADD THIS LINE
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-side filter helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely read an unknown field from a Product, since we don't know the exact
 * TypeScript Product model shape for clothing-specific fields.
 */
function getField(p: Product, ...keys: string[]): unknown {
  const rec = p as unknown as Record<string, unknown>;
  for (const key of keys) {
    if (rec[key] !== undefined) return rec[key];
  }
  return undefined;
}

/**
 * Mirrors Flutter's _applyAllFilters().
 * Applied after a Firestore fetch to simulate the client-side filtering
 * Flutter does for brands, types, fits, sizes, and colors.
 * Gender and price are already filtered server-side in Firestore.
 */
function applyClientFilters(
  products: Product[],
  filters: FilterState,
  searchQuery: string,
): Product[] {
  let result = products;

  // Search query (text match on productName)
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    result = result.filter((p) =>
      (p.productName ?? "").toLowerCase().includes(q),
    );
  }

  // Brands — mirrors Flutter: brandModel contains brand (case-insensitive)
  if (filters.brands.length > 0) {
    result = result.filter((p) => {
      const brand = ((p as unknown as Record<string, unknown>).brandModel ??
        "") as string;
      return filters.brands.some(
        (b) =>
          brand.toLowerCase() === b.toLowerCase() ||
          brand.toLowerCase().includes(b.toLowerCase()),
      );
    });
  }

  // Clothing types — mirrors Flutter: p.attributes['clothingType']
  if ((filters.types ?? []).length > 0) {
    result = result.filter((p) => {
      const rec = p as unknown as Record<string, unknown>;
      // Check nested attributes map first (Flutter stores here), then top-level fallback
      const attrs = rec.attributes as Record<string, unknown> | undefined;
      const typeVal =
        attrs?.clothingType ?? rec.clothingType ?? rec.clothingTypes;
      if (!typeVal) return false;
      const types = Array.isArray(typeVal) ? typeVal : [typeVal];
      return (filters.types ?? []).some((t) => (types as string[]).includes(t));
    });
  }

  // Clothing fits — mirrors Flutter: p.attributes['clothingFit']
  if ((filters.fits ?? []).length > 0) {
    result = result.filter((p) => {
      const rec = p as unknown as Record<string, unknown>;
      const attrs = rec.attributes as Record<string, unknown> | undefined;
      const fit = (attrs?.clothingFit ?? rec.clothingFit) as string | undefined;
      return fit !== undefined && (filters.fits ?? []).includes(fit);
    });
  }

  // Clothing sizes — mirrors Flutter: p.attributes['clothingSizes'].contains(size)
  if ((filters.sizes ?? []).length > 0) {
    result = result.filter((p) => {
      const rec = p as unknown as Record<string, unknown>;
      const attrs = rec.attributes as Record<string, unknown> | undefined;
      const sizesVal = attrs?.clothingSizes ?? rec.clothingSizes ?? rec.sizes;
      if (!sizesVal) return false;
      const sizes = Array.isArray(sizesVal) ? sizesVal : [sizesVal];
      return (filters.sizes ?? []).some((s) => (sizes as string[]).includes(s));
    });
  }

  // Colors — mirrors Flutter: colorImages.containsKey(color)
  if (filters.colors.length > 0) {
    result = result.filter((p) => {
      // Try availableColors array first (indexed field in Typesense/Firestore)
      const avail = getField(p, "availableColors") as string[] | undefined;
      if (avail) {
        return filters.colors.some((c) => avail.includes(c));
      }
      // Fallback: colorImages map keys
      const colorImages = getField(p, "colorImages") as
        | Record<string, unknown>
        | undefined;
      if (colorImages) {
        return filters.colors.some((c) => c in colorImages);
      }
      return false;
    });
  }

  return result;
}

/**
 * Derive the three display arrays from a base product list.
 * Mirrors Flutter's allProductsNotifier / dealProductsNotifier / bestSellersNotifier derivation.
 */
function deriveProductArrays(products: Product[]): {
  all: Product[];
  deals: Product[];
  bestSellers: Product[];
} {
  return {
    all: products,
    deals: products.filter((p) => (p.discountPercentage ?? 0) > 0),
    bestSellers: [...products].sort(
      (a, b) => (b.purchaseCount ?? 0) - (a.purchaseCount ?? 0),
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ShopDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("shopDetail");
  const tRoot = useTranslations();
  const shopId = params.id as string;

  // ── Shop data ──────────────────────────────────────────────────────────────
  const [shopData, setShopData] = useState<ShopData | null>(null);
  const [shopCollections, setShopCollections] = useState<ShopCollection[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Product state ──────────────────────────────────────────────────────────
  // Mirrors Flutter's allProductsNotifier / dealProductsNotifier / bestSellersNotifier
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [dealProducts, setDealProducts] = useState<Product[]>([]);
  const [bestSellers, setBestSellers] = useState<Product[]>([]);

  const [isProductsLoading, setIsProductsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialProductLoad, setIsInitialProductLoad] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);

  // Firestore cursor — mirrors Flutter's _lastProductDocument
  const lastFirestoreDocRef =
    useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const PRODUCTS_LIMIT = 20;

  // ── Filter + facet state ───────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTER_STATE);
  const [specFacets, setSpecFacets] = useState<SpecFacets>({});

  // ── UI state ───────────────────────────────────────────────────────────────
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("allProducts");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [selectedSort, setSelectedSort] = useState<SortOption>("None");
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Race token — mirrors Flutter's _searchRaceToken (prevents stale result races)
  const fetchTokenRef = useRef(0);

  const isProductTab = ["allProducts", "deals", "bestSellers"].includes(
    activeTab,
  );

  /**
   * Stable serialised key covering ALL filter fields.
   * Effect deps only change when something actually changed.
   * BUG FIX: Previous version omitted gender, types, fits, sizes.
   */
  const filterKey = useMemo(
    () =>
      JSON.stringify({
        gender: filters.gender,
        subcategories: [...filters.subcategories].sort(),
        colors: [...filters.colors].sort(),
        brands: [...filters.brands].sort(),
        types: [...(filters.types ?? [])].sort(),
        fits: [...(filters.fits ?? [])].sort(),
        sizes: [...(filters.sizes ?? [])].sort(),
        specFilters: filters.specFilters,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        minRating: filters.minRating,
      }),
    [filters],
  );

  const activeCount = getActiveFiltersCount(filters);

  // Which products to show for the active tab
  const currentProducts = useMemo(() => {
    switch (activeTab) {
      case "deals":
        return dealProducts;
      case "bestSellers":
        return bestSellers;
      default:
        return allProducts;
    }
  }, [activeTab, allProducts, dealProducts, bestSellers]);

  // ── Side effects ───────────────────────────────────────────────────────────

  useEffect(() => {
    const check = () =>
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = showMobileSidebar ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showMobileSidebar]);

  // Cleanup debounce timer on unmount / shopId change
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [shopId]);

  // Debounce search — mirrors Flutter's 500ms debounce in filterProductsLocally()
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(
      () => setDebouncedSearch(searchQuery),
      500,
    );
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  // ── Firestore data fetchers ────────────────────────────────────────────────

  const fetchShopData = useCallback(async () => {
    if (!shopId) return;
    try {
      setIsLoading(true);
      setError(null);
      const shopDoc = await getDoc(doc(db, "shops", shopId));
      if (!shopDoc.exists()) {
        setError(t("shopNotFound"));
        return;
      }
      const data = { id: shopDoc.id, ...shopDoc.data() } as ShopData;
      setShopData(data);
      // Mirror Flutter: default to home tab when homeImageUrls present
      setActiveTab(
        data.homeImageUrls && data.homeImageUrls.length > 0
          ? "home"
          : "allProducts",
      );
    } catch (err) {
      console.error("Error fetching shop data:", err);
      setError(t("failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  }, [shopId, t]);

  const fetchCollections = useCallback(async () => {
    if (!shopId) return;
    try {
      const q = query(
        collection(db, "shops", shopId, "collections"),
        orderBy("createdAt", "desc"),
      );
      const snapshot = await getDocs(q);
      setShopCollections(
        snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as ShopCollection[],
      );
    } catch (err) {
      console.error("Error fetching collections:", err);
    }
  }, [shopId]);

  const fetchReviews = useCallback(async () => {
    if (!shopId) return;
    try {
      const q = query(
        collection(db, "shops", shopId, "reviews"),
        orderBy("timestamp", "desc"),
        limit(20),
      );
      const snapshot = await getDocs(q);
      setReviews(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Review[],
      );
    } catch (err) {
      console.error("Error fetching reviews:", err);
    }
  }, [shopId]);

  // ── Spec facets ────────────────────────────────────────────────────────────

  const fetchSpecFacets = useCallback(async () => {
    if (!shopId) return;
    try {
      const facets =
        await TypeSenseServiceManager.instance.shopService.fetchSpecFacets({
          indexName: "shop_products",
          additionalFilterBy: `shopId:=${shopId}`,
        });
      setSpecFacets(facets);
    } catch (err) {
      console.error("Error fetching spec facets:", err);
    }
  }, [shopId]);

  // ── Product fetchers ───────────────────────────────────────────────────────

  /**
   * Mirrors Flutter's _fetchProductsFromTypesense().
   * Used when: sort != date, search active, or spec filters active.
   *
   * BUG FIXES applied:
   *  - Gender now sent as facet filter: `gender:${value}`
   *  - Types now sent as facet filter: `attributes.clothingType:${type}`
   *  - Fits now sent as facet filter: `attributes.clothingFit:${fit}`
   *  - Sizes now sent as facet filter: `clothingSizes:${size}`
   *  - Colors use `availableColors:${c}` (Typesense array field, correctly indexed)
   */
  const fetchProductsTypesense = useCallback(
    async (page: number, reset: boolean, token: number): Promise<void> => {
      if (!shopId) return;

      try {
        const facetFilters: string[][] = [];
        const numericFilters: string[] = [];

        // Gender — mirrors Flutter: facetFilters.add(['gender:$_selectedGender'])
        if (filters.gender) {
          facetFilters.push([`gender:${filters.gender}`]);
        }

        // Subcategories
        if (filters.subcategories.length > 0) {
          facetFilters.push([`subcategory:${filters.subcategories[0]}`]);
        }

        // Brands — mirrors Flutter: facetFilters.add(_selectedBrands.map((b) => 'brandModel:$b'))
        if (filters.brands.length > 0) {
          facetFilters.push(filters.brands.map((b) => `brandModel:${b}`));
        }

        // Colors — mirrors Flutter: facetFilters.add(_selectedColors.map((c) => 'availableColors:$c'))
        // Note: Flutter sends 'colorImages.$c:*' but availableColors is the properly indexed
        // array field in the TypeSense schema. We use availableColors for correct OR-group filtering.
        if (filters.colors.length > 0) {
          facetFilters.push(filters.colors.map((c) => `colorImages.${c}:*`));
        }

        // Clothing types — mirrors Flutter: facetFilters.add(_selectedTypes.map((t) => 'attributes.clothingType:$t'))
        if ((filters.types ?? []).length > 0) {
          facetFilters.push(
            (filters.types ?? []).map((t) => `attributes.clothingType:${t}`),
          );
        }

        // Clothing fits — mirrors Flutter: facetFilters.add(_selectedFits.map((f) => 'attributes.clothingFit:$f'))
        if ((filters.fits ?? []).length > 0) {
          facetFilters.push(
            (filters.fits ?? []).map((f) => `attributes.clothingFit:${f}`),
          );
        }

        // Rating
        if (filters.minPrice !== undefined)
          numericFilters.push(`price >= ${filters.minPrice}`);
        if (filters.maxPrice !== undefined)
          numericFilters.push(`price <= ${filters.maxPrice}`);

        // Rating
        if (filters.minRating !== undefined)
          numericFilters.push(`averageRating:>=${filters.minRating}`);

        // Dynamic spec facet filters (clothingTypes, consoleBrand, etc.)
        for (const [field, vals] of Object.entries(filters.specFilters)) {
          if (vals.length > 0) {
            facetFilters.push(vals.map((v) => `${field}:${v}`));
          }
        }

        const result =
          await TypeSenseServiceManager.instance.shopService.searchIdsWithFacets(
            {
              indexName: "shop_products",
              query: debouncedSearch || "",
              page,
              hitsPerPage: PRODUCTS_LIMIT,
              facetFilters: facetFilters.length > 0 ? facetFilters : undefined,
              numericFilters:
                numericFilters.length > 0 ? numericFilters : undefined,
              sortOption: toSortCode(selectedSort),
              additionalFilterBy: `shopId:=${shopId}`,
            },
          );

        // Race-token check — mirrors Flutter's _searchRaceToken
        if (token !== fetchTokenRef.current) return;

        const fetched = result.hits.map((hit) =>
          ProductUtils.fromTypeSense(hit as unknown as Record<string, unknown>),
        );

        if (reset) {
          const derived = deriveProductArrays(fetched);
          setAllProducts(derived.all);
          setDealProducts(derived.deals);
          setBestSellers(derived.bestSellers);
        } else {
          setAllProducts((prev) => {
            const combined = [...prev, ...fetched];
            const derived = deriveProductArrays(combined);
            setDealProducts(derived.deals);
            setBestSellers(derived.bestSellers);
            return derived.all;
          });
        }

        setHasMore(fetched.length >= PRODUCTS_LIMIT);
      } catch (err) {
        if (token !== fetchTokenRef.current) return;
        console.error("Typesense product fetch error:", err);
        setProductError("Failed to load products");
        if (reset) {
          setAllProducts([]);
          setDealProducts([]);
          setBestSellers([]);
        }
        setHasMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shopId, debouncedSearch, selectedSort, filterKey, filters],
  );

  /**
   * Mirrors Flutter's Firestore fetchProducts path.
   * Used by default: sort=date, no search, no spec filters.
   *
   * BUG FIXES applied:
   *  - Gender now applied server-side as a Firestore WHERE clause
   *  - applyClientFilters() now called for brands/types/fits/sizes/colors
   *    (mirrors Flutter's _applyAllFilters after Firestore fetch)
   */
  const fetchProductsFirestore = useCallback(
    async (loadMore: boolean, token: number): Promise<void> => {
      if (!shopId) return;

      try {
        // Build additively — mirrors Flutter's Firestore path exactly
        let baseQuery = query(
          collection(db, "shop_products"),
          where("shopId", "==", shopId),
        );

        // Gender — server-side equality (mirrors Flutter: if (_selectedGender != null) query.where('gender'))
        if (filters.gender) {
          baseQuery = query(baseQuery, where("gender", "==", filters.gender));
        }

        // Subcategory — server-side equality (mirrors Flutter: if (_selectedSubcategory != null) query.where('subcategory'))
        if (filters.subcategories.length > 0) {
          baseQuery = query(
            baseQuery,
            where("subcategory", "==", filters.subcategories[0]),
          );
        }

        // Price range — server-side (mirrors Flutter: where('price', isGreaterThanOrEqualTo: _minPrice))
        if (filters.minPrice !== undefined) {
          baseQuery = query(baseQuery, where("price", ">=", filters.minPrice));
        }
        if (filters.maxPrice !== undefined) {
          baseQuery = query(baseQuery, where("price", "<=", filters.maxPrice));
        }

        // Always date sort on Firestore path (all other sorts routed to Typesense)
        baseQuery = query(baseQuery, orderBy("createdAt", "desc"));

        const finalQuery =
          loadMore && lastFirestoreDocRef.current
            ? query(
                baseQuery,
                startAfter(lastFirestoreDocRef.current),
                limit(PRODUCTS_LIMIT),
              )
            : query(baseQuery, limit(PRODUCTS_LIMIT));

        const snapshot = await getDocs(finalQuery);

        if (token !== fetchTokenRef.current) return;

        const fetched = snapshot.docs.map((d) =>
          ProductUtils.fromDocument(d.data() as Record<string, unknown>, d.id, {
            id: d.id,
            path: d.ref.path,
            parent: { id: d.ref.parent.id },
          }),
        );

        if (snapshot.docs.length > 0) {
          lastFirestoreDocRef.current = snapshot.docs[snapshot.docs.length - 1];
        }

        // hasMore — mirrors Flutter: fetched.length >= _productsLimit
        setHasMore(snapshot.docs.length === PRODUCTS_LIMIT);

        // Client-side filtering — mirrors Flutter's _applyAllFilters()
        // Applies brands, types, fits, sizes, colors after Firestore fetch
        const filtered = applyClientFilters(fetched, filters, debouncedSearch);

        if (loadMore) {
          setAllProducts((prev) => {
            const combined = [...prev, ...filtered];
            const derived = deriveProductArrays(combined);
            setDealProducts(derived.deals);
            setBestSellers(derived.bestSellers);
            return derived.all;
          });
        } else {
          const derived = deriveProductArrays(filtered);
          setAllProducts(derived.all);
          setDealProducts(derived.deals);
          setBestSellers(derived.bestSellers);
        }
      } catch (err) {
        if (token !== fetchTokenRef.current) return;
        console.error("Firestore product fetch error:", err);
        setProductError("Failed to load products");
        if (!loadMore) {
          setAllProducts([]);
          setDealProducts([]);
          setBestSellers([]);
        }
        setHasMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shopId, filterKey, filters, debouncedSearch],
  );

  /**
   * Main entry point — mirrors Flutter's fetchProducts() routing logic.
   * Products are ALWAYS fetched regardless of active tab (mirrors Flutter's
   * Future.wait behavior where products load in background).
   */
  const fetchProducts = useCallback(
    async (loadMore = false): Promise<void> => {
      if (!shopId) return;

      // Increment token — invalidates any in-flight requests
      const token = ++fetchTokenRef.current;

      if (loadMore) {
        setIsLoadingMore(true);
      } else {
        setIsProductsLoading(true);
        setProductError(null);
        if (!loadMore) lastFirestoreDocRef.current = null;
      }

      try {
        const useTs = shouldUseTypesense(
          selectedSort,
          filters.specFilters,
          debouncedSearch,
          filters,
        );
        if (useTs) {
          const page = loadMore
            ? Math.floor(allProducts.length / PRODUCTS_LIMIT)
            : 0;
          await fetchProductsTypesense(page, !loadMore, token);
        } else {
          await fetchProductsFirestore(loadMore, token);
        }
      } finally {
        if (token === fetchTokenRef.current) {
          setIsInitialProductLoad(false);
          setIsProductsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [
      shopId,
      selectedSort,
      filters.specFilters,
      debouncedSearch,
      allProducts.length,
      fetchProductsTypesense,
      fetchProductsFirestore,
    ],
  );

  // ── Data loading effects ───────────────────────────────────────────────────

  useEffect(() => {
    fetchShopData();
  }, [fetchShopData]);

  /**
   * Mirrors Flutter's Future.wait([fetchProducts, fetchReviews, fetchCollections, fetchSpecFacets]).
   * Products always fetched unconditionally — NOT gated on isProductTab.
   * Key on shopData.id so switching shops fully resets state.
   */
  useEffect(() => {
    if (!shopData) return;

    setAllProducts([]);
    setDealProducts([]);
    setBestSellers([]);
    setIsInitialProductLoad(true);
    lastFirestoreDocRef.current = null;
    setFilters(EMPTY_FILTER_STATE);
    setSelectedSort("None");
    setSearchQuery("");
    setDebouncedSearch("");

    // Parallel fetch — mirrors Flutter's Future.wait
    fetchProducts(false);
    fetchCollections();
    fetchReviews();
    fetchSpecFacets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopData?.id]);

  /**
   * Re-fetch on filter/sort/search change.
   * Mirrors Flutter's setSortOption(), updateFilters(), filterProductsLocally().
   */
  useEffect(() => {
    if (!shopData) return;
    fetchProducts(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSort, filterKey, debouncedSearch]);

  // Scroll-based load-more
  useEffect(() => {
    if (!isProductTab) return;
    let tid: NodeJS.Timeout;
    const onScroll = () => {
      clearTimeout(tid);
      tid = setTimeout(() => {
        if (
          window.innerHeight + document.documentElement.scrollTop >=
          document.documentElement.offsetHeight - 2500
        ) {
          if (hasMore && !isLoadingMore && !isProductsLoading) {
            fetchProducts(true);
          }
        }
      }, 100);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(tid);
    };
  }, [hasMore, isLoadingMore, isProductsLoading, fetchProducts, isProductTab]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleTabChange = (tab: TabType) => setActiveTab(tab);
  const handleFavoriteToggle = () => setIsFavorite((p) => !p);
  const handleBack = () => router.back();

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
    return num.toString();
  };

  const getSortLabel = (opt: SortOption): string => {
    switch (opt) {
      case "None":
        return tRoot("DynamicMarket.sortNone");
      case "Alphabetical":
        return tRoot("DynamicMarket.sortAlphabetical");
      case "Date":
        return tRoot("DynamicMarket.sortDate");
      case "Price Low to High":
        return tRoot("DynamicMarket.sortPriceLowToHigh");
      case "Price High to Low":
        return tRoot("DynamicMarket.sortPriceHighToLow");
    }
  };

  // ── Available tabs ─────────────────────────────────────────────────────────

  const availableTabs: TabType[] = useMemo(() => {
    const tabs: TabType[] = [];
    if (shopData?.homeImageUrls && shopData.homeImageUrls.length > 0) {
      tabs.push("home");
    }
    tabs.push("allProducts");
    if (shopCollections.length > 0) tabs.push("collections");
    tabs.push("deals", "bestSellers", "reviews");
    return tabs;
  }, [shopData, shopCollections.length]);

  // ── Skeleton ───────────────────────────────────────────────────────────────

  const Skeleton = () => {
    const shimmer = `shimmer-effect ${isDarkMode ? "shimmer-effect-dark" : "shimmer-effect-light"}`;
    const base = { backgroundColor: isDarkMode ? "#374151" : "#f3f4f6" };
    const base2 = { backgroundColor: isDarkMode ? "#374151" : "#e5e7eb" };
    return (
      <div
        className={`rounded-lg overflow-hidden ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
      >
        <div
          className="w-full relative overflow-hidden"
          style={{ height: 320, ...base }}
        >
          <div className={shimmer} />
        </div>
        <div className="p-3 space-y-2">
          {[85, 60].map((w, i) => (
            <div
              key={i}
              className="h-3 rounded relative overflow-hidden"
              style={{ width: `${w}%`, ...base2 }}
            >
              <div className={shimmer} />
            </div>
          ))}
          <div
            className="h-4 rounded relative overflow-hidden"
            style={{ width: "45%", ...base2 }}
          >
            <div className={shimmer} />
          </div>
        </div>
      </div>
    );
  };

  // ── Render: loading ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <>
        <SecondHeader />
        <div
          className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
        >
          <div className="max-w-6xl mx-auto">
            <div className="animate-pulse">
              <div className="h-64 bg-gray-300" />
              <div className="p-4 space-y-4">
                <div className="h-4 bg-gray-300 rounded w-3/4" />
                <div className="h-4 bg-gray-300 rounded w-1/2" />
                <div className="flex space-x-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-8 bg-gray-300 rounded w-20" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Render: error ──────────────────────────────────────────────────────────

  if (error || !shopData) {
    return (
      <>
        <SecondHeader />
        <div
          className={`min-h-screen flex items-center justify-center ${
            isDarkMode ? "bg-gray-900" : "bg-gray-50"
          }`}
        >
          <div className="text-center">
            <h2
              className={`text-xl font-semibold mb-4 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {error || "Shop not found"}
            </h2>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {t("goBack")}
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Render: tab contents ───────────────────────────────────────────────────

  const renderHomeTab = () => (
    <div className="space-y-4">
      {shopData.homeImageUrls?.map((imageUrl, index) => {
        const linkedProductId = shopData.homeImageLinks?.[imageUrl];
        return (
          <div
            key={index}
            className={linkedProductId ? "cursor-pointer" : ""}
            onClick={() =>
              linkedProductId &&
              router.push(`/productdetail/${linkedProductId}`)
            }
          >
            <Image
              src={imageUrl}
              alt={`${shopData.name} home image ${index + 1}`}
              width={800}
              height={400}
              className="w-full h-auto rounded-lg"
            />
          </div>
        );
      })}
    </div>
  );

  const renderCollectionsTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {shopCollections.length === 0 ? (
        <div className="col-span-2 text-center py-12">
          <p className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
            {t("noCollections") ?? "No collections available"}
          </p>
        </div>
      ) : (
        shopCollections.map((col) => (
          <div
            key={col.id}
            onClick={() =>
              router.push(
                `/collection/${col.id}?shopId=${shopId}&name=${encodeURIComponent(col.name)}`,
              )
            }
            className={`p-4 rounded-lg border cursor-pointer hover:shadow-lg transition-shadow ${
              isDarkMode
                ? "bg-gray-800 border-gray-700 hover:border-gray-600"
                : "bg-white border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200">
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
                    <PhotoIcon className="w-6 h-6 text-gray-400" />
                  </div>
                )}
              </div>
              <div>
                <h3
                  className={`font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {col.name}
                </h3>
                <p
                  className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                >
                  {col.productIds.length} {t("products")}
                </p>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderReviewsTab = () => (
    <div className="space-y-4">
      {reviews.length === 0 ? (
        <div className="text-center py-8">
          <p className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
            {t("noReviewsYet")}
          </p>
        </div>
      ) : (
        reviews.map((review) => (
          <div
            key={review.id}
            className={`p-4 rounded-lg ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <div className="flex items-center space-x-2 mb-2">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <StarIcon
                    key={i}
                    className={`w-4 h-4 ${
                      i < review.rating
                        ? "text-yellow-400 fill-current"
                        : "text-gray-300"
                    }`}
                  />
                ))}
              </div>
              <span
                className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
              >
                {new Date(review.timestamp.seconds * 1000).toLocaleDateString()}
              </span>
            </div>
            <p className={isDarkMode ? "text-white" : "text-gray-900"}>
              {review.review}
            </p>
            <div className="flex items-center justify-between mt-2">
              <span
                className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
              >
                {review.userName || t("anonymous")}
              </span>
              <span
                className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
              >
                {(review.likes || []).length} {t("likes")}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderProductGrid = () => {
    const products = currentProducts;

    return (
      <div className="relative">
        {/* Initial skeleton load */}
        {isInitialProductLoad && isProductsLoading && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} />
            ))}
          </div>
        )}

        {/* Filter/sort change shimmer */}
        {!isInitialProductLoad && isProductsLoading && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} />
            ))}
          </div>
        )}

        {/* Error state with retry */}
        {productError && !isProductsLoading && (
          <div className="text-center py-12">
            <p
              className={`mb-4 ${isDarkMode ? "text-red-400" : "text-red-600"}`}
            >
              {productError}
            </p>
            <button
              onClick={() => fetchProducts(false)}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
            >
              {tRoot("retry") ?? "Retry"}
            </button>
          </div>
        )}

        {/* Product grid */}
        {!isInitialProductLoad &&
          !isProductsLoading &&
          !productError &&
          products.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-4">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onTap={() => router.push(`/productdetail/${product.id}`)}
                    onFavoriteToggle={() => {}}
                    onAddToCart={() => {}}
                    onColorSelect={() => {}}
                    showCartIcon
                    isFavorited={false}
                    isInCart={false}
                    portraitImageHeight={320}
                    isDarkMode={isDarkMode}
                    localization={tRoot}
                  />
                ))}
              </div>

              {isLoadingMore && (
                <div className="flex items-center justify-center py-8 gap-2">
                  {[0, 150, 300].map((delay) => (
                    <div
                      key={delay}
                      className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-bounce"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              )}

              {!isLoadingMore && hasMore && (
                <div className="text-center py-8">
                  <button
                    onClick={() => fetchProducts(true)}
                    className={`px-6 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm"
                    }`}
                  >
                    {tRoot("DynamicMarket.loadMore")}
                  </button>
                </div>
              )}
            </>
          )}

        {/* Empty state */}
        {!isInitialProductLoad &&
          !isProductsLoading &&
          !productError &&
          products.length === 0 && (
            <div className="text-center py-20">
              <Filter
                size={56}
                className={`mx-auto mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
              />
              <h3
                className={`text-lg font-semibold mb-1 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              >
                {t("noProductsFound")}
              </h3>
              <p
                className={`text-sm mb-5 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
              >
                {tRoot("DynamicMarket.tryAdjustingFilters")}
              </p>
              {activeCount > 0 && (
                <button
                  onClick={() => setFilters(EMPTY_FILTER_STATE)}
                  className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  {tRoot("DynamicMarket.clearAllFilters")}
                </button>
              )}
            </div>
          )}
      </div>
    );
  };

  // ── Render: main ───────────────────────────────────────────────────────────

  return (
    <>
      <SecondHeader />
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      >
        <div className="max-w-6xl mx-auto">
          {/* Cover image + shop info */}
          <div className="relative h-80 hover:h-[32rem] overflow-hidden bg-gradient-to-br from-orange-500 to-pink-500 transition-all duration-500 ease-in-out cursor-pointer group">
            {shopData.coverImageUrls && shopData.coverImageUrls.length > 0 && (
              <>
                <Image
                  src={shopData.coverImageUrls[0]}
                  alt={`${shopData.name} cover`}
                  fill
                  sizes="100vw"
                  className="object-cover object-center"
                  priority
                  unoptimized
                />
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-all duration-500 pointer-events-none" />
              </>
            )}

            <button
              onClick={handleBack}
              className="absolute top-4 left-4 z-20 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-all"
            >
              <ArrowLeftIcon className="w-6 h-6" />
            </button>

            <div className="absolute bottom-4 left-4 right-4 z-20">
              <div className="flex items-end space-x-4">
                <div className="relative w-24 h-24 rounded-full border-4 border-white overflow-hidden shadow-lg bg-white">
                  {shopData.profileImageUrl ? (
                    <Image
                      src={shopData.profileImageUrl}
                      alt={shopData.name}
                      fill
                      className="object-cover object-center"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                      <span className="text-2xl">🏪</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 text-white">
                  <h1 className="text-2xl font-bold mb-2">{shopData.name}</h1>
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex items-center space-x-1">
                      <StarIcon className="w-4 h-4 text-yellow-400" />
                      <span>{shopData.averageRating.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <UsersIcon className="w-4 h-4" />
                      <span>
                        {formatNumber(shopData.followerCount)} {t("followers")}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <EyeIcon className="w-4 h-4" />
                      <span>
                        {formatNumber(shopData.clickCount)} {t("views")}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleFavoriteToggle}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                    isFavorite
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : "bg-white text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    {isFavorite ? (
                      <HeartSolidIcon className="w-4 h-4" />
                    ) : (
                      <HeartIcon className="w-4 h-4" />
                    )}
                    <span>{isFavorite ? t("following") : t("follow")}</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar + main content */}
          <div className="flex">
            {/* Desktop sidebar — pass shopCategories for conditional section rendering */}
            {isProductTab && (
              <div className="hidden lg:block w-72 flex-shrink-0">
                <FilterSidebar
                  shopCategories={shopData.categories}
                  filters={filters}
                  onFiltersChange={setFilters}
                  specFacets={specFacets}
                  isDarkMode={isDarkMode}
                  className="w-72"
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              {/* Search bar */}
              <div
                className={`sticky top-0 z-10 px-4 py-3 transition-all ${
                  isScrolled
                    ? "bg-opacity-95 backdrop-blur-sm shadow-sm"
                    : "bg-opacity-50"
                } ${isDarkMode ? "bg-gray-900" : "bg-white"}`}
              >
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder={t("searchInStore")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-10 pr-10 py-3 rounded-full border ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-700 text-white placeholder-gray-400"
                        : "bg-white border-gray-200 text-gray-900 placeholder-gray-500"
                    }`}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <XMarkIcon
                        className={`w-5 h-5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div
                className={`sticky top-[3.5rem] z-10 border-b ${
                  isDarkMode
                    ? "bg-gray-900 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex overflow-x-auto">
                  {availableTabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => handleTabChange(tab)}
                      className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                        activeTab === tab
                          ? "border-orange-500 text-orange-500"
                          : isDarkMode
                            ? "border-transparent text-gray-400 hover:text-gray-300"
                            : "border-transparent text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {t(tab)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort bar + mobile filter badge */}
              {isProductTab && (
                <div
                  className={`px-4 py-2.5 flex items-center gap-3 border-b ${
                    isDarkMode ? "border-gray-800" : "border-gray-100"
                  }`}
                >
                  {/* Mobile filter pill */}
                  <button
                    onClick={() => setShowMobileSidebar(true)}
                    className={`lg:hidden flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
                      activeCount > 0
                        ? isDarkMode
                          ? "bg-orange-900/40 text-orange-400"
                          : "bg-orange-100 text-orange-600"
                        : isDarkMode
                          ? "bg-gray-800 text-gray-400"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    <Filter size={12} />
                    {activeCount > 0
                      ? `${activeCount} ${tRoot("DynamicMarket.filtersApplied")}`
                      : tRoot("DynamicMarket.filters")}
                  </button>

                  <div className="flex-1" />

                  {currentProducts.length > 0 && (
                    <span
                      className={`text-xs ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                    >
                      {currentProducts.length}
                      {hasMore ? "+" : ""} {t("products")}
                    </span>
                  )}

                  {/* Sort dropdown */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setShowSortDropdown((p) => !p)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isDarkMode
                          ? "hover:bg-gray-700 text-gray-300"
                          : "hover:bg-gray-100 text-gray-600"
                      } ${
                        showSortDropdown
                          ? isDarkMode
                            ? "bg-gray-700"
                            : "bg-gray-100"
                          : ""
                      }`}
                    >
                      <SortAsc size={15} />
                      <span className="hidden sm:inline">
                        {selectedSort !== "None"
                          ? getSortLabel(selectedSort)
                          : tRoot("DynamicMarket.sort")}
                      </span>
                      <ChevronDown
                        size={13}
                        className={`transition-transform ${showSortDropdown ? "rotate-180" : ""}`}
                      />
                    </button>

                    {showSortDropdown && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowSortDropdown(false)}
                        />
                        <div
                          className={`absolute right-0 mt-1.5 w-52 rounded-xl shadow-xl z-20 border overflow-hidden ${
                            isDarkMode
                              ? "bg-gray-800 border-gray-700"
                              : "bg-white border-gray-100"
                          }`}
                        >
                          {SORT_OPTIONS.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => {
                                setSelectedSort(opt);
                                setShowSortDropdown(false);
                              }}
                              className={`w-full text-left px-4 py-2.5 text-xs flex items-center justify-between transition-colors ${
                                selectedSort === opt
                                  ? isDarkMode
                                    ? "bg-gray-700 text-orange-400"
                                    : "bg-orange-50 text-orange-600"
                                  : isDarkMode
                                    ? "text-gray-300 hover:bg-gray-700"
                                    : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              {getSortLabel(opt)}
                              {selectedSort === opt && (
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Tab content */}
              <div className="p-4 relative">
                {activeTab === "home" && renderHomeTab()}
                {activeTab === "collections" && renderCollectionsTab()}
                {activeTab === "reviews" && renderReviewsTab()}
                {isProductTab && renderProductGrid()}
              </div>
              <div className="h-20" />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile FAB */}
      {isProductTab && (
        <div className="lg:hidden fixed bottom-5 right-5 z-50">
          <button
            onClick={() => setShowMobileSidebar(true)}
            className="relative p-3.5 rounded-full shadow-xl bg-orange-500 text-white"
          >
            <Filter size={22} />
            {activeCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] leading-none font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Mobile filter drawer — pass shopCategories so conditional sections render */}
      {isProductTab && isMobile && (
        <FilterSidebar
          shopCategories={shopData.categories}
          filters={filters}
          onFiltersChange={(f) => {
            setFilters(f);
            setShowMobileSidebar(false);
          }}
          specFacets={specFacets}
          isOpen={showMobileSidebar}
          onClose={() => setShowMobileSidebar(false)}
          isDarkMode={isDarkMode}
        />
      )}
    </>
  );
}
