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

  useEffect(() => {
    if (isBack.current) {
      isBack.current = false;
      return; // don't scroll on back navigation
    }
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
