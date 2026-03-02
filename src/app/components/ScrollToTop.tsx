"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function ScrollToTop() {
  const pathname = usePathname();
  const isBack = useRef(false);

  useEffect(() => {
    const handlePopState = () => {
      isBack.current = true;
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Save scroll position when leaving the page
  useEffect(() => {
    const saveScroll = () => {
      sessionStorage.setItem(`scroll_${pathname}`, String(window.scrollY));
    };

    return () => {
      saveScroll();
    };
  }, [pathname]);

  // Restore or reset
  useEffect(() => {
    if (isBack.current) {
      isBack.current = false;
      const saved = Number(sessionStorage.getItem(`scroll_${pathname}`) ?? 0);

      if (saved > 0) {
        // Retry until page is tall enough to scroll to saved position
        let attempts = 0;
        const tryScroll = () => {
          if (
            document.documentElement.scrollHeight >=
              saved + window.innerHeight ||
            attempts > 15
          ) {
            window.scrollTo(0, saved);
          } else {
            attempts++;
            setTimeout(tryScroll, 100);
          }
        };
        setTimeout(tryScroll, 50);
      }
      return;
    }

    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
