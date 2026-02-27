"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import MarketHeader from "@/app/components/market_screen/MarketHeader";

const RestaurantHeader = dynamic(
  () => import("@/app/components/restaurants/RestaurantHeader"),
  { ssr: false, loading: () => null },
);

const HIDE_HEADER_ROUTES = [
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

const RESTAURANT_ROUTE_PREFIXES = [
  "/restaurants",
  "/restaurantdetail",
  "/cart-food",
  "/food-checkout",
];

function stripLocale(pathname: string): string {
  const match = pathname.match(/^\/[a-z]{2}(\/.*)?$/);
  return match ? match[1] || "/" : pathname;
}

export default function ConditionalHeader() {
  const pathname = usePathname();

  const shouldHideHeader =
    HIDE_HEADER_ROUTES.includes(pathname) ||
    HIDE_HEADER_ROUTES.some((route) => pathname.endsWith(route)) ||
    pathname.includes("/agreements");

  if (shouldHideHeader) {
    return null;
  }

  const stripped = stripLocale(pathname);
  const isRestaurantRoute = RESTAURANT_ROUTE_PREFIXES.some((prefix) =>
    stripped.startsWith(prefix),
  );

  if (isRestaurantRoute) {
    return <RestaurantHeader />;
  }

  return <MarketHeader />;
}