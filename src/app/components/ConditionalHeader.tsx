"use client";

import { usePathname } from "next/navigation";
import MarketHeader from "@/app/components/market_screen/MarketHeader";

export default function ConditionalHeader() {
  const pathname = usePathname();

  // Define pages where header should be hidden
  const hideHeaderRoutes = [
    "/login",
    "/register",
    "/forgot-password",
    "/verify-email",
  ];

  const shouldHideHeader =
    hideHeaderRoutes.includes(pathname) ||
    hideHeaderRoutes.some((route) => pathname.endsWith(route));

  if (shouldHideHeader) {
    return null;
  }

  return <MarketHeader />;
}
