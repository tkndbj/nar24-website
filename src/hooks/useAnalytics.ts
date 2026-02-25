// hooks/useAnalytics.ts
"use client";

import { useEffect } from "react";
import { analyticsBatcher } from "@/app/utils/analyticsBatcher";
import { impressionBatcher } from "@/app/utils/impressionBatcher";
import { useUser } from "@/context/UserProvider";

/**
 * Hook to initialize and manage analytics batcher
 * Should be called once in the root layout or app component
 */
export function useAnalytics() {
  const { user } = useUser();

  useEffect(() => {
    // Set current user ID for preference tracking
    if (user?.uid) {
      analyticsBatcher.setCurrentUserId(user.uid);
      impressionBatcher.setUserId(user.uid);
    } else {
      analyticsBatcher.setCurrentUserId(null);
      impressionBatcher.setUserId(null);
    }
  }, [user?.uid]);

  useEffect(() => {
    // Setup cleanup on unmount
    return () => {
      // Flush all pending analytics before cleanup
      analyticsBatcher.flushAll();
    };
  }, []);

  return {
    recordClick: analyticsBatcher.recordClick.bind(analyticsBatcher) as typeof analyticsBatcher.recordClick,
    recordShopClick: analyticsBatcher.recordShopClick.bind(analyticsBatcher),
    flushAll: analyticsBatcher.flushAll.bind(analyticsBatcher),
  };
}
