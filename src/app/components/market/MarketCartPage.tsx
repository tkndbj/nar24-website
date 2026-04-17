// components/market/MarketCartPage.tsx
//
// Web port of lib/screens/market/market_cart_screen.dart.
//
// Parity points with Flutter:
//   • Green #00A86B brand color, same dark-mode palette
//   • Optimistic items shown at 70% opacity with disabled controls
//   • "Clear all" → confirmation dialog, then clearCart()
//   • Proceed to Checkout navigates to /market-checkout
//   • Same empty-cart copy, same skeleton layout
//
// Web-native deviations (intentional):
//   • Two-column layout on desktop (items left, sticky summary right).
//     On mobile it stacks like Flutter. Desktop users expect this — Amazon,
//     Shopify, ASOS, every ecommerce site.
//   • Clear-cart is a proper modal dialog (role="dialog", aria-modal, Escape,
//     click-outside, body scroll lock, focus ring). Not a positioned Stack.
//   • Placeholder thumbnail uses the category's Lucide icon (marketCategories.ts
//     doesn't carry emoji on web like it does in Flutter).
//   • Unauthenticated users see a distinct "sign in to see your cart" state,
//     not just an empty cart — web users have broader entry paths.

"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import CloudinaryImage from "../../components/CloudinaryImage";
import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/context/UserProvider";
import {
  useMarketCart,
  type MarketCartItem,
} from "@/context/MarketCartProvider";
import {
  MARKET_CATEGORY_MAP,
  type MarketCategory,
} from "@/constants/marketCategories";

// ═════════════════════════════════════════════════════════════════════════════
// PAGE
// ═════════════════════════════════════════════════════════════════════════════

export default function MarketCartPage() {
  const t = useTranslations("market");
  const isDarkMode = useTheme();
  const router = useRouter();
  const { user, isLoading: isUserLoading } = useUser();
  const cart = useMarketCart();

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleCheckout = useCallback(() => {
    if (cart.items.length === 0) return;
    router.push("/market-checkout");
  }, [router, cart.items.length]);

  // ── Render state selection ────────────────────────────────────────────────

  let content: ReactNode;
  if (!cart.isInitialized) {
    // Not initialized yet. If we know there's no user, skip straight to the
    // sign-in state — no point showing a skeleton we'll never fill.
    if (!isUserLoading && !user) {
      content = <SignInState isDarkMode={isDarkMode} />;
    } else {
      content = <CartSkeleton isDarkMode={isDarkMode} />;
    }
  } else if (cart.items.length === 0) {
    content = user ? (
      <EmptyCart isDarkMode={isDarkMode} />
    ) : (
      <SignInState isDarkMode={isDarkMode} />
    );
  } else {
    content = (
      <CartBody
        items={cart.items}
        itemCount={cart.itemCount}
        subtotal={cart.totals.subtotal}
        isDarkMode={isDarkMode}
        onQuantityChange={cart.updateQuantity}
        onRemove={cart.removeItem}
        onClearAll={() => setShowClearConfirm(true)}
        onCheckout={handleCheckout}
      />
    );
  }

  return (
    <main
      className={`flex-1 min-h-screen ${
        isDarkMode ? "bg-[#1C1A29]" : "bg-[#F5F5F5]"
      }`}
    >
      {/* Top bar — matches the detail page for consistency */}
      <header className="sticky top-0 z-20 bg-[#00A86B] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label={t("back")}
            className="-ml-2 p-2 rounded-full hover:bg-white/10 outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-base sm:text-lg font-semibold">
            {t("cartTitle")}
          </h1>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {content}
      </div>

      {/* Clear-cart confirmation */}
      <ClearCartDialog
        open={showClearConfirm}
        isDarkMode={isDarkMode}
        onCancel={() => setShowClearConfirm(false)}
        onConfirm={async () => {
          setShowClearConfirm(false);
          await cart.clearCart();
        }}
      />
    </main>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CART BODY — items + order summary
// ═════════════════════════════════════════════════════════════════════════════

function CartBody({
  items,
  itemCount,
  subtotal,
  isDarkMode,
  onQuantityChange,
  onRemove,
  onClearAll,
  onCheckout,
}: {
  items: readonly MarketCartItem[];
  itemCount: number;
  subtotal: number;
  isDarkMode: boolean;
  onQuantityChange: (itemId: string, quantity: number) => void | Promise<void>;
  onRemove: (itemId: string) => void | Promise<void>;
  onClearAll: () => void;
  onCheckout: () => void;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3 lg:gap-8 items-start">
      {/* Items — takes 2/3 on desktop */}
      <section className="lg:col-span-2 space-y-4" aria-label="Cart items">
        <CartTitleRow
          itemCount={itemCount}
          isDarkMode={isDarkMode}
          onClearAll={onClearAll}
        />

        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.itemId}>
              <CartItemCard
                item={item}
                isDarkMode={isDarkMode}
                onQuantityChange={(q) => onQuantityChange(item.itemId, q)}
                onRemove={() => onRemove(item.itemId)}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Summary — sticky on desktop (top-20 = below the sticky top bar) */}
      <aside
        className="lg:sticky lg:top-20"
        aria-label="Order summary"
      >
        <OrderSummary
          items={items}
          subtotal={subtotal}
          isDarkMode={isDarkMode}
          onCheckout={onCheckout}
        />
      </aside>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CART TITLE ROW
// ═════════════════════════════════════════════════════════════════════════════

function CartTitleRow({
  itemCount,
  isDarkMode,
  onClearAll,
}: {
  itemCount: number;
  isDarkMode: boolean;
  onClearAll: () => void;
}) {
  const t = useTranslations("market");
  return (
    <div className="flex items-center gap-3">
      <h2
        className={`text-xl sm:text-2xl font-bold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {t("cartTitle")}
      </h2>
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
          isDarkMode
            ? "bg-emerald-500/15 text-emerald-400"
            : "bg-emerald-50 text-emerald-700"
        }`}
      >
        {t("cartItemCount", { count: itemCount })}
      </span>
      <button
        type="button"
        onClick={onClearAll}
        className="ml-auto text-xs font-semibold text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors outline-none focus-visible:underline"
      >
        {t("cartClearAll")}
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CART ITEM CARD
// ═════════════════════════════════════════════════════════════════════════════

function CartItemCard({
  item,
  isDarkMode,
  onQuantityChange,
  onRemove,
}: {
  item: MarketCartItem;
  isDarkMode: boolean;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("market");
  const category = MARKET_CATEGORY_MAP.get(item.category) ?? null;
  const lineTotal = item.price * item.quantity;
  const disabled = item.isOptimistic;

  return (
    <article
      className={`rounded-2xl p-4 transition-opacity ${
        disabled ? "opacity-70" : "opacity-100"
      } ${
        isDarkMode
          ? "bg-[#2D2B3F] border border-gray-800"
          : "bg-white border border-gray-100 shadow-sm"
      }`}
    >
      <div className="flex gap-4">
        {/* Thumbnail */}
        <div className="w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-xl overflow-hidden flex-shrink-0">
          {item.imageUrl ? (
            <CloudinaryImage.Banner
              source={item.imageUrl}
              cdnWidth={200}
              fit="cover"
              alt=""
              sizes="80px"
            />
          ) : (
            <ThumbnailPlaceholder category={category} isDarkMode={isDarkMode} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              {item.brand && (
                <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                  {item.brand}
                </p>
              )}
              <h3
                className={`text-[13px] font-bold leading-snug line-clamp-2 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {item.name}
              </h3>
              {item.type && (
                <p
                  className={`mt-0.5 text-[11px] truncate ${
                    isDarkMode ? "text-gray-500" : "text-gray-600"
                  }`}
                >
                  {item.type}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              aria-label={t("removeItem")}
              className={`p-1.5 -m-1.5 rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
                isDarkMode
                  ? "text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                  : "text-gray-400 hover:text-red-600 hover:bg-red-50"
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Price */}
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {lineTotal.toFixed(2)} TL
            </span>
            {item.quantity > 1 && (
              <span
                className={`text-[10px] tabular-nums ${
                  isDarkMode ? "text-gray-500" : "text-gray-500"
                }`}
              >
                ({item.price.toFixed(2)} × {item.quantity})
              </span>
            )}
          </div>

          {/* Quantity stepper */}
          <div className="mt-2.5">
            <QuantitySelector
              quantity={item.quantity}
              isDarkMode={isDarkMode}
              disabled={disabled}
              onDecrement={() => onQuantityChange(item.quantity - 1)}
              onIncrement={() => onQuantityChange(item.quantity + 1)}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function ThumbnailPlaceholder({
  category,
  isDarkMode,
}: {
  category: MarketCategory | null;
  isDarkMode: boolean;
}) {
  // Tailwind can't compile dynamic `bg-${color}-…` strings; only the 20
  // tokens enumerated below survive the JIT. Keep them intact.
  const tint =
    CATEGORY_TINT_BY_COLOR[category?.color ?? ""] ?? TINT_FALLBACK;
  const Icon: LucideIcon | null = category?.icon ?? null;

  return (
    <div
      className={`w-full h-full flex items-center justify-center ${tint}`}
    >
      {Icon ? (
        <Icon
          className={`w-7 h-7 ${
            isDarkMode ? "text-gray-300" : "text-gray-700"
          }`}
          aria-hidden
        />
      ) : (
        <span className="text-2xl" aria-hidden>
          📦
        </span>
      )}
    </div>
  );
}

const CATEGORY_TINT_BY_COLOR: Record<string, string> = {
  rose: "bg-rose-100 dark:bg-rose-500/15",
  amber: "bg-amber-100 dark:bg-amber-500/15",
  orange: "bg-orange-100 dark:bg-orange-500/15",
  sky: "bg-sky-100 dark:bg-sky-500/15",
  green: "bg-green-100 dark:bg-green-500/15",
  red: "bg-red-100 dark:bg-red-500/15",
  stone: "bg-stone-200 dark:bg-stone-500/15",
  yellow: "bg-yellow-100 dark:bg-yellow-500/15",
  lime: "bg-lime-100 dark:bg-lime-500/15",
  pink: "bg-pink-100 dark:bg-pink-500/15",
  emerald: "bg-emerald-100 dark:bg-emerald-500/15",
  blue: "bg-blue-100 dark:bg-blue-500/15",
  indigo: "bg-indigo-100 dark:bg-indigo-500/15",
  violet: "bg-violet-100 dark:bg-violet-500/15",
  slate: "bg-slate-200 dark:bg-slate-500/15",
  fuchsia: "bg-fuchsia-100 dark:bg-fuchsia-500/15",
  cyan: "bg-cyan-100 dark:bg-cyan-500/15",
  purple: "bg-purple-100 dark:bg-purple-500/15",
  teal: "bg-teal-100 dark:bg-teal-500/15",
  zinc: "bg-zinc-200 dark:bg-zinc-500/15",
};
const TINT_FALLBACK = "bg-gray-100 dark:bg-gray-700/40";

// ═════════════════════════════════════════════════════════════════════════════
// QUANTITY SELECTOR
// ═════════════════════════════════════════════════════════════════════════════

function QuantitySelector({
  quantity,
  isDarkMode,
  disabled,
  onDecrement,
  onIncrement,
}: {
  quantity: number;
  isDarkMode: boolean;
  disabled: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const t = useTranslations("market");
  const decDisabled = disabled || quantity <= 1;
  const incDisabled = disabled;

  return (
    <div
      className={`inline-flex items-center rounded-xl border overflow-hidden ${
        isDarkMode ? "border-[#3A3850]" : "border-gray-200"
      }`}
    >
      <StepperButton
        icon={Minus}
        onClick={onDecrement}
        disabled={decDisabled}
        label={t("decreaseQuantity")}
        isDarkMode={isDarkMode}
      />
      <div
        aria-live="polite"
        aria-label={t("quantityInCart", { count: quantity })}
        className={`min-w-[2rem] px-1 py-1.5 text-center text-[13px] font-bold tabular-nums ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {quantity}
      </div>
      <StepperButton
        icon={Plus}
        onClick={onIncrement}
        disabled={incDisabled}
        label={t("increaseQuantity")}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}

function StepperButton({
  icon: Icon,
  onClick,
  disabled,
  label,
  isDarkMode,
}: {
  icon: LucideIcon;
  onClick: () => void;
  disabled: boolean;
  label: string;
  isDarkMode: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`p-1.5 transition-colors outline-none focus-visible:bg-emerald-500/15 ${
        disabled
          ? isDarkMode
            ? "text-gray-600 cursor-not-allowed"
            : "text-gray-300 cursor-not-allowed"
          : isDarkMode
            ? "text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10"
            : "text-gray-700 hover:text-emerald-700 hover:bg-emerald-50"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ORDER SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

function OrderSummary({
  items,
  subtotal,
  isDarkMode,
  onCheckout,
}: {
  items: readonly MarketCartItem[];
  subtotal: number;
  isDarkMode: boolean;
  onCheckout: () => void;
}) {
  const t = useTranslations("market");
  return (
    <div
      className={`rounded-2xl p-5 ${
        isDarkMode
          ? "bg-[#2D2B3F] border border-gray-800"
          : "bg-white border border-gray-100 shadow-sm"
      }`}
    >
      <h2
        className={`text-sm font-bold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {t("cartOrderSummary")}
      </h2>

      <ul className="mt-4 space-y-2">
        {items.map((item) => {
          const lineTotal = item.price * item.quantity;
          return (
            <li key={item.itemId} className="flex items-start gap-2 text-[11px]">
              <span
                className={`font-semibold flex-shrink-0 ${
                  isDarkMode ? "text-gray-500" : "text-gray-500"
                }`}
              >
                {item.quantity}×
              </span>
              <span
                className={`flex-1 truncate ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
                title={item.name}
              >
                {item.name}
              </span>
              <span
                className={`font-semibold tabular-nums ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {lineTotal.toFixed(2)} TL
              </span>
            </li>
          );
        })}
      </ul>

      <div
        className={`my-5 border-t ${
          isDarkMode ? "border-[#3A3850]" : "border-gray-200"
        }`}
      />

      <div className="flex items-end justify-between gap-4">
        <div>
          <p
            className={`text-[10px] font-semibold uppercase tracking-wider ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            {t("cartTotalLabel")}
          </p>
          <p className="mt-0.5 text-2xl font-bold text-[#00A86B] tabular-nums">
            {subtotal.toFixed(2)}
            <span className="ml-1 text-sm font-semibold">TL</span>
          </p>
        </div>
        <p
          className={`text-[11px] text-right max-w-[12rem] ${
            isDarkMode ? "text-gray-500" : "text-gray-500"
          }`}
        >
          {t("cartDeliveryFeeWillBeCalculated")}
        </p>
      </div>

      <button
        type="button"
        onClick={onCheckout}
        disabled={items.length === 0}
        className="mt-5 w-full h-12 rounded-xl bg-[#00A86B] text-white font-semibold text-sm hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-100 disabled:cursor-not-allowed transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      >
        {t("cartProceedToCheckout")}
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CLEAR CART DIALOG
// ═════════════════════════════════════════════════════════════════════════════

function ClearCartDialog({
  open,
  isDarkMode,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  isDarkMode: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("market");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-cart-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t("cartClearDialogCancel")}
        onClick={onCancel}
        className="absolute inset-0 bg-black/50 cursor-default"
      />

      <div
        className={`relative w-full max-w-sm rounded-2xl shadow-xl overflow-hidden ${
          isDarkMode
            ? "bg-[#211F31] border border-[#2D2B3F]"
            : "bg-white border border-gray-200"
        }`}
      >
        <div className="px-5 pt-6 pb-2 flex flex-col items-center text-center">
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              isDarkMode ? "bg-red-500/15" : "bg-red-50"
            }`}
          >
            <Trash2 className="w-5 h-5 text-red-500" aria-hidden />
          </div>
          <h2
            id="clear-cart-title"
            className={`mt-3 text-[15px] font-bold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("cartClearDialogTitle")}
          </h2>
          <p
            className={`mt-1 text-[13px] ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {t("cartClearDialogBody")}
          </p>
        </div>

        <div
          className={`mt-4 grid grid-cols-2 gap-3 px-5 py-4 border-t ${
            isDarkMode
              ? "bg-[#211F31] border-[#2D2B3F]"
              : "bg-gray-50 border-gray-200"
          }`}
        >
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className={`h-10 rounded-xl border text-[13px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              isDarkMode
                ? "border-[#2D2B3F] text-gray-300 hover:bg-[#2D2B3F]"
                : "border-gray-200 text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t("cartClearDialogCancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-10 rounded-xl bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          >
            {t("cartClear")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EMPTY STATES
// ═════════════════════════════════════════════════════════════════════════════

function EmptyCart({ isDarkMode }: { isDarkMode: boolean }) {
  const t = useTranslations("market");
  return (
    <StateShell isDarkMode={isDarkMode}>
      <h2
        className={`text-[17px] font-bold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {t("cartEmptyTitle")}
      </h2>
      <p
        className={`mt-1.5 text-[13px] ${
          isDarkMode ? "text-gray-500" : "text-gray-600"
        }`}
      >
        {t("cartEmptySubtitle")}
      </p>
      <Link
        href="/market-categories"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00A86B] text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
      >
        {t("continueShopping")}
      </Link>
    </StateShell>
  );
}

function SignInState({ isDarkMode }: { isDarkMode: boolean }) {
  const t = useTranslations("market");
  return (
    <StateShell isDarkMode={isDarkMode}>
      <h2
        className={`text-[17px] font-bold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {t("cartSignInTitle")}
      </h2>
      <p
        className={`mt-1.5 text-[13px] ${
          isDarkMode ? "text-gray-500" : "text-gray-600"
        }`}
      >
        {t("cartSignInSubtitle")}
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00A86B] text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
      >
        {t("signIn")}
      </Link>
    </StateShell>
  );
}

function StateShell({
  isDarkMode,
  children,
}: {
  isDarkMode: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-4 py-16 sm:py-24">
      <div
        className={`w-24 h-24 rounded-3xl flex items-center justify-center ${
          isDarkMode ? "bg-[#2D2B3F]" : "bg-emerald-50"
        }`}
      >
        <ShoppingCart
          className={`w-10 h-10 ${
            isDarkMode ? "text-gray-600" : "text-emerald-400"
          }`}
          aria-hidden
        />
      </div>
      <div className="mt-6 max-w-sm">{children}</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SKELETON
// ═════════════════════════════════════════════════════════════════════════════

function CartSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  const bg = isDarkMode ? "bg-[#3A3850]" : "bg-gray-200";
  const card = isDarkMode ? "bg-[#2D2B3F]" : "bg-white";

  return (
    <div className="grid gap-6 lg:grid-cols-3 lg:gap-8 items-start animate-pulse">
      <section className="lg:col-span-2 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`h-6 w-28 rounded ${bg}`} />
          <div className={`h-5 w-14 rounded-full ${bg}`} />
          <div className={`ml-auto h-4 w-16 rounded ${bg}`} />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`rounded-2xl p-4 ${card}`}>
            <div className="flex gap-4">
              <div className={`w-[72px] h-[72px] rounded-xl ${bg}`} />
              <div className="flex-1 space-y-2">
                <div className={`h-3 w-20 rounded ${bg}`} />
                <div className={`h-4 w-40 rounded ${bg}`} />
                <div className={`h-3 w-24 rounded ${bg}`} />
                <div className={`h-4 w-16 rounded mt-2 ${bg}`} />
                <div className={`h-8 w-24 rounded-xl mt-2 ${bg}`} />
              </div>
            </div>
          </div>
        ))}
      </section>

      <aside className={`rounded-2xl p-5 ${card} space-y-3`}>
        <div className={`h-4 w-28 rounded ${bg}`} />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className={`h-3 w-32 rounded ${bg}`} />
            <div className={`ml-auto h-3 w-14 rounded ${bg}`} />
          </div>
        ))}
        <div className={`h-px w-full my-4 ${bg}`} />
        <div className={`h-6 w-28 rounded ${bg}`} />
        <div className={`h-12 w-full rounded-xl ${bg}`} />
      </aside>
    </div>
  );
}