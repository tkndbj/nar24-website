// src/lib/ssr-prefetch-products.ts
//
// Server-side prefetch helper for the dynamic product list pages.
//
// Each page (dynamicmarket, dynamicmarket2, dynamicteras, search-results) is a
// `'use client'` component that reads URL params and fetches its first page of
// products via an existing API route. To eliminate the JS-download → hydrate →
// fetch waterfall, we pre-call those same API routes from the server and pass
// the results to the client as `initialData`.
//
// We deliberately reuse the existing API routes rather than calling Firestore
// directly here, because the routes already encapsulate non-trivial logic
// (category mapping, Typesense fallbacks, retries, server-side caching). One
// extra in-process HTTP hop is the right trade-off for keeping a single source
// of truth.
//
// Failure mode: ALWAYS returns `null` on error. The client component is
// expected to fall back to its existing fetch path. This helper is an
// optimization layer, not a correctness boundary.

import { headers } from "next/headers";

/**
 * Resolve an absolute URL for an internal API path. Works in:
 *   • local dev          → http://localhost:3000/...
 *   • Vercel preview/prod → https://{deployment-host}/...
 *   • behind a reverse-proxy (e.g. Cloudflare) — uses x-forwarded-* headers
 *
 * Server components run inside the same Node process as the route handlers,
 * so this always loops back to the same instance.
 */
async function buildInternalUrl(path: string): Promise<string> {
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ??
    h.get("host") ??
    process.env.VERCEL_URL ??
    "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${proto}://${host}${normalized}`;
}

interface PrefetchOptions {
  /** API route path, e.g. "/api/fetchDynamicProducts". Must start with "/". */
  apiPath: string;
  /** Query string params to forward (already URL-encoded if needed). */
  query: Record<string, string | undefined>;
  /**
   * Cache hint for Next's data cache. The underlying API route also uses
   * `unstable_cache`, so this is mostly a belt-and-braces — when a popular
   * URL is hit twice within the window, we save even the in-process call.
   */
  revalidateSeconds?: number;
  /** Cache tag for `revalidateTag()`-driven invalidation. Optional. */
  cacheTag?: string;
  /**
   * Hard timeout for the SSR fetch. Don't let a slow upstream block TTFB —
   * if it doesn't return in time, fall back to client-side fetch.
   */
  timeoutMs?: number;
}

/**
 * Generic SSR prefetch. Returns the parsed JSON body on 2xx, or `null` for
 * any non-success outcome (HTTP error, timeout, parse failure).
 *
 * The return type is `unknown` — callers should narrow it with their own
 * type guards, since the API route shapes vary between endpoints.
 */
export async function ssrPrefetch({
  apiPath,
  query,
  revalidateSeconds = 60,
  cacheTag,
  timeoutMs = 3500,
}: PrefetchOptions): Promise<unknown | null> {
  const qp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v != null && v !== "") qp.set(k, v);
  }

  let url: string;
  try {
    url = await buildInternalUrl(`${apiPath}?${qp.toString()}`);
  } catch (err) {
    console.warn("[ssrPrefetch] URL build failed:", err);
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      next: {
        revalidate: revalidateSeconds,
        ...(cacheTag ? { tags: [cacheTag] } : {}),
      },
      // Server-to-server call — no cookies needed and avoids accidentally
      // forwarding the visitor's session to a cached response.
      headers: { "x-ssr-prefetch": "1" },
    });

    if (!res.ok) {
      console.warn(
        `[ssrPrefetch] ${apiPath} returned ${res.status}`,
      );
      return null;
    }
    return await res.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn(`[ssrPrefetch] ${apiPath} timed out after ${timeoutMs}ms`);
    } else {
      console.warn(`[ssrPrefetch] ${apiPath} failed:`, err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
