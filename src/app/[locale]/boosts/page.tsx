"use client";

import React, { useState, useEffect, useCallback } from "react";
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

const BASE_PRICE_PER_PRODUCT = 1.0; // TL per product per minute
const BOOST_DURATION_OPTIONS = [5, 10, 15, 20, 25, 30, 35]; // minutes
const MAX_PRODUCTS = 5;
const STATUS_CHECK_INTERVAL = 2000; // 2 seconds

export default function BoostPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get("productId");
  const { user } = useUser();
  const t = useTranslations("Boosts");

  // State
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Product states
  const [mainProduct, setMainProduct] = useState<Product | null>(null);
  const [unboostedProducts, setUnboostedProducts] = useState<Product[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // Boost configuration
  const [selectedDurationIndex, setSelectedDurationIndex] = useState(0);
  const [boostDuration, setBoostDuration] = useState(BOOST_DURATION_OPTIONS[0]);
  const [totalPrice, setTotalPrice] = useState(BASE_PRICE_PER_PRODUCT);

  // Payment states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [statusCheckInterval, setStatusCheckInterval] = useState<NodeJS.Timeout | null>(null);
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

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  // Load data when user is available
  useEffect(() => {
    if (user) {
      Promise.all([
        productId ? fetchMainProduct() : Promise.resolve(),
        fetchUnboostedProducts(),
      ]).finally(() => setLoading(false));
    }
  }, [user, productId]);

  // Update total price when selection or duration changes
  useEffect(() => {
    updateTotalPrice();
  }, [mainProduct, selectedProductIds, boostDuration]);

  // Cleanup status check interval on unmount
  useEffect(() => {
    return () => {
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
      }
    };
  }, [statusCheckInterval]);

  // Listen for messages from payment iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PAYMENT_FORM_SUBMITTED') {
        // Hide the loading overlay once the form is submitted and 3D secure page loads
        setIsInitialLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Fetch main product if productId is provided
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

  // Fetch unboosted products for bulk boosting
  const fetchUnboostedProducts = async () => {
    if (!user) return;

    try {
      const q = query(
        collection(db, "products"),
        where("userId", "==", user.uid),
        where("isBoosted", "==", false),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);
      const products: Product[] = [];

      snapshot.docs.forEach((doc) => {
        const data = doc.data();

        // Skip main product if it exists
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

  // Update total price calculation
  const updateTotalPrice = useCallback(() => {
    const itemCount = (mainProduct ? 1 : 0) + selectedProductIds.length;
    setTotalPrice(boostDuration * BASE_PRICE_PER_PRODUCT * itemCount);
  }, [mainProduct, selectedProductIds, boostDuration]);

  // Toggle product selection with limit check
  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((prev) => {
      if (prev.includes(productId)) {
        // Always allow deselection
        return prev.filter((id) => id !== productId);
      } else {
        // Check limit before adding
        const totalItems = (mainProduct ? 1 : 0) + prev.length;
        if (totalItems >= MAX_PRODUCTS) {
          alert(
            t("maximumProductsCanBeBoostedAtOnce") ||
              `Maximum ${MAX_PRODUCTS} products can be boosted at once`
          );
          return prev;
        }
        return [...prev, productId];
      }
    });
  };

  // Handle duration change
  const handleDurationChange = (index: number) => {
    setSelectedDurationIndex(index);
    setBoostDuration(BOOST_DURATION_OPTIONS[index]);
  };

  // Format duration label
  const getDurationLabel = (minutes: number) => {
    return `${minutes} ${t("minutes") || "minutes"}`;
  };

  // Check payment status
  const checkPaymentStatus = useCallback(
    async (orderNumber: string) => {
      try {
        const functions = getFunctions(undefined, "europe-west3");
        const checkStatus = httpsCallable
          <{ orderNumber: string },
          PaymentStatus
        >(functions, "checkBoostPaymentStatus");

        const result = await checkStatus({ orderNumber });
        const status = result.data;

        console.log("Payment status:", status);

        if (status.status === "completed") {
          // Clear interval
          if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            setStatusCheckInterval(null);
          }

          // Close modal and show success
          setShowPaymentModal(false);
          setPaymentData(null);

          // Show success message
          setTimeout(() => {
            alert(
              `${t("paymentSuccessful") || "Payment Successful!"}\n${
                t("yourProductsAreNowBoosted") ||
                "Your products are now boosted!"
              }\n\nBoosted ${
                status.boostResult?.boostedItemsCount || 0
              } items for ${status.boostResult?.boostDuration || 0} minutes.`
            );

            // Navigate to my products page
            router.push("/myproducts");
          }, 300);
        } else if (
          status.status === "payment_failed" ||
          status.status === "hash_verification_failed" ||
          status.status === "payment_succeeded_boost_failed"
        ) {
          // Clear interval
          if (statusCheckInterval) {
            clearInterval(statusCheckInterval);
            setStatusCheckInterval(null);
          }

          // Show error
          setPaymentError(
            status.errorMessage ||
              status.boostError ||
              "Payment failed. Please try again."
          );
        }
      } catch (error) {
        console.error("Error checking payment status:", error);
      }
    },
    [statusCheckInterval, router, t]
  );

  // Start status polling
  const startStatusPolling = useCallback(
    (orderNumber: string) => {
      // Clear any existing interval
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
      }

      // Start new interval
      const interval = setInterval(() => {
        checkPaymentStatus(orderNumber);
      }, STATUS_CHECK_INTERVAL);

      setStatusCheckInterval(interval);
    },
    [statusCheckInterval, checkPaymentStatus]
  );

  // Proceed to payment
  const proceedToPayment = async () => {
    if (!user) {
      alert(t("userNotAuthenticated") || "User not authenticated");
      return;
    }

    // Prepare items for the cloud function
    const items = [];

    // Add main product if exists
    if (mainProduct) {
      items.push({
        itemId: mainProduct.id,
        collection: "products",
        shopId: null,
      });
    }

    // Add selected products
    selectedProductIds.forEach((id) => {
      items.push({
        itemId: id,
        collection: "products",
        shopId: null,
      });
    });

    if (items.length === 0) {
      alert(t("noItemToBoost") || "No items to boost");
      return;
    }

    setSubmitting(true);
    setPaymentError(null);

    try {
      const functions = getFunctions(undefined, "europe-west3");
      const initializePayment = httpsCallable
        <{
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

      // Get user data for payment
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

        // Start status polling
        startStatusPolling(data.orderNumber);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error initializing payment:", error);
      alert(
        `${t("errorOccurred") || "Error"}: ${
          errorMessage
        }`
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Handle payment modal close
  const handleClosePaymentModal = () => {
    if (
      confirm(
        t("cancelPaymentConfirm") ||
          "Are you sure you want to cancel the payment?"
      )
    ) {
      // Clear interval
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

  // Retry payment
  const handleRetryPayment = () => {
    setPaymentError(null);
    setIsInitialLoading(true);
    if (paymentData) {
      // Reload iframe
      const iframe = document.getElementById(
        "payment-iframe"
      ) as HTMLIFrameElement;
      if (iframe) {
        iframe.src = iframe.src;
      }
    }
  };

  // Check if user can select more products
  const canSelectMore = () => {
    const totalItems = (mainProduct ? 1 : 0) + selectedProductIds.length;
    return totalItems < MAX_PRODUCTS;
  };

  // Get total selected items count
  const getTotalItemsCount = () => {
    return (mainProduct ? 1 : 0) + selectedProductIds.length;
  };

  // Check if user has products to boost
  const hasProductsToBoost = () => {
    return mainProduct !== null || unboostedProducts.length > 0;
  };

  // Product Card Component
  const ProductCard = ({
    product,
    isSelected,
    onToggle,
    isPrimary = false,
  }: {
    product: Product;
    isSelected?: boolean;
    onToggle?: () => void;
    isPrimary?: boolean;
  }) => {
    const canSelect = canSelectMore();

    return (
      <div
        className={`
        rounded-xl border transition-all duration-200 overflow-hidden
        ${
          isPrimary
            ? isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
            : isSelected
            ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700"
            : isDarkMode
            ? "bg-gray-800 border-gray-700 hover:border-gray-600"
            : "bg-white border-gray-200 hover:border-gray-300"
        }
        ${onToggle && (canSelect || isSelected) ? "cursor-pointer" : ""}
        ${!canSelect && !isSelected ? "opacity-40" : ""}
      `}
        onClick={() => onToggle && (canSelect || isSelected) && onToggle()}
      >
        {!isPrimary && (
          <div className="p-4">
            <div className="flex items-center space-x-3">
              {/* Custom Checkbox */}
              <div
                className={`
                w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0
                ${
                  isSelected
                    ? "bg-green-500 border-green-500"
                    : "border-gray-300 dark:border-gray-600"
                }
              `}
              >
                {isSelected && <CheckCircle size={14} className="text-white" />}
              </div>

              {/* Product Image */}
              <div className="relative w-12 h-12 flex-shrink-0">
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.productName}
                    fill
                    className="object-cover rounded-lg"
                  />
                ) : (
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      isDarkMode ? "bg-gray-700" : "bg-gray-100"
                    }`}
                  >
                    <Package
                      size={18}
                      className={
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }
                    />
                  </div>
                )}
              </div>

              {/* Product Info */}
              <div className="flex-1 min-w-0">
                <h4
                  className={`text-sm font-semibold line-clamp-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {product.productName}
                </h4>
              </div>
            </div>
          </div>
        )}

        {isPrimary && (
          <>
            {/* Product Image */}
            <div className="relative h-40 bg-gray-100 dark:bg-gray-700">
              {product.imageUrl ? (
                <Image
                  src={product.imageUrl}
                  alt={product.productName}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package
                    size={40}
                    className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                  />
                </div>
              )}
            </div>

            {/* Product Details */}
            <div className="p-4">
              <h3
                className={`text-lg font-semibold mb-2 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {product.productName}
              </h3>

              <div className="inline-flex items-center px-3 py-1 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-full">
                <Zap size={12} className="text-green-600 mr-1" />
                <span className="text-xs font-semibold text-green-600">
                  {t("primaryItem") || "Primary Item"}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  // Loading Skeleton
  const LoadingSkeleton = () => (
    <div className="space-y-6 p-6">
      {/* Main product skeleton */}
      <div
        className={`animate-pulse rounded-xl h-48 ${
          isDarkMode ? "bg-gray-800" : "bg-gray-200"
        }`}
      />

      {/* Additional products skeleton */}
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={`animate-pulse rounded-lg h-16 ${
              isDarkMode ? "bg-gray-800" : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      {/* Controls skeleton */}
      <div
        className={`animate-pulse rounded-xl h-32 ${
          isDarkMode ? "bg-gray-800" : "bg-gray-200"
        }`}
      />
    </div>
  );

  // Empty State Component
  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div
        className={`p-8 rounded-full mb-6 ${
          isDarkMode ? "bg-gray-800" : "bg-gray-100"
        }`}
      >
        <Package
          size={64}
          className={isDarkMode ? "text-gray-600" : "text-gray-400"}
        />
      </div>

      <h2
        className={`text-2xl font-bold mb-3 ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {t("noProductsToBoostTitle") || "No Products to Boost"}
      </h2>

      <p
        className={`text-center mb-8 max-w-md ${
          isDarkMode ? "text-gray-400" : "text-gray-600"
        }`}
      >
        {t("noProductsToBoostDescription") ||
          "You don't have any products available for boosting. Add products first to get started."}
      </p>

      <button
        onClick={() => router.push("/addproduct")}
        className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-semibold hover:from-green-600 hover:to-green-700 transition-all"
      >
        <Plus size={20} />
        <span>{t("addProductFirst") || "Add Product"}</span>
      </button>
    </div>
  );

  // Payment Modal Component
  const PaymentModal = () => {
    if (!paymentData) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div
          className={`w-full max-w-4xl h-[90vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col ${
            isDarkMode ? "bg-gray-900" : "bg-white"
          }`}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between px-6 py-4 border-b ${
              isDarkMode ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Lock size={20} className="text-green-600" />
              </div>
              <div>
                <h3
                  className={`text-lg font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("securePayment") || "Secure Boost Payment"}
                </h3>
                <p
                  className={`text-xs ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  {t("orderNumber") || "Order"}: {paymentData.orderNumber}
                </p>
              </div>
            </div>

            <button
              onClick={handleClosePaymentModal}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode
                  ? "hover:bg-gray-800 text-gray-400"
                  : "hover:bg-gray-100 text-gray-600"
              }`}
            >
              <X size={24} />
            </button>
          </div>

          {/* Payment Error */}
          {paymentError && (
            <div className="mx-6 mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertCircle size={20} className="text-red-600 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-red-900 dark:text-red-200 mb-1">
                    {t("paymentError") || "Payment Error"}
                  </h4>
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {paymentError}
                  </p>
                </div>
                <button
                  onClick={handleRetryPayment}
                  className="flex items-center space-x-1 px-3 py-1 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
                >
                  <RefreshCw size={14} />
                  <span>{t("retry") || "Retry"}</span>
                </button>
              </div>
            </div>
          )}

          {/* IFrame Container */}
          <div className="flex-1 relative">
            <iframe
              id="payment-iframe"
              ref={(iframe) => {
                if (iframe && paymentData) {
                  // Create form HTML
                  const formHtml = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                      <meta charset="UTF-8">
                      <meta name="viewport" content="width=device-width, initial-scale=1.0">
                      <title>${t("securePayment") || "Secure Payment"}</title>
                      <style>
                        body {
                          margin: 0;
                          padding: 0;
                          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                          background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                          min-height: 100vh;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                        }
                        .loading-container {
                          text-align: center;
                          color: white;
                          padding: 40px;
                        }
                        .spinner {
                          width: 50px;
                          height: 50px;
                          margin: 0 auto 20px;
                          border: 4px solid rgba(255, 255, 255, 0.3);
                          border-top-color: white;
                          border-radius: 50%;
                          animation: spin 1s linear infinite;
                        }
                        @keyframes spin {
                          to { transform: rotate(360deg); }
                        }
                        .loading-text {
                          font-size: 18px;
                          font-weight: 500;
                          margin: 0;
                        }
                        .secure-badge {
                          display: inline-flex;
                          align-items: center;
                          gap: 8px;
                          background: rgba(255, 255, 255, 0.2);
                          padding: 8px 16px;
                          border-radius: 20px;
                          margin-top: 20px;
                          font-size: 14px;
                        }
                        .boost-badge {
                          display: inline-block;
                          background: rgba(255, 255, 255, 0.15);
                          padding: 6px 14px;
                          border-radius: 16px;
                          margin-top: 12px;
                          font-size: 13px;
                          font-weight: 600;
                        }
                      </style>
                    </head>
                    <body>
                      <div class="loading-container">
                        <div class="spinner"></div>
                        <p class="loading-text">${
                          t("loadingPaymentPage") ||
                          "Loading secure payment page..."
                        }</p>
                        <div class="boost-badge">🚀 ${
                          t("boostPackage") || "Boost Package"
                        }</div>
                        <div class="secure-badge">
                          🔒 ${t("secureConnection") || "Secure Connection"}
                        </div>
                      </div>
                      <form id="paymentForm" method="post" action="${
                        paymentData.gatewayUrl
                      }">
                        ${Object.entries(paymentData.paymentParams)
                          .map(
                            ([key, value]) =>
                              `<input type="hidden" name="${key}" value="${value}">`
                          )
                          .join("\n")}
                      </form>
                      <script>
                        setTimeout(() => {
                          document.getElementById('paymentForm').submit();
                          // Notify parent that form has been submitted
                          setTimeout(() => {
                            window.parent.postMessage({ type: 'PAYMENT_FORM_SUBMITTED' }, '*');
                          }, 200);
                        }, 1500);
                      </script>
                    </body>
                    </html>
                  `;

                  // Write to iframe
                  const doc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (doc) {
                    doc.open();
                    doc.write(formHtml);
                    doc.close();
                  }

                  // Reset initial loading state when modal opens
                  setIsInitialLoading(true);
                  setTimeout(() => {
                    setIsInitialLoading(false);
                  }, 2500); // 1500ms form delay + 1000ms buffer
                }
              }}
              className="w-full h-full border-0"
              title="Payment Gateway"
              sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation"
              onLoad={() => {
                // Also hide loading when iframe content loads
                setTimeout(() => {
                  setIsInitialLoading(false);
                }, 500);
              }}
            />

            {/* Loading Overlay */}
            {isInitialLoading && !paymentError && (
            <div
              className={`absolute inset-0 flex items-center justify-center pointer-events-none ${
                isDarkMode ? "bg-gray-900/50" : "bg-white/50"
              }`}
            >
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  {t("processingPayment") || "Processing payment..."}
                </p>
              </div>
            </div>
            )}
          </div>

          {/* Footer Info */}
          <div
            className={`px-6 py-4 border-t ${
              isDarkMode
                ? "bg-gray-800 border-gray-700"
                : "bg-gray-50 border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-4">
                <div>
                  <span
                    className={isDarkMode ? "text-gray-400" : "text-gray-600"}
                  >
                    {t("items") || "Items"}:
                  </span>
                  <span
                    className={`ml-2 font-semibold ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {paymentData.itemCount}
                  </span>
                </div>
                <div>
                  <span
                    className={isDarkMode ? "text-gray-400" : "text-gray-600"}
                  >
                    {t("duration") || "Duration"}:
                  </span>
                  <span
                    className={`ml-2 font-semibold ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {boostDuration} {t("minutes") || "min"}
                  </span>
                </div>
              </div>
              <div>
                <span
                  className={isDarkMode ? "text-gray-400" : "text-gray-600"}
                >
                  {t("total") || "Total"}:
                </span>
                <span className="ml-2 font-bold text-green-600 text-lg">
                  {paymentData.totalPrice.toFixed(2)} TL
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!user) return null;

  if (loading) return <LoadingSkeleton />;

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 border-b ${
          isDarkMode
            ? "bg-gray-900 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className={`p-2 rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"
                }`}
              >
                <ArrowLeft
                  size={20}
                  className={isDarkMode ? "text-white" : "text-gray-900"}
                />
              </button>

              <h1
                className={`text-xl font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("ads") || "Boost Products"}
              </h1>
            </div>

            <button
              onClick={() => router.push("/boost-analysis")}
              className={`
                flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors
                ${
                  isDarkMode
                    ? "border-gray-600 text-gray-300 hover:bg-gray-800"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }
              `}
            >
              <BarChart3 size={16} />
              <span className="text-sm font-semibold">
                {t("analytics") || "Analytics"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Empty State or Content */}
      {!hasProductsToBoost() ? (
        <EmptyState />
      ) : (
        <>
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="space-y-6">
              {/* Informational Banner */}
              <div
                className={`rounded-xl border p-6 ${
                  isDarkMode
                    ? "bg-green-900/20 border-green-700/50"
                    : "bg-green-50 border-green-200"
                }`}
              >
                <div className="flex items-start space-x-4">
                  <div
                    className={`p-3 rounded-full ${
                      isDarkMode ? "bg-green-800/30" : "bg-green-100"
                    }`}
                  >
                    <Zap size={24} className="text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h2
                      className={`text-lg font-bold mb-2 ${
                        isDarkMode ? "text-white" : "text-green-900"
                      }`}
                    >
                      {t("boostInfoTitle") ||
                        "Boost Your Products for Maximum Visibility"}
                    </h2>
                    <p
                      className={`text-sm leading-relaxed ${
                        isDarkMode ? "text-gray-300" : "text-green-800"
                      }`}
                    >
                      {t("boostInfoDescription") ||
                        "Your boosted products will appear at the top of search results, category listings, and the home page, giving them maximum exposure to potential buyers."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Main Product Section */}
              {mainProduct && (
                <div>
                  <h2
                    className={`text-sm font-semibold mb-3 uppercase tracking-wide ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    {t("selectedProduct") || "Selected Product"}
                  </h2>
                  <ProductCard product={mainProduct} isPrimary />
                </div>
              )}

              {/* Additional Products Section */}
              {unboostedProducts.length > 0 && (
                <div
                  className={`rounded-xl border p-6 ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2
                      className={`text-lg font-bold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {t("addMoreItems") || "Add More Items"}
                    </h2>

                    {/* Selection Counter */}
                    <div
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        getTotalItemsCount() >= MAX_PRODUCTS
                          ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 border border-orange-200 dark:border-orange-700"
                          : "bg-green-100 dark:bg-green-900/30 text-green-600 border border-green-200 dark:border-green-700"
                      }`}
                    >
                      {getTotalItemsCount()} / {MAX_PRODUCTS}
                    </div>
                  </div>

                  <div className="space-y-3 max-h-80 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 dark:[&::-webkit-scrollbar-track]:bg-gray-700 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb:hover]:bg-gray-400 dark:[&::-webkit-scrollbar-thumb:hover]:bg-gray-500">
                    {unboostedProducts.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        isSelected={selectedProductIds.includes(product.id)}
                        onToggle={() => toggleProductSelection(product.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Duration Selection */}
              <div
                className={`rounded-xl border p-6 ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-center space-x-2 mb-6">
                  <Clock size={20} className="text-green-500" />
                  <h2
                    className={`text-lg font-bold ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("selectBoostDuration") || "Select Boost Duration"}
                  </h2>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4">
                    <button
                      onClick={() =>
                        handleDurationChange(
                          Math.max(0, selectedDurationIndex - 1)
                        )
                      }
                      disabled={selectedDurationIndex === 0}
                      className="p-3 rounded-xl bg-green-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-600 transition-all shadow-lg hover:shadow-xl disabled:hover:bg-green-500"
                    >
                      <Minus size={20} />
                    </button>

                    <div className="flex-1">
                      <div className="relative h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-300 rounded-full"
                          style={{
                            width: `${
                              (selectedDurationIndex /
                                (BOOST_DURATION_OPTIONS.length - 1)) *
                              100
                            }%`,
                          }}
                        />
                      </div>

                      {/* Tick marks */}
                      <div className="flex justify-between mt-2 px-1">
                        {BOOST_DURATION_OPTIONS.map((duration, index) => (
                          <button
                            key={duration}
                            onClick={() => handleDurationChange(index)}
                            className={`w-2 h-2 rounded-full transition-all ${
                              index === selectedDurationIndex
                                ? "bg-green-600 scale-150"
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
                            BOOST_DURATION_OPTIONS.length - 1,
                            selectedDurationIndex + 1
                          )
                        )
                      }
                      disabled={
                        selectedDurationIndex ===
                        BOOST_DURATION_OPTIONS.length - 1
                      }
                      className="p-3 rounded-xl bg-green-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-600 transition-all shadow-lg hover:shadow-xl disabled:hover:bg-green-500"
                    >
                      <Plus size={20} />
                    </button>
                  </div>

                  <div className="text-center">
                    <div className="inline-flex items-center px-6 py-3 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-2xl">
                      <Clock size={16} className="text-green-600 mr-2" />
                      <span className="text-lg font-bold text-green-600">
                        {getDurationLabel(boostDuration)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Price Section */}
              <div
                className={`rounded-xl border p-6 ${
                  isDarkMode
                    ? "bg-gradient-to-br from-orange-900/40 to-pink-900/40 border-orange-700/50"
                    : "bg-gradient-to-br from-orange-50 to-pink-50 border-orange-200"
                }`}
              >
                <div className="text-center space-y-3">
                  <p
                    className={`text-sm font-semibold ${
                      isDarkMode ? "text-gray-200" : "text-gray-600"
                    }`}
                  >
                    {t("totalPriceLabel") || "Total Price"}
                  </p>

                  <div>
                    <span
                      className={`text-4xl font-bold ${
                        isDarkMode
                          ? "text-white"
                          : "bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent"
                      }`}
                    >
                      {totalPrice.toFixed(2)} TL
                    </span>
                  </div>

                  <div
                    className={`text-xs space-y-1 ${
                      isDarkMode ? "text-gray-300" : "text-gray-500"
                    }`}
                  >
                    <p>
                      {getTotalItemsCount()} {t("items") || "items"} ×{" "}
                      {boostDuration} {t("minutes") || "minutes"}
                    </p>
                    <p>
                      {BASE_PRICE_PER_PRODUCT} TL {t("perItemPerMinute") || "per item per minute"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div
            className={`sticky bottom-0 border-t p-4 ${
              isDarkMode
                ? "bg-gray-900 border-gray-700"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="max-w-4xl mx-auto">
              <button
                onClick={proceedToPayment}
                disabled={submitting || getTotalItemsCount() === 0}
                className="
              w-full flex items-center justify-center space-x-2 py-4 px-6 
              bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl 
              font-bold text-lg shadow-lg hover:from-green-600 hover:to-green-700 
              disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
              hover:shadow-xl active:scale-[0.98]
            "
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>{t("preparingPayment") || "Preparing..."}</span>
                  </>
                ) : (
                  <>
                    <CreditCard size={20} />
                    <span>{t("completePayment") || "Complete Payment"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Payment Modal */}
      {showPaymentModal && <PaymentModal />}

      
    </div>
  );
}