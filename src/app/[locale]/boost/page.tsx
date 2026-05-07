"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  BarChart3,
  Package,
  CheckCircle,
  Clock,
  CreditCard,
  Rocket,
  Lock,
  RefreshCw,
  AlertCircle,
  X,
  PauseCircle,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslations } from "next-intl";
import SmartImage from "@/app/components/SmartImage";
import { httpsCallable, getFunctions } from "firebase/functions";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const JADE = "#00A86B";
const MINUTES_PER_DAY = 1440;

const STATUS = {
  COMPLETED: "completed",
  PAYMENT_FAILED: "payment_failed",
  HASH_FAILED: "hash_verification_failed",
  PAYMENT_OK_BOOST_FAILED: "payment_succeeded_boost_failed",
} as const;

const FALLBACK_FAST_POLL_COUNT = 10;
const FALLBACK_FAST_MS = 5_000;
const FALLBACK_SLOW_MS = 10_000;
const FALLBACK_MAX_POLLS = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  productName: string;
  imageUrl: string;
  isBoosted: boolean;
}

interface BoostConfig {
  pricePerProductPerDay: number;
  minDurationDays: number;
  maxDurationDays: number;
  maxProducts: number;
  serviceEnabled: boolean;
}

const DEFAULT_CONFIG: BoostConfig = {
  pricePerProductPerDay: 50.0,
  minDurationDays: 1,
  maxDurationDays: 7,
  maxProducts: 5,
  serviceEnabled: true,
};

interface PaymentData {
  gatewayUrl: string;
  paymentParams: Record<string, string>;
  orderNumber: string;
  totalPrice: number;
  itemCount: number;
}

function generateDayOptions(min: number, max: number): number[] {
  const opts: number[] = [];
  for (let i = min; i <= max; i++) opts.push(i);
  if (opts.length === 0) opts.push(min);
  return opts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────────────────────────────────────

function StepIndicator({
  currentStep,
  isDark,
  t,
}: {
  currentStep: number;
  isDark: boolean;
  t: (key: string) => string;
}) {
  const steps = [
    t("boostSelectProductsStep") || "Select Products",
    t("boostSelectDurationStep") || "Select Duration",
    t("boostPaymentStep") || "Payment",
  ];

  return (
    <div className="flex items-start px-5 py-3">
      {steps.map((label, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center" style={{ minWidth: 0 }}>
              <div
                className="w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all"
                style={{
                  borderColor:
                    done || active ? JADE : isDark ? "#4B5563" : "#D1D5DB",
                  backgroundColor: done || active ? `${JADE}1A` : "transparent",
                }}
              >
                {done ? (
                  <CheckCircle
                    className="w-3.5 h-3.5"
                    style={{ color: JADE }}
                  />
                ) : (
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: active
                        ? JADE
                        : isDark
                          ? "#4B5563"
                          : "#D1D5DB",
                    }}
                  />
                )}
              </div>
              <span
                className="text-[10px] mt-1 text-center leading-tight"
                style={{
                  fontWeight: active ? 700 : 500,
                  color: done || active ? JADE : isDark ? "#6B7280" : "#9CA3AF",
                  maxWidth: 60,
                }}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="flex-1 mt-3.5 mx-1"
                style={{
                  height: 1.5,
                  backgroundColor:
                    i < currentStep
                      ? `${JADE}80`
                      : isDark
                        ? "#374151"
                        : "#E5E7EB",
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Duration chip
// ─────────────────────────────────────────────────────────────────────────────

function DurationChip({
  days,
  price,
  kdvRate,
  kdvAmount,
  isSelected,
  isDark,
  t,
  onTap,
}: {
  days: number;
  price: number;
  kdvRate: number;
  kdvAmount: number;
  isSelected: boolean;
  isDark: boolean;
  t: (key: string) => string;
  onTap: () => void;
}) {
  const label =
    days === 1 ? `1 ${t("day") || "day"}` : `${days} ${t("days") || "days"}`;

  return (
    <button
      onClick={onTap}
      className="transition-all text-left"
      style={{
        width: "calc(50% - 5px)",
        padding: "16px 12px",
        borderRadius: 14,
        border: `${isSelected ? 2 : 1.5}px solid ${isSelected ? JADE : isDark ? "#374151" : "#E5E7EB"}`,
        backgroundColor: isSelected
          ? `${JADE}1F`
          : isDark
            ? "#211F31"
            : "#FFFFFF",
        boxShadow: isSelected ? `0 2px 8px ${JADE}26` : "none",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center flex-shrink-0"
          style={{
            borderColor: isSelected ? JADE : "#9CA3AF",
            backgroundColor: isSelected ? JADE : "transparent",
          }}
        >
          {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
        </div>
        <span
          className="text-sm font-bold"
          style={{ color: isSelected ? JADE : isDark ? "#E5E7EB" : "#1F2937" }}
        >
          {label}
        </span>
      </div>
      <span
        className="text-base font-extrabold"
        style={{
          color: isSelected ? JADE : isDark ? "#D1D5DB" : "#374151",
        }}
      >
        {price.toFixed(2)} TL
      </span>
      {kdvRate > 0 && kdvAmount > 0 && (
        <span
          className="block text-[10px] font-medium mt-0.5"
          style={{ color: isSelected ? `${JADE}B3` : "#F97316" }}
        >
          KDV dahil
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PaymentIframe (memoised — must not re-render after mount)
// ─────────────────────────────────────────────────────────────────────────────

const PaymentIframe = React.memo(function PaymentIframe({
  paymentData,
  onLoadComplete,
  t,
}: {
  paymentData: PaymentData;
  onLoadComplete: () => void;
  t: (key: string) => string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!iframeRef.current || initializedRef.current) return;
    const iframe = iframeRef.current;
    const formHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t("securePayment") || "Secure Payment"}</title>
  <style>
    body { margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
      background:linear-gradient(135deg,#00A86B 0%,#007A4E 100%);
      min-height:100vh;display:flex;align-items:center;justify-content:center; }
    .loading-container { text-align:center;color:white;padding:40px; }
    .spinner { width:50px;height:50px;margin:0 auto 20px;border:4px solid rgba(255,255,255,0.3);
      border-top-color:white;border-radius:50%;animation:spin 1s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .loading-text { font-size:18px;font-weight:500;margin:0; }
    .secure-badge { display:inline-flex;align-items:center;gap:8px;
      background:rgba(255,255,255,0.2);padding:8px 16px;border-radius:20px;
      margin-top:20px;font-size:14px; }
    .boost-badge { display:inline-block;background:rgba(255,255,255,0.15);
      padding:6px 14px;border-radius:16px;margin-top:12px;font-size:13px;font-weight:600; }
  </style>
</head>
<body>
  <div class="loading-container">
    <div class="spinner"></div>
    <p class="loading-text">${t("loadingPaymentPage") || "Loading secure payment page..."}</p>
    <div class="boost-badge">🚀 ${t("boostPackage") || "Boost Package"}</div>
    <div class="secure-badge">🔒 ${t("secureConnection") || "Secure Connection"}</div>
  </div>
  <form id="paymentForm" method="post" action="${paymentData.gatewayUrl}">
    ${Object.entries(paymentData.paymentParams)
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}">`)
      .join("\n")}
  </form>
  <script>setTimeout(()=>{document.getElementById('paymentForm').submit();},1500);</script>
</body>
</html>`;

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(formHtml);
      iframeDoc.close();
      initializedRef.current = true;
    }
    const timer = setTimeout(onLoadComplete, 2500);
    return () => clearTimeout(timer);
  }, [paymentData, onLoadComplete, t]);

  return (
    <iframe
      ref={iframeRef}
      id="payment-iframe"
      className="w-full h-full border-0"
      title="Payment Gateway"
      sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation"
    />
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function BoostPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get("productId");
  const { user, isLoading: authLoading } = useUser();
  const t = useTranslations("Boosts");

  // Dark mode
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false,
  );
  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true });
    return () => obs.disconnect();
  }, []);

  // Step: 0 = product selection, 1 = duration selection
  const [currentStep, setCurrentStep] = useState(0);

  // Config (one-time fetch)
  const [config, setConfig] = useState<BoostConfig>(DEFAULT_CONFIG);
  const [dayOptions, setDayOptions] = useState<number[]>(
    generateDayOptions(
      DEFAULT_CONFIG.minDurationDays,
      DEFAULT_CONFIG.maxDurationDays,
    ),
  );

  // Products
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Duration
  const [selectedDays, setSelectedDays] = useState(-1);

  // KDV
  const [kdvRate, setKdvRate] = useState(0);

  // Payment
  const [submitting, setSubmitting] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Listener refs
  const resultHandledRef = useRef(false);
  const firestoreUnsubRef = useRef<(() => void) | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackCountRef = useRef(0);
  // Stash orderNumber synchronously when paymentData is set so handleSuccess
  // can read it without depending on state (which may have been cleared).
  const orderNumberRef = useRef<string>("");

  const teardownListeners = useCallback(() => {
    firestoreUnsubRef.current?.();
    firestoreUnsubRef.current = null;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  // ── Auth redirect ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  // ── Config + KDV fetch (one-time, parallel) ──────────────────────────────
  useEffect(() => {
    Promise.all([
      getDoc(doc(db, "app_config", "boost_prices")),
      getDoc(doc(db, "app_config", "KDV")),
    ])
      .then(([boostSnap, kdvSnap]) => {
        if (boostSnap.exists()) {
          const d = boostSnap.data();
          const newConfig: BoostConfig = {
            pricePerProductPerDay:
              d.pricePerProductPerDay ?? DEFAULT_CONFIG.pricePerProductPerDay,
            minDurationDays:
              d.minDurationDays ?? DEFAULT_CONFIG.minDurationDays,
            maxDurationDays:
              d.maxDurationDays ?? DEFAULT_CONFIG.maxDurationDays,
            maxProducts: d.maxProducts ?? DEFAULT_CONFIG.maxProducts,
            serviceEnabled: d.serviceEnabled ?? DEFAULT_CONFIG.serviceEnabled,
          };
          setConfig(newConfig);
          setDayOptions(
            generateDayOptions(
              newConfig.minDurationDays,
              newConfig.maxDurationDays,
            ),
          );
        }
        if (kdvSnap.exists()) {
          const rate = (kdvSnap.data()?.boost as number) ?? 0;
          setKdvRate(rate >= 0 ? rate : 0);
        }
      })
      .catch((err) => console.error("Error fetching boost config:", err));
  }, []);

  // ── Products fetch ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setLoadingProducts(true);
    const q = query(
      collection(db, "products"),
      where("userId", "==", user.uid),
    );
    getDocs(q)
      .then((snap) => {
        const list: Product[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            productName: data.productName || "",
            imageUrl:
              Array.isArray(data.imageUrls) && data.imageUrls.length > 0
                ? data.imageUrls[0]
                : "",
            isBoosted: data.isBoosted === true,
          };
        });
        setAllProducts(list);
        // Pre-select the product from query param if it exists and isn't boosted
        if (productId) {
          const target = list.find((p) => p.id === productId);
          if (target && !target.isBoosted) {
            setSelectedIds([productId]);
          }
        }
      })
      .catch((err) => console.error("Error fetching products:", err))
      .finally(() => setLoadingProducts(false));
  }, [user, productId]);

  // ── Unmount: tear down payment listeners ─────────────────────────────────
  useEffect(() => () => teardownListeners(), [teardownListeners]);

  // ── iframe PAYMENT_FORM_SUBMITTED message ────────────────────────────────
  useEffect(() => {
    const handle = (e: MessageEvent) => {
      if (e.data?.type === "PAYMENT_FORM_SUBMITTED") setIsInitialLoading(false);
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, []);

  // ── Computed ─────────────────────────────────────────────────────────────
  const basePrice =
    selectedDays > 0
      ? selectedIds.length * selectedDays * config.pricePerProductPerDay
      : 0;
  const kdvAmount =
    kdvRate > 0 && basePrice > 0
      ? Math.round(basePrice * kdvRate / 100 * 100) / 100
      : 0;
  const totalPrice = basePrice + kdvAmount;

  // ── Result handlers ───────────────────────────────────────────────────────
  const handleSuccess = useCallback(() => {
    if (resultHandledRef.current) return;
    resultHandledRef.current = true;
    teardownListeners();
    setShowPaymentModal(false);
    setPaymentData(null);
    setTimeout(() => {
      router.push(
        `/myproducts?pendingBoostOrderNumber=${orderNumberRef.current}`,
      );
    }, 300);
  }, [router, teardownListeners]);

  const handleFailure = useCallback(
    (message: string) => {
      if (resultHandledRef.current) return;
      resultHandledRef.current = true;
      teardownListeners();
      setPaymentError(
        message.trim() ||
          t("paymentError") ||
          "Payment failed. Please try again.",
      );
    },
    [t, teardownListeners],
  );

  const handleStatusDoc = useCallback(
    (data: DocumentData) => {
      if (resultHandledRef.current) return;
      switch (data.status) {
        case STATUS.COMPLETED:
          handleSuccess();
          break;
        case STATUS.PAYMENT_FAILED:
        case STATUS.HASH_FAILED:
        case STATUS.PAYMENT_OK_BOOST_FAILED: {
          const msg =
            (typeof data.errorMessage === "string" && data.errorMessage) ||
            (typeof data.boostError === "string" && data.boostError) ||
            "";
          handleFailure(msg);
          break;
        }
        default:
          break;
      }
    },
    [handleSuccess, handleFailure],
  );
  const handleStatusDocRef = useRef(handleStatusDoc);
  handleStatusDocRef.current = handleStatusDoc;

  // ── Firestore real-time listener ──────────────────────────────────────────
  useEffect(() => {
    const orderNumber = paymentData?.orderNumber;
    if (!orderNumber || !showPaymentModal) return;
    resultHandledRef.current = false;

    const ref = doc(db, "pendingBoostPayments", orderNumber);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists() || resultHandledRef.current) return;
        const data = snap.data();
        if (data) handleStatusDocRef.current(data);
      },
      (err) => console.warn("[Boost] Firestore listener error:", err),
    );
    firestoreUnsubRef.current = unsub;
    return () => {
      unsub();
      if (firestoreUnsubRef.current === unsub) firestoreUnsubRef.current = null;
    };
  }, [paymentData?.orderNumber, showPaymentModal]);

  // ── Fallback poll ─────────────────────────────────────────────────────────
  useEffect(() => {
    const orderNumber = paymentData?.orderNumber;
    if (!orderNumber || !showPaymentModal) return;
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
          handleFailure(t("paymentTimeout") || "Payment timeout");
          return;
        }
        try {
          const snap = await getDoc(
            doc(db, "pendingBoostPayments", orderNumber),
          );
          if (snap.exists() && !resultHandledRef.current) {
            const data = snap.data();
            if (data) handleStatusDocRef.current(data);
          }
        } catch (err) {
          console.warn("[Boost] Fallback poll error:", err);
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
  }, [paymentData?.orderNumber, showPaymentModal, handleFailure, t]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const toggleProduct = (id: string, isBoosted: boolean) => {
    if (isBoosted) return;
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= config.maxProducts) {
        alert(
          t("maximumProductsCanBeBoostedAtOnce") ||
            `Maximum ${config.maxProducts} products can be boosted at once`,
        );
        return prev;
      }
      return [...prev, id];
    });
  };

  const proceedToPayment = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    setPaymentError(null);
    try {
      const functions = getFunctions(undefined, "europe-west3");
      const initializePayment = httpsCallable<
        {
          items: Array<{ itemId: string; collection: string; shopId: null }>;
          boostDuration: number;
          isShopContext: boolean;
          shopId: null;
          customerName: string;
          customerEmail: string;
          customerPhone: string;
        },
        {
          success: boolean;
          gatewayUrl: string;
          paymentParams: Record<string, string>;
          orderNumber: string;
          totalPrice: number;
          itemCount: number;
        }
      >(functions, "initializeBoostPayment");

      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data() || {};

      const result = await initializePayment({
        items: selectedIds.map((id) => ({
          itemId: id,
          collection: "products",
          shopId: null,
        })),
        boostDuration: selectedDays * MINUTES_PER_DAY,
        isShopContext: false,
        shopId: null,
        customerName: userData.displayName || userData.name || "Customer",
        customerEmail: userData.email || user.email || "",
        customerPhone: userData.phoneNumber || userData.phone || "",
      });

      const data = result.data;
      if (data.success) {
        orderNumberRef.current = data.orderNumber;
        setPaymentData({
          gatewayUrl: data.gatewayUrl,
          paymentParams: data.paymentParams,
          orderNumber: data.orderNumber,
          totalPrice: data.totalPrice,
          itemCount: data.itemCount,
        });
        setShowPaymentModal(true);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      alert(`${t("errorOccurred") || "Error"}: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClosePaymentModal = () => {
    if (
      confirm(
        t("cancelPaymentConfirm") ||
          "Are you sure you want to cancel the payment?",
      )
    ) {
      teardownListeners();
      setShowPaymentModal(false);
      setPaymentData(null);
      setPaymentError(null);
      setIsInitialLoading(true);
    }
  };

  const handleRetryPayment = () => {
    setPaymentError(null);
    setIsInitialLoading(true);
    const iframe = document.getElementById(
      "payment-iframe",
    ) as HTMLIFrameElement | null;
    if (iframe) iframe.src = iframe.src;
  };

  // ── Render guards ─────────────────────────────────────────────────────────
  if (authLoading || loadingProducts) {
    return (
      <div
        className={`min-h-screen ${isDark ? "bg-gray-900" : "bg-[#F4F4F4]"}`}
      >
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className={`rounded-2xl h-20 animate-pulse ${
                isDark ? "bg-gray-800" : "bg-white"
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!user) return null;

  const hasSelection = selectedIds.length > 0;
  const hasDuration = selectedDays > 0;
  const canContinue = currentStep === 0 ? hasSelection : hasDuration;
  const atLimit = selectedIds.length >= config.maxProducts;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className={`min-h-screen flex flex-col ${
        isDark ? "bg-[#1C1A29]" : "bg-[#F4F4F4]"
      }`}
    >
      {/* Sticky AppBar */}
      <div
        className={`sticky top-14 z-30 border-b ${
          isDark
            ? "bg-[#1C1A29]/90 backdrop-blur-xl border-white/5"
            : "bg-[#F4F4F4]/90 backdrop-blur-xl border-black/5"
        }`}
      >
        <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 py-3">
          <button
            onClick={() =>
              currentStep === 1 ? setCurrentStep(0) : router.back()
            }
            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-colors ${
              isDark
                ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                : "bg-white border-gray-200 hover:bg-gray-100"
            }`}
          >
            <ArrowLeft
              className={`w-4 h-4 ${isDark ? "text-gray-300" : "text-gray-600"}`}
            />
          </button>
          <h1
            className={`text-lg font-bold flex-1 ${
              isDark ? "text-white" : "text-gray-900"
            }`}
          >
            {t("ads") || "Boost Products"}
          </h1>
          <button
            onClick={() => router.push("/boostanalysis")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
              isDark
                ? "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            {t("analytics") || "Analytics"}
          </button>
        </div>
      </div>

      {/* Service disabled */}
      {!config.serviceEnabled ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 px-4">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
              isDark ? "bg-gray-800" : "bg-white"
            }`}
          >
            <PauseCircle className="w-8 h-8 text-gray-400" />
          </div>
          <h3
            className={`text-sm font-semibold mb-1 ${
              isDark ? "text-white" : "text-gray-900"
            }`}
          >
            {t("boostServiceTemporarilyOff") ||
              "Boost Service Temporarily Unavailable"}
          </h3>
          <p
            className={`text-xs text-center max-w-xs ${
              isDark ? "text-gray-400" : "text-gray-500"
            }`}
          >
            {t("boostServiceDisabledMessage") ||
              "The boost service is currently disabled. Please check back later."}
          </p>
        </div>
      ) : (
        <>
          {/* Step indicator */}
          <div className="max-w-2xl mx-auto w-full">
            <StepIndicator currentStep={currentStep} isDark={isDark} t={t} />
          </div>

          {/* Step content */}
          <div className="flex-1 overflow-y-auto max-w-2xl mx-auto w-full">
            {/* ── STEP 0: Product selection ── */}
            {currentStep === 0 && (
              <div className="px-4 pb-4 space-y-3">
                {/* Info banner */}
                <div
                  className="rounded-2xl border p-4"
                  style={{
                    background: isDark ? `${JADE}0D` : `${JADE}0A`,
                    borderColor: `${JADE}33`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${JADE}1F` }}
                    >
                      <Rocket className="w-4 h-4" style={{ color: JADE }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3
                        className={`text-sm font-bold mb-0.5 ${
                          isDark ? "text-gray-100" : "text-gray-800"
                        }`}
                      >
                        {t("boostInfoTitle") ||
                          "Boost Your Products for Maximum Visibility"}
                      </h3>
                      <p
                        className={`text-xs leading-relaxed ${
                          isDark ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {t("boostInfoDescription") ||
                          "Your boosted products will appear at the top of search results."}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Selection counter */}
                <div
                  className="rounded-xl border px-3 py-2 flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: atLimit
                      ? "rgba(249,115,22,0.1)"
                      : `${JADE}1A`,
                    borderColor: atLimit ? "rgba(249,115,22,0.3)" : `${JADE}4D`,
                  }}
                >
                  {atLimit ? (
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                  ) : (
                    <CheckCircle className="w-4 h-4" style={{ color: JADE }} />
                  )}
                  <span
                    className="text-sm font-semibold"
                    style={{ color: atLimit ? "#F97316" : JADE }}
                  >
                    {selectedIds.length} / {config.maxProducts}
                  </span>
                </div>

                {/* Product list */}
                {allProducts.length === 0 ? (
                  <div className="text-center py-12">
                    <Package
                      className={`w-10 h-10 mx-auto mb-3 ${
                        isDark ? "text-gray-600" : "text-gray-300"
                      }`}
                    />
                    <p
                      className={`text-sm font-semibold mb-1 ${
                        isDark ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {t("noProductsToBoostTitle") || "No Products to Boost"}
                    </p>
                    <p
                      className={`text-xs ${
                        isDark ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {t("noProductsToBoostDescription") ||
                        "You don't have any products available for boosting."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {allProducts.map((product) => {
                      const isSelected = selectedIds.includes(product.id);
                      const canSelect =
                        selectedIds.length < config.maxProducts || isSelected;
                      const isBoosted = product.isBoosted;

                      return (
                        <div
                          key={product.id}
                          onClick={() => toggleProduct(product.id, isBoosted)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                            isBoosted
                              ? "opacity-50 cursor-default"
                              : canSelect || isSelected
                                ? "cursor-pointer"
                                : "opacity-40 cursor-default"
                          }`}
                          style={{
                            backgroundColor: isSelected
                              ? `${JADE}14`
                              : isDark
                                ? "#211F31"
                                : "#FFFFFF",
                            borderColor: isSelected
                              ? `${JADE}59`
                              : isBoosted
                                ? isDark
                                  ? "#4B556333"
                                  : "#9CA3AF33"
                                : isDark
                                  ? "#374151"
                                  : "#E5E7EB",
                            borderWidth: isSelected ? 1.5 : 1,
                          }}
                        >
                          {/* Checkbox or boosted badge */}
                          {isBoosted ? (
                            <div
                              className="px-2 py-0.5 rounded-lg border text-[10px] font-bold flex-shrink-0"
                              style={{
                                color: "#78909C",
                                borderColor: "rgba(120,144,156,0.3)",
                                backgroundColor: "rgba(120,144,156,0.15)",
                              }}
                            >
                              {t("boosted") || "Boosted"}
                            </div>
                          ) : (
                            <div
                              className="w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                              style={{
                                borderColor: isSelected ? JADE : "#9CA3AF",
                                backgroundColor: isSelected
                                  ? JADE
                                  : "transparent",
                              }}
                            >
                              {isSelected && (
                                <CheckCircle className="w-3 h-3 text-white" />
                              )}
                            </div>
                          )}

                          {/* Thumbnail */}
                          <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 relative bg-gray-100">
                            {product.imageUrl ? (
                              <SmartImage
                                source={product.imageUrl}
                                size="thumbnail"
                                alt={product.productName}
                                fill
                                className="object-cover"
                                sizes="44px"
                              />
                            ) : (
                              <div
                                className={`w-full h-full flex items-center justify-center ${
                                  isDark ? "bg-gray-700" : "bg-gray-100"
                                }`}
                              >
                                <Package
                                  className={`w-4 h-4 ${
                                    isDark ? "text-gray-500" : "text-gray-300"
                                  }`}
                                />
                              </div>
                            )}
                          </div>

                          {/* Name */}
                          <p
                            className={`flex-1 min-w-0 text-sm font-semibold truncate ${
                              isDark ? "text-gray-200" : "text-gray-800"
                            }`}
                          >
                            {product.productName}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 1: Duration selection ── */}
            {currentStep === 1 && (
              <div className="px-4 pb-4">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${JADE}1F` }}
                  >
                    <Clock className="w-5 h-5" style={{ color: JADE }} />
                  </div>
                  <div>
                    <p
                      className={`text-base font-bold ${
                        isDark ? "text-gray-200" : "text-gray-800"
                      }`}
                    >
                      {t("selectBoostDuration") || "Select Boost Duration"}
                    </p>
                    <p
                      className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}
                    >
                      {selectedIds.length}{" "}
                      {t("products")?.toLowerCase() || "products"}
                    </p>
                  </div>
                </div>

                {/* Day chips */}
                <div className="flex flex-wrap gap-2.5 mb-6">
                  {dayOptions.map((days) => {
                    const chipBase =
                      selectedIds.length * days * config.pricePerProductPerDay;
                    const chipKdv =
                      kdvRate > 0 ? Math.round(chipBase * kdvRate / 100 * 100) / 100 : 0;
                    return (
                      <DurationChip
                        key={days}
                        days={days}
                        price={chipBase + chipKdv}
                        kdvRate={kdvRate}
                        kdvAmount={chipKdv}
                        isSelected={selectedDays === days}
                        isDark={isDark}
                        t={t}
                        onTap={() => setSelectedDays(days)}
                      />
                    );
                  })}
                </div>

                {/* Price summary (shown when day is selected) */}
                {selectedDays > 0 && (
                  <div
                    className="w-full p-5 rounded-2xl border text-center"
                    style={{
                      background: isDark
                        ? "linear-gradient(135deg,rgba(249,115,22,0.1),rgba(236,72,153,0.1))"
                        : "linear-gradient(135deg,rgba(249,115,22,0.06),rgba(236,72,153,0.06))",
                      borderColor: "rgba(249,115,22,0.25)",
                    }}
                  >
                    <p
                      className={`text-sm font-semibold mb-2 ${
                        isDark ? "text-gray-300" : "text-gray-500"
                      }`}
                    >
                      {t("totalPriceLabel") || "Total Price"}
                    </p>
                    <p
                      className="text-3xl font-extrabold mb-1"
                      style={{
                        background: "linear-gradient(135deg,#f97316,#ec4899)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      {totalPrice.toFixed(2)} TL
                    </p>
                    <p
                      className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}
                    >
                      {config.pricePerProductPerDay.toFixed(0)} TL ×{" "}
                      {selectedIds.length} × {selectedDays}
                    </p>
                    {kdvRate > 0 && kdvAmount > 0 && (
                      <p className="text-xs font-medium mt-1" style={{ color: "#F97316" }}>
                        KDV (%{Number.isInteger(kdvRate) ? kdvRate : kdvRate}): +{kdvAmount.toFixed(2)} TL
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Bottom sticky button ── */}
          {canContinue && (
            <div className="max-w-2xl mx-auto w-full px-4 py-3">
              <button
                onClick={() => {
                  if (currentStep === 0) {
                    setCurrentStep(1);
                  } else {
                    proceedToPayment();
                  }
                }}
                disabled={submitting}
                className="w-full h-14 rounded-2xl font-bold text-base text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
                style={{
                  background: `linear-gradient(135deg,${JADE},#00C47D)`,
                  boxShadow: `0 4px 12px ${JADE}59`,
                }}
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {currentStep === 1 && selectedDays > 0 && (
                      <span className="text-white/80 text-sm font-medium">
                        {totalPrice.toFixed(2)} TL &nbsp;•&nbsp;
                      </span>
                    )}
                    <span>
                      {currentStep === 0
                        ? t("continueButton") || "Continue"
                        : t("completePayment") || "Complete Payment"}
                    </span>
                    {currentStep === 0 ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    ) : (
                      <CreditCard className="w-4 h-4" />
                    )}
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Payment modal ── */}
      {showPaymentModal && paymentData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div
            className={`w-full max-w-4xl h-[90vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col ${
              isDark ? "bg-gray-900" : "bg-white"
            }`}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between px-4 py-3 border-b ${
                isDark ? "border-gray-700" : "border-gray-100"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${JADE}1F` }}
                >
                  <Lock className="w-4 h-4" style={{ color: JADE }} />
                </div>
                <div>
                  <h3
                    className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}
                  >
                    {t("securePayment") || "Secure Boost Payment"}
                  </h3>
                  <p
                    className={`text-[11px] ${isDark ? "text-gray-400" : "text-gray-500"}`}
                  >
                    {t("orderNumber") || "Order"}: {paymentData.orderNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClosePaymentModal}
                className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X
                  className={`w-4 h-4 ${isDark ? "text-gray-400" : "text-gray-500"}`}
                />
              </button>
            </div>

            {/* Payment error */}
            {paymentError && (
              <div
                className={`mx-4 mt-3 p-3 rounded-xl border ${
                  isDark
                    ? "bg-red-900/20 border-red-800"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-semibold mb-0.5 ${
                        isDark ? "text-red-300" : "text-red-800"
                      }`}
                    >
                      {t("paymentError") || "Payment Error"}
                    </p>
                    <p
                      className={`text-xs ${isDark ? "text-red-400" : "text-red-600"}`}
                    >
                      {paymentError}
                    </p>
                  </div>
                  <button
                    onClick={handleRetryPayment}
                    className="flex items-center gap-1 px-2.5 py-1 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 transition-colors flex-shrink-0"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {t("retry") || "Retry"}
                  </button>
                </div>
              </div>
            )}

            {/* iFrame */}
            <div className="flex-1 relative">
              <PaymentIframe
                paymentData={paymentData}
                onLoadComplete={() => setIsInitialLoading(false)}
                t={t}
              />
              {isInitialLoading && !paymentError && (
                <div
                  className={`absolute inset-0 flex items-center justify-center pointer-events-none ${
                    isDark ? "bg-gray-900/50" : "bg-white/50"
                  }`}
                >
                  <div className="text-center">
                    <div
                      className="w-8 h-8 border-[3px] rounded-full animate-spin mx-auto mb-3"
                      style={{
                        borderColor: `${JADE}33`,
                        borderTopColor: JADE,
                      }}
                    />
                    <p
                      className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}
                    >
                      {t("processingPayment") || "Processing payment..."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className={`px-4 py-3 border-t ${
                isDark
                  ? "bg-gray-800 border-gray-700"
                  : "bg-gray-50 border-gray-100"
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  <span>
                    <span
                      className={isDark ? "text-gray-400" : "text-gray-500"}
                    >
                      {t("items") || "Items"}:{" "}
                    </span>
                    <span
                      className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}
                    >
                      {paymentData.itemCount}
                    </span>
                  </span>
                  <span>
                    <span
                      className={isDark ? "text-gray-400" : "text-gray-500"}
                    >
                      {t("duration") || "Duration"}:{" "}
                    </span>
                    <span
                      className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}
                    >
                      {selectedDays}{" "}
                      {selectedDays === 1
                        ? t("day") || "day"
                        : t("days") || "days"}
                    </span>
                  </span>
                </div>
                <span>
                  <span className={isDark ? "text-gray-400" : "text-gray-500"}>
                    {t("total") || "Total"}:{" "}
                  </span>
                  <span className="font-bold text-sm" style={{ color: JADE }}>
                    {paymentData.totalPrice.toFixed(2)} TL
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
