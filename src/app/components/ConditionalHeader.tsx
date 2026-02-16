"use client";

import { usePathname } from "next/navigation";
import MarketHeader from "@/app/components/market_screen/MarketHeader";

export default function ConditionalHeader() {
  const pathname = usePathname();

  // Define pages where header should be hidden
  const hideHeaderRoutes = [
    "/login",
    "/registration",
    "/forgot-password",
    "/verify-email",
    "/two-factor-verification",
    "/email-verification",
    "/complete-profile",
    "/complete-name",
    "/password-reset",
  ];

  const shouldHideHeader =
    hideHeaderRoutes.includes(pathname) ||
    hideHeaderRoutes.some((route) => pathname.endsWith(route)) ||
    pathname.includes("/agreements");

  if (shouldHideHeader) {
    return null;
  }

  return <MarketHeader />;
}
