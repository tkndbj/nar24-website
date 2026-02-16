/**
 * useTheme Hook
 *
 * Shared theme detection using React's useSyncExternalStore.
 * Replaces duplicate MutationObservers across components with a single
 * singleton observer. This is the React 18+ best practice for subscribing
 * to external browser state.
 *
 * Usage:
 *   const isDarkMode = useTheme();
 */

"use client";

import { useSyncExternalStore } from "react";

// ============================================================================
// SINGLETON STATE — one observer for the entire app
// ============================================================================

let currentIsDark = false;
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function initObserver() {
  if (observer || typeof document === "undefined") return;

  // Read initial value
  currentIsDark = document.documentElement.classList.contains("dark");

  // Watch for class changes on <html>
  observer = new MutationObserver(() => {
    const newValue = document.documentElement.classList.contains("dark");
    if (newValue !== currentIsDark) {
      currentIsDark = newValue;
      listeners.forEach((l) => l());
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

// ============================================================================
// useSyncExternalStore contract
// ============================================================================

function subscribe(listener: () => void): () => void {
  // Lazily start the observer on first subscription
  initObserver();

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return currentIsDark;
}

function getServerSnapshot(): boolean {
  return false; // Default to light on server
}

// ============================================================================
// HOOK
// ============================================================================

export function useTheme(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
