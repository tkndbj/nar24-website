"use client";

import React, { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Share2,
  ShoppingCart,
  Check,
  Minus,
  Heart,
} from "lucide-react";
import dynamic from "next/dynamic";
import { Product } from "@/app/models/Product";
import { useUser } from "@/context/UserProvider";
import { useFavorites } from "@/context/FavoritesProvider";
import LoginModal from "@/app/components/LoginModal";
import ProductDetailActionsRow from "../../../components/product_detail/ProductDetailActionsRow";
import DynamicAttributesWidget from "../../../components/product_detail/DynamicAttributesWidget";
import ProductDetailSellerInfo from "../../../components/product_detail/SellerInfo";
import ProductColorOptions from "../../../components/product_detail/ProductColorOptions";
import ProductImageGallery from "./ProductImageGallery";
import ProductActionButtons from "./ProductActionButtons";
import ProductDescription from "./ProductDescription";

import { useCartActions } from "@/hooks/useCartActions";
import { useDescriptionTranslation } from "@/hooks/useDescriptionTranslation";
import { useScrollDetection } from "@/hooks/useScrollDetection";

import type {
  SellerInfo,
  Review,
  Question,
  RelatedProduct,
  CollectionData,
  BundleInfo,
  BundleDisplayData,
  SalesConfig,
} from "@/types/product-detail";

const ProductOptionSelector = dynamic(
  () => import("@/app/components/ProductOptionSelector"),
  { ssr: false }
);

const ProductCollectionWidget = lazy(
  () => import("../../../components/product_detail/ProductCollectionWidget")
);
const ProductDetailReviewsTab = lazy(
  () => import("../../../components/product_detail/Reviews")
);
const ProductQuestionsWidget = lazy(
  () => import("../../../components/product_detail/Questions")
);
const ProductDetailRelatedProducts = lazy(
  () => import("../../../components/product_detail/RelatedProducts")
);
const BundleComponent = lazy(
  () => import("@/app/components/product_detail/BundleComponent")
);
const AskToSellerBubble = lazy(
  () => import("@/app/components/product_detail/AskToSeller")
);

// Secondary-section props are nullable: when the server passes `null`, the
// child widgets fall through to their own client-side fetch (matches the
// Flutter staged-rendering pattern). The page route always passes `null`;
// the SSR-prefetched shape is preserved for future use (e.g. a share-link
// flow that wants warm data).
interface ProductDetailClientProps {
  product: Product;
  seller: SellerInfo | null;
  reviews: Review[];
  reviewsTotal: number | null;
  questions: Question[];
  questionsTotal: number | null;
  relatedProducts: RelatedProduct[] | null;
  collection: CollectionData | null;
  bundles: BundleInfo[] | null;
  salesConfig: SalesConfig;
  locale: string;
}

export default function ProductDetailClient({
  product,
  seller,
  reviews,
  reviewsTotal,
  questions,
  questionsTotal,
  relatedProducts,
  collection,
  bundles,
  salesConfig,
  locale,
}: ProductDetailClientProps) {
  const router = useRouter();
  const localization = useTranslations();
  const { user } = useUser();
  const { addToFavorites, removeMultipleFromFavorites, isFavorite } = useFavorites();

  // Sales config from server (no client-side Firestore listener needed)
  const { salesPaused, pauseReason } = salesConfig;
  const [showSalesPausedDialog, setShowSalesPausedDialog] = useState(false);

  // Selected colour for the per-color image preview. `null` = no override,
  // gallery uses the product's default `imageUrls` / `imageStoragePaths`.
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  // Scroll detection
  const { showHeaderButtons, actionButtonsRef } = useScrollDetection();

  // Decide whether to mount each bottom section. We prefer denormalized
  // hints on the product itself over speculative rendering — that avoids
  // the bad UX where a section flashes a skeleton and then collapses to
  // nothing when its fetch returns empty.
  //
  // Reviews: gated on the denormalized `reviewCount` field. If the product
  // has no reviews we never mount the section, so no skeleton flash.
  const hasReviews =
    reviewsTotal !== null
      ? reviewsTotal > 0
      : (product.reviewCount ?? 0) > 0;
  // Related: gated on `relatedProductIds`. If empty we never mount.
  const hasRelatedProducts =
    relatedProducts !== null
      ? relatedProducts.length > 0
      : (product.relatedProductIds?.length ?? 0) > 0;
  // Collection / Bundles: shop-scoped, no count hint available. We mount
  // the widget so it can self-fetch — the widget itself renders nothing
  // while loading and nothing if empty (silent), so there's no flash.
  const hasCollection =
    collection !== null
      ? collection.products.length > 0
      : !!product.shopId;
  const hasBundles =
    bundles !== null ? bundles.length > 0 : !!product.shopId;
  // Questions: no hint. Same silent-load contract as collection / bundles.
  const hasQuestions = questionsTotal === null ? true : questionsTotal > 0;


  // Translation helper
  const t = useCallback(
    (key: string) => {
      if (!localization) return key;
      try {
        const translation = localization(`ProductDetailPage.${key}`);
        if (translation && translation !== `ProductDetailPage.${key}`) return translation;
        const directTranslation = localization(key);
        if (directTranslation && directTranslation !== key) return directTranslation;
        return key;
      } catch {
        return key;
      }
    },
    [localization]
  );

  // Cart actions
  const cart = useCartActions(product, locale, salesPaused);

  // Description translation
  const descTranslation = useDescriptionTranslation(
    product.description,
    locale,
    user,
    t
  );

  // Out of stock check
  const isOutOfStock = useMemo(() => {
    if (!product) return false;
    const hasNoBaseStock = product.quantity === 0;
    const colorQuantities = product.colorQuantities || {};
    const allColorQuantitiesZero = Object.values(colorQuantities).every(
      (qty) => (qty as number) === 0
    );
    return hasNoBaseStock && allColorQuantitiesZero;
  }, [product]);

  // Handlers
  const handleShare = useCallback(async () => {
    try {
      if (navigator.share && product) {
        await navigator.share({
          title: product.productName,
          text: `${t("checkOutThis")} ${product.productName}`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
      }
    } catch { /* ignore */ }
  }, [product, t]);

  const handleToggleFavorite = useCallback(async () => {
    if (!product?.id) return;
    if (!user) {
      cart.setShowLoginModal(true);
      return;
    }
    try {
      if (isFavorite(product.id)) {
        await removeMultipleFromFavorites([product.id]);
      } else {
        await addToFavorites(product.id);
      }
    } catch { /* ignore */ }
  }, [product?.id, user, isFavorite, addToFavorites, removeMultipleFromFavorites, cart]);

  const handleBuyNow = useCallback(() => {
    if (salesPaused) {
      setShowSalesPausedDialog(true);
      return;
    }
    cart.handleBuyNow();
  }, [salesPaused, cart]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface">
      {/* Sticky Header */}
      <div className="sticky sticky-below-market-header-mobile lg:top-[calc(3.25rem+1px)] xl:top-[calc(3.5rem+1px)] z-[60] border-b transition-all duration-300 bg-white/95 dark:bg-surface backdrop-blur-md border-gray-200 dark:border-gray-700">
        <div className="w-full px-3 py-2 sm:max-w-6xl sm:mx-auto sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => router.back()}
              className="p-1.5 sm:p-2 rounded-lg transition-colors flex-shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex-1" />

            {/* Scroll-reveal action buttons in header */}
            <div
              className={`flex items-center gap-1.5 sm:gap-2 transition-all duration-500 ease-in-out overflow-hidden ${
                showHeaderButtons
                  ? "max-w-[400px] sm:max-w-[420px] opacity-100"
                  : "max-w-0 opacity-0"
              }`}
              style={{ transitionProperty: "max-width, opacity" }}
            >
              <button
                onClick={() => cart.handleAddToCart()}
                disabled={cart.isProcessing || cart.isAddToCartDisabled}
                className={`py-2 px-3 rounded-lg font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 whitespace-nowrap flex-shrink-0
                  ${
                    cart.productInCart && cart.cartButtonState === "idle"
                      ? "border border-red-500 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      : cart.cartButtonState === "added" || cart.cartButtonState === "removed"
                        ? "border border-green-500 text-green-600 bg-green-50"
                        : "border border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                  }
                  ${cart.isProcessing || cart.isAddToCartDisabled ? "opacity-50 cursor-not-allowed" : ""}
                `}
              >
                {cart.cartButtonState === "adding" || cart.cartButtonState === "removing" ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : cart.cartButtonState === "added" || cart.cartButtonState === "removed" ? (
                  <Check className="w-4 h-4" />
                ) : cart.productInCart ? (
                  <Minus className="w-4 h-4" />
                ) : (
                  <ShoppingCart className="w-4 h-4" />
                )}
                <span>
                  {cart.cartButtonState === "adding"
                    ? t("adding")
                    : cart.cartButtonState === "removing"
                      ? t("removing")
                      : cart.cartButtonState === "added"
                        ? t("addedToCart")
                        : cart.cartButtonState === "removed"
                          ? t("removedFromCart")
                          : cart.productInCart
                            ? t("removeFromCart")
                            : t("addToCart")}
                </span>
              </button>

              <button
                onClick={handleBuyNow}
                disabled={isOutOfStock || salesPaused}
                className={`py-2 px-3 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-lg font-semibold text-xs transition-all duration-300 whitespace-nowrap shadow-lg flex-shrink-0 ${
                  isOutOfStock || salesPaused ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {isOutOfStock
                  ? t("outOfStock")
                  : salesPaused
                    ? t("salesPaused") || "Sales Paused"
                    : t("buyNow")}
              </button>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <button
                onClick={handleToggleFavorite}
                className="p-1.5 sm:p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                <Heart
                  className={`w-5 h-5 ${
                    isFavorite(product.id) ? "fill-red-500 text-red-500" : ""
                  }`}
                />
              </button>
              <button
                onClick={handleShare}
                className="p-1.5 sm:p-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full sm:max-w-6xl sm:mx-auto p-2 sm:p-3 lg:p-4 overflow-x-hidden">
        <div className="grid lg:grid-cols-2 gap-3 sm:gap-6 lg:gap-8">
          {/* Left Column - Images */}
          <ProductImageGallery
            product={product}
            selectedColor={selectedColor}
            t={t}
          />

          {/* Right Column - Product Info */}
          <div className="space-y-3 sm:space-y-4">
            {/* Product Title & Brand */}
            <div className="space-y-1.5 sm:space-y-2">
              {product.brandModel && (
                <div className="flex items-start gap-2 sm:gap-3">
                  <span className="text-xs sm:text-sm font-semibold px-2 py-0.5 sm:px-3 sm:py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-700">
                    {product.brandModel}
                  </span>
                </div>
              )}

              <h1 className="text-base sm:text-lg lg:text-xl font-bold leading-tight text-gray-900 dark:text-white">
                {product.productName}
              </h1>

              <div className="text-lg sm:text-xl lg:text-2xl font-bold text-orange-600">
                {product.price} {product.currency}
              </div>
            </div>

            {/* Actions Row */}
            <ProductDetailActionsRow
              product={product}
              onShare={handleShare}
              onToggleFavorite={handleToggleFavorite}
              isFavorite={isFavorite(product.id)}
              localization={localization}
            />

            {/* Action Buttons */}
            <div ref={actionButtonsRef}>
              <ProductActionButtons
                cartButtonState={cart.cartButtonState}
                isProcessing={cart.isProcessing}
                productInCart={cart.productInCart}
                isAddToCartDisabled={cart.isAddToCartDisabled}
                isOutOfStock={isOutOfStock}
                salesPaused={salesPaused}
                onAddToCart={() => cart.handleAddToCart()}
                onBuyNow={handleBuyNow}
                t={t}
              />
            </div>

            {/* Color Options — renders nothing when product has no colorImages */}
            <ProductColorOptions
              product={product}
              selectedColor={selectedColor}
              onSelectColor={setSelectedColor}
              localization={localization}
            />

            {/* Seller Info */}
            <ProductDetailSellerInfo
              sellerId={product.userId}
              sellerName={product.sellerName}
              shopId={product.shopId}
              localization={localization}
              prefetchedData={seller}
            />

            {/* Attributes */}
            <DynamicAttributesWidget
              product={product}
              localization={localization}
            />

            {/* Description */}
            {product.description && (
              <ProductDescription
                description={product.description}
                isTranslated={descTranslation.isTranslated}
                translatedText={descTranslation.translatedText}
                isTranslating={descTranslation.isTranslating}
                translationError={descTranslation.translationError}
                onToggleTranslation={descTranslation.handleToggleTranslation}
                t={t}
              />
            )}
          </div>
        </div>

        {/* Bottom Sections — order mirrors Flutter's product_detail_screen.dart:
            bundle → collection → questions → reviews → related. */}
        <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
          {hasBundles && (
            <Suspense fallback={null}>
              <BundleComponent
                key={`bundle-${product.id}`}
                productId={product.id}
                shopId={product.shopId}
                localization={localization}
                prefetchedData={bundles as unknown as BundleDisplayData[] | null}
              />
            </Suspense>
          )}

          {hasCollection && (
            <Suspense fallback={null}>
              <ProductCollectionWidget
                key={`collection-${product.id}`}
                productId={product.id}
                shopId={product.shopId}
                localization={localization}
                prefetchedData={collection}
              />
            </Suspense>
          )}

          {hasQuestions && (
            <Suspense fallback={null}>
              <ProductQuestionsWidget
                key={`questions-${product.id}`}
                productId={product.id}
                sellerId={product.userId}
                shopId={product.shopId}
                isShop={!!product.shopId}
                localization={localization}
                locale={locale}
                prefetchedData={
                  questionsTotal === null
                    ? null
                    : { questions, totalCount: questionsTotal }
                }
              />
            </Suspense>
          )}

          {hasReviews && (
            <Suspense
              fallback={
                <div className="h-40 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
              }
            >
              <ProductDetailReviewsTab
                key={`reviews-${product.id}`}
                productId={product.id}
                isShop={!!product.shopId}
                localization={localization}
                locale={locale}
                prefetchedData={
                  reviewsTotal === null
                    ? null
                    : { reviews, totalCount: reviewsTotal }
                }
              />
            </Suspense>
          )}

          {hasRelatedProducts && (
            <Suspense
              fallback={
                <div className="h-40 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
              }
            >
              <ProductDetailRelatedProducts
                key={`related-${product.id}`}
                productId={product.id}
                category={product.category}
                subcategory={product.subcategory}
                relatedProductIds={product.relatedProductIds}
                localization={localization}
                prefetchedProducts={
                  relatedProducts === null
                    ? undefined
                    : (relatedProducts as unknown as Product[])
                }
              />
            </Suspense>
          )}
        </div>

        <div className="h-20 sm:h-24" />
      </div>

      {/* Option Selectors */}
      <ProductOptionSelector
        product={product}
        isOpen={cart.showCartOptionSelector}
        onClose={cart.handleCartOptionSelectorClose}
        onConfirm={cart.handleCartOptionSelectorConfirm}
        localization={localization}
      />

      <ProductOptionSelector
        product={product}
        isOpen={cart.showBuyNowOptionSelector}
        onClose={cart.handleBuyNowOptionSelectorClose}
        onConfirm={cart.handleBuyNowOptionSelectorConfirm}
        localization={localization}
      />

      {/* Ask to Seller Bubble */}
      <Suspense fallback={null}>
        <AskToSellerBubble
          onTap={() => {
            const sellerId = product.shopId || product.userId;
            const isShop = !!product.shopId;
            router.push(
              `/asktoseller?productId=${product.id}&sellerId=${sellerId}&isShop=${isShop}`
            );
          }}
          localization={localization}
        />
      </Suspense>

      {/* Login Modal */}
      <LoginModal
        isOpen={cart.showLoginModal}
        onClose={() => cart.setShowLoginModal(false)}
      />

      {/* Sales Paused Dialog */}
      {showSalesPausedDialog && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSalesPausedDialog(false)}
          />
          <div className="relative z-10 w-full max-w-sm mx-4 rounded-2xl overflow-hidden shadow-2xl bg-white dark:bg-surface-2">
            <div className="px-6 py-5 bg-orange-50 dark:bg-gray-700">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-orange-100 dark:bg-orange-500/20">
                  <svg
                    className="w-6 h-6 text-orange-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {t("salesPausedTitle") || "Sales Temporarily Paused"}
                </h3>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-center text-gray-600 dark:text-gray-300">
                {pauseReason ||
                  t("salesPausedMessage") ||
                  "We are currently not accepting orders. Please try again later."}
              </p>
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50">
              <button
                onClick={() => setShowSalesPausedDialog(false)}
                className="w-full py-3 px-4 rounded-xl font-medium transition-all duration-200 bg-gradient-to-r from-orange-500 to-pink-500 text-white hover:from-orange-600 hover:to-pink-600 active:scale-95"
              >
                {t("understood") || "Understood"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
