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
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useTranslations } from "next-intl";
import { allRegionsList, getMainRegion } from "@/constants/regions";
import { toast } from "react-hot-toast";

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

// ── Component ────────────────────────────────────────────────────────────────

export default function FoodLocationPicker({
  isOpen,
  onClose,
  isDarkMode,
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
    city: "",
  });
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [citySearch, setCitySearch] = useState("");

  const cityDropdownRef = useRef<HTMLDivElement>(null);

  // Close city dropdown on outside click
  useEffect(() => {
    if (!showCityDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(e.target as Node)) {
        setShowCityDropdown(false);
        setCitySearch("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showCityDropdown]);

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
        const currentFoodAddress = profileData?.foodAddress;
        if (currentFoodAddress?.addressId) {
          setSelectedAddressId(currentFoodAddress.addressId);
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
      setFormAddress({ addressLine1: "", addressLine2: "", phoneNumber: "", city: "" });
      setErrors({});
      setCitySearch("");
    }
  }, [showNewForm]);

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
      const { collection, addDoc } = await import("firebase/firestore");
      const { getFirebaseDb } = await import("@/lib/firebase-lazy");
      const db = await getFirebaseDb();
      const normalizedPhone = normalizePhone(formAddress.phoneNumber);
      const mainRegion = getMainRegion(formAddress.city) || formAddress.city;

      const docRef = await addDoc(
        collection(db, "users", user.uid, "addresses"),
        {
          addressLine1: formAddress.addressLine1.trim(),
          addressLine2: formAddress.addressLine2.trim(),
          phoneNumber: normalizedPhone,
          city: formAddress.city,
        }
      );

      // Set as foodAddress on user doc
      await updateProfileData({
        foodAddress: {
          addressId: docRef.id,
          addressLine1: formAddress.addressLine1.trim(),
          addressLine2: formAddress.addressLine2.trim(),
          city: formAddress.city,
          mainRegion,
          phoneNumber: normalizedPhone,
        },
      });

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
      const mainRegion = getMainRegion(selected.city) || selected.city;

      await updateProfileData({
        foodAddress: {
          addressId: selected.id,
          addressLine1: selected.addressLine1,
          addressLine2: selected.addressLine2 || "",
          city: selected.city,
          mainRegion,
          phoneNumber: selected.phoneNumber || "",
          ...(selected.location ? { location: selected.location } : {}),
        },
      });

      toast.success(t("addressSelectedSuccess"));
      onClose();
    } catch (err) {
      console.error("[FoodLocationPicker] Error selecting address:", err);
    } finally {
      setIsSaving(false);
    }
  }, [user, selectedAddressId, savedAddresses, updateProfileData, t, onClose]);

  const filteredCities = citySearch
    ? allRegionsList.filter((c) =>
        c.toLowerCase().includes(citySearch.toLowerCase())
      )
    : allRegionsList;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
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

              {/* City Dropdown */}
              <div className="relative" ref={cityDropdownRef}>
                <label
                  className={`text-xs font-medium ${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  }`}
                >
                  {t("selectRegion")} *
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
                      formAddress.city
                        ? isDarkMode
                          ? "text-white"
                          : "text-gray-900"
                        : isDarkMode
                          ? "text-gray-600"
                          : "text-gray-400"
                    }
                  >
                    {formAddress.city || t("selectRegion")}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${
                      showCityDropdown ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {showCityDropdown && (
                  <div
                    className={`absolute top-full left-0 right-0 mt-1 border rounded-xl shadow-xl z-20 max-h-48 overflow-hidden flex flex-col backdrop-blur-sm ${
                      isDarkMode
                        ? "bg-gray-800/95 border-gray-600"
                        : "bg-white/95 border-gray-300"
                    }`}
                  >
                    <input
                      type="text"
                      value={citySearch}
                      onChange={(e) => setCitySearch(e.target.value)}
                      placeholder="..."
                      autoFocus
                      className={`w-full px-3 py-2 text-sm border-b outline-none ${
                        isDarkMode
                          ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600"
                          : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"
                      }`}
                    />
                    <div className="overflow-y-auto max-h-40">
                      {filteredCities.map((city) => (
                        <button
                          key={city}
                          type="button"
                          onClick={() => {
                            setFormAddress((a) => ({ ...a, city }));
                            setShowCityDropdown(false);
                            setCitySearch("");
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
                  </div>
                )}
                {errors.city && (
                  <p className="mt-1 text-xs text-red-500">{errors.city}</p>
                )}
              </div>

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
  );
}
