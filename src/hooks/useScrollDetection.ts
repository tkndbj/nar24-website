"use client";

import { useState, useEffect, useRef, RefObject } from "react";

interface ScrollDetectionResult {
  showHeaderButtons: boolean;
  actionButtonsRef: RefObject<HTMLDivElement | null>;
}

export function useScrollDetection(): ScrollDetectionResult {
  const [showHeaderButtons, setShowHeaderButtons] = useState(false);
  const actionButtonsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (actionButtonsRef.current) {
        const buttonRect = actionButtonsRef.current.getBoundingClientRect();
        const isLargeScreen = window.innerWidth >= 1024;
        const marketHeaderHeight = isLargeScreen ? 64 : 108;
        const productHeaderHeight = isLargeScreen ? 52 : 48;
        const headerHeight = marketHeaderHeight + productHeaderHeight;

        setShowHeaderButtons(buttonRect.bottom < headerHeight);
      }
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return { showHeaderButtons, actionButtonsRef };
}
