"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  MapPin,
  Plus,
  Phone,
  ChevronDown,
  Check,
  Loader2,
  Home,
  Map as MapIcon,
  Crosshair,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useTranslations } from "next-intl";
import { mainRegions, getSubregions, getMainRegion } from "@/constants/regions";
import { toast } from "react-hot-toast";
import { FoodAddress } from "@/app/models/FoodAddress";

// ── Types ────────────────────────────────────────────────────────────────────

interface SavedAddress {
  id: string;
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
  city: string;
  location?: { latitude: number; longitude: number };
}

interface FoodLocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  /** When true, user cannot dismiss without selecting an address */
  required?: boolean;
}

// ── Phone utilities (matching food-checkout) ─────────────────────────────────

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

const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? digits : `0${digits}`;
};

// ── Google Maps loader (matching saved-addresses) ────────────────────────────

const loadGoogleMapsScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) { resolve(); return; }
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
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

// ── Location Picker Modal (matching saved-addresses/page.tsx) ────────────────

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLocationSelect: (location: { latitude: number; longitude: number }) => void;
  initialLocation?: { latitude: number; longitude: number } | null;
  isDarkMode: boolean;
}

const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  onLocationSelect,
  initialLocation,
  isDarkMode,
}) => {
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(initialLocation || null);
  const [lastClickTime, setLastClickTime] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const t = useTranslations("restaurants");

  useEffect(() => {
    if (!isOpen || !window.google || !mapRef.current) return;
    const initializeMap = async () => {
      try {
        const { AdvancedMarkerElement } = (await google.maps.importLibrary("marker")) as google.maps.MarkerLibrary;
        const defaultCenter = { lat: 35.1855, lng: 33.3823 };
        const mapCenter = initialLocation ? { lat: initialLocation.latitude, lng: initialLocation.longitude } : defaultCenter;
        const map = new google.maps.Map(mapRef.current!, {
          center: mapCenter,
          zoom: initialLocation ? 15 : 10,
          mapId: process.env.NEXT_PUBLIC_MAP_ID || "DEMO_MAP_ID",
          clickableIcons: false,
          gestureHandling: "greedy",
          styles: isDarkMode ? [
            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
          ] : [],
        });
        mapInstanceRef.current = map;
        const marker = new AdvancedMarkerElement({ map, position: mapCenter, title: "Click to select" });
        markerRef.current = marker;
        map.addListener("click", (event: google.maps.MapMouseEvent) => {
          const now = Date.now();
          if (now - lastClickTime < 300) return;
          setLastClickTime(now);
          if (event.latLng) {
            const newLoc = { latitude: event.latLng.lat(), longitude: event.latLng.lng() };
            setSelectedLocation(newLoc);
            if (markerRef.current) { markerRef.current.position = { lat: event.latLng.lat(), lng: event.latLng.lng() }; }
          }
        });
        if (initialLocation) setSelectedLocation(initialLocation);
      } catch (error) {
        console.error("Map init error:", error);
      }
    };
    initializeMap();
    return () => {
      if (markerRef.current) { markerRef.current.map = null; markerRef.current = null; }
      if (mapInstanceRef.current) { google.maps.event.clearInstanceListeners(mapInstanceRef.current); mapInstanceRef.current = null; }
    };
  }, [isOpen, initialLocation, isDarkMode]);

  const getCurrentLocation = useCallback(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLoc = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          setSelectedLocation(newLoc);
          const latLng = new google.maps.LatLng(newLoc.latitude, newLoc.longitude);
          if (mapInstanceRef.current) { mapInstanceRef.current.setCenter(latLng); mapInstanceRef.current.setZoom(15); }
          if (markerRef.current) { markerRef.current.position = { lat: newLoc.latitude, lng: newLoc.longitude }; }
        },
        () => { alert("Could not get your location."); },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={`w-full max-w-3xl h-[75vh] rounded-2xl overflow-hidden shadow-xl flex flex-col border ${isDarkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}>
          <h3 className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {t("selectLocation")}
          </h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={getCurrentLocation}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${isDarkMode ? "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"}`}
            >
              <Crosshair className="w-3 h-3" />
              {t("myLocation")}
            </button>
            <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? "hover:bg-gray-800 text-gray-500" : "hover:bg-gray-100 text-gray-400"}`}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <div ref={mapRef} className="w-full h-full" style={{ minHeight: "300px" }} />
          {selectedLocation && (
            <div className={`absolute bottom-3 left-3 right-3 p-3 rounded-xl shadow-lg border ${isDarkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
              <p className={`text-xs font-mono ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-4 py-3 border-t ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}>
          <p className={`text-[11px] ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}>
            {t("clickMapToSelect")}
          </p>
          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${isDarkMode ? "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}
            >
              {t("cancel")}
            </button>
            <button
              onClick={() => { if (selectedLocation) onLocationSelect(selectedLocation); }}
              disabled={!selectedLocation}
              className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
            >
              {t("confirm")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────

export default function FoodLocationPicker({
  isOpen,
  onClose,
  isDarkMode,
  required = false,
}: FoodLocationPickerProps) {
  const { user, profileData, updateProfileData } = useUser();
  const t = useTranslations("restaurants");

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  // New address form state
  const [formAddress, setFormAddress] = useState({
    addressLine1: "",
    addressLine2: "",
    phoneNumber: "",
    selectedMainRegion: "",
    city: "",
    location: null as { latitude: number; longitude: number } | null,
  });
  const [showMainRegionDropdown, setShowMainRegionDropdown] = useState(false);
  const [showSubregionDropdown, setShowSubregionDropdown] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Map state
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);

  const mainRegionDropdownRef = useRef<HTMLDivElement>(null);
  const subregionDropdownRef = useRef<HTMLDivElement>(null);

  // Load Google Maps when form is shown
  useEffect(() => {
    if (!showNewForm || typeof window === "undefined") return;
    loadGoogleMapsScript()
      .then(() => setMapsLoaded(true))
      .catch((err) => console.error("Failed to load Google Maps:", err));
  }, [showNewForm]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showMainRegionDropdown && !showSubregionDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (showMainRegionDropdown && mainRegionDropdownRef.current && !mainRegionDropdownRef.current.contains(e.target as Node)) {
        setShowMainRegionDropdown(false);
      }
      if (showSubregionDropdown && subregionDropdownRef.current && !subregionDropdownRef.current.contains(e.target as Node)) {
        setShowSubregionDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showMainRegionDropdown, showSubregionDropdown]);

  // Load saved addresses when modal opens
  useEffect(() => {
    if (!isOpen || !user) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const loadAddresses = async () => {
      try {
        const { collection, getDocs } = await import("firebase/firestore");
        const { getFirebaseDb } = await import("@/lib/firebase-lazy");
        const db = await getFirebaseDb();
        const snapshot = await getDocs(
          collection(db, "users", user.uid, "addresses")
        );
        if (cancelled) return;
        const addresses: SavedAddress[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as SavedAddress[];
        setSavedAddresses(addresses);

        // Pre-select current foodAddress if it exists
        if (profileData?.foodAddress) {
          const currentFoodAddress = FoodAddress.fromMap(profileData.foodAddress as Record<string, unknown>);
          if (currentFoodAddress.addressId) {
            setSelectedAddressId(currentFoodAddress.addressId);
          }
        }
      } catch (err) {
        console.error("[FoodLocationPicker] Error loading addresses:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadAddresses();
    return () => { cancelled = true; };
  }, [isOpen, user, profileData?.foodAddress]);

  // Reset form when toggling new address
  useEffect(() => {
    if (!showNewForm) {
      setFormAddress({ addressLine1: "", addressLine2: "", phoneNumber: "", selectedMainRegion: "", city: "", location: null });
      setErrors({});
    }
  }, [showNewForm]);

  // Compute subregions for the selected main region
  const availableSubregions = formAddress.selectedMainRegion
    ? getSubregions(formAddress.selectedMainRegion)
    : [];

  const handlePhoneChange = useCallback((value: string) => {
    setFormAddress((prev) => ({ ...prev, phoneNumber: formatPhoneNumber(value) }));
    setErrors((prev) => ({ ...prev, phoneNumber: "" }));
  }, []);

  const validateNewAddress = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formAddress.addressLine1.trim()) newErrors.addressLine1 = t("fieldRequired");
    if (!formAddress.city) newErrors.city = t("fieldRequired");
    if (!formAddress.phoneNumber.trim()) {
      newErrors.phoneNumber = t("fieldRequired");
    } else if (!isValidPhoneNumber(formAddress.phoneNumber)) {
      newErrors.phoneNumber = t("invalidPhone");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formAddress, t]);

  // Save new address to subcollection, then select it
  const handleSaveNewAddress = useCallback(async () => {
    if (!user || !validateNewAddress()) return;

    setIsSaving(true);
    try {
      const { collection, addDoc, GeoPoint } = await import("firebase/firestore");
      const { getFirebaseDb } = await import("@/lib/firebase-lazy");
      const db = await getFirebaseDb();
      const normalizedPhone = normalizePhone(formAddress.phoneNumber);
      const resolvedMainRegion = formAddress.selectedMainRegion || getMainRegion(formAddress.city) || formAddress.city;

      const addressData: Record<string, unknown> = {
        addressLine1: formAddress.addressLine1.trim(),
        addressLine2: formAddress.addressLine2.trim(),
        phoneNumber: normalizedPhone,
        city: formAddress.city,
      };
      if (formAddress.location) {
        addressData.location = new GeoPoint(formAddress.location.latitude, formAddress.location.longitude);
      }

      const docRef = await addDoc(
        collection(db, "users", user.uid, "addresses"),
        addressData
      );

      // Construct typed FoodAddress and write to user doc
      const foodAddr = new FoodAddress({
        addressId: docRef.id,
        addressLine1: formAddress.addressLine1.trim(),
        addressLine2: formAddress.addressLine2.trim() || undefined,
        city: formAddress.city,
        mainRegion: resolvedMainRegion,
        phoneNumber: normalizedPhone,
        location: formAddress.location ?? undefined,
      });

      await updateProfileData({ foodAddress: foodAddr.toMap() });

      toast.success(t("addressSelectedSuccess"));
      onClose();
    } catch (err) {
      console.error("[FoodLocationPicker] Error saving address:", err);
    } finally {
      setIsSaving(false);
    }
  }, [user, formAddress, validateNewAddress, updateProfileData, t, onClose]);

  // Select an existing address and write foodAddress to user doc
  const handleConfirmSelection = useCallback(async () => {
    if (!user || !selectedAddressId) return;

    const selected = savedAddresses.find((a) => a.id === selectedAddressId);
    if (!selected) return;

    setIsSaving(true);
    try {
      const resolvedMainRegion = getMainRegion(selected.city) || selected.city;

      // Construct typed FoodAddress and write to user doc
      const foodAddr = new FoodAddress({
        addressId: selected.id,
        addressLine1: selected.addressLine1,
        addressLine2: selected.addressLine2 || undefined,
        city: selected.city,
        mainRegion: resolvedMainRegion,
        phoneNumber: selected.phoneNumber || undefined,
        location: selected.location ?? undefined,
      });

      await updateProfileData({ foodAddress: foodAddr.toMap() });

      toast.success(t("addressSelectedSuccess"));
      onClose();
    } catch (err) {
      console.error("[FoodLocationPicker] Error selecting address:", err);
    } finally {
      setIsSaving(false);
    }
  }, [user, selectedAddressId, savedAddresses, updateProfileData, t, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
        onClick={required ? undefined : onClose}
      >
        <div
          className={`w-full max-w-md max-h-[85vh] rounded-t-2xl sm:rounded-2xl border shadow-2xl flex flex-col overflow-hidden ${
            isDarkMode
              ? "bg-gray-900 border-gray-800"
              : "bg-white border-gray-100"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <div
            className={`px-5 py-4 border-b flex items-center justify-between flex-shrink-0 ${
              isDarkMode ? "border-gray-800" : "border-gray-100"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center ${
                  isDarkMode ? "bg-orange-500/20" : "bg-orange-50"
                }`}
              >
                <MapPin className="w-4.5 h-4.5 text-orange-500" />
              </div>
              <div>
                <h3
                  className={`text-base font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("foodDeliveryAddress")}
                </h3>
                <p
                  className={`text-xs ${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  }`}
                >
                  {t("selectDeliveryAddress")}
                </p>
              </div>
            </div>
            {!required && (
              <button
                onClick={onClose}
                className={`p-1.5 rounded-lg transition-colors ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-400"
                    : "hover:bg-gray-100 text-gray-400"
                }`}
              >
                <X className="w-4.5 h-4.5" />
              </button>
            )}
          </div>

          {/* ── Body ───────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              </div>
            ) : showNewForm ? (
              /* ── New Address Form ───────────────────────────────── */
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
                  <div className="relative mt-1">
                    <Home
                      className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    />
                    <input
                      type="text"
                      value={formAddress.addressLine1}
                      onChange={(e) => {
                        setFormAddress((p) => ({ ...p, addressLine1: e.target.value }));
                        setErrors((p) => ({ ...p, addressLine1: "" }));
                      }}
                      className={`w-full pl-10 pr-3 py-2.5 rounded-xl text-sm border transition-colors ${
                        errors.addressLine1
                          ? "border-red-500"
                          : isDarkMode
                            ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-orange-500"
                            : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
                      } outline-none`}
                    />
                  </div>
                  {errors.addressLine1 && (
                    <p className="mt-1 text-xs text-red-500">{errors.addressLine1}</p>
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
                  <input
                    type="text"
                    value={formAddress.addressLine2}
                    onChange={(e) =>
                      setFormAddress((p) => ({ ...p, addressLine2: e.target.value }))
                    }
                    className={`w-full mt-1 px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-orange-500"
                        : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
                    } outline-none`}
                  />
                </div>

                {/* Main Region Dropdown */}
                <div className="relative" ref={mainRegionDropdownRef}>
                  <label
                    className={`text-xs font-medium ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    {t("selectRegion")} *
                  </label>
                  <button
                    type="button"
                    onClick={() => { setShowMainRegionDropdown(!showMainRegionDropdown); setShowSubregionDropdown(false); }}
                    className={`w-full mt-1 px-3 py-2.5 rounded-xl text-sm border text-left flex items-center justify-between transition-colors ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-700 text-white focus:border-orange-500"
                        : "bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-500"
                    } outline-none`}
                  >
                    <span
                      className={
                        formAddress.selectedMainRegion
                          ? isDarkMode ? "text-white" : "text-gray-900"
                          : isDarkMode ? "text-gray-600" : "text-gray-400"
                      }
                    >
                      {formAddress.selectedMainRegion || t("selectRegion")}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMainRegionDropdown ? "rotate-180" : ""}`} />
                  </button>

                  {showMainRegionDropdown && (
                    <div
                      className={`absolute top-full left-0 right-0 mt-1 border rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto backdrop-blur-sm ${
                        isDarkMode
                          ? "bg-gray-800/95 border-gray-600"
                          : "bg-white/95 border-gray-300"
                      }`}
                    >
                      {mainRegions.map((region) => (
                        <button
                          key={region}
                          type="button"
                          onClick={() => {
                            setFormAddress((a) => ({ ...a, selectedMainRegion: region, city: "" }));
                            setShowMainRegionDropdown(false);
                            setErrors((prev) => ({ ...prev, city: "" }));
                          }}
                          className={`w-full px-3 py-2.5 text-left text-sm transition-colors flex items-center justify-between ${
                            formAddress.selectedMainRegion === region
                              ? isDarkMode ? "bg-orange-500/20 text-orange-400" : "bg-orange-50 text-orange-600"
                              : isDarkMode ? "text-white hover:bg-gray-700" : "text-gray-900 hover:bg-gray-100"
                          }`}
                        >
                          {region}
                          {formAddress.selectedMainRegion === region && <Check className="w-3.5 h-3.5" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Subregion Dropdown */}
                {formAddress.selectedMainRegion && (
                  <div className="relative" ref={subregionDropdownRef}>
                    <label
                      className={`text-xs font-medium ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    >
                      {t("selectSubregion")} *
                    </label>
                    <button
                      type="button"
                      onClick={() => { setShowSubregionDropdown(!showSubregionDropdown); setShowMainRegionDropdown(false); }}
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
                          formAddress.city
                            ? isDarkMode ? "text-white" : "text-gray-900"
                            : isDarkMode ? "text-gray-600" : "text-gray-400"
                        }
                      >
                        {formAddress.city || t("selectSubregion")}
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSubregionDropdown ? "rotate-180" : ""}`} />
                    </button>

                    {showSubregionDropdown && (
                      <div
                        className={`absolute top-full left-0 right-0 mt-1 border rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto backdrop-blur-sm ${
                          isDarkMode
                            ? "bg-gray-800/95 border-gray-600"
                            : "bg-white/95 border-gray-300"
                        }`}
                      >
                        {availableSubregions.map((sub) => (
                          <button
                            key={sub}
                            type="button"
                            onClick={() => {
                              setFormAddress((a) => ({ ...a, city: sub }));
                              setShowSubregionDropdown(false);
                              setErrors((prev) => ({ ...prev, city: "" }));
                            }}
                            className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center justify-between ${
                              formAddress.city === sub
                                ? isDarkMode ? "bg-orange-500/20 text-orange-400" : "bg-orange-50 text-orange-600"
                                : isDarkMode ? "text-white hover:bg-gray-700" : "text-gray-900 hover:bg-gray-100"
                            }`}
                          >
                            {sub}
                            {formAddress.city === sub && <Check className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </div>
                    )}
                    {errors.city && (
                      <p className="mt-1 text-xs text-red-500">{errors.city}</p>
                    )}
                  </div>
                )}

                {/* Phone */}
                <div>
                  <label
                    className={`text-xs font-medium ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    {t("phoneNumber")} *
                  </label>
                  <div className="relative mt-1">
                    <Phone
                      className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${
                        isDarkMode ? "text-gray-500" : "text-gray-400"
                      }`}
                    />
                    <input
                      type="tel"
                      value={formAddress.phoneNumber}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      placeholder={t("phoneFormatHint")}
                      className={`w-full pl-10 pr-3 py-2.5 rounded-xl text-sm border transition-colors ${
                        errors.phoneNumber
                          ? "border-red-500"
                          : isDarkMode
                            ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600 focus:border-orange-500"
                            : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-orange-500"
                      } outline-none`}
                    />
                  </div>
                  {errors.phoneNumber && (
                    <p className="mt-1 text-xs text-red-500">{errors.phoneNumber}</p>
                  )}
                </div>

                {/* Location Picker */}
                <div>
                  <label
                    className={`text-xs font-medium ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    {t("markOnMap")}
                  </label>
                  <button
                    type="button"
                    onClick={() => { if (mapsLoaded) setShowMapModal(true); }}
                    disabled={!mapsLoaded}
                    className={`w-full mt-1 px-3 py-2.5 rounded-xl text-sm border text-left flex items-center justify-between transition-colors ${
                      isDarkMode
                        ? "bg-gray-800 border-gray-700 text-white hover:border-gray-600"
                        : "bg-gray-50 border-gray-200 text-gray-900 hover:border-gray-300"
                    } ${!mapsLoaded ? "opacity-50 cursor-not-allowed" : ""} outline-none`}
                  >
                    <span
                      className={
                        formAddress.location
                          ? isDarkMode ? "text-white" : "text-gray-900"
                          : isDarkMode ? "text-gray-600" : "text-gray-400"
                      }
                    >
                      {formAddress.location
                        ? `${formAddress.location.latitude.toFixed(4)}, ${formAddress.location.longitude.toFixed(4)}`
                        : !mapsLoaded
                          ? "Loading Maps..."
                          : t("selectOnMap")}
                    </span>
                    <MapIcon className={`w-4 h-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} />
                  </button>
                </div>
              </div>
            ) : (
              /* ── Saved Addresses List ──────────────────────────── */
              <div className="space-y-3">
                {savedAddresses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10">
                    <div
                      className={`w-14 h-14 rounded-full flex items-center justify-center mb-3 ${
                        isDarkMode ? "bg-gray-800" : "bg-gray-100"
                      }`}
                    >
                      <MapPin
                        className={`w-6 h-6 ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      />
                    </div>
                    <p
                      className={`text-sm font-medium ${
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {t("noSavedAddressesHint")}
                    </p>
                  </div>
                ) : (
                  savedAddresses.map((addr) => {
                    const isSelected = selectedAddressId === addr.id;
                    return (
                      <button
                        key={addr.id}
                        onClick={() => setSelectedAddressId(addr.id)}
                        className={`w-full text-left p-3.5 rounded-xl border-2 transition-all ${
                          isSelected
                            ? "border-orange-500 bg-orange-500/5"
                            : isDarkMode
                              ? "border-gray-700 hover:border-gray-600"
                              : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              isSelected
                                ? "bg-orange-500"
                                : isDarkMode
                                  ? "bg-gray-800"
                                  : "bg-gray-100"
                            }`}
                          >
                            {isSelected ? (
                              <Check className="w-4 h-4 text-white" />
                            ) : (
                              <Home
                                className={`w-4 h-4 ${
                                  isDarkMode ? "text-gray-500" : "text-gray-400"
                                }`}
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-medium truncate ${
                                isDarkMode ? "text-white" : "text-gray-900"
                              }`}
                            >
                              {addr.addressLine1}
                            </p>
                            {addr.addressLine2 && (
                              <p
                                className={`text-xs mt-0.5 truncate ${
                                  isDarkMode ? "text-gray-500" : "text-gray-400"
                                }`}
                              >
                                {addr.addressLine2}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5">
                              <span
                                className={`text-xs ${
                                  isDarkMode ? "text-gray-400" : "text-gray-500"
                                }`}
                              >
                                {addr.city}
                              </span>
                              {addr.phoneNumber && (
                                <span
                                  className={`text-xs ${
                                    isDarkMode ? "text-gray-500" : "text-gray-400"
                                  }`}
                                >
                                  {formatPhoneForDisplay(addr.phoneNumber)}
                                </span>
                              )}
                            </div>
                            {addr.location && (
                              <p className={`text-[10px] mt-1 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}>
                                📍 {addr.location.latitude.toFixed(4)}, {addr.location.longitude.toFixed(4)}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}

                {/* Add New Address Button */}
                {savedAddresses.length < 4 && (
                  <button
                    onClick={() => {
                      setShowNewForm(true);
                      setSelectedAddressId(null);
                    }}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-colors ${
                      isDarkMode
                        ? "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300"
                        : "border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600"
                    }`}
                  >
                    <Plus className="w-4 h-4" />
                    {t("addNewAddress")}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Footer ─────────────────────────────────────────────── */}
          <div
            className={`px-5 py-4 border-t flex-shrink-0 ${
              isDarkMode ? "border-gray-800" : "border-gray-100"
            }`}
          >
            {showNewForm ? (
              <div className="flex gap-3">
                <button
                  onClick={() => setShowNewForm(false)}
                  className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors border ${
                    isDarkMode
                      ? "border-gray-700 text-gray-300 hover:bg-gray-800"
                      : "border-gray-200 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {t("back")}
                </button>
                <button
                  onClick={handleSaveNewAddress}
                  disabled={isSaving}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("saving")}
                    </>
                  ) : (
                    t("useThisAddress")
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={handleConfirmSelection}
                disabled={!selectedAddressId || isSaving}
                className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("saving")}
                  </>
                ) : (
                  t("useThisAddress")
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Map Modal */}
      {showMapModal && mapsLoaded && (
        <LocationPickerModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          onLocationSelect={(location) => { setFormAddress((prev) => ({ ...prev, location })); setShowMapModal(false); }}
          initialLocation={formAddress.location}
          isDarkMode={isDarkMode}
        />
      )}
    </>
  );
}
