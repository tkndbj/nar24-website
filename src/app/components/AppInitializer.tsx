"use client";

import { useEffect, ReactNode } from "react";

/**
 * AppInitializer - Handles global app initialization
 * Defers non-critical work to avoid blocking the main thread during initial render.
 * Should be included at the root level (outside UserProvider)
 */
export function AppInitializer({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Defer initialization to avoid blocking first paint / TBT
    const schedule =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 1);

    const id = schedule(async () => {
      const [{ userActivityService }, { firestoreReadTracker }] =
        await Promise.all([
          import("@/services/userActivity"),
          import("@/lib/firestore-read-tracker"),
        ]);
      userActivityService.initialize();
      // Synchronous; sets up the 60s flush timer and lifecycle handlers.
      // First flush lazily resolves Firebase via firebase-lazy.
      firestoreReadTracker.initialize();
    });

    return () => {
      if (typeof cancelIdleCallback !== "undefined") {
        cancelIdleCallback(id as number);
      }
      // Lazy cleanup — only dispose if modules were loaded
      import("@/services/userActivity").then((m) =>
        m.userActivityService.dispose()
      );
      import("@/lib/firestore-read-tracker").then((m) =>
        m.firestoreReadTracker.dispose()
      );
    };
  }, []);

  return <>{children}</>;
}
