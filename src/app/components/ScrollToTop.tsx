"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function ScrollToTop() {
  const pathname = usePathname();
  const scrollPositions = useRef<Record<string, number>>({});
  const isBack = useRef(false);

  useEffect(() => {
    const handlePopState = () => {
      isBack.current = true;
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Save scroll position when leaving a page
  useEffect(() => {
    return () => {
      scrollPositions.current[pathname] = window.scrollY;
    };
  }, [pathname]);

  // Scroll to top or restore position
  useEffect(() => {
    if (isBack.current) {
      isBack.current = false;
      const saved = scrollPositions.current[pathname] ?? 0;

      // Wait for page content to render before restoring
      setTimeout(() => {
        window.scrollTo(0, saved);
      }, 100);
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
