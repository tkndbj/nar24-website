// app/isbankmarketpayment/page.tsx
//
// Server entry. The client component reads URL search params via
// useSearchParams — in Next.js 15 that emits a hydration warning unless
// the consumer is inside a <Suspense> boundary, so we wrap it here.

import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import MarketPaymentPage from "../../components/market/MarketPaymentPage";

// Explicitly disallow search indexing — this URL carries one-shot payment
// parameters and should never appear in the wild.
const baseMetadata: Metadata = {
  robots: { index: false, follow: false },
};

export async function generateMetadata(): Promise<Metadata> {
  try {
    const t = await getTranslations("market");
    return {
      ...baseMetadata,
      title: t("paymentSecureTitle"),
    };
  } catch {
    return { ...baseMetadata, title: "Secure Payment" };
  }
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MarketPaymentPage />
    </Suspense>
  );
}