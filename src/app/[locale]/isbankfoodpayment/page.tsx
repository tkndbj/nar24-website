"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "@/navigation";
import { useSearchParams } from "next/navigation"; 
import { useTranslations } from "next-intl";
import { Lock, Loader2, AlertCircle, CheckCircle2, X, UtensilsCrossed } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { useUser } from "@/context/UserProvider";
import { db, functions } from "@/lib/firebase";
import { FoodCartProvider, useFoodCartActions } from "@/context/FoodCartProvider";

interface PaymentStatusResponse {
  status: string;
  orderId?: string;
  errorMessage?: string;
}

export default function FoodPaymentPage() {
  const { user } = useUser();
  return (
    <FoodCartProvider user={user} db={db}>
      <FoodPaymentContent />
    </FoodCartProvider>
  );
}

function FoodPaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("foodPayment");
  const { clearCart } = useFoodCartActions();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string>("pending");
  const [successOrderId, setSuccessOrderId] = useState<string>("");

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const statusCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasSubmittedRef = useRef(false);

  // URL params from checkout page
  const gatewayUrl = searchParams.get("gatewayUrl");
  const orderNumber = searchParams.get("orderNumber");
  const paymentParamsStr = searchParams.get("paymentParams");

  // ── Dark mode observer ─────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsDarkMode(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
    };
  }, []);

  // ── Check payment status (single call) ─────────────────────────────
  const checkPaymentStatus = useCallback(async () => {
    if (!orderNumber) return;

    try {
      const checkStatus = httpsCallable(functions, "checkFoodPaymentStatus");
      const result = await checkStatus({ orderNumber });
      const data = result.data as PaymentStatusResponse;
      const status = data?.status;

      if (status === "completed") {
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
          statusCheckIntervalRef.current = null;
        }
        setPaymentStatus("completed");
        setSuccessOrderId(data.orderId || "");

        // Clear the food cart
        try {
          await clearCart();
        } catch (e) {
          console.warn("[FoodPayment] Cart clear failed (non-critical):", e);
        }

        // Navigate after brief success display
        setTimeout(() => {
          router.push(`/food-orders?success=true&orderId=${data.orderId || ""}`);
        }, 2000);
      } else if (
        status === "payment_failed" ||
        status === "hash_verification_failed" ||
        status === "payment_succeeded_order_failed"
      ) {
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
          statusCheckIntervalRef.current = null;
        }
        setPaymentStatus("failed");
        setError(data.errorMessage || t("paymentFailed"));
      }
    } catch (err) {
      // Don't stop polling on transient errors
      console.error("[FoodPayment] Status check error:", err);
    }
  }, [orderNumber, clearCart, router, t]);

  // ── Start polling ──────────────────────────────────────────────────
  const startStatusPolling = useCallback(() => {
    if (!orderNumber || statusCheckIntervalRef.current) return;

    let pollCount = 0;
    const maxPolls = 300; // 5 minutes

    statusCheckIntervalRef.current = setInterval(() => {
      pollCount++;

      if (pollCount > maxPolls) {
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
          statusCheckIntervalRef.current = null;
        }
        setPaymentStatus("timeout");
        setError(t("paymentTimeout"));
        return;
      }

      checkPaymentStatus();
    }, 1000);
  }, [orderNumber, checkPaymentStatus, t]);

  // ── Submit form to iframe ──────────────────────────────────────────
  const submitPaymentForm = useCallback(() => {
    if (!gatewayUrl || !paymentParamsStr || hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    try {
      const paymentParams = JSON.parse(paymentParamsStr);

      const form = document.createElement("form");
      form.method = "POST";
      form.action = gatewayUrl;
      form.target = "food-payment-iframe";
      form.style.display = "none";

      Object.entries(paymentParams).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });

      document.body.appendChild(form);

      // Small delay for iframe to be ready
      setTimeout(() => {
        form.submit();
        setIsLoading(false);
        setTimeout(() => form.remove(), 1000);
      }, 1200);
    } catch (err) {
      console.error("[FoodPayment] Form submit error:", err);
      setError(t("paymentError"));
      setIsLoading(false);
    }
  }, [gatewayUrl, paymentParamsStr, t]);

  // ── Init: submit form + start polling ──────────────────────────────
  useEffect(() => {
    if (!gatewayUrl || !orderNumber || !paymentParamsStr) {
      setError(t("missingPaymentInfo"));
      setIsLoading(false);
      return;
    }

    startStatusPolling();
    submitPaymentForm();
  }, [gatewayUrl, orderNumber, paymentParamsStr, startStatusPolling, submitPaymentForm, t]);

  // ── Cancel handler ─────────────────────────────────────────────────
  const handleCancel = () => {
    if (statusCheckIntervalRef.current) {
      clearInterval(statusCheckIntervalRef.current);
      statusCheckIntervalRef.current = null;
    }

    if (confirm(t("cancelPaymentConfirm"))) {
      router.back();
    } else {
      // Resume polling if user didn't confirm cancel
      startStatusPolling();
    }
  };

  // ── Shared gradient bg ─────────────────────────────────────────────
  const bgClass = isDarkMode
    ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
    : "bg-gradient-to-br from-orange-50 via-white to-amber-50";

  // ════════════════════════════════════════════════════════════════════
  // RENDER: Missing params
  // ════════════════════════════════════════════════════════════════════
  if (!gatewayUrl || !orderNumber || !paymentParamsStr) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bgClass}`}>
        <div className="text-center max-w-md p-8">
          <AlertCircle size={64} className="mx-auto mb-4 text-red-500" />
          <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {t("paymentError")}
          </h2>
          <p className={`mb-6 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            {error || t("missingPaymentInfo")}
          </p>
          <button
            onClick={() => router.back()}
            className="px-6 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors font-semibold"
          >
            {t("goBack")}
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // RENDER: Success
  // ════════════════════════════════════════════════════════════════════
  if (paymentStatus === "completed") {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bgClass}`}>
        <div className="text-center max-w-md p-8">
          <div className="w-24 h-24 mx-auto mb-6 bg-green-500/15 rounded-full flex items-center justify-center">
            <CheckCircle2 size={48} className="text-green-500" />
          </div>
          <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {t("paymentSuccessful")}
          </h2>
          <p className={`mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            {t("orderSentToRestaurant")}
          </p>
          {successOrderId && (
            <p className={`text-xs mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}>
              {t("orderId")}: {successOrderId.substring(0, 8).toUpperCase()}
            </p>
          )}
          <div className="flex items-center justify-center gap-2 text-orange-500">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-medium">{t("redirecting")}</span>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // RENDER: Failed / Timeout
  // ════════════════════════════════════════════════════════════════════
  if (paymentStatus === "failed" || paymentStatus === "timeout" || error) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${bgClass}`}>
        <div className="text-center max-w-md p-8">
          <AlertCircle size={64} className="mx-auto mb-4 text-red-500" />
          <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {paymentStatus === "timeout" ? t("paymentTimeout") : t("paymentFailed")}
          </h2>
          <p className={`mb-6 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            {error || t("paymentProcessingError")}
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => router.back()}
              className="px-6 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors font-semibold"
            >
              {t("tryAgain")}
            </button>
            <button
              onClick={() => router.push("/restaurants")}
              className={`px-6 py-2.5 rounded-xl text-sm transition-colors ${
                isDarkMode
                  ? "text-gray-400 hover:text-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t("backToRestaurants")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════
  // RENDER: Payment iframe (active payment flow)
  // ════════════════════════════════════════════════════════════════════
  return (
    <div className={`min-h-screen ${bgClass}`}>
      {/* Header */}
      <div
        className={`sticky top-0 z-10 border-b backdrop-blur-xl ${
          isDarkMode
            ? "bg-gray-900/80 border-gray-700/50"
            : "bg-white/80 border-gray-200/50"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={handleCancel}
                className={`p-2 rounded-xl transition-colors ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                    : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                }`}
              >
                <X size={20} />
              </button>
              <div className="flex items-center gap-2">
                <Lock size={18} className="text-green-500" />
                <h1 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {t("securePayment")}
                </h1>
              </div>
            </div>

            {/* Food order badge */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                isDarkMode
                  ? "bg-orange-500/15 text-orange-400"
                  : "bg-orange-50 text-orange-600"
              }`}
            >
              <UtensilsCrossed size={14} />
              {t("foodOrder")}
            </div>
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="text-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 border-4 border-orange-200 rounded-full animate-pulse" />
              <Loader2
                size={40}
                className="absolute inset-0 m-auto animate-spin text-orange-500"
              />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {t("loadingPaymentPage")}
            </h3>
            <p className="text-sm text-gray-300">{t("pleaseWait")}</p>
          </div>
        </div>
      )}

      {/* Iframe */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div
          className={`rounded-2xl shadow-2xl border overflow-hidden ${
            isDarkMode
              ? "bg-gray-800/80 border-gray-700/50"
              : "bg-white/80 border-gray-200/50"
          }`}
        >
          <iframe
            ref={iframeRef}
            name="food-payment-iframe"
            title={t("securePayment")}
            className="w-full"
            style={{ height: "calc(100vh - 200px)", minHeight: "600px" }}
            sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation"
          />
        </div>

        {/* Security footer */}
        <div className="mt-6 text-center">
          <div className={`flex items-center justify-center gap-2 text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            <Lock size={14} className="text-green-500" />
            <span>{t("secureConnectionSSL")}</span>
          </div>
          <p className={`mt-1.5 text-xs ${isDarkMode ? "text-gray-600" : "text-gray-500"}`}>
            {t("paymentProcessedByIsbank")}
          </p>
        </div>
      </div>
    </div>
  );
}