// components/market/MyMarketOrdersPage.tsx
//
// Web port of lib/screens/market/my_market_orders_screen.dart.
//
// Lists the signed-in user's orders from `orders-market`, filtered by
// `buyerId`, ordered by `createdAt desc`, paginated at 20/page.
//
// Design matches the food-orders page: sticky translucent header, inline
// search, single-column card list with status strip, emerald accent.

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Package,
  Search,
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

function formatDate(ts: Timestamp): string {
  const d = ts.toDate();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatMoney(amount: number): string {
  return amount.toFixed(2);
}

function itemsPreviewText(order: MarketOrder, fallback: string): string {
  if (order.items.length === 0) return fallback;
  const names = order.items
    .slice(0, 2)
    .map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name))
    .join(", ");
  return order.items.length > 2
    ? `${names} +${order.items.length - 2}`
    : names;
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE
// ════════════════════════════════════════════════════════════════════════════

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_DELAY = 300;
const SCROLL_THROTTLE_DELAY = 100;

export default function MyMarketOrdersPage() {
  return (
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

  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const fetchTokenRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const scrollThrottleRef = useRef<NodeJS.Timeout | null>(null);

  // Success banner from payment redirect — show once, scrub URL.
  const successOrderId =
    searchParams.get("success") === "true"
      ? searchParams.get("orderId") ?? ""
      : null;
  const [showSuccessBanner, setShowSuccessBanner] = useState(
    successOrderId !== null,
  );

  useEffect(() => {
    if (successOrderId === null) return;
    router.replace("/market-orders", { scroll: false });
    const timer = setTimeout(() => setShowSuccessBanner(false), 6_000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search input.
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(searchValue.trim().toLowerCase());
    }, SEARCH_DEBOUNCE_DELAY);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchValue]);

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

  useEffect(() => {
    if (isUserLoading) return;
    if (!user) {
      setIsLoading(false);
      return;
    }
    void fetchPage(true);
  }, [isUserLoading, user, fetchPage]);

  const handleScroll = useCallback(() => {
    if (scrollThrottleRef.current) return;
    scrollThrottleRef.current = setTimeout(() => {
      const container = scrollRef.current;
      if (!container || isLoading || isLoadingMore || !hasMore) {
        scrollThrottleRef.current = null;
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop <= clientHeight + 200) {
        void fetchPage(false);
      }
      scrollThrottleRef.current = null;
    }, SCROLL_THROTTLE_DELAY);
  }, [isLoading, isLoadingMore, hasMore, fetchPage]);

  const clearSearch = () => {
    setSearchValue("");
    setSearchQuery("");
    searchInputRef.current?.blur();
  };

  const dismissKeyboard = () => {
    if (isSearchFocused) {
      searchInputRef.current?.blur();
      setIsSearchFocused(false);
    }
  };

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return orders;
    return orders.filter((o) => {
      if (o.id.toLowerCase().includes(searchQuery)) return true;
      return o.items.some(
        (i) =>
          i.name.toLowerCase().includes(searchQuery) ||
          i.brand.toLowerCase().includes(searchQuery),
      );
    });
  }, [orders, searchQuery]);

  return (
    <div
      className={`min-h-screen ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50/50"
      }`}
      onClick={dismissKeyboard}
    >
      <div
        className={`sticky top-14 z-30 border-b ${
          isDarkMode
            ? "bg-gray-900/80 backdrop-blur-xl border-gray-700/80"
            : "bg-white/80 backdrop-blur-xl border-gray-100/80"
        }`}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 px-3 sm:px-6 pt-3 pb-2">
            <button
              onClick={() => router.back()}
              className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                  : "bg-gray-50 border-gray-200 hover:bg-gray-100"
              }`}
              aria-label={t("back")}
            >
              <ArrowLeft
                className={`w-4 h-4 ${
                  isDarkMode ? "text-gray-300" : "text-gray-600"
                }`}
              />
            </button>
            <h1
              className={`text-lg font-bold truncate ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("myOrdersTitle")}
            </h1>
            {filteredOrders.length > 0 && (
              <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-full flex-shrink-0">
                {filteredOrders.length}
              </span>
            )}
          </div>

          <div className="px-3 sm:px-6 pb-3">
            <div className="relative">
              <Search
                className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
                  isDarkMode ? "text-gray-400" : "text-gray-400"
                }`}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") dismissKeyboard();
                }}
                placeholder={t("ordersSearchPlaceholder")}
                className={`w-full pl-9 pr-9 py-2 border rounded-xl text-sm placeholder-gray-400 focus:outline-none transition-all ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700 text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
                    : "bg-gray-50/80 border-gray-200 text-gray-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300"
                }`}
              />
              {searchValue && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  aria-label={t("clearSearch")}
                >
                  <X
                    className={`w-4 h-4 ${
                      isDarkMode ? "text-gray-400" : "text-gray-400"
                    }`}
                  />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4">
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
        ) : filteredOrders.length === 0 ? (
          <EmptyState
            isDarkMode={isDarkMode}
            searching={searchQuery.length > 0}
          />
        ) : (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto"
          >
            {filteredOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                isDarkMode={isDarkMode}
              />
            ))}
            {isLoadingMore && (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-[3px] border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
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
      className={`block rounded-2xl border overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all ${
        isDarkMode
          ? "bg-gray-800 border-gray-700"
          : "bg-white border-gray-100"
      }`}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isDarkMode ? "bg-gray-700" : "bg-emerald-50"
          }`}
        >
          <ShoppingBag className="w-4 h-4 text-emerald-600" aria-hidden />
        </div>

        <div className="flex-1 min-w-0">
          <h4
            className={`text-sm font-semibold truncate ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("brandName")}
          </h4>
          <p
            className={`text-[11px] truncate mt-0.5 ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
            title={preview}
          >
            {preview}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className={`text-xs font-bold tabular-nums ${
                isDarkMode ? "text-emerald-400" : "text-emerald-600"
              }`}
            >
              {formatMoney(order.totalPrice)} {order.currency}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <ChevronRight
            className={`w-4 h-4 ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
            aria-hidden
          />
          <span
            className={`text-[11px] tabular-nums ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            {formatDate(order.createdAt)}
          </span>
        </div>
      </div>

      <div
        className={`px-4 py-2 border-t flex items-center justify-between ${
          isDarkMode
            ? "border-gray-700 bg-gray-800/50"
            : "border-gray-50 bg-gray-50/50"
        }`}
      >
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border"
          style={{
            backgroundColor: `${visual.color}1F`,
            color: visual.color,
            borderColor: `${visual.color}59`,
          }}
        >
          <StatusIcon className="w-3 h-3" aria-hidden />
          {t(visual.labelKey)}
        </span>

        <span
          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
            order.isPaid
              ? isDarkMode
                ? "text-emerald-400"
                : "text-emerald-600"
              : isDarkMode
                ? "text-amber-400"
                : "text-amber-600"
          }`}
        >
          {order.isPaid ? (
            <>
              <CreditCard className="w-3 h-3" aria-hidden />
              {t("paymentPaid")}
            </>
          ) : (
            <>
              <Wallet className="w-3 h-3" aria-hidden />
              {t("paymentAtDoor")}
            </>
          )}
        </span>
      </div>
    </Link>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// STATES
// ════════════════════════════════════════════════════════════════════════════

function EmptyState({
  isDarkMode,
  searching,
}: {
  isDarkMode: boolean;
  searching: boolean;
}) {
  const t = useTranslations("market");
  return (
    <div className="text-center py-16">
      <ShoppingBag
        className={`w-12 h-12 mx-auto mb-3 ${
          isDarkMode ? "text-gray-600" : "text-gray-300"
        }`}
        aria-hidden
      />
      <h3
        className={`text-sm font-semibold mb-1 ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {searching ? t("ordersNoResultsTitle") : t("ordersEmptyTitle")}
      </h3>
      <p
        className={`text-xs max-w-xs mx-auto ${
          isDarkMode ? "text-gray-400" : "text-gray-500"
        }`}
      >
        {searching
          ? t("ordersNoResultsSubtitle")
          : t("ordersEmptySubtitle")}
      </p>
      {!searching && (
        <Link
          href="/market-categories"
          className="mt-4 inline-flex items-center px-4 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors text-xs font-medium"
        >
          {t("continueShopping")}
        </Link>
      )}
    </div>
  );
}

function SignInState({ isDarkMode }: { isDarkMode: boolean }) {
  const t = useTranslations("market");
  return (
    <div className="text-center py-16">
      <ShoppingBag
        className={`w-12 h-12 mx-auto mb-3 ${
          isDarkMode ? "text-gray-600" : "text-gray-300"
        }`}
        aria-hidden
      />
      <h3
        className={`text-sm font-semibold mb-1 ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {t("ordersSignInTitle")}
      </h3>
      <p
        className={`text-xs max-w-xs mx-auto ${
          isDarkMode ? "text-gray-400" : "text-gray-500"
        }`}
      >
        {t("ordersSignInSubtitle")}
      </p>
      <Link
        href="/login"
        className="mt-4 inline-flex items-center px-4 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors text-xs font-medium"
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
    <div className="text-center py-16">
      <div
        className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 ${
          isDarkMode ? "bg-red-900/20" : "bg-red-50"
        }`}
      >
        <AlertCircle className="w-5 h-5 text-red-500" aria-hidden />
      </div>
      <h3
        className={`text-sm font-semibold mb-1 ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {message}
      </h3>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center px-4 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors text-xs font-medium"
      >
        {t("ordersTryAgain")}
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SKELETON
// ════════════════════════════════════════════════════════════════════════════

function ListSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`rounded-2xl border h-24 animate-pulse ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-100"
          }`}
        />
      ))}
    </div>
  );
}
