// market-orders/page.tsx
//
// Server entry. Metadata only — orders are behind auth and user-scoped.

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import MyMarketOrdersPage from "../../components/market/MyMarketOrdersPage";

const baseMetadata: Metadata = {
  robots: { index: false, follow: false },
};

export async function generateMetadata(): Promise<Metadata> {
  try {
    const t = await getTranslations("market");
    return {
      ...baseMetadata,
      title: t("myOrdersTitle"),
      description: t("myOrdersMetaDescription"),
    };
  } catch {
    return {
      ...baseMetadata,
      title: "My Market Orders",
      description: "View your past market orders",
    };
  }
}

export default function Page() {
  return <MyMarketOrdersPage />;
}