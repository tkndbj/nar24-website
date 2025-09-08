// lib/authStateManager.ts (enhanced version)
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { doc, getDocFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";
import StatePersistenceManager from "@/lib/statePersistence";

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
  private CACHE_DURATION = 60000; // Increased to 60 seconds for language switches
  private isLanguageSwitching = false;

  private constructor() {
    // Check for persisted auth state in sessionStorage
    this.loadPersistedState();
  }

  static getInstance(): AuthStateManager {
    if (!AuthStateManager.instance) {
      AuthStateManager.instance = new AuthStateManager();
    }
    return AuthStateManager.instance;
  }

  private loadPersistedState() {
    // Check if we're in the browser
    if (typeof window === "undefined") return;

    try {
      const persisted = sessionStorage.getItem("auth_state_cache");
      if (persisted) {
        const data = JSON.parse(persisted) as CachedUserData;
        // Check if cache is still valid
        if (Date.now() - data.timestamp < this.CACHE_DURATION) {
          this.cachedData = data;
        } else {
          sessionStorage.removeItem("auth_state_cache");
        }
      }
    } catch (error) {
      console.error("Failed to load persisted auth state:", error);
    }
  }

  private persistState() {
    // Check if we're in the browser
    if (typeof window === "undefined") return;

    try {
      if (this.cachedData) {
        // Store a simplified version in sessionStorage
        const simplified = {
          ...this.cachedData,
          user: this.cachedData.user
            ? {
                uid: this.cachedData.user.uid,
                email: this.cachedData.user.email,
                displayName: this.cachedData.user.displayName,
                photoURL: this.cachedData.user.photoURL,
                emailVerified: this.cachedData.user.emailVerified,
              }
            : null,
        };
        sessionStorage.setItem("auth_state_cache", JSON.stringify(simplified));
      }
    } catch (error) {
      console.error("Failed to persist auth state:", error);
    }
  }

  setLanguageSwitching(switching: boolean, currentLocale?: string) {
    // Only set language switching if we have evidence of an actual locale change
    const statePersistence = StatePersistenceManager.getInstance();
    this.isLanguageSwitching =
      switching && statePersistence.isLanguageSwitch(currentLocale);

    if (this.isLanguageSwitching) {
      // Extend cache duration during language switch
      if (this.cachedData) {
        this.cachedData.timestamp = Date.now();
        this.persistState();
      }
    }
  }

  initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // If we have valid cached data and are switching languages, don't re-fetch
    if (this.isLanguageSwitching && this.cachedData) {
      this.notifySubscribers(this.cachedData);
      return;
    }

    this.unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if we have valid cache
        if (
          this.cachedData &&
          this.cachedData.user?.uid === user.uid &&
          (Date.now() - this.cachedData.timestamp < this.CACHE_DURATION ||
            this.isLanguageSwitching)
        ) {
          // Use cached data
          this.notifySubscribers(this.cachedData);
          return;
        }

        // Fetch fresh data only if not language switching
        if (!this.isLanguageSwitching) {
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
            this.persistState();
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
        }
      } else {
        this.cachedData = null;
        sessionStorage.removeItem("auth_state_cache");
        this.notifySubscribers(null);
      }
    });
  }

  subscribe(callback: (data: CachedUserData | null) => void) {
    this.subscribers.add(callback);

    // Immediately provide cached data if available
    if (
      this.cachedData &&
      (Date.now() - this.cachedData.timestamp < this.CACHE_DURATION ||
        this.isLanguageSwitching)
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
      (Date.now() - this.cachedData.timestamp < this.CACHE_DURATION ||
        this.isLanguageSwitching)
    ) {
      return this.cachedData;
    }
    return null;
  }

  updateCache(data: Partial<CachedUserData>) {
    if (
      this.cachedData &&
      data.user &&
      this.cachedData.user?.uid === data.user.uid
    ) {
      this.cachedData = {
        ...this.cachedData,
        ...data,
        timestamp: Date.now(),
      };
      this.persistState();
      this.notifySubscribers(this.cachedData);
    }
  }

  invalidateCache() {
    // Don't invalidate during language switch
    if (!this.isLanguageSwitching) {
      this.cachedData = null;
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("auth_state_cache");
      }
    }
  }

  cleanup() {
    this.unsubscribeAuth?.();
    this.subscribers.clear();
    this.cachedData = null;
    this.isInitialized = false;
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("auth_state_cache");
    }
  }
}

export default AuthStateManager;
