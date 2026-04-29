// context/FavoritesProvider.tsx - REFACTORED v4.0 (Full Flutter Parity)
// Mirrors lib/providers/favorite_product_provider.dart exactly.
//
// Parity changes vs v3.0:
//   1. `sourceCollection` + `shopId` are now persisted ON the favorite doc
//      itself, mirroring Flutter. Reads (hydration, add-to-cart, remove)
//      use the stored value to do a single targeted Firestore read instead
//      of a parallel dual-collection fetch.
//   2. Legacy favorites missing these fields are self-healed (backfilled)
//      on read — same pattern as Flutter.
//   3. Add/remove now commit the favorite doc + user doc array update in
//      a single atomic WriteBatch.
//   4. Per the agreed convergence: single-item remove also runs the
//      `existsElsewhere` smart check before touching `favoriteItemIds`,
//      preventing the heart icon from incorrectly toggling off when a
//      product is removed from one basket but still in another.
//   5. `getProductMetadata` now accepts an optional `sourceCollection`
//      hint so it can do a targeted single read.

"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
  useCallback,
  useMemo,
} from "react";
import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
  query,
  where,
  limit as firestoreLimit,
  getDocs,
  getDocsFromServer,
  getDoc,
  Timestamp,
  DocumentSnapshot,
  addDoc,
  deleteDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  FieldValue,
  orderBy,
  startAfter as firestoreStartAfter,
  Firestore,
} from "firebase/firestore";
import { useUser } from "./UserProvider";
import { trackReads } from "@/lib/firestore-read-tracker";

import metricsEventService from "@/services/cartfavoritesmetricsEventService";
import { userActivityService } from "@/services/userActivity";
import LimitReachedModal from "@/app/components/LimitReachedModal";

const MAX_FAVORITE_ITEMS = 500;

// ============================================================================
// TYPES
// ============================================================================

interface FavoriteBasket {
  id: string;
  name: string;
  createdAt: Timestamp | FieldValue;
}

interface FavoriteAttributes {
  quantity?: number;
  selectedColor?: string;
  selectedColorImage?: string;
  // Persisted on the favorite doc for single-collection lookups.
  sourceCollection?: "products" | "shop_products";
  shopId?: string;
  [key: string]: unknown;
}

interface ProductData {
  id: string;
  shopId?: string;
  ownerId?: string;
  productName?: string;
  brandModel?: string;
  price?: number;
  currency?: string;
  imageUrls?: string[];
  colorImages?: Record<string, string[]>;
  averageRating?: number;
  originalPrice?: number;
  discountPercentage?: number;
  attributes?: Record<string, unknown>;
  favoritesCount?: number;
}

interface PaginatedFavorite {
  product: ProductData;
  attributes: FavoriteAttributes;
  productId: string;
}

// ============================================================================
// SPLIT CONTEXT TYPES - For granular subscriptions
// ============================================================================

interface FavoritesStateContextType {
  favoriteIds: Set<string>;
  favoriteCount: number;
  paginatedFavorites: PaginatedFavorite[];
  isLoading: boolean;
  selectedBasketId: string | null;
  hasMoreData: boolean;
  isLoadingMore: boolean;
  isInitialLoadComplete: boolean;
  favoriteBaskets: FavoriteBasket[];
}

interface FavoritesActionsContextType {
  addToFavorites: (
    productId: string,
    attributes?: FavoriteAttributes
  ) => Promise<string>;
  removeMultipleFromFavorites: (productIds: string[]) => Promise<string>;
  removeGloballyFromFavorites: (productId: string) => Promise<string>;

  createFavoriteBasket: (name: string) => Promise<string>;
  deleteFavoriteBasket: (basketId: string) => Promise<string>;
  setSelectedBasket: (basketId: string | null) => void;
  transferToBasket: (
    productId: string,
    targetBasketId: string | null
  ) => Promise<string>;

  loadNextPage: (limit?: number) => Promise<{
    docs: DocumentSnapshot[];
    hasMore: boolean;
    productIds?: Set<string>;
    error?: string | null;
  }>;
  loadFreshPage: (limit?: number) => Promise<void>;
  resetPagination: () => void;
  shouldReloadFavorites: (basketId: string | null) => boolean;

  fetchBaskets: () => Promise<void>;

  isFavorite: (productId: string) => boolean;
  isGloballyFavorited: (productId: string) => boolean;
  isFavoritedInBasket: (productId: string) => Promise<boolean>;
  getBasketNameForProduct: (productId: string) => Promise<string | null>;
}

interface FavoritesContextType
  extends FavoritesStateContextType,
    FavoritesActionsContextType {}

const FavoritesStateContext = createContext<
  FavoritesStateContextType | undefined
>(undefined);
const FavoritesActionsContext = createContext<
  FavoritesActionsContextType | undefined
>(undefined);
const FavoritesContext = createContext<FavoritesContextType | undefined>(
  undefined
);

export const useFavoritesState = (): FavoritesStateContextType => {
  const context = useContext(FavoritesStateContext);
  if (!context) {
    throw new Error("useFavoritesState must be used within FavoritesProvider");
  }
  return context;
};

export const useFavoritesActions = (): FavoritesActionsContextType => {
  const context = useContext(FavoritesActionsContext);
  if (!context) {
    throw new Error(
      "useFavoritesActions must be used within FavoritesProvider"
    );
  }
  return context;
};

export const useFavorites = (): FavoritesContextType => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return context;
};

// ============================================================================
// RATE LIMITER
// ============================================================================

class RateLimiter {
  private lastOperations: Map<string, number> = new Map();
  private cooldown: number;

  constructor(cooldownMs: number) {
    this.cooldown = cooldownMs;
  }

  canProceed(operationKey: string): boolean {
    const lastTime = this.lastOperations.get(operationKey);
    const now = Date.now();

    if (!lastTime) {
      this.lastOperations.set(operationKey, now);
      return true;
    }

    const elapsed = now - lastTime;
    if (elapsed >= this.cooldown) {
      this.lastOperations.set(operationKey, now);
      return true;
    }
    return false;
  }
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private readonly threshold = 5;
  private readonly resetDuration = 60000; // 1 minute

  get isOpen(): boolean {
    if (this.failureCount >= this.threshold) {
      if (
        this.lastFailureTime &&
        Date.now() - this.lastFailureTime > this.resetDuration
      ) {
        this.failureCount = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
  }

  recordSuccess(): void {
    this.failureCount = 0;
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const FIRESTORE_IN_LIMIT = 10;
const MAX_BASKETS = 10;
const MAX_PAGINATED_CACHE = 200;

// ============================================================================
// FAVORITES PROVIDER
// ============================================================================

interface FavoritesProviderProps {
  children: ReactNode;
  db: Firestore | null;
}

export const FavoritesProvider: React.FC<FavoritesProviderProps> = ({
  children,
  db: dbProp,
}) => {
  const { user, getProfileField, updateLocalProfileField, profileData } =
    useUser();

  const dbRef = useRef<Firestore | null>(dbProp);
  dbRef.current = dbProp;

  const addFavoriteLimiter = useRef(new RateLimiter(300));
  const removeFavoriteLimiter = useRef(new RateLimiter(200));

  const circuitBreaker = useRef(new CircuitBreaker());

  // Reactive state
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [paginatedFavorites, setPaginatedFavorites] = useState<
    PaginatedFavorite[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBasketId, setSelectedBasketIdState] = useState<string | null>(
    null
  );
  const [hasMoreData, setHasMoreData] = useState(true);
  const hasMoreDataRef = useRef(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  const [favoriteBaskets, setFavoriteBaskets] = useState<FavoriteBasket[]>([]);
  const [showFavoritesLimitModal, setShowFavoritesLimitModal] = useState(false);

  const lastDocument = useRef<DocumentSnapshot | null>(null);
  const paginatedFavoritesMap = useRef<Map<string, PaginatedFavorite>>(
    new Map()
  );
  const currentBasketId = useRef<string | null>(null);
  const selectedBasketIdRef = useRef<string | null>(null);

  interface BasketCache {
    favorites: PaginatedFavorite[];
    lastDoc: DocumentSnapshot | null;
    hasMore: boolean;
    timestamp: number;
  }
  const basketCacheMap = useRef<Map<string, BasketCache>>(new Map());
  const BASKET_CACHE_TTL = 5 * 60 * 1000;

  const removeFavoriteTimer = useRef<NodeJS.Timeout | null>(null);
  const cleanupTimer = useRef<NodeJS.Timeout | null>(null);

  const favoriteLocks = useRef<Map<string, Promise<string>>>(new Map());
  const pendingFetches = useRef<Map<string, Promise<void>>>(new Map());
  const deferredFavInitRef = useRef<
    number | ReturnType<typeof setTimeout> | null
  >(null);
  const isLoadingMoreRef = useRef(false);
  const paginationGenRef = useRef(0);

  // ========================================================================
  // UTILITY FUNCTIONS
  // ========================================================================

  // System fields are managed by the provider — callers cannot override them.
  // Mirrors Flutter's check in addToFavorites' additionalAttributes loop.
  const isSystemField = useCallback((key: string): boolean => {
    return [
      "addedAt",
      "productId",
      "quantity",
      "selectedColor",
      "selectedColorImage",
      "sourceCollection",
      "shopId",
    ].includes(key);
  }, []);

  /// Fetches product metadata for tracking/metrics.
  ///
  /// When `sourceCollection` is known (from a stored favorite doc), a single
  /// targeted read is issued. Otherwise we fall back to a parallel dual-fetch —
  /// needed only for first-time adds or legacy favorites without the field.
  const getProductMetadata = useCallback(
    async (
      productId: string,
      sourceCollection?: "products" | "shop_products"
    ): Promise<{
      sourceCollection?: "products" | "shop_products";
      shopId?: string;
      productName?: string;
      category?: string;
      subcategory?: string;
      subsubcategory?: string;
      brand?: string;
      gender?: string;
    }> => {
      try {
        let data: Record<string, unknown> | undefined;
        let resolvedCollection: "products" | "shop_products" | undefined;

        if (
          sourceCollection === "products" ||
          sourceCollection === "shop_products"
        ) {
          const snap = await getDoc(
            doc(dbRef.current!, sourceCollection, productId)
          );
          if (snap.exists()) {
            data = snap.data();
            resolvedCollection = sourceCollection;
          }
        } else {
          const [productsSnap, shopProductsSnap] = await Promise.all([
            getDoc(doc(dbRef.current!, "products", productId)),
            getDoc(doc(dbRef.current!, "shop_products", productId)),
          ]);

          if (productsSnap.exists()) {
            data = productsSnap.data();
            resolvedCollection = "products";
          } else if (shopProductsSnap.exists()) {
            data = shopProductsSnap.data();
            resolvedCollection = "shop_products";
          }
        }

        if (!data) return {};

        return {
          sourceCollection: resolvedCollection,
          shopId: data.shopId as string | undefined,
          productName: data.productName as string | undefined,
          category: data.category as string | undefined,
          subcategory: data.subcategory as string | undefined,
          subsubcategory: data.subsubcategory as string | undefined,
          brand: data.brandModel as string | undefined,
          gender: data.gender as string | undefined,
        };
      } catch (error) {
        console.warn("⚠️ Failed to get product metadata:", error);
        return {};
      }
    },
    []
  );

  /// Hydrates favorite docs to full product data using bucketed fetches.
  ///
  /// Favorites with a stored `sourceCollection` go to a single targeted query.
  /// Legacy favorites without the field fall back to a parallel dual-fetch and
  /// are self-healed (backfilled) so the next read is single-collection.
  const fetchProductDetailsForIds = useCallback(
    async (
      productIds: string[],
      favoriteDocs: DocumentSnapshot[]
    ): Promise<PaginatedFavorite[]> => {
      if (productIds.length === 0) return [];

      const results: PaginatedFavorite[] = [];
      const favoriteDetailsByProductId: Record<string, FavoriteAttributes> =
        {};
      const favoriteRefByProductId: Record<
        string,
        DocumentSnapshot["ref"]
      > = {};

      // Bucket product IDs by the sourceCollection persisted on the favorite doc.
      const productsBucket: string[] = [];
      const shopProductsBucket: string[] = [];
      const unknownBucket: string[] = [];

      favoriteDocs.forEach((d) => {
        const data = d.data();
        if (!data || !data.productId) return;
        const productId = data.productId as string;

        const attrs = { ...data } as FavoriteAttributes;
        delete (attrs as Record<string, unknown>).productId;
        delete (attrs as Record<string, unknown>).addedAt;
        favoriteDetailsByProductId[productId] = attrs;
        favoriteRefByProductId[productId] = d.ref;

        const src = data.sourceCollection as string | undefined;
        if (src === "products") {
          productsBucket.push(productId);
        } else if (src === "shop_products") {
          shopProductsBucket.push(productId);
        } else {
          unknownBucket.push(productId);
        }
      });

      const chunks = function* (ids: string[]) {
        for (let i = 0; i < ids.length; i += FIRESTORE_IN_LIMIT) {
          yield ids.slice(i, i + FIRESTORE_IN_LIMIT);
        }
      };

      const addResultsFromSnapshot = (
        snap: Awaited<ReturnType<typeof getDocs>>
      ) => {
        snap.docs.forEach((doc) => {
          try {
            const product: ProductData = {
              id: doc.id,
              ...(doc.data() as Record<string, unknown>),
            };
            const attributes = favoriteDetailsByProductId[doc.id] || {};
            results.push({
              product,
              attributes,
              productId: doc.id,
            });
          } catch (error) {
            console.error("Error parsing product", doc.id, error);
          }
        });
      };

      // Targeted single-collection queries for known buckets
      const futures: Promise<Awaited<ReturnType<typeof getDocs>>>[] = [];
      for (const chunk of chunks(productsBucket)) {
        futures.push(
          getDocs(
            query(
              collection(dbRef.current!, "products"),
              where("__name__", "in", chunk)
            )
          )
        );
      }
      for (const chunk of chunks(shopProductsBucket)) {
        futures.push(
          getDocs(
            query(
              collection(dbRef.current!, "shop_products"),
              where("__name__", "in", chunk)
            )
          )
        );
      }
      if (futures.length > 0) {
        try {
          const snapshots = await Promise.all(futures);
          let totalReads = 0;
          for (const snap of snapshots) {
            totalReads += snap.docs.length;
            addResultsFromSnapshot(snap);
          }
          trackReads(
            `Favorites:hydrate (targeted: products=${productsBucket.length}, shop_products=${shopProductsBucket.length})`,
            totalReads
          );
        } catch (error) {
          console.error("Error fetching targeted product chunks:", error);
        }
      }

      // Legacy fallback + self-heal: dual-fetch for favorites without sourceCollection.
      if (unknownBucket.length > 0) {
        for (const chunk of chunks(unknownBucket)) {
          try {
            const [productsSnap, shopProductsSnap] = await Promise.all([
              getDocs(
                query(
                  collection(dbRef.current!, "products"),
                  where("__name__", "in", chunk)
                )
              ),
              getDocs(
                query(
                  collection(dbRef.current!, "shop_products"),
                  where("__name__", "in", chunk)
                )
              ),
            ]);

            trackReads(
              `Favorites:hydrate legacy (${chunk.length})`,
              productsSnap.docs.length + shopProductsSnap.docs.length
            );

            for (const snap of [productsSnap, shopProductsSnap]) {
              for (const productDoc of snap.docs) {
                // Self-heal: backfill sourceCollection (+ shopId) so the
                // next read is single-collection.
                const favRef = favoriteRefByProductId[productDoc.id];
                if (favRef) {
                  const resolvedCollection = productDoc.ref.parent.id as
                    | "products"
                    | "shop_products";
                  const shopId = (productDoc.data() as Record<string, unknown>)
                    .shopId as string | undefined;

                  const update: Record<string, unknown> = {
                    sourceCollection: resolvedCollection,
                  };
                  if (shopId) update.shopId = shopId;

                  updateDoc(favRef, update).catch((e) =>
                    console.warn(
                      "⚠️ Favorite backfill failed (non-critical):",
                      e
                    )
                  );
                }
              }
              addResultsFromSnapshot(snap);
            }
          } catch (error) {
            console.error("Error fetching legacy product chunk:", error);
          }
        }
      }

      return results;
    },
    []
  );

  const addPaginatedItems = useCallback(
    (items: PaginatedFavorite[]) => {
      items.forEach((item) => {
        const productId = item.productId;
        if (!paginatedFavoritesMap.current.has(productId)) {
          if (paginatedFavoritesMap.current.size >= MAX_PAGINATED_CACHE) {
            const firstKey = Array.from(
              paginatedFavoritesMap.current.keys()
            )[0];
            paginatedFavoritesMap.current.delete(firstKey);
          }
          paginatedFavoritesMap.current.set(productId, item);
        }
      });

      setPaginatedFavorites(Array.from(paginatedFavoritesMap.current.values()));

      if (paginatedFavoritesMap.current.size > 0 && !isInitialLoadComplete) {
        setIsInitialLoadComplete(true);
      }
    },
    [isInitialLoadComplete]
  );

  const showSuccessToast = useCallback((message: string) => {
    console.log("✅", message);
    // TODO: Implement toast notification
  }, []);

  const showErrorToast = useCallback((message: string) => {
    console.error("❌", message);
    // TODO: Implement toast notification
  }, []);

  const showDebouncedRemoveToast = useCallback(() => {
    if (removeFavoriteTimer.current) {
      clearTimeout(removeFavoriteTimer.current);
    }
    removeFavoriteTimer.current = setTimeout(() => {
      showSuccessToast("Removed from favorites");
    }, 500);
  }, [showSuccessToast]);

  // ========================================================================
  // INITIALIZATION
  // ========================================================================

  const initializeIfNeeded = useCallback(async () => {
    if (!user) return;

    if (pendingFetches.current.has("init")) {
      console.log("⏳ Already initializing, waiting...");
      await pendingFetches.current.get("init");
      return;
    }

    const promise = (async () => {
      try {
        setIsInitialLoadComplete(true);
      } catch (error) {
        console.error("❌ Init error:", error);
      }
    })();

    pendingFetches.current.set("init", promise);
    await promise;
    pendingFetches.current.delete("init");
  }, [user]);

  // ========================================================================
  // EXISTS-ELSEWHERE CHECK
  //
  // Mirrors Flutter's smart-check pattern (used in deleteFavoriteBasket and
  // now in single-item remove too). Returns true if `productId` still lives
  // in default favorites or any basket OTHER than `excludeBasketId`. Used to
  // decide whether to remove the id from the user doc's `favoriteItemIds`
  // array — that array is the GLOBAL set across all containers, so we only
  // strip it when the product is gone from every container.
  // ========================================================================

  const existsElsewhere = useCallback(
    async (
      productId: string,
      excludeBasketId: string | null
    ): Promise<boolean> => {
      if (!user) return false;

      // Always check default favorites unless that's where we're removing from
      if (excludeBasketId !== null) {
        const defaultSnap = await getDocs(
          query(
            collection(dbRef.current!, `users/${user.uid}/favorites`),
            where("productId", "==", productId),
            firestoreLimit(1)
          )
        );
        if (!defaultSnap.empty) return true;
      }

      // Check all baskets except the excluded one
      const basketsSnap = await getDocs(
        collection(dbRef.current!, `users/${user.uid}/favorite_baskets`)
      );

      for (const bDoc of basketsSnap.docs) {
        if (bDoc.id === excludeBasketId) continue;
        const favSnap = await getDocs(
          query(
            collection(bDoc.ref, "favorites"),
            where("productId", "==", productId),
            firestoreLimit(1)
          )
        );
        if (!favSnap.empty) return true;
      }

      return false;
    },
    [user]
  );

  // ========================================================================
  // ADD/REMOVE FAVORITES
  // ========================================================================

  const addToFavorites = useCallback(
    async (
      productId: string,
      attributes: FavoriteAttributes = {}
    ): Promise<string> => {
      if (!user) return "Please log in";

      if (!isInitialLoadComplete) {
        if (deferredFavInitRef.current !== null) {
          if (typeof cancelIdleCallback !== "undefined") {
            cancelIdleCallback(deferredFavInitRef.current as number);
          } else {
            clearTimeout(
              deferredFavInitRef.current as ReturnType<typeof setTimeout>
            );
          }
          deferredFavInitRef.current = null;
        }
        await initializeIfNeeded();
      }

      // Rate limiting
      if (!addFavoriteLimiter.current.canProceed(`add_${productId}`)) {
        console.log("⏱️ Rate limit: Please wait before adding again");
        return "Please wait";
      }

      // Concurrency control
      if (favoriteLocks.current.has(productId)) {
        console.log("⏳ Operation already in progress for", productId);
        await favoriteLocks.current.get(productId);
        return "Operation in progress";
      }

      // Circuit breaker
      if (circuitBreaker.current.isOpen) {
        console.log("⚠️ Circuit breaker open - rejecting operation");
        showErrorToast("Service temporarily unavailable");
        return "Service temporarily unavailable";
      }

      const lockPromise = (async () => {
        const basketId = selectedBasketIdRef.current;
        const collectionPath = basketId
          ? `users/${user.uid}/favorite_baskets/${basketId}/favorites`
          : `users/${user.uid}/favorites`;

        const wasFavorited = favoriteIds.has(productId);
        let isRemoving = false;

        try {
          // Check if already exists in this container
          const existingSnap = await getDocs(
            query(
              collection(dbRef.current!, collectionPath),
              where("productId", "==", productId),
              firestoreLimit(1)
            )
          );
          isRemoving = existingSnap.docs.length > 0;

          if (isRemoving) {
            const existingDoc = existingSnap.docs[0];
            const existingData = existingDoc.data();
            const storedCollection = existingData.sourceCollection as
              | "products"
              | "shop_products"
              | undefined;
            const storedShopId = existingData.shopId as string | undefined;
            const productName = existingData.productName as string | undefined;
          
            // Smart check: only strip from user doc array if the product is
            // gone from every container.
            const stillElsewhere = await existsElsewhere(productId, basketId);
          
            // OPTIMISTIC UI: remove from current view BEFORE the batch commits.
            // Snapshot the prior cache entry so we can roll back if the batch fails.
            const previousCacheEntry = paginatedFavoritesMap.current.get(productId);
            paginatedFavoritesMap.current.delete(productId);
            setPaginatedFavorites(
              Array.from(paginatedFavoritesMap.current.values())
            );
          
            // Optimistic local state sync (also before the batch — matches Flutter)
            let prevFavoriteIdsForRollback: Set<string> | null = null;
            if (!stillElsewhere) {
              prevFavoriteIdsForRollback = new Set(favoriteIds);
              const newIds = new Set(favoriteIds);
              newIds.delete(productId);
              setFavoriteIds(newIds);
              setFavoriteCount(newIds.size);
              updateLocalProfileField("favoriteItemIds", [...newIds]);
            }
          
            try {
              // Atomic batch: delete the favorite doc + (conditionally) update
              // the user doc array in a single commit.
              const removeBatch = writeBatch(dbRef.current!);
              removeBatch.delete(existingDoc.ref);
              if (!stillElsewhere) {
                removeBatch.update(doc(dbRef.current!, "users", user.uid), {
                  favoriteItemIds: arrayRemove(productId),
                });
              }
              await removeBatch.commit();
            } catch (commitError) {
              // Roll back the optimistic UI changes
              if (previousCacheEntry) {
                paginatedFavoritesMap.current.set(productId, previousCacheEntry);
                setPaginatedFavorites(
                  Array.from(paginatedFavoritesMap.current.values())
                );
              }
              if (prevFavoriteIdsForRollback) {
                setFavoriteIds(prevFavoriteIdsForRollback);
                setFavoriteCount(prevFavoriteIdsForRollback.size);
                updateLocalProfileField("favoriteItemIds", [
                  ...prevFavoriteIdsForRollback,
                ]);
              }
              throw commitError; // let the outer catch handle circuit breaker + toast
            }
          
            // Prefer values stored on the favorite doc (cheap, no extra reads).
            // Fall back to a metadata lookup only for legacy docs missing them.
            const needsMetadataLookup = !storedCollection;
            const metadata = needsMetadataLookup
              ? await getProductMetadata(productId)
              : {};
          
            const shopId = storedShopId || metadata.shopId;
          
            userActivityService.trackUnfavorite({
              productId,
              shopId: shopId || undefined,
              productName: productName || metadata.productName || undefined,
              category: metadata.category || undefined,
              brand: metadata.brand || undefined,
              gender: metadata.gender || undefined,
            });
            metricsEventService.logFavoriteRemoved({
              productId,
              shopId: shopId || null,
            });
          
            circuitBreaker.current.recordSuccess();
            showDebouncedRemoveToast();
            return "Removed from favorites";
          } else {
            // Cap check
            if (favoriteIds.size >= MAX_FAVORITE_ITEMS) {
              setShowFavoritesLimitModal(true);
              return "Favorites limit reached";
            }

            // STEP 1: Optimistic add
            const newIds = new Set(favoriteIds);
            newIds.add(productId);
            setFavoriteIds(newIds);
            setFavoriteCount(newIds.size);
            updateLocalProfileField("favoriteItemIds", [...newIds]);

            // STEP 2: Fetch product metadata once. We persist sourceCollection
            // + shopId on the favorite doc so future reads (hydration, transfer,
            // remove, add-to-cart) only hit a single collection.
            const metadata = await getProductMetadata(productId);
            const resolvedCollection = metadata.sourceCollection;
            const resolvedShopId = metadata.shopId;

            // STEP 3: Build favorite doc
            const favoriteData: Record<string, unknown> = {
              productId,
              addedAt: serverTimestamp(),
              quantity: attributes.quantity || 1,
            };

            if (resolvedCollection) {
              favoriteData.sourceCollection = resolvedCollection;
            }
            if (resolvedShopId) {
              favoriteData.shopId = resolvedShopId;
            }

            if (attributes.selectedColor) {
              favoriteData.selectedColor = attributes.selectedColor;
              if (attributes.selectedColorImage) {
                favoriteData.selectedColorImage = attributes.selectedColorImage;
              }
            }

            // Caller-supplied additional attributes — system fields filtered out
            Object.entries(attributes).forEach(([k, v]) => {
              if (!isSystemField(k) && v !== undefined && v !== null) {
                favoriteData[k] = v;
              }
            });

            // STEP 4: Atomic batch: add favorite doc + update user doc array
            const newFavRef = doc(collection(dbRef.current!, collectionPath));
            const addBatch = writeBatch(dbRef.current!);
            addBatch.set(newFavRef, favoriteData);
            addBatch.update(doc(dbRef.current!, "users", user.uid), {
              favoriteItemIds: arrayUnion(productId),
            });
            await addBatch.commit();

            // STEP 5: Track + add to paginated cache (using metadata we already have)
            userActivityService.trackFavorite({
              productId,
              shopId: resolvedShopId || undefined,
              productName: metadata.productName || undefined,
              category: metadata.category || undefined,
              subcategory: metadata.subcategory || undefined,
              subsubcategory: metadata.subsubcategory || undefined,
              brand: metadata.brand || undefined,
              gender: metadata.gender || undefined,
              price: undefined,
            });

            metricsEventService.logFavoriteAdded({
              productId,
              shopId: resolvedShopId || null,
            });

            // Add to paginated cache. We need full product data; if we already
            // resolved the collection, do a single targeted read.
            try {
              let productData: ProductData | null = null;

              if (resolvedCollection) {
                const snap = await getDoc(
                  doc(dbRef.current!, resolvedCollection, productId)
                );
                if (snap.exists()) {
                  productData = {
                    id: snap.id,
                    ...(snap.data() as Record<string, unknown>),
                  };
                }
              } else {
                const [productsSnap, shopProductsSnap] = await Promise.all([
                  getDoc(doc(dbRef.current!, "products", productId)),
                  getDoc(doc(dbRef.current!, "shop_products", productId)),
                ]);
                if (productsSnap.exists()) {
                  productData = {
                    id: productsSnap.id,
                    ...(productsSnap.data() as Record<string, unknown>),
                  };
                } else if (shopProductsSnap.exists()) {
                  productData = {
                    id: shopProductsSnap.id,
                    ...(shopProductsSnap.data() as Record<string, unknown>),
                  };
                }
              }

              if (productData) {
                const cleanAttrs: FavoriteAttributes = {
                  quantity: attributes.quantity || 1,
                  selectedColor: attributes.selectedColor,
                  selectedColorImage: attributes.selectedColorImage,
                  ...(resolvedCollection
                    ? { sourceCollection: resolvedCollection }
                    : {}),
                  ...(resolvedShopId ? { shopId: resolvedShopId } : {}),
                };
                Object.entries(attributes).forEach(([k, v]) => {
                  if (!isSystemField(k) && v !== undefined && v !== null) {
                    cleanAttrs[k] = v;
                  }
                });

                const newItem: PaginatedFavorite = {
                  product: productData,
                  attributes: cleanAttrs,
                  productId,
                };

                paginatedFavoritesMap.current.set(productId, newItem);
                setPaginatedFavorites(
                  Array.from(paginatedFavoritesMap.current.values())
                );
              }
            } catch (error) {
              console.error("⚠️ Failed to fetch product details:", error);
              // Non-critical — product will appear on next reload
            }

            circuitBreaker.current.recordSuccess();
            showSuccessToast("Added to favorites");
            return "Added to favorites";
          }
        } catch (error) {
          console.error("❌ Favorite operation error:", error);
          circuitBreaker.current.recordFailure();

          // Rollback
          if (wasFavorited) {
            const newIds = new Set(favoriteIds);
            newIds.add(productId);
            setFavoriteIds(newIds);
          } else {
            const newIds = new Set(favoriteIds);
            newIds.delete(productId);
            setFavoriteIds(newIds);
            paginatedFavoritesMap.current.delete(productId);
            setPaginatedFavorites(
              Array.from(paginatedFavoritesMap.current.values())
            );
          }
          setFavoriteCount(favoriteIds.size);

          showErrorToast("Failed to update favorites");
          return "Failed to update favorites";
        }
      })();

      favoriteLocks.current.set(productId, lockPromise);
      const result = await lockPromise;
      favoriteLocks.current.delete(productId);

      return result;
    },
    [
      user,
      favoriteIds,
      isInitialLoadComplete,
      initializeIfNeeded,
      existsElsewhere,
      getProductMetadata,
      isSystemField,
      showSuccessToast,
      showErrorToast,
      showDebouncedRemoveToast,
      updateLocalProfileField,
    ]
  );

  /// Deletes the given favorite docs in chunks. Returns:
///   - shopIds: extracted from the deleted docs (for metrics, no extra reads)
///   - removedFromUserDoc: the ids that were actually stripped from the user
///     doc's favoriteItemIds array (mirrors Flutter's _BatchRemoveResult).
const removeMultipleBatch = useCallback(
  async (
    productIds: string[],
    collectionPath: string
  ): Promise<{
    shopIds: Record<string, string | null>;
    removedFromUserDoc: string[];
  }> => {
    if (!user) return { shopIds: {}, removedFromUserDoc: [] };

    const extractedShopIds: Record<string, string | null> = {};
    const batch = writeBatch(dbRef.current!);

    // Process in chunks of 10 (Firestore whereIn limit)
    for (let i = 0; i < productIds.length; i += FIRESTORE_IN_LIMIT) {
      const chunk = productIds.slice(i, i + FIRESTORE_IN_LIMIT);
      const snap = await getDocs(
        query(
          collection(dbRef.current!, collectionPath),
          where("productId", "in", chunk)
        )
      );

      snap.docs.forEach((d) => {
        const data = d.data();
        const pid = data.productId as string | undefined;
        if (pid) {
          extractedShopIds[pid] = (data.shopId as string | undefined) ?? null;
        }
        batch.delete(d.ref);
      });
    }

    // Smart-check: only remove ids from user doc array that are gone everywhere
    const basketId = selectedBasketIdRef.current;
    let idsToRemoveFromUserDoc = productIds;

    if (basketId) {
      const idsStillElsewhere = new Set<string>();

      for (let i = 0; i < productIds.length; i += FIRESTORE_IN_LIMIT) {
        const chunk = productIds.slice(i, i + FIRESTORE_IN_LIMIT);
        const defaultSnap = await getDocs(
          query(
            collection(dbRef.current!, `users/${user.uid}/favorites`),
            where("productId", "in", chunk)
          )
        );
        defaultSnap.docs.forEach((d) => {
          const pid = d.data().productId as string;
          if (pid) idsStillElsewhere.add(pid);
        });
      }

      const basketsSnap = await getDocs(
        collection(dbRef.current!, `users/${user.uid}/favorite_baskets`)
      );
      for (const bDoc of basketsSnap.docs) {
        if (bDoc.id === basketId) continue;
        for (let i = 0; i < productIds.length; i += FIRESTORE_IN_LIMIT) {
          const chunk = productIds.slice(i, i + FIRESTORE_IN_LIMIT);
          const favSnap = await getDocs(
            query(
              collection(bDoc.ref, "favorites"),
              where("productId", "in", chunk)
            )
          );
          favSnap.docs.forEach((d) => {
            const pid = d.data().productId as string;
            if (pid) idsStillElsewhere.add(pid);
          });
        }
      }

      idsToRemoveFromUserDoc = productIds.filter(
        (id) => !idsStillElsewhere.has(id)
      );
    }

    if (idsToRemoveFromUserDoc.length > 0) {
      batch.update(doc(dbRef.current!, "users", user.uid), {
        favoriteItemIds: arrayRemove(...idsToRemoveFromUserDoc),
      });
    }

    await batch.commit();
    return {
      shopIds: extractedShopIds,
      removedFromUserDoc: idsToRemoveFromUserDoc,
    };
  },
  [user]
);

const removeMultipleFromFavorites = useCallback(
  async (productIds: string[]): Promise<string> => {
    if (!user) return "Please log in";
    if (productIds.length === 0) return "No products selected";

    if (!removeFavoriteLimiter.current.canProceed("batch_remove")) {
      return "Please wait";
    }

    // Snapshot for rollback (only the paginated cache state — notifier
    // updates happen AFTER the batch reports what it actually removed)
    const previousPaginated = new Map(paginatedFavoritesMap.current);

    try {
      // Optimistic: remove from current view only
      productIds.forEach((id) => paginatedFavoritesMap.current.delete(id));
      setPaginatedFavorites(
        Array.from(paginatedFavoritesMap.current.values())
      );

      const basketId = selectedBasketIdRef.current;
      const collectionPath = basketId
        ? `users/${user.uid}/favorite_baskets/${basketId}/favorites`
        : `users/${user.uid}/favorites`;

      // Batch delete. Each chunk reports the shopIds AND which ids were
      // actually stripped from favoriteItemIds (smart-check result).
      const shopIds: Record<string, string | null> = {};
      const actuallyRemoved = new Set<string>();
      const batchSize = 50;
      for (let i = 0; i < productIds.length; i += batchSize) {
        const chunk = productIds.slice(i, i + batchSize);
        const result = await removeMultipleBatch(chunk, collectionPath);
        Object.assign(shopIds, result.shopIds);
        result.removedFromUserDoc.forEach((id) => actuallyRemoved.add(id));
      }

      // Sync notifiers based on what the server actually has now
      if (actuallyRemoved.size > 0) {
        const newIds = new Set(favoriteIds);
        actuallyRemoved.forEach((id) => newIds.delete(id));
        setFavoriteIds(newIds);
        setFavoriteCount(newIds.size);
        updateLocalProfileField("favoriteItemIds", [...newIds]);
      }

      metricsEventService.logBatchFavoriteRemovals({
        productIds,
        shopIds,
      });

      return "Products removed from favorites";
    } catch (error) {
      console.error("❌ Batch remove error:", error);

      // Rollback paginated cache
      paginatedFavoritesMap.current.clear();
      previousPaginated.forEach((v, k) =>
        paginatedFavoritesMap.current.set(k, v)
      );
      setPaginatedFavorites(
        Array.from(paginatedFavoritesMap.current.values())
      );

      return "Error removing favorites";
    }
  },
  [
    user,
    favoriteIds,
    removeMultipleBatch,
    updateLocalProfileField,
  ]
);

  /// Removes a product from default favorites and every basket it lives in,
  /// atomically, in a single batched commit.
  ///
  /// All read queries run in parallel. shopId for metrics is pulled from the
  /// favorite docs themselves (no extra product-collection reads needed).
  const removeGloballyFromFavorites = useCallback(
    async (productId: string): Promise<string> => {
      if (!user) return "Please log in";

      const previousIds = new Set(favoriteIds);

      // Optimistic removal
      const newIds = new Set(favoriteIds);
      newIds.delete(productId);
      setFavoriteIds(newIds);
      setFavoriteCount(newIds.size);
      updateLocalProfileField("favoriteItemIds", [...newIds]);

      paginatedFavoritesMap.current.delete(productId);
      setPaginatedFavorites(Array.from(paginatedFavoritesMap.current.values()));

      try {
        const userRef = doc(dbRef.current!, "users", user.uid);

        // STEP 1: Parallel reads — default-favorites match + all baskets list
        const [defaultFavsSnap, basketsSnapshot] = await Promise.all([
          getDocs(
            query(
              collection(dbRef.current!, `users/${user.uid}/favorites`),
              where("productId", "==", productId)
            )
          ),
          getDocs(
            collection(dbRef.current!, `users/${user.uid}/favorite_baskets`)
          ),
        ]);

        // STEP 2: Parallel per-basket lookup
        const basketMatches = await Promise.all(
          basketsSnapshot.docs.map((basketDoc) =>
            getDocs(
              query(
                collection(basketDoc.ref, "favorites"),
                where("productId", "==", productId)
              )
            )
          )
        );

        // STEP 3: Collect refs + extract shopId from any match
        const docsToDelete: DocumentSnapshot["ref"][] = [];
        let shopId: string | null = null;

        defaultFavsSnap.docs.forEach((d) => {
          docsToDelete.push(d.ref);
          shopId ??= (d.data().shopId as string | undefined) ?? null;
        });
        basketMatches.forEach((snap) => {
          snap.docs.forEach((d) => {
            docsToDelete.push(d.ref);
            shopId ??= (d.data().shopId as string | undefined) ?? null;
          });
        });

        // STEP 4: Single atomic batch (bounded: 1 default + 10 baskets + 1 user doc = 12 ops max)
        const batch = writeBatch(dbRef.current!);
        docsToDelete.forEach((ref) => batch.delete(ref));
        batch.update(userRef, {
          favoriteItemIds: arrayRemove(productId),
        });
        await batch.commit();

        metricsEventService.logFavoriteRemoved({
          productId,
          shopId,
        });

        console.log(
          "✅ Removed",
          productId,
          "from",
          docsToDelete.length,
          "favorite doc(s)"
        );
        return "Removed from all favorites";
      } catch (error) {
        console.error("❌ Error removing from favorites:", error);

        setFavoriteIds(previousIds);
        setFavoriteCount(previousIds.size);

        return "Error removing from favorites";
      }
    },
    [user, favoriteIds, updateLocalProfileField]
  );

  // ========================================================================
  // BASKET MANAGEMENT
  // ========================================================================

  const setSelectedBasket = useCallback((basketId: string | null) => {
    const previousBasketId = currentBasketId.current;

    if (
      previousBasketId !== basketId &&
      paginatedFavoritesMap.current.size > 0
    ) {
      const cacheKey = previousBasketId ?? "__default__";
      basketCacheMap.current.set(cacheKey, {
        favorites: Array.from(paginatedFavoritesMap.current.values()),
        lastDoc: lastDocument.current,
        hasMore: hasMoreDataRef.current,
        timestamp: Date.now(),
      });
    }

    setSelectedBasketIdState(basketId);
    selectedBasketIdRef.current = basketId;

    if (previousBasketId !== basketId) {
      currentBasketId.current = basketId;

      const newCacheKey = basketId ?? "__default__";
      const cached = basketCacheMap.current.get(newCacheKey);

      if (cached && Date.now() - cached.timestamp < BASKET_CACHE_TTL) {
        paginatedFavoritesMap.current.clear();
        cached.favorites.forEach((item) => {
          paginatedFavoritesMap.current.set(item.productId, item);
        });
        setPaginatedFavorites(cached.favorites);
        lastDocument.current = cached.lastDoc;
        hasMoreDataRef.current = cached.hasMore;
        setHasMoreData(cached.hasMore);
        setIsInitialLoadComplete(true);
      } else {
        lastDocument.current = null;
        hasMoreDataRef.current = true;
        setHasMoreData(true);
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
        paginatedFavoritesMap.current.clear();
        setPaginatedFavorites([]);
        setIsInitialLoadComplete(false);
      }
    }
  }, []);

  const transferToBasket = useCallback(
    async (
      productId: string,
      targetBasketId: string | null
    ): Promise<string> => {
      if (!user) return "Please log in";

      try {
        const currentBasket = selectedBasketIdRef.current;

        const currentCollectionPath = currentBasket
          ? `users/${user.uid}/favorite_baskets/${currentBasket}/favorites`
          : `users/${user.uid}/favorites`;

        const itemSnapshot = await getDocs(
          query(
            collection(dbRef.current!, currentCollectionPath),
            where("productId", "==", productId),
            firestoreLimit(1)
          )
        );

        if (itemSnapshot.docs.length === 0) {
          return "Item not found";
        }

        const itemData = itemSnapshot.docs[0].data();

        // Atomic transfer: add to target + delete from source in one batch
        const targetCollectionPath = targetBasketId
          ? `users/${user.uid}/favorite_baskets/${targetBasketId}/favorites`
          : `users/${user.uid}/favorites`;

        const targetRef = doc(
          collection(dbRef.current!, targetCollectionPath)
        );
        const batch = writeBatch(dbRef.current!);
        batch.set(targetRef, {
          ...itemData,
          addedAt: serverTimestamp(),
        });
        batch.delete(itemSnapshot.docs[0].ref);
        await batch.commit();

        // Local cache: remove from current view (the favorite doc moved containers,
        // and the user doc array tracks it globally so heart icon stays on).
        paginatedFavoritesMap.current.delete(productId);
        setPaginatedFavorites(
          Array.from(paginatedFavoritesMap.current.values())
        );

        console.log(
          "✅ Transferred",
          productId,
          "to",
          targetBasketId || "default favorites"
        );
        return "Transferred successfully";
      } catch (error) {
        console.error("❌ Transfer error:", error);
        return "Error transferring item";
      }
    },
    [user]
  );

  const createFavoriteBasket = useCallback(
    async (name: string): Promise<string> => {
      if (!user) return "Please log in";

      try {
        const basketsSnapshot = await getDocs(
          collection(dbRef.current!, `users/${user.uid}/favorite_baskets`)
        );

        if (basketsSnapshot.docs.length >= MAX_BASKETS) {
          return "Maximum basket limit reached";
        }

        const newDoc = await addDoc(
          collection(dbRef.current!, `users/${user.uid}/favorite_baskets`),
          {
            name,
            createdAt: serverTimestamp(),
          }
        );

        setFavoriteBaskets((prev) => [
          { id: newDoc.id, name, createdAt: Timestamp.now() },
          ...prev,
        ]);

        showSuccessToast("Basket created");
        return "Basket created";
      } catch (error) {
        console.error("Error creating basket:", error);
        return "Error creating basket";
      }
    },
    [user, showSuccessToast]
  );

  const deleteFavoriteBasket = useCallback(
    async (basketId: string): Promise<string> => {
      if (!user) return "Please log in";

      try {
        const db = dbRef.current!;
        const basketFavCollPath = `users/${user.uid}/favorite_baskets/${basketId}/favorites`;

        const basketFavSnap = await getDocs(
          collection(db, basketFavCollPath)
        );
        const basketProductIds = basketFavSnap.docs
          .map((d) => d.data().productId as string)
          .filter(Boolean);

        let idsToRemoveFromUserDoc: string[] = [];
        if (basketProductIds.length > 0) {
          const idsStillElsewhere = new Set<string>();

          for (let i = 0; i < basketProductIds.length; i += FIRESTORE_IN_LIMIT) {
            const chunk = basketProductIds.slice(i, i + FIRESTORE_IN_LIMIT);
            const defaultSnap = await getDocs(
              query(
                collection(db, `users/${user.uid}/favorites`),
                where("productId", "in", chunk)
              )
            );
            defaultSnap.docs.forEach((d) => {
              const pid = d.data().productId as string;
              if (pid) idsStillElsewhere.add(pid);
            });
          }

          const basketsSnap = await getDocs(
            collection(db, `users/${user.uid}/favorite_baskets`)
          );
          for (const bDoc of basketsSnap.docs) {
            if (bDoc.id === basketId) continue;
            for (
              let i = 0;
              i < basketProductIds.length;
              i += FIRESTORE_IN_LIMIT
            ) {
              const chunk = basketProductIds.slice(i, i + FIRESTORE_IN_LIMIT);
              const favSnap = await getDocs(
                query(
                  collection(bDoc.ref, "favorites"),
                  where("productId", "in", chunk)
                )
              );
              favSnap.docs.forEach((d) => {
                const pid = d.data().productId as string;
                if (pid) idsStillElsewhere.add(pid);
              });
            }
          }

          idsToRemoveFromUserDoc = basketProductIds.filter(
            (id) => !idsStillElsewhere.has(id)
          );
        }

        const allDeletes = basketFavSnap.docs;
        const BATCH_LIMIT = 499;
        for (let i = 0; i < allDeletes.length; i += BATCH_LIMIT) {
          const chunk = allDeletes.slice(i, i + BATCH_LIMIT);
          const isLastChunk = i + BATCH_LIMIT >= allDeletes.length;

          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));

          if (isLastChunk) {
            batch.delete(
              doc(db, `users/${user.uid}/favorite_baskets/${basketId}`)
            );
            if (idsToRemoveFromUserDoc.length > 0) {
              batch.update(doc(db, "users", user.uid), {
                favoriteItemIds: arrayRemove(...idsToRemoveFromUserDoc),
              });
            }
          }

          await batch.commit();
        }

        if (allDeletes.length === 0) {
          await deleteDoc(
            doc(db, `users/${user.uid}/favorite_baskets/${basketId}`)
          );
        }

        setFavoriteBaskets((prev) => prev.filter((b) => b.id !== basketId));
        basketCacheMap.current.delete(basketId);

        if (idsToRemoveFromUserDoc.length > 0) {
          setFavoriteIds((prev) => {
            const next = new Set(prev);
            idsToRemoveFromUserDoc.forEach((id) => next.delete(id));
            setFavoriteCount(next.size);
            updateLocalProfileField("favoriteItemIds", [...next]);
            return next;
          });
        }

        if (selectedBasketIdRef.current === basketId) {
          setSelectedBasket(null);
        }

        showSuccessToast("Basket deleted");
        return "Basket deleted";
      } catch (error) {
        console.error("Error deleting basket:", error);
        return "Error deleting basket";
      }
    },
    [user, showSuccessToast, setSelectedBasket, updateLocalProfileField]
  );

  // ========================================================================
  // PAGINATION
  // ========================================================================

  const fetchPaginatedFavorites = useCallback(
    async (
      startAfterDoc: DocumentSnapshot | null = null,
      limit: number = 50
    ) => {
      if (!user) return { docs: [], hasMore: false };

      const basketId = selectedBasketIdRef.current;
      const collectionPath = basketId
        ? `users/${user.uid}/favorite_baskets/${basketId}/favorites`
        : `users/${user.uid}/favorites`;

      let q = query(
        collection(dbRef.current!, collectionPath),
        orderBy("addedAt", "desc"),
        firestoreLimit(limit + 1)
      );

      if (startAfterDoc) {
        q = query(q, firestoreStartAfter(startAfterDoc));
      }

      const snapshot = await getDocsFromServer(q);
      const hasMore = snapshot.docs.length > limit;
      const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

      const productIds = new Set<string>();
      docs.forEach((d) => {
        const data = d.data();
        if (data.productId) {
          productIds.add(data.productId as string);
        }
      });

      return {
        docs,
        hasMore,
        productIds,
      };
    },
    [user]
  );

  const loadNextPage = useCallback(
    async (limit: number = 50) => {
      if (isLoadingMoreRef.current || !hasMoreDataRef.current) {
        return { docs: [], hasMore: false, error: null };
      }

      const gen = paginationGenRef.current;
      isLoadingMoreRef.current = true;
      setIsLoadingMore(true);

      try {
        const result = await fetchPaginatedFavorites(
          lastDocument.current,
          limit
        );

        if (gen !== paginationGenRef.current) {
          isLoadingMoreRef.current = false;
          setIsLoadingMore(false);
          return { docs: [], hasMore: false, error: null };
        }

        const docs = result.docs as DocumentSnapshot[];
        const hasMore = result.hasMore;
        const productIds = result.productIds;

        if (docs.length > 0) {
          lastDocument.current = docs[docs.length - 1];
          hasMoreDataRef.current = hasMore;
          setHasMoreData(hasMore);

          if (productIds) {
            const newItems = await fetchProductDetailsForIds(
              Array.from(productIds),
              docs
            );
            addPaginatedItems(newItems);
          }
        } else {
          hasMoreDataRef.current = false;
          setHasMoreData(false);
        }

        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;

        return { docs, hasMore, productIds, error: null };
      } catch (error) {
        console.error("❌ loadNextPage ERROR:", error);
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
        hasMoreDataRef.current = false;
        setHasMoreData(false);

        return {
          docs: [],
          hasMore: false,
          error: (error as Error).toString(),
        };
      }
    },
    [fetchPaginatedFavorites, fetchProductDetailsForIds, addPaginatedItems]
  );

  const resetPagination = useCallback(() => {
    lastDocument.current = null;
    isLoadingMoreRef.current = false;
    hasMoreDataRef.current = true;
    setHasMoreData(true);
    setIsLoadingMore(false);
    paginatedFavoritesMap.current.clear();
    setPaginatedFavorites([]);
    setIsInitialLoadComplete(false);
  }, []);

  const loadFreshPage = useCallback(
    async (limit: number = 50) => {
      paginationGenRef.current++;

      lastDocument.current = null;
      isLoadingMoreRef.current = false;
      hasMoreDataRef.current = true;
      setHasMoreData(true);
      setIsLoadingMore(false);
      paginatedFavoritesMap.current.clear();
      setPaginatedFavorites([]);
      setIsInitialLoadComplete(false);

      isLoadingMoreRef.current = true;
      setIsLoadingMore(true);

      try {
        const result = await fetchPaginatedFavorites(null, limit);
        const docs = result.docs as DocumentSnapshot[];
        const hasMore = result.hasMore;
        const productIds = result.productIds;

        if (docs.length > 0) {
          lastDocument.current = docs[docs.length - 1];
          hasMoreDataRef.current = hasMore;
          setHasMoreData(hasMore);

          if (productIds) {
            const newItems = await fetchProductDetailsForIds(
              Array.from(productIds),
              docs
            );
            addPaginatedItems(newItems);
          }
        } else {
          hasMoreDataRef.current = false;
          setHasMoreData(false);
        }

        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
        setIsInitialLoadComplete(true);
      } catch (error) {
        console.error("❌ loadFreshPage ERROR:", error);
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
        hasMoreDataRef.current = false;
        setHasMoreData(false);
        setIsInitialLoadComplete(true);
      }
    },
    [fetchPaginatedFavorites, fetchProductDetailsForIds, addPaginatedItems]
  );

  const shouldReloadFavorites = useCallback(
    (basketId: string | null): boolean => {
      if (paginatedFavorites.length > 0 && isInitialLoadComplete) {
        return false;
      }

      const cacheKey = basketId ?? "__default__";
      const cached = basketCacheMap.current.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < BASKET_CACHE_TTL) {
        return false;
      }

      return true;
    },
    [paginatedFavorites.length, isInitialLoadComplete]
  );

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  const isFavorite = useCallback(
    (productId: string): boolean => {
      return favoriteIds.has(productId);
    },
    [favoriteIds]
  );

  /// `favoriteItemIds` on the user doc IS the global set across all containers.
  /// Mirrors Flutter's globalFavoriteIdsNotifier.contains() check.
  const isGloballyFavorited = useCallback(
    (productId: string): boolean => {
      return favoriteIds.has(productId);
    },
    [favoriteIds]
  );

  const isFavoritedInBasket = useCallback(
    async (productId: string): Promise<boolean> => {
      if (!user) return false;

      try {
        const basketsSnap = await getDocs(
          collection(dbRef.current!, `users/${user.uid}/favorite_baskets`)
        );

        for (const basketDoc of basketsSnap.docs) {
          const favoriteSnapshot = await getDocs(
            query(
              collection(basketDoc.ref, "favorites"),
              where("productId", "==", productId),
              firestoreLimit(1)
            )
          );

          if (!favoriteSnapshot.empty) {
            return true;
          }
        }
        return false;
      } catch (error) {
        console.error("Error checking basket favorite:", error);
        return false;
      }
    },
    [user]
  );

  const getBasketNameForProduct = useCallback(
    async (productId: string): Promise<string | null> => {
      if (!user) return null;

      try {
        const basketsSnap = await getDocs(
          collection(dbRef.current!, `users/${user.uid}/favorite_baskets`)
        );

        for (const basketDoc of basketsSnap.docs) {
          const favoriteSnapshot = await getDocs(
            query(
              collection(basketDoc.ref, "favorites"),
              where("productId", "==", productId),
              firestoreLimit(1)
            )
          );

          if (!favoriteSnapshot.empty) {
            const basketData = basketDoc.data();
            return (basketData.name as string) || null;
          }
        }
        return null;
      } catch (error) {
        console.error("Error getting basket name:", error);
        return null;
      }
    },
    [user]
  );

  // ========================================================================
  // CLEANUP & USER CHANGE HANDLING
  // ========================================================================

  const clearUserData = useCallback(() => {
    setFavoriteCount(0);
    setFavoriteIds(new Set());
    setPaginatedFavorites([]);
    setIsLoading(false);
    setSelectedBasketIdState(null);
    selectedBasketIdRef.current = null;
    currentBasketId.current = null;
    paginatedFavoritesMap.current.clear();
    basketCacheMap.current.clear();
    setIsInitialLoadComplete(false);
    setFavoriteBaskets([]);
    lastDocument.current = null;
    hasMoreDataRef.current = true;
    setHasMoreData(true);
  }, []);

  const fetchBaskets = useCallback(async () => {
    if (!user) return;

    try {
      const basketsSnap = await getDocsFromServer(
        query(collection(dbRef.current!, `users/${user.uid}/favorite_baskets`))
      );
      trackReads("Favorites:Baskets", basketsSnap.docs.length || 1);

      const baskets: FavoriteBasket[] = [];
      basketsSnap.docs.forEach((d) => {
        const data = d.data();
        baskets.push({
          id: d.id,
          name: (data.name as string) || "",
          createdAt: data.createdAt as Timestamp | FieldValue,
        });
      });

      baskets.sort((a, b) => {
        if (
          a.createdAt instanceof Timestamp &&
          b.createdAt instanceof Timestamp
        ) {
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        }
        return 0;
      });

      setFavoriteBaskets(baskets);
    } catch (error) {
      console.error("Error fetching baskets:", error);
    }
  }, [user]);

  // ========================================================================
  // EFFECTS
  // ========================================================================

  // Seed favorite IDs from user doc — zero extra Firestore reads
  const prevUserUid = useRef<string | null>(null);
  useEffect(() => {
    if (user && dbProp) {
      if (!profileData) return;

      if (prevUserUid.current !== user.uid) {
        prevUserUid.current = user.uid;
        clearUserData();
      }

      const cachedIds = getProfileField<string[]>("favoriteItemIds");
      const ids = new Set(Array.isArray(cachedIds) ? cachedIds : []);
      setFavoriteIds(ids);
      setFavoriteCount(ids.size);
    } else if (!user) {
      prevUserUid.current = null;
      clearUserData();
    }
  }, [user, dbProp, profileData, getProfileField, clearUserData]);

  useEffect(() => {
    cleanupTimer.current = setInterval(() => {
      favoriteLocks.current.forEach((promise, key) => {
        promise.then(() => {
          favoriteLocks.current.delete(key);
        });
      });

      if (paginatedFavoritesMap.current.size > MAX_PAGINATED_CACHE) {
        const entries = Array.from(paginatedFavoritesMap.current.entries());
        const toRemove = entries.slice(0, 50);
        toRemove.forEach(([key]) => paginatedFavoritesMap.current.delete(key));
      }
    }, 30000);

    return () => {
      if (cleanupTimer.current) {
        clearInterval(cleanupTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (deferredFavInitRef.current !== null) {
        if (typeof cancelIdleCallback !== "undefined") {
          cancelIdleCallback(deferredFavInitRef.current as number);
        } else {
          clearTimeout(
            deferredFavInitRef.current as ReturnType<typeof setTimeout>
          );
        }
        deferredFavInitRef.current = null;
      }
      if (removeFavoriteTimer.current) {
        clearTimeout(removeFavoriteTimer.current);
      }
    };
  }, []);

  // ========================================================================
  // CONTEXT VALUES
  // ========================================================================

  const stateValue = useMemo<FavoritesStateContextType>(
    () => ({
      favoriteIds,
      favoriteCount,
      paginatedFavorites,
      isLoading,
      selectedBasketId,
      hasMoreData,
      isLoadingMore,
      isInitialLoadComplete,
      favoriteBaskets,
    }),
    [
      favoriteIds,
      favoriteCount,
      paginatedFavorites,
      isLoading,
      selectedBasketId,
      hasMoreData,
      isLoadingMore,
      isInitialLoadComplete,
      favoriteBaskets,
    ]
  );

  const actionsValue = useMemo<FavoritesActionsContextType>(
    () => ({
      addToFavorites,
      removeMultipleFromFavorites,
      removeGloballyFromFavorites,
      createFavoriteBasket,
      deleteFavoriteBasket,
      setSelectedBasket,
      transferToBasket,
      loadNextPage,
      loadFreshPage,
      resetPagination,
      shouldReloadFavorites,
      fetchBaskets,
      isFavorite,
      isGloballyFavorited,
      isFavoritedInBasket,
      getBasketNameForProduct,
    }),
    [
      addToFavorites,
      removeMultipleFromFavorites,
      removeGloballyFromFavorites,
      createFavoriteBasket,
      deleteFavoriteBasket,
      setSelectedBasket,
      transferToBasket,
      loadNextPage,
      loadFreshPage,
      resetPagination,
      shouldReloadFavorites,
      fetchBaskets,
      isFavorite,
      isGloballyFavorited,
      isFavoritedInBasket,
      getBasketNameForProduct,
    ]
  );

  const combinedValue = useMemo<FavoritesContextType>(
    () => ({
      ...stateValue,
      ...actionsValue,
    }),
    [stateValue, actionsValue]
  );

  return (
    <FavoritesStateContext.Provider value={stateValue}>
      <FavoritesActionsContext.Provider value={actionsValue}>
        <FavoritesContext.Provider value={combinedValue}>
          {children}
          {showFavoritesLimitModal && (
            <LimitReachedModal
              onClose={() => setShowFavoritesLimitModal(false)}
              type="favorites"
              maxItems={MAX_FAVORITE_ITEMS}
            />
          )}
        </FavoritesContext.Provider>
      </FavoritesActionsContext.Provider>
    </FavoritesStateContext.Provider>
  );
};