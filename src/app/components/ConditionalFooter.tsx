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
  ];

  const shouldHideFooter =
    hideFooterRoutes.includes(pathname) ||
    hideFooterRoutes.some((route) => pathname.endsWith(route));

  if (shouldHideFooter) {
    return null;
  }

  return <Footer />;
}
