// app/[locale]/dynamicmarket/page.tsx
//
// Server entry for the dynamic market route. Reads the URL search params,
// pre-fetches the first page of products via the same /api/fetchDynamicProducts
// endpoint the client uses, and passes the result as `initialData` so the
// client can paint with real data on first frame instead of skeletons.

import { ssrPrefetch } from "@/lib/ssr-prefetch-products";
import { ProductUtils, type Product } from "@/app/models/Product";
import type { SpecFacets } from "@/app/components/FilterSideBar";
import DynamicMarketPage, {
  type DynamicMarketInitialData,
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

// Mirror the client's `toBuyerCategory` so the server-side query lines up
// exactly with what the client would request on its first fetch.
function toBuyerCategory(slug: string | undefined): "Women" | "Men" | null {
  if (slug === "women") return "Women";
  if (slug === "men") return "Men";
  return null;
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
): Promise<DynamicMarketInitialData | null> {
  const category = sp.category ?? "";
  if (!category) return null;

  const subcategory = sp.subcategory ?? "";
  const subsubcategory = sp.subsubcategory ?? "";
  const buyerCategory = toBuyerCategory(category);

  const query: Record<string, string | undefined> = {
    page: "0",
    sort: "date",
  };
  if (buyerCategory) {
    query.buyerCategory = buyerCategory;
  } else {
    query.category = category;
  }
  if (subcategory) query.subcategory = subcategory;
  if (subsubcategory) query.subsubcategory = subsubcategory;

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
    matchKey: `${category}|${subcategory}|${subsubcategory}`,
  };
}

export default async function Page({ searchParams }: RouteProps) {
  const sp = await searchParams;
  const initialData = await prefetchInitialData(sp);
  return <DynamicMarketPage initialData={initialData} />;
}
