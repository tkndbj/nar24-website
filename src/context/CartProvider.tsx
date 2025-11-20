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
  onSnapshot,
  writeBatch,
  serverTimestamp,
  query,
  orderBy,
  limit,
  startAfter,
  DocumentSnapshot,
  QuerySnapshot,
  QueryDocumentSnapshot,
  DocumentChange,
  getDoc,
  getDocs,
  Timestamp,
  FieldValue,
  Firestore,
  deleteDoc,
  updateDoc,
  setDoc,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { ProductUtils, Product } from "@/app/models/Product";
import RedisService from "@/services/redis_service";
import { httpsCallable, Functions } from "firebase/functions";
import metricsEventService from "@/services/cartfavoritesmetricsEventService";

// ============================================================================
// TYPES - Matching Flutter implementation
// ============================================================================

interface CartUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

interface SalePreferences {
  discountThreshold?: number;
  bulkDiscountPercentage?: number;
  maxQuantity?: number;
}

interface CartData {
  quantity: number;
  addedAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
  sellerId: string;
  sellerName: string;
  isShop: boolean;
  unitPrice?: number;
  currency?: string;
  selectedColor?: string;
  selectedSize?: string;
  selectedMetres?: number;
  // Cached values for validation
  cachedPrice?: number;
  cachedBundlePrice?: number;
  cachedDiscountPercentage?: number;
  cachedDiscountThreshold?: number;
  cachedBulkDiscountPercentage?: number;
  cachedMaxQuantity?: number;
  [key: string]: unknown;
}

interface CartItem {
  productId: string;
  cartData: CartData;
  product: Product | null;
  quantity: number;
  sellerName: string;
  sellerId: string;
  isShop: boolean;
  isOptimistic?: boolean;
  salePreferences?: SalePreferences | null;
  selectedColorImage?: string;
  showSellerHeader?: boolean;
  [key: string]: unknown;
}

interface CartAttributes {
  [key: string]: unknown;
}

export interface CartTotals {
  total: number;
  currency: string;
  items: CartItemTotal[];
}

export interface CartItemTotal {
  productId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  isBundleItem?: boolean;
}

// Type for cart data from Firestore
interface FirestoreCartData {
  [key: string]: unknown;
}

// Type for optimistic cache entries
interface OptimisticCacheEntry {
  _deleted?: boolean;
  _optimistic?: boolean;
  [key: string]: unknown;
}

// Type for validated items from payment validation
interface ValidatedCartItem {
  productId: string;
  unitPrice?: number;
  bundlePrice?: number;
  discountPercentage?: number;
  discountThreshold?: number;
  bulkDiscountPercentage?: number;
  maxQuantity?: number;
  [key: string]: unknown;
}

// Type for validation errors/warnings
interface ValidationMessage {
  key: string;
  params: Record<string, unknown>;
}

// Type for bundle data items
interface BundleDataItem {
  bundlePrice?: number;
  [key: string]: unknown;
}

interface CartContextType {
  // State
  cartCount: number;
  cartProductIds: Set<string>;
  cartItems: CartItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  isInitialized: boolean;

  // Methods
  addProductToCart: (
    product: Product,
    quantity?: number,
    selectedColor?: string,
    attributes?: CartAttributes
  ) => Promise<string>;
  addToCartById: (
    productId: string,
    quantity?: number,
    selectedColor?: string,
    attributes?: CartAttributes
  ) => Promise<string>;
  removeFromCart: (productId: string) => Promise<string>;
  updateQuantity: (productId: string, newQuantity: number) => Promise<string>;
  removeMultipleFromCart: (productIds: string[]) => Promise<string>;
  initializeCartIfNeeded: () => Promise<void>;
  loadMoreItems: () => Promise<void>;
  calculateCartTotals: (selectedProductIds?: string[]) => Promise<CartTotals>;
  validateForPayment: (
    selectedProductIds: string[],
    reserveStock?: boolean
  ) => Promise<{
    isValid: boolean;
    errors: Record<string, ValidationMessage>;
    warnings: Record<string, ValidationMessage>;
    validatedItems: ValidatedCartItem[];
  }>;
  updateCartCacheFromValidation: (
    validatedItems: ValidatedCartItem[]
  ) => Promise<boolean>;
  refresh: () => Promise<void>;
  enableLiveUpdates: () => void;
  disableLiveUpdates: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};

// ============================================================================
// RATE LIMITER - Matching Flutter implementation
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
// CONSTANTS - Matching Flutter implementation
// ============================================================================

const ITEMS_PER_PAGE = 20;
const OPTIMISTIC_TIMEOUT = 3000; // 3 seconds like Flutter
const ADD_TO_CART_COOLDOWN = 300; // 300ms like Flutter
const QUANTITY_UPDATE_COOLDOWN = 200; // 200ms like Flutter

interface CartProviderProps {
  children: ReactNode;
  user: CartUser | User | null;
  db: Firestore;
  functions: Functions;
}

export const CartProvider: React.FC<CartProviderProps> = ({
  children,
  user,
  db,
  functions,
}) => {
  // ========================================================================
  // STATE - Matching Flutter ValueNotifiers
  // ========================================================================

  const [cartProductIds, setCartProductIds] = useState<Set<string>>(new Set());
  const [cartCount, setCartCount] = useState(0);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // ========================================================================
  // REFS - Internal state management
  // ========================================================================

  const lastDocumentRef = useRef<DocumentSnapshot | null>(null);
  const isInitializingRef = useRef(false);
  const unsubscribeCartRef = useRef<(() => void) | null>(null);

  // Rate limiters
  const addToCartLimiterRef = useRef(new RateLimiter(ADD_TO_CART_COOLDOWN));
  const quantityLimiterRef = useRef(new RateLimiter(QUANTITY_UPDATE_COOLDOWN));

  // Optimistic updates tracking
  const optimisticCacheRef = useRef<Map<string, OptimisticCacheEntry>>(
    new Map()
  );
  const optimisticTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Concurrency control
  const quantityUpdateLocksRef = useRef<Map<string, Promise<string>>>(
    new Map()
  );
  const pendingFetchesRef = useRef<Map<string, Promise<unknown>>>(new Map());

  // Redis service instance
  const redisRef = useRef(RedisService);

  // ========================================================================
  // HELPER FUNCTIONS
  // ========================================================================

  const getProductShopId = useCallback(
    async (productId: string): Promise<string | null> => {
      try {
        // Try shop_products collection first
        const shopProductDoc = await getDoc(
          doc(db, "shop_products", productId)
        );

        if (shopProductDoc.exists()) {
          const data = shopProductDoc.data();
          return (data?.shopId as string) || null;
        }

        // Try products collection
        const productDoc = await getDoc(doc(db, "products", productId));

        if (productDoc.exists()) {
          const data = productDoc.data();
          return (data?.shopId as string) || null;
        }

        return null;
      } catch (error) {
        console.warn("⚠️ Failed to get product shopId:", error);
        return null;
      }
    },
    [db]
  );

  const clearOptimisticUpdate = useCallback((productId: string) => {
    optimisticCacheRef.current.delete(productId);
    const timer = optimisticTimeoutsRef.current.get(productId);
    if (timer) {
      clearTimeout(timer);
      optimisticTimeoutsRef.current.delete(productId);
    }
  }, []);

  const hasRequiredFields = useCallback(
    (cartData: FirestoreCartData): boolean => {
      const required = [
        "productId",
        "productName",
        "unitPrice",
        "availableStock",
        "sellerName",
        "sellerId",
      ];

      for (const field of required) {
        if (!cartData[field]) return false;
      }

      const productName = cartData.productName;
      if (!productName || productName === "Unknown Product") return false;

      const sellerName = cartData.sellerName;
      if (!sellerName || sellerName === "Unknown") return false;

      return true;
    },
    []
  );

  const buildProductFromCartData = useCallback(
    (cartData: FirestoreCartData): Product => {
      // Safe getters matching Flutter implementation
      const safeGet = <T,>(key: string, defaultValue: T): T => {
        const value = cartData[key];
        if (value === null || value === undefined) return defaultValue;

        if (typeof defaultValue === "number") {
          if (typeof value === "number") return value as T;
          if (typeof value === "string") {
            const parsed =
              defaultValue % 1 === 0 ? parseInt(value) : parseFloat(value);
            return (isNaN(parsed) ? defaultValue : parsed) as T;
          }
        }

        if (typeof defaultValue === "string") return String(value) as T;
        if (typeof defaultValue === "boolean") {
          if (typeof value === "boolean") return value as T;
          return (String(value).toLowerCase() === "true") as T;
        }

        return value as T;
      };

      const safeStringList = (key: string): string[] => {
        const value = cartData[key];
        if (!value) return [];
        if (Array.isArray(value)) return value.map((e) => String(e));
        if (typeof value === "string" && value) return [value];
        return [];
      };

      const safeColorImages = (key: string): Record<string, string[]> => {
        const value = cartData[key];
        if (!value || typeof value !== "object") return {};

        const result: Record<string, string[]> = {};
        Object.entries(value).forEach(([k, v]) => {
          if (Array.isArray(v)) {
            result[k] = v.map((e) => String(e));
          } else if (typeof v === "string" && v) {
            result[k] = [v];
          }
        });
        return result;
      };

      const safeColorQuantities = (key: string): Record<string, number> => {
        const value = cartData[key];
        if (!value || typeof value !== "object") return {};

        const result: Record<string, number> = {};
        Object.entries(value).forEach(([k, v]) => {
          if (typeof v === "number") {
            result[k] = v;
          } else if (typeof v === "string") {
            result[k] = parseInt(v) || 0;
          }
        });
        return result;
      };

      const safeBundleData = (key: string): BundleDataItem[] | undefined => {
        const value = cartData[key];
        if (!value || !Array.isArray(value)) return undefined;

        try {
          return value.map((item): BundleDataItem => {
            if (typeof item === "object" && item !== null) {
              return item as BundleDataItem;
            }
            return {};
          });
        } catch {
          return undefined;
        }
      };

      const safeTimestamp = (key: string): Timestamp => {
        const value = cartData[key];
        if (value instanceof Timestamp) return value;
        if (typeof value === "number") return Timestamp.fromMillis(value);
        if (typeof value === "string") {
          try {
            return Timestamp.fromDate(new Date(value));
          } catch {}
        }
        return Timestamp.now();
      };

      // Build Product object
      const imageUrls = safeStringList("allImages");
      return ProductUtils.fromJson({
        id: safeGet("productId", ""),
        productName: safeGet("productName", "Unknown Product"),
        description: safeGet("description", ""),
        price: safeGet("unitPrice", 0),
        currency: safeGet("currency", "TL"),
        originalPrice: cartData.originalPrice ?? undefined,
        discountPercentage: cartData.discountPercentage ?? undefined,
        condition: safeGet("condition", "Brand New"),
        brandModel: safeGet("brandModel", ""),
        category: safeGet("category", "Uncategorized"),
        subcategory: safeGet("subcategory", ""),
        subsubcategory: safeGet("subsubcategory", ""),
        imageUrls:
          imageUrls.length > 0 ? imageUrls : [safeGet("productImage", "")],
        colorImages: safeColorImages("colorImages"),
        videoUrl: cartData.videoUrl ?? undefined,
        quantity: safeGet("availableStock", 0),
        colorQuantities: safeColorQuantities("colorQuantities"),
        averageRating: safeGet("averageRating", 0),
        reviewCount: safeGet("reviewCount", 0),
        maxQuantity: cartData.maxQuantity ?? undefined,
        discountThreshold: cartData.discountThreshold ?? undefined,
        bulkDiscountPercentage: cartData.bulkDiscountPercentage ?? undefined,
        bundleIds: safeStringList("bundleIds"),
        bundleData:
          safeBundleData("bundleData") ?? safeBundleData("cachedBundleData"),
        userId: safeGet("sellerId", ""),
        ownerId: safeGet("sellerId", ""),
        shopId:
          cartData.isShop === true ? safeGet("sellerId", undefined) : undefined,
        sellerName: safeGet("sellerName", "Unknown"),
        ilanNo: safeGet("ilanNo", "N/A"),
        createdAt: safeTimestamp("createdAt"),
        deliveryOption: safeGet("deliveryOption", "Self Delivery"),
        availableColors: safeStringList("availableColors"),
        attributes: cartData.attributes ?? {},
        reference: {
          id: safeGet("productId", ""),
          path: `shop_products/${safeGet("productId", "")}`,
          parent: { id: "shop_products" },
        },
      });
    },
    []
  );

  const extractSalePreferences = useCallback(
    (data: FirestoreCartData): SalePreferences | null => {
      const salePrefs: SalePreferences = {};

      if (data.maxQuantity !== undefined && data.maxQuantity !== null) {
        salePrefs.maxQuantity = data.maxQuantity as number;
      }
      if (
        data.discountThreshold !== undefined &&
        data.discountThreshold !== null
      ) {
        salePrefs.discountThreshold = data.discountThreshold as number;
      }
      if (
        data.bulkDiscountPercentage !== undefined &&
        data.bulkDiscountPercentage !== null
      ) {
        salePrefs.bulkDiscountPercentage =
          data.bulkDiscountPercentage as number;
      }

      return Object.keys(salePrefs).length === 0 ? null : salePrefs;
    },
    []
  );

  const resolveColorImage = useCallback(
    (product: Product, selectedColor?: string): string | undefined => {
      if (!selectedColor || !product.colorImages?.[selectedColor]) {
        return undefined;
      }

      const images = product.colorImages[selectedColor];
      return images?.[0];
    },
    []
  );

  const createCartItem = useCallback(
    (
      productId: string,
      cartData: FirestoreCartData,
      product: Product
    ): CartItem => {
      const salePreferences = extractSalePreferences(cartData);

      return {
        product,
        productId,
        quantity: (cartData.quantity as number) ?? 1,
        salePreferences,
        selectedColorImage: resolveColorImage(
          product,
          cartData.selectedColor as string | undefined
        ),
        sellerName: (cartData.sellerName as string) ?? "Unknown",
        sellerId: (cartData.sellerId as string) ?? "unknown",
        isShop: (cartData.isShop as boolean) ?? false,
        cartData: cartData as CartData,
        isOptimistic: false,
      };
    },
    [extractSalePreferences, resolveColorImage]
  );

  const sortCartItems = useCallback((items: CartItem[]) => {
    items.sort((a, b) => {
      // Group by seller
      const sellerA = a.sellerId ?? "";
      const sellerB = b.sellerId ?? "";
      if (sellerA !== sellerB) return sellerA.localeCompare(sellerB);

      // Then by added date
      const dateA = a.cartData.addedAt as Timestamp;
      const dateB = b.cartData.addedAt as Timestamp;
      if (!dateA || !dateB) return 0;
      return dateB.toMillis() - dateA.toMillis();
    });

    // Add seller headers
    let lastSeller: string | null = null;
    items.forEach((item) => {
      const sellerId = item.sellerId ?? "";
      item.showSellerHeader = sellerId !== lastSeller;
      lastSeller = sellerId;
    });
  }, []);

  // ========================================================================
  // REAL-TIME LISTENER - Matching Flutter implementation
  // ========================================================================

  const updateCartIds = useCallback((docs: QueryDocumentSnapshot[]) => {
    const ids = new Set(docs.map((doc) => doc.id));

    // Apply optimistic updates
    const effectiveIds = new Set(ids);
    optimisticCacheRef.current.forEach((value, key) => {
      if (value._deleted === true) {
        effectiveIds.delete(key);
      } else {
        effectiveIds.add(key);
      }
    });

    setCartProductIds(effectiveIds);
    setCartCount(effectiveIds.size);
  }, []);

  const processCartChanges = useCallback(
    async (changes: DocumentChange<FirestoreCartData>[]) => {
      const itemsMap = new Map<string, CartItem>();

      // Start with current items (exclude optimistic ones)
      cartItems.forEach((item) => {
        if (!item.isOptimistic) {
          itemsMap.set(item.productId, item);
        }
      });

      // Process changes
      for (const change of changes) {
        const productId = change.doc.id;
        const cartData = change.doc.data();

        if (change.type === "added" || change.type === "modified") {
          if (cartData && hasRequiredFields(cartData)) {
            try {
              const product = buildProductFromCartData(cartData);
              itemsMap.set(
                productId,
                createCartItem(productId, cartData, product)
              );
              clearOptimisticUpdate(productId);
            } catch (error) {
              console.error(`Failed to process ${productId}:`, error);
            }
          }
        } else if (change.type === "removed") {
          itemsMap.delete(productId);
          clearOptimisticUpdate(productId);
        }
      }

      // Deduplicate by productId
      const uniqueItems = Array.from(itemsMap.values());
      sortCartItems(uniqueItems);
      setCartItems(uniqueItems);

      // Invalidate Redis cache
      if (user) {
        redisRef.current.invalidateCartTotals(user.uid);
      }
    },
    [
      cartItems,
      hasRequiredFields,
      buildProductFromCartData,
      createCartItem,
      clearOptimisticUpdate,
      sortCartItems,
      user,
    ]
  );

  const handleRealtimeUpdate = useCallback(
    (snapshot: QuerySnapshot) => {
      // Skip during initialization
      if (isInitializingRef.current) {
        console.log("⏭️ Skipping listener (initializing)");
        return;
      }

      if (snapshot.metadata.fromCache) {
        console.log("⏭️ Skipping cache event");
        return;
      }

      console.log(
        `🔥 Real-time update: ${snapshot.docChanges().length} changes`
      );

      updateCartIds(snapshot.docs);

      if (snapshot.docChanges().length > 0) {
        processCartChanges(snapshot.docChanges());
      } else if (snapshot.docs.length === 0) {
        setCartItems([]);
      }
    },
    [updateCartIds, processCartChanges]
  );

  const enableLiveUpdates = useCallback(() => {
    if (!user) return;

    // Cancel existing listener
    if (unsubscribeCartRef.current) {
      unsubscribeCartRef.current();
      unsubscribeCartRef.current = null;
    }

    console.log("🔴 Enabling real-time cart listener");

    const cartQuery = query(collection(db, "users", user.uid, "cart"));

    unsubscribeCartRef.current = onSnapshot(
      cartQuery,
      { includeMetadataChanges: false },
      handleRealtimeUpdate,
      (error) => console.error("❌ Listener error:", error)
    );
  }, [user, db, handleRealtimeUpdate]);

  const disableLiveUpdates = useCallback(() => {
    console.log("🔴 Disabling cart listener");
    if (unsubscribeCartRef.current) {
      unsubscribeCartRef.current();
      unsubscribeCartRef.current = null;
    }
  }, []);

  // ========================================================================
  // INITIALIZATION
  // ========================================================================

  const buildCartItemsFromDocs = useCallback(
    async (docs: QueryDocumentSnapshot[]) => {
      const items: CartItem[] = [];

      for (const doc of docs) {
        const cartData = doc.data();
        if (hasRequiredFields(cartData)) {
          try {
            const product = buildProductFromCartData(cartData);
            items.push(createCartItem(doc.id, cartData, product));
          } catch (error) {
            console.error(`Failed to build item ${doc.id}:`, error);
          }
        }
      }

      sortCartItems(items);
      setCartItems(items);
      updateCartIds(docs);
    },
    [
      hasRequiredFields,
      buildProductFromCartData,
      createCartItem,
      sortCartItems,
      updateCartIds,
    ]
  );

  const initializeCartIfNeeded = useCallback(async () => {
    if (!user || isInitialized) return;

    if (pendingFetchesRef.current.has("init")) {
      console.log("⏳ Already initializing, waiting...");
      await pendingFetchesRef.current.get("init");
      return;
    }

    const initPromise = (async () => {
      setIsLoading(true);
      isInitializingRef.current = true;

      // Clear existing items
      setCartItems([]);
      setCartProductIds(new Set());
      setCartCount(0);

      // Reset pagination state
      lastDocumentRef.current = null;
      setHasMore(true);

      try {
        const cartQuery = query(
          collection(db, "users", user.uid, "cart"),
          orderBy("addedAt", "desc"),
          limit(ITEMS_PER_PAGE)
        );

        const snapshot = await getDocs(cartQuery);

        await buildCartItemsFromDocs(snapshot.docs);

        if (snapshot.docs.length > 0) {
          lastDocumentRef.current = snapshot.docs[snapshot.docs.length - 1];
          setHasMore(snapshot.docs.length >= ITEMS_PER_PAGE);
        }

        setIsInitialized(true);

        // Enable listener AFTER initialization
        enableLiveUpdates();
      } catch (error) {
        console.error("❌ Init error:", error);
      } finally {
        setIsLoading(false);
        isInitializingRef.current = false;
      }
    })();

    pendingFetchesRef.current.set("init", initPromise);
    await initPromise;
    pendingFetchesRef.current.delete("init");
  }, [user, isInitialized, db, buildCartItemsFromDocs, enableLiveUpdates]);

  // ========================================================================
  // ADD TO CART - Matching Flutter implementation
  // ========================================================================

  const buildProductDataForCart = useCallback(
    (
      product: Product,
      selectedColor?: string,
      attributes?: CartAttributes
    ): Record<string, unknown> => {
      let extractedBundlePrice: number | undefined;
      if (product.bundleData && product.bundleData.length > 0) {
        const bundlePrice = product.bundleData[0]?.bundlePrice;
        extractedBundlePrice =
          typeof bundlePrice === "number" ? bundlePrice : undefined;
      }

      return {
        productId: product.id,
        productName: product.productName,
        description: product.description,
        unitPrice: product.price,
        currency: product.currency,
        originalPrice: product.originalPrice,
        discountPercentage: product.discountPercentage,
        condition: product.condition,
        brandModel: product.brandModel,
        category: product.category,
        subcategory: product.subcategory,
        subsubcategory: product.subsubcategory,
        allImages: product.imageUrls,
        productImage: product.imageUrls.length > 0 ? product.imageUrls[0] : "",
        colorImages: product.colorImages,
        videoUrl: product.videoUrl,
        availableStock: product.quantity,
        colorQuantities: product.colorQuantities,
        availableColors: product.availableColors,
        averageRating: product.averageRating,
        reviewCount: product.reviewCount,
        maxQuantity: product.maxQuantity,
        discountThreshold: product.discountThreshold,
        bulkDiscountPercentage: product.bulkDiscountPercentage,
        bundleIds: product.bundleIds,
        bundleData: product.bundleData,
        sellerId: product.userId,
        sellerName: product.sellerName,
        isShop: product.shopId != null,
        shopId: product.shopId,
        ilanNo: product.ilanNo,
        createdAt: product.createdAt,
        deliveryOption: product.deliveryOption,
        selectedColor,
        attributes,
        // Cached values for validation
        cachedPrice: product.price,
        cachedDiscountPercentage: product.discountPercentage,
        cachedDiscountThreshold: product.discountThreshold,
        cachedBundlePrice: extractedBundlePrice,
        cachedBulkDiscountPercentage: product.bulkDiscountPercentage,
        cachedMaxQuantity: product.maxQuantity,
      };
    },
    []
  );

  const backgroundRefreshTotals = useCallback(async () => {
    if (!user || cartProductIds.size === 0) return;

    try {
      await calculateCartTotals(Array.from(cartProductIds));
      console.log("⚡ Background totals cached");
    } catch (error) {
      console.log("⚠️ Background total refresh failed:", error);
    }
  }, [user, cartProductIds]);

  const applyOptimisticAdd = useCallback(
    (
      productId: string,
      productData: Record<string, unknown>,
      quantity: number
    ) => {
      clearOptimisticUpdate(productId);

      // Remove ALL existing items with this productId
      const existingItems = cartItems.filter(
        (item) => item.productId !== productId
      );

      // Mark as optimistic
      optimisticCacheRef.current.set(productId, {
        ...productData,
        quantity,
        _optimistic: true,
      });

      // Update IDs
      const newIds = new Set(cartProductIds);
      newIds.add(productId);
      setCartProductIds(newIds);
      setCartCount(newIds.size);

      // Add optimistic item at top
      try {
        const optimisticProduct = buildProductFromCartData(productData);
        const optimisticItem: CartItem = {
          ...createCartItem(productId, productData, optimisticProduct),
          isOptimistic: true,
        };

        setCartItems([optimisticItem, ...existingItems]);
      } catch (error) {
        console.error("Failed to create optimistic item:", error);
      }

      // Set timeout
      const timeout = setTimeout(() => {
        if (optimisticCacheRef.current.has(productId)) {
          console.log("⚠️ Optimistic timeout:", productId);
          clearOptimisticUpdate(productId);
        }
      }, OPTIMISTIC_TIMEOUT);

      optimisticTimeoutsRef.current.set(productId, timeout);
    },
    [
      cartItems,
      cartProductIds,
      clearOptimisticUpdate,
      buildProductFromCartData,
      createCartItem,
    ]
  );

  const rollbackOptimisticUpdate = useCallback(
    (productId: string) => {
      optimisticCacheRef.current.delete(productId);
      const timer = optimisticTimeoutsRef.current.get(productId);
      if (timer) {
        clearTimeout(timer);
        optimisticTimeoutsRef.current.delete(productId);
      }

      // Update IDs
      const newIds = new Set(cartProductIds);
      newIds.delete(productId);
      setCartProductIds(newIds);
      setCartCount(newIds.size);

      console.log("🔄 Rolled back optimistic update:", productId);
    },
    [cartProductIds]
  );

  const addProductToCart = useCallback(
    async (
      product: Product,
      quantity: number = 1,
      selectedColor?: string,
      attributes?: CartAttributes
    ): Promise<string> => {
      if (!user) return "Please log in first";

      // Rate limiting
      if (!addToCartLimiterRef.current.canProceed(`add_${product.id}`)) {
        return "Please wait before adding again";
      }

      const productData = buildProductDataForCart(
        product,
        selectedColor,
        attributes
      );

      try {
        // Optimistic update
        applyOptimisticAdd(product.id, productData, quantity);

        // Write to Firestore
        await setDoc(doc(db, "users", user.uid, "cart", product.id), {
          ...productData,
          quantity,
          addedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // ✅ ADD METRICS LOGGING (NEW)
        const shopId = await getProductShopId(product.id);
        metricsEventService.logCartAdded({
          productId: product.id,
          shopId,
        });

        console.log("✅ Added to cart:", product.id);

        // Invalidate totals cache
        redisRef.current.invalidateCartTotals(user.uid);

        // Background refresh totals
        backgroundRefreshTotals();

        return "Added to cart";
      } catch (error) {
        console.error("❌ Add to cart error:", error);
        rollbackOptimisticUpdate(product.id);
        return "Failed to add to cart";
      }
    },
    [
      user,
      db,
      buildProductDataForCart,
      applyOptimisticAdd,
      rollbackOptimisticUpdate,
      backgroundRefreshTotals,
      getProductShopId, // ✅ ADD THIS DEPENDENCY
    ]
  );

  const addToCartById = useCallback(
    async (
      productId: string,
      quantity: number = 1,
      selectedColor?: string,
      attributes?: CartAttributes
    ): Promise<string> => {
      if (!user) return "Please log in first";

      try {
        const productDoc = await getDoc(doc(db, "shop_products", productId));

        if (!productDoc.exists()) {
          return "Product not found";
        }

        const product = ProductUtils.fromJson({
          ...productDoc.data(),
          id: productDoc.id,
          reference: {
            id: productDoc.id,
            path: productDoc.ref.path,
            parent: { id: productDoc.ref.parent.id },
          },
        });

        return addProductToCart(product, quantity, selectedColor, attributes);
      } catch (error) {
        console.error("❌ Add to cart by ID error:", error);
        return "Failed to add to cart";
      }
    },
    [user, db, addProductToCart]
  );

  // ========================================================================
  // REMOVE FROM CART
  // ========================================================================

  const applyOptimisticRemove = useCallback(
    (productId: string) => {
      optimisticCacheRef.current.set(productId, { _deleted: true });

      // Update IDs immediately
      const newIds = new Set(cartProductIds);
      newIds.delete(productId);
      setCartProductIds(newIds);
      setCartCount(newIds.size);

      // Remove from items list
      setCartItems((items) =>
        items.filter((item) => item.productId !== productId)
      );

      // Set timeout
      const timeout = setTimeout(() => {
        optimisticCacheRef.current.delete(productId);
        optimisticTimeoutsRef.current.delete(productId);
      }, 5000);

      optimisticTimeoutsRef.current.set(productId, timeout);
    },
    [cartProductIds]
  );

  const rollbackOptimisticRemove = useCallback(
    async (productId: string) => {
      optimisticCacheRef.current.delete(productId);
      const timer = optimisticTimeoutsRef.current.get(productId);
      if (timer) {
        clearTimeout(timer);
        optimisticTimeoutsRef.current.delete(productId);
      }

      // Force refresh from Firestore
      if (user) {
        try {
          const docSnap = await getDoc(
            doc(db, "users", user.uid, "cart", productId)
          );
          if (docSnap.exists()) {
            const newIds = new Set(cartProductIds);
            newIds.add(productId);
            setCartProductIds(newIds);
            setCartCount(newIds.size);
          }
        } catch (error) {
          console.error("Failed to rollback remove:", error);
        }
      }
    },
    [user, db, cartProductIds]
  );

  const removeFromCart = useCallback(
    async (productId: string): Promise<string> => {
      if (!user) return "Please log in first";

      try {
        applyOptimisticRemove(productId);

        // ✅ GET SHOP ID BEFORE DELETION (NEW)
        const shopId = await getProductShopId(productId);

        await deleteDoc(doc(db, "users", user.uid, "cart", productId));

        // ✅ ADD METRICS LOGGING (NEW)
        metricsEventService.logCartRemoved({
          productId,
          shopId,
        });

        // Background refresh totals
        backgroundRefreshTotals();

        return "Removed from cart";
      } catch (error) {
        console.error("❌ Remove error:", error);
        rollbackOptimisticRemove(productId);
        return "Failed to remove from cart";
      }
    },
    [
      user,
      db,
      applyOptimisticRemove,
      rollbackOptimisticRemove,
      backgroundRefreshTotals,
      getProductShopId, // ✅ ADD THIS DEPENDENCY
    ]
  );

  // ========================================================================
  // UPDATE QUANTITY
  // ========================================================================

  const applyOptimisticQuantityChange = useCallback(
    (productId: string, newQuantity: number) => {
      setCartItems((items) => {
        const newItems = [...items];
        const indices: number[] = [];

        // Find ALL occurrences
        for (let i = 0; i < newItems.length; i++) {
          if (newItems[i].productId === productId) {
            indices.push(i);
          }
        }

        if (indices.length === 0) return items;

        // Keep only the first occurrence, update its quantity
        newItems[indices[0]] = {
          ...newItems[indices[0]],
          quantity: newQuantity,
        };

        // Remove duplicates
        for (let i = indices.length - 1; i > 0; i--) {
          newItems.splice(indices[i], 1);
        }

        return newItems;
      });
    },
    []
  );

  const updateQuantity = useCallback(
    async (productId: string, newQuantity: number): Promise<string> => {
      if (!user) return "Please log in first";

      if (newQuantity < 1) {
        return removeFromCart(productId);
      }

      // Rate limiting
      if (!quantityLimiterRef.current.canProceed(`qty_${productId}`)) {
        return "Please wait";
      }

      // Concurrency control
      if (quantityUpdateLocksRef.current.has(productId)) {
        return quantityUpdateLocksRef.current.get(productId)!;
      }

      const updatePromise = (async () => {
        try {
          // Optimistic update
          applyOptimisticQuantityChange(productId, newQuantity);

          // Update Firestore
          await updateDoc(doc(db, "users", user.uid, "cart", productId), {
            quantity: newQuantity,
            updatedAt: serverTimestamp(),
          });

          console.log("✅ Updated quantity:", productId, "=", newQuantity);

          // Invalidate totals cache
          redisRef.current.invalidateCartTotals(user.uid);

          // Background refresh totals
          backgroundRefreshTotals();

          return "Quantity updated";
        } catch (error) {
          console.error("❌ Update quantity error:", error);
          return "Failed to update quantity";
        } finally {
          quantityUpdateLocksRef.current.delete(productId);
        }
      })();

      quantityUpdateLocksRef.current.set(productId, updatePromise);
      return updatePromise;
    },
    [
      user,
      db,
      removeFromCart,
      applyOptimisticQuantityChange,
      backgroundRefreshTotals,
    ]
  );

  // ========================================================================
  // BATCH REMOVE
  // ========================================================================

  const removeMultipleFromCart = useCallback(
    async (productIds: string[]): Promise<string> => {
      if (!user) return "Please log in first";
      if (productIds.length === 0) return "No items selected";

      try {
        // ✅ STEP 1: Get all shopIds BEFORE deletion (NEW)
        const shopIds: Record<string, string | null> = {};
        for (const productId of productIds) {
          shopIds[productId] = await getProductShopId(productId);
        }

        // STEP 2: Optimistic removal
        productIds.forEach((productId) => applyOptimisticRemove(productId));

        // STEP 3: Batch delete from Firestore
        const batch = writeBatch(db);
        productIds.forEach((productId) => {
          batch.delete(doc(db, "users", user.uid, "cart", productId));
        });
        await batch.commit();

        // ✅ STEP 4: Log batch metrics (NEW)
        metricsEventService.logBatchCartRemovals({
          productIds,
          shopIds,
        });

        console.log(`✅ Removed ${productIds.length} items`);
        redisRef.current.invalidateCartTotals(user.uid);

        // Background refresh totals
        backgroundRefreshTotals();

        return "Products removed from cart";
      } catch (error) {
        console.error("❌ Batch remove error:", error);
        return "Failed to remove products";
      }
    },
    [
      user,
      db,
      applyOptimisticRemove,
      backgroundRefreshTotals,
      getProductShopId, // ✅ ADD THIS DEPENDENCY
    ]
  );

  // ========================================================================
  // REFRESH
  // ========================================================================

  const refresh = useCallback(async () => {
    if (!user) return;

    // Reset pagination
    lastDocumentRef.current = null;
    setHasMore(true);

    try {
      const cartQuery = query(
        collection(db, "users", user.uid, "cart"),
        orderBy("addedAt", "desc"),
        limit(ITEMS_PER_PAGE)
      );

      const snapshot = await getDocs(cartQuery);

      await buildCartItemsFromDocs(snapshot.docs);

      if (snapshot.docs.length > 0) {
        lastDocumentRef.current = snapshot.docs[snapshot.docs.length - 1];
        setHasMore(snapshot.docs.length >= ITEMS_PER_PAGE);
      }

      console.log("✅ Cart refreshed with pagination reset");
    } catch (error) {
      console.error("❌ Refresh error:", error);
    }
  }, [user, db, buildCartItemsFromDocs]);

  // ========================================================================
  // TOTALS CALCULATION - With Redis caching
  // ========================================================================

  const deepConvertMap = (map: unknown): Record<string, unknown> => {
    if (!map || typeof map !== "object" || Array.isArray(map)) {
      return {};
    }

    const result: Record<string, unknown> = {};
    Object.entries(map as Record<string, unknown>).forEach(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        result[key] = deepConvertMap(value);
      } else if (Array.isArray(value)) {
        result[key] = deepConvertList(value);
      } else {
        result[key] = value;
      }
    });
    return result;
  };

  const deepConvertList = (list: unknown[]): unknown[] => {
    return list.map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return deepConvertMap(item);
      } else if (Array.isArray(item)) {
        return deepConvertList(item);
      }
      return item;
    });
  };

  const calculateCartTotals = useCallback(
    async (selectedProductIds?: string[]): Promise<CartTotals> => {
      if (!user) {
        return { total: 0, items: [], currency: "TL" };
      }

      const productsToCalculate =
        selectedProductIds ?? cartItems.map((item) => item.productId);

      if (productsToCalculate.length === 0) {
        return { total: 0, items: [], currency: "TL" };
      }

      // Check Redis cache first
      const cached = await redisRef.current.getCachedTotals(
        user.uid,
        productsToCalculate
      );
      if (cached) {
        console.log("⚡ Cache hit - instant total");
        return {
          total: cached.total ?? 0,
          currency: cached.currency ?? "TL",
          items: cached.items ?? [],
        };
      }

      // Request deduplication
      const cacheKey = productsToCalculate.join(",");
      if (pendingFetchesRef.current.has(`totals_${cacheKey}`)) {
        console.log("⏳ Waiting for existing totals calculation...");
        const result = await pendingFetchesRef.current.get(
          `totals_${cacheKey}`
        );
        return result as CartTotals;
      }

      const totalsPromise = (async () => {
        try {
          console.log(
            `🔥 Calling Cloud Function for ${productsToCalculate.length} items`
          );

          const calculateCartTotalsFunction = httpsCallable(
            functions,
            "calculateCartTotals"
          );

          const result = await calculateCartTotalsFunction({
            selectedProductIds: productsToCalculate,
          });

          // Deep conversion of nested structures
          const rawData = result.data;
          const totalsData = deepConvertMap(rawData);

          console.log("✅ Converted totals data:", Object.keys(totalsData));

          const totals: CartTotals = {
            total: (totalsData.total as number) ?? 0,
            currency: (totalsData.currency as string) ?? "TL",
            items: (Array.isArray(totalsData.items)
              ? totalsData.items
              : []
            ).map((item): CartItemTotal => {
              const itemData = item as Record<string, unknown>;
              return {
                productId: (itemData.productId as string) ?? "",
                unitPrice: (itemData.unitPrice as number) ?? 0,
                total: (itemData.total as number) ?? 0,
                quantity: (itemData.quantity as number) ?? 1,
                isBundleItem: (itemData.isBundleItem as boolean) ?? false,
              };
            }),
          };

          // Cache result in Redis
          await redisRef.current.cacheTotals(
            user.uid,
            productsToCalculate,
            totalsData
          );

          console.log(
            `✅ Total calculated: ${totals.total} ${totals.currency}`
          );
          return totals;
        } catch (error) {
          console.error("❌ Cloud Function error:", error);
          // Return empty totals on error
          return { total: 0, items: [], currency: "TL" };
        }
      })();

      pendingFetchesRef.current.set(`totals_${cacheKey}`, totalsPromise);
      const result = await totalsPromise;
      pendingFetchesRef.current.delete(`totals_${cacheKey}`);

      return result;
    },
    [user, cartItems, functions]
  );

  // ========================================================================
  // VALIDATION
  // ========================================================================

  const validateForPayment = useCallback(
    async (
      selectedProductIds: string[],
      reserveStock: boolean = false
    ): Promise<{
      isValid: boolean;
      errors: Record<string, ValidationMessage>;
      warnings: Record<string, ValidationMessage>;
      validatedItems: ValidatedCartItem[];
    }> => {
      try {
        const itemsToValidate = cartItems
          .filter((item) => selectedProductIds.includes(item.productId))
          .map((item) => {
            const cartData = item.cartData;

            return {
              productId: item.productId,
              quantity: item.quantity ?? 1,
              selectedColor: cartData.selectedColor,
              cachedPrice: cartData.cachedPrice,
              cachedBundlePrice: cartData.cachedBundlePrice,
              cachedDiscountPercentage: cartData.cachedDiscountPercentage,
              cachedDiscountThreshold: cartData.cachedDiscountThreshold,
              cachedBulkDiscountPercentage:
                cartData.cachedBulkDiscountPercentage,
              cachedMaxQuantity: cartData.cachedMaxQuantity,
            };
          });

        const validateCartCheckoutFunction = httpsCallable(
          functions,
          "validateCartCheckout"
        );

        const result = await validateCartCheckoutFunction({
          cartItems: itemsToValidate,
          reserveStock,
        });

        const rawData = result.data;
        const data = deepConvertMap(rawData);

        return {
          isValid: (data.isValid as boolean) ?? false,
          errors: (data.errors as Record<string, ValidationMessage>) ?? {},
          warnings: (data.warnings as Record<string, ValidationMessage>) ?? {},
          validatedItems: (data.validatedItems as ValidatedCartItem[]) ?? [],
        };
      } catch (error) {
        console.error("❌ Validation error:", error);
        return {
          isValid: false,
          errors: { _system: { key: "validation_failed", params: {} } },
          warnings: {},
          validatedItems: [],
        };
      }
    },
    [cartItems, functions]
  );

  const updateCartCacheFromValidation = useCallback(
    async (validatedItems: ValidatedCartItem[]): Promise<boolean> => {
      if (!user) return false;

      try {
        console.log(
          `🔄 Updating cart cache for ${validatedItems.length} items...`
        );

        const updates = validatedItems.map((item) => ({
          productId: item.productId?.toString(),
          updates: {
            cachedPrice: item.unitPrice,
            cachedBundlePrice: item.bundlePrice,
            cachedDiscountPercentage: item.discountPercentage,
            cachedDiscountThreshold: item.discountThreshold,
            cachedBulkDiscountPercentage: item.bulkDiscountPercentage,
            cachedMaxQuantity: item.maxQuantity,
            unitPrice: item.unitPrice,
            bundlePrice: item.bundlePrice,
            discountPercentage: item.discountPercentage,
            discountThreshold: item.discountThreshold,
            bulkDiscountPercentage: item.bulkDiscountPercentage,
            maxQuantity: item.maxQuantity,
          },
        }));

        const updateCartCacheFunction = httpsCallable(
          functions,
          "updateCartCache"
        );

        const result = await updateCartCacheFunction({
          productUpdates: updates,
        });

        const data = deepConvertMap(result.data);

        console.log(`✅ Cache updated: ${data.updated as number} items`);

        return (data.success as boolean) === true;
      } catch (error) {
        console.error("❌ Cache update error:", error);
        return false;
      }
    },
    [user, functions]
  );

  // ========================================================================
  // LOAD MORE (Pagination)
  // ========================================================================

  const loadMoreItems = useCallback(async () => {
    if (!user || !hasMore || isLoadingMore) return;

    if (pendingFetchesRef.current.has("loadMore")) {
      console.log("⏳ Already loading more...");
      return;
    }

    const loadMorePromise = (async () => {
      setIsLoadingMore(true);

      try {
        let cartQuery = query(
          collection(db, "users", user.uid, "cart"),
          orderBy("addedAt", "desc"),
          limit(ITEMS_PER_PAGE)
        );

        if (lastDocumentRef.current) {
          cartQuery = query(cartQuery, startAfter(lastDocumentRef.current));
        }

        const snapshot = await getDocs(cartQuery);

        if (snapshot.docs.length === 0) {
          setHasMore(false);
          console.log("📄 No more items to load");
          return;
        }

        lastDocumentRef.current = snapshot.docs[snapshot.docs.length - 1];
        setHasMore(snapshot.docs.length >= ITEMS_PER_PAGE);

        const newItems: CartItem[] = [];
        for (const doc of snapshot.docs) {
          const cartData = doc.data();
          if (hasRequiredFields(cartData)) {
            try {
              const product = buildProductFromCartData(cartData);
              newItems.push(createCartItem(doc.id, cartData, product));
            } catch (error) {
              console.error(`Failed to build item ${doc.id}:`, error);
            }
          }
        }

        // Deduplication
        const existingIds = new Set(cartItems.map((item) => item.productId));
        const uniqueNewItems = newItems.filter(
          (item) => !existingIds.has(item.productId)
        );

        if (uniqueNewItems.length > 0) {
          const allItems = [...cartItems, ...uniqueNewItems];
          sortCartItems(allItems);
          setCartItems(allItems);

          console.log(
            `✅ Loaded ${uniqueNewItems.length} more items (${
              newItems.length - uniqueNewItems.length
            } duplicates skipped)`
          );
        } else {
          console.log(`⚠️ All ${newItems.length} items already loaded`);
        }
      } catch (error) {
        console.error("❌ Load more error:", error);
      } finally {
        setIsLoadingMore(false);
      }
    })();

    pendingFetchesRef.current.set("loadMore", loadMorePromise);
    await loadMorePromise;
    pendingFetchesRef.current.delete("loadMore");
  }, [
    user,
    hasMore,
    isLoadingMore,
    db,
    cartItems,
    hasRequiredFields,
    buildProductFromCartData,
    createCartItem,
    sortCartItems,
  ]);

  // ========================================================================
  // EFFECTS
  // ========================================================================

  // Clear data on user logout
  useEffect(() => {
    if (!user) {
      disableLiveUpdates();
      setCartCount(0);
      setCartProductIds(new Set());
      setCartItems([]);
      setIsInitialized(false);
      setIsLoading(false);
      optimisticCacheRef.current.clear();
      optimisticTimeoutsRef.current.forEach((timer) => clearTimeout(timer));
      optimisticTimeoutsRef.current.clear();
      quantityUpdateLocksRef.current.clear();
    }
  }, [user, disableLiveUpdates]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disableLiveUpdates();
      optimisticTimeoutsRef.current.forEach((timer) => clearTimeout(timer));
      optimisticTimeoutsRef.current.clear();
    };
  }, [disableLiveUpdates]);

  // ========================================================================
  // CONTEXT VALUE
  // ========================================================================

  const contextValue = useMemo<CartContextType>(
    () => ({
      // State
      cartCount,
      cartProductIds,
      cartItems,
      isLoading,
      isLoadingMore,
      hasMore,
      isInitialized,

      // Methods
      addProductToCart,
      addToCartById,
      removeFromCart,
      updateQuantity,
      removeMultipleFromCart,
      initializeCartIfNeeded,
      loadMoreItems,
      calculateCartTotals,
      validateForPayment,
      updateCartCacheFromValidation,
      refresh,
      enableLiveUpdates,
      disableLiveUpdates,
    }),
    [
      cartCount,
      cartProductIds,
      cartItems,
      isLoading,
      isLoadingMore,
      hasMore,
      isInitialized,
      addProductToCart,
      addToCartById,
      removeFromCart,
      updateQuantity,
      removeMultipleFromCart,
      initializeCartIfNeeded,
      loadMoreItems,
      calculateCartTotals,
      validateForPayment,
      updateCartCacheFromValidation,
      refresh,
      enableLiveUpdates,
      disableLiveUpdates,
    ]
  );

  return (
    <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>
  );
};
