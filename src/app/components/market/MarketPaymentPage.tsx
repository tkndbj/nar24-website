// components/market/MarketPaymentPage.tsx
//
// Web port of lib/screens/market/isbank_market_payment_screen.dart.
//
// Flow (matches Flutter):
//   1. Read gatewayUrl / orderNumber / paymentParams from URL search params.
//   2. Mount a hidden <iframe> and POST-submit a form with paymentParams
//      targeting the iframe — the gateway's 3DS page loads inside it.
//   3. Subscribe to Firestore `pendingMarketPayments/{orderNumber}` for
//      real-time status updates (the primary signal).
//   4. Additionally run a fallback poll every 5s (first 10 polls) then 10s,
//      for up to ~4.5 minutes. This covers the rare case where Firestore
//      listener never fires (stale tab, network glitch).
//   5. On `completed` → clear cart, show success, redirect to orders page.
//   6. On `payment_failed` / `hash_verification_failed` →
//      show error with retry + return actions.
//   7. On `payment_succeeded_order_failed` → show localized error (payment
//      went through but order creation failed — user needs support).
//
// Intentional web deviations from Flutter:
//   • InAppWebView → <iframe> with form.target, sandboxed.
//     Gateway callback (deep-link scheme on mobile) is replaced by the
//     server writing to Firestore — which the listener already watches.
//   • AlertDialog → proper modal with aria-modal, Escape, body scroll lock.
//   • robots: noindex on the route (payment URLs shouldn't get crawled).
//
// Input contract: the checkout page MUST pass params via URL, e.g.
//   router.push(`/isbankmarketpayment?gatewayUrl=${encodeURIComponent(url)}` +
//               `&orderNumber=${encodeURIComponent(num)}` +
//               `&paymentParams=${encodeURIComponent(JSON.stringify(params))}`)
// See the follow-up note for updating the previously-built checkout code.

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  doc,
  getDoc,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  ShoppingBag,
  X,
} from "lucide-react";

import { db } from "@/lib/firebase";
import { useTheme } from "@/hooks/useTheme";
import { useMarketCart } from "@/context/MarketCartProvider";

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════════════

/** Must match the <iframe name> below so the POSTed form targets it. */
const IFRAME_NAME = "market-payment-iframe";

/** How long we show the success state before redirecting to /market-orders. */
const SUCCESS_REDIRECT_DELAY_MS = 2_000;

/** Iframe fallback: if onLoad never fires, hide the overlay anyway. */
const IFRAME_LOAD_TIMEOUT_MS = 8_000;

/** Firestore status values — kept in sync with the Cloud Functions. */
const STATUS = {
  COMPLETED: "completed",
  PAYMENT_FAILED: "payment_failed",
  HASH_FAILED: "hash_verification_failed",
  PAYMENT_OK_ORDER_FAILED: "payment_succeeded_order_failed",
} as const;

/** Fallback polling schedule (mirrors Flutter). */
const FALLBACK_FAST_POLL_COUNT = 10; // first 10 polls at FAST_MS
const FALLBACK_FAST_MS = 5_000;
const FALLBACK_SLOW_MS = 10_000;
const FALLBACK_MAX_POLLS = 30;

type PaymentStatus = "pending" | "completed" | "failed" | "timeout";

// ════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ════════════════════════════════════════════════════════════════════════════

export default function MarketPaymentPage() {
  const t = useTranslations("market");
  const isDarkMode = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const cart = useMarketCart();

  // ── Params ────────────────────────────────────────────────────────────────
  const gatewayUrl = searchParams.get("gatewayUrl") ?? "";
  const orderNumber = searchParams.get("orderNumber") ?? "";
  const paymentParamsStr = searchParams.get("paymentParams") ?? "";

  const paymentParams = useMemo<Record<string, string> | null>(() => {
    if (!paymentParamsStr) return null;
    try {
      const parsed = JSON.parse(paymentParamsStr);
      if (!parsed || typeof parsed !== "object") return null;
      const result: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) result[k] = String(v);
      return result;
    } catch {
      return null;
    }
  }, [paymentParamsStr]);

  const missingParams = !gatewayUrl || !orderNumber || !paymentParams;

  // ── State ────────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<PaymentStatus>("pending");
  const [error, setError] = useState<string | null>(null);
  const [successOrderId, setSuccessOrderId] = useState("");
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // ── Refs (so effects don't cascade on handler identity) ──────────────────
  const resultHandledRef = useRef(false);
  const formSubmittedRef = useRef(false);
  const firestoreUnsubRef = useRef<(() => void) | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackCountRef = useRef(0);

  // ── Cleanup helpers ──────────────────────────────────────────────────────

  const teardownListeners = useCallback(() => {
    firestoreUnsubRef.current?.();
    firestoreUnsubRef.current = null;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  // ── Result handlers ──────────────────────────────────────────────────────

  const handleSuccess = useCallback(
    async (orderId: string) => {
      if (resultHandledRef.current) return;
      resultHandledRef.current = true;
      teardownListeners();

      // Non-critical: if this fails the cart will re-sync on next page.
      try {
        await cart.clearCart();
      } catch (err) {
        console.warn("[MarketPayment] Cart clear failed:", err);
      }

      setStatus("completed");
      setSuccessOrderId(orderId);

      setTimeout(() => {
        router.push(
          `/market-orders?success=true&orderId=${encodeURIComponent(
            orderId,
          )}`,
        );
      }, SUCCESS_REDIRECT_DELAY_MS);
    },
    [cart, router, teardownListeners],
  );

  const handleFailure = useCallback(
    (message: string) => {
      if (resultHandledRef.current) return;
      resultHandledRef.current = true;
      teardownListeners();

      setStatus("failed");
      setError(message.trim() || t("paymentFailed"));
    },
    [t, teardownListeners],
  );

  // handleStatusDoc uses the above handlers. We stash the function in a ref
  // so the Firestore subscription doesn't need to re-subscribe on every
  // handler-identity change (which would drop events during the swap).
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
          handleFailure(t("paymentSucceededOrderFailed"));
          break;
        default:
          // pending / processing / unknown — keep waiting
          break;
      }
    },
    [handleSuccess, handleFailure, t],
  );

  const handleStatusDocRef = useRef(handleStatusDoc);
  handleStatusDocRef.current = handleStatusDoc;

  // ── Firestore real-time listener ─────────────────────────────────────────

  useEffect(() => {
    if (missingParams) return;

    const ref = doc(db, "pendingMarketPayments", orderNumber);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists() || resultHandledRef.current) return;
        const data = snap.data();
        if (data) handleStatusDocRef.current(data);
      },
      (err) => {
        console.warn("[MarketPayment] Firestore listener error:", err);
      },
    );
    firestoreUnsubRef.current = unsubscribe;

    return () => {
      unsubscribe();
      if (firestoreUnsubRef.current === unsubscribe) {
        firestoreUnsubRef.current = null;
      }
    };
  }, [missingParams, orderNumber]);

  // ── Fallback polling ─────────────────────────────────────────────────────

  useEffect(() => {
    if (missingParams) return;
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
          if (!resultHandledRef.current) {
            resultHandledRef.current = true;
            setStatus("timeout");
            setError(t("paymentTimeout"));
            firestoreUnsubRef.current?.();
            firestoreUnsubRef.current = null;
          }
          return;
        }

        try {
          const snap = await getDoc(
            doc(db, "pendingMarketPayments", orderNumber),
          );
          if (snap.exists() && !resultHandledRef.current) {
            const data = snap.data();
            if (data) handleStatusDocRef.current(data);
          }
        } catch (err) {
          console.warn("[MarketPayment] Fallback poll error:", err);
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
  }, [missingParams, orderNumber, t]);

  // ── Form POST to iframe ──────────────────────────────────────────────────

  useEffect(() => {
    if (missingParams || !paymentParams) return;
    if (formSubmittedRef.current) return;
    formSubmittedRef.current = true;

    // Short delay so the iframe element is definitely in the DOM.
    const timer = setTimeout(() => {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = gatewayUrl;
      form.target = IFRAME_NAME;
      form.style.display = "none";

      for (const [key, value] of Object.entries(paymentParams)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
      setTimeout(() => form.remove(), 2_000);
    }, 300);

    return () => clearTimeout(timer);
  }, [missingParams, paymentParams, gatewayUrl]);

  // ── Iframe load timeout ──────────────────────────────────────────────────
  // If the gateway hangs or blocks onLoad, hide the overlay anyway so the
  // user isn't staring at a spinner forever. The iframe may be blank — that's
  // the gateway's problem, but it's less scary than an endless loader.

  useEffect(() => {
    if (iframeLoaded) return;
    const t = setTimeout(() => setIframeLoaded(true), IFRAME_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [iframeLoaded]);

  // ── Cancel flow ──────────────────────────────────────────────────────────

  const handleCancelClick = useCallback(() => {
    if (status === "completed") {
      if (successOrderId) {
        router.push(
          `/market-orders?success=true&orderId=${encodeURIComponent(
            successOrderId,
          )}`,
        );
      } else {
        router.back();
      }
      return;
    }
    if (status === "failed" || status === "timeout") {
      router.back();
      return;
    }
    setShowCancelConfirm(true);
  }, [status, successOrderId, router]);

  const confirmCancel = useCallback(() => {
    setShowCancelConfirm(false);
    teardownListeners();
    resultHandledRef.current = true;
    router.back();
  }, [router, teardownListeners]);

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  if (missingParams) {
    return (
      <FullScreenMessage
        isDarkMode={isDarkMode}
        icon={AlertCircle}
        iconClassName="text-red-500"
        iconBgClassName="bg-red-500/15"
        title={t("paymentErrorTitle")}
        subtitle={t("paymentInfoMissing")}
        primaryAction={{
          label: t("paymentGoBack"),
          onClick: () => router.back(),
        }}
      />
    );
  }

  if (status === "completed") {
    return (
      <FullScreenMessage
        isDarkMode={isDarkMode}
        icon={CheckCircle2}
        iconClassName="text-emerald-500"
        iconBgClassName="bg-emerald-500/15"
        title={t("paymentSuccessTitle")}
        subtitle={t("paymentOrderReceived")}
        trailing={
          successOrderId ? (
            <p
              className={`mt-3 text-[11px] ${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              }`}
            >
              {t("paymentOrderLabel")}:{" "}
              <span className="font-mono tabular-nums">
                {successOrderId.slice(0, 8).toUpperCase()}
              </span>
            </p>
          ) : null
        }
        footer={
          <div className="flex items-center justify-center gap-2 text-emerald-600">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
            <span className="text-sm font-medium">
              {t("paymentRedirecting")}
            </span>
          </div>
        }
      />
    );
  }

  if (status === "failed" || status === "timeout") {
    return (
      <FullScreenMessage
        isDarkMode={isDarkMode}
        icon={AlertCircle}
        iconClassName="text-red-500"
        iconBgClassName="bg-red-500/15"
        title={
          status === "timeout"
            ? t("paymentTimeoutTitle")
            : t("paymentFailedTitle")
        }
        subtitle={error ?? t("paymentProcessingError")}
        primaryAction={{
          label: t("paymentTryAgain"),
          onClick: () => router.back(),
        }}
        secondaryAction={{
          label: t("paymentReturnToMarket"),
          href: "/market-categories",
        }}
      />
    );
  }

  // ── Active payment flow ──────────────────────────────────────────────────

  return (
    <main
      className={`min-h-screen flex flex-col ${
        isDarkMode ? "bg-[#111827]" : "bg-[#F0FDF4]"
      }`}
    >
      <PaymentHeader
        isDarkMode={isDarkMode}
        onCancel={handleCancelClick}
      />

      <div className="flex-1 px-3 sm:px-4 pt-3 pb-2">
        <div
          className={`relative h-full rounded-2xl overflow-hidden border shadow-lg ${
            isDarkMode
              ? "bg-[#1F2937] border-gray-700/50"
              : "bg-white border-gray-200"
          }`}
        >
          <iframe
            name={IFRAME_NAME}
            title={t("paymentSecureTitle")}
            className="w-full h-full block"
            style={{ minHeight: "480px" }}
            sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation"
            onLoad={() => setIframeLoaded(true)}
          />

          {!iframeLoaded && (
            <LoadingOverlay isDarkMode={isDarkMode} />
          )}
        </div>
      </div>

      <footer className="px-4 pb-3 pt-1">
        <div className="flex items-center justify-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-emerald-600" aria-hidden />
          <span
            className={`text-xs ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {t("paymentSecureSsl")}
          </span>
        </div>
        <p
          className={`mt-0.5 text-center text-[11px] ${
            isDarkMode ? "text-gray-600" : "text-gray-400"
          }`}
        >
          {t("paymentIsbankInfrastructure")}
        </p>
      </footer>

      <CancelConfirmDialog
        open={showCancelConfirm}
        isDarkMode={isDarkMode}
        onKeepPaying={() => setShowCancelConfirm(false)}
        onConfirmCancel={confirmCancel}
      />
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// HEADER
// ════════════════════════════════════════════════════════════════════════════

function PaymentHeader({
  isDarkMode,
  onCancel,
}: {
  isDarkMode: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations("market");
  return (
    <header
      className={`sticky top-0 z-10 backdrop-blur-md border-b ${
        isDarkMode
          ? "bg-gray-900/80 border-gray-700/50"
          : "bg-white/80 border-gray-200"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("paymentCancelTitle")}
          className={`p-2 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
            isDarkMode
              ? "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900"
          }`}
        >
          <X className="w-4 h-4" />
        </button>

        <Lock className="w-4 h-4 text-emerald-600" aria-hidden />
        <h1
          className={`flex-1 text-base font-bold truncate ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {t("paymentSecureTitle")}
        </h1>

        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
            isDarkMode
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" aria-hidden />
          {t("paymentHeaderBadge")}
        </span>
      </div>
    </header>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LOADING OVERLAY
// ════════════════════════════════════════════════════════════════════════════

function LoadingOverlay({ isDarkMode: _isDarkMode }: { isDarkMode: boolean }) {
  const t = useTranslations("market");
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-10">
      <div className="text-center">
        <div className="relative inline-flex">
          <div className="w-20 h-20 rounded-full border-4 border-emerald-200/40" />
          <Loader2
            className="absolute inset-0 m-auto w-10 h-10 text-emerald-400 animate-spin"
            aria-hidden
          />
        </div>
        <h2 className="mt-6 text-lg font-semibold text-white">
          {t("paymentLoadingPage")}
        </h2>
        <p className="mt-1 text-sm text-gray-300">{t("paymentPleaseWait")}</p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FULL-SCREEN MESSAGE (success / failure / missing-params)
// ════════════════════════════════════════════════════════════════════════════

function FullScreenMessage({
  isDarkMode,
  icon: Icon,
  iconClassName,
  iconBgClassName,
  title,
  subtitle,
  trailing,
  footer,
  primaryAction,
  secondaryAction,
}: {
  isDarkMode: boolean;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  iconClassName: string;
  iconBgClassName: string;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
  footer?: ReactNode;
  primaryAction?: { label: string; onClick?: () => void; href?: string };
  secondaryAction?: { label: string; onClick?: () => void; href?: string };
}) {
  return (
    <main
      className={`min-h-screen flex items-center justify-center px-4 ${
        isDarkMode ? "bg-[#111827]" : "bg-[#F0FDF4]"
      }`}
    >
      <div className="text-center max-w-md">
        <div
          className={`inline-flex items-center justify-center w-24 h-24 rounded-full ${iconBgClassName}`}
        >
          <Icon className={`w-12 h-12 ${iconClassName}`} aria-hidden />
        </div>

        <h1
          className={`mt-6 text-2xl font-bold ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {title}
        </h1>
        <p
          className={`mt-2 text-sm ${
            isDarkMode ? "text-gray-400" : "text-gray-600"
          }`}
        >
          {subtitle}
        </p>

        {trailing}
        {footer && <div className="mt-5">{footer}</div>}

        {primaryAction && (
          <div className="mt-8 space-y-2">
            <ActionButton action={primaryAction} primary />
            {secondaryAction && (
              <ActionButton action={secondaryAction} primary={false} isDarkMode={isDarkMode} />
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function ActionButton({
  action,
  primary,
  isDarkMode,
}: {
  action: { label: string; onClick?: () => void; href?: string };
  primary: boolean;
  isDarkMode?: boolean;
}) {
  const primaryCls =
    "inline-flex w-full items-center justify-center h-12 rounded-xl bg-[#00A86B] text-white font-bold hover:bg-emerald-700 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2";
  const secondaryCls = `inline-flex w-full items-center justify-center h-10 rounded-xl text-sm font-medium transition-colors ${
    isDarkMode
      ? "text-gray-400 hover:text-white hover:bg-gray-800"
      : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
  }`;
  const cls = primary ? primaryCls : secondaryCls;

  if (action.href) {
    return (
      <Link href={action.href} className={cls}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={cls}>
      {action.label}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CANCEL CONFIRM DIALOG
// ════════════════════════════════════════════════════════════════════════════

function CancelConfirmDialog({
  open,
  isDarkMode,
  onKeepPaying,
  onConfirmCancel,
}: {
  open: boolean;
  isDarkMode: boolean;
  onKeepPaying: () => void;
  onConfirmCancel: () => void;
}) {
  const t = useTranslations("market");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKeepPaying();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onKeepPaying]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-payment-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label={t("paymentCancelContinue")}
        onClick={onKeepPaying}
        className="absolute inset-0 bg-black/50 cursor-default"
      />
      <div
        className={`relative w-full max-w-sm rounded-2xl shadow-xl overflow-hidden ${
          isDarkMode
            ? "bg-[#1F2937] border border-gray-700"
            : "bg-white border border-gray-200"
        }`}
      >
        <div className="px-5 pt-6 pb-4 text-center sm:text-left">
          <h2
            id="cancel-payment-title"
            className={`text-base font-bold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("paymentCancelTitle")}
          </h2>
          <p
            className={`mt-2 text-[13px] leading-relaxed ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {t("paymentCancelBody")}
          </p>
        </div>
        <div
          className={`grid grid-cols-2 gap-3 px-5 py-4 border-t ${
            isDarkMode
              ? "bg-[#1F2937] border-gray-700"
              : "bg-gray-50 border-gray-200"
          }`}
        >
          <button
            type="button"
            onClick={onKeepPaying}
            autoFocus
            className={`h-10 rounded-xl border text-[13px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              isDarkMode
                ? "border-gray-600 text-gray-300 hover:bg-gray-800"
                : "border-gray-300 text-gray-700 hover:bg-gray-100"
            }`}
          >
            {t("paymentCancelContinue")}
          </button>
          <button
            type="button"
            onClick={onConfirmCancel}
            className="h-10 rounded-xl bg-red-500 text-white text-[13px] font-bold hover:bg-red-600 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            {t("paymentCancelConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}