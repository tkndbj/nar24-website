// components/market/MarketCheckoutPage.tsx
//
// Web port of lib/screens/market/market_checkout_screen.dart.
//
// Responsibilities:
//   • Read cart + user profile, surface delivery address, notes, payment method
//   • Call `processMarketOrder` (pay at door) or `initializeMarketPayment`
//     (card) via Firebase Functions in europe-west3
//   • On pay-at-door success: replace view with the success screen & clearCart
//   • On card success: stash gateway params in sessionStorage and navigate to
//     /isbankmarketpayment so the existing redirect flow can take over
//
// Layout:
//   • Desktop (lg+): two columns — form left, sticky summary+CTA right
//   • Mobile: single column + sticky bottom submit bar
//
// Parity with Flutter (don't change without reason):
//   • Same brand #00A86B, same dark palette
//   • Same FirebaseFunctionsException handling (show e.message)
//   • Same order-number format: `MKT-{epochMs}-{6 random chars}` with
//     crypto.getRandomValues for secure randomness (matches Random.secure)
//   • Same success screen copy + order-id short form (first 8 chars upper)

"use client";

import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getApp } from "firebase/app";
import {
  getFunctions,
  httpsCallable,
  FunctionsError,
} from "firebase/functions";
import {
  AlertCircle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  CreditCard,
  Headphones,
  MapPin,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/context/UserProvider";
import {
  useMarketCart,
  type MarketCartItem,
} from "@/context/MarketCartProvider";
import CloudinaryImage from "../../components/CloudinaryImage";
import {
  MARKET_CATEGORY_MAP,
  type MarketCategory,
} from "@/constants/marketCategories";
import { FoodAddress } from "@/app/models/FoodAddress";

// ═════════════════════════════════════════════════════════════════════════════
// TYPES + CONSTANTS
// ═════════════════════════════════════════════════════════════════════════════

type PaymentMethod = "payAtDoor" | "card";

/** Shape returned by `processMarketOrder` (pay-at-door). */
interface ProcessOrderResponse {
  success: boolean;
  orderId?: string;
}

/** Shape returned by `initializeMarketPayment` (card). */
interface InitPaymentResponse {
  success: boolean;
  gatewayUrl?: string;
  paymentParams?: Record<string, string | number | boolean>;
}

const ORDER_NOTES_MAX = 1000;

// ═════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/** Secure 6-char alphanumeric suffix — matches Flutter's Random.secure logic. */
function secureOrderSuffix(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

function buildOrderNumber(): string {
  return `MKT-${Date.now()}-${secureOrderSuffix()}`;
}

/** Build the items payload for Cloud Functions (itemId + quantity only). */
function itemsPayload(
  items: readonly MarketCartItem[],
): Array<{ itemId: string; quantity: number }> {
  return items.map((i) => ({ itemId: i.itemId, quantity: i.quantity }));
}

/** Pretty-print the order id — first 8 chars upper-cased. */
function shortOrderId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

// ═════════════════════════════════════════════════════════════════════════════
// PAGE
// ═════════════════════════════════════════════════════════════════════════════

export default function MarketCheckoutPage() {
  const t = useTranslations("market");
  const isDarkMode = useTheme();
  const router = useRouter();
  const { user, profileData, isLoading: isUserLoading } = useUser();
  const cart = useMarketCart();

  // ── Form state ───────────────────────────────────────────────────────────
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("payAtDoor");
  const [orderNotes, setOrderNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccessId, setOrderSuccessId] = useState<string | null>(null);

  // ── Derived: parsed FoodAddress (memoized so identity is stable) ─────────
  const foodAddress = useMemo<FoodAddress | null>(() => {
    const raw = profileData?.foodAddress;
    if (!raw) return null;
    return FoodAddress.fromMap(raw as Record<string, unknown>);
  }, [profileData?.foodAddress]);

  const hasAddress = foodAddress !== null;
  const isFormValid = cart.items.length > 0 && hasAddress;

  // ── Submission ───────────────────────────────────────────────────────────

  const submit = useCallback(async () => {
    if (isSubmitting || cart.items.length === 0) return;
    if (!hasAddress) {
      setError(t("checkoutAddressRequired"));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const functions = getFunctions(getApp(), "europe-west3");
    const buyerPhone = foodAddress?.phoneNumber ?? "";

    try {
      if (paymentMethod === "payAtDoor") {
        const call = httpsCallable<
          {
            items: Array<{ itemId: string; quantity: number }>;
            paymentMethod: "pay_at_door";
            buyerPhone: string;
            orderNotes: string;
            clientSubtotal: number;
          },
          ProcessOrderResponse
        >(functions, "processMarketOrder");

        const result = await call({
          items: itemsPayload(cart.items),
          paymentMethod: "pay_at_door",
          buyerPhone,
          orderNotes,
          clientSubtotal: cart.totals.subtotal,
        });

        if (result.data.success && result.data.orderId) {
          setOrderSuccessId(result.data.orderId);
          await cart.clearCart();
        } else {
          setError(t("checkoutOrderCreationFailed"));
        }
      } else {
        const orderNumber = buildOrderNumber();

        const call = httpsCallable<
          {
            items: Array<{ itemId: string; quantity: number }>;
            buyerPhone: string;
            orderNotes: string;
            clientSubtotal: number;
            orderNumber: string;
          },
          InitPaymentResponse
        >(functions, "initializeMarketPayment");

        const result = await call({
          items: itemsPayload(cart.items),
          buyerPhone,
          orderNotes,
          clientSubtotal: cart.totals.subtotal,
          orderNumber,
        });

        const { success, gatewayUrl, paymentParams } = result.data;
        if (success && gatewayUrl && paymentParams) {
     
          const qs = new URLSearchParams({
            gatewayUrl,
            orderNumber,
            paymentParams: JSON.stringify(paymentParams),
          });
          router.push(`/isbankmarketpayment?${qs.toString()}`);
        } else {
          setError(t("checkoutPaymentInitFailed"));
        }
      }
    } catch (err) {
      if (err instanceof FunctionsError) {
        setError(err.message || t("checkoutOrderCreationFailed"));
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t("checkoutOrderCreationFailed"));
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    cart,
    hasAddress,
    foodAddress,
    paymentMethod,
    orderNotes,
    router,
    t,
  ]);

  // ── Render state routing ─────────────────────────────────────────────────

  // Successful pay-at-door order — replace the whole page view.
  if (orderSuccessId) {
    return (
      <OrderSuccessScreen
        orderId={orderSuccessId}
        isDarkMode={isDarkMode}
      />
    );
  }

  // Not signed in — send them to the cart page which knows how to handle that.
  // Avoids duplicating the sign-in CTA here.
  if (!isUserLoading && !user) {
    if (typeof window !== "undefined") router.replace("/market-cart");
    return null;
  }

  // Cart not ready yet — show skeleton.
  if (!cart.isInitialized) {
    return <SkeletonShell isDarkMode={isDarkMode} />;
  }

  // Cart empty — bail to the empty-cart view.
  if (cart.items.length === 0) {
    return <EmptyCartFallback isDarkMode={isDarkMode} />;
  }

  return (
    <main
      className={`flex-1 min-h-screen ${
        isDarkMode ? "bg-[#1C1A29]" : "bg-[#F5F5F5]"
      }`}
    >
      <TopBar isDarkMode={isDarkMode} onBack={() => router.back()} />

      {/* pb-28 on mobile leaves room for the sticky submit bar; lg:pb-10 relaxes it. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 lg:pb-10">
        <h1
          className={`text-2xl sm:text-3xl font-bold mb-6 ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {t("checkoutTitle")}
        </h1>

        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8 items-start">
          {/* ── FORM COLUMN (left on desktop) ─────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            <FormSection title={t("checkoutDeliveryAddress")} isDarkMode={isDarkMode}>
              <AddressCard
                foodAddress={foodAddress}
                isDarkMode={isDarkMode}
              />
            </FormSection>

            <FormSection title={t("checkoutOrderNote")} isDarkMode={isDarkMode}>
              <textarea
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                maxLength={ORDER_NOTES_MAX}
                rows={3}
                placeholder={t("checkoutNoteHint")}
                aria-label={t("checkoutOrderNote")}
                className={`w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-colors ${
                  isDarkMode
                    ? "bg-[#1A1D2E] border border-[#2D2B3F] text-white placeholder-gray-500 focus:border-emerald-500"
                    : "bg-gray-100 border border-gray-300 text-gray-900 placeholder-gray-400 focus:border-emerald-500 focus:bg-white"
                }`}
              />
            </FormSection>

            <FormSection title={t("checkoutPaymentMethod")} isDarkMode={isDarkMode}>
              <div className="space-y-2">
                <PaymentMethodButton
                  method="payAtDoor"
                  icon={Wallet}
                  isSelected={paymentMethod === "payAtDoor"}
                  isDarkMode={isDarkMode}
                  onClick={() => setPaymentMethod("payAtDoor")}
                  title={t("paymentMethodPayAtDoor")}
                  subtitle={t("paymentMethodPayAtDoorSubtitle")}
                />
                <PaymentMethodButton
                  method="card"
                  icon={CreditCard}
                  isSelected={paymentMethod === "card"}
                  isDarkMode={isDarkMode}
                  onClick={() => setPaymentMethod("card")}
                  title={t("paymentMethodCard")}
                  subtitle={t("paymentMethodCardSubtitle")}
                />
              </div>
            </FormSection>
          </div>

          {/* ── SUMMARY COLUMN (right sticky on desktop) ────────────────── */}
          <aside className="lg:sticky lg:top-20" aria-label={t("checkoutYourOrder")}>
            <OrderSummary
              items={cart.items}
              subtotal={cart.totals.subtotal}
              itemCount={cart.totals.itemCount}
              isDarkMode={isDarkMode}
              error={error}
              isSubmitting={isSubmitting}
              canSubmit={isFormValid && !isSubmitting}
              paymentMethod={paymentMethod}
              onSubmit={submit}
              onQuantityChange={(id, q) => cart.updateQuantity(id, q)}
              onRemove={(id) => cart.removeItem(id)}
              showDesktopCta
            />
          </aside>
        </div>
      </div>

      {/* Mobile sticky submit bar — hidden on lg+ */}
      <MobileStickyBar
        isDarkMode={isDarkMode}
        itemCount={cart.totals.itemCount}
        subtotal={cart.totals.subtotal}
        isSubmitting={isSubmitting}
        canSubmit={isFormValid && !isSubmitting}
        paymentMethod={paymentMethod}
        error={error}
        onSubmit={submit}
      />
    </main>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TOP BAR
// ═════════════════════════════════════════════════════════════════════════════

function TopBar({
  onBack,
}: {
  isDarkMode: boolean;
  onBack: () => void;
}) {
  const t = useTranslations("market");
  return (
    <header className="sticky top-0 z-20 bg-[#00A86B] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("back")}
          className="-ml-2 p-2 rounded-full hover:bg-white/10 outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="flex-1 text-base sm:text-lg font-semibold">
          {t("checkoutTitle")}
        </h2>
      </div>
    </header>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORM SECTION WRAPPER
// ═════════════════════════════════════════════════════════════════════════════

function FormSection({
  title,
  children,
  isDarkMode,
}: {
  title: string;
  children: ReactNode;
  isDarkMode: boolean;
}) {
  return (
    <section
      className={`rounded-2xl p-5 ${
        isDarkMode
          ? "bg-[#2D2B3F] border border-gray-800"
          : "bg-white border border-gray-100 shadow-sm"
      }`}
    >
      <h3
        className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${
          isDarkMode ? "text-gray-400" : "text-gray-700"
        }`}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ADDRESS CARD
// ═════════════════════════════════════════════════════════════════════════════

function AddressCard({
  foodAddress,
  isDarkMode,
}: {
  foodAddress: FoodAddress | null;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");

  if (foodAddress) {
    const cityLine = [foodAddress.city, foodAddress.mainRegion]
      .filter((s) => s && s.length > 0)
      .join(", ");

    return (
      <div
        className={`rounded-xl p-4 flex items-start gap-3 ${
          isDarkMode ? "bg-[#211F31]" : "bg-gray-50"
        }`}
      >
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <MapPin className="w-4 h-4 text-emerald-600" aria-hidden />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <p
            className={`text-[13px] font-semibold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {foodAddress.addressLine1}
          </p>
          {foodAddress.addressLine2 && (
            <p
              className={`text-[11px] ${
                isDarkMode ? "text-gray-500" : "text-gray-500"
              }`}
            >
              {foodAddress.addressLine2}
            </p>
          )}
          {cityLine && (
            <p
              className={`text-[11px] ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {cityLine}
            </p>
          )}
          {foodAddress.phoneNumber && (
            <p
              className={`text-[11px] tabular-nums ${
                isDarkMode ? "text-gray-500" : "text-gray-500"
              }`}
            >
              {foodAddress.phoneNumber}
            </p>
          )}
        </div>
        <Link
          href="/food-address"
          className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex-shrink-0"
        >
          {t("checkoutChangeAddress")}
        </Link>
      </div>
    );
  }

  // No address — show a CTA card
  return (
    <div
      className={`rounded-xl p-4 flex items-center gap-3 border-2 border-dashed ${
        isDarkMode
          ? "border-[#2D2B3F] bg-transparent"
          : "border-gray-300 bg-transparent"
      }`}
    >
      <MapPin
        className={`w-5 h-5 flex-shrink-0 ${
          isDarkMode ? "text-gray-600" : "text-gray-400"
        }`}
        aria-hidden
      />
      <p
        className={`flex-1 text-[13px] ${
          isDarkMode ? "text-gray-400" : "text-gray-600"
        }`}
      >
        {t("checkoutNoAddress")}
      </p>
      <Link
        href="/food-address"
        className="inline-flex items-center px-3 py-1.5 rounded-lg bg-[#00A86B] text-white text-[11px] font-bold hover:bg-emerald-700 transition-colors"
      >
        {t("checkoutAddAddress")}
      </Link>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PAYMENT METHOD BUTTON
// ═════════════════════════════════════════════════════════════════════════════

function PaymentMethodButton({
  icon: Icon,
  isSelected,
  isDarkMode,
  onClick,
  title,
  subtitle,
}: {
  method: PaymentMethod;
  icon: LucideIcon;
  isSelected: boolean;
  isDarkMode: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="radio"
      aria-checked={isSelected}
      className={`w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 border ${
        isSelected
          ? isDarkMode
            ? "bg-emerald-500/10 border-emerald-500/50"
            : "bg-emerald-50 border-emerald-400"
          : isDarkMode
            ? "bg-transparent border-[#2D2B3F] hover:border-gray-600"
            : "bg-transparent border-gray-300 hover:border-gray-400"
      }`}
    >
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isSelected
            ? "bg-emerald-500/20 text-emerald-600"
            : isDarkMode
              ? "bg-[#2D2B3F] text-gray-400"
              : "bg-gray-100 text-gray-400"
        }`}
      >
        <Icon className="w-5 h-5" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-[13px] font-semibold ${
            isSelected
              ? isDarkMode
                ? "text-emerald-400"
                : "text-emerald-700"
              : isDarkMode
                ? "text-gray-200"
                : "text-gray-800"
          }`}
        >
          {title}
        </p>
        <p
          className={`text-[11px] mt-0.5 ${
            isDarkMode ? "text-gray-500" : "text-gray-600"
          }`}
        >
          {subtitle}
        </p>
      </div>
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ORDER SUMMARY (right column on desktop)
// ═════════════════════════════════════════════════════════════════════════════

function OrderSummary({
  items,
  subtotal,
  isDarkMode,
  error,
  isSubmitting,
  canSubmit,
  paymentMethod,
  onSubmit,
  onQuantityChange,
  onRemove,
  showDesktopCta,
}: {
  items: readonly MarketCartItem[];
  subtotal: number;
  itemCount: number;
  isDarkMode: boolean;
  error: string | null;
  isSubmitting: boolean;
  canSubmit: boolean;
  paymentMethod: PaymentMethod;
  onSubmit: () => void;
  onQuantityChange: (itemId: string, qty: number) => void;
  onRemove: (itemId: string) => void;
  showDesktopCta: boolean;
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
      <h3
        className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${
          isDarkMode ? "text-gray-400" : "text-gray-700"
        }`}
      >
        {t("checkoutYourOrder")}
      </h3>

      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.itemId}>
            <CheckoutItemRow
              item={item}
              isDarkMode={isDarkMode}
              onQuantityChange={(q) => onQuantityChange(item.itemId, q)}
              onRemove={() => onRemove(item.itemId)}
            />
          </li>
        ))}
      </ul>

      <div
        className={`my-4 border-t ${
          isDarkMode ? "border-[#3A3850]" : "border-gray-200"
        }`}
      />

      <div className="flex items-baseline justify-between">
        <span
          className={`text-[11px] font-bold uppercase tracking-wider ${
            isDarkMode ? "text-gray-500" : "text-gray-500"
          }`}
        >
          {t("cartTotalLabel")}
        </span>
        <span className="text-2xl font-bold text-[#00A86B] tabular-nums">
          {subtotal.toFixed(2)}
          <span className="ml-1 text-sm font-semibold">TL</span>
        </span>
      </div>
      <p
        className={`mt-1 text-[11px] text-right ${
          isDarkMode ? "text-gray-500" : "text-gray-500"
        }`}
      >
        {t("cartDeliveryFeeWillBeCalculated")}
      </p>

      {/* Desktop CTA — hidden on mobile (mobile uses the sticky bar) */}
      {showDesktopCta && (
        <div className="hidden lg:block mt-5 space-y-3">
          {error && <ErrorBanner message={error} isDarkMode={isDarkMode} />}
          <SubmitButton
            isSubmitting={isSubmitting}
            canSubmit={canSubmit}
            paymentMethod={paymentMethod}
            onSubmit={onSubmit}
          />
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CHECKOUT ITEM ROW — compact row for the summary
// ═════════════════════════════════════════════════════════════════════════════

function CheckoutItemRow({
  item,
  isDarkMode,
  onQuantityChange,
  onRemove,
}: {
  item: MarketCartItem;
  isDarkMode: boolean;
  onQuantityChange: (qty: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("market");
  const category = MARKET_CATEGORY_MAP.get(item.category) ?? null;
  const disabled = item.isOptimistic;
  const lineTotal = item.price * item.quantity;

  return (
    <div
      className={`rounded-xl p-3 flex gap-3 transition-opacity ${
        disabled ? "opacity-70" : "opacity-100"
      } ${
        isDarkMode
          ? "bg-[#1A1D2E] border border-[#2A2D3E]"
          : "bg-gray-50 border border-gray-200"
      }`}
    >
      <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
        {item.imageUrl ? (
          <CloudinaryImage.Banner
            source={item.imageUrl}
            cdnWidth={200}
            fit="cover"
            alt=""
            sizes="56px"
          />
        ) : (
          <ThumbPlaceholder category={category} isDarkMode={isDarkMode} />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            {item.brand && (
              <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                {item.brand}
              </p>
            )}
            <p
              className={`text-[12px] font-semibold leading-tight line-clamp-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {item.name}
            </p>
            {item.type && (
              <p
                className={`mt-0.5 text-[10px] truncate ${
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
            className={`p-1 -m-1 rounded transition-colors ${
              isDarkMode
                ? "text-gray-500 hover:text-red-400"
                : "text-gray-400 hover:text-red-600"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-auto pt-2 flex items-center justify-between gap-2">
          <QuantityStepper
            quantity={item.quantity}
            disabled={disabled}
            isDarkMode={isDarkMode}
            onDecrement={() => onQuantityChange(item.quantity - 1)}
            onIncrement={() => onQuantityChange(item.quantity + 1)}
          />
          <span className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {lineTotal.toFixed(2)} TL
          </span>
        </div>
      </div>
    </div>
  );
}

function QuantityStepper({
  quantity,
  disabled,
  isDarkMode,
  onDecrement,
  onIncrement,
}: {
  quantity: number;
  disabled: boolean;
  isDarkMode: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const t = useTranslations("market");
  return (
    <div className="inline-flex items-center gap-1">
      <StepperBtn
        icon={Minus}
        disabled={disabled || quantity <= 1}
        isDarkMode={isDarkMode}
        label={t("decreaseQuantity")}
        onClick={onDecrement}
      />
      <span
        aria-live="polite"
        className={`min-w-[1.5rem] text-center text-[12px] font-bold tabular-nums ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {quantity}
      </span>
      <StepperBtn
        icon={Plus}
        disabled={disabled}
        isDarkMode={isDarkMode}
        label={t("increaseQuantity")}
        onClick={onIncrement}
      />
    </div>
  );
}

function StepperBtn({
  icon: Icon,
  disabled,
  isDarkMode,
  label,
  onClick,
}: {
  icon: LucideIcon;
  disabled: boolean;
  isDarkMode: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${
        disabled
          ? isDarkMode
            ? "border-[#2D2B3F] text-gray-600 cursor-not-allowed"
            : "border-gray-200 text-gray-300 cursor-not-allowed"
          : isDarkMode
            ? "border-[#2D2B3F] text-gray-300 hover:border-emerald-500 hover:text-emerald-400"
            : "border-gray-300 text-gray-600 hover:border-emerald-500 hover:text-emerald-700"
      }`}
    >
      <Icon className="w-3 h-3" />
    </button>
  );
}

function ThumbPlaceholder({
  category,
  isDarkMode,
}: {
  category: MarketCategory | null;
  isDarkMode: boolean;
}) {
  const tint =
    CATEGORY_TINT_BY_COLOR[category?.color ?? ""] ?? TINT_FALLBACK;
  const Icon = category?.icon ?? null;
  return (
    <div className={`w-full h-full flex items-center justify-center ${tint}`}>
      {Icon ? (
        <Icon
          className={`w-5 h-5 ${
            isDarkMode ? "text-gray-300" : "text-gray-700"
          }`}
          aria-hidden
        />
      ) : (
        <span className="text-xl" aria-hidden>
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
// SUBMIT BUTTON
// ═════════════════════════════════════════════════════════════════════════════

function SubmitButton({
  isSubmitting,
  canSubmit,
  paymentMethod,
  onSubmit,
}: {
  isSubmitting: boolean;
  canSubmit: boolean;
  paymentMethod: PaymentMethod;
  onSubmit: () => void;
}) {
  const t = useTranslations("market");
  const isCard = paymentMethod === "card";
  const Icon = isCard ? CreditCard : ShoppingBag;

  return (
    <button
      type="button"
      onClick={onSubmit}
      disabled={!canSubmit}
      className="w-full h-12 rounded-xl bg-[#00A86B] text-white text-sm font-bold hover:bg-emerald-700 disabled:bg-gray-300 disabled:text-gray-100 disabled:cursor-not-allowed transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 inline-flex items-center justify-center gap-2"
    >
      {isSubmitting ? (
        <span
          role="status"
          aria-label={t("submitting")}
          className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"
        />
      ) : (
        <>
          <Icon className="w-4 h-4" aria-hidden />
          {isCard ? t("checkoutPayButton") : t("checkoutPlaceOrder")}
        </>
      )}
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MOBILE STICKY BAR
// ═════════════════════════════════════════════════════════════════════════════

function MobileStickyBar({
  isDarkMode,
  itemCount,
  subtotal,
  isSubmitting,
  canSubmit,
  paymentMethod,
  error,
  onSubmit,
}: {
  isDarkMode: boolean;
  itemCount: number;
  subtotal: number;
  isSubmitting: boolean;
  canSubmit: boolean;
  paymentMethod: PaymentMethod;
  error: string | null;
  onSubmit: () => void;
}) {
  const t = useTranslations("market");

  return (
    <div
      className={`lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t px-4 pt-3 ${
        isDarkMode
          ? "bg-[#1C1A29] border-[#2D2B3F]"
          : "bg-white/95 backdrop-blur border-gray-200"
      }`}
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      {error && (
        <div className="mb-2.5">
          <ErrorBanner message={error} isDarkMode={isDarkMode} />
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p
            className={`text-[11px] ${
              isDarkMode ? "text-gray-500" : "text-gray-600"
            }`}
          >
            {t("cartItemCount", { count: itemCount })}
          </p>
          <p
            className={`text-xl font-bold tabular-nums ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {subtotal.toFixed(2)} TL
          </p>
        </div>
        <div className="flex-shrink-0">
          <div className="w-44">
            <SubmitButton
              isSubmitting={isSubmitting}
              canSubmit={canSubmit}
              paymentMethod={paymentMethod}
              onSubmit={onSubmit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ERROR BANNER
// ═════════════════════════════════════════════════════════════════════════════

function ErrorBanner({
  message,
  isDarkMode,
}: {
  message: string;
  isDarkMode: boolean;
}) {
  return (
    <div
      role="alert"
      className={`rounded-xl p-3 flex items-start gap-2 ${
        isDarkMode
          ? "bg-red-500/10 border border-red-500/30"
          : "bg-red-50 border border-red-200"
      }`}
    >
      <AlertCircle
        className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"
        aria-hidden
      />
      <p className={`flex-1 text-[12px] ${
        isDarkMode ? "text-red-400" : "text-red-700"
      }`}>
        {message}
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ORDER SUCCESS SCREEN
// ═════════════════════════════════════════════════════════════════════════════

function OrderSuccessScreen({
  orderId,
  isDarkMode,
}: {
  orderId: string;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");

  return (
    <main
      className={`min-h-screen flex items-center justify-center px-4 ${
        isDarkMode ? "bg-[#1C1A29]" : "bg-[#F5F5F5]"
      }`}
    >
      <div
        className={`w-full max-w-md rounded-3xl p-8 sm:p-10 text-center ${
          isDarkMode
            ? "bg-[#2D2B3F] border border-gray-800"
            : "bg-white border border-gray-100 shadow-sm"
        }`}
      >
        {/* Success icon — simple, animated with CSS scale-in */}
        <div
          className="inline-flex items-center justify-center w-28 h-28 rounded-full bg-emerald-100 dark:bg-emerald-500/15"
          style={{ animation: "scaleIn 320ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        >
          <CheckCircle2 className="w-16 h-16 text-emerald-600" aria-hidden />
        </div>

        <h1
          className={`mt-6 text-xl sm:text-2xl font-bold ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {t("orderReceivedTitle")}
        </h1>

        <ul className="mt-6 space-y-3 text-left">
          <li className="flex items-start gap-2.5">
            <BellRing
              className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0"
              aria-hidden
            />
            <span
              className={`text-[13px] leading-relaxed ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {t("orderReceivedNotifications")}
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <Headphones
              className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0"
              aria-hidden
            />
            <span
              className={`text-[13px] leading-relaxed ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {t("orderReceivedSupport")}
            </span>
          </li>
        </ul>

        <p
          className={`mt-5 text-[11px] ${
            isDarkMode ? "text-gray-500" : "text-gray-400"
          }`}
        >
          {t("paymentOrderLabel")}:{" "}
          <span className="font-mono tabular-nums">
            {shortOrderId(orderId)}
          </span>
        </p>

        <Link
          href="/market-categories"
          className="mt-6 inline-flex w-full items-center justify-center h-12 rounded-xl bg-[#00A86B] text-white font-bold hover:bg-emerald-700 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          {t("paymentReturnToMarket")}
        </Link>
      </div>

      <style jsx>{`
        @keyframes scaleIn {
          from {
            transform: scale(0.5);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </main>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EMPTY-CART FALLBACK
// ═════════════════════════════════════════════════════════════════════════════

function EmptyCartFallback({ isDarkMode }: { isDarkMode: boolean }) {
  const t = useTranslations("market");
  return (
    <main
      className={`min-h-screen flex items-center justify-center px-4 ${
        isDarkMode ? "bg-[#1C1A29]" : "bg-[#F5F5F5]"
      }`}
    >
      <div className="text-center max-w-sm">
        <ShoppingBag
          className={`w-16 h-16 mx-auto ${
            isDarkMode ? "text-gray-600" : "text-gray-300"
          }`}
          aria-hidden
        />
        <h1
          className={`mt-4 text-lg font-semibold ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {t("cartEmptyTitle")}
        </h1>
        <p
          className={`mt-1.5 text-sm ${
            isDarkMode ? "text-gray-500" : "text-gray-500"
          }`}
        >
          {t("cartEmptyStartShopping")}
        </p>
        <Link
          href="/market-categories"
          className="mt-6 inline-flex items-center px-5 py-2.5 rounded-xl bg-[#00A86B] text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
        >
          {t("cartGoToMarket")}
        </Link>
      </div>
    </main>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SKELETON
// ═════════════════════════════════════════════════════════════════════════════

function SkeletonShell({ isDarkMode }: { isDarkMode: boolean }) {
  const bg = isDarkMode ? "bg-[#3A3850]" : "bg-gray-200";
  const card = isDarkMode ? "bg-[#2D2B3F]" : "bg-white";

  return (
    <main
      className={`flex-1 min-h-screen ${
        isDarkMode ? "bg-[#1C1A29]" : "bg-[#F5F5F5]"
      }`}
    >
      <header className="h-14 bg-[#00A86B]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-pulse">
        <div className={`h-8 w-40 rounded ${bg} mb-6`} />
        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8 items-start">
          <div className="lg:col-span-2 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`rounded-2xl p-5 ${card}`}>
                <div className={`h-3 w-24 rounded ${bg} mb-4`} />
                <div className={`h-16 w-full rounded-xl ${bg}`} />
              </div>
            ))}
          </div>
          <aside className={`rounded-2xl p-5 ${card} space-y-3`}>
            <div className={`h-3 w-24 rounded ${bg}`} />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className={`h-16 w-full rounded-xl ${bg}`} />
            ))}
            <div className={`h-8 w-32 rounded ml-auto ${bg}`} />
            <div className={`h-12 w-full rounded-xl ${bg}`} />
          </aside>
        </div>
      </div>
    </main>
  );
}