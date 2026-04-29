// src/app/[locale]/productdetail/[productId]/page.tsx
// Server component — fetches ONLY essential product data so the HTML shell
// paints fast (~150–300ms). Bottom sections (seller, reviews, questions,
// related, collection, bundles) self-fetch client-side after hydration —
// the Flutter staged-rendering pattern.
//
// Internal navigations (clicking a product card) get even faster: loading.tsx
// reads the click-time product cache and renders the cached product instantly
// while this server component runs in the background.

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  fetchProductEssentials,
  normalizeProductId,
} from "@/lib/product-detail-fetcher";
import { ProductUtils } from "@/app/models/Product";
import ProductDetailClient from "./ProductDetailClient";

export const revalidate = 60;

interface Props {
  params: Promise<{ productId: string; locale: string }>;
}

// Deduplicate: both generateMetadata and the page component call this,
// but React cache() ensures the actual fetch only happens once per request.
const getCachedEssentials = cache(async (normalizedId: string) => {
  return fetchProductEssentials(normalizedId);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productId, locale } = await params;
  const normalizedId = normalizeProductId(productId);

  try {
    const data = await getCachedEssentials(normalizedId);
    if (!data) {
      return { title: "Product Not Found" };
    }

    const name = String(data.product.productName || "Product");
    const description = String(
      data.product.description || ""
    ).slice(0, 160);
    const storagePaths = Array.isArray(data.product.imageStoragePaths)
      ? (data.product.imageStoragePaths as unknown[]).map(String)
      : [];
    const legacyUrls = Array.isArray(data.product.imageUrls)
      ? (data.product.imageUrls as unknown[]).map(String)
      : [];

    const ogImage = storagePaths.length > 0
      ? `https://storage.googleapis.com/emlak-mobile-app.appspot.com/${storagePaths[0]}`
      : legacyUrls.length > 0
        ? legacyUrls[0]
        : undefined;

    const price = Number(data.product.price || 0);
    const currency = String(data.product.currency || "TRY");

    return {
      title: name,
      description: description || `${name} - Buy now`,
      openGraph: {
        title: name,
        description: description || `${name} - Buy now`,
        images: ogImage ? [{ url: ogImage }] : undefined,
        type: "website",
        locale,
      },
      other: {
        "product:price:amount": String(price),
        "product:price:currency": currency,
      },
    };
  } catch {
    return { title: "Product" };
  }
}

export default async function ProductDetailPage({ params }: Props) {
  const { productId, locale } = await params;
  const normalizedId = normalizeProductId(productId);
  const data = await getCachedEssentials(normalizedId);

  if (!data) {
    notFound();
  }

  const product = ProductUtils.fromJson(data.product);

  // Serialize product for the client boundary (ensure JSON-safe)
  const serializedProduct = JSON.parse(JSON.stringify(product));

  // Bottom sections self-fetch client-side (matches Flutter pattern).
  // Pass null so child widgets fall through to their own fetch logic.
  return (
    <ProductDetailClient
      product={serializedProduct}
      seller={null}
      reviews={[]}
      reviewsTotal={null}
      questions={[]}
      questionsTotal={null}
      relatedProducts={null}
      collection={null}
      bundles={null}
      salesConfig={data.salesConfig}
      locale={locale}
    />
  );
}
