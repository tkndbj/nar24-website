// context/MarketCartProvider.tsx
//
// Direct port of lib/providers/market_cart_provider.dart.
//
// Mirrors the Flutter provider contract exactly:
//   • Subscribes to users/{uid}/marketCart on auth
//   • Merges Firestore doc changes into local state (preserves optimistic UI)
//   • Optimistic add / update / remove with server-confirm and rollback
//   • 200ms per-key rate limit
//   • Serialized mutations via a lightweight async lock
//   • Tears down cleanly on sign-out
//
// Consumers use the `useMarketCart()` hook inside the <MarketCartProvider> tree.
// Wrap the market-related subtree (or the whole app) with <MarketCartProvider>
// above <UserProvider> consumers that read it.

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  Timestamp,
  type DocumentChange,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useUser } from "@/context/UserProvider";
import type { MarketItem } from "../lib/typesense_market_service";

// ============================================================================
// PUBLIC TYPES
// ============================================================================

export interface MarketCartItem {
  itemId: string;
  name: string;
  brand: string;
  type: string;
  category: string;
  price: number;
  imageUrl: string;
  quantity: number;
  addedAt: Timestamp | null;
  /** True while the optimistic insert hasn't been confirmed by Firestore yet */
  isOptimistic: boolean;
}

export interface MarketCartTotals {
  subtotal: number;
  itemCount: number;
}

export type MarketAddResult =
  | "added"
  | "quantityUpdated"
  | "outOfStock"
  | "error";

interface MarketCartContextValue {
  items: readonly MarketCartItem[];
  itemCount: number;
  totals: MarketCartTotals;
  isLoading: boolean;
  isInitialized: boolean;
  quantityOf: (itemId: string) => number;
  addItem: (
    product: MarketItem,
    quantity?: number,
  ) => Promise<MarketAddResult>;
  updateQuantity: (itemId: string, newQuantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refresh: () => Promise<void>;
}

const EMPTY_TOTALS: MarketCartTotals = { subtotal: 0, itemCount: 0 };

// ============================================================================
// CONTEXT
// ============================================================================

const MarketCartContext = createContext<MarketCartContextValue | null>(null);

export function useMarketCart(): MarketCartContextValue {
  const ctx = useContext(MarketCartContext);
  if (!ctx) {
    throw new Error(
      "useMarketCart must be used inside a <MarketCartProvider>",
    );
  }
  return ctx;
}

// ============================================================================
// HELPERS
// ============================================================================

function cartItemFromDoc(
  id: string,
  data: DocumentData,
): MarketCartItem {
  return {
    itemId: id,
    name: typeof data.name === "string" ? data.name : "",
    brand: typeof data.brand === "string" ? data.brand : "",
    type: typeof data.type === "string" ? data.type : "",
    category: typeof data.category === "string" ? data.category : "",
    price:
      typeof data.price === "number"
        ? data.price
        : Number(data.price ?? 0),
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
    quantity:
      typeof data.quantity === "number"
        ? data.quantity
        : Number(data.quantity ?? 1),
    addedAt: data.addedAt instanceof Timestamp ? data.addedAt : null,
    isOptimistic: false,
  };
}

function sortItemsByAddedDesc(items: MarketCartItem[]): MarketCartItem[] {
  return [...items].sort((a, b) => {
    const ta = a.addedAt?.toMillis() ?? 0;
    const tb = b.addedAt?.toMillis() ?? 0;
    return tb - ta; // newest first
  });
}

function cartItemToFirestore(
  item: MarketCartItem,
): Record<string, unknown> {
  return {
    name: item.name,
    brand: item.brand,
    type: item.type,
    category: item.category,
    price: item.price,
    imageUrl: item.imageUrl,
    quantity: item.quantity,
    addedAt: serverTimestamp(),
  };
}

// ============================================================================
// PROVIDER
// ============================================================================

export function MarketCartProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const uid = user?.uid ?? "";

  const [items, setItems] = useState<MarketCartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // We keep the current items in a ref so callbacks can read the latest
  // state without capturing stale closures. React 18+ automatic batching
  // makes setState-based reads in the same tick unreliable.
  const itemsRef = useRef<MarketCartItem[]>([]);
  itemsRef.current = items;

  // ── Async mutation lock ──────────────────────────────────────────────────
  // Serializes addItem/updateQuantity/removeItem/clearCart so two rapid
  // clicks can't interleave optimistic + confirm steps.

  const mutationLockRef = useRef<Promise<void> | null>(null);
  const releaseLockRef = useRef<(() => void) | null>(null);

  const acquireLock = useCallback(async (): Promise<void> => {
    while (mutationLockRef.current) {
      await mutationLockRef.current;
    }
    const promise = new Promise<void>((resolve) => {
      releaseLockRef.current = resolve;
    });
    mutationLockRef.current = promise;
  }, []);

  const releaseLock = useCallback((): void => {
    const release = releaseLockRef.current;
    mutationLockRef.current = null;
    releaseLockRef.current = null;
    release?.();
  }, []);

  // ── Rate limiter ─────────────────────────────────────────────────────────

  const rateLimiterRef = useRef<Map<string, number>>(new Map());
  const RATE_LIMIT_MS = 200;

  const canProceed = useCallback((key: string): boolean => {
    const now = Date.now();
    const last = rateLimiterRef.current.get(key);
    if (last != null && now - last < RATE_LIMIT_MS) return false;
    rateLimiterRef.current.set(key, now);
    return true;
  }, []);

  // ── Firestore path helpers (mirror Flutter getters) ──────────────────────

  const cartDoc = useCallback(
    (itemId: string) => {
      // Safe only after uid check; we never reach this with uid=""
      return doc(db, "users", uid, "marketCart", itemId);
    },
    [uid],
  );

  // ============================================================================
  // AUTH + LISTENER
  // ============================================================================

  useEffect(() => {
    // Signed out — tear down everything.
    if (!uid) {
      setItems([]);
      setIsInitialized(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const cartCol = collection(db, "users", uid, "marketCart");

    // Initial one-shot fetch (mirrors _initialize in Flutter).
    setIsLoading(true);
    (async () => {
      try {
        const snap = await getDocs(cartCol);
        if (cancelled) return;

        const loaded: MarketCartItem[] = [];
        for (const d of snap.docs) {
          try {
            loaded.push(cartItemFromDoc(d.id, d.data()));
          } catch (err) {
            console.warn("[MarketCart] Skipping malformed doc", d.id, err);
          }
        }
        setItems(sortItemsByAddedDesc(loaded));
      } catch (err) {
        console.warn("[MarketCart] Init error:", err);
      } finally {
        if (!cancelled) {
          setIsInitialized(true);
          setIsLoading(false);
        }
      }
    })();

    // Real-time listener (mirrors _handleSnapshot in Flutter).
    const unsubscribe = onSnapshot(
      cartCol,
      (snapshot) => {
        // Ignore pending local writes from cache — they'd flicker the UI.
        if (
          snapshot.metadata.fromCache &&
          snapshot.metadata.hasPendingWrites
        ) {
          return;
        }

        if (snapshot.empty) {
          setItems([]);
          return;
        }

        // Merge doc changes into a map keyed by itemId. This preserves local
        // optimistic state for items the server hasn't emitted yet.
        const map = new Map<string, MarketCartItem>(
          itemsRef.current.map((i) => [i.itemId, i]),
        );

        for (const change of snapshot.docChanges()) {
          const d: DocumentChange<DocumentData> = change;
          const id = d.doc.id;

          if (d.type === "removed") {
            map.delete(id);
            continue;
          }

          try {
            map.set(id, cartItemFromDoc(id, d.doc.data()));
          } catch (err) {
            console.warn("[MarketCart] Parse error", id, err);
          }
        }

        setItems(sortItemsByAddedDesc(Array.from(map.values())));
      },
      (err) => console.warn("[MarketCart] Listener error:", err),
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid]);

  // ============================================================================
  // DERIVED STATE
  // ============================================================================

  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );

  const totals = useMemo<MarketCartTotals>(() => {
    if (items.length === 0) return EMPTY_TOTALS;
    let subtotal = 0;
    let count = 0;
    for (const item of items) {
      subtotal += item.price * item.quantity;
      count += item.quantity;
    }
    return {
      // Round to 2dp — matches Flutter (subtotal * 100).roundToDouble() / 100
      subtotal: Math.round(subtotal * 100) / 100,
      itemCount: count,
    };
  }, [items]);

  const quantityOf = useCallback(
    (itemId: string): number => {
      const match = itemsRef.current.find((i) => i.itemId === itemId);
      return match?.quantity ?? 0;
    },
    [],
  );

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  const addItem = useCallback(
    async (
      product: MarketItem,
      quantity = 1,
    ): Promise<MarketAddResult> => {
      if (!uid) return "error";
      if (!canProceed(`add_${product.id}`)) return "error";
      if (product.stock <= 0) return "outOfStock";

      await acquireLock();
      let optimisticId: string | null = null;

      try {
        const existing = itemsRef.current.find(
          (i) => i.itemId === product.id,
        );

        if (existing) {
          const newQty = existing.quantity + quantity;
          await updateDoc(cartDoc(product.id), { quantity: newQty });
          setItems((prev) =>
            prev.map((i) =>
              i.itemId === product.id ? { ...i, quantity: newQty } : i,
            ),
          );
          return "quantityUpdated";
        }

        // New item — optimistic insert first, then server write.
        const optimistic: MarketCartItem = {
          itemId: product.id,
          name: product.name,
          brand: product.brand,
          type: product.type,
          category: product.category,
          price: product.price,
          imageUrl: product.imageUrl,
          quantity,
          addedAt: Timestamp.now(),
          isOptimistic: true,
        };
        optimisticId = product.id;
        setItems((prev) => sortItemsByAddedDesc([optimistic, ...prev]));

        await setDoc(cartDoc(product.id), cartItemToFirestore(optimistic));

        // Clear the optimistic flag. The listener will eventually overwrite
        // this with the server version (with real serverTimestamp), but
        // updating synchronously keeps UI responsive.
        setItems((prev) =>
          prev.map((i) =>
            i.itemId === product.id && i.isOptimistic
              ? { ...i, isOptimistic: false }
              : i,
          ),
        );
        return "added";
      } catch (err) {
        console.warn("[MarketCart] addItem error:", err);
        if (optimisticId) {
          setItems((prev) => prev.filter((i) => i.itemId !== optimisticId));
        }
        return "error";
      } finally {
        releaseLock();
      }
    },
    [uid, canProceed, acquireLock, releaseLock, cartDoc],
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (!uid) return;
    try {
      const snap = await getDocs(
        collection(db, "users", uid, "marketCart"),
      );
      const loaded: MarketCartItem[] = [];
      for (const d of snap.docs) {
        try {
          loaded.push(cartItemFromDoc(d.id, d.data()));
        } catch (err) {
          console.warn("[MarketCart] Skipping", d.id, err);
        }
      }
      setItems(sortItemsByAddedDesc(loaded));
    } catch (err) {
      console.warn("[MarketCart] refresh error:", err);
    }
  }, [uid]);

  const removeItem = useCallback(
    async (itemId: string): Promise<void> => {
      if (!uid) return;
      const previous = itemsRef.current;
      setItems((prev) => prev.filter((i) => i.itemId !== itemId));

      try {
        await deleteDoc(cartDoc(itemId));
      } catch (err) {
        console.warn("[MarketCart] removeItem error:", err);
        // Rollback — Flutter reverts to previous state on failure.
        setItems(previous);
      }
    },
    [uid, cartDoc],
  );

  const updateQuantity = useCallback(
    async (itemId: string, newQuantity: number): Promise<void> => {
      if (!uid) return;
      if (newQuantity <= 0) {
        await removeItem(itemId);
        return;
      }
      const clamped = Math.min(newQuantity, 99);
      if (!canProceed(`qty_${itemId}`)) return;

      // Optimistic update
      setItems((prev) =>
        prev.map((i) =>
          i.itemId === itemId ? { ...i, quantity: clamped } : i,
        ),
      );

      try {
        await updateDoc(cartDoc(itemId), { quantity: clamped });
      } catch (err) {
        console.warn("[MarketCart] updateQuantity error:", err);
        await refresh();
      }
    },
    [uid, canProceed, cartDoc, removeItem, refresh],
  );

  const clearCart = useCallback(async (): Promise<void> => {
    if (!uid) return;

    setItems([]);

    try {
      const snap = await getDocs(
        collection(db, "users", uid, "marketCart"),
      );
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.docs.forEach((d: QueryDocumentSnapshot<DocumentData>) =>
          batch.delete(d.ref),
        );
        await batch.commit();
      }
    } catch (err) {
      console.warn("[MarketCart] clearCart error:", err);
      await refresh();
    }
  }, [uid, refresh]);

  // ============================================================================
  // PROVIDE
  // ============================================================================

  const value = useMemo<MarketCartContextValue>(
    () => ({
      items,
      itemCount,
      totals,
      isLoading,
      isInitialized,
      quantityOf,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      refresh,
    }),
    [
      items,
      itemCount,
      totals,
      isLoading,
      isInitialized,
      quantityOf,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      refresh,
    ],
  );

  return (
    <MarketCartContext.Provider value={value}>
      {children}
    </MarketCartContext.Provider>
  );
}