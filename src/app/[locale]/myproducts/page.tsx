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
  Clock,
} from "lucide-react";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  where,
  orderBy,
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
  const { user, isLoading: authLoading } = useUser();
  const t = useTranslations("MyProducts");

  // State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange | null>(
    null
  );
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [, setDeletingProductId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
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

  // Redirect if not authenticated (only after auth state is determined)
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

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

  // Confirmation Modal Component
  const ConfirmDeleteModal = ({ productId }: { productId: string }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className={`w-full max-w-md rounded-2xl p-6 shadow-2xl ${
          isDarkMode ? "bg-gray-800" : "bg-white"
        }`}
      >
        <div className="flex flex-col items-center space-y-4">
          {/* Warning Icon */}
          <div className="relative">
            <div className="w-16 h-16 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center">
              <Trash2 size={32} className="text-white" />
            </div>
          </div>

          {/* Text */}
          <div className="text-center space-y-2">
            <h3
              className={`text-xl font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("confirmDelete") || "Delete Product?"}
            </h3>
            <p
              className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {t("confirmDeleteMessage") ||
                "Are you sure you want to delete this product? This action cannot be undone."}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 w-full">
            <button
              onClick={() => {
                setShowConfirmModal(false);
                setProductToDelete(null);
              }}
              className={`flex-1 px-4 py-3 rounded-xl font-semibold transition-all ${
                isDarkMode
                  ? "bg-gray-700 text-white hover:bg-gray-600"
                  : "bg-gray-200 text-gray-900 hover:bg-gray-300"
              }`}
            >
              {t("cancel") || "Cancel"}
            </button>
            <button
              onClick={async () => {
                setShowConfirmModal(false);
                setDeletingProductId(productId);
                setShowDeleteModal(true);

                try {
                  const functions = getFunctions(undefined, "europe-west3");
                  const deleteProduct = httpsCallable(
                    functions,
                    "deleteProduct"
                  );

                  await deleteProduct({ productId });

                  setShowDeleteModal(false);
                  setDeletingProductId(null);
                  setProductToDelete(null);

                  // Success toast (you can customize this)
                  alert(t("productDeleted") || "Product deleted successfully!");
                } catch (error: unknown) {
                  console.error("Error deleting product:", error);
                  setShowDeleteModal(false);
                  setDeletingProductId(null);
                  alert(
                    error instanceof Error
                      ? error.message
                      : t("deleteError") || "Error deleting product"
                  );
                }
              }}
              className="flex-1 px-4 py-3 rounded-xl font-semibold bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 transition-all shadow-lg hover:shadow-xl"
            >
              {t("delete") || "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Deleting Modal Component
  const DeletingModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className={`w-full max-w-sm rounded-2xl p-6 shadow-2xl ${
          isDarkMode ? "bg-gray-800" : "bg-white"
        }`}
      >
        <div className="flex flex-col items-center space-y-4">
          {/* Animated Delete Icon */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-red-600 rounded-full animate-ping opacity-75" />
            <div className="relative w-16 h-16 bg-gradient-to-r from-red-500 to-red-600 rounded-full flex items-center justify-center animate-spin">
              <Trash2 size={32} className="text-white" />
            </div>
          </div>

          {/* Text */}
          <div className="text-center space-y-2">
            <h3
              className={`text-xl font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("deletingProduct") || "Deleting Product"}
            </h3>
            <p
              className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {t("deletingProductDesc") ||
                "Please wait while we remove your product..."}
            </p>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-red-500 to-red-600 rounded-full animate-progress" />
          </div>
        </div>
      </div>
    </div>
  );

  const handleDeleteProduct = (productId: string) => {
    setProductToDelete(productId);
    setShowConfirmModal(true);
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
      <div className="inline-flex items-center px-2 py-0.5 sm:py-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full shadow-sm">
        <Zap size={10} className="mr-1 animate-pulse" />
        <span className="text-[10px] sm:text-xs font-semibold">
          {timeRemaining}
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
        className={`group relative rounded-lg border transition-all duration-200 overflow-hidden hover:shadow-lg ${
          isBoosted
            ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 dark:border-emerald-600"
            : isDarkMode
            ? "bg-gray-800 border-gray-700 hover:border-gray-600"
            : "bg-white border-gray-200 hover:border-gray-300"
        } ${isExpanded ? "shadow-xl" : ""}`}
      >
        {/* Boost Glow Effect */}
        {isBoosted && (
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/10 to-teal-400/10 animate-pulse" />
        )}

        {/* Main product content */}
        <div className="relative">
          <div
            className="flex p-3 sm:p-4 cursor-pointer"
            onClick={() => router.push(`/productdetail/${product.id}`)}
          >
            {/* Product Image */}
            <div className="relative w-14 h-14 sm:w-20 sm:h-20 flex-shrink-0 mr-3 sm:mr-4">
              {product.imageUrls.length > 0 ? (
                <div className="relative w-full h-full rounded-lg overflow-hidden">
                  <Image
                    src={product.imageUrls[0]}
                    alt={product.productName}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                  />
                  {isBoosted && (
                    <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/20 to-transparent" />
                  )}
                </div>
              ) : (
                <div
                  className={`w-full h-full rounded-lg flex items-center justify-center border border-dashed ${
                    isDarkMode
                      ? "bg-gray-700 border-gray-600"
                      : "bg-gray-100 border-gray-300"
                  }`}
                >
                  <Package
                    size={18}
                    className={`sm:size-6 ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  />
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between mb-1">
                <h3
                  className={`text-sm sm:text-base font-semibold line-clamp-2 ${
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
                  className={`text-xs mb-1.5 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  {product.brandModel}
                </p>
              )}

              <div className="space-y-1.5">
                <div className={isDarkMode ? "" : "bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"}>
                  <span className={`text-sm sm:text-base font-bold ${isDarkMode ? "text-blue-300" : ""}`}>
                    {product.price.toFixed(2)} {product.currency}
                  </span>
                </div>

                {/* Quick Stats and Actions Row */}
                <div className="flex items-center justify-between">
                  {/* Quick Stats */}
                  <div className="flex items-center space-x-2 sm:space-x-3 text-xs">
                    <div className="flex items-center space-x-1 text-blue-600 dark:text-blue-400">
                      <Eye size={12} className="sm:size-3.5" />
                      <span className="font-medium">
                        {product.clickCount || 0}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1 text-red-500 dark:text-red-400">
                      <Heart size={12} className="sm:size-3.5" />
                      <span className="font-medium">
                        {product.favoritesCount || 0}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1 text-green-600 dark:text-green-400">
                      <ShoppingCart size={12} className="sm:size-3.5" />
                      <span className="font-medium">
                        {product.cartCount || 0}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons - Always Visible */}
                  <div className="flex space-x-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedProductId(isExpanded ? null : product.id);
                      }}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors"
                    >
                      <Info size={12} className="sm:size-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/edit-product/${product.id}`);
                      }}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-amber-500 text-white flex items-center justify-center hover:bg-amber-600 transition-colors"
                    >
                      <Edit size={12} className="sm:size-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/boost?productId=${product.id}`);
                      }}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-colors"
                    >
                      <Zap size={12} className="sm:size-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProduct(product.id);
                      }}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <Trash2 size={12} className="sm:size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Expanded Stats */}
        {isExpanded && (
          <div
            className={`border-t ${
              isDarkMode
                ? "border-gray-700 bg-gray-800/90"
                : "border-gray-200 bg-gray-50"
            }`}
          >
            <div className="p-3 sm:p-4">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center space-x-2">
                  <TrendingUp size={14} className="sm:size-4 text-purple-500" />
                  <h4
                    className={`text-sm sm:text-base font-semibold ${
                      isDarkMode ? "text-gray-200" : "text-gray-700"
                    }`}
                  >
                    {t("productStats") || "Product Statistics"}
                  </h4>
                </div>
                <button
                  onClick={() => setExpandedProductId(null)}
                  className={`p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  <X size={14} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
                    className={`relative p-2 sm:p-3 rounded-lg bg-gradient-to-br ${
                      stat.bgColor
                    } border ${
                      isDarkMode ? "border-gray-700" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div
                        className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-gradient-to-r ${stat.color} flex items-center justify-center`}
                      >
                        <stat.icon
                          size={12}
                          className="sm:size-3.5 text-white"
                        />
                      </div>
                    </div>
                    <div
                      className={`text-base sm:text-xl font-bold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {stat.value}
                    </div>
                    <div
                      className={`text-xs font-medium mt-0.5 ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Creation Date */}
              <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-1.5 text-xs">
                  <Clock size={12} className="text-gray-400" />
                  <span
                    className={isDarkMode ? "text-gray-400" : "text-gray-500"}
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
    <div className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6">
        <div className="space-y-2 sm:space-y-3 p-3 sm:p-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className={`animate-pulse rounded-lg h-20 sm:h-24 ${
                isDarkMode ? "bg-gray-800" : "bg-gray-200"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );

  // Show loading skeleton while auth state is being determined
  if (authLoading || loading) {
    return <LoadingSkeleton />;
  }

  // Not logged in state (only shown after auth loading is complete)
  if (!user) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-2 sm:p-4 ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
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

  return (
    <div
      className={`min-h-screen ${
        isDarkMode
          ? "bg-gray-900"
          : "bg-gray-50"
      }`}
      style={{
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        WebkitFontSmoothing: 'antialiased'
      }}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 border-b ${
          isDarkMode
            ? "bg-gray-800 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-2 sm:py-3">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={() => router.back()}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                isDarkMode
                  ? "hover:bg-gray-800 text-gray-300"
                  : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <ArrowLeft size={18} className="sm:size-5" />
            </button>
            <h1
              className={`text-base sm:text-xl font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("myProducts") || "My Products"}
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
        {/* Search and Filter Bar */}
        <div className="mb-3 sm:mb-4 space-y-2 sm:space-y-3">
          {/* Search */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder={t("searchProducts") || "Search products..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-3 py-2.5 sm:py-3 rounded-lg border transition-colors text-sm ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700 text-white placeholder-gray-400 focus:border-blue-500"
                  : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500"
              } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
            />
          </div>

          {/* Date Range Filter */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
                selectedDateRange
                  ? "bg-emerald-500 text-white border-emerald-500"
                  : isDarkMode
                  ? "border-gray-600 text-gray-300 hover:bg-gray-800 bg-gray-800"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
              }`}
            >
              <Calendar size={14} />
              <span className="font-medium">
                {selectedDateRange
                  ? formatDateRange(selectedDateRange)
                  : t("filterByDate") || "Filter by Date"}
              </span>
            </button>

            {selectedDateRange && (
              <button
                onClick={clearDateRange}
                className="flex items-center space-x-1 px-3 py-2 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-lg transition-colors font-medium"
              >
                <X size={12} />
                <span>{t("clear") || "Clear"}</span>
              </button>
            )}
          </div>

          {/* Quick date range buttons */}
          {showDatePicker && (
            <div className="flex flex-wrap gap-2">
              {[
                {
                  label: t("last7Days") || "Last 7 Days",
                  days: 7,
                },
                {
                  label: t("last30Days") || "Last 30 Days",
                  days: 30,
                },
                {
                  label: t("last90Days") || "Last 90 Days",
                  days: 90,
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
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors font-medium ${
                    isDarkMode
                      ? "border-gray-600 text-gray-300 hover:bg-gray-800 bg-gray-800"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50 bg-white"
                  }`}
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
                onClick={() => router.push("/listproduct")}
                className="inline-flex items-center space-x-2 sm:space-x-3 px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl sm:rounded-2xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg hover:shadow-xl hover:scale-105 font-semibold text-sm sm:text-lg"
              >
                <Plus size={20} className="sm:size-6" />
                <span>{t("addProduct") || "Add Product"}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        {/* Add Product Button */}
        {filteredProducts.length > 0 && (
          <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6">
            <button
              onClick={() => router.push("/listproduct")}
              className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl shadow-xl hover:shadow-2xl hover:from-emerald-600 hover:to-teal-600 transition-all flex items-center justify-center hover:scale-105 group"
            >
              <Plus
                size={20}
                className="sm:size-6 group-hover:rotate-90 transition-transform"
              />
            </button>
          </div>
        )}

        {/* Delete Modal */}
        {showDeleteModal && <DeletingModal />}

        {/* Confirm Delete Modal */}
        {showConfirmModal && productToDelete && (
          <ConfirmDeleteModal productId={productToDelete} />
        )}
      </div>
    </div>
  );
}
