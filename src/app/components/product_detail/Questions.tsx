// src/components/productdetail/ProductQuestionsWidget.tsx

import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, User, HelpCircle, MessageCircle } from "lucide-react";
import Image from "next/image";

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
  isShop: boolean;
  isLoading?: boolean;
  isDarkMode?: boolean;
}

interface QuestionAnswerCardProps {
  question: Question;
  sellerImageUrl?: string;
  onReadAll: () => void;
  isDarkMode?: boolean;
}

const QuestionAnswerCard: React.FC<QuestionAnswerCardProps> = ({
  question,
  sellerImageUrl,
  onReadAll,
  isDarkMode = false,
}) => {
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-GB");
  };

  const displayName = question.askerNameVisible
    ? question.askerName
    : "Anonymous";
  const isLongAnswer = question.answerText.length > 120;

  return (
    <div className={`group min-w-80 w-80 rounded-2xl p-5 border transition-all duration-300 hover:shadow-lg hover:scale-[1.02] ${
      isDarkMode 
        ? "bg-gradient-to-br from-gray-800 to-gray-850 border-gray-700 hover:border-orange-500" 
        : "bg-gradient-to-br from-white to-gray-50 border-gray-200 hover:border-orange-300"
    }`}>
      {/* Header with date and asker */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${
            isDarkMode ? "bg-blue-900/20 text-blue-400" : "bg-blue-50 text-blue-600"
          }`}>
            <User className="w-3 h-3" />
          </div>
          <span className={`text-sm font-semibold ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}>
            {displayName}
          </span>
        </div>
        
        <span className={`text-xs ${
          isDarkMode ? "text-gray-400" : "text-gray-500"
        }`}>
          {formatDate(question.timestamp)}
        </span>
      </div>

      {/* Question section */}
      <div className="mb-4">
        <div className="flex items-start gap-2 mb-2">
          <HelpCircle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
            isDarkMode ? "text-orange-400" : "text-orange-600"
          }`} />
          <p className={`text-sm font-medium leading-relaxed ${
            isDarkMode ? "text-gray-300" : "text-gray-700"
          }`}>
            {question.questionText}
          </p>
        </div>
      </div>

      {/* Answer section */}
      <div className={`rounded-xl p-4 border ${
        isDarkMode ? "bg-gray-700/50 border-gray-600" : "bg-gray-50 border-gray-100"
      }`}>
        <div className="flex gap-3">
          {/* Seller avatar */}
          <div className="flex-shrink-0">
            {sellerImageUrl ? (
              <Image
                src={sellerImageUrl}
                alt="Seller"
                width={32}
                height={32}
                className="rounded-full object-cover"
              />
            ) : (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                isDarkMode ? "bg-orange-900/20 text-orange-400" : "bg-orange-100 text-orange-600"
              }`}>
                <User className="w-4 h-4" />
              </div>
            )}
          </div>

          {/* Answer content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-semibold ${
                isDarkMode ? "text-orange-400" : "text-orange-600"
              }`}>
                Seller Reply
              </span>
              <div className={`w-1 h-1 rounded-full ${
                isDarkMode ? "bg-gray-600" : "bg-gray-300"
              }`} />
              <span className={`text-xs ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}>
                Official Response
              </span>
            </div>
            
            <p className={`text-sm leading-relaxed ${isLongAnswer ? 'line-clamp-3' : ''} ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}>
              {question.answerText}
            </p>

            {isLongAnswer && (
              <button
                onClick={onReadAll}
                className={`mt-2 text-xs font-semibold underline transition-colors ${
                  isDarkMode
                    ? "text-orange-400 hover:text-orange-300"
                    : "text-orange-600 hover:text-orange-700"
                }`}
              >
                Read Full Answer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const LoadingSkeleton: React.FC<{ isDarkMode?: boolean }> = ({ 
  isDarkMode = false 
}) => (
  <div className={`rounded-2xl p-6 border shadow-sm ${
    isDarkMode 
      ? "bg-gray-800 border-gray-700" 
      : "bg-white border-gray-200"
  }`}>
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`} />
          <div className={`w-40 h-6 rounded animate-pulse ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`} />
        </div>
        <div className={`w-24 h-8 rounded-xl animate-pulse ${
          isDarkMode ? "bg-gray-700" : "bg-gray-200"
        }`} />
      </div>

      {/* Questions skeleton */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className={`min-w-80 w-80 h-56 rounded-2xl animate-pulse ${
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
  isShop,
  isLoading = false,
  isDarkMode = false,
}) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const checkScrollPosition = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -350, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 350, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      checkScrollPosition();
      container.addEventListener("scroll", checkScrollPosition);
      return () => container.removeEventListener("scroll", checkScrollPosition);
    }
  }, [questions]);

  useEffect(() => {
    const fetchData = async () => {
      if (!productId || !sellerId) return;

      try {
        setLoading(true);

        const [questionsResponse, sellerResponse] = await Promise.all([
          fetch(`/api/questions/${productId}?isShop=${isShop}&limit=5`),
          fetch(`/api/seller/${sellerId}${isShop ? `?shopId=${sellerId}` : ""}`),
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
  }, [productId, sellerId, isShop]);

  const handleViewAllQuestions = () => {
    window.location.href = `/questions/${productId}?sellerId=${sellerId}&isShop=${isShop}`;
  };

  const handleReadAll = () => {
    handleViewAllQuestions();
  };

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
    <div className={`rounded-2xl p-6 border shadow-sm ${
      isDarkMode 
        ? "bg-gray-800 border-gray-700" 
        : "bg-white border-gray-200"
    }`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${
              isDarkMode 
                ? "bg-orange-900/20 text-orange-400" 
                : "bg-orange-100 text-orange-600"
            }`}>
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`text-xl font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}>
                Product Q&A
              </h3>
              <p className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}>
                {totalQuestions} answered questions
              </p>
            </div>
          </div>
          
          <button
            onClick={handleViewAllQuestions}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-105 ${
              isDarkMode
                ? "bg-orange-900/20 text-orange-400 hover:bg-orange-900/30 border border-orange-700"
                : "bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200"
            }`}
          >
            View All ({totalQuestions})
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Questions horizontal scroll with navigation */}
        <div className="relative group">
          {/* Left scroll button */}
          {canScrollLeft && (
            <button
              onClick={scrollLeft}
              className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 shadow-xl rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400 border border-gray-600"
                  : "bg-white text-gray-600 hover:text-orange-600 border border-gray-200"
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Right scroll button */}
          {canScrollRight && (
            <button
              onClick={scrollRight}
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 shadow-xl rounded-full flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-110 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:text-orange-400 border border-gray-600"
                  : "bg-white text-gray-600 hover:text-orange-600 border border-gray-200"
              }`}
            >
              <ChevronRight className="w-5 h-5" />
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
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductQuestionsWidget;