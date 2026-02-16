"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  Package,
  CheckCircle,
  Clock,
  BarChart3,
  CreditCard,
  Plus,
  Minus,
  Zap,
  X,
  Lock,
  RefreshCw,
  AlertCircle,
  PauseCircle,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { httpsCallable, getFunctions } from "firebase/functions";

// Types
interface Product {
  id: string;
  productName: string;
  imageUrls: string[];
  imageUrl: string;
  price: number;
  currency: string;
  createdAt: Timestamp;
  isBoosted: boolean;
}

interface PaymentData {
  gatewayUrl: string;
  paymentParams: Record<string, string>;
  orderNumber: string;
  totalPrice: number;
  itemCount: number;
}

interface PaymentStatus {
  orderNumber: string;
  status: string;
  boostResult?: {
    boostedItemsCount: number;
    boostDuration: number;
    totalPrice: number;
  };
  errorMessage?: string;
  boostError?: string;
}

interface BoostPricesConfig {
  pricePerProductPerMinute: number;
  minDuration: number;
  maxDuration: number;
  maxProducts: number;
  serviceEnabled: boolean;
}

const DEFAULT_CONFIG: BoostPricesConfig = {
  pricePerProductPerMinute: 1.0,
  minDuration: 5,
  maxDuration: 35,
  maxProducts: 5,
  serviceEnabled: true,
};

const STATUS_CHECK_INTERVAL = 2000;

const generateDurationOptions = (
  minDuration: number,
  maxDuration: number,
): number[] => {
  const options: number[] = [];
  for (let i = minDuration; i <= maxDuration; i += 5) {
    options.push(i);
  }
  if (options.length === 0) options.push(minDuration);
  return options;
};

export default function BoostPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get("productId");
  const { user, isLoading: authLoading } = useUser();
  const t = useTranslations("Boosts");

  // State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [boostConfig, setBoostConfig] =
    useState<BoostPricesConfig>(DEFAULT_CONFIG);
  const [durationOptions, setDurationOptions] = useState<number[]>(
    generateDurationOptions(
      DEFAULT_CONFIG.minDuration,
      DEFAULT_CONFIG.maxDuration,
    ),
  );

  const [mainProduct, setMainProduct] = useState<Product | null>(null);
  const [unboostedProducts, setUnboostedProducts] = useState<Product[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  const [selectedDurationIndex, setSelectedDurationIndex] = useState(0);
  const [boostDuration, setBoostDuration] = useState(
    DEFAULT_CONFIG.minDuration,
  );
  const [totalPrice, setTotalPrice] = useState(
    DEFAULT_CONFIG.pricePerProductPerMinute,
  );

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [statusCheckInterval, setStatusCheckInterval] =
    useState<NodeJS.Timeout | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Check dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Listen to boost prices config
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "app_config", "boost_prices"),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const newConfig: BoostPricesConfig = {
            pricePerProductPerMinute:
              data.pricePerProductPerMinute ??
              DEFAULT_CONFIG.pricePerProductPerMinute,
            minDuration: data.minDuration ?? DEFAULT_CONFIG.minDuration,
            maxDuration: data.maxDuration ?? DEFAULT_CONFIG.maxDuration,
            maxProducts: data.maxProducts ?? DEFAULT_CONFIG.maxProducts,
            serviceEnabled:
              data.serviceEnabled ?? DEFAULT_CONFIG.serviceEnabled,
          };
          setBoostConfig(newConfig);
          const newOptions = generateDurationOptions(
            newConfig.minDuration,
            newConfig.maxDuration,
          );
          setDurationOptions(newOptions);
          setSelectedDurationIndex((prevIndex) => {
            if (prevIndex >= newOptions.length) return 0;
            return prevIndex;
          });
        } else {
          setBoostConfig(DEFAULT_CONFIG);
          setDurationOptions(
            generateDurationOptions(
              DEFAULT_CONFIG.minDuration,
              DEFAULT_CONFIG.maxDuration,
            ),
          );
        }
      },
      (error) => {
        console.error("Error listening to boost prices:", error);
        setBoostConfig(DEFAULT_CONFIG);
        setDurationOptions(
          generateDurationOptions(
            DEFAULT_CONFIG.minDuration,
            DEFAULT_CONFIG.maxDuration,
          ),
        );
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (
      durationOptions.length > 0 &&
      selectedDurationIndex < durationOptions.length
    ) {
      setBoostDuration(durationOptions[selectedDurationIndex]);
    }
  }, [selectedDurationIndex, durationOptions]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      Promise.all([
        productId ? fetchMainProduct() : Promise.resolve(),
        fetchUnboostedProducts(),
      ]).finally(() => setLoading(false));
    }
  }, [user, productId]);

  useEffect(() => {
    updateTotalPrice();
  }, [
    mainProduct,
    selectedProductIds,
    boostDuration,
    boostConfig.pricePerProductPerMinute,
  ]);

  useEffect(() => {
    return () => {
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
      }
    };
  }, [statusCheckInterval]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "PAYMENT_FORM_SUBMITTED") {
        setIsInitialLoading(false);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const fetchMainProduct = async () => {
    if (!productId || !user) return;
    try {
      const productDoc = await getDoc(doc(db, "products", productId));
      if (!productDoc.exists()) {
        alert(t("itemNotFound") || "Product not found");
        router.back();
        return;
      }
      const data = productDoc.data();
      const product: Product = {
        id: productDoc.id,
        productName: data.productName || "",
        imageUrls: data.imageUrls || [],
        imageUrl:
          data.imageUrls && data.imageUrls.length > 0 ? data.imageUrls[0] : "",
        price: data.price || 0,
        currency: data.currency || "TRY",
        createdAt: data.createdAt,
        isBoosted: data.isBoosted || false,
      };
      setMainProduct(product);
    } catch (error) {
      console.error("Error fetching main product:", error);
      alert(t("errorOccurred") || "An error occurred");
    }
  };

  const fetchUnboostedProducts = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "products"),
        where("userId", "==", user.uid),
        where("isBoosted", "==", false),
        orderBy("createdAt", "desc"),
      );
      const snapshot = await getDocs(q);
      const products: Product[] = [];
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (productId && doc.id === productId) return;
        products.push({
          id: doc.id,
          productName: data.productName || "",
          imageUrls: data.imageUrls || [],
          imageUrl:
            data.imageUrls && data.imageUrls.length > 0
              ? data.imageUrls[0]
              : "",
          price: data.price || 0,
          currency: data.currency || "TRY",
          createdAt: data.createdAt,
          isBoosted: data.isBoosted || false,
        });
      });
      setUnboostedProducts(products);
    } catch (error) {
      console.error("Error fetching unboosted products:", error);
    }
  };

  const updateTotalPrice = useCallback(() => {
    const itemCount = (mainProduct ? 1 : 0) + selectedProductIds.length;
    setTotalPrice(
      boostDuration * boostConfig.pricePerProductPerMinute * itemCount,
    );
  }, [
    mainProduct,
    selectedProductIds,
    boostDuration,
    boostConfig.pricePerProductPerMinute,
  ]);

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      } else {
        const totalItems = (mainProduct ? 1 : 0) + prev.length;
        if (totalItems >= boostConfig.maxProducts) {
          alert(
            t("maximumProductsCanBeBoostedAtOnce") ||
              `Maximum ${boostConfig.maxProducts} products can be boosted at once`,
          );
          return prev;
        }
        return [...prev, productId];
      }
    });
  };

  const handleDurationChange = (index: number) => {
    setSelectedDurationIndex(index);
    setBoostDuration(durationOptions[index]);
  };

  const getDurationLabel = (minutes: number) => {
    return `${minutes} ${t("minutes") || "minutes"}`;
  };

  const checkPaymentStatus = useCallback(
    async (orderNumber: string) => {
      try {
        const functions = getFunctions(undefined, "europe-west3");
        const checkStatus = httpsCallable<
          { orderNumber: string },
          PaymentStatus
        >(functions, "checkBoostPaymentStatus");
        const result = await checkStatus({ orderNumber });
        const status = result.data;

        if (status.status === "completed") {
          if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            setStatusCheckInterval(null);
          }
          setShowPaymentModal(false);
          setPaymentData(null);
          setTimeout(() => {
            alert(
              `${t("paymentSuccessful") || "Payment Successful!"}\n${
                t("yourProductsAreNowBoosted") ||
                "Your products are now boosted!"
              }\n\nBoosted ${status.boostResult?.boostedItemsCount || 0} items for ${
                status.boostResult?.boostDuration || 0
              } minutes.`,
            );
            router.push("/myproducts");
          }, 300);
        } else if (
          status.status === "payment_failed" ||
          status.status === "hash_verification_failed" ||
          status.status === "payment_succeeded_boost_failed"
        ) {
          if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            setStatusCheckInterval(null);
          }
          setPaymentError(
            status.errorMessage ||
              status.boostError ||
              "Payment failed. Please try again.",
          );
        }
      } catch (error) {
        console.error("Error checking payment status:", error);
      }
    },
    [statusCheckInterval, router, t],
  );

  const startStatusPolling = useCallback(
    (orderNumber: string) => {
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
      }
      const interval = setInterval(() => {
        checkPaymentStatus(orderNumber);
      }, STATUS_CHECK_INTERVAL);
      setStatusCheckInterval(interval);
    },
    [statusCheckInterval, checkPaymentStatus],
  );

  const proceedToPayment = async () => {
    if (!user) {
      alert(t("userNotAuthenticated") || "User not authenticated");
      return;
    }
    const items: Array<{
      itemId: string;
      collection: string;
      shopId: string | null;
    }> = [];
    if (mainProduct) {
      items.push({
        itemId: mainProduct.id,
        collection: "products",
        shopId: null,
      });
    }
    selectedProductIds.forEach((id) => {
      items.push({ itemId: id, collection: "products", shopId: null });
    });
    if (items.length === 0) {
      alert(t("noItemToBoost") || "No items to boost");
      return;
    }

    setSubmitting(true);
    setPaymentError(null);

    try {
      const functions = getFunctions(undefined, "europe-west3");
      const initializePayment = httpsCallable<
        {
          items: Array<{
            itemId: string;
            collection: string;
            shopId: string | null;
          }>;
          boostDuration: number;
          isShopContext: boolean;
          shopId: string | null;
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
        items,
        boostDuration,
        isShopContext: false,
        shopId: null,
        customerName: userData.displayName || userData.name || "Customer",
        customerEmail: userData.email || user.email || "",
        customerPhone: userData.phoneNumber || userData.phone || "",
      });

      const data = result.data;
      if (data.success) {
        setPaymentData({
          gatewayUrl: data.gatewayUrl,
          paymentParams: data.paymentParams,
          orderNumber: data.orderNumber,
          totalPrice: data.totalPrice,
          itemCount: data.itemCount,
        });
        setShowPaymentModal(true);
        startStatusPolling(data.orderNumber);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Error initializing payment:", error);
      alert(`${t("errorOccurred") || "Error"}: ${errorMessage}`);
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
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        setStatusCheckInterval(null);
      }
      setShowPaymentModal(false);
      setPaymentData(null);
      setPaymentError(null);
      setIsInitialLoading(true);
    }
  };

  const handleRetryPayment = () => {
    setPaymentError(null);
    setIsInitialLoading(true);
    if (paymentData) {
      const iframe = document.getElementById(
        "payment-iframe",
      ) as HTMLIFrameElement;
      if (iframe) {
        iframe.src = iframe.src;
      }
    }
  };

  const canSelectMore = () => {
    const totalItems = (mainProduct ? 1 : 0) + selectedProductIds.length;
    return totalItems < boostConfig.maxProducts;
  };

  const getTotalItemsCount = () => {
    return (mainProduct ? 1 : 0) + selectedProductIds.length;
  };

  const hasProductsToBoost = () => {
    if (!boostConfig.serviceEnabled) return false;
    return (
      mainProduct !== null ||
      unboostedProducts.length > 0 ||
      selectedProductIds.length > 0
    );
  };

  // Separate PaymentIframe Component to prevent re-renders
  const PaymentIframe = React.memo(
    ({
      paymentData,
      onLoadComplete,
      t,
    }: {
      paymentData: PaymentData;
      onLoadComplete: () => void;
      t: (key: string) => string;
    }) => {
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
          body {
            margin: 0; padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
            min-height: 100vh; display: flex; align-items: center; justify-content: center;
          }
          .loading-container { text-align: center; color: white; padding: 40px; }
          .spinner {
            width: 50px; height: 50px; margin: 0 auto 20px;
            border: 4px solid rgba(255,255,255,0.3); border-top-color: white;
            border-radius: 50%; animation: spin 1s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          .loading-text { font-size: 18px; font-weight: 500; margin: 0; }
          .secure-badge {
            display: inline-flex; align-items: center; gap: 8px;
            background: rgba(255,255,255,0.2); padding: 8px 16px;
            border-radius: 20px; margin-top: 20px; font-size: 14px;
          }
          .boost-badge {
            display: inline-block; background: rgba(255,255,255,0.15);
            padding: 6px 14px; border-radius: 16px; margin-top: 12px;
            font-size: 13px; font-weight: 600;
          }
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
            .map(
              ([key, value]) =>
                `<input type="hidden" name="${key}" value="${value}">`,
            )
            .join("\n")}
        </form>
        <script>
          setTimeout(() => { document.getElementById('paymentForm').submit(); }, 1500);
        </script>
      </body>
      </html>`;

        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          doc.open();
          doc.write(formHtml);
          doc.close();
          initializedRef.current = true;
        }
        const timer = setTimeout(() => {
          onLoadComplete();
        }, 2500);
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
    },
  );

  PaymentIframe.displayName = "PaymentIframe";

  // ============================================================================
  // RENDER
  // ============================================================================

  if (authLoading || loading) {
    return (
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className={`rounded-2xl border h-32 animate-pulse ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-100"
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!user) return null;

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
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 px-3 sm:px-6 py-3">
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
              {t("ads") || "Boost Products"}
            </h1>
            <div className="flex-1" />
            <button
              onClick={() => router.push("/boostanalysis")}
              className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                  : "bg-gray-50 border-gray-200 hover:bg-gray-100"
              }`}
            >
              <BarChart3
                className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Service Disabled State */}
      {!boostConfig.serviceEnabled ? (
        <div className="text-center py-16 px-3">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
              isDarkMode ? "bg-orange-900/20" : "bg-orange-50"
            }`}
          >
            <PauseCircle className="w-8 h-8 text-orange-500" />
          </div>
          <h3
            className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("boostServiceTemporarilyOff") ||
              "Boost Service Temporarily Unavailable"}
          </h3>
          <p
            className={`text-xs max-w-xs mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {t("boostServiceDisabledMessage") ||
              "The boost service is currently disabled. Please check back later."}
          </p>
        </div>
      ) : !hasProductsToBoost() ? (
        /* Empty State */
        <div className="text-center py-16 px-3">
          <Package
            className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
          />
          <h3
            className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("noProductsToBoostTitle") || "No Products to Boost"}
          </h3>
          <p
            className={`text-xs max-w-xs mx-auto mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {t("noProductsToBoostDescription") ||
              "You don't have any products available for boosting."}
          </p>
          <button
            onClick={() => router.push("/myproducts")}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("addProductFirst") || "Add Product"}
          </button>
        </div>
      ) : (
        <>
          <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-3">
            {/* Info Banner */}
            <div
              className={`rounded-2xl border p-4 ${
                isDarkMode
                  ? "bg-orange-900/10 border-orange-700/30"
                  : "bg-orange-50 border-orange-100"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isDarkMode ? "bg-orange-900/30" : "bg-orange-100"
                  }`}
                >
                  <Zap className="w-4 h-4 text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3
                    className={`text-sm font-semibold mb-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {t("boostInfoTitle") ||
                      "Boost Your Products for Maximum Visibility"}
                  </h3>
                  <p
                    className={`text-xs leading-relaxed ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                  >
                    {t("boostInfoDescription") ||
                      "Your boosted products will appear at the top of search results and category listings."}
                  </p>
                </div>
              </div>
            </div>

            {/* Main Product */}
            {mainProduct && (
              <div>
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wider mb-2 block ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  {t("selectedProduct") || "Selected Product"}
                </span>
                <div
                  className={`rounded-2xl border overflow-hidden ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-100"
                  }`}
                >
                  <div
                    className={`relative h-36 ${isDarkMode ? "bg-gray-700" : "bg-gray-50"}`}
                  >
                    {mainProduct.imageUrl ? (
                      <Image
                        src={mainProduct.imageUrl}
                        alt={mainProduct.productName}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package
                          className={`w-8 h-8 ${isDarkMode ? "text-gray-500" : "text-gray-300"}`}
                        />
                      </div>
                    )}
                  </div>
                  <div className="px-4 py-3">
                    <h3
                      className={`text-sm font-semibold mb-1.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                    >
                      {mainProduct.productName}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        isDarkMode
                          ? "bg-orange-900/30 text-orange-400 border border-orange-700/50"
                          : "bg-orange-50 text-orange-600 border border-orange-200"
                      }`}
                    >
                      <Zap className="w-3 h-3" />
                      {t("primaryItem") || "Primary Item"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Additional Products */}
            {(unboostedProducts.length > 0 || mainProduct === null) && (
              <div
                className={`rounded-2xl border p-4 ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700"
                    : "bg-white border-gray-100"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {t("addMoreItems") || "Add More Items"}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${
                      getTotalItemsCount() >= boostConfig.maxProducts
                        ? isDarkMode
                          ? "bg-orange-900/30 text-orange-400 border border-orange-700/50"
                          : "bg-orange-50 text-orange-600 border border-orange-200"
                        : isDarkMode
                          ? "bg-green-900/30 text-green-400 border border-green-700/50"
                          : "bg-green-50 text-green-600 border border-green-200"
                    }`}
                  >
                    {getTotalItemsCount() >= boostConfig.maxProducts ? (
                      <AlertCircle className="w-3 h-3" />
                    ) : (
                      <CheckCircle className="w-3 h-3" />
                    )}
                    {getTotalItemsCount()} / {boostConfig.maxProducts}
                  </span>
                </div>

                {unboostedProducts.length > 0 ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {unboostedProducts.map((product) => {
                      const isSelected = selectedProductIds.includes(
                        product.id,
                      );
                      const canSelect = canSelectMore();
                      return (
                        <div
                          key={product.id}
                          onClick={() =>
                            (canSelect || isSelected) &&
                            toggleProductSelection(product.id)
                          }
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                            isSelected
                              ? isDarkMode
                                ? "bg-orange-900/10 border-orange-700/50"
                                : "bg-orange-50 border-orange-200"
                              : isDarkMode
                                ? "bg-gray-700/50 border-gray-600 hover:border-gray-500"
                                : "bg-gray-50/50 border-gray-100 hover:border-gray-200"
                          } ${canSelect || isSelected ? "cursor-pointer" : "opacity-40"}`}
                        >
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
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 relative">
                            {product.imageUrl ? (
                              <Image
                                src={product.imageUrl}
                                alt={product.productName}
                                fill
                                className="object-cover"
                                sizes="40px"
                              />
                            ) : (
                              <div
                                className={`w-full h-full flex items-center justify-center ${isDarkMode ? "bg-gray-700" : "bg-gray-100"}`}
                              >
                                <Package
                                  className={`w-4 h-4 ${isDarkMode ? "text-gray-500" : "text-gray-300"}`}
                                />
                              </div>
                            )}
                          </div>
                          <h4
                            className={`flex-1 min-w-0 text-sm font-semibold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
                          >
                            {product.productName}
                          </h4>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Package
                      className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
                    />
                    <p
                      className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      {t("noMoreItemsToAdd") || "No more items to add"}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Duration Selection */}
            <div
              className={`rounded-2xl border p-4 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-100"
              }`}
            >
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-orange-500" />
                <span
                  className={`text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {t("selectBoostDuration") || "Select Boost Duration"}
                </span>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() =>
                    handleDurationChange(Math.max(0, selectedDurationIndex - 1))
                  }
                  disabled={selectedDurationIndex === 0}
                  className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${
                    isDarkMode
                      ? "bg-orange-600 text-white hover:bg-orange-500"
                      : "bg-orange-500 text-white hover:bg-orange-600"
                  }`}
                >
                  <Minus className="w-4 h-4" />
                </button>

                <div className="flex-1">
                  <div
                    className={`relative h-2 rounded-full overflow-hidden ${
                      isDarkMode ? "bg-gray-700" : "bg-gray-200"
                    }`}
                  >
                    <div
                      className="absolute top-0 left-0 h-full bg-orange-500 transition-all duration-300 rounded-full"
                      style={{
                        width: `${
                          durationOptions.length > 1
                            ? (selectedDurationIndex /
                                (durationOptions.length - 1)) *
                              100
                            : 100
                        }%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5 px-0.5">
                    {durationOptions.map((duration, index) => (
                      <button
                        key={duration}
                        onClick={() => handleDurationChange(index)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                          index === selectedDurationIndex
                            ? "bg-orange-500 scale-150"
                            : isDarkMode
                              ? "bg-gray-600 hover:bg-gray-500"
                              : "bg-gray-300 hover:bg-gray-400"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <button
                  onClick={() =>
                    handleDurationChange(
                      Math.min(
                        durationOptions.length - 1,
                        selectedDurationIndex + 1,
                      ),
                    )
                  }
                  disabled={
                    selectedDurationIndex === durationOptions.length - 1
                  }
                  className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${
                    isDarkMode
                      ? "bg-orange-600 text-white hover:bg-orange-500"
                      : "bg-orange-500 text-white hover:bg-orange-600"
                  }`}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="text-center">
                <span
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-bold ${
                    isDarkMode
                      ? "bg-orange-900/30 text-orange-400 border border-orange-700/50"
                      : "bg-orange-50 text-orange-600 border border-orange-200"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {getDurationLabel(boostDuration)}
                </span>
              </div>
            </div>

            {/* Price Section */}
            <div
              className={`rounded-2xl border p-4 ${
                isDarkMode
                  ? "bg-gradient-to-br from-orange-900/20 to-pink-900/20 border-orange-700/30"
                  : "bg-gradient-to-br from-orange-50 to-pink-50 border-orange-200"
              }`}
            >
              <div className="text-center space-y-2">
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wider ${
                    isDarkMode ? "text-gray-300" : "text-gray-500"
                  }`}
                >
                  {t("totalPriceLabel") || "Total Price"}
                </p>
                <p
                  className={`text-3xl font-bold ${
                    isDarkMode ? "text-white" : "text-orange-600"
                  }`}
                >
                  {totalPrice.toFixed(2)} TL
                </p>
                <div
                  className={`text-[11px] space-y-0.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                >
                  <p>
                    {getTotalItemsCount()} {t("items") || "items"} ×{" "}
                    {boostDuration} {t("minutes") || "minutes"}
                  </p>
                  <p>
                    {boostConfig.pricePerProductPerMinute} TL{" "}
                    {t("perItemPerMinute") || "per item per minute"}
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom Action */}
            <button
              onClick={proceedToPayment}
              disabled={submitting || getTotalItemsCount() === 0}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-orange-500 text-white rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t("preparingPayment") || "Preparing..."}
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  {t("completePayment") || "Complete Payment"}
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* Payment Modal */}
      {showPaymentModal && paymentData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div
            className={`w-full max-w-4xl h-[90vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col ${
              isDarkMode ? "bg-gray-900" : "bg-white"
            }`}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between px-4 py-3 border-b ${
                isDarkMode ? "border-gray-700" : "border-gray-100"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    isDarkMode ? "bg-orange-900/30" : "bg-orange-50"
                  }`}
                >
                  <Lock className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <h3
                    className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {t("securePayment") || "Secure Boost Payment"}
                  </h3>
                  <p
                    className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
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
                  className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                />
              </button>
            </div>

            {/* Payment Error */}
            {paymentError && (
              <div
                className={`mx-4 mt-3 p-3 rounded-xl border ${
                  isDarkMode
                    ? "bg-red-900/20 border-red-800"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-semibold mb-0.5 ${isDarkMode ? "text-red-300" : "text-red-800"}`}
                    >
                      {t("paymentError") || "Payment Error"}
                    </p>
                    <p
                      className={`text-xs ${isDarkMode ? "text-red-400" : "text-red-600"}`}
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

            {/* IFrame */}
            <div className="flex-1 relative">
              <PaymentIframe
                paymentData={paymentData}
                onLoadComplete={() => setIsInitialLoading(false)}
                t={t}
              />
              {isInitialLoading && !paymentError && (
                <div
                  className={`absolute inset-0 flex items-center justify-center pointer-events-none ${
                    isDarkMode ? "bg-gray-900/50" : "bg-white/50"
                  }`}
                >
                  <div className="text-center">
                    <div className="w-8 h-8 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin mx-auto mb-3" />
                    <p
                      className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
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
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-gray-50 border-gray-100"
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-4">
                  <span>
                    <span
                      className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                    >
                      {t("items") || "Items"}:{" "}
                    </span>
                    <span
                      className={`font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                    >
                      {paymentData.itemCount}
                    </span>
                  </span>
                  <span>
                    <span
                      className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                    >
                      {t("duration") || "Duration"}:{" "}
                    </span>
                    <span
                      className={`font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                    >
                      {boostDuration} {t("minutes") || "min"}
                    </span>
                  </span>
                </div>
                <span>
                  <span
                    className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                  >
                    {t("total") || "Total"}:{" "}
                  </span>
                  <span className="font-bold text-orange-500 text-sm">
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
