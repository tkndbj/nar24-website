// middleware.ts
import createMiddleware from "next-intl/middleware";

const intlMiddleware = createMiddleware({
  locales: ["en", "tr"],
  defaultLocale: "tr",
  localePrefix: "as-needed",
});

export default intlMiddleware;

export const config = {
  matcher: [
    // Match all routes except Next.js internals and static files
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
