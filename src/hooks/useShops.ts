/**
 * useShops Hook
 *
 * Fetches and manages featured shops - mirrors Flutter's ShopWidgetProvider.
 *
 * Features:
 * - Real-time Firestore sync
 * - Loading state management
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

export interface Shop {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  averageRating: number;
  reviewCount: number;
  productCount: number;
  category?: string;
  isVerified: boolean;
  ownerId: string;
}

interface UseShopsState {
  shops: Shop[];
  isLoading: boolean;
  error: string | null;
}

interface UseShopsReturn extends UseShopsState {
  refresh: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SHOPS_LIMIT = 10;
const COLLECTION_NAME = "shops";

// ============================================================================
// HOOK
// ============================================================================

export function useShops(): UseShopsReturn {
  const [state, setState] = useState<UseShopsState>({
    shops: [],
    isLoading: true,
    error: null,
  });

  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const isMountedRef = useRef(true);

  const safeSetState = useCallback((updater: Partial<UseShopsState>) => {
    if (!isMountedRef.current) return;
    setState((prev) => ({ ...prev, ...updater }));
  }, []);

  const setupSubscription = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    safeSetState({ isLoading: true, error: null });

    try {
      // Query for featured/active shops
      const shopsQuery = query(
        collection(db, COLLECTION_NAME),
        where("isActive", "==", true),
        orderBy("averageRating", "desc"),
        limit(SHOPS_LIMIT)
      );

      const unsubscribe = onSnapshot(
        shopsQuery,
        (snapshot) => {
          if (!isMountedRef.current) return;

          const shops: Shop[] = [];

          snapshot.docs.forEach((doc) => {
            const data = doc.data();

            if (!data.name) return;

            shops.push({
              id: doc.id,
              name: data.name,
              description: data.description,
              logoUrl: data.logoUrl || data.profileImageUrl,
              coverImageUrl: data.coverImageUrl,
              averageRating: Number(data.averageRating) || 0,
              reviewCount: Number(data.reviewCount) || 0,
              productCount: Number(data.productCount) || 0,
              category: data.category,
              isVerified: Boolean(data.isVerified),
              ownerId: data.ownerId || "",
            });
          });

          safeSetState({
            shops,
            isLoading: false,
            error: null,
          });
        },
        (error) => {
          console.error("[useShops] Firestore error:", error);
          safeSetState({
            isLoading: false,
            error: "Failed to load shops",
          });
        }
      );

      unsubscribeRef.current = unsubscribe;
    } catch (error) {
      console.error("[useShops] Setup error:", error);
      safeSetState({
        isLoading: false,
        error: "Failed to connect to shops service",
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

export default useShops;