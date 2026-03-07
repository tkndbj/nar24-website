"use client";

import React, { useState, useEffect, useRef } from "react";
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
  const [paymentStatus, setPaymentStatus] = useState<string>("pending");

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const statusCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get params from URL
  const gatewayUrl = searchParams.get("gatewayUrl");
  const orderNumber = searchParams.get("orderNumber");
  const paymentParamsStr = searchParams.get("paymentParams");

  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!gatewayUrl || !orderNumber || !paymentParamsStr) {
      setError(t("missingPaymentInfo"));
      setIsLoading(false);
      return;
    }

    // Start status polling
    startStatusPolling();

    // Submit payment form programmatically
    submitPaymentForm();

    return () => {
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
    };
  }, [gatewayUrl, orderNumber, paymentParamsStr]);

  const submitPaymentForm = () => {
    try {
      const paymentParams = JSON.parse(paymentParamsStr!);

      // Create form dynamically
      const form = document.createElement("form");
      form.method = "POST";
      form.action = gatewayUrl!;
      form.target = "payment-iframe";
      form.style.display = "none";

      // Add all payment parameters as hidden inputs
      Object.entries(paymentParams).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      });

      // Append form to body and submit
      document.body.appendChild(form);

      setTimeout(() => {
        form.submit();
        setIsLoading(false);
        // Clean up form after submission
        setTimeout(() => form.remove(), 1000);
      }, 1500);
    } catch (err) {
      console.error("Error submitting payment form:", err);
      setError(t("paymentError"));
      setIsLoading(false);
    }
  };

  const startStatusPolling = () => {
    if (!orderNumber) return;

    let pollCount = 0;
    const maxPolls = 300; // 5 minutes max (300 seconds)

    statusCheckIntervalRef.current = setInterval(async () => {
      pollCount++;

      if (pollCount > maxPolls) {
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
        }
        handlePaymentTimeout();
        return;
      }

      await checkPaymentStatus();
    }, 1000); // Check every second
  };

  const checkPaymentStatus = async () => {
    if (!orderNumber) return;

    try {
      const checkStatus = httpsCallable(functions, "checkIsbankPaymentStatus");
      const result = await checkStatus({ orderNumber });

      const data = result.data as PaymentStatusResponse;
      const status = data?.status;

      console.log("🔍 Payment status:", status);

      if (status === "completed") {
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
        }
        setPaymentStatus("completed");
        handlePaymentSuccess(data.orderId || "");
      } else if (
        status === "payment_failed" ||
        status === "hash_verification_failed" ||
        status === "payment_succeeded_order_failed"
      ) {
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
        }
        setPaymentStatus("failed");
        handlePaymentFailed(data.errorMessage || t("paymentFailed"));
      }
    } catch (error) {
      console.error("Error checking payment status:", error);
    }
  };

  const handlePaymentSuccess = (orderId: string) => {
    // Clear cart
    localStorage.removeItem("cartItems");
    localStorage.removeItem("cartTotal");

    // Show success message
    setTimeout(() => {
      router.push(`/orders?success=true&orderId=${orderId}`);
    }, 1500);
  };

  const handlePaymentFailed = (errorMessage: string) => {
    setError(errorMessage);
    setTimeout(() => {
      router.back();
    }, 3000);
  };

  const handlePaymentTimeout = () => {
    setError(t("paymentTimeout"));
    setTimeout(() => {
      router.back();
    }, 3000);
  };

  const handleCancel = () => {
    if (statusCheckIntervalRef.current) {
      clearInterval(statusCheckIntervalRef.current);
    }

    if (confirm(t("cancelPaymentConfirm"))) {
      router.back();
    }
  };

  if (!gatewayUrl || !orderNumber || !paymentParamsStr) {
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

  // Payment failed
  if (paymentStatus === "failed" || error) {
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
            {t("paymentFailed")}
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
