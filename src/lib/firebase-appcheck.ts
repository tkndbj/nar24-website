// src/lib/firebase-appcheck.ts
// Singleton App Check initialization - prevents multiple initialization errors

import type { FirebaseApp } from "firebase/app";
import type { AppCheck } from "firebase/app-check";

let _appCheck: AppCheck | null = null;
let _appCheckPromise: Promise<AppCheck | null> | null = null;
let _isInitialized = false;

/**
 * Initialize App Check singleton
 * Safe to call multiple times - will only initialize once
 */
export async function initializeAppCheckOnce(
  app: FirebaseApp
): Promise<AppCheck | null> {
  // Only run on client side
  if (typeof window === "undefined") return null;

  // Return cached instance if already initialized
  if (_isInitialized && _appCheck) return _appCheck;

  // Return pending promise if initialization is in progress
  if (_appCheckPromise) return _appCheckPromise;

  _appCheckPromise = (async () => {
    // Double-check after async boundary
    if (_isInitialized) return _appCheck;

    const { initializeAppCheck, ReCaptchaV3Provider } = await import(
      "firebase/app-check"
    );

    // Enable debug mode in development
    if (process.env.NODE_ENV === "development") {
      // @ts-expect-error - Debug token for development
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    try {
      _appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(
          process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!
        ),
        isTokenAutoRefreshEnabled: true,
      });
      _isInitialized = true;
    } catch (error) {
      // App Check might already be initialized by another module
      console.warn("App Check initialization:", error);
      _isInitialized = true;
    }

    return _appCheck;
  })();

  return _appCheckPromise;
}

/**
 * Get cached App Check instance (null if not initialized)
 */
export function getCachedAppCheck(): AppCheck | null {
  return _appCheck;
}

/**
 * Check if App Check has been initialized
 */
export function isAppCheckInitialized(): boolean {
  return _isInitialized;
}
