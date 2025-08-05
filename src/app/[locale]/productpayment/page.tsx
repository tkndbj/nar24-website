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
                { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                {
                  elementType: "labels.text.stroke",
                  stylers: [{ color: "#242f3e" }],
                },
                {
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#746855" }],
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className={`w-full max-w-4xl h-[80vh] rounded-xl overflow-hidden shadow-2xl flex flex-col ${
          isDarkMode ? "bg-gray-800" : "bg-white"
        }`}
      >
        <div
          className={`flex items-center justify-between p-4 border-b ${
            isDarkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <h3
            className={`text-lg font-bold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {l("selectLocation") || "Select Location"}
          </h3>
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition-colors ${
              isDarkMode
                ? "hover:bg-gray-700 text-gray-400"
                : "hover:bg-gray-100 text-gray-500"
            }`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 relative">
          <div
            ref={mapRef}
            className="w-full h-full"
            style={{ minHeight: "400px" }}
          />

          {selectedLocation && (
            <div
              className={`absolute bottom-4 left-4 right-4 p-4 rounded-lg shadow-lg border ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <p
                className={`text-sm font-medium mb-2 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {l("selectedLocation") || "Selected Location"}:
              </p>
              <p
                className={`text-sm font-mono ${
                  isDarkMode ? "text-gray-300" : "text-gray-600"
                }`}
              >
                {selectedLocation.latitude.toFixed(6)},{" "}
                {selectedLocation.longitude.toFixed(6)}
              </p>
            </div>
          )}
        </div>

        <div
          className={`flex items-center justify-between p-4 border-t ${
            isDarkMode ? "border-gray-700" : "border-gray-200"
          }`}
        >
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {l("clickToSelectLocation") ||
              "Click on the map to select a location"}
          </p>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg transition-colors ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {l("cancel") || "Cancel"}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedLocation}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-pink-500 text-white hover:from-orange-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {l("confirm") || "Confirm"}
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
  const localization = useTranslations();

  // Create translation function similar to CartDrawer
  const t = useCallback(
    (key: string) => {
      try {
        // Try to get the nested ProductPayment translation
        const translation = localization(`ProductPayment.${key}`);

        // Check if we got a valid translation (not the same as the key we requested)
        if (translation && translation !== `ProductPayment.${key}`) {
          return translation;
        }

        // If nested translation doesn't exist, try direct key
        const directTranslation = localization(key);
        if (directTranslation && directTranslation !== key) {
          return directTranslation;
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
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="flex flex-col items-center space-y-4">
          <Loader2 size={48} className="animate-spin text-orange-500" />
          <p
            className={`text-lg ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("loading")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 border-b backdrop-blur-xl bg-opacity-95 ${
          isDarkMode
            ? "bg-gray-900 border-gray-700"
            : "bg-white border-gray-200"
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.back()}
              className={`p-2 rounded-full transition-colors ${
                isDarkMode
                  ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                  : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
              }`}
            >
              <ArrowLeft size={20} />
            </button>
            <h1
              className={`text-xl font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("payment")}
            </h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Forms */}
          <div className="lg:col-span-2 space-y-6">
            {/* Address Section */}
            <div
              className={`rounded-xl shadow-sm border ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <button
                onClick={() => setIsAddressExpanded(!isAddressExpanded)}
                className="w-full p-6 flex items-center justify-between"
              >
                <div className="flex items-center space-x-4">
                  <div
                    className={`p-3 rounded-full ${
                      isDarkMode ? "bg-gray-700" : "bg-blue-50"
                    }`}
                  >
                    <MapPin size={20} className="text-blue-500" />
                  </div>
                  <div className="text-left">
                    <h2
                      className={`text-lg font-semibold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {t("shippingAddress") || "Shipping Address"}
                    </h2>
                    <p
                      className={`text-sm ${
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {t("whereToDeliverOrder") ||
                        "Where should we deliver your order?"}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  size={20}
                  className={`transform transition-transform ${
                    isAddressExpanded ? "rotate-180" : ""
                  } ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                />
              </button>

              {isAddressExpanded && (
                <div
                  className={`px-6 pb-6 border-t ${
                    isDarkMode ? "border-gray-700" : "border-gray-200"
                  }`}
                >
                  {/* Saved Addresses */}
                  {savedAddresses.length > 0 && (
                    <div className="mb-6">
                      <h3
                        className={`text-sm font-medium mb-3 ${
                          isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        {t("savedAddresses") || "Saved Addresses"}
                      </h3>
                      <div className="space-y-2">
                        {savedAddresses.map((address) => (
                          <label
                            key={address.id}
                            className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              selectedAddressId === address.id
                                ? isDarkMode
                                  ? "border-blue-500 bg-blue-900/20"
                                  : "border-blue-500 bg-blue-50"
                                : isDarkMode
                                ? "border-gray-700 hover:border-gray-600"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <input
                              type="radio"
                              name="address"
                              value={address.id}
                              checked={selectedAddressId === address.id}
                              onChange={() => handleAddressSelect(address.id)}
                              className="mt-1 text-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <p
                                className={`font-medium ${
                                  isDarkMode ? "text-white" : "text-gray-900"
                                }`}
                              >
                                {address.addressLine1}
                              </p>
                              <p
                                className={`text-sm ${
                                  isDarkMode ? "text-gray-400" : "text-gray-500"
                                }`}
                              >
                                {[address.addressLine2, address.city]
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                              <p
                                className={`text-sm ${
                                  isDarkMode ? "text-gray-400" : "text-gray-500"
                                }`}
                              >
                                {address.phoneNumber}
                              </p>
                            </div>
                          </label>
                        ))}

                        <label
                          className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedAddressId === null
                              ? isDarkMode
                                ? "border-blue-500 bg-blue-900/20"
                                : "border-blue-500 bg-blue-50"
                              : isDarkMode
                              ? "border-gray-700 hover:border-gray-600"
                              : "border-gray-200 hover:border-gray-300"
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
                            className={`font-medium ${
                              isDarkMode ? "text-white" : "text-gray-900"
                            }`}
                          >
                            {t("enterNewAddress") || "Enter new address"}
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Address Form */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label
                          className={`block text-sm font-medium mb-2 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {t("addressLine1") || "Address Line 1"} *
                        </label>
                        <div className="relative">
                          <Home
                            size={18}
                            className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            }`}
                          />
                          <input
                            type="text"
                            value={formData.addressLine1}
                            onChange={(e) =>
                              handleInputChange("addressLine1", e.target.value)
                            }
                            className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
                              errors.addressLine1
                                ? "border-red-500 focus:border-red-500"
                                : isDarkMode
                                ? "border-gray-600 bg-gray-700 text-white focus:border-blue-500"
                                : "border-gray-300 bg-white text-gray-900 focus:border-blue-500"
                            } focus:outline-none focus:ring-1 focus:ring-blue-500`}
                            placeholder={
                              t("enterAddressLine1") || "Enter address line 1"
                            }
                          />
                        </div>
                        {errors.addressLine1 && (
                          <p className="mt-1 text-sm text-red-500">
                            {errors.addressLine1}
                          </p>
                        )}
                      </div>

                      <div>
                        <label
                          className={`block text-sm font-medium mb-2 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {t("addressLine2") || "Address Line 2"}
                        </label>
                        <div className="relative">
                          <Building
                            size={18}
                            className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            }`}
                          />
                          <input
                            type="text"
                            value={formData.addressLine2}
                            onChange={(e) =>
                              handleInputChange("addressLine2", e.target.value)
                            }
                            className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
                              isDarkMode
                                ? "border-gray-600 bg-gray-700 text-white focus:border-blue-500"
                                : "border-gray-300 bg-white text-gray-900 focus:border-blue-500"
                            } focus:outline-none focus:ring-1 focus:ring-blue-500`}
                            placeholder={
                              t("enterAddressLine2") ||
                              "Enter address line 2 (optional)"
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label
                          className={`block text-sm font-medium mb-2 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {t("phoneNumber") || "Phone Number"} *
                        </label>
                        <div className="relative">
                          <Phone
                            size={18}
                            className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            }`}
                          />
                          <input
                            type="tel"
                            value={formData.phoneNumber}
                            onChange={(e) =>
                              handleInputChange("phoneNumber", e.target.value)
                            }
                            className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
                              errors.phoneNumber
                                ? "border-red-500 focus:border-red-500"
                                : isDarkMode
                                ? "border-gray-600 bg-gray-700 text-white focus:border-blue-500"
                                : "border-gray-300 bg-white text-gray-900 focus:border-blue-500"
                            } focus:outline-none focus:ring-1 focus:ring-blue-500`}
                            placeholder={
                              t("enterPhoneNumber") || "Enter phone number"
                            }
                          />
                        </div>
                        {errors.phoneNumber && (
                          <p className="mt-1 text-sm text-red-500">
                            {errors.phoneNumber}
                          </p>
                        )}
                      </div>

                      <div className="relative">
                        <label
                          className={`block text-sm font-medium mb-2 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {t("city") || "City"} *
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowCityDropdown(!showCityDropdown)}
                          className={`w-full px-4 py-3 rounded-lg border text-left flex items-center justify-between transition-colors ${
                            errors.city
                              ? "border-red-500 focus:border-red-500"
                              : isDarkMode
                              ? "border-gray-600 bg-gray-700 text-white focus:border-blue-500"
                              : "border-gray-300 bg-white text-gray-900 focus:border-blue-500"
                          } focus:outline-none focus:ring-1 focus:ring-blue-500`}
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
                            {formData.city || t("selectCity") || "Select city"}
                          </span>
                          <ChevronDown size={16} />
                        </button>

                        {showCityDropdown && (
                          <div
                            className={`absolute top-full left-0 right-0 mt-1 border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto ${
                              isDarkMode
                                ? "bg-gray-700 border-gray-600"
                                : "bg-white border-gray-300"
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
                                className={`w-full px-3 py-2 text-left transition-colors ${
                                  isDarkMode
                                    ? "text-white hover:bg-gray-600"
                                    : "text-gray-900 hover:bg-gray-100"
                                }`}
                              >
                                {city}
                              </button>
                            ))}
                          </div>
                        )}

                        {errors.city && (
                          <p className="mt-1 text-sm text-red-500">
                            {errors.city}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Location Picker */}
                    <div>
                      <label
                        className={`block text-sm font-medium mb-2 ${
                          isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        {t("location") || "Location"} *
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
                        className={`w-full p-4 rounded-lg border text-left flex items-center justify-between transition-colors ${
                          errors.location
                            ? "border-red-500"
                            : isDarkMode
                            ? "border-gray-600 bg-gray-700 hover:bg-gray-600"
                            : "border-gray-300 bg-white hover:bg-gray-50"
                        } ${
                          !mapsLoaded ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Map size={20} className="text-blue-500" />
                          <div>
                            <p
                              className={`font-medium ${
                                isDarkMode ? "text-white" : "text-gray-900"
                              }`}
                            >
                              {formData.location
                                ? t("locationSelected") || "Location selected"
                                : !mapsLoaded
                                ? "Loading Maps..."
                                : t("pinLocationOnMap") ||
                                  "Pin location on map"}
                            </p>
                            {formData.location && (
                              <p
                                className={`text-sm ${
                                  isDarkMode ? "text-gray-400" : "text-gray-500"
                                }`}
                              >
                                {formData.location.latitude.toFixed(4)},{" "}
                                {formData.location.longitude.toFixed(4)}
                              </p>
                            )}
                          </div>
                        </div>
                        <ChevronDown
                          size={16}
                          className={
                            isDarkMode ? "text-gray-400" : "text-gray-500"
                          }
                        />
                      </button>
                      {errors.location && (
                        <p className="mt-1 text-sm text-red-500">
                          {errors.location}
                        </p>
                      )}
                    </div>

                    {/* Save Address */}
                    {selectedAddressId === null && (
                      <label className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={formData.saveAddress}
                          onChange={(e) =>
                            handleInputChange("saveAddress", e.target.checked)
                          }
                          className="text-blue-500 rounded"
                        />
                        <span
                          className={`text-sm ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {t("saveAddressForFutureOrders") ||
                            "Save this address for future orders"}
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Payment Section */}
            <div
              className={`rounded-xl shadow-sm border ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <button
                onClick={() => setIsPaymentExpanded(!isPaymentExpanded)}
                className="w-full p-6 flex items-center justify-between"
              >
                <div className="flex items-center space-x-4">
                  <div
                    className={`p-3 rounded-full ${
                      isDarkMode ? "bg-gray-700" : "bg-green-50"
                    }`}
                  >
                    <CreditCard size={20} className="text-green-500" />
                  </div>
                  <div className="text-left">
                    <h2
                      className={`text-lg font-semibold ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {t("paymentDetails") || "Payment Details"}
                    </h2>
                    <p
                      className={`text-sm ${
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {t("howWouldYouLikeToPay") ||
                        "How would you like to pay?"}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  size={20}
                  className={`transform transition-transform ${
                    isPaymentExpanded ? "rotate-180" : ""
                  } ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                />
              </button>

              {isPaymentExpanded && (
                <div
                  className={`px-6 pb-6 border-t ${
                    isDarkMode ? "border-gray-700" : "border-gray-200"
                  }`}
                >
                  {/* Saved Payment Methods */}
                  {savedPaymentMethods.length > 0 && (
                    <div className="mb-6">
                      <h3
                        className={`text-sm font-medium mb-3 ${
                          isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        {t("savedPaymentMethods") || "Saved Payment Methods"}
                      </h3>
                      <div className="space-y-2">
                        {savedPaymentMethods.map((method) => (
                          <label
                            key={method.id}
                            className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              selectedPaymentMethodId === method.id
                                ? isDarkMode
                                  ? "border-green-500 bg-green-900/20"
                                  : "border-green-500 bg-green-50"
                                : isDarkMode
                                ? "border-gray-700 hover:border-gray-600"
                                : "border-gray-200 hover:border-gray-300"
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
                                className={`font-medium ${
                                  isDarkMode ? "text-white" : "text-gray-900"
                                }`}
                              >
                                **** **** **** {method.cardNumber.slice(-4)}
                              </p>
                              <p
                                className={`text-sm ${
                                  isDarkMode ? "text-gray-400" : "text-gray-500"
                                }`}
                              >
                                {method.cardHolderName} • Expires{" "}
                                {method.expiryDate}
                              </p>
                            </div>
                          </label>
                        ))}

                        <label
                          className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedPaymentMethodId === null
                              ? isDarkMode
                                ? "border-green-500 bg-green-900/20"
                                : "border-green-500 bg-green-50"
                              : isDarkMode
                              ? "border-gray-700 hover:border-gray-600"
                              : "border-gray-200 hover:border-gray-300"
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
                            className={`font-medium ${
                              isDarkMode ? "text-white" : "text-gray-900"
                            }`}
                          >
                            {t("enterNewPaymentMethod") ||
                              "Enter new payment method"}
                          </span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Payment Form */}
                  <div className="space-y-4">
                    <div>
                      <label
                        className={`block text-sm font-medium mb-2 ${
                          isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        {t("cardNumber") || "Card Number"} *
                      </label>
                      <div className="relative">
                        <CreditCard
                          size={18}
                          className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                            isDarkMode ? "text-gray-400" : "text-gray-500"
                          }`}
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
                          className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
                            errors.cardNumber
                              ? "border-red-500 focus:border-red-500"
                              : isDarkMode
                              ? "border-gray-600 bg-gray-700 text-white focus:border-green-500"
                              : "border-gray-300 bg-white text-gray-900 focus:border-green-500"
                          } focus:outline-none focus:ring-1 focus:ring-green-500`}
                          placeholder="1234 5678 9012 3456"
                        />
                      </div>
                      {errors.cardNumber && (
                        <p className="mt-1 text-sm text-red-500">
                          {errors.cardNumber}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label
                          className={`block text-sm font-medium mb-2 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {t("expiryDate") || "Expiry Date"} *
                        </label>
                        <div className="relative">
                          <Calendar
                            size={18}
                            className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            }`}
                          />
                          <input
                            type="text"
                            value={formData.expiryDate}
                            onChange={(e) =>
                              handleExpiryDateChange(e.target.value)
                            }
                            maxLength={5}
                            className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
                              errors.expiryDate
                                ? "border-red-500 focus:border-red-500"
                                : isDarkMode
                                ? "border-gray-600 bg-gray-700 text-white focus:border-green-500"
                                : "border-gray-300 bg-white text-gray-900 focus:border-green-500"
                            } focus:outline-none focus:ring-1 focus:ring-green-500`}
                            placeholder="MM/YY"
                          />
                        </div>
                        {errors.expiryDate && (
                          <p className="mt-1 text-sm text-red-500">
                            {errors.expiryDate}
                          </p>
                        )}
                      </div>

                      <div>
                        <label
                          className={`block text-sm font-medium mb-2 ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {t("cvv") || "CVV"} *
                        </label>
                        <div className="relative">
                          <Lock
                            size={18}
                            className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            }`}
                          />
                          <input
                            type="password"
                            value={formData.cvv}
                            onChange={(e) =>
                              handleInputChange("cvv", e.target.value)
                            }
                            maxLength={4}
                            className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
                              errors.cvv
                                ? "border-red-500 focus:border-red-500"
                                : isDarkMode
                                ? "border-gray-600 bg-gray-700 text-white focus:border-green-500"
                                : "border-gray-300 bg-white text-gray-900 focus:border-green-500"
                            } focus:outline-none focus:ring-1 focus:ring-green-500`}
                            placeholder="123"
                          />
                        </div>
                        {errors.cvv && (
                          <p className="mt-1 text-sm text-red-500">
                            {errors.cvv}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label
                        className={`block text-sm font-medium mb-2 ${
                          isDarkMode ? "text-gray-300" : "text-gray-700"
                        }`}
                      >
                        {t("cardHolderName") || "Card Holder Name"} *
                      </label>
                      <div className="relative">
                        <User
                          size={18}
                          className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                            isDarkMode ? "text-gray-400" : "text-gray-500"
                          }`}
                        />
                        <input
                          type="text"
                          value={formData.cardHolderName}
                          onChange={(e) =>
                            handleInputChange("cardHolderName", e.target.value)
                          }
                          className={`w-full pl-10 pr-4 py-3 rounded-lg border transition-colors ${
                            errors.cardHolderName
                              ? "border-red-500 focus:border-red-500"
                              : isDarkMode
                              ? "border-gray-600 bg-gray-700 text-white focus:border-green-500"
                              : "border-gray-300 bg-white text-gray-900 focus:border-green-500"
                          } focus:outline-none focus:ring-1 focus:ring-green-500`}
                          placeholder={
                            t("enterCardHolderName") || "Enter card holder name"
                          }
                        />
                      </div>
                      {errors.cardHolderName && (
                        <p className="mt-1 text-sm text-red-500">
                          {errors.cardHolderName}
                        </p>
                      )}
                    </div>

                    {/* Save Payment Method */}
                    {selectedPaymentMethodId === null && (
                      <label className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={formData.savePaymentDetails}
                          onChange={(e) =>
                            handleInputChange(
                              "savePaymentDetails",
                              e.target.checked
                            )
                          }
                          className="text-green-500 rounded"
                        />
                        <span
                          className={`text-sm ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {t("savePaymentMethodForFutureOrders") ||
                            "Save this payment method for future orders"}
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-1">
            <div
              className={`sticky top-24 rounded-xl shadow-sm border p-6 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <h3
                className={`text-lg font-semibold mb-4 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("orderSummary") || "Order Summary"}
              </h3>

              {/* Cart Items */}
              <div className="space-y-3 mb-6">
                {cartItems.map((item, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <div
                      className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        isDarkMode ? "bg-gray-700" : "bg-gray-100"
                      }`}
                    >
                      <span
                        className={`text-sm font-medium ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {item.quantity}x
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-medium text-sm ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {item.productName || "Product"}
                      </p>
                      <p
                        className={`text-sm ${
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {/* {item.selectedColor && `Color: ${item.selectedColor}`}
                        {item.selectedSize && ` • Size: ${item.selectedSize}`} */}
                      </p>
                    </div>
                    <span
                      className={`font-medium ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {((item.price || 0) * item.quantity).toFixed(2)}{" "}
                      {item.currency || "USD"}
                    </span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div
                className={`border-t pt-4 ${
                  isDarkMode ? "border-gray-700" : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between mb-6">
                  <span
                    className={`text-lg font-semibold ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("total") || "Total"}
                  </span>
                  <span className="text-2xl font-bold text-green-500">
                    {totalPrice.toFixed(2)} {cartItems[0]?.currency || "USD"}
                  </span>
                </div>

                {/* Complete Payment Button */}
                <button
                  onClick={handleSubmit}
                  disabled={isProcessing}
                  className="w-full py-4 bg-gradient-to-r from-orange-500 to-pink-500 text-white font-semibold rounded-xl hover:from-orange-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      <span>{t("processing") || "Processing..."}</span>
                    </>
                  ) : (
                    <>
                      <Lock size={20} />
                      <span>{t("completePayment") || "Complete Payment"}</span>
                    </>
                  )}
                </button>

                <p
                  className={`text-xs text-center mt-3 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  {t("securePaymentNotice") ||
                    "Your payment information is secured with 256-bit SSL encryption"}
                </p>
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
