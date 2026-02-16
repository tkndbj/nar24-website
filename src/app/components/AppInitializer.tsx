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
      const [{ memoryManager }, { userActivityService }] = await Promise.all([
        import("@/app/utils/memoryManager"),
        import("@/services/userActivity"),
      ]);
      memoryManager.setupMemoryManagement();
      userActivityService.initialize();
    });

    return () => {
      if (typeof cancelIdleCallback !== "undefined") {
        cancelIdleCallback(id as number);
      }
      // Lazy cleanup — only dispose if modules were loaded
      import("@/app/utils/memoryManager").then((m) => m.memoryManager.dispose());
      import("@/services/userActivity").then((m) =>
        m.userActivityService.dispose()
      );
    };
  }, []);

  return <>{children}</>;
}
