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

  const shouldHideHeader = hideHeaderRoutes.includes(pathname);

  return !shouldHideHeader ? <MarketHeader /> : null;
}
