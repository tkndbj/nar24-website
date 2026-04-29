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
import metricsEventService from "@/services/cartfavoritesmetricsEventService";
import { userActivityService } from "@/services/userActivity";
import { trackReads } from "@/lib/firestore-read-tracker";
import { useUser } from "./UserProvider";
import LimitReachedModal from "@/app/components/LimitReachedModal";

const MAX_CART_ITEMS = 300;

// ============================================================================
// TYPES — Matching Flutter implementation
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

  // Match Flutter naming
  salePreferenceInfo?: SalePreferences | null;
  selectedAttributes?: Record<string, unknown>;

  // Kept for backward compatibility (Flutter still reads this)
  salePreferences?: SalePreferences | null;

  selectedColorImage?: string;
  showSellerHeader?: boolean;
  selectedColor?: string;
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

interface FirestoreCartData {
  [key: string]: unknown;
}

interface OptimisticCacheEntry {
  _deleted?: boolean;
  _optimistic?: boolean;
  [key: string]: unknown;
}

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

interface ValidationMessage {
  key: string;
  params: Record<string, unknown>;
}

interface BundleDataItem {
  bundlePrice?: number;
  [key: string]: unknown;
}

// ============================================================================
// SPLIT CONTEXT TYPES
// ============================================================================

interface CartStateContextType {
  cartCount: number;
  cartProductIds: Set<string>;
  cartItems: CartItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  isInitialized: boolean;
  // NEW: totals state lives in provider (matching Flutter's cartTotalsNotifier)
  cartTotals: CartTotals | null;
  isTotalsLoading: boolean;
}

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
  // NEW: callable on every cart screen visit (matches Flutter loadCart())
  loadCart: () => Promise<void>;
  loadMoreItems: () => Promise<void>;
  calculateCartTotals: (excludedProductIds?: string[]) => Promise<CartTotals>;
  // NEW: optimistic-then-server totals update (matches Flutter)
  updateTotalsForExcluded: (excludedProductIds: string[]) => Promise<void>;
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
  clearLocalCache: () => void;
  // NEW: get items for payment with selectedAttributes built (matches Flutter's _prepareItemsForPayment)
  fetchAllSelectedItems: (selectedProductIds: string[]) => CartItem[];
}

interface CartContextType
  extends CartStateContextType,
    CartActionsContextType {}

const CartStateContext = createContext<CartStateContextType | undefined>(
  undefined,
);
const CartActionsContext = createContext<CartActionsContextType | undefined>(
  undefined,
);
const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCartState = (): CartStateContextType => {
  const context = useContext(CartStateContext);
  if (context === undefined) {
    throw new Error("useCartState must be used within a CartProvider");
  }
  return context;
};

export const useCartActions = (): CartActionsContextType => {
  const context = useContext(CartActionsContext);
  if (context === undefined) {
    throw new Error("useCartActions must be used within a CartProvider");
  }
  return context;
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};

// ============================================================================
// RATE LIMITER — Matching Flutter
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
// CONSTANTS — Matching Flutter
// ============================================================================

const ITEMS_PER_PAGE = 20;
const OPTIMISTIC_TIMEOUT = 3000;
const ADD_TO_CART_COOLDOWN = 300;
const QUANTITY_UPDATE_COOLDOWN = 200;
const TOTALS_VERIFICATION_DEBOUNCE = 500;

// ============================================================================
// RETRY WITH BACKOFF — Matching Flutter's _retryWithBackoff
// ============================================================================

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3,
  initialDelayMs: number = 500,
): Promise<T> {
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (e) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(
          `❌ ${operationName} failed after ${maxRetries} attempts:`,
          e,
        );
        throw e;
      }
      console.warn(
        `⚠️ ${operationName} failed (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = delay * 2;
    }
  }

  throw new Error(`${operationName} failed after ${maxRetries} attempts`);
}

// ============================================================================
// HELPERS — Pure functions
// ============================================================================

const setsEqual = (a: Set<string>, b: Set<string>): boolean => {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
};

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

  data.cachedDiscountPercentage = product.discountPercentage ?? null;
  data.cachedDiscountThreshold = product.discountThreshold ?? null;
  data.cachedBulkDiscountPercentage = product.bulkDiscountPercentage ?? null;

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

  if (selectedColor) {
    data.selectedColor = selectedColor;
  }

  if (attributes && Object.keys(attributes).length > 0) {
    const attributesMap = { ...attributes };
    if (selectedColor && product.colorImages?.[selectedColor]) {
      const colorImages = product.colorImages[selectedColor];
      if (colorImages && colorImages.length > 0) {
        attributesMap.selectedColorImage = colorImages[0];
      }
    }
    data.attributes = attributesMap;
  } else if (selectedColor && product.colorImages?.[selectedColor]) {
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
  const { getProfileField, updateLocalProfileField, profileData } = useUser();

  // ========================================================================
  // STATE — Matching Flutter ValueNotifiers
  // ========================================================================

  const [cartProductIds, setCartProductIds] = useState<Set<string>>(new Set());
  const [cartCount, setCartCount] = useState(0);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showCartLimitModal, setShowCartLimitModal] = useState(false);

  // NEW: totals state in provider (Flutter's cartTotalsNotifier / isTotalsLoadingNotifier)
  const [cartTotals, setCartTotals] = useState<CartTotals | null>(null);
  const [isTotalsLoading, setIsTotalsLoading] = useState(false);

  // ========================================================================
  // REFS
  // ========================================================================

  const lastDocumentRef = useRef<DocumentSnapshot | null>(null);
  const cartItemsRef = useRef<CartItem[]>([]);
  const cartProductIdsRef = useRef<Set<string>>(new Set());

  // Track which selection the current totals were calculated for
  const currentTotalsProductIdsRef = useRef<Set<string>>(new Set());

  // Track current user uid to distinguish same-user re-emit vs different-user
  const currentUserIdRef = useRef<string | null>(null);

  const addToCartLimiterRef = useRef(new RateLimiter(ADD_TO_CART_COOLDOWN));
  const quantityLimiterRef = useRef(new RateLimiter(QUANTITY_UPDATE_COOLDOWN));

  const optimisticCacheRef = useRef<Map<string, OptimisticCacheEntry>>(
    new Map(),
  );
  const optimisticTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Concurrency control for quantity updates
  const quantityUpdateLocksRef = useRef<Map<string, Promise<string>>>(
    new Map(),
  );
  // Coalesces rapid taps into final value (matches Flutter's _pendingQuantityWrites)
  const pendingQuantityWritesRef = useRef<Map<string, number>>(new Map());

  const pendingFetchesRef = useRef<Map<string, Promise<unknown>>>(new Map());
  const totalsVerificationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    cartItemsRef.current = cartItems;
  }, [cartItems]);

  useEffect(() => {
    cartProductIdsRef.current = cartProductIds;
  }, [cartProductIds]);

  // ========================================================================
  // HELPER FUNCTIONS
  // ========================================================================

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

      const selectedAttributes: Record<string, unknown> = {};

      if (
        cartData.selectedColor !== undefined &&
        cartData.selectedColor !== null &&
        cartData.selectedColor !== "" &&
        cartData.selectedColor !== "default"
      ) {
        selectedAttributes.selectedColor = cartData.selectedColor;
      }

      if (cartData.attributes && typeof cartData.attributes === "object") {
        const attributes = cartData.attributes as Record<string, unknown>;
        Object.entries(attributes).forEach(([key, value]) => {
          if (
            value !== null &&
            value !== undefined &&
            value !== "" &&
            !(Array.isArray(value) && value.length === 0)
          ) {
            selectedAttributes[key] = value;
          }
        });
      }

      const item: CartItem = {
        product,
        productId,
        quantity: (cartData.quantity as number) ?? 1,
        selectedAttributes:
          Object.keys(selectedAttributes).length > 0
            ? selectedAttributes
            : undefined,
        salePreferenceInfo: salePreferences,
        salePreferences, // kept for backward compat (Flutter still reads this)
        selectedColorImage: resolveColorImage(
          product,
          cartData.selectedColor as string | undefined,
        ),
        sellerName: (cartData.sellerName as string) ?? "Unknown",
        sellerId: (cartData.sellerId as string) ?? "unknown",
        isShop: (cartData.isShop as boolean) ?? false,
        cartData: cartData as CartData,
        isOptimistic: false,
      };

      if (selectedAttributes.selectedColor) {
        item.selectedColor = selectedAttributes.selectedColor as string;
      }

      return item;
    },
    [extractSalePreferences, resolveColorImage],
  );

  const sortCartItems = useCallback((items: CartItem[]) => {
    items.sort((a, b) => {
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

  const updateCartIds = useCallback((docs: QueryDocumentSnapshot[]) => {
    const ids = new Set(docs.map((doc) => doc.id));
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
  // OPTIMISTIC TOTALS — Matches Flutter's _calculateOptimisticTotals
  // ========================================================================

  const calculateOptimisticTotals = useCallback(
    (selectedProductIds: string[]): CartTotals => {
      const items = cartItemsRef.current.filter((item) =>
        selectedProductIds.includes(item.productId),
      );

      if (items.length === 0) {
        return { total: 0, items: [], currency: "TL" };
      }

      let total = 0;
      let currency = "TL";
      const itemTotals: CartItemTotal[] = [];

      for (const item of items) {
        const productId = item.productId;
        const quantity = item.quantity ?? 1;
        const cartData = item.cartData ?? {};

        let unitPrice =
          (cartData.unitPrice as number | undefined) ??
          (cartData.cachedPrice as number | undefined) ??
          item.product?.price ??
          0;

        const discountThreshold =
          (cartData.discountThreshold as number | undefined) ??
          (cartData.cachedDiscountThreshold as number | undefined);
        const bulkDiscountPercentage =
          (cartData.bulkDiscountPercentage as number | undefined) ??
          (cartData.cachedBulkDiscountPercentage as number | undefined);

        if (
          discountThreshold !== undefined &&
          bulkDiscountPercentage !== undefined &&
          quantity >= discountThreshold
        ) {
          unitPrice = unitPrice * (1 - bulkDiscountPercentage / 100);
        }

        const itemTotal = unitPrice * quantity;
        total += itemTotal;
        currency = (cartData.currency as string | undefined) ?? "TL";

        itemTotals.push({
          productId,
          unitPrice,
          total: itemTotal,
          quantity,
        });
      }

      return {
        total: Math.round(total * 100) / 100,
        items: itemTotals,
        currency,
      };
    },
    [],
  );

  // ========================================================================
  // CART TOTALS CALCULATION (with caching & retry)
  // ========================================================================

  const calculateCartTotals = useCallback(
    async (excludedProductIds?: string[]): Promise<CartTotals> => {
      if (!user || !functions) {
        return { total: 0, items: [], currency: "TL" };
      }
  
      // Dedup key — for in-flight request sharing only, no result caching
      const excludedSorted = [...(excludedProductIds ?? [])].sort();
      const dedupKey = `totals_all_minus_${excludedSorted.join(",")}`;
  
      if (pendingFetchesRef.current.has(dedupKey)) {
        console.log("⏳ Joining in-flight totals calculation...");
        try {
          const result = await pendingFetchesRef.current.get(dedupKey);
          return result as CartTotals;
        } catch {
          // Fall through and retry our own call
        }
      }
  
      const totalsPromise = (async () => {
        try {
          const totals = await retryWithBackoff(
            async () => {
              const calculateCartTotalsFunction = httpsCallable(
                functions,
                "calculateCartTotals",
              );
  
              const allIds = Array.from(cartProductIdsRef.current);
              const selectedIds =
                excludedProductIds == null || excludedProductIds.length === 0
                  ? allIds
                  : allIds.filter((id) => !excludedProductIds.includes(id));
  
              const result = await calculateCartTotalsFunction({
                selectedProductIds: selectedIds,
              });
  
              const rawData = result.data;
              const totalsData = deepConvertMap(rawData);
  
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
  
              return totals;
            },
            "Calculate Totals",
            3,
          );
  
          console.log(`✅ Total calculated: ${totals.total} ${totals.currency}`);
          return totals;
        } catch (error) {
          console.error("❌ Cloud Function failed after retries:", error);
          throw error;
        }
      })();
  
      pendingFetchesRef.current.set(dedupKey, totalsPromise);
      try {
        return await totalsPromise;
      } finally {
        pendingFetchesRef.current.delete(dedupKey);
      }
    },
    [user, functions],
  );

  // ========================================================================
  // updateTotalsForExcluded — Matches Flutter (optimistic + server verify)
  // ========================================================================

  const updateTotalsForExcluded = useCallback(
    async (excludedProductIds: string[]): Promise<void> => {
      const allIds = cartProductIdsRef.current;

      // If everything is excluded, show zero
      if (allIds.size > 0 && excludedProductIds.length >= allIds.size) {
        setCartTotals({ total: 0, items: [], currency: "TL" });
        currentTotalsProductIdsRef.current = new Set();
        return;
      }

      const selectedIds = Array.from(allIds).filter(
        (id) => !excludedProductIds.includes(id),
      );

      currentTotalsProductIdsRef.current = new Set(selectedIds);

      // Step 1: Immediate optimistic update
      if (selectedIds.length > 0) {
        const optimistic = calculateOptimisticTotals(selectedIds);
        setCartTotals(optimistic);
      } else {
        setCartTotals({ total: 0, items: [], currency: "TL" });
      }

      if (selectedIds.length === 0) return;

      // Step 2: Server verification (debounced via outer caller, but we run it here too)
      setIsTotalsLoading(true);

      try {
        const serverTotals = await calculateCartTotals(
          excludedProductIds.length > 0 ? excludedProductIds : undefined,
        );
        // Only apply if the selection hasn't changed in the meantime
        const currentSet = currentTotalsProductIdsRef.current;
        const stillSameSelection =
          currentSet.size === selectedIds.length &&
          selectedIds.every((id) => currentSet.has(id));
        if (stillSameSelection) {
          setCartTotals(serverTotals);
        }
      } catch (e) {
        console.warn("⚠️ Server totals failed, using optimistic:", e);
      } finally {
        setIsTotalsLoading(false);
      }
    },
    [calculateOptimisticTotals, calculateCartTotals],
  );

  // ========================================================================
  // BACKGROUND TOTALS REFRESH — Matches Flutter's unawaited approach
  // ========================================================================

  const backgroundRefreshTotals = useCallback(() => {
    if (!user || cartProductIdsRef.current.size === 0) return;
    // Fire and forget — Flutter uses `unawaited(_backgroundRefreshTotals())`
    (async () => {
      try {
        // Recompute against the most recent selection (or all if none tracked)
        const currentSelection = currentTotalsProductIdsRef.current;
        const allIds = cartProductIdsRef.current;
        const excluded =
          currentSelection.size === 0
            ? []
            : Array.from(allIds).filter((id) => !currentSelection.has(id));

        await calculateCartTotals(excluded.length > 0 ? excluded : undefined);
        console.log("⚡ Background totals cached");
      } catch (e) {
        console.warn("⚠️ Background total refresh failed:", e);
      }
    })();
  }, [user, calculateCartTotals]);

  // ========================================================================
  // BUILD CART ITEMS FROM DOCS
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

  // ========================================================================
  // RECONCILIATION — Matches Flutter's _reconcileCartIds
  // ========================================================================

  const reconcileCartIds = useCallback(async () => {
    if (!user || !db) return;

    try {
      const loadedIds = cartProductIdsRef.current;
      const userDocIds = new Set<string>(
        getProfileField<string[]>("cartItemIds") ?? [],
      );

      // If pages remain, only do safe count check
      if (hasMore) {
        if (loadedIds.size > userDocIds.size) {
          console.log("🔧 Cart reconciliation: adding missing IDs to user doc");
          await updateDoc(doc(db, "users", user.uid), {
            cartItemIds: arrayUnion(...Array.from(loadedIds)),
          });
          updateLocalProfileField(
            "cartItemIds",
            Array.from(new Set([...userDocIds, ...loadedIds])),
          );
        }
        return;
      }

      // All pages loaded — full reconciliation safe
      if (!setsEqual(loadedIds, userDocIds)) {
        console.log(
          `🔧 Cart reconciliation: fixing drift (loaded: ${loadedIds.size}, userDoc: ${userDocIds.size})`,
        );
        await updateDoc(doc(db, "users", user.uid), {
          cartItemIds: Array.from(loadedIds),
        });
        updateLocalProfileField("cartItemIds", Array.from(loadedIds));
      }
    } catch (e) {
      console.warn("⚠️ Cart reconciliation failed (non-critical):", e);
    }
  }, [user, db, hasMore, getProfileField, updateLocalProfileField]);

  // ========================================================================
  // LOAD CART — Matches Flutter's loadCart() (callable on every screen visit)
  // ========================================================================

  const loadCart = useCallback(async () => {
    if (!user || !db) return;

    if (pendingFetchesRef.current.has("init")) {
      console.log("⏳ Already loading cart, waiting...");
      await pendingFetchesRef.current.get("init");
      return;
    }

    setIsLoading(true);
    lastDocumentRef.current = null;
    setHasMore(true);

    const loadPromise = (async () => {
      try {
        const cartQuery = query(
          collection(db, "users", user.uid, "cart"),
          orderBy("addedAt", "desc"),
          limit(ITEMS_PER_PAGE),
        );

        const snapshot = await getDocsFromServer(cartQuery);
        trackReads("Cart:Load", snapshot.docs.length || 1);

        await buildCartItemsFromDocs(snapshot.docs);

        if (snapshot.docs.length > 0) {
          lastDocumentRef.current = snapshot.docs[snapshot.docs.length - 1];
          setHasMore(snapshot.docs.length >= ITEMS_PER_PAGE);
        } else {
          setHasMore(false);
        }

        setIsInitialized(true);

        // Await reconciliation (matches Flutter)
        await reconcileCartIds();
      } catch (error) {
        console.error("❌ Cart load error:", error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    })();

    pendingFetchesRef.current.set("init", loadPromise);
    try {
      await loadPromise;
    } catch {
      // Already logged inside; surface to caller via the awaiter chain
    } finally {
      pendingFetchesRef.current.delete("init");
    }
  }, [user, db, buildCartItemsFromDocs, reconcileCartIds]);

  const initializeCartIfNeeded = useCallback(async () => {
    if (!user || !db) return;

    // Early-exit optimization: if user doc says cart is empty AND we have nothing local,
    // skip subcollection read entirely (matches Flutter behavior, saves reads)
    const cachedIds = getProfileField<string[]>("cartItemIds");
    const hasLocalItems =
      cartProductIdsRef.current.size > 0 ||
      optimisticCacheRef.current.size > 0;

    if (
      !isInitialized &&
      Array.isArray(cachedIds) &&
      cachedIds.length === 0 &&
      !hasLocalItems
    ) {
      console.log("✅ Cart: User doc says empty, skipping subcollection read");
      setCartItems([]);
      setCartProductIds(new Set());
      setCartCount(0);
      setHasMore(false);
      setIsInitialized(true);
      return;
    }

    if (isInitialized) return;
    await loadCart();
  }, [user, db, isInitialized, getProfileField, loadCart]);

  // ========================================================================
  // ADD TO CART
  // ========================================================================

  const applyOptimisticAdd = useCallback(
    (
      productId: string,
      productData: Record<string, unknown>,
      quantity: number,
    ) => {
      clearOptimisticUpdate(productId);

      // Enrich productData with quantity FIRST (matches Flutter's _applyOptimisticAdd fix)
      const enrichedProductData = {
        ...productData,
        quantity,
      };

      optimisticCacheRef.current.set(productId, {
        ...enrichedProductData,
        _optimistic: true,
      });

      setCartItems((currentItems) => {
        const existingItems = currentItems.filter(
          (item) => item.productId !== productId,
        );

        try {
          const optimisticProduct =
            buildProductFromCartData(enrichedProductData);
          const optimisticItem: CartItem = {
            ...createCartItem(productId, enrichedProductData, optimisticProduct),
            isOptimistic: true,
          };
          return [optimisticItem, ...existingItems];
        } catch (error) {
          console.error("Failed to create optimistic item:", error);
          return currentItems;
        }
      });

      const newIds = new Set(cartProductIdsRef.current);
      newIds.add(productId);
      setCartProductIds(newIds);
      setCartCount(newIds.size);

      const timeout = setTimeout(() => {
        if (optimisticCacheRef.current.has(productId)) {
          console.warn("⚠️ Optimistic timeout:", productId);
          clearOptimisticUpdate(productId);
        }
      }, OPTIMISTIC_TIMEOUT);

      optimisticTimeoutsRef.current.set(productId, timeout);
    },
    [
      clearOptimisticUpdate,
      buildProductFromCartData,
      createCartItem,
    ],
  );

  const rollbackOptimisticUpdate = useCallback((productId: string) => {
    optimisticCacheRef.current.delete(productId);
    const timer = optimisticTimeoutsRef.current.get(productId);
    if (timer) {
      clearTimeout(timer);
      optimisticTimeoutsRef.current.delete(productId);
    }

    const newIds = new Set(cartProductIdsRef.current);
    newIds.delete(productId);
    setCartProductIds(newIds);
    setCartCount(newIds.size);

    setCartItems((items) =>
      items.filter((item) => item.productId !== productId),
    );

    console.log("🔄 Rolled back optimistic update:", productId);
  }, []);

  const addProductToCart = useCallback(
    async (
      product: Product,
      quantity: number = 1,
      selectedColor?: string,
      attributes?: CartAttributes,
    ): Promise<string> => {
      if (!user) return "Please log in first";
      if (!db) return "Loading...";

      if (!addToCartLimiterRef.current.canProceed(`add_${product.id}`)) {
        return "Please wait before adding again";
      }

      if (
        !cartProductIdsRef.current.has(product.id) &&
        cartProductIdsRef.current.size >= MAX_CART_ITEMS
      ) {
        setShowCartLimitModal(true);
        return "Cart limit reached";
      }

      try {
        const productData = buildProductDataForCart(
          product,
          selectedColor,
          attributes,
        );

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
        if (
          productData.sellerName === "Unknown" ||
          productData.sellerName === ""
        ) {
          console.error("❌ Cannot add to cart: invalid sellerName");
          return "Product data incomplete, cannot add to cart";
        }

        applyOptimisticAdd(product.id, productData, quantity);

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

        clearOptimisticUpdate(product.id);

        // Optimistic local sync of user doc cartItemIds (matches Flutter)
        const currentIds = [
          ...(getProfileField<string[]>("cartItemIds") ?? []),
        ];
        if (!currentIds.includes(product.id)) currentIds.push(product.id);
        updateLocalProfileField("cartItemIds", currentIds);

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

        metricsEventService.logCartAdded({
          productId: product.id,
          shopId: product.shopId ?? null,
        });

        console.log("✅ Added to cart:", product.id);
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
      applyOptimisticAdd,
      rollbackOptimisticUpdate,
      backgroundRefreshTotals,
      clearOptimisticUpdate,
      getProfileField,
      updateLocalProfileField,
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
      if (!db) return "Loading...";

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

  const applyOptimisticRemove = useCallback((productId: string) => {
    optimisticCacheRef.current.set(productId, { _deleted: true });

    const newIds = new Set(cartProductIdsRef.current);
    newIds.delete(productId);
    setCartProductIds(newIds);
    setCartCount(newIds.size);

    setCartItems((items) =>
      items.filter((item) => item.productId !== productId),
    );

    const timeout = setTimeout(() => {
      optimisticCacheRef.current.delete(productId);
      optimisticTimeoutsRef.current.delete(productId);
    }, 5000);

    optimisticTimeoutsRef.current.set(productId, timeout);
  }, []);

  const rollbackOptimisticRemove = useCallback(
    async (productId: string) => {
      optimisticCacheRef.current.delete(productId);
      const timer = optimisticTimeoutsRef.current.get(productId);
      if (timer) {
        clearTimeout(timer);
        optimisticTimeoutsRef.current.delete(productId);
      }

      if (user && db) {
        try {
          const docSnap = await getDoc(
            doc(db, "users", user.uid, "cart", productId),
          );
          if (docSnap.exists()) {
            const newIds = new Set(cartProductIdsRef.current);
            newIds.add(productId);
            setCartProductIds(newIds);
            setCartCount(newIds.size);
          }
        } catch (error) {
          console.error("Failed to rollback remove:", error);
        }
      }
    },
    [user, db],
  );

  const removeFromCart = useCallback(
    async (productId: string): Promise<string> => {
      if (!user) return "Please log in first";
      if (!db) return "Loading...";

      const localItem = cartItemsRef.current.find(
        (item) => item.productId === productId,
      );
      const shopId = localItem?.isShop ? localItem.sellerId : null;

      try {
        applyOptimisticRemove(productId);

        // Read cart data for analytics before deleting (matches Flutter)
        let cartData: FirestoreCartData | undefined;
        try {
          const cartDocSnap = await getDoc(
            doc(db, "users", user.uid, "cart", productId),
          );
          trackReads("Cart:RemovePreFetch", 1);
          cartData = cartDocSnap.data();
        } catch {
          // Non-fatal — fall back to local item
        }

        const analyticsShopId =
          (cartData?.shopId as string | undefined) ??
          (shopId ?? undefined);

        const batch = writeBatch(db);
        batch.delete(doc(db, "users", user.uid, "cart", productId));
        batch.update(doc(db, "users", user.uid), {
          cartItemIds: arrayRemove(productId),
        });
        await batch.commit();

        // Sync local user doc
        updateLocalProfileField(
          "cartItemIds",
          (getProfileField<string[]>("cartItemIds") ?? []).filter(
            (id) => id !== productId,
          ),
        );

        userActivityService.trackRemoveFromCart({
          productId,
          shopId: analyticsShopId,
          productName:
            (cartData?.productName as string | undefined) ??
            localItem?.product?.productName,
          category:
            (cartData?.category as string | undefined) ??
            localItem?.product?.category,
          brand:
            (cartData?.brandModel as string | undefined) ??
            localItem?.product?.brandModel,
          gender:
            (cartData?.gender as string | undefined) ??
            localItem?.product?.gender,
        });

        metricsEventService.logCartRemoved({
          productId,
          shopId: analyticsShopId ?? null,
        });
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
      getProfileField,
      updateLocalProfileField,
    ],
  );

  // ========================================================================
  // UPDATE QUANTITY — With coalescing (matches Flutter)
  // ========================================================================

  const applyOptimisticQuantityChange = useCallback(
    (productId: string, newQuantity: number) => {
      setCartItems((items) => {
        const newItems = [...items];
        const indices: number[] = [];

        for (let i = 0; i < newItems.length; i++) {
          if (newItems[i].productId === productId) {
            indices.push(i);
          }
        }

        if (indices.length === 0) return items;

        newItems[indices[0]] = {
          ...newItems[indices[0]],
          quantity: newQuantity,
        };

        for (let i = indices.length - 1; i > 0; i--) {
          newItems.splice(indices[i], 1);
        }

        return newItems;
      });
    },
    [],
  );

  const debouncedTotalsVerification = useCallback(() => {
    if (totalsVerificationTimerRef.current) {
      clearTimeout(totalsVerificationTimerRef.current);
    }
    totalsVerificationTimerRef.current = setTimeout(async () => {
      const currentSelection = currentTotalsProductIdsRef.current;
      if (currentSelection.size === 0) return;

      try {
        const allIds = cartProductIdsRef.current;
        const excluded = Array.from(allIds).filter(
          (id) => !currentSelection.has(id),
        );
        const serverTotals = await calculateCartTotals(
          excluded.length > 0 ? excluded : undefined,
        );
        // Re-check selection didn't change
        const stillSame = setsEqual(
          currentTotalsProductIdsRef.current,
          currentSelection,
        );
        if (stillSame) {
          setCartTotals(serverTotals);
        }
        console.log(`✅ Server verified totals: ${serverTotals.total}`);
      } catch (e) {
        console.warn("⚠️ Server verification failed:", e);
      }
    }, TOTALS_VERIFICATION_DEBOUNCE);
  }, [calculateCartTotals]);

  const updateQuantity = useCallback(
    async (productId: string, newQuantity: number): Promise<string> => {
      if (!user) return "Please log in first";
      if (!db) return "Loading...";

      if (newQuantity < 1) {
        return removeFromCart(productId);
      }

      if (!quantityLimiterRef.current.canProceed(`qty_${productId}`)) {
        return "Please wait";
      }

      // Step 1: Optimistic UI update (every tap)
      applyOptimisticQuantityChange(productId, newQuantity);

      // Step 2: Optimistic totals (immediate)
      const currentSelection = currentTotalsProductIdsRef.current;
      if (currentSelection.size > 0) {
        const optimistic = calculateOptimisticTotals(
          Array.from(currentSelection),
        );
        setCartTotals(optimistic);
      }

      // Step 3: Record latest desired qty. If a write loop is running, it will pick this up.
      pendingQuantityWritesRef.current.set(productId, newQuantity);

      const inFlight = quantityUpdateLocksRef.current.get(productId);
      if (inFlight) {
        return inFlight;
      }

      // Step 4: Drain loop — guarantees final desired qty lands on server
      const loopPromise = (async (): Promise<string> => {
        let resultMessage = "Quantity updated";
        try {
          while (pendingQuantityWritesRef.current.has(productId)) {
            const qtyToWrite =
              pendingQuantityWritesRef.current.get(productId)!;
            pendingQuantityWritesRef.current.delete(productId);

            await updateDoc(doc(db, "users", user.uid, "cart", productId), {
              quantity: qtyToWrite,
              updatedAt: serverTimestamp(),
            });
            console.log(
              `✅ Updated quantity: ${productId} = ${qtyToWrite}`,
            );
          }
          debouncedTotalsVerification();
        } catch (error) {
          console.error("❌ Update quantity error:", error);
          resultMessage = "Failed to update quantity";
          // Drop pending writes on error to avoid infinite retry loop
          pendingQuantityWritesRef.current.delete(productId);
        } finally {
          quantityUpdateLocksRef.current.delete(productId);
        }
        return resultMessage;
      })();

      quantityUpdateLocksRef.current.set(productId, loopPromise);
      return loopPromise;
    },
    [
      user,
      db,
      removeFromCart,
      applyOptimisticQuantityChange,
      calculateOptimisticTotals,
      debouncedTotalsVerification,
    ],
  );

  // ========================================================================
  // BATCH REMOVE
  // ========================================================================

  const removeMultipleFromCart = useCallback(
    async (productIds: string[]): Promise<string> => {
      if (!user) return "Please log in first";
      if (!db) return "Loading...";
      if (productIds.length === 0) return "No items selected";

      try {
        const shopIds: Record<string, string | null> = {};
        for (const productId of productIds) {
          const localItem = cartItemsRef.current.find(
            (item) => item.productId === productId,
          );
          shopIds[productId] = localItem?.isShop ? localItem.sellerId : null;
        }

        productIds.forEach((productId) => applyOptimisticRemove(productId));

        const batch = writeBatch(db);
        productIds.forEach((productId) => {
          batch.delete(doc(db, "users", user.uid, "cart", productId));
        });
        batch.update(doc(db, "users", user.uid), {
          cartItemIds: arrayRemove(...productIds),
        });
        await batch.commit();

        updateLocalProfileField(
          "cartItemIds",
          (getProfileField<string[]>("cartItemIds") ?? []).filter(
            (id) => !productIds.includes(id),
          ),
        );

        metricsEventService.logBatchCartRemovals({
          productIds,
          shopIds,
        });
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
      getProfileField,
      updateLocalProfileField,
    ],
  );

  // ========================================================================
  // REFRESH (force reload first page)
  // ========================================================================

  const refresh = useCallback(async () => {
    if (!user || !db) return;

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
  // VALIDATION — With retry logic matching Flutter
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
          errors: {
            _system: { key: "validation_service_unavailable", params: {} },
          },
          warnings: {},
          validatedItems: [],
        };
      }

      try {
        const itemsToValidate = cartItemsRef.current
          .filter((item) => selectedProductIds.includes(item.productId))
          .map((item) => {
            const cartData = item.cartData;
            return {
              productId: item.productId,
              quantity: item.quantity ?? 1,
              selectedColor: cartData.selectedColor,
              productSource:
                ((cartData as Record<string, unknown>)
                  .productSource as string) ?? "shop_products",
              cachedPrice: cartData.cachedPrice,
              cachedBundlePrice: cartData.cachedBundlePrice,
              cachedDiscountPercentage: cartData.cachedDiscountPercentage,
              cachedDiscountThreshold: cartData.cachedDiscountThreshold,
              cachedBulkDiscountPercentage:
                cartData.cachedBulkDiscountPercentage,
              cachedMaxQuantity: cartData.cachedMaxQuantity,
            };
          });

        if (itemsToValidate.length === 0) {
          return {
            isValid: false,
            errors: {
              _system: { key: "no_items_selected", params: {} },
            },
            warnings: {},
            validatedItems: [],
          };
        }

        const result = await retryWithBackoff(
          async () => {
            const validateCartCheckoutFunction = httpsCallable(
              functions,
              "validateCartCheckout",
            );
            const r = await validateCartCheckoutFunction({
              cartItems: itemsToValidate,
              reserveStock,
            });
            const data = deepConvertMap(r.data);
            return {
              isValid: (data.isValid as boolean) ?? false,
              errors: (data.errors as Record<string, ValidationMessage>) ?? {},
              warnings:
                (data.warnings as Record<string, ValidationMessage>) ?? {},
              validatedItems:
                (data.validatedItems as ValidatedCartItem[]) ?? [],
            };
          },
          "Validate Cart",
          2,
          300,
        );

        return result;
      } catch (error) {
        console.error("❌ Validation failed after retries:", error);
        return {
          isValid: false,
          errors: {
            _system: { key: "validation_service_unavailable", params: {} },
          },
          warnings: {},
          validatedItems: [],
        };
      }
    },
    [functions],
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

        // Refresh after cache update so UI reflects new prices (matches Flutter)
        if ((data.success as boolean) === true) {
          await refresh();
        }

        return (data.success as boolean) === true;
      } catch (error) {
        console.error("❌ Cache update error:", error);
        return false;
      }
    },
    [user, functions, refresh],
  );

  // ========================================================================
  // FETCH ALL SELECTED ITEMS — Matches Flutter (used for payment screen)
  // ========================================================================

  const fetchAllSelectedItems = useCallback(
    (selectedProductIds: string[]): CartItem[] => {
      return cartItemsRef.current.filter((item) =>
        selectedProductIds.includes(item.productId),
      );
    },
    [],
  );

  // ========================================================================
  // LOAD MORE
  // ========================================================================

  const loadMoreItems = useCallback(async () => {
    if (!user || !db || !hasMore || isLoadingMore) return;

    if (pendingFetchesRef.current.has("loadMore")) {
      console.log("⏳ Already loading more...");
      return;
    }

    setIsLoadingMore(true);

    const loadMorePromise = (async () => {
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
        trackReads("Cart:LoadMore", snapshot.docs.length || 1);

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

        if (newItems.length > 0) {
          setCartItems((currentItems) => {
            const existingIds = new Set(
              currentItems.map((item) => item.productId),
            );
            const uniqueNewItems = newItems.filter(
              (item) => !existingIds.has(item.productId),
            );

            if (uniqueNewItems.length === 0) {
              console.warn(`⚠️ All ${newItems.length} items already loaded`);
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
        throw error;
      } finally {
        setIsLoadingMore(false);
      }
    })();

    pendingFetchesRef.current.set("loadMore", loadMorePromise);
    try {
      await loadMorePromise;
    } catch {
      // Already logged; allow caller to observe failure
    } finally {
      pendingFetchesRef.current.delete("loadMore");
    }
  }, [
    user,
    hasMore,
    isLoadingMore,
    db,
    hasRequiredFields,
    buildProductFromCartData,
    createCartItem,
    sortCartItems,
  ]);

  // ========================================================================
  // CLEAR LOCAL CACHE — Matches Flutter
  // ========================================================================

  const clearLocalCache = useCallback(() => {
    console.log("🗑️ Clearing cart local cache");

    setCartItems([]);
    setCartProductIds(new Set());
    setCartCount(0);
    setIsInitialized(false);

    optimisticCacheRef.current.clear();
    optimisticTimeoutsRef.current.forEach((t) => clearTimeout(t));
    optimisticTimeoutsRef.current.clear();

    lastDocumentRef.current = null;
    setHasMore(true);
  }, [user]);

  const clearAllData = useCallback(() => {
    console.log("🗑️ _clearAllData called");
    setCartCount(0);
    setCartProductIds(new Set());
    setCartItems([]);
    setCartTotals(null);
    currentTotalsProductIdsRef.current = new Set();
    setIsInitialized(false);
    setIsLoading(false);
    setIsTotalsLoading(false);
    optimisticCacheRef.current.clear();

    if (totalsVerificationTimerRef.current) {
      clearTimeout(totalsVerificationTimerRef.current);
      totalsVerificationTimerRef.current = null;
    }
    optimisticTimeoutsRef.current.forEach((t) => clearTimeout(t));
    optimisticTimeoutsRef.current.clear();
    quantityUpdateLocksRef.current.clear();
    pendingQuantityWritesRef.current.clear();
  }, []);

  // ========================================================================
  // EFFECTS
  // ========================================================================

 // Handle user changes — clear data on user switch / logout. 
 // Cross-device ID sync is handled by the dedicated cartItemIds listener below.
 useEffect(() => {
  if (!user) {
    if (currentUserIdRef.current !== null) {
      currentUserIdRef.current = null;
      clearAllData();
    }
    return;
  }

  // Same user re-emitting — let the cartItemIds listener handle ID sync.
  if (currentUserIdRef.current === user.uid) {
    return;
  }

  // Different user — full clear. The cartItemIds listener will re-seed
  // once profileData is populated.
  currentUserIdRef.current = user.uid;
  clearAllData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [user]);

// Listen to user doc cart IDs changes (cross-device sync)
  // Matches Flutter's _onUserDocCartIdsChanged — always syncs IDs/count,
  // but preserves any in-flight optimistic adds/removes.
  useEffect(() => {
    if (!user || !profileData) return;
    const ids = new Set<string>(
      getProfileField<string[]>("cartItemIds") ?? [],
    );

    // Apply optimistic overlay (matches updateCartIds behavior)
    optimisticCacheRef.current.forEach((value, key) => {
      if (value._deleted === true) {
        ids.delete(key);
      } else {
        ids.add(key);
      }
    });

    setCartProductIds(ids);
    setCartCount(ids.size);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileData?.cartItemIds, user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      optimisticTimeoutsRef.current.forEach((timer) => clearTimeout(timer));
      optimisticTimeoutsRef.current.clear();
      if (totalsVerificationTimerRef.current) {
        clearTimeout(totalsVerificationTimerRef.current);
        totalsVerificationTimerRef.current = null;
      }
    };
  }, []);

  // ========================================================================
  // CONTEXT VALUES
  // ========================================================================

  const stateValue = useMemo<CartStateContextType>(
    () => ({
      cartCount,
      cartProductIds,
      cartItems,
      isLoading,
      isLoadingMore,
      hasMore,
      isInitialized,
      cartTotals,
      isTotalsLoading,
    }),
    [
      cartCount,
      cartProductIds,
      cartItems,
      isLoading,
      isLoadingMore,
      hasMore,
      isInitialized,
      cartTotals,
      isTotalsLoading,
    ],
  );

  const actionsValue = useMemo<CartActionsContextType>(
    () => ({
      addProductToCart,
      addToCartById,
      removeFromCart,
      updateQuantity,
      removeMultipleFromCart,
      initializeCartIfNeeded,
      loadCart,
      loadMoreItems,
      calculateCartTotals,
      updateTotalsForExcluded,
      validateForPayment,
      updateCartCacheFromValidation,
      refresh,
      clearLocalCache,
      fetchAllSelectedItems,
    }),
    [
      addProductToCart,
      addToCartById,
      removeFromCart,
      updateQuantity,
      removeMultipleFromCart,
      initializeCartIfNeeded,
      loadCart,
      loadMoreItems,
      calculateCartTotals,
      updateTotalsForExcluded,
      validateForPayment,
      updateCartCacheFromValidation,
      refresh,
      clearLocalCache,
      fetchAllSelectedItems,
    ],
  );

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