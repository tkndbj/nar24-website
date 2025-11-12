// app/hooks/useVisibilityDetector.ts

import { useEffect, useRef, useState } from 'react';

interface UseVisibilityDetectorOptions {
  threshold?: number; // 0.0 to 1.0 (0.5 = 50% visible, matching Flutter)
  onVisibilityChange?: (isVisible: boolean, visibleFraction: number) => void;
  rootMargin?: string;
  enabled?: boolean;
}

export function useVisibilityDetector({
  threshold = 0.5,
  onVisibilityChange,
  rootMargin = '0px',
  enabled = true,
}: UseVisibilityDetectorOptions = {}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [visibleFraction, setVisibleFraction] = useState(0);

  useEffect(() => {
    if (!enabled || !elementRef.current) return;

    const element = elementRef.current;

    // Create Intersection Observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const fraction = entry.intersectionRatio;
          const visible = fraction > threshold;

          setIsVisible(visible);
          setVisibleFraction(fraction);

          if (onVisibilityChange) {
            onVisibilityChange(visible, fraction);
          }
        });
      },
      {
        threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], // Track all fractions
        rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [threshold, onVisibilityChange, rootMargin, enabled]);

  return {
    elementRef,
    isVisible,
    visibleFraction,
  };
}