/**
 * useMarketLayout Hook
 * 
 * Production-ready hook for managing dynamic market screen layout.
 * Mirrors Flutter's MarketLayoutService functionality.
 * 
 * Features:
 * - ONE-TIME Firestore fetch (no real-time listeners)
 * - Platform-specific config with fallback
 * - Validation and sanitization of widget data
 * - Default fallback on errors
 * - TypeScript type safety
 * 
 * NO LISTENERS - Only fetches on mount or manual refresh()
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  MarketWidgetConfig,
  MarketLayoutState,
  MarketLayoutDocument,
  DEFAULT_WIDGETS,
  VALID_WIDGET_TYPES,
  WidgetType,
} from "@/types/MarketLayout";

// ============================================================================
// CONSTANTS
// ============================================================================

const FIRESTORE_COLLECTION = "app_config";
const FIRESTORE_DOC_WEB = "market_layout_web"; // Web-specific (priority)
const FIRESTORE_DOC_SHARED = "market_layout"; // Shared/fallback

// ============================================================================
// TYPES
// ============================================================================

interface UseMarketLayoutOptions {
  /** Enable debug logging */
  debug?: boolean;
}

interface UseMarketLayoutReturn extends MarketLayoutState {
  /** Manually refresh the layout */
  refresh: () => void;
  /** Reset to default widgets (local only) */
  resetToDefaults: () => void;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates a single widget configuration
 */
function isValidWidget(widget: unknown): widget is MarketWidgetConfig {
  if (!widget || typeof widget !== "object") return false;

  const w = widget as Record<string, unknown>;

  return (
    typeof w.id === "string" &&
    w.id.length > 0 &&
    typeof w.type === "string" &&
    VALID_WIDGET_TYPES.includes(w.type as WidgetType) &&
    typeof w.isVisible === "boolean" &&
    typeof w.order === "number" &&
    !isNaN(w.order)
  );
}

/**
 * Parses and validates widgets from Firestore data
 */
function parseWidgetsFromData(data: unknown): MarketWidgetConfig[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  const docData = data as MarketLayoutDocument;

  if (!docData.widgets || !Array.isArray(docData.widgets)) {
    return [];
  }

  const seenIds = new Set<string>();
  const validWidgets: MarketWidgetConfig[] = [];

  for (const widget of docData.widgets) {
    // Validate widget structure
    if (!isValidWidget(widget)) {
      continue;
    }

    // Check for duplicate IDs
    if (seenIds.has(widget.id)) {
      continue;
    }

    seenIds.add(widget.id);

    // Sanitize and add widget
    validWidgets.push({
      id: String(widget.id),
      name: typeof widget.name === "string" ? widget.name : "",
      type: widget.type,
      isVisible: Boolean(widget.isVisible),
      order: Number(widget.order),
    });
  }

  return validWidgets;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Custom hook for managing market layout with one-time Firestore fetch
 */
export function useMarketLayout(
  options: UseMarketLayoutOptions = {}
): UseMarketLayoutReturn {
  const { debug = false } = options;

  // State
  const [state, setState] = useState<MarketLayoutState>({
    widgets: DEFAULT_WIDGETS,
    visibleWidgets: DEFAULT_WIDGETS.filter((w) => w.isVisible).sort(
      (a, b) => a.order - b.order
    ),
    isLoading: true,
    error: null,
    isInitialized: false,
  });

  // Ref to track mount status
  const isMountedRef = useRef(true);

  // Debug logger
  const log = useCallback(
    (message: string, ...args: unknown[]) => {
      if (debug) {
        console.log(`[MarketLayout] ${message}`, ...args);
      }
    },
    [debug]
  );

  /**
   * Updates state only if component is still mounted
   */
  const safeSetState = useCallback(
    (updater: Partial<MarketLayoutState>) => {
      if (!isMountedRef.current) return;
      setState((prev) => ({ ...prev, ...updater }));
    },
    []
  );

  /**
   * Computes visible widgets from all widgets
   */
  const computeVisibleWidgets = useCallback(
    (widgets: MarketWidgetConfig[]): MarketWidgetConfig[] => {
      return widgets
        .filter((w) => w.isVisible)
        .sort((a, b) => a.order - b.order);
    },
    []
  );

  /**
   * Fetches layout from Firestore (ONE-TIME, no listener)
   * Priority: web-specific document first, then shared/fallback
   */
  const fetchLayout = useCallback(async () => {
    if (!isMountedRef.current) return;

    log("Fetching layout...");

    try {
      let parsedWidgets: MarketWidgetConfig[] = [];

      // ========================================
      // 1. Try web-specific document first
      // ========================================
      try {
        const webDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC_WEB);
        const webSnap = await getDoc(webDocRef);

        if (webSnap.exists()) {
          const data = webSnap.data();
          parsedWidgets = parseWidgetsFromData(data);

          if (parsedWidgets.length > 0) {
            log(`Layout loaded from web-specific: ${parsedWidgets.length} widgets`);
            safeSetState({
              widgets: parsedWidgets,
              visibleWidgets: computeVisibleWidgets(parsedWidgets),
              isLoading: false,
              error: null,
              isInitialized: true,
            });
            return;
          }
        }
      } catch (webError) {
        log("Web-specific fetch failed, trying fallback...");
        console.error("[MarketLayout] Web-specific error:", webError);
      }

      // ========================================
      // 2. Fallback to shared document
      // ========================================
      try {
        const sharedDocRef = doc(db, FIRESTORE_COLLECTION, FIRESTORE_DOC_SHARED);
        const sharedSnap = await getDoc(sharedDocRef);

        if (sharedSnap.exists()) {
          const data = sharedSnap.data();
          parsedWidgets = parseWidgetsFromData(data);

          if (parsedWidgets.length > 0) {
            log(`Layout loaded from shared: ${parsedWidgets.length} widgets`);
            safeSetState({
              widgets: parsedWidgets,
              visibleWidgets: computeVisibleWidgets(parsedWidgets),
              isLoading: false,
              error: null,
              isInitialized: true,
            });
            return;
          }
        }
      } catch (sharedError) {
        log("Shared fallback fetch failed");
        console.error("[MarketLayout] Shared fallback error:", sharedError);
      }

      // ========================================
      // 3. No config found, use defaults
      // ========================================
      log("No layout config found, using defaults");
      safeSetState({
        widgets: DEFAULT_WIDGETS,
        visibleWidgets: computeVisibleWidgets(DEFAULT_WIDGETS),
        isLoading: false,
        error: null,
        isInitialized: true,
      });

    } catch (error) {
      console.error("[MarketLayout] Fetch error:", error);

      // Use defaults on error
      safeSetState({
        widgets: DEFAULT_WIDGETS,
        visibleWidgets: computeVisibleWidgets(DEFAULT_WIDGETS),
        isLoading: false,
        error: "Failed to load layout",
        isInitialized: true,
      });
    }
  }, [computeVisibleWidgets, log, safeSetState]);

  /**
   * Manually refresh the layout (re-fetches from Firestore)
   */
  const refresh = useCallback(() => {
    log("Manual refresh triggered");
    safeSetState({ isLoading: true, error: null });
    fetchLayout();
  }, [log, safeSetState, fetchLayout]);

  /**
   * Reset to default widgets (local only, doesn't affect Firestore)
   */
  const resetToDefaults = useCallback(() => {
    log("Resetting to defaults (local only)");
    safeSetState({
      widgets: DEFAULT_WIDGETS,
      visibleWidgets: computeVisibleWidgets(DEFAULT_WIDGETS),
      error: null,
    });
  }, [computeVisibleWidgets, log, safeSetState]);

  // Fetch layout on mount (ONE-TIME)
  useEffect(() => {
    isMountedRef.current = true;
    fetchLayout();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchLayout]);

  // Memoize return value to prevent unnecessary re-renders
  return useMemo(
    () => ({
      ...state,
      refresh,
      resetToDefaults,
    }),
    [state, refresh, resetToDefaults]
  );
}

export default useMarketLayout;