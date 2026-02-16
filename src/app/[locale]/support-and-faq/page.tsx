"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  HelpCircle,
  ChevronDown,
  Mail,
  MessageSquare,
  User,
  X,
  CheckCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useUser } from "@/context/UserProvider";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface FAQItem {
  question: string;
  answer: string;
}

export default function SupportAndFaqPage() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showHelpForm, setShowHelpForm] = useState(false);
  const [helpDescription, setHelpDescription] = useState("");
  const [isSubmittingHelp, setIsSubmittingHelp] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const { user, profileData } = useUser();
  const [helpErrors, setHelpErrors] = useState<{ [key: string]: string }>({});
  const router = useRouter();
  const t = useTranslations();

  React.useEffect(() => {
    const check = () => {
      if (typeof document !== "undefined")
        setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    check();
    const obs = new MutationObserver(check);
    if (typeof document !== "undefined")
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    return () => obs.disconnect();
  }, []);

  const faqData: FAQItem[] = [
    {
      question: t("SupportFAQ.faqShippingQuestion"),
      answer: t("SupportFAQ.faqShippingAnswer"),
    },
    {
      question: t("SupportFAQ.faqReturnQuestion"),
      answer: t("SupportFAQ.faqReturnAnswer"),
    },
    {
      question: t("SupportFAQ.faqPaymentQuestion"),
      answer: t("SupportFAQ.faqPaymentAnswer"),
    },
    {
      question: t("SupportFAQ.faqAccountQuestion"),
      answer: t("SupportFAQ.faqAccountAnswer"),
    },
    {
      question: t("SupportFAQ.faqOrderQuestion"),
      answer: t("SupportFAQ.faqOrderAnswer"),
    },
    {
      question: t("SupportFAQ.faqRefundQuestion"),
      answer: t("SupportFAQ.faqRefundAnswer"),
    },
    {
      question: t("SupportFAQ.faqSellerQuestion"),
      answer: t("SupportFAQ.faqSellerAnswer"),
    },
    {
      question: t("SupportFAQ.faqSafetyQuestion"),
      answer: t("SupportFAQ.faqSafetyAnswer"),
    },
  ];

  const handleSubmitHelp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!helpDescription.trim()) {
      setHelpErrors({ description: t("SupportFAQ.descriptionRequired") });
      return;
    }
    if (helpDescription.trim().length < 20) {
      setHelpErrors({ description: t("SupportFAQ.descriptionTooShort") });
      return;
    }
    if (!user) return;
    setIsSubmittingHelp(true);
    try {
      await addDoc(collection(db, "help-forms"), {
        userId: user.uid,
        displayName: profileData?.displayName || "",
        email: profileData?.email || user.email || "",
        description: helpDescription.trim(),
        status: "pending",
        createdAt: Timestamp.now(),
      });
      setShowHelpForm(false);
      setHelpDescription("");
      setHelpErrors({});
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 2500);
    } catch (error) {
      console.error("Error:", error);
      alert(t("SupportFAQ.submitError"));
    } finally {
      setIsSubmittingHelp(false);
    }
  };

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
    >
      {/* Sticky Toolbar */}
      <div
        className={`sticky top-14 z-30 border-b ${isDarkMode ? "bg-gray-900/80 backdrop-blur-xl border-gray-700/80" : "bg-white/80 backdrop-blur-xl border-gray-100/80"}`}
      >
        <div className="max-w-4xl mx-auto flex items-center gap-3 px-3 sm:px-6 py-3">
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
            {t("SupportFAQ.supportAndFaq")}
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-4">
        {/* Header Banner */}
        <div
          className={`rounded-2xl p-4 text-center ${isDarkMode ? "bg-orange-900/10 border border-orange-700/30" : "bg-orange-50 border border-orange-100"}`}
        >
          <div
            className={`w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center ${isDarkMode ? "bg-orange-900/30" : "bg-orange-100"}`}
          >
            <HelpCircle className="w-5 h-5 text-orange-500" />
          </div>
          <h2
            className={`text-sm font-bold mb-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("SupportFAQ.supportTitle")}
          </h2>
          <p
            className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {t("SupportFAQ.supportSubtitle")}
          </p>
        </div>

        {/* FAQ Section */}
        <div>
          <div className="flex items-center gap-2 mb-2.5 px-1">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center ${isDarkMode ? "bg-orange-900/30" : "bg-orange-50"}`}
            >
              <HelpCircle className="w-3 h-3 text-orange-500" />
            </div>
            <span
              className={`text-xs font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {t("SupportFAQ.frequentlyAskedQuestions")}
            </span>
          </div>

          <div className="space-y-2">
            {faqData.map((faq, index) => {
              const isExpanded = expandedIndex === index;
              return (
                <div
                  key={index}
                  className={`rounded-2xl border overflow-hidden transition-all ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-100"
                  } ${isExpanded ? (isDarkMode ? "ring-1 ring-orange-700/50" : "ring-1 ring-orange-200") : "hover:shadow-md hover:-translate-y-0.5"}`}
                >
                  <button
                    onClick={() => setExpandedIndex(isExpanded ? null : index)}
                    className="w-full px-4 py-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h4
                        className={`text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                      >
                        {faq.question}
                      </h4>
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                          isExpanded
                            ? isDarkMode
                              ? "bg-orange-900/30"
                              : "bg-orange-50"
                            : isDarkMode
                              ? "bg-gray-700"
                              : "bg-gray-100"
                        }`}
                      >
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180 text-orange-500" : isDarkMode ? "text-gray-400" : "text-gray-400"}`}
                        />
                      </div>
                    </div>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? "max-h-96" : "max-h-0"}`}
                  >
                    <div className="px-4 pb-3">
                      <div
                        className={`h-px mb-3 ${isDarkMode ? "bg-gray-700" : "bg-gray-100"}`}
                      />
                      <p
                        className={`text-xs leading-relaxed ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
                      >
                        {faq.answer}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Contact Support Card */}
        <div
          className={`rounded-2xl border p-4 text-center ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
        >
          <div
            className={`w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center ${isDarkMode ? "bg-orange-900/30" : "bg-orange-50"}`}
          >
            <Mail className="w-5 h-5 text-orange-500" />
          </div>
          <h3
            className={`text-sm font-bold mb-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("SupportFAQ.stillNeedHelp")}
          </h3>
          <p
            className={`text-xs mb-3 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {t("SupportFAQ.stillNeedHelpDescription")}
          </p>
          <button
            onClick={() => {
              if (!user) router.push("/login");
              else setShowHelpForm(true);
            }}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-orange-500 text-white rounded-xl text-xs font-medium hover:bg-orange-600 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            {t("SupportFAQ.contactSupport")}
          </button>
        </div>
      </div>

      {/* Help Form Modal */}
      {showHelpForm && user && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className={`w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh] ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between p-4 border-b ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDarkMode ? "bg-orange-900/30" : "bg-orange-50"}`}
                >
                  <Mail className="w-4 h-4 text-orange-500" />
                </div>
                <h2
                  className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {t("SupportFAQ.helpFormTitle")}
                </h2>
              </div>
              <button
                onClick={() => {
                  setShowHelpForm(false);
                  setHelpDescription("");
                  setHelpErrors({});
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-lg ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
              >
                <X
                  className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                />
              </button>
            </div>

            {/* Body */}
            <form
              onSubmit={handleSubmitHelp}
              className="p-4 flex flex-col flex-1 min-h-0 space-y-3"
            >
              {/* Name */}
              <div>
                <label
                  className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                >
                  <User className="w-3 h-3 text-orange-500" />
                  {t("SupportFAQ.nameLabel")}
                </label>
                <input
                  type="text"
                  value={profileData?.displayName || t("SupportFAQ.noName")}
                  disabled
                  className={`w-full px-3 py-2 rounded-xl text-sm border cursor-not-allowed ${isDarkMode ? "bg-gray-700/50 text-gray-400 border-gray-600" : "bg-gray-50 text-gray-500 border-gray-200"}`}
                />
              </div>

              {/* Email */}
              <div>
                <label
                  className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                >
                  <Mail className="w-3 h-3 text-orange-500" />
                  {t("SupportFAQ.emailLabel")}
                </label>
                <input
                  type="email"
                  value={profileData?.email || user.email || ""}
                  disabled
                  className={`w-full px-3 py-2 rounded-xl text-sm border cursor-not-allowed ${isDarkMode ? "bg-gray-700/50 text-gray-400 border-gray-600" : "bg-gray-50 text-gray-500 border-gray-200"}`}
                />
              </div>

              {/* Description */}
              <div className="flex-1 flex flex-col min-h-0">
                <label
                  className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-1.5 flex-shrink-0 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                >
                  <MessageSquare className="w-3 h-3 text-orange-500" />
                  {t("SupportFAQ.descriptionLabel")}
                </label>
                <textarea
                  value={helpDescription}
                  onChange={(e) => {
                    setHelpDescription(e.target.value);
                    if (helpErrors.description) setHelpErrors({});
                  }}
                  placeholder={t("SupportFAQ.descriptionPlaceholder")}
                  className={`w-full flex-1 px-3 py-2 rounded-xl text-sm border resize-none min-h-[100px] transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/20 ${
                    isDarkMode
                      ? "bg-gray-700 text-white border-gray-600 placeholder-gray-500"
                      : "bg-white text-gray-900 border-gray-200 placeholder-gray-400"
                  } ${helpErrors.description ? "border-red-500" : ""}`}
                />
                <div className="flex items-center justify-between mt-1.5 flex-shrink-0">
                  {helpErrors.description ? (
                    <p className="text-[11px] text-red-500">
                      {helpErrors.description}
                    </p>
                  ) : (
                    <p
                      className={`text-[11px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                    >
                      {t("SupportFAQ.descriptionHelper")}
                    </p>
                  )}
                  <span
                    className={`text-[11px] font-mono ${helpDescription.length < 20 ? "text-red-500" : isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                  >
                    {helpDescription.length}/20
                  </span>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmittingHelp}
                className="w-full flex-shrink-0 flex items-center justify-center gap-2 py-3 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isSubmittingHelp ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t("SupportFAQ.submitting")}
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    {t("SupportFAQ.submitButton")}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className={`rounded-2xl p-6 max-w-sm w-full shadow-2xl ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <div className="text-center">
              <div
                className={`w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center ${isDarkMode ? "bg-green-900/30" : "bg-green-50"}`}
              >
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <h3
                className={`text-sm font-bold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {t("SupportFAQ.successTitle")}
              </h3>
              <p
                className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
              >
                {t("SupportFAQ.submitSuccess")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
