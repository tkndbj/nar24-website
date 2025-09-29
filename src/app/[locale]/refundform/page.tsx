"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserProvider";
import { ArrowLeft, FileText, User, Mail, Receipt, MessageSquare, Send, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function RefundFormPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [receiptNo, setReceiptNo] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
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

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!receiptNo.trim()) {
      newErrors.receiptNo = t("RefundForm.receiptNoRequired");
    }

    if (!description.trim()) {
      newErrors.description = t("RefundForm.descriptionRequired");
    } else if (description.trim().length < 20) {
      newErrors.description = t("RefundForm.descriptionTooShort");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Submit refund request to Firestore
      await addDoc(collection(db, "refund-forms"), {
        userId: user.uid,
        displayName: profileData?.displayName || "",
        email: profileData?.email || user.email || "",
        receiptNo: receiptNo.trim(),
        description: description.trim(),
        status: "pending",
        createdAt: Timestamp.now(),
      });

      setShowSuccessModal(true);

// Reset form after a delay
setTimeout(() => {
  setReceiptNo("");
  setDescription("");
  setErrors({});
  setShowSuccessModal(false);
  router.back();
}, 2500);
    } catch (error) {
      console.error("Error submitting refund request:", error);
      alert(t("RefundForm.submitError"));
    } finally {
      setIsSubmitting(false);
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
      className={`min-h-screen ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}
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
              {t("RefundForm.title")}
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
                <FileText className="w-8 h-8 md:w-10 md:h-10 text-orange-500" />
              </div>
            </div>
            <h2
              className={`text-xl md:text-2xl font-bold mb-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("RefundForm.headerTitle")}
            </h2>
            <p
              className={`text-sm md:text-base ${
                isDarkMode ? "text-gray-300" : "text-gray-600"
              }`}
            >
              {t("RefundForm.headerSubtitle")}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name/Surname Field */}
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
              {t("RefundForm.nameLabel")}
            </label>
            <input
              type="text"
              value={profileData?.displayName || t("RefundForm.noName")}
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
              {t("RefundForm.emailLabel")}
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

          {/* Receipt Number Field */}
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
              <Receipt className="w-4 h-4 text-orange-500" />
              {t("RefundForm.receiptNoLabel")}
              <button
                type="button"
                onClick={() => router.push("/receipts")}
                className="ml-auto flex items-center gap-1 text-xs font-medium text-orange-500 hover:text-orange-600 transition-colors"
              >
                {t("RefundForm.findReceipt")}
                <ExternalLink className="w-3 h-3" />
              </button>
            </label>
            <input
              type="text"
              value={receiptNo}
              onChange={(e) => {
                setReceiptNo(e.target.value);
                if (errors.receiptNo) {
                  setErrors({ ...errors, receiptNo: "" });
                }
              }}
              placeholder={t("RefundForm.receiptNoPlaceholder")}
              className={`w-full px-4 py-3 rounded-lg text-sm md:text-base transition-colors ${
                isDarkMode
                  ? "bg-gray-700 text-white border-gray-600 placeholder-gray-500"
                  : "bg-white text-gray-900 border-gray-300 placeholder-gray-400"
              } border focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                errors.receiptNo ? "border-red-500" : ""
              }`}
            />
            {errors.receiptNo && (
              <p className="mt-2 text-xs md:text-sm text-red-500">
                {errors.receiptNo}
              </p>
            )}
          </div>

          {/* Description Field */}
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
              <MessageSquare className="w-4 h-4 text-orange-500" />
              {t("RefundForm.descriptionLabel")}
            </label>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) {
                  setErrors({ ...errors, description: "" });
                }
              }}
              placeholder={t("RefundForm.descriptionPlaceholder")}
              rows={6}
              className={`w-full px-4 py-3 rounded-lg text-sm md:text-base transition-colors resize-none ${
                isDarkMode
                  ? "bg-gray-700 text-white border-gray-600 placeholder-gray-500"
                  : "bg-white text-gray-900 border-gray-300 placeholder-gray-400"
              } border focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                errors.description ? "border-red-500" : ""
              }`}
            />
            <div className="flex items-center justify-between mt-2">
              {errors.description ? (
                <p className="text-xs md:text-sm text-red-500">
                  {errors.description}
                </p>
              ) : (
                <p
                  className={`text-xs md:text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  {t("RefundForm.descriptionHelper")}
                </p>
              )}
              <span
                className={`text-xs ${
                  description.length < 20
                    ? "text-red-500"
                    : isDarkMode
                    ? "text-gray-400"
                    : "text-gray-500"
                }`}
              >
                {description.length}/20
              </span>
            </div>
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
                {t("RefundForm.submitting")}
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                {t("RefundForm.submitButton")}
              </>
            )}
          </button>
        </form>

        {/* Info Section */}
        <div
          className={`mt-6 rounded-xl p-4 ${
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
            {t("RefundForm.infoMessage")}
          </p>
        </div>
        {showSuccessModal && (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className={`${isDarkMode ? "bg-gray-800" : "bg-white"} rounded-2xl p-8 max-w-md w-full shadow-2xl transform transition-all`}>
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
          <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          {t("RefundForm.successTitle")}
        </h3>
        <p className={`text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
          {t("RefundForm.submitSuccess")}
        </p>
      </div>
    </div>
  </div>
)}
      </div>
    </div>
  );
}