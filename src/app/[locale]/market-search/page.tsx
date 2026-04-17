// app/market-search/page.tsx
//
// Server entry for /market-search?q=…
// The client component reads `q` via useSearchParams; in Next.js 15 that
// requires a <Suspense> boundary around the consumer.

import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import MarketSearchResultsPage from "../../components/market/MarketSearchResultsPage";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const t = await getTranslations("market");
    return {
      title: t("searchResultsTitle"),
      description: t("searchResultsMetaDescription"),
    };
  } catch {
    return {
      title: "Search Results",
      description: "Search across all market products",
    };
  }
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MarketSearchResultsPage />
    </Suspense>
  );
}