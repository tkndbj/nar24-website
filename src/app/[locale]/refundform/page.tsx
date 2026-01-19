"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserProvider";
import {
  ArrowLeft,
  FileText,
  User,
  Mail,
  Receipt,
  MessageSquare,
  Send,
  ExternalLink,
  X,
  CheckCircle,
  Clock,
  Image as ImageIcon,
  Info,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  collection,
  addDoc,
  Timestamp,
  query as firestoreQuery,
  where,
  orderBy as firestoreOrderBy,
  limit as firestoreLimit,
  startAfter,
  getDocs,
  collectionGroup,
  DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// Define interfaces for proper typing
interface OrderData {
  productName?: string;
  price?: number;
  currency?: string;
  quantity?: number;
  sellerName?: string;
  selectedColorImage?: string;
  productImage?: string;
  timestamp?: Timestamp;
  [key: string]: string | number | boolean | Timestamp | undefined; // Allow additional properties from Firestore
}

interface Order {
  id: string;
  data: OrderData;
}

export default function RefundFormPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [receiptNo, setReceiptNo] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const { user, profileData, isLoading: authLoading } = useUser();
  const router = useRouter();
  const t = useTranslations();

  // Order selection state
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [, setSelectedOrderData] = useState<OrderData | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasReachedEnd, setHasReachedEnd] = useState(false);
  const [loadedOrderIds, setLoadedOrderIds] = useState<Set<string>>(new Set());

  const PAGE_SIZE = 15;

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

  // Redirect if not authenticated (only after auth state is determined)
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const loadOrders = async (isInitial: boolean = false) => {
    if (!user?.uid) return;

    if (isInitial) {
      setIsLoadingOrders(true);
      setOrders([]);
      setLoadedOrderIds(new Set());
      setLastDoc(null);
      setHasReachedEnd(false);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const itemsRef = collectionGroup(db, "items");
      let q = firestoreQuery(
        itemsRef,
        where("buyerId", "==", user.uid),
        firestoreOrderBy("timestamp", "desc"),
        firestoreLimit(PAGE_SIZE)
      );

      if (!isInitial && lastDoc) {
        q = firestoreQuery(q, startAfter(lastDoc));
      }

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setHasReachedEnd(true);
        // Add this: ensure orders are cleared when empty on initial load
        if (isInitial) {
          setOrders([]);
        }
        return;
      }

      const newOrders = snapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data(),
      }));

      // Simplified logic - always check for duplicates
      if (isInitial) {
        // For initial load, just set the new orders
        setOrders(newOrders);
        const newIds = new Set(newOrders.map((order) => order.id));
        setLoadedOrderIds(newIds);
      } else {
        // For pagination, filter out duplicates
        const newUniqueOrders = newOrders.filter(
          (order) => !loadedOrderIds.has(order.id)
        );
        setOrders((prev) => [...prev, ...newUniqueOrders]);
        const newIds = new Set([
          ...loadedOrderIds,
          ...newUniqueOrders.map((o) => o.id),
        ]);
        setLoadedOrderIds(newIds);
      }

      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasReachedEnd(snapshot.docs.length < PAGE_SIZE);
    } catch (error) {
      console.error("Error loading orders:", error);
    } finally {
      setIsLoadingOrders(false);
      setIsLoadingMore(false);
    }
  };

  const handleOpenOrderModal = () => {
    setShowOrderModal(true);
    loadOrders(true);
  };

  const handleSelectOrder = (orderId: string, orderData: OrderData) => {
    if (selectedOrderId === orderId) {
      setSelectedOrderId(null);
      setSelectedOrderData(null);
    } else {
      setSelectedOrderId(orderId);
      setSelectedOrderData(orderData);
    }
  };

  const handleConfirmOrder = () => {
    if (selectedOrderId) {
      setReceiptNo(selectedOrderId);
      setShowOrderModal(false);
      if (errors.receiptNo) {
        setErrors({ ...errors, receiptNo: "" });
      }
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!receiptNo.trim()) {
      newErrors.receiptNo = t("RefundForm.receiptNoRequired");
    }

    if (!description.trim()) {
      newErrors.description = t("RefundForm.descriptionRequired");
    } else if (description.trim().length < 20) {
      newErrors.description = t("RefundForm.descriptionTooShort");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await addDoc(collection(db, "refund-forms"), {
        userId: user.uid,
        displayName: profileData?.displayName || "",
        email: profileData?.email || user.email || "",
        receiptNo: receiptNo.trim(),
        description: description.trim(),
        status: "pending",
        createdAt: Timestamp.now(),
      });

      setShowSuccessModal(true);

      setTimeout(() => {
        setReceiptNo("");
        setDescription("");
        setErrors({});
        setShowSuccessModal(false);
        router.back();
      }, 2500);
    } catch (error) {
      console.error("Error submitting refund request:", error);
      alert(t("RefundForm.submitError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading while auth state is being determined
  if (authLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  const formatDate = (timestamp: Timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    return new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

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
              {t("RefundForm.title")}
            </h1>
            <div className="w-9" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* Header Section */}
        <div className="mb-6 md:mb-8">
          <div
            className={`rounded-2xl md:rounded-3xl p-6 md:p-8 text-center ${
              isDarkMode
                ? "bg-gradient-to-br from-orange-900/20 to-pink-900/20"
                : "bg-gradient-to-br from-orange-50 to-pink-50"
            }`}
          >
            <div className="flex justify-center mb-4">
              <div
                className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center ${
                  isDarkMode ? "bg-gray-800" : "bg-white"
                } shadow-lg`}
              >
                <FileText className="w-8 h-8 md:w-10 md:h-10 text-orange-500" />
              </div>
            </div>
            <h2
              className={`text-xl md:text-2xl font-bold mb-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("RefundForm.headerTitle")}
            </h2>
            <p
              className={`text-sm md:text-base ${
                isDarkMode ? "text-gray-300" : "text-gray-600"
              }`}
            >
              {t("RefundForm.headerSubtitle")}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name Field */}
          <div
            className={`rounded-xl md:rounded-2xl p-4 md:p-6 ${
              isDarkMode
                ? "bg-gray-800 border border-gray-700"
                : "bg-white border border-gray-100"
            } shadow-sm`}
          >
            <label
              className={`flex items-center gap-2 text-sm font-semibold mb-3 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              <User className="w-4 h-4 text-orange-500" />
              {t("RefundForm.nameLabel")}
            </label>
            <input
              type="text"
              value={profileData?.displayName || t("RefundForm.noName")}
              disabled
              className={`w-full px-4 py-3 rounded-lg text-sm md:text-base transition-colors ${
                isDarkMode
                  ? "bg-gray-700 text-gray-400 border-gray-600"
                  : "bg-gray-100 text-gray-600 border-gray-200"
              } border cursor-not-allowed`}
            />
          </div>

          {/* Email Field */}
          <div
            className={`rounded-xl md:rounded-2xl p-4 md:p-6 ${
              isDarkMode
                ? "bg-gray-800 border border-gray-700"
                : "bg-white border border-gray-100"
            } shadow-sm`}
          >
            <label
              className={`flex items-center gap-2 text-sm font-semibold mb-3 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              <Mail className="w-4 h-4 text-orange-500" />
              {t("RefundForm.emailLabel")}
            </label>
            <input
              type="email"
              value={profileData?.email || user.email || ""}
              disabled
              className={`w-full px-4 py-3 rounded-lg text-sm md:text-base transition-colors ${
                isDarkMode
                  ? "bg-gray-700 text-gray-400 border-gray-600"
                  : "bg-gray-100 text-gray-600 border-gray-200"
              } border cursor-not-allowed`}
            />
          </div>

          {/* Receipt Number Field */}
          <div
            className={`rounded-xl md:rounded-2xl p-4 md:p-6 ${
              isDarkMode
                ? "bg-gray-800 border border-gray-700"
                : "bg-white border border-gray-100"
            } shadow-sm`}
          >
            <label
              className={`flex items-center gap-2 text-sm font-semibold mb-3 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              <Receipt className="w-4 h-4 text-orange-500" />
              {t("RefundForm.receiptNoLabel")}
              <button
                type="button"
                onClick={handleOpenOrderModal}
                className="ml-auto flex items-center gap-1 text-xs font-medium text-orange-500 hover:text-orange-600 transition-colors"
              >
                {t("RefundForm.selectOrder")}
                <ExternalLink className="w-3 h-3" />
              </button>
            </label>
            <input
              type="text"
              value={receiptNo}
              readOnly
              placeholder={t("RefundForm.receiptNoPlaceholder")}
              className={`w-full px-4 py-3 rounded-lg text-sm md:text-base transition-colors cursor-pointer ${
                isDarkMode
                  ? "bg-gray-700 text-white border-gray-600 placeholder-gray-500"
                  : "bg-gray-100 text-gray-900 border-gray-300 placeholder-gray-400"
              } border focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                errors.receiptNo ? "border-red-500" : ""
              }`}
              onClick={handleOpenOrderModal}
            />
            {errors.receiptNo && (
              <p className="mt-2 text-xs md:text-sm text-red-500">
                {errors.receiptNo}
              </p>
            )}
          </div>

          {/* Description Field */}
          <div
            className={`rounded-xl md:rounded-2xl p-4 md:p-6 ${
              isDarkMode
                ? "bg-gray-800 border border-gray-700"
                : "bg-white border border-gray-100"
            } shadow-sm`}
          >
            <label
              className={`flex items-center gap-2 text-sm font-semibold mb-3 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              <MessageSquare className="w-4 h-4 text-orange-500" />
              {t("RefundForm.descriptionLabel")}
            </label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) {
                  setErrors({ ...errors, description: "" });
                }
              }}
              placeholder={t("RefundForm.descriptionPlaceholder")}
              rows={6}
              className={`w-full px-4 py-3 rounded-lg text-sm md:text-base transition-colors resize-none ${
                isDarkMode
                  ? "bg-gray-700 text-white border-gray-600 placeholder-gray-500"
                  : "bg-white text-gray-900 border-gray-300 placeholder-gray-400"
              } border focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                errors.description ? "border-red-500" : ""
              }`}
            />
            <div className="flex items-center justify-between mt-2">
              {errors.description ? (
                <p className="text-xs md:text-sm text-red-500">
                  {errors.description}
                </p>
              ) : (
                <p
                  className={`text-xs md:text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  {t("RefundForm.descriptionHelper")}
                </p>
              )}
              <span
                className={`text-xs ${
                  description.length < 20
                    ? "text-red-500"
                    : isDarkMode
                    ? "text-gray-400"
                    : "text-gray-500"
                }`}
              >
                {description.length}/20
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold text-white transition-all duration-200 ${
              isSubmitting
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 shadow-lg hover:shadow-xl active:scale-95"
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                {t("RefundForm.submitting")}
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                {t("RefundForm.submitButton")}
              </>
            )}
          </button>
        </form>

        {/* Info Section */}
        <div
          className={`mt-6 rounded-xl p-4 ${
            isDarkMode
              ? "bg-blue-900/20 border border-blue-800"
              : "bg-blue-50 border border-blue-200"
          }`}
        >
          <p
            className={`text-xs md:text-sm ${
              isDarkMode ? "text-blue-300" : "text-blue-800"
            }`}
          >
            {t("RefundForm.infoMessage")}
          </p>
        </div>

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div
              className={`${
                isDarkMode ? "bg-gray-800" : "bg-white"
              } rounded-2xl p-8 max-w-md w-full shadow-2xl transform transition-all`}
            >
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                  <svg
                    className="h-8 w-8 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h3
                  className={`text-xl font-bold mb-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("RefundForm.successTitle")}
                </h3>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  {t("RefundForm.submitSuccess")}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Order Selection Modal */}
        {showOrderModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div
              className={`${
                isDarkMode ? "bg-gray-800" : "bg-white"
              } rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl`}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-700">
                <h2
                  className={`text-xl font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("RefundForm.selectOrderTitle")}
                </h2>
                <button
                  onClick={() => setShowOrderModal(false)}
                  className={`p-2 rounded-lg transition-colors ${
                    isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                  }`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Info Banner */}
              <div
                className={`m-6 p-4 rounded-lg flex items-start gap-3 ${
                  isDarkMode
                    ? "bg-orange-900/20 border border-orange-800"
                    : "bg-orange-50 border border-orange-200"
                }`}
              >
                <Info className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-orange-300" : "text-orange-800"
                  }`}
                >
                  {t("RefundForm.selectOrderInfo")}
                </p>
              </div>

              {/* Orders List */}
              <div className="flex-1 overflow-y-auto px-6">
                {isLoadingOrders ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent" />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ImageIcon
                      className={`w-16 h-16 mb-4 ${
                        isDarkMode ? "text-gray-600" : "text-gray-400"
                      }`}
                    />
                    <p
                      className={`text-base font-medium mb-2 ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {t("RefundForm.noOrders")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 pb-6">
                    {orders.map((order) => {
                      const isSelected = selectedOrderId === order.id;
                      const orderData = order.data;
                      const productName =
                        orderData.productName || "Unknown Product";
                      const price = orderData.price || 0;
                      const currency = orderData.currency || "TL";
                      const quantity = orderData.quantity || 1;
                      const sellerName =
                        orderData.sellerName || "Unknown Seller";
                      const imageUrl =
                        orderData.selectedColorImage ||
                        orderData.productImage ||
                        "";

                      return (
                        <div
                          key={order.id}
                          onClick={() => handleSelectOrder(order.id, orderData)}
                          className={`rounded-xl p-3 cursor-pointer transition-all ${
                            isSelected
                              ? "bg-orange-500/10 border-2 border-orange-500"
                              : isDarkMode
                              ? "bg-gray-700 border border-gray-600 hover:bg-gray-600"
                              : "bg-gray-50 border border-gray-200 hover:bg-gray-100"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Product Image */}
                            <div
                              className={`w-20 h-20 rounded-lg flex-shrink-0 ${
                                isDarkMode ? "bg-gray-600" : "bg-gray-200"
                              } overflow-hidden`}
                            >
                              {imageUrl ? (
                                <img
                                  src={imageUrl}
                                  alt={productName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ImageIcon className="w-8 h-8 text-gray-400" />
                                </div>
                              )}
                            </div>

                            {/* Order Details */}
                            <div className="flex-1 min-w-0">
                              <h3
                                className={`font-semibold text-sm mb-1 line-clamp-2 ${
                                  isDarkMode ? "text-white" : "text-gray-900"
                                }`}
                              >
                                {productName}
                              </h3>
                              <p
                                className={`text-xs mb-1 ${
                                  isDarkMode ? "text-gray-400" : "text-gray-600"
                                }`}
                              >
                                {sellerName}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-orange-500">
                                  {price.toFixed(2)} {currency}
                                </span>
                                {quantity > 1 && (
                                  <span className="px-2 py-0.5 bg-orange-500/20 text-orange-500 text-xs font-semibold rounded">
                                    x{quantity}
                                  </span>
                                )}
                              </div>
                              {orderData.timestamp && (
                                <div
                                  className={`flex items-center gap-1 mt-1 text-xs ${
                                    isDarkMode
                                      ? "text-gray-500"
                                      : "text-gray-500"
                                  }`}
                                >
                                  <Clock className="w-3 h-3" />
                                  {formatDate(orderData.timestamp)}
                                </div>
                              )}
                            </div>

                            {/* Selection Indicator */}
                            <div
                              className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center border-2 ${
                                isSelected
                                  ? "bg-orange-500 border-orange-500"
                                  : isDarkMode
                                  ? "border-gray-500"
                                  : "border-gray-400"
                              }`}
                            >
                              {isSelected && (
                                <CheckCircle className="w-4 h-4 text-white" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Load More */}
                    {!hasReachedEnd && (
                      <button
                        onClick={() => loadOrders(false)}
                        disabled={isLoadingMore}
                        className={`w-full py-3 rounded-lg font-medium transition-colors ${
                          isDarkMode
                            ? "bg-gray-700 hover:bg-gray-600 text-white"
                            : "bg-gray-100 hover:bg-gray-200 text-gray-900"
                        } ${
                          isLoadingMore ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        {isLoadingMore ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-orange-500 border-t-transparent" />
                            {t("RefundForm.loading")}
                          </div>
                        ) : (
                          t("RefundForm.loadMore")
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              {selectedOrderId && (
                <div
                  className={`p-6 border-t ${
                    isDarkMode ? "border-gray-700" : "border-gray-200"
                  }`}
                >
                  <button
                    onClick={handleConfirmOrder}
                    className="w-full py-4 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-95"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      {t("RefundForm.confirmSelection")}
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
