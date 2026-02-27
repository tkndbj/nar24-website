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
  getDoc,
  getDocs,
  Timestamp,
  Firestore,
  deleteDoc,
  updateDoc,
  setDoc,
  QuerySnapshot,
  DocumentChange,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { User } from "firebase/auth";

// ============================================================================
// TYPES
// ============================================================================

interface FoodCartUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

/** A selected extra/add-on for a food cart item */
export interface SelectedExtra {
  name: string; // Extra key, e.g. "Extra Cheese"
  quantity: number; // How many of this extra (default: 1)
  price: number; // Price per unit of this extra (0 if free)
}

/** A single food item in the cart */
export interface FoodCartItem {
  foodId: string;
  name: string;
  description: string;
  price: number; // Base price of the food
  imageUrl: string;
  foodCategory: string;
  foodType: string;
  preparationTime: number | null;

  // Cart-specific
  quantity: number;
  extras: SelectedExtra[];
  specialNotes: string;

  // Restaurant info (denormalized for display & enforcement)
  restaurantId: string;
  restaurantName: string;

  // Metadata
  addedAt: Timestamp | null;
  isOptimistic?: boolean;
}

/** Lightweight restaurant info stored in the food cart meta */
export interface FoodCartRestaurant {
  id: string;
  name: string;
  profileImageUrl?: string;
}

/** Totals for the food cart */
export interface FoodCartTotals {
  subtotal: number; // Sum of (item price + extras) * quantity
  itemCount: number; // Total number of items (sum of quantities)
  currency: string;
}

/**
 * What to do when the user tries to add from a different restaurant.
 * The UI should present this choice to the user.
 */
export type RestaurantConflictAction = "replace" | "cancel";

// ============================================================================
// CONTEXT TYPES — Split for performance (same pattern as CartProvider)
// ============================================================================

interface FoodCartStateContextType {
  /** Current restaurant the cart belongs to (null if cart is empty) */
  currentRestaurant: FoodCartRestaurant | null;
  /** All food items in the cart */
  items: FoodCartItem[];
  /** Total item count (sum of quantities) */
  itemCount: number;
  /** Computed totals */
  totals: FoodCartTotals;
  /** Whether the cart is loading from Firestore */
  isLoading: boolean;
  /** Whether the provider has finished its initial load */
  isInitialized: boolean;
}

interface FoodCartActionsContextType {
  /**
   * Add a food item to the cart.
   * Returns "restaurant_conflict" if the item belongs to a different restaurant.
   * In that case the UI should ask the user whether to clear & replace or cancel,
   * then call `clearAndAddFromNewRestaurant` if they choose replace.
   */
  addItem: (params: {
    food: {
      id: string;
      name: string;
      description?: string;
      price: number;
      imageUrl?: string;
      foodCategory: string;
      foodType: string;
      preparationTime?: number | null;
    };
    restaurant: FoodCartRestaurant;
    quantity?: number;
    extras?: SelectedExtra[];
    specialNotes?: string;
  }) => Promise<"added" | "quantity_updated" | "restaurant_conflict" | "error">;

  /**
   * Clear the entire food cart and add an item from a new restaurant.
   * Used after the user confirms they want to switch restaurants.
   */
  clearAndAddFromNewRestaurant: (params: {
    food: {
      id: string;
      name: string;
      description?: string;
      price: number;
      imageUrl?: string;
      foodCategory: string;
      foodType: string;
      preparationTime?: number | null;
    };
    restaurant: FoodCartRestaurant;
    quantity?: number;
    extras?: SelectedExtra[];
    specialNotes?: string;
  }) => Promise<"added" | "error">;

  /** Remove a food item entirely from the cart */
  removeItem: (foodId: string) => Promise<void>;

  /** Update quantity of an existing item (removes if quantity <= 0) */
  updateQuantity: (foodId: string, newQuantity: number) => Promise<void>;

  /**
   * Update the extras for an existing cart item.
   * This replaces the entire extras array for that item.
   */
  updateExtras: (foodId: string, extras: SelectedExtra[]) => Promise<void>;

  /** Update special notes for an item */
  updateNotes: (foodId: string, notes: string) => Promise<void>;

  /** Clear the entire food cart */
  clearCart: () => Promise<void>;

  /** Force refresh from Firestore */
  refresh: () => Promise<void>;
}

// Combined for convenience
interface FoodCartContextType
  extends FoodCartStateContextType,
    FoodCartActionsContextType {}

// ============================================================================
// CONTEXTS
// ============================================================================

const FoodCartStateContext = createContext<
  FoodCartStateContextType | undefined
>(undefined);

const FoodCartActionsContext = createContext<
  FoodCartActionsContextType | undefined
>(undefined);

const FoodCartContext = createContext<FoodCartContextType | undefined>(
  undefined,
);

// ============================================================================
// HOOKS
// ============================================================================

/** Access only food cart state (re-renders on state changes) */
export const useFoodCartState = (): FoodCartStateContextType => {
  const ctx = useContext(FoodCartStateContext);
  if (!ctx) throw new Error("useFoodCartState must be within FoodCartProvider");
  return ctx;
};

/** Access only food cart actions (stable references, never re-renders) */
export const useFoodCartActions = (): FoodCartActionsContextType => {
  const ctx = useContext(FoodCartActionsContext);
  if (!ctx)
    throw new Error("useFoodCartActions must be within FoodCartProvider");
  return ctx;
};

/** Combined hook — prefer the split hooks for better performance */
export const useFoodCart = (): FoodCartContextType => {
  const ctx = useContext(FoodCartContext);
  if (!ctx) throw new Error("useFoodCart must be within FoodCartProvider");
  return ctx;
};

// ============================================================================
// FIRESTORE PATHS
// ============================================================================

/** users/{uid}/foodCart/{foodId} */
const foodCartCollection = (db: Firestore, uid: string) =>
  collection(db, "users", uid, "foodCart");

const foodCartDoc = (db: Firestore, uid: string, foodId: string) =>
  doc(db, "users", uid, "foodCart", foodId);

/** users/{uid}/foodCartMeta/info — stores current restaurant info */
const foodCartMetaDoc = (db: Firestore, uid: string) =>
  doc(db, "users", uid, "foodCartMeta", "info");

// ============================================================================
// HELPER: Compute totals locally (no Cloud Function needed for food)
// ============================================================================

function computeTotals(items: FoodCartItem[]): FoodCartTotals {
  let subtotal = 0;
  let itemCount = 0;

  for (const item of items) {
    const extrasTotal = item.extras.reduce(
      (sum, ext) => sum + ext.price * ext.quantity,
      0,
    );
    const itemSubtotal = (item.price + extrasTotal) * item.quantity;
    subtotal += itemSubtotal;
    itemCount += item.quantity;
  }

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    itemCount,
    currency: "TL",
  };
}

// ============================================================================
// HELPER: Build FoodCartItem from Firestore document data
// ============================================================================

function buildFoodCartItem(
  foodId: string,
  data: Record<string, unknown>,
): FoodCartItem {
  return {
    foodId,
    name: (data.name as string) ?? "",
    description: (data.description as string) ?? "",
    price: (data.price as number) ?? 0,
    imageUrl: (data.imageUrl as string) ?? "",
    foodCategory: (data.foodCategory as string) ?? "",
    foodType: (data.foodType as string) ?? "",
    preparationTime: (data.preparationTime as number) ?? null,

    quantity: (data.quantity as number) ?? 1,
    extras: Array.isArray(data.extras)
      ? (data.extras as SelectedExtra[]).map((e) => ({
          name: e.name ?? "",
          quantity: e.quantity ?? 1,
          price: e.price ?? 0,
        }))
      : [],
    specialNotes: (data.specialNotes as string) ?? "",

    restaurantId: (data.restaurantId as string) ?? "",
    restaurantName: (data.restaurantName as string) ?? "",

    addedAt: data.addedAt instanceof Timestamp ? data.addedAt : null,
    isOptimistic: false,
  };
}

// ============================================================================
// HELPER: Build Firestore write data from params
// ============================================================================

function buildFirestoreData(params: {
  food: {
    id: string;
    name: string;
    description?: string;
    price: number;
    imageUrl?: string;
    foodCategory: string;
    foodType: string;
    preparationTime?: number | null;
  };
  restaurant: FoodCartRestaurant;
  quantity: number;
  extras: SelectedExtra[];
  specialNotes: string;
}): Record<string, unknown> {
  return {
    name: params.food.name,
    description: params.food.description ?? "",
    price: params.food.price,
    imageUrl: params.food.imageUrl ?? "",
    foodCategory: params.food.foodCategory,
    foodType: params.food.foodType,
    preparationTime: params.food.preparationTime ?? null,
    quantity: params.quantity,
    extras: params.extras.map((e) => ({
      name: e.name,
      quantity: e.quantity,
      price: e.price,
    })),
    specialNotes: params.specialNotes,
    restaurantId: params.restaurant.id,
    restaurantName: params.restaurant.name,
    addedAt: serverTimestamp(),
  };
}

// ============================================================================
// RATE LIMITER
// ============================================================================

class RateLimiter {
  private timestamps = new Map<string, number>();
  constructor(private cooldownMs: number) {}

  canProceed(key: string): boolean {
    const now = Date.now();
    const last = this.timestamps.get(key) ?? 0;
    if (now - last < this.cooldownMs) return false;
    this.timestamps.set(key, now);
    return true;
  }
}

// ============================================================================
// PROVIDER
// ============================================================================

interface FoodCartProviderProps {
  children: ReactNode;
  user: FoodCartUser | User | null;
  db: Firestore | null;
}

export const FoodCartProvider: React.FC<FoodCartProviderProps> = ({
  children,
  user,
  db,
}) => {
  // ── State ──────────────────────────────────────────────────────────────
  const [currentRestaurant, setCurrentRestaurant] =
    useState<FoodCartRestaurant | null>(null);
  const [items, setItems] = useState<FoodCartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const rateLimiterRef = useRef(new RateLimiter(200));

  // ── Derived ────────────────────────────────────────────────────────────
  const totals = useMemo(() => computeTotals(items), [items]);
  const itemCount = totals.itemCount;

  // ════════════════════════════════════════════════════════════════════════
  // REAL-TIME LISTENER
  // ════════════════════════════════════════════════════════════════════════

  const handleSnapshot = useCallback(
    (snapshot: QuerySnapshot) => {
      // Skip cache-only events
      if (snapshot.metadata.fromCache && snapshot.metadata.hasPendingWrites) {
        return;
      }

      const changes = snapshot.docChanges();

      if (snapshot.docs.length === 0) {
        // Cart is empty
        setItems([]);
        setCurrentRestaurant(null);
        return;
      }

      setItems((current) => {
        const map = new Map<string, FoodCartItem>();
        current.forEach((item) => map.set(item.foodId, item));

        for (const change of changes) {
          const id = change.doc.id;
          const data = change.doc.data();

          if (change.type === "removed") {
            map.delete(id);
          } else {
            // "added" or "modified"
            try {
              const item = buildFoodCartItem(id, data);
              map.set(id, item);
            } catch (err) {
              console.error(`[FoodCart] Failed to parse item ${id}:`, err);
            }
          }
        }

        const result = Array.from(map.values());

        // Sort by addedAt descending (newest first)
        result.sort((a, b) => {
          const ta = a.addedAt?.toMillis() ?? 0;
          const tb = b.addedAt?.toMillis() ?? 0;
          return tb - ta;
        });

        return result;
      });

      // Update restaurant from first doc if not set
      const firstDoc = snapshot.docs[0]?.data();
      if (firstDoc?.restaurantId) {
        setCurrentRestaurant((prev) => {
          if (prev?.id === firstDoc.restaurantId) return prev;
          return {
            id: firstDoc.restaurantId as string,
            name: (firstDoc.restaurantName as string) ?? "",
          };
        });
      }
    },
    [],
  );

  const startListener = useCallback(() => {
    if (!user || !db) return;

    // Detach previous
    unsubscribeRef.current?.();

    const q = query(foodCartCollection(db, user.uid));

    unsubscribeRef.current = onSnapshot(
      q,
      { includeMetadataChanges: false },
      handleSnapshot,
      (error) => console.error("[FoodCart] Listener error:", error),
    );
  }, [user, db, handleSnapshot]);

  const stopListener = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  // ════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!user || !db) {
      // Logged out — reset
      if (isInitialized) {
        stopListener();
        setItems([]);
        setCurrentRestaurant(null);
        setIsInitialized(false);
        setIsLoading(false);
      }
      return;
    }

    if (isInitialized) return;

    let cancelled = false;

    const initialize = async () => {
      setIsLoading(true);
      try {
        // 1. Load cart meta (restaurant info)
        const metaSnap = await getDoc(foodCartMetaDoc(db, user.uid));
        if (!cancelled && metaSnap.exists()) {
          const meta = metaSnap.data();
          setCurrentRestaurant({
            id: (meta.restaurantId as string) ?? "",
            name: (meta.restaurantName as string) ?? "",
            profileImageUrl: (meta.profileImageUrl as string) ?? undefined,
          });
        }

        // 2. Load cart items
        const cartSnap = await getDocs(foodCartCollection(db, user.uid));
        if (!cancelled) {
          const loaded: FoodCartItem[] = [];
          cartSnap.docs.forEach((d) => {
            try {
              loaded.push(buildFoodCartItem(d.id, d.data()));
            } catch (err) {
              console.error(`[FoodCart] Skipping malformed item ${d.id}:`, err);
            }
          });

          loaded.sort((a, b) => {
            const ta = a.addedAt?.toMillis() ?? 0;
            const tb = b.addedAt?.toMillis() ?? 0;
            return tb - ta;
          });

          setItems(loaded);
          setIsInitialized(true);

          // 3. Start real-time listener
          startListener();
        }
      } catch (err) {
        console.error("[FoodCart] Init error:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    // Defer to avoid blocking first paint
    const timer = setTimeout(initialize, 100);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, db, isInitialized]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopListener();
  }, [stopListener]);

  // ════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ════════════════════════════════════════════════════════════════════════

  // ── Helper: write restaurant meta ──────────────────────────────────────
  const writeRestaurantMeta = useCallback(
    async (restaurant: FoodCartRestaurant) => {
      if (!user || !db) return;
      await setDoc(foodCartMetaDoc(db, user.uid), {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        profileImageUrl: restaurant.profileImageUrl ?? "",
        updatedAt: serverTimestamp(),
      });
      setCurrentRestaurant(restaurant);
    },
    [user, db],
  );

  // ── Helper: generate a unique cart item key ────────────────────────────
  // Two items of the same food but with different extras are different cart entries.
  const buildCartItemKey = useCallback(
    (foodId: string, extras: SelectedExtra[]): string => {
      if (extras.length === 0) return foodId;
      const sortedExtras = [...extras]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => `${e.name}:${e.quantity}`)
        .join("|");
      // Create a deterministic suffix from extras
      const hash = sortedExtras
        .split("")
        .reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
      return `${foodId}_${Math.abs(hash).toString(36)}`;
    },
    [],
  );

  // ── Add Item ───────────────────────────────────────────────────────────
  const addItem: FoodCartActionsContextType["addItem"] = useCallback(
    async (params) => {
      if (!user || !db) return "error";

      const { food, restaurant, quantity = 1, extras = [], specialNotes = "" } = params;

      if (!rateLimiterRef.current.canProceed(`add_${food.id}`)) {
        return "error";
      }

      // ── Single-restaurant check ──
      if (currentRestaurant && currentRestaurant.id !== restaurant.id) {
        return "restaurant_conflict";
      }

      try {
        const cartKey = buildCartItemKey(food.id, extras);

        // Check if this exact item+extras combo already exists
        const existingItem = items.find((i) => i.foodId === cartKey);

        if (existingItem) {
          // Increment quantity
          const newQty = existingItem.quantity + quantity;
          await updateDoc(foodCartDoc(db, user.uid, cartKey), {
            quantity: newQty,
          });

          // Optimistic
          setItems((prev) =>
            prev.map((i) =>
              i.foodId === cartKey ? { ...i, quantity: newQty } : i,
            ),
          );

          return "quantity_updated";
        }

        // New item — write to Firestore
        const firestoreData = buildFirestoreData({
          food,
          restaurant,
          quantity,
          extras,
          specialNotes,
        });

        await setDoc(foodCartDoc(db, user.uid, cartKey), firestoreData);

        // Write restaurant meta if this is the first item
        if (!currentRestaurant) {
          await writeRestaurantMeta(restaurant);
        }

        // Optimistic add
        const optimisticItem: FoodCartItem = {
          foodId: cartKey,
          name: food.name,
          description: food.description ?? "",
          price: food.price,
          imageUrl: food.imageUrl ?? "",
          foodCategory: food.foodCategory,
          foodType: food.foodType,
          preparationTime: food.preparationTime ?? null,
          quantity,
          extras,
          specialNotes,
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          addedAt: Timestamp.now(),
          isOptimistic: true,
        };

        setItems((prev) => [optimisticItem, ...prev]);

        return "added";
      } catch (err) {
        console.error("[FoodCart] addItem error:", err);
        return "error";
      }
    },
    [user, db, currentRestaurant, items, buildCartItemKey, writeRestaurantMeta],
  );

  // ── Clear & Add from New Restaurant ────────────────────────────────────
  const clearAndAddFromNewRestaurant: FoodCartActionsContextType["clearAndAddFromNewRestaurant"] =
    useCallback(
      async (params) => {
        if (!user || !db) return "error";

        try {
          // 1. Delete all existing items in a batch
          const snapshot = await getDocs(foodCartCollection(db, user.uid));
          if (snapshot.docs.length > 0) {
            const batch = writeBatch(db);
            snapshot.docs.forEach((d) => batch.delete(d.ref));
            batch.delete(foodCartMetaDoc(db, user.uid));
            await batch.commit();
          }

          // 2. Reset state
          setItems([]);
          setCurrentRestaurant(null);

          // 3. Add the new item (currentRestaurant is now null so no conflict)
          const { food, restaurant, quantity = 1, extras = [], specialNotes = "" } = params;
          const cartKey = buildCartItemKey(food.id, extras);

          const firestoreData = buildFirestoreData({
            food,
            restaurant,
            quantity,
            extras,
            specialNotes,
          });

          await setDoc(foodCartDoc(db, user.uid, cartKey), firestoreData);
          await writeRestaurantMeta(restaurant);

          // Optimistic
          const optimisticItem: FoodCartItem = {
            foodId: cartKey,
            name: food.name,
            description: food.description ?? "",
            price: food.price,
            imageUrl: food.imageUrl ?? "",
            foodCategory: food.foodCategory,
            foodType: food.foodType,
            preparationTime: food.preparationTime ?? null,
            quantity,
            extras,
            specialNotes,
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            addedAt: Timestamp.now(),
            isOptimistic: true,
          };

          setItems([optimisticItem]);

          return "added";
        } catch (err) {
          console.error("[FoodCart] clearAndAdd error:", err);
          return "error";
        }
      },
      [user, db, buildCartItemKey, writeRestaurantMeta],
    );

  // ── Remove Item ────────────────────────────────────────────────────────
  const removeItem: FoodCartActionsContextType["removeItem"] = useCallback(
    async (foodId) => {
      if (!user || !db) return;

      // Optimistic
      setItems((prev) => prev.filter((i) => i.foodId !== foodId));

      try {
        await deleteDoc(foodCartDoc(db, user.uid, foodId));

        // If cart is now empty, clear meta too
        const remaining = items.filter((i) => i.foodId !== foodId);
        if (remaining.length === 0) {
          await deleteDoc(foodCartMetaDoc(db, user.uid)).catch(() => {});
          setCurrentRestaurant(null);
        }
      } catch (err) {
        console.error("[FoodCart] removeItem error:", err);
        // Rollback — re-fetch
        await refresh();
      }
    },
    [user, db, items],
  );

  // ── Update Quantity ────────────────────────────────────────────────────
  const updateQuantity: FoodCartActionsContextType["updateQuantity"] =
    useCallback(
      async (foodId, newQuantity) => {
        if (!user || !db) return;

        if (newQuantity <= 0) {
          return removeItem(foodId);
        }

        if (!rateLimiterRef.current.canProceed(`qty_${foodId}`)) return;

        // Optimistic
        setItems((prev) =>
          prev.map((i) =>
            i.foodId === foodId ? { ...i, quantity: newQuantity } : i,
          ),
        );

        try {
          await updateDoc(foodCartDoc(db, user.uid, foodId), {
            quantity: newQuantity,
          });
        } catch (err) {
          console.error("[FoodCart] updateQuantity error:", err);
          await refresh();
        }
      },
      [user, db, removeItem],
    );

  // ── Update Extras ──────────────────────────────────────────────────────
  const updateExtras: FoodCartActionsContextType["updateExtras"] = useCallback(
    async (foodId, extras) => {
      if (!user || !db) return;

      // Optimistic
      setItems((prev) =>
        prev.map((i) => (i.foodId === foodId ? { ...i, extras } : i)),
      );

      try {
        await updateDoc(foodCartDoc(db, user.uid, foodId), {
          extras: extras.map((e) => ({
            name: e.name,
            quantity: e.quantity,
            price: e.price,
          })),
        });
      } catch (err) {
        console.error("[FoodCart] updateExtras error:", err);
        await refresh();
      }
    },
    [user, db],
  );

  // ── Update Notes ───────────────────────────────────────────────────────
  const updateNotes: FoodCartActionsContextType["updateNotes"] = useCallback(
    async (foodId, notes) => {
      if (!user || !db) return;

      setItems((prev) =>
        prev.map((i) =>
          i.foodId === foodId ? { ...i, specialNotes: notes } : i,
        ),
      );

      try {
        await updateDoc(foodCartDoc(db, user.uid, foodId), {
          specialNotes: notes,
        });
      } catch (err) {
        console.error("[FoodCart] updateNotes error:", err);
      }
    },
    [user, db],
  );

  // ── Clear Cart ─────────────────────────────────────────────────────────
  const clearCart: FoodCartActionsContextType["clearCart"] = useCallback(async () => {
    if (!user || !db) return;

    // Optimistic
    setItems([]);
    setCurrentRestaurant(null);

    try {
      const snapshot = await getDocs(foodCartCollection(db, user.uid));
      if (snapshot.docs.length > 0) {
        const batch = writeBatch(db);
        snapshot.docs.forEach((d) => batch.delete(d.ref));
        batch.delete(foodCartMetaDoc(db, user.uid));
        await batch.commit();
      }
    } catch (err) {
      console.error("[FoodCart] clearCart error:", err);
      await refresh();
    }
  }, [user, db]);

  // ── Refresh ────────────────────────────────────────────────────────────
  const refresh: FoodCartActionsContextType["refresh"] = useCallback(async () => {
    if (!user || !db) return;

    try {
      const [metaSnap, cartSnap] = await Promise.all([
        getDoc(foodCartMetaDoc(db, user.uid)),
        getDocs(foodCartCollection(db, user.uid)),
      ]);

      if (metaSnap.exists()) {
        const meta = metaSnap.data();
        setCurrentRestaurant({
          id: (meta.restaurantId as string) ?? "",
          name: (meta.restaurantName as string) ?? "",
          profileImageUrl: (meta.profileImageUrl as string) ?? undefined,
        });
      } else {
        setCurrentRestaurant(null);
      }

      const loaded: FoodCartItem[] = [];
      cartSnap.docs.forEach((d) => {
        try {
          loaded.push(buildFoodCartItem(d.id, d.data()));
        } catch (err) {
          console.error(`[FoodCart] Skipping malformed item ${d.id}:`, err);
        }
      });

      loaded.sort((a, b) => {
        const ta = a.addedAt?.toMillis() ?? 0;
        const tb = b.addedAt?.toMillis() ?? 0;
        return tb - ta;
      });

      setItems(loaded);
    } catch (err) {
      console.error("[FoodCart] refresh error:", err);
    }
  }, [user, db]);

  // ════════════════════════════════════════════════════════════════════════
  // CONTEXT VALUES
  // ════════════════════════════════════════════════════════════════════════

  const stateValue = useMemo<FoodCartStateContextType>(
    () => ({
      currentRestaurant,
      items,
      itemCount,
      totals,
      isLoading,
      isInitialized,
    }),
    [currentRestaurant, items, itemCount, totals, isLoading, isInitialized],
  );

  const actionsValue = useMemo<FoodCartActionsContextType>(
    () => ({
      addItem,
      clearAndAddFromNewRestaurant,
      removeItem,
      updateQuantity,
      updateExtras,
      updateNotes,
      clearCart,
      refresh,
    }),
    [
      addItem,
      clearAndAddFromNewRestaurant,
      removeItem,
      updateQuantity,
      updateExtras,
      updateNotes,
      clearCart,
      refresh,
    ],
  );

  const combinedValue = useMemo<FoodCartContextType>(
    () => ({ ...stateValue, ...actionsValue }),
    [stateValue, actionsValue],
  );

  return (
    <FoodCartStateContext.Provider value={stateValue}>
      <FoodCartActionsContext.Provider value={actionsValue}>
        <FoodCartContext.Provider value={combinedValue}>
          {children}
        </FoodCartContext.Provider>
      </FoodCartActionsContext.Provider>
    </FoodCartStateContext.Provider>
  );
};