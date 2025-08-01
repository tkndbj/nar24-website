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

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    const missing = [];
    if (!projectId) missing.push("FIREBASE_PROJECT_ID");
    if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
    if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");

    throw new Error(`Missing Firebase credentials: ${missing.join(", ")}`);
  }

  // Handle private key formatting - try different approaches
  try {
    // First, try to handle the key as-is (in case Vercel already formatted it correctly)
    if (!privateKey.includes('\\n') && !privateKey.includes('\n')) {
      // If no newlines at all, it might be base64 encoded or malformed
      throw new Error("Private key appears to be malformed");
    }
    
    // Replace \\n with actual newlines if needed
    if (privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    // Ensure the key starts and ends correctly
    if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
      throw new Error("Private key missing BEGIN marker");
    }
    if (!privateKey.endsWith('-----END PRIVATE KEY-----\n') && !privateKey.endsWith('-----END PRIVATE KEY-----')) {
      if (!privateKey.endsWith('\n')) {
        privateKey += '\n';
      }
    }

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
    console.error("Project ID:", projectId ? "✓ Present" : "✗ Missing");
    console.error("Client Email:", clientEmail ? "✓ Present" : "✗ Missing");
    console.error("Private Key:", privateKey ? `✓ Present (${privateKey.length} chars)` : "✗ Missing");
    
    if (privateKey) {
      console.error("Private Key starts with:", privateKey.substring(0, 50));
      console.error("Private Key ends with:", privateKey.substring(privateKey.length - 50));
    }
    
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