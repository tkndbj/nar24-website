// components/market/MyMarketOrdersPage.tsx
//
// Web port of lib/screens/market/my_market_orders_screen.dart.
//
// Lists the signed-in user's orders from `orders-market`, filtered by
// `buyerId`, ordered by `createdAt desc`, paginated at 20/page.
//
// Web-specific behavior:
//   • Responsive layout — single column on mobile, 2-col on tablet, 3-col on
//     wide screens. The order card is list-optimized so a dense layout works.
//   • URL-driven success toast — when a user lands here from the payment
//     success redirect (`?success=true&orderId=…`), we show a dismissible
//     banner. Also cleans up the URL so a refresh doesn't re-show it.
//   • Unauthenticated users get a sign-in CTA, not an empty list. They hit
//     this URL from the payment flow, sidebar, or deep links and it should
//     be obvious what to do.
//   • Infinite scroll via IntersectionObserver (same pattern as other pages).
//   • Pull-to-refresh → we don't replicate that on web; the manual refresh
//     needs a button, which I've put in the header for quick reloads.
//
// Route convention: cards link to `/market-orders/{id}` (matching the
// detail route we built earlier). Flutter uses `/market-order-detail/{id}`
// but there's no reason to duplicate URL hierarchies on web.

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Package,
  RefreshCw,
  ShoppingBag,
  Truck,
  Wallet,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/context/UserProvider";

// ════════════════════════════════════════════════════════════════════════════
// STATUS
// ════════════════════════════════════════════════════════════════════════════

type OrderStatus =
  | "pending"
  | "confirmed"
  | "rejected"
  | "preparing"
  | "outForDelivery"
  | "delivered"
  | "completed"
  | "cancelled";

function parseStatus(raw: unknown): OrderStatus {
  switch (raw) {
    case "confirmed":
      return "confirmed";
    case "rejected":
      return "rejected";
    case "preparing":
      return "preparing";
    case "out_for_delivery":
      return "outForDelivery";
    case "delivered":
      return "delivered";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return "pending";
  }
}

interface StatusVisual {
  icon: LucideIcon;
  color: string;
  labelKey: string;
}

const STATUS_VISUALS: Record<OrderStatus, StatusVisual> = {
  pending: { icon: Clock, color: "#9CA3AF", labelKey: "orderStatusPending" },
  confirmed: {
    icon: CheckCircle,
    color: "#00A86B",
    labelKey: "orderStatusConfirmed",
  },
  rejected: {
    icon: XCircle,
    color: "#EF4444",
    labelKey: "orderStatusRejected",
  },
  preparing: {
    icon: Package,
    color: "#F97316",
    labelKey: "orderStatusPreparing",
  },
  outForDelivery: {
    icon: Truck,
    color: "#3B82F6",
    labelKey: "orderStatusOutForDelivery",
  },
  delivered: {
    icon: CheckCircle2,
    color: "#00A86B",
    labelKey: "orderStatusDelivered",
  },
  completed: {
    icon: CheckCircle2,
    color: "#00A86B",
    labelKey: "orderStatusCompleted",
  },
  cancelled: {
    icon: XCircle,
    color: "#EF4444",
    labelKey: "orderStatusCancelled",
  },
};

// ════════════════════════════════════════════════════════════════════════════
// MODEL
// ════════════════════════════════════════════════════════════════════════════

interface OrderItemPreview {
  name: string;
  brand: string;
  quantity: number;
}

interface MarketOrder {
  id: string;
  totalPrice: number;
  currency: string;
  itemCount: number;
  status: OrderStatus;
  isPaid: boolean;
  paymentMethod: string;
  createdAt: Timestamp;
  items: OrderItemPreview[];
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function parseItemPreview(raw: unknown): OrderItemPreview | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  return {
    name: asString(m.name),
    brand: asString(m.brand),
    quantity: asNumber(m.quantity, 1),
  };
}

function parseOrderDoc(
  snap: QueryDocumentSnapshot<DocumentData>,
): MarketOrder {
  const d = snap.data();
  const rawItems = Array.isArray(d.items) ? d.items : [];
  const items = rawItems
    .map(parseItemPreview)
    .filter((i): i is OrderItemPreview => i !== null);

  return {
    id: snap.id,
    totalPrice: asNumber(d.totalPrice),
    currency: asString(d.currency, "TL"),
    itemCount: asNumber(d.itemCount, items.length),
    status: parseStatus(d.status),
    isPaid: d.isPaid === true,
    paymentMethod: asString(d.paymentMethod),
    createdAt: d.createdAt instanceof Timestamp ? d.createdAt : Timestamp.now(),
    items,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// FORMATTERS
// ════════════════════════════════════════════════════════════════════════════

function formatDate(ts: Timestamp, _locale: string): string {
  // Flutter: dd/MM/yyyy
  const d = ts.toDate();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatMoney(amount: number): string {
  // Integer, no decimals — matches Flutter toStringAsFixed(0)
  return Math.round(amount).toString();
}

function itemsPreviewText(
  order: MarketOrder,
  fallback: string,
): string {
  if (order.items.length === 0) return fallback;
  const names = order.items.slice(0, 3).map((i) => i.name).join(", ");
  return order.items.length > 3 ? `${names}…` : names;
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE
// ════════════════════════════════════════════════════════════════════════════

const PAGE_SIZE = 20;

export default function MyMarketOrdersPage() {
  return (
    // useSearchParams needs a Suspense boundary in Next 15.
    <Suspense fallback={null}>
      <OrdersPageInner />
    </Suspense>
  );
}

function OrdersPageInner() {
  const t = useTranslations("market");
  const isDarkMode = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: isUserLoading } = useUser();

  // ── State ────────────────────────────────────────────────────────────────
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const fetchTokenRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Success banner from payment redirect ─────────────────────────────────
  // When we arrive with `?success=true&orderId=…`, show a toast once and then
  // scrub the params from the URL so a refresh doesn't re-trigger it.
  const successOrderId = searchParams.get("success") === "true"
    ? searchParams.get("orderId") ?? ""
    : null;
  const [showSuccessBanner, setShowSuccessBanner] = useState(
    successOrderId !== null,
  );

  useEffect(() => {
    if (successOrderId === null) return;
    // Clean the URL — replace so we don't pollute history.
    router.replace("/market-orders", { scroll: false });
    // Auto-dismiss after 6s.
    const timer = setTimeout(() => setShowSuccessBanner(false), 6_000);
    return () => clearTimeout(timer);
    // Only react to the initial URL state; subsequent navigations clear it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Loader ───────────────────────────────────────────────────────────────

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (!user) return;

      fetchTokenRef.current += 1;
      const token = fetchTokenRef.current;

      if (reset) {
        lastDocRef.current = null;
        setIsLoading(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
      }

      try {
        let q: Query<DocumentData> = query(
          collection(db, "orders-market"),
          where("buyerId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE),
        );
        if (!reset && lastDocRef.current) {
          q = query(q, startAfter(lastDocRef.current));
        }

        const snap = await getDocs(q);
        if (token !== fetchTokenRef.current) return;

        const fetched = snap.docs.map(parseOrderDoc);
        if (snap.docs.length > 0) {
          lastDocRef.current = snap.docs[snap.docs.length - 1];
        }
        setOrders((prev) => (reset ? fetched : [...prev, ...fetched]));
        setHasMore(snap.docs.length >= PAGE_SIZE);
      } catch (err) {
        if (token !== fetchTokenRef.current) return;
        console.warn("[MyMarketOrders] fetch error:", err);
        setError(t("ordersLoadError"));
      } finally {
        if (token === fetchTokenRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [user, t],
  );

  // Initial + auth-change refetch
  useEffect(() => {
    if (isUserLoading) return;
    if (!user) {
      setIsLoading(false);
      return;
    }
    void fetchPage(true);
  }, [isUserLoading, user, fetchPage]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (isLoading || isLoadingMore || !hasMore) return;
        void fetchPage(false);
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, fetchPage]);

  // ── Render state routing ─────────────────────────────────────────────────

  return (
    <main
      className={`min-h-screen ${
        isDarkMode ? "bg-[#1C1A29]" : "bg-[#F5F5F5]"
      }`}
    >
      <TopBar
        isDarkMode={isDarkMode}
        onBack={() => router.back()}
        onRefresh={user ? () => fetchPage(true) : undefined}
        isRefreshing={isLoading && !!user}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {showSuccessBanner && successOrderId && (
          <SuccessBanner
            orderId={successOrderId}
            isDarkMode={isDarkMode}
            onDismiss={() => setShowSuccessBanner(false)}
          />
        )}

        {!isUserLoading && !user ? (
          <SignInState isDarkMode={isDarkMode} />
        ) : error && orders.length === 0 ? (
          <ErrorState
            isDarkMode={isDarkMode}
            message={error}
            onRetry={() => fetchPage(true)}
          />
        ) : isLoading ? (
          <ListSkeleton isDarkMode={isDarkMode} />
        ) : orders.length === 0 ? (
          <EmptyState isDarkMode={isDarkMode} />
        ) : (
          <>
            <ul className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {orders.map((order) => (
                <li key={order.id}>
                  <OrderCard order={order} isDarkMode={isDarkMode} />
                </li>
              ))}
            </ul>

            <div ref={sentinelRef} aria-hidden className="h-px mt-6" />
            {isLoadingMore && (
              <div className="flex justify-center py-6">
                <span
                  role="status"
                  aria-label={t("loading")}
                  className="w-6 h-6 border-[3px] border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"
                />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TOP BAR
// ════════════════════════════════════════════════════════════════════════════

function TopBar({
  isDarkMode: _isDarkMode,
  onBack,
  onRefresh,
  isRefreshing,
}: {
  isDarkMode: boolean;
  onBack: () => void;
  onRefresh?: () => void;
  isRefreshing: boolean;
}) {
  const t = useTranslations("market");
  return (
    <header className="sticky top-0 z-20 bg-[#00A86B] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("back")}
          className="-ml-2 p-2 rounded-full hover:bg-white/10 outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <h1 className="flex-1 text-base sm:text-lg font-semibold truncate">
          {t("myOrdersTitle")}
        </h1>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label={t("ordersRefresh")}
            className="p-2 rounded-full hover:bg-white/10 disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </button>
        )}
      </div>
    </header>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SUCCESS BANNER
// ════════════════════════════════════════════════════════════════════════════

function SuccessBanner({
  orderId,
  isDarkMode,
  onDismiss,
}: {
  orderId: string;
  isDarkMode: boolean;
  onDismiss: () => void;
}) {
  const t = useTranslations("market");
  const short = orderId.slice(0, 8).toUpperCase();

  return (
    <div
      role="status"
      className={`mb-4 rounded-2xl p-4 flex items-start gap-3 border ${
        isDarkMode
          ? "bg-emerald-500/10 border-emerald-500/30"
          : "bg-emerald-50 border-emerald-200"
      }`}
    >
      <CheckCircle2
        className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-bold ${
            isDarkMode ? "text-emerald-400" : "text-emerald-800"
          }`}
        >
          {t("ordersSuccessTitle")}
        </p>
        <p
          className={`mt-0.5 text-xs ${
            isDarkMode ? "text-emerald-200" : "text-emerald-700"
          }`}
        >
          {t("ordersSuccessBody")}
          {orderId && (
            <>
              {" "}
              <span className="font-mono tabular-nums">#{short}</span>
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("close")}
        className={`p-1 -m-1 rounded transition-colors ${
          isDarkMode
            ? "text-emerald-400 hover:bg-emerald-500/15"
            : "text-emerald-700 hover:bg-emerald-100"
        }`}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ORDER CARD
// ════════════════════════════════════════════════════════════════════════════

function OrderCard({
  order,
  isDarkMode,
}: {
  order: MarketOrder;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");
  const locale = useLocale();

  const preview = useMemo(
    () =>
      itemsPreviewText(order, t("orderItemCount", { count: order.itemCount })),
    [order, t],
  );

  const visual = STATUS_VISUALS[order.status];
  const StatusIcon = visual.icon;

  return (
    <Link
      href={`/market-orders/${order.id}`}
      aria-label={t("orderCardAriaLabel", {
        id: order.id.slice(0, 8).toUpperCase(),
      })}
      className={`group block rounded-2xl overflow-hidden transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
        isDarkMode
          ? "bg-[#211F31] shadow-[0_2px_6px_rgba(0,0,0,0.25)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.35)] focus-visible:ring-offset-[#1C1A29]"
          : "bg-white shadow-sm hover:shadow-md focus-visible:ring-offset-[#F5F5F5]"
      }`}
    >
      {/* Main row */}
      <div className="p-4 flex items-start gap-3">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isDarkMode ? "bg-[#2D2B3F]" : "bg-emerald-50"
          }`}
        >
          <ShoppingBag
            className="w-6 h-6 text-emerald-600"
            aria-hidden
          />
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-bold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("brandName")}
          </p>
          <p
            className={`mt-0.5 text-xs truncate ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
            title={preview}
          >
            {preview}
          </p>
          <p
            className={`mt-1 text-xs font-bold tabular-nums ${
              isDarkMode ? "text-emerald-400" : "text-emerald-700"
            }`}
          >
            {formatMoney(order.totalPrice)} {order.currency}
          </p>
        </div>

        <div className="flex flex-col items-end flex-shrink-0">
          <ChevronRight className="w-5 h-5 text-emerald-600" aria-hidden />
          <span
            className={`mt-1.5 text-[11px] tabular-nums ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            {formatDate(order.createdAt, locale)}
          </span>
        </div>
      </div>

      {/* Status strip */}
      <div
        className={`px-4 py-2 flex items-center gap-2 border-t ${
          isDarkMode
            ? "bg-white/[0.04] border-white/10"
            : "bg-gray-50 border-gray-100"
        }`}
      >
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
          style={{
            backgroundColor: `${visual.color}1F`, // ~12% alpha
            color: visual.color,
            borderColor: `${visual.color}59`, // ~35% alpha
          }}
        >
          <StatusIcon className="w-2.5 h-2.5" aria-hidden />
          {t(visual.labelKey)}
        </span>

        <span className="flex-1" />

        <span
          className="inline-flex items-center gap-1 text-[11px] font-semibold"
          style={{ color: order.isPaid ? "#00A86B" : "#D97706" }}
        >
          {order.isPaid ? (
            <CreditCard className="w-3 h-3" aria-hidden />
          ) : (
            <Wallet className="w-3 h-3" aria-hidden />
          )}
          {order.isPaid ? t("paymentPaid") : t("paymentAtDoor")}
        </span>
      </div>
    </Link>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STATES
// ════════════════════════════════════════════════════════════════════════════

function EmptyState({ isDarkMode }: { isDarkMode: boolean }) {
  const t = useTranslations("market");
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 sm:py-24 px-4">
      <div
        className={`w-24 h-24 rounded-3xl flex items-center justify-center ${
          isDarkMode ? "bg-[#2D2B3F]" : "bg-emerald-50"
        }`}
      >
        <ShoppingBag
          className={`w-10 h-10 ${
            isDarkMode ? "text-gray-600" : "text-emerald-400"
          }`}
          aria-hidden
        />
      </div>
      <h2
        className={`mt-6 text-[17px] font-bold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {t("ordersEmptyTitle")}
      </h2>
      <p
        className={`mt-1.5 text-[13px] max-w-sm ${
          isDarkMode ? "text-gray-500" : "text-gray-600"
        }`}
      >
        {t("ordersEmptySubtitle")}
      </p>
      <Link
        href="/market-categories"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00A86B] text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
      >
        {t("continueShopping")}
      </Link>
    </div>
  );
}

function SignInState({ isDarkMode }: { isDarkMode: boolean }) {
  const t = useTranslations("market");
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 sm:py-24 px-4">
      <div
        className={`w-24 h-24 rounded-3xl flex items-center justify-center ${
          isDarkMode ? "bg-[#2D2B3F]" : "bg-emerald-50"
        }`}
      >
        <ShoppingBag
          className={`w-10 h-10 ${
            isDarkMode ? "text-gray-600" : "text-emerald-400"
          }`}
          aria-hidden
        />
      </div>
      <h2
        className={`mt-6 text-[17px] font-bold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {t("ordersSignInTitle")}
      </h2>
      <p
        className={`mt-1.5 text-[13px] max-w-sm ${
          isDarkMode ? "text-gray-500" : "text-gray-600"
        }`}
      >
        {t("ordersSignInSubtitle")}
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00A86B] text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
      >
        {t("signIn")}
      </Link>
    </div>
  );
}

function ErrorState({
  isDarkMode,
  message,
  onRetry,
}: {
  isDarkMode: boolean;
  message: string;
  onRetry: () => void;
}) {
  const t = useTranslations("market");
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
        <AlertCircle className="w-7 h-7 text-red-500" aria-hidden />
      </div>
      <p
        className={`mt-4 text-base font-semibold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#00A86B] text-white text-sm font-bold hover:bg-emerald-700 transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        {t("ordersTryAgain")}
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SKELETON
// ════════════════════════════════════════════════════════════════════════════

function ListSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  const card = isDarkMode ? "bg-[#211F31]" : "bg-white";
  const bg = isDarkMode ? "bg-[#3A3850]" : "bg-gray-200";
  return (
    <ul className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className={`rounded-2xl overflow-hidden ${card} shadow-sm`}
        >
          <div className="p-4 flex items-start gap-3">
            <div className={`w-12 h-12 rounded-xl ${bg}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-3 w-24 rounded ${bg}`} />
              <div className={`h-3 w-3/4 rounded ${bg}`} />
              <div className={`h-3 w-16 rounded ${bg}`} />
            </div>
            <div className="space-y-2">
              <div className={`w-5 h-5 rounded ${bg}`} />
              <div className={`h-2.5 w-12 rounded ${bg}`} />
            </div>
          </div>
          <div
            className={`h-8 ${
              isDarkMode ? "bg-white/[0.04]" : "bg-gray-50"
            } border-t ${isDarkMode ? "border-white/10" : "border-gray-100"}`}
          />
        </li>
      ))}
    </ul>
  );
}