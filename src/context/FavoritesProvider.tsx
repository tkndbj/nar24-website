"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
  useCallback,
} from "react";
import {
  collection,
  doc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  increment,
  query,
  where,
  limit,
  QuerySnapshot,
  runTransaction,
  getDoc,
  getDocs,
  Timestamp,
  DocumentReference,
  FieldValue,
  deleteDoc,
  addDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useUser } from "./UserProvider";

// Types
interface FavoriteBasket {
  id: string;
  name: string;
  createdAt: Timestamp | FieldValue;
}

interface FavoriteAttributes {
  [key: string]: unknown; // Allow any attribute dynamically
}

interface ProductDocumentData {
  shopId?: string;
  ownerId?: string;
  shopName?: string;
  sellerName?: string;
  brandModel?: string;
  ownerName?: string;
  favoritesCount?: number;
  metricsUpdatedAt?: Timestamp | FieldValue;
  productName?: string;
  price?: number;
  currency?: string;
  imageUrls?: string[];
  colorImages?: Record<string, string[]>;
  averageRating?: number;
  attributes?: Record<string, unknown>; // 🚀 NEW: Product attributes
}

interface FavoritesContextType {
  // State
  favoriteProductIds: Set<string>;
  allFavoriteProductIds: Set<string>;
  favoriteCount: number;
  selectedBasketId: string | null;
  favoriteBaskets: FavoriteBasket[];
  isLoading: boolean;

  // Methods
  addToFavorites: (
    productId: string,
    attributes?: FavoriteAttributes // 🚀 Now supports any dynamic attributes
  ) => Promise<string>;
  removeFromFavorites: (productId: string) => Promise<string>;
  removeGloballyFromFavorites: (productId: string) => Promise<string>;
  removeMultipleFromFavorites: (productIds: string[]) => Promise<string>;

  // Basket management
  createFavoriteBasket: (name: string) => Promise<string>;
  deleteFavoriteBasket: (basketId: string) => Promise<string>;
  setSelectedBasket: (basketId: string | null) => void;
  transferFavoritesToBasket: (
    productIds: string[],
    basketId: string
  ) => Promise<string>;
  moveFavoritesFromBasketToDefault: (productIds: string[]) => Promise<string>;

  // Utility methods
  isFavorite: (productId: string) => boolean;
  isGloballyFavorited: (productId: string) => boolean;
  isFavoritedInBasket: (productId: string) => Promise<boolean>;
  getBasketNameForProduct: (productId: string) => Promise<string | null>;

  // Toast notifications
  showSuccessToast: (message: string) => void;
  showErrorToast: (message: string) => void;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(
  undefined
);

export const useFavorites = (): FavoritesContextType => {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error("useFavorites must be used within a FavoritesProvider");
  }
  return context;
};

// Constants
const BATCH_SIZE = 50;
const FIRESTORE_IN_LIMIT = 10;
const MAX_BASKETS = 10;
const DEBOUNCE_DELAY = 500;

interface FavoritesProviderProps {
  children: ReactNode;
}

export const FavoritesProvider: React.FC<FavoritesProviderProps> = ({
  children,
}) => {
  const { user } = useUser();

  // State
  const [favoriteProductIds, setFavoriteProductIds] = useState<Set<string>>(
    new Set()
  );
  const [allFavoriteProductIds, setAllFavoriteProductIds] = useState<
    Set<string>
  >(new Set());
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [selectedBasketId, setSelectedBasketIdState] = useState<string | null>(
    null
  );
  const [favoriteBaskets, setFavoriteBaskets] = useState<FavoriteBasket[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Refs for optimization
  const basketFavoriteCacheRef = useRef<Record<string, boolean>>({});
  const basketNameCacheRef = useRef<Record<string, string | null>>({});
  const lastCacheUpdateRef = useRef<Date | null>(null);
  const removeFavoriteTimerRef = useRef<NodeJS.Timeout | null>(null);
  const basketDeletionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Subscription cleanup
  const unsubscribeFavoritesRef = useRef<(() => void) | null>(null);
  const unsubscribeGlobalFavoritesRef = useRef<(() => void) | null>(null);
  const unsubscribeBasketsRef = useRef<(() => void) | null>(null);

  // Utility function to chunk arrays
  const chunkArray = useCallback(<T,>(array: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }, []);

  // Clear user data on logout
  const clearUserData = useCallback(() => {
    setFavoriteProductIds(new Set());
    setAllFavoriteProductIds(new Set());
    setFavoriteCount(0);
    setSelectedBasketIdState(null);
    setFavoriteBaskets([]);
    setIsLoading(false);

    basketFavoriteCacheRef.current = {};
    basketNameCacheRef.current = {};
    lastCacheUpdateRef.current = null;

    // Clear timers
    if (removeFavoriteTimerRef.current) {
      clearTimeout(removeFavoriteTimerRef.current);
      removeFavoriteTimerRef.current = null;
    }
    if (basketDeletionTimerRef.current) {
      clearTimeout(basketDeletionTimerRef.current);
      basketDeletionTimerRef.current = null;
    }
  }, []);

  // Get product document reference
  const getProductDocument = useCallback(
    async (productId: string): Promise<DocumentReference | null> => {
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
    },
    []
  );

  // Subscribe to current basket favorites
  const subscribeToFavorites = useCallback(
    (userId: string) => {
      if (unsubscribeFavoritesRef.current) {
        unsubscribeFavoritesRef.current();
      }

      const favCollection = selectedBasketId
        ? collection(
            db,
            "users",
            userId,
            "favorite_baskets",
            selectedBasketId,
            "favorites"
          )
        : collection(db, "users", userId, "favorites");

      unsubscribeFavoritesRef.current = onSnapshot(
        favCollection,
        (snapshot) => {
          const ids = new Set<string>();
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            if (data.productId) {
              ids.add(data.productId);
            }
          });

          setFavoriteProductIds(ids);
          setFavoriteCount(ids.size);
        },
        (error) => {
          console.error("Favorites subscription error:", error);
        }
      );
    },
    [selectedBasketId]
  );

  // Subscribe to all favorites (global)
  const subscribeToGlobalFavorites = useCallback((userId: string) => {
    if (unsubscribeGlobalFavoritesRef.current) {
      unsubscribeGlobalFavoritesRef.current();
    }

    // Subscribe to default favorites
    const defaultFavoritesRef = collection(db, "users", userId, "favorites");
    const defaultUnsubscribe = onSnapshot(defaultFavoritesRef, () => {
      // Trigger global favorites recalculation
      loadAllFavorites(userId);
    });

    // Subscribe to basket changes to recalculate global favorites
    const basketsRef = collection(db, "users", userId, "favorite_baskets");
    const basketsUnsubscribe = onSnapshot(basketsRef, () => {
      loadAllFavorites(userId);
    });

    unsubscribeGlobalFavoritesRef.current = () => {
      defaultUnsubscribe();
      basketsUnsubscribe();
    };
  }, []);

  // Subscribe to favorite baskets
  const subscribeToBaskets = useCallback((userId: string) => {
    if (unsubscribeBasketsRef.current) {
      unsubscribeBasketsRef.current();
    }

    const basketsCollection = collection(
      db,
      "users",
      userId,
      "favorite_baskets"
    );

    unsubscribeBasketsRef.current = onSnapshot(
      basketsCollection,
      (snapshot) => {
        const baskets: FavoriteBasket[] = [];
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          baskets.push({
            id: doc.id,
            name: data.name || "",
            createdAt: data.createdAt,
          });
        });

        // Sort by creation date
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
      },
      (error) => {
        console.error("Baskets subscription error:", error);
      }
    );
  }, []);

  // Load all favorites for global state
  const loadAllFavorites = useCallback(async (userId: string) => {
    try {
      setIsLoading(true);

      const [defaultSnap, basketsSnap] = await Promise.all([
        getDocs(collection(db, "users", userId, "favorites")),
        getDocs(collection(db, "users", userId, "favorite_baskets")),
      ]);

      const defaultIds = new Set<string>();
      defaultSnap.docs.forEach((doc) => {
        const data = doc.data();
        if (data.productId) {
          defaultIds.add(data.productId);
        }
      });

      // Load basket favorites in parallel
      const basketFavoritePromises = basketsSnap.docs.map((basketDoc) =>
        getDocs(collection(basketDoc.ref, "favorites"))
      );

      const basketFavoriteSnaps = await Promise.all(basketFavoritePromises);
      const basketIds = new Set<string>();

      basketFavoriteSnaps.forEach((snap) => {
        snap.docs.forEach((doc) => {
          const data = doc.data();
          if (data.productId) {
            basketIds.add(data.productId);
          }
        });
      });

      const allIds = new Set([...defaultIds, ...basketIds]);
      setAllFavoriteProductIds(allIds);

      lastCacheUpdateRef.current = new Date();
    } catch (error) {
      console.error("Error loading all favorites:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Toast notifications (you can replace with your preferred toast library)
  const showSuccessToast = useCallback((message: string) => {
    // Replace with your preferred toast implementation
    console.log("Success:", message);
    // Example: toast.success(message);
  }, []);

  const showErrorToast = useCallback((message: string) => {
    // Replace with your preferred toast implementation
    console.error("Error:", message);
    // Example: toast.error(message);
  }, []);

  // Debounced success messages
  const showDebouncedRemoveToast = useCallback(() => {
    if (removeFavoriteTimerRef.current) {
      clearTimeout(removeFavoriteTimerRef.current);
    }

    removeFavoriteTimerRef.current = setTimeout(() => {
      showSuccessToast("Removed from favorites");
    }, DEBOUNCE_DELAY);
  }, [showSuccessToast]);

  const showDebouncedBasketDeletionToast = useCallback(() => {
    if (basketDeletionTimerRef.current) {
      clearTimeout(basketDeletionTimerRef.current);
    }

    basketDeletionTimerRef.current = setTimeout(() => {
      showSuccessToast("Basket deleted successfully");
    }, DEBOUNCE_DELAY);
  }, [showSuccessToast]);

  const isSystemField = (key: string): boolean => {
    const systemFields = new Set([
      'addedAt',
      'updatedAt',
      'productId',
      'quantity',
    ]);
    return systemFields.has(key);
  };

  // Add to favorites
  const addToFavorites = useCallback(
    async (
      productId: string,
      attributes: FavoriteAttributes = {}
    ): Promise<string> => {
      if (!user) return "Please log in";
      if (!productId) return "Invalid product ID";
  
      const favCollection = selectedBasketId
        ? collection(
            db,
            "users",
            user.uid,
            "favorite_baskets",
            selectedBasketId,
            "favorites"
          )
        : collection(db, "users", user.uid, "favorites");
  
      try {
        return await runTransaction(db, async (transaction) => {
          // Check if already exists
          const existingQuery = query(
            favCollection,
            where("productId", "==", productId),
            limit(1)
          );
          const existing = await getDocs(existingQuery);
  
          // Get product reference and data
          const productRef = await getProductDocument(productId);
          if (!productRef) return "Product not found";
  
          const productSnap = await transaction.get(productRef);
          if (!productSnap.exists()) return "Product not found";
  
          if (existing.docs.length > 0) {
            // Remove existing favorite
            transaction.delete(existing.docs[0].ref);
            transaction.update(productRef, {
              favoritesCount: increment(-1),
              metricsUpdatedAt: serverTimestamp(),
            });
  
            // Update local state immediately
            setAllFavoriteProductIds((prev) => {
              const newSet = new Set(prev);
              newSet.delete(productId);
              return newSet;
            });
  
            if (!selectedBasketId) {
              setFavoriteProductIds((prev) => {
                const newSet = new Set(prev);
                newSet.delete(productId);
                return newSet;
              });
            }
  
            // Clear cache
            basketFavoriteCacheRef.current = {};
            basketNameCacheRef.current = {};
  
            showDebouncedRemoveToast();
            return "Removed from favorites";
          } else {
            // 🚀 NEW: Get product data and its attributes
            const productData = productSnap.data() as ProductDocumentData;
  
            // Add new favorite with dynamic attributes
            const favoriteData: Record<string, unknown> = {
              productId,
              addedAt: serverTimestamp(),
              quantity: attributes.quantity || 1,
            };
  
            // 🚀 NEW: Add product's dynamic attributes from Firestore
            if (productData.attributes) {
              Object.entries(productData.attributes).forEach(([key, value]) => {
                if (!isSystemField(key)) {
                  favoriteData[key] = value;
                }
              });
            }
  
            // 🚀 NEW: Override with any UI-selected attributes
            Object.entries(attributes).forEach(([key, value]) => {
              if (!isSystemField(key) && value !== undefined && value !== null) {
                favoriteData[key] = value;
              }
            });
  
            const newFavRef = doc(favCollection);
            transaction.set(newFavRef, favoriteData);
            transaction.update(productRef, {
              favoritesCount: increment(1),
              metricsUpdatedAt: serverTimestamp(),
            });
  
            // Update local state immediately
            setAllFavoriteProductIds((prev) => new Set([...prev, productId]));
  
            if (!selectedBasketId) {
              setFavoriteProductIds((prev) => new Set([...prev, productId]));
            }
  
            // Clear cache
            basketFavoriteCacheRef.current = {};
            basketNameCacheRef.current = {};
  
            showSuccessToast("Added to favorites");
            return "Added to favorites";
          }
        });
      } catch (error) {
        console.error("Error in add/remove favorite:", error);
        showErrorToast("Failed to update favorites");
        return `Failed to update favorites: ${error}`;
      }
    },
    [
      user,
      selectedBasketId,
      getProductDocument,
      showSuccessToast,
      showErrorToast,
      showDebouncedRemoveToast,
    ]
  );
  

  // Remove from favorites (alias for addToFavorites for toggle behavior)
  const removeFromFavorites = useCallback(
    async (productId: string): Promise<string> => {
      return addToFavorites(productId);
    },
    [addToFavorites]
  );

  // Remove globally from all favorites and baskets
  const removeGloballyFromFavorites = useCallback(
    async (productId: string): Promise<string> => {
      if (!user) return "Please log in";

      try {
        const batch = writeBatch(db);

        // Parallel queries for better performance
        const [defaultSnap, basketsSnap] = await Promise.all([
          getDocs(
            query(
              collection(db, "users", user.uid, "favorites"),
              where("productId", "==", productId)
            )
          ),
          getDocs(collection(db, "users", user.uid, "favorite_baskets")),
        ]);

        // Delete from default favorites
        defaultSnap.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });

        // Delete from all baskets
        const basketFavoritePromises = basketsSnap.docs.map((basketDoc) =>
          getDocs(
            query(
              collection(basketDoc.ref, "favorites"),
              where("productId", "==", productId)
            )
          )
        );

        const basketFavoriteSnaps = await Promise.all(basketFavoritePromises);
        basketFavoriteSnaps.forEach((snap) => {
          snap.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });
        });

        // Update product counter
        const productRef = await getProductDocument(productId);
        if (productRef) {
          batch.update(productRef, {
            favoritesCount: increment(-1),
            metricsUpdatedAt: serverTimestamp(),
          });
        }

        await batch.commit();

        // Update local state
        setAllFavoriteProductIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });
        setFavoriteProductIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });

        // Clear cache
        basketFavoriteCacheRef.current = {};
        basketNameCacheRef.current = {};

        showSuccessToast("Removed from all favorites");
        return "Removed from all favorites";
      } catch (error) {
        console.error("Error globally removing favorite:", error);
        showErrorToast("Failed to remove from favorites");
        return `Failed to remove from favorites: ${error}`;
      }
    },
    [user, getProductDocument, showSuccessToast, showErrorToast]
  );

  // Remove multiple favorites in batches
  const removeMultipleFromFavorites = useCallback(
    async (productIds: string[]): Promise<string> => {
      if (!user) return "Please log in";
      if (productIds.length === 0) return "No products selected";

      try {
        // Process in smaller batches to avoid timeout
        for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
          const batch = productIds.slice(i, i + BATCH_SIZE);
          await removeMultipleBatch(batch);
        }

        showSuccessToast("Products removed from favorites");
        return "Products removed from favorites";
      } catch (error) {
        console.error("Error removing multiple favorites:", error);
        showErrorToast("Failed to remove favorites");
        return `Failed to remove favorites: ${error}`;
      }
    },
    [user, showSuccessToast, showErrorToast]
  );

  // Helper function to remove a batch of favorites
  const removeMultipleBatch = useCallback(
    async (productIds: string[]) => {
      if (!user) return;

      const favCollection = selectedBasketId
        ? collection(
            db,
            "users",
            user.uid,
            "favorite_baskets",
            selectedBasketId,
            "favorites"
          )
        : collection(db, "users", user.uid, "favorites");

      const batch = writeBatch(db);

      // Process in chunks for Firestore whereIn limit
      for (const chunk of chunkArray(productIds, FIRESTORE_IN_LIMIT)) {
        const snap = await getDocs(
          query(favCollection, where("productId", "in", chunk))
        );
        snap.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
      }

      // Update product counters
      const productRefs = await Promise.all(
        productIds.map(async (id) => {
          return await getProductDocument(id);
        })
      );

      productRefs.forEach((ref) => {
        if (ref) {
          batch.update(ref, {
            favoritesCount: increment(-1),
            metricsUpdatedAt: serverTimestamp(),
          });
        }
      });

      await batch.commit();
    },
    [user, selectedBasketId, chunkArray, getProductDocument]
  );

  // Create favorite basket
  const createFavoriteBasket = useCallback(
    async (name: string): Promise<string> => {
      if (!user) return "Please log in";
      if (!name.trim()) return "Basket name is required";

      try {
        const basketsSnapshot = await getDocs(
          collection(db, "users", user.uid, "favorite_baskets")
        );

        if (basketsSnapshot.docs.length >= MAX_BASKETS) {
          return "Maximum basket limit reached";
        }

        await addDoc(collection(db, "users", user.uid, "favorite_baskets"), {
          name: name.trim(),
          createdAt: serverTimestamp(),
        });

        showSuccessToast("Basket created successfully");
        return "Basket created successfully";
      } catch (error) {
        console.error("Error creating basket:", error);
        showErrorToast("Failed to create basket");
        return `Failed to create basket: ${error}`;
      }
    },
    [user, showSuccessToast, showErrorToast]
  );

  // Delete favorite basket
  const deleteFavoriteBasket = useCallback(
    async (basketId: string): Promise<string> => {
      if (!user) return "Please log in";

      try {
        await deleteDoc(
          doc(db, "users", user.uid, "favorite_baskets", basketId)
        );

        if (selectedBasketId === basketId) {
          setSelectedBasketIdState(null);
        }

        // Clear cache
        basketFavoriteCacheRef.current = {};
        basketNameCacheRef.current = {};

        showDebouncedBasketDeletionToast();
        return "Basket deleted successfully";
      } catch (error) {
        console.error("Error deleting basket:", error);
        showErrorToast("Failed to delete basket");
        return `Failed to delete basket: ${error}`;
      }
    },
    [user, selectedBasketId, showErrorToast, showDebouncedBasketDeletionToast]
  );

  // Set selected basket
  const setSelectedBasket = useCallback((basketId: string | null) => {
    setSelectedBasketIdState(basketId);
    // Clear cache when switching baskets
    basketFavoriteCacheRef.current = {};
    basketNameCacheRef.current = {};
  }, []);

  // Transfer favorites to basket
  const transferFavoritesToBasket = useCallback(
    async (productIds: string[], basketId: string): Promise<string> => {
      if (!user) return "Please log in";
      if (productIds.length === 0) return "No products selected";

      try {
        // Process in smaller batches
        for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
          const batch = productIds.slice(i, i + BATCH_SIZE);
          await transferBatch(batch, basketId);
        }

        showSuccessToast("Products transferred to basket");
        return "Products transferred to basket";
      } catch (error) {
        console.error("Error transferring favorites:", error);
        showErrorToast("Failed to transfer favorites");
        return `Failed to transfer favorites: ${error}`;
      }
    },
    [user, showSuccessToast, showErrorToast]
  );

  // Helper function to transfer a batch
  const transferBatch = useCallback(
    async (productIds: string[], basketId: string) => {
      if (!user) return;
  
      const defaultFavs = collection(db, "users", user.uid, "favorites");
      const basketFavs = collection(
        db,
        "users",
        user.uid,
        "favorite_baskets",
        basketId,
        "favorites"
      );
  
      const batch = writeBatch(db);
  
      try {
        for (const chunk of chunkArray(productIds, FIRESTORE_IN_LIMIT)) {
          const snap = await getDocs(
            query(defaultFavs, where("productId", "in", chunk))
          );
  
          snap.docs.forEach((docSnap) => {
            const data = docSnap.data();
  
            // Delete from default favorites
            batch.delete(docSnap.ref);
  
            // 🚀 NEW: Build transfer data with all non-system attributes
            const transferData: Record<string, unknown> = {
              productId: data.productId,
              addedAt: serverTimestamp(),
              quantity: (data.quantity as number) || 1,
            };
  
            // 🚀 NEW: Copy all non-system attributes dynamically
            Object.entries(data).forEach(([key, value]) => {
              if (!isSystemField(key) && key !== 'productId' && value != null) {
                transferData[key] = value;
              }
            });
  
            // Add to basket
            const newBasketRef = doc(basketFavs);
            batch.set(newBasketRef, transferData);
          });
        }
  
        await batch.commit();
      } catch (error) {
        console.error("Error in transferBatch:", error);
        throw error;
      }
    },
    [user, chunkArray]
  );

  // Move favorites from basket to default
  const moveFavoritesFromBasketToDefault = useCallback(
    async (productIds: string[]): Promise<string> => {
      if (!user) return "Please log in";
      if (!selectedBasketId) return "No basket selected";
      if (productIds.length === 0) return "No products selected";

      try {
        // Process in smaller batches
        for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
          const batch = productIds.slice(i, i + BATCH_SIZE);
          await moveFromBasketBatch(batch, selectedBasketId);
        }

        showSuccessToast("Products moved to default favorites");
        return "Products moved to default favorites";
      } catch (error) {
        console.error("Error moving favorites:", error);
        showErrorToast("Failed to move favorites");
        return `Failed to move favorites: ${error}`;
      }
    },
    [user, selectedBasketId, showSuccessToast, showErrorToast]
  );

  // Helper function to move from basket batch
  const moveFromBasketBatch = useCallback(
    async (productIds: string[], basketId: string) => {
      if (!user) return;
  
      const basketFavs = collection(
        db,
        "users",
        user.uid,
        "favorite_baskets",
        basketId,
        "favorites"
      );
      const defaultFavs = collection(db, "users", user.uid, "favorites");
  
      const batch = writeBatch(db);
  
      try {
        for (const chunk of chunkArray(productIds, FIRESTORE_IN_LIMIT)) {
          const snap = await getDocs(
            query(basketFavs, where("productId", "in", chunk))
          );
  
          snap.docs.forEach((docSnap) => {
            const data = docSnap.data();
  
            // Delete from basket
            batch.delete(docSnap.ref);
  
            // 🚀 NEW: Build transfer data with all non-system attributes
            const transferData: Record<string, unknown> = {
              productId: data.productId,
              addedAt: serverTimestamp(),
              quantity: (data.quantity as number) || 1,
            };
  
            // 🚀 NEW: Copy all non-system attributes dynamically
            Object.entries(data).forEach(([key, value]) => {
              if (!isSystemField(key) && key !== 'productId' && value != null) {
                transferData[key] = value;
              }
            });
  
            // Add to default favorites
            const newDefaultRef = doc(defaultFavs);
            batch.set(newDefaultRef, transferData);
          });
        }
  
        await batch.commit();
      } catch (error) {
        console.error("Error in moveFromBasketBatch:", error);
        throw error;
      }
    },
    [user, chunkArray]
  );

  // Check if product is favorited in any basket
  const isFavoritedInBasket = useCallback(
    async (productId: string): Promise<boolean> => {
      // Check cache first
      if (basketFavoriteCacheRef.current[productId] !== undefined) {
        return basketFavoriteCacheRef.current[productId];
      }

      if (!user) return false;

      try {
        const basketsSnap = await getDocs(
          collection(db, "users", user.uid, "favorite_baskets")
        );

        const checks = basketsSnap.docs.map((basketDoc) =>
          getDocs(
            query(
              collection(basketDoc.ref, "favorites"),
              where("productId", "==", productId)
            )
          )
        );

        const results = (await Promise.race([
          Promise.all(checks),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 5000)
          ),
        ])) as QuerySnapshot<Record<string, unknown>>[];

        const isFavorited = results.some((snap) => !snap.empty);

        // Cache the result
        basketFavoriteCacheRef.current[productId] = isFavorited;

        return isFavorited;
      } catch (error) {
        console.error("Error checking basket favorite:", error);
        return false;
      }
    },
    [user]
  );

  // Get basket name for a product
  const getBasketNameForProduct = useCallback(
    async (productId: string): Promise<string | null> => {
      // Check cache first
      if (basketNameCacheRef.current[productId] !== undefined) {
        return basketNameCacheRef.current[productId];
      }

      if (!user) return null;

      try {
        const basketsSnap = await getDocs(
          collection(db, "users", user.uid, "favorite_baskets")
        );

        const favChecks = basketsSnap.docs.map(async (basketDoc) => {
          const snap = await getDocs(
            query(
              collection(basketDoc.ref, "favorites"),
              where("productId", "==", productId)
            )
          );
          return !snap.empty ? (basketDoc.data().name as string) : null;
        });

        const names = (await Promise.race([
          Promise.all(favChecks),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 5000)
          ),
        ])) as (string | null)[];

        const basketName = names.find((name) => name !== null) || null;

        // Cache the result
        basketNameCacheRef.current[productId] = basketName;

        return basketName;
      } catch (error) {
        console.error("Error getting basket name:", error);
        return null;
      }
    },
    [user]
  );

  // Utility functions
  const isFavorite = useCallback(
    (productId: string): boolean => {
      return favoriteProductIds.has(productId);
    },
    [favoriteProductIds]
  );

  const isGloballyFavorited = useCallback(
    (productId: string): boolean => {
      return allFavoriteProductIds.has(productId);
    },
    [allFavoriteProductIds]
  );

  // Effect to handle user changes
  useEffect(() => {
    if (user) {
      subscribeToFavorites(user.uid);
      subscribeToGlobalFavorites(user.uid);
      subscribeToBaskets(user.uid);
    } else {
      // Cleanup subscriptions
      if (unsubscribeFavoritesRef.current) {
        unsubscribeFavoritesRef.current();
        unsubscribeFavoritesRef.current = null;
      }
      if (unsubscribeGlobalFavoritesRef.current) {
        unsubscribeGlobalFavoritesRef.current();
        unsubscribeGlobalFavoritesRef.current = null;
      }
      if (unsubscribeBasketsRef.current) {
        unsubscribeBasketsRef.current();
        unsubscribeBasketsRef.current = null;
      }
      clearUserData();
    }

    return () => {
      if (unsubscribeFavoritesRef.current) {
        unsubscribeFavoritesRef.current();
      }
      if (unsubscribeGlobalFavoritesRef.current) {
        unsubscribeGlobalFavoritesRef.current();
      }
      if (unsubscribeBasketsRef.current) {
        unsubscribeBasketsRef.current();
      }
    };
  }, [
    user,
    subscribeToFavorites,
    subscribeToGlobalFavorites,
    subscribeToBaskets,
    clearUserData,
  ]);

  // Effect to re-subscribe to favorites when selected basket changes
  useEffect(() => {
    if (user) {
      subscribeToFavorites(user.uid);
    }
  }, [user, selectedBasketId, subscribeToFavorites]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (removeFavoriteTimerRef.current) {
        clearTimeout(removeFavoriteTimerRef.current);
      }
      if (basketDeletionTimerRef.current) {
        clearTimeout(basketDeletionTimerRef.current);
      }
    };
  }, []);

  const contextValue: FavoritesContextType = {
    // State
    favoriteProductIds,
    allFavoriteProductIds,
    favoriteCount,
    selectedBasketId,
    favoriteBaskets,
    isLoading,

    // Methods
    addToFavorites,
    removeFromFavorites,
    removeGloballyFromFavorites,
    removeMultipleFromFavorites,

    // Basket management
    createFavoriteBasket,
    deleteFavoriteBasket,
    setSelectedBasket,
    transferFavoritesToBasket,
    moveFavoritesFromBasketToDefault,

    // Utility methods
    isFavorite,
    isGloballyFavorited,
    isFavoritedInBasket,
    getBasketNameForProduct,

    // Toast notifications
    showSuccessToast,
    showErrorToast,
  };

  return (
    <FavoritesContext.Provider value={contextValue}>
      {children}
    </FavoritesContext.Provider>
  );
};
