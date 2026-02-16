"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Inbox,
  Reply,
  Edit3,
  Trash2,
  CheckCircle,
  Clock,
  Star,
  X,
  Send,
  ArrowLeft,
  Filter,
  Package,
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
import { useTheme } from "@/hooks/useTheme";

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
  const { user, profileData, isLoading: authLoading } = useUser();
  const t = useTranslations("ProductQuestions");
  const isDarkMode = useTheme();

  // State
  const [activeTab, setActiveTab] = useState<"asked" | "received">("asked");
  const [filters, setFilters] = useState<FilterOptions>({
    answeredOnly: false,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Asked questions state
  const [askedQuestions, setAskedQuestions] = useState<ProductQuestion[]>([]);
  const [askedLoading, setAskedLoading] = useState(false);
  const [askedHasMore, setAskedHasMore] = useState(true);
  const [askedLastDoc, setAskedLastDoc] =
    useState<QueryDocumentSnapshot | null>(null);

  // Received questions state
  const [receivedQuestions, setReceivedQuestions] = useState<ProductQuestion[]>(
    [],
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

  // Refs
  const isLoadingMoreRef = useRef(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Load initial data
  useEffect(() => {
    if (user) {
      loadAskedQuestions(true);
      loadReceivedQuestions(true);
    }
  }, [user, filters]);

  // Window scroll handler for infinite loading
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.innerHeight + window.scrollY;
      const threshold = document.documentElement.scrollHeight - 200;

      if (scrollPosition >= threshold) {
        if (
          activeTab === "asked" &&
          askedHasMore &&
          !askedLoading &&
          !isLoadingMoreRef.current
        ) {
          isLoadingMoreRef.current = true;
          loadAskedQuestions(false).finally(() => {
            isLoadingMoreRef.current = false;
          });
        } else if (
          activeTab === "received" &&
          receivedHasMore &&
          !receivedLoading &&
          !isLoadingMoreRef.current
        ) {
          isLoadingMoreRef.current = true;
          loadReceivedQuestions(false).finally(() => {
            isLoadingMoreRef.current = false;
          });
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeTab, askedHasMore, askedLoading, receivedHasMore, receivedLoading]);

  // Load asked questions
  const loadAskedQuestions = async (reset = false) => {
    if (!user || askedLoading) return;

    setAskedLoading(true);
    try {
      let q = query(
        collectionGroup(db, "product_questions"),
        where("askerId", "==", user.uid),
      );

      if (filters.sellerId) {
        q = query(q, where("sellerId", "==", filters.sellerId));
      }
      if (filters.productId) {
        q = query(q, where("productId", "==", filters.productId));
      }
      if (filters.startDate) {
        q = query(
          q,
          where("timestamp", ">=", Timestamp.fromDate(filters.startDate)),
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
          }) as ProductQuestion,
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
        where("sellerId", "==", user.uid),
      );

      if (filters.productId) {
        q = query(q, where("productId", "==", filters.productId));
      }
      if (filters.startDate) {
        q = query(
          q,
          where("timestamp", ">=", Timestamp.fromDate(filters.startDate)),
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
          }) as ProductQuestion,
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
        selectedQuestion.id,
      );

      await updateDoc(docRef, {
        answerText: answerText.trim(),
        answered: true,
        answererName: profileData?.displayName || "",
        answererProfileImage: profileData?.profileImage || "",
        answeredAt: serverTimestamp(),
      });

      const updatedQuestion = {
        ...selectedQuestion,
        answered: true,
        answerText: answerText.trim(),
        answererName: profileData?.displayName || "",
        answererProfileImage: profileData?.profileImage || "",
      };

      setReceivedQuestions((prev) =>
        prev.map((q) => (q.id === selectedQuestion.id ? updatedQuestion : q)),
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
        selectedQuestion.id,
      );
      await deleteDoc(docRef);

      if (activeTab === "asked") {
        setAskedQuestions((prev) =>
          prev.filter((q) => q.id !== selectedQuestion.id),
        );
      } else {
        setReceivedQuestions((prev) =>
          prev.filter((q) => q.id !== selectedQuestion.id),
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
    isLoadingMoreRef.current = false;
  };

  // Active filter count
  const activeFilterCount = [
    filters.productId,
    filters.sellerId,
    filters.startDate,
    filters.endDate,
    filters.answeredOnly || undefined,
  ].filter(Boolean).length;

  const currentQuestions =
    activeTab === "asked" ? askedQuestions : receivedQuestions;
  const currentLoading = activeTab === "asked" ? askedLoading : receivedLoading;

  // ============================================================================
  // RENDER
  // ============================================================================

  // Dark mode class helpers
  const headingColor = isDarkMode ? "text-white" : "text-gray-900";
  const bodyColor = isDarkMode ? "text-gray-300" : "text-gray-600";
  const mutedColor = isDarkMode ? "text-gray-500" : "text-gray-400";
  const cardClass = isDarkMode
    ? "bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all"
    : "bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all";
  const cardBorderClass = isDarkMode ? "border-b border-gray-800" : "border-b border-gray-50";
  const inputClass = isDarkMode
    ? "w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
    : "w-full px-3 py-2 text-sm bg-gray-50/80 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300 outline-none transition-all";
  const bubbleBg = isDarkMode ? "bg-gray-800" : "bg-gray-50";

  if (authLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-gray-950" : "bg-gray-50/50"}`}>
        <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? "bg-gray-950" : "bg-gray-50/50"}`}>
      {/* Sticky Toolbar */}
      <div className={`sticky top-14 z-30 backdrop-blur-xl border-b ${isDarkMode ? "bg-gray-950/80 border-gray-800/80" : "bg-white/80 border-gray-100/80"}`}>
        <div className="max-w-4xl mx-auto">
          {/* Row 1: Nav + Title + Actions */}
          <div className="flex items-center gap-3 px-3 sm:px-6 py-2">
            <button
              onClick={() => router.back()}
              className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${isDarkMode ? "bg-gray-800 border-gray-700 hover:bg-gray-700" : "bg-gray-50 border-gray-200 hover:bg-gray-100"}`}
            >
              <ArrowLeft className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`} />
            </button>
            <h1 className={`text-lg font-bold truncate ${headingColor}`}>
              {t("title") || "Product Questions"}
            </h1>
            {currentQuestions.length > 0 && (
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full flex-shrink-0 ${isDarkMode ? "bg-orange-950/50 text-orange-400" : "bg-orange-50 text-orange-600"}`}>
                {currentQuestions.length}
              </span>
            )}
            <div className="flex-1" />

            {/* Filter button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`relative w-9 h-9 flex items-center justify-center border rounded-xl transition-all flex-shrink-0 ${
                showFilters
                  ? "bg-orange-500 border-orange-500 text-white"
                  : isDarkMode
                    ? "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700"
                    : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
              }`}
            >
              <Filter className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Row 2: Tab pills */}
          <div className="px-3 sm:px-6 pb-2.5">
            <div className={`flex gap-1 rounded-xl p-1 ${isDarkMode ? "bg-gray-800/80" : "bg-gray-100/80"}`}>
              <button
                onClick={() => setActiveTab("asked")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "asked"
                    ? isDarkMode ? "bg-gray-700 text-white shadow-sm" : "bg-white text-gray-900 shadow-sm"
                    : isDarkMode ? "text-gray-400 hover:text-gray-300" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {t("askedQuestions") || "Asked"}
                {askedQuestions.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === "asked"
                        ? "bg-orange-100 text-orange-600"
                        : isDarkMode ? "bg-gray-700 text-gray-400" : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {askedQuestions.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("received")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "received"
                    ? isDarkMode ? "bg-gray-700 text-white shadow-sm" : "bg-white text-gray-900 shadow-sm"
                    : isDarkMode ? "text-gray-400 hover:text-gray-300" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Inbox className="w-3.5 h-3.5" />
                {t("receivedQuestions") || "Received"}
                {receivedQuestions.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === "received"
                        ? "bg-orange-100 text-orange-600"
                        : isDarkMode ? "bg-gray-700 text-gray-400" : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {receivedQuestions.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4">
        {/* Filter Panel */}
        {showFilters && (
          <div className={`rounded-2xl border p-4 mb-4 ${isDarkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-[11px] font-semibold uppercase tracking-wider ${mutedColor}`}>
                {t("filters") || "Filters"}
              </span>
              {activeFilterCount > 0 && (
                <button
                  onClick={resetFilters}
                  className="text-[11px] text-orange-600 hover:text-orange-700 font-semibold"
                >
                  {t("clearFilters") || "Clear filters"}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                  {t("status") || "Status"}
                </label>
                <select
                  value={filters.answeredOnly ? "answered" : "all"}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      answeredOnly: e.target.value === "answered",
                    }))
                  }
                  className={inputClass}
                >
                  <option value="all">{t("all") || "All"}</option>
                  <option value="answered">
                    {t("answered") || "Answered"}
                  </option>
                </select>
              </div>

              <div>
                <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                  {t("startDate") || "Start Date"}
                </label>
                <input
                  type="date"
                  value={filters.startDate?.toISOString().split("T")[0] || ""}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      startDate: e.target.value
                        ? new Date(e.target.value)
                        : undefined,
                    }))
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                  {t("endDate") || "End Date"}
                </label>
                <input
                  type="date"
                  value={filters.endDate?.toISOString().split("T")[0] || ""}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      endDate: e.target.value
                        ? new Date(e.target.value)
                        : undefined,
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}

        {/* Questions List */}
        <div className="space-y-3">
          {currentQuestions.length === 0 && !currentLoading ? (
            <div className="text-center py-16">
              <MessageSquare className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-700" : "text-gray-300"}`} />
              <h3 className={`text-sm font-semibold mb-1 ${headingColor}`}>
                {t("noQuestions") || "No Questions"}
              </h3>
              <p className={`text-xs max-w-xs mx-auto ${mutedColor}`}>
                {activeTab === "asked"
                  ? t("noAskedQuestions") ||
                    "You haven't asked any questions yet"
                  : t("noReceivedQuestions") ||
                    "You haven't received any questions yet"}
              </p>
            </div>
          ) : (
            currentQuestions.map((question) => (
              <div key={question.id} className={cardClass}>
                {/* Product header */}
                <div
                  className={`px-4 py-3 ${cardBorderClass} flex items-center gap-3 cursor-pointer`}
                  onClick={() =>
                    router.push(`/productdetail/${question.productId}`)
                  }
                >
                  <div className={`w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 relative ${bubbleBg}`}>
                    {question.productImage ? (
                      <Image
                        src={question.productImage}
                        alt={question.productName}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className={`w-4 h-4 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-semibold truncate ${headingColor}`}>
                      {question.productName}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-bold text-orange-600">
                        ₺{question.productPrice.toLocaleString()}
                      </span>
                      {question.productRating > 0 && (
                        <div className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 text-amber-400 fill-current" />
                          <span className={`text-[11px] ${mutedColor}`}>
                            {question.productRating.toFixed(1)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`text-[11px] flex-shrink-0 ${mutedColor}`}>
                    {question.timestamp.toDate().toLocaleDateString("tr-TR")}
                  </span>
                </div>

                {/* Question body */}
                <div className="px-4 py-3">
                  <div className={`rounded-xl px-3 py-2.5 mb-2.5 ${bubbleBg}`}>
                    <p className={`text-sm leading-relaxed ${headingColor}`}>
                      {question.questionText}
                    </p>
                    <p className={`text-[11px] mt-1.5 ${mutedColor}`}>
                      {t("askedBy")}:{" "}
                      {question.askerNameVisible
                        ? question.askerName
                        : t("anonymous") || "Anonymous"}
                    </p>
                  </div>

                  {/* Answer section */}
                  {question.answered && question.answerText && (
                    <div className={`rounded-xl px-3 py-2.5 mb-2.5 border ${isDarkMode ? "bg-orange-950/30 border-orange-900/50" : "bg-orange-50/60 border-orange-100"}`}>
                      <p className={`text-sm leading-relaxed ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
                        {question.answerText}
                      </p>
                      {question.answererName && (
                        <p className="text-[11px] text-orange-500 mt-1.5">
                          {t("answeredBy") || "Answered by"}:{" "}
                          {question.answererName}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Status + Actions */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5">
                      {question.answered ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-[11px] font-medium text-green-600">
                            {t("answered") || "Answered"}
                          </span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 text-orange-500" />
                          <span className="text-[11px] font-medium text-orange-600">
                            {activeTab === "asked"
                              ? t("waitingForAnswer") || "Waiting"
                              : t("unanswered") || "Unanswered"}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Actions for received questions */}
                    {activeTab === "received" && (
                      <div className="flex items-center gap-2">
                        {!question.answered ? (
                          <>
                            <button
                              onClick={() => {
                                setSelectedQuestion(question);
                                setAnswerText(question.answerText || "");
                                setShowAnswerModal(true);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-xs font-medium"
                            >
                              <Reply className="w-3 h-3" />
                              {t("answer") || "Answer"}
                            </button>
                            <button
                              onClick={() => {
                                setSelectedQuestion(question);
                                setShowDeleteModal(true);
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-xs font-medium ${isDarkMode ? "text-gray-500 hover:text-red-400 hover:bg-red-950/30" : "text-gray-400 hover:text-red-500 hover:bg-red-50"}`}
                            >
                              <Trash2 className="w-3 h-3" />
                              {t("delete") || "Delete"}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedQuestion(question);
                              setAnswerText(question.answerText || "");
                              setShowAnswerModal(true);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-xs font-medium"
                          >
                            <Edit3 className="w-3 h-3" />
                            {t("editAnswer") || "Edit"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}

          {currentLoading && (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Answer Modal */}
      {showAnswerModal && selectedQuestion && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className={`rounded-2xl max-w-lg w-full shadow-2xl ${isDarkMode ? "bg-gray-900" : "bg-white"}`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}>
              <h3 className={`text-base font-bold ${headingColor}`}>
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
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"}`}
              >
                <X className={`w-4 h-4 ${mutedColor}`} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4">
              <div className={`rounded-xl p-3 mb-4 ${bubbleBg}`}>
                <p className={`text-sm ${headingColor}`}>
                  {selectedQuestion.questionText}
                </p>
              </div>

              <label className={`text-[11px] font-semibold uppercase tracking-wider mb-1.5 block ${mutedColor}`}>
                {t("yourAnswer") || "Your Answer"}
              </label>
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder={t("writeAnswer") || "Write your answer..."}
                rows={4}
                className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-orange-500/20 outline-none resize-none transition-all ${isDarkMode ? "bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-500 focus:border-orange-500" : "border-gray-200 focus:border-orange-300"}`}
              />
            </div>

            {/* Footer */}
            <div className={`flex gap-2 p-4 border-t ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}>
              <button
                onClick={() => {
                  setShowAnswerModal(false);
                  setSelectedQuestion(null);
                  setAnswerText("");
                }}
                className={`flex-1 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium ${isDarkMode ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                {t("cancel") || "Cancel"}
              </button>
              <button
                onClick={handleAnswerQuestion}
                disabled={!answerText.trim()}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-orange-500 text-white rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                <Send className="w-3.5 h-3.5" />
                {t("send") || "Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedQuestion && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className={`rounded-2xl max-w-sm w-full shadow-2xl ${isDarkMode ? "bg-gray-900" : "bg-white"}`}>
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}>
              <h3 className={`text-base font-bold ${headingColor}`}>
                {t("deleteQuestion") || "Delete Question"}
              </h3>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedQuestion(null);
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"}`}
              >
                <X className={`w-4 h-4 ${mutedColor}`} />
              </button>
            </div>

            {/* Body */}
            <div className="p-4">
              <p className={`text-sm ${bodyColor}`}>
                {t("deleteConfirmation") ||
                  "Are you sure you want to delete this question?"}
              </p>
            </div>

            {/* Footer */}
            <div className={`flex gap-2 p-4 border-t ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedQuestion(null);
                }}
                className={`flex-1 px-4 py-2.5 rounded-xl transition-colors text-sm font-medium ${isDarkMode ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                {t("cancel") || "Cancel"}
              </button>
              <button
                onClick={handleDeleteQuestion}
                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors text-sm font-medium"
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
