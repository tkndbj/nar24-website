"use client";

import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase-lazy";

interface SearchConfig {
  provider: "algolia" | "firestore";
  reason: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
}

const DEFAULT_CONFIG: SearchConfig = {
  provider: "algolia",
  reason: null,
  updatedAt: null,
  updatedBy: null,
};

// Global state so all consumers share one listener
let _config: SearchConfig = DEFAULT_CONFIG;
const _listeners: Set<(config: SearchConfig) => void> = new Set();
let _unsubscribe: (() => void) | null = null;
let _initStarted = false;

function notifyListeners() {
  _listeners.forEach((fn) => fn(_config));
}

async function startListener() {
  if (_initStarted) return;
  _initStarted = true;

  try {
    const db = await getFirebaseDb();
    const configRef = doc(db, "config", "search");

    _unsubscribe = onSnapshot(
      configRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          _config = {
            provider: data.provider === "firestore" ? "firestore" : "algolia",
            reason: data.reason ?? null,
            updatedAt: data.updatedAt ?? null,
            updatedBy: data.updatedBy ?? null,
          };
        } else {
          _config = DEFAULT_CONFIG;
        }
        notifyListeners();
      },
      (error) => {
        console.error("SearchConfig listener error:", error);
        _config = DEFAULT_CONFIG;
        notifyListeners();
      },
    );
  } catch (error) {
    console.error("SearchConfig init error:", error);
    _config = DEFAULT_CONFIG;
    _initStarted = false;
  }
}

/** Singleton access for non-React code (like SearchProvider context) */
export function getSearchConfig(): SearchConfig {
  if (!_initStarted && typeof window !== "undefined") {
    startListener();
  }
  return _config;
}

export function useFirestoreMode(): boolean {
  return getSearchConfig().provider === "firestore";
}

/** React hook for reactive updates */
export function useSearchConfig(): SearchConfig & { useFirestore: boolean } {
  const [config, setConfig] = useState<SearchConfig>(_config);

  useEffect(() => {
    // Start listener if not already started
    if (!_initStarted) startListener();

    // Subscribe to changes
    const listener = (newConfig: SearchConfig) => setConfig(newConfig);
    _listeners.add(listener);

    // Sync current value
    setConfig(_config);

    return () => {
      _listeners.delete(listener);
    };
  }, []);

  return {
    ...config,
    useFirestore: config.provider === "firestore",
  };
}

export function shutdownSearchConfig() {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
    _initStarted = false;
    _config = DEFAULT_CONFIG;
  }
}
