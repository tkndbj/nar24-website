// src/app/[locale]/all-questions/page.tsx

"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  MessageCircle,
  ShoppingCart,
  Calendar,
  User,
  
  Loader2,
} from "lucide-react";
import Image from "next/image";
import { format } from "date-fns";
import { useCart } from "@/context/CartProvider";
import { useUser } from "@/context/UserProvider";

interface Question {
  id: string;
  productId: string;
  questionText: string;
  answerText?: string;
  answered: boolean;
  timestamp: Date;
  askerId: string;
  askerName: string;
  askerNameVisible: boolean;
  answererName?: string;
  answererProfileImage?: string;
}

interface SellerInfo {
  id: string;
  name: string;
  profileImageUrl?: string;
  displayName?: string;
}

interface AllQuestionsPageProps {
  params: Promise<{ locale: string }>;
}

const AllQuestionsPage: React.FC<AllQuestionsPageProps> = ({ }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const localization = useTranslations();
  const { addToCart } = useCart();
  const { user } = useUser();

  // Extract query parameters
  const productId = searchParams.get("productId") || "";
  const sellerId = searchParams.get("sellerId") || "";
  const isShop = searchParams.get("isShop") === "true";

  // Pagination and data states
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDocId, setLastDocId] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  const PAGE_SIZE = 20;

  // Translation helper
  const t = useCallback((key: string) => {
    try {
      return localization(`AllQuestionsPage.${key}`);
    } catch {
      return localization(key);
    }
  }, [localization]);

  // Dark mode detection
  useEffect(() => {
    const detectDarkMode = () => {
      const isDark = 
        document.documentElement.classList.contains("dark") ||
        document.documentElement.getAttribute("data-theme") === "dark" ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDarkMode(isDark);
    };

    detectDarkMode();

    const observer = new MutationObserver(detectDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", detectDarkMode);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", detectDarkMode);
    };
  }, []);

  // Fetch seller information
  useEffect(() => {
    const fetchSellerInfo = async () => {
      if (!sellerId) return;

      try {
        const endpoint = isShop 
          ? `/api/shops/${sellerId}`
          : `/api/users/${sellerId}`;
        
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          setSellerInfo({
            id: sellerId,
            name: isShop ? data.name : data.displayName,
            profileImageUrl: isShop ? data.profileImageUrl : data.profileImage,
            displayName: data.displayName,
          });
        }
      } catch (error) {
        console.error("Error fetching seller info:", error);
      }
    };

    fetchSellerInfo();
  }, [sellerId, isShop]);

  // Fetch questions
  const fetchQuestions = useCallback(async (isInitial = false) => {
    if (!productId || (!isInitial && !hasMore)) return;
  
    try {
      if (isInitial) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }
  
      const params = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
        answered: "true",
        isShop: isShop.toString(),  // ADD THIS - your API needs it
      });
  
      if (lastDocId && !isInitial) {
        params.append("lastDocId", lastDocId);
      }
  
      const response = await fetch(`/api/questions/${productId}?${params}`);
      
      if (!response.ok) throw new Error("Failed to fetch questions");

      const data = await response.json();
      const newQuestions = data.questions.map((q: Question) => ({
        ...q,
        timestamp: new Date(q.timestamp),
      }));

      if (isInitial) {
        setQuestions(newQuestions);
      } else {
        setQuestions(prev => [...prev, ...newQuestions]);
      }

      setHasMore(newQuestions.length === PAGE_SIZE);
      
      if (newQuestions.length > 0) {
        setLastDocId(newQuestions[newQuestions.length - 1].id);
      }
    } catch (error) {
      console.error("Error fetching questions:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [productId, lastDocId, hasMore]);

  // Initial fetch
  useEffect(() => {
    fetchQuestions(true);
  }, [productId]);

  // Infinite scroll setup
  useEffect(() => {
    if (!loadMoreTriggerRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore && !isLoadingMore) {
          fetchQuestions(false);
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    observerRef.current.observe(loadMoreTriggerRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoadingMore, fetchQuestions]);

  // Handle add to cart
  const handleAddToCart = useCallback(async () => {
    if (!user) {
      router.push("/login");
      return;
    }

    if (productId) {
      await addToCart(productId, 1);
    }
  }, [user, productId, addToCart, router]);

  // Handle ask question
  const handleAskQuestion = useCallback(() => {
    const params = new URLSearchParams({
      productId,
      sellerId,
      isShop: isShop.toString(),
    });
    router.push(`/asktoseller?${params}`);
  }, [productId, sellerId, isShop, router]);

  // Colors based on theme
  const colors = {
    background: isDarkMode ? "bg-gray-900" : "bg-gray-50",
    containerBg: isDarkMode ? "bg-gray-800" : "bg-white",
    questionBg: isDarkMode ? "bg-gray-700" : "bg-gray-100",
    answerBg: isDarkMode ? "bg-gray-800" : "bg-white",
    border: isDarkMode ? "border-gray-700" : "border-gray-200",
    text: isDarkMode ? "text-gray-100" : "text-gray-900",
    textSecondary: isDarkMode ? "text-gray-400" : "text-gray-600",
    hover: isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100",
  };

  // Loading skeleton
  const LoadingSkeleton = () => (
    <div className="space-y-4 p-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className={`${colors.containerBg} rounded-xl p-6 space-y-4 animate-pulse`}>
          <div className={`h-4 ${colors.questionBg} rounded w-1/4`} />
          <div className={`h-20 ${colors.questionBg} rounded`} />
          <div className={`h-16 ${isDarkMode ? "bg-gray-600" : "bg-gray-200"} rounded`} />
        </div>
      ))}
    </div>
  );

  // Question card component
  const QuestionCard = ({ question }: { question: Question }) => {
    const displayAskerName = question.askerNameVisible 
      ? question.askerName 
      : t("anonymous");

    const answererName = question.answererName || sellerInfo?.name || t("seller");
    const answererImage = question.answererProfileImage || sellerInfo?.profileImageUrl;

    return (
      <div className={`${colors.containerBg} rounded-xl shadow-sm border ${colors.border} overflow-hidden transition-all hover:shadow-md`}>
        {/* Date header */}
        <div className={`px-6 py-3 border-b ${colors.border} flex justify-between items-center`}>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-orange-500" />
            <span className={`text-sm ${colors.textSecondary}`}>
              {format(question.timestamp, "dd/MM/yyyy")}
            </span>
          </div>
        </div>

        {/* Question section */}
        <div className="p-6 space-y-4">
          <div className={`${colors.questionBg} rounded-lg p-4`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full ${isDarkMode ? "bg-gray-600" : "bg-gray-300"} flex items-center justify-center flex-shrink-0`}>
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm mb-2 ${colors.text}`}>
                  {displayAskerName}
                </p>
                <p className={`${colors.text} text-base leading-relaxed break-words`}>
                  {question.questionText}
                </p>
              </div>
            </div>
          </div>

          {/* Answer section */}
          {question.answered && question.answerText && (
            <div className={`${colors.answerBg} rounded-lg p-4 border ${colors.border}`}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-orange-400 to-orange-600">
                  {answererImage ? (
                    <Image
                      src={answererImage}
                      alt={answererName}
                      width={32}
                      height={32}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm mb-2 ${colors.text} flex items-center gap-2`}>
                    {answererName}
                    <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs rounded-full">
                      {t("seller")}
                    </span>
                  </p>
                  <p className={`${colors.text} text-base leading-relaxed break-words`}>
                    {question.answerText}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen ${colors.background}`}>
      {/* Header */}
      <div className={`sticky top-0 z-20 ${colors.containerBg} border-b ${colors.border} backdrop-blur-md bg-opacity-95`}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between max-w-6xl mx-auto">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className={`p-2 rounded-lg transition-colors ${colors.hover}`}
              >
                <ArrowLeft className={`w-5 h-5 ${colors.text}`} />
              </button>
              <h1 className={`text-lg font-semibold ${colors.text}`}>
                {t("allQuestionsTitle")}
              </h1>
            </div>
            
            {sellerInfo && (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-orange-400 to-orange-600">
                  {sellerInfo.profileImageUrl ? (
                    <Image
                      src={sellerInfo.profileImageUrl}
                      alt={sellerInfo.name}
                      width={32}
                      height={32}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <span className={`text-sm font-medium ${colors.text} hidden sm:block`}>
                  {sellerInfo.name}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto" ref={scrollContainerRef}>
        {isLoading ? (
          <LoadingSkeleton />
        ) : questions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-4">
            <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <MessageCircle className="w-12 h-12 text-gray-400" />
            </div>
            <h2 className={`text-xl font-semibold mb-2 ${colors.text}`}>
              {t("noQuestionsFound")}
            </h2>
            <p className={`text-center mb-6 ${colors.textSecondary}`}>
              {t("beFirstToAsk")}
            </p>
            <button
              onClick={handleAskQuestion}
              className="px-6 py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors"
            >
              {t("askFirstQuestion")}
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {questions.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
            
            {/* Load more trigger */}
            {hasMore && (
              <div ref={loadMoreTriggerRef} className="py-8 flex justify-center">
                {isLoadingMore && (
                  <div className="flex items-center gap-2 text-orange-600">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">{t("loadingMore")}</span>
                  </div>
                )}
              </div>
            )}
            
            {!hasMore && questions.length > 0 && (
              <div className="py-8 text-center">
                <p className={`${colors.textSecondary} text-sm`}>
                  {t("allQuestionsLoaded")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      
      {/* Fixed bottom bar */}
<div className={`fixed bottom-0 left-0 right-0 ${colors.containerBg} border-t ${colors.border} p-4 z-30`}>
        <div className="max-w-4xl mx-auto flex gap-3">
          <button
            onClick={handleAskQuestion}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 border-2 border-orange-500 text-orange-600 ${isDarkMode ? "hover:bg-orange-900/20" : "hover:bg-orange-50"}`}
          >
            <MessageCircle className="w-5 h-5" />
            {t("askToSeller")}
          </button>
          
          <button
            onClick={handleAddToCart}
            className="flex-1 py-3 px-4 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg font-medium transition-all hover:from-orange-700 hover:to-orange-800 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl"
          >
            <ShoppingCart className="w-5 h-5" />
            {t("addToCart")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AllQuestionsPage;