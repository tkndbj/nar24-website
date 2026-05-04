"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "@/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  UtensilsCrossed,
} from "lucide-react";
import {
  doc,
  getDoc,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { useUser } from "@/context/UserProvider";
import { db } from "@/lib/firebase";
import {
  FoodCartProvider,
  useFoodCartActions,
} from "@/context/FoodCartProvider";

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
const FALLBACK_FAST_POLL_COUNT = 10;
const FALLBACK_FAST_MS = 5_000;
const FALLBACK_SLOW_MS = 10_000;
const FALLBACK_MAX_POLLS = 30; // ~4.5 minutes total cap

const SUCCESS_REDIRECT_DELAY_MS = 2_000;

type PaymentStatus = "pending" | "completed" | "failed" | "timeout";

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
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pending");
  const [successOrderId, setSuccessOrderId] = useState<string>("");

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // URL params from checkout page
  const gatewayUrl = searchParams.get("gatewayUrl");
  const orderNumber = searchParams.get("orderNumber");
  const paymentParamsStr = searchParams.get("paymentParams");

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
    async (orderId: string) => {
      if (resultHandledRef.current) return;
      resultHandledRef.current = true;
      teardownListeners();

      setPaymentStatus("completed");
      setSuccessOrderId(orderId);

      // Non-critical: cart resyncs from Firestore on next page anyway.
      try {
        await clearCart();
      } catch (e) {
        console.warn("[FoodPayment] Cart clear failed (non-critical):", e);
      }

      setTimeout(() => {
        router.push(
          `/food-orders?success=true&orderId=${encodeURIComponent(orderId)}`,
        );
      }, SUCCESS_REDIRECT_DELAY_MS);
    },
    [clearCart, router, teardownListeners],
  );

  const handleFailure = useCallback(
    (message: string) => {
      if (resultHandledRef.current) return;
      resultHandledRef.current = true;
      teardownListeners();

      setPaymentStatus("failed");
      setError(message.trim() || t("paymentFailed"));
    },
    [t, teardownListeners],
  );

  const handleTimeout = useCallback(() => {
    if (resultHandledRef.current) return;
    resultHandledRef.current = true;
    teardownListeners();

    setPaymentStatus("timeout");
    setError(t("paymentTimeout"));
  }, [t, teardownListeners]);

  const handleStatusDoc = useCallback(
    (data: DocumentData) => {
      if (resultHandledRef.current) return;
      const s = typeof data.status === "string" ? data.status : undefined;
      switch (s) {
        case STATUS.COMPLETED:
          void handleSuccess(
            typeof data.orderId === "string" ? data.orderId : "",
          );
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
    const check = () =>
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // ── Firestore real-time listener (primary signal) ───────────────────────
  useEffect(() => {
    if (!orderNumber) return;

    const ref = doc(db, "pendingFoodPayments", orderNumber);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists() || resultHandledRef.current) return;
        const data = snap.data();
        if (data) handleStatusDocRef.current(data);
      },
      (err) => {
        console.warn("[FoodPayment] Firestore listener error:", err);
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

  // ── Slow fallback poll ──────────────────────────────────────────────────
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
          const snap = await getDoc(
            doc(db, "pendingFoodPayments", orderNumber),
          );
          if (snap.exists() && !resultHandledRef.current) {
            const data = snap.data();
            if (data) handleStatusDocRef.current(data);
          }
        } catch (err) {
          console.warn("[FoodPayment] Fallback poll error:", err);
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
    if (!gatewayUrl || !orderNumber || !paymentParamsStr) {
      setError(t("missingPaymentInfo"));
      setIsLoading(false);
      return;
    }
    if (formSubmittedRef.current) return;
    formSubmittedRef.current = true;

    let form: HTMLFormElement | null = null;

    try {
      const paymentParams = JSON.parse(paymentParamsStr);

      form = document.createElement("form");
      form.method = "POST";
      form.action = gatewayUrl;
      form.target = "food-payment-iframe";
      form.style.display = "none";

      Object.entries(paymentParams).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form!.appendChild(input);
      });

      document.body.appendChild(form);
    } catch (err) {
      console.error("[FoodPayment] Form build error:", err);
      setError(t("paymentError"));
      setIsLoading(false);
      return;
    }

    const submitTimer = setTimeout(() => {
      try {
        form!.submit();
      } catch (err) {
        console.error("[FoodPayment] Form submit error:", err);
        setError(t("paymentError"));
      }
      setIsLoading(false);
    }, 1200);

    const removeTimer = setTimeout(() => {
      if (form?.parentNode) form.parentNode.removeChild(form);
    }, 2200);

    return () => {
      clearTimeout(submitTimer);
      clearTimeout(removeTimer);
      if (form?.parentNode) form.parentNode.removeChild(form);
    };
  }, [gatewayUrl, orderNumber, paymentParamsStr, t]);

  // ── Final unmount safety net ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      teardownListeners();
    };
  }, [teardownListeners]);

  // ── Cancel handler ──────────────────────────────────────────────────────
  const handleCancel = () => {
    if (confirm(t("cancelPaymentConfirm"))) {
      teardownListeners();
      router.back();
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
      <div
        className={`min-h-screen flex items-center justify-center ${bgClass}`}
      >
        <div className="text-center max-w-md p-8">
          <AlertCircle size={64} className="mx-auto mb-4 text-red-500" />
          <h2
            className={`text-2xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
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
      <div
        className={`min-h-screen flex items-center justify-center ${bgClass}`}
      >
        <div className="text-center max-w-md p-8">
          <div className="w-24 h-24 mx-auto mb-6 bg-green-500/15 rounded-full flex items-center justify-center">
            <CheckCircle2 size={48} className="text-green-500" />
          </div>
          <h2
            className={`text-2xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("paymentSuccessful")}
          </h2>
          <p
            className={`mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
          >
            {t("orderSentToRestaurant")}
          </p>
          {successOrderId && (
            <p
              className={`text-xs mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
            >
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
      <div
        className={`min-h-screen flex items-center justify-center ${bgClass}`}
      >
        <div className="text-center max-w-md p-8">
          <AlertCircle size={64} className="mx-auto mb-4 text-red-500" />
          <h2
            className={`text-2xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
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
                <h1
                  className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
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
          <div
            className={`flex items-center justify-center gap-2 text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
          >
            <Lock size={14} className="text-green-500" />
            <span>{t("secureConnectionSSL")}</span>
          </div>
          <p
            className={`mt-1.5 text-xs ${isDarkMode ? "text-gray-600" : "text-gray-500"}`}
          >
            {t("paymentProcessedByIsbank")}
          </p>
        </div>
      </div>
    </div>
  );
}
