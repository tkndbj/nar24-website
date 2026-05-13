"use client";

// src/context/CategoryCacheProvider.tsx
//
// Web mirror of `CategoryCacheService` from the Flutter app. Loads the dynamic
// category structure from Firestore exactly once per cold visit, then caches it
// in localStorage so subsequent app loads use the cached copy (zero reads
// unless the admin published a new version).
//
// Read-cost contract (must stay aligned with the Flutter app):
//   - Cold visit, no local cache:      2 reads (meta + structure)
//   - Cold visit, fresh local cache:   1 read  (meta only, version matches)
//   - Warm reload (in-memory already): 0 reads
//
// Concurrent callers (e.g. layout warm-up + a screen's own effect) share a
// single in-flight Promise, so we never trigger duplicate fetches.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { doc, getDoc, type Firestore } from "firebase/firestore";
import { CategoryStructure } from "@/models/CategoryStructure";

const VERSION_KEY = "category_version";
const DATA_KEY = "category_data";

interface CategoryCacheContextValue {
  structure: CategoryStructure | null;
  isLoaded: boolean;
  initialize: () => Promise<void>;
}

const CategoryCacheContext = createContext<CategoryCacheContextValue | null>(null);

interface CategoryCacheProviderProps {
  children: ReactNode;
  db: Firestore | null;
}

export const CategoryCacheProvider: React.FC<CategoryCacheProviderProps> = ({
  children,
  db,
}) => {
  const [structure, setStructure] = useState<CategoryStructure | null>(null);

  // Tracks an in-flight load so concurrent initialize() calls join the same
  // promise instead of triggering a second Firestore fetch.
  const inFlightRef = useRef<Promise<void> | null>(null);

  const loadFromLocalStorage = useCallback((): CategoryStructure | null => {
    if (typeof window === "undefined") return null;
    try {
      const cached = window.localStorage.getItem(DATA_KEY);
      if (!cached) return null;
      return CategoryStructure.fromJson(JSON.parse(cached));
    } catch (err) {
      console.warn("CategoryCacheProvider: corrupt cache, ignoring:", err);
      return null;
    }
  }, []);

  const persistToLocalStorage = useCallback(
    (data: Record<string, unknown>, version: string | null) => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(DATA_KEY, JSON.stringify(data));
        if (version !== null) {
          window.localStorage.setItem(VERSION_KEY, version);
        }
      } catch (err) {
        // Out of quota or denied — tolerable, we just won't have a warm cache
        // next visit. Don't fail the load.
        console.warn("CategoryCacheProvider: failed to persist cache:", err);
      }
    },
    [],
  );

  const doInitialize = useCallback(async (): Promise<void> => {
    if (!db) return; // Firebase not ready yet; the effect will re-run when db arrives.
    if (typeof window === "undefined") return; // SSR — wait for client.

    const localVersion = window.localStorage.getItem(VERSION_KEY);

    try {
      // Read 1: meta document (cheap version check)
      const metaSnap = await getDoc(doc(db, "categories", "meta"));
      const remoteVersion =
        (metaSnap.data()?.version as string | undefined) ?? null;

      if (remoteVersion !== null && remoteVersion === localVersion) {
        // Version matches → use local cache; zero extra reads
        const cached = loadFromLocalStorage();
        if (cached) {
          setStructure(cached);
          return;
        }
      }

      // Read 2: full structure (only on version mismatch or missing/corrupt cache)
      const structSnap = await getDoc(doc(db, "categories", "structure"));
      if (structSnap.exists()) {
        const data = structSnap.data() as Record<string, unknown>;
        persistToLocalStorage(data, remoteVersion ?? "");
        setStructure(CategoryStructure.fromJson(data));
        return;
      }

      // Document missing — fall through to whatever local copy we have.
      const cached = loadFromLocalStorage();
      if (cached) setStructure(cached);
    } catch (err) {
      console.warn("CategoryCacheProvider: Firestore error, using cache:", err);
      const cached = loadFromLocalStorage();
      if (cached) setStructure(cached);
    }
  }, [db, loadFromLocalStorage, persistToLocalStorage]);

  const initialize = useCallback((): Promise<void> => {
    if (structure !== null) return Promise.resolve(); // Already loaded in memory
    if (inFlightRef.current) return inFlightRef.current;
    inFlightRef.current = doInitialize().finally(() => {
      inFlightRef.current = null;
    });
    return inFlightRef.current;
  }, [structure, doInitialize]);

  // Warm the cache on first mount (and when db becomes available).
  useEffect(() => {
    initialize();
  }, [initialize]);

  const value = useMemo<CategoryCacheContextValue>(
    () => ({
      structure,
      isLoaded: structure !== null,
      initialize,
    }),
    [structure, initialize],
  );

  return (
    <CategoryCacheContext.Provider value={value}>
      {children}
    </CategoryCacheContext.Provider>
  );
};

/**
 * Reactively read the cached category structure. Components re-render when the
 * structure finishes loading. Returns `null` while the first load is in flight.
 */
export function useCategoryStructure(): CategoryStructure | null {
  const ctx = useContext(CategoryCacheContext);
  if (!ctx) {
    throw new Error(
      "useCategoryStructure must be used inside <CategoryCacheProvider>",
    );
  }
  return ctx.structure;
}

/**
 * Full context access (structure + initialize trigger). Most consumers want
 * `useCategoryStructure()` instead.
 */
export function useCategoryCache(): CategoryCacheContextValue {
  const ctx = useContext(CategoryCacheContext);
  if (!ctx) {
    throw new Error(
      "useCategoryCache must be used inside <CategoryCacheProvider>",
    );
  }
  return ctx;
}
