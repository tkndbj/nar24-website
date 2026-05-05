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
import { getFirebaseDb } from "@/lib/firebase-lazy";
import type { PrefetchedShop } from "@/types/MarketLayout";
import { trackReads } from "@/lib/firestore-read-tracker";

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
// HELPERS
// ============================================================================

function mapShopData(id: string, data: Record<string, unknown>): Shop {
  const coverImageUrlsRaw = data.coverImageUrls;
  const coverImageUrls =
    Array.isArray(coverImageUrlsRaw) && coverImageUrlsRaw.length > 0
      ? (coverImageUrlsRaw as string[])
      : undefined;

  return {
    id,
    name: data.name as string,
    description: data.description as string | undefined,
    logoUrl: (data.logoUrl || data.profileImageUrl) as string | undefined,
    profileImageUrl: data.profileImageUrl as string | undefined,
    coverImageUrl: data.coverImageUrl as string | undefined,
    coverImageUrls,
    averageRating: Number(data.averageRating) || 0,
    reviewCount: Number(data.reviewCount) || 0,
    productCount: Number(data.productCount) || 0,
    category: data.category as string | undefined,
    isVerified: Boolean(data.isVerified),
    ownerId: (data.ownerId as string) || "",
  };
}

/**
 * Parse the `shopSummaries` array embedded on `app_config/featured_shops`.
 * Mirrors the Flutter ShopWidgetProvider manifest path. Skips inactive
 * shops and malformed entries. Returns an empty array when the field is
 * missing or empty so callers can fall through to the legacy `shopIds`
 * path.
 */
function parseEmbeddedShops(raw: unknown): Shop[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: Shop[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const map = entry as Record<string, unknown>;
    const id = map.id;
    if (typeof id !== "string" || !id) continue;
    if (map.isActive === false) continue;
    if (!map.name) continue;
    out.push(mapShopData(id, map));
  }
  return out;
}

// ============================================================================
// HOOK
// ============================================================================

export function useShops(initialShops?: PrefetchedShop[] | null): UseShopsReturn {
  const hydrated = useMemo(() => {
    if (!initialShops || initialShops.length === 0) return null;
    return initialShops as Shop[];
  }, [initialShops]);

  const [state, setState] = useState<UseShopsState>({
    shops: hydrated || [],
    isLoading: !hydrated,
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
      const [db, { collection, doc, getDoc, getDocs, query, where, orderBy, limit }] =
        await Promise.all([getFirebaseDb(), import("firebase/firestore")]);

      const shops: Shop[] = [];

      // ========================================
      // 1. Try to get configured featured shops
      // ========================================
      try {
        const configRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC);
        const configSnap = await getDoc(configRef);
        trackReads("Shops:Config", 1);

        if (configSnap.exists()) {
          const config = configSnap.data();

          // ── Manifest fast path: embedded summaries written by the admin
          // panel at save time. 1 read total (this config doc) regardless
          // of how many shops are in the carousel. Falls back gracefully
          // when the field is absent (older config docs before the embed
          // rollout).
          const embedded = parseEmbeddedShops(config.shopSummaries);
          if (embedded.length > 0) {
            console.log(`[useShops] Loaded ${embedded.length} featured shops from manifest`);
            safeSetState({ shops: embedded, isLoading: false, error: null });
            return;
          }

          // ── Legacy fallback: fetch each shop by ID. Used until the admin
          // saves the config once with the new manifest writer.
          const shopIds = config.shopIds as string[] | undefined;

          if (shopIds && shopIds.length > 0) {
            for (const id of shopIds) {
              try {
                const shopRef = doc(db, COLLECTION_NAME, id);
                const shopSnap = await getDoc(shopRef);
                trackReads("Shops:ShopDoc", 1);

                if (shopSnap.exists()) {
                  const data = shopSnap.data();
                  if (data.isActive === false) continue;
                  if (!data.name) continue;
                  shops.push(mapShopData(shopSnap.id, data));
                }
              } catch (e) {
                console.error(`[useShops] Error fetching shop ${id}:`, e);
              }
            }

            if (shops.length > 0) {
              console.log(`[useShops] Loaded ${shops.length} configured featured shops (legacy path)`);
              safeSetState({ shops, isLoading: false, error: null });
              return;
            }
          }
        }
      } catch (configError) {
        console.error("[useShops] Error reading config:", configError);
      }

      // ========================================
      // 2. Fallback: fetch newest active shops (matches Flutter)
      // ========================================
      console.log("[useShops] No featured config, using fallback query");

      const shopsQuery = query(
        collection(db, COLLECTION_NAME),
        where("isActive", "==", true),
        orderBy("createdAt", "desc"),
        limit(SHOPS_LIMIT)
      );

      const snapshot = await getDocs(shopsQuery);
      trackReads("Shops:Fallback", snapshot.docs.length || 1);

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (!data.name) return;
        shops.push(mapShopData(doc.id, data));
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
    // Skip client fetch if we have server-prefetched data
    if (state.shops.length > 0 && !state.isLoading) return;

    isMountedRef.current = true;
    setupSubscription();

    return () => {
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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