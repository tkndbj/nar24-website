/**
 * useBoostedProducts Hook
 *
 * Fetches and manages boosted products - mirrors Flutter's BoostedRotationProvider.
 *
 * Features:
 * - Real-time Firestore sync
 * - Rotation/refresh support
 * - Loading and error states
 * - Proper cleanup
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ============================================================================
// TYPES
// ============================================================================

export interface BoostedProduct {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  currency: string;
  imageUrl: string;
  shopId: string;
  shopName?: string;
  isBoosted: boolean;
  boostExpiresAt?: Date;
  category?: string;
  subcategory?: string;
  rating?: number;
  reviewCount?: number;
}

interface UseBoostedProductsState {
  boostedProducts: BoostedProduct[];
  isLoading: boolean;
  error: string | null;
  hasProducts: boolean;
  totalBoosted: number;
}

interface UseBoostedProductsReturn extends UseBoostedProductsState {
  refresh: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PRODUCTS_LIMIT = 10; // Match Flutter's rotation provider limit
const COLLECTION_NAME = "products";

// ============================================================================
// HOOK
// ============================================================================

export function useBoostedProducts(): UseBoostedProductsReturn {
  const [state, setState] = useState<UseBoostedProductsState>({
    boostedProducts: [],
    isLoading: true,
    error: null,
    hasProducts: false,
    totalBoosted: 0,
  });

  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const isMountedRef = useRef(true);

  const safeSetState = useCallback(
    (updater: Partial<UseBoostedProductsState>) => {
      if (!isMountedRef.current) return;
      setState((prev) => ({ ...prev, ...updater }));
    },
    []
  );

  const setupSubscription = useCallback(() => {
    // Cleanup existing
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    safeSetState({ isLoading: true, error: null });

    try {
      // Query for boosted products
      // Matches Flutter: products where isBoosted == true, ordered by boostStartedAt
      const boostedQuery = query(
        collection(db, COLLECTION_NAME),
        where("isBoosted", "==", true),
        where("isActive", "==", true),
        orderBy("boostStartedAt", "desc"),
        limit(PRODUCTS_LIMIT)
      );

      const unsubscribe = onSnapshot(
        boostedQuery,
        (snapshot) => {
          if (!isMountedRef.current) return;

          const products: BoostedProduct[] = [];

          snapshot.docs.forEach((doc) => {
            const data = doc.data();

            // Validate required fields
            if (!data.name || !data.price) return;

            products.push({
              id: doc.id,
              name: data.name,
              price: Number(data.price) || 0,
              originalPrice: data.originalPrice
                ? Number(data.originalPrice)
                : undefined,
              currency: data.currency || "TRY",
              imageUrl: data.imageUrl || data.images?.[0] || "",
              shopId: data.shopId || "",
              shopName: data.shopName,
              isBoosted: true,
              boostExpiresAt: data.boostExpiresAt?.toDate?.(),
              category: data.category,
              subcategory: data.subcategory,
              rating: data.rating ? Number(data.rating) : undefined,
              reviewCount: data.reviewCount
                ? Number(data.reviewCount)
                : undefined,
            });
          });

          safeSetState({
            boostedProducts: products,
            isLoading: false,
            error: null,
            hasProducts: products.length > 0,
            totalBoosted: snapshot.size, // This gives us the count from this query
          });
        },
        (error) => {
          console.error("[useBoostedProducts] Firestore error:", error);
          safeSetState({
            isLoading: false,
            error: "Failed to load boosted products",
          });
        }
      );

      unsubscribeRef.current = unsubscribe;
    } catch (error) {
      console.error("[useBoostedProducts] Setup error:", error);
      safeSetState({
        isLoading: false,
        error: "Failed to connect to products service",
      });
    }
  }, [safeSetState]);

  const refresh = useCallback(() => {
    setupSubscription();
  }, [setupSubscription]);

  useEffect(() => {
    isMountedRef.current = true;
    setupSubscription();

    return () => {
      isMountedRef.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [setupSubscription]);

  return useMemo(
    () => ({
      ...state,
      refresh,
    }),
    [state, refresh]
  );
}

export default useBoostedProducts;