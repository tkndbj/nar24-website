"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
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

// Types
interface Product {
  id: string;
  productName: string;
  price: number;
  currency: string;
  imageUrls: string[];
  colorImages: Record<string, string[]>;
  averageRating: number;
  brandModel?: string;
  ownerId?: string;
  ownerName?: string;
  sellerName?: string;
  shopId?: string;
  shopName?: string;
  cartCount?: number;
  metricsUpdatedAt?: Timestamp | FieldValue;
}

interface CartData {
  quantity: number;
  addedAt: Timestamp | FieldValue;
  updatedAt?: Timestamp | FieldValue;
  selectedColor?: string;
  selectedSize?: string;
  clothingSizes?: string;
  salePreferences?: SalePreferences;
  sellerId: string;
  sellerName: string;
  isShop: boolean;
}

interface SalePreferences {
  acceptOffers?: boolean;
  minOffer?: number;
  quickSale?: boolean;
  [key: string]: unknown;
}

interface CartItem {
  productId: string;
  cartData: CartData;
  product: Product | null;
  quantity: number;
  selectedColor?: string;
  selectedColorImage?: string;
  selectedSize?: string;
  salePreferences?: SalePreferences;
  sellerName: string;
  sellerId: string;
  isShop: boolean;
  isOptimistic?: boolean;
  isLoadingProduct?: boolean;
  loadError?: boolean;
}

interface CartAttributes {
  selectedColor?: string;
  selectedSize?: string;
  clothingSizes?: string;
  salePreferences?: SalePreferences;
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

// Constants
const ITEMS_PER_PAGE = 20;
const CACHE_VALID_DURATION = 5 * 60 * 1000; // 5 minutes
const BATCH_DELAY = 500;
const OPTIMISTIC_TIMEOUT = 10000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

interface CartProviderProps {
  children: ReactNode;
}

export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  const { user } = useUser();

  // State using individual useState instead of ValueNotifiers
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

  // Optimistic updates tracking
  const optimisticAddsRef = useRef<Set<string>>(new Set());
  const optimisticRemovesRef = useRef<Set<string>>(new Set());
  const optimisticTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
  const optimisticItemsRef = useRef<Record<string, CartItem>>({});

  // Batch operations
  const batchUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdatesRef = useRef<Record<string, Partial<CartData>>>({});

  // Subscription cleanup
  const unsubscribeCartRef = useRef<(() => void) | null>(null);

  // Clear user data when user logs out
  const clearUserData = (): void => {
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

    optimisticAddsRef.current.clear();
    optimisticRemovesRef.current.clear();
    Object.values(optimisticTimersRef.current).forEach(clearTimeout);
    optimisticTimersRef.current = {};
    optimisticItemsRef.current = {};

    if (batchUpdateTimerRef.current) {
      clearTimeout(batchUpdateTimerRef.current);
      batchUpdateTimerRef.current = null;
    }
  };

  // Subscribe to cart changes
  const subscribeToCartIds = (userId: string): void => {
    if (unsubscribeCartRef.current) {
      unsubscribeCartRef.current();
    }

    const cartCollection = collection(db, "users", userId, "cart");

    unsubscribeCartRef.current = onSnapshot(
      cartCollection,
      (snapshot) => {
        processCartSnapshot(snapshot);
      },
      (error) => {
        console.error("Cart subscription error:", error);
        handleStreamError();
      }
    );
  };

  // Process cart snapshot
  const processCartSnapshot = (snapshot: QuerySnapshot): void => {
    const ids = new Set<string>();
    const newCache: Record<string, CartData> = {};

    snapshot.docs.forEach((doc) => {
      ids.add(doc.id);
      const data = doc.data();
      newCache[doc.id] = {
        quantity: data.quantity || 1,
        addedAt: data.addedAt,
        updatedAt: data.updatedAt,
        selectedColor: data.selectedColor,
        selectedSize: data.selectedSize,
        clothingSizes: data.clothingSizes,
        salePreferences: data.salePreferences,
        sellerId: data.sellerId || "unknown",
        sellerName: data.sellerName || "Unknown",
        isShop: data.isShop || false,
      };
    });

    cartItemsCacheRef.current = newCache;
    lastCacheUpdateRef.current = new Date();

    reconcileOptimisticUpdates(ids);
    const effectiveIds = computeEffectiveCartIds(ids);

    if (
      cartProductIds.size !== effectiveIds.size ||
      !Array.from(effectiveIds).every((id) => cartProductIds.has(id))
    ) {
      setCartCount(effectiveIds.size);
      setCartProductIds(effectiveIds);
      retryCountRef.current = 0;

      if (isInitialized) {
        syncFullCartItems(ids);
      }
    }
  };

  // Reconcile optimistic updates with server state
  const reconcileOptimisticUpdates = (serverIds: Set<string>): void => {
    // Clear confirmed adds
    optimisticAddsRef.current.forEach((productId) => {
      if (serverIds.has(productId)) {
        clearOptimisticState(productId);
      }
    });

    // Clear confirmed removes
    optimisticRemovesRef.current.forEach((productId) => {
      if (!serverIds.has(productId)) {
        clearOptimisticState(productId);
      }
    });
  };

  // Compute effective cart IDs including optimistic updates
  const computeEffectiveCartIds = (serverIds: Set<string>): Set<string> => {
    const effectiveIds = new Set(serverIds);
    optimisticAddsRef.current.forEach((id) => effectiveIds.add(id));
    optimisticRemovesRef.current.forEach((id) => effectiveIds.delete(id));
    return effectiveIds;
  };

  // Clear optimistic state for a product
  const clearOptimisticState = (productId: string): void => {
    optimisticAddsRef.current.delete(productId);
    optimisticRemovesRef.current.delete(productId);
    delete optimisticItemsRef.current[productId];

    if (optimisticTimersRef.current[productId]) {
      clearTimeout(optimisticTimersRef.current[productId]);
      delete optimisticTimersRef.current[productId];
    }
  };

  // Sync full cart items
  const syncFullCartItems = (serverIds: Set<string>): void => {
    setCartItems((currentItems) => {
      let updatedItems = [...currentItems];

      // Remove items not in server (unless optimistic)
      updatedItems = updatedItems.filter((item) => {
        const isOptimistic = item.isOptimistic === true;
        return serverIds.has(item.productId) || isOptimistic;
      });

      // Add optimistic items
      optimisticAddsRef.current.forEach((productId) => {
        if (optimisticItemsRef.current[productId]) {
          const optimisticItem = optimisticItemsRef.current[productId];
          const exists = updatedItems.some(
            (item) => item.productId === productId
          );
          if (!exists) {
            updatedItems.unshift(optimisticItem);
          }
        }
      });

      // Remove optimistic removes
      updatedItems = updatedItems.filter(
        (item) => !optimisticRemovesRef.current.has(item.productId)
      );

      return updatedItems;
    });
  };

  // Handle stream errors with retry logic
  const handleStreamError = (): void => {
    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current++;
      setTimeout(() => {
        if (user) {
          subscribeToCartIds(user.uid);
        }
      }, RETRY_DELAY * retryCountRef.current);
    }
  };

  // Get product document reference
  const getProductDocument = async (
    productId: string
  ): Promise<DocumentReference | null> => {
    try {
      const productsDoc = doc(db, "products", productId);
      const productsSnapshot = await getDoc(productsDoc);

      if (productsSnapshot.exists()) {
        return productsDoc;
      }

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
  };

  // Fetch product details in batches
  const fetchProductDetailsBatch = async (
    productIds: string[]
  ): Promise<Record<string, Product | null>> => {
    const result: Record<string, Product | null> = {};

    // Process in chunks of 10 (Firestore 'in' query limit)
    for (let i = 0; i < productIds.length; i += 10) {
      const chunk = productIds.slice(i, i + 10);

      try {
        const [productsSnapshot, shopProductsSnapshot] = await Promise.all([
          getDocs(
            query(collection(db, "products"), where("__name__", "in", chunk))
          ),
          getDocs(
            query(
              collection(db, "shop_products"),
              where("__name__", "in", chunk)
            )
          ),
        ]);

        // Process regular products
        productsSnapshot.docs.forEach((doc) => {
          if (!result[doc.id]) {
            const data = doc.data() as ProductDocumentData;
            result[doc.id] = {
              id: doc.id,
              productName: data.productName || "",
              price: data.price || 0,
              currency: data.currency || "USD",
              imageUrls: data.imageUrls || [],
              colorImages: data.colorImages || {},
              averageRating: data.averageRating || 0,
              brandModel: data.brandModel,
              ownerId: data.ownerId,
              ownerName: data.ownerName,
              sellerName: data.sellerName,
              shopId: data.shopId,
              shopName: data.shopName,
              ...data,
            } as Product;
          }
        });

        // Process shop products
        shopProductsSnapshot.docs.forEach((doc) => {
          if (!result[doc.id]) {
            const data = doc.data() as ProductDocumentData;
            result[doc.id] = {
              id: doc.id,
              productName: data.productName || "",
              price: data.price || 0,
              currency: data.currency || "USD",
              imageUrls: data.imageUrls || [],
              colorImages: data.colorImages || {},
              averageRating: data.averageRating || 0,
              brandModel: data.brandModel,
              ownerId: data.ownerId,
              ownerName: data.ownerName,
              sellerName: data.sellerName,
              shopId: data.shopId,
              shopName: data.shopName,
              ...data,
            } as Product;
          }
        });
      } catch (error) {
        console.error("Error fetching product batch:", error);
        chunk.forEach((id) => {
          result[id] = null;
        });
      }
    }

    return result;
  };

  // Resolve color image for a product
  const resolveColorImage = (
    product: Product,
    selectedColor?: string
  ): string | undefined => {
    if (!selectedColor || !product.colorImages) return undefined;

    const colorImagesList = product.colorImages[selectedColor];
    if (colorImagesList && colorImagesList.length > 0) {
      return colorImagesList[0];
    }

    return undefined;
  };

  // Load cart page with pagination
  const loadCartPage = async (page: number): Promise<void> => {
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

    await processCartItems(snapshot.docs);
  };

  // Process cart items with product details
  const processCartItems = async (
    cartDocs: DocumentSnapshot[]
  ): Promise<void> => {
    const productIds = cartDocs.map((doc) => doc.id);
    const productDetails = await fetchProductDetailsBatch(productIds);

    const newItems: CartItem[] = [];

    for (const cartDoc of cartDocs) {
      const data = cartDoc.data();
      if (!data) continue;

      const cartData: CartData = {
        quantity: data.quantity || 1,
        addedAt: data.addedAt,
        updatedAt: data.updatedAt,
        selectedColor: data.selectedColor,
        selectedSize: data.selectedSize,
        clothingSizes: data.clothingSizes,
        salePreferences: data.salePreferences,
        sellerId: data.sellerId || "unknown",
        sellerName: data.sellerName || "Unknown",
        isShop: data.isShop || false,
      };

      const product = productDetails[cartDoc.id];

      if (product) {
        const processedItem: CartItem = {
          cartData,
          product,
          productId: cartDoc.id,
          isOptimistic: false,
          quantity: cartData.quantity,
          selectedColor: cartData.selectedColor,
          selectedColorImage: resolveColorImage(
            product,
            cartData.selectedColor
          ),
          selectedSize: cartData.clothingSizes,
          salePreferences: cartData.salePreferences,
          sellerName: cartData.sellerName,
          sellerId: cartData.sellerId,
          isShop: cartData.isShop,
        };

        newItems.push(processedItem);
      }
    }

    setCartItems((current) => [...current, ...newItems]);
  };

  // Apply optimistic update
  const applyOptimisticUpdate = async (
    productId: string,
    isAdding: boolean,
    quantity: number,
    attributes?: CartAttributes
  ): Promise<void> => {
    clearOptimisticState(productId);

    if (isAdding) {
      optimisticAddsRef.current.add(productId);

      setCartProductIds((current) => new Set([...current, productId]));
      setCartCount((current) => current + 1);

      if (isInitialized) {
        const optimisticItem: CartItem = {
          cartData: {
            quantity,
            addedAt: serverTimestamp(),
            sellerId: "loading...",
            sellerName: "Loading...",
            isShop: false,
            selectedColor: attributes?.selectedColor,
            selectedSize: attributes?.selectedSize,
            clothingSizes: attributes?.clothingSizes,
            salePreferences: attributes?.salePreferences,
          },
          product: null,
          productId,
          isOptimistic: true,
          isLoadingProduct: true,
          quantity,
          selectedColor: attributes?.selectedColor,
          selectedColorImage: undefined,
          selectedSize: attributes?.clothingSizes,
          salePreferences: attributes?.salePreferences,
          sellerName: "Loading...",
          sellerId: "loading...",
          isShop: false,
        };

        optimisticItemsRef.current[productId] = optimisticItem;
        setCartItems((current) => [optimisticItem, ...current]);

        // Load product details in background
        loadProductDetailsForOptimisticItem(productId);
      }
    } else {
      optimisticRemovesRef.current.add(productId);

      setCartProductIds((current) => {
        const newSet = new Set(current);
        newSet.delete(productId);
        return newSet;
      });
      setCartCount((current) => current - 1);

      if (isInitialized) {
        setCartItems((current) =>
          current.filter((item) => item.productId !== productId)
        );
      }
    }

    // Set timeout for optimistic update rollback
    optimisticTimersRef.current[productId] = setTimeout(() => {
      rollbackOptimisticUpdate(productId, isAdding);
      console.log("Optimistic update timeout for product:", productId);
    }, OPTIMISTIC_TIMEOUT);
  };

  // Load product details for optimistic item
  const loadProductDetailsForOptimisticItem = async (
    productId: string
  ): Promise<void> => {
    try {
      const productDetails = await fetchProductDetailsBatch([productId]);
      const product = productDetails[productId];

      if (product && isInitialized) {
        // Get seller info from product document
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
                sellerId:
                  productData.shopId || productData.ownerId || "Unknown",
                sellerName:
                  productData.shopName ||
                  productData.sellerName ||
                  productData.brandModel ||
                  "Unknown Shop",
                isShop: true,
              };
            } else {
              sellerInfo = {
                sellerId: productData.ownerId || "Unknown",
                sellerName:
                  productData.sellerName ||
                  productData.ownerName ||
                  productData.brandModel ||
                  "Unknown Seller",
                isShop: false,
              };
            }
          }
        }

        setCartItems((current) => {
          const index = current.findIndex(
            (item) => item.productId === productId && item.isOptimistic === true
          );

          if (index !== -1) {
            const updatedItems = [...current];
            updatedItems[index] = {
              ...updatedItems[index],
              product,
              isLoadingProduct: false,
              selectedColorImage: resolveColorImage(
                product,
                updatedItems[index].selectedColor
              ),
              sellerName: sellerInfo.sellerName,
              sellerId: sellerInfo.sellerId,
              isShop: sellerInfo.isShop,
            };

            // Update cartData as well
            updatedItems[index].cartData = {
              ...updatedItems[index].cartData,
              sellerName: sellerInfo.sellerName,
              sellerId: sellerInfo.sellerId,
              isShop: sellerInfo.isShop,
            };

            optimisticItemsRef.current[productId] = updatedItems[index];
            return updatedItems;
          }

          return current;
        });
      }
    } catch (error) {
      console.error("Error loading product details for", productId, ":", error);

      setCartItems((current) => {
        const index = current.findIndex(
          (item) => item.productId === productId && item.isOptimistic === true
        );

        if (index !== -1) {
          const updatedItems = [...current];
          updatedItems[index] = {
            ...updatedItems[index],
            isLoadingProduct: false,
            loadError: true,
            sellerName: "Unknown Seller",
            sellerId: "unknown",
            isShop: false,
          };
          return updatedItems;
        }

        return current;
      });
    }
  };

  // Rollback optimistic update
  const rollbackOptimisticUpdate = (
    productId: string,
    wasAdding: boolean
  ): void => {
    if (wasAdding && optimisticAddsRef.current.has(productId)) {
      optimisticAddsRef.current.delete(productId);
      setCartProductIds((current) => {
        const newSet = new Set(current);
        newSet.delete(productId);
        return newSet;
      });
      setCartCount((current) => current - 1);

      if (isInitialized) {
        setCartItems((current) =>
          current.filter(
            (item) =>
              !(item.productId === productId && item.isOptimistic === true)
          )
        );
      }
    } else if (!wasAdding && optimisticRemovesRef.current.has(productId)) {
      optimisticRemovesRef.current.delete(productId);
      setCartProductIds((current) => new Set([...current, productId]));
      setCartCount((current) => current + 1);

      if (isInitialized && cartItemsCacheRef.current[productId]) {
        // Restore removed item
        restoreRemovedItem(productId);
      }
    }

    if (optimisticTimersRef.current[productId]) {
      clearTimeout(optimisticTimersRef.current[productId]);
      delete optimisticTimersRef.current[productId];
    }
    delete optimisticItemsRef.current[productId];
  };

  // Restore removed item
  const restoreRemovedItem = async (productId: string): Promise<void> => {
    try {
      const cartData = cartItemsCacheRef.current[productId];
      if (cartData) {
        const productDetails = await fetchProductDetailsBatch([productId]);
        const product = productDetails[productId];

        if (product) {
          const restoredItem: CartItem = {
            cartData,
            product,
            productId,
            isOptimistic: false,
            quantity: cartData.quantity || 1,
            selectedColor: cartData.selectedColor,
            selectedColorImage: resolveColorImage(
              product,
              cartData.selectedColor
            ),
            selectedSize: cartData.clothingSizes,
            salePreferences: cartData.salePreferences,
            sellerName: cartData.sellerName || "Unknown",
            sellerId: cartData.sellerId || "unknown",
            isShop: cartData.isShop || false,
          };

          setCartItems((current) => {
            const addedAt = cartData.addedAt;
            if (addedAt && addedAt instanceof Timestamp) {
              const insertIndex = current.findIndex((item) => {
                const itemAddedAt = item.cartData.addedAt;
                return (
                  itemAddedAt instanceof Timestamp &&
                  itemAddedAt.toMillis() < addedAt.toMillis()
                );
              });

              if (insertIndex !== -1) {
                const newItems = [...current];
                newItems.splice(insertIndex, 0, restoredItem);
                return newItems;
              }
            }
            return [...current, restoredItem];
          });
        }
      }
    } catch (error) {
      console.error("Error restoring removed item", productId, ":", error);
    }
  };

  // Perform cart operation (add/remove)
  const performCartOperation = async (
    productId: string,
    operation: "addOrToggle",
    quantity: number = 1,
    attributes?: CartAttributes
  ): Promise<string> => {
    if (!user) return "Please log in";

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
          return "Removed from cart";
        } else {
          const cartData: Partial<CartData> & Record<string, unknown> = {
            addedAt: serverTimestamp(),
            quantity,
            updatedAt: serverTimestamp(),
            ...attributes,
          };

          // Add seller info
          const parentCollection = productDocRef.parent.id;
          if (parentCollection === "shop_products") {
            cartData.sellerId =
              productData.shopId || productData.ownerId || "unknown";
            cartData.sellerName =
              productData.shopName ||
              productData.sellerName ||
              productData.brandModel ||
              "Unknown Shop";
            cartData.isShop = true;
          } else {
            cartData.sellerId = productData.ownerId || "unknown";
            cartData.sellerName =
              productData.sellerName ||
              productData.ownerName ||
              productData.brandModel ||
              "Unknown Seller";
            cartData.isShop = false;
          }

          transaction.set(cartDocRef, cartData);
          transaction.update(productDocRef, {
            cartCount: increment(1),
            metricsUpdatedAt: serverTimestamp(),
          });
          return "Added to cart";
        }
      }

      return "Operation completed";
    });
  };

  // Process batch updates
  const processBatchUpdates = async (): Promise<void> => {
    if (Object.keys(pendingUpdatesRef.current).length === 0 || !user) return;

    const updates = { ...pendingUpdatesRef.current };
    pendingUpdatesRef.current = {};

    try {
      const batch = writeBatch(db);

      Object.entries(updates).forEach(([productId, data]) => {
        const cartDocRef = doc(db, "users", user.uid, "cart", productId);
        batch.update(cartDocRef, data);
      });

      await batch.commit();
    } catch (error) {
      console.error("Batch update error:", error);
      // Re-add failed updates
      Object.assign(pendingUpdatesRef.current, updates);
    }
  };

  // Check if cache is valid
  const isCacheValid = (): boolean => {
    return (
      lastCacheUpdateRef.current !== null &&
      Date.now() - lastCacheUpdateRef.current.getTime() < CACHE_VALID_DURATION
    );
  };

  // Public methods
  const initializeCartIfNeeded = async (): Promise<void> => {
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
  };

  const loadMoreItems = async (): Promise<void> => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      await loadCartPage(currentPageRef.current + 1);
    } catch (error) {
      console.error("Error loading more cart items:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const addToCart = async (
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
      await applyOptimisticUpdate(productId, willAdd, quantity, attributes);
      const result = await performCartOperation(
        productId,
        "addOrToggle",
        quantity,
        attributes
      );
      return result;
    } catch (error) {
      rollbackOptimisticUpdate(productId, willAdd);
      console.error("Add to cart error:", error);
      return `Failed to update cart: ${error}`;
    }
  };

  const removeFromCart = async (productId: string): Promise<string> => {
    return addToCart(productId); // Toggle behavior
  };

  const updateQuantity = async (
    productId: string,
    newQuantity: number
  ): Promise<string> => {
    if (!user) return "Please log in";
    if (newQuantity < 1) return "Quantity must be at least 1";

    // Update cache and UI immediately
    if (cartItemsCacheRef.current[productId]) {
      cartItemsCacheRef.current[productId].quantity = newQuantity;
    }

    setCartItems((current) =>
      current.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity: newQuantity,
              cartData: { ...item.cartData, quantity: newQuantity },
            }
          : item
      )
    );

    // Add to pending updates
    pendingUpdatesRef.current[productId] = { quantity: newQuantity };

    // Clear existing timer and set new one
    if (batchUpdateTimerRef.current) {
      clearTimeout(batchUpdateTimerRef.current);
    }
    batchUpdateTimerRef.current = setTimeout(processBatchUpdates, BATCH_DELAY);

    return "Quantity updated";
  };

  const incrementQuantity = async (productId: string): Promise<string> => {
    const currentItem = cartItems.find((item) => item.productId === productId);
    const currentQuantity = currentItem?.quantity || 1;
    return updateQuantity(productId, currentQuantity + 1);
  };

  const decrementQuantity = async (productId: string): Promise<string> => {
    const currentItem = cartItems.find((item) => item.productId === productId);
    const currentQuantity = currentItem?.quantity || 1;

    if (currentQuantity <= 1) {
      return "Quantity cannot be less than 1";
    }

    return updateQuantity(productId, currentQuantity - 1);
  };

  const removeMultipleFromCart = async (
    productIds: string[]
  ): Promise<string> => {
    if (!user) return "Please log in";
    if (productIds.length === 0) return "No products to remove";

    // Optimistically remove from UI
    setCartItems((current) =>
      current.filter((item) => !productIds.includes(item.productId))
    );

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
      productIds.forEach((productId) => {
        delete cartItemsCacheRef.current[productId];
      });

      return "Products removed from cart";
    } catch (error) {
      console.error("Remove multiple error:", error);
      return `Failed to remove products: ${error}`;
    }
  };

  const clearCart = async (): Promise<string> => {
    if (!user) return "Please log in";

    try {
      const cartCollection = collection(db, "users", user.uid, "cart");
      const snapshot = await getDocs(cartCollection);

      if (snapshot.empty) return "Cart is already empty";

      const productIds = snapshot.docs.map((doc) => doc.id);
      return await removeMultipleFromCart(productIds);
    } catch (error) {
      return `Failed to clear cart: ${error}`;
    }
  };

  // Utility methods
  const isInCart = (productId: string): boolean => {
    return cartProductIds.has(productId);
  };

  const isOptimisticallyAdding = (productId: string): boolean => {
    return optimisticAddsRef.current.has(productId);
  };

  const isOptimisticallyRemoving = (productId: string): boolean => {
    return optimisticRemovesRef.current.has(productId);
  };

  const getCachedCartItem = (productId: string): CartData | null => {
    if (isCacheValid() && cartItemsCacheRef.current[productId]) {
      return { ...cartItemsCacheRef.current[productId] };
    }
    return null;
  };

  // Effect to handle auth changes
  useEffect(() => {
    if (user) {
      subscribeToCartIds(user.uid);
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
  }, [user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeCartRef.current) {
        unsubscribeCartRef.current();
      }
      if (batchUpdateTimerRef.current) {
        clearTimeout(batchUpdateTimerRef.current);
      }
      Object.values(optimisticTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  const contextValue: CartContextType = {
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
  };

  return (
    <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>
  );
};
