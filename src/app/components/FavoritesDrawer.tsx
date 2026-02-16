// // components/FavoritesDrawer.tsx - REFACTORED v4.0 (Production Ready - Matches Flutter exactly)
// // Matches favorite_product_screen.dart implementation

// "use client";

// import React, {
//   useCallback,
//   useEffect,
//   useState,
//   useRef,
//   useMemo,
// } from "react";
// import {
//   X,
//   Heart,
//   Trash2,
//   ShoppingCart,
//   User,
//   LogIn,
//   ShoppingBag,
//   RefreshCw,
//   Search,
//   CheckCircle,
//   Circle,
//   ArrowRight,
// } from "lucide-react";
// import { ProductCard3 } from "./ProductCard3";
// import { FavoriteBasketWidget } from "./FavoriteBasketWidget";
// import { useFavorites } from "@/context/FavoritesProvider";
// import { useUser } from "@/context/UserProvider";
// import { useRouter } from "next/navigation";
// import { useTranslations } from "next-intl";

// interface FavoritesDrawerProps {
//   isOpen: boolean;
//   onClose: () => void;
//   isDarkMode?: boolean;
//   localization?: ReturnType<typeof useTranslations>;
// }

// export const FavoritesDrawer: React.FC<FavoritesDrawerProps> = ({
//   isOpen,
//   onClose,
//   isDarkMode = false,
//   localization,
// }) => {
//   const router = useRouter();
//   const { user } = useUser();
//   const {
//     paginatedFavorites,
//     favoriteCount,
//     selectedBasketId,
//     hasMoreData,
//     isLoadingMore,
//     isInitialLoadComplete,
//     removeMultipleFromFavorites,
//     transferToBasket,
//     loadNextPage,
//     resetPagination,
//     shouldReloadFavorites,
//     enableLiveUpdates,
//     disableLiveUpdates,
//     favoriteBaskets,
//   } = useFavorites();

//   const t = useCallback(
//     (key: string) => {
//       if (!localization) return key;

//       try {
//         const translation = localization(`FavoritesDrawer.${key}`);
//         if (translation && translation !== `FavoritesDrawer.${key}`) {
//           return translation;
//         }

//         const directTranslation = localization(key);
//         if (directTranslation && directTranslation !== key) {
//           return directTranslation;
//         }

//         return key;
//       } catch (error) {
//         console.warn(`Translation error for key: ${key}`, error);
//         return key;
//       }
//     },
//     [localization]
//   );

//   // State variables (matching Flutter)
//   const [isAddingToCart, setIsAddingToCart] = useState(false);
//   const [isInitialLoading, setIsInitialLoading] = useState(true);
//   const [selectedProductId, setSelectedProductId] = useState<string | null>(
//     null
//   );
//   const [searchQuery, setSearchQuery] = useState("");
//   const [isAnimating, setIsAnimating] = useState(false);
//   const [shouldRender, setShouldRender] = useState(false);
//   const [showBottomSheet, setShowBottomSheet] = useState(false);
//   const [showTransferDialog, setShowTransferDialog] = useState(false);
//   const [isTransferring, setIsTransferring] = useState(false);

//   // Refs
//   const scrollContainerRef = useRef<HTMLDivElement>(null);
//   const searchDebouncer = useRef<NodeJS.Timeout | null>(null);
//   const loadingTimeoutTimer = useRef<NodeJS.Timeout | null>(null);

//   // Constants
//   const PAGE_SIZE = 20;
//   const MAX_LOADING_DURATION = 5000;

//   // ========================================================================
//   // LIFECYCLE MANAGEMENT (Smart Listeners)
//   // ========================================================================

//   useEffect(() => {
//     if (isOpen) {
//       setShouldRender(true);
//       setTimeout(() => setIsAnimating(true), 10);

//       // Enable real-time updates when drawer opens
//       if (user) {
//         enableLiveUpdates();
//       }

//       // Disable body scroll
//       const scrollY = window.scrollY;
//       document.body.style.overflow = "hidden";
//       document.body.style.position = "fixed";
//       document.body.style.width = "100%";
//       document.body.style.top = `-${scrollY}px`;
//     } else {
//       setIsAnimating(false);
//       setTimeout(() => setShouldRender(false), 300);

//       // Disable real-time updates when drawer closes
//       disableLiveUpdates();

//       // Re-enable body scroll
//       const scrollY = document.body.style.top;
//       document.body.style.overflow = "";
//       document.body.style.position = "";
//       document.body.style.width = "";
//       document.body.style.top = "";

//       if (scrollY) {
//         window.scrollTo(0, parseInt(scrollY || "0") * -1);
//       }
//     }

//     return () => {
//       document.body.style.overflow = "";
//       document.body.style.position = "";
//       document.body.style.width = "";
//       document.body.style.top = "";
//     };
//   }, [isOpen, user, enableLiveUpdates, disableLiveUpdates]);

//   // ========================================================================
//   // INITIALIZATION
//   // ========================================================================

//   const loadNextPageInternal = useCallback(async () => {
//     if (isLoadingMore || !user) return;

//     // If no more data and list is empty, immediately hide shimmer
//     if (!hasMoreData) {
//       if (isInitialLoading) {
//         setIsInitialLoading(false);
//         if (loadingTimeoutTimer.current) {
//           clearTimeout(loadingTimeoutTimer.current);
//         }
//         console.log("✅ No more data - shimmer hidden");
//       }
//       return;
//     }

//     try {
//       const result = await loadNextPage(PAGE_SIZE);

//       if (result.error) {
//         console.error("Error loading page:", result.error);
//         setIsInitialLoading(false);
//         if (loadingTimeoutTimer.current) {
//           clearTimeout(loadingTimeoutTimer.current);
//         }
//         return;
//       }

//       if (!result.docs || result.docs.length === 0) {
//         setIsInitialLoading(false);
//         if (loadingTimeoutTimer.current) {
//           clearTimeout(loadingTimeoutTimer.current);
//         }
//         return;
//       }

//       setIsInitialLoading(false);
//       if (loadingTimeoutTimer.current) {
//         clearTimeout(loadingTimeoutTimer.current);
//       }
//     } catch (error) {
//       console.error("❌ Error loading page:", error);
//       setIsInitialLoading(false);
//       if (loadingTimeoutTimer.current) {
//         clearTimeout(loadingTimeoutTimer.current);
//       }
//     }
//   }, [isLoadingMore, user, hasMoreData, isInitialLoading, loadNextPage]);

//   const startLoadingTimeout = useCallback(() => {
//     if (loadingTimeoutTimer.current) {
//       clearTimeout(loadingTimeoutTimer.current);
//     }
//     loadingTimeoutTimer.current = setTimeout(() => {
//       if (isInitialLoading) {
//         console.warn("⚠️ Loading timeout reached - forcing shimmer off");
//         setIsInitialLoading(false);
//       }
//     }, MAX_LOADING_DURATION);
//   }, [isInitialLoading]);

//   const checkCacheAndInitialize = useCallback(() => {
//     if (!user) {
//       setIsInitialLoading(false);
//       if (loadingTimeoutTimer.current) {
//         clearTimeout(loadingTimeoutTimer.current);
//       }
//       return;
//     }

//     const hasCachedData = paginatedFavorites.length > 0;
//     const shouldReload = shouldReloadFavorites(selectedBasketId);

//     if (hasCachedData && !shouldReload) {
//       setIsInitialLoading(false);
//       if (loadingTimeoutTimer.current) {
//         clearTimeout(loadingTimeoutTimer.current);
//       }
//       console.log("✅ Using cached data -", paginatedFavorites.length, "items");
//       return; // ✅ IMPORTANT: Return early
//     }

//     // If cached data is empty and no more data, hide shimmer immediately
//     if (!hasCachedData && !hasMoreData && isInitialLoadComplete) {
//       setIsInitialLoading(false);
//       if (loadingTimeoutTimer.current) {
//         clearTimeout(loadingTimeoutTimer.current);
//       }
//       console.log("✅ No cached data and no more to load - shimmer hidden");
//       return; // ✅ IMPORTANT: Return early
//     }

//     // Only load if we haven't already loaded
//     if (!isInitialLoadComplete || shouldReload) {
//       console.log("🔄 Loading fresh data");
//       setIsInitialLoading(true);
//       startLoadingTimeout();

//       // Load data asynchronously
//       loadNextPageInternal();
//     }
//   }, [
//     user,
//     paginatedFavorites.length,
//     selectedBasketId,
//     hasMoreData,
//     isInitialLoadComplete,
//     shouldReloadFavorites,
//     startLoadingTimeout,
//     loadNextPageInternal, // ✅ ADD THIS
//   ]);

//   useEffect(() => {
//     if (isOpen && user) {
//       checkCacheAndInitialize();
//     }
//   }, [isOpen, user, selectedBasketId]);

//   // Clear selection when user logs out
//   useEffect(() => {
//     if (!user) {
//       setSelectedProductId(null);
//       setShowBottomSheet(false);
//     }
//   }, [user]);

//   // ========================================================================
//   // PAGINATION
//   // ========================================================================

//   // Scroll listener for infinite scroll
//   const handleScroll = useCallback(() => {
//     if (!scrollContainerRef.current || !user) return;

//     const { scrollTop, scrollHeight, clientHeight } =
//       scrollContainerRef.current;

//     if (scrollTop + clientHeight >= scrollHeight - 300) {
//       loadNextPageInternal();
//     }
//   }, [user, loadNextPageInternal]);

//   useEffect(() => {
//     const container = scrollContainerRef.current;
//     if (!container) return;

//     container.addEventListener("scroll", handleScroll);
//     return () => container.removeEventListener("scroll", handleScroll);
//   }, [handleScroll]);

//   // ========================================================================
//   // SEARCH
//   // ========================================================================

//   const onSearchChanged = useCallback((query: string) => {
//     if (searchDebouncer.current) {
//       clearTimeout(searchDebouncer.current);
//     }

//     searchDebouncer.current = setTimeout(() => {
//       setSearchQuery(query.toLowerCase());
//     }, 300);
//   }, []);

//   const getFilteredItems = useMemo(() => {
//     if (!searchQuery) return paginatedFavorites;

//     return paginatedFavorites.filter((item) => {
//       const product = item.product;
//       return (
//         product.productName?.toLowerCase().includes(searchQuery) ||
//         product.brandModel?.toLowerCase().includes(searchQuery)
//       );
//     });
//   }, [paginatedFavorites, searchQuery]);

//   // ========================================================================
//   // CART & FAVORITE OPERATIONS
//   // ========================================================================

//   const addSelectedToCart = useCallback(async () => {
//     if (isAddingToCart || !selectedProductId || !user) return;

//     setIsAddingToCart(true);

//     try {
//       const selectedItem = paginatedFavorites.find(
//         (item) => item.product.id === selectedProductId
//       );

//       if (!selectedItem) {
//         console.error("Product not found");
//         return;
//       }

//       // TODO: Integrate with CartProvider
//       console.log("Adding to cart:", selectedItem);

//       // Optimistic: Hide bottom sheet
//       setSelectedProductId(null);
//       setShowBottomSheet(false);

//       // Show success toast
//       console.log("✅ Added to cart");
//     } catch (error) {
//       console.error("Error adding to cart:", error);
//     } finally {
//       setIsAddingToCart(false);
//     }
//   }, [isAddingToCart, selectedProductId, paginatedFavorites, user]);

//   const removeSelectedFromFavorites = useCallback(async () => {
//     if (!selectedProductId || !user) return;

//     try {
//       // Optimistic: Remove from UI immediately
//       setSelectedProductId(null);
//       setShowBottomSheet(false);

//       // Delete in background
//       const result = await removeMultipleFromFavorites([selectedProductId]);

//       // If removal failed, show error and reload
//       if (result !== "Products removed from favorites") {
//         console.error("Failed to remove:", result);
//         // Reload data on failure
//         setIsInitialLoading(true);
//         resetPagination();
//         await loadNextPageInternal();
//       } else {
//         console.log("✅ Removed from favorites");
//       }
//     } catch (error) {
//       console.error("Error removing favorite:", error);
//       // Reload data on error
//       setIsInitialLoading(true);
//       resetPagination();
//       await loadNextPageInternal();
//     }
//   }, [
//     selectedProductId,
//     user,
//     removeMultipleFromFavorites,
//     resetPagination,
//     loadNextPageInternal,
//   ]);

//   const showTransferBasketDialog = useCallback(() => {
//     if (!selectedProductId || !user) return;
//     setShowTransferDialog(true);
//   }, [selectedProductId, user]);

//   const handleTransferToBasket = useCallback(
//     async (targetBasketId: string | null) => {
//       if (!selectedProductId || !user) return;

//       setIsTransferring(true);

//       try {
//         // Close dialogs first
//         setShowTransferDialog(false);
//         setSelectedProductId(null);
//         setShowBottomSheet(false);

//         const result = await transferToBasket(selectedProductId, targetBasketId);

//         if (result !== "Transferred successfully") {
//           console.error("Failed to transfer:", result);
//           // Reload data on failure
//           setIsInitialLoading(true);
//           resetPagination();
//           await loadNextPageInternal();
//         } else {
//           console.log("✅ Transferred successfully to", targetBasketId || "default favorites");
//         }
//       } catch (error) {
//         console.error("Error transferring to basket:", error);
//         // Reload data on error
//         setIsInitialLoading(true);
//         resetPagination();
//         await loadNextPageInternal();
//       } finally {
//         setIsTransferring(false);
//       }
//     },
//     [
//       selectedProductId,
//       user,
//       transferToBasket,
//       resetPagination,
//       loadNextPageInternal,
//     ]
//   );

//   // ========================================================================
//   // SELECTION HANDLING
//   // ========================================================================

//   const handleProductSelect = useCallback((productId: string) => {
//     setSelectedProductId((prev) => {
//       if (prev === productId) {
//         setShowBottomSheet(false);
//         return null;
//       } else {
//         setShowBottomSheet(true);
//         return productId;
//       }
//     });
//   }, []);

//   // Clear selection on basket change
//   useEffect(() => {
//     setSelectedProductId(null);
//     setShowBottomSheet(false);
//   }, [selectedBasketId]);

//   // ========================================================================
//   // BASKET CHANGE HANDLER
//   // ========================================================================

//   const handleBasketChanged = useCallback(async () => {
//     if (!user) return;

//     // Clear selection on basket change
//     setSelectedProductId(null);
//     setShowBottomSheet(false);
//     setShowTransferDialog(false);

//     // Small delay to allow provider's setSelectedBasket to restore cache
//     await new Promise((resolve) => setTimeout(resolve, 10));

//     const shouldReload = shouldReloadFavorites(selectedBasketId);
//     const hasCachedData = paginatedFavorites.length > 0;

//     console.log("🔄 Basket changed, shouldReload=", shouldReload, "hasCachedData=", hasCachedData, "items=", paginatedFavorites.length);

//     if (hasCachedData && !shouldReload) {
//       // Cache was restored by provider - just hide shimmer
//       console.log("✅ Using restored cache -", paginatedFavorites.length, "items");
//       setIsInitialLoading(false);
//       if (loadingTimeoutTimer.current) {
//         clearTimeout(loadingTimeoutTimer.current);
//       }
//     } else if (shouldReload) {
//       // No cache available, need to load fresh
//       console.log("🔄 Loading fresh data for basket");
//       setIsInitialLoading(true);
//       startLoadingTimeout();
//       // Don't call resetPagination here - provider already handled it
//       await loadNextPageInternal();
//     } else {
//       // Edge case - shouldn't happen but handle gracefully
//       setIsInitialLoading(false);
//       if (loadingTimeoutTimer.current) {
//         clearTimeout(loadingTimeoutTimer.current);
//       }
//     }
//   }, [
//     user,
//     selectedBasketId,
//     shouldReloadFavorites,
//     loadNextPageInternal,
//     startLoadingTimeout,
//     paginatedFavorites.length,
//   ]);

//   // ========================================================================
//   // RENDER HELPERS
//   // ========================================================================

//   const handleBackdropClick = (e: React.MouseEvent) => {
//     if (e.target === e.currentTarget) {
//       onClose();
//     }
//   };

//   if (!shouldRender) return null;

//   const shouldShowShimmer =
//     isInitialLoading && user && paginatedFavorites.length === 0;

//   return (
//     <div className="fixed inset-0 z-[1000] overflow-hidden">
//       {/* Backdrop */}
//       <div
//         className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
//           isAnimating ? "opacity-100" : "opacity-0"
//         }`}
//         onClick={handleBackdropClick}
//       />

//       {/* Drawer */}
//       <div
//         className={`
//           absolute right-0 top-0 h-full w-full max-w-md transform transition-transform duration-300 ease-out
//           ${isDarkMode ? "bg-gray-900" : "bg-white"}
//           shadow-2xl flex flex-col
//           ${isAnimating ? "translate-x-0" : "translate-x-full"}
//         `}
//       >
//         {/* Header */}
//         <div
//           className={`
//             flex-shrink-0 border-b px-6 py-4
//             ${
//               isDarkMode
//                 ? "bg-gray-900 border-gray-700"
//                 : "bg-white border-gray-200"
//             }
//           `}
//         >
//           <div className="flex items-center justify-between mb-4">
//             <div className="flex items-center space-x-3">
//               <div
//                 className={`
//                   p-2 rounded-full
//                   ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
//                 `}
//               >
//                 <Heart
//                   size={20}
//                   className={isDarkMode ? "text-gray-300" : "text-gray-700"}
//                 />
//               </div>
//               <div>
//                 <h2
//                   className={`
//                     text-lg font-bold
//                     ${isDarkMode ? "text-white" : "text-gray-900"}
//                   `}
//                 >
//                   {t("myFavorites")}
//                 </h2>
//                 {user && (
//                   <p
//                     className={`
//                       text-sm
//                       ${isDarkMode ? "text-gray-400" : "text-gray-500"}
//                     `}
//                   >
//                     {hasMoreData ? `${favoriteCount}+` : favoriteCount}{" "}
//                     {t("items")}
//                   </p>
//                 )}
//               </div>
//             </div>

//             <button
//               onClick={onClose}
//               className={`
//                 p-2 rounded-full transition-colors duration-200
//                 ${
//                   isDarkMode
//                     ? "hover:bg-gray-800 text-gray-400 hover:text-white"
//                     : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
//                 }
//               `}
//             >
//               <X size={20} />
//             </button>
//           </div>

//           {/* Basket Widget - Only show if authenticated */}
//           {user && (
//             <div className="mb-3">
//               <FavoriteBasketWidget
//                 isDarkMode={isDarkMode}
//                 onBasketChanged={handleBasketChanged}
//               />
//             </div>
//           )}

//           {/* Search Bar - Only show if authenticated and more than 20 items */}
//           {user && paginatedFavorites.length > 20 && (
//             <div className="mt-3">
//               <div
//                 className={`
//                   flex items-center px-3 py-2 rounded-lg border
//                   ${
//                     isDarkMode
//                       ? "bg-gray-800 border-gray-600"
//                       : "bg-gray-50 border-gray-300"
//                   }
//                 `}
//               >
//                 <Search
//                   size={16}
//                   className={isDarkMode ? "text-gray-400" : "text-gray-500"}
//                 />
//                 <input
//                   type="text"
//                   placeholder={t("searchFavorites") || "Search favorites..."}
//                   onChange={(e) => onSearchChanged(e.target.value)}
//                   className={`
//                     flex-1 ml-2 bg-transparent outline-none text-sm
//                     ${isDarkMode ? "text-white" : "text-gray-900"}
//                     placeholder:text-gray-400
//                   `}
//                 />
//               </div>
//             </div>
//           )}
//         </div>

//         {/* Content - Main scrollable area */}
//         <div
//           ref={scrollContainerRef}
//           className="flex-1 overflow-y-auto min-h-0"
//         >
//           {/* Not Authenticated State */}
//           {!user ? (
//             <div className="flex flex-col items-center justify-center h-full px-6 py-12">
//               <div
//                 className={`
//                   w-32 h-32 rounded-full flex items-center justify-center mb-6
//                   ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
//                 `}
//               >
//                 <User
//                   size={48}
//                   className={isDarkMode ? "text-gray-600" : "text-gray-300"}
//                 />
//               </div>
//               <h3
//                 className={`
//                   text-xl font-bold mb-3 text-center
//                   ${isDarkMode ? "text-white" : "text-gray-900"}
//                 `}
//               >
//                 {t("loginRequired") || "Login Required"}
//               </h3>
//               <p
//                 className={`
//                   text-center mb-8 leading-relaxed
//                   ${isDarkMode ? "text-gray-400" : "text-gray-600"}
//                 `}
//               >
//                 {t("loginToViewFavorites") ||
//                   "Please log in to view your favorites"}
//               </p>

//               {/* Login Button */}
//               <div className="w-full max-w-sm">
//                 <button
//                   onClick={() => {
//                     onClose();
//                     router.push("/login");
//                   }}
//                   className="
//                     w-full flex items-center justify-center space-x-2 px-6 py-3 rounded-lg
//                     bg-gradient-to-r from-orange-500 to-pink-500 text-white
//                     hover:from-orange-600 hover:to-pink-600
//                     transition-all duration-200 shadow-lg hover:shadow-xl
//                     active:scale-95
//                   "
//                 >
//                   <LogIn size={18} />
//                   <span className="font-medium">{t("login") || "Login"}</span>
//                 </button>
//               </div>
//             </div>
//           ) : shouldShowShimmer ? (
//             /* Shimmer Loading State */
//             <div className="px-4 py-4 space-y-4">
//               {[...Array(8)].map((_, i) => (
//                 <div
//                   key={i}
//                   className={`
//                     rounded-xl border p-4 animate-pulse
//                     ${
//                       isDarkMode
//                         ? "bg-gray-800 border-gray-700"
//                         : "bg-gray-50 border-gray-200"
//                     }
//                   `}
//                 >
//                   <div className="flex space-x-4">
//                     <div
//                       className={`
//                         w-20 h-20 rounded-lg
//                         ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}
//                       `}
//                     />
//                     <div className="flex-1 space-y-2">
//                       <div
//                         className={`
//                           h-4 rounded
//                           ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}
//                         `}
//                       />
//                       <div
//                         className={`
//                           h-4 w-2/3 rounded
//                           ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}
//                         `}
//                       />
//                     </div>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           ) : getFilteredItems.length === 0 && !isInitialLoading && !hasMoreData ? (
//             /* Empty State */
//             <div className="flex flex-col items-center justify-center h-full px-6 py-12">
//               <div
//                 className={`
//                   w-32 h-32 rounded-full flex items-center justify-center mb-6
//                   ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
//                 `}
//               >
//                 <Heart
//                   size={48}
//                   className={isDarkMode ? "text-gray-600" : "text-gray-300"}
//                 />
//               </div>
//               <h3
//                 className={`
//                   text-xl font-bold mb-3 text-center
//                   ${isDarkMode ? "text-white" : "text-gray-900"}
//                 `}
//               >
//                 {t("emptyFavorites") || "No Favorites Yet"}
//               </h3>
//               <p
//                 className={`
//                   text-center mb-8 leading-relaxed
//                   ${isDarkMode ? "text-gray-400" : "text-gray-600"}
//                 `}
//               >
//                 {t("discoverProducts") ||
//                   "Start exploring and add products to your favorites"}
//               </p>
//               <button
//                 onClick={() => {
//                   onClose();
//                   router.push("/");
//                 }}
//                 className="
//                   flex items-center space-x-2 px-6 py-3 rounded-lg
//                   bg-gradient-to-r from-orange-500 to-pink-500 text-white
//                   hover:from-orange-600 hover:to-pink-600
//                   transition-all duration-200 shadow-lg hover:shadow-xl
//                   active:scale-95
//                 "
//               >
//                 <ShoppingBag size={18} />
//                 <span className="font-medium">
//                   {t("discover") || "Discover"}
//                 </span>
//               </button>
//             </div>
//           ) : (
//             /* Favorite Items List */
//             <div className="px-4 py-4">
//               <div className="space-y-4">
//                 {getFilteredItems.map((item, index) => {
//                   const product = item.product;
//                   const attrs = item.attributes;
//                   const isSelected = selectedProductId === product.id;

//                   return (
//                     <div
//                       key={product.id}
//                       className={`
//                         rounded-xl border p-3 transition-all duration-200 relative
//                         ${
//                           isDarkMode
//                             ? "bg-gray-800 border-gray-700 hover:border-gray-600"
//                             : "bg-gray-50 border-gray-200 hover:border-gray-300"
//                         }
//                         ${
//                           isSelected
//                             ? "ring-2 ring-orange-500 border-orange-500"
//                             : ""
//                         }
//                       `}
//                     >
//                       {/* Selection Toggle */}
//                       <button
//                         onClick={() => handleProductSelect(product.id)}
//                         className={`
//                           absolute top-2 left-2 z-10 p-1 rounded-full transition-colors duration-200
//                           ${
//                             isDarkMode
//                               ? "bg-gray-900/80 hover:bg-gray-900"
//                               : "bg-white/80 hover:bg-white"
//                           }
//                           backdrop-blur-sm shadow-sm
//                         `}
//                       >
//                         {isSelected ? (
//                           <CheckCircle size={20} className="text-orange-500" />
//                         ) : (
//                           <Circle
//                             size={20}
//                             className={
//                               isDarkMode ? "text-gray-400" : "text-gray-500"
//                             }
//                           />
//                         )}
//                       </button>

//                       {/* Product Card */}
//                       <div
//                         onClick={() => {
//                           onClose();
//                           router.push(`/productdetail/${product.id}`);
//                         }}
//                         className="cursor-pointer"
//                       >
//                         {product.brandModel && (
//                           <div className="mb-1 pl-10 pr-1">
//                             <span
//                               className={`text-sm font-semibold ${
//                                 isDarkMode ? "text-blue-200" : "text-blue-600"
//                               }`}
//                             >
//                               {product.brandModel}
//                             </span>
//                           </div>
//                         )}
//                         <ProductCard3
//                           imageUrl={
//                             attrs.selectedColorImage ||
//                             product.imageUrls?.[0] ||
//                             "https://via.placeholder.com/200"
//                           }
//                           colorImages={product.colorImages || {}}
//                           selectedColor={attrs.selectedColor}
//                           selectedColorImage={attrs.selectedColorImage}
//                           productName={product.productName || "Product"}
//                           brandModel=""
//                           price={product.price || 0}
//                           currency={product.currency || "TL"}
//                           averageRating={product.averageRating || 0}
//                           quantity={attrs.quantity || 1}
//                           maxQuantityAllowed={0}
//                           isDarkMode={isDarkMode}
//                           scaleFactor={0.9}
//                           hideStockInfo={true}
//                         />
//                       </div>

//                       {/* Divider */}
//                       {index < getFilteredItems.length - 1 && (
//                         <div
//                           className={`
//                             mt-3 pt-3 border-t
//                             ${
//                               isDarkMode ? "border-gray-700" : "border-gray-200"
//                             }
//                           `}
//                         />
//                       )}
//                     </div>
//                   );
//                 })}

//                 {/* Loading More Indicator */}
//                 {hasMoreData && user && (
//                   <div className="flex justify-center py-4">
//                     <RefreshCw
//                       size={20}
//                       className="animate-spin text-orange-500"
//                     />
//                   </div>
//                 )}
//               </div>

//               {/* Bottom Padding for bottom sheet */}
//               {showBottomSheet && <div className="h-24" />}
//             </div>
//           )}
//         </div>

//         {/* Bottom Sheet (Action Buttons) - Only show if authenticated and product selected */}
//         {showBottomSheet && selectedProductId && user && (
//           <div
//             className={`
//               flex-shrink-0 border-t px-4 py-3 animate-slide-up
//               ${
//                 isDarkMode
//                   ? "bg-gray-900 border-gray-700"
//                   : "bg-white border-gray-200"
//               }
//               shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]
//             `}
//           >
//             <div className="flex space-x-2">
//               {/* Remove Button */}
//               <button
//                 onClick={removeSelectedFromFavorites}
//                 className="
//                   flex-1 flex items-center justify-center space-x-2
//                   py-2.5 px-3 rounded-lg
//                   bg-red-500 text-white
//                   hover:bg-red-600
//                   transition-colors duration-200
//                   active:scale-95
//                 "
//               >
//                 <Trash2 size={16} />
//                 <span className="text-sm font-medium">
//                   {t("remove") || "Remove"}
//                 </span>
//               </button>

//               {/* Transfer Button */}
//               <button
//                 onClick={showTransferBasketDialog}
//                 className="
//                   flex-1 flex items-center justify-center space-x-2
//                   py-2.5 px-3 rounded-lg
//                   bg-teal-600 text-white
//                   hover:bg-teal-700
//                   transition-colors duration-200
//                   active:scale-95
//                 "
//               >
//                 <ArrowRight size={16} />
//                 <span className="text-sm font-medium">
//                   {t("transfer") || "Transfer"}
//                 </span>
//               </button>

//               {/* Add to Cart Button */}
//               <button
//                 onClick={addSelectedToCart}
//                 disabled={isAddingToCart}
//                 className="
//                   flex-1 flex items-center justify-center space-x-2
//                   py-2.5 px-3 rounded-lg
//                   bg-orange-500 text-white
//                   hover:bg-orange-600
//                   disabled:opacity-50 disabled:cursor-not-allowed
//                   transition-colors duration-200
//                   active:scale-95
//                 "
//               >
//                 {isAddingToCart ? (
//                   <RefreshCw size={16} className="animate-spin" />
//                 ) : (
//                   <ShoppingCart size={16} />
//                 )}
//                 <span className="text-sm font-medium">
//                   {t("addToCart") || "Add to Cart"}
//                 </span>
//               </button>
//             </div>
//           </div>
//         )}

//         {/* Transfer Basket Dialog */}
//         {showTransferDialog && selectedProductId && user && (
//           <div
//             className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
//             onClick={() => setShowTransferDialog(false)}
//           >
//             <div
//               className={`
//                 w-full max-w-sm rounded-xl p-5 shadow-2xl
//                 ${isDarkMode ? "bg-gray-800" : "bg-white"}
//               `}
//               onClick={(e) => e.stopPropagation()}
//             >
//               <div className="flex items-center justify-between mb-4">
//                 <h3
//                   className={`
//                     text-lg font-bold
//                     ${isDarkMode ? "text-white" : "text-gray-900"}
//                   `}
//                 >
//                   {t("transferToBasket") || "Transfer to Basket"}
//                 </h3>
//                 <button
//                   onClick={() => setShowTransferDialog(false)}
//                   className={`
//                     p-1.5 rounded-full transition-colors
//                     ${isDarkMode ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"}
//                   `}
//                 >
//                   <X size={18} />
//                 </button>
//               </div>

//               <p
//                 className={`
//                   text-sm mb-4
//                   ${isDarkMode ? "text-gray-400" : "text-gray-600"}
//                 `}
//               >
//                 {t("selectTargetBasket") || "Select where to move this item:"}
//               </p>

//               <div className="space-y-2 max-h-64 overflow-y-auto">
//                 {/* Default Favorites Option - only show if currently in a basket */}
//                 {selectedBasketId && (
//                   <button
//                     onClick={() => handleTransferToBasket(null)}
//                     disabled={isTransferring}
//                     className={`
//                       w-full flex items-center justify-between px-4 py-3 rounded-lg
//                       transition-colors duration-200 text-left
//                       ${isDarkMode
//                         ? "bg-gray-700 hover:bg-gray-600 text-white"
//                         : "bg-gray-50 hover:bg-gray-100 text-gray-900"
//                       }
//                       ${isTransferring ? "opacity-50 cursor-not-allowed" : ""}
//                     `}
//                   >
//                     <span className="font-medium">
//                       {t("allFavorites") || "All Favorites"}
//                     </span>
//                     <ArrowRight size={16} className={isDarkMode ? "text-gray-400" : "text-gray-500"} />
//                   </button>
//                 )}

//                 {/* Basket Options - exclude currently selected basket */}
//                 {favoriteBaskets
//                   .filter((basket) => basket.id !== selectedBasketId)
//                   .map((basket) => (
//                     <button
//                       key={basket.id}
//                       onClick={() => handleTransferToBasket(basket.id)}
//                       disabled={isTransferring}
//                       className={`
//                         w-full flex items-center justify-between px-4 py-3 rounded-lg
//                         transition-colors duration-200 text-left
//                         ${isDarkMode
//                           ? "bg-gray-700 hover:bg-gray-600 text-white"
//                           : "bg-gray-50 hover:bg-gray-100 text-gray-900"
//                         }
//                         ${isTransferring ? "opacity-50 cursor-not-allowed" : ""}
//                       `}
//                     >
//                       <span className="font-medium">{basket.name}</span>
//                       <ArrowRight size={16} className={isDarkMode ? "text-gray-400" : "text-gray-500"} />
//                     </button>
//                   ))}

//                 {/* No baskets available message */}
//                 {favoriteBaskets.length === 0 && !selectedBasketId && (
//                   <div
//                     className={`
//                       text-center py-6
//                       ${isDarkMode ? "text-gray-400" : "text-gray-500"}
//                     `}
//                   >
//                     <p className="text-sm mb-2">
//                       {t("noBaskets") || "No baskets available"}
//                     </p>
//                     <p className="text-xs">
//                       {t("createBasketFirst") || "Create a basket first to transfer items"}
//                     </p>
//                   </div>
//                 )}

//                 {/* Show message if only viewing from default and no baskets exist */}
//                 {favoriteBaskets.length === 0 && selectedBasketId === null && (
//                   <div
//                     className={`
//                       text-center py-6
//                       ${isDarkMode ? "text-gray-400" : "text-gray-500"}
//                     `}
//                   >
//                     <p className="text-sm mb-2">
//                       {t("noBaskets") || "No baskets available"}
//                     </p>
//                     <p className="text-xs">
//                       {t("createBasketFirst") || "Create a basket first to transfer items"}
//                     </p>
//                   </div>
//                 )}
//               </div>

//               {/* Cancel Button */}
//               <button
//                 onClick={() => setShowTransferDialog(false)}
//                 className={`
//                   w-full mt-4 py-2.5 px-4 rounded-lg font-medium
//                   transition-colors duration-200
//                   ${isDarkMode
//                     ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
//                     : "bg-gray-100 text-gray-700 hover:bg-gray-200"
//                   }
//                 `}
//               >
//                 {t("cancel") || "Cancel"}
//               </button>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };
