// src/components/productdetail/ProductQuestionsWidget.tsx

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  User,
  HelpCircle,
  MessageCircle,
  Languages,
  AlertCircle,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

interface Question {
  id: string;
  questionText: string;
  answerText: string;
  timestamp: string;
  askerName: string;
  askerNameVisible: boolean;
  answered: boolean;
  productId: string;
}

interface SellerInfo {
  profileImageUrl?: string;
  profileImage?: string;
}

interface ProductQuestionsWidgetProps {
  productId: string;
  sellerId: string;
  shopId?: string;
  isShop: boolean;
  isLoading?: boolean;
  isDarkMode?: boolean;
  localization?: ReturnType<typeof useTranslations>;
  prefetchedData?: {
    questions: Question[];
    totalCount: number;
    sellerInfo?: SellerInfo;
  } | null;
  locale?: string;
}

interface QuestionAnswerCardProps {
  question: Question;
  sellerImageUrl?: string;
  onReadAll: () => void;
  isDarkMode?: boolean;
  t: (key: string) => string;
  locale?: string;
}

// ============= TEXT SHIMMER COMPONENT =============
const TextShimmer: React.FC<{
  lines?: number;
  isDarkMode?: boolean;
  className?: string;
}> = ({ lines = 2, isDarkMode = false, className = "" }) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-3 rounded animate-pulse ${
            isDarkMode ? "bg-gray-600" : "bg-gray-200"
          } ${i === lines - 1 ? "w-3/4" : "w-full"}`}
          style={{
            animation: "shimmer 1.5s ease-in-out infinite",
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes shimmer {
          0% {
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
};

const QuestionAnswerCard: React.FC<QuestionAnswerCardProps> = ({
  question,
  sellerImageUrl,
  onReadAll,
  isDarkMode = false,
  t,
  locale,
}) => {
  // Translation states
  const [isTranslated, setIsTranslated] = useState(false);
  const [translatedQuestion, setTranslatedQuestion] = useState("");
  const [translatedAnswer, setTranslatedAnswer] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-GB");
  };

  const displayName = question.askerNameVisible
    ? question.askerName
    : t("anonymous");
  const isLongAnswer = question.answerText.length > 120;

  // Calculate shimmer lines based on text length
  const questionShimmerLines = Math.min(
    Math.ceil(question.questionText.length / 40),
    3
  );
  const answerShimmerLines = Math.min(
    Math.ceil(question.answerText.length / 40),
    4
  );

  const handleTranslate = async () => {
    if (isTranslating) return;

    // Toggle back to original
    if (isTranslated) {
      setIsTranslated(false);
      setTranslationError(null);
      return;
    }

    // Use cached translation if available
    if (translatedQuestion && translatedAnswer) {
      setIsTranslated(true);
      setTranslationError(null);
      return;
    }

    setIsTranslating(true);
    setTranslationError(null);

    try {
      // Use app locale, fallback to browser language
      const targetLanguage = locale || navigator.language.split("-")[0];

      // Translate both question and answer in parallel
      const [questionResponse, answerResponse] = await Promise.all([
        fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: question.questionText,
            targetLanguage,
          }),
        }),
        fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: question.answerText,
            targetLanguage,
          }),
        }),
      ]);

      if (questionResponse.ok && answerResponse.ok) {
        const questionData = await questionResponse.json();
        const answerData = await answerResponse.json();

        if (questionData.translatedText && answerData.translatedText) {
          setTranslatedQuestion(questionData.translatedText);
          setTranslatedAnswer(answerData.translatedText);
          setIsTranslated(true);
        } else {
          setTranslationError(t("translationFailed"));
        }
      } else if (
        questionResponse.status === 429 ||
        answerResponse.status === 429
      ) {
        setTranslationError(t("rateLimitExceeded"));
      } else {
        setTranslationError(t("translationFailed"));
      }
    } catch (error) {
      console.error("Translation error:", error);
      setTranslationError(t("translationFailed"));
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <div
      className={`group min-w-80 w-80 rounded-2xl sm:rounded-2xl rounded-none p-4 sm:p-5 border transition-all duration-300 hover:shadow-lg ${
        isDarkMode
          ? "bg-gradient-to-br from-gray-800 to-gray-850 border-gray-700 hover:border-orange-500"
          : "bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:border-orange-300"
      }`}
    >
      {/* Header with date and asker */}
      <div className="flex justify-between items-start mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <div
            className={`p-1 sm:p-1.5 rounded-lg ${
              isDarkMode
                ? "bg-blue-900/20 text-blue-400"
                : "bg-blue-50 text-blue-600"
            }`}
          >
            <User className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
          </div>
          <span
            className={`text-xs sm:text-sm font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {displayName}
          </span>
        </div>

        <span
          className={`text-xs ${
            isDarkMode ? "text-gray-400" : "text-gray-500"
          }`}
        >
          {formatDate(question.timestamp)}
        </span>
      </div>

      {/* Question section */}
      <div className="mb-3 sm:mb-4">
        <div className="flex items-start gap-2 mb-2">
          <HelpCircle
            className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mt-0.5 flex-shrink-0 ${
              isDarkMode ? "text-orange-400" : "text-orange-600"
            }`}
          />
          <div className="flex-1 min-h-[20px]">
            {isTranslating ? (
              <TextShimmer
                lines={questionShimmerLines}
                isDarkMode={isDarkMode}
              />
            ) : (
              <p
                className={`text-xs sm:text-sm font-medium leading-relaxed ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                {isTranslated ? translatedQuestion : question.questionText}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Answer section */}
      <div
        className={`rounded-xl p-3 sm:p-4 border ${
          isDarkMode
            ? "bg-gray-700/50 border-gray-600"
            : "bg-gray-50 border-gray-100"
        }`}
      >
        <div className="flex gap-2 sm:gap-3">
          {/* Seller avatar */}
          <div className="flex-shrink-0">
            {sellerImageUrl ? (
              <Image
                src={sellerImageUrl}
                alt={t("seller")}
                width={28}
                height={28}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover"
              />
            ) : (
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                  isDarkMode
                    ? "bg-orange-900/20 text-orange-400"
                    : "bg-orange-100 text-orange-600"
                }`}
              >
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
            )}
          </div>

          {/* Answer content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
              <span
                className={`text-xs font-semibold ${
                  isDarkMode ? "text-orange-400" : "text-orange-600"
                }`}
              >
                {t("sellerReply")}
              </span>
              <div
                className={`w-1 h-1 rounded-full ${
                  isDarkMode ? "bg-gray-600" : "bg-gray-300"
                }`}
              />
              <span
                className={`text-xs ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {t("officialResponse")}
              </span>
            </div>

            <div className="min-h-[36px]">
              {isTranslating ? (
                <TextShimmer
                  lines={answerShimmerLines}
                  isDarkMode={isDarkMode}
                />
              ) : (
                <p
                  className={`text-xs sm:text-sm leading-relaxed ${
                    isLongAnswer ? "line-clamp-3" : ""
                  } ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                >
                  {isTranslated ? translatedAnswer : question.answerText}
                </p>
              )}
            </div>

            {/* Error message */}
            {translationError && !isTranslating && (
              <div
                className={`flex items-center gap-1.5 mt-2 text-xs ${
                  isDarkMode ? "text-red-400" : "text-red-500"
                }`}
              >
                <AlertCircle className="w-3 h-3" />
                <span>{translationError}</span>
              </div>
            )}

            {isLongAnswer && !isTranslating && (
              <button
                onClick={onReadAll}
                className={`mt-2 text-xs font-semibold underline transition-colors ${
                  isDarkMode
                    ? "text-orange-400 hover:text-orange-300"
                    : "text-orange-600 hover:text-orange-700"
                }`}
              >
                {t("readFullAnswer")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Translation button */}
      <div className="mt-3 sm:mt-4 flex justify-end">
        <button
          onClick={handleTranslate}
          disabled={isTranslating}
          className={`flex items-center gap-1.5 px-2 py-1 sm:px-3 rounded-lg text-xs font-medium transition-all duration-200 hover:scale-105 ${
            isTranslating ? "opacity-50 cursor-not-allowed" : ""
          } ${
            isTranslated
              ? isDarkMode
                ? "bg-orange-900/30 text-orange-400 border border-orange-700"
                : "bg-orange-100 text-orange-600 border border-orange-300"
              : isDarkMode
              ? "bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-orange-400"
              : "bg-gray-100 text-gray-600 hover:bg-orange-50 hover:text-orange-600"
          }`}
        >
          <Languages
            className={`w-3 h-3 ${isTranslating ? "animate-pulse" : ""}`}
          />
          <span>
            {isTranslating
              ? t("translating")
              : isTranslated
              ? t("original")
              : t("translate")}
          </span>
        </button>
      </div>
    </div>
  );
};

const LoadingSkeleton: React.FC<{ isDarkMode?: boolean }> = ({
  isDarkMode = false,
}) => (
  <div
    className={`rounded-2xl sm:rounded-2xl rounded-none p-4 sm:p-6 border shadow-sm ${
      isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
    }`}
  >
    <div className="space-y-4 sm:space-y-6">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl animate-pulse ${
              isDarkMode ? "bg-gray-700" : "bg-gray-200"
            }`}
          />
          <div
            className={`w-32 h-5 sm:w-40 sm:h-6 rounded animate-pulse ${
              isDarkMode ? "bg-gray-700" : "bg-gray-200"
            }`}
          />
        </div>
        <div
          className={`w-20 h-7 sm:w-24 sm:h-8 rounded-xl animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`}
        />
      </div>

      {/* Questions skeleton */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className={`min-w-80 w-80 h-48 sm:h-56 rounded-2xl sm:rounded-2xl rounded-none animate-pulse ${
              isDarkMode ? "bg-gray-700" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  </div>
);

const ProductQuestionsWidget: React.FC<ProductQuestionsWidgetProps> = ({
  productId,
  sellerId,
  shopId,
  isShop,
  isLoading = false,
  isDarkMode = false,
  localization,
  prefetchedData,
  locale,
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // ✅ FIXED: Proper nested translation function that uses JSON files
  const t = useCallback(
    (key: string) => {
      if (!localization) {
        // Fallback translations for critical keys
        const fallbacks: Record<string, string> = {
          translating: "Translating...",
          translate: "Translate",
          original: "Original",
          translationFailed: "Translation failed",
          rateLimitExceeded: "Too many requests. Try again later.",
        };
        return fallbacks[key] || key;
      }

      try {
        // Try to get the nested ProductQuestionsWidget translation
        const translation = localization(`ProductQuestionsWidget.${key}`);

        // Check if we got a valid translation (not the same as the key we requested)
        if (translation && translation !== `ProductQuestionsWidget.${key}`) {
          return translation;
        }

        // If nested translation doesn't exist, try direct key
        const directTranslation = localization(key);
        if (directTranslation && directTranslation !== key) {
          return directTranslation;
        }

        // Return the key as fallback
        return key;
      } catch (error) {
        console.warn(`Translation error for key: ${key}`, error);
        return key;
      }
    },
    [localization]
  );

  const checkScrollPosition = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  const scrollLeft = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -350, behavior: "smooth" });
    }
  }, []);

  const scrollRight = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 350, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      checkScrollPosition();
      container.addEventListener("scroll", checkScrollPosition);
      return () => container.removeEventListener("scroll", checkScrollPosition);
    }
  }, [questions, checkScrollPosition]);

  useEffect(() => {
    // ✅ PRIORITY 1: Use prefetched data (INSTANT)
    if (prefetchedData) {
      console.log("✅ Questions: Using prefetched data");
      setQuestions(prefetchedData.questions || []);
      setTotalQuestions(prefetchedData.totalCount || 0);
      setSellerInfo(prefetchedData.sellerInfo || null);
      setLoading(false);
      return;
    }

    // ✅ PRIORITY 2: Fetch from API (fallback)
    const fetchData = async () => {
      if (!productId || !sellerId) return;

      try {
        setLoading(true);

        const [questionsResponse, sellerResponse] = await Promise.all([
          fetch(`/api/questions/${productId}?isShop=${isShop}&limit=5`),
          fetch(
            `/api/seller/${sellerId}${
              isShop && shopId ? `?shopId=${shopId}` : ""
            }`
          ),
        ]);

        if (questionsResponse.ok) {
          const questionsData = await questionsResponse.json();
          setQuestions(questionsData.questions || []);
          setTotalQuestions(questionsData.totalCount || 0);
        }

        if (sellerResponse.ok) {
          const sellerData = await sellerResponse.json();
          setSellerInfo(sellerData);
        }
      } catch (error) {
        console.error("Error fetching questions or seller info:", error);
        setQuestions([]);
        setTotalQuestions(0);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [productId, sellerId, shopId, isShop, prefetchedData]);

  const handleViewAllQuestions = useCallback(() => {
    router.push(
      `/all-questions?productId=${productId}&sellerId=${sellerId}&isShop=${isShop}`
    );
  }, [productId, sellerId, isShop, router]);

  const handleReadAll = useCallback(() => {
    handleViewAllQuestions();
  }, [handleViewAllQuestions]);

  if (isLoading || loading) {
    return <LoadingSkeleton isDarkMode={isDarkMode} />;
  }

  if (totalQuestions === 0) {
    return null;
  }

  const sellerImageUrl = isShop
    ? sellerInfo?.profileImageUrl
    : sellerInfo?.profileImage;

  return (
    <div
      className={`sm:rounded-2xl rounded-none p-4 sm:p-6 border shadow-sm -mx-4 sm:mx-0 ${
        isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      }`}
    >
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className={`p-1.5 sm:p-2 rounded-xl ${
                isDarkMode
                  ? "bg-orange-900/20 text-orange-400"
                  : "bg-orange-100 text-orange-600"
              }`}
            >
              <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3
                className={`text-lg sm:text-xl font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("title")}
              </h3>
              <p
                className={`text-xs sm:text-sm ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {totalQuestions} {t("answeredQuestions")}
              </p>
            </div>
          </div>

          <button
            onClick={handleViewAllQuestions}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 hover:scale-105 ${
              isDarkMode
                ? "bg-orange-900/20 text-orange-400 hover:bg-orange-900/30 border border-orange-700"
                : "bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200"
            }`}
          >
            {t("viewAll")} ({totalQuestions})
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Questions horizontal scroll with navigation */}
        <div className="relative group">
          {/* Left scroll button */}
          {canScrollLeft && (
            <button
              onClick={scrollLeft}
              className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 sm:w-10 sm:h-10 shadow-xl rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400 border border-gray-600"
                  : "bg-white text-gray-600 hover:text-orange-600 border border-gray-200"
              }`}
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}

          {/* Right scroll button */}
          {canScrollRight && (
            <button
              onClick={scrollRight}
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 sm:w-10 sm:h-10 shadow-xl rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400 border border-gray-600"
                  : "bg-white text-gray-600 hover:text-orange-600 border border-gray-200"
              }`}
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}

          {/* Scrollable container */}
          <div
            ref={scrollContainerRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 scroll-smooth [&::-webkit-scrollbar]:hidden"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {questions.map((question) => (
              <QuestionAnswerCard
                key={question.id}
                question={question}
                sellerImageUrl={sellerImageUrl}
                onReadAll={handleReadAll}
                isDarkMode={isDarkMode}
                t={t}
                locale={locale}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductQuestionsWidget;