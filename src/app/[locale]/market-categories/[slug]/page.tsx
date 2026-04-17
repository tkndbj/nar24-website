// app/market-categories/[slug]/page.tsx
//
// Server entry for /market-categories/:slug. Owns SEO metadata and validates
// the slug before delegating to the client component.
//
// Note: Next.js 15 made route params async (they're now a Promise). If
// you're on Next 14, change `params` back to the plain object shape.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { MARKET_CATEGORY_MAP } from "@/constants/marketCategories";
import MarketCategoryDetailPage from "../../../components/market/MarketCategoriesDetailPage";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: RouteParams): Promise<Metadata> {
  const { slug } = await params;
  const category = MARKET_CATEGORY_MAP.get(slug);
  try {
    const t = await getTranslations("market");
    const locale = await getLocale();
    const label = category
      ? locale === "tr"
        ? category.labelTr
        : category.label
      : t("categoryFallbackTitle");
    return {
      title: label,
      description: t("categoryDetailDescription", { category: label }),
    };
  } catch {
    return {
      title: category?.label ?? "Market",
      description: "Browse products",
    };
  }
}

export default async function Page({ params }: RouteParams) {
  const { slug } = await params;
  if (!MARKET_CATEGORY_MAP.has(slug)) notFound();
  return <MarketCategoryDetailPage categorySlug={slug} />;
}