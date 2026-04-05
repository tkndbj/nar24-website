import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // 5% of page/navigation transactions in production.
  // Enough to build statistically reliable P50/P95 — won't flood your quota.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 1.0,

  // Session Replay disabled — too bandwidth-heavy at e-commerce scale.
  // Re-enable with a low rate (0.01) only if you need UX debugging.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Never attach user PII (emails, IPs) to events automatically.
  sendDefaultPii: false,

  // Filter out browser noise that isn't actionable before sending to Sentry.
  beforeSend(event) {
    const msg = event.exception?.values?.[0]?.value ?? "";
    if (
      // Stale JS chunks after a new deployment — not a real error
      msg.includes("ChunkLoadError") ||
      msg.includes("Loading chunk") ||
      msg.includes("Failed to fetch dynamically imported module") ||
      // Browser/extension noise
      msg.includes("ResizeObserver loop") ||
      msg.includes("Non-Error exception captured") ||
      // Firebase auth flows that are handled in code
      msg.includes("auth/user-not-found") ||
      msg.includes("auth/wrong-password") ||
      msg.includes("auth/too-many-requests")
    ) {
      return null;
    }
    return event;
  },
});
