// src/lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID!,
};

// Avoid re-initializing
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize App Check (must be done before using other Firebase services)
let appCheck: AppCheck | null = null;
if (typeof window !== "undefined") {
  // Enable debug mode in development (set FIREBASE_APPCHECK_DEBUG_TOKEN in browser console)
  if (process.env.NODE_ENV === "development") {
    // @ts-expect-error - Debug token for development
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(
      process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!
    ),
    isTokenAutoRefreshEnabled: true,
  });
}

export { appCheck };
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize Functions with europe-west3 region
export const functions = getFunctions(app, "europe-west3");

// Connect to Functions emulator in development (optional)
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  // Only connect to emulator if not already connected
  try {
    connectFunctionsEmulator(functions, "localhost", 5001);
  } catch (error) {
    // Emulator already connected or not running
    console.log("Functions emulator connection:", error);
  }
}
