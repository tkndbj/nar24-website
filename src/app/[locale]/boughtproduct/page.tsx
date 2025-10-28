"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Package,
  ArrowLeft,
  RefreshCw,
  MapPin,
  Receipt,
  Phone,
  Truck,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslations } from "next-intl";
import Image from "next/image";

// Types
interface OrderData {
  id: string;
  totalPrice: number;
  totalQuantity: number;
  currency: string;
  paymentMethod: string;
  timestamp: Timestamp;
  address?: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    phoneNumber?: string;
  };
}

interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  price: number;
  quantity: number;
  currency: string;
  sellerName: string;
  shipmentStatus: string;
  timestamp: Timestamp;
  selectedColor?: string;
  selectedSize?: string;
  selectedMetres?: number;
}

const SHIPMENT_STATUSES = {
  pending: {
    color: "#F59E0B",
    bg: "#FEF3C7",
    icon: Clock,
    label: "pending",
  },
  shipped: {
    color: "#3B82F6",
    bg: "#DBEAFE",
    icon: Truck,
    label: "shipped",
  },
  delivered: {
    color: "#10B981",
    bg: "#D1FAE5",
    icon: CheckCircle,
    label: "delivered",
  },
  cancelled: {
    color: "#EF4444",
    bg: "#FEE2E2",
    icon: XCircle,
    label: "cancelled",
  },
};

export default function BoughtProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const { user } = useUser();
  const t = useTranslations("BoughtProducts");

  // State
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Check dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Redirect if not authenticated or no orderId
  useEffect(() => {
    if (!user) {
      router.push("/login");
    } else if (!orderId) {
      router.push("/orders");
    }
  }, [user, orderId, router]);

  // Load order details when user and orderId are available
  useEffect(() => {
    if (user && orderId) {
      loadOrderDetails();
    }
  }, [user, orderId]);

  // Load order details
  const loadOrderDetails = useCallback(async () => {
    if (!user || !orderId) return;

    setLoading(true);
    setError(null);

    try {
      // Load order document
      const orderDoc = await getDoc(doc(db, "orders", orderId));

      if (!orderDoc.exists()) {
        throw new Error("Order not found");
      }

      const orderData = { id: orderDoc.id, ...orderDoc.data() } as OrderData;
      setOrderData(orderData);

      // Load order items
      const itemsQuery = query(
        collection(db, "orders", orderId, "items"),
        orderBy("timestamp", "asc")
      );

      const itemsSnapshot = await getDocs(itemsQuery);
      const items: OrderItem[] = [];

      itemsSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          productId: data.productId || "",
          productName: data.productName || "",
          productImage: data.productImage || "",
          price: data.price || 0,
          quantity: data.quantity || 1,
          currency: data.currency || "TRY",
          sellerName: data.sellerName || "Unknown Seller",
          shipmentStatus: data.shipmentStatus || "pending",
          timestamp: data.timestamp,
          selectedColor: data.selectedColor,
          selectedSize: data.selectedSize,
          selectedMetres: data.selectedMetres,
        });
      });

      setOrderItems(items);
    } catch (error) {
      console.error("Error loading order details:", error);
      setError(error instanceof Error ? error.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [user, orderId]);

  // Format currency
  const formatCurrency = (amount: number, currency?: string) => {
    return (
      new Intl.NumberFormat("tr-TR").format(amount) +
      " " +
      (currency === "TRY" ? "₺" : currency || "₺")
    );
  };

  // Format date
  const formatDate = (timestamp: Timestamp) => {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(timestamp.toDate());
  };

  // Get status config
  const getStatusConfig = (status: string) => {
    return (
      SHIPMENT_STATUSES[
        status.toLowerCase() as keyof typeof SHIPMENT_STATUSES
      ] || {
        color: isDarkMode ? "#9CA3AF" : "#6B7280",
        bg: isDarkMode ? "#374151" : "#F3F4F6",
        icon: AlertCircle,
        label: status,
      }
    );
  };

  // Status Badge Component
  const StatusBadge = ({ status }: { status: string }) => {
    const config = getStatusConfig(status);
    const IconComponent = config.icon;

    return (
      <div
        className="flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-semibold"
        style={{
          backgroundColor: config.bg,
          color: config.color,
        }}
      >
        <IconComponent size={10} />
        <span>{t(config.label) || config.label}</span>
      </div>
    );
  };

  // Loading Skeleton
  const LoadingSkeleton = () => (
    <div className="space-y-4 p-4">
      {/* Order Header Shimmer */}
      <div
        className={`animate-pulse rounded-lg border p-4 h-32 ${
          isDarkMode
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      />

      {/* Order Items Shimmer */}
      {[...Array(2)].map((_, index) => (
        <div
          key={index}
          className={`animate-pulse rounded-lg border p-4 h-36 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }`}
        />
      ))}

      {/* Address Shimmer */}
      <div
        className={`animate-pulse rounded-lg border p-4 h-24 ${
          isDarkMode
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      />

      {/* Summary Shimmer */}
      <div
        className={`animate-pulse rounded-lg border p-4 h-32 ${
          isDarkMode
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      />
    </div>
  );

  // Summary Row Component
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
            ? `text-sm font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`
            : `text-xs font-medium ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`
        }
      >
        {label}
      </span>
      <span
        className={
          isTotal
            ? "text-sm font-bold text-indigo-600"
            : `text-xs font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`
        }
        style={valueColor ? { color: valueColor } : {}}
      >
        {value}
      </span>
    </div>
  );

  if (!user || !orderId) {
    return null; // Will redirect
  }

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* Header */}
      <div
        className={`
          sticky top-0 z-10 border-b
          ${
            isDarkMode
              ? "bg-gray-900 border-gray-700"
              : "bg-white border-gray-200"
          }
        `}
      >
        <div className="relative">
          {/* Gradient Background */}
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600" />

          {/* Content */}
          <div className="relative px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className="
                  p-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20
                  hover:bg-white/20 transition-colors
                "
              >
                <ArrowLeft size={18} className="text-white" />
              </button>

              <div className="flex-1">
                <h1 className="text-xl font-bold text-white">
                  {t("orderDetails") || "Order Details"}
                </h1>
                <p className="text-indigo-100 text-sm mt-1">
                  #{orderId.slice(0, 8).toUpperCase()}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white/10 backdrop-blur-sm">
                <Receipt size={20} className="text-white" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className={`
                w-24 h-24 rounded-full flex items-center justify-center mb-6
                ${isDarkMode ? "bg-red-900/20" : "bg-red-100"}
              `}
            >
              <XCircle size={32} className="text-red-500" />
            </div>
            <h3
              className={`
                text-lg font-medium mb-2
                ${isDarkMode ? "text-white" : "text-gray-900"}
              `}
            >
              {t("failedToLoadOrder") || "Failed to load order"}
            </h3>
            <p
              className={`
                text-center mb-4
                ${isDarkMode ? "text-gray-400" : "text-gray-600"}
              `}
            >
              {error}
            </p>
            <button
              onClick={loadOrderDetails}
              className="
                flex items-center space-x-2 px-4 py-2 bg-indigo-500 text-white rounded-lg
                hover:bg-indigo-600 transition-colors
              "
            >
              <RefreshCw size={16} />
              <span>{t("retry") || "Retry"}</span>
            </button>
          </div>
        ) : loading ? (
          <LoadingSkeleton />
        ) : (
          <div className="space-y-4">
            {/* Order Header */}
            {orderData && (
              <div
                className={`
                  rounded-lg border p-4
                  ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-200"
                  }
                `}
              >
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Receipt size={20} className="text-indigo-600" />
                  </div>

                  <div className="flex-1">
                    <h4
                      className={`font-semibold text-sm ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {t("orderNumber") || "Order Number"}
                    </h4>
                    <p
                      className={`text-xs ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      #{orderId.slice(0, 8).toUpperCase()}
                    </p>
                  </div>

                  {orderItems.length > 0 && (
                    <StatusBadge status={orderItems[0].shipmentStatus} />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div
                    className={`p-2 rounded-lg ${
                      isDarkMode ? "bg-gray-700" : "bg-gray-50"
                    }`}
                  >
                    <div
                      className={`text-xs ${
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {t("orderDate") || "Order Date"}
                    </div>
                    <div
                      className={`text-xs font-semibold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {formatDate(orderData.timestamp)}
                    </div>
                  </div>

                  <div
                    className={`p-2 rounded-lg ${
                      isDarkMode ? "bg-gray-700" : "bg-gray-50"
                    }`}
                  >
                    <div
                      className={`text-xs ${
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {t("paymentMethod") || "Payment Method"}
                    </div>
                    <div
                      className={`text-xs font-semibold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {orderData.paymentMethod || t("unknown") || "Unknown"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Order Items */}
            {orderItems.map((item) => (
              <div
                key={item.id}
                className={`
                  rounded-lg border p-4
                  ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-200"
                  }
                `}
              >
                {/* Header Row */}
                <div className="flex items-center space-x-3 mb-3">
                  <div
                    className={`
                      w-12 h-12 rounded-lg flex items-center justify-center border
                      ${
                        isDarkMode
                          ? "bg-gray-700 border-gray-600"
                          : "bg-gray-50 border-gray-200"
                      }
                    `}
                  >
                    {item.productImage ? (
                      <Image
                        src={item.productImage}
                        alt={item.productName}
                        width={48}
                        height={48}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <Package
                        size={20}
                        className={
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4
                      className={`font-semibold text-sm line-clamp-1 ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {item.productName}
                    </h4>
                    <div className="px-2 py-1 bg-indigo-100 rounded text-xs font-semibold text-indigo-600 inline-block mt-1">
                      {t("soldBy") || "Sold by"} {item.sellerName}
                    </div>
                  </div>

                  <StatusBadge status={item.shipmentStatus} />
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2 bg-green-50 rounded-lg">
                    <div className="text-xs font-bold text-green-600">
                      {formatCurrency(item.price, item.currency)}
                    </div>
                    <div
                      className={`text-xs ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {t("qty") || "Qty"}: {item.quantity}
                    </div>
                  </div>

                  <div
                    className={`p-2 rounded-lg ${
                      isDarkMode ? "bg-gray-700" : "bg-gray-50"
                    }`}
                  >
                    <div
                      className={`text-xs ${
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {t("total") || "Total"}
                    </div>
                    <div
                      className={`text-xs font-semibold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {formatCurrency(
                        item.price * item.quantity,
                        item.currency
                      )}
                    </div>
                  </div>
                </div>

                {/* Variants */}
                {(item.selectedColor || item.selectedSize || item.selectedMetres) && (
  <div className="flex flex-wrap gap-2 mt-2">
    {item.selectedColor && (
      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
        {item.selectedColor}
      </span>
    )}
    {item.selectedSize && (
      <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
        {item.selectedSize}
      </span>
    )}
    {item.selectedMetres && (
      <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
        {item.selectedMetres}m
      </span>
    )}
  </div>
)}
              </div>
            ))}

            {/* Shipping Address */}
            {orderData?.address && (
              <div
                className={`
                  rounded-lg border p-4
                  ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-200"
                  }
                `}
              >
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                    <MapPin size={20} className="text-green-600" />
                  </div>
                  <h4
                    className={`font-semibold text-sm ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("shippingAddress") || "Shipping Address"}
                  </h4>
                </div>

                <div
                  className={`p-3 rounded-lg ${
                    isDarkMode ? "bg-gray-700" : "bg-gray-50"
                  }`}
                >
                  <div
                    className={`text-sm font-semibold mb-1 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {orderData.address.addressLine1}
                    {orderData.address.addressLine2 &&
                      `, ${orderData.address.addressLine2}`}
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {orderData.address.city}
                  </div>

                  {orderData.address.phoneNumber && (
                    <div className="flex items-center space-x-2 mt-2">
                      <div className="p-1 bg-green-100 rounded">
                        <Phone size={12} className="text-green-600" />
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {orderData.address.phoneNumber}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Order Summary */}
            {orderData && (
              <div
                className={`
                  rounded-lg border p-4
                  ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-200"
                  }
                `}
              >
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Receipt size={20} className="text-indigo-600" />
                  </div>
                  <h4
                    className={`font-semibold text-sm ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("orderSummary") || "Order Summary"}
                  </h4>
                </div>

                <div
                  className={`p-3 rounded-lg space-y-3 ${
                    isDarkMode ? "bg-gray-700" : "bg-gray-50"
                  }`}
                >
                  <SummaryRow
                    label={`${t("items") || "Items"} (${
                      orderData.totalQuantity
                    })`}
                    value={formatCurrency(
                      orderData.totalPrice,
                      orderData.currency
                    )}
                  />
                  <SummaryRow
                    label={t("shipping") || "Shipping"}
                    value={t("free") || "Free"}
                    valueColor="#10B981"
                  />

                  <div
                    className={`h-px ${
                      isDarkMode ? "bg-gray-600" : "bg-gray-200"
                    }`}
                  />

                  <SummaryRow
                    label={t("total") || "Total"}
                    value={formatCurrency(
                      orderData.totalPrice,
                      orderData.currency
                    )}
                    isTotal
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
