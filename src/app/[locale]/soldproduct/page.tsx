"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Package2,
  ArrowLeft,
  RefreshCw,
  Truck,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Ship,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  collectionGroup,
  Timestamp,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslations } from "next-intl";
import Image from "next/image";

// Types
interface SoldItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productImage: string;
  price: number;
  quantity: number;
  currency: string;
  buyerName: string;
  shipmentStatus: string;
  timestamp: Timestamp;
  selectedColor?: string;
  selectedSize?: string;
  shippedAt?: Timestamp;
}

const SHIPMENT_STATUSES = {
  pending: {
    color: "#D69E2E",
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

export default function SoldProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const { user, isLoading: authLoading } = useUser();
  const t = useTranslations("SoldProducts");

  // State
  const [soldItems, setSoldItems] = useState<SoldItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showShipmentDialog, setShowShipmentDialog] = useState<SoldItem | null>(
    null
  );

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

  // Redirect if not authenticated (only after auth state is determined)
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Load sold items when user changes
  useEffect(() => {
    if (user) {
      loadSoldItems();
    }
  }, [user, orderId]);

  // Build query based on whether we have an orderId
  const buildQuery = useCallback(() => {
    if (!user) return null;

    if (orderId) {
      // For specific order, query the items subcollection directly
      return query(
        collection(db, "orders", orderId, "items"),
        where("sellerId", "==", user.uid),
        where("shopId", "==", null), // Only products, not shop_products
        orderBy("timestamp", "desc")
      );
    } else {
      // For all sold products, use collectionGroup
      return query(
        collectionGroup(db, "items"),
        where("sellerId", "==", user.uid),
        where("shopId", "==", null), // Only products, not shop_products
        orderBy("timestamp", "desc")
      );
    }
  }, [user, orderId]);

  // Load sold items
  const loadSoldItems = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      const q = buildQuery();
      if (!q) return;

      const snapshot = await getDocs(q);
      const items: SoldItem[] = [];

      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          orderId: data.orderId || "",
          productId: data.productId || "",
          productName: data.productName || "",
          productImage: data.productImage || "",
          price: data.price || 0,
          quantity: data.quantity || 1,
          currency: data.currency || "TRY",
          buyerName: data.buyerName || "Unknown Buyer",
          shipmentStatus: data.shipmentStatus || "pending",
          timestamp: data.timestamp,
          selectedColor: data.selectedColor,
          selectedSize: data.selectedSize,
          shippedAt: data.shippedAt,
        });
      });

      setSoldItems(items);
    } catch (error) {
      console.error("Error loading sold items:", error);
      setError("Failed to load sold products");
    } finally {
      setLoading(false);
    }
  }, [user, buildQuery]);

  // Update shipment status
  const updateShipmentStatus = async (item: SoldItem) => {
    if (!user) return;

    setUpdating(item.id);
    try {
      // Find the specific item document
      const itemsQuery = query(
        collection(db, "orders", item.orderId, "items"),
        where("productId", "==", item.productId),
        where("sellerId", "==", user.uid)
      );

      const snapshot = await getDocs(itemsQuery);

      for (const docSnapshot of snapshot.docs) {
        await updateDoc(docSnapshot.ref, {
          shipmentStatus: "shipped",
          shippedAt: serverTimestamp(),
        });
      }

      // Update local state
      setSoldItems((prev) =>
        prev.map((soldItem) =>
          soldItem.id === item.id
            ? {
                ...soldItem,
                shipmentStatus: "shipped",
                shippedAt: Timestamp.now(),
              }
            : soldItem
        )
      );

      setShowShipmentDialog(null);

      // Show success message
      // Note: In a real app, you'd want to use a proper toast/notification system
      alert(
        t("shipmentStatusUpdated") || "Shipment status updated successfully!"
      );
    } catch (error) {
      console.error("Error updating shipment status:", error);
      alert(t("errorUpdatingStatus") || "Error updating status");
    } finally {
      setUpdating(null);
    }
  };

  // Format date
  const formatDate = (timestamp: Timestamp) => {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(timestamp.toDate());
  };

  // Format price
  const formatPrice = (price: number, currency: string) => {
    return (
      new Intl.NumberFormat("tr-TR").format(price) +
      " " +
      (currency === "TRY" ? "₺" : currency)
    );
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

  // Status Chip Component
  const StatusChip = ({ status }: { status: string }) => {
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

  // Action Button Component
  const ActionButton = ({ item }: { item: SoldItem }) => {
    const isUpdating = updating === item.id;
    const isPending = item.shipmentStatus.toLowerCase() === "pending";

    if (!isPending) {
      return (
        <div
          className={`
            px-3 py-1 rounded text-xs font-semibold
            ${
              isDarkMode
                ? "bg-gray-800 text-gray-400"
                : "bg-gray-100 text-gray-600"
            }
          `}
        >
          {t("completed") || "Completed"}
        </div>
      );
    }

    return (
      <button
        onClick={() => setShowShipmentDialog(item)}
        disabled={isUpdating}
        className="
          flex items-center space-x-1 px-3 py-1 bg-green-500 text-white rounded text-xs font-semibold
          hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors
        "
      >
        {isUpdating ? (
          <RefreshCw size={10} className="animate-spin" />
        ) : (
          <Ship size={10} />
        )}
        <span>{t("markAsShipped") || "Ship"}</span>
      </button>
    );
  };

  // Loading Skeleton
  const LoadingSkeleton = () => (
    <div className="space-y-4 p-4">
      {[...Array(5)].map((_, index) => (
        <div
          key={index}
          className={`
            animate-pulse rounded-lg border p-4
            ${
              isDarkMode
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-gray-200"
            }
          `}
        >
          <div className="flex items-center space-x-3 mb-3">
            <div
              className={`w-12 h-12 rounded-lg ${
                isDarkMode ? "bg-gray-700" : "bg-gray-300"
              }`}
            />
            <div className="flex-1 space-y-2">
              <div
                className={`h-4 rounded ${
                  isDarkMode ? "bg-gray-700" : "bg-gray-300"
                }`}
              />
              <div
                className={`h-3 rounded w-3/4 ${
                  isDarkMode ? "bg-gray-700" : "bg-gray-300"
                }`}
              />
            </div>
            <div
              className={`h-6 w-16 rounded-full ${
                isDarkMode ? "bg-gray-700" : "bg-gray-300"
              }`}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div
              className={`h-12 rounded ${
                isDarkMode ? "bg-gray-700" : "bg-gray-300"
              }`}
            />
            <div
              className={`h-12 rounded ${
                isDarkMode ? "bg-gray-700" : "bg-gray-300"
              }`}
            />
          </div>
          <div className="flex justify-between items-center">
            <div
              className={`h-3 w-24 rounded ${
                isDarkMode ? "bg-gray-700" : "bg-gray-300"
              }`}
            />
            <div
              className={`h-6 w-16 rounded ${
                isDarkMode ? "bg-gray-700" : "bg-gray-300"
              }`}
            />
          </div>
        </div>
      ))}
    </div>
  );

  // Shipment Dialog
  const ShipmentDialog = () => {
    if (!showShipmentDialog) return null;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div
          className={`
            w-full max-w-md rounded-xl p-6 shadow-2xl
            ${isDarkMode ? "bg-gray-800" : "bg-white"}
          `}
        >
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Truck size={24} className="text-green-500" />
            </div>

            <h3
              className={`text-lg font-bold mb-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("markAsShipped") || "Mark as Shipped"}
            </h3>

            <p
              className={`text-center mb-6 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {t("confirmShipmentMessage") ||
                "Are you sure you want to mark this product as shipped?"}
            </p>

            <div className="flex space-x-3 w-full">
              <button
                onClick={() => setShowShipmentDialog(null)}
                className={`
                  flex-1 py-2 px-4 rounded-lg border transition-colors
                  ${
                    isDarkMode
                      ? "border-gray-600 text-gray-300 hover:bg-gray-700"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }
                `}
              >
                {t("cancel") || "Cancel"}
              </button>

              <button
                onClick={() => updateShipmentStatus(showShipmentDialog)}
                disabled={updating === showShipmentDialog.id}
                className="
                  flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg
                  bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed
                  transition-colors
                "
              >
                {updating === showShipmentDialog.id ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <>
                    <CheckCircle size={16} />
                    <span>{t("confirm") || "Confirm"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Show loading while auth state is being determined
  if (authLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        <RefreshCw size={32} className="animate-spin text-green-500" />
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
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
          <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-green-600" />

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
                  {orderId
                    ? t("orderDetails") || "Order Details"
                    : t("soldProducts") || "Sold Products"}
                </h1>
                {orderId && (
                  <p className="text-green-100 text-sm mt-1">
                    {t("orderNumber") || "Order"} #{orderId.slice(-8)}
                  </p>
                )}
              </div>

              <div className="p-3 rounded-xl bg-white/10 backdrop-blur-sm">
                <Package2 size={20} className="text-white" />
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
              {t("errorTitle") || "Something went wrong"}
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
              onClick={loadSoldItems}
              className="
                flex items-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-lg
                hover:bg-green-600 transition-colors
              "
            >
              <RefreshCw size={16} />
              <span>{t("retry") || "Retry"}</span>
            </button>
          </div>
        ) : loading ? (
          <LoadingSkeleton />
        ) : soldItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className={`
                w-24 h-24 rounded-full flex items-center justify-center mb-6
                ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
              `}
            >
              <Package2
                size={32}
                className={isDarkMode ? "text-gray-400" : "text-gray-500"}
              />
            </div>
            <h3
              className={`
                text-lg font-medium mb-2
                ${isDarkMode ? "text-white" : "text-gray-900"}
              `}
            >
              {orderId
                ? t("noItemsInThisOrder") || "No Items in This Order"
                : t("noSoldProductsYet") || "No Sold Products Yet"}
            </h3>
            <p
              className={`
                text-center
                ${isDarkMode ? "text-gray-400" : "text-gray-600"}
              `}
            >
              {orderId
                ? t("orderItemsWillAppearHere") ||
                  "Order items will appear here"
                : t("soldProductsWillAppearHere") ||
                  "Sold products will appear here"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {soldItems.map((item) => (
              <div
                key={item.id}
                className={`
                  rounded-lg border p-4 transition-shadow hover:shadow-md
                  ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-200"
                  }
                `}
              >
                {/* Header Row */}
                <div className="flex items-center space-x-3 mb-3">
                  {/* Product Image */}
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
                      <Package2
                        size={20}
                        className={
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }
                      />
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <h4
                      className={`font-semibold text-sm line-clamp-1 ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {item.productName}
                    </h4>
                    <p
                      className={`text-xs ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {t("productSale") || "Product Sale"}
                    </p>
                  </div>

                  {/* Status */}
                  <StatusChip status={item.shipmentStatus} />
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {/* Price & Quantity */}
                  <div className="p-2 bg-green-50 rounded-lg">
                    <div className="text-xs font-bold text-green-600">
                      {formatPrice(item.price, item.currency)}
                    </div>
                    <div
                      className={`text-xs ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {t("qty") || "Qty"}: {item.quantity}
                    </div>
                  </div>

                  {/* Buyer */}
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
                      {t("buyer") || "Buyer"}
                    </div>
                    <div
                      className={`text-xs font-semibold line-clamp-1 ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {item.buyerName}
                    </div>
                  </div>
                </div>

                {/* Variants & Date */}
                {(item.selectedColor ||
                  item.selectedSize ||
                  item.timestamp) && (
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex space-x-2">
                      {item.selectedColor && (
                        <span className="px-2 py-1 bg-green-100 text-green-600 text-xs font-semibold rounded">
                          {item.selectedColor}
                        </span>
                      )}
                      {item.selectedSize && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-600 text-xs font-semibold rounded">
                          {item.selectedSize}
                        </span>
                      )}
                    </div>
                    {item.timestamp && (
                      <span
                        className={`text-xs ${
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {formatDate(item.timestamp)}
                      </span>
                    )}
                  </div>
                )}

                {/* Action Row */}
                <div className="flex justify-between items-center">
                  <div
                    className={`text-xs font-semibold ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("total") || "Total"}:{" "}
                    {formatPrice(item.price * item.quantity, item.currency)}
                  </div>
                  <ActionButton item={item} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shipment Dialog */}
      <ShipmentDialog />
    </div>
  );
}
