"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  HelpCircle,
  ChevronDown,
  Mail,
  MessageSquare,
} from "lucide-react";
import { useTranslations } from "next-intl";


interface FAQItem {
  question: string;
  answer: string;
}

export default function SupportAndFaqPage() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
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

  const handleEmailSupport = () => {
    // Show email support message or open email client
    alert(t("SupportFAQ.emailSupportMessage"));
  };

  const handleLiveChat = () => {
    // Show live chat message or open chat widget
    alert(t("SupportFAQ.liveChatMessage"));
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

          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 max-w-md mx-auto">
            <button
              onClick={handleEmailSupport}
              className="flex-1 flex items-center justify-center gap-2 px-4 md:px-6 py-3 md:py-4 border-2 border-orange-500 text-orange-500 rounded-xl font-semibold transition-colors hover:bg-orange-50 dark:hover:bg-orange-900/20"
            >
              <Mail className="w-4 h-4 md:w-5 md:h-5" />
              <span className="text-sm md:text-base">
                {t("SupportFAQ.emailSupport")}
              </span>
            </button>

            <button
              onClick={handleLiveChat}
              className="flex-1 flex items-center justify-center gap-2 px-4 md:px-6 py-3 md:py-4 border-2 border-green-500 text-green-500 rounded-xl font-semibold transition-colors hover:bg-green-50 dark:hover:bg-green-900/20"
            >
              <MessageSquare className="w-4 h-4 md:w-5 md:h-5" />
              <span className="text-sm md:text-base">
                {t("SupportFAQ.liveChat")}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}