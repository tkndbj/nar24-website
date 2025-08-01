// src/lib/firebase-admin.ts

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let app: App | null = null;
let db: Firestore | null = null;

export function initializeFirebaseAdmin(): App {
  if (app) {
    return app;
  }

  if (getApps().length > 0) {
    app = getApps()[0];
    return app;
  }

  // Check if we're in a client-side environment
  if (typeof window !== "undefined") {
    throw new Error("Firebase Admin should not be used on the client side");
  }

  // Skip initialization during build if environment variables are not available
  if (
    process.env.NODE_ENV === "production" &&
    !process.env.FIREBASE_PROJECT_ID
  ) {
    throw new Error("Firebase credentials not available during build");
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    const missing = [];
    if (!projectId) missing.push("FIREBASE_PROJECT_ID");
    if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
    if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");

    throw new Error(`Missing Firebase credentials: ${missing.join(", ")}`);
  }

  try {
    app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

    console.log("Firebase Admin initialized successfully");
    return app;
  } catch (error) {
    console.error("Failed to initialize Firebase Admin:", error);
    throw error;
  }
}

export function getFirestoreAdmin(): Firestore {
  if (db) {
    return db;
  }

  const app = initializeFirebaseAdmin();
  db = getFirestore(app);
  return db;
}
