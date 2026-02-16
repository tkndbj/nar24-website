"use client";

import React, { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  X,
  User,
  Plus,
  Edit2,
  Trash2,
  LogIn,
  RefreshCw,
  MapPin,
  Phone,
  CreditCard,
  Building,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslations } from "next-intl";

const LocationPickerModal = dynamic(
  () => import("@/app/components/profile/LocationPickerModal").then((mod) => ({ default: mod.LocationPickerModal })),
  { ssr: false }
);

// ============================================================================
// Phone number formatting utilities
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
// IBAN formatting utilities
// ============================================================================

const formatIbanNumber = (value: string): string => {
  let cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.startsWith("TR")) cleaned = cleaned.slice(2);
  const digitsOnly = cleaned.replace(/[^0-9]/g, "");
  const limited = digitsOnly.slice(0, 24);
  let formatted = "TR";
  for (let i = 0; i < limited.length; i++) {
    if (i === 2 || i === 6 || i === 10 || i === 14 || i === 18 || i === 22) formatted += " ";
    formatted += limited[i];
  }
  return formatted;
};

const formatIbanForDisplay = (iban: string): string => {
  if (!iban) return "";
  const cleaned = iban.toUpperCase().replace(/\s/g, "");
  if (cleaned.length !== 26 || !cleaned.startsWith("TR")) return iban;
  let formatted = "";
  for (let i = 0; i < cleaned.length; i++) {
    if (i === 4 || i === 8 || i === 12 || i === 16 || i === 20 || i === 24) formatted += " ";
    formatted += cleaned[i];
  }
  return formatted;
};

const normalizeIbanForStorage = (iban: string): string => {
  return iban.replace(/\s/g, "").toUpperCase();
};

const isValidTurkishIban = (iban: string): boolean => {
  const normalized = normalizeIbanForStorage(iban);
  return normalized.length === 26 && normalized.startsWith("TR") && /^TR\d{24}$/.test(normalized);
};

// ============================================================================

interface SellerInfo {
  ibanOwnerName: string;
  ibanOwnerSurname: string;
  phone: string;
  latitude: number;
  longitude: number;
  address: string;
  iban: string;
}

export default function SellerInfoPage() {
  const shopId = undefined;
  const router = useRouter();
  const { user } = useUser();
  const t = useTranslations();

  const l = (key: string) => {
    try {
      return t(key) || key.split(".").pop() || key;
    } catch {
      return key.split(".").pop() || key;
    }
  };

  const [isDark, setIsDark] = useState(false);
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [checkingProducts, setCheckingProducts] = useState(false);
  const [showCannotDeleteModal, setShowCannotDeleteModal] = useState(false);

  const [formData, setFormData] = useState({
    ibanOwnerName: "",
    ibanOwnerSurname: "",
    phone: "",
    latitude: null as number | null,
    longitude: null as number | null,
    address: "",
    iban: "",
  });

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

  // Load seller info
  const loadSellerInfo = useCallback(async () => {
    if (!user) { setSellerInfo(null); setIsLoading(false); return; }
    setIsLoading(true);
    try {
      const docRef = shopId
        ? doc(db, "shops", shopId, "seller_info", "info")
        : doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSellerInfo(shopId ? (data as SellerInfo) : (data.sellerInfo || null));
      } else {
        setSellerInfo(null);
      }
    } catch (error) {
      console.error("Error loading seller info:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, shopId]);

  useEffect(() => { loadSellerInfo(); }, [user, loadSellerInfo]);

  const checkUserHasListedProducts = async (): Promise<boolean> => {
    if (!user) return false;
    try {
      const productsQuery = shopId
        ? query(collection(db, "shop_products"), where("shopId", "==", shopId), limit(1))
        : query(collection(db, "products"), where("ownerId", "==", user.uid), limit(1));
      const snapshot = await getDocs(productsQuery);
      return !snapshot.empty;
    } catch (error) {
      console.error("Error checking user products:", error);
      return true;
    }
  };

  const handleInputChange = (field: string, value: string) => {
    if (field === "phone") {
      setFormData((prev) => ({ ...prev, [field]: formatPhoneNumber(value) }));
    } else if (field === "iban") {
      setFormData((prev) => ({ ...prev, [field]: formatIbanNumber(value) }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleLocationSelect = (lat: number, lng: number) => {
    setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }));
  };

  const resetForm = () => {
    setFormData({ ibanOwnerName: "", ibanOwnerSurname: "", phone: "", latitude: null, longitude: null, address: "", iban: "" });
    setShowAddModal(false);
  };

  const maskIban = (iban: string): string => {
    if (iban.length <= 8) return iban;
    return `${iban.substring(0, 4)}••••••••${iban.substring(iban.length - 4)}`;
  };

  const validateFormData = (): boolean => {
    const { ibanOwnerName, ibanOwnerSurname, phone, latitude, longitude, address, iban } = formData;
    if (!ibanOwnerName.trim() || !ibanOwnerSurname.trim() || !phone.trim() || latitude === null || longitude === null || !address.trim() || !iban.trim()) {
      alert(l("SellerInfoDrawer.fillAllFields") || "Please fill in all fields");
      return false;
    }
    if (!isValidPhoneNumber(phone)) {
      alert(l("SellerInfoDrawer.invalidPhone") || "Please enter a valid phone number starting with 5");
      return false;
    }
    if (!isValidTurkishIban(iban)) {
      alert(l("SellerInfoDrawer.invalidIban") || "Invalid IBAN. Turkish IBAN must be TR followed by 24 digits.");
      return false;
    }
    return true;
  };

  const handleSaveSellerInfo = async () => {
    if (!user || isSaving) return;
    if (!validateFormData()) return;
    setIsSaving(true);
    try {
      const sellerData: SellerInfo = {
        ibanOwnerName: formData.ibanOwnerName.trim(),
        ibanOwnerSurname: formData.ibanOwnerSurname.trim(),
        phone: normalizePhoneForStorage(formData.phone),
        latitude: formData.latitude!,
        longitude: formData.longitude!,
        address: formData.address.trim(),
        iban: normalizeIbanForStorage(formData.iban),
      };
      if (shopId) {
        const docRef = doc(db, "shops", shopId, "seller_info", "info");
        await setDoc(docRef, sellerData, { merge: true });
      } else {
        const docRef = doc(db, "users", user.uid);
        await updateDoc(docRef, { sellerInfo: sellerData });
      }
      await loadSellerInfo();
      resetForm();
    } catch (error) {
      console.error("Error saving seller info:", error);
      alert(l("SellerInfoDrawer.errorOccurred") || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSellerInfo = async () => {
    if (!user) return;
    setCheckingProducts(true);
    const hasProducts = await checkUserHasListedProducts();
    setCheckingProducts(false);
    if (hasProducts) { setShowCannotDeleteModal(true); return; }
    if (!confirm(l("SellerInfoDrawer.deleteConfirmation") || "Are you sure you want to delete your seller information?")) return;
    setIsDeleting(true);
    try {
      if (shopId) {
        await deleteDoc(doc(db, "shops", shopId, "seller_info", "info"));
      } else {
        await updateDoc(doc(db, "users", user.uid), { sellerInfo: null });
      }
      await loadSellerInfo();
    } catch (error) {
      console.error("Error deleting seller info:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const editSellerInfo = () => {
    if (sellerInfo) {
      setFormData({
        ibanOwnerName: sellerInfo.ibanOwnerName,
        ibanOwnerSurname: sellerInfo.ibanOwnerSurname,
        phone: formatPhoneForDisplay(sellerInfo.phone),
        latitude: sellerInfo.latitude,
        longitude: sellerInfo.longitude,
        address: sellerInfo.address,
        iban: formatIbanForDisplay(sellerInfo.iban),
      });
      setShowAddModal(true);
    }
  };

  const isFormValid =
    formData.ibanOwnerName.trim() &&
    formData.ibanOwnerSurname.trim() &&
    formData.phone.trim() &&
    formData.latitude !== null &&
    formData.longitude !== null &&
    formData.address.trim() &&
    formData.iban.trim() &&
    isValidPhoneNumber(formData.phone) &&
    isValidTurkishIban(formData.iban);

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isDark ? "bg-gray-950" : "bg-gray-50/50"}`}>
      <div className="max-w-lg mx-auto px-4 py-6 sm:py-10">
        {/* Back Button */}
        <div className="mb-3">
          <button
            onClick={() => router.back()}
            className={`p-2 rounded-lg transition-colors border ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700" : "bg-white hover:bg-gray-100 text-gray-500 border-gray-200"}`}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Main Card */}
        <div className={`rounded-2xl border shadow-sm ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
          {/* Header */}
          <div className={`px-5 py-4 sm:px-6 sm:py-5 border-b ${isDark ? "border-gray-800" : "border-gray-100"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                  <Building size={18} className={isDark ? "text-gray-400" : "text-gray-500"} />
                </div>
                <div>
                  <h1 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                    {l("SellerInfoDrawer.title") || "Seller Information"}
                  </h1>
                  {user && sellerInfo && (
                    <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      {l("SellerInfoDrawer.yourSellerDetails") || "Your seller details"}
                    </p>
                  )}
                </div>
              </div>

              {user && !sellerInfo && !isLoading && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors"
                >
                  <Plus size={14} />
                  <span>{l("SellerInfoDrawer.addSellerInfo") || "Add Info"}</span>
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="px-5 py-4 sm:px-6 sm:py-5">
            {/* Not Authenticated */}
            {!user ? (
              <div className="flex flex-col items-center py-10">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                  <User size={24} className={isDark ? "text-gray-500" : "text-gray-400"} />
                </div>
                <h3 className={`text-base font-bold mb-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>
                  {l("SellerInfoDrawer.loginRequired") || "Login Required"}
                </h3>
                <p className={`text-sm text-center mb-5 leading-relaxed ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                  {l("SellerInfoDrawer.loginToManageSellerInfo") || "Please login to view and manage your seller information."}
                </p>
                <button
                  onClick={() => router.push("/")}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
                >
                  <LogIn size={16} />
                  <span>{l("SellerInfoDrawer.login") || "Login"}</span>
                </button>
              </div>
            ) : isLoading ? (
              <div className="flex flex-col items-center py-10">
                <div className="w-6 h-6 border-[2px] border-orange-200 border-t-orange-500 rounded-full animate-spin mb-3" />
                <p className={`text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {l("SellerInfoDrawer.loading") || "Loading seller information..."}
                </p>
              </div>
            ) : !sellerInfo ? (
              /* Empty */
              <div className="flex flex-col items-center py-10">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                  <Building size={24} className={isDark ? "text-gray-500" : "text-gray-400"} />
                </div>
                <h3 className={`text-base font-bold mb-1.5 ${isDark ? "text-white" : "text-gray-900"}`}>
                  {l("SellerInfoDrawer.noSellerInfo") || "No Seller Information"}
                </h3>
                <p className={`text-sm text-center mb-5 leading-relaxed ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                  {l("SellerInfoDrawer.addSellerInfoDescription") || "Add your seller information to start selling products."}
                </p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
                >
                  <Plus size={16} />
                  <span>{l("SellerInfoDrawer.addSellerInfo") || "Add Seller Info"}</span>
                </button>
              </div>
            ) : (
              /* Seller Info Display */
              <div>
                {/* Name & Phone Header */}
                <div className="flex items-center space-x-3 mb-5">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center border ${isDark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                    <Building size={20} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                      {`${sellerInfo.ibanOwnerName} ${sellerInfo.ibanOwnerSurname}`.trim()}
                    </h3>
                    <div className={`flex items-center space-x-1.5 mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      <Phone size={12} />
                      <span className="text-xs">{formatPhoneForDisplay(sellerInfo.phone)}</span>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2.5">
                  {/* Location */}
                  <div className={`p-3 rounded-xl border ${isDark ? "bg-gray-800/50 border-gray-800" : "bg-gray-50/50 border-gray-100"}`}>
                    <div className="flex items-center space-x-1.5 mb-1">
                      <MapPin size={12} className={isDark ? "text-gray-600" : "text-gray-400"} />
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                        {l("SellerInfoDrawer.location") || "Location"}
                      </span>
                    </div>
                    <p className={`text-xs font-mono ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                      {sellerInfo.latitude.toFixed(4)}, {sellerInfo.longitude.toFixed(4)}
                    </p>
                  </div>

                  {/* Address */}
                  <div className={`p-3 rounded-xl border ${isDark ? "bg-gray-800/50 border-gray-800" : "bg-gray-50/50 border-gray-100"}`}>
                    <div className="flex items-center space-x-1.5 mb-1">
                      <MapPin size={12} className={isDark ? "text-gray-600" : "text-gray-400"} />
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                        {l("SellerInfoDrawer.addressDetails") || "Address"}
                      </span>
                    </div>
                    <p className={`text-xs ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                      {sellerInfo.address}
                    </p>
                  </div>

                  {/* IBAN */}
                  <div className={`p-3 rounded-xl border ${isDark ? "bg-gray-800/50 border-gray-800" : "bg-gray-50/50 border-gray-100"}`}>
                    <div className="flex items-center space-x-1.5 mb-1">
                      <CreditCard size={12} className={isDark ? "text-gray-600" : "text-gray-400"} />
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                        IBAN
                      </span>
                    </div>
                    <p className={`text-xs font-mono ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                      {maskIban(sellerInfo.iban)}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className={`flex items-center justify-end space-x-2 mt-5 pt-4 border-t ${isDark ? "border-gray-800" : "border-gray-100"}`}>
                  <button
                    onClick={editSellerInfo}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? "hover:bg-gray-800 text-gray-500 hover:text-blue-400" : "hover:bg-blue-50 text-gray-400 hover:text-blue-600"}`}
                  >
                    <Edit2 size={14} />
                    <span>{l("SellerInfoDrawer.edit") || "Edit"}</span>
                  </button>
                  <button
                    onClick={deleteSellerInfo}
                    disabled={isDeleting || checkingProducts}
                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${isDark ? "hover:bg-gray-800 text-gray-500 hover:text-red-400" : "hover:bg-red-50 text-gray-400 hover:text-red-600"} ${isDeleting || checkingProducts ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {isDeleting || checkingProducts ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    <span>
                      {checkingProducts ? l("SellerInfoDrawer.checking") || "Checking..." : isDeleting ? l("SellerInfoDrawer.deleting") || "Deleting..." : l("SellerInfoDrawer.delete") || "Delete"}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cannot Delete Modal */}
      {showCannotDeleteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCannotDeleteModal(false)}>
          <div
            className={`w-full max-w-sm rounded-2xl border shadow-lg p-5 sm:p-6 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-3 mb-3">
              <div className={`p-2 rounded-lg ${isDark ? "bg-red-900/30" : "bg-red-50"}`}>
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                {l("SellerInfoDrawer.cannotDelete") || "Cannot Delete"}
              </h3>
            </div>
            <p className={`text-sm mb-5 leading-relaxed ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {l("SellerInfoDrawer.cannotDeleteWithProducts") || "You cannot delete your seller information while you have listed products. Please delete all your products first."}
            </p>
            <button
              onClick={() => setShowCannotDeleteModal(false)}
              className={`w-full py-2.5 px-4 rounded-xl text-[13px] font-semibold transition-colors ${isDark ? "bg-gray-800 text-gray-200 hover:bg-gray-750" : "bg-gray-900 text-white hover:bg-gray-800"}`}
            >
              {l("SellerInfoDrawer.understood") || "OK"}
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
          <div className={`w-full max-w-sm rounded-2xl border shadow-lg p-5 sm:p-6 max-h-[85vh] overflow-y-auto ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-5">
              <h3 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                {sellerInfo
                  ? l("SellerInfoDrawer.editSellerInfo") || "Edit Seller Info"
                  : l("SellerInfoDrawer.newSellerInfo") || "New Seller Info"}
              </h3>
              <button onClick={resetForm} className={`p-1.5 rounded-lg transition-colors ${isDark ? "hover:bg-gray-800 text-gray-500" : "hover:bg-gray-100 text-gray-400"}`}>
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {/* IBAN Owner Name */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {l("SellerInfoDrawer.ibanOwnerName") || "IBAN Owner Name"} *
                </label>
                <input
                  type="text"
                  value={formData.ibanOwnerName}
                  onChange={(e) => handleInputChange("ibanOwnerName", e.target.value)}
                  placeholder={l("SellerInfoDrawer.ibanOwnerName") || "IBAN Owner Name"}
                  className={`w-full px-3 py-2.5 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600" : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"}`}
                />
              </div>

              {/* IBAN Owner Surname */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {l("SellerInfoDrawer.ibanOwnerSurname") || "IBAN Owner Surname"} *
                </label>
                <input
                  type="text"
                  value={formData.ibanOwnerSurname}
                  onChange={(e) => handleInputChange("ibanOwnerSurname", e.target.value)}
                  placeholder={l("SellerInfoDrawer.ibanOwnerSurname") || "IBAN Owner Surname"}
                  className={`w-full px-3 py-2.5 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600" : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"}`}
                />
              </div>

              {/* Phone */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {l("SellerInfoDrawer.phoneNumber") || "Phone Number"} *
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  placeholder="(5__) ___ __ __"
                  className={`w-full px-3 py-2.5 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600" : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"}`}
                />
                <p className={`mt-1 text-[10px] ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                  {l("SellerInfoDrawer.phoneFormatHint") || "Format: (5XX) XXX XX XX"}
                </p>
              </div>

              {/* Location */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {l("SellerInfoDrawer.location") || "Location"} *
                </label>
                <button
                  onClick={() => setShowLocationPicker(true)}
                  type="button"
                  className={`w-full px-3 py-2.5 rounded-xl border text-left flex items-center justify-between text-[13px] transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white hover:bg-gray-750" : "bg-white border-gray-200 text-gray-900 hover:bg-gray-50"} focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400`}
                >
                  <span className={formData.latitude !== null ? "" : (isDark ? "text-gray-600" : "text-gray-400")}>
                    {formData.latitude !== null && formData.longitude !== null
                      ? `${formData.latitude.toFixed(4)}, ${formData.longitude.toFixed(4)}`
                      : l("SellerInfoDrawer.pinLocationOnMap") || "Pin location on map"}
                  </span>
                  <MapPin size={14} className={formData.latitude !== null ? "text-orange-500" : (isDark ? "text-gray-600" : "text-gray-400")} />
                </button>
              </div>

              {/* Address */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {l("SellerInfoDrawer.addressDetails") || "Address Details"} *
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                  placeholder={l("SellerInfoDrawer.addressDetails") || "Address Details"}
                  rows={3}
                  className={`w-full px-3 py-2.5 rounded-xl border text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600" : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"}`}
                />
              </div>

              {/* IBAN */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {l("SellerInfoDrawer.bankAccountNumberIban") || "IBAN"} *
                </label>
                <input
                  type="text"
                  value={formData.iban}
                  onChange={(e) => handleInputChange("iban", e.target.value)}
                  placeholder="TR__ ____ ____ ____ ____ ____ __"
                  className={`w-full px-3 py-2.5 rounded-xl border text-[13px] font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600" : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"}`}
                />
                <p className={`mt-1 text-[10px] ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                  {l("SellerInfoDrawer.ibanFormatHint") || "Format: TR + 24 digits"}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex space-x-3 mt-6">
              <button
                onClick={resetForm}
                disabled={isSaving}
                className={`flex-1 py-2.5 px-4 rounded-xl text-[13px] font-medium transition-colors ${isDark ? "bg-gray-800 text-gray-300 hover:bg-gray-750" : "bg-gray-100 text-gray-700 hover:bg-gray-200"} ${isSaving ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {l("SellerInfoDrawer.cancel") || "Cancel"}
              </button>
              <button
                onClick={handleSaveSellerInfo}
                disabled={isSaving || !isFormValid}
                className="flex-1 py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center space-x-1.5"
              >
                {isSaving ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>{l("SellerInfoDrawer.saving") || "Saving..."}</span>
                  </>
                ) : (
                  <span>{l("SellerInfoDrawer.save") || "Save"}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location Picker */}
      {showLocationPicker && (
        <LocationPickerModal
          isOpen={showLocationPicker}
          onClose={() => setShowLocationPicker(false)}
          onLocationSelect={handleLocationSelect}
          initialLocation={
            formData.latitude !== null && formData.longitude !== null
              ? { lat: formData.latitude, lng: formData.longitude }
              : null
          }
          isDarkMode={isDark}
        />
      )}
    </div>
  );
}