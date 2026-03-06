"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lock, Loader2, AlertCircle, CheckCircle2, X } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

interface PaymentStatusResponse {
  status: string;
  orderId?: string;
  errorMessage?: string;
}

export default function IsbankPaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("IsbankPayment");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<
    "pending" | "completed" | "failed" | "timeout"
  >("pending");

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollCountRef = useRef(0);
  const isNavigatingRef = useRef(false);

  // Get params from URL
  const gatewayUrl = searchParams.get("gatewayUrl");
  const orderNumber = searchParams.get("orderNumber");
  const paymentParamsStr = searchParams.get("paymentParams");

  // ── Dark mode detection ───────────────────────────────────────────────────────
  useEffect(() => {
    const checkDarkMode = () =>
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // ── Cleanup on unmount ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gatewayUrl || !orderNumber || !paymentParamsStr) {
      setError(t("missingPaymentInfo"));
      setIsLoading(false);
      return;
    }

    submitPaymentForm();
    scheduleNextPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayUrl, orderNumber, paymentParamsStr]);

  // ── Form submission ───────────────────────────────────────────────────────────
  const submitPaymentForm = () => {
    try {
      const paymentParams = JSON.parse(paymentParamsStr!);
      const form = document.createElement("form");
      form.method = "POST";
      form.action = gatewayUrl!;
      form.target = "payment-iframe";
      form.style.display = "none";

      Object.entries(paymentParams).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });

      document.body.appendChild(form);
      setTimeout(() => {
        form.submit();
        setIsLoading(false);
        setTimeout(() => form.remove(), 1000);
      }, 1500);
    } catch (err) {
      setError(t("paymentError"));
      setIsLoading(false);
    }
  };

  // ── Adaptive polling ──────────────────────────────────────────────────────────
  // First 15 polls: every 2s (30s) — bank callback fires here
  // Next 30 polls: every 5s (150s) — ~3 min total, ~45 calls max
  const scheduleNextPoll = useCallback(() => {
    if (!orderNumber) return;
    const count = pollCountRef.current;
    const delay = count < 15 ? 2000 : 5000;

    pollTimerRef.current = setTimeout(async () => {
      pollCountRef.current += 1;

      if (pollCountRef.current > 45) {
        handleTimeout();
        return;
      }

      await checkPaymentStatus();

      // Only reschedule if still pending
      if (!isNavigatingRef.current) {
        scheduleNextPoll();
      }
    }, delay);
  }, [orderNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Status check ─────────────────────────────────────────────────────────────
  const checkPaymentStatus = async () => {
    if (!orderNumber || isNavigatingRef.current) return;

    try {
      const checkStatus = httpsCallable(functions, "checkIsbankPaymentStatus");
      const result = await checkStatus({ orderNumber });
      const data = result.data as PaymentStatusResponse;
      const status = data?.status;

      switch (status) {
        case "completed":
          handlePaymentSuccess(data.orderId ?? "");
          break;

        case "payment_failed":
        case "hash_verification_failed":
          handlePaymentFailed(data.errorMessage ?? t("paymentFailed"));
          break;

        case "payment_succeeded_order_failed":
        case "refunded":
          // Auto-refund has been issued by the backend
          handlePaymentFailed(t("refundIssued"));
          break;

        // 'processing', 'awaiting_3d' — keep waiting
      }
    } catch {
      // Transient error — keep polling
    }
  };

  // ── Success ───────────────────────────────────────────────────────────────────
  const handlePaymentSuccess = (orderId: string) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

    // Clear cart
    localStorage.removeItem("cartItems");
    localStorage.removeItem("cartTotal");

    setPaymentStatus("completed");

    // Navigate after brief success display
    setTimeout(() => {
      router.push(`/orders?success=true&orderId=${orderId}`);
    }, 2000);
  };

  // ── Failure ───────────────────────────────────────────────────────────────────
  const handlePaymentFailed = (errorMessage: string) => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

    setError(errorMessage);
    setPaymentStatus("failed");
    // No auto-redirect — user reads the message and chooses what to do
  };

  // ── Timeout ───────────────────────────────────────────────────────────────────
  const handleTimeout = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;

    setPaymentStatus("timeout");
    setError(t("paymentTimeout"));
  };

  // ── Cancel ────────────────────────────────────────────────────────────────────
  const handleCancel = () => {
    // Payment already resolved — X button should do nothing
    if (isNavigatingRef.current) return;

    if (confirm(t("cancelPaymentConfirm"))) {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      router.back();
    }
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  // Missing params
  if (!gatewayUrl || !orderNumber || !paymentParamsStr) {
    return (
      <FullScreenMessage isDark={isDarkMode}>
        <AlertCircle size={64} className="mx-auto mb-4 text-red-500" />
        <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          {t("paymentError")}
        </h2>
        <p className={`mb-6 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
          {error || t("missingPaymentInfo")}
        </p>
        <button
          onClick={() => router.back()}
          className="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
        >
          {t("goBack")}
        </button>
      </FullScreenMessage>
    );
  }

  // Success
  if (paymentStatus === "completed") {
    return (
      <FullScreenMessage isDark={isDarkMode}>
        <div className="w-24 h-24 mx-auto mb-6 bg-green-500/20 rounded-full flex items-center justify-center">
          <CheckCircle2 size={48} className="text-green-500" />
        </div>
        <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          {t("paymentSuccessful")}
        </h2>
        <p className={`mb-6 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
          {t("orderCreatedSuccessfully")}
        </p>
        <Loader2 size={32} className="mx-auto animate-spin text-blue-500" />
      </FullScreenMessage>
    );
  }

  // Failed or timeout
  if (paymentStatus === "failed" || paymentStatus === "timeout") {
    return (
      <FullScreenMessage isDark={isDarkMode}>
        <AlertCircle size={64} className="mx-auto mb-4 text-red-500" />
        <h2 className={`text-2xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          {paymentStatus === "timeout" ? t("paymentTimeout") : t("paymentFailed")}
        </h2>
        <p className={`mb-6 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
          {error || t("paymentProcessingError")}
        </p>
        <button
          onClick={() => router.back()}
          className="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
        >
          {t("tryAgain")}
        </button>
      </FullScreenMessage>
    );
  }

  // Active payment
  return (
    <div
      className={`min-h-screen ${
        isDarkMode
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
          : "bg-gradient-to-br from-blue-50 via-white to-purple-50"
      }`}
    >
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
            <div className="flex items-center space-x-3 sm:space-x-4">
              <button
                onClick={handleCancel}
                className={`p-2 sm:p-2.5 rounded-xl transition-all duration-200 ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                    : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                }`}
              >
                <X size={20} />
              </button>
              <div className="flex items-center space-x-2">
                <Lock size={20} className="text-green-500" />
                <h1
                  className={`text-lg sm:text-xl font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("securePayment")}
                </h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="text-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 border-4 border-blue-200 rounded-full animate-pulse" />
              <Loader2
                size={40}
                className="absolute inset-0 m-auto animate-spin text-blue-500"
              />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {t("loadingPaymentPage")}
            </h3>
            <p className="text-sm text-gray-300">{t("pleaseWait")}</p>
          </div>
        </div>
      )}

      {/* Payment iframe */}
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
            name="payment-iframe"
            title={t("securePayment")}
            className="w-full"
            style={{ height: "calc(100vh - 200px)", minHeight: "600px" }}
            sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation"
          />
        </div>

        {/* Security notice */}
        <div className="mt-6 text-center">
          <div
            className={`flex items-center justify-center space-x-2 text-sm ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            <Lock size={16} className="text-green-500" />
            <span>{t("secureConnectionSSL")}</span>
          </div>
          <p className={`mt-2 text-xs ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}>
            {t("paymentProcessedByIsbank")}
          </p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// FULL SCREEN MESSAGE — reusable wrapper for success / failed / missing states
// =============================================================================

function FullScreenMessage({
  isDark,
  children,
}: {
  isDark: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`min-h-screen flex items-center justify-center ${
        isDark
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
          : "bg-gradient-to-br from-blue-50 via-white to-purple-50"
      }`}
    >
      <div className="text-center max-w-md p-8">{children}</div>
    </div>
  );
}