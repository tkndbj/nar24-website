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
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useUser } from "@/context/UserProvider";
import { collection, addDoc, Timestamp } from "firebase/firestore";
import { X } from "lucide-react";
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

  const handleToggleExpand = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div
      className={`min-h-screen ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
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
              {t("SupportFAQ.supportAndFaq")}
            </h1>
            <div className="w-9" /> {/* Spacer for centering */}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* Header Section */}
        <div className="mb-8 md:mb-12">
          <div
            className={`rounded-2xl md:rounded-3xl p-6 md:p-8 text-center ${
              isDarkMode
                ? "bg-gradient-to-br from-orange-900/20 to-pink-900/20"
                : "bg-gradient-to-br from-orange-50 to-pink-50"
            }`}
          >
            <div className="flex justify-center mb-4 md:mb-6">
              <div
                className={`w-20 h-20 md:w-32 md:h-32 rounded-full overflow-hidden shadow-lg ${
                  isDarkMode ? "bg-gray-800" : "bg-white"
                }`}
              >
                <div className="w-full h-full flex items-center justify-center">
                  <HelpCircle className="w-10 h-10 md:w-16 md:h-16 text-orange-500" />
                </div>
              </div>
            </div>
            <h2
              className={`text-2xl md:text-3xl font-bold mb-2 md:mb-4 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("SupportFAQ.supportTitle")}
            </h2>
            <p
              className={`text-base md:text-lg ${
                isDarkMode ? "text-gray-300" : "text-gray-600"
              }`}
            >
              {t("SupportFAQ.supportSubtitle")}
            </p>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mb-8 md:mb-12">
          {/* FAQ Section Title */}
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-r from-orange-500 to-pink-500 rounded-lg">
              <HelpCircle className="w-5 h-5 text-white" />
            </div>
            <h3
              className={`text-xl md:text-2xl font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("SupportFAQ.frequentlyAskedQuestions")}
            </h3>
          </div>

          {/* FAQ List */}
          <div className="space-y-3 md:space-y-4">
            {faqData.map((faq, index) => {
              const isExpanded = expandedIndex === index;
              return (
                <div
                  key={index}
                  className={`rounded-xl md:rounded-2xl overflow-hidden transition-all duration-200 ${
                    isDarkMode
                      ? "bg-gray-800 border border-gray-700"
                      : "bg-white border border-gray-100"
                  } ${
                    isExpanded
                      ? "ring-2 ring-orange-200 shadow-lg"
                      : "shadow-sm hover:shadow-md"
                  }`}
                >
                  <button
                    onClick={() => handleToggleExpand(index)}
                    className="w-full p-4 md:p-6 text-left transition-colors hover:bg-opacity-50"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h4
                        className={`text-sm md:text-base font-semibold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {faq.question}
                      </h4>
                      <div
                        className={`flex-shrink-0 p-1 rounded-md transition-all duration-200 ${
                          isExpanded
                            ? "bg-orange-100 text-orange-600"
                            : isDarkMode
                            ? "text-gray-400"
                            : "text-gray-500"
                        }`}
                      >
                        <ChevronDown
                          className={`w-4 h-4 md:w-5 md:h-5 transition-transform duration-200 ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </div>
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isExpanded ? "max-h-96" : "max-h-0"
                    }`}
                  >
                    <div className="px-4 md:px-6 pb-4 md:pb-6">
                      <div
                        className={`h-px mb-4 ${
                          isDarkMode ? "bg-gray-700" : "bg-gray-200"
                        }`}
                      />
                      <p
                        className={`text-sm md:text-base leading-relaxed ${
                          isDarkMode ? "text-gray-300" : "text-gray-600"
                        }`}
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

        {/* Still Need Help Section */}
<div
  className={`rounded-2xl md:rounded-3xl p-6 md:p-8 text-center ${
    isDarkMode
      ? "bg-gray-800 border border-gray-700"
      : "bg-gray-50 border border-gray-200"
  }`}
>
  <div className="mb-4 md:mb-6">
    <div
      className={`inline-flex p-3 md:p-4 rounded-full ${
        isDarkMode ? "bg-orange-900/30" : "bg-orange-100"
      }`}
    >
      <Mail className="w-6 h-6 md:w-8 md:h-8 text-orange-500" />
    </div>
  </div>

  <h3
    className={`text-xl md:text-2xl font-bold mb-2 md:mb-4 ${
      isDarkMode ? "text-white" : "text-gray-900"
    }`}
  >
    {t("SupportFAQ.stillNeedHelp")}
  </h3>

  <p
    className={`text-sm md:text-base mb-6 md:mb-8 ${
      isDarkMode ? "text-gray-300" : "text-gray-600"
    }`}
  >
    {t("SupportFAQ.stillNeedHelpDescription")}
  </p>

  <button
    onClick={() => {
      if (!user) {
        router.push("/login");
      } else {
        setShowHelpForm(true);
      }
    }}
    className="mx-auto flex items-center justify-center gap-2 px-6 md:px-8 py-3 md:py-4 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl"
  >
    <Mail className="w-5 h-5" />
    <span className="text-sm md:text-base">
      {t("SupportFAQ.contactSupport")}
    </span>
  </button>
</div>

{/* Help Form Modal */}
{showHelpForm && user && (
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className={`${isDarkMode ? "bg-gray-800" : "bg-white"} rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl`}>
      {/* Modal Header */}
      <div className="sticky top-0 bg-gradient-to-r from-orange-500 to-pink-500 px-6 py-4 rounded-t-2xl flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">
          {t("SupportFAQ.helpFormTitle")}
        </h2>
        <button
          onClick={() => {
            setShowHelpForm(false);
            setHelpDescription("");
            setHelpErrors({});
          }}
          className="p-2 hover:bg-white/20 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Modal Body */}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          
          if (!helpDescription.trim()) {
            setHelpErrors({ description: t("SupportFAQ.descriptionRequired") });
            return;
          }
          
          if (helpDescription.trim().length < 20) {
            setHelpErrors({ description: t("SupportFAQ.descriptionTooShort") });
            return;
          }

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

            setTimeout(() => {
              setShowSuccessModal(false);
            }, 2500);
          } catch (error) {
            console.error("Error submitting help form:", error);
            alert(t("SupportFAQ.submitError"));
          } finally {
            setIsSubmittingHelp(false);
          }
        }}
        className="p-6 space-y-6"
      >
        {/* Name Field */}
        <div>
          <label className={`flex items-center gap-2 text-sm font-semibold mb-3 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            <User className="w-4 h-4 text-orange-500" />
            {t("SupportFAQ.nameLabel")}
          </label>
          <input
            type="text"
            value={profileData?.displayName || t("SupportFAQ.noName")}
            disabled
            className={`w-full px-4 py-3 rounded-lg text-sm md:text-base transition-colors ${
              isDarkMode
                ? "bg-gray-700 text-gray-400 border-gray-600"
                : "bg-gray-100 text-gray-600 border-gray-200"
            } border cursor-not-allowed`}
          />
        </div>

        {/* Email Field */}
        <div>
          <label className={`flex items-center gap-2 text-sm font-semibold mb-3 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            <Mail className="w-4 h-4 text-orange-500" />
            {t("SupportFAQ.emailLabel")}
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

        {/* Description Field */}
        <div>
          <label className={`flex items-center gap-2 text-sm font-semibold mb-3 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            <MessageSquare className="w-4 h-4 text-orange-500" />
            {t("SupportFAQ.descriptionLabel")}
          </label>
          <textarea
            value={helpDescription}
            onChange={(e) => {
              setHelpDescription(e.target.value);
              if (helpErrors.description) {
                setHelpErrors({});
              }
            }}
            placeholder={t("SupportFAQ.descriptionPlaceholder")}
            rows={6}
            className={`w-full px-4 py-3 rounded-lg text-sm md:text-base transition-colors resize-none ${
              isDarkMode
                ? "bg-gray-700 text-white border-gray-600 placeholder-gray-500"
                : "bg-white text-gray-900 border-gray-300 placeholder-gray-400"
            } border focus:outline-none focus:ring-2 focus:ring-orange-500 ${
              helpErrors.description ? "border-red-500" : ""
            }`}
          />
          <div className="flex items-center justify-between mt-2">
            {helpErrors.description ? (
              <p className="text-xs md:text-sm text-red-500">
                {helpErrors.description}
              </p>
            ) : (
              <p className={`text-xs md:text-sm ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                {t("SupportFAQ.descriptionHelper")}
              </p>
            )}
            <span
              className={`text-xs ${
                helpDescription.length < 20
                  ? "text-red-500"
                  : isDarkMode
                  ? "text-gray-400"
                  : "text-gray-500"
              }`}
            >
              {helpDescription.length}/20
            </span>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmittingHelp}
          className={`w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-semibold text-white transition-all duration-200 ${
            isSubmittingHelp
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 shadow-lg hover:shadow-xl active:scale-95"
          }`}
        >
          {isSubmittingHelp ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              {t("SupportFAQ.submitting")}
            </>
          ) : (
            <>
              <Mail className="w-5 h-5" />
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
  <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className={`${isDarkMode ? "bg-gray-800" : "bg-white"} rounded-2xl p-8 max-w-md w-full shadow-2xl transform transition-all`}>
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
          <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className={`text-xl font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          {t("SupportFAQ.successTitle")}
        </h3>
        <p className={`text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
          {t("SupportFAQ.submitSuccess")}
        </p>
      </div>
    </div>
  </div>
)}
      </div>
    </div>
  );
}