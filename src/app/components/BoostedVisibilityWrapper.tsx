// app/components/BoostedVisibilityWrapper.tsx

"use client";

import React, { useCallback, useRef, useState } from 'react';
import { useVisibilityDetector } from '@/hooks/useVisibilityDetector';
import { impressionBatcher } from '@/app/utils/impressionBatcher';

interface BoostedVisibilityWrapperProps {
  productId: string;
  children: React.ReactNode;
  enabled?: boolean; // Allow disabling for non-boosted products
}

export const BoostedVisibilityWrapper: React.FC<BoostedVisibilityWrapperProps> = ({
  productId,
  children,
  enabled = true,
}) => {
  const [hasRecordedImpression, setHasRecordedImpression] = useState(false);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleVisibilityChange = useCallback(
    (isVisible: boolean, visibleFraction: number) => {
      // Only trigger when >50% visible (matching Flutter)
      if (visibleFraction > 0.5 && !hasRecordedImpression && enabled) {
        // Record impression
        impressionBatcher.addImpression(productId);
        setHasRecordedImpression(true);

        // Reset after cooldown (5 minutes, matching Flutter)
        if (cooldownTimerRef.current) {
          clearTimeout(cooldownTimerRef.current);
        }

        cooldownTimerRef.current = setTimeout(() => {
          setHasRecordedImpression(false);
        }, 5 * 60 * 1000); // 5 minutes
      }
    },
    [productId, hasRecordedImpression, enabled]
  );

  const { elementRef } = useVisibilityDetector({
    threshold: 0.5, // 50% visible
    onVisibilityChange: handleVisibilityChange,
    enabled: enabled && !hasRecordedImpression,
  });

  // Cleanup timer on unmount
  React.useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, []);

  return (
    <div ref={elementRef} className="w-full h-full">
      {children}
    </div>
  );
};