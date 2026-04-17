// components/market/MarketReceiptDetailPage.tsx
//
// Web port of lib/screens/receipts/market_receipt_detail_screen.dart.
//
// Fetches two Firestore docs:
//   1. users/{uid}/marketReceipts/{receiptId}  → core receipt
//   2. orders-market/{orderId}                  → items + notes + status
//
// Layout:
//   • Mobile: everything stacks. Summary card floats to the bottom.
//   • lg+: items + notes on the left, header + address + summary on the
//     right (sticky). Same pattern as order detail.
//
// Deliberate deviations from Flutter:
//   • "Download PDF" opens the URL in a new tab instead of forcing a
//     download. Browser download semantics are inconsistent across
//     browsers/devices; the view-first, save-if-you-want pattern is
//     what web users actually expect.
//   • Copy-to-clipboard uses navigator.clipboard with a transient
//     `_copySuccess` feedback state — matches Flutter's 2s icon swap.
//   • shimmer → Tailwind animate-pulse
//   • feather-icons → lucide-react (same visual language)

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronLeft,
  Copy,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Info,
  MapPin,
  Phone,
  RefreshCw,
  ShoppingBag,
  StickyNote,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  doc,
  getDoc,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import { getDownloadURL, getStorage, ref as storageRef } from "firebase/storage";
import { getApp } from "firebase/app";

import { db } from "@/lib/firebase";
import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/context/UserProvider";

// ════════════════════════════════════════════════════════════════════════════
// MODELS
// ════════════════════════════════════════════════════════════════════════════

interface DeliveryAddress {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  phoneNumber: string | null;
}

interface ReceiptDetail {
  id: string;
  orderId: string;
  receiptId: string;
  totalPrice: number;
  subtotal: number;
  deliveryFee: number;
  currency: string;
  timestamp: Date;
  paymentMethod: string;
  isPaid: boolean;
  deliveryType: string;
  buyerName: string;
  deliveryAddress: DeliveryAddress | null;
  filePath: string | null;
  downloadUrl: string | null;
}

interface OrderItem {
  itemId: string;
  name: string;
  brand: string;
  type: string;
  category: string;
  price: number;
  quantity: number;
  itemTotal: number | null;
}

interface OrderMeta {
  orderNotes: string | null;
  buyerPhone: string | null;
  status: string | null;
}

const EMPTY_META: OrderMeta = {
  orderNotes: null,
  buyerPhone: null,
  status: null,
};

// ════════════════════════════════════════════════════════════════════════════
// PARSERS
// ════════════════════════════════════════════════════════════════════════════

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

function parseTimestamp(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate();
  if (typeof v === "string") {
    const parsed = new Date(v);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function parseAddress(raw: unknown): DeliveryAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  return {
    addressLine1: asString(m.addressLine1),
    addressLine2: typeof m.addressLine2 === "string" ? m.addressLine2 : null,
    city: asString(m.city),
    phoneNumber: typeof m.phoneNumber === "string" ? m.phoneNumber : null,
  };
}

function parseReceipt(snap: DocumentSnapshot<DocumentData>): ReceiptDetail {
  const d = snap.data() ?? {};
  const totalPrice = asNumber(d.totalPrice);
  return {
    id: snap.id,
    orderId: asString(d.orderId),
    receiptId: asString(d.receiptId),
    totalPrice,
    // Flutter falls back to totalPrice if subtotal is missing
    subtotal:
      d.subtotal != null ? asNumber(d.subtotal) : totalPrice,
    deliveryFee: asNumber(d.deliveryFee),
    currency: asString(d.currency, "TL"),
    timestamp: parseTimestamp(d.timestamp),
    paymentMethod: asString(d.paymentMethod),
    isPaid: d.isPaid === true,
    deliveryType: asString(d.deliveryType, "delivery"),
    buyerName: asString(d.buyerName),
    deliveryAddress: parseAddress(d.deliveryAddress),
    filePath: typeof d.filePath === "string" ? d.filePath : null,
    downloadUrl: typeof d.downloadUrl === "string" ? d.downloadUrl : null,
  };
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

function parseOrder(snap: DocumentSnapshot<DocumentData>): {
  items: OrderItem[];
  meta: OrderMeta;
} {
  const d = snap.data() ?? {};
  const rawItems = Array.isArray(d.items) ? d.items : [];
  const items = rawItems
    .map(parseItem)
    .filter((i): i is OrderItem => i !== null);
  return {
    items,
    meta: {
      orderNotes: typeof d.orderNotes === "string" ? d.orderNotes : null,
      buyerPhone: typeof d.buyerPhone === "string" ? d.buyerPhone : null,
      status: typeof d.status === "string" ? d.status : null,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// FORMATTERS
// ════════════════════════════════════════════════════════════════════════════

function formatMoney(amount: number): string {
  // Flutter uses toStringAsFixed(0) — integer amounts, no grouping, no decimals.
  // Match exactly; numbers shown on a receipt should look like receipts.
  return Math.round(amount).toString();
}

function formatDate(d: Date): string {
  // Flutter: dd/MM/yyyy HH:mm
  const pad = (n: number) => n.toString().padStart(2, "0");
  const dd = pad(d.getDate());
  const mm = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function shortOrderId(id: string): string {
  return id.slice(0, Math.min(id.length, 8)).toUpperCase();
}

function lineTotal(item: OrderItem): number {
  return item.itemTotal ?? item.price * item.quantity;
}

// ════════════════════════════════════════════════════════════════════════════
// PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function MarketReceiptDetailPage({
  receiptId,
}: {
  receiptId: string;
}) {
  const isDarkMode = useTheme();
  const router = useRouter();
  const { user, isLoading: isUserLoading } = useUser();

  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [meta, setMeta] = useState<OrderMeta>(EMPTY_META);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Loader ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (isUserLoading) return; // wait for auth state
    if (!user) {
      setError("not-authenticated");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const receiptSnap = await getDoc(
        doc(db, "users", user.uid, "marketReceipts", receiptId),
      );
      if (!receiptSnap.exists()) {
        setError("not-found");
        setIsLoading(false);
        return;
      }

      const r = parseReceipt(receiptSnap);
      setReceipt(r);

      // Fetch the parent order doc for items + notes + live status.
      // This read is best-effort; if the order doc is missing we still show
      // the receipt with empty items (matches Flutter).
      if (r.orderId) {
        try {
          const orderSnap = await getDoc(doc(db, "orders-market", r.orderId));
          if (orderSnap.exists()) {
            const { items: parsedItems, meta: parsedMeta } =
              parseOrder(orderSnap);
            setItems(parsedItems);
            setMeta(parsedMeta);
          } else {
            setItems([]);
            setMeta(EMPTY_META);
          }
        } catch (err) {
          console.warn("[MarketReceiptDetail] order fetch failed:", err);
          setItems([]);
          setMeta(EMPTY_META);
        }
      }
    } catch (err) {
      console.warn("[MarketReceiptDetail] receipt fetch failed:", err);
      setError("load-failed");
    } finally {
      setIsLoading(false);
    }
  }, [receiptId, user, isUserLoading]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ════════════════════════════════════════════════════════════════════════

  return (
    <main
      className={`min-h-screen ${
        isDarkMode ? "bg-[#1C1A29]" : "bg-[#F8FAFC]"
      }`}
    >
      <HeroHeader
        isDarkMode={isDarkMode}
        onBack={() => router.back()}
        receipt={receipt}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading && <DetailSkeleton isDarkMode={isDarkMode} />}
        {!isLoading && error && (
          <ErrorCard
            isDarkMode={isDarkMode}
            errorCode={error}
            onRetry={loadData}
          />
        )}
        {!isLoading && !error && receipt && (
          <DetailBody
            receipt={receipt}
            items={items}
            meta={meta}
            isDarkMode={isDarkMode}
          />
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
  receipt,
}: {
  isDarkMode: boolean;
  onBack: () => void;
  receipt: ReceiptDetail | null;
}) {
  const t = useTranslations("market");
  const hasPdf = Boolean(
    receipt?.downloadUrl || receipt?.filePath,
  );

  const [isOpening, setIsOpening] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  const handleOpenPdf = useCallback(async () => {
    if (!receipt || isOpening) return;
    setIsOpening(true);
    setPdfError(false);

    try {
      let url = receipt.downloadUrl ?? "";
      if (!url && receipt.filePath) {
        // Resolve Firebase Storage path to a signed download URL.
        // Same fallback chain as Flutter.
        const storage = getStorage(getApp());
        url = await getDownloadURL(storageRef(storage, receipt.filePath));
      }
      if (!url) {
        setPdfError(true);
        return;
      }
      // Open in a new tab. noopener is safer and window.open is more
      // reliable across browsers than a programmatic <a download>.
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.warn("[MarketReceiptDetail] PDF open failed:", err);
      setPdfError(true);
    } finally {
      setIsOpening(false);
    }
  }, [receipt, isOpening]);

  return (
    <header
      className="relative text-white"
      style={{
        background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
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
            {t("receiptTitle")}
          </h1>
          <p className="text-xs sm:text-sm text-white/75 font-medium">
            {t("brandName")}
          </p>
        </div>

        {hasPdf && (
          <button
            type="button"
            onClick={handleOpenPdf}
            disabled={isOpening}
            aria-label={t("receiptDownloadPdf")}
            className="inline-flex items-center justify-center gap-2 h-10 px-3 sm:px-4 rounded-xl bg-white/15 border border-white/20 hover:bg-white/25 transition-colors text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">
              {t("receiptDownloadPdf")}
            </span>
          </button>
        )}

        <div className="hidden sm:flex w-12 h-12 rounded-2xl bg-white/15 items-center justify-center">
          <FileText className="w-5 h-5" />
        </div>
      </div>

      {pdfError && (
        <div
          role="alert"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-3"
        >
          <div className="inline-flex items-center gap-2 rounded-lg bg-black/20 text-white text-xs px-3 py-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {t("receiptPdfNotReady")}
          </div>
        </div>
      )}
    </header>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BODY
// ════════════════════════════════════════════════════════════════════════════

function DetailBody({
  receipt,
  items,
  meta,
  isDarkMode,
}: {
  receipt: ReceiptDetail;
  items: OrderItem[];
  meta: OrderMeta;
  isDarkMode: boolean;
}) {
  return (
    <div className="mt-[-2rem] grid gap-4 lg:grid-cols-3 lg:gap-6 items-start">
      {/* Left: summary header + items + notes */}
      <div className="lg:col-span-2 space-y-4">
        <HeaderHeroCard receipt={receipt} isDarkMode={isDarkMode} />
        {items.length > 0 && (
          <ItemsCard
            items={items}
            currency={receipt.currency}
            orderNotes={meta.orderNotes}
            isDarkMode={isDarkMode}
          />
        )}
      </div>

      {/* Right: order info + address + price summary */}
      <aside className="lg:sticky lg:top-6 space-y-4">
        <OrderInfoCard
          receipt={receipt}
          status={meta.status}
          isDarkMode={isDarkMode}
        />
        {receipt.deliveryAddress && (
          <AddressCard
            address={receipt.deliveryAddress}
            isDarkMode={isDarkMode}
          />
        )}
        <SummaryCard receipt={receipt} isDarkMode={isDarkMode} />
      </aside>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SHARED: CARD + SECTION
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
  title,
}: {
  isDarkMode: boolean;
  icon: LucideIcon;
  iconColor: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${iconColor}1A` }}
      >
        <Icon className="w-4 h-4" style={{ color: iconColor }} aria-hidden />
      </div>
      <h2
        className={`text-sm font-bold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {title}
      </h2>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HERO (per-receipt card with brand, date, paid badge)
// ════════════════════════════════════════════════════════════════════════════

function HeaderHeroCard({
  receipt,
  isDarkMode,
}: {
  receipt: ReceiptDetail;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");

  const paidBgColor = receipt.isPaid
    ? isDarkMode
      ? "rgba(16, 185, 129, 0.15)"
      : "rgba(16, 185, 129, 0.1)"
    : isDarkMode
      ? "rgba(245, 158, 11, 0.15)"
      : "rgba(245, 158, 11, 0.1)";
  const paidColor = receipt.isPaid ? "#10B981" : "#D97706";

  return (
    <section
      className="rounded-2xl p-5 sm:p-6 border"
      style={{
        background: isDarkMode
          ? "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.15))"
          : "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.08))",
        borderColor: isDarkMode
          ? "rgba(16, 185, 129, 0.2)"
          : "rgba(16, 185, 129, 0.15)",
      }}
    >
      <div className="flex flex-col items-center text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
          }}
        >
          <ShoppingBag className="w-7 h-7 text-white" aria-hidden />
        </div>
        <h2
          className={`mt-3 text-lg font-extrabold ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {t("brandName")}
        </h2>
        <p
          className={`mt-0.5 text-xs ${
            isDarkMode ? "text-gray-400" : "text-gray-500"
          }`}
        >
          {formatDate(receipt.timestamp)}
        </p>

        <span
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold"
          style={{
            backgroundColor: paidBgColor,
            color: paidColor,
            borderColor: `${paidColor}4D`, // ~30% alpha
          }}
        >
          {receipt.isPaid ? (
            <Check className="w-3.5 h-3.5" aria-hidden />
          ) : (
            <Wallet className="w-3.5 h-3.5" aria-hidden />
          )}
          {receipt.isPaid
            ? t("orderPaidOnline")
            : t("orderPaymentAtDoor")}
        </span>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ORDER INFO CARD
// ════════════════════════════════════════════════════════════════════════════

function OrderInfoCard({
  receipt,
  status,
  isDarkMode,
}: {
  receipt: ReceiptDetail;
  status: string | null;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!receipt.orderId) return;
    try {
      await navigator.clipboard.writeText(receipt.orderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn("[MarketReceiptDetail] copy failed:", err);
    }
  }, [receipt.orderId]);

  const isCard = receipt.paymentMethod === "card";

  return (
    <Card isDarkMode={isDarkMode}>
      <SectionTitle
        isDarkMode={isDarkMode}
        icon={Info}
        iconColor="#10B981"
        title={t("receiptOrderInfo")}
      />

      <dl className="divide-y divide-black/5 dark:divide-white/5">
        <InfoRow
          isDarkMode={isDarkMode}
          label={t("receiptOrderNumber")}
        >
          <div className="inline-flex items-center gap-1.5">
            <span
              className={`text-xs font-mono font-semibold tabular-nums ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              #{shortOrderId(receipt.orderId)}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={t("receiptCopyOrderId")}
              className={`p-1 -m-1 rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                copied
                  ? "text-emerald-600"
                  : isDarkMode
                    ? "text-gray-500 hover:text-white"
                    : "text-gray-400 hover:text-gray-700"
              }`}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            {copied && (
              <span
                role="status"
                className="text-[10px] font-semibold text-emerald-600"
              >
                {t("receiptCopied")}
              </span>
            )}
          </div>
        </InfoRow>

        <InfoRow
          isDarkMode={isDarkMode}
          label={t("receiptPaymentMethod")}
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
              <DollarSign
                className="w-3 h-3"
                style={{ color: "#F59E0B" }}
                aria-hidden
              />
            )}
            {isCard
              ? t("orderPaymentCard")
              : t("orderPaymentAtDoor")}
          </span>
        </InfoRow>

        <InfoRow
          isDarkMode={isDarkMode}
          label={t("receiptDelivery")}
        >
          <span className="text-xs font-semibold text-emerald-600">
            {t("receiptDelivery")}
          </span>
        </InfoRow>

        {status && (
          <InfoRow
            isDarkMode={isDarkMode}
            label={t("receiptStatus")}
            isLast
          >
            <span
              className={`text-xs font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t.has(localizeStatusKey(status))
                ? t(localizeStatusKey(status))
                : status}
            </span>
          </InfoRow>
        )}
      </dl>
    </Card>
  );
}

function localizeStatusKey(status: string): string {
  switch (status) {
    case "pending":
      return "orderStatusPending";
    case "confirmed":
      return "orderStatusConfirmed";
    case "preparing":
      return "orderStatusPreparing";
    case "out_for_delivery":
      return "orderStatusOutForDelivery";
    case "delivered":
      return "orderStatusDelivered";
    case "completed":
      return "orderStatusCompleted";
    case "rejected":
      return "orderStatusRejected";
    case "cancelled":
      return "orderStatusCancelled";
    default:
      return "";
  }
}

function InfoRow({
  isDarkMode,
  label,
  children,
  isLast = false,
}: {
  isDarkMode: boolean;
  label: string;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 py-2.5 ${
        isLast ? "pb-0" : ""
      }`}
    >
      <dt
        className={`text-xs ${
          isDarkMode ? "text-gray-400" : "text-gray-500"
        }`}
      >
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ADDRESS CARD
// ════════════════════════════════════════════════════════════════════════════

function AddressCard({
  address,
  isDarkMode,
}: {
  address: DeliveryAddress;
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
        title={t("receiptDeliveryAddress")}
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
          <a
            href={`tel:${address.phoneNumber.replace(/\s/g, "")}`}
            className="mt-2 inline-flex items-center gap-2 group"
          >
            <span className="w-5 h-5 rounded bg-emerald-500/10 flex items-center justify-center">
              <Phone className="w-3 h-3 text-emerald-600" aria-hidden />
            </span>
            <span
              className={`text-xs font-semibold tabular-nums group-hover:underline ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {address.phoneNumber}
            </span>
          </a>
        )}
      </InnerPanel>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ITEMS CARD
// ════════════════════════════════════════════════════════════════════════════

function ItemsCard({
  items,
  currency,
  orderNotes,
  isDarkMode,
}: {
  items: OrderItem[];
  currency: string;
  orderNotes: string | null;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");

  return (
    <Card isDarkMode={isDarkMode}>
      <SectionTitle
        isDarkMode={isDarkMode}
        icon={ShoppingBag}
        iconColor="#10B981"
        title={t("receiptOrderedItems")}
      />

      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={`${item.itemId}-${i}`}>
            <ItemRow item={item} currency={currency} isDarkMode={isDarkMode} />
          </li>
        ))}
      </ul>

      {orderNotes && (
        <div
          className={`mt-3 rounded-lg border p-3 ${
            isDarkMode
              ? "bg-white/5 border-white/5"
              : "bg-[#F8FAFC] border-gray-100"
          }`}
        >
          <div className="flex items-start gap-2">
            <StickyNote
              className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
              aria-hidden
            />
            <div className="flex-1 min-w-0">
              <p
                className={`text-[10px] font-bold uppercase tracking-wider ${
                  isDarkMode ? "text-gray-500" : "text-gray-400"
                }`}
              >
                {t("receiptOrderNoteHeader")}
              </p>
              <p
                className={`mt-1 text-[12px] whitespace-pre-line leading-relaxed ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                {orderNotes}
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function ItemRow({
  item,
  currency,
  isDarkMode,
}: {
  item: OrderItem;
  currency: string;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");

  return (
    <InnerPanel isDarkMode={isDarkMode}>
      <div className="flex items-start gap-2.5">
        <span className="inline-flex items-center justify-center px-1.5 h-5 rounded bg-emerald-500/10 text-[11px] font-bold text-emerald-600 flex-shrink-0 tabular-nums">
          {item.quantity}×
        </span>

        <div className="flex-1 min-w-0">
          {item.brand && (
            <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">
              {item.brand}
            </p>
          )}
          <p
            className={`text-[13px] font-semibold leading-snug ${
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

        <span className="text-[13px] font-bold text-emerald-600 tabular-nums whitespace-nowrap">
          {formatMoney(lineTotal(item))} {currency}
        </span>
      </div>

      {item.quantity > 1 && (
        <p
          className={`mt-1 text-[11px] pl-8 ${
            isDarkMode ? "text-gray-500" : "text-gray-400"
          }`}
        >
          {t("receiptPerUnit", {
            price: `${formatMoney(item.price)} ${currency}`,
          })}
        </p>
      )}
    </InnerPanel>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SUMMARY CARD
// ════════════════════════════════════════════════════════════════════════════

function SummaryCard({
  receipt,
  isDarkMode,
}: {
  receipt: ReceiptDetail;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");
  const deliveryIsFree = receipt.deliveryFee === 0;

  return (
    <Card isDarkMode={isDarkMode}>
      <SectionTitle
        isDarkMode={isDarkMode}
        icon={DollarSign}
        iconColor="#10B981"
        title={t("receiptPriceSummary")}
      />

      <InnerPanel isDarkMode={isDarkMode}>
        <dl className="divide-y divide-black/5 dark:divide-white/5">
          <InfoRow
            isDarkMode={isDarkMode}
            label={t("orderSubtotalLabel")}
          >
            <span
              className={`text-xs font-semibold tabular-nums ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {formatMoney(receipt.subtotal)} {receipt.currency}
            </span>
          </InfoRow>
          <InfoRow
            isDarkMode={isDarkMode}
            label={t("orderDeliveryLabel")}
            isLast
          >
            <span
              className="text-xs font-semibold tabular-nums"
              style={{
                color: deliveryIsFree
                  ? "#10B981"
                  : isDarkMode
                    ? "#FFFFFF"
                    : "#1A1A1A",
              }}
            >
              {deliveryIsFree
                ? t("orderDeliveryFree")
                : `${formatMoney(receipt.deliveryFee)} ${receipt.currency}`}
            </span>
          </InfoRow>
        </dl>
      </InnerPanel>

      {/* Grand total */}
      <div
        className="mt-3 rounded-xl p-3.5 border"
        style={{
          background: isDarkMode
            ? "linear-gradient(90deg, rgba(16,185,129,0.12), rgba(5,150,105,0.12))"
            : "linear-gradient(90deg, rgba(16,185,129,0.06), rgba(5,150,105,0.06))",
          borderColor: isDarkMode
            ? "rgba(16, 185, 129, 0.2)"
            : "rgba(16, 185, 129, 0.15)",
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={`text-sm font-bold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("orderTotalLabel")}
          </span>
          <span className="text-xl font-extrabold text-emerald-600 tabular-nums">
            {formatMoney(receipt.totalPrice)} {receipt.currency}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5">
        {receipt.isPaid ? (
          <Check className="w-3.5 h-3.5 text-emerald-500" aria-hidden />
        ) : (
          <Wallet className="w-3.5 h-3.5 text-amber-500" aria-hidden />
        )}
        <span
          className="text-[11px] font-medium"
          style={{ color: receipt.isPaid ? "#10B981" : "#D97706" }}
        >
          {receipt.isPaid
            ? t("receiptOnlinePaymentReceived")
            : t("receiptPayDuringDelivery")}
        </span>
      </div>
    </Card>
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
        <div className={`rounded-2xl p-6 ${card} flex flex-col items-center gap-3`}>
          <div className={`w-14 h-14 rounded-2xl ${bg}`} />
          <div className={`h-4 w-32 rounded ${bg}`} />
          <div className={`h-3 w-24 rounded ${bg}`} />
          <div className={`h-6 w-28 rounded-full ${bg}`} />
        </div>
        <div className={`rounded-2xl p-5 ${card} space-y-3`}>
          <div className={`h-5 w-40 rounded ${bg}`} />
          <div className={`h-16 rounded-lg ${bg}`} />
          <div className={`h-16 rounded-lg ${bg}`} />
        </div>
      </div>
      <aside className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`rounded-2xl p-5 ${card} space-y-3`}>
            <div className={`h-5 w-28 rounded ${bg}`} />
            <div className={`h-20 rounded-lg ${bg}`} />
          </div>
        ))}
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
  const isAuth = errorCode === "not-authenticated";

  let title = t("receiptLoadError");
  let subtitle = t("orderLoadFailedSubtitle");
  if (isNotFound) {
    title = t("receiptNotFound");
    subtitle = t("receiptNotFoundSubtitle");
  } else if (isAuth) {
    title = t("cartSignInTitle");
    subtitle = t("cartSignInSubtitle");
  }

  return (
    <div
      className={`max-w-md mx-auto rounded-2xl p-8 text-center ${
        isDarkMode
          ? "bg-[#211F31] border border-white/5"
          : "bg-white border border-gray-100"
      }`}
    >
      <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 flex items-center justify-center">
        {isNotFound ? (
          <FileText className="w-7 h-7 text-red-500" aria-hidden />
        ) : (
          <AlertCircle className="w-7 h-7 text-red-500" aria-hidden />
        )}
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
        {!isNotFound && !isAuth && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t("ordersTryAgain")}
          </button>
        )}
        {isAuth ? (
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-colors"
          >
            {t("signIn")}
          </Link>
        ) : (
          <Link
            href="/receipts"
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              isDarkMode
                ? "bg-white/5 text-white hover:bg-white/10"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            {t("receiptBackToReceipts")}
          </Link>
        )}
      </div>
    </div>
  );
}