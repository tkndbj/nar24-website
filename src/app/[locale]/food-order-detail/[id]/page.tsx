"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  RefreshCw,
  MapPin,
  Phone,
  CheckCircle,
  Clock,
  XCircle,
  UtensilsCrossed,
  ShoppingBag,
  CreditCard,
  Banknote,
  StickyNote,
  ChefHat,
  Receipt,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter, useParams } from "next/navigation";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslations } from "next-intl";

// ============================================================================
// TYPES
// ============================================================================

type FoodOrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "completed"
  | "cancelled";

interface FoodOrderExtra {
  name: string;
  price: number;
  quantity: number;
}

interface FoodOrderItem {
  foodId: string;
  name: string;
  price: number;
  quantity: number;
  extras: FoodOrderExtra[];
  specialNotes?: string;
  itemTotal?: number;
}

interface DeliveryAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  phoneNumber?: string;
}

interface FoodOrder {
  id: string;
  restaurantId: string;
  restaurantName: string;
  items: FoodOrderItem[];
  subtotal: number;
  deliveryFee: number;
  totalPrice: number;
  currency: string;
  paymentMethod: string;
  isPaid: boolean;
  deliveryType: string;
  status: FoodOrderStatus;
  deliveryAddress: DeliveryAddress | null;
  estimatedPrepTime?: number;
  orderNotes?: string;
  restaurantPhone?: string;
  buyerPhone?: string;
  createdAt: Timestamp;
}

// ============================================================================
// STATUS CONFIG
// ============================================================================

const STATUS_CONFIG: Record<
  FoodOrderStatus,
  {
    color: string;
    bg: string;
    darkBg: string;
    icon: React.ElementType;
    labelKey: string;
  }
> = {
  pending: {
    color: "#F59E0B",
    bg: "#FEF3C7",
    darkBg: "#78350F",
    icon: Clock,
    labelKey: "statusPending",
  },
  confirmed: {
    color: "#3B82F6",
    bg: "#DBEAFE",
    darkBg: "#1E3A8A",
    icon: CheckCircle,
    labelKey: "statusConfirmed",
  },
  preparing: {
    color: "#F97316",
    bg: "#FFEDD5",
    darkBg: "#7C2D12",
    icon: ChefHat,
    labelKey: "statusPreparing",
  },
  ready: {
    color: "#6366F1",
    bg: "#E0E7FF",
    darkBg: "#312E81",
    icon: ShoppingBag,
    labelKey: "statusReady",
  },
  delivered: {
    color: "#10B981",
    bg: "#D1FAE5",
    darkBg: "#064E3B",
    icon: CheckCircle,
    labelKey: "statusDelivered",
  },
  completed: {
    color: "#10B981",
    bg: "#D1FAE5",
    darkBg: "#064E3B",
    icon: CheckCircle,
    labelKey: "statusCompleted",
  },
  cancelled: {
    color: "#EF4444",
    bg: "#FEE2E2",
    darkBg: "#7F1D1D",
    icon: XCircle,
    labelKey: "statusCancelled",
  },
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function FoodOrderDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useUser();
  const t = useTranslations("FoodOrderDetail");

  const [order, setOrder] = useState<FoodOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // ── Theme ──────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () =>
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true });
    return () => obs.disconnect();
  }, []);

  // ── Auth guard ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  // ── Load data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (user && id) loadOrder();
  }, [user, id]);

  const loadOrder = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    setError(null);
    try {
      const snap = await getDoc(doc(db, "orders-food", id));
      if (!snap.exists()) throw new Error("Order not found");
      const d = snap.data();
      setOrder({
        id: snap.id,
        restaurantId: d.restaurantId || "",
        restaurantName: d.restaurantName || "",
        items: Array.isArray(d.items) ? d.items : [],
        subtotal: d.subtotal || d.totalPrice || 0,
        deliveryFee: d.deliveryFee || 0,
        totalPrice: d.totalPrice || 0,
        currency: d.currency || "TL",
        paymentMethod: d.paymentMethod || "",
        isPaid: d.isPaid || false,
        deliveryType: d.deliveryType || "delivery",
        status: (d.status || "pending") as FoodOrderStatus,
        deliveryAddress: d.deliveryAddress || null,
        estimatedPrepTime: d.estimatedPrepTime,
        orderNotes: d.orderNotes,
        restaurantPhone: d.restaurantPhone,
        buyerPhone: d.buyerPhone,
        createdAt: d.createdAt,
      });
    } catch (err) {
      console.error("Error loading food order:", err);
      setError(err instanceof Error ? err.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  // ── Helpers ────────────────────────────────────────────────────────
  const formatCurrency = (amount: number, currency?: string) =>
    new Intl.NumberFormat("tr-TR").format(amount) +
    " " +
    (currency === "TRY" ? "₺" : currency || "TL");

  const formatDate = (ts: Timestamp) =>
    new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(ts.toDate());

  const getItemTotal = (item: FoodOrderItem): number => {
    if (item.itemTotal) return item.itemTotal;
    const extrasTotal = item.extras.reduce(
      (s, e) => s + e.price * e.quantity,
      0,
    );
    return (item.price + extrasTotal) * item.quantity;
  };

  const getEffectiveUnitPrice = (item: FoodOrderItem): number => {
    const extrasTotal = item.extras.reduce(
      (s, e) => s + e.price * e.quantity,
      0,
    );
    return item.price + extrasTotal;
  };

  // ── Sub-components ─────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: FoodOrderStatus }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const Icon = cfg.icon;
    return (
      <div
        className="flex items-center space-x-1 px-2 py-1 rounded-full text-[10px] font-semibold"
        style={{
          backgroundColor: isDarkMode ? cfg.darkBg : cfg.bg,
          color: cfg.color,
        }}
      >
        <Icon size={10} />
        <span>{t(cfg.labelKey) || cfg.labelKey}</span>
      </div>
    );
  };

  const SummaryRow = ({
    label,
    value,
    valueColor,
    isTotal = false,
  }: {
    label: string;
    value: string;
    valueColor?: string;
    isTotal?: boolean;
  }) => (
    <div className="flex justify-between items-center">
      <span
        className={
          isTotal
            ? `text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`
            : `text-xs font-medium ${isDarkMode ? "text-gray-400" : "text-gray-600"}`
        }
      >
        {label}
      </span>
      <span
        className={
          isTotal
            ? "text-sm font-bold text-orange-600"
            : `text-xs font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`
        }
        style={valueColor ? { color: valueColor } : {}}
      >
        {value}
      </span>
    </div>
  );

  const LoadingSkeleton = () => (
    <div className="space-y-4 p-4">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className={`animate-pulse rounded-lg border p-4 h-32 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }`}
        />
      ))}
    </div>
  );

  const card = `rounded-lg border p-4 ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`;
  const innerBg = isDarkMode ? "bg-gray-700" : "bg-gray-50";
  const labelText = `text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`;
  const valueText = `text-xs font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`;
  const headingText = `font-semibold text-sm ${isDarkMode ? "text-white" : "text-gray-900"}`;

  if (authLoading) {
    return (
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      >
        <LoadingSkeleton />
      </div>
    );
  }

  if (!user || !id) return null;

  const isPickup = order?.deliveryType === "pickup";

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div
        className={`sticky top-0 z-10 border-b ${
          isDarkMode
            ? "bg-gray-900 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-red-500" />
          <div className="relative px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="p-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-colors"
              >
                <ArrowLeft size={18} className="text-white" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-white">
                  {t("orderDetails") || "Food Order Details"}
                </h1>
                <p className="text-orange-100 text-sm mt-1">
                  {order?.restaurantName || ""}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-white/10 backdrop-blur-sm">
                <UtensilsCrossed size={20} className="text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${
                isDarkMode ? "bg-red-900/20" : "bg-red-100"
              }`}
            >
              <XCircle size={32} className="text-red-500" />
            </div>
            <h3
              className={`text-lg font-medium mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {t("failedToLoad") || "Failed to load order"}
            </h3>
            <p
              className={`text-center mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
            >
              {error}
            </p>
            <button
              onClick={loadOrder}
              className="flex items-center space-x-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              <RefreshCw size={16} />
              <span>{t("retry") || "Retry"}</span>
            </button>
          </div>
        ) : loading ? (
          <LoadingSkeleton />
        ) : !order ? null : (
          <div className="space-y-4">
            {/* ── Order Header Card ────────────────────────────────── */}
            <div className={card}>
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center border border-orange-200">
                  <Receipt size={20} className="text-orange-600" />
                </div>
                <div className="flex-1">
                  <h4 className={headingText}>
                    {t("orderNumber") || "Order Number"}
                  </h4>
                  <p className={labelText}>#{id.slice(0, 8).toUpperCase()}</p>
                </div>
                <StatusBadge status={order.status} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className={`p-2 rounded-lg ${innerBg}`}>
                  <div className={labelText}>
                    {t("orderDate") || "Order Date"}
                  </div>
                  <div className={valueText}>
                    {order.createdAt ? formatDate(order.createdAt) : "—"}
                  </div>
                </div>
                <div className={`p-2 rounded-lg ${innerBg}`}>
                  <div className={labelText}>
                    {t("deliveryType") || "Delivery Type"}
                  </div>
                  <div className="flex items-center gap-1">
                    {isPickup ? (
                      <ShoppingBag size={12} className="text-blue-500" />
                    ) : (
                      <MapPin size={12} className="text-green-500" />
                    )}
                    <span
                      className={`text-xs font-semibold ${
                        isPickup ? "text-blue-500" : "text-green-500"
                      }`}
                    >
                      {isPickup
                        ? t("pickup") || "Pickup"
                        : t("delivery") || "Delivery"}
                    </span>
                  </div>
                </div>
                <div className={`p-2 rounded-lg ${innerBg}`}>
                  <div className={labelText}>
                    {t("paymentMethod") || "Payment"}
                  </div>
                  <div className="flex items-center gap-1">
                    {order.paymentMethod === "card" ? (
                      <CreditCard size={12} className="text-indigo-500" />
                    ) : (
                      <Banknote size={12} className="text-amber-500" />
                    )}
                    <span className={valueText}>
                      {order.paymentMethod === "card"
                        ? t("card") || "Card"
                        : t("payAtDoor") || "Pay at Door"}
                    </span>
                  </div>
                </div>
                <div className={`p-2 rounded-lg ${innerBg}`}>
                  <div className={labelText}>
                    {t("paymentStatus") || "Payment Status"}
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      order.isPaid ? "text-green-500" : "text-amber-500"
                    }`}
                  >
                    {order.isPaid
                      ? t("paid") || "Paid"
                      : t("pending") || "Pending"}
                  </span>
                </div>
              </div>

              {/* Prep time + restaurant phone */}
              {(!!order.estimatedPrepTime || order.restaurantPhone) && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {!!order.estimatedPrepTime && (
                    <div className={`p-2 rounded-lg ${innerBg}`}>
                      <div className={labelText}>
                        {t("prepTime") || "Est. Prep Time"}
                      </div>
                      <div className={valueText}>
                        {order.estimatedPrepTime} {t("minutes") || "min"}
                      </div>
                    </div>
                  )}
                  {order.restaurantPhone && (
                    <div className={`p-2 rounded-lg ${innerBg}`}>
                      <div className={labelText}>
                        {t("restaurantPhone") || "Restaurant Tel"}
                      </div>
                      <div className="flex items-center gap-1">
                        <Phone size={11} className="text-green-500" />
                        <span className={valueText}>
                          {order.restaurantPhone}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Order Items ──────────────────────────────────────── */}
            {order.items.map((item, idx) => {
              const effectiveUnit = getEffectiveUnitPrice(item);
              const itemTotal = getItemTotal(item);

              return (
                <div key={item.foodId || idx} className={card}>
                  {/* Item header */}
                  <div className="flex items-center space-x-3 mb-3">
                    <div
                      className={`w-12 h-12 rounded-lg flex items-center justify-center border ${
                        isDarkMode
                          ? "bg-gray-700 border-gray-600"
                          : "bg-orange-50 border-orange-100"
                      }`}
                    >
                      <UtensilsCrossed
                        size={20}
                        className={
                          isDarkMode ? "text-gray-400" : "text-orange-400"
                        }
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`font-semibold text-sm line-clamp-2 ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {item.name}
                      </h4>
                      <div className="px-2 py-0.5 bg-orange-100 rounded text-[10px] font-semibold text-orange-600 inline-block mt-1">
                        {order.restaurantName}
                      </div>
                    </div>
                  </div>

                  {/* Price grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                      <div className="text-xs font-bold text-orange-600">
                        {formatCurrency(effectiveUnit, order.currency)}
                      </div>
                      <div className={labelText}>
                        {t("qty") || "Qty"}: {item.quantity}
                      </div>
                    </div>
                    <div className={`p-2 rounded-lg ${innerBg}`}>
                      <div className={labelText}>{t("total") || "Total"}</div>
                      <div className={valueText}>
                        {formatCurrency(itemTotal, order.currency)}
                      </div>
                    </div>
                  </div>

                  {/* Extras */}
                  {item.extras.length > 0 && (
                    <div
                      className={`p-3 rounded-lg mt-3 ${
                        isDarkMode
                          ? "bg-white/5 border border-white/10"
                          : "bg-gray-50 border border-gray-100"
                      }`}
                    >
                      <div
                        className={`text-[11px] font-semibold mb-2 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                      >
                        {t("extras") || "Extras"}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {item.extras.map((ext) => (
                          <span
                            key={ext.name}
                            className="inline-flex items-center px-2 py-1 rounded text-[10px] font-semibold"
                            style={{
                              backgroundColor: isDarkMode
                                ? "#F9731620"
                                : "#FFEDD5",
                              color: "#F97316",
                              border: "1px solid #F9731630",
                            }}
                          >
                            {ext.name}
                            {ext.quantity > 1 && ` ×${ext.quantity}`}
                            {ext.price > 0 && (
                              <span className="ml-1 opacity-75">
                                +{formatCurrency(ext.price, order.currency)}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Special notes */}
                  {item.specialNotes && (
                    <div
                      className={`flex items-start gap-2 mt-3 p-3 rounded-lg ${
                        isDarkMode
                          ? "bg-white/5 border border-white/10"
                          : "bg-yellow-50 border border-yellow-100"
                      }`}
                    >
                      <StickyNote
                        size={13}
                        className={`mt-0.5 flex-shrink-0 ${isDarkMode ? "text-gray-400" : "text-yellow-500"}`}
                      />
                      <p
                        className={`text-xs ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                      >
                        {item.specialNotes}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Order Notes ──────────────────────────────────────── */}
            {order.orderNotes && (
              <div className={card}>
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-yellow-100 flex items-center justify-center border border-yellow-200">
                    <StickyNote size={20} className="text-yellow-600" />
                  </div>
                  <h4 className={headingText}>
                    {t("orderNotes") || "Order Notes"}
                  </h4>
                </div>
                <div className={`p-3 rounded-lg ${innerBg}`}>
                  <p
                    className={`text-sm ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                  >
                    {order.orderNotes}
                  </p>
                </div>
              </div>
            )}

            {/* ── Delivery Address ─────────────────────────────────── */}
            {!isPickup && order.deliveryAddress && (
              <div className={card}>
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center border border-green-200">
                    <MapPin size={20} className="text-green-600" />
                  </div>
                  <h4 className={headingText}>
                    {t("deliveryAddress") || "Delivery Address"}
                  </h4>
                </div>
                <div className={`p-3 rounded-lg ${innerBg}`}>
                  <div
                    className={`text-sm font-semibold mb-1 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {order.deliveryAddress.addressLine1}
                    {order.deliveryAddress.addressLine2 &&
                      `, ${order.deliveryAddress.addressLine2}`}
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {order.deliveryAddress.city}
                  </div>
                  {order.deliveryAddress.phoneNumber && (
                    <div className="flex items-center space-x-2 mt-2">
                      <div className="p-1 bg-green-100 rounded">
                        <Phone size={12} className="text-green-600" />
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {order.deliveryAddress.phoneNumber}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Order Summary ────────────────────────────────────── */}
            <div className={card}>
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center border border-orange-200">
                  <Receipt size={20} className="text-orange-600" />
                </div>
                <h4 className={headingText}>
                  {t("orderSummary") || "Order Summary"}
                </h4>
              </div>

              <div className={`p-3 rounded-lg space-y-3 ${innerBg}`}>
                <SummaryRow
                  label={t("subtotal") || "Subtotal"}
                  value={formatCurrency(order.subtotal, order.currency)}
                />

                {!isPickup && (
                  <SummaryRow
                    label={t("deliveryFee") || "Delivery Fee"}
                    value={
                      order.deliveryFee === 0
                        ? t("free") || "Free"
                        : formatCurrency(order.deliveryFee, order.currency)
                    }
                    valueColor={order.deliveryFee === 0 ? "#10B981" : undefined}
                  />
                )}

                <div
                  className={`h-px ${isDarkMode ? "bg-gray-600" : "bg-gray-200"}`}
                />

                <SummaryRow
                  label={t("total") || "Total"}
                  value={formatCurrency(order.totalPrice, order.currency)}
                  isTotal
                />

                {/* Payment note */}
                <div
                  className={`flex items-center gap-1.5 pt-1 text-[11px] font-medium ${
                    order.isPaid ? "text-green-500" : "text-amber-500"
                  }`}
                >
                  {order.isPaid ? (
                    <CheckCircle size={12} />
                  ) : (
                    <Banknote size={12} />
                  )}
                  {order.isPaid
                    ? t("paidOnlineNote") || "Payment received online"
                    : t("payAtDoorNote") || "Payment due at delivery"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
