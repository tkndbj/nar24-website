// app/market-checkout/page.tsx
//
// Server entry. Metadata only — the page is behind auth and cart state,
// so there's nothing useful to pre-render.

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import MarketCheckoutPage from "../../components/market/MarketCheckoutPage";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const t = await getTranslations("market");
    return {
      title: t("checkoutTitle"),
      description: t("checkoutMetaDescription"),
    };
  } catch {
    return { title: "Checkout", description: "Complete your order" };
  }
}

export default function Page() {
  return <MarketCheckoutPage />;
}