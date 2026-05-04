// app/[locale]/dynamicmarket2/page.tsx
//
// Server entry. Pre-fetches the first page of products via the same
// /api/fetchDynamicProducts endpoint the client uses and seeds the client
// component, eliminating the JS-download → hydrate → fetch waterfall.

import { ssrPrefetch } from "@/lib/ssr-prefetch-products";
import { ProductUtils, type Product } from "@/app/models/Product";
import type { SpecFacets } from "@/app/components/FilterSideBar";
import DynamicMarketPage, {
  type DynamicMarket2InitialData,
} from "./_client";

interface RouteSearchParams {
  category?: string;
  subcategory?: string;
  subsubcategory?: string;
  buyerCategory?: string;
  buyerSubcategory?: string;
}

interface RouteProps {
  searchParams: Promise<RouteSearchParams>;
}

interface RawApiResponse {
  products?: unknown[];
  hasMore?: boolean;
  specFacets?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function prefetchInitialData(
  sp: RouteSearchParams,
): Promise<DynamicMarket2InitialData | null> {
  // Page client returns early when no category — skip the SSR call too.
  if (!sp.category) return null;

  // Default sort on the client is "None" → mapped to "date" via toSortCode.
  const query: Record<string, string | undefined> = {
    page: "0",
    sort: "date",
    category: sp.category,
    subcategory: sp.subcategory,
    subsubcategory: sp.subsubcategory,
    buyerCategory: sp.buyerCategory,
    buyerSubcategory: sp.buyerSubcategory,
  };

  const raw = (await ssrPrefetch({
    apiPath: "/api/fetchDynamicProducts",
    query,
    revalidateSeconds: 60,
    cacheTag: "dynamic-products",
  })) as RawApiResponse | null;

  if (!raw || !Array.isArray(raw.products)) return null;

  const products: Product[] = raw.products.map((p) =>
    ProductUtils.fromJson(p as Record<string, unknown>),
  );

  return {
    products,
    specFacets: isRecord(raw.specFacets)
      ? (raw.specFacets as SpecFacets)
      : undefined,
    hasMore: typeof raw.hasMore === "boolean" ? raw.hasMore : false,
    matchKey:
      `${sp.category ?? ""}|${sp.subcategory ?? ""}|` +
      `${sp.subsubcategory ?? ""}|${sp.buyerCategory ?? ""}|` +
      `${sp.buyerSubcategory ?? ""}`,
  };
}

export default async function Page({ searchParams }: RouteProps) {
  const sp = await searchParams;
  const initialData = await prefetchInitialData(sp);
  return <DynamicMarketPage initialData={initialData} />;
}
