"use client";

import { useEffect, ReactNode } from "react";
import { memoryManager } from "@/app/utils/memoryManager";
import redisService from "@/services/redis_service";

/**
 * AppInitializer - Handles global app initialization
 * Should be included at the root level (outside UserProvider)
 */
export function AppInitializer({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Initialize memory manager
    memoryManager.setupMemoryManagement();
    console.log("✅ Memory manager initialized");

    // Initialize Redis service
    const redisUrl = process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN;

    if (redisUrl && redisToken) {
      redisService.initialize({ url: redisUrl, token: redisToken });
    } else {
      console.warn("⚠️ Redis not configured - caching disabled");
    }

    // Cleanup on unmount
    return () => {
      memoryManager.dispose();
      redisService.dispose();
    };
  }, []);

  return <>{children}</>;
}
