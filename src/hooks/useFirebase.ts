// src/hooks/useFirebase.ts
// React hook for lazy Firebase access with loading states

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";
import type { Functions } from "firebase/functions";
import {
  getFirebaseAuth,
  getFirebaseDb,
  getFirebaseStorage,
  getCachedAuth,
  getCachedDb,
  getCachedStorage,
  getCachedFunctions,
  preloadFirebase,
} from "@/lib/firebase-lazy";

interface FirebaseServices {
  auth: Auth | null;
  db: Firestore | null;
  storage: FirebaseStorage | null;
  functions: Functions | null;
  isLoading: boolean;
  isReady: boolean;
  error: Error | null;
}

/**
 * Hook to access Firebase services with lazy loading
 * Services are loaded only when this hook is first used
 */
export function useFirebase(): FirebaseServices {
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [services, setServices] = useState<{
    auth: Auth | null;
    db: Firestore | null;
    storage: FirebaseStorage | null;
    functions: Functions | null;
  }>({
    auth: getCachedAuth(),
    db: getCachedDb(),
    storage: getCachedStorage(),
    functions: getCachedFunctions(),
  });

  const initStarted = useRef(false);

  useEffect(() => {
    // Skip if already initialized or initialization in progress
    if (initStarted.current) return;
    initStarted.current = true;

    // Check if already cached
    const cachedAuth = getCachedAuth();
    const cachedDb = getCachedDb();

    if (cachedAuth && cachedDb) {
      setServices({
        auth: cachedAuth,
        db: cachedDb,
        storage: getCachedStorage(),
        functions: getCachedFunctions(),
      });
      setIsLoading(false);
      setIsReady(true);
      return;
    }

    // Initialize Firebase services
    const initFirebase = async () => {
      try {
        // Load auth and db in parallel (most commonly needed)
        const [auth, db] = await Promise.all([
          getFirebaseAuth(),
          getFirebaseDb(),
        ]);

        setServices({
          auth,
          db,
          storage: getCachedStorage(),
          functions: getCachedFunctions(),
        });
        setIsReady(true);
      } catch (err) {
        console.error("Failed to initialize Firebase:", err);
        setError(err instanceof Error ? err : new Error("Firebase init failed"));
      } finally {
        setIsLoading(false);
      }
    };

    initFirebase();
  }, []);

  return {
    ...services,
    isLoading,
    isReady,
    error,
  };
}

/**
 * Hook to get Firebase Auth only (lighter weight)
 */
export function useFirebaseAuth() {
  const [auth, setAuth] = useState<Auth | null>(getCachedAuth());
  const [isLoading, setIsLoading] = useState(!getCachedAuth());
  const initStarted = useRef(false);

  useEffect(() => {
    if (auth || initStarted.current) return;
    initStarted.current = true;

    getFirebaseAuth()
      .then(setAuth)
      .finally(() => setIsLoading(false));
  }, [auth]);

  return { auth, isLoading };
}

/**
 * Hook to get Firestore only (lighter weight)
 */
export function useFirebaseDb() {
  const [db, setDb] = useState<Firestore | null>(getCachedDb());
  const [isLoading, setIsLoading] = useState(!getCachedDb());
  const initStarted = useRef(false);

  useEffect(() => {
    if (db || initStarted.current) return;
    initStarted.current = true;

    getFirebaseDb()
      .then(setDb)
      .finally(() => setIsLoading(false));
  }, [db]);

  return { db, isLoading };
}

/**
 * Hook to get Firebase Storage only
 */
export function useFirebaseStorage() {
  const [storage, setStorage] = useState<FirebaseStorage | null>(getCachedStorage());
  const [isLoading, setIsLoading] = useState(!getCachedStorage());
  const initStarted = useRef(false);

  useEffect(() => {
    if (storage || initStarted.current) return;
    initStarted.current = true;

    getFirebaseStorage()
      .then(setStorage)
      .finally(() => setIsLoading(false));
  }, [storage]);

  return { storage, isLoading };
}

/**
 * Hook to preload Firebase on user interaction
 * Use this on buttons/links that will need Firebase
 */
export function useFirebasePreload() {
  const preload = useCallback(() => {
    preloadFirebase();
  }, []);

  return { preload };
}
