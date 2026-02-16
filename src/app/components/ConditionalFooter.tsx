"use client";

import { usePathname } from "next/navigation";
import Footer from "@/app/components/Footer";

export default function ConditionalFooter() {
  const pathname = usePathname();

  // Define pages where footer should be hidden
  const hideFooterRoutes = [
    "/login",
    "/registration",
    "/forgot-password",
    "/verify-email",
    "/two-factor-verification",
    "/email-verification",
    "/complete-profile",
    "/dynamicteras",
    "/dynamicmarket",
    "/dynamicmarket2",
    "/shopdetail",
    "/search-results",
    "/complete-name",
    "/account-settings",
    "/profile",   
    "/support-and-faq",
    "/orders",
    "/password-reset",
  ];

  const shouldHideFooter =
    hideFooterRoutes.includes(pathname) ||
    hideFooterRoutes.some((route) => pathname.endsWith(route)) ||
    pathname.includes("/agreements") ||
    pathname.includes("/productdetail") ||
    pathname.includes("/listproduct") ||
    pathname.includes("/listproductpreview");

  if (shouldHideFooter) {
    return null;
  }

  return <Footer />;
}
