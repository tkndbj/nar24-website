// src/lib/firebase-admin.ts

import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let app: App | null = null;
let db: Firestore | null = null;

function formatPrivateKey(key: string): string {
  // Remove any existing newlines and whitespace
  let cleanKey = key.replace(/\\n/g, '\n').trim();
  
  // If the key doesn't have proper line breaks, add them
  if (!cleanKey.includes('\n')) {
    // This handles the case where the key is all on one line
    cleanKey = cleanKey.replace(/-----BEGIN PRIVATE KEY-----/, '-----BEGIN PRIVATE KEY-----\n');
    cleanKey = cleanKey.replace(/-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----');
    
    // Add line breaks every 64 characters for the key content
    const beginMarker = '-----BEGIN PRIVATE KEY-----\n';
    const endMarker = '\n-----END PRIVATE KEY-----';
    const keyContent = cleanKey.replace(beginMarker, '').replace(endMarker, '');
    
    // Split key content into 64-character lines
    const lines = [];
    for (let i = 0; i < keyContent.length; i += 64) {
      lines.push(keyContent.substring(i, i + 64));
    }
    
    cleanKey = beginMarker + lines.join('\n') + endMarker;
  }
  
  // Ensure it ends with a newline
  if (!cleanKey.endsWith('\n')) {
    cleanKey += '\n';
  }
  
  return cleanKey;
}

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
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

  console.log("🔥 Firebase Admin Initialization Debug:");
  console.log("Project ID:", projectId ? "✅ Present" : "❌ Missing");
  console.log("Client Email:", clientEmail ? "✅ Present" : "❌ Missing");
  console.log("Private Key:", rawPrivateKey ? `✅ Present (${rawPrivateKey.length} chars)` : "❌ Missing");

  if (!projectId || !clientEmail || !rawPrivateKey) {
    const missing = [];
    if (!projectId) missing.push("FIREBASE_PROJECT_ID");
    if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
    if (!rawPrivateKey) missing.push("FIREBASE_PRIVATE_KEY");

    throw new Error(`Missing Firebase credentials: ${missing.join(", ")}`);
  }

  try {
    // Format the private key properly
    const privateKey = formatPrivateKey(rawPrivateKey);
    
    console.log("🔑 Private Key Debug:");
    console.log("Raw key starts with:", rawPrivateKey.substring(0, 30));
    console.log("Raw key ends with:", rawPrivateKey.substring(rawPrivateKey.length - 30));
    console.log("Formatted key starts with:", privateKey.substring(0, 30));
    console.log("Formatted key ends with:", privateKey.substring(privateKey.length - 30));
    console.log("Has proper BEGIN marker:", privateKey.includes('-----BEGIN PRIVATE KEY-----'));
    console.log("Has proper END marker:", privateKey.includes('-----END PRIVATE KEY-----'));

    const serviceAccount = {
      projectId,
      clientEmail,
      privateKey,
    };

    app = initializeApp({
      credential: cert(serviceAccount),
    });

    console.log("✅ Firebase Admin initialized successfully");
    return app;
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Admin:", error);
    
    if (error instanceof Error) {
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack?.substring(0, 500)
      });
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