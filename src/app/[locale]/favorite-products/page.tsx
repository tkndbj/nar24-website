"use client";

import React, {
  useCallback,
  useEffect,
  useState,
  useRef,
  useMemo,
} from "react";
import {
  Heart,
  Trash2,
  ShoppingCart,
  User,
  LogIn,
  ShoppingBag,
 
  Search,
  CheckCircle,
  Circle,
  ArrowRight,
  ArrowLeft,
  X,
} from "lucide-react";
import Image from "next/image";
import SmartImage from "@/app/components/SmartImage";
import { FavoriteBasketWidget } from "@/app/components/FavoriteBasketWidget";
import { useFavorites } from "@/context/FavoritesProvider";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Footer from "@/app/components/Footer";

export default function FavoriteProductsPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useUser();
  const localization = useTranslations();
  const {
    paginatedFavorites,
    favoriteCount,
    selectedBasketId,
    hasMoreData,
    isLoadingMore,
    removeMultipleFromFavorites,
    transferToBasket,
    loadNextPage,
    loadFreshPage,
    fetchBaskets,
    favoriteBaskets,
  } = useFavorites();

  // ========================================================================
  // THEME DETECTION
  // ========================================================================

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }
    const checkTheme = () => setIsDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // ========================================================================
  // TRANSLATION HELPER
  // ========================================================================

  const t = useCallback(
    (key: string) => {
      if (!localization) return key;
      try {
        const translation = localization(`FavoritesDrawer.${key}`);
        if (translation && translation !== `FavoritesDrawer.${key}`) return translation;
        const directTranslation = localization(key);
        if (directTranslation && directTranslation !== key) return directTranslation;
        return key;
      } catch (error) {
        console.warn(`Translation error for key: ${key}`, error);
        return key;
      }
    },
    [localization]
  );

  // ========================================================================
  // STATE
  // ========================================================================

  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showBottomSheet, setShowBottomSheet] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchDebouncer = useRef<NodeJS.Timeout | null>(null);

  // Stable refs for functions used in effects
  const loadNextPageRef = useRef(loadNextPage);
  loadNextPageRef.current = loadNextPage;
  const loadFreshPageRef = useRef(loadFreshPage);
  loadFreshPageRef.current = loadFreshPage;
  const fetchBasketsRef = useRef(fetchBaskets);
  fetchBasketsRef.current = fetchBaskets;

  // Constants
  const PAGE_SIZE = 20;

  // ========================================================================
  // INITIALIZATION — Fresh fetch on mount, only re-runs on user change
  // ========================================================================

  useEffect(() => {
    if (!user) {
      setIsInitialLoading(false);
      setSelectedProductId(null);
      setShowBottomSheet(false);
      return;
    }

    let cancelled = false;

    const loadFresh = async () => {
      setIsInitialLoading(true);
      fetchBasketsRef.current();
      await loadFreshPageRef.current(PAGE_SIZE);
      if (!cancelled) {
        setIsInitialLoading(false);
      }
    };

    loadFresh();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ========================================================================
  // PAGINATION — scroll-based load more
  // ========================================================================

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || !user || !hasMoreData || isLoadingMore) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;

    if (scrollTop + clientHeight >= scrollHeight - 300) {
      loadNextPageRef.current(PAGE_SIZE);
    }
  }, [user, hasMoreData, isLoadingMore]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // ========================================================================
  // SEARCH
  // ========================================================================

  const onSearchChanged = useCallback((query: string) => {
    if (searchDebouncer.current) {
      clearTimeout(searchDebouncer.current);
    }

    searchDebouncer.current = setTimeout(() => {
      setSearchQuery(query.toLowerCase());
    }, 300);
  }, []);

  const getFilteredItems = useMemo(() => {
    if (!searchQuery) return paginatedFavorites;

    return paginatedFavorites.filter((item) => {
      const product = item.product;
      return (
        product.productName?.toLowerCase().includes(searchQuery) ||
        product.brandModel?.toLowerCase().includes(searchQuery)
      );
    });
  }, [paginatedFavorites, searchQuery]);

  // ========================================================================
  // CART & FAVORITE OPERATIONS
  // ========================================================================

  const addSelectedToCart = useCallback(async () => {
    if (isAddingToCart || !selectedProductId || !user) return;

    setIsAddingToCart(true);

    try {
      const selectedItem = paginatedFavorites.find(
        (item) => item.product.id === selectedProductId
      );

      if (!selectedItem) {
        console.error("Product not found");
        return;
      }

      // TODO: Integrate with CartProvider
      console.log("Adding to cart:", selectedItem);

      // Optimistic: Hide bottom sheet
      setSelectedProductId(null);
      setShowBottomSheet(false);

      // Show success toast
      console.log("✅ Added to cart");
    } catch (error) {
      console.error("Error adding to cart:", error);
    } finally {
      setIsAddingToCart(false);
    }
  }, [isAddingToCart, selectedProductId, paginatedFavorites, user]);

  const removeSelectedFromFavorites = useCallback(async () => {
    if (!selectedProductId || !user) return;

    setSelectedProductId(null);
    setShowBottomSheet(false);

    try {
      await removeMultipleFromFavorites([selectedProductId]);
    } catch (error) {
      console.error("Error removing favorite:", error);
      await loadFreshPageRef.current(PAGE_SIZE);
    }
  }, [selectedProductId, user, removeMultipleFromFavorites]);

  const showTransferBasketDialog = useCallback(() => {
    if (!selectedProductId || !user) return;
    setShowTransferDialog(true);
  }, [selectedProductId, user]);

  const handleTransferToBasket = useCallback(
    async (targetBasketId: string | null) => {
      if (!selectedProductId || !user) return;

      setIsTransferring(true);
      setShowTransferDialog(false);
      setSelectedProductId(null);
      setShowBottomSheet(false);

      try {
        await transferToBasket(selectedProductId, targetBasketId);
      } catch (error) {
        console.error("Error transferring to basket:", error);
        await loadFreshPageRef.current(PAGE_SIZE);
      } finally {
        setIsTransferring(false);
      }
    },
    [selectedProductId, user, transferToBasket]
  );

  // ========================================================================
  // SELECTION HANDLING
  // ========================================================================

  const handleProductSelect = useCallback((productId: string) => {
    setSelectedProductId((prev) => {
      if (prev === productId) {
        setShowBottomSheet(false);
        return null;
      } else {
        setShowBottomSheet(true);
        return productId;
      }
    });
  }, []);

  // Clear selection on basket change
  useEffect(() => {
    setSelectedProductId(null);
    setShowBottomSheet(false);
  }, [selectedBasketId]);

  // ========================================================================
  // BASKET CHANGE HANDLER
  // ========================================================================

  const handleBasketChanged = useCallback(async () => {
    if (!user) return;

    setSelectedProductId(null);
    setShowBottomSheet(false);
    setShowTransferDialog(false);

    // Always load fresh data for the newly selected basket
    setIsInitialLoading(true);
    await loadFreshPageRef.current(PAGE_SIZE);
    setIsInitialLoading(false);
  }, [user]);

  // ========================================================================
  // RENDER
  // ========================================================================

  const shouldShowShimmer = isInitialLoading && user && paginatedFavorites.length === 0;

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${isDark ? "bg-gray-950" : "bg-gray-50"}`}>
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-6 lg:px-8 lg:pt-8 lg:pb-8 flex-1">
        {/* Back Button */}
        <div className="mb-4 lg:mb-6">
          <button
            onClick={() => router.back()}
            className={`p-2 rounded-lg transition-colors border ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700" : "bg-white hover:bg-gray-100 text-gray-500 border-gray-200"}`}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Auth Loading */}
        {isAuthLoading ? (
          <div className="flex flex-col items-center py-20">
            <div className="w-6 h-6 border-[2px] border-orange-200 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : !user ? (
          /* Not Authenticated */
          <div className={`max-w-md mx-auto rounded-2xl border shadow-sm p-8 text-center ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
              <User size={24} className={isDark ? "text-gray-500" : "text-gray-400"} />
            </div>
            <h3 className={`text-base font-bold mb-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>
              {t("loginRequired") || "Login Required"}
            </h3>
            <p className={`text-sm mb-5 leading-relaxed ${isDark ? "text-gray-500" : "text-gray-500"}`}>
              {t("loginToViewFavorites") || "Please log in to view your favorites"}
            </p>
            <button
              onClick={() => router.push("/")}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
            >
              <LogIn size={16} />
              <span>{t("login") || "Login"}</span>
            </button>
          </div>
        ) : (
          /* Authenticated Content */
          <>
            {/* Title + Count */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  {t("myFavorites")}
                </h1>
                <span className={`text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  ({hasMoreData ? `${favoriteCount}+` : favoriteCount} {t("items")})
                </span>
              </div>
            </div>

            {/* Basket Widget + Search Row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
              <div className="flex-1">
                <FavoriteBasketWidget
                  isDarkMode={isDark}
                  onBasketChanged={handleBasketChanged}
                />
              </div>

              {paginatedFavorites.length > 20 && (
                <div className={`flex items-center px-3 py-2 rounded-xl border sm:w-64 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
                  <Search size={14} className={isDark ? "text-gray-600" : "text-gray-400"} />
                  <input
                    type="text"
                    placeholder={t("searchFavorites") || "Search favorites..."}
                    onChange={(e) => onSearchChanged(e.target.value)}
                    className={`flex-1 ml-2 bg-transparent outline-none text-[13px] ${isDark ? "text-white placeholder-gray-600" : "text-gray-900 placeholder-gray-400"}`}
                  />
                </div>
              )}
            </div>

            {/* Content Area */}
            <div ref={scrollContainerRef} className="w-full">
              {shouldShowShimmer ? (
                /* Shimmer Grid */
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">
                  {[...Array(10)].map((_, i) => (
                    <div
                      key={i}
                      className={`rounded-xl border animate-pulse overflow-hidden ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}
                    >
                      <div className={`aspect-[4/5] w-full ${isDark ? "bg-gray-800" : "bg-gray-100"}`} />
                      <div className="p-3 space-y-2.5">
                        <div className={`h-2.5 rounded w-1/3 ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />
                        <div className="space-y-1.5">
                          <div className={`h-3 rounded w-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />
                          <div className={`h-3 rounded w-3/4 ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <div className={`h-4 rounded w-2/5 ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />
                          <div className={`h-3 rounded w-1/6 ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : getFilteredItems.length === 0 && !isInitialLoading && !hasMoreData ? (
                /* Empty State */
                <div className="flex flex-col items-center py-16">
                  <Image
                    src="/images/empty-product2.png"
                    alt="No favorites"
                    width={180}
                    height={180}
                    className="mb-6 opacity-90"
                  />
                  <h3 className={`text-lg font-bold mb-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>
                    {t("emptyFavorites") || "No Favorites Yet"}
                  </h3>
                  <p className={`text-sm mb-6 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    {t("discoverProducts") || "Start exploring and add products to your favorites"}
                  </p>
                  <button
                    onClick={() => router.push("/")}
                    className="inline-flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
                  >
                    <ShoppingBag size={16} />
                    <span>{t("discover") || "Discover"}</span>
                  </button>
                </div>
              ) : (
                /* Favorites Grid */
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">
                    {getFilteredItems.map((item) => {
                      const product = item.product;
                      const attrs = item.attributes;
                      const isSelected = selectedProductId === product.id;
                      const imageUrl = attrs.selectedColorImage || product.imageUrls?.[0] || "";

                      return (
                        <div
                          key={product.id}
                          className={`group relative rounded-xl overflow-hidden transition-all duration-200 border ${
                            isDark ? "bg-gray-900 border-gray-800 hover:border-gray-700" : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-md"
                          } ${isSelected ? (isDark ? "ring-2 ring-orange-500/50 border-orange-500/30" : "ring-2 ring-orange-500/40 border-orange-200") : ""}`}
                        >
                          {/* Selection Toggle */}
                          <button
                            onClick={() => handleProductSelect(product.id)}
                            className={`absolute top-2.5 left-2.5 z-10 p-0.5 rounded-full transition-all ${isDark ? "bg-gray-900/80 hover:bg-gray-900" : "bg-white/90 hover:bg-white"} shadow-sm`}
                          >
                            {isSelected ? (
                              <CheckCircle size={20} className="text-orange-500" />
                            ) : (
                              <Circle size={20} className={`${isDark ? "text-gray-600" : "text-gray-300"} group-hover:text-gray-400`} />
                            )}
                          </button>

                          {/* Product Image */}
                          <div
                            onClick={() => router.push(`/productdetail/${product.id}`)}
                            className={`cursor-pointer aspect-[4/5] relative overflow-hidden ${isDark ? "bg-gray-800" : "bg-gray-50"}`}
                          >
                            {imageUrl ? (
                              <SmartImage
                                source={imageUrl}
                                size="card"
                                alt={product.productName || "Product"}
                                fill
                                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                className="object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Heart size={28} className={isDark ? "text-gray-700" : "text-gray-300"} />
                              </div>
                            )}
                          </div>

                          {/* Product Info */}
                          <div
                            onClick={() => router.push(`/productdetail/${product.id}`)}
                            className="cursor-pointer p-3"
                          >
                            {product.brandModel && (
                              <p className={`text-[10px] font-semibold mb-0.5 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                                {product.brandModel}
                              </p>
                            )}
                            <h3 className={`text-xs font-medium line-clamp-2 leading-snug ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                              {product.productName || "Product"}
                            </h3>
                            <div className="flex items-center justify-between mt-2">
                              <span className={`text-sm font-bold ${isDark ? "text-orange-400" : "text-orange-600"}`}>
                                {(product.price || 0).toFixed(2)} {product.currency || "TL"}
                              </span>
                              {(product.averageRating || 0) > 0 && (
                                <div className="flex items-center space-x-0.5">
                                  <span className="text-amber-400 text-[10px]">&#9733;</span>
                                  <span className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                                    {(product.averageRating || 0).toFixed(1)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Loading More Indicator */}
                  {hasMoreData && (
                    <div className="flex justify-center py-4">
                      <div className="w-4 h-4 border-[2px] border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                    </div>
                  )}

                  {/* Bottom Padding for bottom sheet */}
                  {showBottomSheet && <div className="h-20" />}
                </>
              )}
            </div>

            {/* ================================================================
                BOTTOM ACTION BAR - Fixed at bottom when product selected
                ================================================================ */}
            {showBottomSheet && selectedProductId && (
              <div className={`fixed bottom-0 left-0 right-0 z-40 border-t px-4 py-3 sm:px-6 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
                <div className="max-w-6xl mx-auto flex space-x-2">
                  {/* Remove Button */}
                  <button
                    onClick={removeSelectedFromFavorites}
                    className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl text-[12px] font-semibold transition-colors ${isDark ? "bg-red-900/40 text-red-300 hover:bg-red-900/60" : "bg-red-50 text-red-600 hover:bg-red-100"}`}
                  >
                    <Trash2 size={14} />
                    <span>{t("remove") || "Remove"}</span>
                  </button>

                  {/* Transfer Button */}
                  <button
                    onClick={showTransferBasketDialog}
                    className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl text-[12px] font-semibold transition-colors ${isDark ? "bg-teal-900/40 text-teal-300 hover:bg-teal-900/60" : "bg-teal-50 text-teal-600 hover:bg-teal-100"}`}
                  >
                    <ArrowRight size={14} />
                    <span>{t("transfer") || "Transfer"}</span>
                  </button>

                  {/* Add to Cart Button */}
                  <button
                    onClick={addSelectedToCart}
                    disabled={isAddingToCart}
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2.5 px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isAddingToCart ? (
                      <div className="w-3.5 h-3.5 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <ShoppingCart size={14} />
                    )}
                    <span>{t("addToCart") || "Add to Cart"}</span>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ================================================================
          TRANSFER BASKET DIALOG
          ================================================================ */}
      {showTransferDialog && selectedProductId && user && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowTransferDialog(false)}
        >
          <div
            className={`w-full max-w-sm rounded-2xl border shadow-lg p-5 sm:p-6 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                {t("transferToBasket") || "Transfer to Basket"}
              </h3>
              <button
                onClick={() => setShowTransferDialog(false)}
                className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-gray-800 text-gray-500" : "hover:bg-gray-100 text-gray-400"}`}
              >
                <X size={18} />
              </button>
            </div>

            <p className={`text-xs mb-4 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
              {t("selectTargetBasket") || "Select where to move this item:"}
            </p>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {/* Default Favorites Option - only show if currently in a basket */}
              {selectedBasketId && (
                <button
                  onClick={() => handleTransferToBasket(null)}
                  disabled={isTransferring}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left text-[13px] transition-colors ${isDark ? "bg-gray-800/50 border-gray-800 hover:bg-gray-800 text-white" : "bg-gray-50/50 border-gray-100 hover:bg-gray-100 text-gray-900"} ${isTransferring ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span className="font-medium">{t("allFavorites") || "All Favorites"}</span>
                  <ArrowRight size={14} className={isDark ? "text-gray-600" : "text-gray-400"} />
                </button>
              )}

              {/* Basket Options - exclude currently selected basket */}
              {favoriteBaskets
                .filter((basket) => basket.id !== selectedBasketId)
                .map((basket) => (
                  <button
                    key={basket.id}
                    onClick={() => handleTransferToBasket(basket.id)}
                    disabled={isTransferring}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left text-[13px] transition-colors ${isDark ? "bg-gray-800/50 border-gray-800 hover:bg-gray-800 text-white" : "bg-gray-50/50 border-gray-100 hover:bg-gray-100 text-gray-900"} ${isTransferring ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span className="font-medium">{basket.name}</span>
                    <ArrowRight size={14} className={isDark ? "text-gray-600" : "text-gray-400"} />
                  </button>
                ))}

              {/* No baskets available message */}
              {favoriteBaskets.length === 0 && !selectedBasketId && (
                <div className={`text-center py-6 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                  <p className="text-xs mb-1">{t("noBaskets") || "No baskets available"}</p>
                  <p className="text-[10px]">{t("createBasketFirst") || "Create a basket first to transfer items"}</p>
                </div>
              )}

              {favoriteBaskets.length === 0 && selectedBasketId === null && (
                <div className={`text-center py-6 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                  <p className="text-xs mb-1">{t("noBaskets") || "No baskets available"}</p>
                  <p className="text-[10px]">{t("createBasketFirst") || "Create a basket first to transfer items"}</p>
                </div>
              )}
            </div>

            {/* Cancel Button */}
            <button
              onClick={() => setShowTransferDialog(false)}
              className={`w-full mt-4 py-2.5 px-4 rounded-xl text-[13px] font-medium transition-colors ${isDark ? "bg-gray-800 text-gray-300 hover:bg-gray-750" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
            >
              {t("cancel") || "Cancel"}
            </button>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}