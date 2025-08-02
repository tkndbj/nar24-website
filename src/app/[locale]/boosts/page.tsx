"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Package,
  CheckCircle,
  Clock,
  BarChart3,
  CreditCard,
  Plus,
  Minus,
  Zap,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { httpsCallable, getFunctions } from "firebase/functions";

// Types
interface Product {
  id: string;
  productName: string;
  imageUrls: string[];
  imageUrl: string;
  price: number;
  currency: string;
  createdAt: Timestamp;
  isBoosted: boolean;
}

const BASE_PRICE_PER_PRODUCT = 150; // TL per product per day
const BOOST_DURATION_OPTIONS = [5, 10, 15, 20, 25, 30, 35]; // minutes

export default function BoostPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const productId = searchParams.get("productId");
  const { user } = useUser();
  const t = useTranslations("Boosts");

  // State
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Product states
  const [mainProduct, setMainProduct] = useState<Product | null>(null);
  const [unboostedProducts, setUnboostedProducts] = useState<Product[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // Boost configuration
  const [selectedDurationIndex, setSelectedDurationIndex] = useState(0);
  const [boostDuration, setBoostDuration] = useState(BOOST_DURATION_OPTIONS[0]);
  const [totalPrice, setTotalPrice] = useState(BASE_PRICE_PER_PRODUCT);

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

  // Load data when user is available
  useEffect(() => {
    if (user) {
      Promise.all([
        productId ? fetchMainProduct() : Promise.resolve(),
        fetchUnboostedProducts(),
      ]).finally(() => setLoading(false));
    }
  }, [user, productId]);

  // Update total price when selection or duration changes
  useEffect(() => {
    updateTotalPrice();
  }, [mainProduct, selectedProductIds, boostDuration]);

  // Fetch main product if productId is provided
  const fetchMainProduct = async () => {
    if (!productId || !user) return;

    try {
      const productDoc = await getDoc(doc(db, "products", productId));

      if (!productDoc.exists()) {
        alert(t("itemNotFound") || "Product not found");
        router.back();
        return;
      }

      const data = productDoc.data();
      const product: Product = {
        id: productDoc.id,
        productName: data.productName || "",
        imageUrls: data.imageUrls || [],
        imageUrl:
          data.imageUrls && data.imageUrls.length > 0 ? data.imageUrls[0] : "",
        price: data.price || 0,
        currency: data.currency || "TRY",
        createdAt: data.createdAt,
        isBoosted: data.isBoosted || false,
      };

      setMainProduct(product);
    } catch (error) {
      console.error("Error fetching main product:", error);
      alert(t("errorOccurred") || "An error occurred");
    }
  };

  // Fetch unboosted products for bulk boosting
  const fetchUnboostedProducts = async () => {
    if (!user) return;

    try {
      const q = query(
        collection(db, "products"),
        where("userId", "==", user.uid),
        where("isBoosted", "==", false),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);
      const products: Product[] = [];

      snapshot.docs.forEach((doc) => {
        const data = doc.data();

        // Skip main product if it exists
        if (productId && doc.id === productId) return;

        products.push({
          id: doc.id,
          productName: data.productName || "",
          imageUrls: data.imageUrls || [],
          imageUrl:
            data.imageUrls && data.imageUrls.length > 0
              ? data.imageUrls[0]
              : "",
          price: data.price || 0,
          currency: data.currency || "TRY",
          createdAt: data.createdAt,
          isBoosted: data.isBoosted || false,
        });
      });

      setUnboostedProducts(products);
    } catch (error) {
      console.error("Error fetching unboosted products:", error);
    }
  };

  // Update total price calculation
  const updateTotalPrice = useCallback(() => {
    const itemCount = (mainProduct ? 1 : 0) + selectedProductIds.length;
    setTotalPrice(boostDuration * BASE_PRICE_PER_PRODUCT * itemCount);
  }, [mainProduct, selectedProductIds, boostDuration]);

  // Toggle product selection
  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  // Handle duration change
  const handleDurationChange = (index: number) => {
    setSelectedDurationIndex(index);
    setBoostDuration(BOOST_DURATION_OPTIONS[index]);
  };

  // Format duration label
  const getDurationLabel = (minutes: number) => {
    return `${minutes} ${t("minutes") || "minutes"}`;
  };

  // Proceed to payment
  const proceedToPayment = async () => {
    if (!user) {
      alert(t("userNotAuthenticated") || "User not authenticated");
      return;
    }

    // Prepare items for the cloud function
    const items = [];

    // Add main product if exists
    if (mainProduct) {
      items.push({
        itemId: mainProduct.id,
        collection: "products",
        shopId: null,
      });
    }

    // Add selected products
    selectedProductIds.forEach((id) => {
      items.push({
        itemId: id,
        collection: "products",
        shopId: null,
      });
    });

    if (items.length === 0) {
      alert(t("noItemToBoost") || "No items to boost");
      return;
    }

    setSubmitting(true);

    try {
      const functions = getFunctions(undefined, "europe-west3");
      const boostProducts = httpsCallable(functions, "boostProducts");

      const result = await boostProducts({
        items,
        boostDuration,
        isShopContext: false,
        shopId: null,
      });

      const data = result.data as {
        success: boolean;
        data: {
          boostedItemsCount: number;
          boostDuration: number;
          totalPrice: number;
        };
      };

      if (data.success) {
        const boostData = data.data;
        alert(
          `${t("boostCompleted") || "Boost completed successfully!"}\n` +
            `Boosted ${boostData.boostedItemsCount} items for ${boostData.boostDuration} minutes.\n` +
            `Total cost: ${boostData.totalPrice} TL`
        );
        router.back();
      }
    } catch (error) {
      console.error("Error boosting products:", error);
      alert(`${t("errorOccurred") || "Error"}: ${error}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Product Card Component
  const ProductCard = ({
    product,
    isSelected,
    onToggle,
    isPrimary = false,
  }: {
    product: Product;
    isSelected?: boolean;
    onToggle?: () => void;
    isPrimary?: boolean;
  }) => (
    <div
      className={`
        rounded-xl border transition-all duration-200 overflow-hidden
        ${
          isPrimary
            ? isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
            : isSelected
            ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700"
            : isDarkMode
            ? "bg-gray-800 border-gray-700 hover:border-gray-600"
            : "bg-white border-gray-200 hover:border-gray-300"
        }
        ${onToggle ? "cursor-pointer" : ""}
      `}
      onClick={onToggle}
    >
      {!isPrimary && (
        <div className="p-4">
          <div className="flex items-center space-x-3">
            {/* Custom Checkbox */}
            <div
              className={`
                w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
                ${
                  isSelected
                    ? "bg-green-500 border-green-500"
                    : "border-gray-300 dark:border-gray-600"
                }
              `}
            >
              {isSelected && <CheckCircle size={14} className="text-white" />}
            </div>

            {/* Product Image */}
            <div className="relative w-12 h-12 flex-shrink-0">
              {product.imageUrl ? (
                <Image
                  src={product.imageUrl}
                  alt={product.productName}
                  fill
                  className="object-cover rounded-lg"
                />
              ) : (
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    isDarkMode ? "bg-gray-700" : "bg-gray-100"
                  }`}
                >
                  <Package
                    size={18}
                    className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                  />
                </div>
              )}
            </div>

            {/* Product Info */}
            <div className="flex-1 min-w-0">
              <h4
                className={`text-sm font-semibold line-clamp-2 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {product.productName}
              </h4>
            </div>
          </div>
        </div>
      )}

      {isPrimary && (
        <>
          {/* Product Image */}
          <div className="relative h-40 bg-gray-100 dark:bg-gray-700">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.productName}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package
                  size={40}
                  className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                />
              </div>
            )}
          </div>

          {/* Product Details */}
          <div className="p-4">
            <h3
              className={`text-lg font-semibold mb-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {product.productName}
            </h3>

            <div className="inline-flex items-center px-3 py-1 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-full">
              <Zap size={12} className="text-green-600 mr-1" />
              <span className="text-xs font-semibold text-green-600">
                {t("primaryItem") || "Primary Item"}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );

  // Loading Skeleton
  const LoadingSkeleton = () => (
    <div className="space-y-6 p-6">
      {/* Main product skeleton */}
      <div
        className={`animate-pulse rounded-xl h-48 ${
          isDarkMode ? "bg-gray-800" : "bg-gray-200"
        }`}
      />

      {/* Additional products skeleton */}
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className={`animate-pulse rounded-lg h-16 ${
              isDarkMode ? "bg-gray-800" : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      {/* Controls skeleton */}
      <div
        className={`animate-pulse rounded-xl h-32 ${
          isDarkMode ? "bg-gray-800" : "bg-gray-200"
        }`}
      />
    </div>
  );

  if (!user) return null;

  if (loading) return <LoadingSkeleton />;

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
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
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
                {t("ads") || "Boost Products"}
              </h1>
            </div>

            <button
              onClick={() => router.push("/boost-analysis")}
              className={`
                flex items-center space-x-2 px-3 py-2 rounded-lg border transition-colors
                ${
                  isDarkMode
                    ? "border-gray-600 text-gray-300 hover:bg-gray-800"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }
              `}
            >
              <BarChart3 size={16} />
              <span className="text-sm font-semibold">
                {t("analytics") || "Analytics"}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-6">
          {/* Informational Banner */}
          <div
            className={`rounded-xl border p-6 ${
              isDarkMode
                ? "bg-orange-900/30 border-orange-700/50"
                : "bg-orange-50 border-orange-200"
            }`}
          >
            <div className="text-center space-y-3">
              <h2
                className={`text-lg font-bold ${
                  isDarkMode ? "text-white" : "text-orange-900"
                }`}
              >
                🚀{" "}
                {t("boostBannerTitle") ||
                  "Boost your products to reach a wider audience and make them stand out."}
              </h2>
              <p
                className={`text-sm ${
                  isDarkMode ? "text-gray-200" : "text-orange-800"
                }`}
              >
                ⭐{" "}
                {t("boostBannerDescription") ||
                  "Your products will be featured in their respective categories, on the home page, in search results, and in many other places for the duration you specify."}
              </p>
            </div>
          </div>

          {/* Main Product Section */}
          {mainProduct && (
            <div>
              <ProductCard product={mainProduct} isPrimary />
            </div>
          )}

          {/* Additional Products Section */}
          {unboostedProducts.length > 0 && (
            <div
              className={`rounded-xl border p-6 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <h2
                className={`text-lg font-bold mb-4 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("addMoreItems") || "Add More Items"}
              </h2>

              <div className="space-y-3 max-h-80 overflow-y-auto">
                {unboostedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isSelected={selectedProductIds.includes(product.id)}
                    onToggle={() => toggleProductSelection(product.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Duration Selection */}
          <div
            className={`rounded-xl border p-6 ${
              isDarkMode
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center space-x-2 mb-4">
              <Clock size={20} className="text-green-500" />
              <h2
                className={`text-lg font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("selectBoostDuration") || "Select Boost Duration"}
              </h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() =>
                    handleDurationChange(Math.max(0, selectedDurationIndex - 1))
                  }
                  disabled={selectedDurationIndex === 0}
                  className="p-2 rounded-lg bg-green-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-600 transition-colors"
                >
                  <Minus size={16} />
                </button>

                <div className="flex-1 mx-4">
                  <div className="relative">
                    <input
                      type="range"
                      min="0"
                      max={BOOST_DURATION_OPTIONS.length - 1}
                      value={selectedDurationIndex}
                      onChange={(e) =>
                        handleDurationChange(parseInt(e.target.value))
                      }
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      style={{
                        background: `linear-gradient(to right, #10B981 0%, #10B981 ${
                          (selectedDurationIndex /
                            (BOOST_DURATION_OPTIONS.length - 1)) *
                          100
                        }%, #e5e7eb ${
                          (selectedDurationIndex /
                            (BOOST_DURATION_OPTIONS.length - 1)) *
                          100
                        }%, #e5e7eb 100%)`,
                      }}
                    />
                  </div>
                </div>

                <button
                  onClick={() =>
                    handleDurationChange(
                      Math.min(
                        BOOST_DURATION_OPTIONS.length - 1,
                        selectedDurationIndex + 1
                      )
                    )
                  }
                  disabled={
                    selectedDurationIndex === BOOST_DURATION_OPTIONS.length - 1
                  }
                  className="p-2 rounded-lg bg-green-500 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-600 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center px-4 py-2 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-full">
                  <span className="text-sm font-bold text-green-600">
                    {getDurationLabel(boostDuration)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Price Section */}
          <div
            className={`rounded-xl border p-6 ${
              isDarkMode
                ? "bg-gradient-to-br from-orange-900/40 to-pink-900/40 border-orange-700/50"
                : "bg-gradient-to-br from-orange-50 to-pink-50 border-orange-200"
            }`}
          >
            <div className="text-center">
              <p
                className={`text-sm font-semibold mb-2 ${
                  isDarkMode ? "text-gray-200" : "text-gray-600"
                }`}
              >
                {t("totalPriceLabel") || "Total Price"}
              </p>

              <div
                className={`${
                  isDarkMode
                    ? "text-white"
                    : "bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent"
                }`}
              >
                <span className="text-3xl font-bold">
                  {totalPrice.toFixed(2)} TL
                </span>
              </div>

              <p
                className={`text-xs mt-1 ${
                  isDarkMode ? "text-gray-300" : "text-gray-500"
                }`}
              >
                {(mainProduct ? 1 : 0) + selectedProductIds.length}{" "}
                {t("items") || "items"} × {boostDuration}{" "}
                {t("minutes") || "minutes"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div
        className={`sticky bottom-0 border-t p-4 ${
          isDarkMode
            ? "bg-gray-900 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="max-w-4xl mx-auto">
          <button
            onClick={proceedToPayment}
            disabled={
              submitting ||
              (mainProduct ? 0 : 1) + selectedProductIds.length === 0
            }
            className="
              w-full flex items-center justify-center space-x-2 py-4 px-6 
              bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl 
              font-bold text-lg shadow-lg hover:from-green-600 hover:to-green-700 
              disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
            "
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>{t("processing") || "Processing..."}</span>
              </>
            ) : (
              <>
                <CreditCard size={20} />
                <span>{t("completePayment") || "Complete Payment"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
