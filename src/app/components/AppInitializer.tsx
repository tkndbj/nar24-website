// components/AppInitializer.tsx
"use client";

import { useEffect, ReactNode } from 'react';
import { memoryManager } from '@/app/utils/memoryManager';

/**
 * AppInitializer - Handles global app initialization
 * Should be included at the root level (outside UserProvider)
 */
export function AppInitializer({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Initialize memory manager only (no user-dependent logic here)
    memoryManager.setupMemoryManagement();

    console.log('✅ Memory manager initialized');

    // Cleanup on unmount
    return () => {
      memoryManager.dispose();
    };
  }, []);

  return <>{children}</>;
}