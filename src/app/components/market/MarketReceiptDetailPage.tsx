"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Share2,
  Download,
  Copy,
  CheckCircle,
  MapPin,
  User,
  LogIn,
  FileText,
  Info,
  ShoppingBag,
  DollarSign,
  CreditCard,
  Banknote,
  StickyNote,
  Phone,
} from "lucide-react";
import {
  doc,
  getDoc,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";
import {
  getDownloadURL,
  getStorage,
  ref as storageRef,
} from "firebase/storage";
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
    subtotal: d.subtotal != null ? asNumber(d.subtotal) : totalPrice,
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

function formatDate(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function shortOrderId(id: string): string {
  return id.slice(0, Math.min(id.length, 8)).toUpperCase();
}

function lineTotal(item: OrderItem): number {
  return item.itemTotal ?? item.price * item.quantity;
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
  const { user, isLoading: authLoading } = useUser();
  const t = useTranslations("market");

  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [meta, setMeta] = useState<OrderMeta>(EMPTY_META);
  const [isLoading, setIsLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    const fetchReceipt = async () => {
      if (authLoading) return;
      if (!user) {
        setIsLoading(false);
        return;
      }
      try {
        const receiptSnap = await getDoc(
          doc(db, "users", user.uid, "marketReceipts", receiptId),
        );
        if (!receiptSnap.exists()) {
          setIsLoading(false);
          return;
        }
        const r = parseReceipt(receiptSnap);
        setReceipt(r);

        if (r.orderId) {
          try {
            const orderSnap = await getDoc(
              doc(db, "orders-market", r.orderId),
            );
            if (orderSnap.exists()) {
              const { items: parsedItems, meta: parsedMeta } =
                parseOrder(orderSnap);
              setItems(parsedItems);
              setMeta(parsedMeta);
            }
          } catch (err) {
            console.warn("[MarketReceiptDetail] order fetch failed:", err);
          }
        }
      } catch (err) {
        console.warn("[MarketReceiptDetail] receipt fetch failed:", err);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchReceipt();
  }, [receiptId, user, authLoading]);

  const copyOrderId = useCallback(async () => {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(receipt.orderId);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.warn("[MarketReceiptDetail] copy failed:", err);
    }
  }, [receipt]);

  const downloadReceipt = useCallback(async () => {
    if (!receipt) return;
    try {
      let url = receipt.downloadUrl ?? "";
      if (!url && receipt.filePath) {
        const storage = getStorage(getApp());
        url = await getDownloadURL(storageRef(storage, receipt.filePath));
      }
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        alert(t("receiptPdfNotReady"));
      }
    } catch {
      alert(t("receiptPdfNotReady"));
    }
  }, [receipt, t]);

  const shareReceipt = useCallback(() => {
    if (!receipt) return;
    const text = `${t("receiptTitle")} — ${t("brandName")}\n${t(
      "receiptOrderNumber",
    )} #${shortOrderId(receipt.orderId)}\n${t(
      "orderTotalLabel",
    )}: ${Math.round(receipt.totalPrice)} ${receipt.currency}\n${formatDate(
      receipt.timestamp,
    )}`;
    if (navigator.share)
      void navigator.share({ title: t("receiptTitle"), text });
    else void navigator.clipboard.writeText(text);
  }, [receipt, t]);

  // ── Shared layout components ─────────────────────────────────────
  const Toolbar = ({ actions }: { actions?: React.ReactNode }) => (
    <div
      className={`sticky top-14 z-30 border-b ${
        isDarkMode
          ? "bg-gray-900/80 backdrop-blur-xl border-gray-700/80"
          : "bg-white/80 backdrop-blur-xl border-gray-100/80"
      }`}
    >
      <div className="max-w-4xl mx-auto flex items-center gap-3 px-3 sm:px-6 py-3">
        <button
          onClick={() => router.back()}
          className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
              : "bg-gray-50 border-gray-200 hover:bg-gray-100"
          }`}
        >
          <ArrowLeft
            className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
          />
        </button>
        <h1
          className={`text-lg font-bold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
        >
          {t("receiptTitle")}
        </h1>
        <div className="flex-1" />
        {actions}
      </div>
    </div>
  );

  const SectionCard = ({
    icon: Icon,
    title,
    children,
  }: {
    icon: React.ElementType;
    title: string;
    children: React.ReactNode;
  }) => (
    <div
      className={`rounded-2xl border p-4 ${
        isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isDarkMode ? "bg-orange-900/30" : "bg-orange-50"
          }`}
        >
          <Icon className="w-4 h-4 text-orange-500" />
        </div>
        <span
          className={`text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
        >
          {title}
        </span>
      </div>
      {children}
    </div>
  );

  const InfoRow = ({
    label,
    value,
    valueClass,
  }: {
    label: string;
    value: React.ReactNode;
    valueClass?: string;
  }) => (
    <div
      className={`flex items-center justify-between py-2 border-b last:border-0 ${
        isDarkMode ? "border-gray-700" : "border-gray-50"
      }`}
    >
      <span
        className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
      >
        {label}
      </span>
      <span
        className={`text-xs font-semibold ${
          valueClass || (isDarkMode ? "text-white" : "text-gray-900")
        }`}
      >
        {value}
      </span>
    </div>
  );

  // ── Early returns ────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center pt-20 ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        <Toolbar />
        <div className="text-center py-16 px-3">
          <User
            className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
          />
          <h3
            className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("cartSignInTitle")}
          </h3>
          <p
            className={`text-xs max-w-xs mx-auto mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {t("cartSignInSubtitle")}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
          >
            <LogIn className="w-3.5 h-3.5" />
            {t("signIn")}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        <Toolbar />
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-3">
          {[...Array(4)].map((_, i) => (
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
      </div>
    );
  }

  if (!receipt) {
    return (
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        <Toolbar />
        <div className="text-center py-16 px-3">
          <FileText
            className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
          />
          <h3
            className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("receiptNotFound")}
          </h3>
          <p
            className={`text-xs max-w-xs mx-auto mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {t("receiptNotFoundSubtitle")}
          </p>
          <button
            onClick={() => router.back()}
            className="inline-flex items-center px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
          >
            {t("receiptGoBack")}
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  const isPaid = receipt.isPaid;
  const isCard = receipt.paymentMethod === "card";
  const deliveryIsFree = receipt.deliveryFee === 0;
  const hasPdf = Boolean(receipt.downloadUrl || receipt.filePath);

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
    >
      <Toolbar
        actions={
          <div className="flex items-center gap-1">
            <button
              onClick={shareReceipt}
              className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                  : "bg-gray-50 border-gray-200 hover:bg-gray-100"
              }`}
            >
              <Share2
                className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              />
            </button>
            {hasPdf && (
              <button
                onClick={downloadReceipt}
                className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                    : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                }`}
              >
                <Download
                  className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
                />
              </button>
            )}
          </div>
        }
      />

      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-3">
        {/* ── Header card ───────────────────────────────────────── */}
        <div
          className={`rounded-2xl p-4 text-center ${
            isDarkMode
              ? "bg-orange-900/20 border border-orange-700/30"
              : "bg-orange-50 border border-orange-100"
          }`}
        >
          <div
            className={`w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center ${
              isDarkMode ? "bg-orange-900/30" : "bg-orange-100"
            }`}
          >
            <ShoppingBag className="w-5 h-5 text-orange-500" />
          </div>
          <h2
            className={`text-sm font-bold mb-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("brandName")}
          </h2>
          <p
            className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {formatDate(receipt.timestamp)}
          </p>
          <div className="flex justify-center mt-2">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                isPaid
                  ? isDarkMode
                    ? "bg-green-900/30 text-green-400"
                    : "bg-green-50 text-green-700"
                  : isDarkMode
                    ? "bg-amber-900/30 text-amber-400"
                    : "bg-amber-50 text-amber-700"
              }`}
            >
              {isPaid ? (
                <CheckCircle className="w-3 h-3" />
              ) : (
                <Banknote className="w-3 h-3" />
              )}
              {isPaid ? t("orderPaidOnline") : t("orderPaymentAtDoor")}
            </span>
          </div>
        </div>

        {/* ── Order Information ──────────────────────────────────── */}
        <SectionCard icon={Info} title={t("receiptOrderInfo")}>
          <InfoRow
            label={t("receiptOrderNumber")}
            value={
              <span className="flex items-center gap-1.5">
                #{shortOrderId(receipt.orderId)}
                <button
                  onClick={copyOrderId}
                  className={`p-0.5 rounded ${
                    isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                  }`}
                >
                  {copySuccess ? (
                    <CheckCircle className="w-3 h-3 text-green-500" />
                  ) : (
                    <Copy
                      className={`w-3 h-3 ${isDarkMode ? "text-gray-400" : "text-gray-400"}`}
                    />
                  )}
                </button>
              </span>
            }
          />
          <InfoRow
            label={t("receiptPaymentMethod")}
            value={
              <span className="flex items-center gap-1">
                {isCard ? (
                  <CreditCard className="w-3 h-3" />
                ) : (
                  <Banknote className="w-3 h-3" />
                )}
                {isCard ? t("orderPaymentCard") : t("orderPaymentAtDoor")}
              </span>
            }
          />
          <InfoRow
            label={t("receiptDelivery")}
            value={t("receiptDelivery")}
            valueClass={isDarkMode ? "text-green-400" : "text-green-600"}
          />
          {meta.status && (
            <InfoRow
              label={t("receiptStatus")}
              value={
                t.has(localizeStatusKey(meta.status))
                  ? t(localizeStatusKey(meta.status))
                  : meta.status
              }
            />
          )}
        </SectionCard>

        {/* ── Delivery Address ───────────────────────────────────── */}
        {receipt.deliveryAddress && (
          <SectionCard icon={MapPin} title={t("receiptDeliveryAddress")}>
            <p
              className={`text-xs font-medium ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}
            >
              {receipt.deliveryAddress.addressLine1}
            </p>
            {receipt.deliveryAddress.addressLine2 && (
              <p
                className={`text-xs mt-0.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
              >
                {receipt.deliveryAddress.addressLine2}
              </p>
            )}
            <p
              className={`text-[11px] mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              {receipt.deliveryAddress.city}
              {receipt.deliveryAddress.phoneNumber &&
                ` · ${receipt.deliveryAddress.phoneNumber}`}
            </p>
            {receipt.deliveryAddress.phoneNumber && (
              <a
                href={`tel:${receipt.deliveryAddress.phoneNumber.replace(/\s/g, "")}`}
                className={`mt-2 inline-flex items-center gap-1 text-[11px] font-semibold ${isDarkMode ? "text-orange-400" : "text-orange-600"}`}
              >
                <Phone className="w-3 h-3" />
                {receipt.deliveryAddress.phoneNumber}
              </a>
            )}
          </SectionCard>
        )}

        {/* ── Ordered Items ──────────────────────────────────────── */}
        {items.length > 0 && (
          <SectionCard icon={ShoppingBag} title={t("receiptOrderedItems")}>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div
                  key={`${item.itemId}-${idx}`}
                  className={`rounded-xl p-3 ${
                    isDarkMode ? "bg-gray-700/50" : "bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] font-bold px-1.5 py-0.5 rounded-lg ${
                            isDarkMode
                              ? "bg-orange-900/30 text-orange-400"
                              : "bg-orange-50 text-orange-600"
                          }`}
                        >
                          {item.quantity}×
                        </span>
                        <h4
                          className={`text-xs font-semibold truncate ${
                            isDarkMode ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {item.name}
                        </h4>
                      </div>
                      {item.brand && (
                        <p
                          className={`text-[10px] mt-1 ml-7 font-semibold ${isDarkMode ? "text-orange-400" : "text-orange-600"}`}
                        >
                          {item.brand}
                        </p>
                      )}
                      {item.type && (
                        <p
                          className={`text-[11px] mt-0.5 ml-7 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                        >
                          {item.type}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span
                        className={`text-xs font-bold ${
                          isDarkMode ? "text-orange-400" : "text-orange-600"
                        }`}
                      >
                        {Math.round(lineTotal(item))} {receipt.currency}
                      </span>
                      {item.quantity > 1 && (
                        <p
                          className={`text-[10px] mt-0.5 ${
                            isDarkMode ? "text-gray-500" : "text-gray-400"
                          }`}
                        >
                          {t("receiptPerUnit", {
                            price: `${Math.round(item.price)} ${receipt.currency}`,
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {meta.orderNotes && (
              <div
                className={`mt-3 p-3 rounded-xl border ${
                  isDarkMode
                    ? "border-gray-700 bg-gray-700/30"
                    : "border-gray-100 bg-gray-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <StickyNote
                    className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${
                      isDarkMode ? "text-gray-400" : "text-gray-400"
                    }`}
                  />
                  <div>
                    <p
                      className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      {t("receiptOrderNoteHeader")}
                    </p>
                    <p
                      className={`text-xs whitespace-pre-line ${
                        isDarkMode ? "text-gray-300" : "text-gray-700"
                      }`}
                    >
                      {meta.orderNotes}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>
        )}

        {/* ── Price Summary ──────────────────────────────────────── */}
        <SectionCard icon={DollarSign} title={t("receiptPriceSummary")}>
          <div className="space-y-0">
            <InfoRow
              label={t("orderSubtotalLabel")}
              value={`${Math.round(receipt.subtotal)} ${receipt.currency}`}
            />
            <InfoRow
              label={t("orderDeliveryLabel")}
              value={
                deliveryIsFree
                  ? t("orderDeliveryFree")
                  : `${Math.round(receipt.deliveryFee)} ${receipt.currency}`
              }
              valueClass={
                deliveryIsFree
                  ? "text-green-500"
                  : isDarkMode
                    ? "text-white"
                    : "text-gray-900"
              }
            />
          </div>

          <div
            className={`mt-3 px-3 py-3 rounded-xl ${
              isDarkMode
                ? "bg-orange-900/10 border border-orange-700/30"
                : "bg-orange-50 border border-orange-100"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-sm font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("orderTotalLabel")}
              </span>
              <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                {Math.round(receipt.totalPrice)} {receipt.currency}
              </span>
            </div>
          </div>

          <p
            className={`text-[10px] mt-2 text-center ${
              isPaid
                ? isDarkMode
                  ? "text-green-400"
                  : "text-green-600"
                : isDarkMode
                  ? "text-amber-400"
                  : "text-amber-600"
            }`}
          >
            {isPaid
              ? `✓ ${t("receiptOnlinePaymentReceived")}`
              : `⚠ ${t("receiptPayDuringDelivery")}`}
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
