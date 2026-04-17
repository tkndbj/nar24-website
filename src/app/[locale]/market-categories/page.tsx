// app/market-categories/page.tsx
//
// Server entry for /market-categories. Owns SEO metadata; delegates all
// interactive rendering to the client component. Keeping the page itself
// as a server component lets Next.js emit proper <head> tags without
// forcing the whole tree client-side.

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import MarketCategoriesPage from "../../components/market/MarketCategoriesPage";

export async function generateMetadata(): Promise<Metadata> {
  // next-intl server helper — picks the active locale from the request.
  // If your project doesn't have next-intl's server module wired up yet,
  // replace this block with a static metadata object.
  try {
    const t = await getTranslations("market");
    return {
      title: t("categoryTitle"),
      description: t("categoryDescription"),
    };
  } catch {
    return {
      title: "Market Categories",
      description: "Browse all market categories",
    };
  }
}

export default function Page() {
  return <MarketCategoriesPage />;
}