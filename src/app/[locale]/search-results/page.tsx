// app/[locale]/search-results/page.tsx
//
// Server entry. Pre-fetches the first page of search results via the same
// /api/search endpoint the client uses and seeds the client component,
// eliminating the JS-download → hydrate → fetch waterfall.

import { ssrPrefetch } from "@/lib/ssr-prefetch-products";
import { ProductUtils, type Product } from "@/app/models/Product";
import type { SpecFacets } from "@/app/components/FilterSideBar";
import SearchResultsPage, {
  type SearchResultsInitialData,
} from "./_client";

interface RouteSearchParams {
  q?: string;
}

interface RouteProps {
  searchParams: Promise<RouteSearchParams>;
}

interface RawShop {
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
  isActive?: boolean;
  createdAt: { seconds: number; nanoseconds: number };
}

interface RawApiResponse {
  products?: unknown[];
  shops?: RawShop[];
  hasMore?: boolean;
  specFacets?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function prefetchInitialData(
  sp: RouteSearchParams,
): Promise<SearchResultsInitialData | null> {
  const query = (sp.q ?? "").trim();
  if (!query) return null;

  // Default sort on the client is "None" → "relevance" via toSortCode.
  const raw = (await ssrPrefetch({
    apiPath: "/api/search",
    query: { q: query, page: "0", sort: "relevance" },
    revalidateSeconds: 60,
    cacheTag: "search-results",
  })) as RawApiResponse | null;

  if (!raw || !Array.isArray(raw.products)) return null;

  const products: Product[] = raw.products.map((p) =>
    ProductUtils.fromJson(p as Record<string, unknown>),
  );

  return {
    products,
    shopsRaw: Array.isArray(raw.shops) ? raw.shops : [],
    specFacets: isRecord(raw.specFacets)
      ? (raw.specFacets as SpecFacets)
      : undefined,
    hasMore: typeof raw.hasMore === "boolean" ? raw.hasMore : false,
    matchKey: query,
  };
}

export default async function Page({ searchParams }: RouteProps) {
  const sp = await searchParams;
  const initialData = await prefetchInitialData(sp);
  return <SearchResultsPage initialData={initialData} />;
}
