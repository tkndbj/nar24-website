"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  CreditCard,
  MapPin,
  ChevronDown,
  X,
  Map,
  Loader2,
  Lock,
  Calendar,
  User,
  Phone,
  Home,
  Building,
  Shield,
  CheckCircle2,
  Star,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/context/UserProvider";
import { useTranslations } from "next-intl";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import regionsList from "@/constants/regions";

// Types
interface PaymentMethod {
  id: string;
  cardNumber: string;
  expiryDate: string;
  cardHolderName: string;
}

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

interface CartItem {
  productId: string;
  quantity: number;
  price?: number;
  productName?: string;
  currency?: string;
}

interface FormData {
  // Payment
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  cardHolderName: string;
  savePaymentDetails: boolean;

  // Address
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
  city: string;
  saveAddress: boolean;

  // Location
  location: { latitude: number; longitude: number } | null;
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
          title: l("clickToSelectLocation") || "Click to select location",
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
        alert(
          "Failed to load Google Maps. Please check your API key and configuration."
        );
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
          className={`flex items-center justify-between p-6 border-b ${
            isDarkMode ? "border-gray-700/50" : "border-gray-200/50"
          }`}
        >
          <div>
            <h3
              className={`text-xl font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {l("selectLocation") || "Select Delivery Location"}
            </h3>
            <p
              className={`text-sm mt-1 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Click anywhere on the map to pin your exact location
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
            <X size={24} />
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
              className={`absolute bottom-6 left-6 right-6 p-4 rounded-xl shadow-lg border backdrop-blur-sm ${
                isDarkMode
                  ? "bg-gray-900/90 border-gray-700/50"
                  : "bg-white/90 border-gray-200/50"
              }`}
            >
              <div className="flex items-start space-x-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <CheckCircle2 size={20} className="text-green-500" />
                </div>
                <div>
                  <p
                    className={`text-sm font-semibold mb-1 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    Location Selected
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
          className={`flex items-center justify-between p-6 border-t ${
            isDarkMode ? "border-gray-700/50" : "border-gray-200/50"
          }`}
        >
          <p
            className={`text-sm flex items-center space-x-2 ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            <Map size={16} />
            <span>Tap anywhere on the map to set your delivery location</span>
          </p>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className={`px-6 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                isDarkMode
                  ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedLocation}
              className="px-6 py-2.5 rounded-xl font-medium bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
            >
              Confirm Location
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Payment Page Component
export default function ProductPaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: userLoading } = useUser();
  const localization = useTranslations("ProductPayment");

  // Create translation function similar to CartDrawer
  const t = useCallback(
    (key: string) => {
      try {
        // Now localization is already scoped to ProductPayment
        const translation = localization(key);

        // If translation exists and is different from key, return it
        if (translation && translation !== key) {
          return translation;
        }

        // Return the key as fallback
        return key;
      } catch (error) {
        console.warn(`Translation error for key: ${key}`, error);
        return key;
      }
    },
    [localization]
  );

  // Get cart items from URL params or localStorage
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [totalPrice, setTotalPrice] = useState(0);

  // Form state
  const [formData, setFormData] = useState<FormData>({
    cardNumber: "",
    expiryDate: "",
    cvv: "",
    cardHolderName: "",
    savePaymentDetails: false,
    addressLine1: "",
    addressLine2: "",
    phoneNumber: "",
    city: "",
    saveAddress: false,
    location: null,
  });

  // UI state
  const [isAddressExpanded, setIsAddressExpanded] = useState(true);
  const [isPaymentExpanded, setIsPaymentExpanded] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Saved data
  const [savedPaymentMethods, setSavedPaymentMethods] = useState<
    PaymentMethod[]
  >([]);
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<
    string | null
  >(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null
  );

  // Dropdowns and modals
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Error handling
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load Google Maps
  useEffect(() => {
    if (typeof window !== "undefined") {
      loadGoogleMapsScript()
        .then(() => setMapsLoaded(true))
        .catch((err) => console.error("Failed to load Google Maps:", err));
    }
  }, []);

  // Detect dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Load cart items
  useEffect(() => {
    const itemsParam = searchParams.get("items");
    if (itemsParam) {
      try {
        const items = JSON.parse(decodeURIComponent(itemsParam));
        setCartItems(items);

        // Calculate total price
        const total = items.reduce((sum: number, item: CartItem) => {
          return sum + (item.price || 0) * item.quantity;
        }, 0);
        setTotalPrice(total);
      } catch (error) {
        console.error("Error parsing cart items:", error);
        router.push("/");
      }
    } else {
      // Try localStorage as fallback
      const savedCart = localStorage.getItem("cartItems");
      if (savedCart) {
        try {
          const items = JSON.parse(savedCart);
          setCartItems(items);

          const total = items.reduce((sum: number, item: CartItem) => {
            return sum + (item.price || 0) * item.quantity;
          }, 0);
          setTotalPrice(total);
        } catch (error) {
          console.error("Error parsing saved cart:", error);
          router.push("/");
        }
      } else {
        router.push("/");
      }
    }
  }, [searchParams, router]);

  // Load saved payment methods and addresses
  useEffect(() => {
    if (user) {
      loadSavedPaymentMethods();
      loadSavedAddresses();
    }
  }, [user]);

  const loadSavedPaymentMethods = async () => {
    if (!user) return;

    try {
      const methodsRef = collection(db, "users", user.uid, "paymentMethods");
      const snapshot = await getDocs(methodsRef);

      const methods: PaymentMethod[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as PaymentMethod[];

      setSavedPaymentMethods(methods);
    } catch (error) {
      console.error("Error loading payment methods:", error);
    }
  };

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

  // Form handlers
  const handleInputChange = (
    field: keyof FormData,
    value: string | boolean | { latitude: number; longitude: number } | null
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const handlePaymentMethodSelect = (methodId: string | null) => {
    setSelectedPaymentMethodId(methodId);

    if (methodId) {
      const method = savedPaymentMethods.find((m) => m.id === methodId);
      if (method) {
        setFormData((prev) => ({
          ...prev,
          cardNumber: method.cardNumber,
          expiryDate: method.expiryDate,
          cardHolderName: method.cardHolderName,
          cvv: "", // CVV should not be saved
        }));
      }
    } else {
      setFormData((prev) => ({
        ...prev,
        cardNumber: "",
        expiryDate: "",
        cardHolderName: "",
        cvv: "",
      }));
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
          phoneNumber: address.phoneNumber,
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

  // Validation
  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    // Address validation
    if (!formData.addressLine1.trim()) {
      newErrors.addressLine1 = t("fieldRequired") || "This field is required";
    }
    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = t("fieldRequired") || "This field is required";
    }
    if (!formData.city.trim()) {
      newErrors.city = t("fieldRequired") || "This field is required";
    }
    if (!formData.location) {
      newErrors.location =
        t("pinLocationRequired") || "Please pin your location on the map";
    }

    // Payment validation
    if (!formData.cardNumber.trim()) {
      newErrors.cardNumber = t("fieldRequired") || "This field is required";
    } else if (formData.cardNumber.trim().length < 12) {
      newErrors.cardNumber = t("invalidCardNumber") || "Invalid card number";
    }

    if (!formData.expiryDate.trim()) {
      newErrors.expiryDate = t("fieldRequired") || "This field is required";
    } else if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(formData.expiryDate.trim())) {
      newErrors.expiryDate =
        t("invalidExpiryDate") || "Invalid expiry date (MM/YY)";
    }

    if (!formData.cvv.trim()) {
      newErrors.cvv = t("fieldRequired") || "This field is required";
    } else if (formData.cvv.trim().length < 3) {
      newErrors.cvv = t("invalidCvv") || "Invalid CVV";
    }

    if (!formData.cardHolderName.trim()) {
      newErrors.cardHolderName = t("fieldRequired") || "This field is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit payment
  const handleSubmit = async () => {
    if (!user) {
      alert(t("pleaseLogin") || "Please login to continue");
      return;
    }

    if (!validateForm()) {
      return;
    }

    setIsProcessing(true);

    try {
      const processPurchase = httpsCallable(functions, "processPurchase");

      await processPurchase({
        items: cartItems,
        address: {
          addressLine1: formData.addressLine1,
          addressLine2: formData.addressLine2,
          city: formData.city,
          phoneNumber: formData.phoneNumber,
          location: {
            latitude: formData.location!.latitude,
            longitude: formData.location!.longitude,
          },
        },
        paymentMethod: "Card",
        usePlayPoints: false,
        savePaymentDetails: formData.savePaymentDetails,
        saveAddress: formData.saveAddress,
        savedPaymentMethodId: selectedPaymentMethodId,
        paymentMethodDetails: selectedPaymentMethodId
          ? null
          : {
              cardNumber: formData.cardNumber,
              expiryDate: formData.expiryDate,
              cvv: formData.cvv,
              cardHolderName: formData.cardHolderName,
            },
      });

      // Success
      alert(t("paymentSuccessful") || "Payment successful!");

      // Clear cart and redirect
      localStorage.removeItem("cartItems");
      router.push("/orders");
    } catch (error: unknown) {
      console.error("Payment error:", error);
      alert(
        (error as Error).message ||
          t("paymentFailed") ||
          "Payment failed. Please try again."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Format card number for display
  const formatCardNumber = (cardNumber: string) => {
    return cardNumber.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  // Format expiry date input
  const handleExpiryDateChange = (value: string) => {
    let formattedValue = value.replace(/\D/g, "");
    if (formattedValue.length >= 3) {
      formattedValue =
        formattedValue.substring(0, 2) + "/" + formattedValue.substring(2, 4);
    }
    handleInputChange("expiryDate", formattedValue);
  };

  if (userLoading || cartItems.length === 0) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode
            ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
            : "bg-gradient-to-br from-blue-50 via-white to-purple-50"
        }`}
      >
        <div className="flex flex-col items-center space-y-6">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-blue-200 rounded-full animate-pulse"></div>
            <Loader2
              size={40}
              className="absolute inset-0 m-auto animate-spin text-blue-500"
            />
          </div>
          <div className="text-center">
            <h3
              className={`text-xl font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Loading Payment
            </h3>
            <p
              className={`text-sm mt-1 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Preparing your secure checkout experience...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
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
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.back()}
                className={`p-2.5 rounded-xl transition-all duration-200 ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                    : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                }`}
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1
                  className={`text-2xl font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  Secure Checkout
                </h1>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  Complete your order securely
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-sm">
              <Shield size={16} className="text-green-500" />
              <span
                className={`font-medium ${
                  isDarkMode ? "text-gray-300" : "text-gray-700"
                }`}
              >
                SSL Secured
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left Column - Forms */}
          <div className="lg:col-span-3 space-y-8">
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
                className="w-full p-8 flex items-center justify-between group"
              >
                <div className="flex items-center space-x-5">
                  <div
                    className={`p-4 rounded-2xl transition-all duration-200 ${
                      isDarkMode ? "bg-blue-500/20" : "bg-blue-50"
                    } group-hover:scale-105`}
                  >
                    <MapPin size={24} className="text-blue-500" />
                  </div>
                  <div className="text-left">
                    <h2
                      className={`text-xl font-bold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      Delivery Address
                    </h2>
                    <p
                      className={`text-sm mt-1 ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      Where should we deliver your order?
                    </p>
                  </div>
                </div>
                <ChevronDown
                  size={20}
                  className={`transform transition-all duration-200 ${
                    isAddressExpanded ? "rotate-180" : ""
                  } ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  } group-hover:text-blue-500`}
                />
              </button>

              {isAddressExpanded && (
                <div
                  className={`px-8 pb-8 border-t ${
                    isDarkMode ? "border-gray-700/50" : "border-gray-200/50"
                  }`}
                >
                  {/* Saved Addresses */}
                  {savedAddresses.length > 0 && (
                    <div className="mb-8 mt-6">
                      <h3
                        className={`text-sm font-semibold mb-4 flex items-center space-x-2 ${
                          isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        <Star size={16} />
                        <span>Saved Addresses</span>
                      </h3>
                      <div className="space-y-3">
                        {savedAddresses.map((address) => (
                          <label
                            key={address.id}
                            className={`flex items-start space-x-4 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
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
                              className="mt-1.5 text-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p
                                className={`font-semibold ${
                                  isDarkMode ? "text-white" : "text-gray-900"
                                }`}
                              >
                                {address.addressLine1}
                              </p>
                              <p
                                className={`text-sm mt-1 ${
                                  isDarkMode ? "text-gray-400" : "text-gray-600"
                                }`}
                              >
                                {[address.addressLine2, address.city]
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                              <p
                                className={`text-sm ${
                                  isDarkMode ? "text-gray-400" : "text-gray-600"
                                }`}
                              >
                                {address.phoneNumber}
                              </p>
                            </div>
                          </label>
                        ))}

                        <label
                          className={`flex items-center space-x-4 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
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
                            className={`font-semibold ${
                              isDarkMode ? "text-white" : "text-gray-900"
                            }`}
                          >
                            Enter new address
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Address Form */}
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label
                          className={`block text-sm font-semibold mb-3 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          Address Line 1 *
                        </label>
                        <div className="relative group">
                          <Home
                            size={18}
                            className={`absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            } group-focus-within:text-blue-500`}
                          />
                          <input
                            type="text"
                            value={formData.addressLine1}
                            onChange={(e) =>
                              handleInputChange("addressLine1", e.target.value)
                            }
                            className={`w-full pl-12 pr-4 py-4 rounded-xl border transition-all duration-200 ${
                              errors.addressLine1
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                                : isDarkMode
                                ? "border-gray-600 bg-gray-700/50 text-white focus:border-blue-500 focus:ring-blue-500/20"
                                : "border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500/20"
                            } focus:outline-none focus:ring-4`}
                            placeholder="Enter your street address"
                          />
                        </div>
                        {errors.addressLine1 && (
                          <p className="mt-2 text-sm text-red-500 flex items-center space-x-1">
                            <X size={14} />
                            <span>{errors.addressLine1}</span>
                          </p>
                        )}
                      </div>

                      <div>
                        <label
                          className={`block text-sm font-semibold mb-3 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          Address Line 2
                        </label>
                        <div className="relative group">
                          <Building
                            size={18}
                            className={`absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            } group-focus-within:text-blue-500`}
                          />
                          <input
                            type="text"
                            value={formData.addressLine2}
                            onChange={(e) =>
                              handleInputChange("addressLine2", e.target.value)
                            }
                            className={`w-full pl-12 pr-4 py-4 rounded-xl border transition-all duration-200 ${
                              isDarkMode
                                ? "border-gray-600 bg-gray-700/50 text-white focus:border-blue-500 focus:ring-blue-500/20"
                                : "border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500/20"
                            } focus:outline-none focus:ring-4`}
                            placeholder="Apartment, suite, etc. (optional)"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label
                          className={`block text-sm font-semibold mb-3 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          Phone Number *
                        </label>
                        <div className="relative group">
                          <Phone
                            size={18}
                            className={`absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            } group-focus-within:text-blue-500`}
                          />
                          <input
                            type="tel"
                            value={formData.phoneNumber}
                            onChange={(e) =>
                              handleInputChange("phoneNumber", e.target.value)
                            }
                            className={`w-full pl-12 pr-4 py-4 rounded-xl border transition-all duration-200 ${
                              errors.phoneNumber
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                                : isDarkMode
                                ? "border-gray-600 bg-gray-700/50 text-white focus:border-blue-500 focus:ring-blue-500/20"
                                : "border-gray-300 bg-white text-gray-900 focus:border-blue-500 focus:ring-blue-500/20"
                            } focus:outline-none focus:ring-4`}
                            placeholder="Your contact number"
                          />
                        </div>
                        {errors.phoneNumber && (
                          <p className="mt-2 text-sm text-red-500 flex items-center space-x-1">
                            <X size={14} />
                            <span>{errors.phoneNumber}</span>
                          </p>
                        )}
                      </div>

                      <div className="relative">
                        <label
                          className={`block text-sm font-semibold mb-3 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          City *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowCityDropdown(!showCityDropdown)}
                          className={`w-full px-4 py-4 rounded-xl border text-left flex items-center justify-between transition-all duration-200 ${
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
                            {formData.city || "Select your city"}
                          </span>
                          <ChevronDown
                            size={16}
                            className="transition-transform duration-200"
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
                                className={`w-full px-4 py-3 text-left transition-colors ${
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
                          <p className="mt-2 text-sm text-red-500 flex items-center space-x-1">
                            <X size={14} />
                            <span>{errors.city}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Location Picker */}
                    <div>
                      <label
                        className={`block text-sm font-semibold mb-3 ${
                          isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        Precise Location *
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (!mapsLoaded) {
                            alert(
                              "Google Maps is still loading. Please try again in a moment."
                            );
                            return;
                          }
                          setShowMapModal(true);
                        }}
                        disabled={!mapsLoaded}
                        className={`w-full p-6 rounded-xl border text-left flex items-center justify-between transition-all duration-200 group ${
                          errors.location
                            ? "border-red-500"
                            : isDarkMode
                            ? "border-gray-600 bg-gray-700/50 hover:bg-gray-600/50"
                            : "border-gray-300 bg-white hover:bg-gray-50"
                        } ${
                          !mapsLoaded ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        <div className="flex items-center space-x-4">
                          <div
                            className={`p-3 rounded-xl transition-all duration-200 ${
                              formData.location
                                ? "bg-green-500/20"
                                : isDarkMode
                                ? "bg-blue-500/20"
                                : "bg-blue-50"
                            } group-hover:scale-105`}
                          >
                            {formData.location ? (
                              <CheckCircle2
                                size={24}
                                className="text-green-500"
                              />
                            ) : (
                              <Map size={24} className="text-blue-500" />
                            )}
                          </div>
                          <div>
                            <p
                              className={`font-semibold ${
                                isDarkMode ? "text-white" : "text-gray-900"
                              }`}
                            >
                              {formData.location
                                ? "Location Pinned"
                                : !mapsLoaded
                                ? "Loading Maps..."
                                : "Pin Your Exact Location"}
                            </p>
                            {formData.location ? (
                              <p
                                className={`text-sm mt-1 ${
                                  isDarkMode ? "text-gray-400" : "text-gray-600"
                                }`}
                              >
                                {formData.location.latitude.toFixed(4)},{" "}
                                {formData.location.longitude.toFixed(4)}
                              </p>
                            ) : (
                              <p
                                className={`text-sm mt-1 ${
                                  isDarkMode ? "text-gray-400" : "text-gray-600"
                                }`}
                              >
                                Help us find you precisely for faster delivery
                              </p>
                            )}
                          </div>
                        </div>
                        <ChevronDown
                          size={16}
                          className={`transition-colors ${
                            isDarkMode ? "text-gray-400" : "text-gray-500"
                          } group-hover:text-blue-500`}
                        />
                      </button>
                      {errors.location && (
                        <p className="mt-2 text-sm text-red-500 flex items-center space-x-1">
                          <X size={14} />
                          <span>{errors.location}</span>
                        </p>
                      )}
                    </div>

                    {/* Save Address */}
                    {selectedAddressId === null && (
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.saveAddress}
                          onChange={(e) =>
                            handleInputChange("saveAddress", e.target.checked)
                          }
                          className="w-5 h-5 text-blue-500 rounded focus:ring-blue-500/50"
                        />
                        <span
                          className={`text-sm font-medium ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          Save this address for future orders
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Payment Section */}
            <div
              className={`rounded-2xl shadow-lg border backdrop-blur-sm ${
                isDarkMode
                  ? "bg-gray-800/80 border-gray-700/50"
                  : "bg-white/80 border-gray-200/50"
              }`}
            >
              <button
                onClick={() => setIsPaymentExpanded(!isPaymentExpanded)}
                className="w-full p-8 flex items-center justify-between group"
              >
                <div className="flex items-center space-x-5">
                  <div
                    className={`p-4 rounded-2xl transition-all duration-200 ${
                      isDarkMode ? "bg-green-500/20" : "bg-green-50"
                    } group-hover:scale-105`}
                  >
                    <CreditCard size={24} className="text-green-500" />
                  </div>
                  <div className="text-left">
                    <h2
                      className={`text-xl font-bold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      Payment Method
                    </h2>
                    <p
                      className={`text-sm mt-1 ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      Secure payment processing
                    </p>
                  </div>
                </div>
                <ChevronDown
                  size={20}
                  className={`transform transition-all duration-200 ${
                    isPaymentExpanded ? "rotate-180" : ""
                  } ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  } group-hover:text-green-500`}
                />
              </button>

              {isPaymentExpanded && (
                <div
                  className={`px-8 pb-8 border-t ${
                    isDarkMode ? "border-gray-700/50" : "border-gray-200/50"
                  }`}
                >
                  {/* Saved Payment Methods */}
                  {savedPaymentMethods.length > 0 && (
                    <div className="mb-8 mt-6">
                      <h3
                        className={`text-sm font-semibold mb-4 flex items-center space-x-2 ${
                          isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        <Star size={16} />
                        <span>Saved Payment Methods</span>
                      </h3>
                      <div className="space-y-3">
                        {savedPaymentMethods.map((method) => (
                          <label
                            key={method.id}
                            className={`flex items-center space-x-4 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                              selectedPaymentMethodId === method.id
                                ? isDarkMode
                                  ? "border-green-500 bg-green-500/10 shadow-lg"
                                  : "border-green-500 bg-green-50 shadow-lg"
                                : isDarkMode
                                ? "border-gray-700 hover:border-gray-600 hover:bg-gray-700/50"
                                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                          >
                            <input
                              type="radio"
                              name="paymentMethod"
                              value={method.id}
                              checked={selectedPaymentMethodId === method.id}
                              onChange={() =>
                                handlePaymentMethodSelect(method.id)
                              }
                              className="text-green-500"
                            />
                            <div className="flex-1">
                              <p
                                className={`font-semibold ${
                                  isDarkMode ? "text-white" : "text-gray-900"
                                }`}
                              >
                                •••• •••• •••• {method.cardNumber.slice(-4)}
                              </p>
                              <p
                                className={`text-sm mt-1 ${
                                  isDarkMode ? "text-gray-400" : "text-gray-600"
                                }`}
                              >
                                {method.cardHolderName} • Expires{" "}
                                {method.expiryDate}
                              </p>
                            </div>
                          </label>
                        ))}

                        <label
                          className={`flex items-center space-x-4 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                            selectedPaymentMethodId === null
                              ? isDarkMode
                                ? "border-green-500 bg-green-500/10 shadow-lg"
                                : "border-green-500 bg-green-50 shadow-lg"
                              : isDarkMode
                              ? "border-gray-700 hover:border-gray-600 hover:bg-gray-700/50"
                              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="paymentMethod"
                            value=""
                            checked={selectedPaymentMethodId === null}
                            onChange={() => handlePaymentMethodSelect(null)}
                            className="text-green-500"
                          />
                          <span
                            className={`font-semibold ${
                              isDarkMode ? "text-white" : "text-gray-900"
                            }`}
                          >
                            Enter new payment method
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Payment Form */}
                  <div className="space-y-6">
                    <div>
                      <label
                        className={`block text-sm font-semibold mb-3 ${
                          isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        Card Number *
                      </label>
                      <div className="relative group">
                        <CreditCard
                          size={18}
                          className={`absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors ${
                            isDarkMode ? "text-gray-400" : "text-gray-500"
                          } group-focus-within:text-green-500`}
                        />
                        <input
                          type="text"
                          value={formatCardNumber(formData.cardNumber)}
                          onChange={(e) =>
                            handleInputChange(
                              "cardNumber",
                              e.target.value.replace(/\s/g, "")
                            )
                          }
                          maxLength={19}
                          className={`w-full pl-12 pr-4 py-4 rounded-xl border transition-all duration-200 ${
                            errors.cardNumber
                              ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                              : isDarkMode
                              ? "border-gray-600 bg-gray-700/50 text-white focus:border-green-500 focus:ring-green-500/20"
                              : "border-gray-300 bg-white text-gray-900 focus:border-green-500 focus:ring-green-500/20"
                          } focus:outline-none focus:ring-4`}
                          placeholder="1234 5678 9012 3456"
                        />
                      </div>
                      {errors.cardNumber && (
                        <p className="mt-2 text-sm text-red-500 flex items-center space-x-1">
                          <X size={14} />
                          <span>{errors.cardNumber}</span>
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label
                          className={`block text-sm font-semibold mb-3 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          Expiry Date *
                        </label>
                        <div className="relative group">
                          <Calendar
                            size={18}
                            className={`absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            } group-focus-within:text-green-500`}
                          />
                          <input
                            type="text"
                            value={formData.expiryDate}
                            onChange={(e) =>
                              handleExpiryDateChange(e.target.value)
                            }
                            maxLength={5}
                            className={`w-full pl-12 pr-4 py-4 rounded-xl border transition-all duration-200 ${
                              errors.expiryDate
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                                : isDarkMode
                                ? "border-gray-600 bg-gray-700/50 text-white focus:border-green-500 focus:ring-green-500/20"
                                : "border-gray-300 bg-white text-gray-900 focus:border-green-500 focus:ring-green-500/20"
                            } focus:outline-none focus:ring-4`}
                            placeholder="MM/YY"
                          />
                        </div>
                        {errors.expiryDate && (
                          <p className="mt-2 text-sm text-red-500 flex items-center space-x-1">
                            <X size={14} />
                            <span>{errors.expiryDate}</span>
                          </p>
                        )}
                      </div>

                      <div>
                        <label
                          className={`block text-sm font-semibold mb-3 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          CVV *
                        </label>
                        <div className="relative group">
                          <Lock
                            size={18}
                            className={`absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            } group-focus-within:text-green-500`}
                          />
                          <input
                            type="password"
                            value={formData.cvv}
                            onChange={(e) =>
                              handleInputChange("cvv", e.target.value)
                            }
                            maxLength={4}
                            className={`w-full pl-12 pr-4 py-4 rounded-xl border transition-all duration-200 ${
                              errors.cvv
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                                : isDarkMode
                                ? "border-gray-600 bg-gray-700/50 text-white focus:border-green-500 focus:ring-green-500/20"
                                : "border-gray-300 bg-white text-gray-900 focus:border-green-500 focus:ring-green-500/20"
                            } focus:outline-none focus:ring-4`}
                            placeholder="123"
                          />
                        </div>
                        {errors.cvv && (
                          <p className="mt-2 text-sm text-red-500 flex items-center space-x-1">
                            <X size={14} />
                            <span>{errors.cvv}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label
                        className={`block text-sm font-semibold mb-3 ${
                          isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        Card Holder Name *
                      </label>
                      <div className="relative group">
                        <User
                          size={18}
                          className={`absolute left-4 top-1/2 transform -translate-y-1/2 transition-colors ${
                            isDarkMode ? "text-gray-400" : "text-gray-500"
                          } group-focus-within:text-green-500`}
                        />
                        <input
                          type="text"
                          value={formData.cardHolderName}
                          onChange={(e) =>
                            handleInputChange("cardHolderName", e.target.value)
                          }
                          className={`w-full pl-12 pr-4 py-4 rounded-xl border transition-all duration-200 ${
                            errors.cardHolderName
                              ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                              : isDarkMode
                              ? "border-gray-600 bg-gray-700/50 text-white focus:border-green-500 focus:ring-green-500/20"
                              : "border-gray-300 bg-white text-gray-900 focus:border-green-500 focus:ring-green-500/20"
                          } focus:outline-none focus:ring-4`}
                          placeholder="Name as it appears on card"
                        />
                      </div>
                      {errors.cardHolderName && (
                        <p className="mt-2 text-sm text-red-500 flex items-center space-x-1">
                          <X size={14} />
                          <span>{errors.cardHolderName}</span>
                        </p>
                      )}
                    </div>

                    {/* Save Payment Method */}
                    {selectedPaymentMethodId === null && (
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.savePaymentDetails}
                          onChange={(e) =>
                            handleInputChange(
                              "savePaymentDetails",
                              e.target.checked
                            )
                          }
                          className="w-5 h-5 text-green-500 rounded focus:ring-green-500/50"
                        />
                        <span
                          className={`text-sm font-medium ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          Save this payment method for future orders
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
              className={`sticky top-32 rounded-2xl shadow-lg border backdrop-blur-sm p-8 ${
                isDarkMode
                  ? "bg-gray-800/80 border-gray-700/50"
                  : "bg-white/80 border-gray-200/50"
              }`}
            >
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-3 rounded-xl bg-gradient-to-r from-blue-500/20 to-purple-500/20">
                  <CreditCard size={24} className="text-blue-500" />
                </div>
                <h3
                  className={`text-xl font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  Order Summary
                </h3>
              </div>

              {/* Cart Items */}
              <div className="space-y-4 mb-8">
                {cartItems.map((item, index) => (
                  <div
                    key={index}
                    className={`flex items-center space-x-4 p-4 rounded-xl ${
                      isDarkMode ? "bg-gray-700/30" : "bg-gray-50"
                    }`}
                  >
                    <div
                      className={`w-16 h-16 rounded-xl flex items-center justify-center ${
                        isDarkMode
                          ? "bg-gradient-to-br from-blue-500/20 to-purple-500/20"
                          : "bg-gradient-to-br from-blue-100 to-purple-100"
                      }`}
                    >
                      <span
                        className={`text-lg font-bold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {item.quantity}×
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-semibold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {item.productName || "Product"}
                      </p>
                      <p
                        className={`text-sm ${
                          isDarkMode ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        Unit price: {(item.price || 0).toFixed(2)}{" "}
                        {item.currency || "USD"}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-lg font-bold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {((item.price || 0) * item.quantity).toFixed(2)}
                      </span>
                      <p
                        className={`text-sm ${
                          isDarkMode ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {item.currency || "USD"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pricing Breakdown */}
              <div
                className={`border-t pt-6 space-y-4 ${
                  isDarkMode ? "border-gray-700/50" : "border-gray-200/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    Subtotal
                  </span>
                  <span
                    className={`font-medium ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {totalPrice.toFixed(2)} {cartItems[0]?.currency || "USD"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    Delivery Fee
                  </span>
                  <span className={`font-medium text-green-500`}>FREE</span>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className={`text-sm ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    Tax
                  </span>
                  <span
                    className={`font-medium ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    Included
                  </span>
                </div>

                <div
                  className={`border-t pt-4 ${
                    isDarkMode ? "border-gray-700/50" : "border-gray-200/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-6">
                    <span
                      className={`text-xl font-bold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      Total
                    </span>
                    <div className="text-right">
                      <span className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                        {totalPrice.toFixed(2)}
                      </span>
                      <p
                        className={`text-sm ${
                          isDarkMode ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {cartItems[0]?.currency || "USD"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Complete Payment Button */}
                <button
                  onClick={handleSubmit}
                  disabled={isProcessing}
                  className="w-full py-5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white font-bold text-lg rounded-2xl hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center space-x-3 shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={24} className="animate-spin" />
                      <span>Processing Payment...</span>
                    </>
                  ) : (
                    <>
                      <Lock size={24} />
                      <span>Complete Secure Payment</span>
                    </>
                  )}
                </button>

                {/* Security Notice */}
                <div
                  className={`flex items-center justify-center space-x-2 text-xs mt-4 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  <Shield size={14} className="text-green-500" />
                  <span>Protected by 256-bit SSL encryption</span>
                </div>

                {/* Trust Indicators */}
                <div
                  className={`grid grid-cols-3 gap-2 mt-4 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  <div className="flex items-center justify-center space-x-1 text-xs">
                    <CheckCircle2 size={12} className="text-green-500" />
                    <span>Secure</span>
                  </div>
                  <div className="flex items-center justify-center space-x-1 text-xs">
                    <CheckCircle2 size={12} className="text-green-500" />
                    <span>Fast</span>
                  </div>
                  <div className="flex items-center justify-center space-x-1 text-xs">
                    <CheckCircle2 size={12} className="text-green-500" />
                    <span>Reliable</span>
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
  );
}
