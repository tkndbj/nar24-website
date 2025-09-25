"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

interface Section {
  id: string;
  title: string;
  content: string[];
}

export default function CancelAndReturnPolicy() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const t = useTranslations("cancelAndReturnPolicy");

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

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const sections: Section[] = [
    {
      id: "general",
      title: t("sections.general.title"),
      content: t.raw("sections.general.content") as string[],
    },
    {
      id: "rightOfWithdrawal",
      title: t("sections.rightOfWithdrawal.title"),
      content: t.raw("sections.rightOfWithdrawal.content") as string[],
    },
    {
      id: "withdrawalProcess",
      title: t("sections.withdrawalProcess.title"),
      content: t.raw("sections.withdrawalProcess.content") as string[],
    },
    {
      id: "returnConditions",
      title: t("sections.returnConditions.title"),
      content: t.raw("sections.returnConditions.content") as string[],
    },
    {
      id: "nonReturnableItems",
      title: t("sections.nonReturnableItems.title"),
      content: t.raw("sections.nonReturnableItems.content") as string[],
    },
    {
      id: "damagedProducts",
      title: t("sections.damagedProducts.title"),
      content: t.raw("sections.damagedProducts.content") as string[],
    },
    {
      id: "refundPolicy",
      title: t("sections.refundPolicy.title"),
      content: t.raw("sections.refundPolicy.content") as string[],
    },
    {
      id: "paymentIssues",
      title: t("sections.paymentIssues.title"),
      content: t.raw("sections.paymentIssues.content") as string[],
    },
    {
      id: "deliveryIssues",
      title: t("sections.deliveryIssues.title"),
      content: t.raw("sections.deliveryIssues.content") as string[],
    },
  ];

  return (
    <div
      className={`min-h-screen py-8 md:py-12 ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center p-3 bg-gradient-to-r from-blue-500 to-teal-500 rounded-2xl mb-6">
            <RotateCcw className="w-8 h-8 text-white" />
          </div>
          <h1
            className={`text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r ${
              isDarkMode
                ? "from-white to-gray-300"
                : "from-gray-900 to-gray-600"
            } bg-clip-text text-transparent`}
          >
            {t("title")}
          </h1>
          <p
            className={`text-lg ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {t("lastUpdated")}: {t("updateDate")}
          </p>
        </div>

        {/* Introduction */}
        <div
          className={`rounded-2xl p-6 md:p-8 mb-8 ${
            isDarkMode
              ? "bg-gradient-to-br from-blue-900/20 to-teal-900/20 border border-blue-800/30"
              : "bg-gradient-to-br from-blue-50 to-teal-50 border border-blue-200"
          }`}
        >
          <p
            className={`text-base md:text-lg leading-relaxed ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
          >
            {t("introduction")}
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((section, index) => (
            <div
              key={section.id}
              className={`rounded-xl overflow-hidden transition-all duration-200 ${
                isDarkMode
                  ? "bg-gray-800 border border-gray-700"
                  : "bg-white border border-gray-200"
              }`}
            >
              <button
                onClick={() => toggleSection(section.id)}
                className={`w-full flex items-center justify-between p-6 text-left transition-colors ${
                  isDarkMode ? "hover:bg-gray-700/50" : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span
                    className={`flex items-center justify-center w-8 h-8 rounded-lg font-bold ${
                      isDarkMode
                        ? "bg-gradient-to-r from-blue-500 to-teal-500 text-white"
                        : "bg-gradient-to-r from-blue-500 to-teal-500 text-white"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <h2
                    className={`text-lg md:text-xl font-semibold ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {section.title}
                  </h2>
                </div>
                {expandedSections.includes(section.id) ? (
                  <ChevronUp
                    className={`w-5 h-5 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  />
                ) : (
                  <ChevronDown
                    className={`w-5 h-5 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  />
                )}
              </button>

              {expandedSections.includes(section.id) && (
                <div
                  className={`px-6 pb-6 space-y-4 ${
                    isDarkMode
                      ? "border-t border-gray-700"
                      : "border-t border-gray-200"
                  }`}
                >
                  {section.content.map((paragraph, pIndex) => (
                    <p
                      key={pIndex}
                      className={`text-base leading-relaxed pl-12 ${
                        isDarkMode ? "text-gray-300" : "text-gray-700"
                      }`}
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer Note */}
        <div
          className={`mt-8 rounded-xl p-6 text-center ${
            isDarkMode
              ? "bg-gray-800 border border-gray-700"
              : "bg-white border border-gray-200"
          }`}
        >
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {t("footerNote")}
          </p>
        </div>
      </div>
    </div>
  );
}