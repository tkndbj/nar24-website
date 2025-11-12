// hooks/useAnalytics.ts
"use client";

import { useEffect } from 'react';
import { analyticsBatcher } from '@/app/utils/analyticsBatcher';
import { useUser } from '@/context/UserProvider';

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
    } else {
      analyticsBatcher.setCurrentUserId(null);
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
    
    recordClick: analyticsBatcher.recordClick.bind(analyticsBatcher),
    recordDetailView: analyticsBatcher.recordDetailView.bind(analyticsBatcher),
    recordProductClick: analyticsBatcher.recordProductClick.bind(analyticsBatcher),
    recordPurchase: analyticsBatcher.recordPurchase.bind(analyticsBatcher),
    flushAll: analyticsBatcher.flushAll.bind(analyticsBatcher),
  };
}
