"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  X,
  ChevronRight,
  Clock,
  Bike,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  UtensilsCrossed,
  MapPin,
  Banknote,
  CreditCard,
  ShoppingBag,
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
  collection,
  Timestamp,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslations } from "next-intl";
import { useTheme } from "@/hooks/useTheme";
import Image from "next/image";

type FoodOrderStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "completed"
  | "cancelled";

interface FoodOrder {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantProfileImage?: string;
  items: {
    foodId: string;
    name: string;
    quantity: number;
    price: number;
    extras: { name: string; price: number; quantity: number }[];
  }[];
  totalPrice: number;
  currency: string;
  paymentMethod: string;
  isPaid: boolean;
  deliveryType: string;
  status: FoodOrderStatus;
  createdAt: Timestamp;
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_DELAY = 300;
const SCROLL_THROTTLE_DELAY = 100;

export default function FoodOrdersPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useUser();
  const t = useTranslations("FoodOrders");
  const isDarkMode = useTheme();

  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | null>(null);

  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const scrollThrottleRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(searchValue.trim().toLowerCase());
    }, SEARCH_DEBOUNCE_DELAY);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchValue]);

  const loadOrders = useCallback(
    async (reset = false) => {
      if (!user || loading) return;
      if (!reset && !hasMore) return;
      setLoading(true);
      if (reset) setInitialLoading(true);
      try {
        let q = query(
          collection(db, "orders-food"),
          where("buyerId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE),
        );
        if (!reset && lastDoc) q = query(q, startAfter(lastDoc));
        const snapshot = await getDocs(q);
        const newOrders: FoodOrder[] = snapshot.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            restaurantId: d.restaurantId || "",
            restaurantName: d.restaurantName || "",
            restaurantProfileImage: d.restaurantProfileImage || "",
            items: Array.isArray(d.items) ? d.items : [],
            totalPrice: d.totalPrice || 0,
            currency: d.currency || "TL",
            paymentMethod: d.paymentMethod || "",
            isPaid: d.isPaid || false,
            deliveryType: d.deliveryType || "delivery",
            status: (d.status || "pending") as FoodOrderStatus,
            createdAt: d.createdAt,
          };
        });
        const filtered = searchQuery
          ? newOrders.filter(
              (o) =>
                o.restaurantName.toLowerCase().includes(searchQuery) ||
                o.items.some((i) =>
                  i.name.toLowerCase().includes(searchQuery),
                ),
            )
          : newOrders;
        setHasMore(snapshot.docs.length === PAGE_SIZE);
        if (reset) setOrders(filtered);
        else setOrders((prev) => [...prev, ...filtered]);
        if (snapshot.docs.length > 0)
          setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        else if (reset) setLastDoc(null);
        setError(null);
      } catch (err) {
        console.error("Error loading food orders:", err);
        setError("Failed to load food orders");
      } finally {
        setLoading(false);
        if (reset) setInitialLoading(false);
      }
    },
    [user, searchQuery, loading, lastDoc, hasMore],
  );

  useEffect(() => {
    if (user) {
      setOrders([]);
      setLastDoc(null);
      setHasMore(true);
      setError(null);
      loadOrders(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, searchQuery]);

  const handleScroll = useCallback(() => {
    if (scrollThrottleRef.current) return;
    scrollThrottleRef.current = setTimeout(() => {
      const container = scrollRef.current;
      if (!container || loading || !hasMore) return;
      const { scrollTop, scrollHeight, clientHeight } = container;
      if (scrollHeight - scrollTop <= clientHeight + 200) loadOrders(false);
      scrollThrottleRef.current = null;
    }, SCROLL_THROTTLE_DELAY);
  }, [loading, hasMore, loadOrders]);

  const clearSearch = () => {
    setSearchValue("");
    setSearchQuery("");
    searchInputRef.current?.blur();
  };

  const dismissKeyboard = () => {
    if (isSearchFocused) {
      searchInputRef.current?.blur();
      setIsSearchFocused(false);
    }
  };

  const handleOrderTap = (order: FoodOrder) => {
    router.push(`/food-order-detail/${order.id}`);
  };

  const getStatusColors = (status: FoodOrderStatus) => {
    switch (status) {
      case "pending":
        return {
          bg: "bg-gray-100 dark:bg-gray-700",
          text: "text-gray-600 dark:text-gray-300",
          border: "border-gray-200 dark:border-gray-600",
        };
      case "accepted":
        return {
          bg: "bg-teal-50 dark:bg-teal-900/30",
          text: "text-teal-600 dark:text-teal-400",
          border: "border-teal-200 dark:border-teal-700",
        };
      case "rejected":
      case "cancelled":
        return {
          bg: "bg-red-50 dark:bg-red-900/30",
          text: "text-red-600 dark:text-red-400",
          border: "border-red-200 dark:border-red-700",
        };
      case "preparing":
        return {
          bg: "bg-orange-50 dark:bg-orange-900/30",
          text: "text-orange-600 dark:text-orange-400",
          border: "border-orange-200 dark:border-orange-700",
        };
      case "ready":
        return {
          bg: "bg-indigo-50 dark:bg-indigo-900/30",
          text: "text-indigo-600 dark:text-indigo-400",
          border: "border-indigo-200 dark:border-indigo-700",
        };
      case "out_for_delivery":
        return {
          bg: "bg-blue-50 dark:bg-blue-900/30",
          text: "text-blue-600 dark:text-blue-400",
          border: "border-blue-200 dark:border-blue-700",
        };
      case "delivered":
      case "completed":
        return {
          bg: "bg-green-50 dark:bg-green-900/30",
          text: "text-green-600 dark:text-green-400",
          border: "border-green-200 dark:border-green-700",
        };
      default:
        return {
          bg: "bg-gray-100 dark:bg-gray-700",
          text: "text-gray-600 dark:text-gray-300",
          border: "border-gray-200 dark:border-gray-600",
        };
    }
  };

  const FoodStatusBadge = ({ status }: { status: FoodOrderStatus }) => {
    const colors = getStatusColors(status);
    const icons: Record<FoodOrderStatus, React.ElementType> = {
      pending: Clock,
      accepted: CheckCircle2,
      rejected: XCircle,
      preparing: UtensilsCrossed,
      ready: ShoppingBag,
      out_for_delivery: Bike,
      delivered: CheckCircle2,
      completed: CheckCircle2,
      cancelled: XCircle,
    };
    const labels: Record<FoodOrderStatus, string> = {
      pending: t("statusPending"),
      accepted: t("statusAccepted"),
      rejected: t("statusRejected"),
      preparing: t("statusPreparing"),
      ready: t("statusReady"),
      out_for_delivery: t("statusOutForDelivery"),
      delivered: t("statusDelivered"),
      completed: t("statusCompleted"),
      cancelled: t("statusCancelled"),
    };
    const Icon = icons[status] || Clock;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${colors.bg} ${colors.text} ${colors.border}`}
      >
        <Icon className="w-3 h-3" />
        {labels[status] || status}
      </span>
    );
  };

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

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      onClick={dismissKeyboard}
    >
      <div
        className={`sticky top-14 z-30 border-b ${
          isDarkMode
            ? "bg-gray-900/80 backdrop-blur-xl border-gray-700/80"
            : "bg-white/80 backdrop-blur-xl border-gray-100/80"
        }`}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 px-3 sm:px-6 pt-3 pb-2">
            <button
              onClick={() => router.push("/profile")}
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
              {t("title")}
            </h1>
            {orders.length > 0 && (
              <span className="px-2 py-0.5 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-semibold rounded-full flex-shrink-0">
                {orders.length}
              </span>
            )}
          </div>

          <div className="px-3 sm:px-6 pb-3">
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
                placeholder={t("searchRestaurants")}
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
        </div>
      </div>

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
              {t("errorTitle")}
            </h3>
            <p
              className={`text-xs mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              {error}
            </p>
            <button
              onClick={() => {
                setError(null);
                loadOrders(true);
              }}
              className="inline-flex items-center px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
            >
              {t("retry")}
            </button>
          </div>
        ) : initialLoading ? (
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`rounded-2xl border h-24 animate-pulse ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <UtensilsCrossed
              className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
            />
            <h3
              className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {searchQuery ? t("noResultsFound") : t("noFoodOrders")}
            </h3>
            <p
              className={`text-xs max-w-xs mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              {searchQuery
                ? t("tryDifferentKeywords")
                : t("noFoodOrdersDesc")}
            </p>
          </div>
        ) : (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto"
          >
            {orders.map((order) => {
              const isPickup = order.deliveryType === "pickup";
              const itemsPreview =
                order.items
                  .slice(0, 2)
                  .map((i) =>
                    i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name,
                  )
                  .join(", ") +
                (order.items.length > 2 ? ` +${order.items.length - 2}` : "");
              return (
                <div
                  key={order.id}
                  onClick={() => handleOrderTap(order)}
                  className={`rounded-2xl border overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
                >
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDarkMode ? "bg-gray-700" : "bg-orange-50"}`}
                    >
                      {order.restaurantProfileImage ? (
                        <div className="w-10 h-10 rounded-xl overflow-hidden relative">
                          <Image
                            src={order.restaurantProfileImage}
                            alt={order.restaurantName}
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        </div>
                      ) : (
                        <UtensilsCrossed className="w-4 h-4 text-orange-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`text-sm font-semibold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
                      >
                        {order.restaurantName}
                      </h4>
                      <p
                        className={`text-[11px] truncate mt-0.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                      >
                        {itemsPreview}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-xs font-bold ${isDarkMode ? "text-orange-400" : "text-orange-600"}`}
                        >
                          {order.totalPrice.toFixed(0)} {order.currency}
                        </span>
                        <span
                          className={`flex items-center gap-0.5 text-[11px] ${isPickup ? (isDarkMode ? "text-blue-400" : "text-blue-600") : isDarkMode ? "text-green-400" : "text-green-600"}`}
                        >
                          {isPickup ? (
                            <ShoppingBag className="w-2.5 h-2.5" />
                          ) : (
                            <MapPin className="w-2.5 h-2.5" />
                          )}
                          {isPickup ? t("pickup") : t("delivery")}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <ChevronRight
                        className={`w-4 h-4 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                      />
                      <span
                        className={`text-[11px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                      >
                        {order.createdAt
                          ?.toDate()
                          .toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`px-4 py-2 border-t flex items-center justify-between ${isDarkMode ? "border-gray-700 bg-gray-800/50" : "border-gray-50 bg-gray-50/50"}`}
                  >
                    <FoodStatusBadge status={order.status} />
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold ${order.isPaid ? (isDarkMode ? "text-green-400" : "text-green-600") : isDarkMode ? "text-amber-400" : "text-amber-600"}`}
                    >
                      {order.isPaid ? (
                        <>
                          <CreditCard className="w-3 h-3" />
                          {t("paid")}
                        </>
                      ) : (
                        <>
                          <Banknote className="w-3 h-3" />
                          {t("payAtDoor")}
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
            {loading && (
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
