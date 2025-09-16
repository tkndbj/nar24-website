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
  increment,
  query,
  orderBy,
  limit,
  startAfter,
  where,
  DocumentSnapshot,
  QuerySnapshot,
  runTransaction,
  getDoc,
  getDocs,
  Timestamp,
  DocumentReference,
  FieldValue,
  documentId,
  Firestore,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { ProductUtils, Product } from '@/app/models/Product';

// Types
interface CartUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

interface SalePreferences {
  discountThreshold?: number;
  discountPercentage?: number;
  maxQuantity?: number;
}

interface BundleData {
  bundlePrice?: number;
  currency?: string;
  bundleId?: string;
  mainProductId?: string;
  isBundle?: boolean;
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
  isLoadingProduct?: boolean;
  loadError?: boolean;
  salePreferences?: SalePreferences | null;
  selectedColorImage?: string;
  [key: string]: unknown;
}

interface CartAttributes {
  [key: string]: unknown;
}

interface SellerInfo {
  sellerId: string;
  sellerName: string;
  isShop: boolean;
}

interface ProductDocumentData {
  shopId?: string;
  ownerId?: string;
  shopName?: string;
  sellerName?: string;
  brandModel?: string;
  ownerName?: string;
  cartCount?: number;
  metricsUpdatedAt?: Timestamp | FieldValue;
  productName?: string;
  price?: number;
  currency?: string;
  imageUrls?: string[];
  colorImages?: Record<string, string[]>;
  averageRating?: number;
  attributes?: Record<string, unknown>;
  quantity?: number;
  colorQuantities?: Record<string, number>;
  paused?: boolean;
}

export interface CartTotals {
  subtotal: number;
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
  addToCart: (
    productId: string,
    quantity?: number,
    attributes?: CartAttributes
  ) => Promise<string>;
  removeFromCart: (productId: string) => Promise<string>;
  updateQuantity: (productId: string, newQuantity: number) => Promise<string>;
  incrementQuantity: (productId: string) => Promise<string>;
  decrementQuantity: (productId: string) => Promise<string>;
  clearCart: () => Promise<string>;
  removeMultipleFromCart: (productIds: string[]) => Promise<string>;
  initializeCartIfNeeded: () => Promise<void>;
  loadMoreItems: () => Promise<void>;
  calculateCartTotals: (selectedProductIds?: string[]) => Promise<CartTotals>;
  validateForPayment: (selectedProductIds: string[]) => Promise<{
    isValid: boolean;
    errors: Record<string, string>;
  }>;
  refresh: () => Promise<void>;

  // Utilities
  isInCart: (productId: string) => boolean;
  isOptimisticallyAdding: (productId: string) => boolean;
  isOptimisticallyRemoving: (productId: string) => boolean;
  getCachedCartItem: (productId: string) => CartData | null;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};

// Constants - Matching Flutter implementation
const ITEMS_PER_PAGE = 20;
const CACHE_VALID_DURATION = 5 * 60 * 1000; // 5 minutes
const OPTIMISTIC_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

interface CartProviderProps {
  children: ReactNode;
  user: CartUser | User | null;
  db: Firestore;
}

export const CartProvider: React.FC<CartProviderProps> = ({ 
  children, 
  user,
  db 
}) => {
  // Core state matching Flutter implementation
  const [cartProductIds, setCartProductIds] = useState<Set<string>>(new Set());
  const [cartCount, setCartCount] = useState(0);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Refs for managing state without re-renders
  const currentPageRef = useRef(0);
  const lastDocumentRef = useRef<DocumentSnapshot | null>(null);
  const cartItemsCacheRef = useRef<Record<string, CartData>>({});
  const lastCacheUpdateRef = useRef<Date | null>(null);
  const retryCountRef = useRef(0);

  // Optimistic operations tracking - matching Flutter implementation
  const optimisticAddsRef = useRef<Set<string>>(new Set());
  const optimisticRemovesRef = useRef<Set<string>>(new Set());
  const optimisticItemsRef = useRef<Map<string, CartItem>>(new Map());
  const optimisticTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const operationIdsRef = useRef<Map<string, string>>(new Map());

  const pendingUpdatesRef = useRef<Record<string, Partial<CartData>>>({});
  const batchUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeCartRef = useRef<(() => void) | null>(null);

  // System fields checker - matching Flutter
  const isSystemField = useCallback((key: string): boolean => {
    const systemFields = new Set([
      "addedAt",
      "updatedAt", 
      "quantity",
      "sellerId",
      "sellerName",
      "isShop",
    ]);
    return systemFields.has(key);
  }, []);

  // Clear optimistic state - matching Flutter implementation
  const clearOptimisticState = useCallback((productId: string): void => {
    optimisticAddsRef.current.delete(productId);
    optimisticRemovesRef.current.delete(productId);
    optimisticItemsRef.current.delete(productId);
    
    const timer = optimisticTimersRef.current.get(productId);
    if (timer) {
      clearTimeout(timer);
      optimisticTimersRef.current.delete(productId);
    }
    
    operationIdsRef.current.delete(productId);
  }, []);

  // Clear all data when user logs out - matching Flutter
  const clearUserData = useCallback((): void => {
    setCartCount(0);
    setCartProductIds(new Set());
    setCartItems([]);
    setIsInitialized(false);
    setIsLoading(false);
    setIsLoadingMore(false);
    setHasMore(true);

    cartItemsCacheRef.current = {};
    lastCacheUpdateRef.current = null;
    pendingUpdatesRef.current = {};
    retryCountRef.current = 0;
    currentPageRef.current = 0;
    lastDocumentRef.current = null;

    // Clear optimistic state
    optimisticAddsRef.current.clear();
    optimisticRemovesRef.current.clear();
    optimisticItemsRef.current.clear();
    optimisticTimersRef.current.forEach((timer) => clearTimeout(timer));
    optimisticTimersRef.current.clear();
    operationIdsRef.current.clear();

    if (batchUpdateTimerRef.current) {
      clearTimeout(batchUpdateTimerRef.current);
      batchUpdateTimerRef.current = null;
    }
  }, []);

  // Fetch active bundle for product - matching Flutter
  const fetchActiveBundleForProduct = useCallback(
    async (productId: string): Promise<BundleData | null> => {
      try {
        const snapshot = await getDocs(
          query(
            collection(db, "bundles"),
            where("productId", "==", productId),
            where("isActive", "==", true),
            limit(1)
          )
        );

        if (snapshot.empty) return null;

        const data = snapshot.docs[0].data();
        return {
          bundlePrice: data.bundlePrice,
          currency: data.currency,
          bundleId: data.bundleId,
          mainProductId: data.mainProductId,
          isBundle: true,
        };
      } catch (error) {
        console.error("Error fetching bundle:", error);
        return null;
      }
    },
    [db]
  );

  // Fetch sale preferences batch - matching Flutter implementation
  const fetchSalePreferencesBatch = useCallback(
    async (productIds: string[]): Promise<Record<string, SalePreferences | null>> => {
      const result: Record<string, SalePreferences | null> = {};

      try {
        for (let i = 0; i < productIds.length; i += 10) {
          const chunk = productIds.slice(i, i + 10);

          const futures = chunk.map(async (productId) => {
            try {
              const salePrefsDoc = await getDoc(
                doc(db, "shop_products", productId, "sale_preferences", "preferences")
              );

              if (salePrefsDoc.exists()) {
                const data = salePrefsDoc.data();
                if (data.discountThreshold && data.discountPercentage) {
                  result[productId] = data as SalePreferences;
                } else {
                  result[productId] = null;
                }
              } else {
                result[productId] = null;
              }
            } catch (error) {
              console.error(`Error fetching sale preferences for ${productId}:`, error);
              result[productId] = null;
            }
          });

          await Promise.all(futures);
        }
      } catch (error) {
        console.error("Error in fetchSalePreferencesBatch:", error);
        productIds.forEach((productId) => {
          result[productId] = null;
        });
      }

      return result;
    },
    [db]
  );

  // Get product document references - matching Flutter implementation
  const getProductDocument = useCallback(
    async (productIds: string[]): Promise<Record<string, DocumentReference | null>> => {
      const result: Record<string, DocumentReference | null> = {};

      try {
        for (let i = 0; i < productIds.length; i += 10) {
          const batch = productIds.slice(i, i + 10);

          // Try shop_products first
          const shopSnapshot = await getDocs(
            query(
              collection(db, "shop_products"),
              where(documentId(), "in", batch)
            )
          );

          const foundInShop = new Set<string>();
          shopSnapshot.docs.forEach((doc) => {
            result[doc.id] = doc.ref;
            foundInShop.add(doc.id);
          });

          // Check remaining IDs in products collection
          const remainingIds = batch.filter(id => !foundInShop.has(id));
          if (remainingIds.length > 0) {
            const productsSnapshot = await getDocs(
              query(
                collection(db, "products"), 
                where(documentId(), "in", remainingIds)
              )
            );

            productsSnapshot.docs.forEach((doc) => {
              result[doc.id] = doc.ref;
            });
          }

          // Mark unfound products as null
          batch.forEach((productId) => {
            if (!(productId in result)) {
              result[productId] = null;
            }
          });
        }
      } catch (error) {
        console.error("Error fetching product documents:", error);
        productIds.forEach((productId) => {
          result[productId] = null;
        });
      }

      return result;
    },
    [db]
  );

  // Fetch product details batch - matching Flutter implementation
  const fetchProductDetailsBatch = useCallback(
    async (productIds: string[]): Promise<Record<string, Product | null>> => {
      const result: Record<string, Product | null> = {};
  
      try {
        for (let i = 0; i < productIds.length; i += 10) {
          const chunk = productIds.slice(i, i + 10);
  
          const snapshot = await getDocs(
            query(
              collection(db, "shop_products"),
              where(documentId(), "in", chunk)
            )
          );
  
          snapshot.docs.forEach((doc) => {
            if (!result[doc.id]) {
              try {
                // CRITICAL: Use your existing ProductUtils.fromJson with proper doc data
                const docData = doc.data();
                const productJson = {
                  ...docData,
                  id: doc.id,
                  // Add reference info for sourceCollection detection
                  reference: {
                    id: doc.id,
                    path: doc.ref.path,
                    parent: {
                      id: doc.ref.parent.id
                    }
                  }
                };
                
                result[doc.id] = ProductUtils.fromJson(productJson);
              } catch (error) {
                console.error(`Error parsing product ${doc.id}:`, error);
                result[doc.id] = null;
              }
            }
          });
        }
      } catch (error) {
        console.error("Error fetching product details:", error);
      }
  
      return result;
    },
    [db]
  );

  // Fetch seller info - matching Flutter implementation  
  const fetchSellerInfo = useCallback(
    async (prodRef: DocumentReference, productData: ProductDocumentData): Promise<SellerInfo> => {
      const parent = prodRef.parent.id;
      let sellerId: string;
      let sellerName: string;
      let isShop: boolean;

      if (parent === "shop_products") {
        const shopId = productData.shopId || productData.ownerId;
        sellerId = shopId || "unknown";
        isShop = true;

        if (shopId) {
          try {
            const shopDoc = await getDoc(doc(db, "shops", shopId));
            if (shopDoc.exists()) {
              sellerName = shopDoc.data()?.name || "Unknown Shop";
            } else {
              sellerName = productData.shopName || "Unknown Shop";
            }
          } catch (error) {
            console.error("Error fetching shop info:", error);
            sellerName = productData.shopName || "Unknown Shop";
          }
        } else {
          sellerName = "Unknown Shop";
        }
      } else {
        const ownerId = productData.ownerId;
        sellerId = ownerId || "unknown";
        isShop = false;

        if (ownerId) {
          try {
            const userDoc = await getDoc(doc(db, "users", ownerId));
            if (userDoc.exists()) {
              sellerName = userDoc.data()?.displayName || "Unknown Seller";
            } else {
              sellerName = productData.sellerName || "Unknown Seller";
            }
          } catch (error) {
            console.error("Error fetching user info:", error);
            sellerName = productData.sellerName || "Unknown Seller";
          }
        } else {
          sellerName = "Unknown Seller";
        }
      }

      return { sellerId, sellerName, isShop };
    },
    [db]
  );

  // Apply optimistic update - matching Flutter implementation
  const applyOptimisticUpdate = useCallback(
    async (
      productId: string,
      isAdding: boolean,
      quantity: number,
      attributes?: CartAttributes
    ): Promise<void> => {
      clearOptimisticState(productId);

      if (isAdding) {
        optimisticAddsRef.current.add(productId);

        // Update cart IDs immediately
        const newIds = new Set(cartProductIds);
        newIds.add(productId);
        setCartProductIds(newIds);
        setCartCount(newIds.size);

        // If initialized, try to add optimistic item with product data
        if (isInitialized) {
          const productDetails = await fetchProductDetailsBatch([productId]);
          const product = productDetails[productId];

          if (product) {
            const optimisticItem: CartItem = {
              cartData: {
                quantity,
                addedAt: serverTimestamp(),
                sellerId: "loading...",
                sellerName: "Loading...",
                isShop: false,
                ...attributes,
              } as CartData,
              product,
              productId,
              isOptimistic: true,
              quantity,
              sellerName: "Loading...",
              sellerId: "loading...",
              isShop: false,
              ...attributes,
            };

            optimisticItemsRef.current.set(productId, optimisticItem);

            // Add to UI immediately
            const currentItems = [...cartItems];
            currentItems.unshift(optimisticItem);
            setCartItems(currentItems);
          }
        }
      } else {
        optimisticRemovesRef.current.add(productId);

        // Remove from IDs immediately
        const newIds = new Set(cartProductIds);
        newIds.delete(productId);
        setCartProductIds(newIds);
        setCartCount(newIds.size);

        // Remove from UI immediately
        if (isInitialized) {
          setCartItems(cartItems.filter(item => item.productId !== productId));
        }
      }

      // Set timeout for rollback
      const timeout = setTimeout(() => {
        rollbackOptimisticUpdate(productId, isAdding);
      }, OPTIMISTIC_TIMEOUT);
      
      optimisticTimersRef.current.set(productId, timeout);
    },
    [cartProductIds, cartItems, isInitialized, fetchProductDetailsBatch]
  );

  // Rollback optimistic update - matching Flutter implementation
  const rollbackOptimisticUpdate = useCallback(
    (productId: string, wasAdding: boolean): void => {
      if (wasAdding && optimisticAddsRef.current.has(productId)) {
        optimisticAddsRef.current.delete(productId);
        const newIds = new Set(cartProductIds);
        newIds.delete(productId);
        setCartProductIds(newIds);
        setCartCount(newIds.size);

        if (isInitialized) {
          const currentItems = [...cartItems];
          const filtered = currentItems.filter(
            item => !(item.productId === productId && item.isOptimistic)
          );
          setCartItems(filtered);
        }
      } else if (!wasAdding && optimisticRemovesRef.current.has(productId)) {
        optimisticRemovesRef.current.delete(productId);
        const newIds = new Set(cartProductIds);
        newIds.add(productId);
        setCartProductIds(newIds);
        setCartCount(newIds.size);

        if (isInitialized && cartItemsCacheRef.current[productId]) {
          // Restore removed item logic would go here
        }
      }

      const timer = optimisticTimersRef.current.get(productId);
      if (timer) {
        clearTimeout(timer);
        optimisticTimersRef.current.delete(productId);
      }
      optimisticItemsRef.current.delete(productId);
    },
    [cartProductIds, cartItems, isInitialized]
  );

  // Process cart snapshot - reconcile with optimistic updates
  const processCartSnapshot = useCallback((snapshot: QuerySnapshot): void => {
    const serverIds = new Set<string>();
    const newCache: Record<string, CartData> = {};

    snapshot.docs.forEach((doc) => {
      serverIds.add(doc.id);
      const data = doc.data();

      const cartData: CartData = {
        quantity: data.quantity || 1,
        addedAt: data.addedAt,
        updatedAt: data.updatedAt,
        sellerId: data.sellerId || "unknown",
        sellerName: data.sellerName || "Unknown",
        isShop: data.isShop || false,
      };

      // Add dynamic attributes
      Object.entries(data).forEach(([key, value]) => {
        if (!isSystemField(key)) {
          cartData[key] = value;
        }
      });

      newCache[doc.id] = cartData;
    });

    cartItemsCacheRef.current = newCache;
    lastCacheUpdateRef.current = new Date();

    // Reconcile optimistic updates
    const confirmedAdds = new Set([...optimisticAddsRef.current].filter(id => serverIds.has(id)));
    confirmedAdds.forEach(productId => clearOptimisticState(productId));

    const confirmedRemoves = new Set([...optimisticRemovesRef.current].filter(id => !serverIds.has(id)));
    confirmedRemoves.forEach(productId => clearOptimisticState(productId));

    // Compute effective IDs
    const effectiveIds = new Set(serverIds);
    optimisticAddsRef.current.forEach(id => effectiveIds.add(id));
    optimisticRemovesRef.current.forEach(id => effectiveIds.delete(id));

    setCartProductIds(effectiveIds);
    setCartCount(effectiveIds.size);

    // Update cart items if initialized
    if (isInitialized) {
      updateCartItemsFromSnapshot(snapshot);
    }
  }, [isSystemField, isInitialized]);

  // Update cart items from snapshot - matching Flutter implementation
  const updateCartItemsFromSnapshot = useCallback(
    async (snapshot: QuerySnapshot): Promise<void> => {
      if (snapshot.empty) {
        setCartItems([]);
        return;
      }

      const productIds = snapshot.docs.map(doc => doc.id);
      const productDetails = await fetchProductDetailsBatch(productIds);
      const salePreferencesMap = await fetchSalePreferencesBatch(productIds);

      const updatedItems: CartItem[] = [];

      for (const cartDoc of snapshot.docs) {
        const cartData = cartDoc.data() as CartData;
        const productDetail = productDetails[cartDoc.id];
        const salePreferences = salePreferencesMap[cartDoc.id];

        if (productDetail) {
          const quantity = cartData.quantity || 1;

          const dynamicAttributes: Record<string, unknown> = {};
          Object.entries(cartData).forEach(([key, value]) => {
            if (!isSystemField(key)) {
              dynamicAttributes[key] = value;
            }
          });

          const selectedColorImage = resolveColorImage(productDetail, cartData.selectedColor as string);

          updatedItems.push({
            cartData,
            product: productDetail,
            productId: cartDoc.id,
            isOptimistic: false,
            quantity,
            salePreferences,
            selectedColorImage,
            sellerName: cartData.sellerName,
            sellerId: cartData.sellerId,
            isShop: cartData.isShop,
            ...dynamicAttributes,
          });
        }
      }

      // Sort by addedAt
      updatedItems.sort((a, b) => {
        const aTime = a.cartData.addedAt as Timestamp;
        const bTime = b.cartData.addedAt as Timestamp;
        if (!aTime || !bTime) return 0;
        return bTime.toMillis() - aTime.toMillis();
      });

      // Add optimistic items that aren't in server response yet
      optimisticItemsRef.current.forEach((optimisticItem, productId) => {
        if (!updatedItems.some(item => item.productId === productId)) {
          updatedItems.unshift(optimisticItem);
        }
      });

      setCartItems(updatedItems);
    },
    [fetchProductDetailsBatch, fetchSalePreferencesBatch, isSystemField]
  );

  // Resolve color image - matching Flutter implementation
  const resolveColorImage = useCallback(
    (product: Product, selectedColor?: string): string | undefined => {
      if (!selectedColor) return undefined;

      if (product.colorImages && product.colorImages[selectedColor]) {
        const colorImagesList = product.colorImages[selectedColor];
        if (colorImagesList && colorImagesList.length > 0) {
          return colorImagesList[0];
        }
      }

      return undefined;
    },
    []
  );

  // Main cart operations - matching Flutter implementation
  const addToCart = useCallback(
    async (
      productId: string,
      quantity: number = 1,
      attributes?: CartAttributes
    ): Promise<string> => {
      const operationId = `${productId}_${Date.now()}`;
      
      if (!user) return "Please log in";
      if (!productId.trim()) return "Invalid product ID";
      if (quantity < 1) return "Quantity must be at least 1";
      if (operationIdsRef.current.has(productId)) return "Operation in progress";
      
      operationIdsRef.current.set(productId, operationId);

      try {
        const isCurrentlyInCart = cartProductIds.has(productId);
        
        // Get product document reference
        const prodRef = await getProductDocument([productId]);
        if (!prodRef[productId]) {
          return "Product not found";
        }

        // Fetch product data and seller info
        const prodSnapshot = await getDoc(prodRef[productId]!);
        if (!prodSnapshot.exists()) {
          return "Product not found";
        }
        const productData = prodSnapshot.data() as ProductDocumentData;

        // Check sale preferences for maxQuantity limit
        const salePrefsResult = await fetchSalePreferencesBatch([productId]);
        const salePrefs = salePrefsResult[productId];
        
        if (salePrefs?.maxQuantity) {
          if (isCurrentlyInCart) {
            const currentCartItem = cartItemsCacheRef.current[productId];
            const currentQuantity = currentCartItem?.quantity || 0;
            const totalQuantity = currentQuantity + quantity;
            
            if (totalQuantity > salePrefs.maxQuantity) {
              return `Cannot add more. Maximum allowed: ${salePrefs.maxQuantity}`;
            }
            return await updateQuantity(productId, totalQuantity);
          } else {
            if (quantity > salePrefs.maxQuantity) {
              return `Cannot add ${quantity}. Maximum allowed: ${salePrefs.maxQuantity}`;
            }
          }
        }

        // Apply optimistic update immediately
        await applyOptimisticUpdate(productId, !isCurrentlyInCart, quantity, attributes);

        // Fetch bundle info and seller details
        const bundleData = await fetchActiveBundleForProduct(productId);
        const sellerInfo = await fetchSellerInfo(prodRef[productId]!, productData);

        // Run transaction
        const result = await runTransaction(db, async (transaction) => {
          const cartRef = doc(db, "users", user.uid, "cart", productId);

          const prodSnap = await transaction.get(prodRef[productId]!);
          if (!prodSnap.exists()) return "Product not found";
          const txProductData = prodSnap.data() as ProductDocumentData;

          const cartSnap = await transaction.get(cartRef);

          if (cartSnap.exists()) {
            // Remove from cart (toggle behavior)
            transaction.delete(cartRef);

            transaction.update(prodRef[productId]!, {
              cartCount: increment(-1),
              metricsUpdatedAt: serverTimestamp(),
            });

            return "Removed from cart";
          } else {
            // Add to cart
            const unitPrice = bundleData?.bundlePrice ?? txProductData.price ?? 0;

            const cartData: Record<string, unknown> = {
              addedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              quantity,
              unitPrice,
              currency: txProductData.currency || "TL",
              sellerId: sellerInfo.sellerId,
              sellerName: sellerInfo.sellerName,
              isShop: sellerInfo.isShop,
            };

            // Add bundle flag if applicable
            if (bundleData) {
              cartData.isBundle = true;
              if (bundleData.bundleId) {
                cartData.bundleId = bundleData.bundleId;
              }
            }

            // Copy product attributes
            if (txProductData.attributes) {
              Object.entries(txProductData.attributes).forEach(([k, v]) => {
                cartData[k] = v;
              });
            }

            // Add UI-selected attributes
            if (attributes) {
              Object.entries(attributes).forEach(([k, v]) => {
                cartData[k] = v;
              });
            }

            transaction.set(cartRef, cartData);

            transaction.update(prodRef[productId]!, {
              cartCount: increment(1),
              metricsUpdatedAt: serverTimestamp(),
            });

            return "Added to cart";
          }
        });

        // Clear optimistic state on success
        clearOptimisticState(productId);

        return result;
      } catch (error) {
        console.error("Cart operation error:", error);
        rollbackOptimisticUpdate(productId, !cartProductIds.has(productId));
        return `Failed to update cart: ${error}`;
      } finally {
        setTimeout(() => {
          if (operationIdsRef.current.get(productId) === operationId) {
            operationIdsRef.current.delete(productId);
          }
        }, 5000);
      }
    },
    [
      user,
      cartProductIds,
      getProductDocument,
      fetchSalePreferencesBatch,
      applyOptimisticUpdate,
      fetchActiveBundleForProduct,
      fetchSellerInfo,
      db,
      clearOptimisticState,
      rollbackOptimisticUpdate,
    ]
  );

  // Other methods implementation...
  const removeFromCart = useCallback(
    async (productId: string): Promise<string> => {
      return addToCart(productId); // Toggle behavior
    },
    [addToCart]
  );

  const updateQuantity = useCallback(
    async (productId: string, newQuantity: number): Promise<string> => {
      if (!user) return "Please log in";
      if (newQuantity < 1) return "Quantity must be at least 1";

      try {
        // Check sale preferences before updating
        const salePrefsResult = await fetchSalePreferencesBatch([productId]);
        const salePrefs = salePrefsResult[productId];
        
        if (salePrefs?.maxQuantity && newQuantity > salePrefs.maxQuantity) {
          return `Cannot set quantity to ${newQuantity}. Maximum allowed: ${salePrefs.maxQuantity}`;
        }

        await writeBatch(db).update(
          doc(db, "users", user.uid, "cart", productId),
          {
            quantity: newQuantity,
            updatedAt: serverTimestamp(),
          }
        ).commit();

        // Update UI
        if (isInitialized) {
          const items = [...cartItems];
          const idx = items.findIndex(e => e.productId === productId);
          if (idx !== -1) {
            items[idx].quantity = newQuantity;
            items[idx].cartData.quantity = newQuantity;
            setCartItems(items);
          }
        }

        return "Quantity updated";
      } catch (error) {
        return `Failed to update quantity: ${error}`;
      }
    },
    [user, db, fetchSalePreferencesBatch, isInitialized, cartItems]
  );

  const incrementQuantity = useCallback(
    async (productId: string): Promise<string> => {
      if (!user) return "Please log in";

      try {
        const cartDoc = await getDoc(doc(db, "users", user.uid, "cart", productId));
        if (!cartDoc.exists()) return "Item not in cart";

        const currentQty = cartDoc.data()?.quantity || 1;
        return updateQuantity(productId, currentQty + 1);
      } catch (error) {
        return `Failed to increment: ${error}`;
      }
    },
    [user, db, updateQuantity]
  );

  const decrementQuantity = useCallback(
    async (productId: string): Promise<string> => {
      if (!user) return "Please log in";

      try {
        const cartDoc = await getDoc(doc(db, "users", user.uid, "cart", productId));
        if (!cartDoc.exists()) return "Item not in cart";

        const currentQty = cartDoc.data()?.quantity || 1;
        if (currentQty <= 1) return "Quantity cannot be less than 1";

        return updateQuantity(productId, currentQty - 1);
      } catch (error) {
        return `Failed to decrement: ${error}`;
      }
    },
    [user, db, updateQuantity]
  );

  const removeMultipleFromCart = useCallback(
    async (productIds: string[]): Promise<string> => {
      if (!user) return "Please log in";
      if (productIds.length === 0) return "No products to remove";

      // Optimistic UI update
      if (isInitialized) {
        const current = [...cartItems];
        const filtered = current.filter(it => !productIds.includes(it.productId));
        setCartItems(filtered);
      }

      try {
        const batch = writeBatch(db);
        for (const id of productIds) {
          const docRef = doc(db, "users", user.uid, "cart", id);
          batch.delete(docRef);
          delete cartItemsCacheRef.current[id];
        }

        await batch.commit();
        return "Products removed from cart";
      } catch (error) {
        return `Failed to remove products: ${error}`;
      }
    },
    [user, db, isInitialized, cartItems]
  );

  const clearCart = useCallback(async (): Promise<string> => {
    if (!user) return "Please log in";

    try {
      const cartCollection = collection(db, "users", user.uid, "cart");
      const snapshot = await getDocs(cartCollection);

      if (snapshot.empty) return "Cart is already empty";

      const productIds = snapshot.docs.map(doc => doc.id);
      return await removeMultipleFromCart(productIds);
    } catch (error) {
      return `Failed to clear cart: ${error}`;
    }
  }, [user, db, removeMultipleFromCart]);

  const validateForPayment = useCallback(
    async (selectedProductIds: string[]): Promise<{
      isValid: boolean;
      errors: Record<string, string>;
    }> => {
      const errors: Record<string, string> = {};

      for (let i = 0; i < selectedProductIds.length; i += 10) {
        const batch = selectedProductIds.slice(i, i + 10);

        const snapshot = await getDocs(
          query(
            collection(db, "shop_products"),
            where(documentId(), "in", batch)
          )
        );

        const productDataMap: Record<string, ProductDocumentData> = {};
        snapshot.docs.forEach(doc => {
          productDataMap[doc.id] = doc.data();
        });

        for (const productId of batch) {
          const productData = productDataMap[productId];
          if (!productData) {
            errors[productId] = "Product no longer available";
            continue;
          }

          const paused = productData.paused || false;
          const quantity = productData.quantity || 0;

          if (paused) {
            errors[productId] = "Product is currently unavailable";
          } else if (quantity <= 0) {
            errors[productId] = "Product is out of stock";
          }
        }
      }

      return {
        isValid: Object.keys(errors).length === 0,
        errors,
      };
    },
    [db]
  );

  const calculateIndividualItemTotal = useCallback(
    (cartItem: CartItem): {
      total: number;
      currency: string;
      item: CartItemTotal;
    } => {
      const product = cartItem.product;
      if (!product) {
        return {
          total: 0,
          currency: "TL",
          item: {
            productId: "",
            quantity: 0,
            unitPrice: 0,
            total: 0,
          },
        };
      }
  
      const cartData = cartItem.cartData;
      const quantity = cartItem.quantity || 1;
      const salePreferences = cartItem.salePreferences;
  
      // Get base unit price - EXACT Flutter logic
      let unitPrice: number;
      // Flutter: cartData['isBundle'] == true ? (cartData['unitPrice'] as num?)?.toDouble() ?? product.price : product.price;
      if (cartData.isBundle === true) {
        unitPrice = typeof cartData.unitPrice === 'number' ? cartData.unitPrice : product.price;
      } else {
        unitPrice = product.price;
      }
  
      // Apply sale preference discount if applicable - EXACT Flutter logic
      if (salePreferences) {
        const discountThreshold = salePreferences.discountThreshold;
        const discountPercentage = salePreferences.discountPercentage;
        
        if (discountThreshold != null && 
            discountPercentage != null && 
            quantity >= discountThreshold) {
          // Apply discount to unit price
          unitPrice = unitPrice * (1 - (discountPercentage / 100));
          console.log(`🎯 Applied sale preference discount: ${discountPercentage}% for product ${product.id}`);
        }
      }
  
      const itemTotal = unitPrice * quantity;
  
      return {
        total: itemTotal,
        currency: product.currency && product.currency.length > 0 ? product.currency : "TL",
        item: {
          productId: product.id,
          quantity,
          unitPrice,
          total: itemTotal,
        },
      };
    },
    []
  );
  
  // Fixed calculateCartTotals function for React CartProvider
  const calculateCartTotals = useCallback(
    async (selectedProductIds?: string[]): Promise<CartTotals> => {
      if (!user) {
        return { subtotal: 0, total: 0, currency: "TL", items: [] };
      }
  
      try {
        const currentCartItems = cartItems;
        if (currentCartItems.length === 0) {
          return { subtotal: 0, total: 0, currency: "TL", items: [] };
        }
  
        let itemsToCalculate: CartItem[];
  
        if (selectedProductIds && selectedProductIds.length > 0) {
          itemsToCalculate = currentCartItems.filter(item =>
            selectedProductIds.includes(item.product?.id || "")
          );
        } else {
          itemsToCalculate = currentCartItems;
        }
  
        if (itemsToCalculate.length === 0) {
          return { subtotal: 0, total: 0, currency: "TL", items: [] };
        }
  
        console.log(`💰 Calculating totals for ${itemsToCalculate.length} items (with bundle optimization)`);
  
        // Filter out out-of-stock items first - EXACT Flutter logic
        const inStockItems: CartItem[] = [];
        for (const item of itemsToCalculate) {
          const product = item.product;
          if (!product) continue;
  
          const cartData = item.cartData;
          const selectedColor = cartData.selectedColor as string;
  
          let availableStock: number;
          // EXACT Flutter condition: selectedColor != null && selectedColor.isNotEmpty && selectedColor != 'default' && product.colorQuantities.containsKey(selectedColor)
          if (selectedColor != null && 
              selectedColor !== "" && 
              selectedColor !== "default" && 
              product.colorQuantities && 
              Object.prototype.hasOwnProperty.call(product.colorQuantities, selectedColor)) {
            availableStock = product.colorQuantities[selectedColor] || 0;
          } else {
            availableStock = product.quantity;
          }
  
          if (availableStock > 0) {
            inStockItems.push(item);
          } else {
            console.log(`⏭️ Skipping out-of-stock product: ${product.productName}`);
          }
        }
  
        if (inStockItems.length === 0) {
          return { subtotal: 0, total: 0, currency: "TL", items: [] };
        }
  
        // Group items by bundleId for bundle detection - EXACT Flutter logic
        const bundleGroups: Record<string, CartItem[]> = {};
        const individualItems: CartItem[] = [];
  
        for (const item of inStockItems) {
          const product = item.product;
          if (!product) continue;
  
          // CRITICAL: This is the exact Flutter condition
          // bundleIds != null && bundleIds.isNotEmpty && product.bundlePrice != null
          if (product.bundleIds != null && 
              Array.isArray(product.bundleIds) && 
              product.bundleIds.length > 0 && 
              product.bundlePrice != null) {
            const bundleId = product.bundleIds[0]; // Flutter: bundleIds.first
            if (!bundleGroups[bundleId]) {
              bundleGroups[bundleId] = [];
            }
            bundleGroups[bundleId].push(item);
          } else {
            individualItems.push(item);
          }
        }
  
        let subtotal = 0;
        const items: CartItemTotal[] = [];
        let currency = "TL";
        const processedBundles = new Set<string>();
  
        // Process bundle groups - EXACT Flutter logic
        for (const [bundleId, bundleItems] of Object.entries(bundleGroups)) {
          if (bundleItems.length >= 2 && !processedBundles.has(bundleId)) {
            // Calculate minimum quantity across all bundle products
            const minQuantity = Math.min(...bundleItems.map(item => item.quantity));
            
            if (minQuantity > 0) {
              const firstProduct = bundleItems[0].product!;
              const bundlePrice = firstProduct.bundlePrice || 0;
              
              if (bundlePrice > 0) {
                processedBundles.add(bundleId);
                
                // Process each bundle item with hybrid pricing - EXACT Flutter logic
                for (const item of bundleItems) {
                  const product = item.product!;
                  const totalQuantity = item.quantity;
                  
                  // Bundle portion (no sale preferences applied)
                  const bundlePortion = minQuantity;
                  const bundleItemCost = (bundlePrice / bundleItems.length) * bundlePortion;
                  
                  // Extra portion (check sale preferences based on TOTAL quantity)
                  const extraQuantity = totalQuantity - bundlePortion;
                  let extraCost = 0;
                  
                  if (extraQuantity > 0) {
                    let extraUnitPrice = product.price;
                    
                    // Apply sale preferences based on TOTAL quantity, not just extra
                    const salePreferences = item.salePreferences;
                    if (salePreferences) {
                      const discountThreshold = salePreferences.discountThreshold;
                      const discountPercentage = salePreferences.discountPercentage;
                      
                      // Check if TOTAL quantity meets threshold (exact Flutter logic)
                      if (discountThreshold != null && 
                          discountPercentage != null && 
                          totalQuantity >= discountThreshold) {
                        extraUnitPrice = extraUnitPrice * (1 - (discountPercentage / 100));
                        console.log(`🎯 Applied sale preference to extra quantity: ${discountPercentage}% for ${product.id} (total qty: ${totalQuantity})`);
                      }
                    }
                    
                    extraCost = extraUnitPrice * extraQuantity;
                  }
                  
                  const totalItemCost = bundleItemCost + extraCost;
                  subtotal += totalItemCost;
                  
                  items.push({
                    productId: product.id,
                    quantity: totalQuantity,
                    unitPrice: totalItemCost / totalQuantity,
                    total: totalItemCost,
                    isBundleItem: bundlePortion > 0,
                  });
                }
                
                if (items.length === 1) {
                  currency = firstProduct.currency.length > 0 ? firstProduct.currency : "TL";
                }
                
                console.log(`🎁 Applied hybrid bundle pricing for ${bundleId}: ${bundlePrice} + extras`);
                continue;
              }
            }
          }
          
          // Bundle not valid or no stock - calculate individually with sale preferences
          for (const item of bundleItems) {
            const itemTotal = calculateIndividualItemTotal(item);
            subtotal += itemTotal.total;
            items.push(itemTotal.item);
            
            if (items.length === 1) {
              currency = itemTotal.currency;
            }
          }
        }
  
        // Process individual (non-bundle) items
        for (const item of individualItems) {
          const itemTotal = calculateIndividualItemTotal(item);
          subtotal += itemTotal.total;
          items.push(itemTotal.item);
  
          if (items.length === 1) {
            currency = itemTotal.currency;
          }
        }
  
        console.log(`💰 Total calculation complete: ${subtotal} ${currency} for ${items.length} items`);
  
        return {
          subtotal,
          total: subtotal,
          currency,
          items,
        };
      } catch (error) {
        console.error("❌ Error calculating cart totals:", error);
        return { subtotal: 0, total: 0, currency: "TL", items: [] };
      }
    },
    [user, cartItems, calculateIndividualItemTotal]
  );


  // Load cart page implementation
  const loadCartPage = useCallback(
    async (page: number): Promise<void> => {
      if (!user) return;

      let cartQuery = query(
        collection(db, "users", user.uid, "cart"),
        orderBy("addedAt", "desc"),
        limit(ITEMS_PER_PAGE)
      );

      if (page > 0 && lastDocumentRef.current) {
        cartQuery = query(cartQuery, startAfter(lastDocumentRef.current));
      } else if (page === 0) {
        setCartItems([]);
        currentPageRef.current = 0;
        lastDocumentRef.current = null;
        setHasMore(true);
      }

      const snapshot = await getDocs(cartQuery);

      if (snapshot.empty) {
        setHasMore(false);
        return;
      }

      lastDocumentRef.current = snapshot.docs[snapshot.docs.length - 1];
      currentPageRef.current = page;
      setHasMore(snapshot.docs.length >= ITEMS_PER_PAGE);

      await processCartItemsFromDocs(snapshot.docs);
    },
    [user, db]
  );

  // Process cart items from docs
  const processCartItemsFromDocs = useCallback(
    async (cartDocs: DocumentSnapshot[]): Promise<void> => {
      const productIds = cartDocs.map(doc => doc.id);
      const productDetails = await fetchProductDetailsBatch(productIds);
      const salePreferencesMap = await fetchSalePreferencesBatch(productIds);

      const existingItems = new Map<string, CartItem>();
      cartItems
        .filter(item => !item.isOptimistic)
        .forEach(item => existingItems.set(item.productId, item));

      for (const cartDoc of cartDocs) {
        const data = cartDoc.data();
        if (!data) continue;

        const cartData = data as CartData;
        const productDetail = productDetails[cartDoc.id];
        const salePreferences = salePreferencesMap[cartDoc.id];

        if (productDetail) {
          const quantity = cartData.quantity || 1;

          const dynamicAttributes: Record<string, unknown> = {};
          Object.entries(cartData).forEach(([key, value]) => {
            if (!isSystemField(key)) {
              dynamicAttributes[key] = value;
            }
          });

          existingItems.set(cartDoc.id, {
            cartData,
            product: productDetail,
            productId: cartDoc.id,
            isOptimistic: false,
            quantity,
            salePreferences,
            selectedColorImage: resolveColorImage(productDetail, cartData.selectedColor as string),
            sellerName: cartData.sellerName,
            sellerId: cartData.sellerId,
            isShop: cartData.isShop,
            ...dynamicAttributes,
          });
        }
      }

      const sortedItems = Array.from(existingItems.values()).sort((a, b) => {
        const aTime = a.cartData.addedAt as Timestamp;
        const bTime = b.cartData.addedAt as Timestamp;
        if (!aTime || !bTime) return 0;
        return bTime.toMillis() - aTime.toMillis();
      });

      setCartItems(sortedItems);
    },
    [cartItems, fetchProductDetailsBatch, fetchSalePreferencesBatch, isSystemField, resolveColorImage]
  );

  const initializeCartIfNeeded = useCallback(async (): Promise<void> => {
    if (!user) {
      console.warn("Cannot initialize cart - no user logged in");
      return;
    }

    if (isInitialized || isLoading) {
      console.log("Cart already initialized or loading");
      return;
    }

    console.log(`Initializing cart for user: ${user.uid}`);
    setIsLoading(true);

    try {
      await loadCartPage(0);
      setIsInitialized(true);
      console.log("Cart initialized successfully");
    } catch (error) {
      console.error("Error initializing cart:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isInitialized, isLoading, loadCartPage]);

  const loadMoreItems = useCallback(async (): Promise<void> => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      await loadCartPage(currentPageRef.current + 1);
    } catch (error) {
      console.error("Error loading more cart items:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, loadCartPage]);

  const refresh = useCallback(async (): Promise<void> => {
    setHasMore(true);
    setIsInitialized(false);
    currentPageRef.current = 0;
    lastDocumentRef.current = null;
    cartItemsCacheRef.current = {};
    lastCacheUpdateRef.current = null;

    await initializeCartIfNeeded();
  }, [initializeCartIfNeeded]);

  // Utility methods
  const isInCart = useCallback(
    (productId: string): boolean => cartProductIds.has(productId),
    [cartProductIds]
  );

  const isOptimisticallyAdding = useCallback(
    (productId: string): boolean => optimisticAddsRef.current.has(productId),
    []
  );

  const isOptimisticallyRemoving = useCallback(
    (productId: string): boolean => optimisticRemovesRef.current.has(productId),
    []
  );

  const getCachedCartItem = useCallback((productId: string): CartData | null => {
    if (
      lastCacheUpdateRef.current &&
      Date.now() - lastCacheUpdateRef.current.getTime() < CACHE_VALID_DURATION &&
      cartItemsCacheRef.current[productId]
    ) {
      return { ...cartItemsCacheRef.current[productId] };
    }
    return null;
  }, []);

  // Main effect for cart subscription
  useEffect(() => {
    if (user) {
      if (unsubscribeCartRef.current) {
        unsubscribeCartRef.current();
      }

      const cartCollection = collection(db, "users", user.uid, "cart");
      unsubscribeCartRef.current = onSnapshot(
        cartCollection,
        (snapshot) => {
          processCartSnapshot(snapshot);
        },
        (error) => {
          console.error("Cart subscription error:", error);
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            setTimeout(() => {
              // Retry subscription
            }, RETRY_DELAY * retryCountRef.current);
          }
        }
      );
    } else {
      if (unsubscribeCartRef.current) {
        unsubscribeCartRef.current();
        unsubscribeCartRef.current = null;
      }
      clearUserData();
    }

    return () => {
      if (unsubscribeCartRef.current) {
        unsubscribeCartRef.current();
      }
    };
  }, [user, db, processCartSnapshot, clearUserData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeCartRef.current) {
        unsubscribeCartRef.current();
      }
      if (batchUpdateTimerRef.current) {
        clearTimeout(batchUpdateTimerRef.current);
      }
      optimisticTimersRef.current.forEach(timer => clearTimeout(timer));
    };
  }, []);

  const contextValue = useMemo<CartContextType>(() => ({
    // State
    cartCount,
    cartProductIds,
    cartItems,
    isLoading,
    isLoadingMore,
    hasMore,
    isInitialized,

    // Methods
    addToCart,
    removeFromCart,
    updateQuantity,
    incrementQuantity,
    decrementQuantity,
    clearCart,
    removeMultipleFromCart,
    initializeCartIfNeeded,
    loadMoreItems,
    calculateCartTotals,
    validateForPayment,
    refresh,

    // Utilities
    isInCart,
    isOptimisticallyAdding,
    isOptimisticallyRemoving,
    getCachedCartItem,
  }), [
    cartCount,
    cartProductIds,
    cartItems,
    isLoading,
    isLoadingMore,
    hasMore,
    isInitialized,
    addToCart,
    removeFromCart,
    updateQuantity,
    incrementQuantity,
    decrementQuantity,
    clearCart,
    removeMultipleFromCart,
    initializeCartIfNeeded,
    loadMoreItems,
    calculateCartTotals,
    validateForPayment,
    refresh,
    isInCart,
    isOptimisticallyAdding,
    isOptimisticallyRemoving,
    getCachedCartItem,
  ]);

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};