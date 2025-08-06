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
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useUser } from "./UserProvider";
import { Product, ProductUtils } from "@/app/models/Product";

// Types
interface CartData {
  quantity: number;
  addedAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
  sellerId: string;
  sellerName: string;
  isShop: boolean;
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
}

interface OptimisticOperation {
  productId: string;
  type: 'add' | 'remove';
  timestamp: number;
  timeout: NodeJS.Timeout;
  quantity?: number;
  attributes?: CartAttributes;
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

// Constants - Optimized for better performance
const ITEMS_PER_PAGE = 20;
const CACHE_VALID_DURATION = 3 * 60 * 1000; // 3 minutes (reduced)
const BATCH_DELAY = 200; // Reduced from 500ms for faster updates
const OPTIMISTIC_TIMEOUT = 3000; // Reduced from 10s for faster rollback
const MAX_RETRIES = 2; // Reduced retries
const RETRY_DELAY = 1000; // Faster retry


interface CartProviderProps {
  children: ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const { user } = useUser();

  // Core state
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

  // Optimistic operations tracking - simplified
  const optimisticOperationsRef = useRef<Map<string, OptimisticOperation>>(new Map());
  const pendingUpdatesRef = useRef<Record<string, Partial<CartData>>>({});
  const batchUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeCartRef = useRef<(() => void) | null>(null);

  // Product cache for better performance
  const productCacheRef = useRef<Map<string, Product>>(new Map());

  // 🚀 FIX: Create stable callback refs to prevent useEffect dependency array changes
  const processCartSnapshotRef = useRef<(snapshot: QuerySnapshot) => void>(() => {});

  // System fields checker
  const isSystemField = useCallback((key: string): boolean => {
    const systemFields = new Set([
      'addedAt', 'updatedAt', 'quantity', 'sellerId', 'sellerName', 'isShop',
    ]);
    return systemFields.has(key);
  }, []);

  // Clear all data when user logs out
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
    productCacheRef.current.clear();
  
    // Clear optimistic operations
    optimisticOperationsRef.current.forEach(op => clearTimeout(op.timeout));
    optimisticOperationsRef.current.clear();
  
    if (batchUpdateTimerRef.current) {
      clearTimeout(batchUpdateTimerRef.current);
      batchUpdateTimerRef.current = null;
    }
  }, []);

  // Get product document reference - with caching
  const getProductDocument = useCallback(async (
    productId: string
  ): Promise<DocumentReference | null> => {
    try {
      // Try products collection first
      const productsDoc = doc(db, "products", productId);
      const productsSnapshot = await getDoc(productsDoc);

      if (productsSnapshot.exists()) {
        return productsDoc;
      }

      // Then try shop_products
      const shopProductsDoc = doc(db, "shop_products", productId);
      const shopSnapshot = await getDoc(shopProductsDoc);

      if (shopSnapshot.exists()) {
        return shopProductsDoc;
      }

      return null;
    } catch (error) {
      console.error("Error finding product document:", error);
      return null;
    }
  }, []);

  // Optimized product fetching with caching
  const fetchProductDetailsBatch = useCallback(async (
    productIds: string[]
  ): Promise<Record<string, Product | null>> => {
    const result: Record<string, Product | null> = {};
    const uncachedIds: string[] = [];

    // Check cache first
    productIds.forEach(id => {
      if (productCacheRef.current.has(id)) {
        result[id] = productCacheRef.current.get(id)!;
      } else {
        uncachedIds.push(id);
      }
    });

    if (uncachedIds.length === 0) return result;

    // Fetch uncached products in chunks
    for (let i = 0; i < uncachedIds.length; i += 10) {
      const chunk = uncachedIds.slice(i, i + 10);

      try {
        const [productsSnapshot, shopProductsSnapshot] = await Promise.all([
          getDocs(query(collection(db, "products"), where("__name__", "in", chunk))),
          getDocs(query(collection(db, "shop_products"), where("__name__", "in", chunk))),
        ]);

        // Process both collections
        [...productsSnapshot.docs, ...shopProductsSnapshot.docs].forEach(doc => {
          if (!result[doc.id]) {
            const data = doc.data();
            // Add reference information
            data.reference = {
              id: doc.id,
              path: doc.ref.path,
              parent: { id: doc.ref.parent.id }
            };
            
            const product = ProductUtils.fromJson(data);
            result[doc.id] = product;
            productCacheRef.current.set(doc.id, product); // Cache it
          }
        });

        // Mark missing products as null
        chunk.forEach(id => {
          if (!(id in result)) {
            result[id] = null;
          }
        });
      } catch (error) {
        console.error("Error fetching product batch:", error);
        chunk.forEach(id => {
          result[id] = null;
        });
      }
    }

    return result;
  }, []);

  // Rollback optimistic update
  const rollbackOptimisticUpdate = useCallback((productId: string): void => {
    const operation = optimisticOperationsRef.current.get(productId);
    if (!operation) return;

    clearTimeout(operation.timeout);
    optimisticOperationsRef.current.delete(productId);

    console.warn(`Rolling back optimistic update for ${productId}`);

    if (operation.type === 'add') {
      setCartProductIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
      setCartCount(prev => prev - 1);
      setCartItems(prev => prev.filter(item => !(item.productId === productId && item.isOptimistic)));
    } else {
      // Restore removed item if we have cached data
      const cachedData = cartItemsCacheRef.current[productId];
      if (cachedData) {
        setCartProductIds(prev => new Set([...prev, productId]));
        setCartCount(prev => prev + 1);
        // Restore item would require product details, handled by cart snapshot
      }
    }
  }, []);

  // Confirm optimistic update when server confirms
  const confirmOptimisticUpdate = useCallback((productId: string): void => {
    const operation = optimisticOperationsRef.current.get(productId);
    if (operation) {
      clearTimeout(operation.timeout);
      optimisticOperationsRef.current.delete(productId);
    }
  }, []);

  // Sync cart items with server state
  const syncCartItems = useCallback(async (serverIds: Set<string>): Promise<void> => {
    // Remove items not in server (unless optimistic)
    setCartItems(current => {
      let filtered = current.filter(item => {
        if (item.isOptimistic) return true;
        return serverIds.has(item.productId);
      });

      // Remove duplicates (server item vs optimistic item)
      const seen = new Set<string>();
      filtered = filtered.filter(item => {
        const key = item.productId;
        if (seen.has(key)) {
          // Keep server version over optimistic
          return !item.isOptimistic;
        }
        seen.add(key);
        return true;
      });

      return filtered;
    });
  }, []);

  // 🚀 FIX: Create stable processCartSnapshot callback
  const processCartSnapshot = useCallback((snapshot: QuerySnapshot): void => {
    const serverIds = new Set<string>();
    const newCache: Record<string, CartData> = {};

    snapshot.docs.forEach(doc => {
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

    // Confirm optimistic operations that match server state
    optimisticOperationsRef.current.forEach((op, productId) => {
      const inServer = serverIds.has(productId);
      const shouldBeInServer = op.type === 'add';
      
      if (inServer === shouldBeInServer) {
        confirmOptimisticUpdate(productId);
      }
    });

    // Compute effective cart state including optimistic updates
    const effectiveIds = new Set(serverIds);
    optimisticOperationsRef.current.forEach((op, productId) => {
      if (op.type === 'add') {
        effectiveIds.add(productId);
      } else {
        effectiveIds.delete(productId);
      }
    });

    // Update state if changed
    const currentIds = cartProductIds;
    if (currentIds.size !== effectiveIds.size || 
        !Array.from(effectiveIds).every(id => currentIds.has(id))) {
      setCartCount(effectiveIds.size);
      setCartProductIds(effectiveIds);
      retryCountRef.current = 0;

      if (isInitialized) {
        syncCartItems(serverIds);
      }
    }
  }, [cartProductIds, isInitialized, isSystemField, confirmOptimisticUpdate, syncCartItems]);

  // 🚀 FIX: Set the stable callback ref
  processCartSnapshotRef.current = processCartSnapshot;

  // Optimistic update management - simplified
  const applyOptimisticUpdate = useCallback((
    productId: string,
    operation: 'add' | 'remove',
    quantity: number = 1,
    attributes?: CartAttributes
  ): void => {
    // Clear any existing operation for this product
    const existingOp = optimisticOperationsRef.current.get(productId);
    if (existingOp) {
      clearTimeout(existingOp.timeout);
    }

    // Create new optimistic operation
    const timeout = setTimeout(() => {
      rollbackOptimisticUpdate(productId);
    }, OPTIMISTIC_TIMEOUT);

    const optimisticOp: OptimisticOperation = {
      productId,
      type: operation,
      timestamp: Date.now(),
      timeout,
      quantity,
      attributes,
    };

    optimisticOperationsRef.current.set(productId, optimisticOp);

    // Apply UI changes immediately
    if (operation === 'add') {
      setCartProductIds(prev => new Set([...prev, productId]));
      setCartCount(prev => prev + 1);

      if (isInitialized) {
        const optimisticCartData: CartData = {
          quantity,
          addedAt: serverTimestamp(),
          sellerId: "loading...",
          sellerName: "Loading...",
          isShop: false,
          ...(attributes || {}),
        };

        const optimisticItem: CartItem = {
          productId,
          cartData: optimisticCartData,
          product: productCacheRef.current.get(productId) || null,
          isOptimistic: true,
          isLoadingProduct: !productCacheRef.current.has(productId),
          quantity,
          sellerName: "Loading...",
          sellerId: "loading...",
          isShop: false,
          ...(attributes || {}),
        };

        setCartItems(prev => [optimisticItem, ...prev]);

        // Load product details if not cached
        if (!productCacheRef.current.has(productId)) {
          loadProductDetailsForOptimisticItem(productId);
        }
      }
    } else {
      setCartProductIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
      setCartCount(prev => prev - 1);

      if (isInitialized) {
        setCartItems(prev => prev.filter(item => item.productId !== productId));
      }
    }
  }, [isInitialized, rollbackOptimisticUpdate]);

  // Load product details for optimistic items
  const loadProductDetailsForOptimisticItem = useCallback(async (productId: string): Promise<void> => {
    try {
      const productDetails = await fetchProductDetailsBatch([productId]);
      const product = productDetails[productId];

      if (!product) return;

      // Get seller info
      const productDocRef = await getProductDocument(productId);
      let sellerInfo: SellerInfo = {
        sellerId: "Unknown",
        sellerName: "Unknown Seller",
        isShop: false,
      };

      if (productDocRef) {
        const productSnap = await getDoc(productDocRef);
        if (productSnap.exists()) {
          const productData = productSnap.data() as ProductDocumentData;
          const parentCollection = productDocRef.parent.id;

          if (parentCollection === "shop_products") {
            sellerInfo = {
              sellerId: productData.shopId || productData.ownerId || "Unknown",
              sellerName: productData.shopName || productData.sellerName || productData.brandModel || "Unknown Shop",
              isShop: true,
            };
          } else {
            sellerInfo = {
              sellerId: productData.ownerId || "Unknown",
              sellerName: productData.sellerName || productData.ownerName || productData.brandModel || "Unknown Seller",
              isShop: false,
            };
          }
        }
      }

      // Update the optimistic item
      setCartItems(prev => prev.map(item => {
        if (item.productId === productId && item.isOptimistic) {
          return {
            ...item,
            product,
            isLoadingProduct: false,
            sellerName: sellerInfo.sellerName,
            sellerId: sellerInfo.sellerId,
            isShop: sellerInfo.isShop,
            cartData: {
              ...item.cartData,
              sellerName: sellerInfo.sellerName,
              sellerId: sellerInfo.sellerId,
              isShop: sellerInfo.isShop,
            },
          };
        }
        return item;
      }));
    } catch (error) {
      console.error("Error loading product details:", error);
      // Mark as error
      setCartItems(prev => prev.map(item => {
        if (item.productId === productId && item.isOptimistic) {
          return {
            ...item,
            isLoadingProduct: false,
            loadError: true,
          };
        }
        return item;
      }));
    }
  }, [fetchProductDetailsBatch, getProductDocument]);

  // Perform cart operation with transaction
  const performCartOperation = useCallback(async (
    productId: string,
    operation: "addOrToggle",
    quantity: number = 1,
    attributes?: CartAttributes
  ): Promise<string> => {
    if (!user) return "Please log in";

    // 🚀 DEBUG: Log incoming parameters
    console.log('CartProvider - performCartOperation called:', {
      productId,
      operation,
      quantity,
      attributes,
      timestamp: new Date().toISOString()
    });

    return await runTransaction(db, async (transaction) => {
      const cartDocRef = doc(db, "users", user.uid, "cart", productId);
      const productDocRef = await getProductDocument(productId);

      if (!productDocRef) return "Product not found";

      const productSnap = await transaction.get(productDocRef);
      if (!productSnap.exists()) return "Product not found";

      const productData = productSnap.data() as ProductDocumentData;
      const cartSnap = await transaction.get(cartDocRef);
      const isInCart = cartSnap.exists();

      if (operation === "addOrToggle") {
        if (isInCart) {
          transaction.delete(cartDocRef);
          transaction.update(productDocRef, {
            cartCount: increment(-1),
            metricsUpdatedAt: serverTimestamp(),
          });
          console.log('CartProvider - Product removed from cart:', { productId });
          return "Removed from cart";
        } else {
          // 🚀 CRITICAL FIX: Ensure quantity from attributes takes precedence
          let finalQuantity = quantity;
          
          // Check if quantity is provided in attributes (from option selector)
          if (attributes && typeof attributes.quantity === 'number' && attributes.quantity > 0) {
            finalQuantity = attributes.quantity;
            console.log('CartProvider - Using quantity from attributes:', {
              originalQuantity: quantity,
              attributesQuantity: attributes.quantity,
              finalQuantity
            });
          }

          // Build cart data with dynamic attributes
          const cartData: Record<string, unknown> = {
            addedAt: serverTimestamp(),
            quantity: finalQuantity, // 🚀 FIXED: Use finalQuantity
            updatedAt: serverTimestamp(),
          };

          // Add product's default attributes first
          if (productData.attributes) {
            Object.entries(productData.attributes).forEach(([key, value]) => {
              if (!isSystemField(key)) {
                cartData[key] = value;
              }
            });
          }

          // Override with UI-selected attributes (including quantity)
          if (attributes) {
            Object.entries(attributes).forEach(([key, value]) => {
              if (!isSystemField(key)) {
                cartData[key] = value;
              }
            });
            
            // 🚀 ENSURE quantity is properly set even if it's in attributes
            if (typeof attributes.quantity === 'number' && attributes.quantity > 0) {
              cartData.quantity = attributes.quantity;
            }
          }

          // Add seller metadata
          const parentCollection = productDocRef.parent.id;
          if (parentCollection === "shop_products") {
            cartData.sellerId = productData.shopId || productData.ownerId || "unknown";
            cartData.sellerName = productData.shopName || productData.sellerName || productData.brandModel || "Unknown Shop";
            cartData.isShop = true;
          } else {
            cartData.sellerId = productData.ownerId || "unknown";
            cartData.sellerName = productData.sellerName || productData.ownerName || productData.brandModel || "Unknown Seller";
            cartData.isShop = false;
          }

          // 🚀 DEBUG: Log final cart data before saving
          console.log('CartProvider - Saving cart data to Firestore:', {
            productId,
            cartData: {
              ...cartData,
              addedAt: '[ServerTimestamp]',
              updatedAt: '[ServerTimestamp]'
            }
          });

          transaction.set(cartDocRef, cartData);
          transaction.update(productDocRef, {
            cartCount: increment(1),
            metricsUpdatedAt: serverTimestamp(),
          });
          
          console.log('CartProvider - Product added to cart successfully:', {
            productId,
            finalQuantity: cartData.quantity,
            hasAttributes: !!attributes,
            attributeKeys: attributes ? Object.keys(attributes) : []
          });
          
          return "Added to cart";
        }
      }

      return "Operation completed";
    });
  }, [user, getProductDocument, isSystemField]);

  // Batch process quantity updates
  const processBatchUpdates = useCallback(async (): Promise<void> => {
    if (Object.keys(pendingUpdatesRef.current).length === 0 || !user) return;

    const updates = { ...pendingUpdatesRef.current };
    pendingUpdatesRef.current = {};

    try {
      const batch = writeBatch(db);

      Object.entries(updates).forEach(([productId, data]) => {
        const cartDocRef = doc(db, "users", user.uid, "cart", productId);
        batch.update(cartDocRef, { ...data, updatedAt: serverTimestamp() });
      });

      await batch.commit();
    } catch (error) {
      console.error("Batch update error:", error);
      // Re-add failed updates
      Object.assign(pendingUpdatesRef.current, updates);
    }
  }, [user]);

  // Load cart page with products
  const loadCartPage = useCallback(async (page: number): Promise<void> => {
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
  }, [user]);

  // Process cart items from Firestore docs
  const processCartItemsFromDocs = useCallback(async (
    cartDocs: DocumentSnapshot[]
  ): Promise<void> => {
    const productIds = cartDocs.map(doc => doc.id);
    const productDetails = await fetchProductDetailsBatch(productIds);

    const newItems: CartItem[] = [];

    for (const cartDoc of cartDocs) {
      const data = cartDoc.data();
      if (!data) continue;

      const cartData: CartData = {
        quantity: data.quantity || 1,
        addedAt: data.addedAt,
        updatedAt: data.updatedAt,
        sellerId: data.sellerId || "unknown",
        sellerName: data.sellerName || "Unknown",
        isShop: data.isShop || false,
      };

      const dynamicAttributes: Record<string, unknown> = {};
      Object.entries(data).forEach(([key, value]) => {
        if (!isSystemField(key)) {
          cartData[key] = value;
          dynamicAttributes[key] = value;
        }
      });

      const product = productDetails[cartDoc.id];
      if (product) {
        const processedItem: CartItem = {
          cartData,
          product,
          productId: cartDoc.id,
          isOptimistic: false,
          quantity: cartData.quantity,
          sellerName: cartData.sellerName,
          sellerId: cartData.sellerId,
          isShop: cartData.isShop,
          ...dynamicAttributes,
        };

        // Add color image if selected
        if (cartData.selectedColor && product.colorImages[cartData.selectedColor as string]) {
          processedItem.selectedColorImage = product.colorImages[cartData.selectedColor as string][0];
        }

        newItems.push(processedItem);
      }
    }

    setCartItems(current => [...current, ...newItems]);
  }, [fetchProductDetailsBatch, isSystemField]);

  // Public API methods
  const addToCart = useCallback(async (
    productId: string,
    quantity: number = 1,
    attributes?: CartAttributes
  ): Promise<string> => {
    if (!user) return "Please log in";
    if (!productId) return "Invalid product ID";
    if (quantity < 1) return "Quantity must be at least 1";

    const isCurrentlyInCart = cartProductIds.has(productId);
    const willAdd = !isCurrentlyInCart;

    try {
      // Apply optimistic update immediately
      applyOptimisticUpdate(productId, willAdd ? 'add' : 'remove', quantity, attributes);
      
      // Perform actual operation
      const result = await performCartOperation(productId, "addOrToggle", quantity, attributes);
      return result;
    } catch (error) {
      // Rollback on error
      rollbackOptimisticUpdate(productId);
      console.error("Add to cart error:", error);
      return `Failed to update cart: ${error}`;
    }
  }, [user, cartProductIds, applyOptimisticUpdate, performCartOperation, rollbackOptimisticUpdate]);

  const removeFromCart = useCallback(async (productId: string): Promise<string> => {
    return addToCart(productId); // Toggle behavior
  }, [addToCart]);

  const updateQuantity = useCallback(async (
    productId: string,
    newQuantity: number
  ): Promise<string> => {
    if (!user) return "Please log in";
    if (newQuantity < 1) return "Quantity must be at least 1";

    // Update UI immediately
    if (cartItemsCacheRef.current[productId]) {
      cartItemsCacheRef.current[productId].quantity = newQuantity;
    }

    setCartItems(current =>
      current.map(item =>
        item.productId === productId
          ? {
              ...item,
              quantity: newQuantity,
              cartData: { ...item.cartData, quantity: newQuantity },
            }
          : item
      )
    );

    // Batch the update
    pendingUpdatesRef.current[productId] = { quantity: newQuantity };

    if (batchUpdateTimerRef.current) {
      clearTimeout(batchUpdateTimerRef.current);
    }
    batchUpdateTimerRef.current = setTimeout(processBatchUpdates, BATCH_DELAY);

    return "Quantity updated";
  }, [user, processBatchUpdates]);

  const incrementQuantity = useCallback(async (productId: string): Promise<string> => {
    const currentItem = cartItems.find(item => item.productId === productId);
    const currentQuantity = currentItem?.quantity || 1;
    return updateQuantity(productId, currentQuantity + 1);
  }, [cartItems, updateQuantity]);

  const decrementQuantity = useCallback(async (productId: string): Promise<string> => {
    const currentItem = cartItems.find(item => item.productId === productId);
    const currentQuantity = currentItem?.quantity || 1;

    if (currentQuantity <= 1) {
      return "Quantity cannot be less than 1";
    }

    return updateQuantity(productId, currentQuantity - 1);
  }, [cartItems, updateQuantity]);

  const removeMultipleFromCart = useCallback(async (
    productIds: string[]
  ): Promise<string> => {
    if (!user) return "Please log in";
    if (productIds.length === 0) return "No products to remove";

    // Optimistically remove from UI
    setCartItems(current => current.filter(item => !productIds.includes(item.productId)));
    setCartProductIds(current => {
      const newSet = new Set(current);
      productIds.forEach(id => newSet.delete(id));
      return newSet;
    });
    setCartCount(current => current - productIds.length);

    try {
      const batch = writeBatch(db);

      for (const productId of productIds) {
        const cartDocRef = doc(db, "users", user.uid, "cart", productId);
        batch.delete(cartDocRef);

        const productDocRef = await getProductDocument(productId);
        if (productDocRef) {
          batch.update(productDocRef, {
            cartCount: increment(-1),
            metricsUpdatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit();

      // Remove from cache
      productIds.forEach(productId => {
        delete cartItemsCacheRef.current[productId];
      });

      return "Products removed from cart";
    } catch (error) {
      console.error("Remove multiple error:", error);
      return `Failed to remove products: ${error}`;
    }
  }, [user, getProductDocument]);

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
  }, [user, removeMultipleFromCart]);

  const initializeCartIfNeeded = useCallback(async (): Promise<void> => {
    if (isInitialized || isLoading) return;

    setIsLoading(true);
    try {
      await loadCartPage(0);
      setIsInitialized(true);
    } catch (error) {
      console.error("Error initializing cart:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, isLoading, loadCartPage]);

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

  // Utility methods
  const isInCart = useCallback((productId: string): boolean => {
    return cartProductIds.has(productId);
  }, [cartProductIds]);

  const isOptimisticallyAdding = useCallback((productId: string): boolean => {
    const op = optimisticOperationsRef.current.get(productId);
    return op?.type === 'add';
  }, []);

  const isOptimisticallyRemoving = useCallback((productId: string): boolean => {
    const op = optimisticOperationsRef.current.get(productId);
    return op?.type === 'remove';
  }, []);

  const getCachedCartItem = useCallback((productId: string): CartData | null => {
    if (lastCacheUpdateRef.current && 
        Date.now() - lastCacheUpdateRef.current.getTime() < CACHE_VALID_DURATION &&
        cartItemsCacheRef.current[productId]) {
      return { ...cartItemsCacheRef.current[productId] };
    }
    return null;
  }, []);

  // 🚀 FIX: Main effect with stable dependencies
  useEffect(() => {
    const userId = user?.uid;
    
    if (userId) {
      // Subscribe to cart changes
      if (unsubscribeCartRef.current) {
        unsubscribeCartRef.current();
      }
  
      const cartCollection = collection(db, "users", userId, "cart");
      unsubscribeCartRef.current = onSnapshot(
        cartCollection,
        (snapshot) => {
          // Use the stable callback ref
          if (processCartSnapshotRef.current) {
            processCartSnapshotRef.current(snapshot);
          }
        },
        (error) => {
          console.error("Cart subscription error:", error);
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            setTimeout(() => {
              // Will re-trigger effect on next user state check
            }, RETRY_DELAY * retryCountRef.current);
          }
        }
      );
    } else {
      // Cleanup when user logs out
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
  }, [user?.uid, clearUserData]); // ✅ FIXED: Only depend on user?.uid and clearUserData

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeCartRef.current) {
        unsubscribeCartRef.current();
      }
      if (batchUpdateTimerRef.current) {
        clearTimeout(batchUpdateTimerRef.current);
      }
      optimisticOperationsRef.current.forEach(op => clearTimeout(op.timeout));
    };
  }, []);

  // Context value with memoization
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

    // Utilities
    isInCart,
    isOptimisticallyAdding,
    isOptimisticallyRemoving,
    getCachedCartItem,
  }), [
    cartCount, cartProductIds, cartItems, isLoading, isLoadingMore, hasMore, isInitialized,
    addToCart, removeFromCart, updateQuantity, incrementQuantity, decrementQuantity,
    clearCart, removeMultipleFromCart, initializeCartIfNeeded, loadMoreItems,
    isInCart, isOptimisticallyAdding, isOptimisticallyRemoving, getCachedCartItem
  ]);

  return (
    <CartContext.Provider value={contextValue}>
      {children}
    </CartContext.Provider>
  );
};