// lib/authStateManager.ts
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { doc, getDocFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface CachedUserData {
  user: User | null;
  profileData: Record<string, unknown> | null;
  isAdmin: boolean;
  timestamp: number;
}

class AuthStateManager {
  private static instance: AuthStateManager;
  private cachedData: CachedUserData | null = null;
  private subscribers: Set<(data: CachedUserData | null) => void> = new Set();
  private unsubscribeAuth: (() => void) | null = null;
  private isInitialized = false;
  private CACHE_DURATION = 10000; // 10 seconds

  private constructor() {}

  static getInstance(): AuthStateManager {
    if (!AuthStateManager.instance) {
      AuthStateManager.instance = new AuthStateManager();
    }
    return AuthStateManager.instance;
  }

  initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    this.unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if we have valid cache
        if (
          this.cachedData &&
          this.cachedData.user?.uid === user.uid &&
          Date.now() - this.cachedData.timestamp < this.CACHE_DURATION
        ) {
          // Use cached data
          this.notifySubscribers(this.cachedData);
          return;
        }

        // Fetch fresh data
        try {
          const userDoc = await getDocFromServer(doc(db, "users", user.uid));
          const profileData = userDoc.exists() ? userDoc.data() : null;

          const data: CachedUserData = {
            user,
            profileData,
            isAdmin: profileData?.isAdmin === true,
            timestamp: Date.now(),
          };

          this.cachedData = data;
          this.notifySubscribers(data);
        } catch (error) {
          console.error("Error fetching user data:", error);
          const data: CachedUserData = {
            user,
            profileData: null,
            isAdmin: false,
            timestamp: Date.now(),
          };
          this.cachedData = data;
          this.notifySubscribers(data);
        }
      } else {
        this.cachedData = null;
        this.notifySubscribers(null);
      }
    });
  }

  subscribe(callback: (data: CachedUserData | null) => void) {
    this.subscribers.add(callback);

    // Immediately provide cached data if available
    if (
      this.cachedData &&
      Date.now() - this.cachedData.timestamp < this.CACHE_DURATION
    ) {
      callback(this.cachedData);
    }

    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers(data: CachedUserData | null) {
    this.subscribers.forEach((callback) => callback(data));
  }

  getCachedData(): CachedUserData | null {
    if (
      this.cachedData &&
      Date.now() - this.cachedData.timestamp < this.CACHE_DURATION
    ) {
      return this.cachedData;
    }
    return null;
  }

  invalidateCache() {
    this.cachedData = null;
  }

  cleanup() {
    this.unsubscribeAuth?.();
    this.subscribers.clear();
    this.cachedData = null;
    this.isInitialized = false;
  }
}

export default AuthStateManager;
