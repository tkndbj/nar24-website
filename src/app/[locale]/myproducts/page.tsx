"use client";

import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Search,
  Package,
  Edit,
  Trash2,
  Zap,
  Info,
  Plus,
  Calendar,
  X,
  TrendingUp,
  Heart,
  ShoppingCart,
  Eye,
  Star,
  Clock,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  where,
  orderBy,
  doc,
  deleteDoc,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslations } from "next-intl";
import Image from "next/image";

// Types
interface Product {
  id: string;
  productName: string;
  imageUrls: string[];
  price: number;
  currency: string;
  brandModel?: string;
  averageRating?: number;
  clickCount?: number;
  cartCount?: number;
  favoritesCount?: number;
  createdAt: Timestamp;
  isBoosted?: boolean;
  boostEndTime?: Timestamp;
}

interface DateRange {
  start: Date;
  end: Date;
}

export default function MyProductsPage() {
  const router = useRouter();
  const { user } = useUser();
  const t = useTranslations("MyProducts");

  // State
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange | null>(
    null
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState<string | null>(
    null
  );

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

  // Load products when user is available
  useEffect(() => {
    if (user) {
      const unsubscribe = loadProducts();
      return unsubscribe;
    }
  }, [user]);

  // Filter products based on search and date range
  useEffect(() => {
    let filtered = products;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (product) =>
          product.productName.toLowerCase().includes(query) ||
          (product.brandModel?.toLowerCase() || "").includes(query)
      );
    }

    // Apply date range filter
    if (selectedDateRange) {
      filtered = filtered.filter((product) => {
        const createdDate = product.createdAt.toDate();
        return (
          createdDate >= selectedDateRange.start &&
          createdDate <= selectedDateRange.end
        );
      });
    }

    setFilteredProducts(filtered);
  }, [products, searchQuery, selectedDateRange]);

  const loadProducts = () => {
    if (!user) return () => {};

    const q = query(
      collection(db, "products"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedProducts: Product[] = [];
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          loadedProducts.push({
            id: doc.id,
            productName: data.productName || "",
            imageUrls: data.imageUrls || [],
            price: data.price || 0,
            currency: data.currency || "TRY",
            brandModel: data.brandModel,
            averageRating: data.averageRating,
            clickCount: data.clickCount,
            cartCount: data.cartCount,
            favoritesCount: data.favoritesCount,
            createdAt: data.createdAt,
            isBoosted: data.isBoosted,
            boostEndTime: data.boostEndTime,
          });
        });
        setProducts(loadedProducts);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading products:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  };

  const handleDeleteProduct = async (productId: string) => {
    if (
      !confirm(
        t("confirmDelete") || "Are you sure you want to delete this product?"
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, "products", productId));
      // Products will be automatically updated via the listener
    } catch (error) {
      console.error("Error deleting product:", error);
      alert(t("deleteError") || "Error deleting product");
    }
  };

  const clearDateRange = () => {
    setSelectedDateRange(null);
    setShowDatePicker(false);
  };

  const formatDateRange = (range: DateRange) => {
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
    };
    return `${range.start.toLocaleDateString(
      "tr-TR",
      options
    )} - ${range.end.toLocaleDateString("tr-TR", options)}`;
  };

  // Boost countdown component
  const BoostCountdown = ({ endTime }: { endTime: Date }) => {
    const [timeRemaining, setTimeRemaining] = useState("");

    useEffect(() => {
      const updateCountdown = () => {
        const now = new Date();
        const diff = endTime.getTime() - now.getTime();

        if (diff <= 0) {
          setTimeRemaining("00:00:00");
          return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        setTimeRemaining(
          `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        );
      };

      updateCountdown();
      const interval = setInterval(updateCountdown, 1000);
      return () => clearInterval(interval);
    }, [endTime]);

    if (timeRemaining === "00:00:00") return null;

    return (
      <div className="inline-flex items-center px-2 sm:px-3 py-1 sm:py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full shadow-lg">
        <Zap size={10} className="sm:size-3 mr-1 animate-pulse" />
        <span className="text-xs sm:text-xs font-bold">
          {t("boosted")}: {timeRemaining}
        </span>
      </div>
    );
  };

  // Product card component
  const ProductCard = ({ product }: { product: Product }) => {
    const isExpanded = expandedProductId === product.id;
    const isBoosted = product.isBoosted && product.boostEndTime;

    return (
      <div
        className={`group relative rounded-xl sm:rounded-2xl border transition-all duration-300 overflow-hidden hover:shadow-xl hover:scale-[1.02] ${
          isBoosted
            ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 dark:border-emerald-700"
            : isDarkMode
            ? "bg-gray-800 border-gray-700 hover:border-gray-600"
            : "bg-white border-gray-200 hover:border-gray-300"
        } ${isExpanded ? "shadow-2xl scale-[1.02]" : ""}`}
      >
        {/* Boost Glow Effect */}
        {isBoosted && (
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/10 to-teal-400/10 animate-pulse" />
        )}

        {/* Main product content */}
        <div className="relative">
          <div
            className="flex p-3 sm:p-6 cursor-pointer"
            onClick={() => router.push(`/product/${product.id}`)}
          >
            {/* Product Image */}
            <div className="relative w-16 h-16 sm:w-24 sm:h-24 flex-shrink-0 mr-3 sm:mr-6">
              {product.imageUrls.length > 0 ? (
                <div className="relative w-full h-full rounded-lg sm:rounded-xl overflow-hidden shadow-lg">
                  <Image
                    src={product.imageUrls[0]}
                    alt={product.productName}
                    fill
                    className="object-cover transition-transform group-hover:scale-110"
                  />
                  {isBoosted && (
                    <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/20 to-transparent" />
                  )}
                </div>
              ) : (
                <div
                  className={`w-full h-full rounded-lg sm:rounded-xl flex items-center justify-center border-2 border-dashed transition-colors ${
                    isDarkMode
                      ? "bg-gray-700 border-gray-600"
                      : "bg-gray-100 border-gray-300"
                  }`}
                >
                  <Package
                    size={20}
                    className={`sm:size-7 ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  />
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between mb-1 sm:mb-2">
                <h3
                  className={`text-sm sm:text-xl font-bold line-clamp-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {product.productName}
                </h3>
                {isBoosted && (
                  <div className="ml-2 flex-shrink-0">
                    <BoostCountdown endTime={product.boostEndTime!.toDate()} />
                  </div>
                )}
              </div>

              {product.brandModel && (
                <p
                  className={`text-xs sm:text-sm mb-2 sm:mb-3 font-medium ${
                    isDarkMode ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  {product.brandModel}
                </p>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
                <div className="flex items-center space-x-2 sm:space-x-4">
                  <div className="bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
                    <span className="text-lg sm:text-2xl font-bold">
                      {product.price.toFixed(2)} {product.currency}
                    </span>
                  </div>

                  {product.averageRating && (
                    <div className="flex items-center space-x-1 bg-amber-100 dark:bg-amber-900/30 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                      <Star
                        size={10}
                        className="sm:size-3.5 text-amber-500 fill-current"
                      />
                      <span className="text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-300">
                        {product.averageRating.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Quick Stats */}
                <div className="flex items-center space-x-2 sm:space-x-3 text-xs sm:text-sm">
                  <div className="flex items-center space-x-1 text-blue-600">
                    <Eye size={10} className="sm:size-3.5" />
                    <span className="font-semibold">
                      {product.clickCount || 0}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 text-red-500">
                    <Heart size={10} className="sm:size-3.5" />
                    <span className="font-semibold">
                      {product.favoritesCount || 0}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1 text-green-600">
                    <ShoppingCart size={10} className="sm:size-3.5" />
                    <span className="font-semibold">
                      {product.cartCount || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="absolute top-2 sm:top-4 right-2 sm:right-4 flex space-x-1 sm:space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpandedProductId(isExpanded ? null : product.id);
              }}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white flex items-center justify-center hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl"
            >
              <Info size={12} className="sm:size-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/edit-product/${product.id}`);
              }}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white flex items-center justify-center hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg hover:shadow-xl"
            >
              <Edit size={12} className="sm:size-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/boost?productId=${product.id}`);
              }}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex items-center justify-center hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg hover:shadow-xl"
            >
              <Zap size={12} className="sm:size-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteProduct(product.id);
              }}
              className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-r from-red-500 to-pink-500 text-white flex items-center justify-center hover:from-red-600 hover:to-pink-600 transition-all shadow-lg hover:shadow-xl"
            >
              <Trash2 size={12} className="sm:size-4" />
            </button>
          </div>
        </div>

        {/* Expanded Stats */}
        {isExpanded && (
          <div
            className={`border-t backdrop-blur-sm ${
              isDarkMode
                ? "border-gray-700 bg-gray-800/80"
                : "border-gray-200 bg-white/80"
            }`}
          >
            <div className="p-3 sm:p-6">
              <div className="flex justify-between items-center mb-3 sm:mb-6">
                <div className="flex items-center space-x-2">
                  <TrendingUp size={16} className="sm:size-5 text-purple-500" />
                  <h4
                    className={`text-base sm:text-lg font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent`}
                  >
                    {t("productStats") || "Product Statistics"}
                  </h4>
                </div>
                <button
                  onClick={() => setExpandedProductId(null)}
                  className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    isDarkMode ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  <X size={14} className="sm:size-4.5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:gap-6">
                {[
                  {
                    label: t("clicks") || "Clicks",
                    value: product.clickCount || 0,
                    icon: Eye,
                    color: "from-blue-500 to-cyan-500",
                    bgColor:
                      "from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20",
                  },
                  {
                    label: t("addedToCart") || "Added to Cart",
                    value: product.cartCount || 0,
                    icon: ShoppingCart,
                    color: "from-emerald-500 to-teal-500",
                    bgColor:
                      "from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20",
                  },
                  {
                    label: t("favorites") || "Favorites",
                    value: product.favoritesCount || 0,
                    icon: Heart,
                    color: "from-pink-500 to-rose-500",
                    bgColor:
                      "from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20",
                  },
                ].map((stat, index) => (
                  <div
                    key={index}
                    className={`relative p-2 sm:p-4 rounded-xl sm:rounded-2xl bg-gradient-to-br ${stat.bgColor} border border-white/20 shadow-lg`}
                  >
                    <div className="flex items-center justify-between mb-1 sm:mb-2">
                      <div
                        className={`w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-gradient-to-r ${stat.color} flex items-center justify-center`}
                      >
                        <stat.icon size={12} className="sm:size-4 text-white" />
                      </div>
                    </div>
                    <div
                      className={`text-lg sm:text-2xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}
                    >
                      {stat.value}
                    </div>
                    <div
                      className={`text-xs sm:text-sm font-medium mt-1 ${
                        isDarkMode ? "text-gray-300" : "text-gray-600"
                      }`}
                    >
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Creation Date */}
              <div className="mt-3 sm:mt-6 pt-3 sm:pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-2 text-xs sm:text-sm">
                  <Clock size={12} className="sm:size-4 text-gray-500" />
                  <span
                    className={isDarkMode ? "text-gray-300" : "text-gray-600"}
                  >
                    Created: {product.createdAt.toDate().toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Loading skeleton
  const LoadingSkeleton = () => (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-4">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`animate-pulse rounded-xl sm:rounded-2xl h-24 sm:h-32 bg-gradient-to-r ${
            isDarkMode
              ? "from-gray-800 to-gray-700"
              : "from-gray-200 to-gray-100"
          }`}
        />
      ))}
    </div>
  );

  // Not logged in state
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-2 sm:p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center bg-white dark:bg-gray-800 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl border border-gray-200 dark:border-gray-700 mx-4 max-w-sm sm:max-w-none">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl sm:rounded-2xl flex items-center justify-center">
            <Package size={32} className="sm:size-10 text-white" />
          </div>
          <h2 className="text-lg sm:text-2xl font-bold mb-2 sm:mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            {t("loginRequired") || "Login Required"}
          </h2>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-4 sm:mb-6">
            {t("loginToViewProducts") || "Please login to view your products"}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="px-6 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg sm:rounded-xl hover:from-blue-600 hover:to-purple-600 transition-all shadow-lg hover:shadow-xl font-semibold text-sm sm:text-base"
          >
            {t("login") || "Login"}
          </button>
        </div>
      </div>
    );
  }

  if (loading) return <LoadingSkeleton />;

  return (
    <div
      className={`min-h-screen ${
        isDarkMode
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
          : "bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50"
      }`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 border-b backdrop-blur-xl ${
          isDarkMode
            ? "bg-gray-900/80 border-gray-700"
            : "bg-white/80 border-gray-200"
        }`}
      >
        <div className="px-2 sm:px-4 lg:px-8 py-2 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <button
                onClick={() => router.back()}
                className={`p-2 sm:p-3 rounded-lg sm:rounded-xl transition-all hover:scale-105 ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-white"
                    : "hover:bg-gray-100 text-gray-900"
                }`}
              >
                <ArrowLeft size={16} className="sm:size-5" />
              </button>
              <h1
                className={`text-lg sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent`}
              >
                {t("myProducts") || "My Products"}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-2 sm:px-4 lg:px-8 py-4 sm:py-8">
        {/* Search and Filter Bar */}
        <div className="mb-4 sm:mb-8 space-y-3 sm:space-y-6">
          {/* Search */}
          <div className="relative">
            <Search
              size={16}
              className="sm:size-5 absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder={t("searchProducts") || "Search products..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 sm:pl-12 pr-3 sm:pr-4 py-3 sm:py-4 rounded-xl sm:rounded-2xl border-2 transition-all focus:scale-[1.02] text-sm sm:text-base ${
                isDarkMode
                  ? "bg-gray-800/50 border-gray-700 text-white placeholder-gray-400 focus:border-blue-500"
                  : "bg-white/70 border-gray-200 text-gray-900 placeholder-gray-500 focus:border-blue-500"
              } focus:ring-4 focus:ring-blue-200 dark:focus:ring-blue-800 backdrop-blur-sm shadow-lg`}
            />
          </div>

          {/* Date Range Filter */}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl border-2 transition-all hover:scale-105 text-sm sm:text-base ${
                selectedDateRange
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-transparent shadow-lg"
                  : isDarkMode
                  ? "border-gray-600 text-gray-300 hover:bg-gray-800 bg-gray-800/50"
                  : "border-gray-300 text-gray-700 hover:bg-white bg-white/70"
              } backdrop-blur-sm`}
            >
              <Calendar size={14} className="sm:size-4.5" />
              <span className="font-semibold">
                {selectedDateRange
                  ? formatDateRange(selectedDateRange)
                  : t("filterByDate") || "Filter by Date"}
              </span>
            </button>

            {selectedDateRange && (
              <button
                onClick={clearDateRange}
                className="flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm bg-red-100 dark:bg-red-900/30 text-red-600 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-xl sm:rounded-2xl transition-all hover:scale-105 font-semibold"
              >
                <X size={12} className="sm:size-4" />
                <span>{t("clear") || "Clear"}</span>
              </button>
            )}
          </div>

          {/* Quick date range buttons */}
          {showDatePicker && (
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {[
                {
                  label: t("last7Days") || "Last 7 Days",
                  days: 7,
                  color: "from-blue-500 to-cyan-500",
                },
                {
                  label: t("last30Days") || "Last 30 Days",
                  days: 30,
                  color: "from-purple-500 to-pink-500",
                },
                {
                  label: t("last90Days") || "Last 90 Days",
                  days: 90,
                  color: "from-orange-500 to-red-500",
                },
              ].map((range) => (
                <button
                  key={range.days}
                  onClick={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(start.getDate() - range.days);
                    setSelectedDateRange({ start, end });
                    setShowDatePicker(false);
                  }}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg sm:rounded-xl bg-gradient-to-r ${range.color} text-white hover:scale-105 transition-all shadow-lg font-semibold`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Products Grid */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-8 sm:py-16">
            <div className="w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-4 sm:mb-8 bg-gradient-to-r from-gray-300 to-gray-400 rounded-2xl sm:rounded-3xl flex items-center justify-center">
              <Package size={48} className="sm:size-16 text-white" />
            </div>
            <h3
              className={`text-xl sm:text-2xl font-bold mb-2 sm:mb-4 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {searchQuery || selectedDateRange
                ? t("noProductsFound") || "No products found"
                : t("noProducts") || "No products yet"}
            </h3>
            <p
              className={`mb-4 sm:mb-8 text-base sm:text-lg px-4 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {searchQuery || selectedDateRange
                ? t("tryDifferentSearch") ||
                  "Try adjusting your search or filters"
                : t("startSelling") ||
                  "Start selling by adding your first product"}
            </p>
            {!searchQuery && !selectedDateRange && (
              <button
                onClick={() => router.push("/list-product")}
                className="inline-flex items-center space-x-2 sm:space-x-3 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl sm:rounded-2xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg hover:shadow-xl hover:scale-105 font-semibold text-sm sm:text-lg"
              >
                <Plus size={20} className="sm:size-6" />
                <span>{t("addProduct") || "Add Product"}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-6">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {/* Add Product Button */}
        {filteredProducts.length > 0 && (
          <div className="fixed bottom-4 sm:bottom-8 right-4 sm:right-8">
            <button
              onClick={() => router.push("/list-product")}
              className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl sm:rounded-2xl shadow-2xl hover:from-emerald-600 hover:to-teal-600 transition-all flex items-center justify-center hover:scale-110 group"
            >
              <Plus
                size={20}
                className="sm:size-7 group-hover:rotate-90 transition-transform"
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
