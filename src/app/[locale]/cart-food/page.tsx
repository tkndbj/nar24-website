"use client";

import React, { useState, useCallback, useMemo } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Trash2,
  Minus,
  Plus,
  UtensilsCrossed,
  Clock,
  StickyNote,
  ChevronRight,
  Store,
  Pencil,
  ChefHat,
} from "lucide-react";
import {
  useFoodCart,
  type FoodCartItem,
  type SelectedExtra,
} from "@/context/FoodCartProvider";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "@/navigation";
import { useTranslations } from "next-intl";
import FoodExtrasSheet from "@/app/components/restaurants/FoodExtrasSheet";
import { FoodExtrasData } from "@/constants/foodExtras";
import { FoodCategoryData } from "@/constants/foodData";
import Footer from "@/app/components/Footer";
import { db } from "@/lib/firebase";
import { FoodCartProvider } from "@/context/FoodCartProvider";

// ═══════════════════════════════════════════════════════════════════════════
// WRAPPER — provides FoodCartProvider
// ═══════════════════════════════════════════════════════════════════════════

export default function FoodCartPage() {
  const { user } = useUser();
  return (
    <FoodCartProvider user={user} db={db}>
      <FoodCartPageContent />
    </FoodCartProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CONTENT
// ═══════════════════════════════════════════════════════════════════════════

function FoodCartPageContent() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useUser();
  const localization = useTranslations();

  const {
    currentRestaurant,
    items,
    itemCount,
    totals,
    isLoading,
    isInitialized,
    removeItem,
    updateQuantity,
    updateExtras,
    updateNotes,
    clearCart,
  } = useFoodCart();

  // ── Theme ────────────────────────────────────────────────────────────
  const [isDark, setIsDark] = useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const check = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  // ── Translation helper ───────────────────────────────────────────────
  const t = useCallback(
    (key: string, fallback?: string) => {
      if (!localization) return fallback ?? key;
      try {
        const v = localization(`FoodCart.${key}`);
        if (v && v !== `FoodCart.${key}`) return v;
        const d = localization(key);
        if (d && d !== key) return d;
        return fallback ?? key;
      } catch {
        return fallback ?? key;
      }
    },
    [localization],
  );

  // Root-level translation (for extras names)
  const tRoot = useCallback(
    (key: string) => {
      if (!localization) return key;
      try {
        return localization(key);
      } catch {
        return key;
      }
    },
    [localization],
  );

  // ── Editing extras state ─────────────────────────────────────────────
  const [editingItem, setEditingItem] = useState<FoodCartItem | null>(null);

  // ── Clear cart confirmation ──────────────────────────────────────────
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // ── Estimated prep time ──────────────────────────────────────────────
  const estimatedPrepTime = useMemo(() => {
    if (items.length === 0) return 0;
    // Max prep time across items (they prepare in parallel)
    return Math.max(...items.map((i) => i.preparationTime ?? 0));
  }, [items]);

  // ── Handle extras edit confirm ───────────────────────────────────────
  const handleExtrasEditConfirm = useCallback(
    async (extras: SelectedExtra[], notes: string, quantity: number) => {
      if (!editingItem) return;
      await updateExtras(editingItem.foodId, extras);
      await updateNotes(editingItem.foodId, notes);
      await updateQuantity(editingItem.foodId, quantity);
      setEditingItem(null);
    },
    [editingItem, updateExtras, updateNotes, updateQuantity],
  );

  // ── Checkout ─────────────────────────────────────────────────────────
  const handleCheckout = useCallback(() => {
    if (items.length === 0) return;

    // Store food checkout data in sessionStorage
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        "foodCheckoutData",
        JSON.stringify({
          restaurantId: currentRestaurant?.id,
          restaurantName: currentRestaurant?.name,
          items: items.map((i) => ({
            foodId: i.foodId,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            extras: i.extras,
            specialNotes: i.specialNotes,
          })),
          totals,
          timestamp: Date.now(),
        }),
      );
    }

    router.push("/food-checkout");
  }, [items, currentRestaurant, totals, router]);

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  return (
    <div
      className={`min-h-screen flex flex-col transition-colors duration-200 ${
        isDark ? "bg-gray-950" : "bg-gray-50"
      }`}
    >
      <div className="max-w-3xl mx-auto px-0 sm:px-4 pt-4 pb-0 lg:pt-8 lg:pb-8 flex-1 w-full">
        {/* ── Back Button ─────────────────────────────────────────── */}
        <div className="mb-4 lg:mb-6 px-3 sm:px-0">
          <button
            onClick={() => router.back()}
            className={`p-2 rounded-xl transition-colors border ${
              isDark
                ? "bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700"
                : "bg-white hover:bg-gray-100 text-gray-500 border-gray-200"
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* ── Auth Loading ────────────────────────────────────────── */}
        {isAuthLoading ? (
          <LoadingSpinner isDark={isDark} />
        ) : !user ? (
          /* ── Not Authenticated ──────────────────────────────────── */
          <EmptyState
            isDark={isDark}
            icon={<UtensilsCrossed size={24} />}
            title={t("loginRequired", "Login Required")}
            subtitle={t("loginToViewCart", "Please log in to view your food cart")}
            actionLabel={t("login", "Login")}
            onAction={() => router.push("/")}
          />
        ) : isLoading && !isInitialized ? (
          /* ── Loading ────────────────────────────────────────────── */
          <LoadingSpinner isDark={isDark} label={t("loading", "Loading your food cart...")} />
        ) : items.length === 0 ? (
          /* ── Empty Cart ─────────────────────────────────────────── */
          <div className="flex flex-col items-center py-16 px-4">
            <div
              className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-6 ${
                isDark ? "bg-gray-800" : "bg-orange-50"
              }`}
            >
              <UtensilsCrossed
                size={40}
                className={isDark ? "text-gray-600" : "text-orange-300"}
              />
            </div>
            <h3
              className={`text-lg font-bold mb-1.5 ${
                isDark ? "text-white" : "text-gray-900"
              }`}
            >
              {t("emptyCart", "Your food cart is empty")}
            </h3>
            <p
              className={`text-sm mb-6 text-center max-w-xs ${
                isDark ? "text-gray-500" : "text-gray-400"
              }`}
            >
              {t("emptyCartDesc", "Browse restaurants and add delicious meals to your cart")}
            </p>
            <button
              onClick={() => router.push("/restaurants")}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
            >
              <Store size={16} />
              <span>{t("browseRestaurants", "Browse Restaurants")}</span>
            </button>
          </div>
        ) : (
          /* ── Cart with Items ────────────────────────────────────── */
          <>
            {/* Title */}
            <div className="flex items-center justify-between mb-4 px-3 sm:px-0">
              <div className="flex items-center gap-3">
                <h1
                  className={`text-xl font-bold ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("title", "Food Cart")}
                </h1>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    isDark
                      ? "bg-orange-500/15 text-orange-400"
                      : "bg-orange-50 text-orange-600"
                  }`}
                >
                  {itemCount} {itemCount === 1 ? t("item", "item") : t("items", "items")}
                </span>
              </div>
              <button
                onClick={() => setShowClearConfirm(true)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  isDark
                    ? "text-red-400 hover:bg-red-900/20"
                    : "text-red-500 hover:bg-red-50"
                }`}
              >
                {t("clearAll", "Clear All")}
              </button>
            </div>

            {/* ── Restaurant Header Card ──────────────────────────── */}
            {currentRestaurant && (
              <div
                className={`mx-3 sm:mx-0 mb-4 rounded-2xl border overflow-hidden ${
                  isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
                }`}
              >
                <div className="px-4 py-3.5 flex items-center gap-3">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isDark ? "bg-orange-500/15" : "bg-orange-50"
                    }`}
                  >
                    {currentRestaurant.profileImageUrl ? (
                      <Image
                        src={currentRestaurant.profileImageUrl}
                        alt={currentRestaurant.name}
                        width={44}
                        height={44}
                        className="rounded-xl object-cover"
                      />
                    ) : (
                      <ChefHat
                        size={20}
                        className={isDark ? "text-orange-400" : "text-orange-500"}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-bold truncate ${
                        isDark ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {currentRestaurant.name}
                    </p>
                    <p
                      className={`text-[11px] mt-0.5 ${
                        isDark ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      {t("orderingFrom", "Ordering from this restaurant")}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      router.push(`/restaurantdetail/${currentRestaurant.id}`)
                    }
                    className={`p-2 rounded-lg transition-colors ${
                      isDark
                        ? "text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                        : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    }`}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Prep time indicator */}
                {estimatedPrepTime > 0 && (
                  <div
                    className={`px-4 py-2 border-t flex items-center gap-2 ${
                      isDark
                        ? "border-gray-800 bg-gray-800/40"
                        : "border-gray-50 bg-gray-50/60"
                    }`}
                  >
                    <Clock
                      size={13}
                      className={isDark ? "text-gray-500" : "text-gray-400"}
                    />
                    <span
                      className={`text-[11px] font-medium ${
                        isDark ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      {t("estimatedPrep", "Estimated preparation")}:{" "}
                      <span
                        className={isDark ? "text-gray-300" : "text-gray-600"}
                      >
                        ~{estimatedPrepTime} {t("min", "min")}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Cart Items ──────────────────────────────────────── */}
            <div className="mx-3 sm:mx-0 space-y-3">
              {items.map((item) => (
                <FoodCartItemCard
                  key={item.foodId}
                  item={item}
                  isDark={isDark}
                  t={t}
                  tRoot={tRoot}
                  onQuantityChange={(qty) => updateQuantity(item.foodId, qty)}
                  onRemove={() => removeItem(item.foodId)}
                  onEditExtras={() => setEditingItem(item)}
                />
              ))}
            </div>

            {/* ── Order Summary ────────────────────────────────────── */}
            <div className="mt-6 mx-3 sm:mx-0">
              <div
                className={`rounded-2xl border overflow-hidden ${
                  isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
                }`}
              >
                <div className="px-4 py-4 sm:px-5 sm:py-5">
                  <h2
                    className={`text-sm font-bold mb-4 ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("orderSummary", "Order Summary")}
                  </h2>

                  {/* Item breakdown */}
                  <div className="space-y-2 mb-4">
                    {items.map((item) => {
                      const extrasTotal = item.extras.reduce(
                        (s, e) => s + e.price * e.quantity,
                        0,
                      );
                      const lineTotal = (item.price + extrasTotal) * item.quantity;
                      return (
                        <div
                          key={item.foodId}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span
                              className={`text-xs font-medium ${
                                isDark ? "text-gray-500" : "text-gray-400"
                              }`}
                            >
                              {item.quantity}×
                            </span>
                            <span
                              className={`text-xs truncate ${
                                isDark ? "text-gray-300" : "text-gray-600"
                              }`}
                            >
                              {item.name}
                            </span>
                          </div>
                          <span
                            className={`text-xs font-medium ml-3 flex-shrink-0 ${
                              isDark ? "text-gray-400" : "text-gray-500"
                            }`}
                          >
                            {lineTotal.toFixed(2)} {totals.currency}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Divider */}
                  <div
                    className={`border-t mb-4 ${
                      isDark ? "border-gray-800" : "border-gray-100"
                    }`}
                  />

                  {/* Total */}
                  <div className="flex items-end justify-between mb-5">
                    <div>
                      <span
                        className={`text-[10px] uppercase tracking-wider font-semibold ${
                          isDark ? "text-gray-600" : "text-gray-400"
                        }`}
                      >
                        {t("total", "Total")}
                      </span>
                      <p className="text-2xl font-bold text-orange-500 mt-0.5">
                        {totals.subtotal.toFixed(2)}{" "}
                        <span className="text-sm font-semibold">
                          {totals.currency}
                        </span>
                      </p>
                    </div>
                    <p
                      className={`text-[11px] ${
                        isDark ? "text-gray-600" : "text-gray-400"
                      }`}
                    >
                      {t("deliveryFeeAtCheckout", "Delivery fee calculated at checkout")}
                    </p>
                  </div>

                  {/* Checkout Button */}
                  <button
                    onClick={handleCheckout}
                    disabled={items.length === 0}
                    className="w-full py-3 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[14px] font-semibold transition-colors flex items-center justify-center gap-2"
                  >
                    <span>{t("proceedToCheckout", "Proceed to Checkout")}</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom spacing for mobile */}
            <div className="h-8" />
          </>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MODALS
          ═══════════════════════════════════════════════════════════════ */}

      {/* Edit Extras Sheet */}
      {editingItem && (
        <FoodExtrasSheet
          open={!!editingItem}
          onClose={() => setEditingItem(null)}
          onConfirm={handleExtrasEditConfirm}
          foodName={editingItem.name}
          foodPrice={editingItem.price}
          foodCategory={editingItem.foodCategory}
          isDarkMode={isDark}
          initialExtras={editingItem.extras}
          initialNotes={editingItem.specialNotes}
          initialQuantity={editingItem.quantity}
        />
      )}

      {/* Clear Cart Confirmation */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className={`w-full max-w-xs rounded-2xl border shadow-lg overflow-hidden ${
              isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5 text-center">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 ${
                  isDark ? "bg-red-500/15" : "bg-red-50"
                }`}
              >
                <Trash2 size={20} className="text-red-500" />
              </div>
              <h3
                className={`text-base font-bold mb-1 ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                {t("clearCartTitle", "Clear Food Cart?")}
              </h3>
              <p
                className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}
              >
                {t("clearCartDesc", "This will remove all items from your food cart.")}
              </p>
            </div>
            <div
              className={`px-5 py-3.5 flex gap-3 border-t ${
                isDark ? "border-gray-800 bg-gray-800/50" : "border-gray-50 bg-gray-50"
              }`}
            >
              <button
                onClick={() => setShowClearConfirm(false)}
                className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold border transition-colors ${
                  isDark
                    ? "border-gray-700 text-gray-300 hover:bg-gray-800"
                    : "border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t("cancel", "Cancel")}
              </button>
              <button
                onClick={() => {
                  clearCart();
                  setShowClearConfirm(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[13px] font-semibold transition-colors"
              >
                {t("clearCart", "Clear Cart")}
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FOOD CART ITEM CARD
// ═══════════════════════════════════════════════════════════════════════════

function FoodCartItemCard({
  item,
  isDark,
  t,
  tRoot,
  onQuantityChange,
  onRemove,
  onEditExtras,
}: {
  item: FoodCartItem;
  isDark: boolean;
  t: (key: string, fallback: string) => string;
  tRoot: (key: string) => string;
  onQuantityChange: (qty: number) => void;
  onRemove: () => void;
  onEditExtras: () => void;
}) {
  const extrasTotal = item.extras.reduce(
    (sum, ext) => sum + ext.price * ext.quantity,
    0,
  );
  const lineTotal = (item.price + extrasTotal) * item.quantity;

  // Translate extra names using imported FoodExtrasData
  const getExtraName = useCallback(
    (name: string) => {
      const key = FoodExtrasData.kExtrasTranslationKeys[name];
      if (!key) return name;
      try {
        const translated = tRoot(key);
        return translated !== key ? translated : name;
      } catch {
        return name;
      }
    },
    [tRoot],
  );

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-colors ${
        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
      } ${item.isOptimistic ? "opacity-70" : ""}`}
    >
      <div className="p-4">
        <div className="flex gap-3">
          {/* Food Image or Category Icon */}
          {item.imageUrl ? (
            <div
              className={`relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 border ${
                isDark ? "border-gray-700" : "border-gray-200"
              }`}
            >
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
          ) : (
            <div
              className={`w-20 h-20 rounded-xl flex items-center justify-center flex-shrink-0 ${
                isDark ? "bg-gray-800" : "bg-orange-50"
              }`}
            >
              {FoodCategoryData.kCategoryIcons[item.foodCategory] ? (
                <Image
                  src={`/foods/${FoodCategoryData.kCategoryIcons[item.foodCategory]}`}
                  alt={item.foodCategory}
                  width={40}
                  height={40}
                  className="object-contain"
                />
              ) : (
                <UtensilsCrossed
                  size={24}
                  className={isDark ? "text-gray-600" : "text-orange-300"}
                />
              )}
            </div>
          )}

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3
                  className={`text-sm font-bold leading-snug line-clamp-2 ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {item.name}
                </h3>
                <p
                  className={`text-[11px] mt-0.5 ${
                    isDark ? "text-gray-500" : "text-gray-400"
                  }`}
                >
                  {item.foodType}
                </p>
              </div>

              {/* Remove button */}
              <button
                onClick={onRemove}
                disabled={item.isOptimistic}
                className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                  isDark
                    ? "text-gray-600 hover:text-red-400 hover:bg-red-900/20"
                    : "text-gray-300 hover:text-red-500 hover:bg-red-50"
                } disabled:opacity-40`}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Price */}
            <p className="text-sm font-bold text-orange-500 mt-1.5">
              {lineTotal.toFixed(2)} TL
              {item.quantity > 1 && (
                <span
                  className={`text-[10px] font-normal ml-1.5 ${
                    isDark ? "text-gray-500" : "text-gray-400"
                  }`}
                >
                  ({item.price.toFixed(2)} × {item.quantity})
                </span>
              )}
            </p>

            {/* Quantity + Edit row */}
            <div className="flex items-center justify-between mt-2.5">
              {/* Quantity controls */}
              <div
                className={`inline-flex items-center rounded-xl border ${
                  isDark ? "border-gray-700" : "border-gray-200"
                }`}
              >
                <button
                  onClick={() => onQuantityChange(item.quantity - 1)}
                  disabled={item.quantity <= 1 || item.isOptimistic}
                  className={`p-1.5 transition-colors rounded-l-xl ${
                    isDark
                      ? "hover:bg-gray-800 text-gray-400"
                      : "hover:bg-gray-50 text-gray-500"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Minus size={14} />
                </button>
                <span
                  className={`min-w-[32px] text-center text-sm font-bold ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {item.quantity}
                </span>
                <button
                  onClick={() => onQuantityChange(item.quantity + 1)}
                  disabled={item.isOptimistic}
                  className={`p-1.5 transition-colors rounded-r-xl ${
                    isDark
                      ? "hover:bg-gray-800 text-gray-400"
                      : "hover:bg-gray-50 text-gray-500"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Edit button */}
              <button
                onClick={onEditExtras}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  isDark
                    ? "text-orange-400 hover:bg-orange-500/10"
                    : "text-orange-600 hover:bg-orange-50"
                }`}
              >
                <Pencil size={11} />
                {t("edit", "Edit")}
              </button>
            </div>
          </div>
        </div>

        {/* ── Extras pills ──────────────────────────────────────── */}
        {item.extras.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.extras.map((ext) => (
              <span
                key={ext.name}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium ${
                  isDark
                    ? "bg-gray-800 text-gray-400 border border-gray-700"
                    : "bg-gray-50 text-gray-500 border border-gray-100"
                }`}
              >
                <span className="text-orange-500">+</span>
                {getExtraName(ext.name)}
                {ext.quantity > 1 && (
                  <span className={isDark ? "text-gray-600" : "text-gray-300"}>
                    ×{ext.quantity}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* ── Special notes ─────────────────────────────────────── */}
        {item.specialNotes && (
          <div
            className={`mt-2.5 flex items-start gap-1.5 px-2.5 py-2 rounded-lg ${
              isDark ? "bg-gray-800/60" : "bg-amber-50/60"
            }`}
          >
            <StickyNote
              size={11}
              className={`mt-0.5 flex-shrink-0 ${
                isDark ? "text-amber-500/60" : "text-amber-400"
              }`}
            />
            <p
              className={`text-[11px] leading-relaxed ${
                isDark ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {item.specialNotes}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function LoadingSpinner({
  isDark,
  label,
}: {
  isDark: boolean;
  label?: string;
}) {
  return (
    <div className="flex flex-col items-center py-20">
      <div className="w-6 h-6 border-[2px] border-orange-200 border-t-orange-500 rounded-full animate-spin mb-3" />
      {label && (
        <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
          {label}
        </p>
      )}
    </div>
  );
}

function EmptyState({
  isDark,
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  isDark: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div
      className={`max-w-md mx-auto rounded-2xl border shadow-sm p-8 text-center ${
        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
      }`}
    >
      <div
        className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
          isDark ? "bg-gray-800" : "bg-gray-100"
        }`}
      >
        <span className={isDark ? "text-gray-500" : "text-gray-400"}>
          {icon}
        </span>
      </div>
      <h3
        className={`text-base font-bold mb-1.5 ${
          isDark ? "text-white" : "text-gray-900"
        }`}
      >
        {title}
      </h3>
      <p
        className={`text-sm mb-5 leading-relaxed ${
          isDark ? "text-gray-500" : "text-gray-500"
        }`}
      >
        {subtitle}
      </p>
      <button
        onClick={onAction}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
      >
        <span>{actionLabel}</span>
      </button>
    </div>
  );
}