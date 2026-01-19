"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft,
  Search,
  X,
  Calendar,
  TrendingUp,
  History,
  BarChart3,
  Package,
  Eye,
  MousePointer,
  Clock,
  Zap,
  LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useUser } from "@/context/UserProvider";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  Timestamp,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import Image from "next/image";

// Types
interface Product {
  id: string;
  productName: string;
  imageUrls: string[];
  price: number;
  currency: string;
  userId: string;
}

interface BoostedItem {
  id: string;
  itemName: string;
  itemType: "product" | "property" | "car";
  imageUrls: string[];
  clickCount: number;
  boostedImpressionCount: number;
  boostImpressionCountAtStart: number;
  boostClickCountAtStart?: number;
  boostStartTime?: Timestamp;
  boostEndTime?: Timestamp;
  product?: Product;
  price?: number;
  currency?: string;
}

interface PastBoostDoc {
  docId: string;
  itemId: string;
  itemName: string;
  itemType: string;
  productImage?: string;
  price?: number;
  currency?: string;

  impressionsDuringBoost: number;
  clicksDuringBoost: number;
  boostStartTime?: Timestamp;
  boostEndTime?: Timestamp;
}

// Constants
const PAGE_SIZE = 20;
const ONGOING_BOOST_LIMIT = 50;

// Color scheme
const colors = {
  primaryGreen: "#00A86B",
  accentCoral: "#FF7F50",
  blueAccent: "#3B82F6",
  darkBlue: "#1A365D",
};

export default function BoostAnalysisPage() {
  const router = useRouter();
  const t = useTranslations("BoostAnalysis");
  const { user, isLoading: authLoading } = useUser();

  // State
  const [activeTab, setActiveTab] = useState<"analysis" | "ongoing" | "past">(
    "analysis"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [, setShowDatePicker] = useState(false);

  // Loading states
  const [isLoadingOngoing, setIsLoadingOngoing] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Data states
  const [ongoingBoosts, setOngoingBoosts] = useState<BoostedItem[]>([]);
  const [pastBoostHistory, setPastBoostHistory] = useState<PastBoostDoc[]>([]);
  const [lastHistoryDoc, setLastHistoryDoc] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);

  // Subscriptions
  const [subscriptions, setSubscriptions] = useState<Unsubscribe[]>([]);

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

  // Redirect if not authenticated (only after auth state is determined)
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Initialize data fetching
  useEffect(() => {
    if (user) {
      fetchOngoingBoosts();
      fetchPastBoostHistory();
    }

    return () => {
      // Cleanup subscriptions
      subscriptions.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery("");
    if (user) {
      fetchOngoingBoosts();
      fetchPastBoostHistory(true);
    }
  };

  // Fetch ongoing boosts (real-time)
  const fetchOngoingBoosts = (searchTerm: string = "") => {
    if (!user) return;

    setIsLoadingOngoing(true);

    // Cancel existing subscriptions
    subscriptions.forEach((unsubscribe) => unsubscribe());

    const newSubscriptions: Unsubscribe[] = [];
    const now = new Date();

    // Products subscription
    const productQuery = query(
      collection(db, "products"),
      where("userId", "==", user.uid),
      where("boostEndTime", ">", Timestamp.fromDate(now)),
      orderBy("boostEndTime", "desc"),
      limit(ONGOING_BOOST_LIMIT)
    );

    const unsubscribe = onSnapshot(
      productQuery,
      (snapshot) => {
        const items: BoostedItem[] = [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data();

          // Apply search filter
          if (
            searchTerm &&
            !data.productName?.toLowerCase().includes(searchTerm.toLowerCase())
          ) {
            return;
          }

          items.push({
            id: doc.id,
            itemName: data.productName || "Unnamed",
            itemType: "product",
            imageUrls: data.imageUrls || [],
            clickCount: data.clickCount || 0,
            boostedImpressionCount: data.boostedImpressionCount || 0,
            boostImpressionCountAtStart: data.boostImpressionCountAtStart || 0,
            boostClickCountAtStart: data.boostClickCountAtStart || 0,
            boostStartTime: data.boostStartTime,
            boostEndTime: data.boostEndTime,
            price: data.price,
            currency: data.currency || "TL",
            product: {
              id: doc.id,
              productName: data.productName,
              imageUrls: data.imageUrls || [],
              price: data.price || 0,
              currency: data.currency || "TL",
              userId: data.userId,
            },
          });
        });

        setOngoingBoosts(items);
        setIsLoadingOngoing(false);
      },
      (error) => {
        console.error("Error fetching ongoing boosts:", error);
        setIsLoadingOngoing(false);
      }
    );

    newSubscriptions.push(unsubscribe);
    setSubscriptions(newSubscriptions);
  };

  // Fetch past boost history (paginated)
  const fetchPastBoostHistory = async (
    refresh: boolean = false,
    searchTerm: string = ""
  ) => {
    if (!user) return;

    if (refresh) {
      setLastHistoryDoc(null);
      setHasMoreHistory(true);
      setPastBoostHistory([]);
    }

    if (!hasMoreHistory && !refresh) return;

    setIsLoadingHistory(true);

    try {
      const now = Timestamp.fromDate(new Date());

      let historyQuery = query(
        collection(db, "users", user.uid, "boostHistory"),
        where("boostEndTime", "<", now),
        orderBy("boostEndTime", "desc"),
        limit(PAGE_SIZE)
      );

      if (lastHistoryDoc && !refresh) {
        historyQuery = query(
          collection(db, "users", user.uid, "boostHistory"),
          where("boostEndTime", "<", now),
          orderBy("boostEndTime", "desc"),
          startAfter(lastHistoryDoc),
          limit(PAGE_SIZE)
        );
      }

      const snapshot = await getDocs(historyQuery);

      if (snapshot.empty) {
        setHasMoreHistory(false);
      } else {
        const newDocs: PastBoostDoc[] = [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data();

          // Apply search filter
          if (
            searchTerm &&
            !data.itemName?.toLowerCase().includes(searchTerm.toLowerCase())
          ) {
            return;
          }

          newDocs.push({
            docId: doc.id,
            itemId: data.itemId,
            itemName: data.itemName || "Unnamed",
            itemType: data.itemType || "product",
            productImage: data.productImage,
            price: data.price,
            currency: data.currency || "TL",
            impressionsDuringBoost: data.impressionsDuringBoost || 0,
            clicksDuringBoost: data.clicksDuringBoost || 0,
            boostStartTime: data.boostStartTime,
            boostEndTime: data.boostEndTime,
          });
        });

        if (refresh) {
          setPastBoostHistory(newDocs);
        } else {
          // Deduplicate by docId before adding
          setPastBoostHistory((prev) => {
            const existingIds = new Set(prev.map((doc) => doc.docId));
            const uniqueNewDocs = newDocs.filter(
              (doc) => !existingIds.has(doc.docId)
            );
            return [...prev, ...uniqueNewDocs];
          });
        }

        setLastHistoryDoc(snapshot.docs[snapshot.docs.length - 1]);

        if (snapshot.docs.length < PAGE_SIZE) {
          setHasMoreHistory(false);
        }
      }
    } catch (error) {
      console.error("Error fetching past boost history:", error);
      setHasMoreHistory(false);
    } finally {
      setIsLoadingHistory(false);
      setIsLoadingMore(false);
    }
  };

  // Load more past boosts
  const loadMorePastBoosts = () => {
    if (!isLoadingMore && hasMoreHistory) {
      setIsLoadingMore(true);
      fetchPastBoostHistory(false, searchQuery);
    }
  };

  // Handle infinite scroll
  useEffect(() => {
    if (activeTab !== "past") return;

    const handleScroll = () => {
      if (
        window.innerHeight + document.documentElement.scrollTop >=
        document.documentElement.offsetHeight - 100
      ) {
        loadMorePastBoosts();
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeTab, hasMoreHistory, isLoadingMore]);

  // Calculate CTR
  const calculateCTR = (clicks: number, impressions: number): string => {
    if (impressions === 0) return "0.0";
    return ((clicks / impressions) * 100).toFixed(1);
  };

  // Format duration
  const formatDuration = (start?: Timestamp, end?: Timestamp): string => {
    if (!start || !end) return t("unknown");

    const duration = end.toDate().getTime() - start.toDate().getTime();
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Get filtered items
  const filteredOngoingBoosts = useMemo(() => {
    return ongoingBoosts.filter((item) => item.itemType === "product");
  }, [ongoingBoosts]);

  const filteredPastBoosts = useMemo(() => {
    return pastBoostHistory.filter((item) => item.itemType === "product");
  }, [pastBoostHistory]);

  // Tab content components
  const AnalysisTab = () => {
    if (filteredOngoingBoosts.length === 0) {
      return <EmptyState type="analysis" />;
    }

    return (
      <div className="space-y-6">
        {/* Section Header */}
        <div className="p-4 bg-gradient-to-r from-blue-500/10 to-blue-600/10 dark:from-blue-500/20 dark:to-blue-600/20 rounded-xl border border-blue-200 dark:border-blue-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BarChart3 size={20} className="text-blue-600" />
              <h2 className="text-lg font-bold text-blue-600">
                {t("performanceAnalysis")}
              </h2>
            </div>
            <div className="px-3 py-1 bg-blue-600 text-white text-sm font-semibold rounded-full">
              {filteredOngoingBoosts.length}
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredOngoingBoosts.map((item, index) => (
            <BoostChart key={`${item.id}-${index}`} item={item} />
          ))}
        </div>
      </div>
    );
  };

  const OngoingTab = () => {
    if (filteredOngoingBoosts.length === 0) {
      return <EmptyState type="ongoing" />;
    }

    return (
      <div className="space-y-6">
        {/* Section Header */}
        <div className="p-4 bg-gradient-to-r from-green-500/10 to-green-600/10 dark:from-green-500/20 dark:to-green-600/20 rounded-xl border border-green-200 dark:border-green-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TrendingUp size={20} className="text-green-600" />
              <h2 className="text-lg font-bold text-green-600">
                {t("activeBoosts")}
              </h2>
            </div>
            <div className="px-3 py-1 bg-green-600 text-white text-sm font-semibold rounded-full">
              {filteredOngoingBoosts.length}
            </div>
          </div>
        </div>

        {/* Ongoing Boosts List */}
        <div className="space-y-4">
          {filteredOngoingBoosts.map((item, index) => (
            <OngoingBoostCard key={`${item.id}-${index}`} item={item} />
          ))}
        </div>
      </div>
    );
  };

  const PastTab = () => {
    if (filteredPastBoosts.length === 0 && !isLoadingHistory) {
      return <EmptyState type="past" />;
    }

    return (
      <div className="space-y-6">
        {/* Section Header */}
        <div className="p-4 bg-gradient-to-r from-green-500/10 to-green-600/10 dark:from-green-500/20 dark:to-green-600/20 rounded-xl border border-green-200 dark:border-green-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <History size={20} className="text-green-600" />
              <h2 className="text-lg font-bold text-green-600">
                {t("completedBoosts")}
              </h2>
            </div>
            <div className="px-3 py-1 bg-green-600 text-white text-sm font-semibold rounded-full">
              {filteredPastBoosts.length}
            </div>
          </div>
        </div>

        {/* Past Boosts List */}
        <div className="space-y-4">
          {filteredPastBoosts.map((boost, index) => (
            <PastBoostCard key={`${boost.docId}-${index}`} boost={boost} />
          ))}
        </div>

        {/* Loading More Indicator */}
        {isLoadingMore && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          </div>
        )}

        {/* No More Results */}
        {!hasMoreHistory && filteredPastBoosts.length > 0 && (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400">
            {t("noMoreResults")}
          </div>
        )}
      </div>
    );
  };

  // Component: Empty State
  const EmptyState = ({ type }: { type: "analysis" | "ongoing" | "past" }) => {
    const configs = {
      analysis: {
        icon: BarChart3,
        title: t("noOngoingBoosts"),
        description: t("noOngoingBoostsDesc"),
        actionText: t("boostProduct"),
        actionPath: "/boosts",
      },
      ongoing: {
        icon: TrendingUp,
        title: t("noActiveBoosts"),
        description: t("noActiveBoostsDesc"),
        actionText: t("boostProduct"),
        actionPath: "/boosts",
      },
      past: {
        icon: History,
        title: t("noPastBoosts"),
        description: t("noPastBoostsDesc"),
        actionText: null,
        actionPath: null,
      },
    };

    const config = configs[type];

    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <div
          className={`p-8 rounded-full mb-6 ${
            isDarkMode ? "bg-gray-800" : "bg-gray-100"
          }`}
        >
          <config.icon
            size={48}
            className={`${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
          />
        </div>
        <h3
          className={`text-xl font-bold mb-2 ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {config.title}
        </h3>
        <p
          className={`text-center mb-6 max-w-md ${
            isDarkMode ? "text-gray-400" : "text-gray-600"
          }`}
        >
          {config.description}
        </p>
        {config.actionText && (
          <button
            onClick={() => router.push(config.actionPath!)}
            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-semibold hover:from-green-600 hover:to-green-700 transition-all"
          >
            <Zap size={18} />
            <span>{config.actionText}</span>
          </button>
        )}
      </div>
    );
  };

  // Component: Boost Chart
  const BoostChart = ({ item }: { item: BoostedItem }) => {
    const displayedImpressions =
      (item.boostedImpressionCount || 0) -
      (item.boostImpressionCountAtStart || 0);
    const displayedClicks =
      (item.clickCount || 0) - (item.boostClickCountAtStart || 0);
    const ctr = calculateCTR(displayedClicks, displayedImpressions);

    return (
      <div
        className={`rounded-xl border overflow-hidden ${
          isDarkMode
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        {/* Header */}
        <div className={`p-4 ${isDarkMode ? "bg-gray-700" : "bg-gray-50"}`}>
          <h3
            className={`font-bold text-sm line-clamp-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {item.itemName}
          </h3>
          <div className="flex items-center space-x-2 mt-2">
            <MetricPill
              icon={Eye}
              value={displayedImpressions.toString()}
              color={colors.accentCoral}
            />
            <MetricPill
              icon={MousePointer}
              value={displayedClicks.toString()}
              color={colors.primaryGreen}
            />
          </div>
        </div>

        {/* Simple Bar Chart */}
        <div className="p-4">
          <div className="space-y-4">
            <ChartBar
              label={t("impressions")}
              value={displayedImpressions}
              maxValue={Math.max(displayedImpressions, displayedClicks) || 100}
              color={colors.accentCoral}
            />
            <ChartBar
              label={t("clicks")}
              value={displayedClicks}
              maxValue={Math.max(displayedImpressions, displayedClicks) || 100}
              color={colors.primaryGreen}
            />
            <div className="pt-2 border-t dark:border-gray-700">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  CTR
                </span>
                <span className="text-sm font-bold text-blue-600">{ctr}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Component: Chart Bar
  const ChartBar = ({
    label,
    value,
    maxValue,
    color,
  }: {
    label: string;
    value: number;
    maxValue: number;
    color: string;
  }) => {
    const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;

    return (
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {label}
          </span>
          <span className="text-xs font-bold" style={{ color }}>
            {value}
          </span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${percentage}%`,
              backgroundColor: color,
            }}
          />
        </div>
      </div>
    );
  };

  // Component: Metric Pill
  const MetricPill = ({
    icon: Icon,
    value,
    color,
  }: {
    icon: LucideIcon;
    value: string;
    color: string;
  }) => {
    return (
      <div
        className="flex items-center space-x-1 px-2 py-1 rounded-lg border"
        style={{
          backgroundColor: `${color}15`,
          borderColor: `${color}40`,
        }}
      >
        <Icon size={12} style={{ color }} />
        <span className="text-xs font-bold" style={{ color }}>
          {value}
        </span>
      </div>
    );
  };

  // Component: Ongoing Boost Card
  const OngoingBoostCard = ({ item }: { item: BoostedItem }) => {
    const ongoingImpressions =
      item.boostedImpressionCount - item.boostImpressionCountAtStart;
    const ongoingClicks = item.clickCount - (item.boostClickCountAtStart || 0);
    const ongoingCTR = calculateCTR(ongoingClicks, ongoingImpressions);

    return (
      <div
        className={`rounded-xl border overflow-hidden ${
          isDarkMode
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        {/* Product Info */}
        <div className="p-4">
          <div className="flex space-x-4">
            {/* Product Image */}
            <div className="relative w-24 h-24 flex-shrink-0">
              {item.imageUrls && item.imageUrls[0] ? (
                <Image
                  src={item.imageUrls[0]}
                  alt={item.itemName}
                  fill
                  className="object-cover rounded-lg"
                />
              ) : (
                <div
                  className={`w-full h-full rounded-lg flex items-center justify-center ${
                    isDarkMode ? "bg-gray-700" : "bg-gray-100"
                  }`}
                >
                  <Package
                    size={32}
                    className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                  />
                </div>
              )}
            </div>

            {/* Product Details and Timer */}
            <div className="flex-1 space-y-2">
              <h3
                className={`font-bold line-clamp-2 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {item.itemName}
              </h3>

              {/* Price and Rating */}
              <div className="flex items-center space-x-3">
                {item.price && (
                  <div className="px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <span className="text-xs font-semibold text-green-600">
                      {item.price} {item.currency}
                    </span>
                  </div>
                )}
              </div>

              {/* Boost Timer */}
              {item.boostEndTime && (
                <BoostTimer endTime={item.boostEndTime.toDate()} />
              )}
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div
          className={`p-4 border-t ${
            isDarkMode
              ? "bg-gray-700/50 border-gray-700"
              : "bg-gray-50 border-gray-200"
          }`}
        >
          <div className="grid grid-cols-3 gap-3">
            <MetricCard
              icon={Eye}
              label={t("impressions")}
              value={ongoingImpressions.toString()}
              color={colors.accentCoral}
            />
            <MetricCard
              icon={MousePointer}
              label={t("clicks")}
              value={ongoingClicks.toString()}
              color={colors.primaryGreen}
            />
            <MetricCard
              icon={BarChart3}
              label="CTR"
              value={`${ongoingCTR}%`}
              color={colors.blueAccent}
            />
          </div>
        </div>
      </div>
    );
  };

  // Component: Past Boost Card
  const PastBoostCard = ({ boost }: { boost: PastBoostDoc }) => {
    const ctr = calculateCTR(
      boost.clicksDuringBoost,
      boost.impressionsDuringBoost
    );
    const duration = formatDuration(boost.boostStartTime, boost.boostEndTime);

    return (
      <div
        className={`rounded-xl border overflow-hidden ${
          isDarkMode
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        {/* Product Info */}
        <div className="p-4">
          <div className="flex space-x-4">
            {/* Product Image */}
            <div className="relative w-16 h-16 flex-shrink-0">
              {boost.productImage ? (
                <Image
                  src={boost.productImage}
                  alt={boost.itemName}
                  fill
                  className="object-cover rounded-lg"
                />
              ) : (
                <div
                  className={`w-full h-full rounded-lg flex items-center justify-center ${
                    isDarkMode ? "bg-gray-700" : "bg-gray-100"
                  }`}
                >
                  <Package
                    size={24}
                    className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                  />
                </div>
              )}
            </div>

            {/* Product Details */}
            <div className="flex-1 space-y-1">
              <h3
                className={`font-bold text-sm line-clamp-2 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {boost.itemName}
              </h3>

              <div className="flex items-center space-x-3">
                {boost.price && (
                  <div className="px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded">
                    <span className="text-xs font-semibold text-green-600">
                      {boost.price} {boost.currency}
                    </span>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("duration")}: {duration}
              </p>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div
          className={`p-4 border-t ${
            isDarkMode
              ? "bg-gray-700/50 border-gray-700"
              : "bg-gray-50 border-gray-200"
          }`}
        >
          <div className="grid grid-cols-3 gap-3">
            <MetricCard
              icon={Eye}
              label={t("impressions")}
              value={boost.impressionsDuringBoost.toString()}
              color={colors.accentCoral}
              small
            />
            <MetricCard
              icon={MousePointer}
              label={t("clicks")}
              value={boost.clicksDuringBoost.toString()}
              color={colors.primaryGreen}
              small
            />
            <MetricCard
              icon={BarChart3}
              label="CTR"
              value={`${ctr}%`}
              color={colors.blueAccent}
              small
            />
          </div>
        </div>
      </div>
    );
  };

  // Component: Metric Card
  const MetricCard = ({
    icon: Icon,
    label,
    value,
    color,
    small = false,
  }: {
    icon: LucideIcon;
    label: string;
    value: string;
    color: string;
    small?: boolean;
  }) => {
    return (
      <div
        className={`${small ? "p-2" : "p-3"} rounded-lg border text-center`}
        style={{
          backgroundColor: isDarkMode ? "#1F2937" : "white",
          borderColor: `${color}40`,
        }}
      >
        <Icon
          size={small ? 14 : 16}
          style={{ color }}
          className="mx-auto mb-1"
        />
        <div
          className={`${small ? "text-sm" : "text-base"} font-bold`}
          style={{ color }}
        >
          {value}
        </div>
        <div
          className={`${
            small ? "text-xs" : "text-xs"
          } text-gray-500 dark:text-gray-400`}
        >
          {label}
        </div>
      </div>
    );
  };

  // Component: Boost Timer
  const BoostTimer = ({ endTime }: { endTime: Date }) => {
    const [timeLeft, setTimeLeft] = useState("");

    useEffect(() => {
      const updateTimer = () => {
        const now = new Date();
        const diff = endTime.getTime() - now.getTime();

        if (diff <= 0) {
          setTimeLeft(t("expired"));
          return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        setTimeLeft(
          `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        );
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);

      return () => clearInterval(interval);
    }, [endTime]);

    return (
      <div className="inline-flex items-center space-x-1 px-2 py-1 bg-gradient-to-r from-green-500/10 to-green-600/10 border border-green-200 dark:border-green-700 rounded-lg">
        <Clock size={12} className="text-green-600" />
        <span className="text-xs font-mono font-bold text-green-600">
          {timeLeft}
        </span>
      </div>
    );
  };

  // Loading skeleton
  if (isLoadingOngoing && activeTab === "analysis") {
    return (
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className={`h-48 rounded-xl animate-pulse ${
                  isDarkMode ? "bg-gray-800" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 border-b ${
          isDarkMode
            ? "bg-gray-900 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => router.back()}
                  className={`p-2 rounded-lg transition-colors ${
                    isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"
                  }`}
                >
                  <ArrowLeft
                    size={20}
                    className={isDarkMode ? "text-white" : "text-gray-900"}
                  />
                </button>

                <h1
                  className={`text-xl font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("title")}
                </h1>
              </div>

              <button
                onClick={() => setShowDatePicker(true)}
                className={`p-2 rounded-lg border transition-colors ${
                  isDarkMode
                    ? "border-gray-600 hover:bg-gray-800"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                <Calendar
                  size={20}
                  className={isDarkMode ? "text-gray-400" : "text-gray-600"}
                />
              </button>
            </div>

            {/* Search Box */}
            <div className="mb-4">
              <div
                className={`relative rounded-xl border ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <Search
                  size={18}
                  className={`absolute left-4 top-1/2 -translate-y-1/2 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder={t("searchProducts")}
                  className={`w-full pl-12 pr-12 py-3 bg-transparent outline-none text-sm ${
                    isDarkMode
                      ? "text-white placeholder-gray-500"
                      : "text-gray-900 placeholder-gray-400"
                  }`}
                />
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className={`absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors ${
                      isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                    }`}
                  >
                    <X
                      size={16}
                      className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                    />
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div
              className={`flex space-x-1 p-1 rounded-xl ${
                isDarkMode ? "bg-gray-800" : "bg-gray-100"
              }`}
            >
              {[
                {
                  id: "analysis" as const,
                  label: t("analysis"),
                  icon: BarChart3,
                },
                {
                  id: "ongoing" as const,
                  label: t("ongoingBoosts"),
                  icon: TrendingUp,
                },
                { id: "past" as const, label: t("pastBoosts"), icon: History },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                    activeTab === tab.id
                      ? "bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg"
                      : isDarkMode
                      ? "text-gray-400 hover:text-white hover:bg-gray-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-white"
                  }`}
                >
                  <tab.icon size={16} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "analysis" && <AnalysisTab />}
        {activeTab === "ongoing" && <OngoingTab />}
        {activeTab === "past" && <PastTab />}
      </div>
    </div>
  );
}
