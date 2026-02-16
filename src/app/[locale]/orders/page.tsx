"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Package,
  ShoppingCart,
  X,
  ChevronRight,
  Clock,
  UserCheck,
  Truck,
  Warehouse,
  Bike,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Star,
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

const getShipmentStatus = (
  data: Record<string, unknown>,
): BuyerShipmentStatus => {
  const gatheringStatus = data.gatheringStatus as string | undefined;
  if (gatheringStatus === "failed") return "failed";
  const deliveredInPartial = (data.deliveredInPartial as boolean) ?? false;
  const deliveryStatus = data.deliveryStatus as string | undefined;
  if (
    gatheringStatus === "delivered" ||
    deliveredInPartial ||
    deliveryStatus === "delivered"
  )
    return "delivered";
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

const getStatusColor = (
  status: BuyerShipmentStatus,
): { bg: string; text: string; border: string } => {
  switch (status) {
    case "pending":
      return {
        bg: "bg-gray-100 dark:bg-gray-700",
        text: "text-gray-600 dark:text-gray-300",
        border: "border-gray-200 dark:border-gray-600",
      };
    case "collecting":
      return {
        bg: "bg-orange-50 dark:bg-orange-900/30",
        text: "text-orange-600 dark:text-orange-400",
        border: "border-orange-200 dark:border-orange-700",
      };
    case "inTransit":
      return {
        bg: "bg-blue-50 dark:bg-blue-900/30",
        text: "text-blue-600 dark:text-blue-400",
        border: "border-blue-200 dark:border-blue-700",
      };
    case "atWarehouse":
      return {
        bg: "bg-purple-50 dark:bg-purple-900/30",
        text: "text-purple-600 dark:text-purple-400",
        border: "border-purple-200 dark:border-purple-700",
      };
    case "outForDelivery":
      return {
        bg: "bg-indigo-50 dark:bg-indigo-900/30",
        text: "text-indigo-600 dark:text-indigo-400",
        border: "border-indigo-200 dark:border-indigo-700",
      };
    case "delivered":
      return {
        bg: "bg-green-50 dark:bg-green-900/30",
        text: "text-green-600 dark:text-green-400",
        border: "border-green-200 dark:border-green-700",
      };
    case "failed":
      return {
        bg: "bg-red-50 dark:bg-red-900/30",
        text: "text-red-600 dark:text-red-400",
        border: "border-red-200 dark:border-red-700",
      };
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
  const { user, isLoading: authLoading } = useUser();
  const t = useTranslations("Orders");

  const [activeTab, setActiveTab] = useState<OrderTab>("sold");
  const [filters, setFilters] = useState<FilterOptions>({ searchQuery: "" });
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [soldOrders, setSoldOrders] = useState<Transaction[]>([]);
  const [soldLoading, setSoldLoading] = useState(false);
  const [soldHasMore, setSoldHasMore] = useState(true);
  const [soldLastDoc, setSoldLastDoc] = useState<QueryDocumentSnapshot | null>(
    null,
  );
  const [soldInitialLoading, setSoldInitialLoading] = useState(true);

  const [boughtOrders, setBoughtOrders] = useState<Transaction[]>([]);
  const [boughtLoading, setBoughtLoading] = useState(false);
  const [boughtHasMore, setBoughtHasMore] = useState(true);
  const [boughtLastDoc, setBoughtLastDoc] =
    useState<QueryDocumentSnapshot | null>(null);
  const [boughtInitialLoading, setBoughtInitialLoading] = useState(true);

  const [searchValue, setSearchValue] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const soldScrollRef = useRef<HTMLDivElement>(null);
  const boughtScrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const scrollThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const prevFilters = useRef(filters);

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
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      resetPaginationState();
      loadSoldOrders(true);
      loadBoughtOrders(true);
    }
  }, [user]);

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

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setFilters((prev) => ({
        ...prev,
        searchQuery: searchValue.trim().toLowerCase(),
      }));
    }, SEARCH_DEBOUNCE_DELAY);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchValue]);

  const resetPaginationState = () => {
    setSoldOrders([]);
    setBoughtOrders([]);
    setSoldLastDoc(null);
    setBoughtLastDoc(null);
    setSoldHasMore(true);
    setBoughtHasMore(true);
    setError(null);
  };

  const handleSoldScroll = useCallback(() => {
    if (scrollThrottleRef.current) return;
    scrollThrottleRef.current = setTimeout(() => {
      const container = soldScrollRef.current;
      if (!container || soldLoading || !soldHasMore) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop <= clientHeight + 200) loadSoldOrders(false);
      scrollThrottleRef.current = null;
    }, SCROLL_THROTTLE_DELAY);
  }, [soldLoading, soldHasMore]);

  const handleBoughtScroll = useCallback(() => {
    if (scrollThrottleRef.current) return;
    scrollThrottleRef.current = setTimeout(() => {
      const container = boughtScrollRef.current;
      if (!container || boughtLoading || !boughtHasMore) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop <= clientHeight + 200)
        loadBoughtOrders(false);
      scrollThrottleRef.current = null;
    }, SCROLL_THROTTLE_DELAY);
  }, [boughtLoading, boughtHasMore]);

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
          where("shopId", "==", null),
        );
        if (filters.dateRange) {
          q = query(
            q,
            where(
              "timestamp",
              ">=",
              Timestamp.fromDate(filters.dateRange.start),
            ),
            where("timestamp", "<=", Timestamp.fromDate(filters.dateRange.end)),
          );
        }
        q = query(q, orderBy("timestamp", "desc"), limit(PAGE_SIZE));
        if (!reset && soldLastDoc) q = query(q, startAfter(soldLastDoc));
        const snapshot = await getDocs(q);
        const newOrders: Transaction[] = [];
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
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
              deliveredInPartial: data.deliveredInPartial as
                | boolean
                | undefined,
              deliveryStatus: data.deliveryStatus as string | undefined,
            });
          }
        });
        setSoldHasMore(newOrders.length === PAGE_SIZE);
        if (reset) {
          setSoldOrders(newOrders);
        } else {
          setSoldOrders((prev) => {
            const combined = [...prev, ...newOrders];
            const uniqueMap = new Map();
            combined.forEach((o) => uniqueMap.set(o.id, o));
            return Array.from(uniqueMap.values());
          });
        }
        if (newOrders.length > 0)
          setSoldLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        else if (reset) setSoldLastDoc(null);
        setError(null);
      } catch (error) {
        console.error("Error loading sold orders:", error);
        setError("Failed to load sold orders");
      } finally {
        setSoldLoading(false);
        if (reset) setSoldInitialLoading(false);
      }
    },
    [user, filters, soldLoading, soldLastDoc, soldHasMore],
  );

  const loadBoughtOrders = useCallback(
    async (reset = false) => {
      if (!user || boughtLoading) return;
      if (!reset && !boughtHasMore) return;
      setBoughtLoading(true);
      if (reset) setBoughtInitialLoading(true);
      try {
        let q = query(
          collectionGroup(db, "items"),
          where("buyerId", "==", user.uid),
        );
        if (filters.dateRange) {
          q = query(
            q,
            where(
              "timestamp",
              ">=",
              Timestamp.fromDate(filters.dateRange.start),
            ),
            where("timestamp", "<=", Timestamp.fromDate(filters.dateRange.end)),
          );
        }
        q = query(q, orderBy("timestamp", "desc"), limit(PAGE_SIZE));
        if (!reset && boughtLastDoc) q = query(q, startAfter(boughtLastDoc));
        const snapshot = await getDocs(q);
        const newOrders: Transaction[] = [];
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
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
              deliveredInPartial: data.deliveredInPartial as
                | boolean
                | undefined,
              deliveryStatus: data.deliveryStatus as string | undefined,
            });
          }
        });
        setBoughtHasMore(newOrders.length === PAGE_SIZE);
        if (reset) {
          setBoughtOrders(newOrders);
        } else {
          setBoughtOrders((prev) => {
            const combined = [...prev, ...newOrders];
            const uniqueMap = new Map();
            combined.forEach((o) => uniqueMap.set(o.id, o));
            return Array.from(uniqueMap.values());
          });
        }
        if (newOrders.length > 0)
          setBoughtLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        else if (reset) setBoughtLastDoc(null);
        setError(null);
      } catch (error) {
        console.error("Error loading bought orders:", error);
        setError("Failed to load bought orders");
      } finally {
        setBoughtLoading(false);
        if (reset) setBoughtInitialLoading(false);
      }
    },
    [user, filters, boughtLoading, boughtLastDoc, boughtHasMore],
  );

  const clearSearch = () => {
    setSearchValue("");
    setFilters((prev) => ({ ...prev, searchQuery: "" }));
    searchInputRef.current?.blur();
  };

  const dismissKeyboard = () => {
    if (isSearchFocused) {
      searchInputRef.current?.blur();
      setIsSearchFocused(false);
    }
  };

  const handleTransactionTap = (transaction: Transaction) => {
    const orderId = transaction.orderId;
    if (!orderId) {
      alert("Unable to find order details");
      return;
    }
    if (activeTab === "sold") router.push(`/soldproduct?orderId=${orderId}`);
    else router.push(`/boughtproduct?orderId=${orderId}`);
  };

  const getCurrentOrders = () =>
    activeTab === "sold" ? soldOrders : boughtOrders;
  const getCurrentLoading = () =>
    activeTab === "sold" ? soldLoading : boughtLoading;
  const getCurrentInitialLoading = () =>
    activeTab === "sold" ? soldInitialLoading : boughtInitialLoading;

  const ShipmentStatusBadge = ({
    transaction,
  }: {
    transaction: Transaction;
  }) => {
    const status = getShipmentStatus({
      gatheringStatus: transaction.gatheringStatus,
      deliveredInPartial: transaction.deliveredInPartial,
      deliveryStatus: transaction.deliveryStatus,
    });
    const colors = getStatusColor(status);
    const StatusIcon = getStatusIcon(status);
    const getStatusText = (s: BuyerShipmentStatus): string => {
      switch (s) {
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
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${colors.bg} ${colors.text} ${colors.border}`}
      >
        <StatusIcon className="w-3 h-3" />
        {getStatusText(status)}
      </span>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (authLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center pt-20 ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const currentOrders = getCurrentOrders();
  const currentLoading = getCurrentLoading();
  const currentInitialLoading = getCurrentInitialLoading();

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      onClick={dismissKeyboard}
    >
      {/* Sticky Toolbar */}
      <div
        className={`sticky top-14 z-30 border-b ${
          isDarkMode
            ? "bg-gray-900/80 backdrop-blur-xl border-gray-700/80"
            : "bg-white/80 backdrop-blur-xl border-gray-100/80"
        }`}
      >
        <div className="max-w-4xl mx-auto">
          {/* Row 1: Nav + Title */}
          <div className="flex items-center gap-3 px-3 sm:px-6 pt-3 pb-2">
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
              {t("title") || "My Orders"}
            </h1>
            {currentOrders.length > 0 && (
              <span className="px-2 py-0.5 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-semibold rounded-full flex-shrink-0">
                {currentOrders.length}
              </span>
            )}
          </div>

          {/* Row 2: Search */}
          <div className="px-3 sm:px-6 pb-2">
            <div className="relative">
              <Search
                className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-400"}`}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") dismissKeyboard();
                }}
                placeholder={t("searchProducts") || "Search products..."}
                className={`w-full pl-9 pr-9 py-2 border rounded-xl text-sm placeholder-gray-400 focus:outline-none transition-all ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700 text-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                    : "bg-gray-50/80 border-gray-200 text-gray-900 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300"
                }`}
              />
              {searchValue && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X
                    className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-400"}`}
                  />
                </button>
              )}
            </div>
          </div>

          {/* Row 3: Tab pills */}
          <div className="px-3 sm:px-6 pb-2.5">
            <div
              className={`flex gap-1 rounded-xl p-1 ${isDarkMode ? "bg-gray-800" : "bg-gray-100/80"}`}
            >
              <button
                onClick={() => {
                  setActiveTab("sold");
                  dismissKeyboard();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "sold"
                    ? isDarkMode
                      ? "bg-gray-700 text-white shadow-sm"
                      : "bg-white text-gray-900 shadow-sm"
                    : isDarkMode
                      ? "text-gray-400 hover:text-gray-200"
                      : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                {t("soldProducts") || "Sold"}
                {soldOrders.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === "sold"
                        ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                        : isDarkMode
                          ? "bg-gray-700 text-gray-400"
                          : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {soldOrders.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setActiveTab("bought");
                  dismissKeyboard();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "bought"
                    ? isDarkMode
                      ? "bg-gray-700 text-white shadow-sm"
                      : "bg-white text-gray-900 shadow-sm"
                    : isDarkMode
                      ? "text-gray-400 hover:text-gray-200"
                      : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                {t("boughtProducts") || "Bought"}
                {boughtOrders.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === "bought"
                        ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                        : isDarkMode
                          ? "bg-gray-700 text-gray-400"
                          : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {boughtOrders.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4">
        {error ? (
          <div className="text-center py-16">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 ${
                isDarkMode ? "bg-red-900/20" : "bg-red-50"
              }`}
            >
              <X className="w-5 h-5 text-red-500" />
            </div>
            <h3
              className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {t("errorTitle") || "Something went wrong"}
            </h3>
            <p
              className={`text-xs mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              {error}
            </p>
            <button
              onClick={() => {
                setError(null);
                if (activeTab === "sold") loadSoldOrders(true);
                else loadBoughtOrders(true);
              }}
              className="inline-flex items-center px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
            >
              {t("retry") || "Retry"}
            </button>
          </div>
        ) : currentInitialLoading ? (
          /* Loading Skeleton */
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
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
        ) : currentOrders.length === 0 ? (
          /* Empty State */
          <div className="text-center py-16">
            {activeTab === "sold" ? (
              <Package
                className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
              />
            ) : (
              <ShoppingCart
                className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
              />
            )}
            <h3
              className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {filters.searchQuery
                ? `${t("noResultsFound") || "No results found"}`
                : activeTab === "sold"
                  ? t("noSoldProducts") || "No Sold Products"
                  : t("noBoughtProducts") || "No Bought Products"}
            </h3>
            <p
              className={`text-xs max-w-xs mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              {filters.searchQuery
                ? t("tryDifferentKeywords") ||
                  "Try searching with different keywords"
                : activeTab === "sold"
                  ? t("noSoldProductsDesc") ||
                    "You haven't sold any products yet"
                  : t("noBoughtProductsDesc") ||
                    "You haven't bought any products yet"}
            </p>
          </div>
        ) : (
          /* Orders List */
          <div
            ref={activeTab === "sold" ? soldScrollRef : boughtScrollRef}
            onScroll={
              activeTab === "sold" ? handleSoldScroll : handleBoughtScroll
            }
            className="space-y-3 max-h-[calc(100vh-260px)] overflow-y-auto"
          >
            {currentOrders.map((transaction, index) => {
              const imageUrl =
                transaction.selectedColorImage ||
                transaction.productImage ||
                "/placeholder-product.png";
              return (
                <div
                  key={`${activeTab}-${transaction.id}-${index}`}
                  onClick={() => handleTransactionTap(transaction)}
                  className={`rounded-2xl border overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-100"
                  }`}
                >
                  <div className="px-4 py-3 flex items-center gap-3">
                    {/* Product image */}
                    <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-700 flex-shrink-0 relative">
                      <Image
                        src={imageUrl}
                        alt={transaction.productName}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`text-sm font-semibold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
                      >
                        {transaction.productName}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-xs font-bold ${isDarkMode ? "text-orange-400" : "text-orange-600"}`}
                        >
                          ₺{transaction.price.toLocaleString()}
                        </span>
                        {(transaction.averageRating ?? 0) > 0 && (
                          <div className="flex items-center gap-0.5">
                            <Star className="w-3 h-3 text-amber-400 fill-current" />
                            <span
                              className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                            >
                              {(transaction.averageRating ?? 0).toFixed(1)}
                            </span>
                          </div>
                        )}
                        {transaction.selectedColor && (
                          <span
                            className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                          >
                            · {transaction.selectedColor}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side: meta + arrow */}
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <ChevronRight
                        className={`w-4 h-4 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                      />
                      <span
                        className={`text-[11px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                      >
                        {transaction.timestamp
                          ?.toDate()
                          .toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                  </div>

                  {/* Status row for bought items + order ID */}
                  {(activeTab === "bought" || transaction.orderId) && (
                    <div
                      className={`px-4 py-2 border-t flex items-center justify-between ${
                        isDarkMode
                          ? "border-gray-700 bg-gray-800/50"
                          : "border-gray-50 bg-gray-50/50"
                      }`}
                    >
                      {activeTab === "bought" ? (
                        <ShipmentStatusBadge transaction={transaction} />
                      ) : (
                        <div />
                      )}
                      {transaction.orderId && (
                        <span
                          className={`text-[11px] font-mono ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                        >
                          #{transaction.orderId.slice(-8)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {currentLoading && (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
