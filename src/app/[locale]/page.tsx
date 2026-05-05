import { unstable_cache } from "next/cache";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import SecondHeader from "../components/market_screen/SecondHeader";
import Footer from "../components/Footer";
import HomeWidgets from "../components/market_screen/HomeWidgets";
import { AdsBanner } from "../components/market_screen/MarketTopAdsBanner";
import {
  MarketWidgetConfig,
  DEFAULT_WIDGETS,
  VALID_WIDGET_TYPES,
  WidgetType,
  PrefetchedWidgetData,
  PrefetchedBannerItem,
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


/** Helper to extract banner fields from Firestore doc */
function parseBannerDoc(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): PrefetchedBannerItem | null {
  const d = doc.data();
  const imageUrl = (d.imageUrl as string | undefined) ?? "";
  const imageStoragePath = d.imageStoragePath as string | undefined;
  // Need at least one image source. The tokenized imageUrl is preferred as
  // the runtime fallback; the storage path drives the Cloudinary CDN URL.
  if (!imageUrl && !imageStoragePath) return null;
  return {
    id: doc.id,
    imageUrl,
    imageStoragePath,
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

  // Parse colorImageStoragePaths safely
  let colorImageStoragePaths: Record<string, string> | undefined;
  if (
    d.colorImageStoragePaths &&
    typeof d.colorImageStoragePaths === "object" &&
    !Array.isArray(d.colorImageStoragePaths)
  ) {
    colorImageStoragePaths = {};
    for (const [key, val] of Object.entries(d.colorImageStoragePaths)) {
      if (val != null) colorImageStoragePaths[key] = String(val);
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
    imageStoragePaths: Array.isArray(d.imageStoragePaths)
      ? (d.imageStoragePaths as string[])
      : undefined,
    colorImageStoragePaths,
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

    // Manifest fast path: the trending CF (12-trending-products) embeds the
    // top-30 product summaries inline in `productSummaries`. One read
    // serves the entire prefetch — no per-product fetch. Mirrors the
    // pattern used by `prefetchDynamicListConfigs` for `home_lists`.
    const trendingDoc = await db.collection("trending_products").doc("global").get();
    if (!trendingDoc.exists) return [];
    const data = trendingDoc.data() || {};

    const rawSummaries = Array.isArray(data.productSummaries)
      ? (data.productSummaries as Array<Record<string, unknown>>)
      : null;

    if (rawSummaries && rawSummaries.length > 0) {
      const prefetched: PrefetchedProduct[] = [];
      for (const entry of rawSummaries) {
        if (!entry || typeof entry !== "object") continue;
        const id = typeof entry.id === "string" ? entry.id : "";
        if (!id) continue;
        const product = mapManifestEntryToPrefetchedProduct(id, entry);
        if (product) prefetched.push(product);
        if (prefetched.length >= 30) break;
      }
      if (prefetched.length > 0) return prefetched;
    }

    // ── Fallback: trending doc predates the embed rollout. Fetch full
    // product docs by ID. Triggers 1 + ceil(N/30) reads — same cost shape
    // as before the manifest landed.
    const allIds = (data.products || []) as string[];
    if (allIds.length === 0) return [];
    const sampled = allIds.slice(0, 30);
    return fetchProductDocsByIds(db, sampled, 30);
  },
  ["prefetch-preference-products"],
  { revalidate: 60 },
);

const prefetchDynamicListConfigs = unstable_cache(
  async (): Promise<PrefetchedDynamicListConfig[]> => {
    const db = getFirestoreAdmin();

    // Reads the denormalized `home_lists` collection produced by the
    // `home-list-manifest` Cloud Functions. Each manifest doc already has
    // its product summaries embedded inline, so this is one Firestore
    // query total — no per-list product fetches.
    const snapshot = await db
      .collection("home_lists")
      .where("isActive", "==", true)
      .orderBy("order")
      .get();

    const configs: PrefetchedDynamicListConfig[] = [];

    for (const doc of snapshot.docs) {
      const d = doc.data();
      const rawProducts = Array.isArray(d.products) ? d.products : [];

      // Decode embedded summaries into the PrefetchedProduct shape that
      // the client component already understands. Same end shape as the
      // pre-manifest path; the data just lives inline now.
      const prefetchedProducts: PrefetchedProduct[] = [];
      for (const entry of rawProducts) {
        if (!entry || typeof entry !== "object") continue;
        const p = entry as Record<string, unknown>;
        const id = typeof p.id === "string" ? p.id : "";
        if (!id) continue;
        const product = mapManifestEntryToPrefetchedProduct(id, p);
        if (product) prefetchedProducts.push(product);
        if (prefetchedProducts.length >= 20) break;
      }

      configs.push({
        id: doc.id,
        title: (d.title || "Product List") as string,
        isActive: true,
        order: Number(d.order) || 0,
        gradientStart: d.gradientStart as string | undefined,
        gradientEnd: d.gradientEnd as string | undefined,
        selectedProductIds: undefined, // not needed; products are embedded
        selectedShopId: d.selectedShopId as string | undefined,
        limit: undefined,
        showViewAllButton: d.showViewAllButton as boolean | undefined,
        prefetchedProducts,
      });
    }

    return configs.sort((a, b) => a.order - b.order);
  },
  ["prefetch-home-lists-manifests"],
  { revalidate: 120 },
);

/**
 * Convert one entry from the home_lists manifest's embedded `products` array
 * into a `PrefetchedProduct`. Mirrors `parseProductDoc`'s logic but operates
 * on a plain object (the manifest entry) rather than a Firestore snapshot.
 */
function mapManifestEntryToPrefetchedProduct(
  id: string,
  d: Record<string, unknown>,
): PrefetchedProduct | null {
  const productName = (d.productName as string) || (d.title as string) || "";
  const price = Number(d.price);
  if (!productName || !Number.isFinite(price)) return null;

  let colorImages: Record<string, string[]> | undefined;
  if (d.colorImages && typeof d.colorImages === "object") {
    colorImages = {};
    for (const [k, v] of Object.entries(d.colorImages as Record<string, unknown>)) {
      if (Array.isArray(v)) colorImages[k] = v as string[];
    }
  }

  let colorImageStoragePaths: Record<string, string> | undefined;
  if (
    d.colorImageStoragePaths &&
    typeof d.colorImageStoragePaths === "object" &&
    !Array.isArray(d.colorImageStoragePaths)
  ) {
    colorImageStoragePaths = {};
    for (const [k, v] of Object.entries(
      d.colorImageStoragePaths as Record<string, unknown>,
    )) {
      if (v != null) colorImageStoragePaths[k] = String(v);
    }
  }

  let colorQuantities: Record<string, number> | undefined;
  if (d.colorQuantities && typeof d.colorQuantities === "object") {
    colorQuantities = {};
    for (const [k, v] of Object.entries(
      d.colorQuantities as Record<string, unknown>,
    )) {
      colorQuantities[k] = Number(v) || 0;
    }
  }

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
    id,
    productName,
    imageUrls: Array.isArray(d.imageUrls) ? (d.imageUrls as string[]) : [],
    imageStoragePaths: Array.isArray(d.imageStoragePaths)
      ? (d.imageStoragePaths as string[])
      : undefined,
    colorImageStoragePaths,
    price,
    currency: (d.currency as string) || "TL",
    condition: d.condition as string | undefined,
    brandModel: (d.brandModel || d.brand) as string | undefined,
    quantity: d.quantity != null ? Number(d.quantity) : undefined,
    colorQuantities,
    colorImages,
    averageRating: d.averageRating != null ? Number(d.averageRating) : undefined,
    discountPercentage:
      d.discountPercentage != null ? Number(d.discountPercentage) : undefined,
    deliveryOption: d.deliveryOption as string | undefined,
    campaignName: d.campaignName as string | undefined,
    isBoosted: d.isBoosted === true ? true : undefined,
    category: d.category as string | undefined,
    subcategory: d.subcategory as string | undefined,
    subsubcategory: d.subsubcategory as string | undefined,
    gender: d.gender as string | undefined,
    shopId: d.shopId as string | undefined,
    clothingSizes: Array.isArray(d.clothingSizes)
      ? (d.clothingSizes as string[])
      : undefined,
    pantSizes: Array.isArray(d.pantSizes) ? (d.pantSizes as string[]) : undefined,
    footwearSizes: Array.isArray(d.footwearSizes)
      ? (d.footwearSizes as string[])
      : undefined,
    jewelryMaterials: Array.isArray(d.jewelryMaterials)
      ? (d.jewelryMaterials as string[])
      : undefined,
    attributes,
  };
}

function mapShopDataToPrefetched(
  id: string,
  d: Record<string, unknown>,
): PrefetchedShop | null {
  if (!d.name) return null;
  return {
    id,
    name: d.name as string,
    description: d.description as string | undefined,
    logoUrl: (d.logoUrl || d.profileImageUrl) as string | undefined,
    coverImageUrl: d.coverImageUrl as string | undefined,
    coverImageUrls: Array.isArray(d.coverImageUrls)
      ? (d.coverImageUrls as string[])
      : undefined,
    profileImageUrl: d.profileImageUrl as string | undefined,
    averageRating: Number(d.averageRating) || 0,
    reviewCount: Number(d.reviewCount) || 0,
    productCount: Number(d.productCount) || 0,
    category: d.category as string | undefined,
    isVerified: Boolean(d.isVerified),
    ownerId: (d.ownerId || "") as string,
  };
}

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
        const data = configDoc.data() ?? {};

        // ── Manifest fast path: embedded summaries written by the admin
        // panel at save time. 1 read total regardless of carousel size.
        // Mirrors Flutter's ShopWidgetProvider._parseEmbeddedShops.
        const rawSummaries = Array.isArray(data.shopSummaries)
          ? (data.shopSummaries as Array<Record<string, unknown>>)
          : null;
        if (rawSummaries && rawSummaries.length > 0) {
          for (const entry of rawSummaries) {
            if (!entry || typeof entry !== "object") continue;
            const id = typeof entry.id === "string" ? entry.id : "";
            if (!id) continue;
            if (entry.isActive === false) continue;
            const shop = mapShopDataToPrefetched(id, entry);
            if (shop) shops.push(shop);
          }
          if (shops.length > 0) return shops;
        }

        // ── Legacy fallback: fetch each shop by ID.
        const shopIds = data.shopIds as string[] | undefined;
        if (shopIds && shopIds.length > 0) {
          for (const id of shopIds) {
            try {
              const shopDoc = await db.collection("shops").doc(id).get();
              if (!shopDoc.exists) continue;
              const d = shopDoc.data()!;
              if (d.isActive === false) continue;
              const shop = mapShopDataToPrefetched(shopDoc.id, d);
              if (shop) shops.push(shop);
            } catch { /* skip individual shop errors */ }
          }
          if (shops.length > 0) return shops;
        }
      }
    } catch { /* fall through to fallback */ }

    // 2. Fallback: newest active shops (matches Flutter)
    const snapshot = await db
      .collection("shops")
      .where("isActive", "==", true)
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    snapshot.docs.forEach((doc) => {
      const shop = mapShopDataToPrefetched(doc.id, doc.data());
      if (shop) shops.push(shop);
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
  const [widgets, adsBannerData] = await Promise.all([
    getMarketLayout(),
    prefetchAdsBanners(),
  ]);
  const prefetchedData = await prefetchAllWidgetData(widgets);

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <SecondHeader />
      <div className="w-full bg-gray-50 dark:bg-surface">
        <div className="lg:max-w-[1400px] lg:mx-auto px-4 sm:px-6 lg:px-6 pt-4">
          <AdsBanner initialData={adsBannerData} />
        </div>
      </div>
      <HomeWidgets widgets={widgets} prefetchedData={prefetchedData} />
      <Footer />
    </div>
  );
}
