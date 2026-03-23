// src/app/[locale]/productdetail/[productId]/page.tsx
// Server component — fetches data server-side for instant HTML + SEO

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  fetchAllProductData,
  fetchProductOnly,
  normalizeProductId,
} from "@/lib/product-detail-fetcher";
import { ProductUtils } from "@/app/models/Product";
import ProductDetailClient from "./ProductDetailClient";

interface Props {
  params: Promise<{ productId: string; locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productId, locale } = await params;
  const normalizedId = normalizeProductId(productId);

  try {
    const productData = await fetchProductOnly(normalizedId);
    if (!productData) {
      return { title: "Product Not Found" };
    }

    const name = String(productData.productName || "Product");
    const description = String(
      productData.description || ""
    ).slice(0, 160);
    const images = Array.isArray(productData.imageUrls)
      ? productData.imageUrls.map(String)
      : [];
    const price = Number(productData.price || 0);
    const currency = String(productData.currency || "TRY");

    return {
      title: name,
      description: description || `${name} - Buy now`,
      openGraph: {
        title: name,
        description: description || `${name} - Buy now`,
        images: images.length > 0 ? [{ url: images[0] }] : undefined,
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
  const t = await getTranslations({ locale });

  const data = await fetchAllProductData(normalizedId);

  if (!data) {
    notFound();
  }

  const product = ProductUtils.fromJson(data.product);

  // Serialize product for the client boundary (ensure JSON-safe)
  const serializedProduct = JSON.parse(JSON.stringify(product));

  return (
    <ProductDetailClient
      product={serializedProduct}
      seller={data.seller}
      reviews={data.reviews}
      reviewsTotal={data.reviewsTotal}
      questions={data.questions}
      questionsTotal={data.questionsTotal}
      relatedProducts={data.relatedProducts}
      collection={data.collection}
      bundles={data.bundles}
      locale={locale}
    />
  );
}
