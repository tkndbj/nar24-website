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

  if (typeof window !== "undefined") {
    throw new Error("Firebase Admin should not be used on the client side");
  }

  try {
    // Option 1: Use complete service account JSON (recommended)
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    
    // Option 2: Use individual environment variables (fallback)
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    console.log("🔥 Firebase Initialization Options:");
    console.log("Service account JSON available:", !!serviceAccountJson);
    console.log("Individual vars available:", !!(projectId && clientEmail && privateKey));

    let serviceAccount;

    if (serviceAccountJson) {
      // Parse the complete service account JSON
      try {
        serviceAccount = JSON.parse(serviceAccountJson);
        console.log("✅ Using service account JSON");
        console.log("Project ID from JSON:", serviceAccount.project_id);
        console.log("Client Email from JSON:", serviceAccount.client_email);
        console.log("Private Key available:", !!serviceAccount.private_key);
      } catch (parseError) {
        console.error("❌ Failed to parse service account JSON:", parseError);
        throw new Error("Invalid service account JSON format");
      }
    } else if (projectId && clientEmail && privateKey) {
      // Use individual environment variables
      console.log("✅ Using individual environment variables");
      
      // Clean up the private key
      let cleanPrivateKey = privateKey.replace(/\\n/g, '\n');
      
      // Ensure proper formatting
      if (!cleanPrivateKey.includes('\n')) {
        cleanPrivateKey = cleanPrivateKey.replace(/-----BEGIN PRIVATE KEY-----/, '-----BEGIN PRIVATE KEY-----\n');
        cleanPrivateKey = cleanPrivateKey.replace(/-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----');
      }
      
      if (!cleanPrivateKey.endsWith('\n')) {
        cleanPrivateKey += '\n';
      }

      serviceAccount = {
        type: "service_account",
        project_id: projectId,
        private_key_id: "", // Not required for cert()
        private_key: cleanPrivateKey,
        client_email: clientEmail,
        client_id: "", // Not required for cert()
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(clientEmail)}`
      };
      
      console.log("🔑 Private Key Debug:");
      console.log("Raw key starts with:", privateKey.substring(0, 30));
      console.log("Formatted key starts with:", cleanPrivateKey.substring(0, 30));
      console.log("Has proper BEGIN marker:", cleanPrivateKey.includes('-----BEGIN PRIVATE KEY-----'));
      console.log("Has proper END marker:", cleanPrivateKey.includes('-----END PRIVATE KEY-----'));
    } else {
      throw new Error("Neither complete service account JSON nor individual credentials are available");
    }

    app = initializeApp({
      credential: cert(serviceAccount),
    });

    console.log("✅ Firebase Admin initialized successfully");
    return app;
  } catch (error) {
    console.error("❌ Firebase Admin initialization failed:", error);
    
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