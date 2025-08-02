"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  MessageSquare,
  Inbox,
  Reply,
  Edit,
  Trash2,
  CheckCircle,
  Clock,
  Star,
  RefreshCw,
  X,
  Send,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import {
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  collectionGroup,
  Timestamp,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslations } from "next-intl";
import Image from "next/image";

interface ProductQuestion {
  id: string;
  questionText: string;
  answered: boolean;
  answerText?: string;
  askerId: string;
  sellerId: string;
  productId: string;
  productName: string;
  productImage: string;
  productPrice: number;
  productRating: number;
  askerName: string;
  askerNameVisible: boolean;
  answererName?: string;
  answererProfileImage?: string;
  timestamp: Timestamp;
  answeredAt?: Timestamp;
}

interface FilterOptions {
  productId?: string;
  sellerId?: string;
  startDate?: Date;
  endDate?: Date;
  answeredOnly: boolean;
}

const PAGE_SIZE = 20;

export default function ProductQuestionsPage() {
  const router = useRouter();
  const { user, profileData } = useUser();
  const t = useTranslations("ProductQuestions");

  // State
  const [activeTab, setActiveTab] = useState<"asked" | "received">("asked");
  const [filters, setFilters] = useState<FilterOptions>({
    answeredOnly: false,
  });
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Asked questions state
  const [askedQuestions, setAskedQuestions] = useState<ProductQuestion[]>([]);
  const [askedLoading, setAskedLoading] = useState(false);
  const [askedHasMore, setAskedHasMore] = useState(true);
  const [askedLastDoc, setAskedLastDoc] =
    useState<QueryDocumentSnapshot | null>(null);

  // Received questions state
  const [receivedQuestions, setReceivedQuestions] = useState<ProductQuestion[]>(
    []
  );
  const [receivedLoading, setReceivedLoading] = useState(false);
  const [receivedHasMore, setReceivedHasMore] = useState(true);
  const [receivedLastDoc, setReceivedLastDoc] =
    useState<QueryDocumentSnapshot | null>(null);

  // Modal states
  const [showAnswerModal, setShowAnswerModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedQuestion, setSelectedQuestion] =
    useState<ProductQuestion | null>(null);
  const [answerText, setAnswerText] = useState("");

  // Refs for infinite scroll
  const askedScrollRef = useRef<HTMLDivElement>(null);
  const receivedScrollRef = useRef<HTMLDivElement>(null);

  // Check dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  // Load initial data
  useEffect(() => {
    if (user) {
      loadAskedQuestions(true);
      loadReceivedQuestions(true);
    }
  }, [user, filters]);

  // Infinite scroll handlers
  const handleAskedScroll = useCallback(() => {
    const container = askedScrollRef.current;
    if (!container || askedLoading || !askedHasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      loadAskedQuestions(false);
    }
  }, [askedLoading, askedHasMore]);

  const handleReceivedScroll = useCallback(() => {
    const container = receivedScrollRef.current;
    if (!container || receivedLoading || !receivedHasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      loadReceivedQuestions(false);
    }
  }, [receivedLoading, receivedHasMore]);

  // Load asked questions
  const loadAskedQuestions = async (reset = false) => {
    if (!user || askedLoading) return;

    setAskedLoading(true);
    try {
      let q = query(
        collectionGroup(db, "product_questions"),
        where("askerId", "==", user.uid)
      );

      // Apply filters
      if (filters.sellerId) {
        q = query(q, where("sellerId", "==", filters.sellerId));
      }
      if (filters.productId) {
        q = query(q, where("productId", "==", filters.productId));
      }
      if (filters.startDate) {
        q = query(
          q,
          where("timestamp", ">=", Timestamp.fromDate(filters.startDate))
        );
      }
      if (filters.endDate) {
        const endOfDay = new Date(filters.endDate);
        endOfDay.setHours(23, 59, 59, 999);
        q = query(q, where("timestamp", "<=", Timestamp.fromDate(endOfDay)));
      }
      if (filters.answeredOnly) {
        q = query(q, where("answered", "==", true));
      }

      q = query(q, orderBy("timestamp", "desc"), limit(PAGE_SIZE));

      if (!reset && askedLastDoc) {
        q = query(q, startAfter(askedLastDoc));
      }

      const snapshot = await getDocs(q);
      const newQuestions = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          } as ProductQuestion)
      );

      if (reset) {
        setAskedQuestions(newQuestions);
        setAskedLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      } else {
        setAskedQuestions((prev) => [...prev, ...newQuestions]);
        setAskedLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      }

      setAskedHasMore(newQuestions.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error loading asked questions:", error);
    } finally {
      setAskedLoading(false);
    }
  };

  // Load received questions
  const loadReceivedQuestions = async (reset = false) => {
    if (!user || receivedLoading) return;

    setReceivedLoading(true);
    try {
      let q = query(
        collectionGroup(db, "product_questions"),
        where("sellerId", "==", user.uid)
      );

      // Apply filters
      if (filters.productId) {
        q = query(q, where("productId", "==", filters.productId));
      }
      if (filters.startDate) {
        q = query(
          q,
          where("timestamp", ">=", Timestamp.fromDate(filters.startDate))
        );
      }
      if (filters.endDate) {
        const endOfDay = new Date(filters.endDate);
        endOfDay.setHours(23, 59, 59, 999);
        q = query(q, where("timestamp", "<=", Timestamp.fromDate(endOfDay)));
      }
      if (filters.answeredOnly) {
        q = query(q, where("answered", "==", true));
      }

      q = query(q, orderBy("timestamp", "desc"), limit(PAGE_SIZE));

      if (!reset && receivedLastDoc) {
        q = query(q, startAfter(receivedLastDoc));
      }

      const snapshot = await getDocs(q);
      const newQuestions = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          } as ProductQuestion)
      );

      if (reset) {
        setReceivedQuestions(newQuestions);
        setReceivedLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      } else {
        setReceivedQuestions((prev) => [...prev, ...newQuestions]);
        setReceivedLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      }

      setReceivedHasMore(newQuestions.length === PAGE_SIZE);
    } catch (error) {
      console.error("Error loading received questions:", error);
    } finally {
      setReceivedLoading(false);
    }
  };

  // Answer question
  const handleAnswerQuestion = async () => {
    if (!selectedQuestion || !answerText.trim() || !user) return;

    try {
      const docRef = doc(
        db,
        "products",
        selectedQuestion.productId,
        "product_questions",
        selectedQuestion.id
      );

      await updateDoc(docRef, {
        answerText: answerText.trim(),
        answered: true,
        answererName: profileData?.displayName || "",
        answererProfileImage: profileData?.profileImage || "",
        answeredAt: serverTimestamp(),
      });

      // Update local state
      const updatedQuestion = {
        ...selectedQuestion,
        answered: true,
        answerText: answerText.trim(),
        answererName: profileData?.displayName || "",
        answererProfileImage: profileData?.profileImage || "",
      };

      setReceivedQuestions((prev) =>
        prev.map((q) => (q.id === selectedQuestion.id ? updatedQuestion : q))
      );

      setShowAnswerModal(false);
      setAnswerText("");
      setSelectedQuestion(null);
    } catch (error) {
      console.error("Error answering question:", error);
      alert(t("errorAnswering") || "Error answering question");
    }
  };

  // Delete question
  const handleDeleteQuestion = async () => {
    if (!selectedQuestion) return;

    try {
      const docRef = doc(
        db,
        "products",
        selectedQuestion.productId,
        "product_questions",
        selectedQuestion.id
      );
      await deleteDoc(docRef);

      // Update local state
      if (activeTab === "asked") {
        setAskedQuestions((prev) =>
          prev.filter((q) => q.id !== selectedQuestion.id)
        );
      } else {
        setReceivedQuestions((prev) =>
          prev.filter((q) => q.id !== selectedQuestion.id)
        );
      }

      setShowDeleteModal(false);
      setSelectedQuestion(null);
    } catch (error) {
      console.error("Error deleting question:", error);
      alert(t("errorDeleting") || "Error deleting question");
    }
  };

  // Reset filters
  const resetFilters = () => {
    setFilters({ answeredOnly: false });
    setAskedQuestions([]);
    setReceivedQuestions([]);
    setAskedLastDoc(null);
    setReceivedLastDoc(null);
    setAskedHasMore(true);
    setReceivedHasMore(true);
  };

  // Get active filters count
  const getActiveFiltersCount = () => {
    let count = 0;
    if (filters.productId) count++;
    if (filters.sellerId) count++;
    if (filters.startDate || filters.endDate) count++;
    if (filters.answeredOnly) count++;
    return count;
  };

  // Format date for display
  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // Product Card Component
  const ProductCard = ({ question }: { question: ProductQuestion }) => (
    <div
      className={`
        p-4 rounded-lg border cursor-pointer transition-colors duration-200
        ${
          isDarkMode
            ? "bg-gray-800 border-gray-700 hover:border-gray-600"
            : "bg-white border-gray-200 hover:border-gray-300"
        }
      `}
      onClick={() => router.push(`/product/${question.productId}`)}
    >
      <div className="flex space-x-3">
        <div className="relative w-16 h-16 flex-shrink-0">
          <Image
            src={question.productImage || "/placeholder-product.png"}
            alt={question.productName}
            fill
            className="object-cover rounded-lg"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h4
            className={`
            font-medium text-sm line-clamp-2
            ${isDarkMode ? "text-white" : "text-gray-900"}
          `}
          >
            {question.productName}
          </h4>
          <div className="flex items-center space-x-2 mt-1">
            <span
              className={`
              font-bold text-sm
              ${isDarkMode ? "text-green-400" : "text-green-600"}
            `}
            >
              ₺{question.productPrice.toLocaleString()}
            </span>
            {question.productRating > 0 && (
              <div className="flex items-center space-x-1">
                <Star size={12} className="text-yellow-400 fill-current" />
                <span
                  className={`
                  text-xs
                  ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                `}
                >
                  {question.productRating.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Question Card Component
  const QuestionCard = ({
    question,
    isAskedTab,
  }: {
    question: ProductQuestion;
    isAskedTab: boolean;
  }) => (
    <div
      className={`
      rounded-lg border p-4 space-y-4
      ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}
    `}
    >
      {/* Product Info */}
      <ProductCard question={question} />

      {/* Question Content */}
      <div
        className={`
        p-3 rounded-lg
        ${isDarkMode ? "bg-gray-700" : "bg-gray-50"}
      `}
      >
        <p
          className={`
          font-medium text-sm mb-2
          ${isDarkMode ? "text-white" : "text-gray-900"}
        `}
        >
          {question.questionText}
        </p>
        <div className="flex items-center justify-between">
          <span
            className={`
            text-xs
            ${isDarkMode ? "text-gray-400" : "text-gray-600"}
          `}
          >
            {t("askedBy")}:{" "}
            {question.askerNameVisible ? question.askerName : t("anonymous")}
          </span>
          <span
            className={`
            text-xs
            ${isDarkMode ? "text-gray-400" : "text-gray-600"}
          `}
          >
            {formatDate(question.timestamp)}
          </span>
        </div>

        {/* Answer Section */}
        {question.answered && question.answerText && (
          <div
            className={`
            mt-3 p-3 rounded-lg
            ${isDarkMode ? "bg-gray-800" : "bg-white"}
          `}
          >
            <div className="flex items-start space-x-3">
              {question.answererProfileImage && (
                <Image
                  src={question.answererProfileImage}
                  alt={question.answererName || ""}
                  width={24}
                  height={24}
                  className="rounded-full"
                />
              )}
              <div className="flex-1">
                {question.answererName && (
                  <p
                    className={`
                    text-xs font-medium mb-1
                    ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                  `}
                  >
                    {question.answererName}
                  </p>
                )}
                <p
                  className={`
                  text-sm
                  ${isDarkMode ? "text-gray-200" : "text-gray-800"}
                `}
                >
                  {question.answerText}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        {/* Status */}
        <div className="flex items-center space-x-2">
          {question.answered ? (
            <>
              <CheckCircle size={16} className="text-green-500" />
              <span
                className={`
                text-xs font-medium
                ${isDarkMode ? "text-green-400" : "text-green-600"}
              `}
              >
                {t("answered")}
              </span>
            </>
          ) : (
            <>
              <Clock size={16} className="text-orange-500" />
              <span
                className={`
                text-xs font-medium
                ${isDarkMode ? "text-orange-400" : "text-orange-600"}
              `}
              >
                {isAskedTab ? t("waitingForAnswer") : t("unanswered")}
              </span>
            </>
          )}
        </div>

        {/* Actions for received questions */}
        {!isAskedTab && (
          <div className="flex items-center space-x-2">
            {!question.answered ? (
              <>
                <button
                  onClick={() => {
                    setSelectedQuestion(question);
                    setAnswerText(question.answerText || "");
                    setShowAnswerModal(true);
                  }}
                  className="
                    flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium
                    bg-green-500 text-white hover:bg-green-600 transition-colors
                  "
                >
                  <Reply size={12} />
                  <span>{t("answer")}</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedQuestion(question);
                    setShowDeleteModal(true);
                  }}
                  className="
                    flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium
                    bg-red-500 text-white hover:bg-red-600 transition-colors
                  "
                >
                  <Trash2 size={12} />
                  <span>{t("delete")}</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setSelectedQuestion(question);
                  setAnswerText(question.answerText || "");
                  setShowAnswerModal(true);
                }}
                className="
                  p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors
                "
              >
                <Edit size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (!user) {
    return null; // Will redirect to login
  }

  const currentQuestions =
    activeTab === "asked" ? askedQuestions : receivedQuestions;
  const currentLoading = activeTab === "asked" ? askedLoading : receivedLoading;

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* Header */}
      <div
        className={`
        sticky top-0 z-10 border-b
        ${
          isDarkMode
            ? "bg-gray-900 border-gray-700"
            : "bg-white border-gray-200"
        }
      `}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1
              className={`
              text-xl font-bold
              ${isDarkMode ? "text-white" : "text-gray-900"}
            `}
            >
              {t("title") || "Product Questions"}
            </h1>
          </div>

          {/* Tab Bar */}
          <div
            className={`
            mt-4 p-1 rounded-lg
            ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
          `}
          >
            <div className="flex">
              {(["asked", "received"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`
                    flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-md text-sm font-medium transition-all duration-200
                    ${
                      activeTab === tab
                        ? "bg-green-500 text-white shadow-lg"
                        : isDarkMode
                        ? "text-gray-400 hover:text-white hover:bg-gray-700"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                    }
                  `}
                >
                  {tab === "asked" ? (
                    <>
                      <MessageSquare size={16} />
                      <span>{t("askedQuestions") || "Asked Questions"}</span>
                    </>
                  ) : (
                    <>
                      <Inbox size={16} />
                      <span>
                        {t("receivedQuestions") || "Received Questions"}
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-2 mt-4">
            <button
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  answeredOnly: !prev.answeredOnly,
                }))
              }
              className={`
                px-4 py-2 rounded-full text-sm font-medium border transition-colors
                ${
                  filters.answeredOnly
                    ? "bg-orange-500 text-white border-orange-500"
                    : isDarkMode
                    ? "border-gray-600 text-gray-300 hover:bg-gray-800"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }
              `}
            >
              {t("answered") || "Answered"}
            </button>

            {getActiveFiltersCount() > 0 && (
              <button
                onClick={resetFilters}
                className={`
                  p-2 rounded-full transition-colors
                  ${
                    isDarkMode
                      ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                      : "hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                  }
                `}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {currentQuestions.length === 0 && !currentLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div
              className={`
              w-24 h-24 rounded-full flex items-center justify-center mb-6
              ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
            `}
            >
              <MessageSquare
                size={32}
                className={isDarkMode ? "text-gray-400" : "text-gray-500"}
              />
            </div>
            <h3
              className={`
              text-lg font-medium mb-2
              ${isDarkMode ? "text-white" : "text-gray-900"}
            `}
            >
              {t("noQuestions") || "No Questions"}
            </h3>
            <p
              className={`
              text-center
              ${isDarkMode ? "text-gray-400" : "text-gray-600"}
            `}
            >
              {activeTab === "asked"
                ? t("noAskedQuestions") || "You haven't asked any questions yet"
                : t("noReceivedQuestions") ||
                  "You haven't received any questions yet"}
            </p>
          </div>
        ) : (
          <div
            ref={activeTab === "asked" ? askedScrollRef : receivedScrollRef}
            onScroll={
              activeTab === "asked" ? handleAskedScroll : handleReceivedScroll
            }
            className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto"
          >
            {currentQuestions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                isAskedTab={activeTab === "asked"}
              />
            ))}

            {currentLoading && (
              <div className="flex justify-center py-4">
                <RefreshCw size={24} className="animate-spin text-green-500" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Answer Modal */}
      {showAnswerModal && selectedQuestion && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className={`
            w-full max-w-md rounded-xl p-6
            ${isDarkMode ? "bg-gray-800" : "bg-white"}
            shadow-2xl
          `}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className={`
                text-lg font-bold
                ${isDarkMode ? "text-white" : "text-gray-900"}
              `}
              >
                {selectedQuestion.answered
                  ? t("editAnswer") || "Edit Answer"
                  : t("answer") || "Answer"}
              </h3>
              <button
                onClick={() => {
                  setShowAnswerModal(false);
                  setSelectedQuestion(null);
                  setAnswerText("");
                }}
                className={`
                  p-1 rounded-full transition-colors
                  ${
                    isDarkMode
                      ? "hover:bg-gray-700 text-gray-400"
                      : "hover:bg-gray-100 text-gray-500"
                  }
                `}
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div
                className={`
                p-3 rounded-lg
                ${isDarkMode ? "bg-gray-700" : "bg-gray-50"}
              `}
              >
                <p
                  className={`
                  text-sm font-medium
                  ${isDarkMode ? "text-white" : "text-gray-900"}
                `}
                >
                  {selectedQuestion.questionText}
                </p>
              </div>

              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder={t("writeAnswer") || "Write your answer..."}
                rows={4}
                className={`
                  w-full px-3 py-2 rounded-lg border resize-none
                  ${
                    isDarkMode
                      ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                  }
                  focus:ring-2 focus:ring-green-500 focus:border-transparent
                `}
              />

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowAnswerModal(false);
                    setSelectedQuestion(null);
                    setAnswerText("");
                  }}
                  className={`
                    flex-1 py-2 px-4 rounded-lg
                    ${
                      isDarkMode
                        ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }
                    transition-colors duration-200
                  `}
                >
                  {t("cancel") || "Cancel"}
                </button>
                <button
                  onClick={handleAnswerQuestion}
                  disabled={!answerText.trim()}
                  className="
                    flex-1 flex items-center justify-center space-x-2 py-2 px-4 rounded-lg
                    bg-green-500 text-white hover:bg-green-600
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors duration-200
                  "
                >
                  <Send size={16} />
                  <span>{t("send") || "Send"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedQuestion && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className={`
            w-full max-w-sm rounded-xl p-6
            ${isDarkMode ? "bg-gray-800" : "bg-white"}
            shadow-2xl
          `}
          >
            <h3
              className={`
              text-lg font-bold mb-4
              ${isDarkMode ? "text-white" : "text-gray-900"}
            `}
            >
              {t("deleteQuestion") || "Delete Question"}
            </h3>
            <p
              className={`
              mb-6
              ${isDarkMode ? "text-gray-300" : "text-gray-600"}
            `}
            >
              {t("deleteConfirmation") ||
                "Are you sure you want to delete this question?"}
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedQuestion(null);
                }}
                className={`
                  flex-1 py-2 px-4 rounded-lg
                  ${
                    isDarkMode
                      ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }
                  transition-colors duration-200
                `}
              >
                {t("cancel") || "Cancel"}
              </button>
              <button
                onClick={handleDeleteQuestion}
                className="
                  flex-1 py-2 px-4 rounded-lg
                  bg-red-500 text-white hover:bg-red-600
                  transition-colors duration-200
                "
              >
                {t("delete") || "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
