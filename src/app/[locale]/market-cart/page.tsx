// app/market-cart/page.tsx
//
// Server entry for /market-cart. Metadata only; interactivity lives in the
// client component.

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import MarketCartPage from "../../components/market/MarketCartPage";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const t = await getTranslations("market");
    return {
      title: t("cartTitle"),
      description: t("cartMetaDescription"),
    };
  } catch {
    return { title: "Shopping Cart", description: "Review your cart" };
  }
}

export default function Page() {
  return <MarketCartPage />;
}