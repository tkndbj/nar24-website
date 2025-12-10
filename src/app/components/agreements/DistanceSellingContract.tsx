"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { FileText, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";

interface Section {
  id: string;
  title: string;
  content: string[];
}

export default function DistanceSellingContract() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const t = useTranslations("distanceSellingContract");
  const router = useRouter();

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
      id: "parties",
      title: t("sections.parties.title"),
      content: t.raw("sections.parties.content") as string[],
    },
    {
      id: "subject",
      title: t("sections.subject.title"),
      content: t.raw("sections.subject.content") as string[],
    },
    {
      id: "productInfo",
      title: t("sections.productInfo.title"),
      content: t.raw("sections.productInfo.content") as string[],
    },
    {
      id: "generalProvisions",
      title: t("sections.generalProvisions.title"),
      content: t.raw("sections.generalProvisions.content") as string[],
    },
    {
      id: "rightOfWithdrawal",
      title: t("sections.rightOfWithdrawal.title"),
      content: t.raw("sections.rightOfWithdrawal.content") as string[],
    },
    {
      id: "nonWithdrawableProducts",
      title: t("sections.nonWithdrawableProducts.title"),
      content: t.raw("sections.nonWithdrawableProducts.content") as string[],
    },
    {
      id: "defaultProvisions",
      title: t("sections.defaultProvisions.title"),
      content: t.raw("sections.defaultProvisions.content") as string[],
    },
    {
      id: "jurisdiction",
      title: t("sections.jurisdiction.title"),
      content: t.raw("sections.jurisdiction.content") as string[],
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
        <div className="relative text-center mb-12">
          <button
            onClick={() => router.back()}
            className={`absolute left-0 top-0 p-2 rounded-full transition-colors ${
              isDarkMode
                ? "bg-gray-800 hover:bg-gray-700 text-gray-300"
                : "bg-white hover:bg-gray-100 text-gray-700"
            } shadow-md`}
            aria-label="Go back"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="inline-flex items-center justify-center p-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl mb-6">
            <FileText className="w-8 h-8 text-white" />
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
              ? "bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-800/30"
              : "bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200"
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
                        ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                        : "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
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

        {/* Withdrawal Form Section */}
        <div
          className={`mt-8 rounded-xl p-6 md:p-8 ${
            isDarkMode
              ? "bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-800/30"
              : "bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200"
          }`}
        >
          <h3
            className={`text-xl font-bold mb-4 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("withdrawalForm.title")}
          </h3>
          <div
            className={`space-y-2 text-sm ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
          >
            <p>{t("withdrawalForm.description")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}