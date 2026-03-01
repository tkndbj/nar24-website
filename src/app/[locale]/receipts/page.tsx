"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserProvider";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ArrowLeft,
  Receipt as ReceiptIcon,
  Calendar,
  CreditCard,
  ChevronRight,
  RefreshCw,
  User,
  LogIn,
  UtensilsCrossed,
  ShoppingBag,
  MapPin,
  Banknote,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

// ============================================================================
// INTERFACES
// ============================================================================

type Tab = "product" | "food";

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

interface FoodReceipt {
  id: string;
  orderId: string;
  receiptId: string;
  totalPrice: number;
  currency: string;
  timestamp: Date;
  paymentMethod: string;
  isPaid: boolean;
  deliveryType: string;
  restaurantName: string;
  filePath?: string;
}

const RECEIPTS_LIMIT = 20;

// ============================================================================
// COMPONENT
// ============================================================================

export default function ReceiptsPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("product");

  // ── Product receipts state ───────────────────────────────────────
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [lastDocument, setLastDocument] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  // ── Food receipts state ──────────────────────────────────────────
  const [foodReceipts, setFoodReceipts] = useState<FoodReceipt[]>([]);
  const [isFoodLoading, setIsFoodLoading] = useState(false);
  const [isFoodInitialLoad, setIsFoodInitialLoad] = useState(true);
  const [hasFoodMore, setHasFoodMore] = useState(true);
  const [lastFoodDocument, setLastFoodDocument] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [foodFetched, setFoodFetched] = useState(false);

  const locale = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user, isLoading: authLoading } = useUser();
  const router = useRouter();
  const t = useTranslations();

  const l = (key: string) => t(key) || key.split(".").pop() || key;

  // ── Theme detection ──────────────────────────────────────────────
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

  // ── Fetch product receipts ───────────────────────────────────────
  const fetchReceipts = useCallback(
    async (loadMore = false) => {
      if (!user || isLoading) return;
      setIsLoading(true);
      try {
        const receiptsRef = collection(db, "users", user.uid, "receipts");
        let q = query(
          receiptsRef,
          orderBy("timestamp", "desc"),
          limit(RECEIPTS_LIMIT),
        );
        if (loadMore && lastDocument) {
          q = query(
            receiptsRef,
            orderBy("timestamp", "desc"),
            startAfter(lastDocument),
            limit(RECEIPTS_LIMIT),
          );
        }
        const snapshot = await getDocs(q);
        if (snapshot.docs.length > 0) {
          const newReceipts: Receipt[] = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              orderId: data.orderId || "",
              receiptId: data.receiptId || "",
              totalPrice: data.totalPrice || 0,
              currency: data.currency || "TL",
              timestamp:
                data.timestamp instanceof Timestamp
                  ? data.timestamp.toDate()
                  : new Date(data.timestamp),
              paymentMethod: data.paymentMethod || "",
              deliveryOption: data.deliveryOption || "",
              receiptUrl: data.receiptUrl,
            };
          });
          setLastDocument(snapshot.docs[snapshot.docs.length - 1]);
          if (loadMore) setReceipts((prev) => [...prev, ...newReceipts]);
          else setReceipts(newReceipts);
          setHasMore(snapshot.docs.length >= RECEIPTS_LIMIT);
        } else {
          setHasMore(false);
        }
      } catch (error) {
        console.error("Error fetching receipts:", error);
        alert(
          `Error: ${l("Receipts.errorFetchingReceipts") || "Error fetching receipts"}`,
        );
      } finally {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    },
    [user, isLoading, lastDocument],
  );

  // ── Fetch food receipts ──────────────────────────────────────────
  const fetchFoodReceipts = useCallback(
    async (loadMore = false) => {
      if (!user || isFoodLoading) return;
      setIsFoodLoading(true);
      try {
        const ref = collection(db, "users", user.uid, "foodReceipts");
        let q = query(ref, orderBy("timestamp", "desc"), limit(RECEIPTS_LIMIT));
        if (loadMore && lastFoodDocument) {
          q = query(
            ref,
            orderBy("timestamp", "desc"),
            startAfter(lastFoodDocument),
            limit(RECEIPTS_LIMIT),
          );
        }
        const snapshot = await getDocs(q);
        if (snapshot.docs.length > 0) {
          const items: FoodReceipt[] = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              orderId: data.orderId || "",
              receiptId: data.receiptId || "",
              totalPrice: data.totalPrice || 0,
              currency: data.currency || "TL",
              timestamp:
                data.timestamp instanceof Timestamp
                  ? data.timestamp.toDate()
                  : new Date(data.timestamp),
              paymentMethod: data.paymentMethod || "",
              isPaid: data.isPaid || false,
              deliveryType: data.deliveryType || "delivery",
              restaurantName: data.restaurantName || "",
              filePath: data.filePath,
            };
          });
          setLastFoodDocument(snapshot.docs[snapshot.docs.length - 1]);
          if (loadMore) setFoodReceipts((prev) => [...prev, ...items]);
          else setFoodReceipts(items);
          setHasFoodMore(snapshot.docs.length >= RECEIPTS_LIMIT);
        } else {
          setHasFoodMore(false);
        }
      } catch (error) {
        console.error("Error fetching food receipts:", error);
        alert(
          `Error: ${l("Receipts.errorFetchingReceipts") || "Error fetching receipts"}`,
        );
      } finally {
        setIsFoodLoading(false);
        setIsFoodInitialLoad(false);
        setFoodFetched(true);
      }
    },
    [user, isFoodLoading, lastFoodDocument],
  );

  // ── Initial load (product) ───────────────────────────────────────
  useEffect(() => {
    if (user) fetchReceipts();
    else setIsInitialLoad(false);
  }, [user]);

  // ── Load food receipts when tab first switches ───────────────────
  useEffect(() => {
    if (activeTab === "food" && user && !foodFetched) {
      fetchFoodReceipts();
    }
  }, [activeTab, user, foodFetched]);

  // ── Refresh handlers ─────────────────────────────────────────────
  const refreshReceipts = useCallback(async () => {
    setReceipts([]);
    setLastDocument(null);
    setHasMore(true);
    setIsInitialLoad(true);
    await fetchReceipts();
  }, [fetchReceipts]);

  const refreshFoodReceipts = useCallback(async () => {
    setFoodReceipts([]);
    setLastFoodDocument(null);
    setHasFoodMore(true);
    setIsFoodInitialLoad(true);
    setFoodFetched(false);
    await fetchFoodReceipts();
  }, [fetchFoodReceipts]);

  // ── Load more handlers ───────────────────────────────────────────
  const loadMoreReceipts = useCallback(() => {
    if (hasMore && !isLoading) fetchReceipts(true);
  }, [hasMore, isLoading, fetchReceipts]);

  const loadMoreFoodReceipts = useCallback(() => {
    if (hasFoodMore && !isFoodLoading) fetchFoodReceipts(true);
  }, [hasFoodMore, isFoodLoading, fetchFoodReceipts]);

  // ── Infinite scroll ──────────────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      if (!scrollRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      if (scrollHeight - scrollTop <= clientHeight + 200) {
        if (activeTab === "product") loadMoreReceipts();
        else loadMoreFoodReceipts();
      }
    };
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", handleScroll);
      return () => el.removeEventListener("scroll", handleScroll);
    }
  }, [activeTab, loadMoreReceipts, loadMoreFoodReceipts]);

  // ── Navigation ───────────────────────────────────────────────────
  const goToReceiptDetail = (receipt: Receipt) => {
    router.push(`/${locale}/receipts/receipt-detail/${receipt.id}`);
  };

  const goToFoodReceiptDetail = (receipt: FoodReceipt) => {
    router.push(`/${locale}/receipts/food-receipt-detail/${receipt.id}`);
  };

  // ── Formatters ───────────────────────────────────────────────────
  const formatDate = (timestamp: Date): string => {
    const now = new Date();
    const diff = Math.floor(
      (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diff === 0)
      return `${l("Receipts.today") || "Today"}, ${timestamp.getHours().toString().padStart(2, "0")}:${timestamp.getMinutes().toString().padStart(2, "0")}`;
    if (diff === 1) return l("Receipts.yesterday") || "Yesterday";
    if (diff < 7) return `${diff} ${l("Receipts.daysAgo") || "days ago"}`;
    return `${timestamp.getDate()}/${timestamp.getMonth() + 1}/${timestamp.getFullYear()}`;
  };

  const getDeliveryColor = (opt: string): string => {
    switch (opt) {
      case "express":
        return isDarkMode ? "text-orange-400" : "text-orange-600";
      case "gelal":
        return isDarkMode ? "text-blue-400" : "text-blue-600";
      default:
        return isDarkMode ? "text-green-400" : "text-green-600";
    }
  };

  const localizeDeliveryOption = (opt: string): string => {
    switch (opt) {
      case "express":
        return l("Receipts.deliveryOption2") || "Express";
      case "gelal":
        return l("Receipts.deliveryOption1") || "Pick Up";
      default:
        return l("Receipts.deliveryOption3") || "Normal";
    }
  };

  const localizePaymentMethod = (method: string): string => {
    switch (method.toLowerCase()) {
      case "card":
        return l("Receipts.card") || "Card";
      case "cash":
        return l("Receipts.cash") || "Cash";
      case "pay_at_door":
        return l("Receipts.payAtDoor") || "Pay at Door";
      case "bank_transfer":
        return l("Receipts.bankTransfer") || "Bank Transfer";
      default:
        return method;
    }
  };

  const localizeFoodDeliveryType = (type: string): string =>
    type === "pickup"
      ? l("Receipts.pickup") || "Pickup"
      : l("Receipts.delivery") || "Delivery";

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

  const currentIsLoading = activeTab === "product" ? isLoading : isFoodLoading;
  const currentCount =
    activeTab === "product" ? receipts.length : foodReceipts.length;

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
    >
      {/* ── Sticky Toolbar ───────────────────────────────────────── */}
      <div
        className={`sticky top-14 z-30 border-b ${
          isDarkMode
            ? "bg-gray-900/80 backdrop-blur-xl border-gray-700/80"
            : "bg-white/80 backdrop-blur-xl border-gray-100/80"
        }`}
      >
        <div className="max-w-4xl mx-auto px-3 sm:px-6">
          {/* Top row */}
          <div className="flex items-center gap-3 py-3">
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
              {l("Receipts.receipts") || "Receipts"}
            </h1>
            {currentCount > 0 && (
              <span className="px-2 py-0.5 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-semibold rounded-full flex-shrink-0">
                {currentCount}
              </span>
            )}
            <div className="flex-1" />
            {user && (
              <button
                onClick={
                  activeTab === "product"
                    ? refreshReceipts
                    : refreshFoodReceipts
                }
                disabled={currentIsLoading}
                className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                    : "bg-gray-50 border-gray-200 hover:bg-gray-100"
                } ${currentIsLoading ? "opacity-50" : ""}`}
              >
                <RefreshCw
                  className={`w-4 h-4 ${currentIsLoading ? "animate-spin" : ""} ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
                />
              </button>
            )}
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 pb-3">
            <button
              onClick={() => setActiveTab("product")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "product"
                  ? "bg-orange-500 text-white shadow-sm"
                  : isDarkMode
                    ? "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              {l("Receipts.productOrders") || "Product Orders"}
            </button>
            <button
              onClick={() => setActiveTab("food")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "food"
                  ? "bg-orange-500 text-white shadow-sm"
                  : isDarkMode
                    ? "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              {l("Receipts.foodOrders") || "Food Orders"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="max-w-4xl mx-auto px-3 sm:px-6 py-4"
        style={{ maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}
      >
        {!user ? (
          /* Not Authenticated */
          <div className="text-center py-16">
            <User
              className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
            />
            <h3
              className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {l("Receipts.loginRequired") || "Login Required"}
            </h3>
            <p
              className={`text-xs max-w-xs mx-auto mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              {l("Receipts.loginToViewReceipts") ||
                "Please login to view your purchase receipts."}
            </p>
            <button
              onClick={() => router.push("/login")}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
            >
              <LogIn className="w-3.5 h-3.5" />
              {l("Receipts.login") || "Login"}
            </button>
          </div>
        ) : activeTab === "product" ? (
          /* ── Product Receipts ─────────────────────────────────── */
          isInitialLoad ? (
            /* Initial Loading */
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className={`rounded-2xl border h-20 animate-pulse ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-100"
                  }`}
                />
              ))}
            </div>
          ) : receipts.length === 0 ? (
            /* Empty */
            <div className="text-center py-16">
              <ReceiptIcon
                className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
              />
              <h3
                className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {l("Receipts.noReceiptsFound") || "No Receipts Found"}
              </h3>
              <p
                className={`text-xs max-w-xs mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
              >
                {l("Receipts.yourPurchaseReceiptsWillAppearHere") ||
                  "Your purchase receipts will appear here."}
              </p>
            </div>
          ) : (
            /* Product Receipts List */
            <div className="space-y-3">
              {receipts.map((receipt) => (
                <div
                  key={receipt.id}
                  onClick={() => goToReceiptDetail(receipt)}
                  className={`rounded-2xl border overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-100"
                  }`}
                >
                  <div className="px-4 py-3 flex items-center gap-3">
                    {/* Icon */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        isDarkMode ? "bg-gray-700" : "bg-orange-50"
                      }`}
                    >
                      <ReceiptIcon className="w-4 h-4 text-orange-500" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3
                        className={`text-sm font-semibold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
                      >
                        {l("Receipts.orders") || "Order"} #
                        {receipt.orderId.substring(0, 8).toUpperCase()}
                      </h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        <div className="flex items-center gap-1">
                          <Calendar
                            className={`w-3 h-3 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                          />
                          <span
                            className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                          >
                            {formatDate(receipt.timestamp)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CreditCard
                            className={`w-3 h-3 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                          />
                          <span
                            className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                          >
                            {localizePaymentMethod(receipt.paymentMethod)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Price + Delivery + Arrow */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-bold ${isDarkMode ? "text-orange-400" : "text-orange-600"}`}
                        >
                          {receipt.totalPrice.toFixed(0)} {receipt.currency}
                        </span>
                        <ChevronRight
                          className={`w-4 h-4 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                        />
                      </div>
                      <span
                        className={`text-[11px] font-medium ${getDeliveryColor(receipt.deliveryOption)}`}
                      >
                        {localizeDeliveryOption(receipt.deliveryOption)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Load More Spinner */}
              {isLoading && !isInitialLoad && (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
                </div>
              )}

              {/* End of List */}
              {!hasMore && receipts.length > 0 && (
                <p
                  className={`text-center text-[11px] py-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                >
                  {l("Receipts.noMoreReceipts") || "No more receipts to load"}
                </p>
              )}
            </div>
          )
        ) : /* ── Food Receipts ────────────────────────────────────── */
        isFoodInitialLoad ? (
          /* Initial Loading */
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={`rounded-2xl border h-20 animate-pulse ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700"
                    : "bg-white border-gray-100"
                }`}
              />
            ))}
          </div>
        ) : foodReceipts.length === 0 ? (
          /* Empty */
          <div className="text-center py-16">
            <UtensilsCrossed
              className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
            />
            <h3
              className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {l("Receipts.noReceiptsFound") || "No Receipts Found"}
            </h3>
            <p
              className={`text-xs max-w-xs mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              {l("Receipts.foodReceiptsWillAppearHere") ||
                "Your food order receipts will appear here."}
            </p>
          </div>
        ) : (
          /* Food Receipts List */
          <div className="space-y-3">
            {foodReceipts.map((receipt) => (
              <div
                key={receipt.id}
                onClick={() => goToFoodReceiptDetail(receipt)}
                className={`rounded-2xl border overflow-hidden cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700"
                    : "bg-white border-gray-100"
                }`}
              >
                {/* Main row */}
                <div className="px-4 py-3 flex items-center gap-3">
                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isDarkMode ? "bg-gray-700" : "bg-orange-50"
                    }`}
                  >
                    <UtensilsCrossed className="w-4 h-4 text-orange-500" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className={`text-sm font-semibold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
                    >
                      {receipt.restaurantName ||
                        l("Receipts.foodOrder") ||
                        "Food Order"}
                    </h3>
                    <div className="flex items-center gap-3 mt-0.5">
                      <div className="flex items-center gap-1">
                        <Calendar
                          className={`w-3 h-3 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                        />
                        <span
                          className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                        >
                          {formatDate(receipt.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {receipt.paymentMethod === "pay_at_door" ? (
                          <Banknote
                            className={`w-3 h-3 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                          />
                        ) : (
                          <CreditCard
                            className={`w-3 h-3 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                          />
                        )}
                        <span
                          className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                        >
                          {localizePaymentMethod(receipt.paymentMethod)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Price + Delivery + Arrow */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-bold ${isDarkMode ? "text-orange-400" : "text-orange-600"}`}
                      >
                        {receipt.totalPrice.toFixed(0)} {receipt.currency}
                      </span>
                      <ChevronRight
                        className={`w-4 h-4 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                      />
                    </div>
                    <span
                      className={`flex items-center gap-0.5 text-[11px] font-medium ${
                        receipt.deliveryType === "pickup"
                          ? isDarkMode
                            ? "text-blue-400"
                            : "text-blue-600"
                          : isDarkMode
                            ? "text-green-400"
                            : "text-green-600"
                      }`}
                    >
                      {receipt.deliveryType === "pickup" ? (
                        <ShoppingBag className="w-2.5 h-2.5" />
                      ) : (
                        <MapPin className="w-2.5 h-2.5" />
                      )}
                      {localizeFoodDeliveryType(receipt.deliveryType)}
                    </span>
                  </div>
                </div>

                {/* Paid / Pay-at-door badge strip */}
                <div
                  className={`px-4 py-1.5 flex items-center justify-between border-t ${
                    isDarkMode ? "border-gray-700/60" : "border-gray-50"
                  } ${
                    receipt.isPaid
                      ? isDarkMode
                        ? "bg-green-900/10"
                        : "bg-green-50/60"
                      : isDarkMode
                        ? "bg-amber-900/10"
                        : "bg-amber-50/60"
                  }`}
                >
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider ${
                      receipt.isPaid
                        ? isDarkMode
                          ? "text-green-400"
                          : "text-green-600"
                        : isDarkMode
                          ? "text-amber-400"
                          : "text-amber-600"
                    }`}
                  >
                    {receipt.isPaid
                      ? l("Receipts.paid") || "Paid"
                      : l("Receipts.payAtDoor") || "Pay at Door"}
                  </span>
                  <span
                    className={`text-[10px] ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                  >
                    #{receipt.orderId.substring(0, 8).toUpperCase()}
                  </span>
                </div>
              </div>
            ))}

            {/* Load More Spinner */}
            {isFoodLoading && !isFoodInitialLoad && (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
              </div>
            )}

            {/* End of List */}
            {!hasFoodMore && foodReceipts.length > 0 && (
              <p
                className={`text-center text-[11px] py-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
              >
                {l("Receipts.noMoreReceipts") || "No more receipts to load"}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
