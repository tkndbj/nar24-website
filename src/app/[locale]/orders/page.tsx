"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Calendar,
  Package,
  ShoppingCart,
  RefreshCw,
  X,
  ChevronRight,
  Clock,
  UserCheck,
  Truck,
  Warehouse,
  Bike,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import {
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  collectionGroup,
  Timestamp,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslations } from "next-intl";
import Image from "next/image";

type BuyerShipmentStatus = 
  | "pending"
  | "collecting"
  | "inTransit"
  | "atWarehouse"
  | "outForDelivery"
  | "delivered"
  | "failed";

// Helper function to determine shipment status from data
const getShipmentStatus = (data: Record<string, unknown>): BuyerShipmentStatus => {
  const gatheringStatus = data.gatheringStatus as string | undefined;
  
  // Check for failures first
  if (gatheringStatus === "failed") {
    return "failed";
  }
  
  // Check if item was delivered
  const deliveredInPartial = (data.deliveredInPartial as boolean) ?? false;
  const deliveryStatus = data.deliveryStatus as string | undefined;
  
  if (
    gatheringStatus === "delivered" ||
    deliveredInPartial ||
    deliveryStatus === "delivered"
  ) {
    return "delivered";
  }
  
  // Check gathering status
  switch (gatheringStatus) {
    case "at_warehouse":
      return "atWarehouse";
    case "gathered":
      return "inTransit";
    case "assigned":
      return "collecting";
    case "pending":
    default:
      return "pending";
  }
};

// Get status color classes
const getStatusColor = (status: BuyerShipmentStatus): { bg: string; text: string; border: string } => {
  switch (status) {
    case "pending":
      return { bg: "bg-gray-100 dark:bg-gray-700", text: "text-gray-600 dark:text-gray-300", border: "border-gray-300 dark:border-gray-600" };
    case "collecting":
      return { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-600 dark:text-orange-400", border: "border-orange-300 dark:border-orange-700" };
    case "inTransit":
      return { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-600 dark:text-blue-400", border: "border-blue-300 dark:border-blue-700" };
    case "atWarehouse":
      return { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-600 dark:text-purple-400", border: "border-purple-300 dark:border-purple-700" };
    case "outForDelivery":
      return { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-300 dark:border-indigo-700" };
    case "delivered":
      return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-600 dark:text-green-400", border: "border-green-300 dark:border-green-700" };
    case "failed":
      return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-600 dark:text-red-400", border: "border-red-300 dark:border-red-700" };
  }
};

const getStatusIcon = (status: BuyerShipmentStatus) => {
  switch (status) {
    case "pending":
      return Clock;
    case "collecting":
      return UserCheck;
    case "inTransit":
      return Truck;
    case "atWarehouse":
      return Warehouse;
    case "outForDelivery":
      return Bike;
    case "delivered":
      return CheckCircle2;
    case "failed":
      return XCircle;
  }
};

// Types
interface Transaction {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  selectedColor?: string;
  selectedColorImage?: string;
  brandModel?: string;
  price: number;
  currency: string;
  averageRating?: number;
  sellerId: string;
  shopId?: string;
  orderId: string;
  timestamp: Timestamp;
  isShopProduct: boolean;
  gatheringStatus?: string;
  deliveredInPartial?: boolean;
  deliveryStatus?: string;
}

interface FilterOptions {
  dateRange?: { start: Date; end: Date };
  searchQuery: string;
}

type OrderTab = "sold" | "bought";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_DELAY = 300;
const SCROLL_THROTTLE_DELAY = 100;

export default function OrdersPage() {
  const router = useRouter();
  const { user } = useUser();
  const t = useTranslations("Orders");

  // State
  const [activeTab, setActiveTab] = useState<OrderTab>("sold");
  const [filters, setFilters] = useState<FilterOptions>({ searchQuery: "" });
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Sold orders state
  const [soldOrders, setSoldOrders] = useState<Transaction[]>([]);
  const [soldLoading, setSoldLoading] = useState(false);
  const [soldHasMore, setSoldHasMore] = useState(true);
  const [soldLastDoc, setSoldLastDoc] = useState<QueryDocumentSnapshot | null>(
    null
  );
  const [soldInitialLoading, setSoldInitialLoading] = useState(true);

  // Bought orders state
  const [boughtOrders, setBoughtOrders] = useState<Transaction[]>([]);
  const [boughtLoading, setBoughtLoading] = useState(false);
  const [boughtHasMore, setBoughtHasMore] = useState(true);
  const [boughtLastDoc, setBoughtLastDoc] =
    useState<QueryDocumentSnapshot | null>(null);
  const [boughtInitialLoading, setBoughtInitialLoading] = useState(true);

  // Search state
  const [searchValue, setSearchValue] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Refs
  const soldScrollRef = useRef<HTMLDivElement>(null);
  const boughtScrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const scrollThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const prevFilters = useRef(filters);

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

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  // Load initial data when user changes
  useEffect(() => {
    if (user) {
      resetPaginationState();
      loadSoldOrders(true);
      loadBoughtOrders(true);
    }
  }, [user]);

  // Apply filters when they change
  useEffect(() => {
    if (user) {
      const filtersChanged =
        JSON.stringify(filters) !== JSON.stringify(prevFilters.current);
      if (filtersChanged) {
        resetPaginationState();
        loadSoldOrders(true);
        loadBoughtOrders(true);
        prevFilters.current = filters;
      }
    }
  }, [filters, user]);

  // Search debounce
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      setFilters((prev) => ({
        ...prev,
        searchQuery: searchValue.trim().toLowerCase(),
      }));
    }, SEARCH_DEBOUNCE_DELAY);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchValue]);

  // Helper function to reset pagination state
  const resetPaginationState = () => {
    setSoldOrders([]);
    setBoughtOrders([]);
    setSoldLastDoc(null);
    setBoughtLastDoc(null);
    setSoldHasMore(true);
    setBoughtHasMore(true);
    setError(null);
  };

  // Infinite scroll handlers
  const handleSoldScroll = useCallback(() => {
    if (scrollThrottleRef.current) return;

    scrollThrottleRef.current = setTimeout(() => {
      const container = soldScrollRef.current;
      if (!container || soldLoading || !soldHasMore) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop <= clientHeight + 200) {
        loadSoldOrders(false);
      }
      scrollThrottleRef.current = null;
    }, SCROLL_THROTTLE_DELAY);
  }, [soldLoading, soldHasMore]);

  const handleBoughtScroll = useCallback(() => {
    if (scrollThrottleRef.current) return;

    scrollThrottleRef.current = setTimeout(() => {
      const container = boughtScrollRef.current;
      if (!container || boughtLoading || !boughtHasMore) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop <= clientHeight + 200) {
        loadBoughtOrders(false);
      }
      scrollThrottleRef.current = null;
    }, SCROLL_THROTTLE_DELAY);
  }, [boughtLoading, boughtHasMore]);

  // Load sold orders
  const loadSoldOrders = useCallback(
    async (reset = false) => {
      if (!user || soldLoading) return;
      if (!reset && !soldHasMore) return;

      setSoldLoading(true);
      if (reset) setSoldInitialLoading(true);

      try {
        let q = query(
          collectionGroup(db, "items"),
          where("sellerId", "==", user.uid),
          where("shopId", "==", null) // Only non-shop products
        );

        // Apply date filter
        if (filters.dateRange) {
          q = query(
            q,
            where(
              "timestamp",
              ">=",
              Timestamp.fromDate(filters.dateRange.start)
            ),
            where("timestamp", "<=", Timestamp.fromDate(filters.dateRange.end))
          );
        }

        q = query(q, orderBy("timestamp", "desc"), limit(PAGE_SIZE));

        if (!reset && soldLastDoc) {
          q = query(q, startAfter(soldLastDoc));
        }

        const snapshot = await getDocs(q);
        const newOrders: Transaction[] = [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data();

          // Apply search filter client-side
          const productName = (data.productName || "").toLowerCase();
          const brandModel = (data.brandModel || "").toLowerCase();
          const selectedColor = (data.selectedColor || "").toLowerCase();

          const matchesSearch =
            !filters.searchQuery ||
            productName.includes(filters.searchQuery) ||
            brandModel.includes(filters.searchQuery) ||
            selectedColor.includes(filters.searchQuery);

          if (matchesSearch) {
            newOrders.push({
              id: doc.id,
              productId: data.productId || "",
              productName: data.productName || "",
              productImage: data.productImage || "",
              selectedColor: data.selectedColor,
              selectedColorImage: data.selectedColorImage,
              brandModel: data.brandModel || "",
              price: data.price || 0,
              currency: data.currency || "TRY",
              averageRating: data.averageRating || 0,
              sellerId: data.sellerId || "",
              shopId: data.shopId,
              orderId: data.orderId || "",
              timestamp: data.timestamp,
              isShopProduct: false,
              gatheringStatus: data.gatheringStatus as string | undefined,
              deliveredInPartial: data.deliveredInPartial as boolean | undefined,
              deliveryStatus: data.deliveryStatus as string | undefined,
            });
          }
        });

        const hasMore = newOrders.length === PAGE_SIZE;
        setSoldHasMore(hasMore);

        if (reset) {
          setSoldOrders(newOrders);
        } else {
          setSoldOrders((prev) => {
            const combined = [...prev, ...newOrders];
            const uniqueMap = new Map();
            combined.forEach((order) => uniqueMap.set(order.id, order));
            return Array.from(uniqueMap.values());
          });
        }

        if (newOrders.length > 0) {
          setSoldLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        } else if (reset) {
          setSoldLastDoc(null);
        }

        setError(null);
      } catch (error) {
        console.error("Error loading sold orders:", error);
        setError("Failed to load sold orders");
      } finally {
        setSoldLoading(false);
        if (reset) setSoldInitialLoading(false);
      }
    },
    [user, filters, soldLoading, soldLastDoc, soldHasMore]
  );

  const ShipmentStatusBadge = ({ transaction }: { transaction: Transaction }) => {
    const status = getShipmentStatus({
      gatheringStatus: transaction.gatheringStatus,
      deliveredInPartial: transaction.deliveredInPartial,
      deliveryStatus: transaction.deliveryStatus,
    });
    
    const colors = getStatusColor(status);
    const StatusIcon = getStatusIcon(status);
    
    // Get localized status text
    const getStatusText = (status: BuyerShipmentStatus): string => {
      switch (status) {
        case "pending":
          return t("shipmentPending") || "Pending";
        case "collecting":
          return t("shipmentCollecting") || "Collecting";
        case "inTransit":
          return t("shipmentInTransit") || "In Transit";
        case "atWarehouse":
          return t("shipmentAtWarehouse") || "At Warehouse";
        case "outForDelivery":
          return t("shipmentOutForDelivery") || "Out for Delivery";
        case "delivered":
          return t("shipmentDelivered") || "Delivered";
        case "failed":
          return t("shipmentFailed") || "Failed";
      }
    };
    
    return (
      <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}>
        <StatusIcon size={12} />
        <span>{getStatusText(status)}</span>
      </div>
    );
  };

  // Load bought orders
  const loadBoughtOrders = useCallback(
    async (reset = false) => {
      if (!user || boughtLoading) return;
      if (!reset && !boughtHasMore) return;

      setBoughtLoading(true);
      if (reset) setBoughtInitialLoading(true);

      try {
        let q = query(
          collectionGroup(db, "items"),
          where("buyerId", "==", user.uid)
        );

        // Apply date filter
        if (filters.dateRange) {
          q = query(
            q,
            where(
              "timestamp",
              ">=",
              Timestamp.fromDate(filters.dateRange.start)
            ),
            where("timestamp", "<=", Timestamp.fromDate(filters.dateRange.end))
          );
        }

        q = query(q, orderBy("timestamp", "desc"), limit(PAGE_SIZE));

        if (!reset && boughtLastDoc) {
          q = query(q, startAfter(boughtLastDoc));
        }

        const snapshot = await getDocs(q);
        const newOrders: Transaction[] = [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data();

          // Apply search filter client-side
          const productName = (data.productName || "").toLowerCase();
          const brandModel = (data.brandModel || "").toLowerCase();
          const selectedColor = (data.selectedColor || "").toLowerCase();

          const matchesSearch =
            !filters.searchQuery ||
            productName.includes(filters.searchQuery) ||
            brandModel.includes(filters.searchQuery) ||
            selectedColor.includes(filters.searchQuery);

          if (matchesSearch) {
            newOrders.push({
              id: doc.id,
              productId: data.productId || "",
              productName: data.productName || "",
              productImage: data.productImage || "",
              selectedColor: data.selectedColor,
              selectedColorImage: data.selectedColorImage,
              brandModel: data.brandModel || "",
              price: data.price || 0,
              currency: data.currency || "TRY",
              averageRating: data.averageRating || 0,
              sellerId: data.sellerId || "",
              shopId: data.shopId,
              orderId: data.orderId || "",
              timestamp: data.timestamp,
              isShopProduct: !!data.shopId,
              gatheringStatus: data.gatheringStatus as string | undefined,
              deliveredInPartial: data.deliveredInPartial as boolean | undefined,
              deliveryStatus: data.deliveryStatus as string | undefined,
            });
          }
        });

        const hasMore = newOrders.length === PAGE_SIZE;
        setBoughtHasMore(hasMore);

        if (reset) {
          setBoughtOrders(newOrders);
        } else {
          setBoughtOrders((prev) => {
            const combined = [...prev, ...newOrders];
            const uniqueMap = new Map();
            combined.forEach((order) => uniqueMap.set(order.id, order));
            return Array.from(uniqueMap.values());
          });
        }

        if (newOrders.length > 0) {
          setBoughtLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        } else if (reset) {
          setBoughtLastDoc(null);
        }

        setError(null);
      } catch (error) {
        console.error("Error loading bought orders:", error);
        setError("Failed to load bought orders");
      } finally {
        setBoughtLoading(false);
        if (reset) setBoughtInitialLoading(false);
      }
    },
    [user, filters, boughtLoading, boughtLastDoc, boughtHasMore]
  );

  // Clear search
  const clearSearch = () => {
    setSearchValue("");
    setFilters((prev) => ({ ...prev, searchQuery: "" }));
    searchInputRef.current?.blur();
  };

  // Dismiss keyboard
  const dismissKeyboard = () => {
    if (isSearchFocused) {
      searchInputRef.current?.blur();
      setIsSearchFocused(false);
    }
  };

  // Handle transaction tap
  const handleTransactionTap = (transaction: Transaction) => {
    const orderId = transaction.orderId;
    if (!orderId) {
      alert("Unable to find order details");
      return;
    }

    if (activeTab === "sold") {
      router.push(`/soldproduct?orderId=${orderId}`);
    } else {
      router.push(`/boughtproduct?orderId=${orderId}`);
    }
  };

  // Format date
  const formatDate = (timestamp: Timestamp) => {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(timestamp.toDate());
  };

  // Get orders for current tab
  const getCurrentOrders = () =>
    activeTab === "sold" ? soldOrders : boughtOrders;
  const getCurrentLoading = () =>
    activeTab === "sold" ? soldLoading : boughtLoading;
  const getCurrentInitialLoading = () =>
    activeTab === "sold" ? soldInitialLoading : boughtInitialLoading;

 // Product Card Component
const ProductCard = ({ transaction, showStatus = false }: { transaction: Transaction; showStatus?: boolean }) => {
  const imageUrl =
    transaction.selectedColorImage ||
    transaction.productImage ||
    "/placeholder-product.png";

  return (
    <div className="flex space-x-3">
      <div className="flex flex-col items-center">
        <div className="relative w-16 h-16 flex-shrink-0">
          <Image
            src={imageUrl}
            alt={transaction.productName}
            fill
            className="object-cover rounded-lg"
          />
        </div>
        {/* Shipment status badge under image for bought products */}
        {showStatus && (
          <div className="mt-2">
            <ShipmentStatusBadge transaction={transaction} />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h4
          className={`font-medium text-sm line-clamp-2 ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {transaction.productName}
        </h4>
        {transaction.selectedColor && (
          <p
            className={`text-xs mt-1 ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {t("color")}: {transaction.selectedColor}
          </p>
        )}
        <div className="flex items-center space-x-2 mt-1">
          <span
            className={`font-bold text-sm ${
              isDarkMode ? "text-green-400" : "text-green-600"
            }`}
          >
            {transaction.currency === "TL" ? "₺" : "₺"}
            {transaction.price.toLocaleString()}
          </span>
          {(transaction.averageRating ?? 0) > 0 && (
            <div className="flex items-center space-x-1">
              <span className="text-yellow-400">★</span>
              <span
                className={`text-xs ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {(transaction.averageRating ?? 0).toFixed(1)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

  // Loading Skeleton
  const LoadingSkeleton = () => (
    <div className="space-y-4">
      {[...Array(6)].map((_, index) => (
        <div
          key={index}
          className={`animate-pulse rounded-lg border p-4 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
          }`}
        >
          <div className="flex space-x-3">
            <div
              className={`w-16 h-16 rounded-lg ${
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
              <div
                className={`h-3 rounded w-1/2 ${
                  isDarkMode ? "bg-gray-700" : "bg-gray-300"
                }`}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  if (!user) {
    return null; // Will redirect to login
  }

  const currentOrders = getCurrentOrders();
  const currentLoading = getCurrentLoading();
  const currentInitialLoading = getCurrentInitialLoading();

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      onClick={dismissKeyboard}
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1
              className={`
              text-xl font-bold
              ${isDarkMode ? "text-white" : "text-gray-900"}
            `}
            >
              {t("title") || "My Orders"}
            </h1>
            <button
              className={`
                p-2 rounded-lg transition-colors
                ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                    : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                }
              `}
            >
              <Calendar size={20} />
            </button>
          </div>

          {/* Search Box */}
          <div
            className={`
            mt-4 p-3 rounded-lg
            ${isDarkMode ? "bg-black/20" : "bg-white/80"}
          `}
          >
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search
                  size={18}
                  className={isDarkMode ? "text-gray-400" : "text-gray-600"}
                />
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    dismissKeyboard();
                  }
                }}
                placeholder={t("searchProducts") || "Search products..."}
                className={`
                  w-full pl-10 pr-10 py-2 rounded-lg border
                  ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700 text-white placeholder-gray-400 focus:border-teal-400"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-teal-500"
                  }
                  focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-colors
                `}
              />
              {searchValue && (
                <button
                  onClick={clearSearch}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <X
                    size={18}
                    className={isDarkMode ? "text-gray-400" : "text-gray-600"}
                  />
                </button>
              )}
            </div>
          </div>

          {/* Tab Bar */}
          <div
            className={`
            mt-4 p-1 rounded-lg
            ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
          `}
          >
            <div className="flex">
              {(["sold", "bought"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    dismissKeyboard();
                  }}
                  className={`
                    flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200
                    ${
                      activeTab === tab
                        ? "bg-green-500 text-white shadow-lg"
                        : isDarkMode
                        ? "text-gray-400 hover:text-white hover:bg-gray-700"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                    }
                  `}
                >
                  {tab === "sold" ? (
                    <>
                      <Package size={16} />
                      <span>{t("soldProducts") || "Sold Products"}</span>
                    </>
                  ) : (
                    <>
                      <ShoppingCart size={16} />
                      <span>{t("boughtProducts") || "Bought Products"}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className={`
              w-24 h-24 rounded-full flex items-center justify-center mb-6
              ${isDarkMode ? "bg-red-900/20" : "bg-red-100"}
            `}
            >
              <X size={32} className="text-red-500" />
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
              onClick={() => {
                setError(null);
                if (activeTab === "sold") {
                  loadSoldOrders(true);
                } else {
                  loadBoughtOrders(true);
                }
              }}
              className="
                px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors
              "
            >
              {t("retry") || "Retry"}
            </button>
          </div>
        ) : currentInitialLoading ? (
          <LoadingSkeleton />
        ) : currentOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className={`
              w-24 h-24 rounded-full flex items-center justify-center mb-6
              ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
            `}
            >
              {activeTab === "sold" ? (
                <Package
                  size={32}
                  className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                />
              ) : (
                <ShoppingCart
                  size={32}
                  className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                />
              )}
            </div>
            <h3
              className={`
              text-lg font-medium mb-2
              ${isDarkMode ? "text-white" : "text-gray-900"}
            `}
            >
              {filters.searchQuery
                ? `${t("noResultsFound") || "No results found"} "${
                    filters.searchQuery
                  }"`
                : activeTab === "sold"
                ? t("noSoldProducts") || "No Sold Products"
                : t("noBoughtProducts") || "No Bought Products"}
            </h3>
            <p
              className={`
              text-center
              ${isDarkMode ? "text-gray-400" : "text-gray-600"}
            `}
            >
              {filters.searchQuery
                ? t("tryDifferentKeywords") ||
                  "Try searching with different keywords"
                : activeTab === "sold"
                ? t("noSoldProductsDesc") || "You haven't sold any products yet"
                : t("noBoughtProductsDesc") ||
                  "You haven't bought any products yet"}
            </p>
          </div>
        ) : (
          <div
            ref={activeTab === "sold" ? soldScrollRef : boughtScrollRef}
            onScroll={
              activeTab === "sold" ? handleSoldScroll : handleBoughtScroll
            }
            className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto"
          >
            {currentOrders.map((transaction, index) => (
              <div
                key={`${activeTab}-${transaction.id}-${index}`}
                className={`
                  rounded-lg border p-4 cursor-pointer transition-all duration-200 hover:shadow-md
                  ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700 hover:border-gray-600"
                      : "bg-white border-gray-200 hover:border-gray-300"
                  }
                `}
                onClick={() => handleTransactionTap(transaction)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                  <ProductCard 
  transaction={transaction} 
  showStatus={activeTab === "bought"}  // Show status only for bought products
/>
                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className={`
                        text-xs
                        ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                      `}
                      >
                        {formatDate(transaction.timestamp)}
                      </span>
                      {transaction.orderId && (
                        <span
                          className={`
                          text-xs px-2 py-1 rounded
                          ${
                            isDarkMode
                              ? "bg-gray-700 text-gray-300"
                              : "bg-gray-100 text-gray-600"
                          }
                        `}
                        >
                          #{transaction.orderId.slice(-8)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-4">
                    <ChevronRight size={20} className="text-green-500" />
                  </div>
                </div>
              </div>
            ))}

            {currentLoading && (
              <div className="flex justify-center py-4">
                <RefreshCw size={24} className="animate-spin text-green-500" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
