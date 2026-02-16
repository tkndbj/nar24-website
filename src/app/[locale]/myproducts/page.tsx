"use client";

import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Search,
  Package,
  Edit,
  Trash2,
  Zap,
  Plus,
  Calendar,
  X,
  Archive,
  Heart,
  ShoppingCart,
  Eye,
  Clock,
  MoreHorizontal,
  ChevronDown,
  BarChart3,
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

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
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
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    const check = () =>
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      const unsub = loadProducts();
      return unsub;
    }
  }, [user]);

  useEffect(() => {
    let filtered = products;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          (p.brandModel?.toLowerCase() || "").includes(q)
      );
    }
    if (selectedDateRange) {
      filtered = filtered.filter((p) => {
        const d = p.createdAt.toDate();
        return d >= selectedDateRange.start && d <= selectedDateRange.end;
      });
    }
    setFilteredProducts(filtered);
  }, [products, searchQuery, selectedDateRange]);

  // Close menus on outside click
  useEffect(() => {
    const handler = () => setActiveMenu(null);
    if (activeMenu) {
      document.addEventListener("click", handler);
      return () => document.removeEventListener("click", handler);
    }
  }, [activeMenu]);

  const loadProducts = () => {
    if (!user) return () => {};
    const q = query(
      collection(db, "products"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const loaded: Product[] = snap.docs.map((doc) => {
          const d = doc.data();
          return {
            id: doc.id,
            productName: d.productName || "",
            imageUrls: d.imageUrls || [],
            price: d.price || 0,
            currency: d.currency || "TRY",
            brandModel: d.brandModel,
            averageRating: d.averageRating,
            clickCount: d.clickCount,
            cartCount: d.cartCount,
            favoritesCount: d.favoritesCount,
            createdAt: d.createdAt,
            isBoosted: d.isBoosted,
            boostEndTime: d.boostEndTime,
          };
        });
        setProducts(loaded);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  };

  const handleDeleteProduct = (productId: string) => {
    setProductToDelete(productId);
    setShowConfirmModal(true);
  };

  const executeDelete = async (productId: string) => {
    setShowConfirmModal(false);
    setDeletingProductId(productId);
    setShowDeleteModal(true);
    try {
      const functions = getFunctions(undefined, "europe-west3");
      const deleteProduct = httpsCallable(functions, "deleteProduct");
      await deleteProduct({ productId });
      setShowDeleteModal(false);
      setDeletingProductId(null);
      setProductToDelete(null);
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
  };

  const formatDateRange = (range: DateRange) => {
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${range.start.toLocaleDateString("tr-TR", opts)} - ${range.end.toLocaleDateString("tr-TR", opts)}`;
  };

  // --- Sub-components ---

  const BoostBadge = ({ endTime }: { endTime: Date }) => {
    const [remaining, setRemaining] = useState("");
    useEffect(() => {
      const tick = () => {
        const diff = endTime.getTime() - Date.now();
        if (diff <= 0) {
          setRemaining("");
          return;
        }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setRemaining(
          `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
        );
      };
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }, [endTime]);

    if (!remaining) return null;
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md border border-emerald-500/20">
        <Zap size={10} className="animate-pulse" />
        {remaining}
      </span>
    );
  };

  const ProductRow = ({ product }: { product: Product }) => {
    const isBoosted = product.isBoosted && product.boostEndTime;
    const isExpanded = expandedProductId === product.id;
    const isMenuOpen = activeMenu === product.id;

    return (
      <div
        className={`group relative rounded-xl border transition-all duration-200 ${
          isBoosted
            ? isDarkMode
              ? "border-emerald-700/50 bg-emerald-950/20"
              : "border-emerald-200 bg-emerald-50/50"
            : isDarkMode
              ? "border-gray-800 bg-gray-900 hover:border-gray-700"
              : "border-gray-200 bg-white hover:border-gray-300"
        } ${isExpanded ? (isDarkMode ? "border-gray-600" : "border-gray-300 shadow-sm") : ""}`}
      >
        {/* Main Row */}
        <div className="flex items-center gap-3 p-3">
          {/* Image */}
          <div
            className="relative w-12 h-12 sm:w-14 sm:h-14 flex-shrink-0 rounded-lg overflow-hidden cursor-pointer"
            onClick={() => router.push(`/productdetail/${product.id}`)}
          >
            {product.imageUrls.length > 0 ? (
              <Image
                src={product.imageUrls[0]}
                alt={product.productName}
                fill
                className="object-cover"
              />
            ) : (
              <div
                className={`w-full h-full flex items-center justify-center ${
                  isDarkMode ? "bg-gray-800" : "bg-gray-100"
                }`}
              >
                <Package
                  size={20}
                  className={isDarkMode ? "text-gray-600" : "text-gray-400"}
                />
              </div>
            )}
          </div>

          {/* Info */}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => router.push(`/productdetail/${product.id}`)}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <h3
                className={`text-sm font-semibold truncate ${
                  isDarkMode ? "text-gray-100" : "text-gray-900"
                }`}
              >
                {product.productName}
              </h3>
              {isBoosted && (
                <BoostBadge endTime={product.boostEndTime!.toDate()} />
              )}
            </div>
            {product.brandModel && (
              <p
                className={`text-xs truncate mb-1 ${
                  isDarkMode ? "text-gray-500" : "text-gray-500"
                }`}
              >
                {product.brandModel}
              </p>
            )}
            <div className="flex items-center gap-3">
              <span
                className={`text-sm font-bold ${
                  isDarkMode ? "text-orange-400" : "text-orange-600"
                }`}
              >
                {product.price.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                {product.currency}
              </span>
              {/* Inline mini stats - visible on sm+ */}
              <div className="hidden sm:flex items-center gap-2.5 text-xs text-gray-400">
                <span className="flex items-center gap-0.5">
                  <Eye size={11} />
                  {product.clickCount || 0}
                </span>
                <span className="flex items-center gap-0.5">
                  <Heart size={11} />
                  {product.favoritesCount || 0}
                </span>
                <span className="flex items-center gap-0.5">
                  <ShoppingCart size={11} />
                  {product.cartCount || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Expand stats on mobile */}
            <button
              onClick={() =>
                setExpandedProductId(isExpanded ? null : product.id)
              }
              className={`p-1.5 rounded-lg transition-colors sm:hidden ${
                isDarkMode
                  ? "hover:bg-gray-800 text-gray-500"
                  : "hover:bg-gray-100 text-gray-400"
              } ${isExpanded ? (isDarkMode ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-600") : ""}`}
            >
              <BarChart3 size={16} />
            </button>

            {/* Desktop inline actions */}
            <div className="hidden sm:flex items-center gap-1">
              <button
                onClick={() =>
                  setExpandedProductId(isExpanded ? null : product.id)
                }
                className={`p-1.5 rounded-lg transition-colors ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-500 hover:text-gray-300"
                    : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                } ${isExpanded ? (isDarkMode ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-600") : ""}`}
                title={t("productStats") || "Statistics"}
              >
                <BarChart3 size={15} />
              </button>
              <button
                onClick={() => router.push(`/edit-product/${product.id}`)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-500 hover:text-gray-300"
                    : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                }`}
                title={t("edit") || "Edit"}
              >
                <Edit size={15} />
              </button>
              <button
                onClick={() =>
                  router.push(`/boost?productId=${product.id}`)
                }
                className={`p-1.5 rounded-lg transition-colors ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-500 hover:text-emerald-400"
                    : "hover:bg-gray-100 text-gray-400 hover:text-emerald-600"
                }`}
                title={t("boost") || "Boost"}
              >
                <Zap size={15} />
              </button>
              <button
                onClick={() => handleDeleteProduct(product.id)}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDarkMode
                    ? "hover:bg-red-950/50 text-gray-500 hover:text-red-400"
                    : "hover:bg-red-50 text-gray-400 hover:text-red-500"
                }`}
                title={t("delete") || "Delete"}
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Mobile more menu */}
            <div className="relative sm:hidden">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenu(isMenuOpen ? null : product.id);
                }}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-500"
                    : "hover:bg-gray-100 text-gray-400"
                }`}
              >
                <MoreHorizontal size={16} />
              </button>
              {isMenuOpen && (
                <div
                  className={`absolute right-0 top-full mt-1 w-40 rounded-lg border shadow-lg z-20 overflow-hidden ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <button
                    onClick={() => {
                      setActiveMenu(null);
                      router.push(`/edit-product/${product.id}`);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                      isDarkMode
                        ? "text-gray-300 hover:bg-gray-700"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Edit size={14} />
                    {t("edit") || "Edit"}
                  </button>
                  <button
                    onClick={() => {
                      setActiveMenu(null);
                      router.push(`/boost?productId=${product.id}`);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                      isDarkMode
                        ? "text-gray-300 hover:bg-gray-700"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Zap size={14} />
                    {t("boost") || "Boost"}
                  </button>
                  <button
                    onClick={() => {
                      setActiveMenu(null);
                      handleDeleteProduct(product.id);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-500 transition-colors ${
                      isDarkMode ? "hover:bg-gray-700" : "hover:bg-red-50"
                    }`}
                  >
                    <Trash2 size={14} />
                    {t("delete") || "Delete"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Expanded Stats Panel */}
        {isExpanded && (
          <div
            className={`border-t px-3 py-3 ${
              isDarkMode ? "border-gray-800 bg-gray-900/50" : "border-gray-100 bg-gray-50/50"
            }`}
          >
            <div className="grid grid-cols-3 gap-2">
              {[
                {
                  label: t("clicks") || "Views",
                  value: product.clickCount || 0,
                  icon: Eye,
                  color: "text-blue-500",
                  bg: isDarkMode ? "bg-blue-500/10" : "bg-blue-50",
                },
                {
                  label: t("favorites") || "Favorites",
                  value: product.favoritesCount || 0,
                  icon: Heart,
                  color: "text-pink-500",
                  bg: isDarkMode ? "bg-pink-500/10" : "bg-pink-50",
                },
                {
                  label: t("addedToCart") || "In Carts",
                  value: product.cartCount || 0,
                  icon: ShoppingCart,
                  color: "text-emerald-500",
                  bg: isDarkMode ? "bg-emerald-500/10" : "bg-emerald-50",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-lg ${stat.bg}`}
                >
                  <stat.icon size={14} className={stat.color} />
                  <span
                    className={`text-lg font-bold ${
                      isDarkMode ? "text-gray-100" : "text-gray-900"
                    }`}
                  >
                    {stat.value}
                  </span>
                  <span className="text-[10px] font-medium text-gray-500">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-gray-200 dark:border-gray-800">
              <Clock size={11} className="text-gray-400" />
              <span className="text-[11px] text-gray-400">
                {t("created") || "Created"}{" "}
                {product.createdAt.toDate().toLocaleDateString()}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- Loading ---
  if (authLoading || loading) {
    return (
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-950" : "bg-gray-50"}`}
      >
        <div className="max-w-3xl mx-auto px-4 pt-16">
          <div className="space-y-3">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`h-[72px] rounded-xl animate-pulse ${
                  isDarkMode ? "bg-gray-900" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Not logged in ---
  if (!user) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center px-4 ${
          isDarkMode ? "bg-gray-950" : "bg-gray-50"
        }`}
      >
        <div
          className={`text-center max-w-xs w-full p-6 rounded-2xl border ${
            isDarkMode
              ? "bg-gray-900 border-gray-800"
              : "bg-white border-gray-200"
          }`}
        >
          <div className="w-14 h-14 mx-auto mb-4 bg-orange-500/10 rounded-xl flex items-center justify-center">
            <Package size={28} className="text-orange-500" />
          </div>
          <h2
            className={`text-lg font-bold mb-1.5 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("loginRequired") || "Login Required"}
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            {t("loginToViewProducts") || "Please login to view your products"}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors"
          >
            {t("login") || "Login"}
          </button>
        </div>
      </div>
    );
  }

  // --- Main Page ---
  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-950" : "bg-gray-50"}`}
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 border-b backdrop-blur-md ${
          isDarkMode
            ? "bg-gray-950/80 border-gray-800"
            : "bg-white/80 border-gray-200"
        }`}
      >
        <div className="max-w-3xl mx-auto px-4 py-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => router.back()}
                className={`p-1.5 -ml-1.5 rounded-lg transition-colors ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-400"
                    : "hover:bg-gray-100 text-gray-600"
                }`}
              >
                <ArrowLeft size={18} />
              </button>
              <h1
                className={`text-base font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("myProducts") || "My Products"}
              </h1>
              {products.length > 0 && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    isDarkMode
                      ? "bg-gray-800 text-gray-400"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {products.length}
                </span>
              )}
            </div>
            <button
              onClick={() => router.push("/listproduct")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-lg hover:bg-orange-600 transition-colors"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">
                {t("addProduct") || "Add Product"}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">
        {/* Search + Filters */}
        <div className="mb-4 space-y-2">
          {/* Search */}
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder={t("searchProducts") || "Search products..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 rounded-lg border text-sm transition-colors ${
                isDarkMode
                  ? "bg-gray-900 border-gray-800 text-white placeholder-gray-600 focus:border-gray-600"
                  : "bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-gray-400"
              } focus:outline-none`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                selectedDateRange
                  ? "bg-orange-500 text-white border-orange-500"
                  : isDarkMode
                    ? "border-gray-800 text-gray-400 hover:border-gray-700 bg-gray-900"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
              }`}
            >
              <Calendar size={12} />
              {selectedDateRange
                ? formatDateRange(selectedDateRange)
                : t("filterByDate") || "Date"}
              <ChevronDown size={10} />
            </button>

            <button
              onClick={() => router.push("/archived")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                isDarkMode
                  ? "border-gray-800 text-gray-400 hover:border-gray-700 bg-gray-900"
                  : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
              }`}
            >
              <Archive size={12} />
              {t("archivedProducts") || "Archived"}
            </button>

            {selectedDateRange && (
              <button
                onClick={() => {
                  setSelectedDateRange(null);
                  setShowDatePicker(false);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-500 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
              >
                <X size={10} />
                {t("clear") || "Clear"}
              </button>
            )}
          </div>

          {/* Date range options */}
          {showDatePicker && (
            <div className="flex gap-1.5">
              {[
                { label: t("last7Days") || "7 days", days: 7 },
                { label: t("last30Days") || "30 days", days: 30 },
                { label: t("last90Days") || "90 days", days: 90 },
              ].map((r) => (
                <button
                  key={r.days}
                  onClick={() => {
                    const end = new Date();
                    const start = new Date();
                    start.setDate(start.getDate() - r.days);
                    setSelectedDateRange({ start, end });
                    setShowDatePicker(false);
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
                    isDarkMode
                      ? "border-gray-800 text-gray-400 hover:bg-gray-800 bg-gray-900"
                      : "border-gray-200 text-gray-600 hover:bg-gray-100 bg-white"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product List */}
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div
              className={`w-16 h-16 mb-4 rounded-2xl flex items-center justify-center ${
                isDarkMode ? "bg-gray-900" : "bg-gray-100"
              }`}
            >
              <Package
                size={28}
                className={isDarkMode ? "text-gray-700" : "text-gray-300"}
              />
            </div>
            <h3
              className={`text-base font-semibold mb-1 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {searchQuery || selectedDateRange
                ? t("noProductsFound") || "No products found"
                : t("noProducts") || "No products yet"}
            </h3>
            <p className="text-sm text-gray-500 mb-5 text-center max-w-[240px]">
              {searchQuery || selectedDateRange
                ? t("tryDifferentSearch") || "Try adjusting your search or filters"
                : t("startSelling") || "Start selling by adding your first product"}
            </p>
            {!searchQuery && !selectedDateRange && (
              <button
                onClick={() => router.push("/listproduct")}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 transition-colors"
              >
                <Plus size={16} />
                {t("addProduct") || "Add Product"}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredProducts.map((product) => (
              <ProductRow key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      {/* Confirm Delete Modal */}
      {showConfirmModal && productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div
            className={`w-full max-w-sm rounded-2xl p-5 shadow-2xl border ${
              isDarkMode
                ? "bg-gray-900 border-gray-800"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 mb-3 bg-red-500/10 rounded-xl flex items-center justify-center">
                <Trash2 size={22} className="text-red-500" />
              </div>
              <h3
                className={`text-base font-bold mb-1 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("confirmDelete") || "Delete Product?"}
              </h3>
              <p className="text-sm text-gray-500 mb-5">
                {t("confirmDeleteMessage") ||
                  "This action cannot be undone."}
              </p>
              <div className="flex gap-2 w-full">
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    setProductToDelete(null);
                  }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    isDarkMode
                      ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {t("cancel") || "Cancel"}
                </button>
                <button
                  onClick={() => executeDelete(productToDelete)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  {t("delete") || "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deleting Progress Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div
            className={`w-full max-w-xs rounded-2xl p-5 shadow-2xl border ${
              isDarkMode
                ? "bg-gray-900 border-gray-800"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 mb-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              <h3
                className={`text-sm font-semibold mb-1 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("deletingProduct") || "Deleting..."}
              </h3>
              <p className="text-xs text-gray-500">
                {t("deletingProductDesc") || "Please wait"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
