// lib/statePersistence.ts
import { compress, decompress } from "lz-string";

interface PersistedState {
  cart?: {
    cartCount: number;
    cartProductIds: string[];
    cartItems: Array<{
      productId: string;
      quantity: number;
      [key: string]: unknown;
    }>;
  };
  favorites?: {
    favoriteProductIds: string[];
    allFavoriteProductIds: string[];
    favoriteCount: number;
    selectedBasketId: string | null;
  };
  search?: {
    term: string;
    suggestions: Array<{
      id: string;
      [key: string]: unknown;
    }>;
    categorySuggestions: Array<{
      [key: string]: unknown;
    }>;
  };
  notifications?: {
    [key: string]: unknown;
  };
  timestamp: number;
  locale?: string; // Add locale to track actual language switches
}

class StatePersistenceManager {
  private static instance: StatePersistenceManager;
  private readonly STORAGE_KEY = "app_state_persist";
  private readonly LANGUAGE_SWITCH_KEY = "language_switch_in_progress";
  private readonly STATE_TTL = 30000; // 30 seconds TTL for state
  private readonly LANGUAGE_SWITCH_TTL = 5000; // 5 seconds for language switch detection

  private constructor() {}

  static getInstance(): StatePersistenceManager {
    if (!StatePersistenceManager.instance) {
      StatePersistenceManager.instance = new StatePersistenceManager();
    }
    return StatePersistenceManager.instance;
  }

  // Save state before language switch
  saveState(state: Partial<PersistedState>, currentLocale?: string): void {
    if (typeof window === "undefined") return;

    try {
      const persistedState: PersistedState = {
        ...state,
        timestamp: Date.now(),
        locale: currentLocale,
      };

      const compressed = compress(JSON.stringify(persistedState));
      sessionStorage.setItem(this.STORAGE_KEY, compressed);

      // Set language switch flag with timestamp
      const switchData = {
        timestamp: Date.now(),
        locale: currentLocale,
      };
      sessionStorage.setItem(
        this.LANGUAGE_SWITCH_KEY,
        JSON.stringify(switchData)
      );
    } catch (error) {
      console.error("Failed to persist state:", error);
    }
  }

  // Restore state after language switch
  restoreState(currentLocale?: string): PersistedState | null {
    if (typeof window === "undefined") return null;

    try {
      const compressed = sessionStorage.getItem(this.STORAGE_KEY);
      const switchDataStr = sessionStorage.getItem(this.LANGUAGE_SWITCH_KEY);

      if (!compressed || !switchDataStr) {
        return null;
      }

      const switchData = JSON.parse(switchDataStr);

      // Check if the language switch flag is expired
      if (Date.now() - switchData.timestamp > this.LANGUAGE_SWITCH_TTL) {
        this.clearState();
        return null;
      }

      const decompressed = decompress(compressed);
      if (!decompressed) return null;

      const state: PersistedState = JSON.parse(decompressed);

      // Check if state is still valid (not expired)
      if (Date.now() - state.timestamp > this.STATE_TTL) {
        this.clearState();
        return null;
      }

      // Only restore if we're actually switching locales
      if (currentLocale && state.locale && currentLocale !== state.locale) {
        // Clear the flag and state after successful restore
        this.clearState();
        return state;
      }

      return null;
    } catch (error) {
      console.error("Failed to restore state:", error);
      this.clearState();
      return null;
    }
  }

  clearState(): void {
    if (typeof window === "undefined") return;

    sessionStorage.removeItem(this.STORAGE_KEY);
    sessionStorage.removeItem(this.LANGUAGE_SWITCH_KEY);
  }

  // Check if we're in the middle of a language switch
  isLanguageSwitch(currentLocale?: string): boolean {
    if (typeof window === "undefined") return false;

    try {
      const switchDataStr = sessionStorage.getItem(this.LANGUAGE_SWITCH_KEY);
      if (!switchDataStr) return false;

      const switchData = JSON.parse(switchDataStr);

      // Check if the flag is recent and for a different locale
      const isRecent =
        Date.now() - switchData.timestamp < this.LANGUAGE_SWITCH_TTL;
      const isDifferentLocale =
        currentLocale &&
        switchData.locale &&
        currentLocale !== switchData.locale;

      return isRecent && isDifferentLocale;
    } catch {
      return false;
    }
  }

  // Clean up expired language switch flags (call this on app initialization)
  cleanupExpiredFlags(): void {
    if (typeof window === "undefined") return;

    try {
      const switchDataStr = sessionStorage.getItem(this.LANGUAGE_SWITCH_KEY);
      if (switchDataStr) {
        const switchData = JSON.parse(switchDataStr);
        if (Date.now() - switchData.timestamp > this.LANGUAGE_SWITCH_TTL) {
          this.clearState();
        }
      }
    } catch {
      // If parsing fails, clear the state
      this.clearState();
    }
  }
}

export default StatePersistenceManager;
