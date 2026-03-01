"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/context/UserProvider";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
  UtensilsCrossed,
  Clock,
  Phone,
  CreditCard,
  Banknote,
  StickyNote,
} from "lucide-react";
import { useTranslations } from "next-intl";

// ============================================================================
// INTERFACES
// ============================================================================

interface FoodReceipt {
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
  restaurantName: string;
  restaurantId: string;
  buyerName: string;
  deliveryAddress: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    phoneNumber: string;
  } | null;
  filePath?: string;
  downloadUrl?: string;
}

interface FoodOrderItem {
  foodId: string;
  name: string;
  price: number;
  quantity: number;
  extras: { name: string; price: number; quantity: number }[];
  specialNotes?: string;
  itemTotal: number;
}

interface FoodOrderDetails {
  estimatedPrepTime?: number;
  orderNotes?: string;
  restaurantPhone?: string;
  buyerPhone?: string;
  status?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function FoodReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [receipt, setReceipt] = useState<FoodReceipt | null>(null);
  const [orderItems, setOrderItems] = useState<FoodOrderItem[]>([]);
  const [orderDetails, setOrderDetails] = useState<FoodOrderDetails>({});
  const [isLoading, setIsLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  const { user, isLoading: authLoading } = useUser();
  const router = useRouter();
  const t = useTranslations();
  const l = (key: string) => t(key) || key.split(".").pop() || key;

  // ── Theme detection ──────────────────────────────────────────────
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined")
        setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined")
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    return () => observer.disconnect();
  }, []);

  // ── Data fetching ────────────────────────────────────────────────
  useEffect(() => {
    const fetchReceiptDetails = async () => {
      if (!user || !id) {
        setIsLoading(false);
        return;
      }
      try {
        // 1. Load food receipt doc from user's subcollection
        const receiptDoc = await getDoc(
          doc(db, "users", user.uid, "foodReceipts", id),
        );
        if (!receiptDoc.exists()) {
          setIsLoading(false);
          return;
        }
        const rd = receiptDoc.data();
        const receiptObj: FoodReceipt = {
          id: receiptDoc.id,
          orderId: rd.orderId || "",
          receiptId: rd.receiptId || "",
          totalPrice: rd.totalPrice || 0,
          subtotal: rd.subtotal || rd.totalPrice || 0,
          deliveryFee: rd.deliveryFee || 0,
          currency: rd.currency || "TL",
          timestamp:
            rd.timestamp instanceof Timestamp
              ? rd.timestamp.toDate()
              : new Date(rd.timestamp),
          paymentMethod: rd.paymentMethod || "",
          isPaid: rd.isPaid || false,
          deliveryType: rd.deliveryType || "delivery",
          restaurantName: rd.restaurantName || "",
          restaurantId: rd.restaurantId || "",
          buyerName: rd.buyerName || "",
          deliveryAddress: rd.deliveryAddress || null,
          filePath: rd.filePath,
          downloadUrl: rd.downloadUrl,
        };
        setReceipt(receiptObj);

        // 2. Load order document for items + extra details
        if (receiptObj.orderId) {
          const orderDoc = await getDoc(
            doc(db, "orders-food", receiptObj.orderId),
          );
          if (orderDoc.exists()) {
            const od = orderDoc.data();
            setOrderItems(Array.isArray(od.items) ? od.items : []);
            setOrderDetails({
              estimatedPrepTime: od.estimatedPrepTime || 0,
              orderNotes: od.orderNotes || "",
              restaurantPhone: od.restaurantPhone || "",
              buyerPhone: od.buyerPhone || "",
              status: od.status || "",
            });
          }
        }
      } catch (error) {
        console.error("Error fetching food receipt details:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchReceiptDetails();
  }, [user, id]);

  // ── Helpers ──────────────────────────────────────────────────────
  const formatDate = (ts: Date) =>
    `${ts.getDate().toString().padStart(2, "0")}/${(ts.getMonth() + 1)
      .toString()
      .padStart(2, "0")}/${ts.getFullYear()} ${ts
      .getHours()
      .toString()
      .padStart(2, "0")}:${ts.getMinutes().toString().padStart(2, "0")}`;

  const copyOrderId = () => {
    if (receipt) {
      navigator.clipboard.writeText(receipt.orderId);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const downloadReceipt = async () => {
    try {
      let url = receipt?.downloadUrl;
      if (!url && receipt?.filePath) {
        // Fallback for receipts generated before the fix
        const { getStorage, ref, getDownloadURL } =
          await import("firebase/storage");
        const storage = getStorage();
        url = await getDownloadURL(ref(storage, receipt.filePath));
      }
      if (url) {
        window.open(url, "_blank");
      } else {
        alert(
          l("FoodReceiptDetail.receiptPdfNotAvailable") ||
            "PDF not available yet.",
        );
      }
    } catch {
      alert(
        l("FoodReceiptDetail.receiptPdfNotAvailable") ||
          "PDF not available yet.",
      );
    }
  };

  const shareReceipt = () => {
    if (!receipt) return;
    const text = `${l("FoodReceiptDetail.foodReceipt") || "Food Receipt"} — ${receipt.restaurantName}\n${l("FoodReceiptDetail.order") || "Order"} #${receipt.orderId.substring(0, 8).toUpperCase()}\n${l("FoodReceiptDetail.total") || "Total"}: ${receipt.totalPrice.toFixed(0)} ${receipt.currency}\n${formatDate(receipt.timestamp)}`;
    if (navigator.share)
      navigator.share({
        title: l("FoodReceiptDetail.foodReceipt") || "Food Receipt",
        text,
      });
    else navigator.clipboard.writeText(text);
  };

  const localizePaymentMethod = (method: string): string => {
    switch (method) {
      case "pay_at_door":
        return l("FoodReceiptDetail.payAtDoor") || "Pay at Door";
      case "card":
        return l("FoodReceiptDetail.card") || "Credit / Debit Card";
      default:
        return method;
    }
  };

  const localizeDeliveryType = (type: string): string =>
    type === "pickup"
      ? l("FoodReceiptDetail.pickup") || "Pickup"
      : l("FoodReceiptDetail.delivery") || "Delivery";

  const localizeStatus = (status: string): string => {
    const map: Record<string, string> = {
      pending: l("FoodReceiptDetail.statusPending") || "Pending",
      confirmed: l("FoodReceiptDetail.statusConfirmed") || "Confirmed",
      preparing: l("FoodReceiptDetail.statusPreparing") || "Preparing",
      ready: l("FoodReceiptDetail.statusReady") || "Ready",
      delivered: l("FoodReceiptDetail.statusDelivered") || "Delivered",
      completed: l("FoodReceiptDetail.statusCompleted") || "Completed",
    };
    return map[status] || status;
  };

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
          {l("FoodReceiptDetail.receiptDetails") || "Receipt Details"}
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
            {l("FoodReceiptDetail.loginRequired") || "Login Required"}
          </h3>
          <p
            className={`text-xs max-w-xs mx-auto mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {l("FoodReceiptDetail.loginToViewReceipt") ||
              "Please login to view receipt details."}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
          >
            <LogIn className="w-3.5 h-3.5" />
            {l("FoodReceiptDetail.login") || "Login"}
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
            {l("FoodReceiptDetail.receiptNotFound") || "Receipt Not Found"}
          </h3>
          <p
            className={`text-xs max-w-xs mx-auto mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {l("FoodReceiptDetail.receiptNotFoundMessage") ||
              "Could not be found."}
          </p>
          <button
            onClick={() => router.back()}
            className="inline-flex items-center px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
          >
            {l("FoodReceiptDetail.goBack") || "Go Back"}
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  const isPickup = receipt.deliveryType === "pickup";
  const isPaid = receipt.isPaid;

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
    >
      {/* Toolbar */}
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
            {(receipt.downloadUrl || receipt.filePath) && (
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
            <UtensilsCrossed className="w-5 h-5 text-orange-500" />
          </div>
          <h2
            className={`text-sm font-bold mb-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {receipt.restaurantName}
          </h2>
          <p
            className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {formatDate(receipt.timestamp)}
          </p>
          {/* Payment status badge */}
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
              {isPaid
                ? l("FoodReceiptDetail.paidOnline") || "Paid Online"
                : l("FoodReceiptDetail.payAtDoor") || "Pay at Door"}
            </span>
          </div>
        </div>

        {/* ── Order Information ──────────────────────────────────── */}
        <SectionCard
          icon={Info}
          title={l("FoodReceiptDetail.orderInformation") || "Order Information"}
        >
          <InfoRow
            label={l("FoodReceiptDetail.orderNumber") || "Order Number"}
            value={
              <span className="flex items-center gap-1.5">
                #{receipt.orderId.substring(0, 8).toUpperCase()}
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
            label={l("FoodReceiptDetail.paymentMethod") || "Payment"}
            value={
              <span className="flex items-center gap-1">
                {receipt.paymentMethod === "card" ? (
                  <CreditCard className="w-3 h-3" />
                ) : (
                  <Banknote className="w-3 h-3" />
                )}
                {localizePaymentMethod(receipt.paymentMethod)}
              </span>
            }
          />
          <InfoRow
            label={l("FoodReceiptDetail.deliveryType") || "Delivery Type"}
            value={localizeDeliveryType(receipt.deliveryType)}
            valueClass={
              isPickup
                ? isDarkMode
                  ? "text-blue-400"
                  : "text-blue-600"
                : isDarkMode
                  ? "text-green-400"
                  : "text-green-600"
            }
          />
          {orderDetails.status && (
            <InfoRow
              label={l("FoodReceiptDetail.orderStatus") || "Order Status"}
              value={localizeStatus(orderDetails.status)}
            />
          )}
          {!!orderDetails.estimatedPrepTime &&
            orderDetails.estimatedPrepTime > 0 && (
              <InfoRow
                label={l("FoodReceiptDetail.prepTime") || "Est. Prep Time"}
                value={
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {orderDetails.estimatedPrepTime}{" "}
                    {l("FoodReceiptDetail.minutes") || "min"}
                  </span>
                }
              />
            )}
          {orderDetails.restaurantPhone && (
            <InfoRow
              label={
                l("FoodReceiptDetail.restaurantPhone") || "Restaurant Phone"
              }
              value={
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {orderDetails.restaurantPhone}
                </span>
              }
            />
          )}
        </SectionCard>

        {/* ── Delivery Address ───────────────────────────────────── */}
        {!isPickup && receipt.deliveryAddress && (
          <SectionCard
            icon={MapPin}
            title={l("FoodReceiptDetail.deliveryAddress") || "Delivery Address"}
          >
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
          </SectionCard>
        )}

        {/* ── Ordered Items ──────────────────────────────────────── */}
        {orderItems.length > 0 && (
          <SectionCard
            icon={ShoppingBag}
            title={l("FoodReceiptDetail.orderedItems") || "Ordered Items"}
          >
            <div className="space-y-3">
              {orderItems.map((item, idx) => {
                const extrasTotal = item.extras.reduce(
                  (s, e) => s + e.price * e.quantity,
                  0,
                );
                const effectiveUnit = item.price + extrasTotal;

                return (
                  <div
                    key={item.foodId || idx}
                    className={`rounded-xl p-3 ${
                      isDarkMode ? "bg-gray-700/50" : "bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* Name + qty badge */}
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

                        {/* Extras */}
                        {item.extras.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5 ml-7">
                            {item.extras.map((ext) => (
                              <span
                                key={ext.name}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                  isDarkMode
                                    ? "bg-gray-600 text-gray-300"
                                    : "bg-gray-200 text-gray-600"
                                }`}
                              >
                                {ext.name}
                                {ext.quantity > 1 ? ` ×${ext.quantity}` : ""}
                                {ext.price > 0 ? ` +${ext.price}` : ""}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Special notes */}
                        {item.specialNotes && (
                          <div
                            className={`flex items-start gap-1 mt-1.5 ml-7 text-[11px] ${
                              isDarkMode ? "text-gray-500" : "text-gray-400"
                            }`}
                          >
                            <StickyNote className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span>{item.specialNotes}</span>
                          </div>
                        )}
                      </div>

                      {/* Price */}
                      <div className="text-right flex-shrink-0">
                        <span
                          className={`text-xs font-bold ${
                            isDarkMode ? "text-orange-400" : "text-orange-600"
                          }`}
                        >
                          {(
                            item.itemTotal || effectiveUnit * item.quantity
                          ).toFixed(0)}{" "}
                          {receipt.currency}
                        </span>
                        {item.quantity > 1 && (
                          <p
                            className={`text-[10px] mt-0.5 ${
                              isDarkMode ? "text-gray-500" : "text-gray-400"
                            }`}
                          >
                            {effectiveUnit.toFixed(0)}{" "}
                            {l("FoodReceiptDetail.each") || "each"}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Order notes */}
            {orderDetails.orderNotes && (
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
                      {l("FoodReceiptDetail.orderNotes") || "Order Notes"}
                    </p>
                    <p
                      className={`text-xs ${
                        isDarkMode ? "text-gray-300" : "text-gray-700"
                      }`}
                    >
                      {orderDetails.orderNotes}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>
        )}

        {/* ── Price Summary ──────────────────────────────────────── */}
        <SectionCard
          icon={DollarSign}
          title={l("FoodReceiptDetail.priceSummary") || "Price Summary"}
        >
          <div className="space-y-0">
            <InfoRow
              label={l("FoodReceiptDetail.subtotal") || "Subtotal"}
              value={`${receipt.subtotal.toFixed(0)} ${receipt.currency}`}
            />

            {receipt.deliveryType === "delivery" && (
              <InfoRow
                label={l("FoodReceiptDetail.deliveryFee") || "Delivery Fee"}
                value={
                  receipt.deliveryFee === 0
                    ? l("FoodReceiptDetail.free") || "Free"
                    : `${receipt.deliveryFee.toFixed(0)} ${receipt.currency}`
                }
                valueClass={
                  receipt.deliveryFee === 0
                    ? "text-green-500"
                    : isDarkMode
                      ? "text-white"
                      : "text-gray-900"
                }
              />
            )}
          </div>

          {/* Grand total */}
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
                {l("FoodReceiptDetail.total") || "Total"}
              </span>
              <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                {receipt.totalPrice.toFixed(0)} {receipt.currency}
              </span>
            </div>
          </div>

          {/* Payment note */}
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
              ? l("FoodReceiptDetail.paidOnlineNote") ||
                "✓ Payment received online"
              : l("FoodReceiptDetail.payAtDoorNote") ||
                "⚠ Payment due at delivery"}
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
