"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@/context/UserProvider";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  doc,
  runTransaction,
  serverTimestamp,
  DocumentSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import {
  Archive,
  Search,
  X,
  Lock,
  Pencil,
  ArchiveRestore,
  AlertTriangle,
  MessageSquare,
  ShieldAlert,
  RefreshCw,
  PackageOpen,
  Loader2,
  ArrowLeft,
  User,
  Star,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

interface ArchivedProduct {
  id: string;
  productName: string;
  brandModel?: string;
  price: number;
  currency: string;
  imageUrls: string[];
  averageRating: number;
  category?: string;
  archivedByAdmin?: boolean;
  needsUpdate?: boolean;
  archiveReason?: string;
  originalPrice?: number;
  discountPercentage?: number;
  lastModified?: Timestamp;
}

const PAGE_SIZE = 15;

export default function ArchivedProductsPage() {
  const { user, isLoading: authLoading } = useUser();
  const router = useRouter();
  const t = useTranslations();

  const [products, setProducts] = useState<ArchivedProduct[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<ArchivedProduct[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);
  const [showUnarchiveModal, setShowUnarchiveModal] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // ── Dark mode detection ──
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    if (typeof document !== "undefined") {
      const savedTheme = localStorage.getItem("theme");
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

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

  // ── Toast auto-dismiss ──
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── Load products ──
  const loadProducts = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const q = query(
        collection(db, "paused_products"),
        where("userId", "==", user.uid),
        orderBy("lastModified", "desc"),
        limit(PAGE_SIZE),
      );
      const snapshot = await getDocs(q);
      const loaded = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ArchivedProduct[];
      setProducts(loaded);
      setLastDoc(
        snapshot.docs.length > 0
          ? snapshot.docs[snapshot.docs.length - 1]
          : null,
      );
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error("Error loading archived products:", e);
      setToast({ message: t("ArchivedProducts.errorLoading"), type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    if (user) loadProducts();
    else if (!authLoading) setIsLoading(false);
  }, [user, authLoading, loadProducts]);

  // ── Load more (pagination) ──
  const loadMoreProducts = useCallback(async () => {
    if (!user || !lastDoc || !hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const q = query(
        collection(db, "paused_products"),
        where("userId", "==", user.uid),
        orderBy("lastModified", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE),
      );
      const snapshot = await getDocs(q);
      const newProducts = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ArchivedProduct[];
      setProducts((prev) => [...prev, ...newProducts]);
      setLastDoc(
        snapshot.docs.length > 0
          ? snapshot.docs[snapshot.docs.length - 1]
          : null,
      );
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error("Error loading more products:", e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [user, lastDoc, hasMore, isLoadingMore]);

  // ── Infinite scroll ──
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      if (
        scrollHeight - scrollTop - clientHeight < 600 &&
        !isLoadingMore &&
        hasMore &&
        searchQuery === ""
      ) {
        loadMoreProducts();
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [loadMoreProducts, isLoadingMore, hasMore, searchQuery]);

  // ── Search filter ──
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      if (searchQuery.trim() === "") {
        setFilteredProducts(products);
      } else {
        const q = searchQuery.toLowerCase();
        setFilteredProducts(
          products.filter(
            (p) =>
              p.productName.toLowerCase().includes(q) ||
              (p.brandModel || "").toLowerCase().includes(q) ||
              (p.category || "").toLowerCase().includes(q),
          ),
        );
      }
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, products]);

  // ── Unarchive product ──
  const handleUnarchive = async (productId: string) => {
    if (!user) return;
    setUnarchivingId(productId);
    setShowUnarchiveModal(null);
    try {
      const sourceRef = doc(db, "paused_products", productId);
      const destRef = doc(db, "products", productId);
      await runTransaction(db, async (transaction) => {
        const sourceDoc = await transaction.get(sourceRef);
        if (!sourceDoc.exists())
          throw new Error("Product not found in paused_products");
        const data = sourceDoc.data();
        transaction.set(destRef, {
          ...data,
          paused: false,
          lastModified: serverTimestamp(),
        });
        transaction.delete(sourceRef);
      });
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setToast({
        message: t("ArchivedProducts.unarchiveSuccess"),
        type: "success",
      });
    } catch (e) {
      console.error("Error unarchiving product:", e);
      setToast({
        message: t("ArchivedProducts.unarchiveError"),
        type: "error",
      });
    } finally {
      setUnarchivingId(null);
    }
  };

  // ── Not logged in ──
  if (!authLoading && !user) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center pt-20 ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        <div className="text-center">
          <User
            className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
          />
          <h3
            className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("ProfilePage.loginToAccess")}
          </h3>
          <p
            className={`text-xs mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {t("ProfilePage.loginDescription")}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="inline-flex items-center px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
          >
            {t("ProfilePage.login")}
          </button>
        </div>
      </div>
    );
  }

  // ── Auth loading ──
  if (authLoading) {
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
      {/* ── Sticky Toolbar ── */}
      <div
        className={`sticky top-14 z-30 border-b ${
          isDarkMode
            ? "bg-gray-900/80 backdrop-blur-xl border-gray-700/80"
            : "bg-white/80 backdrop-blur-xl border-gray-100/80"
        }`}
      >
        <div className="max-w-4xl mx-auto">
          {/* Row 1: Nav + Title + Refresh */}
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
              {t("ArchivedProducts.title")}
            </h1>
            {filteredProducts.length > 0 && (
              <span className="px-2 py-0.5 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-semibold rounded-full flex-shrink-0">
                {filteredProducts.length}
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={loadProducts}
              disabled={isLoading}
              className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                  : "bg-gray-50 border-gray-200 hover:bg-gray-100"
              }`}
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? "animate-spin" : ""} ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              />
            </button>
          </div>

          {/* Row 2: Search */}
          <div className="px-3 sm:px-6 pb-2.5">
            <div className="relative">
              <Search
                className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-400"}`}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("ArchivedProducts.searchPlaceholder")}
                className={`w-full pl-9 pr-9 py-2 border rounded-xl text-sm placeholder-gray-400 focus:outline-none transition-all ${
                  isDarkMode
                    ? "bg-gray-800 border-gray-700 text-white focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                    : "bg-gray-50/80 border-gray-200 text-gray-900 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-300"
                }`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X
                    className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-400"}`}
                  />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-3">
        {/* Info Banner */}
        <div
          className={`rounded-2xl border p-4 ${
            isDarkMode
              ? "bg-orange-900/10 border-orange-700/30"
              : "bg-orange-50 border-orange-100"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isDarkMode ? "bg-orange-900/30" : "bg-orange-100"
              }`}
            >
              <Archive className="w-4 h-4 text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h3
                className={`text-sm font-semibold mb-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {t("ArchivedProducts.managerTitle")}
              </h3>
              <p
                className={`text-xs leading-relaxed ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
              >
                {t("ArchivedProducts.managerDescription")}
              </p>
            </div>
          </div>
        </div>

        {/* Search results count */}
        {searchQuery && !isLoading && (
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold ${
              isDarkMode
                ? "bg-orange-900/20 text-orange-400"
                : "bg-orange-50 text-orange-600"
            }`}
          >
            <Search className="w-3 h-3" />
            {t("ArchivedProducts.searchResults", {
              count: filteredProducts.length,
            })}
          </div>
        )}

        {/* Product List */}
        <div ref={scrollRef} className="space-y-3 pb-8">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
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
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-16">
              <PackageOpen
                className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
              />
              <h3
                className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {searchQuery
                  ? t("ArchivedProducts.noSearchResults")
                  : t("ArchivedProducts.noProducts")}
              </h3>
              <p
                className={`text-xs max-w-xs mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
              >
                {searchQuery
                  ? t("ArchivedProducts.tryDifferentSearch")
                  : t("ArchivedProducts.noProductsDescription")}
              </p>
            </div>
          ) : (
            <>
              {filteredProducts.map((product) => (
                <ArchivedProductCard
                  key={product.id}
                  product={product}
                  isDarkMode={isDarkMode}
                  t={t}
                  isUnarchiving={unarchivingId === product.id}
                  onUnarchive={() =>
                    setShowUnarchiveModal({
                      id: product.id,
                      name: product.productName,
                    })
                  }
                  onUpdate={() =>
                    router.push(
                      `/listproduct?editId=${product.id}&fromArchived=true`,
                    )
                  }
                  onView={() => router.push(`/product/${product.id}`)}
                />
              ))}

              {isLoadingMore && (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
                </div>
              )}

              {!hasMore && filteredProducts.length > 0 && !searchQuery && (
                <p
                  className={`text-center text-[11px] py-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                >
                  {t("ArchivedProducts.endOfList")}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Unarchive Confirmation Modal ── */}
      {showUnarchiveModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-sm rounded-2xl shadow-2xl ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between p-4 border-b ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    isDarkMode ? "bg-orange-900/30" : "bg-orange-50"
                  }`}
                >
                  <ArchiveRestore className="w-4 h-4 text-orange-500" />
                </div>
                <h3
                  className={`text-base font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {t("ArchivedProducts.unarchiveTitle")}
                </h3>
              </div>
              <button
                onClick={() => setShowUnarchiveModal(null)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <X
                  className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                />
              </button>
            </div>

            {/* Body */}
            <div className="p-4">
              <div
                className={`rounded-xl p-3 border ${
                  isDarkMode
                    ? "bg-orange-900/10 border-orange-700/30"
                    : "bg-orange-50 border-orange-100"
                }`}
              >
                <p
                  className={`text-sm font-semibold ${isDarkMode ? "text-orange-400" : "text-orange-600"}`}
                >
                  {showUnarchiveModal.name}
                </p>
                <p
                  className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                >
                  {t("ArchivedProducts.unarchiveConfirmation")}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div
              className={`flex gap-2 p-4 border-t ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <button
                onClick={() => setShowUnarchiveModal(null)}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isDarkMode
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {t("ArchivedProducts.cancel")}
              </button>
              <button
                onClick={() => handleUnarchive(showUnarchiveModal.id)}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors"
              >
                <ArchiveRestore className="w-3.5 h-3.5" />
                {t("ArchivedProducts.unarchive")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium text-white ${
              toast.type === "success" ? "bg-green-500" : "bg-red-500"
            }`}
          >
            {toast.type === "success" ? (
              <ArchiveRestore className="w-3.5 h-3.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5" />
            )}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Product Card
// ─────────────────────────────────────────────────────

function ArchivedProductCard({
  product,
  isDarkMode,
  t,
  isUnarchiving,
  onUnarchive,
  onUpdate,
  onView,
}: {
  product: ArchivedProduct;
  isDarkMode: boolean;
  t: ReturnType<typeof useTranslations>;
  isUnarchiving: boolean;
  onUnarchive: () => void;
  onUpdate: () => void;
  onView: () => void;
}) {
  const isAdminArchived = product.archivedByAdmin === true;
  const needsUpdate = product.needsUpdate === true;
  const archiveReason = product.archiveReason;
  const imageUrl =
    product.imageUrls && product.imageUrls.length > 0
      ? product.imageUrls[0]
      : null;

  return (
    <div
      className={`rounded-2xl border overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all ${
        isAdminArchived
          ? needsUpdate
            ? isDarkMode
              ? "border-orange-700/50 bg-gray-800"
              : "border-orange-200 bg-white"
            : isDarkMode
              ? "border-red-700/50 bg-gray-800"
              : "border-red-200 bg-white"
          : isDarkMode
            ? "border-gray-700 bg-gray-800"
            : "border-gray-100 bg-white"
      }`}
    >
      {/* Admin Archive Banner */}
      {isAdminArchived && (
        <div
          className={`px-4 py-2 flex items-center gap-1.5 ${
            needsUpdate
              ? isDarkMode
                ? "bg-orange-900/10"
                : "bg-orange-50"
              : isDarkMode
                ? "bg-red-900/10"
                : "bg-red-50"
          }`}
        >
          {needsUpdate ? (
            <RefreshCw
              className={`w-3 h-3 ${isDarkMode ? "text-orange-400" : "text-orange-600"}`}
            />
          ) : (
            <ShieldAlert
              className={`w-3 h-3 ${isDarkMode ? "text-red-400" : "text-red-600"}`}
            />
          )}
          <span
            className={`text-[11px] font-semibold ${
              needsUpdate
                ? isDarkMode
                  ? "text-orange-400"
                  : "text-orange-700"
                : isDarkMode
                  ? "text-red-400"
                  : "text-red-700"
            }`}
          >
            {needsUpdate
              ? t("ArchivedProducts.needsUpdate")
              : t("ArchivedProducts.archivedByAdmin")}
          </span>
        </div>
      )}

      {/* Archive Reason */}
      {isAdminArchived && archiveReason && (
        <div
          className={`mx-4 mt-3 px-3 py-2.5 rounded-xl border ${
            isDarkMode
              ? "bg-orange-900/5 border-orange-700/20"
              : "bg-orange-50 border-orange-100"
          }`}
        >
          <div className="flex items-center gap-1 mb-0.5">
            <MessageSquare
              className={`w-3 h-3 ${isDarkMode ? "text-orange-400" : "text-orange-600"}`}
            />
            <span
              className={`text-[11px] font-semibold ${isDarkMode ? "text-orange-400" : "text-orange-700"}`}
            >
              {t("ArchivedProducts.adminMessage")}
            </span>
          </div>
          <p
            className={`text-xs leading-relaxed ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
          >
            {archiveReason}
          </p>
        </div>
      )}

      {/* Product Content */}
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Image */}
        <button
          onClick={onView}
          className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 relative group"
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={product.productName}
              fill
              className="object-cover group-hover:scale-105 transition-transform"
              sizes="40px"
            />
          ) : (
            <div
              className={`w-full h-full flex items-center justify-center ${isDarkMode ? "bg-gray-700" : "bg-gray-50"}`}
            >
              <PackageOpen
                className={`w-4 h-4 ${isDarkMode ? "text-gray-500" : "text-gray-300"}`}
              />
            </div>
          )}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <button onClick={onView} className="text-left w-full">
            <h3
              className={`text-sm font-semibold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {product.productName}
            </h3>
          </button>
          <div className="flex items-center gap-2 mt-0.5">
            {product.originalPrice &&
              product.discountPercentage &&
              product.discountPercentage > 0 && (
                <span
                  className={`text-[11px] line-through ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                >
                  {product.originalPrice} {product.currency}
                </span>
              )}
            <span
              className={`text-xs font-bold ${isDarkMode ? "text-orange-400" : "text-orange-600"}`}
            >
              {product.price} {product.currency}
            </span>
            {product.averageRating > 0 && (
              <div className="flex items-center gap-0.5">
                <Star className="w-3 h-3 text-amber-400 fill-current" />
                <span
                  className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                >
                  {product.averageRating.toFixed(1)}
                </span>
              </div>
            )}
            {product.brandModel && (
              <span
                className={`text-[11px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
              >
                · {product.brandModel}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {needsUpdate && (
            <button
              onClick={onUpdate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-xs font-medium"
            >
              <Pencil className="w-3 h-3" />
              {t("ArchivedProducts.update")}
            </button>
          )}

          {!isAdminArchived && (
            <button
              onClick={onUnarchive}
              disabled={isUnarchiving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-200 hover:bg-gray-600"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {isUnarchiving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ArchiveRestore className="w-3 h-3" />
              )}
              {t("ArchivedProducts.unarchive")}
            </button>
          )}

          {isAdminArchived && !needsUpdate && (
            <div
              title={t("ArchivedProducts.contactSupport")}
              className={`w-8 h-8 rounded-xl border flex items-center justify-center cursor-help ${
                isDarkMode
                  ? "bg-red-900/10 border-red-700/30"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <Lock
                className={`w-3.5 h-3.5 ${isDarkMode ? "text-red-400" : "text-red-500"}`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
