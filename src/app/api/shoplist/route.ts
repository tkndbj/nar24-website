// src/app/api/shopsList/route.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// SHOPS LIST API
//
// Two modes (mirrors Flutter's ShopProvider):
//
//   BROWSE  (no query):
//     Firestore — paginated cursor, optional category filter
//     Mirrors Flutter's _getShopsQuery() + _fetchInitialShops() / _fetchMoreShops()
//
//   SEARCH  (query present):
//     Typesense "shops" index + Firestore enrichment for fields not in TS
//     Mirrors Flutter's performAlgoliaSearch(query, category)
//     Category filter applied client-side after TS results (mirrors Flutter)
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import TypeSenseServiceManager from "@/lib/typesense_service_manager";
import { Timestamp } from "firebase-admin/firestore";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  PAGE_SIZE: 20,
  SEARCH_HITS: 100, // Typesense: fetch up to 100 and filter client-side
  CACHE_TTL: 30 * 1000,
  STALE_TTL: 2 * 60 * 1000,
  MAX_CACHE: 200,
  TIMEOUT_MS: 8_000,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ShopResult {
  id: string;
  name: string;
  profileImageUrl: string;
  coverImageUrls: string[];
  address: string;
  averageRating: number;
  reviewCount: number;
  followerCount: number;
  clickCount: number;
  categories: string[];
  contactNo: string;
  ownerId: string;
  isBoosted: boolean;
  isActive: boolean;
  createdAt: { seconds: number; nanoseconds: number };
}

interface ShopsListResponse {
  shops: ShopResult[];
  hasMore: boolean;
  cursor?: string; // Firestore document ID of last doc (browse mode)
  total: number;
  source: "browse" | "search";
  timing?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry {
  data: ShopsListResponse;
  ts: number;
  accessed: number;
}
const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<ShopsListResponse>>();

function cacheKey(sp: URLSearchParams): string {
  return JSON.stringify({
    q: sp.get("q") ?? "",
    cat: sp.get("category") ?? "",
    cur: sp.get("cursor") ?? "",
    pg: sp.get("page") ?? "0",
  });
}

function getCache(
  key: string,
): { data: ShopsListResponse; stale: boolean } | null {
  const e = cache.get(key);
  if (!e) return null;
  const age = Date.now() - e.ts;
  if (age > CONFIG.STALE_TTL) {
    cache.delete(key);
    return null;
  }
  e.accessed = Date.now();
  return { data: e.data, stale: age > CONFIG.CACHE_TTL };
}

function setCache(key: string, data: ShopsListResponse): void {
  if (cache.size >= CONFIG.MAX_CACHE) {
    const sorted = [...cache.entries()].sort(
      (a, b) => a[1].accessed - b[1].accessed,
    );
    sorted
      .slice(0, Math.floor(CONFIG.MAX_CACHE * 0.2))
      .forEach(([k]) => cache.delete(k));
  }
  cache.set(key, { data, ts: Date.now(), accessed: Date.now() });
}

// ─────────────────────────────────────────────────────────────────────────────
// Firestore → ShopResult normalizer
// ─────────────────────────────────────────────────────────────────────────────

function firestoreDocToShop(
  id: string,
  d: Record<string, unknown>,
): ShopResult {
  const ts = d.createdAt instanceof Timestamp ? d.createdAt : null;
  return {
    id,
    name: (d.name as string) ?? "",
    profileImageUrl: (d.profileImageUrl as string) ?? "",
    coverImageUrls: (d.coverImageUrls as string[]) ?? [],
    address: (d.address as string) ?? "",
    averageRating: (d.averageRating as number) ?? 0,
    reviewCount: (d.reviewCount as number) ?? 0,
    followerCount: (d.followerCount as number) ?? 0,
    clickCount: (d.clickCount as number) ?? 0,
    categories: (d.categories as string[]) ?? [],
    contactNo: (d.contactNo as string) ?? "",
    ownerId: (d.ownerId as string) ?? "",
    isBoosted: (d.isBoosted as boolean) ?? false,
    isActive: (d.isActive as boolean) ?? true,
    createdAt: ts
      ? { seconds: ts.seconds, nanoseconds: ts.nanoseconds }
      : { seconds: 0, nanoseconds: 0 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BROWSE mode — Firestore paginated
// Mirrors Flutter: _getShopsQuery() with isActive + optional category
// ─────────────────────────────────────────────────────────────────────────────

async function browseShops(
  category: string | null,
  cursor: string | null,
): Promise<ShopsListResponse> {
  const t0 = Date.now();
  const db = getFirestoreAdmin();

  let q = db
    .collection("shops")
    .where("isActive", "==", true)
    .orderBy("createdAt", "desc");

  if (category) {
    q = (q as ReturnType<typeof q.where>).where(
      "categories",
      "array-contains",
      category,
    );
  }

  // Cursor pagination — startAfter the last document
  if (cursor) {
    const cursorDoc = await db.collection("shops").doc(cursor).get();
    if (cursorDoc.exists) {
      q = (q as ReturnType<typeof q.where>).startAfter(cursorDoc);
    }
  }

  q = (q as ReturnType<typeof q.where>).limit(CONFIG.PAGE_SIZE);

  const snap = await (q as ReturnType<typeof db.collection>).get();
  const shops: ShopResult[] = snap.docs.map((doc) =>
    firestoreDocToShop(doc.id, doc.data() as Record<string, unknown>),
  );

  const lastId = snap.docs[snap.docs.length - 1]?.id ?? null;

  return {
    shops,
    hasMore: snap.docs.length === CONFIG.PAGE_SIZE,
    cursor: lastId ?? undefined,
    total: shops.length,
    source: "browse",
    timing: Date.now() - t0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH mode — Typesense + Firestore enrichment
// Mirrors Flutter: performAlgoliaSearch(query) + Firestore enrichment for
// missing coverImageUrls
// ─────────────────────────────────────────────────────────────────────────────

interface RawTSShop {
  id?: string;
  objectID?: string;
  name?: string;
  profileImageUrl?: string;
  isActive?: boolean;
  categories?: string[];
}

async function searchShops(
  query: string,
  category: string | null,
): Promise<ShopsListResponse> {
  const t0 = Date.now();
  const svc = TypeSenseServiceManager.instance.shopsService;

  const res = await svc.searchIdsWithFacets({
    indexName: "shops",
    query,
    page: 0,
    hitsPerPage: CONFIG.SEARCH_HITS,
    facetFilters: [["isActive:true"]],
    numericFilters: [],
    sortOption: "relevance",
  });

  if (!res.hits.length) {
    return {
      shops: [],
      hasMore: false,
      total: 0,
      source: "search",
      timing: Date.now() - t0,
    };
  }

  // Strip "shops_" id prefix (backfill artifact)
  const hitsWithIds = res.hits.map((hit) => {
    const raw = hit as RawTSShop;
    const rawId = String(raw.id ?? raw.objectID ?? "");
    const firestoreId = rawId.startsWith("shops_") ? rawId.slice(6) : rawId;
    return { firestoreId, raw };
  });

  // Enrich from Firestore — TS doesn't store coverImageUrls, address, ratings
  const db = getFirestoreAdmin();
  const enriched = await Promise.all(
    hitsWithIds.map(async ({ firestoreId, raw }) => {
      try {
        const snap = await db.collection("shops").doc(firestoreId).get();
        const d: Record<string, unknown> = snap.exists
          ? (snap.data() as Record<string, unknown>)
          : {};
        const ts = d.createdAt instanceof Timestamp ? d.createdAt : null;

        const shop: ShopResult = {
          id: firestoreId,
          name: (raw.name as string) ?? (d.name as string) ?? "",
          profileImageUrl:
            (raw.profileImageUrl as string) ??
            (d.profileImageUrl as string) ??
            "",
          coverImageUrls: (d.coverImageUrls as string[]) ?? [],
          address: (d.address as string) ?? "",
          averageRating: (d.averageRating as number) ?? 0,
          reviewCount: (d.reviewCount as number) ?? 0,
          followerCount: (d.followerCount as number) ?? 0,
          clickCount: (d.clickCount as number) ?? 0,
          categories:
            (raw.categories as string[]) ?? (d.categories as string[]) ?? [],
          contactNo: (d.contactNo as string) ?? "",
          ownerId: (d.ownerId as string) ?? "",
          isBoosted: (d.isBoosted as boolean) ?? false,
          isActive: raw.isActive ?? (d.isActive as boolean) ?? true,
          createdAt: ts
            ? { seconds: ts.seconds, nanoseconds: ts.nanoseconds }
            : { seconds: 0, nanoseconds: 0 },
        };
        return shop;
      } catch {
        return null;
      }
    }),
  );

  let shops = enriched.filter(
    (s): s is ShopResult => s !== null && s.isActive !== false,
  );

  // Category filter (mirrors Flutter: Algolia returns all, then filter by category)
  if (category) {
    shops = shops.filter((s) => s.categories.includes(category));
  }

  return {
    shops,
    hasMore: false, // Search returns all matches at once (no pagination needed)
    total: shops.length,
    source: "search",
    timing: Date.now() - t0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeout wrapper
// ─────────────────────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let id: NodeJS.Timeout;
  const t = new Promise<never>((_, rej) => {
    id = setTimeout(() => rej(new Error("timeout")), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  try {
    const sp = new URL(request.url).searchParams;
    const query = sp.get("q")?.trim() ?? "";
    const category = sp.get("category")?.trim() || null;
    const cursor = sp.get("cursor")?.trim() || null;

    const key = cacheKey(sp);
    const cached = getCache(key);

    const headers = (extra: Record<string, string> = {}) => ({
      "Cache-Control": "public, max-age=30, stale-while-revalidate=90",
      "X-Response-Time": `${Date.now() - t0}ms`,
      ...extra,
    });

    // ── Cache hit ──
    if (cached && !cached.stale) {
      return NextResponse.json(
        { ...cached.data, source: "cache" },
        { headers: headers({ "X-Cache": "HIT" }) },
      );
    }
    if (cached?.stale) {
      // Background revalidate
      const fetchFn = query
        ? searchShops(query, category)
        : browseShops(category, cursor);
      if (!pending.has(key)) {
        pending.set(key, fetchFn);
        fetchFn
          .then((r) => setCache(key, r))
          .catch(() => {})
          .finally(() => pending.delete(key));
      }
      return NextResponse.json(
        { ...cached.data, source: "stale" },
        { headers: headers({ "X-Cache": "STALE" }) },
      );
    }

    // ── In-flight dedup ──
    const inFlight = pending.get(key);
    if (inFlight) {
      try {
        const r = await withTimeout(inFlight, CONFIG.TIMEOUT_MS);
        return NextResponse.json(
          { ...r, source: "dedupe" },
          { headers: headers() },
        );
      } catch {
        /* fall through */
      }
    }

    // ── Fresh fetch ──
    const fetchPromise = query
      ? searchShops(query, category)
      : browseShops(category, cursor);
    pending.set(key, fetchPromise);

    try {
      const result = await withTimeout(fetchPromise, CONFIG.TIMEOUT_MS);
      setCache(key, result);
      return NextResponse.json(
        { ...result, source: "fresh" },
        {
          headers: headers({
            "X-Cache": "MISS",
            "X-Timing": `${result.timing}ms`,
          }),
        },
      );
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === "timeout";
      return NextResponse.json(
        {
          error: isTimeout ? "Request timed out" : "Fetch failed",
          shops: [],
          hasMore: false,
          total: 0,
        },
        { status: isTimeout ? 504 : 500 },
      );
    } finally {
      pending.delete(key);
    }
  } catch (err) {
    console.error("[shopsList] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error", shops: [], hasMore: false, total: 0 },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const n = cache.size;
  cache.clear();
  pending.clear();
  return NextResponse.json({ cleared: n });
}
