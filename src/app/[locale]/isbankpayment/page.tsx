"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lock, Loader2, AlertCircle, CheckCircle2, X } from "lucide-react";
import {
  doc,
  getDoc,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ════════════════════════════════════════════════════════════════════════════
// Constants
// ════════════════════════════════════════════════════════════════════════════

/** Firestore status values written by the Cloud Functions payment pipeline. */
const STATUS = {
  COMPLETED: "completed",
  PAYMENT_FAILED: "payment_failed",
  HASH_FAILED: "hash_verification_failed",
  PAYMENT_OK_ORDER_FAILED: "payment_succeeded_order_failed",
} as const;

/** Fallback poll schedule — only fires if the Firestore listener is silent. */
const FALLBACK_FAST_POLL_COUNT = 10; // first 10 polls at FAST_MS
const FALLBACK_FAST_MS = 5_000;
const FALLBACK_SLOW_MS = 10_000;
const FALLBACK_MAX_POLLS = 30; // ~4.5 minutes total cap

const SUCCESS_REDIRECT_DELAY_MS = 1_500;
const FAILURE_REDIRECT_DELAY_MS = 3_000;

type PaymentStatus = "pending" | "completed" | "failed" | "timeout";

export default function IsbankPaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("IsbankPayment");

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pending");

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Get params from URL
  const orderNumber = searchParams.get("orderNumber");
  const [paymentData, setPaymentData] = useState<{
    gatewayUrl: string;
    paymentParams: Record<string, string | number>;
  } | null>(null);

  // ── Refs (so effects don't cascade on handler identity) ─────────────────
  const resultHandledRef = useRef(false);
  const formSubmittedRef = useRef(false);
  const firestoreUnsubRef = useRef<(() => void) | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackCountRef = useRef(0);

  // ── Cleanup helper ──────────────────────────────────────────────────────
  const teardownListeners = useCallback(() => {
    firestoreUnsubRef.current?.();
    firestoreUnsubRef.current = null;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  // ── Result handlers (idempotent) ────────────────────────────────────────

  const handleSuccess = useCallback(
    (orderId: string) => {
      if (resultHandledRef.current) return;
      resultHandledRef.current = true;
      teardownListeners();

      // Clear cart hints (real cart is server-side; these are local mirrors).
      try {
        localStorage.removeItem("cartItems");
        localStorage.removeItem("cartTotal");
      } catch {
        /* ignore storage errors */
      }

      setPaymentStatus("completed");

      setTimeout(() => {
        router.replace(
          `/orders?success=true&orderId=${encodeURIComponent(orderId)}`,
        );
      }, SUCCESS_REDIRECT_DELAY_MS);
    },
    [router, teardownListeners],
  );

  const handleFailure = useCallback(
    (message: string) => {
      if (resultHandledRef.current) return;
      resultHandledRef.current = true;
      teardownListeners();

      setPaymentStatus("failed");
      setError(message.trim() || t("paymentFailed"));

      setTimeout(() => {
        router.back();
      }, FAILURE_REDIRECT_DELAY_MS);
    },
    [router, t, teardownListeners],
  );

  const handleTimeout = useCallback(() => {
    if (resultHandledRef.current) return;
    resultHandledRef.current = true;
    teardownListeners();

    setPaymentStatus("timeout");
    setError(t("paymentTimeout"));

    setTimeout(() => {
      router.back();
    }, FAILURE_REDIRECT_DELAY_MS);
  }, [router, t, teardownListeners]);

  // Stash status-handler in a ref so the Firestore subscription doesn't need
  // to re-subscribe whenever a callback identity changes.
  const handleStatusDoc = useCallback(
    (data: DocumentData) => {
      if (resultHandledRef.current) return;
      const s = typeof data.status === "string" ? data.status : undefined;
      switch (s) {
        case STATUS.COMPLETED:
          handleSuccess(typeof data.orderId === "string" ? data.orderId : "");
          break;
        case STATUS.PAYMENT_FAILED:
        case STATUS.HASH_FAILED:
          handleFailure(
            typeof data.errorMessage === "string" ? data.errorMessage : "",
          );
          break;
        case STATUS.PAYMENT_OK_ORDER_FAILED:
          handleFailure(t("paymentFailed"));
          break;
        default:
          // pending / processing — keep waiting
          break;
      }
    },
    [handleSuccess, handleFailure, t],
  );
  const handleStatusDocRef = useRef(handleStatusDoc);
  handleStatusDocRef.current = handleStatusDoc;

  // ── Dark mode observer ──────────────────────────────────────────────────
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // ── Read paymentData from sessionStorage (one-shot) ─────────────────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("isbankPaymentData");
      if (!raw) {
        setError(t("missingPaymentInfo"));
        setIsLoading(false);
        return;
      }
      const data = JSON.parse(raw);
      if (Date.now() - data.timestamp > 15 * 60 * 1000) {
        sessionStorage.removeItem("isbankPaymentData");
        setError(t("missingPaymentInfo"));
        setIsLoading(false);
        return;
      }
      sessionStorage.removeItem("isbankPaymentData");
      setPaymentData({
        gatewayUrl: data.gatewayUrl,
        paymentParams: data.paymentParams,
      });
    } catch {
      setError(t("missingPaymentInfo"));
      setIsLoading(false);
    }
  }, [t]);

  // ── Firestore real-time listener (primary signal) ───────────────────────
  useEffect(() => {
    if (!orderNumber) return;

    const ref = doc(db, "pendingPayments", orderNumber);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists() || resultHandledRef.current) return;
        const data = snap.data();
        if (data) handleStatusDocRef.current(data);
      },
      (err) => {
        // Don't bubble — fallback poll will pick up the result.
        console.warn("[IsbankPayment] Firestore listener error:", err);
      },
    );
    firestoreUnsubRef.current = unsubscribe;

    return () => {
      unsubscribe();
      if (firestoreUnsubRef.current === unsubscribe) {
        firestoreUnsubRef.current = null;
      }
    };
  }, [orderNumber]);

  // ── Slow fallback poll (covers stale-tab / dropped-listener cases) ──────
  useEffect(() => {
    if (!orderNumber) return;
    fallbackCountRef.current = 0;

    const scheduleNext = () => {
      if (resultHandledRef.current) return;

      const delay =
        fallbackCountRef.current < FALLBACK_FAST_POLL_COUNT
          ? FALLBACK_FAST_MS
          : FALLBACK_SLOW_MS;

      fallbackTimerRef.current = setTimeout(async () => {
        if (resultHandledRef.current) return;
        fallbackCountRef.current += 1;

        if (fallbackCountRef.current > FALLBACK_MAX_POLLS) {
          handleTimeout();
          return;
        }

        try {
          const snap = await getDoc(doc(db, "pendingPayments", orderNumber));
          if (snap.exists() && !resultHandledRef.current) {
            const data = snap.data();
            if (data) handleStatusDocRef.current(data);
          }
        } catch (err) {
          console.warn("[IsbankPayment] Fallback poll error:", err);
        }

        if (!resultHandledRef.current) scheduleNext();
      }, delay);
    };

    scheduleNext();

    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [orderNumber, handleTimeout]);

  // ── Form POST to iframe ─────────────────────────────────────────────────
  useEffect(() => {
    if (!paymentData || !orderNumber) return;
    if (formSubmittedRef.current) return;
    formSubmittedRef.current = true;

    const paymentParams = paymentData.paymentParams;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = paymentData.gatewayUrl;
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

    // Short delay so the iframe element is definitely in the DOM.
    const submitTimer = setTimeout(() => {
      try {
        form.submit();
      } catch (err) {
        console.error("[IsbankPayment] Form submit error:", err);
        setError(t("paymentError"));
      }
      setIsLoading(false);
    }, 1500);

    const removeTimer = setTimeout(() => form.remove(), 2500);

    return () => {
      clearTimeout(submitTimer);
      clearTimeout(removeTimer);
      // Form may already be detached — guard.
      if (form.parentNode) form.parentNode.removeChild(form);
    };
  }, [paymentData, orderNumber, t]);

  // ── Final unmount safety net ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      teardownListeners();
    };
  }, [teardownListeners]);

  const handleCancel = () => {
    if (confirm(t("cancelPaymentConfirm"))) {
      teardownListeners();
      router.back();
    }
  };

  if (!paymentData || !orderNumber) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode
            ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
            : "bg-gradient-to-br from-blue-50 via-white to-purple-50"
        }`}
      >
        <div className="text-center max-w-md p-8">
          <AlertCircle size={64} className="mx-auto mb-4 text-red-500" />
          <h2
            className={`text-2xl font-bold mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("paymentError")}
          </h2>
          <p
            className={`mb-6 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
          >
            {error || t("missingPaymentInfo")}
          </p>
          <button
            onClick={() => router.back()}
            className="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
          >
            {t("goBack")}
          </button>
        </div>
      </div>
    );
  }

  // Payment completed successfully
  if (paymentStatus === "completed") {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode
            ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
            : "bg-gradient-to-br from-blue-50 via-white to-purple-50"
        }`}
      >
        <div className="text-center max-w-md p-8">
          <div className="mb-6 relative">
            <div className="w-24 h-24 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
              <CheckCircle2 size={48} className="text-green-500" />
            </div>
          </div>
          <h2
            className={`text-2xl font-bold mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("paymentSuccessful")}
          </h2>
          <p
            className={`mb-6 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
          >
            {t("orderCreatedSuccessfully")}
          </p>
          <Loader2 size={32} className="mx-auto animate-spin text-blue-500" />
        </div>
      </div>
    );
  }

  // Payment failed / timed out
  if (paymentStatus === "failed" || paymentStatus === "timeout" || error) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode
            ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
            : "bg-gradient-to-br from-blue-50 via-white to-purple-50"
        }`}
      >
        <div className="text-center max-w-md p-8">
          <AlertCircle size={64} className="mx-auto mb-4 text-red-500" />
          <h2
            className={`text-2xl font-bold mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {paymentStatus === "timeout"
              ? t("paymentTimeout")
              : t("paymentFailed")}
          </h2>
          <p
            className={`mb-6 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
          >
            {error || t("paymentProcessingError")}
          </p>
          <button
            onClick={() => router.back()}
            className="px-6 py-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
          >
            {t("tryAgain")}
          </button>
        </div>
      </div>
    );
  }

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

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="text-center">
            <div className="relative mb-6">
              <div className="w-20 h-20 border-4 border-blue-200 rounded-full animate-pulse"></div>
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
            title="İşbank Payment"
            className="w-full"
            style={{ height: "calc(100vh - 200px)", minHeight: "600px" }}
            sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation"
          />
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center">
          <div
            className={`flex items-center justify-center space-x-2 text-sm ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            <Lock size={16} className="text-green-500" />
            <span>{t("secureConnectionSSL")}</span>
          </div>
          <p
            className={`mt-2 text-xs ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            {t("paymentProcessedByIsbank")}
          </p>
        </div>
      </div>
    </div>
  );
}
