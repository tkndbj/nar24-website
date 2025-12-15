"use client";

import { useEffect, ReactNode } from "react";
import { memoryManager } from "@/app/utils/memoryManager";
import { userActivityService } from "@/services/userActivity";

/**
 * AppInitializer - Handles global app initialization
 * Should be included at the root level (outside UserProvider)
 */
export function AppInitializer({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Initialize memory manager
    memoryManager.setupMemoryManagement();
    console.log("✅ Memory manager initialized");

    // Initialize UserActivityService
    userActivityService.initialize();
    console.log("✅ UserActivityService initialized");

    // Cleanup on unmount
    return () => {
      memoryManager.dispose();
      userActivityService.dispose();
      console.log("✅ Services disposed");
    };
  }, []);

  return <>{children}</>;
}
