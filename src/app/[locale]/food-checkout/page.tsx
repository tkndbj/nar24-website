"use client";

import React, { useState, useCallback, useMemo} from "react";
import Image from "next/image";
import Link from "next/link";

import { useTranslations } from "next-intl";
import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/context/UserProvider"; // adjust to your auth hook
import { useRouter } from "@/navigation";           // adjust to your firebase config
import { FoodCartProvider } from "@/context/FoodCartProvider";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";       // adjust to your firebase functions instance
import {
  useFoodCartState,
  useFoodCartActions,
  FoodCartItem,
} from "@/context/FoodCartProvider";
import {
  ChevronLeft,
  MapPin,

  CreditCard,
  Banknote,
  Clock,
  ShoppingBag,
  AlertCircle,
  Loader2,
  Trash2,
  Minus,
  Plus,
  StickyNote,
  CheckCircle2,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type PaymentMethod = "pay_at_door" | "card";
type DeliveryType = "delivery" | "pickup";

interface DeliveryAddress {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  phoneNumber: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

// ============================================================================
// CART ITEM ROW
// ============================================================================

function CartItemRow({
  item,
  isDarkMode,
}: {
  item: FoodCartItem;
  isDarkMode: boolean;
}) {

  const { updateQuantity, removeItem } = useFoodCartActions();

  const extrasTotal = item.extras.reduce(
    (sum, ext) => sum + ext.price * ext.quantity,
    0
  );
  const lineTotal = (item.price + extrasTotal) * item.quantity;

  return (
    <div
      className={`flex gap-3 p-3 rounded-xl ${
        isDarkMode ? "bg-gray-800/60" : "bg-gray-50"
      }`}
    >
      {/* Image */}
      {item.imageUrl ? (
        <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            className="object-cover"
            sizes="64px"
          />
        </div>
      ) : (
        <div
          className={`w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`}
        >
          <ShoppingBag className="w-6 h-6 text-gray-400" />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4
            className={`text-sm font-semibold truncate ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {item.name}
          </h4>
          <button
            onClick={() => removeItem(item.foodId)}
            className={`p-1 rounded-lg transition-colors flex-shrink-0 ${
              isDarkMode
                ? "hover:bg-gray-700 text-gray-500"
                : "hover:bg-gray-200 text-gray-400"
            }`}
            aria-label="Remove item"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Food type */}
        <p
          className={`text-xs mt-0.5 ${
            isDarkMode ? "text-gray-500" : "text-gray-400"
          }`}
        >
          {item.foodType}
        </p>

        {/* Extras */}
        {item.extras.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {item.extras.map((ext) => (
              <span
                key={ext.name}
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  isDarkMode
                    ? "bg-orange-500/15 text-orange-400"
                    : "bg-orange-50 text-orange-600"
                }`}
              >
                {ext.name}
              </span>
            ))}
          </div>
        )}

        {/* Special notes */}
        {item.specialNotes && (
          <div
            className={`flex items-start gap-1 mt-1 text-[11px] ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            <StickyNote className="w-3 h-3 mt-0.5 flex-shrink-0" />
            <span className="line-clamp-1">{item.specialNotes}</span>
          </div>
        )}

        {/* Quantity + Price */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateQuantity(item.foodId, item.quantity - 1)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors ${
                isDarkMode
                  ? "border-gray-700 text-gray-400 hover:bg-gray-700"
                  : "border-gray-200 text-gray-500 hover:bg-gray-100"
              }`}
            >
              <Minus className="w-3 h-3" />
            </button>
            <span
              className={`text-sm font-bold min-w-[20px] text-center ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {item.quantity}
            </span>
            <button
              onClick={() => updateQuantity(item.foodId, item.quantity + 1)}
              className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors ${
                isDarkMode
                  ? "border-gray-700 text-gray-400 hover:bg-gray-700"
                  : "border-gray-200 text-gray-500 hover:bg-gray-100"
              }`}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <span
            className={`text-sm font-bold ${
              isDarkMode ? "text-orange-400" : "text-orange-600"
            }`}
          >
            {lineTotal.toLocaleString()} TL
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION WRAPPER
// ============================================================================

function Section({
  title,
  children,
  isDarkMode,
}: {
  title: string;
  children: React.ReactNode;
  isDarkMode: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 sm:p-5 ${
        isDarkMode ? "border border-gray-700/40" : "border border-gray-200"
      }`}
    >
      <h3
        className={`text-sm font-bold uppercase tracking-wider mb-3 ${
          isDarkMode ? "text-gray-400" : "text-gray-500"
        }`}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

// ============================================================================
// MAIN CHECKOUT COMPONENT
// ============================================================================

export default function FoodCheckoutPage() {
    const { user } = useUser();
    return (
      <FoodCartProvider user={user} db={db}>
        <FoodCheckoutContent />
      </FoodCartProvider>
    );
  }

  function FoodCheckoutContent() {
    const isDarkMode = useTheme();
    const t = useTranslations("foodCheckout");
    const router = useRouter();
    const { user } = useUser();
  const { items, currentRestaurant, totals, isLoading: cartLoading } = useFoodCartState();
  const { clearCart } = useFoodCartActions();

  // Form state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pay_at_door");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("delivery");
  const [address, setAddress] = useState<DeliveryAddress>({
    addressLine1: "",
    addressLine2: "",
    city: "",
    phoneNumber: "",
  });
  const [orderNotes, setOrderNotes] = useState("");

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<{
    orderId: string;
    estimatedPrepTime: number;
  } | null>(null);

  // Computed
  const estimatedPrepTime = useMemo(() => {
    return Math.max(...items.map((i) => i.preparationTime ?? 0), 0);
  }, [items]);

  const isFormValid = useMemo(() => {
    if (items.length === 0) return false;
    if (deliveryType === "delivery") {
      return !!(address.addressLine1.trim() && address.phoneNumber.trim());
    }
    return true; // pickup doesn't need address
  }, [items, deliveryType, address]);

  // ── Place Order (Pay at Door) ──────────────────────────────────────
  const handlePayAtDoor = useCallback(async () => {
    if (!user || !currentRestaurant || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const processFoodOrder = httpsCallable(functions, "processFoodOrder");

      const result = await processFoodOrder({
        restaurantId: currentRestaurant.id,
        items: items.map((item) => ({
          foodId: item.foodId,
          quantity: item.quantity,
          extras: item.extras,
          specialNotes: item.specialNotes,
        })),
        paymentMethod: "pay_at_door",
        deliveryType,
        deliveryAddress:
          deliveryType === "delivery"
            ? {
                addressLine1: address.addressLine1,
                addressLine2: address.addressLine2,
                city: address.city,
                phoneNumber: address.phoneNumber,
                location: address.location || null,
              }
            : null,
        buyerPhone: address.phoneNumber || "",
        orderNotes,
        clientSubtotal: totals.subtotal,
      });

      const data = result.data as {
        orderId: string;
        success: boolean;
        estimatedPrepTime: number;
      };

      if (data.success) {
        // Clear local cart
        await clearCart();
        setOrderSuccess({
          orderId: data.orderId,
          estimatedPrepTime: data.estimatedPrepTime || estimatedPrepTime,
        });
      }
    } catch (err: unknown) {
      console.error("[FoodCheckout] Order error:", err);
      const message =
        err instanceof Error ? err.message : "An error occurred. Please try again.";
      // Extract Firebase callable error message
      const firebaseMsg = (err as { details?: string })?.details || message;
      setError(firebaseMsg);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    user,
    currentRestaurant,
    items,
    deliveryType,
    address,
    orderNotes,
    totals,
    clearCart,
    estimatedPrepTime,
    isSubmitting,
    router,
  ]);

  // ── Place Order (Card — İşbank 3D) ────────────────────────────────
  const handleCardPayment = useCallback(async () => {
    if (!user || !currentRestaurant || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const orderNumber = `FOOD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const initPayment = httpsCallable(functions, "initializeFoodPayment");

      const result = await initPayment({
        restaurantId: currentRestaurant.id,
        items: items.map((item) => ({
          foodId: item.foodId,
          quantity: item.quantity,
          extras: item.extras,
          specialNotes: item.specialNotes,
        })),
        deliveryType,
        deliveryAddress:
          deliveryType === "delivery"
            ? {
                addressLine1: address.addressLine1,
                addressLine2: address.addressLine2,
                city: address.city,
                phoneNumber: address.phoneNumber,
                location: address.location || null,
              }
            : null,
        buyerPhone: address.phoneNumber || "",
        orderNotes,
        clientSubtotal: totals.subtotal,
        customerName: user.displayName || "",
        customerEmail: user.email || "",
        customerPhone: address.phoneNumber || "",
        orderNumber,
      });

      const data = result.data as {
        success: boolean;
        gatewayUrl: string;
        paymentParams: Record<string, string>;
      };

      if (data.success && data.gatewayUrl) {
        const params = new URLSearchParams({
          gatewayUrl: data.gatewayUrl,
          orderNumber,
          paymentParams: JSON.stringify(data.paymentParams),
        });
        router.push(`/food-payment?${params.toString()}`);
      }
    } catch (err: unknown) {
      console.error("[FoodCheckout] Payment init error:", err);
      const message =
        err instanceof Error ? err.message : "Payment initialization failed.";
      setError(message);
      setIsSubmitting(false);
    }
  }, [
    user,
    currentRestaurant,
    items,
    deliveryType,
    address,
    orderNotes,
    totals,
    isSubmitting,
    router,
  ]);

  // ── Submit handler ─────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (paymentMethod === "pay_at_door") {
      handlePayAtDoor();
    } else {
      handleCardPayment();
    }
  }, [paymentMethod, handlePayAtDoor, handleCardPayment]);

  // ── Success Screen ─────────────────────────────────────────────────
  if (orderSuccess) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <div
          className={`w-full max-w-md text-center rounded-2xl p-8 ${
            isDarkMode ? "border border-gray-700/40" : "border border-gray-200"
          }`}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/15 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
          </div>
          <h2
            className={`text-xl font-bold mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("orderPlaced")}
          </h2>
          <p
            className={`text-sm mb-1 ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            {t("orderConfirmation")}
          </p>

          {orderSuccess.estimatedPrepTime > 0 && (
            <div
              className={`inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-full text-sm ${
                isDarkMode
                  ? "bg-orange-500/15 text-orange-400"
                  : "bg-orange-50 text-orange-600"
              }`}
            >
              <Clock className="w-4 h-4" />
              ~{orderSuccess.estimatedPrepTime} {t("min")}
            </div>
          )}

          <p
            className={`text-xs mt-4 ${
              isDarkMode ? "text-gray-600" : "text-gray-400"
            }`}
          >
            {t("orderId")}: {orderSuccess.orderId.substring(0, 8).toUpperCase()}
          </p>

          <div className="flex flex-col gap-2 mt-6">
            <Link
              href="/food-orders"
              className="w-full py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors text-center"
            >
              {t("viewOrders")}
            </Link>
            <Link
              href="/restaurants"
              className={`w-full py-2.5 px-4 rounded-xl text-sm font-medium transition-colors text-center ${
                isDarkMode
                  ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t("backToRestaurants")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ── Empty Cart ─────────────────────────────────────────────────────
  if (!cartLoading && items.length === 0) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <ShoppingBag
          className={`w-16 h-16 mb-4 ${
            isDarkMode ? "text-gray-600" : "text-gray-300"
          }`}
        />
        <h2
          className={`text-xl font-semibold mb-2 ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {t("emptyCart")}
        </h2>
        <p
          className={`text-sm mb-6 ${
            isDarkMode ? "text-gray-400" : "text-gray-500"
          }`}
        >
          {t("emptyCartSubtitle")}
        </p>
        <Link
          href="/restaurants"
          className="px-6 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
        >
          {t("browseRestaurants")}
        </Link>
      </main>
    );
  }

  // ── Main Checkout ──────────────────────────────────────────────────
  return (
    <main className="flex-1 pb-32">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4">
        {/* Header */}
        <Link
          href={currentRestaurant ? `/restaurants/${currentRestaurant.id}` : "/restaurants"}
          className={`inline-flex items-center gap-1 mb-4 text-sm font-medium transition-colors ${
            isDarkMode
              ? "text-gray-400 hover:text-white"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          {t("backToMenu")}
        </Link>

        <h1
          className={`text-2xl font-bold mb-6 ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {t("checkout")}
        </h1>

        <div className="space-y-4">
          {/* ── Restaurant Info ──────────────────────────────────────── */}
          {currentRestaurant && (
            <div
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                isDarkMode
                  ? "bg-gray-800/60 border border-gray-700/40"
                  : "bg-orange-50/60 border border-orange-100"
              }`}
            >
              {currentRestaurant.profileImageUrl && (
                <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                  <Image
                    src={currentRestaurant.profileImageUrl}
                    alt={currentRestaurant.name}
                    width={40}
                    height={40}
                    className="object-cover w-full h-full"
                  />
                </div>
              )}
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold truncate ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {currentRestaurant.name}
                </p>
                {estimatedPrepTime > 0 && (
                  <p
                    className={`text-xs flex items-center gap-1 ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    <Clock className="w-3 h-3" />
                    ~{estimatedPrepTime} {t("min")} {t("prepTime")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Order Items ─────────────────────────────────────────── */}
          <Section title={t("yourOrder")} isDarkMode={isDarkMode}>
            <div className="space-y-3">
              {items.map((item) => (
                <CartItemRow key={item.foodId} item={item} isDarkMode={isDarkMode} />
              ))}
            </div>
          </Section>

          {/* ── Delivery Type ───────────────────────────────────────── */}
          <Section title={t("deliveryMethod")} isDarkMode={isDarkMode}>
            <div className="grid grid-cols-2 gap-3">
              {(["delivery", "pickup"] as DeliveryType[]).map((type) => {
                const isSelected = deliveryType === type;
                const icon = type === "delivery" ? MapPin : ShoppingBag;
                const Icon = icon;
                return (
                  <button
                    key={type}
                    onClick={() => setDeliveryType(type)}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left ${
                      isSelected
                        ? isDarkMode
                          ? "border-orange-500/50 bg-orange-500/10"
                          : "border-orange-400 bg-orange-50"
                        : isDarkMode
                          ? "border-gray-700 hover:border-gray-600"
                          : "border-gray-200 hover:border-orange-200"
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 flex-shrink-0 ${
                        isSelected
                          ? "text-orange-500"
                          : isDarkMode
                            ? "text-gray-500"
                            : "text-gray-400"
                      }`}
                    />
                    <span
                      className={`text-sm font-medium ${
                        isSelected
                          ? isDarkMode
                            ? "text-orange-400"
                            : "text-orange-700"
                          : isDarkMode
                            ? "text-gray-300"
                            : "text-gray-700"
                      }`}
                    >
                      {t(type)}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ── Delivery Address (only for delivery) ────────────────── */}
          {deliveryType === "delivery" && (
            <Section title={t("deliveryAddress")} isDarkMode={isDarkMode}>
              <div className="space-y-3">
                <div>
                  <label
                    className={`text-xs font-medium ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    {t("addressLine1")} *
                  </label>
                  <input
                    type="text"
                    value={address.addressLine1}
                    onChange={(e) =>
                      setAddress((a) => ({ ...a, addressLine1: e.target.value }))
                    }
                    placeholder={t("addressPlaceholder")}
                    className={`w-full mt-1 px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-orange-500"
                        : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
                    } outline-none`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className={`text-xs font-medium ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      {t("city")}
                    </label>
                    <input
                      type="text"
                      value={address.city}
                      onChange={(e) =>
                        setAddress((a) => ({ ...a, city: e.target.value }))
                      }
                      placeholder={t("cityPlaceholder")}
                      className={`w-full mt-1 px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                        isDarkMode
                          ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-orange-500"
                          : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
                      } outline-none`}
                    />
                  </div>
                  <div>
                    <label
                      className={`text-xs font-medium ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      {t("phone")} *
                    </label>
                    <input
                      type="tel"
                      value={address.phoneNumber}
                      onChange={(e) =>
                        setAddress((a) => ({ ...a, phoneNumber: e.target.value }))
                      }
                      placeholder="05XX XXX XXXX"
                      className={`w-full mt-1 px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                        isDarkMode
                          ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-orange-500"
                          : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
                      } outline-none`}
                    />
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* ── Phone for Pickup ────────────────────────────────────── */}
          {deliveryType === "pickup" && (
            <Section title={t("contactInfo")} isDarkMode={isDarkMode}>
              <div>
                <label
                  className={`text-xs font-medium ${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  }`}
                >
                  {t("phone")}
                </label>
                <input
                  type="tel"
                  value={address.phoneNumber}
                  onChange={(e) =>
                    setAddress((a) => ({ ...a, phoneNumber: e.target.value }))
                  }
                  placeholder="05XX XXX XXXX"
                  className={`w-full mt-1 px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-orange-500"
                      : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
                  } outline-none`}
                />
              </div>
            </Section>
          )}

          {/* ── Order Notes ─────────────────────────────────────────── */}
          <Section title={t("orderNotes")} isDarkMode={isDarkMode}>
            <textarea
              rows={2}
              value={orderNotes}
              onChange={(e) => setOrderNotes(e.target.value)}
              placeholder={t("orderNotesPlaceholder")}
              maxLength={1000}
              className={`w-full px-3 py-2.5 rounded-xl text-sm border resize-none transition-colors ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-orange-500"
                  : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
              } outline-none focus:ring-2 focus:ring-orange-500/20`}
            />
          </Section>

          {/* ── Payment Method ──────────────────────────────────────── */}
          <Section title={t("paymentMethod")} isDarkMode={isDarkMode}>
            <div className="space-y-2">
              {(
                [
                  { id: "pay_at_door" as PaymentMethod, icon: Banknote, label: t("payAtDoor"), desc: t("payAtDoorDesc") },
                  { id: "card" as PaymentMethod, icon: CreditCard, label: t("creditCard"), desc: t("creditCardDesc") },
                ] as const
              ).map(({ id, icon: Icon, label, desc }) => {
                const isSelected = paymentMethod === id;
                return (
                  <button
                    key={id}
                    onClick={() => setPaymentMethod(id)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${
                      isSelected
                        ? isDarkMode
                          ? "border-orange-500/50 bg-orange-500/10"
                          : "border-orange-400 bg-orange-50"
                        : isDarkMode
                          ? "border-gray-700 hover:border-gray-600"
                          : "border-gray-200 hover:border-orange-200"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isSelected
                          ? "bg-orange-500/20"
                          : isDarkMode
                            ? "bg-gray-800"
                            : "bg-gray-100"
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 ${
                          isSelected
                            ? "text-orange-500"
                            : isDarkMode
                              ? "text-gray-500"
                              : "text-gray-400"
                        }`}
                      />
                    </div>
                    <div>
                      <p
                        className={`text-sm font-semibold ${
                          isSelected
                            ? isDarkMode
                              ? "text-orange-400"
                              : "text-orange-700"
                            : isDarkMode
                              ? "text-gray-200"
                              : "text-gray-800"
                        }`}
                      >
                        {label}
                      </p>
                      <p
                        className={`text-xs ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        {desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Section>
        </div>
      </div>

      {/* ── Sticky Bottom Bar ───────────────────────────────────────── */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-30 border-t ${
          isDarkMode
            ? "bg-gray-900/95 border-gray-800 backdrop-blur-lg"
            : "bg-white/95 border-gray-200 backdrop-blur-lg"
        }`}
      >
        <div className="max-w-2xl mx-auto px-4 py-3">
          {/* Error */}
          {error && (
            <div
              className={`flex items-start gap-2 mb-3 p-3 rounded-xl text-sm ${
                isDarkMode
                  ? "bg-red-500/10 text-red-400"
                  : "bg-red-50 text-red-600"
              }`}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Summary row */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <p
                className={`text-xs ${
                  isDarkMode ? "text-gray-500" : "text-gray-400"
                }`}
              >
                {t("total")} ({totals.itemCount} {t("items")})
              </p>
              <p
                className={`text-xl font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {totals.subtotal.toLocaleString()} TL
              </p>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!isFormValid || isSubmitting}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all ${
                !isFormValid || isSubmitting
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500"
                  : "bg-orange-500 hover:bg-orange-600 text-white active:scale-[0.98]"
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("processing")}
                </>
              ) : paymentMethod === "card" ? (
                <>
                  <CreditCard className="w-4 h-4" />
                  {t("payNow")}
                </>
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4" />
                  {t("placeOrder")}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}