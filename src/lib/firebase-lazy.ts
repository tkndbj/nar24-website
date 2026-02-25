// src/lib/firebase-lazy.ts
// Production-grade lazy Firebase initialization
// Firebase modules are loaded only when first accessed

import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";
import type { Functions } from "firebase/functions";
import type { AppCheck } from "firebase/app-check";
import {
  initializeAppCheckOnce,
  getCachedAppCheck,
} from "./firebase-appcheck";

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID!,
};

// Singleton instances - cached after first initialization
let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;
let _functions: Functions | null = null;

// Initialization promises to prevent race conditions
let _appPromise: Promise<FirebaseApp> | null = null;
let _authPromise: Promise<Auth> | null = null;
let _dbPromise: Promise<Firestore> | null = null;
let _storagePromise: Promise<FirebaseStorage> | null = null;
let _functionsPromise: Promise<Functions> | null = null;

// Re-export App Check getter from shared module
export { getCachedAppCheck };

// App Check readiness promise — resolved once a token is available (or timed out)
let _appCheckReady: Promise<void> | null = null;
const APP_CHECK_TIMEOUT_MS = 3000;

/**
 * Get or initialize the Firebase App instance
 * This is the core initialization - all other services depend on this
 * Also kicks off App Check immediately so the token is ready ASAP.
 */
export async function getFirebaseApp(): Promise<FirebaseApp> {
  if (_app) return _app;

  if (!_appPromise) {
    _appPromise = (async () => {
      const { initializeApp, getApps } = await import("firebase/app");
      _app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

      // Start App Check as early as possible (non-blocking)
      if (typeof window !== "undefined") {
        initializeAppCheckOnce(_app);
      }

      return _app;
    })();
  }

  return _appPromise;
}

/**
 * Get or initialize Firebase App Check
 * Only runs on client-side (returns null on server)
 */
export async function getFirebaseAppCheck(): Promise<AppCheck | null> {
  // App Check only works in browser
  if (typeof window === "undefined") return null;

  const app = await getFirebaseApp();
  return initializeAppCheckOnce(app);
}

/**
 * Wait for App Check to be ready, but only up to APP_CHECK_TIMEOUT_MS.
 * - Cached tokens resolve instantly
 * - Fresh tokens typically take 1-2s
 * - If reCAPTCHA is very slow, we proceed after the timeout
 */
function waitForAppCheck(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  if (!_appCheckReady) {
    _appCheckReady = Promise.race([
      getFirebaseAppCheck().then(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, APP_CHECK_TIMEOUT_MS)),
    ]);
  }

  return _appCheckReady;
}

/**
 * Get or initialize Firebase Auth
 * Waits for App Check (with timeout) so tokens are attached to requests.
 */
export async function getFirebaseAuth(): Promise<Auth> {
  if (_auth) return _auth;

  if (!_authPromise) {
    _authPromise = (async () => {
      const [app, { getAuth }] = await Promise.all([
        getFirebaseApp(),
        import("firebase/auth"),
        waitForAppCheck(),
      ]);
      _auth = getAuth(app);
      return _auth;
    })();
  }

  return _authPromise;
}

/**
 * Get or initialize Firestore
 * Waits for App Check (with timeout) so tokens are attached to requests.
 * Uses long polling auto-detection to handle blocked WebSockets.
 */
export async function getFirebaseDb(): Promise<Firestore> {
  if (_db) return _db;

  if (!_dbPromise) {
    _dbPromise = (async () => {
      const [app, { initializeFirestore, getFirestore }] = await Promise.all([
        getFirebaseApp(),
        import("firebase/firestore"),
        waitForAppCheck(),
      ]);
      try {
        _db = initializeFirestore(app, {
          experimentalAutoDetectLongPolling: true,
        });
      } catch {
        // Already initialized (e.g. by eager firebase.ts), get existing instance
        _db = getFirestore(app);
      }
      return _db;
    })();
  }

  return _dbPromise;
}

/**
 * Get or initialize Firebase Storage
 * Waits for App Check (with timeout) so tokens are attached to requests.
 */
export async function getFirebaseStorage(): Promise<FirebaseStorage> {
  if (_storage) return _storage;

  if (!_storagePromise) {
    _storagePromise = (async () => {
      const [app, { getStorage }] = await Promise.all([
        getFirebaseApp(),
        import("firebase/storage"),
        waitForAppCheck(),
      ]);
      _storage = getStorage(app);
      return _storage;
    })();
  }

  return _storagePromise;
}

/**
 * Get or initialize Firebase Functions
 * Waits for App Check (with timeout) so tokens are attached to requests.
 */
export async function getFirebaseFunctions(): Promise<Functions> {
  if (_functions) return _functions;

  if (!_functionsPromise) {
    _functionsPromise = (async () => {
      const [app, { getFunctions, connectFunctionsEmulator }] =
        await Promise.all([
          getFirebaseApp(),
          import("firebase/functions"),
          waitForAppCheck(),
        ]);
      _functions = getFunctions(app, "europe-west3");

      // Connect to emulator in development
      if (
        process.env.NODE_ENV === "development" &&
        typeof window !== "undefined"
      ) {
        try {
          connectFunctionsEmulator(_functions, "localhost", 5001);
        } catch {
          // Emulator already connected or not running
        }
      }

      return _functions;
    })();
  }

  return _functionsPromise;
}

/**
 * Preload all Firebase services in background
 * Call this when you know Firebase will be needed soon (e.g., on user interaction)
 */
export function preloadFirebase(): void {
  // Start loading App Check first, then other services in parallel
  // Don't await - just kick off the loading
  getFirebaseAppCheck();
  getFirebaseAuth();
  getFirebaseDb();
}

/**
 * Check if Firebase has been initialized
 * Useful for conditional rendering or logging
 */
export function isFirebaseInitialized(): boolean {
  return _app !== null;
}

/**
 * Get cached instances synchronously (returns null if not yet loaded)
 * Use these only when you're sure Firebase has been initialized
 * Note: getCachedAppCheck is imported from firebase-appcheck.ts
 */
export function getCachedAuth(): Auth | null {
  return _auth;
}

export function getCachedDb(): Firestore | null {
  return _db;
}

export function getCachedStorage(): FirebaseStorage | null {
  return _storage;
}

export function getCachedFunctions(): Functions | null {
  return _functions;
}
