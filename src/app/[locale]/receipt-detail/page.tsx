"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
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
} from "lucide-react";
import { useTranslations } from "next-intl";

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
}

interface OrderData {
  address?: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    phoneNumber: string;
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

export default function ReceiptDetailPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);

  const { user } = useUser();
  const router = useRouter();
  const params = useParams();
  const t = useTranslations();

  const receiptId = params.id as string;

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

  // Fetch receipt and order details
  useEffect(() => {
    const fetchReceiptDetails = async () => {
      if (!user || !receiptId) {
        setIsLoading(false);
        return;
      }

      try {
        // Fetch receipt document
        const receiptDoc = await getDoc(
          doc(db, "users", user.uid, "receipts", receiptId)
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
          timestamp: receiptData.timestamp instanceof Timestamp 
            ? receiptData.timestamp.toDate() 
            : new Date(receiptData.timestamp),
          paymentMethod: receiptData.paymentMethod || "",
          deliveryOption: receiptData.deliveryOption || "",
          receiptUrl: receiptData.receiptUrl,
        };

        setReceipt(receiptObj);

        // Fetch order details
        const orderDoc = await getDoc(doc(db, "orders", receiptObj.orderId));
        if (orderDoc.exists()) {
          setOrderData(orderDoc.data() as OrderData);
        }

        // Fetch order items
        const itemsSnapshot = await getDocs(
          collection(db, "orders", receiptObj.orderId, "items")
        );

        const items: OrderItem[] = itemsSnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
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
      } catch (error) {
        console.error("Error fetching receipt details:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReceiptDetails();
  }, [user, receiptId]);

  // Format date
  const formatDate = (timestamp: Date): string => {
    return `${timestamp.getDate().toString().padStart(2, '0')}/${(timestamp.getMonth() + 1).toString().padStart(2, '0')}/${timestamp.getFullYear()} at ${timestamp.getHours().toString().padStart(2, '0')}:${timestamp.getMinutes().toString().padStart(2, '0')}`;
  };

  // Get delivery option color
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

  // Localize delivery option
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

  // Share receipt
  const shareReceipt = () => {
    if (!receipt) return;

    const shareContent = `${l("ReceiptDetail.receipt") || "Receipt"}\n${l("ReceiptDetail.orders") || "Order"} #${receipt.orderId.substring(0, 8).toUpperCase()}\n${l("ReceiptDetail.total") || "Total"}: ${receipt.totalPrice.toFixed(0)} ${receipt.currency}\n${l("ReceiptDetail.date") || "Date"}: ${formatDate(receipt.timestamp)}\n${l("ReceiptDetail.paymentMethod") || "Payment Method"}: ${receipt.paymentMethod}\n${l("ReceiptDetail.delivery") || "Delivery"}: ${localizeDeliveryOption(receipt.deliveryOption)}`;

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

  // Download receipt
  const downloadReceipt = () => {
    if (receipt?.receiptUrl) {
      window.open(receipt.receiptUrl, '_blank');
    } else {
      alert(l("ReceiptDetail.receiptPdfNotAvailable") || "Receipt PDF not available");
    }
  };

  // Copy order ID
  const copyOrderId = () => {
    if (receipt) {
      navigator.clipboard.writeText(receipt.orderId);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  // Format attributes
  const formatAttributes = (attributes?: Record<string, unknown>): string => {
    if (!attributes) return "";

    const formattedAttrs: string[] = [];
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") {
        // Skip system fields
        const systemFields = ["productId", "orderId", "buyerId", "sellerId", "timestamp", "addedAt", "updatedAt", "selectedColorImage", "productImage", "finalPrice"];
        if (!systemFields.includes(key)) {
          formattedAttrs.push(`${key}: ${value}`);
        }
      }
    });

    return formattedAttrs.join(", ");
  };

  // Group items by seller
  const groupItemsBySeller = (items: OrderItem[]): Record<string, OrderItem[]> => {
    return items.reduce((groups, item) => {
      const sellerId = item.sellerId || "unknown";
      if (!groups[sellerId]) {
        groups[sellerId] = [];
      }
      groups[sellerId].push(item);
      return groups;
    }, {} as Record<string, OrderItem[]>);
  };

  const l = (key: string) => t(key) || key.split('.').pop() || key;

  if (!user) {
    return (
      <div className={`min-h-screen flex flex-col ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        {/* Header */}
        <div className={`${isDarkMode ? "bg-gray-900" : "bg-white"} border-b ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <button
                onClick={() => router.back()}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <ArrowLeft className={`w-5 h-5 ${isDarkMode ? "text-white" : "text-gray-900"}`} />
              </button>
              <h1 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                {l("ReceiptDetail.receiptDetails") || "Receipt Details"}
              </h1>
              <div className="w-9" />
            </div>
          </div>
        </div>

        {/* Not Authenticated State */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}`}>
            <User size={32} className={isDarkMode ? "text-gray-400" : "text-gray-500"} />
          </div>
          <h3 className={`text-xl font-bold mb-3 text-center ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {l("ReceiptDetail.loginRequired") || "Login Required"}
          </h3>
          <p className={`text-center mb-8 leading-relaxed ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            {l("ReceiptDetail.loginToViewReceipt") || "Please login to view receipt details."}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="flex items-center space-x-2 px-6 py-3 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 text-white hover:from-orange-600 hover:to-pink-600 transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95"
          >
            <LogIn size={18} />
            <span className="font-medium">{l("ReceiptDetail.login") || "Login"}</span>
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`min-h-screen flex flex-col ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        {/* Header */}
        <div className={`${isDarkMode ? "bg-gray-900" : "bg-white"} border-b ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <button
                onClick={() => router.back()}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <ArrowLeft className={`w-5 h-5 ${isDarkMode ? "text-white" : "text-gray-900"}`} />
              </button>
              <h1 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                {l("ReceiptDetail.receiptDetails") || "Receipt Details"}
              </h1>
              <div className="w-9" />
            </div>
          </div>
        </div>

        {/* Loading State */}
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
      <div className={`min-h-screen flex flex-col ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        {/* Header */}
        <div className={`${isDarkMode ? "bg-gray-900" : "bg-white"} border-b ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <button
                onClick={() => router.back()}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <ArrowLeft className={`w-5 h-5 ${isDarkMode ? "text-white" : "text-gray-900"}`} />
              </button>
              <h1 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                {l("ReceiptDetail.receiptDetails") || "Receipt Details"}
              </h1>
              <div className="w-9" />
            </div>
          </div>
        </div>

        {/* Not Found State */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="text-center">
            <h3 className={`text-xl font-bold mb-3 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {l("ReceiptDetail.receiptNotFound") || "Receipt Not Found"}
            </h3>
            <p className={`mb-6 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              {l("ReceiptDetail.receiptNotFoundMessage") || "The receipt you're looking for could not be found."}
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

  const groupedItems = groupItemsBySeller(orderItems);

  return (
    <div className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      {/* Header */}
      <div className={`sticky top-0 z-10 ${isDarkMode ? "bg-gray-900" : "bg-white"} border-b ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.back()}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
              }`}
            >
              <ArrowLeft className={`w-5 h-5 ${isDarkMode ? "text-white" : "text-gray-900"}`} />
            </button>
            <h1 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {l("ReceiptDetail.receiptDetails") || "Receipt Details"}
            </h1>

            <div className="flex items-center space-x-2">
              <button
                onClick={shareReceipt}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
                title={l("ReceiptDetail.share") || "Share"}
              >
                <Share2 className={`w-5 h-5 ${isDarkMode ? "text-white" : "text-gray-900"}`} />
              </button>
              {receipt.receiptUrl && (
                <button
                  onClick={downloadReceipt}
                  className={`p-2 rounded-lg transition-colors ${
                    isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                  }`}
                  title={l("ReceiptDetail.download") || "Download"}
                >
                  <Download className={`w-5 h-5 ${isDarkMode ? "text-white" : "text-gray-900"}`} />
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
            <p className="text-white/90 text-sm">
              {formatDate(receipt.timestamp)}
            </p>
          </div>

          {/* Order Information */}
          <div className={`p-6 rounded-2xl ${isDarkMode ? "bg-gray-800" : "bg-white"} shadow-sm border ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}>
            <h2 className={`text-lg font-semibold mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {l("ReceiptDetail.orderInformation") || "Order Information"}
            </h2>

            <div className="space-y-4">
              {/* Order Number */}
              <div className="flex items-center justify-between">
                <span className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  {l("ReceiptDetail.orderNumber") || "Order Number"}
                </span>
                <div className="flex items-center space-x-2">
                  <span className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
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
                      <Copy className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`} />
                    )}
                  </button>
                </div>
              </div>

              {/* Receipt Number */}
              <div className="flex items-center justify-between">
                <span className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  {l("ReceiptDetail.receiptNumber") || "Receipt Number"}
                </span>
                <span className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  #{receipt.receiptId.substring(0, 8).toUpperCase()}
                </span>
              </div>

              {/* Payment Method */}
              <div className="flex items-center justify-between">
                <span className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  {l("ReceiptDetail.paymentMethod") || "Payment Method"}
                </span>
                <span className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {receipt.paymentMethod}
                </span>
              </div>

              {/* Delivery Option */}
              <div className="flex items-center justify-between">
                <span className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  {l("ReceiptDetail.delivery") || "Delivery"}
                </span>
                <span className={`font-medium ${getDeliveryColor(receipt.deliveryOption)}`}>
                  {localizeDeliveryOption(receipt.deliveryOption)}
                </span>
              </div>
            </div>
          </div>

          {/* Delivery Address */}
          {orderData?.address && (
            <div className={`p-6 rounded-2xl ${isDarkMode ? "bg-gray-800" : "bg-white"} shadow-sm border ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}>
              <div className="flex items-center space-x-2 mb-4">
                <MapPin className="w-5 h-5 text-orange-500" />
                <h2 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {l("ReceiptDetail.deliveryAddress") || "Delivery Address"}
                </h2>
              </div>

              <div className="space-y-2">
                <p className={`${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                  {orderData.address.addressLine1}
                </p>
                {orderData.address.addressLine2 && (
                  <p className={`${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                    {orderData.address.addressLine2}
                  </p>
                )}
                <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                  {orderData.address.city} • {orderData.address.phoneNumber}
                </p>
              </div>
            </div>
          )}

          {/* Purchased Items */}
          {orderItems.length > 0 && (
            <div className={`p-6 rounded-2xl ${isDarkMode ? "bg-gray-800" : "bg-white"} shadow-sm border ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}>
              <h2 className={`text-lg font-semibold mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                {l("ReceiptDetail.purchasedItems") || "Purchased Items"}
              </h2>

              <div className="space-y-6">
                {Object.entries(groupedItems).map(([sellerId, items]) => {
                  const sellerName = items[0]?.sellerName || "Unknown Seller";
                  
                  return (
                    <div key={sellerId}>
                      <div className="mb-3">
                        <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs font-medium rounded-full">
                          {sellerName}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {items.map((item) => (
                          <div key={item.id} className="flex items-start space-x-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDarkMode ? "bg-gray-700" : "bg-gray-100"}`}>
                              <span className="text-sm font-semibold text-orange-500">
                                {item.quantity}x
                              </span>
                            </div>

                            <div className="flex-1">
                              <h4 className={`font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                                {item.productName}
                              </h4>
                              {item.selectedAttributes && formatAttributes(item.selectedAttributes) && (
                                <p className={`text-sm mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                                  {formatAttributes(item.selectedAttributes)}
                                </p>
                              )}
                            </div>

                            <div className="text-right">
                              <p className={`font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
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

          {/* Price Summary */}
          <div className={`p-6 rounded-2xl border-2 border-green-200 dark:border-green-800 ${isDarkMode ? "bg-gray-800" : "bg-white"} shadow-sm`}>
            <div className="flex items-center justify-between">
              <h2 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                {l("ReceiptDetail.total") || "Total"}
              </h2>
              <p className="text-2xl font-bold text-green-600">
                {receipt.totalPrice.toFixed(0)} {receipt.currency}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}