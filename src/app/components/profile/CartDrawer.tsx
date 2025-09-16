"use client";

import React, { 
  useEffect, 
  useState, 
  useCallback, 
  useMemo, 
  useRef,
  useLayoutEffect 
} from "react";
import {
  X,
  ShoppingCart,
  Trash2,
  ArrowRight,
  ShoppingBag,
  User,
  LogIn,
  
  AlertCircle,
  RefreshCw,
  CheckCircle,
  Check,
  
  Plus,
  Minus,
  Star,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { Firestore } from "firebase/firestore";
import { CompactBundleWidget } from "../CompactBundle";

// Types matching Flutter implementation
interface User {
  uid: string;
  email?: string;
  displayName?: string;
  [key: string]: unknown;
}

interface SalePreferences {
  discountThreshold?: number;
  discountPercentage?: number;
  maxQuantity?: number;
}

// Firebase timestamp type - can be Date, number (milliseconds), or Firebase Timestamp
type TimestampValue = Date | number | { seconds: number; nanoseconds: number };

interface Product {
  id: string;
  productName: string;
  price: number;
  currency: string;
  imageUrls: string[];
  colorImages?: Record<string, string[]>;
  averageRating?: number;
  quantity: number;
  colorQuantities: Record<string, number>;
  brandModel?: string;
  [key: string]: unknown;
}

interface CartItem {
  productId: string;
  cartData: {
    quantity: number;
    addedAt: TimestampValue;
    sellerId: string;
    sellerName: string;
    isShop: boolean;
    selectedColor?: string;
    selectedSize?: string;
    [key: string]: unknown;
  };
  product: Product | null;
  quantity: number;
  sellerName: string;
  sellerId: string;
  isShop: boolean;
  isOptimistic?: boolean;
  isLoadingProduct?: boolean;
  loadError?: boolean;
  salePreferences?: SalePreferences | null;
  selectedColorImage?: string;
  [key: string]: unknown;
}

interface RelatedProduct extends Product {
  // Additional fields for related products if needed
}

interface CartTotals {
  subtotal: number;
  total: number;
  currency: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    total: number;
    isBundleItem?: boolean;
  }>;
}

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
  localization?: (key: string) => string;
  user: User | null;
  
  // Cart context props - matching Flutter CartProvider
  cartItems: CartItem[];
  cartCount: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  isInitialized: boolean;
  
  // Cart methods
  updateQuantity: (productId: string, newQuantity: number) => Promise<string>;
  removeFromCart: (productId: string) => Promise<string>;
  clearCart: () => Promise<string>;
  initializeCartIfNeeded: () => Promise<void>;
  loadMoreItems: () => Promise<void>;
  calculateCartTotals: (selectedProductIds?: string[]) => Promise<CartTotals>;
  removeMultipleFromCart: (productIds: string[]) => Promise<string>;
  refresh: () => Promise<void>;
  
  // Utility methods
  isOptimisticallyRemoving: (productId: string) => boolean;
  
  // Optional props
  db?: Firestore; // Firestore instance for CompactBundleWidget
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  isDarkMode = false,
  localization = (key: string) => key,
  user,
  cartItems,
  cartCount,
  isLoading,
  isLoadingMore,
  hasMore,
  isInitialized,
  updateQuantity,
  removeFromCart,
  clearCart,
  initializeCartIfNeeded,
  loadMoreItems,
  calculateCartTotals,
  removeMultipleFromCart,
  refresh,
  isOptimisticallyRemoving,
  db,
}) => {
  const router = useRouter();
  
  // State matching Flutter implementation
  const [selectedProducts, setSelectedProducts] = useState<Record<string, boolean>>({});
  const [relatedProducts, setRelatedProducts] = useState<RelatedProduct[]>([]);
  const [isRelatedLoading, setIsRelatedLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  
  // Refs for performance
  const lastProcessedProductIds = useRef<Set<string>>(new Set());
  const relatedProductsTimer = useRef<NodeJS.Timeout>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Constants matching Flutter
  const REFRESH_COOLDOWN = 30000; // 30 seconds
  const RELATED_PRODUCTS_DELAY = 800;
  const MAX_RELATED_PRODUCTS = 20;

  // Translation function - matching Flutter localization
  const t = useCallback((key: string) => {
    try {
      const translation = localization(`CartDrawer.${key}`);
      if (translation && translation !== `CartDrawer.${key}`) {
        return translation;
      }
      
      const directTranslation = localization(key);
      if (directTranslation && directTranslation !== key) {
        return directTranslation;
      }
      
      return key;
    } catch (error) {
      console.warn(`Translation error for key: ${key}`, error);
      return key;
    }
  }, [localization]);

  // Handle drawer animation - matching Flutter behavior
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsAnimating(true), 10);
    } else {
      setIsAnimating(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  // Handle body scroll - matching Flutter modal behavior
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const isMobile = window.innerWidth < 768;
    
    if (isMobile && isOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      const originalPosition = window.getComputedStyle(document.body).position;
      const originalWidth = window.getComputedStyle(document.body).width;
      
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      
      return () => {
        if (isMobile) {
          document.body.style.overflow = originalStyle;
          document.body.style.position = originalPosition;
          document.body.style.width = originalWidth;
        }
      };
    }
  }, [isOpen]);

  // Initialize cart when drawer opens - matching Flutter behavior
  useEffect(() => {
    if (isOpen && user && !isInitialized && !isLoading) {
      initializeCartIfNeeded();
    }
  }, [isOpen, user, isInitialized, isLoading, initializeCartIfNeeded]);

  // Update selected products - matching Flutter implementation
  const updateSelectedProducts = useCallback((items: CartItem[]) => {
    // Add null check at the beginning
    if (!items || !Array.isArray(items)) {
      return;
    }
  
    const currentProductIds = new Set(
      items
        .filter(item => item && item.product) // Add item null check too
        .map(item => item.product!.id)
    );

    // Check if products have actually changed
    const lastIds = lastProcessedProductIds.current;
    if (
      currentProductIds.size === lastIds.size && 
      [...currentProductIds].every(id => lastIds.has(id))
    ) {
      return; // No changes needed
    }

    lastProcessedProductIds.current = currentProductIds;

    // Update selections
    const toRemove: string[] = [];
    const toAdd: Record<string, boolean> = {};

    // Remove selections for products no longer in cart
    Object.keys(selectedProducts).forEach(id => {
      if (!currentProductIds.has(id)) {
        toRemove.push(id);
      }
    });

    // Add selections for new products (default to true)
    currentProductIds.forEach(productId => {
      if (!(productId in selectedProducts)) {
        toAdd[productId] = true;
      }
    });

    // Only update if there are actual changes
    if (toRemove.length > 0 || Object.keys(toAdd).length > 0) {
      setSelectedProducts(prev => {
        const next = { ...prev };
        toRemove.forEach(id => delete next[id]);
        Object.assign(next, toAdd);
        return next;
      });
    }
  }, [selectedProducts]);

  // Update selections when cart items change
  useEffect(() => {
    // Add null check before accessing length
    if (cartItems && Array.isArray(cartItems) && cartItems.length > 0) {
      updateSelectedProducts(cartItems);
    }
  }, [cartItems, updateSelectedProducts]);

  // Load related products with debouncing - matching Flutter implementation
  const loadRelatedProductsUniversal = useCallback(() => {
    if (relatedProductsTimer.current) {
      clearTimeout(relatedProductsTimer.current);
    }

    relatedProductsTimer.current = setTimeout(() => {
      performRelatedProductsLoad();
    }, RELATED_PRODUCTS_DELAY);
  }, []);

  // Perform related products load - matching Flutter logic
  const performRelatedProductsLoad = useCallback(async () => {
    if (isRelatedLoading) return;

    setIsRelatedLoading(true);

    try {
      let products: RelatedProduct[];

      if (user && cartItems.length > 0) {
        products = await fetchRelatedProductsFromCart(cartItems);
      } else {
        products = await fetchTrendingShopProducts();
      }

      setRelatedProducts(products);
    } catch (error) {
      console.error("Error loading related products:", error);
      setRelatedProducts([]);
    } finally {
      setIsRelatedLoading(false);
    }
  }, [isRelatedLoading, user, cartItems]);

  // Fetch trending shop products - simplified version matching Flutter
  const fetchTrendingShopProducts = useCallback(async (): Promise<RelatedProduct[]> => {
    try {
      // This would be your actual implementation
      // For now, returning empty array as placeholder
      return [];
    } catch (error) {
      console.error("Error fetching trending products:", error);
      return [];
    }
  }, []);

  // Fetch related products from cart - matching Flutter implementation
  const fetchRelatedProductsFromCart = useCallback(
    async (items: CartItem[]): Promise<RelatedProduct[]> => {
      try {
        const categories = new Set<string>();
        const subcategories = new Set<string>();
        const excludeProductIds = new Set<string>();

        items.forEach(item => {
          const product = item.product;
          if (!product) return;
          
          if (product.category) categories.add(product.category as string);
          if (product.subcategory) subcategories.add(product.subcategory as string);
          excludeProductIds.add(product.id);
        });

        // Your actual implementation would go here
        // For now, returning empty array as placeholder
        return [];
      } catch (error) {
        console.error("Error fetching related products from cart:", error);
        return fetchTrendingShopProducts();
      }
    },
    [fetchTrendingShopProducts]
  );

  // Load related products on mount
  useEffect(() => {
    loadRelatedProductsUniversal();
    
    return () => {
      if (relatedProductsTimer.current) {
        clearTimeout(relatedProductsTimer.current);
      }
    };
  }, [loadRelatedProductsUniversal]);

  // Handle item removal - matching Flutter behavior
  const handleRemoveItem = useCallback(async (productId: string) => {
    try {
      console.log('CartDrawer - Removing item:', { productId });
      const result = await removeFromCart(productId);
      console.log('CartDrawer - Remove result:', { productId, result });
      
      if (result === "Removed from cart") {
        // Update selection state
        setSelectedProducts(prev => {
          const next = { ...prev };
          delete next[productId];
          return next;
        });
      }
    } catch (error) {
      console.error("CartDrawer - Failed to remove item:", error);
    }
  }, [removeFromCart]);

  // Handle quantity change - matching Flutter implementation
  const handleQuantityChange = useCallback(async (
    productId: string,
    newQuantity: number
  ) => {
    if (newQuantity < 1) {
      await handleRemoveItem(productId);
      return;
    }
    
    try {
      console.log('CartDrawer - Updating quantity:', { productId, newQuantity });
      await updateQuantity(productId, newQuantity);
    } catch (error) {
      console.error("CartDrawer - Failed to update quantity:", error);
    }
  }, [handleRemoveItem, updateQuantity]);

  // Handle clear cart - matching Flutter implementation
  const handleClearCart = useCallback(async () => {
    setIsClearing(true);
    try {
      console.log('CartDrawer - Clearing entire cart');
      const result = await clearCart();
      
      if (result === "Cart is already empty" || result === "Products removed from cart") {
        setSelectedProducts({});
      }
    } catch (error) {
      console.error("CartDrawer - Failed to clear cart:", error);
    } finally {
      setIsClearing(false);
    }
  }, [clearCart]);

  // Delete selected products - matching Flutter implementation
  const deleteSelectedProducts = useCallback(async () => {
    const selectedIds = Object.entries(selectedProducts)
      .filter(([_, selected]) => selected)
      .map(([id]) => id);

    if (selectedIds.length === 0) return;

    try {
      setIsRefreshing(true);
      const result = await removeMultipleFromCart(selectedIds);

      if (result === "Products removed from cart") {
        // Reset selections
        setSelectedProducts(prev => {
          const next = { ...prev };
          selectedIds.forEach(id => next[id] = false);
          return next;
        });
      }
    } catch (error) {
      console.error("Error removing products:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedProducts, removeMultipleFromCart]);

  // Handle refresh - matching Flutter implementation
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      await refresh();
      loadRelatedProductsUniversal();
    } catch (error) {
      console.error("Refresh error:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refresh, loadRelatedProductsUniversal]);

  // Handle checkout - matching Flutter implementation
  const handleCheckout = useCallback(async () => {
    console.log('CartDrawer - Navigating to checkout');
    
    const selectedProductIds = Object.entries(selectedProducts)
      .filter(([_, selected]) => selected)
      .map(([id]) => id);

    if (selectedProductIds.length === 0) {
      return;
    }

    try {
      // Calculate totals
      const totals = await calculateCartTotals(selectedProductIds);
      
      // Prepare items for payment - matching Flutter implementation
      const selectedItems = cartItems
        .filter(item => !item.isOptimistic && 
                      item.product && 
                      !isOptimisticallyRemoving(item.productId) &&
                      selectedProductIds.includes(item.product.id))
        .map(item => {
          const paymentItem = { ...item };
          
          if (item.product) {
            paymentItem.price = item.product.price;
            paymentItem.productName = item.product.productName;
            paymentItem.currency = item.product.currency;
          }
          
          // Remove fields that shouldn't be sent to payment
          const {
            product: _product,
            cartData: _cartData,
            isOptimistic: _isOptimistic,
            isLoadingProduct: _isLoadingProduct,
            loadError: _loadError,
            selectedColorImage: _selectedColorImage,
            ...cleanPaymentItem
          } = paymentItem;
          
          return cleanPaymentItem;
        });

      console.log('CartDrawer - Payment items prepared:', selectedItems);

      // Save to localStorage as backup
      localStorage.setItem('cartItems', JSON.stringify(selectedItems));
      localStorage.setItem('cartTotal', totals.total.toString());
      
      onClose();
      
      // Navigate to payment page
      try {
        const itemsParam = encodeURIComponent(JSON.stringify(selectedItems));
        if (itemsParam.length < 1500) {
          router.push(`/productpayment?items=${itemsParam}&total=${totals.total}`);
        } else {
          router.push(`/productpayment?total=${totals.total}`);
        }
      } catch (error) {
        console.error('Error encoding cart items for URL:', error);
        router.push(`/productpayment?total=${totals.total}`);
      }
    } catch (error) {
      console.error('Failed to process checkout:', error);
    }
  }, [selectedProducts, cartItems, calculateCartTotals, isOptimisticallyRemoving, onClose, router]);

  // Toggle all selection - matching Flutter implementation
  const toggleAllSelection = useCallback(() => {
    const allSelected = cartItems.every(item => {
      const product = item.product;
      if (!product) return false;
      return selectedProducts[product.id] === true;
    });

    const newSelections: Record<string, boolean> = {};
    cartItems.forEach(item => {
      const product = item.product;
      if (product) {
        newSelections[product.id] = !allSelected;
      }
    });

    setSelectedProducts(newSelections);
  }, [cartItems, selectedProducts]);

  // Backdrop click handler
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Calculate selected count
  const selectedCount = useMemo(() => {
    // Add null check for cartItems
    if (!cartItems || !Array.isArray(cartItems)) {
      return 0;
    }
    
    return cartItems.filter(item => {
      const product = item.product;
      return product && selectedProducts[product.id] === true;
    }).length;
  }, [cartItems, selectedProducts]);
  
  // Also update the selectedTotalPrice useMemo:
  const selectedTotalPrice = useMemo(() => {
    // Add null check for cartItems
    if (!cartItems || !Array.isArray(cartItems)) {
      return 0;
    }
    
    return cartItems.reduce((total, item) => {
      if (item.product && 
          selectedProducts[item.product.id] && 
          !item.isOptimistic && 
          !isOptimisticallyRemoving(item.productId)) {
        return total + item.product.price * item.quantity;
      }
      return total;
    }, 0);
  }, [cartItems, selectedProducts, isOptimisticallyRemoving]);

  // Format dynamic attributes - matching Flutter implementation
  const formatItemAttributes = useCallback((item: CartItem) => {
    const attributes: Record<string, unknown> = {};
    const excludedKeys = [
      'productId', 'cartData', 'product', 'quantity', 'sellerName', 
      'sellerId', 'isShop', 'isOptimistic', 'isLoadingProduct', 
      'loadError', 'selectedColor', 'selectedColorImage', 'gender'
    ];

    // Collect all non-excluded attributes
    Object.entries(item).forEach(([key, value]) => {
      if (!excludedKeys.includes(key) && 
          value !== undefined && 
          value !== null && 
          value !== '' && 
          typeof value !== 'boolean') {
        attributes[key] = value;
      }
    });

    // Handle selected color separately
    if (typeof item.selectedColor === 'string' && item.selectedColor !== 'default') {
      attributes['selectedColor'] = item.selectedColor;
    }

    if (Object.keys(attributes).length === 0) return '';

    // Simple display - in a real app you'd use proper localization
    const displayValues: string[] = [];
    Object.entries(attributes).forEach(([key, value]) => {
      if (typeof value === 'string' && value.trim() !== '') {
        displayValues.push(`${key}: ${value}`);
      }
    });

    return displayValues.join(', ');
  }, []);

  // Handle scroll for infinite loading
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const { scrollTop, scrollHeight, clientHeight } = container;
    
    if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !isLoadingMore) {
      loadMoreItems();
    }
  }, [hasMore, isLoadingMore, loadMoreItems]);

  if (!shouldRender) return null;

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
          shadow-2xl
          ${isAnimating ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header - matching Flutter AppBar */}
        <div
          className={`
            sticky top-0 z-10 border-b px-6 py-4
            ${isDarkMode ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}
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
                <ShoppingCart
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
                  {t("myCart")}
                </h2>
                {user && cartCount > 0 && (
                  <p
                    className={`
                      text-sm
                      ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                    `}
                  >
                    {cartCount} {t("itemsCount")}
                  </p>
                )}
              </div>
            </div>

            {/* Action buttons - matching Flutter AppBar actions */}
            <div className="flex items-center space-x-2">
              {/* Select All / Deselect All */}
              {user && cartCount > 0 && (
                <button
                  onClick={toggleAllSelection}
                  className={`
                    p-2 rounded-full transition-colors duration-200
                    ${isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-100"}
                  `}
                  title={t("toggleAllSelection")}
                >
                  <div
                    className={`
                      w-5 h-5 rounded border-2 flex items-center justify-center
                      ${selectedCount === cartCount
                        ? "bg-green-500 border-green-500"
                        : "border-gray-400"
                      }
                    `}
                  >
                    {selectedCount === cartCount && (
                      <Check size={12} className="text-white" />
                    )}
                  </div>
                </button>
              )}

              {/* Delete selected */}
              {selectedCount > 0 && (
                <button
                  onClick={deleteSelectedProducts}
                  disabled={isRefreshing}
                  className={`
                    p-2 rounded-full transition-colors duration-200
                    ${isDarkMode 
                      ? "hover:bg-red-900/20 text-red-400" 
                      : "hover:bg-red-50 text-red-500"
                    }
                    ${isRefreshing ? "opacity-50 cursor-not-allowed" : ""}
                  `}
                  title={t("deleteSelected")}
                >
                  {isRefreshing ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              )}

              {/* Close button */}
              <button
                onClick={onClose}
                className={`
                  p-2 rounded-full transition-colors duration-200
                  ${isDarkMode
                    ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                    : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                  }
                `}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Clear Cart Button */}
          {user && cartCount > 0 && (
            <div className="mt-4">
              <button
                onClick={handleClearCart}
                disabled={isClearing}
                className={`
                  flex items-center space-x-2 text-sm transition-colors duration-200
                  ${isDarkMode
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
                  {isClearing ? t("clearing") : t("clearCart")}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-col h-full">
          <div 
            className="flex-1 overflow-y-auto"
            ref={scrollContainerRef}
            onScroll={handleScroll}
          >
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
                  {t("noLoggedInForCart")}
                </h3>
                <p
                  className={`
                    text-center mb-8 leading-relaxed
                    ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                  `}
                >
                  {t("loginToViewCart")}
                </p>
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      onClose();
                      router.push("/login");
                    }}
                    className="
                      px-6 py-3 rounded-full bg-orange-500 text-white
                      hover:bg-orange-600 transition-all duration-200 
                      shadow-lg hover:shadow-xl active:scale-95
                      flex items-center space-x-2
                    "
                  >
                    <LogIn size={18} />
                    <span className="font-medium">{t("login2")}</span>
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      router.push("/register");
                    }}
                    className={`
                      px-6 py-3 rounded-full border-2 border-orange-500 
                      text-orange-500 hover:bg-orange-50 transition-all duration-200
                      flex items-center space-x-2
                      ${isDarkMode ? "hover:bg-orange-900/20" : "hover:bg-orange-50"}
                    `}
                  >
                    <span className="font-medium">{t("register")}</span>
                  </button>
                </div>
              </div>
            ) : /* Loading State */ isLoading && !isInitialized ? (
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
            ) : /* Empty Cart State */ cartCount === 0 ? (
              <div className="flex flex-col h-full">
                <div className="flex-2 flex flex-col items-center justify-center px-6 py-12">
                  <div className="w-32 h-32 bg-gray-100 rounded-full mb-6 flex items-center justify-center">
                    <img 
                      src="/empty-cart.png" 
                      alt="Empty cart"
                      className="w-32 h-32"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling!.classList.remove('hidden');
                      }}
                    />
                    <ShoppingBag
                      size={32}
                      className={`hidden ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    />
                  </div>
                  <h3
                    className={`
                      text-xl font-bold mb-3 text-center
                      ${isDarkMode ? "text-white" : "text-gray-900"}
                    `}
                  >
                    {t("emptyCartPlaceholderText")}
                  </h3>
                  <button
                    onClick={() => {
                      onClose();
                      router.push("/");
                    }}
                    className="
                      px-8 py-3 rounded-full bg-orange-500 text-white
                      hover:bg-orange-600 transition-all duration-200 
                      shadow-lg hover:shadow-xl active:scale-95
                      flex items-center space-x-2 font-semibold
                    "
                  >
                    <span>{t("discover")}</span>
                  </button>
                </div>
                
                {/* Related Products Section - matching Flutter */}
                <div className="flex-3 overflow-y-auto">
                  <RelatedProductsSection 
                    relatedProducts={relatedProducts}
                    isRelatedLoading={isRelatedLoading}
                    isDarkMode={isDarkMode}
                    t={t}
                    onClose={onClose}
                    router={router}
                  />
                </div>
              </div>
            ) : (
              /* Cart Items - matching Flutter implementation */
              <div className="px-4 py-4 space-y-4">
                {cartItems.map((item, index) => (
                  <CartItemCard
                    key={item.productId}
                    item={item}
                    index={index}
                    isSelected={selectedProducts[item.product?.id || ''] || false}
                    isDarkMode={isDarkMode}
                    t={t}
                    db={db}
                    onSelectionChange={(productId, selected) => {
                      setSelectedProducts(prev => ({
                        ...prev,
                        [productId]: selected,
                      }));
                    }}
                    onQuantityChange={handleQuantityChange}
                    onRemove={handleRemoveItem}
                    isOptimisticallyRemoving={isOptimisticallyRemoving}
                    formatItemAttributes={formatItemAttributes}
                  />
                ))}

                {/* Load More Button */}
                {hasMore && (
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={loadMoreItems}
                      disabled={isLoadingMore}
                      className={`
                        px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200
                        ${isDarkMode
                          ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }
                        ${isLoadingMore ? "opacity-50 cursor-not-allowed" : ""}
                      `}
                    >
                      {isLoadingMore ? (
                        <div className="flex items-center space-x-2">
                          <RefreshCw size={14} className="animate-spin" />
                          <span>{t("loadingMore")}</span>
                        </div>
                      ) : (
                        t("loadMore")
                      )}
                    </button>
                  </div>
                )}

                {/* Related Products at bottom */}
                <RelatedProductsSection 
                  relatedProducts={relatedProducts}
                  isRelatedLoading={isRelatedLoading}
                  isDarkMode={isDarkMode}
                  t={t}
                  onClose={onClose}
                  router={router}
                />
              </div>
            )}
          </div>

          {/* Footer - Show only when there are items - matching Flutter bottom section */}
          {user && selectedCount > 0 && (
            <CheckoutFooter
              selectedCount={selectedCount}
              totalPrice={selectedTotalPrice}
              isDarkMode={isDarkMode}
              t={t}
              onCheckout={handleCheckout}
              onViewCart={() => {
                onClose();
                router.push("/cart");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// Cart Item Card Component - matching Flutter _buildSelectableCartItem
interface CartItemCardProps {
  item: CartItem;
  index: number;
  isSelected: boolean;
  isDarkMode: boolean;
  t: (key: string) => string;
  db?: Firestore;
  onSelectionChange: (productId: string, selected: boolean) => void;
  onQuantityChange: (productId: string, quantity: number) => Promise<void>;
  onRemove: (productId: string) => Promise<void>;
  isOptimisticallyRemoving: (productId: string) => boolean;
  formatItemAttributes: (item: CartItem) => string;
}

const CartItemCard: React.FC<CartItemCardProps> = ({
  item,
  isSelected,
  isDarkMode,
  t,
  db,
  onSelectionChange,
  onQuantityChange,
  onRemove,
  isOptimisticallyRemoving,
  formatItemAttributes,
}) => {
  const product = item.product;
  
  if (!product) {
    return <div className="animate-pulse bg-gray-200 h-32 rounded-lg" />;
  }

  const isRemoving = isOptimisticallyRemoving(item.productId);
  const attributesDisplay = formatItemAttributes(item);

  // Calculate available stock - matching Flutter implementation
  const cartData = item.cartData;
  const selectedColor = cartData.selectedColor;
  
  let availableStock: number;
  if (selectedColor && 
      selectedColor !== "" && 
      selectedColor !== "default" && 
      product.colorQuantities[selectedColor] !== undefined) {
    availableStock = product.colorQuantities[selectedColor] || 0;
  } else {
    availableStock = product.quantity;
  }

  // Get shop ID for bundle check
  const shopId = cartData.sellerId;
  const isShop = cartData.isShop;

  return (
    <div
      className={`
        rounded-xl border p-4 transition-all duration-300 transform
        ${isRemoving || item.isOptimistic
          ? "opacity-50 scale-95"
          : "opacity-100 scale-100"
        }
        ${isDarkMode
          ? "bg-gray-800 border-gray-700 hover:border-gray-600"
          : "bg-gray-50 border-gray-200 hover:border-gray-300"
        }
        ${item.isOptimistic ? "border-dashed" : ""}
      `}
    >
      <div className="flex items-start space-x-3">
        {/* Selection checkbox - matching Flutter _buildModernSelectionCheckbox */}
        <button
          onClick={() => onSelectionChange(product.id, !isSelected)}
          className={`
            w-6 h-6 rounded-full border-2 flex items-center justify-center
            transition-all duration-200 mt-1
            ${isSelected
              ? "bg-green-500 border-green-500"
              : "border-gray-400 hover:border-gray-500"
            }
          `}
        >
          {isSelected && <Check size={14} className="text-white" />}
        </button>

        {/* Product content */}
        <div className="flex-1 min-w-0">
          {/* Product card - matching Flutter ProductCard3 */}
          <div className="flex space-x-3">
            {/* Product image */}
            <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
              {product.imageUrls.length > 0 ? (
                <img
                  src={item.selectedColorImage || product.imageUrls[0]}
                  alt={product.productName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.src = "/placeholder-product.png";
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag size={24} className="text-gray-400" />
                </div>
              )}
            </div>

            {/* Product details */}
            <div className="flex-1 min-w-0">
              <h3 
                className={`
                  font-semibold text-sm leading-tight mb-1
                  ${isDarkMode ? "text-white" : "text-gray-900"}
                `}
              >
                {product.productName}
              </h3>
              
              {product.brandModel && (
                <p 
                  className={`
                    text-xs mb-2
                    ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                  `}
                >
                  {product.brandModel}
                </p>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <span 
                    className={`
                      text-sm font-bold
                      ${isDarkMode ? "text-white" : "text-gray-900"}
                    `}
                  >
                    {product.price.toFixed(2)} {product.currency}
                  </span>
                  
                  {product.averageRating && product.averageRating > 0 && (
                    <div className="flex items-center mt-1">
                      <Star size={12} className="text-yellow-400 fill-current" />
                      <span 
                        className={`
                          text-xs ml-1
                          ${isDarkMode ? "text-gray-300" : "text-gray-600"}
                        `}
                      >
                        {product.averageRating.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Quantity controls - matching Flutter quantity controller */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onQuantityChange(product.id, item.quantity - 1)}
                    disabled={item.quantity <= 1 || isRemoving || item.isOptimistic}
                    className={`
                      w-8 h-8 rounded-full border flex items-center justify-center
                      transition-colors duration-200
                      ${isDarkMode
                        ? "border-gray-600 hover:bg-gray-700"
                        : "border-gray-300 hover:bg-gray-100"
                      }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                  >
                    <Minus size={14} />
                  </button>
                  
                  <span 
                    className={`
                      min-w-[2rem] text-center font-medium
                      ${isDarkMode ? "text-white" : "text-gray-900"}
                    `}
                  >
                    {item.quantity}
                  </span>
                  
                  <button
                    onClick={() => onQuantityChange(product.id, item.quantity + 1)}
                    disabled={isRemoving || item.isOptimistic || item.quantity >= availableStock}
                    className={`
                      w-8 h-8 rounded-full border flex items-center justify-center
                      transition-colors duration-200
                      ${isDarkMode
                        ? "border-gray-600 hover:bg-gray-700"
                        : "border-gray-300 hover:bg-gray-100"
                      }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Attributes display - matching Flutter implementation */}
          {attributesDisplay && (
            <div 
              className={`
                mt-2 text-xs
                ${isDarkMode ? "text-gray-400" : "text-gray-500"}
              `}
            >
              {attributesDisplay}
            </div>
          )}

          {/* Sale preference label - matching Flutter _buildSalePreferenceLabel */}
          {item.salePreferences && (
            <SalePreferenceLabel
              salePreferences={item.salePreferences}
              currentQuantity={item.quantity}
              isDarkMode={isDarkMode}
              t={t}
            />
          )}

          {/* Bundle widget - matching Flutter CompactBundleWidget */}
          {isShop && shopId && db && (
            <CompactBundleWidget
              productId={product.id}
              shopId={shopId}
              isDarkMode={isDarkMode}
              localization={(key: string) => t(key)}
              db={db}
            />
          )}

          {/* Remove button */}
          <div className="mt-3 flex justify-end">
            <button
              onClick={() => onRemove(item.productId)}
              disabled={isRemoving || item.isOptimistic}
              className={`
                flex items-center space-x-2 px-3 py-2 rounded-lg text-sm
                transition-colors duration-200
                ${isDarkMode
                  ? "text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  : "text-red-500 hover:text-red-600 hover:bg-red-50"
                }
                ${isRemoving || item.isOptimistic
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
    </div>
  );
};

// Sale Preference Label - matching Flutter _buildSalePreferenceLabel
interface SalePreferenceLabelProps {
  salePreferences: SalePreferences;
  currentQuantity: number;
  isDarkMode: boolean;
  t: (key: string) => string;
}

const SalePreferenceLabel: React.FC<SalePreferenceLabelProps> = ({
  salePreferences,
  currentQuantity,
  isDarkMode,
  t,
}) => {
  const { discountThreshold, discountPercentage } = salePreferences;
  
  if (!discountThreshold || !discountPercentage) {
    return null;
  }

  const hasDiscount = currentQuantity >= discountThreshold;
  
  let labelText: string;
  let borderColor: string;
  let textColor: string;
  let iconElement: React.ReactNode;

  if (hasDiscount) {
    borderColor = "border-green-500";
    textColor = "text-green-500";
    iconElement = <CheckCircle size={14} />;
    labelText = `You got ${discountPercentage}% discount for this product!`;
  } else {
    borderColor = "border-orange-500";
    textColor = "text-orange-500";
    iconElement = <Sparkles size={14} />;
    labelText = `If you buy ${discountThreshold} of this you get ${discountPercentage}% discount!`;
  }

  return (
    <div 
      className={`
        mt-2 px-3 py-2 rounded-full border flex items-center space-x-2
        ${borderColor} ${textColor}
        transition-all duration-400
      `}
    >
      {iconElement}
      <span className="text-xs font-semibold flex-1 line-clamp-2">
        {labelText}
      </span>
    </div>
  );
};

// Related Products Section - matching Flutter _buildRelatedProductsSection
interface RelatedProductsSectionProps {
  relatedProducts: RelatedProduct[];
  isRelatedLoading: boolean;
  isDarkMode: boolean;
  t: (key: string) => string;
  onClose: () => void;
  router: AppRouterInstance;
}

const RelatedProductsSection: React.FC<RelatedProductsSectionProps> = ({
  relatedProducts,
  isRelatedLoading,
  isDarkMode,
  t,
  onClose,
  router,
}) => {
  if (isRelatedLoading) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-1 h-5 bg-green-500 rounded" />
          <h3 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {t("productsYouMightLike")}
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="w-full h-40 bg-gray-200 rounded-lg mb-2" />
              <div className="h-4 bg-gray-200 rounded mb-1" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (relatedProducts.length === 0) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-1 h-5 bg-green-500 rounded" />
          <h3 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {t("productsYouMightLike")}
          </h3>
        </div>
        <div className="flex flex-col items-center py-8">
          <ShoppingBag 
            size={48} 
            className={`mb-3 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          />
          <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
            {t("noProductsAvailable")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="flex items-center space-x-3 mb-4">
        <div className="w-1 h-5 bg-gradient-to-b from-green-500 to-green-600 rounded" />
        <h3 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
          {t("productsYouMightLike")}
        </h3>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        {relatedProducts.map((product) => (
          <RelatedProductCard
            key={product.id}
            product={product}
            isDarkMode={isDarkMode}
            onNavigate={() => {
              onClose();
              router.push(`/products/${product.id}`);
            }}
          />
        ))}
      </div>
      
      {/* Extra bottom padding to prevent checkout section overlap */}
      <div className="h-16" />
    </div>
  );
};

// Related Product Card - matching Flutter ProductCard
interface RelatedProductCardProps {
  product: RelatedProduct;
  isDarkMode: boolean;
  onNavigate: () => void;
}

const RelatedProductCard: React.FC<RelatedProductCardProps> = ({
  product,
  isDarkMode,
  onNavigate,
}) => {
  return (
    <div
      onClick={onNavigate}
      className={`
        cursor-pointer rounded-lg overflow-hidden transition-all duration-200
        hover:scale-105 hover:shadow-lg
        ${isDarkMode ? "bg-gray-800" : "bg-white"}
        border ${isDarkMode ? "border-gray-700" : "border-gray-200"}
      `}
    >
      {/* Product Image */}
      <div className="w-full h-32 bg-gray-200 overflow-hidden">
        {product.imageUrls.length > 0 ? (
          <img
            src={product.imageUrls[0]}
            alt={product.productName}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = "/placeholder-product.png";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag size={24} className="text-gray-400" />
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="p-3">
        <h4 
          className={`
            text-sm font-semibold line-clamp-2 mb-1
            ${isDarkMode ? "text-white" : "text-gray-900"}
          `}
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {product.productName}
        </h4>
        
        {product.brandModel && (
          <p className={`text-xs mb-2 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            {product.brandModel}
          </p>
        )}
        
        <div className="flex items-center justify-between">
          <span className={`font-bold text-sm ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {product.price.toFixed(2)} {product.currency}
          </span>
          
          {product.averageRating && product.averageRating > 0 && (
            <div className="flex items-center">
              <Star size={12} className="text-yellow-400 fill-current" />
              <span className={`text-xs ml-1 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
                {product.averageRating.toFixed(1)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Checkout Footer - matching Flutter _buildOptimizedCheckoutSection
interface CheckoutFooterProps {
  selectedCount: number;
  totalPrice: number;
  isDarkMode: boolean;
  t: (key: string) => string;
  onCheckout: () => void;
  onViewCart: () => void;
}

const CheckoutFooter: React.FC<CheckoutFooterProps> = ({
  selectedCount,
  totalPrice,
  isDarkMode,
  t,
  onCheckout,
  onViewCart,
}) => {
  return (
    <div
      className={`
        sticky bottom-0 border-t px-6 py-4
        ${isDarkMode ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"}
        backdrop-blur-xl bg-opacity-95 shadow-lg
      `}
    >
      {/* Total Row - matching Flutter _buildOptimizedTotalRow */}
      <div 
        className={`
          p-3 rounded-xl mb-4 border
          ${isDarkMode 
            ? "bg-gray-800 border-gray-700" 
            : "bg-gradient-to-r from-gray-50 to-gray-100 border-gray-200"
          }
        `}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-semibold ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
              {t("total")}
            </p>
            <p className="text-lg font-bold text-green-500">
              {totalPrice.toFixed(2)} TL
            </p>
          </div>
          
          <div className={`text-right text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            {selectedCount} {t("itemsSelected")}
          </div>
        </div>
      </div>

      {/* Action Buttons - matching Flutter _buildOptimizedCheckoutButton */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onViewCart}
          className={`
            py-3 px-4 rounded-xl font-medium transition-all duration-200
            ${isDarkMode
              ? "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
            }
            active:scale-95
          `}
        >
          {t("viewCart")}
        </button>
        
        <button
          onClick={onCheckout}
          className="
            py-3 px-4 rounded-xl font-medium transition-all duration-200
            bg-gradient-to-r from-green-500 to-green-600 text-white
            hover:from-green-600 hover:to-green-700
            shadow-lg hover:shadow-xl active:scale-95
            flex items-center justify-center space-x-2
          "
        >
          <span>{t("proceedToPayment")}</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};