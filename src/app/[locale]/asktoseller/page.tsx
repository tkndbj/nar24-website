"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Star, Store, User, ShoppingBag } from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useTranslations } from "next-intl";

interface SellerInfo {
  id: string;
  name: string;
  profileImage?: string;
  averageRating: number;
  isShop: boolean;
}

interface ProductInfo {
  id: string;
  productName: string;
  imageUrl?: string;
  price: number;
  currency: string;
}

// ✅ FIXED: Proper Next.js App Router page props interface
interface PageProps {
  params: {
    locale: string;
  };
  searchParams: {
    productId?: string;
    sellerId?: string;
    isShop?: string;
  };
}

// ✅ FIXED: Main page component with correct Next.js structure
const AskToSellerPage: React.FC<PageProps> = ({ params, searchParams }) => {
  const router = useRouter();
  const { user } = useUser();

  // ✅ Get translations using the locale from params
  const localization = useTranslations();

  // ✅ FIXED: Proper nested translation function that uses JSON files
  const t = useCallback((key: string) => {
    try {
      // Try to get the nested AskToSellerPage translation
      const translation = localization(`AskToSellerPage.${key}`);
      
      // Check if we got a valid translation (not the same as the key we requested)
      if (translation && translation !== `AskToSellerPage.${key}`) {
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

  // ✅ FIXED: Get URL parameters from searchParams prop instead of useSearchParams hook
  const productId = searchParams?.productId || "";
  const sellerId = searchParams?.sellerId || "";
  const isShop = searchParams?.isShop === "true";

  // Debug log to see what parameters we're getting
  useEffect(() => {
    console.log("AskToSeller URL Parameters:", {
      productId,
      sellerId,
      isShop,
      allParams: searchParams
    });
  }, [productId, sellerId, isShop, searchParams]);

  // Form state
  const [questionText, setQuestionText] = useState("");
  const [allowNameVisible, setAllowNameVisible] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data state
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [productInfo, setProductInfo] = useState<ProductInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dark mode detection
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const detectDarkMode = () => {
      const htmlElement = document.documentElement;
      const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      
      const isDark =
        htmlElement.classList.contains("dark") ||
        htmlElement.getAttribute("data-theme") === "dark" ||
        darkModeMediaQuery.matches;
      
      setIsDarkMode(isDark);
    };

    detectDarkMode();

    const observer = new MutationObserver(detectDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", detectDarkMode);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", detectDarkMode);
    };
  }, []);

  // Fetch seller and product information
  useEffect(() => {
    if (!productId || !sellerId) {
      setError(t("missingRequiredParameters"));
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
    
        // Fetch seller info from proper endpoint
        const sellerEndpoint = isShop ? `/api/shops/${sellerId}` : `/api/users/${sellerId}`;
        const sellerResponse = await fetch(sellerEndpoint);
        
        if (!sellerResponse.ok) {
          throw new Error(t("sellerNotFound"));
        }
    
        const sellerData = await sellerResponse.json();
        
        setSellerInfo({
          id: sellerId,
          name: isShop ? sellerData.name : sellerData.displayName,
          profileImage: isShop ? sellerData.profileImageUrl : sellerData.profileImage,
          averageRating: sellerData.averageRating || 0,
          isShop,
        });
    
        // Fetch product info
        const productResponse = await fetch(`/api/products/${productId}`);
        
        if (!productResponse.ok) {
          throw new Error(t("productNotFound"));
        }
    
        const productData = await productResponse.json();
        
        setProductInfo({
          id: productId,
          productName: productData.productName,
          imageUrl: productData.imageUrls?.[0],
          price: productData.price,
          currency: productData.currency || "TL",
        });
    
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(err instanceof Error ? err.message : t("failedToLoadData"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [productId, sellerId, isShop, t]);

  const handleSubmit = useCallback(async () => {
    if (!user) {
      router.push("/login");
      return;
    }

    if (!acceptTerms) {
      alert(t("pleaseAcceptTerms"));
      return;
    }

    if (!questionText.trim()) {
      alert(t("pleaseEnterQuestion"));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/questions/${productId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sellerId,
          isShop,
          questionText: questionText.trim(),
          askerNameVisible: allowNameVisible,
        }),
      });

      if (!response.ok) {
        throw new Error(t("failedToSubmitQuestion"));
      }

      // Success - go back
      router.back();
    } catch (err) {
      console.error("Error submitting question:", err);
      alert(t("failedToSubmitQuestionTryAgain"));
    } finally {
      setIsSubmitting(false);
    }
  }, [user, router, acceptTerms, questionText, productId, sellerId, isShop, allowNameVisible, t]);

  if (isLoading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        {/* Loading skeleton */}
        <div className={`border-b ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center">
            <div className={`w-6 h-6 rounded animate-pulse ${isDarkMode ? "bg-gray-700" : "bg-gray-300"}`} />
          </div>
        </div>
        <div className="max-w-4xl mx-auto p-4">
          <div className="space-y-6">
            <div className={`h-16 rounded-lg animate-pulse ${isDarkMode ? "bg-gray-800" : "bg-gray-200"}`} />
            <div className={`h-32 rounded-lg animate-pulse ${isDarkMode ? "bg-gray-800" : "bg-gray-200"}`} />
            <div className={`h-40 rounded-lg animate-pulse ${isDarkMode ? "bg-gray-800" : "bg-gray-200"}`} />
          </div>
        </div>
      </div>
    );
  }

  if (error || !sellerInfo || !productInfo) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        <div className="text-center">
          <h1 className={`text-2xl font-bold mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {t("errorLoadingPage")}
          </h1>
          <p className={`mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
            {error || t("failedToLoadSellerOrProductInfo")}
          </p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            {t("goBack")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
      {/* Header */}
      <div className={`sticky top-0 z-10 border-b ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} shadow-sm`}>
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className={`p-2 rounded-lg transition-colors ${isDarkMode ? "hover:bg-gray-700 text-gray-300" : "hover:bg-gray-100 text-gray-700"}`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className={`text-xl font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {t("askSeller")}
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto p-4 pb-24">
        <div className="space-y-6">
          {/* Seller Info */}
          <div className={`rounded-xl p-6 ${isDarkMode ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"} shadow-sm`}>
            <div className="flex items-center gap-4">
              <div className="relative">
                {sellerInfo.profileImage ? (
                  <img
                    src={sellerInfo.profileImage}
                    alt={sellerInfo.name}
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`}>
                    {sellerInfo.isShop ? (
                      <Store className={`w-8 h-8 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`} />
                    ) : (
                      <User className={`w-8 h-8 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`} />
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex-1">
                <h2 className={`text-xl font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {sellerInfo.name}
                </h2>
                
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-500 fill-current" />
                    <span className={`text-sm font-medium ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                      {sellerInfo.averageRating.toFixed(1)}
                    </span>
                  </div>
                  
                  <span className={`px-2 py-1 text-xs rounded-full ${isDarkMode ? "bg-blue-900/30 text-blue-400" : "bg-blue-100 text-blue-700"}`}>
                    {sellerInfo.isShop ? t("shop") : t("individualSeller")}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Info Banner */}
          <div className={`rounded-xl p-4 ${isDarkMode ? "bg-orange-900/20 border border-orange-700/30" : "bg-orange-50 border border-orange-200"}`}>
            <p className={`text-sm ${isDarkMode ? "text-orange-300" : "text-orange-800"}`}>
              {t("orderRelatedQuestionsInfo")}{" "}
              <button
                onClick={() => router.push("/orders")}
                className="font-semibold underline hover:no-underline"
              >
                {t("ordersPage")}
              </button>
              {" "}{t("useForProductQuestionsOnly")}
            </p>
          </div>

          {/* Question Form */}
          <div className={`rounded-xl p-6 ${isDarkMode ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"} shadow-sm`}>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {t("yourQuestion")}
                </h3>
                
                <button
                  onClick={() => router.push("/publishing-criteria")}
                  className={`text-sm underline ${isDarkMode ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-500"}`}
                >
                  {t("publishingCriteria")}
                </button>
              </div>

              <div>
                <textarea
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  maxLength={150}
                  rows={5}
                  placeholder={t("askQuestionPlaceholder")}
                  className={`w-full p-4 border rounded-lg resize-none transition-colors ${
                    isDarkMode
                      ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-orange-500"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-orange-500"
                  } focus:outline-none focus:ring-2 focus:ring-orange-500/20`}
                />
                
                <div className="flex justify-between items-center mt-2">
                  <span className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                    {questionText.length}/150 {t("characters")}
                  </span>
                </div>
              </div>

              {/* Checkboxes */}
              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowNameVisible}
                    onChange={(e) => setAllowNameVisible(e.target.checked)}
                    className="mt-1 w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                  />
                  <span className={`text-sm ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                    {t("makeNameVisible")}
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-1 w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                  />
                  <span className={`text-sm ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                    {t("acceptThe")}{" "}
                    <button
                      onClick={() => router.push("/user-agreement")}
                      className={`underline ${isDarkMode ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-500"}`}
                    >
                      {t("termsAndConditions")}
                    </button>
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Product Preview */}
          <div className={`rounded-xl p-4 ${isDarkMode ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"} shadow-sm`}>
            <h4 className={`text-sm font-medium mb-3 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
              {t("questionAbout")}:
            </h4>
            
            <div className="flex items-center gap-4">
              {productInfo.imageUrl ? (
                <img
                  src={productInfo.imageUrl}
                  alt={productInfo.productName}
                  className="w-16 h-16 rounded-lg object-cover"
                />
              ) : (
                <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${isDarkMode ? "bg-gray-700" : "bg-gray-200"}`}>
                  <ShoppingBag className={`w-8 h-8 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`} />
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <h5 className={`font-medium truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {productInfo.productName}
                </h5>
                <p className={`text-lg font-bold text-orange-600 mt-1`}>
                  {productInfo.price} {productInfo.currency}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Submit Button */}
      <div className={`fixed bottom-0 left-0 right-0 p-4 ${isDarkMode ? "bg-gray-800 border-t border-gray-700" : "bg-white border-t border-gray-200"} shadow-lg`}>
        <div className="max-w-4xl mx-auto">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !questionText.trim() || !acceptTerms}
            className="w-full py-4 px-6 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-semibold text-lg transition-all duration-300 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t("sending")}...
              </>
            ) : (
              t("sendQuestion")
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AskToSellerPage;