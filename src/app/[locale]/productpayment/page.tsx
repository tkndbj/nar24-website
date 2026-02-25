"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  MapPin,
  ChevronDown,
  X,
  Map as MapIcon,
  Loader2,
  Lock,
  Phone,
  Home,
  Building,
  Shield,
  CheckCircle2,
  Star,
  Package,
  Tag,
  Truck,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/context/UserProvider";
import { useCart } from "@/context/CartProvider";
import { useTranslations } from "next-intl";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import regionsList from "@/constants/regions";
import type { Product } from "@/app/models/Product";

// ✅ Import discount system
import { useDiscountSelection } from "@/context/DiscountSelectionProvider";
import { useCoupon } from "@/context/CouponProvider";
import { CouponProviders } from "@/context/CouponProviders";
import { UserBenefit, BenefitType } from "@/app/models/coupon";

// Types
interface Address {
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

interface SalePreferences {
  discountThreshold?: number;
  bulkDiscountPercentage?: number;
  maxQuantity?: number;
}

interface CartData {
  selectedColor?: string;
  selectedSize?: string;
  attributes?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CartItem {
  productId: string;
  quantity: number;
  price?: number;
  productName?: string;
  currency?: string;
  calculatedUnitPrice?: number;
  calculatedTotal?: number;
  isBundleItem?: boolean;
  sellerName?: string;
  sellerId?: string;
  isShop?: boolean;
  selectedColor?: string;
  selectedSize?: string;
  product?: Product;
  salePreferences?: SalePreferences | null;
  cartData?: CartData;
  selectedAttributes?: Record<string, unknown>;
  [key: string]:
    | string
    | number
    | boolean
    | string[]
    | undefined
    | null
    | Record<string, unknown>
    | Product
    | SalePreferences
    | CartData;
}

interface FormData {
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
  city: string;
  saveAddress: boolean;
  location: { latitude: number; longitude: number } | null;
}

interface PaymentItemPayload {
  productId: string;
  quantity: number;
  [key: string]: string | number | boolean | string[] | undefined;
}

interface PaymentInitResponse {
  success: boolean;
  gatewayUrl: string;
  paymentParams: Record<string, string | number>;
}

// ✅ Checkout discount data from sessionStorage
interface CheckoutDiscountData {
  couponId: string | null;
  couponAmount: number;
  couponCurrency: string;
  couponCode: string | null;
  useFreeShipping: boolean;
  benefitId: string | null;
  timestamp: number;
}

// Load Google Maps script
const loadGoogleMapsScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve();
      return;
    }

    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com"]'
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

// Location Picker Modal Component
const LocationPickerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onLocationSelect: (location: { latitude: number; longitude: number }) => void;
  initialLocation?: { latitude: number; longitude: number } | null;
  isDarkMode: boolean;
  localization: (key: string) => string;
}> = ({
  isOpen,
  onClose,
  onLocationSelect,
  initialLocation,
  isDarkMode,
  localization: l,
}) => {
  const [selectedLocation, setSelectedLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(initialLocation || null);

  const [lastClickTime, setLastClickTime] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(
    null
  );

  useEffect(() => {
    if (!isOpen || !window.google || !mapRef.current) return;

    const initializeMap = async () => {
      try {
        const { AdvancedMarkerElement } = (await google.maps.importLibrary(
          "marker"
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
          styles: isDarkMode
            ? [
                { elementType: "geometry", stylers: [{ color: "#1a202c" }] },
                {
                  elementType: "labels.text.stroke",
                  stylers: [{ color: "#1a202c" }],
                },
                {
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#a0aec0" }],
                },
                {
                  featureType: "water",
                  elementType: "geometry",
                  stylers: [{ color: "#2d3748" }],
                },
              ]
            : [],
        });

        mapInstanceRef.current = map;

        const markerPosition = initialLocation
          ? { lat: initialLocation.latitude, lng: initialLocation.longitude }
          : mapCenter;

        const marker = new AdvancedMarkerElement({
          map: map,
          position: markerPosition,
          title: l("clickToSelectLocation"),
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
        alert(l("mapsLoadError"));
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
  }, [isOpen, initialLocation, isDarkMode, l]);

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
              {l("selectLocation")}
            </h3>
            <p
              className={`text-xs sm:text-sm mt-1 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {l("clickAnywhereOnMap")}
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-all duration-200 ${
              isDarkMode
                ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            }`}
          >
            <X size={20} className="sm:size-6" />
          </button>
        </div>

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
                    {l("locationSelected")}
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
            <span>{l("tapAnywhereToSetLocation")}</span>
          </p>
          <div className="flex space-x-2 sm:space-x-3">
            <button
              onClick={onClose}
              className={`px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-medium transition-all duration-200 text-sm sm:text-base ${
                isDarkMode
                  ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {l("cancel")}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedLocation}
              className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-medium bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg text-sm sm:text-base"
            >
              {l("confirmLocation")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Delivery Option Component
const DeliveryOption: React.FC<{
  id: string;
  title: string;
  description: string;
  price: number;
  selected: boolean;
  onSelect: () => void;
  isDarkMode: boolean;
  icon: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}> = ({
  title,
  description,
  price,
  selected,
  onSelect,
  isDarkMode,
  icon,
  disabled = false,
  disabledReason,
}) => {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`w-full p-4 sm:p-5 rounded-xl border-2 transition-all duration-200 text-left ${
        disabled
          ? isDarkMode
            ? "border-gray-700 bg-gray-800/50 opacity-50 cursor-not-allowed"
            : "border-gray-200 bg-gray-100/50 opacity-50 cursor-not-allowed"
          : selected
          ? isDarkMode
            ? "border-blue-500 bg-blue-500/10 shadow-lg"
            : "border-blue-500 bg-blue-50 shadow-lg"
          : isDarkMode
          ? "border-gray-700 hover:border-gray-600 hover:bg-gray-700/50"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div
            className={`p-2.5 sm:p-3 rounded-xl ${
              selected
                ? "bg-blue-500/20"
                : isDarkMode
                ? "bg-gray-700"
                : "bg-gray-100"
            }`}
          >
            {icon}
          </div>
          <div>
            <p
              className={`text-sm sm:text-base font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {title}
            </p>
            <p
              className={`text-xs sm:text-sm mt-1 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {description}
            </p>
            {disabled && disabledReason && (
              <p className="text-xs text-orange-500 mt-1">{disabledReason}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p
            className={`text-base sm:text-lg font-bold ${
              price === 0
                ? "text-green-500"
                : isDarkMode
                ? "text-white"
                : "text-gray-900"
            }`}
          >
            {price === 0 ? "Ücretsiz" : `${price.toFixed(2)} TL`}
          </p>
        </div>
      </div>
    </button>
  );
};

// Main Payment Page Component
export default function ProductPaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: userLoading } = useUser();
  const {
    cartItems: firebaseCartItems,
    isInitialized: cartInitialized,
    isLoading: cartLoading,
    initializeCartIfNeeded,
    calculateCartTotals,
  } = useCart();
  const t = useTranslations("ProductPayment");

  // ✅ Discount system hooks
  const { clearAllSelections } = useDiscountSelection();
  const { activeFreeShippingBenefits } = useCoupon();

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(true);
  const [totalPrice, setTotalPrice] = useState(0);
  const [agreesToContract, setAgreesToContract] = useState(false);
  const [selectedDeliveryOption, setSelectedDeliveryOption] =
    useState<string>("normal");

  // ✅ Discount state (matching Flutter's ProductPaymentProvider)
  const [appliedCoupon, setAppliedCoupon] = useState<{
    id: string;
    amount: number;
    currency: string;
    code: string | null;
  } | null>(null);
  const [useFreeShipping, setUseFreeShipping] = useState(false);
  const [selectedBenefitId, setSelectedBenefitId] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [freeShippingBenefit, setFreeShippingBenefit] = useState<UserBenefit | null>(null);

  // Delivery settings from Firestore
  const [deliverySettings, setDeliverySettings] = useState<{
    normal: { price: number; freeThreshold: number; estimatedDays: string };
    express: { price: number; freeThreshold: number; estimatedDays: string };
  } | null>(null);
  const [, setIsLoadingDeliverySettings] = useState(true);

  const [formData, setFormData] = useState<FormData>({
    addressLine1: "",
    addressLine2: "",
    phoneNumber: "",
    city: "",
    saveAddress: false,
    location: null,
  });

  const [isAddressExpanded, setIsAddressExpanded] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null
  );

  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // ============================================================================
// Phone number formatting utilities (matching Flutter implementation)
// Format: (5XX) XXX XX XX for Turkish phone numbers
// ============================================================================

const formatPhoneNumber = (value: string): string => {
  const digitsOnly = value.replace(/\D/g, '');
  const limited = digitsOnly.slice(0, 10);
  
  let formatted = '';
  for (let i = 0; i < limited.length; i++) {
    if (i === 0) formatted += '(';
    formatted += limited[i];
    if (i === 2) formatted += ') ';
    if (i === 5) formatted += ' ';
    if (i === 7) formatted += ' ';
  }
  
  return formatted;
};

const formatPhoneForDisplay = (phone: string): string => {
  if (!phone) return '';
  const digitsOnly = phone.replace(/\D/g, '');
  const digits = digitsOnly.startsWith('0') ? digitsOnly.slice(1) : digitsOnly;
  if (digits.length !== 10) return phone;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
};

const isValidPhoneNumber = (phone: string): boolean => {
  const digitsOnly = phone.replace(/\D/g, '');
  return digitsOnly.length === 10 && digitsOnly.startsWith('5');
};

  // ========================================================================
  // DISCOUNT CALCULATIONS (matching Flutter's ProductPaymentProvider)
  // ========================================================================

  // ✅ Calculate coupon discount (matching Flutter's _calculateCouponDiscount)
  const calculateCouponDiscount = useCallback(
    (coupon: { amount: number } | null, cartTotal: number): number => {
      if (!coupon) return 0;
      // Cap discount at cart total (can't go negative)
      return coupon.amount > cartTotal ? cartTotal : coupon.amount;
    },
    []
  );

  // ✅ Find free shipping benefit (matching Flutter's _findFreeShippingBenefit)
  const findFreeShippingBenefit = useCallback(
    (benefitId: string | null, benefits: UserBenefit[]): UserBenefit | null => {
      if (!useFreeShipping) return null;

      // Use specific benefit ID if provided
      if (benefitId) {
        const specificBenefit = benefits.find(
          (b) => b.id === benefitId && b.isValid
        );
        if (specificBenefit) return specificBenefit;
      }

      // Fallback to first available
      return (
        benefits.find(
          (b) => b.isValid && b.type === BenefitType.FreeShipping
        ) || null
      );
    },
    [useFreeShipping]
  );

  // ✅ Get delivery price (matching Flutter's getDeliveryPrice)
  const getDeliveryPrice = useCallback((): number => {
    const normalPrice = deliverySettings?.normal.price ?? 150;
    const normalThreshold = deliverySettings?.normal.freeThreshold ?? 2000;
    const expressPrice = deliverySettings?.express.price ?? 350;
    const expressThreshold = deliverySettings?.express.freeThreshold ?? 10000;

    switch (selectedDeliveryOption) {
      case "normal":
        return totalPrice >= normalThreshold ? 0 : normalPrice;
      case "express":
        return totalPrice >= expressThreshold ? 0 : expressPrice;
      case "pickup":
        return 0;
      default:
        return 0;
    }
  }, [selectedDeliveryOption, totalPrice, deliverySettings]);

  // ✅ Get effective delivery price (matching Flutter's getEffectiveDeliveryPrice)
  const getEffectiveDeliveryPrice = useCallback((): number => {
    if (useFreeShipping && freeShippingBenefit) {
      return 0;
    }
    return getDeliveryPrice();
  }, [useFreeShipping, freeShippingBenefit, getDeliveryPrice]);

  // ✅ Calculate final total (matching Flutter's finalTotal getter)
  const finalTotal = totalPrice - couponDiscount + getEffectiveDeliveryPrice();

  // ✅ Check if express is available (matching Flutter's isExpressAvailable)
  const isExpressAvailable = !useFreeShipping;

  // ========================================================================
  // EFFECTS
  // ========================================================================

  // Fetch delivery settings
  useEffect(() => {
    const fetchDeliverySettings = async () => {
      try {
        const { doc, getDoc } = await import("firebase/firestore");
        const docSnap = await getDoc(doc(db, "settings", "delivery"));

        if (docSnap.exists()) {
          const data = docSnap.data();
          setDeliverySettings({
            normal: {
              price: data.normal?.price ?? 150,
              freeThreshold: data.normal?.freeThreshold ?? 2000,
              estimatedDays: data.normal?.estimatedDays ?? "3-5",
            },
            express: {
              price: data.express?.price ?? 350,
              freeThreshold: data.express?.freeThreshold ?? 10000,
              estimatedDays: data.express?.estimatedDays ?? "1-2",
            },
          });
        }
      } catch (error) {
        console.error("Error fetching delivery settings:", error);
      } finally {
        setIsLoadingDeliverySettings(false);
      }
    };

    fetchDeliverySettings();
  }, []);

  // Dark mode detection
  useEffect(() => {
    if (typeof window === "undefined") return;

    const detectDarkMode = () => {
      const htmlElement = document.documentElement;
      const darkModeMediaQuery = window.matchMedia(
        "(prefers-color-scheme: dark)"
      );

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

  // Load Google Maps
  useEffect(() => {
    if (typeof window !== "undefined") {
      loadGoogleMapsScript()
        .then(() => setMapsLoaded(true))
        .catch((err) => console.error("Failed to load Google Maps:", err));
    }
  }, []);

  // Initialize cart when user is available
  useEffect(() => {
    if (user && !cartInitialized && !cartLoading) {
      initializeCartIfNeeded();
    }
  }, [user, cartInitialized, cartLoading, initializeCartIfNeeded]);

  // ✅ Load discount data from sessionStorage and find benefit
  useEffect(() => {
    if (useFreeShipping && activeFreeShippingBenefits.length > 0) {
      const benefit = findFreeShippingBenefit(
        selectedBenefitId,
        activeFreeShippingBenefits
      );
      setFreeShippingBenefit(benefit);
    }
  }, [
    useFreeShipping,
    selectedBenefitId,
    activeFreeShippingBenefits,
    findFreeShippingBenefit,
  ]);

  // ✅ Recalculate coupon discount when total changes
  useEffect(() => {
    if (appliedCoupon) {
      const discount = calculateCouponDiscount(appliedCoupon, totalPrice);
      setCouponDiscount(discount);
    } else {
      setCouponDiscount(0);
    }
  }, [appliedCoupon, totalPrice, calculateCouponDiscount]);

  // ✅ Force normal delivery when free shipping is used (matching Flutter)
  useEffect(() => {
    if (useFreeShipping && selectedDeliveryOption === "express") {
      setSelectedDeliveryOption("normal");
    }
  }, [useFreeShipping, selectedDeliveryOption]);

  // Handle checkout data initialization
  useEffect(() => {
    const buyNowData = searchParams.get("buyNowData");

    // CASE 1: Buy Now - Single Product Purchase
    if (buyNowData) {
      try {
        console.log("🛒 Buy Now Mode - Decoding buyNowData...");
        const decodedItem = JSON.parse(decodeURIComponent(buyNowData));
        console.log("✅ Decoded Buy Now Item:", decodedItem);

        const itemWithCalculatedPrices = {
          ...decodedItem,
          calculatedUnitPrice: decodedItem.unitPrice,
          calculatedTotal: decodedItem.unitPrice * decodedItem.quantity,
          price: decodedItem.unitPrice,
        };

        setCartItems([itemWithCalculatedPrices]);
        const itemTotal = decodedItem.unitPrice * decodedItem.quantity;
        setTotalPrice(itemTotal);
        setIsLoadingCheckout(false);

        // ✅ Load discount data from sessionStorage for Buy Now
        loadDiscountData();

        console.log("💰 Buy Now Total:", itemTotal);
        return;
      } catch (error) {
        console.error("❌ Failed to parse buyNowData:", error);
        alert("Invalid buy now data. Redirecting to cart...");
        router.push("/cart");
        return;
      }
    }

    // CASE 2: Regular Cart Checkout
    if (!cartInitialized || cartLoading) {
      return;
    }

    const loadCheckoutFromFirebase = async () => {
      if (typeof window === "undefined") return;

      const checkoutDataStr = sessionStorage.getItem("checkoutSelectedIds");
      if (!checkoutDataStr) {
        console.warn("⚠️ No checkout session found. Redirecting to cart...");
        router.push("/cart");
        return;
      }

      try {
        console.log("🛒 Cart Checkout Mode - Fetching from Firebase...");
        const checkoutData = JSON.parse(checkoutDataStr);

        const isStale = Date.now() - checkoutData.timestamp > 30 * 60 * 1000;
        if (isStale) {
          console.warn("⚠️ Checkout session expired, clearing...");
          sessionStorage.removeItem("checkoutSelectedIds");
          sessionStorage.removeItem("checkoutDiscounts");
          router.push("/cart");
          return;
        }

        const selectedIds: string[] = checkoutData.selectedIds;
        console.log("📋 Selected product IDs:", selectedIds);

        if (!selectedIds || selectedIds.length === 0) {
          console.error("❌ No selected items in checkout session!");
          sessionStorage.removeItem("checkoutSelectedIds");
          sessionStorage.removeItem("checkoutDiscounts");
          router.push("/cart");
          return;
        }

        const selectedCartItems = firebaseCartItems.filter((item) =>
          selectedIds.includes(item.productId)
        );

        if (selectedCartItems.length === 0) {
          console.error("❌ Selected items not found in cart!");
          sessionStorage.removeItem("checkoutSelectedIds");
          sessionStorage.removeItem("checkoutDiscounts");
          router.push("/cart");
          return;
        }

        console.log("📦 Cart items from Firebase:", selectedCartItems);

        // Calculate fresh totals
        console.log("💰 Calculating fresh totals from server...");
        const freshTotals = await calculateCartTotals(selectedIds);
        console.log("💰 Server totals:", freshTotals);

        const pricingMap = new Map<
          string,
          { unitPrice: number; total: number; isBundleItem?: boolean }
        >();
        freshTotals.items.forEach((itemTotal) => {
          pricingMap.set(itemTotal.productId, {
            unitPrice: itemTotal.unitPrice,
            total: itemTotal.total,
            isBundleItem: itemTotal.isBundleItem,
          });
        });

        const itemsWithPricing: CartItem[] = selectedCartItems.map((item) => {
          const pricing = pricingMap.get(item.productId);
          return {
            productId: item.productId,
            quantity: item.quantity,
            productName: item.product?.productName,
            currency: item.product?.currency || "TL",
            calculatedUnitPrice:
              pricing?.unitPrice || item.product?.price || 0,
            calculatedTotal:
              pricing?.total || (item.product?.price || 0) * item.quantity,
            isBundleItem: pricing?.isBundleItem || false,
            sellerName: item.sellerName,
            sellerId: item.sellerId,
            isShop: item.isShop,
            selectedColor: item.cartData?.selectedColor,
            selectedSize: item.cartData?.selectedSize,
            product: item.product ?? undefined,
            salePreferences: item.salePreferences,
            cartData: item.cartData,
          };
        });

        console.log(
          "✅ Items with server-calculated pricing:",
          itemsWithPricing
        );

        setCartItems(itemsWithPricing);
        setTotalPrice(freshTotals.total);

        // ✅ Load discount data from sessionStorage
        loadDiscountData();

        setIsLoadingCheckout(false);
        sessionStorage.removeItem("checkoutSelectedIds");
      } catch (error) {
        console.error("❌ Error loading checkout from Firebase:", error);
        sessionStorage.removeItem("checkoutSelectedIds");
        sessionStorage.removeItem("checkoutDiscounts");
        alert("Failed to load checkout data. Please try again.");
        router.push("/cart");
      }
    };

    loadCheckoutFromFirebase();
  }, [
    searchParams,
    router,
    cartInitialized,
    cartLoading,
    firebaseCartItems,
    calculateCartTotals,
  ]);

  // ✅ Load discount data from sessionStorage (matching Flutter's passing from CartScreen)
  const loadDiscountData = () => {
    if (typeof window === "undefined") return;

    const discountDataStr = sessionStorage.getItem("checkoutDiscounts");
    if (!discountDataStr) {
      console.log("📝 No discount data in session");
      return;
    }

    try {
      const discountData: CheckoutDiscountData = JSON.parse(discountDataStr);
      console.log("🎫 Loaded discount data:", discountData);

      // Check if discount data is not stale (within 1 hour)
      const isStale = Date.now() - discountData.timestamp > 60 * 60 * 1000;
      if (isStale) {
        console.warn("⚠️ Discount data expired, clearing...");
        sessionStorage.removeItem("checkoutDiscounts");
        return;
      }

      // Set coupon if present
      if (discountData.couponId && discountData.couponAmount > 0) {
        setAppliedCoupon({
          id: discountData.couponId,
          amount: discountData.couponAmount,
          currency: discountData.couponCurrency || "TL",
          code: discountData.couponCode,
        });
        console.log("✅ Applied coupon:", discountData.couponId);
      }

      // Set free shipping
      if (discountData.useFreeShipping) {
        setUseFreeShipping(true);
        setSelectedBenefitId(discountData.benefitId);
        console.log("✅ Free shipping enabled, benefit:", discountData.benefitId);
      }
    } catch (error) {
      console.error("❌ Failed to parse discount data:", error);
      sessionStorage.removeItem("checkoutDiscounts");
    }
  };

  // Load saved addresses
  useEffect(() => {
    if (user) {
      loadSavedAddresses();
    }
  }, [user]);

  const loadSavedAddresses = async () => {
    if (!user) return;

    try {
      const addressesRef = collection(db, "users", user.uid, "addresses");
      const snapshot = await getDocs(addressesRef);

      const addresses: Address[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Address[];

      setSavedAddresses(addresses);
    } catch (error) {
      console.error("Error loading addresses:", error);
    }
  };

  const handleInputChange = (
    field: keyof FormData,
    value: string | boolean | { latitude: number; longitude: number } | null
  ) => {
    if (field === 'phoneNumber' && typeof value === 'string') {
      // Apply phone number formatting (matching Flutter's _PhoneNumberFormatter)
      const formattedPhone = formatPhoneNumber(value);
      setFormData((prev) => ({ ...prev, [field]: formattedPhone }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const handleAddressSelect = (addressId: string | null) => {
    setSelectedAddressId(addressId);
  
    if (addressId) {
      const address = savedAddresses.find((a) => a.id === addressId);
      if (address) {
        setFormData((prev) => ({
          ...prev,
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2,
          // Convert stored "05XXXXXXXXX" to display format "(5XX) XXX XX XX"
          phoneNumber: formatPhoneForDisplay(address.phoneNumber),
          city: address.city,
          location: address.location || null,
        }));
      }
    
    } else {
      setFormData((prev) => ({
        ...prev,
        addressLine1: "",
        addressLine2: "",
        phoneNumber: "",
        city: "",
        location: null,
      }));
    }
  };

  // ✅ Handle delivery option change (matching Flutter's setDeliveryOption)
  const handleDeliveryOptionChange = (option: string) => {
    // Prevent express selection when free shipping is active
    if (useFreeShipping && option === "express") {
      return;
    }
    setSelectedDeliveryOption(option);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
  
    if (!formData.addressLine1.trim()) {
      newErrors.addressLine1 = t("fieldRequired");
    }
    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = t("fieldRequired");
    } else if (!isValidPhoneNumber(formData.phoneNumber)) {
      newErrors.phoneNumber = t("invalidPhoneNumber") || "Please enter a valid phone number starting with 5";
    }
    if (!formData.city.trim()) {
      newErrors.city = t("fieldRequired");
    }
    if (!formData.location) {
      newErrors.location = t("pinLocationRequired");
    }

    if (!agreesToContract) {
      newErrors.contract = t("mustAgreeToContract");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ✅ Handle payment submission (matching Flutter's confirmPayment)
  const handleSubmit = async () => {
    if (!user) {
      alert(t("pleaseLogin"));
      return;
    }

    if (!validateForm()) {
      return;
    }

    setIsProcessing(true);

    try {
      // Prepare items payload - exactly like Flutter
      const itemsPayload: PaymentItemPayload[] = cartItems.map((item) => {
        const payload: Record<string, unknown> = {
          productId: item.productId,
          quantity: item.quantity,
        };

        // Extract dynamic attributes from selectedAttributes map
        if (
          item.selectedAttributes &&
          typeof item.selectedAttributes === "object"
        ) {
          const attrs = item.selectedAttributes as Record<string, unknown>;
          Object.entries(attrs).forEach(([key, value]) => {
            if (
              value != null &&
              value !== "" &&
              (!Array.isArray(value) || value.length > 0)
            ) {
              payload[key] = value as string | number | boolean | string[];
            }
          });
        }

        return payload as PaymentItemPayload;
      });

      const orderNumber = `ORDER-${Date.now()}`;

      const customerName = user.displayName || user.email || "Customer";
      const customerEmail = user.email || "";

      // Normalize phone number (matching Flutter)
      const normalizedPhone = `0${formData.phoneNumber.replace(/\D/g, "")}`;

      // ✅ Prepare cart data with discount info (matching Flutter's cartData)
      const cartData = {
        items: itemsPayload,
        cartCalculatedTotal: totalPrice,
        deliveryOption: selectedDeliveryOption,
        deliveryPrice: getEffectiveDeliveryPrice(), // ✅ Use effective price
        address: {
          addressLine1: formData.addressLine1,
          addressLine2: formData.addressLine2,
          city: formData.city,
          phoneNumber: normalizedPhone,
          location: {
            latitude: formData.location!.latitude,
            longitude: formData.location!.longitude,
          },
        },
        paymentMethod: "Card",
        saveAddress: formData.saveAddress,
        // ✅ Add discount data (matching Flutter)
        couponId: appliedCoupon?.id ?? null,
        freeShippingBenefitId: useFreeShipping ? freeShippingBenefit?.id ?? selectedBenefitId : null,
        clientDeliveryPrice: getDeliveryPrice(), // Original delivery price before free shipping
      };

      console.log("🔍 Initializing İşbank payment with:", {
        amount: finalTotal, // ✅ Use finalTotal (after discounts)
        orderNumber,
        customerName,
        customerEmail,
        cartData,
      });

      // Initialize İşbank payment
      const initPayment = httpsCallable(functions, "initializeIsbankPayment");
      const initResponse = await initPayment({
        amount: finalTotal, // ✅ Use finalTotal (matching Flutter)
        orderNumber,
        customerName,
        customerEmail,
        customerPhone: formData.phoneNumber,
        cartData,
      });

      const initData = initResponse.data as PaymentInitResponse;

      if (initData?.success !== true) {
        throw new Error("Payment initialization failed");
      }

      console.log("✅ Payment initialized, redirecting to İşbank...");

      // ✅ Clear discount session data (will clear local storage after successful payment)
      sessionStorage.removeItem("checkoutDiscounts");

      const searchParamsString =
        `?gatewayUrl=${encodeURIComponent(initData.gatewayUrl)}` +
        `&orderNumber=${encodeURIComponent(orderNumber)}` +
        `&paymentParams=${encodeURIComponent(
          JSON.stringify(initData.paymentParams)
        )}`;

      const targetPath = `/isbankpayment${searchParamsString}`;
      console.log("Navigating to:", targetPath);
      router.push(targetPath);
    } catch (error: unknown) {
      console.error("Payment error:", error);

      // ✅ Handle specific coupon/benefit errors (matching Flutter)
      if (error instanceof Error) {
        const errorMessage = error.message;

        // Check for coupon errors
        if (
          errorMessage.includes("Coupon has already been used") ||
          errorMessage.includes("Coupon has expired") ||
          errorMessage.includes("Coupon not found")
        ) {
          // Clear invalid coupon
          setAppliedCoupon(null);
          setCouponDiscount(0);
          clearAllSelections(); // Clear from local storage too

          const displayError = errorMessage.includes("already been used")
            ? t("couponAlreadyUsed") || "This coupon has already been used"
            : errorMessage.includes("expired")
            ? t("couponExpired") || "This coupon has expired"
            : t("couponNotFound") || "Coupon not found";

          alert(displayError);
          setIsProcessing(false);
          return;
        }

        // Check for free shipping errors
        if (
          errorMessage.includes("Free shipping has already been used") ||
          errorMessage.includes("Free shipping benefit has expired")
        ) {
          // Clear invalid free shipping
          setUseFreeShipping(false);
          setFreeShippingBenefit(null);
          setSelectedBenefitId(null);
          clearAllSelections(); // Clear from local storage too

          const displayError = errorMessage.includes("already been used")
            ? t("freeShippingAlreadyUsed") ||
              "This free shipping benefit has already been used"
            : t("freeShippingExpired") ||
              "This free shipping benefit has expired";

          alert(displayError);
          setIsProcessing(false);
          return;
        }

        alert(errorMessage);
      } else {
        alert(t("paymentFailed") || "Payment failed. Please try again.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  if (userLoading || isLoadingCheckout || cartItems.length === 0) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode
            ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
            : "bg-gradient-to-br from-blue-50 via-white to-purple-50"
        }`}
      >
        <div className="flex flex-col items-center space-y-4 sm:space-y-6">
          <div className="relative">
            <div className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-blue-200 rounded-full animate-pulse"></div>
            <Loader2
              size={32}
              className="sm:size-10 absolute inset-0 m-auto animate-spin text-blue-500"
            />
          </div>
          <div className="text-center">
            <h3
              className={`text-lg sm:text-xl font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("loadingPayment")}
            </h3>
            <p
              className={`text-xs sm:text-sm mt-1 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {t("preparingCheckout")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const currency = cartItems[0]?.currency || "TL";

  return (
    <CouponProviders user={user} db={db}>
    <div
      className={`min-h-screen ${
        isDarkMode
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
          : "bg-gradient-to-br from-blue-50 via-white to-purple-50"
      }`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 border-b backdrop-blur-xl ${
          isDarkMode
            ? "bg-gray-900/80 border-gray-700/50"
            : "bg-white/80 border-gray-200/50"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <button
                onClick={() => router.back()}
                className={`p-2 sm:p-2.5 rounded-xl transition-all duration-200 ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                    : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                }`}
              >
                <ArrowLeft size={18} className="sm:size-5" />
              </button>
              <div>
                <h1
                  className={`text-lg sm:text-2xl font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("secureCheckout")}
                </h1>
                <p
                  className={`text-xs sm:text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("completeOrderSecurely")}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm">
              <Shield size={14} className="sm:size-4 text-green-500" />
              <span
                className={`font-medium ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                {t("sslSecured")}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8">
          {/* Left Column - Forms */}
          <div className="lg:col-span-3 space-y-6 sm:space-y-8">
            {/* Delivery Options Section */}
            <div
              className={`rounded-2xl shadow-lg border backdrop-blur-sm p-6 sm:p-8 ${
                isDarkMode
                  ? "bg-gray-800/80 border-gray-700/50"
                  : "bg-white/80 border-gray-200/50"
              }`}
            >
              <div className="flex items-center space-x-3 sm:space-x-4 mb-6">
                <div className="p-3 rounded-xl bg-purple-500/20">
                  <Package size={20} className="sm:size-6 text-purple-500" />
                </div>
                <div>
                  <h2
                    className={`text-lg sm:text-xl font-bold ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("deliveryOption")}
                  </h2>
                  <p
                    className={`text-xs sm:text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {t("selectDeliveryMethod")}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <DeliveryOption
                  id="normal"
                  title={t("standardDelivery")}
                  description={`${
                    deliverySettings?.normal.estimatedDays ?? "3-5"
                  } ${t("days")}`}
                  price={
                    // ✅ Show 0 if free shipping benefit is applied
                    useFreeShipping && freeShippingBenefit
                      ? 0
                      : totalPrice >=
                        (deliverySettings?.normal.freeThreshold ?? 2000)
                      ? 0
                      : deliverySettings?.normal.price ?? 150
                  }
                  selected={selectedDeliveryOption === "normal"}
                  onSelect={() => handleDeliveryOptionChange("normal")}
                  isDarkMode={isDarkMode}
                  icon={<Package size={20} className="text-blue-500" />}
                />
                <DeliveryOption
                  id="express"
                  title={t("expressDelivery")}
                  description={`${
                    deliverySettings?.express.estimatedDays ?? "1-2"
                  } ${t("days")}`}
                  price={
                    totalPrice >=
                    (deliverySettings?.express.freeThreshold ?? 10000)
                      ? 0
                      : deliverySettings?.express.price ?? 350
                  }
                  selected={selectedDeliveryOption === "express"}
                  onSelect={() => handleDeliveryOptionChange("express")}
                  isDarkMode={isDarkMode}
                  icon={<Package size={20} className="text-purple-500" />}
                  // ✅ Disable express when free shipping is used (matching Flutter)
                  disabled={!isExpressAvailable}
                  disabledReason={
                    !isExpressAvailable
                      ? t("expressNotAvailableWithFreeShipping") ||
                        "Express not available with free shipping"
                      : undefined
                  }
                />
              </div>
            </div>

            {/* Address Section */}
            <div
              className={`rounded-2xl shadow-lg border backdrop-blur-sm ${
                isDarkMode
                  ? "bg-gray-800/80 border-gray-700/50"
                  : "bg-white/80 border-gray-200/50"
              }`}
            >
              <button
                onClick={() => setIsAddressExpanded(!isAddressExpanded)}
                className="w-full p-6 sm:p-8 flex items-center justify-between group"
              >
                <div className="flex items-center space-x-3 sm:space-x-5">
                  <div
                    className={`p-3 sm:p-4 rounded-2xl transition-all duration-200 ${
                      isDarkMode ? "bg-blue-500/20" : "bg-blue-50"
                    } group-hover:scale-105`}
                  >
                    <MapPin size={20} className="sm:size-6 text-blue-500" />
                  </div>
                  <div className="text-left">
                    <h2
                      className={`text-lg sm:text-xl font-bold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {t("deliveryAddress")}
                    </h2>
                    <p
                      className={`text-xs sm:text-sm mt-1 ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {t("whereToDeliver")}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  size={18}
                  className={`sm:size-5 transform transition-all duration-200 ${
                    isAddressExpanded ? "rotate-180" : ""
                  } ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  } group-hover:text-blue-500`}
                />
              </button>

              {isAddressExpanded && (
                <div
                  className={`px-6 sm:px-8 pb-6 sm:pb-8 border-t ${
                    isDarkMode ? "border-gray-700/50" : "border-gray-200/50"
                  }`}
                >
                  {/* Saved Addresses */}
                  {savedAddresses.length > 0 && (
                    <div className="mb-6 sm:mb-8 mt-4 sm:mt-6">
                      <h3
                        className={`text-xs sm:text-sm font-semibold mb-3 sm:mb-4 flex items-center space-x-2 ${
                          isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        <Star size={14} className="sm:size-4" />
                        <span>{t("savedAddresses")}</span>
                      </h3>
                      <div className="space-y-2 sm:space-y-3">
                        {savedAddresses.map((address) => (
                          <label
                            key={address.id}
                            className={`flex items-start space-x-3 sm:space-x-4 p-3 sm:p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                              selectedAddressId === address.id
                                ? isDarkMode
                                  ? "border-blue-500 bg-blue-500/10 shadow-lg"
                                  : "border-blue-500 bg-blue-50 shadow-lg"
                                : isDarkMode
                                ? "border-gray-700 hover:border-gray-600 hover:bg-gray-700/50"
                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            <input
                              type="radio"
                              name="address"
                              value={address.id}
                              checked={selectedAddressId === address.id}
                              onChange={() => handleAddressSelect(address.id)}
                              className="mt-1 sm:mt-1.5 text-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-sm sm:text-base font-semibold ${
                                  isDarkMode ? "text-white" : "text-gray-900"
                                }`}
                              >
                                {address.addressLine1}
                              </p>
                              <p
                                className={`text-xs sm:text-sm mt-1 ${
                                  isDarkMode ? "text-gray-400" : "text-gray-600"
                                }`}
                              >
                                {[address.addressLine2, address.city]
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                              <p
                                className={`text-xs sm:text-sm ${
                                  isDarkMode ? "text-gray-400" : "text-gray-600"
                                }`}
                              >
                                {address.phoneNumber}
                              </p>
                            </div>
                          </label>
                        ))}

                        <label
                          className={`flex items-center space-x-3 sm:space-x-4 p-3 sm:p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                            selectedAddressId === null
                              ? isDarkMode
                                ? "border-blue-500 bg-blue-500/10 shadow-lg"
                                : "border-blue-500 bg-blue-50 shadow-lg"
                              : isDarkMode
                              ? "border-gray-700 hover:border-gray-600 hover:bg-gray-700/50"
                              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="address"
                            value=""
                            checked={selectedAddressId === null}
                            onChange={() => handleAddressSelect(null)}
                            className="text-blue-500"
                          />
                          <span
                            className={`text-sm sm:text-base font-semibold ${
                              isDarkMode ? "text-white" : "text-gray-900"
                            }`}
                          >
                            {t("enterNewAddress")}
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Address Form Fields */}
                  <div className="space-y-4 sm:space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      <div>
                        <label
                          className={`block text-xs sm:text-sm font-semibold mb-2 sm:mb-3 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {t("addressLine1")} *
                        </label>
                        <div className="relative group">
                          <Home
                            size={16}
                            className={`sm:size-[18px] absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 transition-colors ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            } group-focus-within:text-blue-500`}
                          />
                          <input
                            type="text"
                            value={formData.addressLine1}
                            onChange={(e) =>
                              handleInputChange("addressLine1", e.target.value)
                            }
                            className={`w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-3 sm:py-4 rounded-xl border transition-all duration-200 text-sm sm:text-base ${
                              errors.addressLine1
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                                : isDarkMode
                                ? "border-gray-600 bg-gray-700/50 text-white focus:border-blue-500 focus:ring-blue-500/20"
                                : "border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500/20"
                            } focus:outline-none focus:ring-4`}
                            placeholder={t("enterStreetAddress")}
                          />
                        </div>
                        {errors.addressLine1 && (
                          <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-red-500 flex items-center space-x-1">
                            <X size={12} className="sm:size-[14px]" />
                            <span>{errors.addressLine1}</span>
                          </p>
                        )}
                      </div>

                      <div>
                        <label
                          className={`block text-xs sm:text-sm font-semibold mb-2 sm:mb-3 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {t("addressLine2")}
                        </label>
                        <div className="relative group">
                          <Building
                            size={16}
                            className={`sm:size-[18px] absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 transition-colors ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            } group-focus-within:text-blue-500`}
                          />
                          <input
                            type="text"
                            value={formData.addressLine2}
                            onChange={(e) =>
                              handleInputChange("addressLine2", e.target.value)
                            }
                            className={`w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-3 sm:py-4 rounded-xl border transition-all duration-200 text-sm sm:text-base ${
                              isDarkMode
                                ? "border-gray-600 bg-gray-700/50 text-white focus:border-blue-500 focus:ring-blue-500/20"
                                : "border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500/20"
                            } focus:outline-none focus:ring-4`}
                            placeholder={t("apartmentSuiteOptional")}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      <div>
                        <label
                          className={`block text-xs sm:text-sm font-semibold mb-2 sm:mb-3 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {t("phoneNumber")} *
                        </label>
                        <div className="relative group">
                          <Phone
                            size={16}
                            className={`sm:size-[18px] absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 transition-colors ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            } group-focus-within:text-blue-500`}
                          />
                          <input
                            type="tel"
                            value={formData.phoneNumber}
                            onChange={(e) =>
                              handleInputChange("phoneNumber", e.target.value)
                            }
                            className={`w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-3 sm:py-4 rounded-xl border transition-all duration-200 text-sm sm:text-base ${
                              errors.phoneNumber
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                                : isDarkMode
                                ? "border-gray-600 bg-gray-700/50 text-white focus:border-blue-500 focus:ring-blue-500/20"
                                : "border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500/20"
                            } focus:outline-none focus:ring-4`}
                            placeholder="(5__) ___ __ __"
                          />
                        </div>
                        {/* Format hint - outside the relative group */}
                        <p className={`mt-1 text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                          {t("phoneFormatHint") || "Format: (5XX) XXX XX XX"}
                        </p>
                        {errors.phoneNumber && (
                          <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-red-500 flex items-center space-x-1">
                            <X size={12} className="sm:size-[14px]" />
                            <span>{errors.phoneNumber}</span>
                          </p>
                        )}
                      </div>

                      <div className="relative">
                        <label
                          className={`block text-xs sm:text-sm font-semibold mb-2 sm:mb-3 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {t("city")} *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowCityDropdown(!showCityDropdown)}
                          className={`w-full px-3 sm:px-4 py-3 sm:py-4 rounded-xl border text-left flex items-center justify-between transition-all duration-200 text-sm sm:text-base ${
                            errors.city
                              ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                              : isDarkMode
                              ? "border-gray-600 bg-gray-700/50 text-white focus:border-blue-500 focus:ring-blue-500/20"
                              : "border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500/20"
                          } focus:outline-none focus:ring-4`}
                        >
                          <span
                            className={
                              formData.city
                                ? isDarkMode
                                  ? "text-white"
                                  : "text-gray-900"
                                : isDarkMode
                                ? "text-gray-500"
                                : "text-gray-500"
                            }
                          >
                            {formData.city || t("selectYourCity")}
                          </span>
                          <ChevronDown
                            size={14}
                            className="sm:size-4 transition-transform duration-200"
                          />
                        </button>

                        {showCityDropdown && (
                          <div
                            className={`absolute top-full left-0 right-0 mt-2 border rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto backdrop-blur-sm ${
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
                                  handleInputChange("city", city);
                                  setShowCityDropdown(false);
                                }}
                                className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 text-left transition-colors text-sm sm:text-base ${
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
                          <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-red-500 flex items-center space-x-1">
                            <X size={12} className="sm:size-[14px]" />
                            <span>{errors.city}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Location Picker */}
                    <div>
                      <label
                        className={`block text-xs sm:text-sm font-semibold mb-2 sm:mb-3 ${
                          isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        {t("preciseLocation")} *
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (!mapsLoaded) {
                            alert(t("mapsStillLoading"));
                            return;
                          }
                          setShowMapModal(true);
                        }}
                        disabled={!mapsLoaded}
                        className={`w-full p-4 sm:p-6 rounded-xl border text-left flex items-center justify-between transition-all duration-200 group ${
                          errors.location
                            ? "border-red-500"
                            : isDarkMode
                            ? "border-gray-600 bg-gray-700/50 hover:bg-gray-600/50"
                            : "border-gray-300 bg-white hover:bg-gray-50"
                        } ${
                          !mapsLoaded ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        <div className="flex items-center space-x-3 sm:space-x-4">
                          <div
                            className={`p-2.5 sm:p-3 rounded-xl transition-all duration-200 ${
                              formData.location
                                ? "bg-green-500/20"
                                : isDarkMode
                                ? "bg-blue-500/20"
                                : "bg-blue-50"
                            } group-hover:scale-105`}
                          >
                            {formData.location ? (
                              <CheckCircle2
                                size={20}
                                className="sm:size-6 text-green-500"
                              />
                            ) : (
                              <MapIcon
                                size={20}
                                className="sm:size-6 text-blue-500"
                              />
                            )}
                          </div>
                          <div>
                            <p
                              className={`text-sm sm:text-base font-semibold ${
                                isDarkMode ? "text-white" : "text-gray-900"
                              }`}
                            >
                              {formData.location
                                ? t("locationPinned")
                                : !mapsLoaded
                                ? t("loadingMaps")
                                : t("pinYourExactLocation")}
                            </p>
                            {formData.location ? (
                              <p
                                className={`text-xs sm:text-sm mt-1 ${
                                  isDarkMode ? "text-gray-400" : "text-gray-600"
                                }`}
                              >
                                {formData.location.latitude.toFixed(4)},{" "}
                                {formData.location.longitude.toFixed(4)}
                              </p>
                            ) : (
                              <p
                                className={`text-xs sm:text-sm mt-1 ${
                                  isDarkMode ? "text-gray-400" : "text-gray-600"
                                }`}
                              >
                                {t("helpFindYouPrecisely")}
                              </p>
                            )}
                          </div>
                        </div>
                        <ChevronDown
                          size={14}
                          className={`sm:size-4 transition-colors ${
                            isDarkMode ? "text-gray-400" : "text-gray-500"
                          } group-hover:text-blue-500`}
                        />
                      </button>
                      {errors.location && (
                        <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-red-500 flex items-center space-x-1">
                          <X size={12} className="sm:size-[14px]" />
                          <span>{errors.location}</span>
                        </p>
                      )}
                    </div>

                    {/* Save Address */}
                    {selectedAddressId === null && (
                      <label className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.saveAddress}
                          onChange={(e) =>
                            handleInputChange("saveAddress", e.target.checked)
                          }
                          className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 rounded focus:ring-blue-500/50"
                        />
                        <span
                          className={`text-xs sm:text-sm font-medium ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {t("saveAddressForFuture")}
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-2">
            <div
              className={`sticky top-32 rounded-2xl shadow-lg border backdrop-blur-sm p-6 sm:p-8 ${
                isDarkMode
                  ? "bg-gray-800/80 border-gray-700/50"
                  : "bg-white/80 border-gray-200/50"
              }`}
            >
              <div className="flex items-center space-x-2.5 sm:space-x-3 mb-5 sm:mb-6">
                <div className="p-2.5 sm:p-3 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20">
                  <Package size={20} className="sm:size-6 text-blue-500" />
                </div>
                <h3
                  className={`text-lg sm:text-xl font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("orderSummary")}
                </h3>
              </div>

              {/* Cart Items */}
              <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
                {cartItems.map((item, index) => (
                  <div
                    key={index}
                    className={`flex items-center space-x-3 sm:space-x-4 p-3 sm:p-4 rounded-xl ${
                      isDarkMode ? "bg-gray-700/30" : "bg-gray-50"
                    }`}
                  >
                    <div
                      className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center ${
                        isDarkMode
                          ? "bg-gradient-to-br from-blue-500/20 to-purple-500/20"
                          : "bg-gradient-to-br from-blue-100 to-purple-100"
                      }`}
                    >
                      <span
                        className={`text-sm sm:text-lg font-bold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {item.quantity}×
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm sm:text-base font-semibold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {item.productName || t("product")}
                      </p>
                      <p
                        className={`text-xs sm:text-sm ${
                          isDarkMode ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {t("unitPrice")}:{" "}
                        {(typeof item.calculatedUnitPrice === "number"
                          ? item.calculatedUnitPrice
                          : typeof item.price === "number"
                          ? item.price
                          : 0
                        ).toFixed(2)}{" "}
                        {item.currency || "TL"}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-base sm:text-lg font-bold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {(typeof item.calculatedTotal === "number"
                          ? item.calculatedTotal
                          : (typeof item.price === "number" ? item.price : 0) *
                            item.quantity
                        ).toFixed(2)}
                      </span>
                      <p
                        className={`text-xs sm:text-sm ${
                          isDarkMode ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {item.currency || "TL"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* ✅ PRICING BREAKDOWN (matching Flutter's bottom section) */}
              <div
                className={`border-t pt-5 sm:pt-6 space-y-3 sm:space-y-4 ${
                  isDarkMode ? "border-gray-700/50" : "border-gray-200/50"
                }`}
              >
                {/* Subtotal */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs sm:text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {t("subtotal")}
                  </span>
                  <span
                    className={`text-sm sm:text-base font-medium ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {totalPrice.toFixed(2)} {currency}
                  </span>
                </div>

                {/* ✅ Coupon Discount Row (matching Flutter) */}
                {appliedCoupon && couponDiscount > 0 && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <Tag size={14} className="text-green-500" />
                      <span className="text-xs sm:text-sm text-green-600 font-medium">
                        {appliedCoupon.code || t("coupon") || "Coupon"}
                      </span>
                    </div>
                    <span className="text-sm sm:text-base font-semibold text-green-600">
                      -{couponDiscount.toFixed(2)} {currency}
                    </span>
                  </div>
                )}

                {/* ✅ Shipping Row (matching Flutter) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Truck
                      size={14}
                      className={
                        useFreeShipping && freeShippingBenefit
                          ? "text-green-500"
                          : isDarkMode
                          ? "text-gray-400"
                          : "text-gray-500"
                      }
                    />
                    <span
                      className={`text-xs sm:text-sm ${
                        useFreeShipping && freeShippingBenefit
                          ? "text-green-600 font-medium"
                          : isDarkMode
                          ? "text-gray-400"
                          : "text-gray-600"
                      }`}
                    >
                      {t("shipping") || "Shipping"}
                    </span>
                  </div>
                  <span
                    className={`text-sm sm:text-base font-medium ${
                      getEffectiveDeliveryPrice() === 0
                        ? "text-green-500 font-semibold"
                        : isDarkMode
                        ? "text-white"
                        : "text-gray-900"
                    }`}
                  >
                    {getEffectiveDeliveryPrice() === 0
                      ? t("free") || "Free"
                      : `${getEffectiveDeliveryPrice().toFixed(2)} ${currency}`}
                  </span>
                </div>

                {/* Divider */}
                <div
                  className={`border-t pt-3 sm:pt-4 ${
                    isDarkMode ? "border-gray-700/50" : "border-gray-200/50"
                  }`}
                >
                  {/* ✅ Final Total (matching Flutter) */}
                  <div className="flex items-center justify-between mb-5 sm:mb-6">
                    <span
                      className={`text-lg sm:text-xl font-bold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {t("total")}
                    </span>
                    <div className="text-right">
                      <span
                        className={`text-2xl sm:text-3xl font-bold ${
                          couponDiscount > 0 ||
                          (useFreeShipping && freeShippingBenefit)
                            ? "text-green-500"
                            : "bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent"
                        }`}
                      >
                        {finalTotal.toFixed(2)}
                      </span>
                      <p
                        className={`text-xs sm:text-sm ${
                          isDarkMode ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {currency}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Contract Agreement */}
                <div
                  className={`p-4 sm:p-5 rounded-xl border mb-5 sm:mb-6 ${
                    isDarkMode
                      ? "bg-gray-700/30 border-gray-600/50"
                      : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <label className="flex items-start space-x-2.5 sm:space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreesToContract}
                      onChange={(e) => setAgreesToContract(e.target.checked)}
                      className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 rounded focus:ring-blue-500/50 mt-0.5"
                    />
                    <span
                      className={`text-xs sm:text-sm leading-relaxed ${
                        isDarkMode ? "text-gray-300" : "text-gray-700"
                      }`}
                    >
                      {t("iAgreeToThe")}{" "}
                      <button
                        type="button"
                        onClick={() =>
                          router.push("/agreements/distance-selling")
                        }
                        className="text-blue-500 hover:text-blue-600 underline font-medium transition-colors"
                      >
                        {t("distanceSellingContract")}
                      </button>
                    </span>
                  </label>
                  {errors.contract && (
                    <p className="mt-2 text-xs text-red-500 flex items-center space-x-1">
                      <X size={12} />
                      <span>{errors.contract}</span>
                    </p>
                  )}
                </div>

                {/* Complete Payment Button */}
                <button
                  onClick={handleSubmit}
                  disabled={isProcessing || !agreesToContract}
                  className="w-full py-4 sm:py-5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white font-bold text-base sm:text-lg rounded-2xl hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center space-x-2.5 sm:space-x-3 shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={20} className="sm:size-6 animate-spin" />
                      <span>{t("processingPayment")}</span>
                    </>
                  ) : (
                    <>
                      <Lock size={20} className="sm:size-6" />
                      <span>{t("proceedToPayment")}</span>
                    </>
                  )}
                </button>

                {/* Security Notice */}
                <div
                  className={`flex items-center justify-center space-x-1.5 sm:space-x-2 text-xs mt-3 sm:mt-4 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  <Shield size={12} className="sm:size-[14px] text-green-500" />
                  <span>{t("protectedBySSL")}</span>
                </div>

                {/* Trust Indicators */}
                <div
                  className={`grid grid-cols-3 gap-1.5 sm:gap-2 mt-3 sm:mt-4 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  <div className="flex items-center justify-center space-x-1 text-xs">
                    <CheckCircle2
                      size={10}
                      className="sm:size-3 text-green-500"
                    />
                    <span>{t("secure")}</span>
                  </div>
                  <div className="flex items-center justify-center space-x-1 text-xs">
                    <CheckCircle2
                      size={10}
                      className="sm:size-3 text-green-500"
                    />
                    <span>{t("fast")}</span>
                  </div>
                  <div className="flex items-center justify-center space-x-1 text-xs">
                    <CheckCircle2
                      size={10}
                      className="sm:size-3 text-green-500"
                    />
                    <span>{t("reliable")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Location Picker Modal */}
      {showMapModal && mapsLoaded && (
        <LocationPickerModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          onLocationSelect={(location) => {
            handleInputChange("location", location);
            setShowMapModal(false);
          }}
          initialLocation={formData.location}
          isDarkMode={isDarkMode}
          localization={(key: string) => t(key) || key}
        />
      )}
    </div>
    </CouponProviders>
  );
}