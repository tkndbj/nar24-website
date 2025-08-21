"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  X,
  Heart,
  Trash2,
  ArrowRight,
  ShoppingBag,
  User,
  LogIn,
  ShoppingCart,
  RefreshCw,
  FolderPlus,
  Folder,
  ChevronDown,
  AlertCircle,
  CheckCircle,
  Circle,
} from "lucide-react";
import { ProductCard3 } from "./ProductCard3";
import { useFavorites } from "@/context/FavoritesProvider";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Product {
  id: string;
  productName?: string;
  brandModel?: string;
  sellerName?: string;
  price?: number;
  currency?: string;
  averageRating?: number;
  imageUrls?: string[];
  colorImages?: Record<string, string[]>;
}

interface FavoriteDetails {
  productId?: string;
  addedAt?: Timestamp;
  quantity?: number;
  selectedColor?: string;
  selectedColorImage?: string;  
}

interface FavoriteItem {
  productId: string;
  addedAt: Timestamp;
  quantity: number;
  selectedColor?: string;
  selectedColorImage?: string;  
  product?: Product;
  isLoadingProduct?: boolean;
  loadError?: boolean;
}

interface FavoritesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
  localization?: ReturnType<typeof useTranslations>;
}

export const FavoritesDrawer: React.FC<FavoritesDrawerProps> = ({
  isOpen,
  onClose,
  isDarkMode = false,
  localization,
}) => {
  const router = useRouter();
  const { user } = useUser();
  const {
    favoriteProductIds,
    favoriteCount,
    selectedBasketId,
    favoriteBaskets,
    isLoading,
    removeFromFavorites,
    removeMultipleFromFavorites,
    createFavoriteBasket,
    deleteFavoriteBasket,
    setSelectedBasket,
    transferFavoritesToBasket,
    showErrorToast,
    showSuccessToast,
  } = useFavorites();

  // ✅ FIXED: Proper nested translation function that uses JSON files
  const t = useCallback((key: string) => {
    if (!localization) {
      // Return the key itself if no localization function is provided
      return key;
    }

    try {
      // Try to get the nested FavoritesDrawer translation
      const translation = localization(`FavoritesDrawer.${key}`);
      
      // Check if we got a valid translation (not the same as the key we requested)
      if (translation && translation !== `FavoritesDrawer.${key}`) {
        return translation;
      }
      
      // If nested translation doesn't exist, try direct key
      const directTranslation = localization(key);
      if (directTranslation && directTranslation !== key) {
        return directTranslation;
      }
      
      // Return the key as fallback
      return key;
    } catch (error) {
      console.warn(`Translation error for key: ${key}`, error);
      return key;
    }
  }, [localization]);

  // Local state for favorite items with product data
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  // Multi-select state
  const [selectedProducts, setSelectedProducts] = useState<
    Record<string, boolean>
  >({});
  const [isAllSelected, setIsAllSelected] = useState(false);

  const [isClearing, setIsClearing] = useState(false);
  const [removingItems, setRemovingItems] = useState<Set<string>>(new Set());
  const [showBasketSelector, setShowBasketSelector] = useState(false);
  const [showCreateBasket, setShowCreateBasket] = useState(false);
  const [newBasketName, setNewBasketName] = useState("");
  const [isCreatingBasket, setIsCreatingBasket] = useState(false);

  // Action states
  const [isTransferringToBasket, setIsTransferringToBasket] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsAnimating(true), 10);
    } else {
      setIsAnimating(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    // Check if it's mobile (you can adjust the breakpoint as needed)
    const isMobile = window.innerWidth < 768; // md breakpoint
    
    if (isMobile && isOpen) {
      // Disable scrolling when drawer is open
      document.body.style.overflow = 'hidden';
      // Prevent scrolling on iOS Safari
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else if (isMobile) {
      // Re-enable scrolling when drawer is closed (only for mobile)
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
  
    // Cleanup function to ensure scrolling is restored
    return () => {
      // Only cleanup if it was mobile when the effect ran
      const wasMobile = window.innerWidth < 768;
      if (wasMobile) {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
      }
    };
  }, [isOpen]);

  // Calculate selected count
  const selectedCount = Object.values(selectedProducts).filter(Boolean).length;

  // Update select all state when individual selections change
  useEffect(() => {
    const totalItems = favoriteItems.filter((item) => item.product).length;
    if (totalItems === 0) {
      setIsAllSelected(false);
      return;
    }

    const selectedCount =
      Object.values(selectedProducts).filter(Boolean).length;
    setIsAllSelected(selectedCount === totalItems && selectedCount > 0);
  }, [selectedProducts, favoriteItems]);

  // Reset selections when basket changes or items change
  useEffect(() => {
    setSelectedProducts({});
    setIsAllSelected(false);
  }, [selectedBasketId, favoriteProductIds]);

  // Load favorite items with their details and product data
  const loadFavoriteItems = useCallback(async () => {
    if (!user) return;

    setIsLoadingItems(true);
    try {
      // Get favorite details from the current collection (default or basket)
      const favCollection = selectedBasketId
        ? collection(
            db,
            "users",
            user.uid,
            "favorite_baskets",
            selectedBasketId,
            "favorites"
          )
        : collection(db, "users", user.uid, "favorites");

      const favSnapshot = await getDocs(favCollection);
      const favoriteDetails = new Map<string, FavoriteDetails>();

      // Build map of productId -> favorite details
      favSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.productId) {
          favoriteDetails.set(data.productId, data);
        }
      });

      // Load product data for current favorites
      const items: FavoriteItem[] = [];
      const productIds = Array.from(favoriteProductIds);

      for (const productId of productIds) {
        const favDetails = favoriteDetails.get(productId) || {};

        const item: FavoriteItem = {
          productId,
          addedAt: favDetails.addedAt || Timestamp.now(),
          quantity: favDetails.quantity || 1,
          selectedColor: favDetails.selectedColor,
          selectedColorImage: favDetails.selectedColorImage,          
          isLoadingProduct: true,
        };

        items.push(item);
      }

      setFavoriteItems(items);

      // Load product data in parallel
      await Promise.all(
        items.map(async (item, index) => {
          try {
            const product = await loadProductData(item.productId);
            setFavoriteItems((prevItems) => {
              const newItems = [...prevItems];
              if (
                newItems[index] &&
                newItems[index].productId === item.productId
              ) {
                newItems[index] = {
                  ...newItems[index],
                  product,
                  isLoadingProduct: false,
                  loadError: !product,
                };
              }
              return newItems;
            });
          } catch (error) {
            console.error(`Error loading product ${item.productId}:`, error);
            setFavoriteItems((prevItems) => {
              const newItems = [...prevItems];
              if (
                newItems[index] &&
                newItems[index].productId === item.productId
              ) {
                newItems[index] = {
                  ...newItems[index],
                  isLoadingProduct: false,
                  loadError: true,
                };
              }
              return newItems;
            });
          }
        })
      );
    } catch (error) {
      console.error("Error loading favorite items:", error);
      showErrorToast(t("failedToLoadFavorites"));
    } finally {
      setIsLoadingItems(false);
    }
  }, [user, favoriteProductIds, selectedBasketId, showErrorToast, t]);

  // Load favorite items with product data when favorites change
  useEffect(() => {
    if (user && favoriteProductIds.size > 0) {
      loadFavoriteItems();
    } else {
      setFavoriteItems([]);
    }
  }, [user, favoriteProductIds, selectedBasketId, loadFavoriteItems]);

  // Load product data from either products or shop_products collection
  const loadProductData = async (
    productId: string
  ): Promise<Product | undefined> => {
    try {
      // Try products collection first
      const productDoc = await getDoc(doc(db, "products", productId));
      if (productDoc.exists()) {
        return { id: productDoc.id, ...productDoc.data() };
      }

      // Try shop_products collection
      const shopProductDoc = await getDoc(doc(db, "shop_products", productId));
      if (shopProductDoc.exists()) {
        return { id: shopProductDoc.id, ...shopProductDoc.data() };
      }

      return undefined;
    } catch (error) {
      console.error(`Error loading product ${productId}:`, error);
      return undefined;
    }
  };

  // Handle individual product selection
  const handleProductSelect = useCallback(
    (productId: string, selected: boolean) => {
      setSelectedProducts((prev) => ({
        ...prev,
        [productId]: selected,
      }));
    },
    []
  );

  // Handle select all toggle
  const handleSelectAll = useCallback(() => {
    const validItems = favoriteItems.filter((item) => item.product);
    const newSelectionState = !isAllSelected;

    const newSelections: Record<string, boolean> = {};
    validItems.forEach((item) => {
      newSelections[item.productId] = newSelectionState;
    });

    setSelectedProducts(newSelections);
    setIsAllSelected(newSelectionState);
  }, [favoriteItems, isAllSelected]);

  // Handle item removal with optimistic UI
  const handleRemoveItem = async (productId: string) => {
    setRemovingItems((prev) => new Set(prev).add(productId));
    try {
      await removeFromFavorites(productId);
      // Remove from selection if it was selected
      setSelectedProducts((prev) => {
        const newState = { ...prev };
        delete newState[productId];
        return newState;
      });
    } catch (error) {
      console.error("Failed to remove item:", error);
      showErrorToast(t("failedToRemoveFromFavorites"));
    } finally {
      setRemovingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    }
  };

  // Handle clear all favorites
  const handleClearFavorites = async () => {
    if (favoriteCount === 0) return;

    setIsClearing(true);
    try {
      const productIds = Array.from(favoriteProductIds);
      await removeMultipleFromFavorites(productIds);
      setSelectedProducts({});
      setIsAllSelected(false);
    } catch (error) {
      console.error("Failed to clear favorites:", error);
      showErrorToast(t("failedToClearFavorites"));
    } finally {
      setIsClearing(false);
    }
  };

  // Handle basket creation
  const handleCreateBasket = async () => {
    if (!newBasketName.trim()) return;

    setIsCreatingBasket(true);
    try {
      const result = await createFavoriteBasket(newBasketName.trim());
      if (result === "Basket created successfully") {
        setNewBasketName("");
        setShowCreateBasket(false);
      } else {
        showErrorToast(result);
      }
    } catch (error) {
      console.error("Failed to create basket:", error);
      showErrorToast(t("failedToCreateBasket"));
    } finally {
      setIsCreatingBasket(false);
    }
  };

  // Handle basket deletion
  const handleDeleteBasket = async (basketId: string) => {
    try {
      await deleteFavoriteBasket(basketId);
    } catch (error) {
      console.error("Failed to delete basket:", error);
      showErrorToast(t("failedToDeleteBasket"));
    }
  };

  // Handle basket selection
  const handleBasketSelect = (basketId: string | null) => {
    setSelectedBasket(basketId);
    setShowBasketSelector(false);
  };

  // Handle transfer to basket
  const handleTransferToBasket = async () => {
    const selectedProductIds = Object.entries(selectedProducts)
      .filter(([, selected]) => selected)
      .map(([productId]) => productId);

    if (selectedProductIds.length === 0) return;

    // Check if user has baskets
    if (favoriteBaskets.length === 0) {
      // Show create basket dialog
      setShowCreateBasket(true);
      return;
    }

    setIsTransferringToBasket(true);
    try {
      let targetBasketId: string;

      if (favoriteBaskets.length === 1) {
        // Only one basket, use it
        targetBasketId = favoriteBaskets[0].id;
      } else {
        // Multiple baskets, show selection dialog
        const basketId = await showBasketSelectionDialog();
        if (!basketId) {
          setIsTransferringToBasket(false);
          return;
        }
        targetBasketId = basketId;
      }

      await transferFavoritesToBasket(selectedProductIds, targetBasketId);

      // Clear selections
      setSelectedProducts({});
      setIsAllSelected(false);
    } catch (error) {
      console.error("Failed to transfer to basket:", error);
      showErrorToast(t("failedToTransferToBasket"));
    } finally {
      setIsTransferringToBasket(false);
    }
  };

  // Show basket selection dialog (you'll need to implement this based on your UI library)
  const showBasketSelectionDialog = (): Promise<string | null> => {
    return new Promise((resolve) => {
      // This is a simple implementation - you might want to use a proper modal/dialog
      const basketNames = favoriteBaskets
        .map((b) => `${b.name} (${b.id})`)
        .join("\n");
      const selected = window.prompt(
        `${t("selectBasket")}:\n${basketNames}\n\n${t("enterBasketName")}:`
      );

      if (!selected) {
        resolve(null);
        return;
      }

      const basket = favoriteBaskets.find((b) => b.name === selected.trim());
      resolve(basket ? basket.id : null);
    });
  };

  // Handle add to cart
  const handleAddToCart = async () => {
    const selectedProductIds = Object.entries(selectedProducts)
      .filter(([, selected]) => selected)
      .map(([productId]) => productId);

    if (selectedProductIds.length === 0) return;

    setIsAddingToCart(true);
    try {
      // Here you would integrate with your cart provider
      // For now, just log the action
      console.log("Adding to cart:", selectedProductIds);

      // Get the selected items with their attributes
      const selectedItems = favoriteItems.filter(
        (item) => selectedProductIds.includes(item.productId) && item.product
      );

      // Add each item to cart with its stored attributes
      for (const item of selectedItems) {
        // You'll need to implement this based on your cart provider
        console.log("Adding item to cart:", {
          productId: item.productId,
          quantity: item.quantity,
          selectedColor: item.selectedColor,
          selectedColorImage: item.selectedColorImage,          
        });
      }

      showSuccessToast(`${selectedProductIds.length} ${t("itemsAddedToCart")}`);

      // Clear selections
      setSelectedProducts({});
      setIsAllSelected(false);
    } catch (error) {
      console.error("Failed to add to cart:", error);
      showErrorToast(t("failedToAddToCart"));
    } finally {
      setIsAddingToCart(false);
    }
  };

  // Handle navigation to login
  const handleGoToLogin = () => {
    onClose();
    router.push("/login");
  };

  // Backdrop click handler
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!shouldRender) return null;

  const currentBasketName = selectedBasketId
    ? favoriteBaskets.find((b) => b.id === selectedBasketId)?.name ||
      t("unknownBasket")
    : t("defaultFavorites");

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleBackdropClick}
      />

      {/* Drawer */}
      <div
        className={`
          absolute right-0 top-0 h-full w-full max-w-md transform transition-transform duration-300 ease-out
          ${isDarkMode ? "bg-gray-900" : "bg-white"}
          shadow-2xl flex flex-col
          ${isAnimating ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header */}
        <div
          className={`
            flex-shrink-0 border-b px-6 py-4
            ${
              isDarkMode
                ? "bg-gray-900 border-gray-700"
                : "bg-white border-gray-200"
            }
            backdrop-blur-xl bg-opacity-95
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                className={`
                  p-2 rounded-full
                  ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
                `}
              >
                <Heart
                  size={20}
                  className={isDarkMode ? "text-gray-300" : "text-gray-700"}
                />
              </div>
              <div>
                <h2
                  className={`
                    text-lg font-bold
                    ${isDarkMode ? "text-white" : "text-gray-900"}
                  `}
                >
                  {t("title")}
                </h2>
                {user && favoriteCount > 0 && (
                  <p
                    className={`
                      text-sm
                      ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                    `}
                  >
                    {favoriteCount} {t("itemsCount")}
                    {selectedCount > 0 && (
                      <span className="ml-2 text-orange-500 font-medium">
                        ({selectedCount} {t("selected")})
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Select All Toggle - Only show when there are items */}
              {user && favoriteCount > 0 && (
                <button
                  onClick={handleSelectAll}
                  className={`
                    p-2 rounded-full transition-colors duration-200
                    ${
                      isDarkMode
                        ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                        : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                    }
                  `}
                  title={isAllSelected ? t("deselectAll") : t("selectAll")}
                >
                  {isAllSelected ? (
                    <CheckCircle size={20} className="text-orange-500" />
                  ) : (
                    <Circle size={20} />
                  )}
                </button>
              )}

              <button
                onClick={onClose}
                className={`
                  p-2 rounded-full transition-colors duration-200
                  ${
                    isDarkMode
                      ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                      : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                  }
                `}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Basket Selector */}
          {user && (
            <div className="mt-4 space-y-3">
              <div className="relative">
                <button
                  onClick={() => setShowBasketSelector(!showBasketSelector)}
                  className={`
                    w-full flex items-center justify-between px-3 py-2 rounded-lg border
                    ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700"
                        : "bg-gray-50 border-gray-300 text-gray-700 hover:bg-gray-100"
                    }
                    transition-colors duration-200
                  `}
                >
                  <div className="flex items-center space-x-2">
                    <Folder size={16} />
                    <span className="text-sm font-medium">
                      {currentBasketName}
                    </span>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`transform transition-transform duration-200 ${
                      showBasketSelector ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {/* Basket Dropdown */}
                {showBasketSelector && (
                  <div
                    className={`
                      absolute top-full left-0 right-0 mt-1 border rounded-lg shadow-lg z-20
                      ${
                        isDarkMode
                          ? "bg-gray-800 border-gray-600"
                          : "bg-white border-gray-300"
                      }
                      max-h-48 overflow-y-auto
                    `}
                  >
                    {/* Default Favorites */}
                    <button
                      onClick={() => handleBasketSelect(null)}
                      className={`
                        w-full flex items-center space-x-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700
                        ${
                          !selectedBasketId
                            ? "bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                            : isDarkMode
                            ? "text-gray-300"
                            : "text-gray-700"
                        }
                      `}
                    >
                      <Heart size={16} />
                      <span className="text-sm">{t("defaultFavorites")}</span>
                    </button>

                    {/* Basket List */}
                    {favoriteBaskets.map((basket) => (
                      <div key={basket.id} className="flex items-center group">
                        <button
                          onClick={() => handleBasketSelect(basket.id)}
                          className={`
                            flex-1 flex items-center space-x-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700
                            ${
                              selectedBasketId === basket.id
                                ? "bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                                : isDarkMode
                                ? "text-gray-300"
                                : "text-gray-700"
                            }
                          `}
                        >
                          <Folder size={16} />
                          <span className="text-sm truncate">
                            {basket.name}
                          </span>
                        </button>
                        <button
                          onClick={() => handleDeleteBasket(basket.id)}
                          className={`
                            p-2 opacity-0 group-hover:opacity-100 transition-opacity
                            ${
                              isDarkMode
                                ? "text-red-400 hover:text-red-300"
                                : "text-red-500 hover:text-red-600"
                            }
                          `}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}

                    {/* Create New Basket */}
                    <button
                      onClick={() => {
                        setShowCreateBasket(true);
                        setShowBasketSelector(false);
                      }}
                      className={`
                        w-full flex items-center space-x-2 px-3 py-2 text-left border-t
                        ${
                          isDarkMode
                            ? "border-gray-600 text-blue-400 hover:bg-gray-700"
                            : "border-gray-200 text-blue-600 hover:bg-gray-50"
                        }
                      `}
                    >
                      <FolderPlus size={16} />
                      <span className="text-sm">{t("createNewBasket")}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Clear Favorites Button */}
              {favoriteCount > 0 && (
                <button
                  onClick={handleClearFavorites}
                  disabled={isClearing}
                  className={`
                    flex items-center space-x-2 text-sm transition-colors duration-200
                    ${
                      isDarkMode
                        ? "text-red-400 hover:text-red-300"
                        : "text-red-500 hover:text-red-600"
                    }
                    ${isClearing ? "opacity-50 cursor-not-allowed" : ""}
                  `}
                >
                  {isClearing ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                  <span>
                    {isClearing ? t("clearing") : t("clearFavorites")}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Create Basket Modal */}
        {showCreateBasket && (
          <div className="absolute inset-x-0 top-0 bg-black/50 backdrop-blur-sm z-30 flex items-center justify-center p-6">
            <div
              className={`
                w-full max-w-sm rounded-xl p-6
                ${isDarkMode ? "bg-gray-800" : "bg-white"}
                shadow-2xl
              `}
            >
              <h3
                className={`
                  text-lg font-bold mb-4
                  ${isDarkMode ? "text-white" : "text-gray-900"}
                `}
              >
                {t("createNewBasket")}
              </h3>
              <input
                type="text"
                value={newBasketName}
                onChange={(e) => setNewBasketName(e.target.value)}
                placeholder={t("enterBasketName")}
                className={`
                  w-full px-3 py-2 rounded-lg border mb-4
                  ${
                    isDarkMode
                      ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                  }
                  focus:ring-2 focus:ring-orange-500 focus:border-transparent
                `}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    handleCreateBasket();
                  }
                }}
              />
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowCreateBasket(false);
                    setNewBasketName("");
                  }}
                  className={`
                    flex-1 py-2 px-4 rounded-lg
                    ${
                      isDarkMode
                        ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }
                    transition-colors duration-200
                  `}
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleCreateBasket}
                  disabled={!newBasketName.trim() || isCreatingBasket}
                  className="
                    flex-1 py-2 px-4 rounded-lg
                    bg-gradient-to-r from-orange-500 to-pink-500 text-white
                    hover:from-orange-600 hover:to-pink-600
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-all duration-200
                  "
                >
                  {isCreatingBasket ? t("creating") : t("create")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content - This is the main scrollable area */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Not Authenticated State */}
          {!user ? (
            <div className="flex flex-col items-center justify-center h-full px-6 py-12">
              <div
                className={`
                  w-20 h-20 rounded-full flex items-center justify-center mb-6
                  ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
                `}
              >
                <User
                  size={32}
                  className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                />
              </div>
              <h3
                className={`
                  text-xl font-bold mb-3 text-center
                  ${isDarkMode ? "text-white" : "text-gray-900"}
                `}
              >
                {t("loginRequired")}
              </h3>
              <p
                className={`
                  text-center mb-8 leading-relaxed
                  ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                `}
              >
                {t("loginToViewFavorites")}
              </p>
              <button
                onClick={handleGoToLogin}
                className="
                  flex items-center space-x-2 px-6 py-3 rounded-full
                  bg-gradient-to-r from-orange-500 to-pink-500 text-white
                  hover:from-orange-600 hover:to-pink-600
                  transition-all duration-200 shadow-lg hover:shadow-xl
                  active:scale-95
                "
              >
                <LogIn size={18} />
                <span className="font-medium">
                  {t("login")}
                </span>
              </button>
            </div>
          ) : /* Loading State */ isLoading || isLoadingItems ? (
            <div className="flex flex-col items-center justify-center h-full px-6 py-12">
              <div className="animate-spin w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full mb-4"></div>
              <p
                className={`
                  text-center
                  ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                `}
              >
                {t("loading")}
              </p>
            </div>
          ) : /* Empty Favorites State */ favoriteCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 py-12">
              <div
                className={`
                  w-20 h-20 rounded-full flex items-center justify-center mb-6
                  ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
                `}
              >
                <Heart
                  size={32}
                  className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                />
              </div>
              <h3
                className={`
                  text-xl font-bold mb-3 text-center
                  ${isDarkMode ? "text-white" : "text-gray-900"}
                `}
              >
                {t("emptyFavorites")}
              </h3>
              <p
                className={`
                  text-center mb-8 leading-relaxed
                  ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                `}
              >
                {t("emptyFavoritesDescription")}
              </p>
              <button
                onClick={() => {
                  onClose();
                  router.push("/");
                }}
                className="
                  flex items-center space-x-2 px-6 py-3 rounded-full
                  bg-gradient-to-r from-orange-500 to-pink-500 text-white
                  hover:from-orange-600 hover:to-pink-600
                  transition-all duration-200 shadow-lg hover:shadow-xl
                  active:scale-95
                "
              >
                <ShoppingBag size={18} />
                <span className="font-medium">
                  {t("startShopping")}
                </span>
              </button>
            </div>
          ) : (
            /* Favorite Items */
            <div className="px-4 py-4">
              <div className="space-y-4">
                {favoriteItems.map((item) => {
                  const isRemoving = removingItems.has(item.productId);
                  const product = item.product;
                  const isSelected = selectedProducts[item.productId] || false;

                  return (
                    <div
                      key={item.productId}
                      className={`
                        transition-all duration-300 transform
                        ${
                          isRemoving || item.isLoadingProduct
                            ? "opacity-50 scale-95"
                            : "opacity-100 scale-100"
                        }
                      `}
                    >
                      <div
                        className={`
                          rounded-xl border p-3 transition-all duration-200 relative
                          ${
                            isDarkMode
                              ? "bg-gray-800 border-gray-700 hover:border-gray-600"
                              : "bg-gray-50 border-gray-200 hover:border-gray-300"
                          }
                          ${item.isLoadingProduct ? "border-dashed" : ""}
                          ${
                            isSelected
                              ? "ring-2 ring-orange-500 border-orange-500"
                              : ""
                          }
                        `}
                      >
                        {/* Selection Toggle - Only show when product is loaded */}
                        {product && (
                          <button
                            onClick={() =>
                              handleProductSelect(item.productId, !isSelected)
                            }
                            className={`
                              absolute top-2 left-2 z-10 p-1 rounded-full transition-colors duration-200
                              ${
                                isDarkMode
                                  ? "bg-gray-900/80 hover:bg-gray-900"
                                  : "bg-white/80 hover:bg-white"
                              }
                              backdrop-blur-sm shadow-sm
                            `}
                          >
                            {isSelected ? (
                              <CheckCircle
                                size={20}
                                className="text-orange-500"
                              />
                            ) : (
                              <Circle
                                size={20}
                                className={
                                  isDarkMode ? "text-gray-400" : "text-gray-500"
                                }
                              />
                            )}
                          </button>
                        )}

                        {product ? (
                          <ProductCard3
                            imageUrl={
                              item.selectedColorImage ||
                              product.imageUrls?.[0] ||
                              "https://via.placeholder.com/200"
                            }
                            colorImages={product.colorImages || {}}
                            selectedColor={item.selectedColor}
                            selectedColorImage={item.selectedColorImage}
                            productName={product.productName || "Product"}
                            brandModel={
                              product.brandModel ||
                              product.sellerName ||
                              "Brand"
                            }
                            price={product.price || 0}
                            currency={product.currency || "TL"}
                            averageRating={product.averageRating || 0}
                            quantity={item.quantity}
                            maxQuantityAllowed={0} // No quantity controls for favorites
                            isDarkMode={isDarkMode}
                            scaleFactor={0.9}
                          />
                        ) : (
                          <div className="flex items-center justify-center h-24">
                            {item.isLoadingProduct ? (
                              <div className="animate-spin w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full"></div>
                            ) : (
                              <div className="text-center">
                                <AlertCircle
                                  className="mx-auto mb-2 text-red-500"
                                  size={24}
                                />
                                <p className="text-sm text-gray-500">
                                  {t("productLoadError")}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Action Buttons - Hide when product is selected for batch operations */}
                        {product && !isSelected && (
                          <div className="mt-3 flex justify-between">
                            <button
                              onClick={() => {
                                // Add to cart functionality
                                console.log("Add to cart:", item.productId);
                              }}
                              className={`
                                flex items-center space-x-2 px-3 py-2 rounded-lg text-sm
                                transition-colors duration-200
                                ${
                                  isDarkMode
                                    ? "text-green-400 hover:text-green-300 hover:bg-green-900/20"
                                    : "text-green-600 hover:text-green-700 hover:bg-green-50"
                                }
                              `}
                            >
                              <ShoppingCart size={14} />
                              <span>{t("addToCart")}</span>
                            </button>

                            <button
                              onClick={() => handleRemoveItem(item.productId)}
                              disabled={isRemoving}
                              className={`
                                flex items-center space-x-2 px-3 py-2 rounded-lg text-sm
                                transition-colors duration-200
                                ${
                                  isDarkMode
                                    ? "text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                    : "text-red-500 hover:text-red-600 hover:bg-red-50"
                                }
                                ${
                                  isRemoving
                                    ? "opacity-50 cursor-not-allowed"
                                    : ""
                                }
                              `}
                            >
                              {isRemoving ? (
                                <RefreshCw size={14} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                              <span>
                                {isRemoving ? t("removing") : t("remove")}
                              </span>
                            </button>
                          </div>
                        )}

                        {/* Loading/Error States */}
                        {item.isLoadingProduct && (
                          <div className="mt-2 flex items-center space-x-2 text-xs text-gray-500">
                            <div className="animate-spin w-3 h-3 border border-gray-400 border-t-transparent rounded-full"></div>
                            <span>{t("loadingProductInfo")}</span>
                          </div>
                        )}

                        {item.loadError && (
                          <div className="mt-2 flex items-center space-x-2 text-xs text-red-500">
                            <AlertCircle size={12} />
                            <span>{t("productInfoError")}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Action Buttons - Show only when products are selected */}
        {user && selectedCount > 0 && (
          <div
            className={`
              flex-shrink-0 border-t px-6 py-4
              ${
                isDarkMode
                  ? "bg-gray-900 border-gray-700"
                  : "bg-white border-gray-200"
              }
              backdrop-blur-xl bg-opacity-95
            `}
          >
            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              {/* Transfer to Basket Button - Only show if not in basket mode */}
              {!selectedBasketId ? (
                <button
                  onClick={handleTransferToBasket}
                  disabled={isTransferringToBasket}
                  className={`
                    py-3 px-4 rounded-xl font-medium transition-all duration-200
                    ${
                      isDarkMode
                        ? "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                    }
                    active:scale-95 flex items-center justify-center space-x-2
                    ${
                      isTransferringToBasket
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }
                  `}
                >
                  {isTransferringToBasket ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <Folder size={16} />
                  )}
                  <span>
                    {isTransferringToBasket
                      ? t("transferring")
                      : `${t("addToBasket")} (${selectedCount})`}
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    // Remove selected from basket logic here
                    console.log(
                      "Remove from basket:",
                      Object.entries(selectedProducts)
                        .filter(([, selected]) => selected)
                        .map(([productId]) => productId)
                    );
                  }}
                  className={`
                    py-3 px-4 rounded-xl font-medium transition-all duration-200
                    ${
                      isDarkMode
                        ? "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                    }
                    active:scale-95 flex items-center justify-center space-x-2
                  `}
                >
                  <ArrowRight size={16} />
                  <span>{t("removeFromBasket")} ({selectedCount})</span>
                </button>
              )}

              {/* Add to Cart Button */}
              <button
                onClick={handleAddToCart}
                disabled={isAddingToCart}
                className="
                  py-3 px-4 rounded-xl font-medium transition-all duration-200
                  bg-gradient-to-r from-orange-500 to-pink-500 text-white
                  hover:from-orange-600 hover:to-pink-600
                  shadow-lg hover:shadow-xl active:scale-95
                  flex items-center justify-center space-x-2
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {isAddingToCart ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <ShoppingCart size={16} />
                )}
                <span>
                  {isAddingToCart
                    ? t("adding")
                    : `${t("addToCart")} (${selectedCount})`}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};