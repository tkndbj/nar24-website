import { unstable_cache } from "next/cache";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import SecondHeader from "../components/market_screen/SecondHeader";
import Footer from "../components/Footer";
import HomeWidgets from "../components/market_screen/HomeWidgets";
import {
  MarketWidgetConfig,
  DEFAULT_WIDGETS,
  VALID_WIDGET_TYPES,
  WidgetType,
  PrefetchedWidgetData,
  PrefetchedBannerItem,
  PrefetchedBoostedProduct,
  PrefetchedShop,
  PrefetchedDynamicListConfig,
  PrefetchedProduct,
} from "@/types/MarketLayout";

// ============================================================================
// SERVER-SIDE DATA FETCHING
// ============================================================================

const FIRESTORE_COLLECTION = "app_config";
const FIRESTORE_DOC_WEB = "market_layout_web";
const FIRESTORE_DOC_SHARED = "market_layout";

/**
 * Parse and validate widgets from Firestore document data.
 * Same validation logic as the client-side hook, running on the server.
 */
function parseWidgets(
  data: FirebaseFirestore.DocumentData | undefined
): MarketWidgetConfig[] {
  if (!data?.widgets || !Array.isArray(data.widgets)) return [];

  const seenIds = new Set<string>();
  const valid: MarketWidgetConfig[] = [];

  for (const w of data.widgets) {
    if (
      !w?.id ||
      !w?.type ||
      typeof w.isVisible !== "boolean" ||
      typeof w.order !== "number"
    )
      continue;
    if (!VALID_WIDGET_TYPES.includes(w.type as WidgetType)) continue;
    if (seenIds.has(w.id)) continue;

    seenIds.add(w.id);
    valid.push({
      id: String(w.id),
      name: typeof w.name === "string" ? w.name : "",
      type: w.type as WidgetType,
      isVisible: Boolean(w.isVisible),
      order: Number(w.order),
    });
  }

  return valid
    .filter((w) => w.isVisible)
    .sort((a, b) => a.order - b.order);
}

/**
 * Fetch layout config from Firestore using the Admin SDK.
 * Cached on the server for 60 seconds via unstable_cache.
 *
 * Priority: web-specific document → shared fallback → hardcoded defaults.
 */
const getMarketLayout = unstable_cache(
  async (): Promise<MarketWidgetConfig[]> => {
    try {
      const db = getFirestoreAdmin();

      // 1. Try web-specific document first
      const webDoc = await db
        .collection(FIRESTORE_COLLECTION)
        .doc(FIRESTORE_DOC_WEB)
        .get();

      if (webDoc.exists) {
        const widgets = parseWidgets(webDoc.data());
        if (widgets.length > 0) return widgets;
      }

      // 2. Fallback to shared document
      const sharedDoc = await db
        .collection(FIRESTORE_COLLECTION)
        .doc(FIRESTORE_DOC_SHARED)
        .get();

      if (sharedDoc.exists) {
        const widgets = parseWidgets(sharedDoc.data());
        if (widgets.length > 0) return widgets;
      }

      // 3. Hardcoded defaults
      return DEFAULT_WIDGETS.filter((w) => w.isVisible).sort(
        (a, b) => a.order - b.order
      );
    } catch (error) {
      console.error("[MarketLayout] Server fetch error:", error);
      return DEFAULT_WIDGETS.filter((w) => w.isVisible).sort(
        (a, b) => a.order - b.order
      );
    }
  },
  ["market-layout"],
  { revalidate: 60 }
);

// ============================================================================
// WIDGET DATA PREFETCHING
// ============================================================================

/** Convert Firestore Admin Timestamp to epoch milliseconds */
function toEpoch(value: unknown): number | undefined {
  if (!value) return undefined;
  if (typeof value === "number") return value;
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value instanceof Date) return value.getTime();
  return undefined;
}

/** Helper to extract banner fields from Firestore doc */
function parseBannerDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): PrefetchedBannerItem | null {
  const d = doc.data();
  if (!d.imageUrl) return null;
  return {
    id: doc.id,
    imageUrl: d.imageUrl as string,
    dominantColor: d.dominantColor as number | undefined,
    linkType: d.linkType as string | undefined,
    linkedShopId: d.linkedShopId as string | undefined,
    linkedProductId: d.linkedProductId as string | undefined,
  };
}

const prefetchAdsBanners = unstable_cache(
  async (): Promise<PrefetchedBannerItem[]> => {
    const db = getFirestoreAdmin();
    const snapshot = await db
      .collection("market_top_ads_banners")
      .where("isActive", "==", true)
      .orderBy("createdAt", "desc")
      .get();
    const items: PrefetchedBannerItem[] = [];
    for (const doc of snapshot.docs) {
      const item = parseBannerDoc(doc);
      if (item) items.push(item);
    }
    return items;
  },
  ["prefetch-ads-banners"],
  { revalidate: 120 },
);

const prefetchThinBanners = unstable_cache(
  async (): Promise<PrefetchedBannerItem[]> => {
    const db = getFirestoreAdmin();
    const snapshot = await db
      .collection("market_thin_banners")
      .where("isActive", "==", true)
      .orderBy("createdAt", "desc")
      .get();
    const items: PrefetchedBannerItem[] = [];
    for (const doc of snapshot.docs) {
      const item = parseBannerDoc(doc);
      if (item) items.push(item);
    }
    return items;
  },
  ["prefetch-thin-banners"],
  { revalidate: 120 },
);

const prefetchMarketBanners = unstable_cache(
  async (): Promise<PrefetchedBannerItem[]> => {
    const db = getFirestoreAdmin();
    const snapshot = await db
      .collection("market_banners")
      .where("isActive", "==", true)
      .orderBy("createdAt", "desc")
      .limit(20)
      .get();
    const items: PrefetchedBannerItem[] = [];
    for (const doc of snapshot.docs) {
      const item = parseBannerDoc(doc);
      if (item) items.push(item);
    }
    return items;
  },
  ["prefetch-market-banners"],
  { revalidate: 120 },
);

const prefetchBoostedProducts = unstable_cache(
  async (): Promise<PrefetchedBoostedProduct[]> => {
    const db = getFirestoreAdmin();
    const snapshot = await db
      .collection("products")
      .where("isBoosted", "==", true)
      .where("isActive", "==", true)
      .orderBy("boostStartedAt", "desc")
      .limit(10)
      .get();
    const items: PrefetchedBoostedProduct[] = [];
    for (const doc of snapshot.docs) {
      const d = doc.data();
      if (!d.name || !d.price) continue;
      items.push({
        id: doc.id,
        name: d.name as string,
        price: Number(d.price) || 0,
        originalPrice: d.originalPrice ? Number(d.originalPrice) : undefined,
        currency: (d.currency as string) || "TRY",
        imageUrl: (d.imageUrl || d.images?.[0] || "") as string,
        shopId: (d.shopId || "") as string,
        shopName: d.shopName as string | undefined,
        isBoosted: true as const,
        boostExpiresAt: toEpoch(d.boostExpiresAt),
        category: d.category as string | undefined,
        subcategory: d.subcategory as string | undefined,
        rating: d.rating ? Number(d.rating) : undefined,
        reviewCount: d.reviewCount ? Number(d.reviewCount) : undefined,
      });
    }
    return items;
  },
  ["prefetch-boosted-products"],
  { revalidate: 60 },
);

/** Convert a Firestore Admin document to PrefetchedProduct (fields ProductCard needs) */
function parseProductDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): PrefetchedProduct | null {
  const d = doc.data();
  if (!d.productName && !d.title) return null;
  if (!d.price) return null;

  // Parse colorImages safely
  let colorImages: Record<string, string[]> | undefined;
  if (d.colorImages && typeof d.colorImages === "object") {
    colorImages = {};
    for (const [key, val] of Object.entries(d.colorImages)) {
      if (Array.isArray(val)) colorImages[key] = val as string[];
    }
  }

  // Parse colorQuantities safely
  let colorQuantities: Record<string, number> | undefined;
  if (d.colorQuantities && typeof d.colorQuantities === "object") {
    colorQuantities = {};
    for (const [key, val] of Object.entries(d.colorQuantities)) {
      colorQuantities[key] = Number(val) || 0;
    }
  }

  // Parse attributes safely (strip spec keys, keep misc only)
  let attributes: Record<string, unknown> | undefined;
  if (d.attributes && typeof d.attributes === "object" && !Array.isArray(d.attributes)) {
    const raw = { ...(d.attributes as Record<string, unknown>) };
    const specKeys = [
      "clothingSizes", "clothingFit", "clothingTypes", "pantSizes",
      "pantFabricTypes", "footwearSizes", "jewelryMaterials",
      "consoleBrand", "curtainMaxWidth", "curtainMaxHeight",
      "productType", "gender",
    ];
    for (const k of specKeys) delete raw[k];
    if (Object.keys(raw).length > 0) attributes = raw;
  }

  return {
    id: doc.id,
    productName: (d.productName || d.title || "") as string,
    imageUrls: Array.isArray(d.imageUrls) ? (d.imageUrls as string[]) : [],
    price: Number(d.price) || 0,
    currency: (d.currency as string) || "TL",
    condition: d.condition as string | undefined,
    brandModel: (d.brandModel || d.brand) as string | undefined,
    quantity: d.quantity != null ? Number(d.quantity) : undefined,
    colorQuantities,
    colorImages,
    averageRating: d.averageRating != null ? Number(d.averageRating) : undefined,
    discountPercentage: d.discountPercentage != null ? Number(d.discountPercentage) : undefined,
    deliveryOption: d.deliveryOption as string | undefined,
    campaignName: d.campaignName as string | undefined,
    isBoosted: d.isBoosted === true ? true : undefined,
    category: d.category as string | undefined,
    subcategory: d.subcategory as string | undefined,
    subsubcategory: d.subsubcategory as string | undefined,
    gender: d.gender as string | undefined,
    shopId: d.shopId as string | undefined,
    clothingSizes: Array.isArray(d.clothingSizes) ? (d.clothingSizes as string[]) : undefined,
    pantSizes: Array.isArray(d.pantSizes) ? (d.pantSizes as string[]) : undefined,
    footwearSizes: Array.isArray(d.footwearSizes) ? (d.footwearSizes as string[]) : undefined,
    jewelryMaterials: Array.isArray(d.jewelryMaterials) ? (d.jewelryMaterials as string[]) : undefined,
    attributes,
  };
}

/** Batch-fetch product docs from shop_products by IDs (Firestore Admin, max 30 per batch) */
async function fetchProductDocsByIds(
  db: FirebaseFirestore.Firestore,
  productIds: string[],
  maxProducts: number = 30,
): Promise<PrefetchedProduct[]> {
  const products: PrefetchedProduct[] = [];
  const BATCH_SIZE = 30; // Firestore "in" limit

  for (let i = 0; i < productIds.length && products.length < maxProducts; i += BATCH_SIZE) {
    const batch = productIds.slice(i, i + BATCH_SIZE);
    const snapshot = await db
      .collection("shop_products")
      .where("__name__", "in", batch)
      .get();

    for (const doc of snapshot.docs) {
      if (products.length >= maxProducts) break;
      const parsed = parseProductDoc(doc);
      if (parsed) products.push(parsed);
    }
  }

  // Maintain the original order from productIds
  const productMap = new Map(products.map((p) => [p.id, p]));
  return productIds
    .filter((id) => productMap.has(id))
    .map((id) => productMap.get(id)!)
    .slice(0, maxProducts);
}

const prefetchPreferenceProducts = unstable_cache(
  async (): Promise<PrefetchedProduct[]> => {
    const db = getFirestoreAdmin();

    // 1. Fetch trending product IDs
    const trendingDoc = await db.collection("trending_products").doc("global").get();
    if (!trendingDoc.exists) return [];
    const allIds = (trendingDoc.data()?.products || []) as string[];
    if (allIds.length === 0) return [];

    // 2. Sample up to 30 random IDs
    const sampleSize = Math.min(30, allIds.length);
    const sampled: string[] = [];
    const indices = new Set<number>();
    while (indices.size < sampleSize) {
      indices.add(Math.floor(Math.random() * allIds.length));
    }
    for (const i of indices) sampled.push(allIds[i]);

    // 3. Fetch full product documents
    return fetchProductDocsByIds(db, sampled, 30);
  },
  ["prefetch-preference-products"],
  { revalidate: 60 },
);

const prefetchDynamicListConfigs = unstable_cache(
  async (): Promise<PrefetchedDynamicListConfig[]> => {
    const db = getFirestoreAdmin();

    // 1. Fetch list configs
    const snapshot = await db
      .collection("dynamic_product_lists")
      .where("isActive", "==", true)
      .orderBy("order")
      .get();

    const configs: PrefetchedDynamicListConfig[] = [];

    // 2. For each config, fetch its products in parallel
    const configPromises = snapshot.docs.map(async (doc) => {
      const d = doc.data();
      const config: PrefetchedDynamicListConfig = {
        id: doc.id,
        title: (d.title || "Product List") as string,
        isActive: true,
        order: Number(d.order) || 0,
        gradientStart: d.gradientStart as string | undefined,
        gradientEnd: d.gradientEnd as string | undefined,
        selectedProductIds: d.selectedProductIds as string[] | undefined,
        selectedShopId: d.selectedShopId as string | undefined,
        limit: d.limit ? Number(d.limit) : undefined,
        showViewAllButton: d.showViewAllButton as boolean | undefined,
      };

      // Fetch products for this list
      try {
        if (config.selectedProductIds && config.selectedProductIds.length > 0) {
          config.prefetchedProducts = await fetchProductDocsByIds(
            db,
            config.selectedProductIds,
            20,
          );
        } else if (config.selectedShopId) {
          const shopLimit = Math.min(Math.max(config.limit ?? 10, 1), 20);
          const shopSnapshot = await db
            .collection("shop_products")
            .where("shopId", "==", config.selectedShopId)
            .limit(shopLimit)
            .get();
          const products: PrefetchedProduct[] = [];
          for (const productDoc of shopSnapshot.docs) {
            const parsed = parseProductDoc(productDoc);
            if (parsed) products.push(parsed);
          }
          config.prefetchedProducts = products;
        }
      } catch (e) {
        console.error(`[Prefetch] Error fetching products for list ${doc.id}:`, e);
      }

      return config;
    });

    const results = await Promise.allSettled(configPromises);
    for (const result of results) {
      if (result.status === "fulfilled") configs.push(result.value);
    }

    return configs.sort((a, b) => a.order - b.order);
  },
  ["prefetch-dynamic-list-configs-with-products"],
  { revalidate: 120 },
);

const prefetchShops = unstable_cache(
  async (): Promise<PrefetchedShop[]> => {
    const db = getFirestoreAdmin();
    const shops: PrefetchedShop[] = [];

    // 1. Try configured featured shops
    try {
      const configDoc = await db
        .collection("app_config")
        .doc("featured_shops")
        .get();
      if (configDoc.exists) {
        const shopIds = configDoc.data()?.shopIds as string[] | undefined;
        if (shopIds && shopIds.length > 0) {
          for (const id of shopIds) {
            try {
              const shopDoc = await db.collection("shops").doc(id).get();
              if (!shopDoc.exists) continue;
              const d = shopDoc.data()!;
              if (d.isActive === false || !d.name) continue;
              shops.push({
                id: shopDoc.id,
                name: d.name as string,
                description: d.description as string | undefined,
                logoUrl: (d.logoUrl || d.profileImageUrl) as string | undefined,
                coverImageUrl: d.coverImageUrl as string | undefined,
                coverImageUrls: Array.isArray(d.coverImageUrls) ? d.coverImageUrls as string[] : undefined,
                profileImageUrl: d.profileImageUrl as string | undefined,
                averageRating: Number(d.averageRating) || 0,
                reviewCount: Number(d.reviewCount) || 0,
                productCount: Number(d.productCount) || 0,
                category: d.category as string | undefined,
                isVerified: Boolean(d.isVerified),
                ownerId: (d.ownerId || "") as string,
              });
            } catch { /* skip individual shop errors */ }
          }
          if (shops.length > 0) return shops;
        }
      }
    } catch { /* fall through to fallback */ }

    // 2. Fallback: top-rated active shops
    const snapshot = await db
      .collection("shops")
      .where("isActive", "==", true)
      .orderBy("averageRating", "desc")
      .limit(10)
      .get();
    snapshot.docs.forEach((doc) => {
      const d = doc.data();
      if (!d.name) return;
      shops.push({
        id: doc.id,
        name: d.name as string,
        description: d.description as string | undefined,
        logoUrl: (d.logoUrl || d.profileImageUrl) as string | undefined,
        coverImageUrl: d.coverImageUrl as string | undefined,
        coverImageUrls: Array.isArray(d.coverImageUrls) ? d.coverImageUrls as string[] : undefined,
        profileImageUrl: d.profileImageUrl as string | undefined,
        averageRating: Number(d.averageRating) || 0,
        reviewCount: Number(d.reviewCount) || 0,
        productCount: Number(d.productCount) || 0,
        category: d.category as string | undefined,
        isVerified: Boolean(d.isVerified),
        ownerId: (d.ownerId || "") as string,
      });
    });
    return shops;
  },
  ["prefetch-shops"],
  { revalidate: 180 },
);

/**
 * Prefetch all widget data in parallel based on visible widgets.
 * Each fetch is independent — one failure doesn't block others.
 */
async function prefetchAllWidgetData(
  widgets: MarketWidgetConfig[],
): Promise<PrefetchedWidgetData> {
  const visibleTypes = new Set(widgets.map((w) => w.type));
  const data: PrefetchedWidgetData = {};
  const fetches: Promise<void>[] = [];

  if (visibleTypes.has("ads_banner")) {
    fetches.push(
      prefetchAdsBanners()
        .then((r) => { data.ads_banner = r; })
        .catch(() => { data.ads_banner = null; }),
    );
  }
  if (visibleTypes.has("thin_banner")) {
    fetches.push(
      prefetchThinBanners()
        .then((r) => { data.thin_banner = r; })
        .catch(() => { data.thin_banner = null; }),
    );
  }
  if (visibleTypes.has("market_banner")) {
    fetches.push(
      prefetchMarketBanners()
        .then((r) => { data.market_banner = r; })
        .catch(() => { data.market_banner = null; }),
    );
  }
  if (visibleTypes.has("boosted_product_carousel")) {
    fetches.push(
      prefetchBoostedProducts()
        .then((r) => { data.boosted_product_carousel = r; })
        .catch(() => { data.boosted_product_carousel = null; }),
    );
  }
  if (visibleTypes.has("preference_product")) {
    fetches.push(
      prefetchPreferenceProducts()
        .then((r) => { data.preference_product = r; })
        .catch(() => { data.preference_product = null; }),
    );
  }
  if (visibleTypes.has("dynamic_product_list")) {
    fetches.push(
      prefetchDynamicListConfigs()
        .then((r) => { data.dynamic_product_list = r; })
        .catch(() => { data.dynamic_product_list = null; }),
    );
  }
  if (visibleTypes.has("shop_horizontal_list")) {
    fetches.push(
      prefetchShops()
        .then((r) => { data.shop_horizontal_list = r; })
        .catch(() => { data.shop_horizontal_list = null; }),
    );
  }

  await Promise.allSettled(fetches);
  return data;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function Home() {
  const widgets = await getMarketLayout();
  const prefetchedData = await prefetchAllWidgetData(widgets);

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <SecondHeader />
      <HomeWidgets widgets={widgets} prefetchedData={prefetchedData} />
      <Footer />
    </div>
  );
}
