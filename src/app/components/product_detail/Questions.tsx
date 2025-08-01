// src/components/productdetail/ProductQuestionsWidget.tsx

import React, { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, User } from "lucide-react";
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
}) => {
  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-GB"); // DD/MM/YYYY format
  };

  const displayName = question.askerNameVisible
    ? question.askerName
    : "Anonymous";
  const isLongAnswer = question.answerText.length > 150;

  return (
    <div className="min-w-72 w-72 bg-gray-50 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
      {/* Date */}
      <div className="flex justify-end mb-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatDate(question.timestamp)}
        </span>
      </div>

      {/* Asker name */}
      <div className="mb-2">
        <span className="text-sm font-bold text-gray-900 dark:text-white">
          {displayName}
        </span>
      </div>

      {/* Question text */}
      <div className="mb-4">
        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
          {question.questionText}
        </p>
      </div>

      {/* Answer section */}
      <div className="bg-white dark:bg-gray-700 rounded-lg p-3 flex-1">
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
              <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </div>
            )}
          </div>

          {/* Answer content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
              {question.answerText}
            </p>

            {isLongAnswer && (
              <button
                onClick={onReadAll}
                className="mt-2 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline transition-colors"
              >
                Read All
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const LoadingSkeleton: React.FC = () => (
  <div className="w-full bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700">
    <div className="p-4 space-y-4">
      {/* Header skeleton */}
      <div className="flex justify-between items-center">
        <div className="w-40 h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="w-24 h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>

      {/* Questions skeleton */}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="min-w-72 w-72 h-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"
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
      const { scrollLeft, scrollWidth, clientWidth } =
        scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -300, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 300, behavior: "smooth" });
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

        // Fetch questions and seller info in parallel
        const [questionsResponse, sellerResponse] = await Promise.all([
          fetch(`/api/questions/${productId}?isShop=${isShop}&limit=5`),
          fetch(
            `/api/seller/${sellerId}${isShop ? `?shopId=${sellerId}` : ""}`
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
  }, [productId, sellerId, isShop]);

  const handleViewAllQuestions = () => {
    window.location.href = `/questions/${productId}?sellerId=${sellerId}&isShop=${isShop}`;
  };

  const handleReadAll = () => {
    handleViewAllQuestions();
  };

  if (isLoading || loading) {
    return <LoadingSkeleton />;
  }

  if (totalQuestions === 0) {
    return null;
  }

  const sellerImageUrl = isShop
    ? sellerInfo?.profileImageUrl
    : sellerInfo?.profileImage;

  return (
    <div className="w-full bg-white dark:bg-gray-800 shadow-sm border-b border-gray-100 dark:border-gray-700">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            Product Questions
          </h3>
          <button
            onClick={handleViewAllQuestions}
            className="text-sm font-bold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
          >
            View All ({totalQuestions})
          </button>
        </div>

        {/* Questions horizontal scroll with navigation */}
        <div className="relative group">
          {/* Left scroll button */}
          {canScrollLeft && (
            <button
              onClick={scrollLeft}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white dark:bg-gray-700 shadow-lg rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-orange-600 dark:hover:text-orange-400 transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Right scroll button */}
          {canScrollRight && (
            <button
              onClick={scrollRight}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white dark:bg-gray-700 shadow-lg rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-orange-600 dark:hover:text-orange-400 transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {/* Scrollable container */}
          <div
            ref={scrollContainerRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 scroll-smooth"
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
