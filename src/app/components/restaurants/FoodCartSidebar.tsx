"use client";

import React, { useState, useCallback } from "react";
import Image from "next/image";
import {
  ShoppingBag,
  Trash2,
  Minus,
  Plus,
  UtensilsCrossed,
  ChevronRight,
  X,
  Pencil,
  StickyNote,
} from "lucide-react";
import {
  useFoodCartState,
  useFoodCartActions,
  type FoodCartItem,
  type SelectedExtra,
} from "@/context/FoodCartProvider";
import { useRouter } from "@/navigation";
import { useTranslations } from "next-intl";
import FoodExtrasSheet from "./FoodExtrasSheet";
import MinOrderAlertDialog from "./MinOrderAlertDialog";
import { FoodExtrasData } from "@/constants/foodExtras";
import { FoodCategoryData } from "@/constants/foodData";
import { useUser } from "@/context/UserProvider";
import { FoodAddress } from "@/app/models/FoodAddress";
import { getMinOrderPrice } from "@/utils/restaurant";
import type { Restaurant } from "@/types/Restaurant";

// ─── Compact Cart Item ──────────────────────────────────────────────────────

function SidebarCartItem({
  item,
  isDarkMode,
  onQuantityChange,
  onRemove,
  onEditExtras,
}: {
  item: FoodCartItem;
  isDarkMode: boolean;
  onQuantityChange: (qty: number) => void;
  onRemove: () => void;
  onEditExtras: () => void;
}) {
  const localization = useTranslations();

  const getExtraName = useCallback(
    (name: string) => {
      const key = FoodExtrasData.kExtrasTranslationKeys[name];
      if (!key) return name;
      try {
        const translated = localization(key);
        return translated !== key ? translated : name;
      } catch {
        return name;
      }
    },
    [localization],
  );

  const extrasTotal = item.extras.reduce(
    (sum, ext) => sum + ext.price * ext.quantity,
    0,
  );
  const lineTotal = (item.price + extrasTotal) * item.quantity;

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        isDarkMode
          ? "bg-gray-800/60 border-gray-700/50"
          : "bg-white border-gray-100"
      } ${item.isOptimistic ? "opacity-70" : ""}`}
    >
      <div className="flex gap-2.5">
        {/* Image */}
        {item.imageUrl ? (
          <div
            className={`relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 border ${
              isDarkMode ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              className="object-cover"
              sizes="56px"
            />
          </div>
        ) : (
          <div
            className={`w-14 h-14 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isDarkMode ? "bg-gray-700" : "bg-orange-50"
            }`}
          >
            {FoodCategoryData.kCategoryIcons[item.foodCategory] ? (
              <Image
                src={`/foods/${FoodCategoryData.kCategoryIcons[item.foodCategory]}`}
                alt={item.foodCategory}
                width={28}
                height={28}
                className="object-contain"
              />
            ) : (
              <UtensilsCrossed
                size={18}
                className={isDarkMode ? "text-gray-500" : "text-orange-300"}
              />
            )}
          </div>
        )}

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <h4
              className={`text-xs font-semibold leading-snug line-clamp-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {item.name}
            </h4>
            <button
              onClick={onRemove}
              disabled={item.isOptimistic}
              className={`p-1 rounded-md transition-colors flex-shrink-0 ${
                isDarkMode
                  ? "text-gray-600 hover:text-red-400 hover:bg-red-900/20"
                  : "text-gray-300 hover:text-red-500 hover:bg-red-50"
              } disabled:opacity-40`}
            >
              <Trash2 size={12} />
            </button>
          </div>

          <p className="text-xs font-bold text-orange-500 mt-0.5">
            {lineTotal.toFixed(2)} TL
          </p>

          {/* Quantity + Edit */}
          <div className="flex items-center justify-between mt-1.5">
            <div
              className={`inline-flex items-center rounded-lg border ${
                isDarkMode ? "border-gray-600" : "border-gray-200"
              }`}
            >
              <button
                onClick={() => onQuantityChange(item.quantity - 1)}
                disabled={item.quantity <= 1 || item.isOptimistic}
                className={`p-1 transition-colors rounded-l-lg ${
                  isDarkMode
                    ? "hover:bg-gray-700 text-gray-400"
                    : "hover:bg-gray-50 text-gray-500"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Minus size={12} />
              </button>
              <span
                className={`min-w-[24px] text-center text-xs font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {item.quantity}
              </span>
              <button
                onClick={() => onQuantityChange(item.quantity + 1)}
                disabled={item.isOptimistic}
                className={`p-1 transition-colors rounded-r-lg ${
                  isDarkMode
                    ? "hover:bg-gray-700 text-gray-400"
                    : "hover:bg-gray-50 text-gray-500"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Plus size={12} />
              </button>
            </div>

            <button
              onClick={onEditExtras}
              className={`inline-flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[10px] font-medium transition-colors ${
                isDarkMode
                  ? "text-orange-400 hover:bg-orange-500/10"
                  : "text-orange-600 hover:bg-orange-50"
              }`}
            >
              <Pencil size={10} />
            </button>
          </div>
        </div>
      </div>

      {/* Extras pills */}
      {item.extras.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.extras.map((ext) => (
            <span
              key={ext.name}
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-medium ${
                isDarkMode
                  ? "bg-gray-700 text-gray-400 border border-gray-600"
                  : "bg-gray-50 text-gray-500 border border-gray-100"
              }`}
            >
              <span className="text-orange-500">+</span>
              {getExtraName(ext.name)}
              {ext.quantity > 1 && (
                <span
                  className={isDarkMode ? "text-gray-500" : "text-gray-300"}
                >
                  x{ext.quantity}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Special notes */}
      {item.specialNotes && (
        <div
          className={`mt-1.5 flex items-start gap-1 px-2 py-1.5 rounded-md ${
            isDarkMode ? "bg-gray-700/60" : "bg-amber-50/60"
          }`}
        >
          <StickyNote
            size={9}
            className={`mt-0.5 flex-shrink-0 ${
              isDarkMode ? "text-amber-500/60" : "text-amber-400"
            }`}
          />
          <p
            className={`text-[10px] leading-relaxed line-clamp-2 ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            {item.specialNotes}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Cart Content (shared between desktop sidebar and mobile sheet) ─────────

function CartContent({
  isDarkMode,
  restaurant,
}: {
  isDarkMode: boolean;
  compact?: boolean;
  restaurant?: Pick<Restaurant, "minOrderPrices"> | null;
}) {
  const router = useRouter();
  const localization = useTranslations();
  const { items, totals, itemCount, currentRestaurant } = useFoodCartState();
  const { removeItem, updateQuantity, updateExtras, updateNotes, clearCart } =
    useFoodCartActions();
  const { profileData } = useUser();

  const [editingItem, setEditingItem] = useState<FoodCartItem | null>(null);
  const [showMinOrderAlert, setShowMinOrderAlert] = useState(false);

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

  // Derive min order price from restaurant + user address
  const foodAddress = profileData?.foodAddress
    ? FoodAddress.fromMap(profileData.foodAddress as Record<string, unknown>)
    : null;
  const minOrderPrice = restaurant
    ? getMinOrderPrice(restaurant, foodAddress?.city, foodAddress?.mainRegion)
    : undefined;

  const handleCheckout = useCallback(() => {
    if (items.length === 0) return;

    // Check minimum order requirement
    if (minOrderPrice != null && totals.subtotal < minOrderPrice) {
      setShowMinOrderAlert(true);
      return;
    }

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
  }, [items, currentRestaurant, totals, router, minOrderPrice]);

  // Empty state
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 px-4">
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
            isDarkMode ? "bg-gray-800" : "bg-orange-50"
          }`}
        >
          <ShoppingBag
            size={28}
            className={isDarkMode ? "text-gray-600" : "text-orange-300"}
          />
        </div>
        <h3
          className={`text-sm font-semibold mb-1 ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {t("emptyCart", "Your cart is empty")}
        </h3>
        <p
          className={`text-xs text-center max-w-[200px] ${
            isDarkMode ? "text-gray-500" : "text-gray-400"
          }`}
        >
          {t("emptyCartDesc", "Add items from the menu to get started")}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <h3
              className={`text-sm font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("title", "Your Cart")}
            </h3>
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                isDarkMode
                  ? "bg-orange-500/15 text-orange-400"
                  : "bg-orange-50 text-orange-600"
              }`}
            >
              {itemCount}
            </span>
          </div>
          <button
            onClick={() => clearCart()}
            className={`text-[10px] font-medium px-2 py-1 rounded-md transition-colors ${
              isDarkMode
                ? "text-red-400 hover:bg-red-900/20"
                : "text-red-500 hover:bg-red-50"
            }`}
          >
            {t("clearAll", "Clear")}
          </button>
        </div>

        {/* Divider */}
        <div
          className={`border-t ${isDarkMode ? "border-gray-700/60" : "border-gray-100"}`}
        />

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {items.map((item) => (
            <SidebarCartItem
              key={item.foodId}
              item={item}
              isDarkMode={isDarkMode}
              onQuantityChange={(qty) => updateQuantity(item.foodId, qty)}
              onRemove={() => removeItem(item.foodId)}
              onEditExtras={() => setEditingItem(item)}
            />
          ))}
        </div>

        {/* Divider */}
        <div
          className={`border-t ${isDarkMode ? "border-gray-700/60" : "border-gray-100"}`}
        />

        {/* Summary + Checkout */}
        <div className="px-4 py-3 space-y-3">
          {/* Item breakdown */}
          <div className="space-y-1.5">
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
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <span
                      className={`text-[10px] font-medium ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      {item.quantity}x
                    </span>
                    <span
                      className={`text-[10px] truncate ${
                        isDarkMode ? "text-gray-300" : "text-gray-600"
                      }`}
                    >
                      {item.name}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-medium ml-2 flex-shrink-0 ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    {lineTotal.toFixed(2)} TL
                  </span>
                </div>
              );
            })}
          </div>

          {/* Divider */}
          <div
            className={`border-t ${isDarkMode ? "border-gray-700/60" : "border-gray-100"}`}
          />

          {/* Total */}
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-semibold ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("total", "Total")}
            </span>
            <span className="text-base font-bold text-orange-500">
              {totals.subtotal.toFixed(2)}{" "}
              <span className="text-xs font-semibold">{totals.currency}</span>
            </span>
          </div>

          {/* Checkout */}
          <button
            onClick={handleCheckout}
            className="w-full py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <span>{t("proceedToCheckout", "Checkout")}</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Edit Extras Sheet */}
      {editingItem && (
        <FoodExtrasSheet
          open={!!editingItem}
          onClose={() => setEditingItem(null)}
          onConfirm={handleExtrasEditConfirm}
          foodName={editingItem.name}
          foodPrice={editingItem.price}
          foodCategory={editingItem.foodCategory}
          isDarkMode={isDarkMode}
          initialExtras={editingItem.extras}
          initialNotes={editingItem.specialNotes}
          initialQuantity={editingItem.quantity}
        />
      )}

      {/* Min Order Alert */}
      {minOrderPrice != null && (
        <MinOrderAlertDialog
          open={showMinOrderAlert}
          minOrderPrice={minOrderPrice}
          currentTotal={totals.subtotal}
          currency={totals.currency}
          onClose={() => setShowMinOrderAlert(false)}
          isDarkMode={isDarkMode}
          t={t}
        />
      )}
    </>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export default function FoodCartSidebar({
  isDarkMode,
  mode,
  restaurant,
}: {
  isDarkMode: boolean;
  mode?: "desktop" | "mobile";
  restaurant?: Pick<Restaurant, "minOrderPrices"> | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { itemCount } = useFoodCartState();

  return (
    <>
      {/* ── Desktop Sidebar ──────────────────────────────────────────── */}
      {mode !== "mobile" && (
        <aside
          className={`flex flex-col self-start sticky top-20 max-h-[calc(100vh-6rem)] rounded-2xl border overflow-hidden ${
            isDarkMode
              ? "bg-gray-900/80 border-gray-700/50"
              : "bg-white border-gray-200"
          }`}
        >
          <CartContent isDarkMode={isDarkMode} restaurant={restaurant} />
        </aside>
      )}

      {/* ── Mobile FAB ───────────────────────────────────────────────── */}
      {mode !== "desktop" && (
        <button
          onClick={() => setMobileOpen(true)}
          className={`lg:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform active:scale-95 bg-orange-500 hover:bg-orange-600`}
        >
          <ShoppingBag size={22} className="text-white" />
          {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {itemCount}
            </span>
          )}
        </button>
      )}

      {/* ── Mobile Bottom Sheet ──────────────────────────────────────── */}
      {mode !== "desktop" && mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 transition-opacity"
            onClick={() => setMobileOpen(false)}
          />

          {/* Sheet */}
          <div
            className={`relative w-full max-h-[85vh] flex flex-col rounded-t-2xl overflow-hidden modal-content-enter ${
              isDarkMode
                ? "bg-gray-900 border-t border-gray-700/50"
                : "bg-white border-t border-gray-200"
            }`}
          >
            {/* Drag handle + Close */}
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <div
                className={`w-10 h-1 rounded-full mx-auto ${
                  isDarkMode ? "bg-gray-700" : "bg-gray-300"
                }`}
              />
              <button
                onClick={() => setMobileOpen(false)}
                className={`absolute right-3 top-3 p-1.5 rounded-lg transition-colors ${
                  isDarkMode
                    ? "text-gray-500 hover:bg-gray-800"
                    : "text-gray-400 hover:bg-gray-100"
                }`}
              >
                <X size={18} />
              </button>
            </div>

            <CartContent isDarkMode={isDarkMode} restaurant={restaurant} />
          </div>
        </div>
      )}
    </>
  );
}
