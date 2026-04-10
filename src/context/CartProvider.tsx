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
  orderBy,
  limit,
  startAfter,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  getDoc,
  Timestamp,
  FieldValue,
  Firestore,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDocsFromServer,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { ProductUtils, Product } from "@/app/models/Product";
import { httpsCallable, Functions } from "firebase/functions";
import cartTotalsCache from "@/services/cart_totals_cache";
import metricsEventService from "@/services/cartfavoritesmetricsEventService";
import { userActivityService } from "@/services/userActivity";
import { trackReads } from "@/lib/firestore-read-tracker";
import { useUser } from "./UserProvider";
import LimitReachedModal from "@/app/components/LimitReachedModal";

const MAX_CART_ITEMS = 300;

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

  // ✅ MATCH FLUTTER NAMING
  salePreferenceInfo?: SalePreferences | null; // New - matches Flutter
  selectedAttributes?: Record<string, unknown>; // New - matches Flutter

  // Deprecated (keep for backward compatibility)
  salePreferences?: SalePreferences | null;

  selectedColorImage?: string;
  showSellerHeader?: boolean;
  selectedColor?: string; // Flattened for display
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

// ============================================================================
// SPLIT CONTEXT TYPES - For granular subscriptions
// ============================================================================

// State-only context type (changes frequently)
interface CartStateContextType {
  cartCount: number;
  cartProductIds: Set<string>;
  cartItems: CartItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  isInitialized: boolean;
}

// Actions-only context type (stable references, never causes re-renders)
interface CartActionsContextType {
  addProductToCart: (
    product: Product,
    quantity?: number,
    selectedColor?: string,
    attributes?: CartAttributes,
  ) => Promise<string>;
  addToCartById: (
    productId: string,
    quantity?: number,
    selectedColor?: string,
    attributes?: CartAttributes,
  ) => Promise<string>;
  removeFromCart: (productId: string) => Promise<string>;
  updateQuantity: (productId: string, newQuantity: number) => Promise<string>;
  removeMultipleFromCart: (productIds: string[]) => Promise<string>;
  initializeCartIfNeeded: () => Promise<void>;
  loadMoreItems: () => Promise<void>;
  calculateCartTotals: (excludedProductIds?: string[]) => Promise<CartTotals>;
  validateForPayment: (
    selectedProductIds: string[],
    reserveStock?: boolean,
  ) => Promise<{
    isValid: boolean;
    errors: Record<string, ValidationMessage>;
    warnings: Record<string, ValidationMessage>;
    validatedItems: ValidatedCartItem[];
  }>;
  updateCartCacheFromValidation: (
    validatedItems: ValidatedCartItem[],
  ) => Promise<boolean>;
  refresh: () => Promise<void>;
}

// Combined context type (for backward compatibility)
interface CartContextType
  extends CartStateContextType, CartActionsContextType {}

// Create separate contexts
const CartStateContext = createContext<CartStateContextType | undefined>(
  undefined,
);
const CartActionsContext = createContext<CartActionsContextType | undefined>(
  undefined,
);

// Combined context for backward compatibility
const CartContext = createContext<CartContextType | undefined>(undefined);

/**
 * Hook to access only cart state (will re-render on state changes)
 */
export const useCartState = (): CartStateContextType => {
  const context = useContext(CartStateContext);
  if (context === undefined) {
    throw new Error("useCartState must be used within a CartProvider");
  }
  return context;
};

/**
 * Hook to access only cart actions (stable, never re-renders)
 */
export const useCartActions = (): CartActionsContextType => {
  const context = useContext(CartActionsContext);
  if (context === undefined) {
    throw new Error("useCartActions must be used within a CartProvider");
  }
  return context;
};

/**
 * Combined hook for backward compatibility - returns both state and actions
 * PREFER useCartState() or useCartActions() for better performance
 */
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
  db: Firestore | null;
  functions: Functions | null;
}

export const buildProductDataForCart = (
  product: Product,
  selectedColor?: string,
  attributes?: CartAttributes,
): Record<string, unknown> => {
  let extractedBundlePrice: number | undefined;
  if (product.bundleData && product.bundleData.length > 0) {
    const bundlePrice = product.bundleData[0]?.bundlePrice;
    extractedBundlePrice =
      typeof bundlePrice === "number" ? bundlePrice : undefined;
  }

  const data: Record<string, unknown> = {
    productId: product.id || "",
    productSource: product.shopId != null ? "shop_products" : "products",
    productName: product.productName || "Product",
    description: product.description || "",
    unitPrice: typeof product.price === "number" ? product.price : 0,
    currency: product.currency || "TL",
    condition: product.condition || "New",
    brandModel: product.brandModel || "",
    category: product.category || "Uncategorized",
    subcategory: product.subcategory || "",
    subsubcategory: product.subsubcategory || "",
    gender: product.gender || "",
    allImages: Array.isArray(product.imageUrls) ? product.imageUrls : [],
    productImage:
      Array.isArray(product.imageUrls) && product.imageUrls.length > 0
        ? product.imageUrls[0]
        : "",
    availableStock: typeof product.quantity === "number" ? product.quantity : 0,
    averageRating:
      typeof product.averageRating === "number" ? product.averageRating : 0,
    reviewCount:
      typeof product.reviewCount === "number" ? product.reviewCount : 0,

    sellerId: product.userId || product.shopId || product.ownerId || "",
    sellerName: product.sellerName || "",
    isShop: product.shopId != null,
    ilanNo: product.ilanNo || product.id || "N/A",
    createdAt: product.createdAt || Timestamp.now(),
    deliveryOption: product.deliveryOption || "Standard",
    cachedPrice: typeof product.price === "number" ? product.price : 0,

    originalPrice: product.originalPrice ?? null,
    discountPercentage: product.discountPercentage ?? null,
    discountThreshold: product.discountThreshold ?? null,
    bulkDiscountPercentage: product.bulkDiscountPercentage ?? null,
    videoUrl: product.videoUrl ?? null,
  };

  // ✅ Cached discount fields
  if (product.discountPercentage !== undefined) {
    data.cachedDiscountPercentage = product.discountPercentage;
  } else {
    data.cachedDiscountPercentage = null;
  }

  if (product.discountThreshold !== undefined) {
    data.cachedDiscountThreshold = product.discountThreshold;
  } else {
    data.cachedDiscountThreshold = null;
  }

  if (product.bulkDiscountPercentage !== undefined) {
    data.cachedBulkDiscountPercentage = product.bulkDiscountPercentage;
  } else {
    data.cachedBulkDiscountPercentage = null;
  }

  if (product.colorImages && Object.keys(product.colorImages).length > 0) {
    data.colorImages = product.colorImages;
  }

  if (
    product.colorQuantities &&
    Object.keys(product.colorQuantities).length > 0
  ) {
    data.colorQuantities = product.colorQuantities;
  }

  if (product.availableColors && product.availableColors.length > 0) {
    data.availableColors = product.availableColors;
  }

  if (product.maxQuantity !== undefined && product.maxQuantity !== null) {
    data.maxQuantity = product.maxQuantity;
    data.cachedMaxQuantity = product.maxQuantity;
  }

  if (product.bundleIds && product.bundleIds.length > 0) {
    data.bundleIds = product.bundleIds;
  }

  if (product.bundleData && product.bundleData.length > 0) {
    data.bundleData = product.bundleData;
  }

  if (extractedBundlePrice !== undefined) {
    data.cachedBundlePrice = extractedBundlePrice;
  }

  if (product.shopId) {
    data.shopId = product.shopId;
  }

  // ✅ Add selectedColor at ROOT level (matching Flutter)
  if (selectedColor) {
    data.selectedColor = selectedColor;
  }

  // ✅ Build attributes WITHOUT selectedColor
  if (attributes && Object.keys(attributes).length > 0) {
    const attributesMap = { ...attributes };

    // Add selectedColorImage to attributes if color exists
    if (selectedColor && product.colorImages?.[selectedColor]) {
      const colorImages = product.colorImages[selectedColor];
      if (colorImages && colorImages.length > 0) {
        attributesMap.selectedColorImage = colorImages[0];
      }
    }

    data.attributes = attributesMap;
  } else if (selectedColor && product.colorImages?.[selectedColor]) {
    // If no attributes but has color, only add selectedColorImage
    const colorImages = product.colorImages[selectedColor];
    if (colorImages && colorImages.length > 0) {
      data.attributes = {
        selectedColorImage: colorImages[0],
      };
    }
  }

  return data;
};

export const CartProvider: React.FC<CartProviderProps> = ({
  children,
  user,
  db,
  functions,
}) => {
  // Access UserProvider for profile-based cart ID seeding
  const { getProfileField, updateLocalProfileField, profileData } = useUser();

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
  const [showCartLimitModal, setShowCartLimitModal] = useState(false);

  // ========================================================================
  // REFS - Internal state management
  // ========================================================================

  const lastDocumentRef = useRef<DocumentSnapshot | null>(null);

  // Keep a ref to current cart items to avoid stale closures in listeners
  const cartItemsRef = useRef<CartItem[]>([]);

  // Rate limiters
  const addToCartLimiterRef = useRef(new RateLimiter(ADD_TO_CART_COOLDOWN));
  const quantityLimiterRef = useRef(new RateLimiter(QUANTITY_UPDATE_COOLDOWN));

  // Optimistic updates tracking
  const optimisticCacheRef = useRef<Map<string, OptimisticCacheEntry>>(
    new Map(),
  );
  const optimisticTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Concurrency control
  const quantityUpdateLocksRef = useRef<Map<string, Promise<string>>>(
    new Map(),
  );
  const pendingFetchesRef = useRef<Map<string, Promise<unknown>>>(new Map());
  const deferredCartInitRef = useRef<
    number | ReturnType<typeof setTimeout> | null
  >(null);
  const backgroundTotalsTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ========================================================================
  // HELPER FUNCTIONS
  // ========================================================================

  const getProductShopId = useCallback(
    async (productId: string): Promise<string | null> => {
      if (!db) return null; // Guard for lazy loading

      try {
        // Try shop_products collection first
        const shopProductDoc = await getDoc(
          doc(db, "shop_products", productId),
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
    [db],
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

      // ✅ FIX: Check for null/undefined, not falsy (0 is valid!)
      for (const field of required) {
        const value = cartData[field];
        if (value === null || value === undefined) {
          console.warn(`  ❌ Field "${field}" is null/undefined`);
          return false;
        }
      }

      const productName = cartData.productName;
      if (!productName || productName === "Unknown Product") {
        console.warn(`  ❌ Invalid productName: "${productName}"`);
        return false;
      }

      const sellerName = cartData.sellerName;
      if (!sellerName || sellerName === "Unknown") {
        console.warn(`  ❌ Invalid sellerName: "${sellerName}"`);
        return false;
      }

      return true;
    },
    [],
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
    [],
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
    [],
  );

  const resolveColorImage = useCallback(
    (product: Product, selectedColor?: string): string | undefined => {
      if (!selectedColor || !product.colorImages?.[selectedColor]) {
        return undefined;
      }

      const images = product.colorImages[selectedColor];
      return images?.[0];
    },
    [],
  );

  const createCartItem = useCallback(
    (
      productId: string,
      cartData: FirestoreCartData,
      product: Product,
    ): CartItem => {
      const salePreferences = extractSalePreferences(cartData);

      // ✅ BUILD selectedAttributes map (matching Flutter)
      const selectedAttributes: Record<string, unknown> = {};

      // Add color if present
      if (
        cartData.selectedColor !== undefined &&
        cartData.selectedColor !== null
      ) {
        selectedAttributes.selectedColor = cartData.selectedColor;
      }

      // Flatten all attributes from cartData.attributes into selectedAttributes
      if (cartData.attributes && typeof cartData.attributes === "object") {
        const attributes = cartData.attributes as Record<string, unknown>;
        Object.entries(attributes).forEach(([key, value]) => {
          selectedAttributes[key] = value;
        });
      }

      // ✅ CREATE ITEM MATCHING FLUTTER STRUCTURE
      const item: CartItem = {
        product,
        productId,
        quantity: (cartData.quantity as number) ?? 1,

        // ✅ Store as selectedAttributes map (matching Flutter)
        selectedAttributes:
          Object.keys(selectedAttributes).length > 0
            ? selectedAttributes
            : undefined,

        // ✅ Store salePreferenceInfo (matching Flutter naming)
        salePreferenceInfo: salePreferences,

        selectedColorImage: resolveColorImage(
          product,
          cartData.selectedColor as string | undefined,
        ),
        sellerName: (cartData.sellerName as string) ?? "Unknown",
        sellerId: (cartData.sellerId as string) ?? "unknown",
        isShop: (cartData.isShop as boolean) ?? false,
        cartData: cartData as CartData,
        isOptimistic: false,

        // ✅ DEPRECATED: Keep for backward compatibility but don't use in orders
        salePreferences, // Old field
      };

      // ✅ ADD FLATTENED FIELDS TO ROOT (for display compatibility)
      if (selectedAttributes.selectedColor) {
        item.selectedColor = selectedAttributes.selectedColor as string;
      }

      return item;
    },
    [extractSalePreferences, resolveColorImage],
  );

  const sortCartItems = useCallback((items: CartItem[]) => {
    items.sort((a, b) => {
      // Use shopId for shop items, sellerId for individual sellers
      const groupA = (a.cartData?.shopId as string) ?? a.sellerId ?? "";
      const groupB = (b.cartData?.shopId as string) ?? b.sellerId ?? "";
      if (groupA !== groupB) return groupA.localeCompare(groupB);
  
      const dateA = a.cartData.addedAt as Timestamp;
      const dateB = b.cartData.addedAt as Timestamp;
      if (!dateA || !dateB) return 0;
      return dateB.toMillis() - dateA.toMillis();
    });
  
    let lastGroupKey: string | null = null;
    items.forEach((item) => {
      const groupKey = (item.cartData?.shopId as string) ?? item.sellerId ?? "";
      item.showSellerHeader = groupKey !== lastGroupKey;
      lastGroupKey = groupKey;
    });
  }, []);

  // ========================================================================
  // HELPER: Update cart IDs from doc snapshots
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
    ],
  );

  const initializeCartIfNeeded = useCallback(async () => {
    if (!user || !db || isInitialized) return; // Guard for lazy loading

    if (pendingFetchesRef.current.has("init")) {
      console.log("⏳ Already initializing, waiting...");
      await pendingFetchesRef.current.get("init");
      return;
    }

    const initPromise = (async () => {
      setIsLoading(true);

      // Early exit: if user doc says cart is empty AND we have no local optimistic items,
      // skip subcollection read entirely
      const cachedIds = getProfileField<string[]>("cartItemIds");
      const hasLocalItems =
        cartProductIds.size > 0 || optimisticCacheRef.current.size > 0;
      if (
        Array.isArray(cachedIds) &&
        cachedIds.length === 0 &&
        !hasLocalItems
      ) {
        console.log(
          "✅ Cart: User doc says empty, skipping subcollection read",
        );
        setCartItems([]);
        setCartProductIds(new Set());
        setCartCount(0);
        setHasMore(false);
        setIsInitialized(true);
        setIsLoading(false);
        return;
      }

      // Only clear if there are existing items to avoid clearing optimistic updates
      if (cartItems.length > 0) {
        setCartItems([]);
        setCartProductIds(new Set());
        setCartCount(0);
      }

      // Reset pagination state
      lastDocumentRef.current = null;
      setHasMore(true);

      try {
        const cartQuery = query(
          collection(db, "users", user.uid, "cart"),
          orderBy("addedAt", "desc"),
          limit(ITEMS_PER_PAGE),
        );

        const snapshot = await getDocsFromServer(cartQuery);
        trackReads("Cart:Init", snapshot.docs.length || 1);

        await buildCartItemsFromDocs(snapshot.docs);

        if (snapshot.docs.length > 0) {
          lastDocumentRef.current = snapshot.docs[snapshot.docs.length - 1];
          setHasMore(snapshot.docs.length >= ITEMS_PER_PAGE);
        }

        console.log("✅ Cart initialized with", snapshot.docs.length, "items");

        // Set initialized FIRST
        setIsInitialized(true);
      } catch (error) {
        console.error("❌ Init error:", error);
      } finally {
        setIsLoading(false);
      }
    })();

    pendingFetchesRef.current.set("init", initPromise);
    await initPromise;
    pendingFetchesRef.current.delete("init");
  }, [user, isInitialized, db, buildCartItemsFromDocs, cartItems.length]);

  const calculateCartTotals = useCallback(
    async (excludedProductIds?: string[]): Promise<CartTotals> => {
      if (!user || !functions) {
        return { total: 0, items: [], currency: "TL" };
      }

      // ✅ Build cache key from excluded IDs (empty = all items)
      const excludedSorted = [...(excludedProductIds ?? [])].sort();
      const cacheKey = `all_minus_${excludedSorted.join(",")}`;

      // ✅ Check local cache first
      const cached = cartTotalsCache.get(user.uid, [cacheKey]);
      if (cached) {
        console.log("⚡ Cache hit - instant total");
        return {
          total: cached.total,
          currency: cached.currency,
          items: cached.items.map((i) => ({
            productId: i.productId,
            unitPrice: i.unitPrice,
            total: i.total,
            quantity: i.quantity,
            isBundleItem: i.isBundleItem,
          })),
        };
      }

      // Request deduplication
      if (pendingFetchesRef.current.has(`totals_${cacheKey}`)) {
        console.log("⏳ Waiting for existing totals calculation...");
        const result = await pendingFetchesRef.current.get(
          `totals_${cacheKey}`,
        );
        return result as CartTotals;
      }

      const totalsPromise = (async () => {
        try {
          const calculateCartTotalsFunction = httpsCallable(
            functions,
            "calculateCartTotals",
          );
          
          // Convert excluded IDs to selected IDs for direct lookup
          const allIds = Array.from(cartProductIds);
          const selectedIds = excludedProductIds == null || excludedProductIds.length === 0
            ? allIds
            : allIds.filter((id) => !excludedProductIds.includes(id));
          
          const result = await calculateCartTotalsFunction({
            selectedProductIds: selectedIds,
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

          // ✅ Cache result locally (instead of Redis)
          cartTotalsCache.set(user.uid, [cacheKey], {
            total: totals.total,
            currency: totals.currency,
            items: totals.items.map((i) => ({
              productId: i.productId,
              unitPrice: i.unitPrice,
              total: i.total,
              quantity: i.quantity,
              isBundleItem: i.isBundleItem ?? false,
            })),
          });

          console.log(
            `✅ Total calculated: ${totals.total} ${totals.currency}`,
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
    [user, cartItems, functions],
  );

  const backgroundRefreshTotals = useCallback(() => {
    if (!user || cartProductIds.size === 0) return;

    // Debounce: if user makes rapid changes, only fire once after 2s of quiet
    if (backgroundTotalsTimerRef.current) {
      clearTimeout(backgroundTotalsTimerRef.current);
    }

    backgroundTotalsTimerRef.current = setTimeout(async () => {
      backgroundTotalsTimerRef.current = null;
      try {
        await calculateCartTotals();
        console.log("⚡ Background totals cached");
      } catch (error) {
        console.log("⚠️ Background total refresh failed:", error);
      }
    }, 2000);
  }, [user, cartProductIds, calculateCartTotals]);

  const applyOptimisticAdd = useCallback(
    (
      productId: string,
      productData: Record<string, unknown>,
      quantity: number,
    ) => {
      clearOptimisticUpdate(productId);

      // ✅ FIX: Use setState to get current items, not ref
      setCartItems((currentItems) => {
        // Remove any existing item with this ID
        const existingItems = currentItems.filter(
          (item) => item.productId !== productId,
        );

        // Mark as optimistic
        optimisticCacheRef.current.set(productId, {
          ...productData,
          quantity,
          _optimistic: true,
        });

        // Create optimistic item
        try {
          const optimisticProduct = buildProductFromCartData(productData);
          const optimisticItem: CartItem = {
            ...createCartItem(productId, productData, optimisticProduct),
            isOptimistic: true,
          };

          // Add at top
          return [optimisticItem, ...existingItems];
        } catch (error) {
          console.error("Failed to create optimistic item:", error);
          return currentItems;
        }
      });

      // Update IDs
      const newIds = new Set(cartProductIds);
      newIds.add(productId);
      setCartProductIds(newIds);
      setCartCount(newIds.size);
      // Sync to user doc local state
      updateLocalProfileField("cartItemIds", [...newIds]);

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
      cartProductIds,
      clearOptimisticUpdate,
      buildProductFromCartData,
      updateLocalProfileField,
      createCartItem,
    ],
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
    [cartProductIds],
  );

  const addProductToCart = useCallback(
    async (
      product: Product,
      quantity: number = 1,
      selectedColor?: string,
      attributes?: CartAttributes,
    ): Promise<string> => {
      if (!user) return "Please log in first";
      if (!db) return "Loading..."; // Guard for lazy loading
      if (!isInitialized) {
        await initializeCartIfNeeded();
      }

      // Rate limiting
      if (!addToCartLimiterRef.current.canProceed(`add_${product.id}`)) {
        return "Please wait before adding again";
      }

      // Cart item limit check (only for new items)
      if (!cartProductIds.has(product.id) && cartProductIds.size >= MAX_CART_ITEMS) {
        setShowCartLimitModal(true);
        return "Cart limit reached";
      }

      try {
        const productData = buildProductDataForCart(
          product,
          selectedColor,
          attributes,
        );

        // ✅ Validate before writing
        const requiredFields = [
          "productId",
          "productName",
          "unitPrice",
          "availableStock",
          "sellerId",
          "sellerName",
        ];
        for (const field of requiredFields) {
          const val = productData[field];
          if (val === null || val === undefined || String(val).trim() === "") {
            console.error(
              `❌ Cannot add to cart: missing field "${field}"`,
              productData,
            );
            return `Product data incomplete, cannot add to cart`;
          }
        }

        // ✅ STEP 2: Apply optimistic update for instant feedback
        applyOptimisticAdd(product.id, productData, quantity);

        // Atomic batch: write cart doc + update user doc array
        const batch = writeBatch(db);
        batch.set(doc(db, "users", user.uid, "cart", product.id), {
          ...productData,
          quantity,
          addedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, "users", user.uid), {
          cartItemIds: arrayUnion(product.id),
        });
        await batch.commit();

        userActivityService.trackAddToCart({
          productId: product.id,
          shopId: product.shopId,
          productName: product.productName,
          category: product.category,
          subcategory: product.subcategory,
          subsubcategory: product.subsubcategory,
          brand: product.brandModel,
          price: product.price,
          gender: product.gender,
          quantity,
        });

        // Metrics logging
        const shopId = await getProductShopId(product.id);
        metricsEventService.logCartAdded({
          productId: product.id,
          shopId,
        });

        console.log("✅ Added to cart:", product.id);

        // Invalidate totals cache
        cartTotalsCache.invalidateForUser(user.uid);

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
      isInitialized,
      buildProductDataForCart,
      applyOptimisticAdd,
      rollbackOptimisticUpdate,
      backgroundRefreshTotals,
      getProductShopId,
    ],
  );

  const addToCartById = useCallback(
    async (
      productId: string,
      quantity: number = 1,
      selectedColor?: string,
      attributes?: CartAttributes,
    ): Promise<string> => {
      if (!user) return "Please log in first";
      if (!db) return "Loading..."; // Guard for lazy loading

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
    [user, db, addProductToCart],
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
      // Sync to user doc local state
      updateLocalProfileField("cartItemIds", [...newIds]);

      // Remove from items list
      setCartItems((items) =>
        items.filter((item) => item.productId !== productId),
      );

      // Set timeout
      const timeout = setTimeout(() => {
        optimisticCacheRef.current.delete(productId);
        optimisticTimeoutsRef.current.delete(productId);
      }, 5000);

      optimisticTimeoutsRef.current.set(productId, timeout);
    },
    [cartProductIds],
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
      if (user && db) {
        try {
          const docSnap = await getDoc(
            doc(db, "users", user.uid, "cart", productId),
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
    [user, db, cartProductIds],
  );

  const removeFromCart = useCallback(
    async (productId: string): Promise<string> => {
      if (!user) return "Please log in first";
      if (!db) return "Loading..."; // Guard for lazy loading

      // Capture item BEFORE optimistic remove clears it (needed for rollback + shopId)
      const localItem = cartItemsRef.current.find(
        (item) => item.productId === productId,
      );
      const shopId = localItem?.isShop ? localItem.sellerId : null;

      try {
        applyOptimisticRemove(productId);

        // Atomic batch: delete cart doc + update user doc array
        const batch = writeBatch(db);
        batch.delete(doc(db, "users", user.uid, "cart", productId));
        batch.update(doc(db, "users", user.uid), {
          cartItemIds: arrayRemove(productId),
        });
        await batch.commit();

        userActivityService.trackRemoveFromCart({
          productId,
          shopId: shopId || undefined,
        });

        metricsEventService.logCartRemoved({
          productId,
          shopId,
        });

        cartTotalsCache.invalidateForUser(user.uid);

        // Background refresh totals
        backgroundRefreshTotals();

        return "Removed from cart";
      } catch (error) {
        console.error("❌ Remove error:", error);
        rollbackOptimisticRemove(productId);
        // rollbackOptimisticRemove restores the ID but not the CartItem — restore it
        if (localItem) {
          setCartItems((items) => {
            if (items.some((i) => i.productId === productId)) return items;
            return [...items, localItem];
          });
        }
        return "Failed to remove from cart";
      }
    },
    [
      user,
      db,
      applyOptimisticRemove,
      rollbackOptimisticRemove,
      backgroundRefreshTotals,
    ],
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
    [],
  );

  const updateQuantity = useCallback(
    async (productId: string, newQuantity: number): Promise<string> => {
      if (!user) return "Please log in first";
      if (!db) return "Loading..."; // Guard for lazy loading

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
          cartTotalsCache.invalidateForUser(user.uid);

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
    ],
  );

  // ========================================================================
  // BATCH REMOVE
  // ========================================================================

  const removeMultipleFromCart = useCallback(
    async (productIds: string[]): Promise<string> => {
      if (!user) return "Please log in first";
      if (!db) return "Loading..."; // Guard for lazy loading
      if (productIds.length === 0) return "No items selected";

      try {
        // Get shopIds from local state BEFORE optimistic remove clears them
        const shopIds: Record<string, string | null> = {};
        for (const productId of productIds) {
          const localItem = cartItemsRef.current.find(
            (item) => item.productId === productId,
          );
          shopIds[productId] = localItem?.isShop ? localItem.sellerId : null;
        }

        // Optimistic removal
        productIds.forEach((productId) => applyOptimisticRemove(productId));

        // STEP 3: Batch delete from Firestore + update user doc array
        const batch = writeBatch(db);
        productIds.forEach((productId) => {
          batch.delete(doc(db, "users", user.uid, "cart", productId));
        });
        batch.update(doc(db, "users", user.uid), {
          cartItemIds: arrayRemove(...productIds),
        });
        await batch.commit();

        // ✅ STEP 4: Log batch metrics (NEW)
        metricsEventService.logBatchCartRemovals({
          productIds,
          shopIds,
        });

        console.log(`✅ Removed ${productIds.length} items`);
        cartTotalsCache.invalidateForUser(user.uid);

        // Background refresh totals
        backgroundRefreshTotals();

        return "Products removed from cart";
      } catch (error) {
        console.error("❌ Batch remove error:", error);
        return "Failed to remove products";
      }
    },
    [user, db, applyOptimisticRemove, backgroundRefreshTotals],
  );

  // ========================================================================
  // REFRESH
  // ========================================================================

  const refresh = useCallback(async () => {
    if (!user || !db) return; // Guard for lazy loading

    // Reset pagination
    lastDocumentRef.current = null;
    setHasMore(true);

    try {
      const cartQuery = query(
        collection(db, "users", user.uid, "cart"),
        orderBy("addedAt", "desc"),
        limit(ITEMS_PER_PAGE),
      );

      const snapshot = await getDocsFromServer(cartQuery);
      trackReads("Cart:Refresh", snapshot.docs.length || 1);

      // Preserve optimistic items that the server hasn't confirmed yet
      const serverIds = new Set(snapshot.docs.map((d) => d.id));
      const pendingOptimistic = cartItemsRef.current.filter(
        (item) =>
          item.isOptimistic &&
          !serverIds.has(item.productId) &&
          !optimisticCacheRef.current.get(item.productId)?._deleted,
      );

      await buildCartItemsFromDocs(snapshot.docs);

      // Re-append pending optimistic items so they don't vanish
      if (pendingOptimistic.length > 0) {
        setCartItems((prev) => {
          const ids = new Set(prev.map((i) => i.productId));
          const merged = [...prev];
          for (const opt of pendingOptimistic) {
            if (!ids.has(opt.productId)) {
              merged.push(opt);
            }
          }
          return merged;
        });
      }

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
  // TOTALS CALCULATION
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

  // ========================================================================
  // VALIDATION
  // ========================================================================

  const validateForPayment = useCallback(
    async (
      selectedProductIds: string[],
      reserveStock: boolean = false,
    ): Promise<{
      isValid: boolean;
      errors: Record<string, ValidationMessage>;
      warnings: Record<string, ValidationMessage>;
      validatedItems: ValidatedCartItem[];
    }> => {
      if (!functions) {
        return {
          isValid: false,
          errors: { _system: { key: "firebase_not_ready", params: {} } },
          warnings: {},
          validatedItems: [],
        };
      }

      try {
        const itemsToValidate = cartItems
          .filter((item) => selectedProductIds.includes(item.productId))
          .map((item) => {
            const cartData = item.cartData;

            return {
              productId: item.productId,
              quantity: item.quantity ?? 1,
              selectedColor: cartData.selectedColor,
              productSource: (cartData as Record<string, unknown>).productSource as string ?? "shop_products",
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
          "validateCartCheckout",
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
    [cartItems, functions],
  );

  const updateCartCacheFromValidation = useCallback(
    async (validatedItems: ValidatedCartItem[]): Promise<boolean> => {
      if (!user || !functions) return false;

      try {
        console.log(
          `🔄 Updating cart cache for ${validatedItems.length} items...`,
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
          "updateCartCache",
        );

        const result = await updateCartCacheFunction({
          productUpdates: updates,
        });

        const data = deepConvertMap(result.data);

        console.log(`✅ Cache updated: ${data.updated as number} items`);

        cartTotalsCache.invalidateForUser(user.uid);

        return (data.success as boolean) === true;
      } catch (error) {
        console.error("❌ Cache update error:", error);
        return false;
      }
    },
    [user, functions],
  );

  // ========================================================================
  // LOAD MORE (Pagination)
  // ========================================================================

  const loadMoreItems = useCallback(async () => {
    if (!user || !db || !hasMore || isLoadingMore) return; // Guard for lazy loading

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
          limit(ITEMS_PER_PAGE),
        );

        if (lastDocumentRef.current) {
          cartQuery = query(cartQuery, startAfter(lastDocumentRef.current));
        }

        const snapshot = await getDocsFromServer(cartQuery);

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

        // Deduplication using setState to avoid stale closure
        if (newItems.length > 0) {
          setCartItems((currentItems) => {
            const existingIds = new Set(
              currentItems.map((item) => item.productId),
            );
            const uniqueNewItems = newItems.filter(
              (item) => !existingIds.has(item.productId),
            );

            if (uniqueNewItems.length === 0) {
              console.log(`⚠️ All ${newItems.length} items already loaded`);
              return currentItems;
            }

            const allItems = [...currentItems, ...uniqueNewItems];
            sortCartItems(allItems);

            console.log(
              `✅ Loaded ${uniqueNewItems.length} more items (${
                newItems.length - uniqueNewItems.length
              } duplicates skipped)`,
            );
            return allItems;
          });
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

  // Keep cartItemsRef in sync with cartItems state
  useEffect(() => {
    cartItemsRef.current = cartItems;
  }, [cartItems]);

  // Initialize cart IDs from user doc (Tier 1) or fallback to subcollection
  useEffect(() => {
    if (!user) {
      // User logged out - clear everything
      if (isInitialized) {
        console.log("🔴 User logged out, clearing cart...");
        setCartCount(0);
        setCartProductIds(new Set());
        setCartItems([]);
        setIsInitialized(false);
        setIsLoading(false);
        optimisticCacheRef.current.clear();
        optimisticTimeoutsRef.current.forEach((timer) => clearTimeout(timer));
        optimisticTimeoutsRef.current.clear();
        quantityUpdateLocksRef.current.clear();
        cartTotalsCache.clearAll();
      }
      return;
    }

    if (!isInitialized) {
      // Wait for profile data to load before checking cached IDs
      if (!profileData) return;

      const cachedIds = getProfileField<string[]>("cartItemIds");

      // Seed from user doc array (0 extra Firestore reads)
      const ids = new Set(Array.isArray(cachedIds) ? cachedIds : []);
      console.log("🟢 Cart: Seeding from user doc array:", ids.size, "items");
      setCartProductIds(ids);
      setCartCount(ids.size);
      setIsInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isInitialized, profileData]);

  // Initialize cache on mount
  useEffect(() => {
    cartTotalsCache.initialize();

    return () => {
      // Note: Don't dispose on unmount as it's a singleton
      // Only dispose if truly shutting down the app
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel deferred init if still pending
      if (deferredCartInitRef.current !== null) {
        if (typeof cancelIdleCallback !== "undefined") {
          cancelIdleCallback(deferredCartInitRef.current as number);
        } else {
          clearTimeout(
            deferredCartInitRef.current as ReturnType<typeof setTimeout>,
          );
        }
        deferredCartInitRef.current = null;
      }
      optimisticTimeoutsRef.current.forEach((timer) => clearTimeout(timer));
      optimisticTimeoutsRef.current.clear();
      if (backgroundTotalsTimerRef.current) {
        clearTimeout(backgroundTotalsTimerRef.current);
        backgroundTotalsTimerRef.current = null;
      }
    };
  }, []);

  // ========================================================================
  // CONTEXT VALUES - Split for granular subscriptions
  // ========================================================================

  // State context - changes trigger re-renders
  const stateValue = useMemo<CartStateContextType>(
    () => ({
      cartCount,
      cartProductIds,
      cartItems,
      isLoading,
      isLoadingMore,
      hasMore,
      isInitialized,
    }),
    [
      cartCount,
      cartProductIds,
      cartItems,
      isLoading,
      isLoadingMore,
      hasMore,
      isInitialized,
    ],
  );

  // Actions context - stable references, no re-renders
  const actionsValue = useMemo<CartActionsContextType>(
    () => ({
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
    }),
    [
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
    ],
  );

  // Combined context for backward compatibility
  const combinedValue = useMemo<CartContextType>(
    () => ({
      ...stateValue,
      ...actionsValue,
    }),
    [stateValue, actionsValue],
  );

  return (
    <CartStateContext.Provider value={stateValue}>
      <CartActionsContext.Provider value={actionsValue}>
        <CartContext.Provider value={combinedValue}>
          {children}
          {showCartLimitModal && (
            <LimitReachedModal
              onClose={() => setShowCartLimitModal(false)}
              type="cart"
              maxItems={MAX_CART_ITEMS}
            />
          )}
        </CartContext.Provider>
      </CartActionsContext.Provider>
    </CartStateContext.Provider>
  );
};
