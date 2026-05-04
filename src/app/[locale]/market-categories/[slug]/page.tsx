// app/market-categories/[slug]/page.tsx
//
// Server entry for /market-categories/:slug. Owns SEO metadata, validates the
// slug, and prefetches the first page of items so the client can paint with
// real products on the very first frame instead of skeletons.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { MARKET_CATEGORY_MAP } from "@/constants/marketCategories";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import type { MarketItem } from "@/lib/typesense_market_service";
import MarketCategoryDetailPage from "../../../components/market/MarketCategoriesDetailPage";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// Mirror MarketCategoryDetailPage's PAGE_SIZE. Kept in sync intentionally —
// if it ever drifts, the client's `hasMore` heuristic just becomes less
// accurate for one page; functionality still works.
const INITIAL_PAGE_SIZE = 20;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function toCreatedAtMillis(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (isRecord(v)) {
    const maybe = v as { toMillis?: () => number; _seconds?: number };
    if (typeof maybe.toMillis === "function") return maybe.toMillis();
    if (typeof maybe._seconds === "number") return maybe._seconds * 1000;
  }
  return null;
}

function toMarketItem(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): MarketItem {
  const d = doc.data();
  const imageUrls = Array.isArray(d.imageUrls)
    ? (d.imageUrls.filter((x: unknown): x is string => typeof x === "string"))
    : [];
  return {
    id: doc.id,
    name: typeof d.name === "string" ? d.name : "",
    brand: typeof d.brand === "string" ? d.brand : "",
    type: typeof d.type === "string" ? d.type : "",
    category: typeof d.category === "string" ? d.category : "",
    price: toNumber(d.price),
    stock: toNumber(d.stock),
    description: typeof d.description === "string" ? d.description : "",
    imageUrl: typeof d.imageUrl === "string" ? d.imageUrl : "",
    imageUrls,
    isAvailable: d.isAvailable !== false,
    createdAt: toCreatedAtMillis(d.createdAt),
    nutrition: isRecord(d.nutrition)
      ? (d.nutrition as Record<string, unknown>)
      : {},
  };
}

/**
 * Server-side prefetch of the first page of market items for a category.
 *
 * Cached on the server (per slug) for 60s. This keeps Firestore reads bounded
 * even under traffic spikes — popular categories are served from the Next.js
 * data cache without touching Firestore at all.
 *
 * Returns `null` on failure so the client component falls back to its own
 * fetch path. Never throws — this is a "try-to-make-it-faster" optimization,
 * not a correctness boundary.
 */
const getInitialMarketItems = unstable_cache(
  async (slug: string): Promise<MarketItem[] | null> => {
    try {
      const db = getFirestoreAdmin();
      const snap = await db
        .collection("market-items")
        .where("category", "==", slug)
        .where("isAvailable", "==", true)
        .orderBy("createdAt", "desc")
        .limit(INITIAL_PAGE_SIZE)
        .get();
      return snap.docs.map(toMarketItem);
    } catch (err) {
      console.warn("[market-categories/[slug]] SSR prefetch failed:", err);
      return null;
    }
  },
  ["market-category-initial-items"],
  { revalidate: 60, tags: ["market-items"] },
);

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const category = MARKET_CATEGORY_MAP.get(slug);
  try {
    const t = await getTranslations("market");
    const locale = await getLocale();
    const label = category
      ? locale === "tr"
        ? category.labelTr
        : category.label
      : t("categoryFallbackTitle");
    return {
      title: label,
      description: t("categoryDetailDescription", { category: label }),
    };
  } catch {
    return {
      title: category?.label ?? "Market",
      description: "Browse products",
    };
  }
}

export default async function Page({ params }: RouteParams) {
  const { slug } = await params;
  if (!MARKET_CATEGORY_MAP.has(slug)) notFound();

  // Prefetch and SSR-pass. `null` is fine — client handles it.
  const initialItems = await getInitialMarketItems(slug);

  return (
    <MarketCategoryDetailPage
      categorySlug={slug}
      initialItems={initialItems}
    />
  );
}