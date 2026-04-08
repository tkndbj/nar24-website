import { doc, writeBatch, getFirestore, increment, serverTimestamp } from "firebase/firestore";
import { getAnalytics, logEvent } from "firebase/analytics";
import { db } from "@/lib/firebase";
let analytics: ReturnType<typeof getAnalytics> | null = null;

function getAnalyticsInstance() {
    if (!analytics && typeof window !== "undefined") {
      try { analytics = getAnalytics(); } catch (_) {}
    }
    return analytics;
  }

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export async function writeProductClick(
  productId: string,
  collection: string,
  shopId?: string,
  metadata?: {
    productName?: string;
    category?: string;
    subcategory?: string;
    subsubcategory?: string;
    brand?: string;
    gender?: string;
  }
) {
  // GA4
  const a = getAnalyticsInstance();
  if (a) {
    logEvent(a, "product_click", {
      product_id: productId,
      shop_id: shopId ?? "",
      collection,
      product_name: (metadata?.productName ?? "").substring(0, 100),
      category: metadata?.category ?? "",
      subcategory: metadata?.subcategory ?? "",
      subsubcategory: metadata?.subsubcategory ?? "",
      brand: metadata?.brand ?? "",
      gender: metadata?.gender ?? "",
    });
  }

  // Distributed shard + dirty marker
  const shardIndex = hashCode(productId) % 10;
  try {
    const batch = writeBatch(db);

    batch.set(
      doc(db, collection, productId, "click_shards", `shard_${shardIndex}`),
      { count: increment(1) },
      { merge: true }
    );
    batch.set(
      doc(db, "_dirty_clicks", productId),
      { collection, updatedAt: serverTimestamp() },
      { merge: true }
    );

    if (shopId) {
      const shopShardIndex = hashCode(shopId) % 10;
      batch.set(
        doc(db, "shops", shopId, "click_shards", `shard_${shopShardIndex}`),
        { count: increment(1) },
        { merge: true }
      );
      batch.set(
        doc(db, "_dirty_clicks", shopId),
        { collection: "shops", updatedAt: serverTimestamp() },
        { merge: true }
      );
    }

    await batch.commit();
  } catch (_) {}
}

export async function writeShopClick(shopId: string) {
  const a = getAnalyticsInstance();
  if (a) {
    logEvent(a, "shop_click", { shop_id: shopId });
  }

  const shardIndex = hashCode(shopId) % 10;
  try {
    const batch = writeBatch(db);
    batch.set(
      doc(db, "shops", shopId, "click_shards", `shard_${shardIndex}`),
      { count: increment(1) },
      { merge: true }
    );
    batch.set(
      doc(db, "_dirty_clicks", shopId),
      { collection: "shops", updatedAt: serverTimestamp() },
      { merge: true }
    );
    await batch.commit();
  } catch (_) {}
}