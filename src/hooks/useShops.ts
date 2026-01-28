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
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
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
  coverImageUrls?: string[]; // Added: array of cover images (Flutter primary field)
  profileImageUrl?: string;  // Added: Flutter's profile image field
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

const CONFIG_COLLECTION = "app_config";      // ADD
const CONFIG_DOC = "featured_shops"; 

// ============================================================================
// HOOK
// ============================================================================

export function useShops(): UseShopsReturn {
  const [state, setState] = useState<UseShopsState>({
    shops: [],
    isLoading: true,
    error: null,
  });

  const isMountedRef = useRef(true);

  const safeSetState = useCallback((updater: Partial<UseShopsState>) => {
    if (!isMountedRef.current) return;
    setState((prev) => ({ ...prev, ...updater }));
  }, []);

  const setupSubscription = useCallback(async () => {
    safeSetState({ isLoading: true, error: null });
  
    try {
      const shops: Shop[] = [];
  
      // ========================================
      // 1. Try to get configured featured shops
      // ========================================
      try {
        const configRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC);
        const configSnap = await getDoc(configRef);
  
        if (configSnap.exists()) {
          const config = configSnap.data();
          const shopIds = config.shopIds as string[] | undefined;
  
          if (shopIds && shopIds.length > 0) {
            // Fetch each shop in order
            for (const id of shopIds) {
              try {
                const shopRef = doc(db, COLLECTION_NAME, id);
                const shopSnap = await getDoc(shopRef);
  
                if (shopSnap.exists()) {
                  const data = shopSnap.data();
                  
                  // Skip inactive shops
                  if (data.isActive === false) continue;
                  if (!data.name) continue;
  
                  // Parse coverImageUrls - matches Flutter logic
                  let coverImageUrls: string[] | undefined;
                  if (Array.isArray(data.coverImageUrls) && data.coverImageUrls.length > 0) {
                    coverImageUrls = data.coverImageUrls;
                  }
  
                  shops.push({
                    id: shopSnap.id,
                    name: data.name,
                    description: data.description,
                    logoUrl: data.logoUrl || data.profileImageUrl,
                    profileImageUrl: data.profileImageUrl,
                    coverImageUrl: data.coverImageUrl,
                    coverImageUrls: coverImageUrls,
                    averageRating: Number(data.averageRating) || 0,
                    reviewCount: Number(data.reviewCount) || 0,
                    productCount: Number(data.productCount) || 0,
                    category: data.category,
                    isVerified: Boolean(data.isVerified),
                    ownerId: data.ownerId || "",
                  });
                }
              } catch (e) {
                console.error(`[useShops] Error fetching shop ${id}:`, e);
              }
            }
  
            if (shops.length > 0) {
              console.log(`[useShops] Loaded ${shops.length} configured featured shops`);
              safeSetState({ shops, isLoading: false, error: null });
              return;
            }
          }
        }
      } catch (configError) {
        console.error("[useShops] Error reading config:", configError);
      }
  
      // ========================================
      // 2. Fallback: fetch top-rated shops
      // ========================================
      console.log("[useShops] No featured config, using fallback query");
      
      const shopsQuery = query(
        collection(db, COLLECTION_NAME),
        where("isActive", "==", true),
        orderBy("averageRating", "desc"),
        limit(SHOPS_LIMIT)
      );
  
      const snapshot = await getDocs(shopsQuery);
  
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (!data.name) return;
  
        let coverImageUrls: string[] | undefined;
        if (Array.isArray(data.coverImageUrls) && data.coverImageUrls.length > 0) {
          coverImageUrls = data.coverImageUrls;
        }
  
        shops.push({
          id: doc.id,
          name: data.name,
          description: data.description,
          logoUrl: data.logoUrl || data.profileImageUrl,
          profileImageUrl: data.profileImageUrl,
          coverImageUrl: data.coverImageUrl,
          coverImageUrls: coverImageUrls,
          averageRating: Number(data.averageRating) || 0,
          reviewCount: Number(data.reviewCount) || 0,
          productCount: Number(data.productCount) || 0,
          category: data.category,
          isVerified: Boolean(data.isVerified),
          ownerId: data.ownerId || "",
        });
      });
  
      safeSetState({ shops, isLoading: false, error: null });
  
    } catch (error) {
      console.error("[useShops] Setup error:", error);
      safeSetState({
        shops: [],
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