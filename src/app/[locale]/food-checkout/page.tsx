"use client";

import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import Image from "next/image";
import { Link } from "@/navigation";

import { useTranslations } from "next-intl";
import { useTheme } from "@/hooks/useTheme";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "@/navigation";
import { FoodCartProvider } from "@/context/FoodCartProvider";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import {
  useFoodCartState,
  useFoodCartActions,
  FoodCartItem,
} from "@/context/FoodCartProvider";
import regionsList from "@/constants/regions";
import {
  ChevronLeft,
  ChevronDown,
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
  X,
  Map as MapIcon,
  Phone,
  Home,
  Building,
  Star,
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
  } | null;
}

interface SavedAddress {
  id: string;
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
  city: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

// ============================================================================
// PHONE NUMBER UTILITIES (matching Flutter / ProductPayment implementation)
// Format: (5XX) XXX XX XX for Turkish phone numbers
// ============================================================================

const formatPhoneNumber = (value: string): string => {
  const digitsOnly = value.replace(/\D/g, "");
  const limited = digitsOnly.slice(0, 10);

  let formatted = "";
  for (let i = 0; i < limited.length; i++) {
    if (i === 0) formatted += "(";
    formatted += limited[i];
    if (i === 2) formatted += ") ";
    if (i === 5) formatted += " ";
    if (i === 7) formatted += " ";
  }

  return formatted;
};

const formatPhoneForDisplay = (phone: string): string => {
  if (!phone) return "";
  const digitsOnly = phone.replace(/\D/g, "");
  const digits = digitsOnly.startsWith("0") ? digitsOnly.slice(1) : digitsOnly;
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
};

const isValidPhoneNumber = (phone: string): boolean => {
  const digitsOnly = phone.replace(/\D/g, "");
  return digitsOnly.length === 10 && digitsOnly.startsWith("5");
};

/** Strip formatting → "05XXXXXXXXX" for Firestore storage */
const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? digits : `0${digits}`;
};

// ============================================================================
// GOOGLE MAPS LOADER
// ============================================================================

const loadGoogleMapsScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve();
      return;
    }

    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com"]',
    );
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve());
      existingScript.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=marker,places&v=weekly&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// ============================================================================
// LOCATION PICKER MODAL (ported from ProductPayment)
// ============================================================================

function LocationPickerModal({
  isOpen,
  onClose,
  onLocationSelect,
  initialLocation,
  isDarkMode,
  t,
}: {
  isOpen: boolean;
  onClose: () => void;
  onLocationSelect: (location: { latitude: number; longitude: number }) => void;
  initialLocation?: { latitude: number; longitude: number } | null;
  isDarkMode: boolean;
  t: (key: string) => string;
}) {
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(initialLocation || null);

  const [lastClickTime, setLastClickTime] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(
    null,
  );

  useEffect(() => {
    if (!isOpen || !window.google || !mapRef.current) return;

    const initializeMap = async () => {
      try {
        const { AdvancedMarkerElement } = (await google.maps.importLibrary(
          "marker",
        )) as google.maps.MarkerLibrary;

        const defaultCenter = { lat: 35.1855, lng: 33.3823 };
        const mapCenter = initialLocation
          ? { lat: initialLocation.latitude, lng: initialLocation.longitude }
          : defaultCenter;

        const map = new google.maps.Map(mapRef.current!, {
          center: mapCenter,
          zoom: initialLocation ? 15 : 10,
          mapId: process.env.NEXT_PUBLIC_MAP_ID || "DEMO_MAP_ID",
          clickableIcons: false,
          gestureHandling: "greedy",
          // Remove the styles property entirely — mapId handles styling via Cloud Console
        });

        mapInstanceRef.current = map;

        const markerPosition = initialLocation
          ? { lat: initialLocation.latitude, lng: initialLocation.longitude }
          : mapCenter;

        const marker = new AdvancedMarkerElement({
          map,
          position: markerPosition,
          title: t("clickToSelectLocation"),
        });

        markerRef.current = marker;

        map.addListener("click", (event: google.maps.MapMouseEvent) => {
          const now = Date.now();
          if (now - lastClickTime < 300) return;
          setLastClickTime(now);

          if (event.latLng) {
            const newLocation = {
              latitude: event.latLng.lat(),
              longitude: event.latLng.lng(),
            };
            setSelectedLocation(newLocation);

            if (markerRef.current) {
              markerRef.current.position = {
                lat: event.latLng.lat(),
                lng: event.latLng.lng(),
              };
            }
          }
        });

        if (initialLocation) {
          setSelectedLocation(initialLocation);
        }
      } catch (error) {
        console.error("Error initializing map:", error);
      }
    };

    initializeMap();

    return () => {
      if (markerRef.current) {
        markerRef.current.map = null;
        markerRef.current = null;
      }
      if (mapInstanceRef.current) {
        google.maps.event.clearInstanceListeners(mapInstanceRef.current);
        mapInstanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialLocation, isDarkMode]);

  const handleConfirm = useCallback(() => {
    if (selectedLocation) {
      onLocationSelect(selectedLocation);
    }
  }, [selectedLocation, onLocationSelect]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div
        className={`w-full max-w-5xl h-[85vh] rounded-2xl overflow-hidden shadow-2xl flex flex-col ${
          isDarkMode
            ? "bg-gray-900/95 backdrop-blur-xl border border-gray-700/50"
            : "bg-white/95 backdrop-blur-xl border border-gray-200/50"
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-4 sm:p-6 border-b ${
            isDarkMode ? "border-gray-700/50" : "border-gray-200/50"
          }`}
        >
          <div>
            <h3
              className={`text-lg sm:text-xl font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("selectLocation")}
            </h3>
            <p
              className={`text-xs sm:text-sm mt-1 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {t("clickAnywhereOnMap")}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-all ${
              isDarkMode
                ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            }`}
          >
            <X size={20} className="sm:size-6" />
          </button>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <div
            ref={mapRef}
            className="w-full h-full rounded-b-2xl"
            style={{ minHeight: "450px" }}
          />

          {selectedLocation && (
            <div
              className={`absolute bottom-4 sm:bottom-6 left-4 sm:left-6 right-4 sm:right-6 p-3 sm:p-4 rounded-xl shadow-lg border backdrop-blur-sm ${
                isDarkMode
                  ? "bg-gray-900/90 border-gray-700/50"
                  : "bg-white/90 border-gray-200/50"
              }`}
            >
              <div className="flex items-start space-x-2 sm:space-x-3">
                <div className="p-1.5 sm:p-2 rounded-lg bg-green-500/20">
                  <CheckCircle2
                    size={16}
                    className="sm:size-5 text-green-500"
                  />
                </div>
                <div>
                  <p
                    className={`text-xs sm:text-sm font-semibold mb-1 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("locationSelected")}
                  </p>
                  <p
                    className={`text-xs font-mono ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {selectedLocation.latitude.toFixed(6)},{" "}
                    {selectedLocation.longitude.toFixed(6)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`flex items-center justify-between p-4 sm:p-6 border-t ${
            isDarkMode ? "border-gray-700/50" : "border-gray-200/50"
          }`}
        >
          <p
            className={`text-xs sm:text-sm flex items-center space-x-2 ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            <MapIcon size={14} className="sm:size-4" />
            <span>{t("tapAnywhereToSetLocation")}</span>
          </p>
          <div className="flex space-x-2 sm:space-x-3">
            <button
              onClick={onClose}
              className={`px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-medium transition-all text-sm sm:text-base ${
                isDarkMode
                  ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedLocation}
              className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-medium bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg text-sm sm:text-base"
            >
              {t("confirmLocation")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
    0,
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

        <p
          className={`text-xs mt-0.5 ${
            isDarkMode ? "text-gray-500" : "text-gray-400"
          }`}
        >
          {item.foodType}
        </p>

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
  const {
    items,
    currentRestaurant,
    totals,
    isInitialized,
  } = useFoodCartState();
  const { clearCart } = useFoodCartActions();

  // Form state
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("pay_at_door");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("delivery");
  const [address, setAddress] = useState<DeliveryAddress>({
    addressLine1: "",
    addressLine2: "",
    city: "",
    phoneNumber: "",
    location: null,
  });
  const [orderNotes, setOrderNotes] = useState("");
  const [saveAddress, setSaveAddress] = useState(false);

  // Saved addresses
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );

  // Location picker
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // City dropdown
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  // ── Load Google Maps ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined") {
      loadGoogleMapsScript()
        .then(() => setMapsLoaded(true))
        .catch((err) => console.error("Failed to load Google Maps:", err));
    }
  }, []);

  // ── Load saved addresses ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const loadSavedAddresses = async () => {
      try {
        const addressesRef = collection(db, "users", user.uid, "addresses");
        const snapshot = await getDocs(addressesRef);
        const addresses: SavedAddress[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as SavedAddress[];
        setSavedAddresses(addresses);
      } catch (err) {
        console.error("[FoodCheckout] Error loading addresses:", err);
      }
    };

    loadSavedAddresses();
  }, [user]);

  // ── Handle address selection ─────────────────────────────────────
  const handleAddressSelect = useCallback(
    (addressId: string | null) => {
      setSelectedAddressId(addressId);
      setErrors({});

      if (addressId) {
        const saved = savedAddresses.find((a) => a.id === addressId);
        if (saved) {
          setAddress({
            addressLine1: saved.addressLine1,
            addressLine2: saved.addressLine2 || "",
            city: saved.city,
            phoneNumber: formatPhoneForDisplay(saved.phoneNumber),
            location: saved.location || null,
          });
        }
      } else {
        setAddress({
          addressLine1: "",
          addressLine2: "",
          city: "",
          phoneNumber: "",
          location: null,
        });
      }
    },
    [savedAddresses],
  );

  // ── Phone input handler with formatting ──────────────────────────
  const handlePhoneChange = useCallback((value: string) => {
    const formatted = formatPhoneNumber(value);
    setAddress((a) => ({ ...a, phoneNumber: formatted }));
    setErrors((prev) => ({ ...prev, phoneNumber: "" }));
  }, []);

  // ── Form validation ──────────────────────────────────────────────
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (deliveryType === "delivery") {
      if (!address.addressLine1.trim()) {
        newErrors.addressLine1 = t("fieldRequired");
      }
      if (!address.phoneNumber.trim()) {
        newErrors.phoneNumber = t("fieldRequired");
      } else if (!isValidPhoneNumber(address.phoneNumber)) {
        newErrors.phoneNumber = t("invalidPhoneNumber");
      }
      if (!address.city.trim()) {
        newErrors.city = t("fieldRequired");
      }
      if (!address.location) {
        newErrors.location = t("pinLocationRequired");
      }
    } else {
      // Pickup — phone is optional but if provided, validate it
      if (
        address.phoneNumber.trim() &&
        !isValidPhoneNumber(address.phoneNumber)
      ) {
        newErrors.phoneNumber = t("invalidPhoneNumber");
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [deliveryType, address, t]);

  const isFormValid = useMemo(() => {
    if (items.length === 0) return false;
    if (deliveryType === "delivery") {
      return !!(
        address.addressLine1.trim() &&
        address.phoneNumber.trim() &&
        isValidPhoneNumber(address.phoneNumber) &&
        address.city.trim() &&
        address.location
      );
    }
    return true;
  }, [items, deliveryType, address]);

  // ── Place Order (Pay at Door) ────────────────────────────────────
  const handlePayAtDoor = useCallback(async () => {
    if (!user || !currentRestaurant || isSubmitting) return;
    if (!validateForm()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const processFoodOrder = httpsCallable(functions, "processFoodOrder");

      const normalizedPhone = address.phoneNumber
        ? normalizePhone(address.phoneNumber)
        : "";

      const result = await processFoodOrder({
        restaurantId: currentRestaurant.id,
        items: items.map((item) => ({
          foodId: item.originalFoodId,
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
                addressLine2: address.addressLine2 || "",
                city: address.city,
                phoneNumber: normalizedPhone,
                location: address.location || null,
              }
            : null,
        buyerPhone: normalizedPhone,
        orderNotes,
        clientSubtotal: totals.subtotal,
      });

      const data = result.data as {
        orderId: string;
        success: boolean;
        estimatedPrepTime: number;
      };

      if (data.success) {
        // Save address if requested
        if (
          saveAddress &&
          deliveryType === "delivery" &&
          selectedAddressId === null
        ) {
          saveNewAddress(normalizedPhone);
        }

        await clearCart();
        setOrderSuccess({
          orderId: data.orderId,
          estimatedPrepTime: data.estimatedPrepTime || estimatedPrepTime,
        });
      }
    } catch (err: unknown) {
      console.error("[FoodCheckout] Order error:", err);
      const message =
        err instanceof Error
          ? err.message
          : "An error occurred. Please try again.";
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
    validateForm,
    saveAddress,
    selectedAddressId,
  ]);

  // ── Place Order (Card — İşbank 3D) ──────────────────────────────
  const handleCardPayment = useCallback(async () => {
    if (!user || !currentRestaurant || isSubmitting) return;
    if (!validateForm()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const orderNumber = `FOOD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const initPayment = httpsCallable(functions, "initializeFoodPayment");

      const normalizedPhone = address.phoneNumber
        ? normalizePhone(address.phoneNumber)
        : "";

      const result = await initPayment({
        restaurantId: currentRestaurant.id,
        items: items.map((item) => ({
          foodId: item.originalFoodId,
          quantity: item.quantity,
          extras: item.extras,
          specialNotes: item.specialNotes,
        })),
        deliveryType,
        deliveryAddress:
          deliveryType === "delivery"
            ? {
                addressLine1: address.addressLine1,
                addressLine2: address.addressLine2 || "",
                city: address.city,
                phoneNumber: normalizedPhone,
                location: address.location || null,
              }
            : null,
        buyerPhone: normalizedPhone,
        orderNotes,
        clientSubtotal: totals.subtotal,
        customerName: user.displayName || "",
        customerEmail: user.email || "",
        customerPhone: normalizedPhone,
        orderNumber,
      });

      const data = result.data as {
        success: boolean;
        gatewayUrl: string;
        paymentParams: Record<string, string>;
      };

      if (data.success && data.gatewayUrl) {
        // Save address if requested
        if (
          saveAddress &&
          deliveryType === "delivery" &&
          selectedAddressId === null
        ) {
          saveNewAddress(normalizedPhone);
        }

        const params = new URLSearchParams({
          gatewayUrl: data.gatewayUrl,
          orderNumber,
          paymentParams: JSON.stringify(data.paymentParams),
        });
        router.push(`/isbankfoodpayment?${params.toString()}`);
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
    validateForm,
    saveAddress,
    selectedAddressId,
  ]);

  // ── Save new address to Firestore ────────────────────────────────
  const saveNewAddress = useCallback(
    async (normalizedPhone: string) => {
      if (!user) return;
      try {
        const { doc, setDoc } = await import("firebase/firestore");
        const addressRef = doc(collection(db, "users", user.uid, "addresses"));
        await setDoc(addressRef, {
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2 || "",
          city: address.city,
          phoneNumber: normalizedPhone,
          location: address.location || null,
          createdAt: new Date(),
        });
      } catch (err) {
        console.error("[FoodCheckout] Failed to save address:", err);
      }
    },
    [user, address],
  );

  // ── Submit handler ───────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (paymentMethod === "pay_at_door") {
      handlePayAtDoor();
    } else {
      handleCardPayment();
    }
  }, [paymentMethod, handlePayAtDoor, handleCardPayment]);

  // ── Success Screen ───────────────────────────────────────────────
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
              <Clock className="w-4 h-4" />~{orderSuccess.estimatedPrepTime}{" "}
              {t("min")}
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

  // ── Loading — shimmer skeleton ──────────────────────────────────
  if (!isInitialized) {
    return (
      <main className="flex-1 pb-32">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4">
          <FoodCheckoutSkeleton isDarkMode={isDarkMode} />
        </div>
      </main>
    );
  }

  // ── Empty Cart ───────────────────────────────────────────────────
  if (items.length === 0) {
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

  // ── Main Checkout ────────────────────────────────────────────────
  return (
    <main className="flex-1 pb-32">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4">
        {/* Header */}
        <Link
          href={
            currentRestaurant
              ? `/restaurantdetail/${currentRestaurant.id}`
              : "/restaurants"
          }
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
          {/* ── Restaurant Info ──────────────────────────────────── */}
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
                    <Clock className="w-3 h-3" />~{estimatedPrepTime} {t("min")}{" "}
                    {t("prepTime")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Order Items ─────────────────────────────────────── */}
          <Section title={t("yourOrder")} isDarkMode={isDarkMode}>
            <div className="space-y-3">
              {items.map((item) => (
                <CartItemRow
                  key={item.foodId}
                  item={item}
                  isDarkMode={isDarkMode}
                />
              ))}
            </div>
          </Section>

          {/* ── Delivery Type ───────────────────────────────────── */}
          <Section title={t("deliveryMethod")} isDarkMode={isDarkMode}>
            <div className="grid grid-cols-2 gap-3">
              {(["delivery", "pickup"] as DeliveryType[]).map((type) => {
                const isSelected = deliveryType === type;
                const Icon = type === "delivery" ? MapPin : ShoppingBag;
                return (
                  <button
                    key={type}
                    onClick={() => {
                      setDeliveryType(type);
                      setErrors({});
                    }}
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

          {/* ── Delivery Address (only for delivery) ────────────── */}
          {deliveryType === "delivery" && (
            <Section title={t("deliveryAddress")} isDarkMode={isDarkMode}>
              <div className="space-y-4">
                {/* ── Saved Addresses ──────────────────────────── */}
                {savedAddresses.length > 0 && (
                  <div className="space-y-2">
                    <p
                      className={`text-xs font-semibold flex items-center gap-1.5 ${
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      <Star className="w-3.5 h-3.5" />
                      {t("savedAddresses")}
                    </p>

                    {savedAddresses.map((saved) => (
                      <label
                        key={saved.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedAddressId === saved.id
                            ? isDarkMode
                              ? "border-orange-500/50 bg-orange-500/10"
                              : "border-orange-400 bg-orange-50"
                            : isDarkMode
                              ? "border-gray-700 hover:border-gray-600"
                              : "border-gray-200 hover:border-orange-200"
                        }`}
                      >
                        <input
                          type="radio"
                          name="foodAddress"
                          value={saved.id}
                          checked={selectedAddressId === saved.id}
                          onChange={() => handleAddressSelect(saved.id)}
                          className="mt-1 accent-orange-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm font-semibold truncate ${
                              isDarkMode ? "text-white" : "text-gray-900"
                            }`}
                          >
                            {saved.addressLine1}
                          </p>
                          <p
                            className={`text-xs mt-0.5 ${
                              isDarkMode ? "text-gray-500" : "text-gray-400"
                            }`}
                          >
                            {[saved.addressLine2, saved.city]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                          <p
                            className={`text-xs ${
                              isDarkMode ? "text-gray-500" : "text-gray-400"
                            }`}
                          >
                            {saved.phoneNumber}
                          </p>
                          {saved.location && (
                            <p
                              className={`text-[10px] mt-0.5 flex items-center gap-1 ${
                                isDarkMode ? "text-gray-600" : "text-gray-300"
                              }`}
                            >
                              <MapPin className="w-2.5 h-2.5" />
                              {saved.location.latitude.toFixed(4)},{" "}
                              {saved.location.longitude.toFixed(4)}
                            </p>
                          )}
                        </div>
                      </label>
                    ))}

                    {/* New address option */}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedAddressId === null
                          ? isDarkMode
                            ? "border-orange-500/50 bg-orange-500/10"
                            : "border-orange-400 bg-orange-50"
                          : isDarkMode
                            ? "border-gray-700 hover:border-gray-600"
                            : "border-gray-200 hover:border-orange-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="foodAddress"
                        value=""
                        checked={selectedAddressId === null}
                        onChange={() => handleAddressSelect(null)}
                        className="accent-orange-500"
                      />
                      <span
                        className={`text-sm font-semibold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {t("enterNewAddress")}
                      </span>
                    </label>
                  </div>
                )}

                {/* ── Address Form Fields ─────────────────────── */}
                <div className="space-y-3">
                  {/* Address Line 1 */}
                  <div>
                    <label
                      className={`text-xs font-medium ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      {t("addressLine1")} *
                    </label>
                    <div className="relative group mt-1">
                      <Home
                        className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        } group-focus-within:text-orange-500`}
                      />
                      <input
                        type="text"
                        value={address.addressLine1}
                        onChange={(e) => {
                          setAddress((a) => ({
                            ...a,
                            addressLine1: e.target.value,
                          }));
                          setErrors((prev) => ({ ...prev, addressLine1: "" }));
                        }}
                        placeholder={t("addressPlaceholder")}
                        className={`w-full pl-10 pr-3 py-2.5 rounded-xl text-sm border transition-colors ${
                          errors.addressLine1
                            ? "border-red-500 focus:border-red-500"
                            : isDarkMode
                              ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-orange-500"
                              : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
                        } outline-none`}
                      />
                    </div>
                    {errors.addressLine1 && (
                      <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                        <X className="w-3 h-3" />
                        {errors.addressLine1}
                      </p>
                    )}
                  </div>

                  {/* Address Line 2 */}
                  <div>
                    <label
                      className={`text-xs font-medium ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      {t("addressLine2")}
                    </label>
                    <div className="relative group mt-1">
                      <Building
                        className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        } group-focus-within:text-orange-500`}
                      />
                      <input
                        type="text"
                        value={address.addressLine2 || ""}
                        onChange={(e) =>
                          setAddress((a) => ({
                            ...a,
                            addressLine2: e.target.value,
                          }))
                        }
                        placeholder={t("addressLine2Placeholder")}
                        className={`w-full pl-10 pr-3 py-2.5 rounded-xl text-sm border transition-colors ${
                          isDarkMode
                            ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-orange-500"
                            : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
                        } outline-none`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* City Dropdown */}
                    <div className="relative">
                      <label
                        className={`text-xs font-medium ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        {t("city")} *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowCityDropdown(!showCityDropdown)}
                        className={`w-full mt-1 px-3 py-2.5 rounded-xl text-sm border text-left flex items-center justify-between transition-colors ${
                          errors.city
                            ? "border-red-500"
                            : isDarkMode
                              ? "bg-gray-800 border-gray-700 text-white focus:border-orange-500"
                              : "bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-500"
                        } outline-none`}
                      >
                        <span
                          className={
                            address.city
                              ? isDarkMode
                                ? "text-white"
                                : "text-gray-900"
                              : isDarkMode
                                ? "text-gray-600"
                                : "text-gray-400"
                          }
                        >
                          {address.city || t("cityPlaceholder")}
                        </span>
                        <ChevronDown className="w-3.5 h-3.5 transition-transform" />
                      </button>

                      {showCityDropdown && (
                        <div
                          className={`absolute top-full left-0 right-0 mt-1 border rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto backdrop-blur-sm ${
                            isDarkMode
                              ? "bg-gray-800/95 border-gray-600"
                              : "bg-white/95 border-gray-300"
                          }`}
                        >
                          {regionsList.map((city) => (
                            <button
                              key={city}
                              type="button"
                              onClick={() => {
                                setAddress((a) => ({ ...a, city }));
                                setShowCityDropdown(false);
                                setErrors((prev) => ({ ...prev, city: "" }));
                              }}
                              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                                isDarkMode
                                  ? "text-white hover:bg-gray-700"
                                  : "text-gray-900 hover:bg-gray-100"
                              }`}
                            >
                              {city}
                            </button>
                          ))}
                        </div>
                      )}
                      {errors.city && (
                        <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                          <X className="w-3 h-3" />
                          {errors.city}
                        </p>
                      )}
                    </div>

                    {/* Phone */}
                    <div>
                      <label
                        className={`text-xs font-medium ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        {t("phone")} *
                      </label>
                      <div className="relative group mt-1">
                        <Phone
                          className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${
                            isDarkMode ? "text-gray-500" : "text-gray-400"
                          } group-focus-within:text-orange-500`}
                        />
                        <input
                          type="tel"
                          value={address.phoneNumber}
                          onChange={(e) => handlePhoneChange(e.target.value)}
                          placeholder="(5__) ___ __ __"
                          className={`w-full pl-10 pr-3 py-2.5 rounded-xl text-sm border transition-colors ${
                            errors.phoneNumber
                              ? "border-red-500 focus:border-red-500"
                              : isDarkMode
                                ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-orange-500"
                                : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
                          } outline-none`}
                        />
                      </div>
                      <p
                        className={`mt-0.5 text-[10px] ${
                          isDarkMode ? "text-gray-600" : "text-gray-400"
                        }`}
                      >
                        {t("phoneFormatHint")}
                      </p>
                      {errors.phoneNumber && (
                        <p className="mt-0.5 text-xs text-red-500 flex items-center gap-1">
                          <X className="w-3 h-3" />
                          {errors.phoneNumber}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ── Location Picker ─────────────────────────── */}
                  <div>
                    <label
                      className={`text-xs font-medium ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      {t("preciseLocation")} *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!mapsLoaded) return;
                        setShowMapModal(true);
                      }}
                      disabled={!mapsLoaded}
                      className={`w-full mt-1 p-3 rounded-xl border text-left flex items-center justify-between transition-all group ${
                        errors.location
                          ? "border-red-500"
                          : isDarkMode
                            ? "border-gray-700 bg-gray-800 hover:bg-gray-700/60"
                            : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                      } ${!mapsLoaded ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-lg transition-all ${
                            address.location
                              ? "bg-green-500/20"
                              : isDarkMode
                                ? "bg-orange-500/20"
                                : "bg-orange-50"
                          } group-hover:scale-105`}
                        >
                          {address.location ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          ) : (
                            <MapIcon className="w-5 h-5 text-orange-500" />
                          )}
                        </div>
                        <div>
                          <p
                            className={`text-sm font-medium ${
                              isDarkMode ? "text-white" : "text-gray-900"
                            }`}
                          >
                            {address.location
                              ? t("locationPinned")
                              : !mapsLoaded
                                ? t("loadingMaps")
                                : t("pinYourExactLocation")}
                          </p>
                          {address.location ? (
                            <p
                              className={`text-xs mt-0.5 font-mono ${
                                isDarkMode ? "text-gray-500" : "text-gray-400"
                              }`}
                            >
                              {address.location.latitude.toFixed(4)},{" "}
                              {address.location.longitude.toFixed(4)}
                            </p>
                          ) : (
                            <p
                              className={`text-xs mt-0.5 ${
                                isDarkMode ? "text-gray-500" : "text-gray-400"
                              }`}
                            >
                              {t("helpFindYouPrecisely")}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        } group-hover:text-orange-500`}
                      />
                    </button>
                    {errors.location && (
                      <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                        <X className="w-3 h-3" />
                        {errors.location}
                      </p>
                    )}
                  </div>

                  {/* ── Save Address Checkbox ───────────────────── */}
                  {selectedAddressId === null && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={saveAddress}
                        onChange={(e) => setSaveAddress(e.target.checked)}
                        className="w-4 h-4 rounded accent-orange-500"
                      />
                      <span
                        className={`text-xs font-medium ${
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {t("saveAddressForFuture")}
                      </span>
                    </label>
                  )}
                </div>
              </div>
            </Section>
          )}

          {/* ── Phone for Pickup ─────────────────────────────────── */}
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
                <div className="relative group mt-1">
                  <Phone
                    className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    } group-focus-within:text-orange-500`}
                  />
                  <input
                    type="tel"
                    value={address.phoneNumber}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="(5__) ___ __ __"
                    className={`w-full pl-10 pr-3 py-2.5 rounded-xl text-sm border transition-colors ${
                      errors.phoneNumber
                        ? "border-red-500 focus:border-red-500"
                        : isDarkMode
                          ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-orange-500"
                          : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
                    } outline-none`}
                  />
                </div>
                <p
                  className={`mt-0.5 text-[10px] ${
                    isDarkMode ? "text-gray-600" : "text-gray-400"
                  }`}
                >
                  {t("phoneFormatHint")}
                </p>
                {errors.phoneNumber && (
                  <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                    <X className="w-3 h-3" />
                    {errors.phoneNumber}
                  </p>
                )}
              </div>
            </Section>
          )}

          {/* ── Order Notes ──────────────────────────────────────── */}
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

          {/* ── Payment Method ───────────────────────────────────── */}
          <Section title={t("paymentMethod")} isDarkMode={isDarkMode}>
            <div className="space-y-2">
              {(
                [
                  {
                    id: "pay_at_door" as PaymentMethod,
                    icon: Banknote,
                    label: t("payAtDoor"),
                    desc: t("payAtDoorDesc"),
                  },
                  {
                    id: "card" as PaymentMethod,
                    icon: CreditCard,
                    label: t("creditCard"),
                    desc: t("creditCardDesc"),
                  },
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

      {/* ── Sticky Bottom Bar ────────────────────────────────────── */}
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

      {/* ── Location Picker Modal ────────────────────────────────── */}
      {showMapModal && mapsLoaded && (
        <LocationPickerModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          onLocationSelect={(location) => {
            setAddress((a) => ({ ...a, location }));
            setShowMapModal(false);
            setErrors((prev) => ({ ...prev, location: "" }));
          }}
          initialLocation={address.location}
          isDarkMode={isDarkMode}
          t={(key: string) => t(key) || key}
        />
      )}
    </main>
  );
}

// ============================================================================
// CHECKOUT SKELETON
// ============================================================================

function FoodCheckoutSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  const bg = isDarkMode ? "bg-gray-800" : "bg-gray-200";
  const cardBorder = isDarkMode
    ? "border-gray-700/40"
    : "border-gray-200";

  return (
    <div className="animate-pulse">
      {/* Back link */}
      <div className={`h-4 w-24 rounded ${bg} mb-4`} />

      {/* Title */}
      <div className={`h-7 w-32 rounded-lg ${bg} mb-6`} />

      <div className="space-y-4">
        {/* Restaurant info */}
        <div
          className={`flex items-center gap-3 rounded-2xl px-4 py-3 border ${cardBorder}`}
        >
          <div className={`w-10 h-10 rounded-xl flex-shrink-0 ${bg}`} />
          <div className="flex-1 space-y-1.5">
            <div className={`h-4 w-36 rounded ${bg}`} />
            <div className={`h-3 w-24 rounded ${bg}`} />
          </div>
        </div>

        {/* Order items section */}
        <div className={`rounded-2xl p-4 sm:p-5 border ${cardBorder}`}>
          <div className={`h-3.5 w-24 rounded ${bg} mb-3`} />
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className={`flex gap-3 p-3 rounded-xl ${
                  isDarkMode ? "bg-gray-800/60" : "bg-gray-50"
                }`}
              >
                <div className={`w-16 h-16 rounded-lg flex-shrink-0 ${bg}`} />
                <div className="flex-1 space-y-2">
                  <div className={`h-4 w-3/4 rounded ${bg}`} />
                  <div className={`h-3 w-1/3 rounded ${bg}`} />
                  <div className="flex items-center justify-between">
                    <div className={`h-7 w-24 rounded-lg ${bg}`} />
                    <div className={`h-4 w-16 rounded ${bg}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Delivery type section */}
        <div className={`rounded-2xl p-4 sm:p-5 border ${cardBorder}`}>
          <div className={`h-3.5 w-32 rounded ${bg} mb-3`} />
          <div className="grid grid-cols-2 gap-3">
            <div className={`h-14 rounded-xl ${bg}`} />
            <div className={`h-14 rounded-xl ${bg}`} />
          </div>
        </div>

        {/* Address section */}
        <div className={`rounded-2xl p-4 sm:p-5 border ${cardBorder}`}>
          <div className={`h-3.5 w-36 rounded ${bg} mb-3`} />
          <div className="space-y-3">
            <div className={`h-11 w-full rounded-xl ${bg}`} />
            <div className={`h-11 w-full rounded-xl ${bg}`} />
            <div className="grid grid-cols-2 gap-3">
              <div className={`h-11 rounded-xl ${bg}`} />
              <div className={`h-11 rounded-xl ${bg}`} />
            </div>
          </div>
        </div>

        {/* Payment section */}
        <div className={`rounded-2xl p-4 sm:p-5 border ${cardBorder}`}>
          <div className={`h-3.5 w-28 rounded ${bg} mb-3`} />
          <div className="grid grid-cols-2 gap-3">
            <div className={`h-14 rounded-xl ${bg}`} />
            <div className={`h-14 rounded-xl ${bg}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
