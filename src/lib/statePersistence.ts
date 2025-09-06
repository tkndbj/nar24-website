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
}

class StatePersistenceManager {
  private static instance: StatePersistenceManager;
  private readonly STORAGE_KEY = "app_state_persist";
  private readonly STATE_TTL = 30000; // 30 seconds TTL for state

  private constructor() {}

  static getInstance(): StatePersistenceManager {
    if (!StatePersistenceManager.instance) {
      StatePersistenceManager.instance = new StatePersistenceManager();
    }
    return StatePersistenceManager.instance;
  }

  // Save state before language switch
  saveState(state: Partial<PersistedState>): void {
    // Check if we're in the browser
    if (typeof window === "undefined") return;

    try {
      const persistedState: PersistedState = {
        ...state,
        timestamp: Date.now(),
      };

      // Compress the state to save space
      const compressed = compress(JSON.stringify(persistedState));
      sessionStorage.setItem(this.STORAGE_KEY, compressed);

      // Also set a flag indicating a language switch is happening
      sessionStorage.setItem("language_switch_in_progress", "true");
    } catch (error) {
      console.error("Failed to persist state:", error);
    }
  }

  // Restore state after language switch
  restoreState(): PersistedState | null {
    // Check if we're in the browser
    if (typeof window === "undefined") return null;

    try {
      const compressed = sessionStorage.getItem(this.STORAGE_KEY);
      const isLanguageSwitch = sessionStorage.getItem(
        "language_switch_in_progress"
      );

      if (!compressed || !isLanguageSwitch) {
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

      // Clear the flag and state after successful restore
      sessionStorage.removeItem("language_switch_in_progress");
      sessionStorage.removeItem(this.STORAGE_KEY);

      return state;
    } catch (error) {
      console.error("Failed to restore state:", error);
      this.clearState();
      return null;
    }
  }

  clearState(): void {
    // Check if we're in the browser
    if (typeof window === "undefined") return;

    sessionStorage.removeItem(this.STORAGE_KEY);
    sessionStorage.removeItem("language_switch_in_progress");
  }

  // Check if we're in the middle of a language switch
  isLanguageSwitch(): boolean {
    // Check if we're in the browser
    if (typeof window === "undefined") return false;

    return sessionStorage.getItem("language_switch_in_progress") === "true";
  }
}

export default StatePersistenceManager;
