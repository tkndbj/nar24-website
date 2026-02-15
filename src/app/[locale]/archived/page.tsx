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
  ChevronLeft,
  User,
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

  // ── Dark mode detection (matches ProfilePage pattern) ──
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
      setToast({
        message: t("ArchivedProducts.errorLoading"),
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    if (user) {
      loadProducts();
    } else if (!authLoading) {
      setIsLoading(false);
    }
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
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

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
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
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
        if (!sourceDoc.exists()) {
          throw new Error("Product not found in paused_products");
        }

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

  // ── Not logged in state ──
  if (!authLoading && !user) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="text-center space-y-4">
          <User
            className={`w-12 h-12 md:w-14 md:h-14 mx-auto ${
              isDarkMode ? "text-gray-600" : "text-gray-400"
            }`}
          />
          <h3
            className={`text-base md:text-lg font-semibold mb-1.5 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("ProfilePage.loginToAccess")}
          </h3>
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {t("ProfilePage.loginDescription")}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors text-sm"
          >
            {t("ProfilePage.login")}
          </button>
        </div>
      </div>
    );
  }

  // ── Auth loading state ──
  if (authLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* ── Header ── */}
      <div
        className={`sticky top-0 z-10 border-b ${
          isDarkMode
            ? "bg-gray-900/95 border-gray-800"
            : "bg-white/95 border-gray-200"
        } backdrop-blur-sm`}
      >
        <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className={`p-2 rounded-lg transition-colors ${
              isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"
            }`}
          >
            <ChevronLeft
              className={`w-5 h-5 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            />
          </button>
          <h1
            className={`text-lg font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("ArchivedProducts.title")}
          </h1>

          <button
            onClick={loadProducts}
            disabled={isLoading}
            className={`ml-auto p-2 rounded-lg transition-colors ${
              isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"
            }`}
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""} ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 py-4 space-y-3 md:space-y-4">
        {/* ── Info Banner ── */}
        <div
          className={`rounded-xl p-3 md:p-4 border ${
            isDarkMode
              ? "bg-gray-800/50 border-gray-700"
              : "bg-orange-50 border-orange-200"
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-lg flex-shrink-0 ${
                isDarkMode ? "bg-orange-500/20" : "bg-orange-100"
              }`}
            >
              <Archive className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h2
                className={`font-semibold text-sm ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("ArchivedProducts.managerTitle")}
              </h2>
              <p
                className={`text-sm mt-1 ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {t("ArchivedProducts.managerDescription")}
              </p>
            </div>
          </div>
        </div>

        {/* ── Search Bar ── */}
        <div className="relative">
          <Search
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("ArchivedProducts.searchPlaceholder")}
            className={`w-full pl-10 pr-10 py-2.5 rounded-xl text-sm border transition-colors outline-none ${
              isDarkMode
                ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-orange-500"
                : "bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X
                className={`w-4 h-4 ${
                  isDarkMode ? "text-gray-500" : "text-gray-400"
                }`}
              />
            </button>
          )}
        </div>

        {/* ── Search results count ── */}
        {searchQuery && !isLoading && (
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              isDarkMode
                ? "bg-orange-500/10 text-orange-400"
                : "bg-orange-50 text-orange-600"
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="font-medium">
              {t("ArchivedProducts.searchResults", {
                count: filteredProducts.length,
              })}
            </span>
          </div>
        )}

        {/* ── Product List ── */}
        <div ref={scrollRef} className="space-y-2.5 md:space-y-3 pb-8">
          {isLoading ? (
            <LoadingSkeleton isDarkMode={isDarkMode} />
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              isDarkMode={isDarkMode}
              searchQuery={searchQuery}
              t={t}
            />
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
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                </div>
              )}

              {!hasMore && filteredProducts.length > 0 && !searchQuery && (
                <p
                  className={`text-center text-sm py-4 ${
                    isDarkMode ? "text-gray-600" : "text-gray-400"
                  }`}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowUnarchiveModal(null)}
          />
          <div
            className={`relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            }`}
          >
            {/* Modal Header */}
            <div
              className={`px-5 py-4 border-b ${
                isDarkMode ? "border-gray-700" : "border-gray-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
                  <ArchiveRestore className="w-5 h-5 text-white" />
                </div>
                <h3
                  className={`text-lg font-semibold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("ArchivedProducts.unarchiveTitle")}
                </h3>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-5 py-4">
              <div
                className={`p-3 rounded-lg border ${
                  isDarkMode
                    ? "bg-indigo-500/10 border-indigo-500/30"
                    : "bg-indigo-50 border-indigo-200"
                }`}
              >
                <p className="text-sm font-semibold text-indigo-500">
                  {showUnarchiveModal.name}
                </p>
                <p
                  className={`text-xs mt-1 ${
                    isDarkMode ? "text-indigo-400" : "text-indigo-600"
                  }`}
                >
                  {t("ArchivedProducts.unarchiveConfirmation")}
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              className={`px-5 py-4 border-t flex gap-3 ${
                isDarkMode ? "border-gray-700" : "border-gray-200"
              }`}
            >
              <button
                onClick={() => setShowUnarchiveModal(null)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  isDarkMode
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {t("ArchivedProducts.cancel")}
              </button>
              <button
                onClick={() => handleUnarchive(showUnarchiveModal.id)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 transition-all flex items-center justify-center gap-2"
              >
                <ArchiveRestore className="w-4 h-4" />
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
            className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${
              toast.type === "success" ? "bg-green-500" : "bg-red-500"
            }`}
          >
            {toast.type === "success" ? (
              <ArchiveRestore className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Loading Skeleton
// ─────────────────────────────────────────────────────

function LoadingSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={`rounded-xl overflow-hidden animate-pulse ${
            isDarkMode ? "bg-gray-800" : "bg-white"
          }`}
        >
          <div className="p-3 md:p-4 flex gap-3 md:gap-4">
            <div
              className={`w-24 h-24 rounded-lg flex-shrink-0 ${
                isDarkMode ? "bg-gray-700" : "bg-gray-200"
              }`}
            />
            <div className="flex-1 space-y-3 py-1">
              <div
                className={`h-4 rounded w-3/4 ${
                  isDarkMode ? "bg-gray-700" : "bg-gray-200"
                }`}
              />
              <div
                className={`h-3 rounded w-1/2 ${
                  isDarkMode ? "bg-gray-700" : "bg-gray-200"
                }`}
              />
              <div
                className={`h-4 rounded w-1/4 ${
                  isDarkMode ? "bg-gray-700" : "bg-gray-200"
                }`}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Empty State
// ─────────────────────────────────────────────────────

function EmptyState({
  isDarkMode,
  searchQuery,
  t,
}: {
  isDarkMode: boolean;
  searchQuery: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div
        className={`p-6 rounded-2xl ${
          isDarkMode ? "bg-gray-800/50" : "bg-orange-50"
        }`}
      >
        <PackageOpen className="w-16 h-16 text-orange-400" />
      </div>
      <h3
        className={`text-lg font-semibold ${
          isDarkMode ? "text-gray-300" : "text-gray-700"
        }`}
      >
        {searchQuery
          ? t("ArchivedProducts.noSearchResults")
          : t("ArchivedProducts.noProducts")}
      </h3>
      <p
        className={`text-sm ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
      >
        {searchQuery
          ? t("ArchivedProducts.tryDifferentSearch")
          : t("ArchivedProducts.noProductsDescription")}
      </p>
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

  const borderColor = isAdminArchived
    ? needsUpdate
      ? isDarkMode
        ? "border-orange-500/50"
        : "border-orange-300"
      : isDarkMode
        ? "border-red-500/50"
        : "border-red-300"
    : isDarkMode
      ? "border-gray-700"
      : "border-gray-200";

  return (
    <div
      className={`rounded-xl overflow-hidden border transition-shadow hover:shadow-md ${borderColor} ${
        isDarkMode ? "bg-gray-800" : "bg-white"
      }`}
    >
      {/* ── Admin Archive Banner ── */}
      {isAdminArchived && (
        <div
          className={`px-3 md:px-4 py-2 flex items-center gap-2 ${
            needsUpdate
              ? isDarkMode
                ? "bg-orange-500/10"
                : "bg-orange-50"
              : isDarkMode
                ? "bg-red-500/10"
                : "bg-red-50"
          }`}
        >
          {needsUpdate ? (
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isDarkMode ? "text-orange-400" : "text-orange-600"
              }`}
            />
          ) : (
            <ShieldAlert
              className={`w-3.5 h-3.5 ${
                isDarkMode ? "text-red-400" : "text-red-600"
              }`}
            />
          )}
          <span
            className={`text-xs font-semibold ${
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

      {/* ── Archive Reason ── */}
      {isAdminArchived && archiveReason && (
        <div
          className={`mx-3 mt-3 p-3 rounded-lg border ${
            isDarkMode
              ? "bg-orange-500/5 border-orange-500/20"
              : "bg-orange-50 border-orange-200"
          }`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <MessageSquare
              className={`w-3 h-3 ${
                isDarkMode ? "text-orange-400" : "text-orange-600"
              }`}
            />
            <span
              className={`text-[11px] font-semibold ${
                isDarkMode ? "text-orange-400" : "text-orange-700"
              }`}
            >
              {t("ArchivedProducts.adminMessage")}
            </span>
          </div>
          <p
            className={`text-xs leading-relaxed ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
          >
            {archiveReason}
          </p>
        </div>
      )}

      {/* ── Product Content ── */}
      <div className="p-3 flex gap-3">
        {/* Product Image */}
        <button
          onClick={onView}
          className="relative w-24 h-24 md:w-28 md:h-28 rounded-lg overflow-hidden flex-shrink-0 group"
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={product.productName}
              fill
              className="object-cover group-hover:scale-105 transition-transform"
              sizes="(max-width: 768px) 96px, 112px"
            />
          ) : (
            <div
              className={`w-full h-full flex items-center justify-center ${
                isDarkMode ? "bg-gray-700" : "bg-gray-100"
              }`}
            >
              <PackageOpen
                className={`w-8 h-8 ${
                  isDarkMode ? "text-gray-600" : "text-gray-400"
                }`}
              />
            </div>
          )}
        </button>

        {/* Product Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div>
            <button onClick={onView} className="text-left w-full">
              <h3
                className={`text-sm font-semibold leading-tight line-clamp-2 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {product.productName}
              </h3>
            </button>
            {product.brandModel && (
              <p
                className={`text-xs mt-0.5 ${
                  isDarkMode ? "text-gray-500" : "text-gray-500"
                }`}
              >
                {product.brandModel}
              </p>
            )}
          </div>

          <div className="flex items-end justify-between mt-2">
            {/* Price */}
            <div className="flex items-baseline gap-1.5">
              {product.originalPrice &&
                product.discountPercentage &&
                product.discountPercentage > 0 && (
                  <span
                    className={`text-xs line-through ${
                      isDarkMode ? "text-gray-600" : "text-gray-400"
                    }`}
                  >
                    {product.originalPrice} {product.currency}
                  </span>
                )}
              <span
                className={`text-sm font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {product.price} {product.currency}
              </span>
            </div>

            {/* Rating */}
            {product.averageRating > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-yellow-500 text-xs">★</span>
                <span
                  className={`text-xs font-medium ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {product.averageRating.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0 justify-center">
          {/* Update button for needsUpdate */}
          {needsUpdate && (
            <button
              onClick={onUpdate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 transition-all shadow-sm"
            >
              <Pencil className="w-3 h-3" />
              {t("ArchivedProducts.update")}
            </button>
          )}

          {/* Unarchive button for non-admin archived */}
          {!isAdminArchived && (
            <button
              onClick={onUnarchive}
              disabled={isUnarchiving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 transition-all shadow-sm disabled:opacity-50"
            >
              {isUnarchiving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ArchiveRestore className="w-3 h-3" />
              )}
              {t("ArchivedProducts.unarchive")}
            </button>
          )}

          {/* Lock icon for admin archived without needsUpdate */}
          {isAdminArchived && !needsUpdate && (
            <div
              title={t("ArchivedProducts.contactSupport")}
              className={`p-2 rounded-lg border cursor-help ${
                isDarkMode
                  ? "bg-red-500/10 border-red-500/30"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <Lock
                className={`w-4 h-4 ${
                  isDarkMode ? "text-red-400" : "text-red-500"
                }`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
