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
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

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

const RECEIPTS_LIMIT = 20;

export default function ReceiptsPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [lastDocument, setLastDocument] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const locale = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const router = useRouter();
  const t = useTranslations();

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

  // Fetch receipts from Firestore
  const fetchReceipts = useCallback(
    async (loadMore = false) => {
      if (!user || isLoading) return;

      setIsLoading(true);

      try {
        const receiptsRef = collection(db, "users", user.uid, "receipts");

        let q = query(
          receiptsRef,
          orderBy("timestamp", "desc"),
          limit(RECEIPTS_LIMIT)
        );

        if (loadMore && lastDocument) {
          q = query(
            receiptsRef,
            orderBy("timestamp", "desc"),
            startAfter(lastDocument),
            limit(RECEIPTS_LIMIT)
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

          if (loadMore) {
            setReceipts((prev) => [...prev, ...newReceipts]);
          } else {
            setReceipts(newReceipts);
          }

          setHasMore(snapshot.docs.length >= RECEIPTS_LIMIT);
        } else {
          setHasMore(false);
        }
      } catch (error) {
        console.error("Error fetching receipts:", error);
        showErrorToast(
          l("Receipts.errorFetchingReceipts") || "Error fetching receipts"
        );
      } finally {
        setIsLoading(false);
        setIsInitialLoad(false);
      }
    },
    [user, isLoading, lastDocument]
  );

  // Initial load
  useEffect(() => {
    if (user) {
      fetchReceipts();
    } else {
      setIsInitialLoad(false);
    }
  }, [user]);

  // Refresh receipts
  const refreshReceipts = useCallback(async () => {
    setReceipts([]);
    setLastDocument(null);
    setHasMore(true);
    setIsInitialLoad(true);
    await fetchReceipts();
  }, [fetchReceipts]);

  // Load more receipts
  const loadMoreReceipts = useCallback(() => {
    if (hasMore && !isLoading) {
      fetchReceipts(true);
    }
  }, [hasMore, isLoading, fetchReceipts]);

  // Scroll listener for infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!scrollRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const scrolledToBottom = scrollHeight - scrollTop <= clientHeight + 200;

      if (scrolledToBottom && hasMore && !isLoading) {
        loadMoreReceipts();
      }
    };

    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener("scroll", handleScroll);
      return () => scrollElement.removeEventListener("scroll", handleScroll);
    }
  }, [hasMore, isLoading, loadMoreReceipts]);

  // Toast notifications
  const showErrorToast = (message: string) => {
    console.error(message);
    alert(`Error: ${message}`);
  };

  // Navigate to receipt detail
  const goToReceiptDetail = (receipt: Receipt) => {
    router.push(`/${locale}/receipts/receipt-detail/${receipt.id}`);
  };

  // Handle navigation to login
  const handleGoToLogin = () => {
    router.push("/login");
  };

  // Format date
  const formatDate = (timestamp: Date): string => {
    const now = new Date();
    const difference = now.getTime() - timestamp.getTime();
    const daysDifference = Math.floor(difference / (1000 * 60 * 60 * 24));

    if (daysDifference === 0) {
      const today = l("Receipts.today") || "Today";
      return `${today}, ${timestamp
        .getHours()
        .toString()
        .padStart(2, "0")}:${timestamp
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
    } else if (daysDifference === 1) {
      return l("Receipts.yesterday") || "Yesterday";
    } else if (daysDifference < 7) {
      const daysAgo = l("Receipts.daysAgo") || "days ago";
      return `${daysDifference} ${daysAgo}`;
    } else {
      return `${timestamp.getDate()}/${
        timestamp.getMonth() + 1
      }/${timestamp.getFullYear()}`;
    }
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
        return l("Receipts.deliveryOption2") || "Express Delivery";
      case "gelal":
        return l("Receipts.deliveryOption1") || "Pick Up";
      case "normal":
      default:
        return l("Receipts.deliveryOption3") || "Normal Delivery";
    }
  };

  // Localize payment method
  const localizePaymentMethod = (paymentMethod: string): string => {
    switch (paymentMethod.toLowerCase()) {
      case "card":
        return l("Receipts.card") || "Card";
      case "cash":
        return l("Receipts.cash") || "Cash";
      case "bank_transfer":
        return l("Receipts.bankTransfer") || "Bank Transfer";
      default:
        return paymentMethod;
    }
  };

  const l = (key: string) => t(key) || key.split(".").pop() || key;

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
            <div className="flex items-center space-x-3">
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
                className={`text-sm sm:text-lg font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {l("Receipts.receipts") || "Receipts"}
              </h1>
            </div>

            {user && (
              <button
                onClick={refreshReceipts}
                disabled={isLoading}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <RefreshCw
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  } ${isLoading ? "animate-spin" : ""}`}
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ height: "calc(100vh - 64px)" }}
      >
        {/* Not Authenticated State */}
        {!user ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-12">
            <div
              className={`
                w-20 h-20 rounded-full flex items-center justify-center mb-6
                ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
              `}
            >
              <User
                size={32}
                className={isDarkMode ? "text-gray-400" : "text-gray-500"}
              />
            </div>
            <h3
              className={`
                text-lg sm:text-xl font-bold mb-3 text-center
                ${isDarkMode ? "text-white" : "text-gray-900"}
              `}
            >
              {l("Receipts.loginRequired") || "Login Required"}
            </h3>
            <p
              className={`
                text-sm sm:text-base text-center mb-8 leading-relaxed
                ${isDarkMode ? "text-gray-400" : "text-gray-600"}
              `}
            >
              {l("Receipts.loginToViewReceipts") ||
                "Please login to view your purchase receipts."}
            </p>
            <button
              onClick={handleGoToLogin}
              className="
                flex items-center space-x-2 px-6 py-3 rounded-full
                bg-gradient-to-r from-orange-500 to-pink-500 text-white
                hover:from-orange-600 hover:to-pink-600
                transition-all duration-200 shadow-lg hover:shadow-xl
                active:scale-95
              "
            >
              <LogIn size={18} />
              <span className="font-medium text-sm sm:text-base">
                {l("Receipts.login") || "Login"}
              </span>
            </button>
          </div>
        ) : /* Loading State */ isInitialLoad ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-12">
            <div className="animate-spin w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full mb-4"></div>
            <p
              className={`
                text-sm sm:text-base text-center
                ${isDarkMode ? "text-gray-400" : "text-gray-600"}
              `}
            >
              {l("Receipts.loadingReceipts") || "Loading receipts..."}
            </p>
          </div>
        ) : /* Empty State */ receipts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 py-12">
            <div
              className={`
                w-20 h-20 rounded-full flex items-center justify-center mb-6
                ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
              `}
            >
              <ReceiptIcon
                size={32}
                className={isDarkMode ? "text-gray-400" : "text-gray-500"}
              />
            </div>
            <h3
              className={`
                text-lg sm:text-xl font-bold mb-3 text-center
                ${isDarkMode ? "text-white" : "text-gray-900"}
              `}
            >
              {l("Receipts.noReceiptsFound") || "No Receipts Found"}
            </h3>
            <p
              className={`
                text-sm sm:text-base text-center mb-8 leading-relaxed
                ${isDarkMode ? "text-gray-400" : "text-gray-600"}
              `}
            >
              {l("Receipts.yourPurchaseReceiptsWillAppearHere") ||
                "Your purchase receipts will appear here."}
            </p>
          </div>
        ) : (
          /* Receipts List */
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="space-y-4">
              {receipts.map((receipt) => (
                <div
                  key={receipt.id}
                  onClick={() => goToReceiptDetail(receipt)}
                  className={`
                    p-4 rounded-xl cursor-pointer transition-all duration-200
                    ${
                      isDarkMode
                        ? "bg-gray-800 hover:bg-gray-750 border border-gray-700"
                        : "bg-white hover:bg-gray-50 border border-gray-200"
                    }
                    shadow-sm hover:shadow-md
                  `}
                >
                  <div className="flex items-center space-x-4">
                    {/* Receipt Icon */}
                    <div
                      className={`
                        w-12 h-12 rounded-xl flex items-center justify-center
                        ${isDarkMode ? "bg-gray-700" : "bg-gray-100"}
                      `}
                    >
                      <ReceiptIcon className="w-6 h-6 text-orange-500" />
                    </div>

                    {/* Receipt Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3
                          className={`
                            text-sm sm:text-base font-semibold truncate
                            ${isDarkMode ? "text-white" : "text-gray-900"}
                          `}
                        >
                          {l("Receipts.orders") || "Order"} #
                          {receipt.orderId.substring(0, 8).toUpperCase()}
                        </h3>
                        <span
                          className={`
                            px-2 py-1 rounded-md text-xs font-medium
                            ${
                              isDarkMode
                                ? "bg-gray-700 text-gray-300"
                                : "bg-gray-100 text-gray-600"
                            }
                            ${getDeliveryColor(receipt.deliveryOption)}
                          `}
                        >
                          {localizeDeliveryOption(receipt.deliveryOption)}
                        </span>
                      </div>

                      <div className="flex items-center space-x-4 text-xs sm:text-sm">
                        <div className="flex items-center space-x-1">
                          <Calendar
                            className={`
                              w-4 h-4
                              ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                            `}
                          />
                          <span
                            className={`
                              ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                            `}
                          >
                            {formatDate(receipt.timestamp)}
                          </span>
                        </div>

                        <div className="flex items-center space-x-1">
                          <CreditCard
                            className={`
                              w-4 h-4
                              ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                            `}
                          />
                          <span
                            className={`
                              ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                            `}
                          >
                            {localizePaymentMethod(receipt.paymentMethod)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Price and Arrow */}
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <p className="text-base sm:text-lg font-bold text-green-600">
                          {receipt.totalPrice.toFixed(0)} {receipt.currency}
                        </p>
                      </div>
                      <ChevronRight
                        className={`
                          w-5 h-5
                          ${isDarkMode ? "text-gray-600" : "text-gray-400"}
                        `}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {/* Load More Indicator */}
              {isLoading && !isInitialLoad && (
                <div className="flex justify-center py-6">
                  <div className="animate-spin w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full"></div>
                </div>
              )}

              {/* No More Results */}
              {!hasMore && receipts.length > 0 && (
                <div className="text-center py-6">
                  <p
                    className={`
                      text-xs sm:text-sm
                      ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                    `}
                  >
                    {l("Receipts.noMoreReceipts") || "No more receipts to load"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
