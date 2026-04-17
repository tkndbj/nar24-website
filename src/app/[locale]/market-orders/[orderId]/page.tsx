// app/market-orders/[orderId]/page.tsx
//
// Server entry. Metadata only — the order itself is behind auth.
// Next.js 15 passes params as a Promise; if you're on 14, revert to the
// plain object shape.

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import MarketOrderDetailPage from "../../../components/market/MarketOrderDetailPage";

interface RouteParams {
  params: Promise<{ orderId: string }>;
}

export const metadata: Metadata = {
  // Order URLs should never be indexed.
  robots: { index: false, follow: false },
};

export async function generateMetadata(): Promise<Metadata> {
  try {
    const t = await getTranslations("market");
    return { ...metadata, title: t("orderDetailTitle") };
  } catch {
    return { ...metadata, title: "Order Detail" };
  }
}

export default async function Page({ params }: RouteParams) {
  const { orderId } = await params;
  return <MarketOrderDetailPage orderId={orderId} />;
}