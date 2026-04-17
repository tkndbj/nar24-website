// app/market-receipts/[receiptId]/page.tsx
//
// Server entry. Metadata only — the receipt itself is behind auth and
// scoped to the current user. Next.js 15 passes params as a Promise;
// revert to `{ receiptId: string }` if on Next 14.

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import MarketReceiptDetailPage from "../../../components/market/MarketReceiptDetailPage";

interface RouteParams {
  params: Promise<{ receiptId: string }>;
}

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export async function generateMetadata(): Promise<Metadata> {
  try {
    const t = await getTranslations("market");
    return { ...metadata, title: t("receiptTitle") };
  } catch {
    return { ...metadata, title: "Receipt" };
  }
}

export default async function Page({ params }: RouteParams) {
  const { receiptId } = await params;
  return <MarketReceiptDetailPage receiptId={receiptId} />;
}