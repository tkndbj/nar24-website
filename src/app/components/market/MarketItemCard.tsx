// components/market/MarketItemCard.tsx
//
// Product card. Mirrors the Flutter MarketItemCard but with web-native
// deviations per the user's choices:
//   • Nutrition info expands INLINE inside the card (not a bottom sheet)
//   • Full-screen image viewer is a lightbox modal with pinch-zoom
//   • Login is gated via a caller-supplied `requireAuth()` callback
//
// The card does the minimum reads from the cart context:
//   • `quantityOf(id)`   → drives the Add button vs. stepper
//   • `addItem`, `updateQuantity` → mutations
// The full `items` array is never touched here so a cart update only
// re-renders cards whose quantity actually changed.

"use client";

import { useState, useMemo, useCallback } from "react";
import { Plus, Minus, ChevronDown, ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import CloudinaryImage from "../../components/CloudinaryImage";
import { useMarketCart } from "../../../context/MarketCartProvider";
import {
  hasNutritionData,
  type MarketItem,
} from "../../../lib/typesense_market_service";
import ImageLightbox from "./ImageLightbox";

const NUTRITION_ORDER = [
  { key: "calories", labelKey: "marketNutritionCalories", unit: "kcal" },
  { key: "protein", labelKey: "marketNutritionProtein", unit: "g" },
  { key: "carbs", labelKey: "marketNutritionCarbs", unit: "g" },
  { key: "sugar", labelKey: "marketNutritionSugar", unit: "g" },
  { key: "fat", labelKey: "marketNutritionFat", unit: "g" },
  { key: "fiber", labelKey: "marketNutritionFiber", unit: "g" },
  { key: "salt", labelKey: "marketNutritionSalt", unit: "g" },
] as const;

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

interface MarketItemCardProps {
  item: MarketItem;
  isDarkMode: boolean;
  /** Gate for auth-required actions. Return true to proceed, false to abort. */
  requireAuth: () => boolean;
}

export default function MarketItemCard({
  item,
  isDarkMode,
  requireAuth,
}: MarketItemCardProps) {
  const t = useTranslations("market");
  const { quantityOf, addItem, updateQuantity } = useMarketCart();
  const qtyInCart = quantityOf(item.id);

  const [expanded, setExpanded] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const isOutOfStock = item.stock <= 0;
  const hasDescription = item.description.length > 0;
  const hasNutrition = useMemo(() => hasNutritionData(item), [item]);
  const hasSubline = hasDescription || hasNutrition;
  const canExpand = hasDescription || hasNutrition;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAdd = useCallback(() => {
    if (isOutOfStock) return;
    if (!requireAuth()) return;
    void addItem(item);
  }, [isOutOfStock, requireAuth, addItem, item]);

  const handleIncrement = useCallback(() => {
    void updateQuantity(item.id, qtyInCart + 1);
  }, [updateQuantity, item.id, qtyInCart]);

  const handleDecrement = useCallback(() => {
    void updateQuantity(item.id, qtyInCart - 1);
  }, [updateQuantity, item.id, qtyInCart]);

  const handleImageClick = useCallback(() => {
    if (!item.imageUrl) return;
    setLightboxOpen(true);
  }, [item.imageUrl]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <article
        className={`group relative flex flex-col rounded-2xl overflow-hidden transition-shadow ${
          isDarkMode
            ? "bg-[#2D2B3F] border border-gray-800"
            : "bg-white border border-gray-100 shadow-sm hover:shadow-md"
        }`}
      >
        {/* Image */}
        <div
          className={`relative aspect-square w-full ${
            isDarkMode ? "bg-[#1C1A29]" : "bg-white"
          } ${item.imageUrl ? "cursor-zoom-in" : ""}`}
          onClick={handleImageClick}
          role={item.imageUrl ? "button" : undefined}
          aria-label={item.imageUrl ? t("marketImageViewOpen") : undefined}
        >
          {item.imageUrl ? (
            <CloudinaryImage.Banner
              source={item.imageUrl}
              cdnWidth={400}
              fit="contain"
              alt={item.name}
              sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <ShoppingBag
                className={`w-10 h-10 ${
                  isDarkMode ? "text-gray-600" : "text-gray-300"
                }`}
                aria-hidden
              />
            </div>
          )}

          {/* Out-of-stock overlay */}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
              <span className="text-white text-sm font-bold tracking-wide">
                {t("outOfStock")}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col px-3 pt-2.5 pb-3 gap-1">
          {item.brand && (
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 truncate">
              {item.brand}
            </span>
          )}

          <h3
            className={`text-[13px] font-semibold leading-tight ${
              hasSubline ? "line-clamp-1" : "line-clamp-2"
            } ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {item.name}
          </h3>

          {hasDescription && !expanded && (
            <p
              className={`text-[11px] truncate ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {item.description}
            </p>
          )}
          {!hasDescription && hasNutrition && !expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="self-start text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t("info")}
            </button>
          )}

          {/* Expand toggle for description-only or mixed cases */}
          {canExpand && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className={`self-start inline-flex items-center gap-1 text-[11px] font-semibold ${
                isDarkMode
                  ? "text-emerald-400 hover:text-emerald-300"
                  : "text-emerald-700 hover:text-emerald-800"
              }`}
            >
              {expanded ? t("showLess") : t("showMore")}
              <ChevronDown
                className={`w-3 h-3 transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </button>
          )}

          {/* Inline expansion: full description + nutrition */}
          {expanded && (
            <div className="mt-1 space-y-3">
              {hasDescription && (
                <p
                  className={`text-[12px] leading-relaxed whitespace-pre-line ${
                    isDarkMode ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {item.description}
                </p>
              )}

              {hasNutrition && (
                <NutritionTable
                  nutrition={item.nutrition}
                  isDarkMode={isDarkMode}
                />
              )}
            </div>
          )}

          {/* Price + action */}
          <div className="mt-auto pt-2 flex items-center gap-2">
            <span
              className={`flex-1 text-[15px] font-bold tabular-nums truncate ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {item.price.toFixed(2)} TL
            </span>

            {qtyInCart === 0 ? (
              <button
                type="button"
                onClick={handleAdd}
                disabled={isOutOfStock}
                aria-label={t("addToCart")}
                className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                  isDarkMode
                    ? "focus-visible:ring-offset-[#2D2B3F]"
                    : "focus-visible:ring-offset-white"
                } ${
                  isOutOfStock
                    ? "bg-gray-300 text-gray-100 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                <Plus className="w-5 h-5" />
              </button>
            ) : (
              <div className="inline-flex items-stretch rounded-xl bg-emerald-600 overflow-hidden">
                <button
                  type="button"
                  onClick={handleDecrement}
                  aria-label={t("decreaseQuantity")}
                  className="w-8 h-9 flex items-center justify-center text-white hover:bg-emerald-700 transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span
                  aria-live="polite"
                  aria-label={t("quantityInCart", { count: qtyInCart })}
                  className="min-w-[1.5rem] px-0.5 flex items-center justify-center text-white text-[13px] font-bold tabular-nums"
                >
                  {qtyInCart}
                </span>
                <button
                  type="button"
                  onClick={handleIncrement}
                  aria-label={t("increaseQuantity")}
                  className="w-8 h-9 flex items-center justify-center text-white hover:bg-emerald-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </article>

      {/* Lightbox — mounted only when open so it lazy-loads */}
      {lightboxOpen && (
        <ImageLightbox
          open={lightboxOpen}
          imageUrl={item.imageUrl}
          alt={item.name}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

// ─── Nutrition table ─────────────────────────────────────────────────────────

function NutritionTable({
  nutrition,
  isDarkMode,
}: {
  nutrition: Record<string, unknown>;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");

  const rows = useMemo(() => {
    return NUTRITION_ORDER.map((row) => {
      const num = coerceNumber(nutrition[row.key]);
      if (num == null || num <= 0) return null;
      // Match Flutter's int display (no decimals)
      return { ...row, value: Math.round(num) };
    }).filter((r): r is NonNullable<typeof r> => r !== null);
  }, [nutrition]);

  if (rows.length === 0) return null;

  const servingSize = nutrition.servingSize;
  const servingText =
    typeof servingSize === "string" || typeof servingSize === "number"
      ? String(servingSize)
      : "";

  return (
    <div
      className={`rounded-xl px-3 py-2 border ${
        isDarkMode
          ? "bg-[#1C1A29] border-gray-800"
          : "bg-gray-50 border-gray-200"
      }`}
    >
      <div className="flex items-baseline gap-2 pb-1.5 border-b mb-1 border-inherit">
        <span
          className={`text-[11px] font-bold ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {t("nutritionFacts")}
        </span>
        {servingText && (
          <span
            className={`text-[10px] ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            {t("nutritionPerServing", { serving: servingText })}
          </span>
        )}
      </div>
      <dl className="space-y-0.5 text-[11px]">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between"
          >
            <dt
              className={isDarkMode ? "text-gray-400" : "text-gray-600"}
            >
              {t(row.labelKey)}
            </dt>
            <dd
              className={`font-semibold tabular-nums ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {row.value} {row.unit}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}