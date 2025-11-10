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
    recordImpression: analyticsBatcher.recordImpression.bind(analyticsBatcher),
    recordClick: analyticsBatcher.recordClick.bind(analyticsBatcher),
    recordDetailView: analyticsBatcher.recordDetailView.bind(analyticsBatcher),
    recordProductClick: analyticsBatcher.recordProductClick.bind(analyticsBatcher),
    recordPurchase: analyticsBatcher.recordPurchase.bind(analyticsBatcher),
    flushAll: analyticsBatcher.flushAll.bind(analyticsBatcher),
  };
}

/**
 * Hook for intersection observer-based impression tracking
 * Use this on product list pages to track when products become visible
 */
export function useImpressionTracking(
  elementRef: React.RefObject<HTMLElement>,
  productId: string,
  options?: {
    threshold?: number;
    userGender?: string;
    userAge?: number;
  }
) {
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Record impression when product is visible
            analyticsBatcher.recordImpression(
              productId,
              options?.userGender,
              options?.userAge
            );

            // Unobserve after recording (only track once)
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: options?.threshold || 0.5, // 50% visible by default
        rootMargin: '0px',
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [productId, elementRef, options?.threshold, options?.userGender, options?.userAge]);
}