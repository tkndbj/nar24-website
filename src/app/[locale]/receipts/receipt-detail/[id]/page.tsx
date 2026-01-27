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
  // Price breakdown fields
  itemsSubtotal: number;
  deliveryPrice: number;
  originalDeliveryPrice: number;
  // Coupon/benefit fields
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
  deliveryQR?: {
    url: string;
  };
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

  // QR Code state
  const [deliveryQRUrl, setDeliveryQRUrl] = useState<string | null>(null);
  const [qrGenerationStatus, setQrGenerationStatus] = useState<string | null>(
    null
  );
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isRetryingQR, setIsRetryingQR] = useState(false);

  // Email modal state
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const { user, isLoading: authLoading } = useUser();
  const router = useRouter();
  const emailInputRef = useRef<HTMLInputElement>(null);

  const t = useTranslations();

  // ========================================================================
  // THEME DETECTION
  // ========================================================================

  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => observer.disconnect();
  }, []);

  // ========================================================================
  // DATA FETCHING
  // ========================================================================

  useEffect(() => {
    const fetchReceiptDetails = async () => {
      if (!user || !id) {
        setIsLoading(false);
        return;
      }

      try {
        // Fetch receipt document
        const receiptDoc = await getDoc(
          doc(db, "users", user.uid, "receipts", id)
        );

        if (!receiptDoc.exists()) {
          setIsLoading(false);
          return;
        }

        const receiptData = receiptDoc.data();
        const receiptObj: Receipt = {
          id: receiptDoc.id,
          orderId: receiptData.orderId || "",
          receiptId: receiptData.receiptId || "",
          totalPrice: receiptData.totalPrice || 0,
          currency: receiptData.currency || "TL",
          timestamp:
            receiptData.timestamp instanceof Timestamp
              ? receiptData.timestamp.toDate()
              : new Date(receiptData.timestamp),
          paymentMethod: receiptData.paymentMethod || "",
          deliveryOption: receiptData.deliveryOption || "",
          receiptUrl: receiptData.receiptUrl,
          // Price breakdown
          itemsSubtotal: receiptData.itemsSubtotal || receiptData.totalPrice || 0,
          deliveryPrice: receiptData.deliveryPrice || 0,
          originalDeliveryPrice: receiptData.originalDeliveryPrice || receiptData.deliveryPrice || 0,
          // Coupon/benefit fields
          couponCode: receiptData.couponCode,
          couponDiscount: receiptData.couponDiscount || 0,
          freeShippingApplied: receiptData.freeShippingApplied || false,
        };

        setReceipt(receiptObj);

        // Fetch order details
        const orderDoc = await getDoc(doc(db, "orders", receiptObj.orderId));
        if (orderDoc.exists()) {
          const data = orderDoc.data();
          setOrderData(data as OrderData);

          // Extract QR URL
          if (data.deliveryQR?.url) {
            setDeliveryQRUrl(data.deliveryQR.url);
          }
          setQrGenerationStatus(data.qrGenerationStatus || null);
        }

        // Fetch order items
        const itemsSnapshot = await getDocs(
          collection(db, "orders", receiptObj.orderId, "items")
        );

        const items: OrderItem[] = itemsSnapshot.docs.map((docItem) => {
          const data = docItem.data();
          return {
            id: docItem.id,
            productName: data.productName || "Unknown Product",
            quantity: data.quantity || 1,
            price: data.price || 0,
            currency: data.currency || "TL",
            sellerId: data.sellerId || "",
            sellerName: data.sellerName || "Unknown Seller",
            selectedAttributes: data.selectedAttributes,
          };
        });

        setOrderItems(items);

        // Load user email
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setEmailAddress(userData.email || user.email || "");
        }
      } catch (error) {
        console.error("Error fetching receipt details:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReceiptDetails();
  }, [user, id]);

  // ========================================================================
  // QR CODE FUNCTIONS
  // ========================================================================

  const retryQRGeneration = async () => {
    if (!receipt) return;

    setIsRetryingQR(true);
    try {
      const { getFunctions, httpsCallable } = await import(
        "firebase/functions"
      );
      const functions = getFunctions(undefined, "europe-west3");
      const retryQR = httpsCallable(functions, "retryQRGeneration");

      const result = await retryQR({ orderId: receipt.orderId });
      const data = result.data as { success: boolean };

      if (data.success) {
        // Refresh order data after a short delay
        setTimeout(async () => {
          const orderDoc = await getDoc(doc(db, "orders", receipt.orderId));
          if (orderDoc.exists()) {
            const orderDataRefresh = orderDoc.data();
            if (orderDataRefresh.deliveryQR?.url) {
              setDeliveryQRUrl(orderDataRefresh.deliveryQR.url);
            }
            setQrGenerationStatus(orderDataRefresh.qrGenerationStatus || null);
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

    const shareText = `${l("ReceiptDetail.orderQRCode") || "Order QR Code"} #${receipt.orderId.substring(0, 8).toUpperCase()}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: l("ReceiptDetail.deliveryQRCode") || "Delivery QR Code",
          text: shareText,
          url: deliveryQRUrl,
        });
      } catch {
        console.log("Share cancelled");
      }
    } else {
      window.open(deliveryQRUrl, "_blank");
    }
  };

  // ========================================================================
  // EMAIL FUNCTIONS
  // ========================================================================

  const sendReceiptByEmail = async () => {
    if (!receipt || !emailAddress.trim()) return;

    setIsSendingEmail(true);
    try {
      const { getFunctions, httpsCallable } = await import(
        "firebase/functions"
      );
      const functions = getFunctions(undefined, "europe-west3");
      const sendEmail = httpsCallable(functions, "sendReceiptEmail");

      const result = await sendEmail({
        receiptId: receipt.receiptId,
        orderId: receipt.orderId,
        email: emailAddress,
      });

      const data = result.data as { success: boolean };

      if (data.success) {
        setIsEmailModalOpen(false);
        // Show success toast/notification
        alert(l("ReceiptDetail.receiptSentSuccessfully") || "Receipt sent successfully!");
      } else {
        throw new Error("Failed to send email");
      }
    } catch (error) {
      console.error("Error sending receipt email:", error);
      alert(l("ReceiptDetail.failedToSendEmail") || "Failed to send email. Please try again.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  // ========================================================================
  // UTILITY FUNCTIONS
  // ========================================================================

  const formatDate = (timestamp: Date): string => {
    return `${timestamp.getDate().toString().padStart(2, "0")}/${(
      timestamp.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}/${timestamp.getFullYear()} at ${timestamp
      .getHours()
      .toString()
      .padStart(2, "0")}:${timestamp.getMinutes().toString().padStart(2, "0")}`;
  };

  const getDeliveryColor = (deliveryOption: string): string => {
    switch (deliveryOption) {
      case "express":
        return "text-orange-500";
      case "gelal":
        return "text-blue-500";
      case "normal":
      default:
        return "text-green-500";
    }
  };

  const localizeDeliveryOption = (deliveryOption: string): string => {
    switch (deliveryOption) {
      case "express":
        return l("ReceiptDetail.deliveryOption2") || "Express Delivery";
      case "gelal":
        return l("ReceiptDetail.deliveryOption1") || "Pick Up";
      case "normal":
      default:
        return l("ReceiptDetail.deliveryOption3") || "Normal Delivery";
    }
  };

  const shareReceipt = () => {
    if (!receipt) return;

    const shareContent = `${l("ReceiptDetail.receipt") || "Receipt"}\n${
      l("ReceiptDetail.orders") || "Order"
    } #${receipt.orderId.substring(0, 8).toUpperCase()}\n${
      l("ReceiptDetail.total") || "Total"
    }: ${receipt.totalPrice.toFixed(0)} ${receipt.currency}\n${
      l("ReceiptDetail.date") || "Date"
    }: ${formatDate(receipt.timestamp)}\n${
      l("ReceiptDetail.paymentMethod") || "Payment Method"
    }: ${receipt.paymentMethod}\n${
      l("ReceiptDetail.delivery") || "Delivery"
    }: ${localizeDeliveryOption(receipt.deliveryOption)}`;

    if (navigator.share) {
      navigator.share({
        title: l("ReceiptDetail.receipt") || "Receipt",
        text: shareContent,
      });
    } else {
      navigator.clipboard.writeText(shareContent);
      alert(l("ReceiptDetail.copiedToClipboard") || "Copied to clipboard");
    }
  };

  const downloadReceipt = () => {
    if (receipt?.receiptUrl) {
      window.open(receipt.receiptUrl, "_blank");
    } else {
      alert(
        l("ReceiptDetail.receiptPdfNotAvailable") || "Receipt PDF not available"
      );
    }
  };

  const copyOrderId = () => {
    if (receipt) {
      navigator.clipboard.writeText(receipt.orderId);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const formatAttributes = (attributes?: Record<string, unknown>): string => {
    if (!attributes) return "";

    const formattedAttrs: string[] = [];
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") {
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
        if (!systemFields.includes(key)) {
          formattedAttrs.push(`${key}: ${value}`);
        }
      }
    });

    return formattedAttrs.join(", ");
  };

  const groupItemsBySeller = (
    items: OrderItem[]
  ): Record<string, OrderItem[]> => {
    return items.reduce(
      (groups, item) => {
        const sellerId = item.sellerId || "unknown";
        if (!groups[sellerId]) {
          groups[sellerId] = [];
        }
        groups[sellerId].push(item);
        return groups;
      },
      {} as Record<string, OrderItem[]>
    );
  };

  const l = (key: string) => t(key) || key.split(".").pop() || key;

  // ========================================================================
  // RENDER: LOADING / AUTH STATES
  // ========================================================================

  if (authLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <RefreshCw size={32} className="animate-spin text-orange-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className={`min-h-screen flex flex-col ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        {/* Header */}
        <div
          className={`${isDarkMode ? "bg-gray-900" : "bg-white"} border-b ${
            isDarkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <button
                onClick={() => router.back()}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <ArrowLeft
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                />
              </button>
              <h1
                className={`text-lg font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {l("ReceiptDetail.receiptDetails") || "Receipt Details"}
              </h1>
              <div className="w-9" />
            </div>
          </div>
        </div>

        {/* Not Authenticated State */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
              isDarkMode ? "bg-gray-800" : "bg-gray-100"
            }`}
          >
            <User
              size={32}
              className={isDarkMode ? "text-gray-400" : "text-gray-500"}
            />
          </div>
          <h3
            className={`text-xl font-bold mb-3 text-center ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {l("ReceiptDetail.loginRequired") || "Login Required"}
          </h3>
          <p
            className={`text-center mb-8 leading-relaxed ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {l("ReceiptDetail.loginToViewReceipt") ||
              "Please login to view receipt details."}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="flex items-center space-x-2 px-6 py-3 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white hover:from-orange-600 hover:to-pink-600 transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95"
          >
            <LogIn size={18} />
            <span className="font-medium">
              {l("ReceiptDetail.login") || "Login"}
            </span>
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className={`min-h-screen flex flex-col ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div
          className={`${isDarkMode ? "bg-gray-900" : "bg-white"} border-b ${
            isDarkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <button
                onClick={() => router.back()}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <ArrowLeft
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                />
              </button>
              <h1
                className={`text-lg font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {l("ReceiptDetail.receiptDetails") || "Receipt Details"}
              </h1>
              <div className="w-9" />
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <div className="animate-spin w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full mb-4"></div>
            <p className={`${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              {l("ReceiptDetail.loadingReceipt") || "Loading receipt..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div
        className={`min-h-screen flex flex-col ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div
          className={`${isDarkMode ? "bg-gray-900" : "bg-white"} border-b ${
            isDarkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <button
                onClick={() => router.back()}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <ArrowLeft
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                />
              </button>
              <h1
                className={`text-lg font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {l("ReceiptDetail.receiptDetails") || "Receipt Details"}
              </h1>
              <div className="w-9" />
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="text-center">
            <h3
              className={`text-xl font-bold mb-3 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {l("ReceiptDetail.receiptNotFound") || "Receipt Not Found"}
            </h3>
            <p
              className={`mb-6 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {l("ReceiptDetail.receiptNotFoundMessage") ||
                "The receipt you're looking for could not be found."}
            </p>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
            >
              {l("ReceiptDetail.goBack") || "Go Back"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================================
  // COMPUTED VALUES
  // ========================================================================

  const groupedItems = groupItemsBySeller(orderItems);
  const shippingSavings = receipt.freeShippingApplied
    ? receipt.originalDeliveryPrice
    : 0;
  const totalSavings = receipt.couponDiscount + shippingSavings;

  // ========================================================================
  // MODAL COMPONENTS
  // ========================================================================

  const QRCodeModal = () => {
    if (!isQRModalOpen) return null;

    const hasQR = deliveryQRUrl && deliveryQRUrl.length > 0;

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsQRModalOpen(false)}
        />

        <div
          className={`relative w-full sm:max-w-md mx-auto sm:mx-4 rounded-t-3xl sm:rounded-2xl ${
            isDarkMode ? "bg-gray-800" : "bg-white"
          } p-6 animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95`}
        >
          <div className="sm:hidden w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-4" />

          {/* Header */}
          <div className="flex items-start space-x-4 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-pink-500">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3
                className={`text-lg font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {l("ReceiptDetail.deliveryQRCode") || "Delivery QR Code"}
              </h3>
              <p
                className={`text-sm ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {l("ReceiptDetail.showThisToDelivery") ||
                  "Show this to the delivery person"}
              </p>
            </div>
            <button
              onClick={() => setIsQRModalOpen(false)}
              className={`p-2 rounded-lg ${
                isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
              }`}
            >
              <X
                className={`w-5 h-5 ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              />
            </button>
          </div>

          {/* Order badge */}
          <div className="flex justify-center mb-6">
            <span className="px-4 py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-sm font-medium rounded-full flex items-center space-x-2">
              <Package className="w-4 h-4" />
              <span>
                {l("ReceiptDetail.orders") || "Order"} #
                {receipt?.orderId.substring(0, 8).toUpperCase()}
              </span>
            </span>
          </div>

          {/* QR Code Display */}
          {hasQR ? (
            <>
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-white rounded-2xl shadow-lg">
                  <img
                    src={deliveryQRUrl}
                    alt="Delivery QR Code"
                    className="w-64 h-64 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              </div>

              <button
                onClick={shareQRCode}
                className="w-full py-3 px-4 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white font-medium rounded-xl flex items-center justify-center space-x-2 transition-all"
              >
                <Share2 className="w-5 h-5" />
                <span>
                  {l("ReceiptDetail.shareQRCode") || "Share QR Code"}
                </span>
              </button>
            </>
          ) : (
            <div
              className={`p-8 rounded-2xl text-center ${
                isDarkMode ? "bg-gray-700" : "bg-gray-100"
              }`}
            >
              {qrGenerationStatus === "processing" ? (
                <>
                  <div className="animate-spin w-16 h-16 mx-auto mb-4 border-4 border-orange-500 border-t-transparent rounded-full" />
                  <h4
                    className={`font-semibold mb-2 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {l("ReceiptDetail.qrGenerating") || "Generating QR Code..."}
                  </h4>
                  <p
                    className={`text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {l("ReceiptDetail.pleaseWaitQR") ||
                      "Please wait a moment..."}
                  </p>
                </>
              ) : qrGenerationStatus === "failed" ? (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <X className="w-8 h-8 text-red-500" />
                  </div>
                  <h4
                    className={`font-semibold mb-2 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {l("ReceiptDetail.qrGenerationFailed") ||
                      "QR generation failed"}
                  </h4>
                  <p
                    className={`text-sm mb-4 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {l("ReceiptDetail.tapToRetryQR") || "Tap to retry"}
                  </p>
                  <button
                    onClick={retryQRGeneration}
                    disabled={isRetryingQR}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white rounded-lg flex items-center space-x-2 mx-auto transition-colors"
                  >
                    {isRetryingQR ? (
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    <span>
                      {isRetryingQR
                        ? l("ReceiptDetail.retrying") || "Retrying..."
                        : l("ReceiptDetail.retry") || "Retry"}
                    </span>
                  </button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <QrCode className="w-8 h-8 text-orange-500" />
                  </div>
                  <h4
                    className={`font-semibold mb-2 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {l("ReceiptDetail.qrNotReady") || "QR Code not ready yet"}
                  </h4>
                  <p
                    className={`text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {l("ReceiptDetail.qrWillBeReady") ||
                      "It will be ready shortly"}
                  </p>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => setIsQRModalOpen(false)}
            className={`w-full mt-4 py-3 px-4 border ${
              isDarkMode
                ? "border-gray-600 text-gray-300 hover:bg-gray-700"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            } font-medium rounded-xl transition-colors`}
          >
            {l("ReceiptDetail.close") || "Close"}
          </button>
        </div>
      </div>
    );
  };

  const EmailModal = () => {
    if (!isEmailModalOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={() => !isSendingEmail && setIsEmailModalOpen(false)}
        />

        <div
          className={`relative w-full sm:max-w-md mx-auto sm:mx-4 rounded-t-3xl sm:rounded-2xl ${
            isDarkMode ? "bg-gray-800" : "bg-white"
          } p-6`}
        >
          <div className="sm:hidden w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-4" />

          {/* Header */}
          <div className="flex items-start space-x-4 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-pink-500">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3
                className={`text-lg font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {l("ReceiptDetail.sendReceiptByEmail") ||
                  "Send Receipt by Email"}
              </h3>
              <p
                className={`text-sm ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {l("ReceiptDetail.receiptWillBeSentToEmail") ||
                  "Your receipt will be sent to the email below"}
              </p>
            </div>
          </div>

          {/* Email Input */}
          <div className="mb-4">
            <label
              className={`block text-sm font-semibold mb-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {l("ReceiptDetail.emailAddress") || "Email Address"}
            </label>
            <div
              className={`flex items-center rounded-xl ${
                isDarkMode ? "bg-gray-700" : "bg-gray-100"
              }`}
            >
              <Mail
                className={`w-5 h-5 ml-4 ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              />
              <input
                ref={emailInputRef}
                type="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder={
                  l("ReceiptDetail.enterEmailAddress") || "Enter email address"
                }
                className={`flex-1 px-3 py-3.5 bg-transparent outline-none text-sm ${
                  isDarkMode
                    ? "text-white placeholder-gray-500"
                    : "text-gray-900 placeholder-gray-400"
                }`}
              />
            </div>
          </div>

          {/* Receipt Preview */}
          <div
            className={`p-4 rounded-xl mb-6 ${
              isDarkMode
                ? "bg-gradient-to-r from-orange-500/10 to-pink-500/10 border border-orange-500/30"
                : "bg-gradient-to-r from-orange-50 to-pink-50 border border-orange-200"
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <p
                  className={`text-sm font-semibold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {l("ReceiptDetail.receipt") || "Receipt"} #
                  {receipt.receiptId.substring(0, 8).toUpperCase()}
                </p>
                <p
                  className={`text-xs ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {l("ReceiptDetail.orders") || "Order"} #
                  {receipt.orderId.substring(0, 8).toUpperCase()}
                </p>
              </div>
              <p className="text-sm font-semibold text-green-500">
                {receipt.totalPrice.toFixed(0)} {receipt.currency}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={() => !isSendingEmail && setIsEmailModalOpen(false)}
              disabled={isSendingEmail}
              className={`flex-1 py-3 px-4 border ${
                isDarkMode
                  ? "border-gray-600 text-gray-300 hover:bg-gray-700"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              } font-medium rounded-xl transition-colors disabled:opacity-50`}
            >
              {l("ReceiptDetail.cancel") || "Cancel"}
            </button>
            <button
              onClick={sendReceiptByEmail}
              disabled={isSendingEmail || !emailAddress.trim()}
              className={`flex-1 py-3 px-4 font-medium rounded-xl flex items-center justify-center space-x-2 transition-all ${
                isSendingEmail || !emailAddress.trim()
                  ? "bg-gray-400 text-white cursor-not-allowed"
                  : "bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white"
              }`}
            >
              {isSendingEmail ? (
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{l("ReceiptDetail.sendEmail") || "Send Email"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ========================================================================
  // MAIN RENDER
  // ========================================================================

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 ${
          isDarkMode ? "bg-gray-900" : "bg-white"
        } border-b ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.back()}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
              }`}
            >
              <ArrowLeft
                className={`w-5 h-5 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              />
            </button>
            <h1
              className={`text-lg font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {l("ReceiptDetail.receiptDetails") || "Receipt Details"}
            </h1>

            <div className="flex items-center space-x-1">
              <button
                onClick={() => setIsQRModalOpen(true)}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
                title={l("ReceiptDetail.deliveryQRCode") || "Delivery QR Code"}
              >
                <QrCode
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                />
              </button>
              <button
                onClick={() => setIsEmailModalOpen(true)}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
                title={l("ReceiptDetail.sendByEmail") || "Send by Email"}
              >
                <Mail
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                />
              </button>
              <button
                onClick={shareReceipt}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
                title={l("ReceiptDetail.share") || "Share"}
              >
                <Share2
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                />
              </button>
              {receipt.receiptUrl && (
                <button
                  onClick={downloadReceipt}
                  className={`p-2 rounded-lg transition-colors ${
                    isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                  }`}
                  title={l("ReceiptDetail.download") || "Download"}
                >
                  <Download
                    className={`w-5 h-5 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-6">
          {/* Receipt Header */}
          <div className="p-6 bg-gradient-to-r from-orange-500 to-pink-500 rounded-2xl text-white text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold mb-2">
              {l("ReceiptDetail.receiptDetails") || "Receipt Details"}
            </h2>
            <p className="text-white/90 text-sm">
              {formatDate(receipt.timestamp)}
            </p>
          </div>

          {/* Order Information */}
          <div
            className={`p-6 rounded-2xl ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            } shadow-sm border ${
              isDarkMode ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500">
                <Info className="w-4 h-4 text-white" />
              </div>
              <h2
                className={`text-lg font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {l("ReceiptDetail.orderInformation") || "Order Information"}
              </h2>
            </div>

            <div className="space-y-4">
              {/* Order Number */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {l("ReceiptDetail.orderNumber") || "Order Number"}
                </span>
                <div className="flex items-center space-x-2">
                  <span
                    className={`font-medium ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    #{receipt.orderId.substring(0, 8).toUpperCase()}
                  </span>
                  <button
                    onClick={copyOrderId}
                    className={`p-1 rounded transition-colors ${
                      isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                    }`}
                  >
                    {copySuccess ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy
                        className={`w-4 h-4 ${
                          isDarkMode ? "text-gray-400" : "text-gray-600"
                        }`}
                      />
                    )}
                  </button>
                </div>
              </div>

              <div
                className={`border-t ${
                  isDarkMode ? "border-gray-700" : "border-gray-100"
                }`}
              />

              {/* Receipt Number */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {l("ReceiptDetail.receiptNumber") || "Receipt Number"}
                </span>
                <span
                  className={`font-medium ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  #{receipt.receiptId.substring(0, 8).toUpperCase()}
                </span>
              </div>

              <div
                className={`border-t ${
                  isDarkMode ? "border-gray-700" : "border-gray-100"
                }`}
              />

              {/* Payment Method */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {l("ReceiptDetail.paymentMethod") || "Payment Method"}
                </span>
                <span
                  className={`font-medium ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {receipt.paymentMethod}
                </span>
              </div>

              <div
                className={`border-t ${
                  isDarkMode ? "border-gray-700" : "border-gray-100"
                }`}
              />

              {/* Delivery Option */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {l("ReceiptDetail.delivery") || "Delivery"}
                </span>
                <span
                  className={`font-medium ${getDeliveryColor(
                    receipt.deliveryOption
                  )}`}
                >
                  {localizeDeliveryOption(receipt.deliveryOption)}
                </span>
              </div>
            </div>
          </div>

          {/* Delivery Address */}
          {orderData?.address && (
            <div
              className={`p-6 rounded-2xl ${
                isDarkMode ? "bg-gray-800" : "bg-white"
              } shadow-sm border ${
                isDarkMode ? "border-gray-700" : "border-gray-200"
              }`}
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500">
                  <MapPin className="w-4 h-4 text-white" />
                </div>
                <h2
                  className={`text-lg font-semibold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {l("ReceiptDetail.deliveryAddress") || "Delivery Address"}
                </h2>
              </div>

              <div className="space-y-2">
                <p
                  className={`${
                    isDarkMode ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {orderData.address.addressLine1}
                </p>
                {orderData.address.addressLine2 && (
                  <p
                    className={`${
                      isDarkMode ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {orderData.address.addressLine2}
                  </p>
                )}
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {orderData.address.city} • {orderData.address.phoneNumber}
                </p>
              </div>
            </div>
          )}

          {/* Purchased Items */}
          {orderItems.length > 0 && (
            <div
              className={`p-6 rounded-2xl ${
                isDarkMode ? "bg-gray-800" : "bg-white"
              } shadow-sm border ${
                isDarkMode ? "border-gray-700" : "border-gray-200"
              }`}
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500">
                  <ShoppingBag className="w-4 h-4 text-white" />
                </div>
                <h2
                  className={`text-lg font-semibold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {l("ReceiptDetail.purchasedItems") || "Purchased Items"}
                </h2>
              </div>

              <div className="space-y-6">
                {Object.entries(groupedItems).map(([sellerId, items]) => {
                  const sellerName = items[0]?.sellerName || "Unknown Seller";

                  return (
                    <div key={sellerId}>
                      <div className="mb-3">
                        <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-100 to-pink-100 dark:from-orange-900/30 dark:to-pink-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium rounded-lg">
                          <User className="w-3 h-3" />
                          <span>{sellerName}</span>
                        </span>
                      </div>

                      <div className="space-y-3">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start space-x-3"
                          >
                            <div
                              className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                isDarkMode
                                  ? "bg-gradient-to-br from-orange-500/20 to-pink-500/20"
                                  : "bg-gradient-to-br from-orange-100 to-pink-100"
                              }`}
                            >
                              <span className="text-sm font-bold text-orange-500">
                                {item.quantity}x
                              </span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <h4
                                className={`font-medium ${
                                  isDarkMode ? "text-white" : "text-gray-900"
                                }`}
                              >
                                {item.productName}
                              </h4>
                              {item.selectedAttributes &&
                                formatAttributes(item.selectedAttributes) && (
                                  <p
                                    className={`text-sm mt-1 truncate ${
                                      isDarkMode
                                        ? "text-gray-400"
                                        : "text-gray-600"
                                    }`}
                                  >
                                    {formatAttributes(item.selectedAttributes)}
                                  </p>
                                )}
                            </div>

                            <div className="text-right">
                              <p
                                className={`font-semibold ${
                                  isDarkMode ? "text-white" : "text-gray-900"
                                }`}
                              >
                                {item.price} {item.currency}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Price Summary - Matching Flutter */}
          <div
            className={`p-6 rounded-2xl ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            } shadow-sm border ${
              isDarkMode ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500">
                <DollarSign className="w-4 h-4 text-white" />
              </div>
              <h2
                className={`text-lg font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {l("ReceiptDetail.priceSummary") || "Price Summary"}
              </h2>
            </div>

            <div className="space-y-3">
              {/* Subtotal */}
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {l("ReceiptDetail.subtotal") || "Subtotal"}
                </span>
                <span
                  className={`font-semibold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {receipt.itemsSubtotal.toFixed(0)} {receipt.currency}
                </span>
              </div>

              {/* Coupon Discount */}
              {receipt.couponDiscount > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Tag className="w-4 h-4 text-green-500" />
                    <span
                      className={`text-sm ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {receipt.couponCode
                        ? `${l("ReceiptDetail.coupon") || "Coupon"} (${receipt.couponCode})`
                        : l("ReceiptDetail.couponDiscount") || "Coupon Discount"}
                    </span>
                  </div>
                  <span className="font-semibold text-green-500">
                    -{receipt.couponDiscount.toFixed(0)} {receipt.currency}
                  </span>
                </div>
              )}

              {/* Delivery */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {receipt.freeShippingApplied && (
                    <Gift className="w-4 h-4 text-green-500" />
                  )}
                  <span
                    className={`text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {l("ReceiptDetail.delivery") || "Delivery"}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {receipt.freeShippingApplied &&
                    receipt.originalDeliveryPrice > 0 && (
                      <span
                        className={`text-sm line-through ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        {receipt.originalDeliveryPrice.toFixed(0)}{" "}
                        {receipt.currency}
                      </span>
                    )}
                  <span
                    className={`font-semibold ${
                      receipt.deliveryPrice === 0
                        ? "text-green-500"
                        : isDarkMode
                          ? "text-white"
                          : "text-gray-900"
                    }`}
                  >
                    {receipt.deliveryPrice === 0
                      ? l("ReceiptDetail.free") || "Free"
                      : `${receipt.deliveryPrice.toFixed(0)} ${receipt.currency}`}
                  </span>
                </div>
              </div>

              {/* Free Shipping Benefit Label */}
              {receipt.freeShippingApplied && (
                <div className="flex justify-end">
                  <span className="inline-flex items-center space-x-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs font-medium rounded">
                    <Check className="w-3 h-3" />
                    <span>
                      {l("ReceiptDetail.freeShippingBenefit") ||
                        "Free Shipping Benefit"}
                    </span>
                  </span>
                </div>
              )}

              {/* Total Savings */}
              {totalSavings > 0 && (
                <div
                  className={`p-3 rounded-xl ${
                    isDarkMode
                      ? "bg-green-900/20 border border-green-800/50"
                      : "bg-green-50 border border-green-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Percent className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                        {l("ReceiptDetail.youSaved") || "You Saved"}
                      </span>
                    </div>
                    <span className="font-bold text-green-600">
                      {totalSavings.toFixed(0)} {receipt.currency}
                    </span>
                  </div>
                </div>
              )}

              <div
                className={`border-t my-4 ${
                  isDarkMode ? "border-gray-700" : "border-gray-200"
                }`}
              />

              {/* Grand Total */}
              <div
                className={`p-4 rounded-xl ${
                  isDarkMode
                    ? "bg-green-900/20 border border-green-800/50"
                    : "bg-green-50 border border-green-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-lg font-bold ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {l("ReceiptDetail.total") || "Total"}
                  </span>
                  <span className="text-2xl font-bold text-green-600">
                    {receipt.totalPrice.toFixed(0)} {receipt.currency}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <QRCodeModal />
      <EmailModal />
    </div>
  );
}