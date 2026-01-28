/**
 * useMarketLayout Hook
 * 
 * Production-ready hook for managing dynamic market screen layout.
 * Mirrors Flutter's MarketLayoutService functionality.
 * 
 * Features:
 * - Real-time Firestore synchronization
 * - Automatic retry with exponential backoff
 * - Proper cleanup to prevent memory leaks
 * - Validation and sanitization of widget data
 * - Default fallback on errors
 * - TypeScript type safety
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { doc, onSnapshot, Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  MarketWidgetConfig,
  MarketLayoutState,
  MarketLayoutDocument,
  DEFAULT_WIDGETS,
  VALID_WIDGET_TYPES,
  WidgetType,
} from "@/types/MarketLayout";

// Configuration constants
const FIRESTORE_COLLECTION = "app_config";
const FIRESTORE_DOC_WEB = "market_layout_web"; // Web-specific (priority)
const FIRESTORE_DOC_SHARED = "market_layout"; // Shared/fallback
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

// Retryable Firestore error codes (matches Flutter implementation)
const RETRYABLE_ERROR_CODES = new Set([
  "unavailable",
  "deadline-exceeded",
  "internal",
  "unknown",
]);

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

/**
 * Determines if an error should trigger a retry
 */
function shouldRetry(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  
  const errorCode = (error as { code?: string }).code;
  return typeof errorCode === "string" && RETRYABLE_ERROR_CODES.has(errorCode);
}

/**
 * Custom hook for managing market layout with Firestore real-time sync
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

  // Refs for cleanup and preventing race conditions
  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
    (updater: Partial<MarketLayoutState> | ((prev: MarketLayoutState) => MarketLayoutState)) => {
      if (!isMountedRef.current) return;
      
      setState((prev) => {
        const newState = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
        return newState;
      });
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
   * Cleanup function for subscriptions and timeouts
   */
  const cleanup = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  /**
   * Sets up the Firestore real-time listener
   * Priority: web-specific document first, then shared/fallback
   */
  const setupListener = useCallback(() => {
    // Cleanup any existing listener
    cleanup();

    if (!isMountedRef.current) return;

  

    /**
     * Subscribe to a document and handle the response
     */
    const subscribeToDoc = (docName: string, isFallback: boolean) => {
      try {
        const docRef = doc(db, FIRESTORE_COLLECTION, docName);

        log(`Setting up Firestore listener for ${docName}...`);

        const unsubscribe = onSnapshot(
          docRef,
          { includeMetadataChanges: false },
          (snapshot) => {
            if (!isMountedRef.current) return;

            try {
              // Reset retry count on successful connection
              retryCountRef.current = 0;

              // If web-specific doc doesn't exist or is empty, try fallback
              if (!snapshot.exists() || !snapshot.data()?.widgets?.length) {
                if (!isFallback) {
                  log(`No web-specific layout found, trying shared fallback...`);
                  // Cleanup current listener and try fallback
                  unsubscribe();
                  subscribeToDoc(FIRESTORE_DOC_SHARED, true);
                  return;
                }

                // Even fallback is empty, use defaults
                log("No layout document found, using defaults");
                safeSetState({
                  widgets: DEFAULT_WIDGETS,
                  visibleWidgets: computeVisibleWidgets(DEFAULT_WIDGETS),
                  isLoading: false,
                  error: null,
                  isInitialized: true,
                });
                return;
              }

              const data = snapshot.data();
              const parsedWidgets = parseWidgetsFromData(data);

              if (parsedWidgets.length === 0) {
                if (!isFallback) {
                  log(`No valid widgets in web-specific, trying shared fallback...`);
                  unsubscribe();
                  subscribeToDoc(FIRESTORE_DOC_SHARED, true);
                  return;
                }

                log("No valid widgets found, using defaults");
                safeSetState({
                  widgets: DEFAULT_WIDGETS,
                  visibleWidgets: computeVisibleWidgets(DEFAULT_WIDGETS),
                  isLoading: false,
                  error: null,
                  isInitialized: true,
                });
                return;
              }

              log(`Layout synced from ${docName}: ${parsedWidgets.length} widgets`);

              safeSetState({
                widgets: parsedWidgets,
                visibleWidgets: computeVisibleWidgets(parsedWidgets),
                isLoading: false,
                error: null,
                isInitialized: true,
              });

              // Store ref for cleanup
              unsubscribeRef.current = unsubscribe;
            } catch (error) {
              console.error("[MarketLayout] Error processing snapshot:", error);
              safeSetState({
                widgets: DEFAULT_WIDGETS,
                visibleWidgets: computeVisibleWidgets(DEFAULT_WIDGETS),
                isLoading: false,
                error: "Failed to process layout update",
                isInitialized: true,
              });
            }
          },
          (error) => {
            if (!isMountedRef.current) return;

            console.error("[MarketLayout] Snapshot error:", error);

            // If web-specific failed, try fallback
            if (!isFallback) {
              log(`Web-specific listener failed, trying shared fallback...`);
              subscribeToDoc(FIRESTORE_DOC_SHARED, true);
              return;
            }

            // Check if we should retry
            if (shouldRetry(error) && retryCountRef.current < MAX_RETRIES) {
              retryCountRef.current++;
              const delay = RETRY_BASE_DELAY_MS * Math.pow(2, retryCountRef.current - 1);
              
              log(`Retrying in ${delay}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})...`);

              retryTimeoutRef.current = setTimeout(() => {
                if (isMountedRef.current) {
                  setupListener();
                }
              }, delay);
            } else {
              // Max retries reached or non-retryable error
              safeSetState({
                widgets: DEFAULT_WIDGETS,
                visibleWidgets: computeVisibleWidgets(DEFAULT_WIDGETS),
                isLoading: false,
                error: `Connection error: ${error instanceof Error ? error.message : "Unknown error"}`,
                isInitialized: true,
              });
            }
          }
        );

        // Store unsubscribe function
        unsubscribeRef.current = unsubscribe;
      } catch (error) {
        console.error("[MarketLayout] Error setting up listener:", error);
        
        // If web-specific setup failed, try fallback
        if (!isFallback) {
          log(`Web-specific setup failed, trying shared fallback...`);
          subscribeToDoc(FIRESTORE_DOC_SHARED, true);
          return;
        }

        safeSetState({
          widgets: DEFAULT_WIDGETS,
          visibleWidgets: computeVisibleWidgets(DEFAULT_WIDGETS),
          isLoading: false,
          error: "Failed to connect to layout service",
          isInitialized: true,
        });
      }
    };

    // Start with web-specific document
    subscribeToDoc(FIRESTORE_DOC_WEB, false);
  }, [cleanup, computeVisibleWidgets, log, safeSetState]);

  /**
   * Manually refresh the layout
   */
  const refresh = useCallback(() => {
    log("Manual refresh triggered");
    retryCountRef.current = 0;
    safeSetState({ isLoading: true, error: null });
    setupListener();
  }, [log, safeSetState, setupListener]);

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

  // Setup listener on mount
  useEffect(() => {
    isMountedRef.current = true;
    setupListener();

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, [setupListener, cleanup]);

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