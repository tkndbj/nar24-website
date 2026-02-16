"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/context/UserProvider";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  Timestamp,
} from "firebase/firestore";
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
  QrCode,
  RefreshCw,
  X,
  Mail,
  Send,
  FileText,
  Package,
  Info,
  ShoppingBag,
  DollarSign,
  Tag,
  Gift,
  Percent,
  Check,
} from "lucide-react";
import { useTranslations } from "next-intl";

// ============================================================================
// INTERFACES
// ============================================================================

interface Receipt {
  id: string;
  orderId: string;
  receiptId: string;
  totalPrice: number;
  currency: string;
  timestamp: Date;
  paymentMethod: string;
  deliveryOption: string;
  receiptUrl?: string;
  itemsSubtotal: number;
  deliveryPrice: number;
  originalDeliveryPrice: number;
  couponCode?: string;
  couponDiscount: number;
  freeShippingApplied: boolean;
}

interface OrderData {
  address?: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    phoneNumber: string;
  };
  qrGenerationStatus?: string;
  deliveryQR?: { url: string };
}

interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  price: number;
  currency: string;
  sellerId: string;
  sellerName: string;
  selectedAttributes?: Record<string, unknown>;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  const [deliveryQRUrl, setDeliveryQRUrl] = useState<string | null>(null);
  const [qrGenerationStatus, setQrGenerationStatus] = useState<string | null>(
    null,
  );
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isRetryingQR, setIsRetryingQR] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const { user, isLoading: authLoading } = useUser();
  const router = useRouter();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations();
  const l = (key: string) => t(key) || key.split(".").pop() || key;

  // Theme detection
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

  // Data fetching
  useEffect(() => {
    const fetchReceiptDetails = async () => {
      if (!user || !id) {
        setIsLoading(false);
        return;
      }
      try {
        const receiptDoc = await getDoc(
          doc(db, "users", user.uid, "receipts", id),
        );
        if (!receiptDoc.exists()) {
          setIsLoading(false);
          return;
        }
        const rd = receiptDoc.data();
        const receiptObj: Receipt = {
          id: receiptDoc.id,
          orderId: rd.orderId || "",
          receiptId: rd.receiptId || "",
          totalPrice: rd.totalPrice || 0,
          currency: rd.currency || "TL",
          timestamp:
            rd.timestamp instanceof Timestamp
              ? rd.timestamp.toDate()
              : new Date(rd.timestamp),
          paymentMethod: rd.paymentMethod || "",
          deliveryOption: rd.deliveryOption || "",
          receiptUrl: rd.receiptUrl,
          itemsSubtotal: rd.itemsSubtotal || rd.totalPrice || 0,
          deliveryPrice: rd.deliveryPrice || 0,
          originalDeliveryPrice:
            rd.originalDeliveryPrice || rd.deliveryPrice || 0,
          couponCode: rd.couponCode,
          couponDiscount: rd.couponDiscount || 0,
          freeShippingApplied: rd.freeShippingApplied || false,
        };
        setReceipt(receiptObj);
        const orderDoc = await getDoc(doc(db, "orders", receiptObj.orderId));
        if (orderDoc.exists()) {
          const data = orderDoc.data();
          setOrderData(data as OrderData);
          if (data.deliveryQR?.url) setDeliveryQRUrl(data.deliveryQR.url);
          setQrGenerationStatus(data.qrGenerationStatus || null);
        }
        const itemsSnapshot = await getDocs(
          collection(db, "orders", receiptObj.orderId, "items"),
        );
        setOrderItems(
          itemsSnapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              productName: data.productName || "Unknown Product",
              quantity: data.quantity || 1,
              price: data.price || 0,
              currency: data.currency || "TL",
              sellerId: data.sellerId || "",
              sellerName: data.sellerName || "Unknown Seller",
              selectedAttributes: data.selectedAttributes,
            };
          }),
        );
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const ud = userDoc.data();
          setEmailAddress(ud.email || user.email || "");
        }
      } catch (error) {
        console.error("Error fetching receipt details:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchReceiptDetails();
  }, [user, id]);

  // QR functions
  const retryQRGeneration = async () => {
    if (!receipt) return;
    setIsRetryingQR(true);
    try {
      const { getFunctions, httpsCallable } =
        await import("firebase/functions");
      const functions = getFunctions(undefined, "europe-west3");
      const retryQR = httpsCallable(functions, "retryQRGeneration");
      const result = await retryQR({ orderId: receipt.orderId });
      if ((result.data as { success: boolean }).success) {
        setTimeout(async () => {
          const orderDoc = await getDoc(doc(db, "orders", receipt.orderId));
          if (orderDoc.exists()) {
            const d = orderDoc.data();
            if (d.deliveryQR?.url) setDeliveryQRUrl(d.deliveryQR.url);
            setQrGenerationStatus(d.qrGenerationStatus || null);
          }
        }, 3000);
      }
    } catch (error) {
      console.error("Error retrying QR generation:", error);
    } finally {
      setIsRetryingQR(false);
    }
  };

  const shareQRCode = async () => {
    if (!deliveryQRUrl || !receipt) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: l("ReceiptDetail.deliveryQRCode"),
          text: `${l("ReceiptDetail.orderQRCode")} #${receipt.orderId.substring(0, 8).toUpperCase()}`,
          url: deliveryQRUrl,
        });
      } catch {
        /* cancelled */
      }
    } else window.open(deliveryQRUrl, "_blank");
  };

  // Email functions
  const sendReceiptByEmail = async () => {
    if (!receipt || !emailAddress.trim()) return;
    setIsSendingEmail(true);
    try {
      const { getFunctions, httpsCallable } =
        await import("firebase/functions");
      const functions = getFunctions(undefined, "europe-west3");
      const sendEmail = httpsCallable(functions, "sendReceiptEmail");
      const result = await sendEmail({
        receiptId: receipt.receiptId,
        orderId: receipt.orderId,
        email: emailAddress,
      });
      if ((result.data as { success: boolean }).success) {
        setIsEmailModalOpen(false);
        alert(l("ReceiptDetail.receiptSentSuccessfully") || "Receipt sent!");
      } else throw new Error("Failed");
    } catch (error) {
      console.error("Error sending receipt email:", error);
      alert(l("ReceiptDetail.failedToSendEmail") || "Failed to send email.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Utility
  const formatDate = (ts: Date) =>
    `${ts.getDate().toString().padStart(2, "0")}/${(ts.getMonth() + 1).toString().padStart(2, "0")}/${ts.getFullYear()} ${ts.getHours().toString().padStart(2, "0")}:${ts.getMinutes().toString().padStart(2, "0")}`;
  const getDeliveryColor = (opt: string) => {
    switch (opt) {
      case "express":
        return isDarkMode ? "text-orange-400" : "text-orange-600";
      case "gelal":
        return isDarkMode ? "text-blue-400" : "text-blue-600";
      default:
        return isDarkMode ? "text-green-400" : "text-green-600";
    }
  };
  const localizeDeliveryOption = (opt: string) => {
    switch (opt) {
      case "express":
        return l("ReceiptDetail.deliveryOption2") || "Express";
      case "gelal":
        return l("ReceiptDetail.deliveryOption1") || "Pick Up";
      default:
        return l("ReceiptDetail.deliveryOption3") || "Normal";
    }
  };

  const shareReceipt = () => {
    if (!receipt) return;
    const text = `${l("ReceiptDetail.receipt")} - ${l("ReceiptDetail.orders")} #${receipt.orderId.substring(0, 8).toUpperCase()}\n${l("ReceiptDetail.total")}: ${receipt.totalPrice.toFixed(0)} ${receipt.currency}\n${formatDate(receipt.timestamp)}`;
    if (navigator.share)
      navigator.share({ title: l("ReceiptDetail.receipt"), text });
    else {
      navigator.clipboard.writeText(text);
      alert(l("ReceiptDetail.copiedToClipboard") || "Copied");
    }
  };

  const downloadReceipt = () => {
    if (receipt?.receiptUrl) window.open(receipt.receiptUrl, "_blank");
    else alert(l("ReceiptDetail.receiptPdfNotAvailable") || "Not available");
  };
  const copyOrderId = () => {
    if (receipt) {
      navigator.clipboard.writeText(receipt.orderId);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const formatAttributes = (attrs?: Record<string, unknown>): string => {
    if (!attrs) return "";
    const systemFields = [
      "productId",
      "orderId",
      "buyerId",
      "sellerId",
      "timestamp",
      "addedAt",
      "updatedAt",
      "selectedColorImage",
      "productImage",
      "price",
      "finalPrice",
      "shopId",
      "sellerName",
      "buyerName",
      "productName",
      "currency",
      "quantity",
      "unitPrice",
      "clothingFit",
      "clothingType",
      "clothingTypes",
      "pantFabricTypes",
      "pantFabricType",
      "isBundleItem",
      "gender",
      "calculatedTotal",
      "calculatedUnitPrice",
      "ourComission",
      "sellerContactNo",
      "showSellerHeader",
    ];
    return Object.entries(attrs)
      .filter(([k, v]) => v != null && v !== "" && !systemFields.includes(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  };

  const groupItemsBySeller = (items: OrderItem[]) =>
    items.reduce(
      (g, item) => {
        const k = item.sellerId || "unknown";
        (g[k] = g[k] || []).push(item);
        return g;
      },
      {} as Record<string, OrderItem[]>,
    );

  // ========================================================================
  // Shared toolbar
  // ========================================================================
  const Toolbar = ({ actions }: { actions?: React.ReactNode }) => (
    <div
      className={`sticky top-14 z-30 border-b ${isDarkMode ? "bg-gray-900/80 backdrop-blur-xl border-gray-700/80" : "bg-white/80 backdrop-blur-xl border-gray-100/80"}`}
    >
      <div className="max-w-4xl mx-auto flex items-center gap-3 px-3 sm:px-6 py-3">
        <button
          onClick={() => router.back()}
          className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${isDarkMode ? "bg-gray-800 border-gray-700 hover:bg-gray-700" : "bg-gray-50 border-gray-200 hover:bg-gray-100"}`}
        >
          <ArrowLeft
            className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
          />
        </button>
        <h1
          className={`text-lg font-bold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
        >
          {l("ReceiptDetail.receiptDetails") || "Receipt Details"}
        </h1>
        <div className="flex-1" />
        {actions}
      </div>
    </div>
  );

  // ========================================================================
  // Early returns
  // ========================================================================

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
            {l("ReceiptDetail.loginRequired") || "Login Required"}
          </h3>
          <p
            className={`text-xs max-w-xs mx-auto mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {l("ReceiptDetail.loginToViewReceipt") ||
              "Please login to view receipt details."}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
          >
            <LogIn className="w-3.5 h-3.5" />
            {l("ReceiptDetail.login") || "Login"}
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
              className={`rounded-2xl border h-24 animate-pulse ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
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
            {l("ReceiptDetail.receiptNotFound") || "Receipt Not Found"}
          </h3>
          <p
            className={`text-xs max-w-xs mx-auto mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {l("ReceiptDetail.receiptNotFoundMessage") || "Could not be found."}
          </p>
          <button
            onClick={() => router.back()}
            className="inline-flex items-center px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
          >
            {l("ReceiptDetail.goBack") || "Go Back"}
          </button>
        </div>
      </div>
    );
  }

  // ========================================================================
  // Computed
  // ========================================================================
  const groupedItems = groupItemsBySeller(orderItems);
  const shippingSavings = receipt.freeShippingApplied
    ? receipt.originalDeliveryPrice
    : 0;
  const totalSavings = receipt.couponDiscount + shippingSavings;

  // ========================================================================
  // Section card helper
  // ========================================================================
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
      className={`rounded-2xl border p-4 ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${isDarkMode ? "bg-orange-900/30" : "bg-orange-50"}`}
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
    <div className="flex items-center justify-between py-2">
      <span
        className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
      >
        {label}
      </span>
      <span
        className={`text-xs font-semibold ${valueClass || (isDarkMode ? "text-white" : "text-gray-900")}`}
      >
        {value}
      </span>
    </div>
  );

  // ========================================================================
  // MAIN RENDER
  // ========================================================================

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
    >
      {/* Toolbar */}
      <Toolbar
        actions={
          <div className="flex items-center gap-1">
            {[
              {
                icon: QrCode,
                onClick: () => setIsQRModalOpen(true),
                title: "QR",
              },
              {
                icon: Mail,
                onClick: () => setIsEmailModalOpen(true),
                title: "Email",
              },
              { icon: Share2, onClick: shareReceipt, title: "Share" },
              ...(receipt.receiptUrl
                ? [
                    {
                      icon: Download,
                      onClick: downloadReceipt,
                      title: "Download",
                    },
                  ]
                : []),
            ].map(({ icon: Icon, onClick, title }) => (
              <button
                key={title}
                onClick={onClick}
                className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors ${isDarkMode ? "bg-gray-800 border-gray-700 hover:bg-gray-700" : "bg-gray-50 border-gray-200 hover:bg-gray-100"}`}
              >
                <Icon
                  className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
                />
              </button>
            ))}
          </div>
        }
      />

      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-3">
        {/* Receipt Header Card */}
        <div
          className={`rounded-2xl p-4 text-center ${isDarkMode ? "bg-orange-900/20 border border-orange-700/30" : "bg-orange-50 border border-orange-100"}`}
        >
          <div
            className={`w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center ${isDarkMode ? "bg-orange-900/30" : "bg-orange-100"}`}
          >
            <CheckCircle className="w-5 h-5 text-orange-500" />
          </div>
          <h2
            className={`text-sm font-bold mb-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {l("ReceiptDetail.receiptDetails") || "Receipt Details"}
          </h2>
          <p
            className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {formatDate(receipt.timestamp)}
          </p>
        </div>

        {/* Order Information */}
        <SectionCard
          icon={Info}
          title={l("ReceiptDetail.orderInformation") || "Order Information"}
        >
          <div
            className={`divide-y ${isDarkMode ? "divide-gray-700" : "divide-gray-50"}`}
          >
            <InfoRow
              label={l("ReceiptDetail.orderNumber") || "Order Number"}
              value={
                <span className="flex items-center gap-1.5">
                  #{receipt.orderId.substring(0, 8).toUpperCase()}
                  <button
                    onClick={copyOrderId}
                    className={`p-0.5 rounded ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
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
              label={l("ReceiptDetail.receiptNumber") || "Receipt Number"}
              value={`#${receipt.receiptId.substring(0, 8).toUpperCase()}`}
            />
            <InfoRow
              label={l("ReceiptDetail.paymentMethod") || "Payment"}
              value={receipt.paymentMethod}
            />
            <InfoRow
              label={l("ReceiptDetail.delivery") || "Delivery"}
              value={localizeDeliveryOption(receipt.deliveryOption)}
              valueClass={getDeliveryColor(receipt.deliveryOption)}
            />
          </div>
        </SectionCard>

        {/* Delivery Address */}
        {orderData?.address && (
          <SectionCard
            icon={MapPin}
            title={l("ReceiptDetail.deliveryAddress") || "Delivery Address"}
          >
            <p
              className={`text-xs ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
            >
              {orderData.address.addressLine1}
            </p>
            {orderData.address.addressLine2 && (
              <p
                className={`text-xs ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
              >
                {orderData.address.addressLine2}
              </p>
            )}
            <p
              className={`text-[11px] mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              {orderData.address.city} · {orderData.address.phoneNumber}
            </p>
          </SectionCard>
        )}

        {/* Purchased Items */}
        {orderItems.length > 0 && (
          <SectionCard
            icon={ShoppingBag}
            title={l("ReceiptDetail.purchasedItems") || "Purchased Items"}
          >
            <div className="space-y-4">
              {Object.entries(groupedItems).map(([sellerId, items]) => (
                <div key={sellerId}>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold mb-2 ${isDarkMode ? "bg-orange-900/20 text-orange-400" : "bg-orange-50 text-orange-600"}`}
                  >
                    <User className="w-3 h-3" />
                    {items[0]?.sellerName || "Unknown Seller"}
                  </span>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isDarkMode ? "bg-orange-900/20" : "bg-orange-50"}`}
                        >
                          <span className="text-[11px] font-bold text-orange-500">
                            {item.quantity}x
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4
                            className={`text-xs font-semibold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
                          >
                            {item.productName}
                          </h4>
                          {item.selectedAttributes &&
                            formatAttributes(item.selectedAttributes) && (
                              <p
                                className={`text-[11px] truncate ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                              >
                                {formatAttributes(item.selectedAttributes)}
                              </p>
                            )}
                        </div>
                        <span
                          className={`text-xs font-bold flex-shrink-0 ${isDarkMode ? "text-orange-400" : "text-orange-600"}`}
                        >
                          {item.price} {item.currency}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Price Summary */}
        <SectionCard
          icon={DollarSign}
          title={l("ReceiptDetail.priceSummary") || "Price Summary"}
        >
          <div className="space-y-2">
            <InfoRow
              label={l("ReceiptDetail.subtotal") || "Subtotal"}
              value={`${receipt.itemsSubtotal.toFixed(0)} ${receipt.currency}`}
            />

            {receipt.couponDiscount > 0 && (
              <div className="flex items-center justify-between py-2">
                <span className="flex items-center gap-1 text-xs text-green-500">
                  <Tag className="w-3 h-3" />
                  {receipt.couponCode
                    ? `${l("ReceiptDetail.coupon") || "Coupon"} (${receipt.couponCode})`
                    : l("ReceiptDetail.couponDiscount") || "Coupon"}
                </span>
                <span className="text-xs font-semibold text-green-500">
                  -{receipt.couponDiscount.toFixed(0)} {receipt.currency}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between py-2">
              <span
                className={`flex items-center gap-1 text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
              >
                {receipt.freeShippingApplied && (
                  <Gift className="w-3 h-3 text-green-500" />
                )}
                {l("ReceiptDetail.delivery") || "Delivery"}
              </span>
              <span className="flex items-center gap-1.5">
                {receipt.freeShippingApplied &&
                  receipt.originalDeliveryPrice > 0 && (
                    <span
                      className={`text-[11px] line-through ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                    >
                      {receipt.originalDeliveryPrice.toFixed(0)}{" "}
                      {receipt.currency}
                    </span>
                  )}
                <span
                  className={`text-xs font-semibold ${receipt.deliveryPrice === 0 ? "text-green-500" : isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {receipt.deliveryPrice === 0
                    ? l("ReceiptDetail.free") || "Free"
                    : `${receipt.deliveryPrice.toFixed(0)} ${receipt.currency}`}
                </span>
              </span>
            </div>

            {receipt.freeShippingApplied && (
              <div className="flex justify-end">
                <span
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isDarkMode ? "bg-green-900/30 text-green-400" : "bg-green-50 text-green-600"}`}
                >
                  <Check className="w-2.5 h-2.5" />
                  {l("ReceiptDetail.freeShippingBenefit") || "Free Shipping"}
                </span>
              </div>
            )}

            {totalSavings > 0 && (
              <div
                className={`px-3 py-2 rounded-xl ${isDarkMode ? "bg-green-900/10 border border-green-800/30" : "bg-green-50 border border-green-100"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
                    <Percent className="w-3 h-3" />
                    {l("ReceiptDetail.youSaved") || "You Saved"}
                  </span>
                  <span className="text-xs font-bold text-green-600">
                    {totalSavings.toFixed(0)} {receipt.currency}
                  </span>
                </div>
              </div>
            )}

            <div
              className={`border-t my-2 ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            />

            <div
              className={`px-3 py-3 rounded-xl ${isDarkMode ? "bg-orange-900/10 border border-orange-700/30" : "bg-orange-50 border border-orange-100"}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {l("ReceiptDetail.total") || "Total"}
                </span>
                <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                  {receipt.totalPrice.toFixed(0)} {receipt.currency}
                </span>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* QR Code Modal */}
      {isQRModalOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-sm rounded-2xl shadow-2xl ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <div
              className={`flex items-center justify-between p-4 border-b ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDarkMode ? "bg-orange-900/30" : "bg-orange-50"}`}
                >
                  <QrCode className="w-4 h-4 text-orange-500" />
                </div>
                <h3
                  className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {l("ReceiptDetail.deliveryQRCode") || "Delivery QR Code"}
                </h3>
              </div>
              <button
                onClick={() => setIsQRModalOpen(false)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
              >
                <X
                  className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                />
              </button>
            </div>

            <div className="p-4">
              <div className="flex justify-center mb-3">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${isDarkMode ? "bg-orange-900/20 text-orange-400" : "bg-orange-50 text-orange-600"}`}
                >
                  <Package className="w-3 h-3" />
                  {l("ReceiptDetail.orders") || "Order"} #
                  {receipt.orderId.substring(0, 8).toUpperCase()}
                </span>
              </div>

              {deliveryQRUrl ? (
                <>
                  <div className="flex justify-center mb-4">
                    <div className="p-3 bg-white rounded-xl shadow-md">
                      <img
                        src={deliveryQRUrl}
                        alt="QR"
                        className="w-48 h-48 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={shareQRCode}
                    className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    {l("ReceiptDetail.shareQRCode") || "Share QR Code"}
                  </button>
                </>
              ) : (
                <div
                  className={`p-6 rounded-xl text-center ${isDarkMode ? "bg-gray-700" : "bg-gray-50"}`}
                >
                  {qrGenerationStatus === "processing" ? (
                    <>
                      <div className="w-8 h-8 mx-auto mb-3 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
                      <p
                        className={`text-xs font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                      >
                        {l("ReceiptDetail.qrGenerating") || "Generating..."}
                      </p>
                    </>
                  ) : qrGenerationStatus === "failed" ? (
                    <>
                      <X className="w-8 h-8 mx-auto mb-3 text-red-500" />
                      <p
                        className={`text-xs font-semibold mb-3 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                      >
                        {l("ReceiptDetail.qrGenerationFailed") || "Failed"}
                      </p>
                      <button
                        onClick={retryQRGeneration}
                        disabled={isRetryingQR}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                      >
                        {isRetryingQR ? (
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        {isRetryingQR
                          ? l("ReceiptDetail.retrying") || "Retrying..."
                          : l("ReceiptDetail.retry") || "Retry"}
                      </button>
                    </>
                  ) : (
                    <>
                      <QrCode
                        className={`w-8 h-8 mx-auto mb-3 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                      />
                      <p
                        className={`text-xs font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                      >
                        {l("ReceiptDetail.qrNotReady") || "Not ready yet"}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>

            <div
              className={`p-4 border-t ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <button
                onClick={() => setIsQRModalOpen(false)}
                className={`w-full py-2.5 rounded-xl text-xs font-medium transition-colors ${isDarkMode ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                {l("ReceiptDetail.close") || "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-sm rounded-2xl shadow-2xl ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <div
              className={`flex items-center justify-between p-4 border-b ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDarkMode ? "bg-orange-900/30" : "bg-orange-50"}`}
                >
                  <Mail className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <h3
                    className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {l("ReceiptDetail.sendReceiptByEmail") || "Send by Email"}
                  </h3>
                  <p
                    className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                  >
                    {l("ReceiptDetail.receiptWillBeSentToEmail") ||
                      "Receipt will be sent to email below"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isSendingEmail && setIsEmailModalOpen(false)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
              >
                <X
                  className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label
                  className={`text-[11px] font-semibold uppercase tracking-wider mb-1 block ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                >
                  {l("ReceiptDetail.emailAddress") || "Email"}
                </label>
                <div
                  className={`flex items-center rounded-xl border ${isDarkMode ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-200"}`}
                >
                  <Mail
                    className={`w-4 h-4 ml-3 ${isDarkMode ? "text-gray-400" : "text-gray-400"}`}
                  />
                  <input
                    ref={emailInputRef}
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder={
                      l("ReceiptDetail.enterEmailAddress") || "Enter email"
                    }
                    className={`flex-1 px-3 py-2.5 bg-transparent outline-none text-sm ${isDarkMode ? "text-white placeholder-gray-500" : "text-gray-900 placeholder-gray-400"}`}
                  />
                </div>
              </div>

              <div
                className={`rounded-xl p-3 border ${isDarkMode ? "bg-orange-900/10 border-orange-700/30" : "bg-orange-50 border-orange-100"}`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDarkMode ? "bg-orange-900/30" : "bg-orange-100"}`}
                  >
                    <FileText className="w-3.5 h-3.5 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                    >
                      {l("ReceiptDetail.receipt") || "Receipt"} #
                      {receipt.receiptId.substring(0, 8).toUpperCase()}
                    </p>
                    <p
                      className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      {l("ReceiptDetail.orders") || "Order"} #
                      {receipt.orderId.substring(0, 8).toUpperCase()}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-orange-500">
                    {receipt.totalPrice.toFixed(0)} {receipt.currency}
                  </span>
                </div>
              </div>
            </div>

            <div
              className={`flex gap-2 p-4 border-t ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <button
                onClick={() => !isSendingEmail && setIsEmailModalOpen(false)}
                disabled={isSendingEmail}
                className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-50 ${isDarkMode ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                {l("ReceiptDetail.cancel") || "Cancel"}
              </button>
              <button
                onClick={sendReceiptByEmail}
                disabled={isSendingEmail || !emailAddress.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {isSendingEmail ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    {l("ReceiptDetail.sendEmail") || "Send"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
