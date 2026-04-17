// components/market/MarketOrderDetailPage.tsx
//
// Web port of lib/screens/market/market_order_detail_screen.dart.
//
// Read-only order detail. Reads from `orders-market/{orderId}` and renders:
//   • Emerald gradient header with order ID + status badge
//   • Header card: order #, date, payment method, payment status
//   • Items list (brand, name, type, unit price × qty, line total)
//   • Delivery address (if present)
//   • Order notes (if present)
//   • Summary: subtotal + delivery fee + total
//
// Intentional web deviations from Flutter:
//   • Two-column layout on lg+: items+notes on the left, address+summary
//     on the right (summary is sticky). On mobile this stacks like Flutter.
//   • Retry loop uses a clean useCallback effect instead of TickerProvider.
//   • Thumbnail placeholder uses the category's Lucide icon (marketCategories.ts
//     carries `icon`, not `emoji`, on web).
//   • `shimmer` dependency replaced by Tailwind's `animate-pulse`.

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCircle,
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  FileText,
  MapPin,
  Package,
  Phone,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Truck,
  Wallet,
  XCircle,
  Clock,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import {
  doc,
  getDoc,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useTheme } from "@/hooks/useTheme";
import {
  MARKET_CATEGORY_MAP,
  type MarketCategory,
} from "@/constants/marketCategories";

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

/**
 * Status→visual mapping. Colors match Flutter. Kept as literal hex so we can
 * use them directly in `style=`; Tailwind's dynamic class problem means any
 * `bg-[#…]` class name has to appear verbatim in source for JIT to keep it.
 */
interface StatusVisual {
  icon: LucideIcon;
  color: string;
  labelKey: string;
}

const STATUS_VISUALS: Record<OrderStatus, StatusVisual> = {
  pending: { icon: Clock, color: "#F59E0B", labelKey: "orderStatusPending" },
  confirmed: {
    icon: CheckCircle,
    color: "#0D9488",
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
    color: "#10B981",
    labelKey: "orderStatusDelivered",
  },
  completed: {
    icon: CheckCircle2,
    color: "#10B981",
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

interface OrderItem {
  itemId: string;
  name: string;
  brand: string;
  type: string;
  category: string;
  price: number;
  quantity: number;
  /** Server-computed line total; fall back to price*quantity if absent */
  itemTotal: number | null;
}

interface OrderAddress {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  phoneNumber: string | null;
}

interface OrderDetail {
  id: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  totalPrice: number;
  currency: string;
  paymentMethod: string;
  isPaid: boolean;
  status: OrderStatus;
  deliveryAddress: OrderAddress | null;
  orderNotes: string | null;
  buyerPhone: string | null;
  createdAt: Timestamp;
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

function parseItem(raw: unknown): OrderItem | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  return {
    itemId: asString(m.itemId),
    name: asString(m.name),
    brand: asString(m.brand),
    type: asString(m.type),
    category: asString(m.category),
    price: asNumber(m.price),
    quantity: asNumber(m.quantity, 1),
    itemTotal: m.itemTotal != null ? asNumber(m.itemTotal) : null,
  };
}

function parseAddress(raw: unknown): OrderAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  return {
    addressLine1: asString(m.addressLine1),
    addressLine2: typeof m.addressLine2 === "string" ? m.addressLine2 : null,
    city: asString(m.city),
    phoneNumber: typeof m.phoneNumber === "string" ? m.phoneNumber : null,
  };
}

function parseOrderDoc(snap: DocumentSnapshot<DocumentData>): OrderDetail {
  const d = snap.data() ?? {};
  const rawItems = Array.isArray(d.items) ? d.items : [];
  const items = rawItems
    .map(parseItem)
    .filter((i): i is OrderItem => i !== null);

  return {
    id: snap.id,
    items,
    subtotal: asNumber(d.subtotal),
    deliveryFee: asNumber(d.deliveryFee),
    totalPrice: asNumber(d.totalPrice),
    currency: asString(d.currency, "TL"),
    paymentMethod: asString(d.paymentMethod),
    isPaid: d.isPaid === true,
    status: parseStatus(d.status),
    deliveryAddress: parseAddress(d.deliveryAddress),
    orderNotes: typeof d.orderNotes === "string" ? d.orderNotes : null,
    buyerPhone: typeof d.buyerPhone === "string" ? d.buyerPhone : null,
    createdAt:
      d.createdAt instanceof Timestamp ? d.createdAt : Timestamp.now(),
  };
}

// ════════════════════════════════════════════════════════════════════════════
// FORMATTERS
// ════════════════════════════════════════════════════════════════════════════

function formatMoney(amount: number, locale: string): string {
  // Match Flutter's NumberFormat('#,##0') — integer grouping, no decimals.
  // Using toLocaleString with maximumFractionDigits=0 for the same behavior.
  return amount.toLocaleString(locale === "tr" ? "tr-TR" : "en-US", {
    maximumFractionDigits: 0,
  });
}

function formatDate(ts: Timestamp): string {
  // Match Flutter's `dd/MM/yy HH:mm`
  const d = ts.toDate();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yy = pad(d.getFullYear() % 100);
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

function lineTotal(item: OrderItem): number {
  return item.itemTotal ?? item.price * item.quantity;
}

function shortOrderId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function MarketOrderDetailPage({
  orderId,
}: {
  orderId: string;
}) {
  const isDarkMode = useTheme();
  const router = useRouter();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const snap = await getDoc(doc(db, "orders-market", orderId));
      if (!snap.exists()) {
        setError("not-found");
        return;
      }
      setOrder(parseOrderDoc(snap));
    } catch (err) {
      console.warn("[MarketOrderDetail] load error:", err);
      setError("load-failed");
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void loadOrder();
  }, [loadOrder]);

  return (
    <main
      className={`min-h-screen ${
        isDarkMode ? "bg-[#1C1A29]" : "bg-[#F8FAFC]"
      }`}
    >
      <HeroHeader isDarkMode={isDarkMode} onBack={() => router.back()} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading && <DetailSkeleton isDarkMode={isDarkMode} />}
        {!isLoading && error && (
          <ErrorCard
            isDarkMode={isDarkMode}
            errorCode={error}
            onRetry={loadOrder}
          />
        )}
        {!isLoading && !error && order && (
          <DetailBody order={order} isDarkMode={isDarkMode} />
        )}
      </div>
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HERO HEADER
// ════════════════════════════════════════════════════════════════════════════

function HeroHeader({
  onBack,
}: {
  isDarkMode: boolean;
  onBack: () => void;
}) {
  const t = useTranslations("market");
  return (
    <header
      className="relative text-white"
      style={{
        background:
          "linear-gradient(135deg, #10B981 0%, #059669 100%)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("back")}
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/15 border border-white/20 hover:bg-white/25 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl font-extrabold truncate">
            {t("orderDetailTitle")}
          </h1>
          <p className="text-xs sm:text-sm text-white/75 font-medium">
            {t("brandName")}
          </p>
        </div>

        <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-white/15 items-center justify-center">
          <ShoppingBag className="w-5 h-5" />
        </div>
      </div>
    </header>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BODY (two-column on lg+)
// ════════════════════════════════════════════════════════════════════════════

function DetailBody({
  order,
  isDarkMode,
}: {
  order: OrderDetail;
  isDarkMode: boolean;
}) {
  return (
    <div className="mt-[-2rem] grid gap-4 lg:grid-cols-3 lg:gap-6 items-start">
      {/* Left column: header, items, notes */}
      <div className="lg:col-span-2 space-y-4">
        <OrderHeaderCard order={order} isDarkMode={isDarkMode} />
        <ItemsList items={order.items} currency={order.currency} isDarkMode={isDarkMode} />
        {order.orderNotes && (
          <NotesCard notes={order.orderNotes} isDarkMode={isDarkMode} />
        )}
      </div>

      {/* Right column: address, summary (sticky on lg+) */}
      <aside className="lg:sticky lg:top-6 space-y-4">
        {order.deliveryAddress && (
          <AddressCard
            address={order.deliveryAddress}
            isDarkMode={isDarkMode}
          />
        )}
        <SummaryCard order={order} isDarkMode={isDarkMode} />
      </aside>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CARD SHELL
// ════════════════════════════════════════════════════════════════════════════

function Card({
  isDarkMode,
  children,
  className = "",
}: {
  isDarkMode: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl p-4 sm:p-5 border shadow-sm ${
        isDarkMode
          ? "bg-[#211F31] border-white/5"
          : "bg-white border-gray-100"
      } ${className}`}
    >
      {children}
    </section>
  );
}

function InnerPanel({
  isDarkMode,
  children,
  className = "",
}: {
  isDarkMode: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg p-3 ${
        isDarkMode ? "bg-white/5" : "bg-[#F8FAFC]"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({
  isDarkMode,
  icon: Icon,
  iconColor,
  iconBg,
  title,
}: {
  isDarkMode: boolean;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div
        className="w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: iconBg,
          borderColor: `${iconColor}33`, // ~20% alpha
        }}
      >
        <Icon className="w-5 h-5" style={{ color: iconColor }} aria-hidden />
      </div>
      <h2
        className={`text-sm font-semibold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {title}
      </h2>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ORDER HEADER CARD
// ════════════════════════════════════════════════════════════════════════════

function OrderHeaderCard({
  order,
  isDarkMode,
}: {
  order: OrderDetail;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");
  const isCard = order.paymentMethod === "card";

  return (
    <Card isDarkMode={isDarkMode}>
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-lg border flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            borderColor: "rgba(16, 185, 129, 0.2)",
          }}
        >
          <Receipt className="w-5 h-5 text-emerald-600" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("orderNumberLabel")}
          </p>
          <p
            className={`mt-0.5 text-[11px] font-mono tabular-nums ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            #{shortOrderId(order.id)}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* 2x2 info grid on sm+, stacked on xs */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <InfoCell isDarkMode={isDarkMode} label={t("orderDateLabel")}>
          <span className={`text-xs font-semibold ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}>
            {formatDate(order.createdAt)}
          </span>
        </InfoCell>

        <InfoCell isDarkMode={isDarkMode} label={t("orderDeliveryLabel")}>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <MapPin className="w-3 h-3" aria-hidden />
            {t("orderDeliveryLabel")}
          </span>
        </InfoCell>

        <InfoCell
          isDarkMode={isDarkMode}
          label={t("orderPaymentMethodLabel")}
        >
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {isCard ? (
              <CreditCard
                className="w-3 h-3"
                style={{ color: "#6366F1" }}
                aria-hidden
              />
            ) : (
              <Wallet
                className="w-3 h-3"
                style={{ color: "#F59E0B" }}
                aria-hidden
              />
            )}
            {isCard ? t("orderPaymentCard") : t("orderPaymentAtDoor")}
          </span>
        </InfoCell>

        <InfoCell
          isDarkMode={isDarkMode}
          label={t("orderPaymentStatusLabel")}
        >
          <span
            className="text-xs font-semibold"
            style={{ color: order.isPaid ? "#10B981" : "#F59E0B" }}
          >
            {order.isPaid ? t("paymentPaid") : t("orderStatusPending")}
          </span>
        </InfoCell>
      </div>
    </Card>
  );
}

function InfoCell({
  isDarkMode,
  label,
  children,
}: {
  isDarkMode: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <InnerPanel isDarkMode={isDarkMode}>
      <p
        className={`text-[10px] ${
          isDarkMode ? "text-gray-500" : "text-gray-500"
        }`}
      >
        {label}
      </p>
      <div className="mt-0.5">{children}</div>
    </InnerPanel>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const t = useTranslations("market");
  const visual = STATUS_VISUALS[status];
  const Icon = visual.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap"
      style={{
        backgroundColor: `${visual.color}1A`, // ~10% alpha
        color: visual.color,
      }}
    >
      <Icon className="w-2.5 h-2.5" aria-hidden />
      {t(visual.labelKey)}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ITEMS LIST
// ════════════════════════════════════════════════════════════════════════════

function ItemsList({
  items,
  currency,
  isDarkMode,
}: {
  items: OrderItem[];
  currency: string;
  isDarkMode: boolean;
}) {
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={`${item.itemId}-${i}`}>
          <ItemCard item={item} currency={currency} isDarkMode={isDarkMode} />
        </li>
      ))}
    </ul>
  );
}

function ItemCard({
  item,
  currency,
  isDarkMode,
}: {
  item: OrderItem;
  currency: string;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");
  const locale = useLocale();
  const category = MARKET_CATEGORY_MAP.get(item.category) ?? null;

  return (
    <Card isDarkMode={isDarkMode}>
      <div className="flex gap-3">
        <CategoryThumb category={category} isDarkMode={isDarkMode} />

        <div className="flex-1 min-w-0">
          {item.brand && (
            <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">
              {item.brand}
            </p>
          )}
          <p
            className={`text-sm font-semibold leading-snug line-clamp-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {item.name}
          </p>
          {item.type && (
            <p
              className={`mt-0.5 text-[11px] truncate ${
                isDarkMode ? "text-gray-500" : "text-gray-600"
              }`}
            >
              {item.type}
            </p>
          )}
        </div>
      </div>

      {/* Price grid */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg p-2 bg-emerald-500/10">
          <p className="text-[13px] font-bold text-emerald-600 tabular-nums">
            {formatMoney(item.price, locale)} {currency}
          </p>
          <p
            className={`text-[11px] ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {t("orderQuantityLabel")}: {item.quantity}
          </p>
        </div>
        <InnerPanel isDarkMode={isDarkMode}>
          <p
            className={`text-[10px] ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            {t("orderTotalLabel")}
          </p>
          <p
            className={`text-xs font-semibold tabular-nums ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {formatMoney(lineTotal(item), locale)} {currency}
          </p>
        </InnerPanel>
      </div>
    </Card>
  );
}

function CategoryThumb({
  category,
  isDarkMode,
}: {
  category: MarketCategory | null;
  isDarkMode: boolean;
}) {
  // Same enumerated tint map used elsewhere — Tailwind JIT only keeps
  // class names that appear verbatim in source.
  const tint = CATEGORY_TINT_BY_COLOR[category?.color ?? ""] ?? TINT_FALLBACK;
  const Icon = category?.icon ?? null;

  return (
    <div
      className={`w-12 h-12 rounded-lg border border-black/10 dark:border-white/10 flex items-center justify-center flex-shrink-0 ${tint}`}
    >
      {Icon ? (
        <Icon
          className={`w-6 h-6 ${
            isDarkMode ? "text-gray-300" : "text-gray-700"
          }`}
          aria-hidden
        />
      ) : (
        <span className="text-xl" aria-hidden>
          📦
        </span>
      )}
    </div>
  );
}

const CATEGORY_TINT_BY_COLOR: Record<string, string> = {
  rose: "bg-rose-100 dark:bg-rose-500/15",
  amber: "bg-amber-100 dark:bg-amber-500/15",
  orange: "bg-orange-100 dark:bg-orange-500/15",
  sky: "bg-sky-100 dark:bg-sky-500/15",
  green: "bg-green-100 dark:bg-green-500/15",
  red: "bg-red-100 dark:bg-red-500/15",
  stone: "bg-stone-200 dark:bg-stone-500/15",
  yellow: "bg-yellow-100 dark:bg-yellow-500/15",
  lime: "bg-lime-100 dark:bg-lime-500/15",
  pink: "bg-pink-100 dark:bg-pink-500/15",
  emerald: "bg-emerald-100 dark:bg-emerald-500/15",
  blue: "bg-blue-100 dark:bg-blue-500/15",
  indigo: "bg-indigo-100 dark:bg-indigo-500/15",
  violet: "bg-violet-100 dark:bg-violet-500/15",
  slate: "bg-slate-200 dark:bg-slate-500/15",
  fuchsia: "bg-fuchsia-100 dark:bg-fuchsia-500/15",
  cyan: "bg-cyan-100 dark:bg-cyan-500/15",
  purple: "bg-purple-100 dark:bg-purple-500/15",
  teal: "bg-teal-100 dark:bg-teal-500/15",
  zinc: "bg-zinc-200 dark:bg-zinc-500/15",
};
const TINT_FALLBACK = "bg-gray-100 dark:bg-gray-700/40";

// ════════════════════════════════════════════════════════════════════════════
// ADDRESS CARD
// ════════════════════════════════════════════════════════════════════════════

function AddressCard({
  address,
  isDarkMode,
}: {
  address: OrderAddress;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");
  const line1 = [address.addressLine1, address.addressLine2]
    .filter((s) => s && s.length > 0)
    .join(", ");

  return (
    <Card isDarkMode={isDarkMode}>
      <SectionTitle
        isDarkMode={isDarkMode}
        icon={MapPin}
        iconColor="#10B981"
        iconBg="rgba(16, 185, 129, 0.1)"
        title={t("checkoutDeliveryAddressTitle")}
      />

      <InnerPanel isDarkMode={isDarkMode}>
        {line1 && (
          <p
            className={`text-[13px] font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {line1}
          </p>
        )}
        {address.city && (
          <p
            className={`mt-1 text-[13px] font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {address.city}
          </p>
        )}
        {address.phoneNumber && (
          <div className="mt-2 inline-flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-emerald-500/10 flex items-center justify-center">
              <Phone className="w-3 h-3 text-emerald-600" aria-hidden />
            </span>
            <a
              href={`tel:${address.phoneNumber.replace(/\s/g, "")}`}
              className={`text-xs font-semibold tabular-nums hover:underline ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {address.phoneNumber}
            </a>
          </div>
        )}
      </InnerPanel>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// NOTES CARD
// ════════════════════════════════════════════════════════════════════════════

function NotesCard({
  notes,
  isDarkMode,
}: {
  notes: string;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");
  return (
    <Card isDarkMode={isDarkMode}>
      <SectionTitle
        isDarkMode={isDarkMode}
        icon={FileText}
        iconColor="#F59E0B"
        iconBg="rgba(245, 158, 11, 0.1)"
        title={t("checkoutOrderNoteTitle")}
      />
      <InnerPanel isDarkMode={isDarkMode}>
        <p
          className={`text-[13px] whitespace-pre-line leading-relaxed ${
            isDarkMode ? "text-gray-300" : "text-gray-700"
          }`}
        >
          {notes}
        </p>
      </InnerPanel>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SUMMARY CARD
// ════════════════════════════════════════════════════════════════════════════

function SummaryCard({
  order,
  isDarkMode,
}: {
  order: OrderDetail;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");
  const locale = useLocale();
  const deliveryIsFree = order.deliveryFee === 0;

  return (
    <Card isDarkMode={isDarkMode}>
      <SectionTitle
        isDarkMode={isDarkMode}
        icon={Receipt}
        iconColor="#10B981"
        iconBg="rgba(16, 185, 129, 0.1)"
        title={t("cartOrderSummary")}
      />

      <InnerPanel isDarkMode={isDarkMode}>
        <dl className="space-y-2">
          <SummaryRow
            isDarkMode={isDarkMode}
            label={t("orderSubtotalLabel")}
            value={`${formatMoney(order.subtotal, locale)} ${order.currency}`}
          />
          <SummaryRow
            isDarkMode={isDarkMode}
            label={t("orderDeliveryLabel")}
            value={
              deliveryIsFree
                ? t("orderDeliveryFree")
                : `${formatMoney(order.deliveryFee, locale)} ${order.currency}`
            }
            valueColor={deliveryIsFree ? "#10B981" : undefined}
          />
          <div
            className={`h-px my-1 ${
              isDarkMode ? "bg-white/10" : "bg-gray-200"
            }`}
          />
          <SummaryRow
            isDarkMode={isDarkMode}
            label={t("orderTotalLabel")}
            value={`${formatMoney(order.totalPrice, locale)} ${order.currency}`}
            isTotal
          />
        </dl>

        <div className="mt-3 inline-flex items-center gap-1.5">
          {order.isPaid ? (
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" aria-hidden />
          ) : (
            <Wallet className="w-3.5 h-3.5 text-amber-500" aria-hidden />
          )}
          <span
            className="text-[11px] font-medium"
            style={{ color: order.isPaid ? "#10B981" : "#F59E0B" }}
          >
            {order.isPaid
              ? t("orderPaidOnline")
              : t("orderPayOnDelivery")}
          </span>
        </div>
      </InnerPanel>
    </Card>
  );
}

function SummaryRow({
  isDarkMode,
  label,
  value,
  valueColor,
  isTotal = false,
}: {
  isDarkMode: boolean;
  label: string;
  value: string;
  valueColor?: string;
  isTotal?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={`${
          isTotal
            ? `text-xs font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`
            : `text-[11px] font-semibold ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`
        }`}
      >
        {label}
      </dt>
      <dd
        className={`tabular-nums ${
          isTotal ? "text-sm font-bold text-emerald-600" : "text-[11px] font-semibold"
        }`}
        style={
          !isTotal
            ? {
                color:
                  valueColor ??
                  (isDarkMode ? "#FFFFFF" : "#1A1A1A"),
              }
            : undefined
        }
      >
        {value}
      </dd>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SKELETON
// ════════════════════════════════════════════════════════════════════════════

function DetailSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  const card = isDarkMode ? "bg-[#211F31]" : "bg-white";
  const bg = isDarkMode ? "bg-[#3A3850]" : "bg-gray-200";
  return (
    <div className="mt-[-2rem] grid gap-4 lg:grid-cols-3 lg:gap-6 items-start animate-pulse">
      <div className="lg:col-span-2 space-y-4">
        <div className={`rounded-2xl p-5 ${card} space-y-3`}>
          <div className={`h-5 w-40 rounded ${bg}`} />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`h-14 rounded-lg ${bg}`} />
            ))}
          </div>
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className={`rounded-2xl p-5 ${card}`}>
            <div className="flex gap-3">
              <div className={`w-12 h-12 rounded-lg ${bg}`} />
              <div className="flex-1 space-y-2">
                <div className={`h-3 w-16 rounded ${bg}`} />
                <div className={`h-4 w-3/4 rounded ${bg}`} />
                <div className={`h-3 w-1/3 rounded ${bg}`} />
              </div>
            </div>
            <div className={`mt-3 h-16 rounded-lg ${bg}`} />
          </div>
        ))}
      </div>
      <aside className={`rounded-2xl p-5 ${card} space-y-3`}>
        <div className={`h-6 w-28 rounded ${bg}`} />
        <div className={`h-24 rounded-lg ${bg}`} />
        <div className={`h-32 rounded-lg ${bg}`} />
      </aside>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ERROR CARD
// ════════════════════════════════════════════════════════════════════════════

function ErrorCard({
  isDarkMode,
  errorCode,
  onRetry,
}: {
  isDarkMode: boolean;
  errorCode: string;
  onRetry: () => void;
}) {
  const t = useTranslations("market");
  const isNotFound = errorCode === "not-found";
  const title = isNotFound
    ? t("orderNotFound")
    : t("orderLoadFailed");
  const subtitle = isNotFound
    ? t("orderNotFoundSubtitle")
    : t("orderLoadFailedSubtitle");

  return (
    <div
      className={`max-w-md mx-auto rounded-2xl p-8 text-center ${
        isDarkMode
          ? "bg-[#211F31] border border-white/5"
          : "bg-white border border-gray-100"
      }`}
    >
      <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 flex items-center justify-center">
        <AlertCircle className="w-7 h-7 text-red-500" aria-hidden />
      </div>
      <h2
        className={`mt-4 text-base font-semibold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {title}
      </h2>
      <p
        className={`mt-1.5 text-sm ${
          isDarkMode ? "text-gray-400" : "text-gray-600"
        }`}
      >
        {subtitle}
      </p>

      <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
        {!isNotFound && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t("ordersTryAgain")}
          </button>
        )}
        <Link
          href="/market-orders"
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
            isDarkMode
              ? "bg-white/5 text-white hover:bg-white/10"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          {t("backToOrders")}
        </Link>
      </div>
    </div>
  );
}