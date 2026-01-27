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

  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>("active");

  // Active coupons & benefits state
  const [activeCoupons, setActiveCoupons] = useState<Coupon[]>([]);
  const [activeBenefits, setActiveBenefits] = useState<UserBenefit[]>([]);
  const [lastActiveCouponDoc, setLastActiveCouponDoc] = useState<DocumentSnapshot | null>(null);
  const [lastActiveBenefitDoc, setLastActiveBenefitDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMoreActiveCoupons, setHasMoreActiveCoupons] = useState(true);
  const [hasMoreActiveBenefits, setHasMoreActiveBenefits] = useState(true);
  const [isLoadingActive, setIsLoadingActive] = useState(true);
  const [activeError, setActiveError] = useState<string | null>(null);

  // Used coupons & benefits state
  const [usedCoupons, setUsedCoupons] = useState<Coupon[]>([]);
  const [usedBenefits, setUsedBenefits] = useState<UserBenefit[]>([]);
  const [lastUsedCouponDoc, setLastUsedCouponDoc] = useState<DocumentSnapshot | null>(null);
  const [lastUsedBenefitDoc, setLastUsedBenefitDoc] = useState<DocumentSnapshot | null>(null);
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
          limit(PAGE_SIZE)
        );

        if (!isInitial && lastActiveCouponDoc) {
          q = query(
            collection(db, "users", user.uid, "coupons"),
            where("isUsed", "==", false),
            orderBy("createdAt", "desc"),
            startAfter(lastActiveCouponDoc),
            limit(PAGE_SIZE)
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
            const existingIds = new Set(prev.map((c) => c.id));
            const filtered = newCoupons.filter((c) => !existingIds.has(c.id));
            return [...prev, ...filtered];
          });
        }

        if (snapshot.docs.length > 0) {
          setLastActiveCouponDoc(snapshot.docs[snapshot.docs.length - 1]);
        }
        setHasMoreActiveCoupons(snapshot.docs.length >= PAGE_SIZE);
      } catch (error) {
        console.error("Error fetching active coupons:", error);
        setActiveError(t("CouponsPage.errorLoadingData"));
      }
    },
    [user?.uid, lastActiveCouponDoc, hasMoreActiveCoupons, t]
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
          limit(PAGE_SIZE)
        );

        if (!isInitial && lastActiveBenefitDoc) {
          q = query(
            collection(db, "users", user.uid, "benefits"),
            where("isUsed", "==", false),
            orderBy("createdAt", "desc"),
            startAfter(lastActiveBenefitDoc),
            limit(PAGE_SIZE)
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
            const existingIds = new Set(prev.map((b) => b.id));
            const filtered = newBenefits.filter((b) => !existingIds.has(b.id));
            return [...prev, ...filtered];
          });
        }

        if (snapshot.docs.length > 0) {
          setLastActiveBenefitDoc(snapshot.docs[snapshot.docs.length - 1]);
        }
        setHasMoreActiveBenefits(snapshot.docs.length >= PAGE_SIZE);
      } catch (error) {
        console.error("Error fetching active benefits:", error);
        setActiveError(t("CouponsPage.errorLoadingData"));
      }
    },
    [user?.uid, lastActiveBenefitDoc, hasMoreActiveBenefits, t]
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
          limit(PAGE_SIZE)
        );

        if (!isInitial && lastUsedCouponDoc) {
          q = query(
            collection(db, "users", user.uid, "coupons"),
            where("isUsed", "==", true),
            orderBy("usedAt", "desc"),
            startAfter(lastUsedCouponDoc),
            limit(PAGE_SIZE)
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
            const existingIds = new Set(prev.map((c) => c.id));
            const filtered = newCoupons.filter((c) => !existingIds.has(c.id));
            return [...prev, ...filtered];
          });
        }

        if (snapshot.docs.length > 0) {
          setLastUsedCouponDoc(snapshot.docs[snapshot.docs.length - 1]);
        }
        setHasMoreUsedCoupons(snapshot.docs.length >= PAGE_SIZE);
      } catch (error) {
        console.error("Error fetching used coupons:", error);
        setUsedError(t("CouponsPage.errorLoadingData"));
      }
    },
    [user?.uid, lastUsedCouponDoc, hasMoreUsedCoupons, t]
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
          limit(PAGE_SIZE)
        );

        if (!isInitial && lastUsedBenefitDoc) {
          q = query(
            collection(db, "users", user.uid, "benefits"),
            where("isUsed", "==", true),
            orderBy("usedAt", "desc"),
            startAfter(lastUsedBenefitDoc),
            limit(PAGE_SIZE)
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
            const existingIds = new Set(prev.map((b) => b.id));
            const filtered = newBenefits.filter((b) => !existingIds.has(b.id));
            return [...prev, ...filtered];
          });
        }

        if (snapshot.docs.length > 0) {
          setLastUsedBenefitDoc(snapshot.docs[snapshot.docs.length - 1]);
        }
        setHasMoreUsedBenefits(snapshot.docs.length >= PAGE_SIZE);
      } catch (error) {
        console.error("Error fetching used benefits:", error);
        setUsedError(t("CouponsPage.errorLoadingData"));
      }
    },
    [user?.uid, lastUsedBenefitDoc, hasMoreUsedBenefits, t]
  );

  // Initial load for active tab
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

  // Load used tab when switched to
  useEffect(() => {
    const loadInitialUsed = async () => {
      if (!user?.uid || usedInitiallyLoaded) return;

      setIsLoadingUsed(true);
      setUsedError(null);

      await Promise.all([fetchUsedCoupons(true), fetchUsedBenefits(true)]);

      setIsLoadingUsed(false);
      setUsedInitiallyLoaded(true);
    };

    if (activeTab === "used" && !usedInitiallyLoaded) {
      loadInitialUsed();
    }
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

  // Scroll handler for infinite loading
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

  // Format date helper
  const formatDate = (timestamp?: Timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  // Redirect if not logged in
  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push("/login");
    }
  }, [user, isUserLoading, router]);

  // Loading state
  if (isUserLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500" />
      </div>
    );
  }

  // Render benefit card
  const renderBenefitCard = (benefit: UserBenefit, isUsed: boolean) => {
    const statusColor = isUsed
      ? "gray"
      : benefit.status === "expired"
      ? "red"
      : "green";

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

    const colorClasses = {
      gray: {
        bg: "bg-gray-100 dark:bg-gray-700",
        icon: "text-gray-500",
        border: "border-gray-200 dark:border-gray-600",
      },
      blue: {
        bg: "bg-blue-50 dark:bg-blue-900/20",
        icon: "text-blue-500",
        border: "border-blue-200 dark:border-blue-800",
      },
      purple: {
        bg: "bg-purple-50 dark:bg-purple-900/20",
        icon: "text-purple-500",
        border: "border-purple-200 dark:border-purple-800",
      },
      orange: {
        bg: "bg-orange-50 dark:bg-orange-900/20",
        icon: "text-orange-500",
        border: "border-orange-200 dark:border-orange-800",
      },
    };

    const colors = colorClasses[config.color as keyof typeof colorClasses];

    const statusBgColor =
      statusColor === "gray"
        ? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
        : statusColor === "red"
        ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
        : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400";

    return (
      <div
        key={benefit.id}
        className={`p-4 rounded-xl border shadow-sm transition-all ${
          isDarkMode ? "bg-gray-800" : "bg-white"
        } ${colors.border}`}
        style={{ opacity: isUsed ? 0.7 : 1 }}
      >
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.bg}`}>
            <IconComponent className={`w-7 h-7 ${colors.icon}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3
                className={`font-semibold text-base ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {config.title}
              </h3>
              <span
                className={`px-2 py-1 rounded-md text-xs font-semibold flex-shrink-0 ${statusBgColor}`}
              >
                {statusText}
              </span>
            </div>

            <p
              className={`text-sm mb-2 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {config.description}
            </p>

            <p
              className={`text-xs ${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              }`}
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

  // Render coupon card
  const renderCouponCard = (coupon: Coupon, isUsed: boolean) => {
    const statusColor = isUsed
      ? "gray"
      : coupon.status === "expired"
      ? "red"
      : "green";

    const statusText = isUsed
      ? t("CouponsPage.used")
      : coupon.status === "expired"
      ? t("CouponsPage.expired")
      : t("CouponsPage.active");

    const statusBgColor =
      statusColor === "gray"
        ? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
        : statusColor === "red"
        ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
        : "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400";

    const validUntilText = isUsed && coupon.usedAt
      ? `${t("CouponsPage.usedOn")} ${formatDate(coupon.usedAt)}`
      : coupon.expiresAt
      ? `${t("CouponsPage.validUntil")} ${formatDate(coupon.expiresAt)}`
      : t("CouponsPage.noExpiry");

    return (
      <div key={coupon.id}>
        {/* Coupon Visual Widget */}
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

        {/* Status Badge and Description */}
        <div className="flex items-center gap-2 mt-3 px-1">
          <span className={`px-2 py-1 rounded-md text-xs font-semibold ${statusBgColor}`}>
            {statusText}
          </span>
          {coupon.description && (
            <span
              className={`text-sm truncate ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {coupon.description}
            </span>
          )}
        </div>
      </div>
    );
  };

  // Render shimmer loading
  const renderShimmer = () => (
    <div className="space-y-4 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className={`h-[140px] rounded-xl ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`}
        />
      ))}
    </div>
  );

  // Render empty state
  const renderEmptyState = (isUsed: boolean) => (
    <div className="flex flex-col items-center justify-center py-16 px-8">
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${
          isDarkMode ? "bg-gray-700" : "bg-gray-100"
        }`}
      >
        {isUsed ? (
          <Clock className={`w-10 h-10 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} />
        ) : (
          <Gift className={`w-10 h-10 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`} />
        )}
      </div>
      <h3
        className={`text-lg font-semibold mb-2 text-center ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {isUsed ? t("CouponsPage.noUsedCouponsOrBenefits") : t("CouponsPage.noCouponsOrBenefits")}
      </h3>
      <p
        className={`text-sm text-center ${
          isDarkMode ? "text-gray-400" : "text-gray-600"
        }`}
      >
        {isUsed
          ? t("CouponsPage.noUsedCouponsOrBenefitsDescription")
          : t("CouponsPage.noCouponsOrBenefitsDescription")}
      </p>
    </div>
  );

  // Render error state
  const renderErrorState = (onRetry: () => void) => (
    <div className="flex flex-col items-center justify-center py-16 px-8">
      <div
        className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 bg-red-100 dark:bg-red-900/20`}
      >
        <AlertCircle className="w-10 h-10 text-red-500" />
      </div>
      <h3
        className={`text-lg font-semibold mb-2 text-center ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {t("CouponsPage.errorLoadingData")}
      </h3>
      <p
        className={`text-sm text-center mb-6 ${
          isDarkMode ? "text-gray-400" : "text-gray-600"
        }`}
      >
        {t("CouponsPage.tryAgainLater")}
      </p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
      >
        <RefreshCw className="w-4 h-4" />
        {t("CouponsPage.retry")}
      </button>
    </div>
  );

  // Render active tab content
  const renderActiveContent = () => {
    if (isLoadingActive) {
      return renderShimmer();
    }

    if (activeError && activeCoupons.length === 0 && activeBenefits.length === 0) {
      return renderErrorState(handleRefreshActive);
    }

    if (activeCoupons.length === 0 && activeBenefits.length === 0) {
      return renderEmptyState(false);
    }

    return (
      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Benefits first */}
          {activeBenefits.map((benefit) => renderBenefitCard(benefit, false))}

          {/* Then coupons */}
          {activeCoupons.map((coupon) => renderCouponCard(coupon, false))}
        </div>

        {/* Loading more indicator */}
        {(hasMoreActiveCoupons || hasMoreActiveBenefits) && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
          </div>
        )}
      </div>
    );
  };

  // Render used tab content
  const renderUsedContent = () => {
    if (isLoadingUsed) {
      return renderShimmer();
    }

    if (usedError && usedCoupons.length === 0 && usedBenefits.length === 0) {
      return renderErrorState(handleRefreshUsed);
    }

    if (usedCoupons.length === 0 && usedBenefits.length === 0) {
      return renderEmptyState(true);
    }

    return (
      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Benefits first */}
          {usedBenefits.map((benefit) => renderBenefitCard(benefit, true))}

          {/* Then coupons */}
          {usedCoupons.map((coupon) => renderCouponCard(coupon, true))}
        </div>

        {/* Loading more indicator */}
        {(hasMoreUsedCoupons || hasMoreUsedBenefits) && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-500" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      style={{
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 ${
          isDarkMode ? "bg-gray-900/95" : "bg-white/95"
        } backdrop-blur-sm border-b ${
          isDarkMode ? "border-gray-800" : "border-gray-200"
        }`}
      >
        <div className="max-w-3xl mx-auto px-4">
          {/* Title Bar */}
          <div className="flex items-center gap-4 h-14 md:h-16">
            <button
              onClick={() => router.back()}
              className={`p-2 -ml-2 rounded-lg transition-colors ${
                isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"
              }`}
            >
              <ArrowLeft
                className={`w-5 h-5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              />
            </button>
            <h1
              className={`text-lg font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("CouponsPage.myCouponsAndBenefits")}
            </h1>
          </div>

          {/* Tab Bar */}
          <div className="pb-3">
            <div
              className={`flex p-1 rounded-xl ${
                isDarkMode ? "bg-gray-800" : "bg-gray-100"
              }`}
            >
              <button
                onClick={() => setActiveTab("active")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                  activeTab === "active"
                    ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30"
                    : isDarkMode
                    ? "text-gray-400 hover:text-gray-300"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Gift className="w-4 h-4" />
                <span>{t("CouponsPage.activeCoupons")}</span>
              </button>
              <button
                onClick={() => setActiveTab("used")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                  activeTab === "used"
                    ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30"
                    : isDarkMode
                    ? "text-gray-400 hover:text-gray-300"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                <span>{t("CouponsPage.usedCoupons")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        className="max-w-3xl mx-auto px-4 py-4 overflow-y-auto"
        onScroll={handleScroll}
        style={{ maxHeight: "calc(100vh - 140px)" }}
      >
        {activeTab === "active" ? renderActiveContent() : renderUsedContent()}
      </div>
    </div>
  );
}