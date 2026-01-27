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
  Warehouse,
  UserCheck,
  Bike,
  Tag,
  Gift,
  Check,
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

// ============================================================================
// TYPES
// ============================================================================

interface OrderData {
  id: string;
  totalPrice: number;
  totalQuantity: number;
  currency: string;
  paymentMethod: string;
  deliveryOption?: string;
  deliveryPrice?: number;
  deliveryStatus?: string;
  distributionStatus?: string;
  timestamp: Timestamp;
  address?: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    phoneNumber?: string;
  };
  // Price breakdown
  itemsSubtotal?: number;
  originalDeliveryPrice?: number;
  // Coupon/benefit fields
  couponCode?: string;
  couponDiscount?: number;
  freeShippingApplied?: boolean;
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
  // Status fields from Flutter
  gatheringStatus?: string;
  deliveryStatus?: string;
  deliveredInPartial?: boolean;
  // Dynamic attributes
  selectedAttributes?: Record<string, unknown>;
  // Legacy specific fields
  selectedColor?: string;
  selectedSize?: string;
  selectedMetres?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SHIPMENT_STATUSES = {
  pending: {
    color: "#F59E0B",
    bg: "#FEF3C7",
    darkBg: "#78350F",
    icon: Clock,
    label: "shipmentPending",
  },
  collecting: {
    color: "#F97316",
    bg: "#FFEDD5",
    darkBg: "#7C2D12",
    icon: UserCheck,
    label: "shipmentCollecting",
  },
  in_transit: {
    color: "#3B82F6",
    bg: "#DBEAFE",
    darkBg: "#1E3A8A",
    icon: Truck,
    label: "shipmentInTransit",
  },
  at_warehouse: {
    color: "#8B5CF6",
    bg: "#EDE9FE",
    darkBg: "#4C1D95",
    icon: Warehouse,
    label: "shipmentAtWarehouse",
  },
  out_for_delivery: {
    color: "#6366F1",
    bg: "#E0E7FF",
    darkBg: "#312E81",
    icon: Bike,
    label: "shipmentOutForDelivery",
  },
  shipped: {
    color: "#3B82F6",
    bg: "#DBEAFE",
    darkBg: "#1E3A8A",
    icon: Truck,
    label: "shipped",
  },
  delivered: {
    color: "#10B981",
    bg: "#D1FAE5",
    darkBg: "#064E3B",
    icon: CheckCircle,
    label: "shipmentDelivered",
  },
  cancelled: {
    color: "#EF4444",
    bg: "#FEE2E2",
    darkBg: "#7F1D1D",
    icon: XCircle,
    label: "cancelled",
  },
  failed: {
    color: "#EF4444",
    bg: "#FEE2E2",
    darkBg: "#7F1D1D",
    icon: XCircle,
    label: "shipmentFailed",
  },
};

// Color palette for dynamic attributes
const ATTRIBUTE_COLORS = [
  { color: "#6366F1", bg: "#E0E7FF" }, // indigo
  { color: "#8B5CF6", bg: "#EDE9FE" }, // purple
  { color: "#10B981", bg: "#D1FAE5" }, // green
  { color: "#F59E0B", bg: "#FEF3C7" }, // amber
  { color: "#EF4444", bg: "#FEE2E2" }, // red
  { color: "#3B82F6", bg: "#DBEAFE" }, // blue
  { color: "#06B6D4", bg: "#CFFAFE" }, // cyan
];

// System fields to exclude from attributes display
const SYSTEM_FIELDS = new Set([
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
  "calculatedUnitPrice",
  "calculatedTotal",
  "unitPrice",
  "totalPrice",
  "currency",
  "isBundleItem",
  "bundleInfo",
  "salePreferences",
  "isBundle",
  "bundleId",
  "mainProductPrice",
  "bundlePrice",
  "sellerName",
  "isShop",
  "shopId",
  "productName",
  "brandModel",
  "brand",
  "category",
  "subcategory",
  "subsubcategory",
  "condition",
  "averageRating",
  "productAverageRating",
  "reviewCount",
  "productReviewCount",
  "gender",
  "clothingType",
  "clothingFit",
  "shipmentStatus",
  "deliveryOption",
  "needsProductReview",
  "needsSellerReview",
  "needsAnyReview",
  "quantity",
  "availableStock",
  "maxQuantityAllowed",
  "ourComission",
  "sellerContactNo",
  "showSellerHeader",
  "clothingTypes",
  "pantFabricTypes",
  "pantFabricType",
  "gatheringStatus",
  "deliveryStatus",
  "deliveredInPartial",
]);

// ============================================================================
// COMPONENT
// ============================================================================

export default function BoughtProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const { user, isLoading: authLoading } = useUser();
  const t = useTranslations("BoughtProducts");

  // State
  const [orderData, setOrderData] = useState<OrderData | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // ========================================================================
  // EFFECTS
  // ========================================================================

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (!authLoading && user && !orderId) {
      router.push("/orders");
    }
  }, [user, authLoading, orderId, router]);

  useEffect(() => {
    if (user && orderId) {
      loadOrderDetails();
    }
  }, [user, orderId]);

  // ========================================================================
  // DATA LOADING
  // ========================================================================

  const loadOrderDetails = useCallback(async () => {
    if (!user || !orderId) return;

    setLoading(true);
    setError(null);

    try {
      const orderDoc = await getDoc(doc(db, "orders", orderId));

      if (!orderDoc.exists()) {
        throw new Error("Order not found");
      }

      const data = orderDoc.data();
      const orderDataObj: OrderData = {
        id: orderDoc.id,
        totalPrice: data.totalPrice || 0,
        totalQuantity: data.totalQuantity || 0,
        currency: data.currency || "TL",
        paymentMethod: data.paymentMethod || "",
        deliveryOption: data.deliveryOption,
        deliveryPrice: data.deliveryPrice || 0,
        deliveryStatus: data.deliveryStatus,
        distributionStatus: data.distributionStatus,
        timestamp: data.timestamp,
        address: data.address,
        // Price breakdown
        itemsSubtotal: data.itemsSubtotal || data.totalPrice || 0,
        originalDeliveryPrice: data.originalDeliveryPrice || data.deliveryPrice || 0,
        // Coupon/benefit
        couponCode: data.couponCode,
        couponDiscount: data.couponDiscount || 0,
        freeShippingApplied: data.freeShippingApplied || false,
      };
      setOrderData(orderDataObj);

      // Load order items
      const itemsQuery = query(
        collection(db, "orders", orderId, "items"),
        orderBy("timestamp", "asc")
      );

      const itemsSnapshot = await getDocs(itemsQuery);
      const items: OrderItem[] = itemsSnapshot.docs.map((docItem) => {
        const itemData = docItem.data();
        return {
          id: docItem.id,
          productId: itemData.productId || "",
          productName: itemData.productName || "",
          productImage: itemData.productImage || "",
          price: itemData.price || 0,
          quantity: itemData.quantity || 1,
          currency: itemData.currency || "TL",
          sellerName: itemData.sellerName || "Unknown Seller",
          shipmentStatus: itemData.shipmentStatus || "pending",
          timestamp: itemData.timestamp,
          gatheringStatus: itemData.gatheringStatus,
          deliveryStatus: itemData.deliveryStatus,
          deliveredInPartial: itemData.deliveredInPartial,
          selectedAttributes: itemData.selectedAttributes,
          selectedColor: itemData.selectedColor,
          selectedSize: itemData.selectedSize,
          selectedMetres: itemData.selectedMetres,
        };
      });

      setOrderItems(items);
    } catch (err) {
      console.error("Error loading order details:", err);
      setError(err instanceof Error ? err.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [user, orderId]);

  // ========================================================================
  // HELPER FUNCTIONS
  // ========================================================================

  const formatCurrency = (amount: number, currency?: string) => {
    return (
      new Intl.NumberFormat("tr-TR").format(amount) +
      " " +
      (currency === "TRY" ? "₺" : currency || "TL")
    );
  };

  const formatDate = (timestamp: Timestamp) => {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(timestamp.toDate());
  };

  const getDeliveryOptionColor = (deliveryOption: string): string => {
    switch (deliveryOption) {
      case "express":
        return "#F97316";
      case "gelal":
        return "#3B82F6";
      case "normal":
      default:
        return "#10B981";
    }
  };

  const localizeDeliveryOption = (deliveryOption: string): string => {
    switch (deliveryOption) {
      case "express":
        return t("deliveryOption2") || "Express Delivery";
      case "gelal":
        return t("deliveryOption1") || "Pick Up";
      case "normal":
      default:
        return t("deliveryOption3") || "Normal Delivery";
    }
  };

  // Determine shipment status from item data (matching Flutter logic)
  const getShipmentStatusFromItem = (item: OrderItem): string => {
    const { gatheringStatus, deliveryStatus, deliveredInPartial } = item;

    // Check if delivered
    if (
      gatheringStatus === "delivered" ||
      deliveryStatus === "delivered" ||
      deliveredInPartial
    ) {
      return "delivered";
    }

    // Check for failures
    if (gatheringStatus === "failed") {
      return "failed";
    }

    // Check gathering status progression
    switch (gatheringStatus) {
      case "at_warehouse":
        return "at_warehouse";
      case "gathered":
        return "in_transit";
      case "assigned":
        return "collecting";
      case "pending":
      default:
        return "pending";
    }
  };

  // Get overall order status (matching Flutter logic)
  const getOrderStatus = (): string => {
    if (!orderData) return "pending";

    const { deliveryStatus, distributionStatus } = orderData;

    if (deliveryStatus === "delivered" || distributionStatus === "delivered") {
      return "delivered";
    }

    if (orderItems.length === 0) {
      return "pending";
    }

    // Check if all items delivered
    const allDelivered = orderItems.every((item) => {
      const status = getShipmentStatusFromItem(item);
      return status === "delivered";
    });

    if (allDelivered) return "delivered";

    // Check if any failed
    const anyFailed = orderItems.some(
      (item) => getShipmentStatusFromItem(item) === "failed"
    );

    if (anyFailed) return "failed";

    // Find lowest status
    const statusPriority: Record<string, number> = {
      pending: 0,
      collecting: 1,
      in_transit: 2,
      at_warehouse: 3,
      out_for_delivery: 4,
    };

    let lowestStatus = "out_for_delivery";
    let lowestPriority = 4;

    for (const item of orderItems) {
      const itemStatus = getShipmentStatusFromItem(item);
      const priority = statusPriority[itemStatus] ?? 0;
      if (priority < lowestPriority) {
        lowestPriority = priority;
        lowestStatus = itemStatus;
      }
    }

    return lowestStatus;
  };

  const getStatusConfig = (status: string) => {
    return (
      SHIPMENT_STATUSES[status.toLowerCase() as keyof typeof SHIPMENT_STATUSES] || {
        color: isDarkMode ? "#9CA3AF" : "#6B7280",
        bg: isDarkMode ? "#374151" : "#F3F4F6",
        darkBg: "#374151",
        icon: AlertCircle,
        label: status,
      }
    );
  };

  // ========================================================================
  // COMPONENTS
  // ========================================================================

  const StatusBadge = ({ status }: { status: string }) => {
    const config = getStatusConfig(status);
    const IconComponent = config.icon;

    return (
      <div
        className="flex items-center space-x-1 px-2 py-1 rounded-full text-[10px] font-semibold"
        style={{
          backgroundColor: isDarkMode ? config.darkBg : config.bg,
          color: config.color,
        }}
      >
        <IconComponent size={10} />
        <span>{t(config.label) || config.label}</span>
      </div>
    );
  };

  const DynamicAttributesSection = ({
    attributes,
  }: {
    attributes: Record<string, unknown>;
  }) => {
    const chips: React.ReactNode[] = [];
    let colorIndex = 0;

    Object.entries(attributes).forEach(([key, value]) => {
      if (
        value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0) ||
        SYSTEM_FIELDS.has(key)
      ) {
        return;
      }

      const colorConfig = ATTRIBUTE_COLORS[colorIndex % ATTRIBUTE_COLORS.length];
      colorIndex++;

      // Format key and value
      const formattedKey = key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
      const formattedValue = String(value);

      chips.push(
        <span
          key={key}
          className="inline-flex items-center px-2 py-1 rounded text-[10px] font-semibold"
          style={{
            backgroundColor: isDarkMode
              ? `${colorConfig.color}20`
              : colorConfig.bg,
            color: colorConfig.color,
            border: `1px solid ${colorConfig.color}30`,
          }}
        >
          <span className="font-medium">{formattedKey}:</span>
          <span className="ml-1 font-bold">{formattedValue}</span>
        </span>
      );
    });

    if (chips.length === 0) return null;

    return (
      <div
        className={`p-3 rounded-lg mt-3 ${
          isDarkMode ? "bg-white/5 border border-white/10" : "bg-gray-50 border border-gray-100"
        }`}
      >
        <div
          className={`text-[11px] font-semibold mb-2 ${
            isDarkMode ? "text-gray-400" : "text-gray-600"
          }`}
        >
          {t("productDetails") || "Product Details"}
        </div>
        <div className="flex flex-wrap gap-1.5">{chips}</div>
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
            ? "text-sm font-bold text-indigo-600"
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
      <div
        className={`animate-pulse rounded-lg border p-4 h-32 ${
          isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
        }`}
      />
      {[...Array(2)].map((_, index) => (
        <div
          key={index}
          className={`animate-pulse rounded-lg border p-4 h-36 ${
            isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
          }`}
        />
      ))}
      <div
        className={`animate-pulse rounded-lg border p-4 h-24 ${
          isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
        }`}
      />
      <div
        className={`animate-pulse rounded-lg border p-4 h-32 ${
          isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
        }`}
      />
    </div>
  );

  // ========================================================================
  // RENDER
  // ========================================================================

  if (!user || !orderId) {
    return null;
  }

  const overallStatus = getOrderStatus();
  const subtotal = orderData?.itemsSubtotal || orderData?.totalPrice || 0;
  const deliveryPrice = orderData?.deliveryPrice || 0;
  const originalDeliveryPrice = orderData?.originalDeliveryPrice || deliveryPrice;
  const couponDiscount = orderData?.couponDiscount || 0;
  const freeShippingApplied = orderData?.freeShippingApplied || false;
  const totalPrice = orderData?.totalPrice || 0;

  return (
    <div className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      {/* Header */}
      <div
        className={`sticky top-0 z-10 border-b ${
          isDarkMode ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"
        }`}
      >
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600" />
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
              className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${
                isDarkMode ? "bg-red-900/20" : "bg-red-100"
              }`}
            >
              <XCircle size={32} className="text-red-500" />
            </div>
            <h3
              className={`text-lg font-medium mb-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("failedToLoadOrder") || "Failed to load order"}
            </h3>
            <p
              className={`text-center mb-4 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {error}
            </p>
            <button
              onClick={loadOrderDetails}
              className="flex items-center space-x-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
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
                className={`rounded-lg border p-4 ${
                  isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center border border-indigo-200">
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
                  <StatusBadge status={overallStatus} />
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
            {orderItems.map((item) => {
              const itemStatus = getShipmentStatusFromItem(item);
              const totalAmount = item.price * item.quantity;

              return (
                <div
                  key={item.id}
                  className={`rounded-lg border p-4 ${
                    isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
                  }`}
                >
                  {/* Header Row */}
                  <div className="flex items-center space-x-3 mb-3">
                    <div
                      className={`w-12 h-12 rounded-lg flex items-center justify-center border overflow-hidden ${
                        isDarkMode ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      {item.productImage ? (
                        <Image
                          src={item.productImage}
                          alt={item.productName}
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package
                          size={20}
                          className={isDarkMode ? "text-gray-400" : "text-gray-500"}
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
                      <div className="px-2 py-0.5 bg-indigo-100 rounded text-[10px] font-semibold text-indigo-600 inline-block mt-1">
                        {t("soldBy") || "Sold by"} {item.sellerName}
                      </div>
                    </div>
                    <StatusBadge status={itemStatus} />
                  </div>

                  {/* Price Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="text-xs font-bold text-green-600">
                        {formatCurrency(item.price, item.currency)}
                      </div>
                      <div
                        className={`text-[11px] ${
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
                        className={`text-[10px] ${
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
                        {formatCurrency(totalAmount, item.currency)}
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Attributes */}
                  {item.selectedAttributes &&
                    Object.keys(item.selectedAttributes).length > 0 && (
                      <DynamicAttributesSection attributes={item.selectedAttributes} />
                    )}

                  {/* Legacy Variants (fallback if no selectedAttributes) */}
                  {!item.selectedAttributes &&
                    (item.selectedColor || item.selectedSize || item.selectedMetres) && (
                      <div className="flex flex-wrap gap-2 mt-3">
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
              );
            })}

            {/* Shipping Address */}
            {orderData?.address && (
              <div
                className={`rounded-lg border p-4 ${
                  isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center border border-green-200">
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
                className={`rounded-lg border p-4 ${
                  isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-center space-x-3 mb-3">
                  <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center border border-indigo-200">
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
                  {/* Subtotal */}
                  <SummaryRow
                    label={t("subtotal") || "Subtotal"}
                    value={formatCurrency(subtotal, orderData.currency)}
                  />

                  {/* Coupon Discount */}
                  {couponDiscount > 0 && (
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-1.5">
                        <Tag size={14} className="text-green-500" />
                        <span
                          className={`text-xs font-medium ${
                            isDarkMode ? "text-gray-400" : "text-gray-600"
                          }`}
                        >
                          {orderData.couponCode
                            ? `${t("coupon") || "Coupon"} (${orderData.couponCode})`
                            : t("couponDiscount") || "Coupon Discount"}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-green-500">
                        -{formatCurrency(couponDiscount, orderData.currency)}
                      </span>
                    </div>
                  )}

                  {/* Delivery */}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      {freeShippingApplied && (
                        <Gift size={14} className="text-green-500" />
                      )}
                      <span
                        className={`text-xs font-medium ${
                          isDarkMode ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {t("delivery") || "Delivery"}
                      </span>
                      <span
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: `${getDeliveryOptionColor(orderData.deliveryOption || "normal")}20`,
                          color: getDeliveryOptionColor(orderData.deliveryOption || "normal"),
                        }}
                      >
                        {localizeDeliveryOption(orderData.deliveryOption || "normal")}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      {freeShippingApplied && originalDeliveryPrice > 0 && (
                        <span
                          className={`text-[10px] line-through ${
                            isDarkMode ? "text-gray-500" : "text-gray-400"
                          }`}
                        >
                          {formatCurrency(originalDeliveryPrice, orderData.currency)}
                        </span>
                      )}
                      <span
                        className="text-xs font-semibold"
                        style={{
                          color:
                            deliveryPrice === 0
                              ? "#10B981"
                              : isDarkMode
                                ? "#FFFFFF"
                                : "#1A1A1A",
                        }}
                      >
                        {deliveryPrice === 0
                          ? t("free") || "Free"
                          : formatCurrency(deliveryPrice, orderData.currency)}
                      </span>
                    </div>
                  </div>

                  {/* Free Shipping Benefit Label */}
                  {freeShippingApplied && (
                    <div className="flex justify-end">
                      <span className="inline-flex items-center space-x-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 text-[10px] font-medium rounded">
                        <Check size={10} />
                        <span>{t("freeShippingBenefit") || "Free Shipping Benefit"}</span>
                      </span>
                    </div>
                  )}

                  <div className={`h-px ${isDarkMode ? "bg-gray-600" : "bg-gray-200"}`} />

                  {/* Total */}
                  <SummaryRow
                    label={t("total") || "Total"}
                    value={formatCurrency(totalPrice, orderData.currency)}
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