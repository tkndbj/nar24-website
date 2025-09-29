"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserProvider";
import {
  ArrowLeft,
  Package,
  User,
  Mail,
  FileText,
  Send,
  Info,
  CheckCircle,
  Truck,
  Store,
  PackageCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";

// Shipment status types
type ShipmentStatus =
  | "at-shop"
  | "collected"
  | "in-transit"
  | "out-for-delivery"
  | "delivered"
  | "not-found";

interface ShipmentInfo {
  status: ShipmentStatus;
  timestamp: string;
  location?: string;
}

export default function ShippingInfoPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [shipmentCode, setShipmentCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [shipmentInfo, setShipmentInfo] = useState<ShipmentInfo | null>(null);
  const { user, profileData } = useUser();
  const router = useRouter();
  const t = useTranslations();

  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => observer.disconnect();
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!shipmentCode.trim()) {
      setError(t("ShippingInfo.codeRequired"));
      return;
    }

    if (shipmentCode.trim().length < 6) {
      setError(t("ShippingInfo.codeTooShort"));
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // Simulate API call - Replace this with your actual API endpoint
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Mock response - Replace with actual API response
      // This is just for demonstration
      const mockStatuses: ShipmentStatus[] = [
        "at-shop",
        "collected",
        "in-transit",
        "out-for-delivery",
        "delivered",
      ];
      const randomStatus =
        mockStatuses[Math.floor(Math.random() * mockStatuses.length)];

      setShipmentInfo({
        status: randomStatus,
        timestamp: new Date().toISOString(),
        location: "Nar24 Ana Depolama Merkezi",
      });
    } catch (err) {
      console.error("Error fetching shipment info:", err);
      setError(t("ShippingInfo.fetchError"));
      setShipmentInfo(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusIcon = (status: ShipmentStatus) => {
    switch (status) {
      case "at-shop":
        return <Store className="w-8 h-8 text-blue-500" />;
      case "collected":
        return <PackageCheck className="w-8 h-8 text-indigo-500" />;
      case "in-transit":
        return <Truck className="w-8 h-8 text-orange-500" />;
      case "out-for-delivery":
        return <Truck className="w-8 h-8 text-purple-500" />;
      case "delivered":
        return <CheckCircle className="w-8 h-8 text-green-500" />;
      default:
        return <Package className="w-8 h-8 text-gray-500" />;
    }
  };

  const getStatusColor = (status: ShipmentStatus) => {
    switch (status) {
      case "at-shop":
        return "from-blue-500 to-blue-600";
      case "collected":
        return "from-indigo-500 to-indigo-600";
      case "in-transit":
        return "from-orange-500 to-orange-600";
      case "out-for-delivery":
        return "from-purple-500 to-purple-600";
      case "delivered":
        return "from-green-500 to-green-600";
      default:
        return "from-gray-500 to-gray-600";
    }
  };

  if (!user) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 ${
          isDarkMode ? "bg-gray-900" : "bg-white"
        } border-b ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.back()}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
              }`}
            >
              <ArrowLeft
                className={`w-5 h-5 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              />
            </button>
            <h1
              className={`text-lg font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("ShippingInfo.title")}
            </h1>
            <div className="w-9" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* Header Section */}
        <div className="mb-6 md:mb-8">
          <div
            className={`rounded-2xl md:rounded-3xl p-6 md:p-8 text-center ${
              isDarkMode
                ? "bg-gradient-to-br from-orange-900/20 to-pink-900/20"
                : "bg-gradient-to-br from-orange-50 to-pink-50"
            }`}
          >
            <div className="flex justify-center mb-4">
              <div
                className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center ${
                  isDarkMode ? "bg-gray-800" : "bg-white"
                } shadow-lg`}
              >
                <Package className="w-8 h-8 md:w-10 md:h-10 text-orange-500" />
              </div>
            </div>
            <h2
              className={`text-xl md:text-2xl font-bold mb-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("ShippingInfo.headerTitle")}
            </h2>
            <p
              className={`text-sm md:text-base ${
                isDarkMode ? "text-gray-300" : "text-gray-600"
              }`}
            >
              {t("ShippingInfo.headerSubtitle")}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6 mb-8">
          {/* Name Field */}
          <div
            className={`rounded-xl md:rounded-2xl p-4 md:p-6 ${
              isDarkMode
                ? "bg-gray-800 border border-gray-700"
                : "bg-white border border-gray-100"
            } shadow-sm`}
          >
            <label
              className={`flex items-center gap-2 text-sm font-semibold mb-3 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              <User className="w-4 h-4 text-orange-500" />
              {t("ShippingInfo.nameLabel")}
            </label>
            <input
              type="text"
              value={profileData?.displayName || t("ShippingInfo.noName")}
              disabled
              className={`w-full px-4 py-3 rounded-lg text-sm md:text-base transition-colors ${
                isDarkMode
                  ? "bg-gray-700 text-gray-400 border-gray-600"
                  : "bg-gray-100 text-gray-600 border-gray-200"
              } border cursor-not-allowed`}
            />
          </div>

          {/* Email Field */}
          <div
            className={`rounded-xl md:rounded-2xl p-4 md:p-6 ${
              isDarkMode
                ? "bg-gray-800 border border-gray-700"
                : "bg-white border border-gray-100"
            } shadow-sm`}
          >
            <label
              className={`flex items-center gap-2 text-sm font-semibold mb-3 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              <Mail className="w-4 h-4 text-orange-500" />
              {t("ShippingInfo.emailLabel")}
            </label>
            <input
              type="email"
              value={profileData?.email || user.email || ""}
              disabled
              className={`w-full px-4 py-3 rounded-lg text-sm md:text-base transition-colors ${
                isDarkMode
                  ? "bg-gray-700 text-gray-400 border-gray-600"
                  : "bg-gray-100 text-gray-600 border-gray-200"
              } border cursor-not-allowed`}
            />
          </div>

          {/* Shipment Code Field */}
          <div
            className={`rounded-xl md:rounded-2xl p-4 md:p-6 ${
              isDarkMode
                ? "bg-gray-800 border border-gray-700"
                : "bg-white border border-gray-100"
            } shadow-sm`}
          >
            <label
              className={`flex items-center gap-2 text-sm font-semibold mb-3 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              <FileText className="w-4 h-4 text-orange-500" />
              {t("ShippingInfo.codeLabel")}
              <div className="ml-auto flex items-center gap-1 text-xs font-normal text-blue-500">
                <Info className="w-3 h-3" />
                {t("ShippingInfo.codeHint")}
              </div>
            </label>
            <input
              type="text"
              value={shipmentCode}
              onChange={(e) => {
                setShipmentCode(e.target.value.toUpperCase());
                if (error) setError("");
                if (shipmentInfo) setShipmentInfo(null);
              }}
              placeholder={t("ShippingInfo.codePlaceholder")}
              className={`w-full px-4 py-3 rounded-lg text-sm md:text-base transition-colors uppercase font-mono tracking-wider ${
                isDarkMode
                  ? "bg-gray-700 text-white border-gray-600 placeholder-gray-500"
                  : "bg-white text-gray-900 border-gray-300 placeholder-gray-400"
              } border focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                error ? "border-red-500" : ""
              }`}
              maxLength={20}
            />
            {error && (
              <p className="mt-2 text-xs md:text-sm text-red-500">{error}</p>
            )}
            <p
              className={`mt-2 text-xs ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("ShippingInfo.codeHelper")}
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold text-white transition-all duration-200 ${
              isSubmitting
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 shadow-lg hover:shadow-xl active:scale-95"
            }`}
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                {t("ShippingInfo.checking")}
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                {t("ShippingInfo.trackButton")}
              </>
            )}
          </button>
        </form>

        {/* Shipment Status Display */}
        {shipmentInfo && (
          <div
            className={`rounded-2xl md:rounded-3xl overflow-hidden ${
              isDarkMode
                ? "bg-gray-800 border border-gray-700"
                : "bg-white border border-gray-100"
            } shadow-lg animate-fadeIn`}
          >
            {/* Status Header */}
            <div
              className={`bg-gradient-to-r ${getStatusColor(
                shipmentInfo.status
              )} p-6 md:p-8 text-white text-center`}
            >
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  {getStatusIcon(shipmentInfo.status)}
                </div>
              </div>
              <h3 className="text-xl md:text-2xl font-bold mb-2">
                {t(`ShippingInfo.status.${shipmentInfo.status}.title`)}
              </h3>
              <p className="text-sm md:text-base opacity-90">
                {t(`ShippingInfo.status.${shipmentInfo.status}.description`)}
              </p>
            </div>

            {/* Status Details */}
            <div className="p-6 md:p-8 space-y-4">
              <div className="flex items-start gap-3">
                <FileText
                  className={`w-5 h-5 mt-0.5 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                />
                <div className="flex-1">
                  <p
                    className={`text-sm font-semibold mb-1 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("ShippingInfo.trackingCode")}
                  </p>
                  <p
                    className={`text-sm font-mono ${
                      isDarkMode ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    {shipmentCode}
                  </p>
                </div>
              </div>

              {shipmentInfo.location && (
                <div className="flex items-start gap-3">
                  <Store
                    className={`w-5 h-5 mt-0.5 ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  />
                  <div className="flex-1">
                    <p
                      className={`text-sm font-semibold mb-1 ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {t("ShippingInfo.currentLocation")}
                    </p>
                    <p
                      className={`text-sm ${
                        isDarkMode ? "text-gray-300" : "text-gray-600"
                      }`}
                    >
                      {shipmentInfo.location}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <Info
                  className={`w-5 h-5 mt-0.5 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                />
                <div className="flex-1">
                  <p
                    className={`text-sm font-semibold mb-1 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("ShippingInfo.lastUpdate")}
                  </p>
                  <p
                    className={`text-sm ${
                      isDarkMode ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    {new Date(shipmentInfo.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Additional Info */}
            {shipmentInfo.status !== "delivered" && (
              <div
                className={`p-4 mx-6 mb-6 rounded-lg ${
                  isDarkMode
                    ? "bg-blue-900/20 border border-blue-800"
                    : "bg-blue-50 border border-blue-200"
                }`}
              >
                <p
                  className={`text-xs md:text-sm ${
                    isDarkMode ? "text-blue-300" : "text-blue-800"
                  }`}
                >
                  {t("ShippingInfo.infoMessage")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}