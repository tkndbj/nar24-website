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
// SERVER COMPONENT
// ============================================================================

export default async function Home() {
  const widgets = await getMarketLayout();

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <SecondHeader />
      <HomeWidgets widgets={widgets} />
      <Footer />
    </div>
  );
}
