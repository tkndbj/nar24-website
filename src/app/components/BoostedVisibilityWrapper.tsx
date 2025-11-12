// app/components/BoostedVisibilityWrapper.tsx

"use client";

import React, { useCallback, useRef } from 'react';
import { useVisibilityDetector } from '@/hooks/useVisibilityDetector';
import { impressionBatcher } from '@/app/utils/impressionBatcher';

interface BoostedVisibilityWrapperProps {
  productId: string;
  children: React.ReactNode;
  enabled?: boolean;
}

export const BoostedVisibilityWrapper: React.FC<BoostedVisibilityWrapperProps> = ({
  productId,
  children,
  enabled = true,
}) => {
  const hasTriggeredRef = useRef(false);

  const handleVisibilityChange = useCallback(
    (isVisible: boolean, visibleFraction: number) => {
      // Only trigger when >50% visible (matching Flutter)
      if (visibleFraction > 0.5 && !hasTriggeredRef.current && enabled) {
        // Record impression (batcher handles 1-hour cooldown)
        impressionBatcher.addImpression(productId);
        hasTriggeredRef.current = true;
        
        // Reset after a short delay to allow re-detection on page change
        setTimeout(() => {
          hasTriggeredRef.current = false;
        }, 1000); // 1 second is enough to prevent double-counting on same page
      }
    },
    [productId, enabled]
  );

  const { elementRef } = useVisibilityDetector({
    threshold: 0.5, // 50% visible
    onVisibilityChange: handleVisibilityChange,
    enabled,
  });

  return (
    <div ref={elementRef} className="w-full h-full">
      {children}
    </div>
  );
};