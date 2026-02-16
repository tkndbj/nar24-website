"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  DocumentSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ArrowLeft,
  Gift,
  CheckCircle,
  Truck,
  Clock,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { CouponWidget } from "@/app/components/Coupon";

// Types
interface Coupon {
  id: string;
  amount: number;
  currency: string;
  code?: string;
  description?: string;
  isUsed: boolean;
  status: "active" | "expired" | "used";
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  usedAt?: Timestamp;
}

interface UserBenefit {
  id: string;
  type: "freeShipping" | "discount" | "other";
  isUsed: boolean;
  status: "active" | "expired" | "used";
  createdAt: Timestamp;
  expiresAt?: Timestamp;
  usedAt?: Timestamp;
}

type TabType = "active" | "used";

const PAGE_SIZE = 20;

export default function CouponsAndBenefitsPage() {
  const { user, isLoading: isUserLoading } = useUser();
  const router = useRouter();
  const t = useTranslations();

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("active");

  // Active state
  const [activeCoupons, setActiveCoupons] = useState<Coupon[]>([]);
  const [activeBenefits, setActiveBenefits] = useState<UserBenefit[]>([]);
  const [lastActiveCouponDoc, setLastActiveCouponDoc] =
    useState<DocumentSnapshot | null>(null);
  const [lastActiveBenefitDoc, setLastActiveBenefitDoc] =
    useState<DocumentSnapshot | null>(null);
  const [hasMoreActiveCoupons, setHasMoreActiveCoupons] = useState(true);
  const [hasMoreActiveBenefits, setHasMoreActiveBenefits] = useState(true);
  const [isLoadingActive, setIsLoadingActive] = useState(true);
  const [activeError, setActiveError] = useState<string | null>(null);

  // Used state
  const [usedCoupons, setUsedCoupons] = useState<Coupon[]>([]);
  const [usedBenefits, setUsedBenefits] = useState<UserBenefit[]>([]);
  const [lastUsedCouponDoc, setLastUsedCouponDoc] =
    useState<DocumentSnapshot | null>(null);
  const [lastUsedBenefitDoc, setLastUsedBenefitDoc] =
    useState<DocumentSnapshot | null>(null);
  const [hasMoreUsedCoupons, setHasMoreUsedCoupons] = useState(true);
  const [hasMoreUsedBenefits, setHasMoreUsedBenefits] = useState(true);
  const [isLoadingUsed, setIsLoadingUsed] = useState(false);
  const [usedError, setUsedError] = useState<string | null>(null);
  const [usedInitiallyLoaded, setUsedInitiallyLoaded] = useState(false);

  // Theme detection
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

  // Fetch active coupons
  const fetchActiveCoupons = useCallback(
    async (isInitial = false) => {
      if (!user?.uid) return;
      if (!hasMoreActiveCoupons && !isInitial) return;
      try {
        let q = query(
          collection(db, "users", user.uid, "coupons"),
          where("isUsed", "==", false),
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE),
        );
        if (!isInitial && lastActiveCouponDoc) {
          q = query(
            collection(db, "users", user.uid, "coupons"),
            where("isUsed", "==", false),
            orderBy("createdAt", "desc"),
            startAfter(lastActiveCouponDoc),
            limit(PAGE_SIZE),
          );
        }
        const snapshot = await getDocs(q);
        const newCoupons = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Coupon[];
        if (isInitial) {
          setActiveCoupons(newCoupons);
        } else {
          setActiveCoupons((prev) => {
            const ids = new Set(prev.map((c) => c.id));
            return [...prev, ...newCoupons.filter((c) => !ids.has(c.id))];
          });
        }
        if (snapshot.docs.length > 0)
          setLastActiveCouponDoc(snapshot.docs[snapshot.docs.length - 1]);
        setHasMoreActiveCoupons(snapshot.docs.length >= PAGE_SIZE);
      } catch (error) {
        console.error("Error fetching active coupons:", error);
        setActiveError(t("CouponsPage.errorLoadingData"));
      }
    },
    [user?.uid, lastActiveCouponDoc, hasMoreActiveCoupons, t],
  );

  // Fetch active benefits
  const fetchActiveBenefits = useCallback(
    async (isInitial = false) => {
      if (!user?.uid) return;
      if (!hasMoreActiveBenefits && !isInitial) return;
      try {
        let q = query(
          collection(db, "users", user.uid, "benefits"),
          where("isUsed", "==", false),
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE),
        );
        if (!isInitial && lastActiveBenefitDoc) {
          q = query(
            collection(db, "users", user.uid, "benefits"),
            where("isUsed", "==", false),
            orderBy("createdAt", "desc"),
            startAfter(lastActiveBenefitDoc),
            limit(PAGE_SIZE),
          );
        }
        const snapshot = await getDocs(q);
        const newBenefits = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as UserBenefit[];
        if (isInitial) {
          setActiveBenefits(newBenefits);
        } else {
          setActiveBenefits((prev) => {
            const ids = new Set(prev.map((b) => b.id));
            return [...prev, ...newBenefits.filter((b) => !ids.has(b.id))];
          });
        }
        if (snapshot.docs.length > 0)
          setLastActiveBenefitDoc(snapshot.docs[snapshot.docs.length - 1]);
        setHasMoreActiveBenefits(snapshot.docs.length >= PAGE_SIZE);
      } catch (error) {
        console.error("Error fetching active benefits:", error);
        setActiveError(t("CouponsPage.errorLoadingData"));
      }
    },
    [user?.uid, lastActiveBenefitDoc, hasMoreActiveBenefits, t],
  );

  // Fetch used coupons
  const fetchUsedCoupons = useCallback(
    async (isInitial = false) => {
      if (!user?.uid) return;
      if (!hasMoreUsedCoupons && !isInitial) return;
      try {
        let q = query(
          collection(db, "users", user.uid, "coupons"),
          where("isUsed", "==", true),
          orderBy("usedAt", "desc"),
          limit(PAGE_SIZE),
        );
        if (!isInitial && lastUsedCouponDoc) {
          q = query(
            collection(db, "users", user.uid, "coupons"),
            where("isUsed", "==", true),
            orderBy("usedAt", "desc"),
            startAfter(lastUsedCouponDoc),
            limit(PAGE_SIZE),
          );
        }
        const snapshot = await getDocs(q);
        const newCoupons = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Coupon[];
        if (isInitial) {
          setUsedCoupons(newCoupons);
        } else {
          setUsedCoupons((prev) => {
            const ids = new Set(prev.map((c) => c.id));
            return [...prev, ...newCoupons.filter((c) => !ids.has(c.id))];
          });
        }
        if (snapshot.docs.length > 0)
          setLastUsedCouponDoc(snapshot.docs[snapshot.docs.length - 1]);
        setHasMoreUsedCoupons(snapshot.docs.length >= PAGE_SIZE);
      } catch (error) {
        console.error("Error fetching used coupons:", error);
        setUsedError(t("CouponsPage.errorLoadingData"));
      }
    },
    [user?.uid, lastUsedCouponDoc, hasMoreUsedCoupons, t],
  );

  // Fetch used benefits
  const fetchUsedBenefits = useCallback(
    async (isInitial = false) => {
      if (!user?.uid) return;
      if (!hasMoreUsedBenefits && !isInitial) return;
      try {
        let q = query(
          collection(db, "users", user.uid, "benefits"),
          where("isUsed", "==", true),
          orderBy("usedAt", "desc"),
          limit(PAGE_SIZE),
        );
        if (!isInitial && lastUsedBenefitDoc) {
          q = query(
            collection(db, "users", user.uid, "benefits"),
            where("isUsed", "==", true),
            orderBy("usedAt", "desc"),
            startAfter(lastUsedBenefitDoc),
            limit(PAGE_SIZE),
          );
        }
        const snapshot = await getDocs(q);
        const newBenefits = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as UserBenefit[];
        if (isInitial) {
          setUsedBenefits(newBenefits);
        } else {
          setUsedBenefits((prev) => {
            const ids = new Set(prev.map((b) => b.id));
            return [...prev, ...newBenefits.filter((b) => !ids.has(b.id))];
          });
        }
        if (snapshot.docs.length > 0)
          setLastUsedBenefitDoc(snapshot.docs[snapshot.docs.length - 1]);
        setHasMoreUsedBenefits(snapshot.docs.length >= PAGE_SIZE);
      } catch (error) {
        console.error("Error fetching used benefits:", error);
        setUsedError(t("CouponsPage.errorLoadingData"));
      }
    },
    [user?.uid, lastUsedBenefitDoc, hasMoreUsedBenefits, t],
  );

  // Initial load
  useEffect(() => {
    const loadInitialActive = async () => {
      if (!user?.uid) return;
      setIsLoadingActive(true);
      setActiveError(null);
      await Promise.all([fetchActiveCoupons(true), fetchActiveBenefits(true)]);
      setIsLoadingActive(false);
    };
    loadInitialActive();
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load used tab when switched
  useEffect(() => {
    const loadInitialUsed = async () => {
      if (!user?.uid || usedInitiallyLoaded) return;
      setIsLoadingUsed(true);
      setUsedError(null);
      await Promise.all([fetchUsedCoupons(true), fetchUsedBenefits(true)]);
      setIsLoadingUsed(false);
      setUsedInitiallyLoaded(true);
    };
    if (activeTab === "used" && !usedInitiallyLoaded) loadInitialUsed();
  }, [activeTab, user?.uid, usedInitiallyLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh handlers
  const handleRefreshActive = async () => {
    setLastActiveCouponDoc(null);
    setLastActiveBenefitDoc(null);
    setHasMoreActiveCoupons(true);
    setHasMoreActiveBenefits(true);
    setIsLoadingActive(true);
    setActiveError(null);
    await Promise.all([fetchActiveCoupons(true), fetchActiveBenefits(true)]);
    setIsLoadingActive(false);
  };

  const handleRefreshUsed = async () => {
    setLastUsedCouponDoc(null);
    setLastUsedBenefitDoc(null);
    setHasMoreUsedCoupons(true);
    setHasMoreUsedBenefits(true);
    setIsLoadingUsed(true);
    setUsedError(null);
    await Promise.all([fetchUsedCoupons(true), fetchUsedBenefits(true)]);
    setIsLoadingUsed(false);
  };

  // Scroll handler
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 200) {
      if (activeTab === "active") {
        if (hasMoreActiveCoupons) fetchActiveCoupons();
        if (hasMoreActiveBenefits) fetchActiveBenefits();
      } else {
        if (hasMoreUsedCoupons) fetchUsedCoupons();
        if (hasMoreUsedBenefits) fetchUsedBenefits();
      }
    }
  };

  const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return "";
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(timestamp.toDate());
  };

  useEffect(() => {
    if (!isUserLoading && !user) router.push("/login");
  }, [user, isUserLoading, router]);

  // Counts
  const activeCount = activeCoupons.length + activeBenefits.length;
  const usedCount = usedCoupons.length + usedBenefits.length;

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const renderBenefitCard = (benefit: UserBenefit, isUsed: boolean) => {
    const statusText = isUsed
      ? t("CouponsPage.used")
      : benefit.status === "expired"
        ? t("CouponsPage.expired")
        : t("CouponsPage.active");

    const benefitConfig = {
      freeShipping: {
        title: t("CouponsPage.freeShipping"),
        description: t("CouponsPage.freeShippingDescription"),
        icon: Truck,
        color: isUsed ? "gray" : "blue",
      },
      discount: {
        title: t("CouponsPage.discount"),
        description: t("CouponsPage.discountDescription"),
        icon: Gift,
        color: isUsed ? "gray" : "purple",
      },
      other: {
        title: t("CouponsPage.benefit"),
        description: t("CouponsPage.benefitDescription"),
        icon: Gift,
        color: isUsed ? "gray" : "orange",
      },
    };

    const config = benefitConfig[benefit.type] || benefitConfig.other;
    const IconComponent = config.icon;

    const colorMap: Record<
      string,
      { iconBg: string; icon: string; statusBg: string }
    > = {
      gray: {
        iconBg: isDarkMode ? "bg-gray-700" : "bg-gray-100",
        icon: "text-gray-400",
        statusBg: isDarkMode
          ? "bg-gray-700 text-gray-400"
          : "bg-gray-100 text-gray-500",
      },
      blue: {
        iconBg: isDarkMode ? "bg-blue-900/20" : "bg-blue-50",
        icon: "text-blue-500",
        statusBg: isDarkMode
          ? "bg-green-900/30 text-green-400"
          : "bg-green-50 text-green-600",
      },
      purple: {
        iconBg: isDarkMode ? "bg-purple-900/20" : "bg-purple-50",
        icon: "text-purple-500",
        statusBg: isDarkMode
          ? "bg-green-900/30 text-green-400"
          : "bg-green-50 text-green-600",
      },
      orange: {
        iconBg: isDarkMode ? "bg-orange-900/20" : "bg-orange-50",
        icon: "text-orange-500",
        statusBg: isDarkMode
          ? "bg-green-900/30 text-green-400"
          : "bg-green-50 text-green-600",
      },
    };

    const colors = colorMap[config.color] || colorMap.gray;
    if (benefit.status === "expired" && !isUsed) {
      colors.statusBg = isDarkMode
        ? "bg-red-900/30 text-red-400"
        : "bg-red-50 text-red-600";
    }

    return (
      <div
        key={benefit.id}
        className={`rounded-2xl border p-4 transition-all ${isUsed ? "opacity-60" : "hover:shadow-md hover:-translate-y-0.5"} ${
          isDarkMode
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-100"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.iconBg}`}
          >
            <IconComponent className={`w-5 h-5 ${colors.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <h3
                className={`text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {config.title}
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 ${colors.statusBg}`}
              >
                {statusText}
              </span>
            </div>
            <p
              className={`text-xs mb-1.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              {config.description}
            </p>
            <p
              className={`text-[11px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
            >
              {isUsed && benefit.usedAt
                ? `${t("CouponsPage.usedOn")} ${formatDate(benefit.usedAt)}`
                : benefit.expiresAt
                  ? `${t("CouponsPage.validUntil")} ${formatDate(benefit.expiresAt)}`
                  : t("CouponsPage.noExpiry")}
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderCouponCard = (coupon: Coupon, isUsed: boolean) => {
    const statusText = isUsed
      ? t("CouponsPage.used")
      : coupon.status === "expired"
        ? t("CouponsPage.expired")
        : t("CouponsPage.active");
    let statusBg = isDarkMode
      ? "bg-green-900/30 text-green-400"
      : "bg-green-50 text-green-600";
    if (isUsed)
      statusBg = isDarkMode
        ? "bg-gray-700 text-gray-400"
        : "bg-gray-100 text-gray-500";
    else if (coupon.status === "expired")
      statusBg = isDarkMode
        ? "bg-red-900/30 text-red-400"
        : "bg-red-50 text-red-600";

    const validUntilText =
      isUsed && coupon.usedAt
        ? `${t("CouponsPage.usedOn")} ${formatDate(coupon.usedAt)}`
        : coupon.expiresAt
          ? `${t("CouponsPage.validUntil")} ${formatDate(coupon.expiresAt)}`
          : t("CouponsPage.noExpiry");

    return (
      <div key={coupon.id} className={`${isUsed ? "opacity-60" : ""}`}>
        <div className="flex justify-center">
          <CouponWidget
            leftText={t("CouponsPage.enjoyYourGift")}
            discount={`${coupon.amount.toFixed(0)} ${coupon.currency}`}
            subtitle={t("CouponsPage.coupon")}
            validUntil={validUntilText}
            code={coupon.code || coupon.id.substring(0, 8).toUpperCase()}
            primaryColor={isUsed ? "#9CA3AF" : "#FFD700"}
            isUsed={isUsed}
          />
        </div>
        <div className="flex items-center gap-2 mt-2 px-1">
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusBg}`}
          >
            {statusText}
          </span>
          {coupon.description && (
            <span
              className={`text-xs truncate ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              {coupon.description}
            </span>
          )}
        </div>
      </div>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (isUserLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center pt-20 ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
    >
      {/* Sticky Toolbar */}
      <div
        className={`sticky top-14 z-30 border-b ${
          isDarkMode
            ? "bg-gray-900/80 backdrop-blur-xl border-gray-700/80"
            : "bg-white/80 backdrop-blur-xl border-gray-100/80"
        }`}
      >
        <div className="max-w-4xl mx-auto">
          {/* Row 1: Nav + Title */}
          <div className="flex items-center gap-3 px-3 sm:px-6 pt-3 pb-2">
            <button
              onClick={() => router.back()}
              className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                  : "bg-gray-50 border-gray-200 hover:bg-gray-100"
              }`}
            >
              <ArrowLeft
                className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              />
            </button>
            <h1
              className={`text-lg font-bold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {t("CouponsPage.myCouponsAndBenefits")}
            </h1>
            {(activeTab === "active" ? activeCount : usedCount) > 0 && (
              <span className="px-2 py-0.5 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-semibold rounded-full flex-shrink-0">
                {activeTab === "active" ? activeCount : usedCount}
              </span>
            )}
          </div>

          {/* Row 2: Tab pills */}
          <div className="px-3 sm:px-6 pb-2.5">
            <div
              className={`flex gap-1 rounded-xl p-1 ${isDarkMode ? "bg-gray-800" : "bg-gray-100/80"}`}
            >
              <button
                onClick={() => setActiveTab("active")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "active"
                    ? isDarkMode
                      ? "bg-gray-700 text-white shadow-sm"
                      : "bg-white text-gray-900 shadow-sm"
                    : isDarkMode
                      ? "text-gray-400 hover:text-gray-200"
                      : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Gift className="w-3.5 h-3.5" />
                {t("CouponsPage.activeCoupons")}
                {activeCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === "active"
                        ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                        : isDarkMode
                          ? "bg-gray-700 text-gray-400"
                          : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {activeCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab("used")}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "used"
                    ? isDarkMode
                      ? "bg-gray-700 text-white shadow-sm"
                      : "bg-white text-gray-900 shadow-sm"
                    : isDarkMode
                      ? "text-gray-400 hover:text-gray-200"
                      : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {t("CouponsPage.usedCoupons")}
                {usedCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      activeTab === "used"
                        ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                        : isDarkMode
                          ? "bg-gray-700 text-gray-400"
                          : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {usedCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        className="max-w-4xl mx-auto px-3 sm:px-6 py-4"
        onScroll={handleScroll}
        style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}
      >
        {activeTab === "active" ? (
          /* Active Tab */
          isLoadingActive ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className={`rounded-2xl border h-24 animate-pulse ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-100"
                  }`}
                />
              ))}
            </div>
          ) : activeError &&
            activeCoupons.length === 0 &&
            activeBenefits.length === 0 ? (
            <div className="text-center py-16">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 ${
                  isDarkMode ? "bg-red-900/20" : "bg-red-50"
                }`}
              >
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <h3
                className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {t("CouponsPage.errorLoadingData")}
              </h3>
              <p
                className={`text-xs mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
              >
                {t("CouponsPage.tryAgainLater")}
              </p>
              <button
                onClick={handleRefreshActive}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t("CouponsPage.retry")}
              </button>
            </div>
          ) : activeCoupons.length === 0 && activeBenefits.length === 0 ? (
            <div className="text-center py-16">
              <Gift
                className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
              />
              <h3
                className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {t("CouponsPage.noCouponsOrBenefits")}
              </h3>
              <p
                className={`text-xs max-w-xs mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
              >
                {t("CouponsPage.noCouponsOrBenefitsDescription")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeBenefits.map((b) => renderBenefitCard(b, false))}
              {activeCoupons.map((c) => renderCouponCard(c, false))}
              {(hasMoreActiveCoupons || hasMoreActiveBenefits) && (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
                </div>
              )}
            </div>
          )
        ) : /* Used Tab */
        isLoadingUsed ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className={`rounded-2xl border h-24 animate-pulse ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700"
                    : "bg-white border-gray-100"
                }`}
              />
            ))}
          </div>
        ) : usedError &&
          usedCoupons.length === 0 &&
          usedBenefits.length === 0 ? (
          <div className="text-center py-16">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 ${
                isDarkMode ? "bg-red-900/20" : "bg-red-50"
              }`}
            >
              <AlertCircle className="w-5 h-5 text-red-500" />
            </div>
            <h3
              className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {t("CouponsPage.errorLoadingData")}
            </h3>
            <p
              className={`text-xs mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              {t("CouponsPage.tryAgainLater")}
            </p>
            <button
              onClick={handleRefreshUsed}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t("CouponsPage.retry")}
            </button>
          </div>
        ) : usedCoupons.length === 0 && usedBenefits.length === 0 ? (
          <div className="text-center py-16">
            <Clock
              className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
            />
            <h3
              className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {t("CouponsPage.noUsedCouponsOrBenefits")}
            </h3>
            <p
              className={`text-xs max-w-xs mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              {t("CouponsPage.noUsedCouponsOrBenefitsDescription")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {usedBenefits.map((b) => renderBenefitCard(b, true))}
            {usedCoupons.map((c) => renderCouponCard(c, true))}
            {(hasMoreUsedCoupons || hasMoreUsedBenefits) && (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
