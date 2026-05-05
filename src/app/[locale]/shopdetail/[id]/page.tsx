// app/[locale]/shopdetail/[id]/page.tsx
//
// Server entry for the shop detail route. Pre-fetches the shop document,
// first page of products, collections, reviews, and spec facets in a single
// /api/fetchShopBundle/[shopId] call and seeds the client component with the
// result, eliminating the JS-download → hydrate → fetch waterfall that the
// pure-client version suffered from.
//
// Failure-safe: when the prefetch returns null (timeout, 404, etc.) the
// client falls back to its existing fetch path — this layer is an
// optimization, not a correctness boundary.

import { ssrPrefetch } from "@/lib/ssr-prefetch-products";
import { ProductUtils, type Product } from "@/app/models/Product";
import ShopDetailPage, {
  type ShopBundleInitialData,
} from "./_client";

interface RouteParams {
  id: string;
  locale: string;
}

interface RouteProps {
  params: Promise<RouteParams>;
}

interface ShopWire {
  id: string;
  name: string;
  profileImageUrl: string;
  coverImageUrls: string[];
  homeImageUrls?: string[];
  homeImageLinks?: Record<string, string>;
  address: string;
  averageRating: number;
  reviewCount: number;
  followerCount: number;
  clickCount: number;
  categories: string[];
  contactNo: string;
  ownerId: string;
  isBoosted: boolean;
  createdAt: { seconds: number; nanoseconds: number };
}

interface RawApiResponse {
  shop?: ShopWire;
  products?: unknown[];
  collections?: unknown[];
  reviews?: unknown[];
  specFacets?: unknown;
  hasMore?: boolean;
  error?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function prefetchInitialData(
  shopId: string,
): Promise<ShopBundleInitialData | null> {
  if (!shopId) return null;

  const raw = (await ssrPrefetch({
    apiPath: `/api/fetchShopBundle/${encodeURIComponent(shopId)}`,
    query: {},
    revalidateSeconds: 60,
    cacheTag: "shop-bundle",
  })) as RawApiResponse | null;

  if (!raw || !raw.shop || !Array.isArray(raw.products)) return null;

  // Mirror the client's Typesense parse path — the bundle route forwards
  // raw Typesense hits, so `fromTypeSense` is the right factory here.
  const products: Product[] = raw.products
    .filter(isRecord)
    .map((p) => ProductUtils.fromTypeSense(p as Record<string, unknown>));

  // The bundle route already shapes these to the wire contract the client
  // expects (see fetchShopBundle/[shopId]/route.ts → ShopCollectionWire / ReviewWire).
  // Cast via unknown — TS can't narrow the structural match across module
  // boundaries without re-exporting every internal interface.
  const collections = (
    Array.isArray(raw.collections) ? raw.collections.filter(isRecord) : []
  ) as unknown as ShopBundleInitialData["collections"];

  const reviews = (
    Array.isArray(raw.reviews) ? raw.reviews.filter(isRecord) : []
  ) as unknown as ShopBundleInitialData["reviews"];

  const specFacets = isRecord(raw.specFacets)
    ? (raw.specFacets as ShopBundleInitialData["specFacets"])
    : {};

  return {
    shop: raw.shop as ShopBundleInitialData["shop"],
    products,
    collections,
    reviews,
    specFacets,
    hasMore: typeof raw.hasMore === "boolean" ? raw.hasMore : false,
    matchKey: shopId,
  };
}

export default async function Page({ params }: RouteProps) {
  const { id } = await params;
  const initialData = await prefetchInitialData(id);
  return <ShopDetailPage initialData={initialData} />;
}
