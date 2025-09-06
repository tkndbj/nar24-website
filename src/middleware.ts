// middleware.ts
import createMiddleware from "next-intl/middleware";

import type { NextRequest } from "next/server";

const intlMiddleware = createMiddleware({
  locales: ["en", "tr"],
  defaultLocale: "tr",
  localePrefix: "as-needed",
});

export default function middleware(request: NextRequest) {
  // Check if this is a locale switch
  const response = intlMiddleware(request);

  // Add a header to indicate this is a locale switch
  const referer = request.headers.get("referer");
  if (referer && referer.includes(request.nextUrl.origin)) {
    response.headers.set("x-locale-switch", "true");
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)", "/"],
};
