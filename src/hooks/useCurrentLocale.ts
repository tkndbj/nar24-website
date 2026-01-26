// hooks/useCurrentLocale.ts
"use client";

import { usePathname } from "next/navigation";

const SUPPORTED_LOCALES = ["en", "tr"];
const DEFAULT_LOCALE = "tr";

export function useCurrentLocale(): string {
  const pathname = usePathname();
  
  // Extract locale from pathname (e.g., "/en/dashboard" -> "en")
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];
  
  if (firstSegment && SUPPORTED_LOCALES.includes(firstSegment)) {
    return firstSegment;
  }
  
  // No locale prefix means default locale (Turkish)
  return DEFAULT_LOCALE;
}