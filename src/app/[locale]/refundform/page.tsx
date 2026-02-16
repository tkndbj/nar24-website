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

interface OrderData {
  productName?: string;
  price?: number;
  currency?: string;
  quantity?: number;
  sellerName?: string;
  selectedColorImage?: string;
  productImage?: string;
  timestamp?: Timestamp;
  [key: string]: string | number | boolean | Timestamp | undefined;
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
      if (typeof document !== "undefined")
        setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined")
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  const loadOrders = async (isInitial: boolean = false) => {
    if (!user?.uid) return;
    if (isInitial) {
      setIsLoadingOrders(true);
      setOrders([]);
      setLoadedOrderIds(new Set());
      setLastDoc(null);
      setHasReachedEnd(false);
    } else setIsLoadingMore(true);
    try {
      const itemsRef = collectionGroup(db, "items");
      let q = firestoreQuery(
        itemsRef,
        where("buyerId", "==", user.uid),
        firestoreOrderBy("timestamp", "desc"),
        firestoreLimit(PAGE_SIZE),
      );
      if (!isInitial && lastDoc) q = firestoreQuery(q, startAfter(lastDoc));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setHasReachedEnd(true);
        if (isInitial) setOrders([]);
        return;
      }
      const newOrders = snapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data(),
      }));
      if (isInitial) {
        setOrders(newOrders);
        setLoadedOrderIds(new Set(newOrders.map((o) => o.id)));
      } else {
        const unique = newOrders.filter((o) => !loadedOrderIds.has(o.id));
        setOrders((prev) => [...prev, ...unique]);
        setLoadedOrderIds(
          new Set([...loadedOrderIds, ...unique.map((o) => o.id)]),
        );
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
      if (errors.receiptNo) setErrors({ ...errors, receiptNo: "" });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    if (!receiptNo.trim())
      newErrors.receiptNo = t("RefundForm.receiptNoRequired");
    if (!description.trim())
      newErrors.description = t("RefundForm.descriptionRequired");
    else if (description.trim().length < 20)
      newErrors.description = t("RefundForm.descriptionTooShort");
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !validateForm()) return;
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

  const formatDate = (timestamp: Timestamp) => {
    if (!timestamp) return "";
    return new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(timestamp.toDate());
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (authLoading || !user) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center pt-20 ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
    >
      {/* Sticky Toolbar */}
      <div
        className={`sticky top-14 z-30 border-b ${
          isDarkMode
            ? "bg-gray-900/80 backdrop-blur-xl border-gray-700/80"
            : "bg-white/80 backdrop-blur-xl border-gray-100/80"
        }`}
      >
        <div className="max-w-4xl mx-auto flex items-center gap-3 px-3 sm:px-6 py-3">
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
            {t("RefundForm.title")}
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-3">
        {/* Header Banner */}
        <div
          className={`rounded-2xl p-4 text-center ${isDarkMode ? "bg-orange-900/10 border border-orange-700/30" : "bg-orange-50 border border-orange-100"}`}
        >
          <div
            className={`w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center ${isDarkMode ? "bg-orange-900/30" : "bg-orange-100"}`}
          >
            <FileText className="w-5 h-5 text-orange-500" />
          </div>
          <h2
            className={`text-sm font-bold mb-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("RefundForm.headerTitle")}
          </h2>
          <p
            className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {t("RefundForm.headerSubtitle")}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Name Field */}
          <div
            className={`rounded-2xl border p-4 ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
          >
            <label
              className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              <User className="w-3 h-3 text-orange-500" />
              {t("RefundForm.nameLabel")}
            </label>
            <input
              type="text"
              value={profileData?.displayName || t("RefundForm.noName")}
              disabled
              className={`w-full px-3 py-2 rounded-xl text-sm border cursor-not-allowed ${
                isDarkMode
                  ? "bg-gray-700/50 text-gray-400 border-gray-600"
                  : "bg-gray-50 text-gray-500 border-gray-200"
              }`}
            />
          </div>

          {/* Email Field */}
          <div
            className={`rounded-2xl border p-4 ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
          >
            <label
              className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              <Mail className="w-3 h-3 text-orange-500" />
              {t("RefundForm.emailLabel")}
            </label>
            <input
              type="email"
              value={profileData?.email || user.email || ""}
              disabled
              className={`w-full px-3 py-2 rounded-xl text-sm border cursor-not-allowed ${
                isDarkMode
                  ? "bg-gray-700/50 text-gray-400 border-gray-600"
                  : "bg-gray-50 text-gray-500 border-gray-200"
              }`}
            />
          </div>

          {/* Receipt Number Field */}
          <div
            className={`rounded-2xl border p-4 ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
          >
            <label
              className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              <Receipt className="w-3 h-3 text-orange-500" />
              {t("RefundForm.receiptNoLabel")}
              <button
                type="button"
                onClick={handleOpenOrderModal}
                className="ml-auto flex items-center gap-0.5 text-[11px] font-semibold text-orange-500 hover:text-orange-600 transition-colors normal-case tracking-normal"
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
              onClick={handleOpenOrderModal}
              className={`w-full px-3 py-2 rounded-xl text-sm border cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/20 ${
                isDarkMode
                  ? "bg-gray-700 text-white border-gray-600 placeholder-gray-500"
                  : "bg-gray-50 text-gray-900 border-gray-200 placeholder-gray-400"
              } ${errors.receiptNo ? "border-red-500" : ""}`}
            />
            {errors.receiptNo && (
              <p className="mt-1.5 text-[11px] text-red-500">
                {errors.receiptNo}
              </p>
            )}
          </div>

          {/* Description Field */}
          <div
            className={`rounded-2xl border p-4 ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
          >
            <label
              className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              <MessageSquare className="w-3 h-3 text-orange-500" />
              {t("RefundForm.descriptionLabel")}
            </label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description)
                  setErrors({ ...errors, description: "" });
              }}
              placeholder={t("RefundForm.descriptionPlaceholder")}
              rows={5}
              className={`w-full px-3 py-2 rounded-xl text-sm border resize-none transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/20 ${
                isDarkMode
                  ? "bg-gray-700 text-white border-gray-600 placeholder-gray-500"
                  : "bg-white text-gray-900 border-gray-200 placeholder-gray-400"
              } ${errors.description ? "border-red-500" : ""}`}
            />
            <div className="flex items-center justify-between mt-1.5">
              {errors.description ? (
                <p className="text-[11px] text-red-500">{errors.description}</p>
              ) : (
                <p
                  className={`text-[11px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                >
                  {t("RefundForm.descriptionHelper")}
                </p>
              )}
              <span
                className={`text-[11px] font-mono ${description.length < 20 ? "text-red-500" : isDarkMode ? "text-gray-500" : "text-gray-400"}`}
              >
                {description.length}/20
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 text-white rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t("RefundForm.submitting")}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {t("RefundForm.submitButton")}
              </>
            )}
          </button>
        </form>

        {/* Info Note */}
        <div
          className={`rounded-xl px-3 py-2.5 ${isDarkMode ? "bg-blue-900/10 border border-blue-800/30" : "bg-blue-50 border border-blue-100"}`}
        >
          <p
            className={`text-[11px] ${isDarkMode ? "text-blue-300" : "text-blue-700"}`}
          >
            {t("RefundForm.infoMessage")}
          </p>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className={`rounded-2xl p-6 max-w-sm w-full shadow-2xl ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <div className="text-center">
              <div
                className={`w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center ${isDarkMode ? "bg-green-900/30" : "bg-green-50"}`}
              >
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <h3
                className={`text-sm font-bold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {t("RefundForm.successTitle")}
              </h3>
              <p
                className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
              >
                {t("RefundForm.submitSuccess")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Order Selection Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className={`rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between p-4 border-b ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <h2
                className={`text-base font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {t("RefundForm.selectOrderTitle")}
              </h2>
              <button
                onClick={() => setShowOrderModal(false)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
              >
                <X
                  className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                />
              </button>
            </div>

            {/* Info */}
            <div
              className={`mx-4 mt-3 px-3 py-2.5 rounded-xl border ${isDarkMode ? "bg-orange-900/10 border-orange-700/30" : "bg-orange-50 border-orange-100"}`}
            >
              <div className="flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                <p
                  className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                >
                  {t("RefundForm.selectOrderInfo")}
                </p>
              </div>
            </div>

            {/* Orders */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {isLoadingOrders ? (
                <div className="flex justify-center py-12">
                  <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-12">
                  <ImageIcon
                    className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
                  />
                  <p
                    className={`text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {t("RefundForm.noOrders")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {orders.map((order) => {
                    const isSelected = selectedOrderId === order.id;
                    const od = order.data;
                    const imageUrl =
                      od.selectedColorImage || od.productImage || "";

                    return (
                      <div
                        key={order.id}
                        onClick={() => handleSelectOrder(order.id, od)}
                        className={`rounded-xl px-3 py-2.5 cursor-pointer transition-all ${
                          isSelected
                            ? isDarkMode
                              ? "bg-orange-900/10 border border-orange-700/50"
                              : "bg-orange-50 border border-orange-200"
                            : isDarkMode
                              ? "bg-gray-700/50 border border-gray-600 hover:border-gray-500"
                              : "bg-gray-50/50 border border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Image */}
                          <div
                            className={`w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden ${isDarkMode ? "bg-gray-600" : "bg-gray-100"}`}
                          >
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={od.productName || ""}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon
                                  className={`w-4 h-4 ${isDarkMode ? "text-gray-500" : "text-gray-300"}`}
                                />
                              </div>
                            )}
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <h3
                              className={`text-sm font-semibold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
                            >
                              {od.productName || "Unknown Product"}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span
                                className={`text-xs font-bold ${isDarkMode ? "text-orange-400" : "text-orange-600"}`}
                              >
                                {(od.price || 0).toFixed(2)}{" "}
                                {od.currency || "TL"}
                              </span>
                              {(od.quantity || 1) > 1 && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isDarkMode ? "bg-orange-900/30 text-orange-400" : "bg-orange-50 text-orange-600"}`}
                                >
                                  x{od.quantity}
                                </span>
                              )}
                              {od.timestamp && (
                                <span
                                  className={`flex items-center gap-0.5 text-[11px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                                >
                                  <Clock className="w-3 h-3" />
                                  {formatDate(od.timestamp)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Selection */}
                          <div
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              isSelected
                                ? "bg-orange-500 border-orange-500"
                                : isDarkMode
                                  ? "border-gray-500"
                                  : "border-gray-300"
                            }`}
                          >
                            {isSelected && (
                              <CheckCircle className="w-3 h-3 text-white" />
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
                      className={`w-full py-2.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-50 ${
                        isDarkMode
                          ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {isLoadingMore ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <div className="w-3 h-3 border-2 border-orange-400/30 border-t-orange-500 rounded-full animate-spin" />
                          {t("RefundForm.loading")}
                        </span>
                      ) : (
                        t("RefundForm.loadMore")
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {selectedOrderId && (
              <div
                className={`p-4 border-t ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
              >
                <button
                  onClick={handleConfirmOrder}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  {t("RefundForm.confirmSelection")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
