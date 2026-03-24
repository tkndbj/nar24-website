// context/FavoritesProvider.tsx - REFACTORED v3.0 (Production Grade + Simplified)
// Matches Flutter favorite_product_provider.dart exactly

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

// State-only context type (changes frequently)
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

// Actions-only context type (stable references, never causes re-renders)
interface FavoritesActionsContextType {
  // Methods
  addToFavorites: (
    productId: string,
    attributes?: FavoriteAttributes
  ) => Promise<string>;
  removeMultipleFromFavorites: (productIds: string[]) => Promise<string>;
  removeGloballyFromFavorites: (productId: string) => Promise<string>;

  // Basket management
  createFavoriteBasket: (name: string) => Promise<string>;
  deleteFavoriteBasket: (basketId: string) => Promise<string>;
  setSelectedBasket: (basketId: string | null) => void;
  transferToBasket: (
    productId: string,
    targetBasketId: string | null
  ) => Promise<string>;

  // Pagination
  loadNextPage: (limit?: number) => Promise<{
    docs: DocumentSnapshot[];
    hasMore: boolean;
    productIds?: Set<string>;
    error?: string | null;
  }>;
  loadFreshPage: (limit?: number) => Promise<void>;
  resetPagination: () => void;
  shouldReloadFavorites: (basketId: string | null) => boolean;

  // Baskets (on-demand fetch, no listener)
  fetchBaskets: () => Promise<void>;

  // Utilities
  isFavorite: (productId: string) => boolean;
  isGloballyFavorited: (productId: string) => boolean;
  isFavoritedInBasket: (productId: string) => Promise<boolean>;
  getBasketNameForProduct: (productId: string) => Promise<string | null>;
}

// Combined context type (for backward compatibility)
interface FavoritesContextType extends FavoritesStateContextType, FavoritesActionsContextType {}

// Create separate contexts
const FavoritesStateContext = createContext<FavoritesStateContextType | undefined>(undefined);
const FavoritesActionsContext = createContext<FavoritesActionsContextType | undefined>(undefined);

// Combined context for backward compatibility
const FavoritesContext = createContext<FavoritesContextType | undefined>(
  undefined
);

/**
 * Hook to access only favorites state (will re-render on state changes)
 */
export const useFavoritesState = (): FavoritesStateContextType => {
  const context = useContext(FavoritesStateContext);
  if (!context) {
    throw new Error("useFavoritesState must be used within FavoritesProvider");
  }
  return context;
};

/**
 * Hook to access only favorites actions (stable, never re-renders)
 */
export const useFavoritesActions = (): FavoritesActionsContextType => {
  const context = useContext(FavoritesActionsContext);
  if (!context) {
    throw new Error("useFavoritesActions must be used within FavoritesProvider");
  }
  return context;
};

/**
 * Combined hook for backward compatibility - returns both state and actions
 * PREFER useFavoritesState() or useFavoritesActions() for better performance
 */
export const useFavorites = (): FavoritesContextType => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error("useFavorites must be used within FavoritesProvider");
  }
  return context;
};

// ============================================================================
// RATE LIMITER (Prevents spam)
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
// CIRCUIT BREAKER (Fault tolerance)
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
  const { user, getProfileField, updateLocalProfileField, profileData } = useUser();

  // Stable ref so callbacks always access the latest db without needing it in deps
  const dbRef = useRef<Firestore | null>(dbProp);
  dbRef.current = dbProp;

  // Rate limiters
  const addFavoriteLimiter = useRef(new RateLimiter(300));
  const removeFavoriteLimiter = useRef(new RateLimiter(200));

  // Circuit breaker
  const circuitBreaker = useRef(new CircuitBreaker());

  // Reactive state (like ValueNotifiers)
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

  // Internal state
  const lastDocument = useRef<DocumentSnapshot | null>(null);
  const paginatedFavoritesMap = useRef<Map<string, PaginatedFavorite>>(
    new Map()
  );
  const currentBasketId = useRef<string | null>(null);
  const selectedBasketIdRef = useRef<string | null>(null);

  // Per-basket cache for fast switching
  interface BasketCache {
    favorites: PaginatedFavorite[];
    lastDoc: DocumentSnapshot | null;
    hasMore: boolean;
    timestamp: number;
  }
  const basketCacheMap = useRef<Map<string, BasketCache>>(new Map());
  const BASKET_CACHE_TTL = 5 * 60 * 1000; // 5 minutes


  // Timers
  const removeFavoriteTimer = useRef<NodeJS.Timeout | null>(null);
  const cleanupTimer = useRef<NodeJS.Timeout | null>(null);

  // Concurrency control
  const favoriteLocks = useRef<Map<string, Promise<string>>>(new Map());
  const pendingFetches = useRef<Map<string, Promise<void>>>(new Map());
  const deferredFavInitRef = useRef<number | ReturnType<typeof setTimeout> | null>(null);
  const isLoadingMoreRef = useRef(false); // Ref-based guard (sync, no race conditions)
  const paginationGenRef = useRef(0); // Generation counter: stale fetches discard results

  // ========================================================================
  // UTILITY FUNCTIONS
  // ========================================================================

  const isSystemField = useCallback((key: string): boolean => {
    return [
      "addedAt",
      "productId",
      "quantity",
      "selectedColor",
      "selectedColorImage",
    ].includes(key);
  }, []);

  const fetchProductDetailsForIds = useCallback(
    async (
      productIds: string[],
      favoriteDocs: DocumentSnapshot[]
    ): Promise<PaginatedFavorite[]> => {
      if (productIds.length === 0) return [];

      const results: PaginatedFavorite[] = [];
      const favoriteDetailsByProductId: Record<string, FavoriteAttributes> = {};

      // Build attributes map
      favoriteDocs.forEach((doc) => {
        const data = doc.data();
        if (data && data.productId) {
          const attrs = { ...data };
          delete attrs.productId;
          delete attrs.addedAt;
          favoriteDetailsByProductId[data.productId as string] = attrs;
        }
      });

      // Chunk IDs for Firestore 'in' queries (max 10)
      const FIRESTORE_IN_LIMIT = 10;
      for (let i = 0; i < productIds.length; i += FIRESTORE_IN_LIMIT) {
        const chunk = productIds.slice(i, i + FIRESTORE_IN_LIMIT);

        try {
          // ✅ Query BOTH collections in parallel (like Flutter)
          const [productsSnap, shopProductsSnap] = await Promise.all([
            getDocs(
              query(collection(dbRef.current!, "products"), where("__name__", "in", chunk))
            ),
            getDocs(
              query(
                collection(dbRef.current!, "shop_products"),
                where("__name__", "in", chunk)
              )
            ),
          ]);

          // Process products collection
          productsSnap.docs.forEach((doc) => {
            try {
              const data = doc.data();
              const product: ProductData = {
                id: doc.id,
                ...data,
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

          // Process shop_products collection
          shopProductsSnap.docs.forEach((doc) => {
            try {
              const data = doc.data();
              const product: ProductData = {
                id: doc.id,
                ...data,
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
        } catch (error) {
          console.error("Error fetching product chunk:", error);
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

  const getProductShopId = useCallback(
    async (productId: string): Promise<string | null> => {
      try {
        // Try products collection first
        const productDoc = await getDoc(doc(dbRef.current!, "products", productId));

        if (productDoc.exists()) {
          const data = productDoc.data();
          return (data?.shopId as string) || null;
        }

        // Try shop_products collection
        const shopProductDoc = await getDoc(
          doc(dbRef.current!, "shop_products", productId)
        );

        if (shopProductDoc.exists()) {
          const data = shopProductDoc.data();
          return (data?.shopId as string) || null;
        }

        return null;
      } catch (error) {
        console.warn("⚠️ Failed to get product shopId:", error);
        return null;
      }
    },
    []
  );

  const getProductMetadata = useCallback(
    async (
      productId: string
    ): Promise<{
      shopId?: string;
      productName?: string;
      category?: string;
      subcategory?: string;
      subsubcategory?: string;
      brand?: string;
      gender?: string;
    }> => {
      try {
        // ✅ Fetch BOTH collections in parallel
        const [productDoc, shopProductDoc] = await Promise.all([
          getDoc(doc(dbRef.current!, "products", productId)),
          getDoc(doc(dbRef.current!, "shop_products", productId)),
        ]);

        // Prefer products collection if it exists
        if (productDoc.exists()) {
          const data = productDoc.data();
          return {
            shopId: data?.shopId as string | undefined,
            productName: data?.productName as string | undefined,
            category: data?.category as string | undefined,
            subcategory: data?.subcategory as string | undefined,
            subsubcategory: data?.subsubcategory as string | undefined,
            brand: data?.brandModel as string | undefined,
            gender: data?.gender as string | undefined,
          };
        }

        // Fall back to shop_products
        if (shopProductDoc.exists()) {
          const data = shopProductDoc.data();
          return {
            shopId: data?.shopId as string | undefined,
            productName: data?.productName as string | undefined,
            category: data?.category as string | undefined,
            subcategory: data?.subcategory as string | undefined,
            subsubcategory: data?.subsubcategory as string | undefined,
            brand: data?.brandModel as string | undefined,
            gender: data?.gender as string | undefined,
          };
        }

        return {};
      } catch (error) {
        console.warn("⚠️ Failed to get product metadata:", error);
        return {};
      }
    },
    []
  );

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
  // INITIALIZATION & DATA LOADING
  // ========================================================================

  // Favorite IDs are seeded from user doc `favoriteItemIds` array (Tier 1).
  // No listener needed — local state is the source of truth for the session.
  // Full item data is fetched on-demand via getDocsFromServer (favorites page).

  const initializeIfNeeded = useCallback(async () => {
    if (!user) return;

    // Request coalescing
    if (pendingFetches.current.has("init")) {
      console.log("⏳ Already initializing, waiting...");
      await pendingFetches.current.get("init");
      return;
    }

    const promise = (async () => {
      try {
        // IDs are already seeded from user doc in the effect below.
        // Mark as initialized so the favorites page can start loading full data.
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
  // ADD/REMOVE FAVORITES
  // ========================================================================

  const addToFavorites = useCallback(
    async (
      productId: string,
      attributes: FavoriteAttributes = {}
    ): Promise<string> => {
      if (!user) return "Please log in";

      // Ensure initialization if deferred init hasn't fired yet
      if (!isInitialLoadComplete) {
        if (deferredFavInitRef.current !== null) {
          if (typeof cancelIdleCallback !== "undefined") {
            cancelIdleCallback(deferredFavInitRef.current as number);
          } else {
            clearTimeout(deferredFavInitRef.current as ReturnType<typeof setTimeout>);
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

        // Store previous state for rollback
        const wasFavorited = favoriteIds.has(productId);
        let isRemoving = false;

        try {
          // Check if already exists
          const existingSnap = await getDocs(
            query(
              collection(dbRef.current!, collectionPath),
              where("productId", "==", productId),
              firestoreLimit(1)
            )
          );
          isRemoving = existingSnap.docs.length > 0;

          if (isRemoving) {
            // STEP 1: Delete from Firestore first
            await deleteDoc(existingSnap.docs[0].ref);

            // STEP 2: Check if product exists in any other location before
            // removing from the global favoriteItemIds array
            let existsElsewhere = false;

            if (basketId) {
              // Removed from a basket — check default favorites
              const defaultSnap = await getDocs(
                query(
                  collection(dbRef.current!, `users/${user.uid}/favorites`),
                  where("productId", "==", productId),
                  firestoreLimit(1)
                )
              );
              if (!defaultSnap.empty) {
                existsElsewhere = true;
              } else {
                // Check other baskets
                const basketsSnap = await getDocs(
                  collection(dbRef.current!, `users/${user.uid}/favorite_baskets`)
                );
                for (const bDoc of basketsSnap.docs) {
                  if (bDoc.id === basketId) continue; // skip current basket
                  const favSnap = await getDocs(
                    query(
                      collection(bDoc.ref, "favorites"),
                      where("productId", "==", productId),
                      firestoreLimit(1)
                    )
                  );
                  if (!favSnap.empty) {
                    existsElsewhere = true;
                    break;
                  }
                }
              }
            }
            // If from default collection (no basketId), always safe to remove

            // STEP 3: Only remove from user doc array if not in any other location
            if (!existsElsewhere) {
              const newIds = new Set(favoriteIds);
              newIds.delete(productId);
              setFavoriteIds(newIds);
              setFavoriteCount(newIds.size);
              updateLocalProfileField("favoriteItemIds", [...newIds]);

              if (user) {
                updateDoc(doc(dbRef.current!, "users", user.uid), {
                  favoriteItemIds: arrayRemove(productId),
                }).catch((err) => console.warn("favoriteItemIds arrayRemove failed:", err));
              }
            }

            // Remove from pagination cache (always — it's removed from current view)
            paginatedFavoritesMap.current.delete(productId);
            setPaginatedFavorites(
              Array.from(paginatedFavoritesMap.current.values())
            );

            const metadata = await getProductMetadata(productId);
            userActivityService.trackUnfavorite({
              productId,
              shopId: metadata.shopId || undefined,
              productName: metadata.productName || undefined,
              category: metadata.category || undefined,
              brand: metadata.brand || undefined,
              gender: metadata.gender || undefined,
            });

            // ✅ STEP 3: Get shopId and log metrics
            const shopId = await getProductShopId(productId);
            metricsEventService.logFavoriteRemoved({
              productId,
              shopId,
            });

            circuitBreaker.current.recordSuccess();
            showDebouncedRemoveToast();
            return "Removed from favorites";
          } else {
            // STEP 1: Optimistic add
            const newIds = new Set(favoriteIds);
            newIds.add(productId);
            setFavoriteIds(newIds);
            setFavoriteCount(newIds.size);
            updateLocalProfileField("favoriteItemIds", [...newIds]);

            // STEP 2: Add to Firestore
            const favoriteData: Record<string, unknown> = {
              productId,
              addedAt: serverTimestamp(),
              quantity: attributes.quantity || 1,
            };

            if (attributes.selectedColor) {
              favoriteData.selectedColor = attributes.selectedColor;
              if (attributes.selectedColorImage) {
                favoriteData.selectedColorImage = attributes.selectedColorImage;
              }
            }

            // Add additional attributes
            Object.entries(attributes).forEach(([k, v]) => {
              if (!isSystemField(k) && v !== undefined && v !== null) {
                favoriteData[k] = v;
              }
            });

            await addDoc(collection(dbRef.current!, collectionPath), favoriteData);

            // Update user doc array (only for default collection)
            // Update user doc array (tracks all favorites across all baskets)
            if (user) {
              updateDoc(doc(dbRef.current!, "users", user.uid), {
                favoriteItemIds: arrayUnion(productId),
              }).catch((err) => console.warn("favoriteItemIds arrayUnion failed:", err));
            }

            const metadata = await getProductMetadata(productId);
            userActivityService.trackFavorite({
              productId,
              shopId: metadata.shopId || undefined,
              productName: metadata.productName || undefined,
              category: metadata.category || undefined,
              subcategory: metadata.subcategory || undefined,
              subsubcategory: metadata.subsubcategory || undefined,
              brand: metadata.brand || undefined,
              gender: metadata.gender || undefined,
              price: undefined, // We don't have price here
            });
            // ✅ STEP 2.5: FETCH AND ADD PRODUCT TO PAGINATED LIST (NEW!)
            try {
              // Fetch product details from BOTH collections
              const [productDoc, shopProductDoc] = await Promise.all([
                getDoc(doc(dbRef.current!, "products", productId)),
                getDoc(doc(dbRef.current!, "shop_products", productId)),
              ]);

              let productData: ProductData | null = null;

              if (productDoc.exists()) {
                const data = productDoc.data();
                productData = {
                  id: productDoc.id,
                  ...data,
                };
              } else if (shopProductDoc.exists()) {
                const data = shopProductDoc.data();
                productData = {
                  id: shopProductDoc.id,
                  ...data,
                };
              }

              // Add to paginated cache immediately
              if (productData) {
                const newItem: PaginatedFavorite = {
                  product: productData,
                  attributes: {
                    quantity: attributes.quantity || 1,
                    selectedColor: attributes.selectedColor,
                    selectedColorImage: attributes.selectedColorImage,
                    ...Object.fromEntries(
                      Object.entries(attributes).filter(
                        ([k]) => !isSystemField(k)
                      )
                    ),
                  },
                  productId,
                };

                // Add to beginning of paginated list (most recent first)
                paginatedFavoritesMap.current.set(productId, newItem);
                setPaginatedFavorites(
                  Array.from(paginatedFavoritesMap.current.values())
                );

                console.log("✅ Added product to paginated list immediately");
              }
            } catch (error) {
              console.error("⚠️ Failed to fetch product details:", error);
              // Non-critical error - the product will appear on next reload
            }

            // STEP 3: Get shopId and log metrics
            const shopId = await getProductShopId(productId);
            metricsEventService.logFavoriteAdded({
              productId,
              shopId,
            });

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
      getProductShopId, // ✅ CORRECT
      isSystemField,
      showSuccessToast,
      showErrorToast,
      showDebouncedRemoveToast,
    ]
  );

  const removeMultipleFromFavorites = useCallback(
    async (productIds: string[]): Promise<string> => {
      if (!user) return "Please log in";
      if (productIds.length === 0) return "No products selected";

      // Rate limiting
      if (!removeFavoriteLimiter.current.canProceed("batch_remove")) {
        return "Please wait";
      }

      const previousIds = new Set(favoriteIds);

      try {
        // ✅ STEP 1: Get all shopIds BEFORE removal (NEW)
        const shopIds: Record<string, string | null> = {};
        for (const productId of productIds) {
          shopIds[productId] = await getProductShopId(productId);
        }

        // STEP 2: Optimistic removal from current view (pagination cache)
        productIds.forEach((id) => paginatedFavoritesMap.current.delete(id));
        setPaginatedFavorites(
          Array.from(paginatedFavoritesMap.current.values())
        );

        // STEP 3: Batch delete from Firestore (also handles favoriteItemIds safely)
        const basketId = selectedBasketIdRef.current;
        const collectionPath = basketId
          ? `users/${user.uid}/favorite_baskets/${basketId}/favorites`
          : `users/${user.uid}/favorites`;

        const batchSize = 50;
        for (let i = 0; i < productIds.length; i += batchSize) {
          const chunk = productIds.slice(i, i + batchSize);
          await removeMultipleBatch(chunk, collectionPath);
        }

        // STEP 4: Sync local favoriteIds from what actually got removed from user doc
        // Re-read the user doc's favoriteItemIds to get the accurate state
        const updatedCachedIds = getProfileField<string[]>("favoriteItemIds");
        if (Array.isArray(updatedCachedIds)) {
          const updatedIds = new Set(updatedCachedIds);
          // Also remove the ones we just processed (in case profile hasn't synced yet)
          // but only if not in a basket context
          if (!basketId) {
            productIds.forEach((id) => updatedIds.delete(id));
          }
          setFavoriteIds(updatedIds);
          setFavoriteCount(updatedIds.size);
          updateLocalProfileField("favoriteItemIds", [...updatedIds]);
        }

        // STEP 5: Log batch metrics
        metricsEventService.logBatchFavoriteRemovals({
          productIds,
          shopIds,
        });

        return "Products removed from favorites";
      } catch (error) {
        console.error("❌ Batch remove error:", error);

        // Rollback pagination
        setFavoriteIds(previousIds);
        setFavoriteCount(previousIds.size);

        return "Error removing favorites";
      }
    },
    [user, favoriteIds, getProductShopId]
  );

  const removeMultipleBatch = useCallback(
    async (productIds: string[], collectionPath: string) => {
      if (!user) return;

      const batch = writeBatch(dbRef.current!);

      // Process in chunks of 10 (Firestore whereIn limit)
      for (let i = 0; i < productIds.length; i += FIRESTORE_IN_LIMIT) {
        const chunk = productIds.slice(i, i + FIRESTORE_IN_LIMIT);
        const snap = await getDocs(
          query(collection(dbRef.current!, collectionPath), where("productId", "in", chunk))
        );

        snap.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
      }

      // Only remove from user doc array the IDs that don't exist elsewhere
      const basketId = selectedBasketIdRef.current;
      let idsToRemoveFromUserDoc = productIds;

      if (basketId) {
        // Removing from a basket — check which products still exist in other locations
        const idsStillElsewhere = new Set<string>();

        // Check default favorites
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

        // Check other baskets
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
    },
    [user]
  );

  const removeGloballyFromFavorites = useCallback(
    async (productId: string): Promise<string> => {
      if (!user) return "Please log in";

      // Optimistic removal
      const previousIds = new Set(favoriteIds);
      const newIds = new Set(favoriteIds);
      newIds.delete(productId);
      setFavoriteIds(newIds);
      setFavoriteCount(newIds.size);
      updateLocalProfileField("favoriteItemIds", [...newIds]);

      paginatedFavoritesMap.current.delete(productId);
      setPaginatedFavorites(Array.from(paginatedFavoritesMap.current.values()));

      try {
        const shopId = await getProductShopId(productId);

        const batch = writeBatch(dbRef.current!);

        // STEP 2: Remove from default favorites
        const defaultFavsSnap = await getDocs(
          query(
            collection(dbRef.current!, `users/${user.uid}/favorites`),
            where("productId", "==", productId)
          )
        );

        defaultFavsSnap.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });

        // STEP 3: Remove from all baskets
        const basketsSnapshot = await getDocs(
          collection(dbRef.current!, `users/${user.uid}/favorite_baskets`)
        );

        for (const basketDoc of basketsSnapshot.docs) {
          const favoriteSnapshot = await getDocs(
            query(
              collection(basketDoc.ref, "favorites"),
              where("productId", "==", productId)
            )
          );

          favoriteSnapshot.docs.forEach((favDoc) => {
            batch.delete(favDoc.ref);
          });
        }

        // Also remove from user doc array
        batch.update(doc(dbRef.current!, "users", user.uid), {
          favoriteItemIds: arrayRemove(productId),
        });

        await batch.commit();

        // ✅ STEP 4: Log metrics (NEW)
        metricsEventService.logFavoriteRemoved({
          productId,
          shopId,
        });

        console.log("✅ Removed", productId, "from all favorites");
        return "Removed from all favorites";
      } catch (error) {
        console.error("❌ Error removing from favorites:", error);

        // Rollback
        setFavoriteIds(previousIds);
        setFavoriteCount(previousIds.size);

        return "Error removing from favorites";
      }
    },
    [user, favoriteIds, getProductShopId] // ✅ ADD getProductShopId
  );

  // ========================================================================
  // BASKET MANAGEMENT
  // ========================================================================

  const setSelectedBasket = useCallback((basketId: string | null) => {
    const previousBasketId = currentBasketId.current;

    // Save current basket's data to cache before switching
    if (previousBasketId !== basketId && paginatedFavoritesMap.current.size > 0) {
      const cacheKey = previousBasketId ?? "__default__";
      basketCacheMap.current.set(cacheKey, {
        favorites: Array.from(paginatedFavoritesMap.current.values()),
        lastDoc: lastDocument.current,
        hasMore: hasMoreData,
        timestamp: Date.now(),
      });
      console.log("💾 Saved cache for basket:", cacheKey, "items:", paginatedFavoritesMap.current.size);
    }

    setSelectedBasketIdState(basketId);
    selectedBasketIdRef.current = basketId;

    if (previousBasketId !== basketId) {
      currentBasketId.current = basketId;

      // Check for cached data for the new basket
      const newCacheKey = basketId ?? "__default__";
      const cached = basketCacheMap.current.get(newCacheKey);

      if (cached && Date.now() - cached.timestamp < BASKET_CACHE_TTL) {
        // Restore from cache
        console.log("✅ Restored cache for basket:", newCacheKey, "items:", cached.favorites.length);
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
        // No cache or expired, inline reset pagination logic
        console.log("🔄 No cache for basket:", newCacheKey, "- loading fresh");
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

        // Get current favorite item data
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

        // Add to target location
        const targetCollectionPath = targetBasketId
          ? `users/${user.uid}/favorite_baskets/${targetBasketId}/favorites`
          : `users/${user.uid}/favorites`;

        await addDoc(collection(dbRef.current!, targetCollectionPath), {
          ...itemData,
          addedAt: serverTimestamp(),
        });

        // Remove from current location
        await deleteDoc(itemSnapshot.docs[0].ref);

        // No user doc array update needed — product stays favorited,
        // just moves between containers. favoriteItemIds tracks all favorites.

        // Update local cache
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

        const newDoc = await addDoc(collection(dbRef.current!, `users/${user.uid}/favorite_baskets`), {
          name,
          createdAt: serverTimestamp(),
        });

        // Update local state (no listener to do this)
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

        // STEP 1: Get all favorites in the basket's subcollection
        const basketFavSnap = await getDocs(
          collection(db, basketFavCollPath)
        );
        const basketProductIds = basketFavSnap.docs
          .map((d) => d.data().productId as string)
          .filter(Boolean);

        // STEP 2: Determine which product IDs are exclusive to this basket
        let idsToRemoveFromUserDoc: string[] = [];
        if (basketProductIds.length > 0) {
          const idsStillElsewhere = new Set<string>();

          // Check default favorites
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

          // Check other baskets
          const basketsSnap = await getDocs(
            collection(db, `users/${user.uid}/favorite_baskets`)
          );
          for (const bDoc of basketsSnap.docs) {
            if (bDoc.id === basketId) continue;
            for (let i = 0; i < basketProductIds.length; i += FIRESTORE_IN_LIMIT) {
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

        // STEP 3: Atomic batch — delete subcollection docs, update user doc, delete basket
        // Firestore batch limit is 500; chunk if needed
        const allDeletes = basketFavSnap.docs;
        const BATCH_LIMIT = 499; // leave room for the basket doc delete + user doc update
        for (let i = 0; i < allDeletes.length; i += BATCH_LIMIT) {
          const chunk = allDeletes.slice(i, i + BATCH_LIMIT);
          const isLastChunk = i + BATCH_LIMIT >= allDeletes.length;

          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));

          if (isLastChunk) {
            // Delete the basket document itself
            batch.delete(
              doc(db, `users/${user.uid}/favorite_baskets/${basketId}`)
            );
            // Remove exclusive IDs from favoriteItemIds
            if (idsToRemoveFromUserDoc.length > 0) {
              batch.update(doc(db, "users", user.uid), {
                favoriteItemIds: arrayRemove(...idsToRemoveFromUserDoc),
              });
            }
          }

          await batch.commit();
        }

        // If basket had no favorites, still need to delete the basket doc
        if (allDeletes.length === 0) {
          await deleteDoc(
            doc(db, `users/${user.uid}/favorite_baskets/${basketId}`)
          );
        }

        // STEP 4: Sync local state
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

      console.log(
        "🟡 fetchPaginatedFavorites: limit=",
        limit,
        "collection=",
        collectionPath
      );

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

      console.log(
        "🟡 fetchPaginatedFavorites RESULT: fetched=",
        snapshot.docs.length,
        "limit=",
        limit,
        "hasMore=",
        hasMore,
        "returning",
        docs.length,
        "docs"
      );

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
      // Ref-based guards: synchronous, no stale closure issues
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

        // Discard if a fresh load (basket switch) started while we were fetching
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

        return { docs: [], hasMore: false, error: (error as Error).toString() };
      }
    },
    [
      fetchPaginatedFavorites,
      fetchProductDetailsForIds,
      addPaginatedItems,
    ]
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
      // Invalidate any in-flight loadNextPage calls
      paginationGenRef.current++;

      // Atomic reset + load: no stale closure gap
      lastDocument.current = null;
      isLoadingMoreRef.current = false;
      hasMoreDataRef.current = true;
      setHasMoreData(true);
      setIsLoadingMore(false);
      paginatedFavoritesMap.current.clear();
      setPaginatedFavorites([]);
      setIsInitialLoadComplete(false);

      // Now load first page
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
      // Check if we have current data
      if (paginatedFavorites.length > 0 && isInitialLoadComplete) {
        return false;
      }

      // Check cache for the target basket
      const cacheKey = basketId ?? "__default__";
      const cached = basketCacheMap.current.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < BASKET_CACHE_TTL) {
        // Valid cache exists
        return false;
      }

      // No cache or expired, need to reload
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

  const isGloballyFavorited = useCallback(
    (productId: string): boolean => {
      // favoriteItemIds on user doc is already the global set across all baskets
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
    basketCacheMap.current.clear(); // Clear per-basket cache
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

  // Seed favorite IDs from user doc (Tier 1) — zero extra Firestore reads
  const prevUserUid = useRef<string | null>(null);
  useEffect(() => {
    if (user && dbProp) {
      if (!profileData) return;

      // Only clear everything on actual user change, not on profileData re-renders
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
  }, [
    user,
    dbProp,
    profileData,
    getProfileField,
    clearUserData,
  ]);

  // Cleanup timer
  useEffect(() => {
    cleanupTimer.current = setInterval(() => {
      // Cleanup old locks
      favoriteLocks.current.forEach((promise, key) => {
        promise.then(() => {
          favoriteLocks.current.delete(key);
        });
      });

      // Cleanup pagination cache if too large
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel deferred init if still pending
      if (deferredFavInitRef.current !== null) {
        if (typeof cancelIdleCallback !== "undefined") {
          cancelIdleCallback(deferredFavInitRef.current as number);
        } else {
          clearTimeout(deferredFavInitRef.current as ReturnType<typeof setTimeout>);
        }
        deferredFavInitRef.current = null;
      }
      if (removeFavoriteTimer.current) {
        clearTimeout(removeFavoriteTimer.current);
      }
    };
  }, []);

  // ========================================================================
  // CONTEXT VALUES - Split for granular subscriptions
  // ========================================================================

  // State context - changes trigger re-renders
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

  // Actions context - stable references, no re-renders
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

  // Combined context for backward compatibility
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
        </FavoritesContext.Provider>
      </FavoritesActionsContext.Provider>
    </FavoritesStateContext.Provider>
  );
};
