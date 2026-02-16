"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeftIcon,
  MapPinIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  StarIcon,
  UserIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  MapIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { useUser } from "@/context/UserProvider";
import { GeoPoint } from "firebase/firestore";
import { useRouter } from "next/navigation";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslations } from "next-intl";
import regionsList from "@/constants/regions";
import { toast } from "react-hot-toast";

// ============================================================================
// Phone number formatting utilities (matching Flutter implementation)
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

const normalizePhoneForStorage = (phone: string): string => {
  const digitsOnly = phone.replace(/\D/g, "");
  return digitsOnly.startsWith("0") ? digitsOnly : `0${digitsOnly}`;
};

const isValidPhoneNumber = (phone: string): boolean => {
  const digitsOnly = phone.replace(/\D/g, "");
  return digitsOnly.length === 10 && digitsOnly.startsWith("5");
};

// ============================================================================
// Google Maps loader
// ============================================================================

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

// ============================================================================

interface Address {
  id: string;
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
  city: string;
  isPreferred: boolean;
  location?: { latitude: number; longitude: number };
}

export default function SavedAddressesPage() {
  const router = useRouter();
  const t = useTranslations();
  const { user, isLoading: isAuthLoading } = useUser();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [removingItems, setRemovingItems] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  const [formData, setFormData] = useState({
    addressLine1: "",
    addressLine2: "",
    phoneNumber: "",
    city: "",
    location: null as { latitude: number; longitude: number } | null,
  });
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);

  const l = (key: string) => {
    try { return t(key); } catch { return key.split(".").pop() || key; }
  };

  // Theme detection
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }
    const checkTheme = () => setIsDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Load Google Maps
  useEffect(() => {
    if (typeof window !== "undefined") {
      loadGoogleMapsScript()
        .then(() => setMapsLoaded(true))
        .catch((err) => console.error("Failed to load Google Maps:", err));
    }
  }, []);

  // Load addresses
  const loadAddresses = useCallback(async () => {
    if (!user) { setAddresses([]); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const addressesRef = collection(db, "users", user.uid, "addresses");
      const snapshot = await getDocs(addressesRef);
      const addressList: Address[] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Address[];
      addressList.sort((a, b) => {
        if (a.isPreferred && !b.isPreferred) return -1;
        if (!a.isPreferred && b.isPreferred) return 1;
        return 0;
      });
      setAddresses(addressList);
    } catch (error) {
      console.error("Error loading addresses:", error);
      toast.error(l("SavedAddressesDrawer.loadError") || "Failed to load addresses");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => { loadAddresses(); }, [user, loadAddresses]);

  // Form input
  const handleInputChange = (field: string, value: string) => {
    if (field === "phoneNumber") {
      setFormData((prev) => ({ ...prev, [field]: formatPhoneNumber(value) }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  // Save address
  const handleSaveAddress = async () => {
    if (!user) return;
    const { addressLine1, phoneNumber, city } = formData;
    if (!addressLine1.trim() || !phoneNumber.trim() || !city.trim()) {
      toast.error(l("SavedAddressesDrawer.fillAllFields") || "Please fill in all required fields");
      return;
    }
    if (!isValidPhoneNumber(phoneNumber)) {
      toast.error(l("SavedAddressesDrawer.invalidPhoneNumber") || "Please enter a valid phone number starting with 5");
      return;
    }
    if (!editingAddress && addresses.length >= 4) {
      toast.error(l("SavedAddressesDrawer.maxAddressesReached") || "Maximum 4 addresses allowed");
      return;
    }
    try {
      const addressesRef = collection(db, "users", user.uid, "addresses");
      const normalizedPhone = normalizePhoneForStorage(phoneNumber);
      const addressData = {
        addressLine1: addressLine1.trim(),
        addressLine2: formData.addressLine2.trim(),
        phoneNumber: normalizedPhone,
        city: city.trim(),
        ...(formData.location && { location: new GeoPoint(formData.location.latitude, formData.location.longitude) }),
      };
      if (editingAddress) {
        const docRef = doc(db, "users", user.uid, "addresses", editingAddress.id);
        await updateDoc(docRef, addressData);
        toast.success(l("SavedAddressesDrawer.addressUpdated") || "Address updated", { style: { borderRadius: "10px", background: "#10B981", color: "#fff" } });
      } else {
        const isFirstAddress = addresses.length === 0;
        await addDoc(addressesRef, { ...addressData, isPreferred: isFirstAddress });
        toast.success(l("SavedAddressesDrawer.addressAdded") || "Address added", { style: { borderRadius: "10px", background: "#10B981", color: "#fff" } });
      }
      await loadAddresses();
      resetForm();
    } catch (error) {
      console.error("Error saving address:", error);
      toast.error(l("SavedAddressesDrawer.errorOccurred") || "An error occurred");
    }
  };

  // Set preferred
  const setAsPreferred = async (addressId: string) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      addresses.forEach((address) => {
        const docRef = doc(db, "users", user.uid, "addresses", address.id);
        batch.update(docRef, { isPreferred: false });
      });
      const selectedDocRef = doc(db, "users", user.uid, "addresses", addressId);
      batch.update(selectedDocRef, { isPreferred: true });
      await batch.commit();
      toast.success(l("SavedAddressesDrawer.preferredAddressSet") || "Preferred address set", { style: { borderRadius: "10px", background: "#10B981", color: "#fff" } });
      await loadAddresses();
    } catch (error) {
      console.error("Error setting preferred:", error);
      toast.error(l("SavedAddressesDrawer.errorOccurred") || "An error occurred");
    }
  };

  // Delete address
  const deleteAddress = async (addressId: string) => {
    if (!user) return;
    if (!confirm(l("SavedAddressesDrawer.deleteConfirmation") || "Are you sure you want to delete this address?")) return;
    setRemovingItems((prev) => new Set(prev).add(addressId));
    try {
      await deleteDoc(doc(db, "users", user.uid, "addresses", addressId));
      toast.success(l("SavedAddressesDrawer.addressDeleted") || "Address deleted", { style: { borderRadius: "10px", background: "#10B981", color: "#fff" } });
      await loadAddresses();
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error(l("SavedAddressesDrawer.errorOccurred") || "An error occurred");
    } finally {
      setRemovingItems((prev) => { const s = new Set(prev); s.delete(addressId); return s; });
    }
  };

  // Clear all
  const clearAllAddresses = async () => {
    if (!user) return;
    if (!confirm(l("SavedAddressesDrawer.deleteAllConfirmation") || "Delete all addresses?")) return;
    setIsClearing(true);
    try {
      const batch = writeBatch(db);
      addresses.forEach((a) => batch.delete(doc(db, "users", user.uid, "addresses", a.id)));
      await batch.commit();
      toast.success(l("SavedAddressesDrawer.allAddressesCleared") || "All addresses cleared", { style: { borderRadius: "10px", background: "#10B981", color: "#fff" } });
      await loadAddresses();
    } catch (error) {
      console.error("Error clearing:", error);
      toast.error(l("SavedAddressesDrawer.errorOccurred") || "An error occurred");
    } finally {
      setIsClearing(false);
    }
  };

  // Edit address
  const editAddress = (address: Address) => {
    setFormData({
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      phoneNumber: formatPhoneForDisplay(address.phoneNumber),
      city: address.city,
      location: address.location || null,
    });
    setEditingAddress(address);
    setShowAddModal(true);
  };

  // Reset form
  const resetForm = () => {
    setFormData({ addressLine1: "", addressLine2: "", phoneNumber: "", city: "", location: null });
    setShowAddModal(false);
    setEditingAddress(null);
    setShowCityDropdown(false);
  };

  const formatCoordinates = (loc?: { latitude: number; longitude: number }) => {
    if (!loc) return "";
    return `${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`;
  };

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isDark ? "bg-gray-950" : "bg-gray-50/50"}`}>
      <div className="max-w-lg mx-auto px-4 py-4 sm:py-6">
        {/* Top Row */}
        <div className="flex justify-between items-center mb-3">
          <button
            onClick={() => router.back()}
            className={`p-2 rounded-lg transition-colors border ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700" : "bg-white hover:bg-gray-100 text-gray-500 border-gray-200"}`}
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Main Card */}
        <div className={`rounded-2xl border shadow-sm ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
          {/* Header */}
          <div className={`px-5 py-4 sm:px-6 sm:py-5 border-b ${isDark ? "border-gray-800" : "border-gray-100"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                  <MapPinIcon className={`w-5 h-5 ${isDark ? "text-gray-400" : "text-gray-500"}`} />
                </div>
                <div>
                  <h1 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                    {l("SavedAddressesDrawer.title") || "Saved Addresses"}
                  </h1>
                  {user && addresses.length > 0 && (
                    <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      {addresses.length} {l("SavedAddressesDrawer.ofFourAddresses") || "of 4 addresses"}
                    </p>
                  )}
                </div>
              </div>
              {user && addresses.length < 4 && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors flex items-center space-x-1.5"
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  <span>{l("SavedAddressesDrawer.addNew") || "Add"}</span>
                </button>
              )}
            </div>
            {user && addresses.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={clearAllAddresses}
                  disabled={isClearing}
                  className={`flex items-center space-x-1.5 text-xs transition-colors ${isDark ? "text-red-400 hover:text-red-300" : "text-red-500 hover:text-red-600"} ${isClearing ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {isClearing ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <TrashIcon className="w-3.5 h-3.5" />}
                  <span>{isClearing ? l("SavedAddressesDrawer.clearing") || "Clearing..." : l("SavedAddressesDrawer.clearAll") || "Clear All"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="px-5 py-4 sm:px-6 sm:py-5">
            {isAuthLoading ? (
              /* Auth loading */
              <div className="flex flex-col items-center py-10">
                <div className="w-5 h-5 border-[2px] border-orange-200 border-t-orange-500 rounded-full animate-spin mb-3" />
              </div>
            ) : !user ? (
              <div className="flex flex-col items-center py-10">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                  <UserIcon className={`w-7 h-7 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                </div>
                <h3 className={`text-base font-bold mb-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>
                  {l("SavedAddressesDrawer.loginRequired") || "Login Required"}
                </h3>
                <p className={`text-sm text-center mb-6 leading-relaxed ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                  {l("SavedAddressesDrawer.loginToManageAddresses") || "Please login to manage your saved addresses."}
                </p>
                <button
                  onClick={() => router.push("/")}
                  className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
                >
                  {l("SavedAddressesDrawer.login") || "Login"}
                </button>
              </div>
            ) : isLoading ? (
              /* Loading */
              <div className="flex flex-col items-center py-10">
                <div className="w-5 h-5 border-[2px] border-orange-200 border-t-orange-500 rounded-full animate-spin mb-3" />
                <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                  {l("SavedAddressesDrawer.loading") || "Loading addresses..."}
                </p>
              </div>
            ) : addresses.length === 0 ? (
              /* Empty */
              <div className="flex flex-col items-center py-10">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                  <MapPinIcon className={`w-7 h-7 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                </div>
                <h3 className={`text-base font-bold mb-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>
                  {l("SavedAddressesDrawer.noSavedAddresses") || "No Saved Addresses"}
                </h3>
                <p className={`text-sm text-center mb-6 leading-relaxed ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                  {l("SavedAddressesDrawer.addFirstAddress") || "Add your first address to get started."}
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors flex items-center space-x-2"
                >
                  <PlusIcon className="w-4 h-4" />
                  <span>{l("SavedAddressesDrawer.addNewAddress") || "Add Address"}</span>
                </button>
              </div>
            ) : (
              /* Address List */
              <div className="space-y-3">
                {addresses.map((address) => {
                  const isRemoving = removingItems.has(address.id);
                  let subtitle = "";
                  if (address.addressLine2?.trim()) subtitle += address.addressLine2;
                  if (address.city?.trim()) { if (subtitle) subtitle += " · "; subtitle += address.city; }

                  return (
                    <div
                      key={address.id}
                      className={`transition-all duration-200 ${isRemoving ? "opacity-50 scale-[0.98]" : ""}`}
                    >
                      <div
                        onClick={() => !address.isPreferred && setAsPreferred(address.id)}
                        className={`rounded-xl border p-4 transition-colors cursor-pointer ${
                          isDark
                            ? "bg-gray-800/50 border-gray-800 hover:border-gray-700"
                            : "bg-gray-50/50 border-gray-100 hover:border-gray-200"
                        } ${address.isPreferred ? (isDark ? "ring-1 ring-orange-500/50 border-orange-500/30" : "ring-1 ring-orange-500/40 border-orange-200") : ""}`}
                      >
                        <div className="flex items-start space-x-3">
                          {/* Icon */}
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                            <MapPinIcon className="w-4 h-4 text-orange-500" />
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <h3 className={`text-sm font-semibold pr-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                                {address.addressLine1}
                              </h3>
                              {address.isPreferred && (
                                <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-semibold flex-shrink-0">
                                  <StarIconSolid className="w-2.5 h-2.5" />
                                  <span>{l("SavedAddressesDrawer.preferred") || "Preferred"}</span>
                                </span>
                              )}
                            </div>
                            {subtitle && (
                              <p className={`text-xs mt-0.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{subtitle}</p>
                            )}
                            {address.phoneNumber && (
                              <p className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                                {formatPhoneForDisplay(address.phoneNumber)}
                              </p>
                            )}
                            {address.location && (
                              <p className={`text-[10px] mt-1 ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                                📍 {formatCoordinates(address.location)}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className={`flex items-center justify-end space-x-1 mt-3 pt-3 border-t ${isDark ? "border-gray-700/50" : "border-gray-200/80"}`}>
                          <button
                            onClick={(e) => { e.stopPropagation(); editAddress(address); }}
                            className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-gray-700 text-gray-500 hover:text-indigo-400" : "hover:bg-indigo-50 text-gray-400 hover:text-indigo-600"}`}
                          >
                            <PencilSquareIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteAddress(address.id); }}
                            disabled={isRemoving}
                            className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-gray-700 text-gray-500 hover:text-red-400" : "hover:bg-red-50 text-gray-400 hover:text-red-600"} ${isRemoving ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {isRemoving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* Add/Edit Modal */}
      {/* ================================================================ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className={`w-full max-w-sm rounded-2xl border shadow-xl max-h-[85vh] overflow-y-auto ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
            <div className={`sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
              <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                {editingAddress ? l("SavedAddressesDrawer.editAddress") || "Edit Address" : l("SavedAddressesDrawer.newAddress") || "New Address"}
              </h3>
              <button onClick={resetForm} className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-gray-800 text-gray-500" : "hover:bg-gray-100 text-gray-400"}`}>
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Address Line 1 */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {l("SavedAddressesDrawer.addressLine1") || "Address Line 1"} *
                </label>
                <input
                  type="text"
                  value={formData.addressLine1}
                  onChange={(e) => handleInputChange("addressLine1", e.target.value)}
                  placeholder={l("SavedAddressesDrawer.addressLine1") || "Address Line 1"}
                  className={`w-full px-3 py-2.5 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600" : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"}`}
                />
              </div>

              {/* Address Line 2 */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {l("SavedAddressesDrawer.addressLine2") || "Address Line 2"}
                </label>
                <input
                  type="text"
                  value={formData.addressLine2}
                  onChange={(e) => handleInputChange("addressLine2", e.target.value)}
                  placeholder={l("SavedAddressesDrawer.addressLine2") || "Address Line 2"}
                  className={`w-full px-3 py-2.5 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600" : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"}`}
                />
              </div>

              {/* Phone Number */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {l("SavedAddressesDrawer.phoneNumber") || "Phone Number"} *
                </label>
                <input
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                  placeholder="(5__) ___ __ __"
                  className={`w-full px-3 py-2.5 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600" : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"}`}
                />
                <p className={`mt-1 text-[10px] ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                  {l("SavedAddressesDrawer.phoneFormatHint") || "Format: (5XX) XXX XX XX"}
                </p>
              </div>

              {/* City Dropdown */}
              <div className="relative">
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {l("SavedAddressesDrawer.city") || "City"} *
                </label>
                <button
                  onClick={() => setShowCityDropdown(!showCityDropdown)}
                  className={`w-full px-3 py-2.5 rounded-xl border text-[13px] text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-200 text-gray-900"}`}
                >
                  <span className={formData.city ? "" : (isDark ? "text-gray-600" : "text-gray-400")}>
                    {formData.city || l("SavedAddressesDrawer.selectCity") || "Select City"}
                  </span>
                  <ChevronDownIcon className={`w-4 h-4 ${isDark ? "text-gray-600" : "text-gray-400"}`} />
                </button>
                {showCityDropdown && (
                  <div className={`absolute top-full left-0 right-0 mt-1 border rounded-xl shadow-lg z-20 max-h-40 overflow-y-auto ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                    {regionsList.map((city) => (
                      <button
                        key={city}
                        onClick={() => { handleInputChange("city", city); setShowCityDropdown(false); }}
                        className={`w-full px-3 py-2 text-left text-sm transition-colors ${isDark ? "text-gray-200 hover:bg-gray-700" : "text-gray-900 hover:bg-gray-50"}`}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Location Picker */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {l("SavedAddressesDrawer.location") || "Location"}
                </label>
                <button
                  type="button"
                  onClick={() => { if (mapsLoaded) setShowMapModal(true); }}
                  disabled={!mapsLoaded}
                  className={`w-full px-3 py-2.5 rounded-xl border text-[13px] text-left flex items-center justify-between transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white hover:border-gray-600" : "bg-white border-gray-200 text-gray-900 hover:border-gray-300"} ${!mapsLoaded ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span className={formData.location ? "" : (isDark ? "text-gray-600" : "text-gray-400")}>
                    {formData.location
                      ? `${formData.location.latitude.toFixed(4)}, ${formData.location.longitude.toFixed(4)}`
                      : !mapsLoaded ? "Loading Maps..." : l("SavedAddressesDrawer.selectOnMap") || "Select on Map"}
                  </span>
                  <MapIcon className={`w-4 h-4 ${isDark ? "text-gray-600" : "text-gray-400"}`} />
                </button>
              </div>
            </div>

            {/* Modal Actions */}
            <div className={`sticky bottom-0 px-5 py-4 border-t flex space-x-3 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
              <button
                onClick={resetForm}
                className={`flex-1 py-2.5 px-4 rounded-xl text-[13px] font-medium border transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}
              >
                {l("SavedAddressesDrawer.cancel") || "Cancel"}
              </button>
              <button
                onClick={handleSaveAddress}
                disabled={!formData.addressLine1.trim() || !formData.phoneNumber.trim() || !formData.city.trim() || !isValidPhoneNumber(formData.phoneNumber)}
                className="flex-1 py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
              >
                {l("SavedAddressesDrawer.save") || "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Map Modal */}
      {/* ================================================================ */}
      {showMapModal && mapsLoaded && (
        <LocationPickerModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          onLocationSelect={(location) => { setFormData((prev) => ({ ...prev, location })); setShowMapModal(false); }}
          initialLocation={formData.location}
          isDarkMode={isDark}
          localization={l}
        />
      )}
    </div>
  );
}

// ============================================================================
// Location Picker Modal (kept intact, just styled to match)
// ============================================================================

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLocationSelect: (location: { latitude: number; longitude: number }) => void;
  initialLocation?: { latitude: number; longitude: number } | null;
  isDarkMode: boolean;
  localization: (key: string) => string;
}

const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  onLocationSelect,
  initialLocation,
  isDarkMode,
  localization: l,
}) => {
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(initialLocation || null);
  const [lastClickTime, setLastClickTime] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

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
        const marker = new AdvancedMarkerElement({ map, position: mapCenter, title: l("SavedAddressesDrawer.clickToSelectLocation") || "Click to select" });
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
  }, [isOpen, initialLocation, isDarkMode, l]);

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
        () => { alert(l("SavedAddressesDrawer.locationError") || "Could not get your location."); },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
  }, [l]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className={`w-full max-w-3xl h-[75vh] rounded-2xl overflow-hidden shadow-xl flex flex-col border ${isDarkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}>
          <h3 className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {l("SavedAddressesDrawer.selectLocation") || "Select Location"}
          </h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={getCurrentLocation}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${isDarkMode ? "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700" : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"}`}
            >
              {l("SavedAddressesDrawer.useCurrentLocation") || "My Location"}
            </button>
            <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? "hover:bg-gray-800 text-gray-500" : "hover:bg-gray-100 text-gray-400"}`}>
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <div ref={mapRef} className="w-full h-full" style={{ minHeight: "300px" }} />
          {selectedLocation && (
            <div className={`absolute bottom-3 left-3 right-3 p-3 rounded-xl shadow-lg border ${isDarkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
              <p className={`text-xs font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                {l("SavedAddressesDrawer.selectedLocation") || "Selected"}:
              </p>
              <p className={`text-xs font-mono mt-0.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between px-4 py-3 border-t ${isDarkMode ? "border-gray-800" : "border-gray-100"}`}>
          <p className={`text-[11px] ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}>
            {l("SavedAddressesDrawer.clickToSelectLocation") || "Click on the map to select a location"}
          </p>
          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${isDarkMode ? "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}
            >
              {l("SavedAddressesDrawer.cancel") || "Cancel"}
            </button>
            <button
              onClick={() => { if (selectedLocation) onLocationSelect(selectedLocation); }}
              disabled={!selectedLocation}
              className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
            >
              {l("SavedAddressesDrawer.confirm") || "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};