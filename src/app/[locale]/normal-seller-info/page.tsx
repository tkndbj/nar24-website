"use client";

import React, { useState, useEffect } from "react";
import { useUser } from "@/context/UserProvider";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CreditCard,
  Phone,
  MapPin,
  Edit2,
  Trash2,
  Plus,
  X,
  Check,
  AlertCircle,
  Loader2,
  Building2,
  User,
  FileText,
} from "lucide-react";
import Image from "next/image";

interface SellerInfo {
  ibanOwnerName: string;
  ibanOwnerSurname: string;
  phone: string;
  latitude: number;
  longitude: number;
  address: string;
  iban: string;
}

// ✅ IBAN masking utility (matches Flutter)
const maskIban = (iban: string): string => {
  if (iban.length <= 8) return iban;
  const start = iban.substring(0, 4);
  const end = iban.substring(iban.length - 4);
  return `${start}••••••••${end}`;
};

// ✅ Form Modal Component
interface SellerInfoFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: SellerInfo) => Promise<void>;
  initialData?: SellerInfo | null;
  isDarkMode: boolean;
  t: ReturnType<typeof useTranslations>;
}

const SellerInfoFormModal: React.FC<SellerInfoFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  isDarkMode,
  t,
}) => {
  const [formData, setFormData] = useState<SellerInfo>({
    ibanOwnerName: "",
    ibanOwnerSurname: "",
    phone: "",
    latitude: 0,
    longitude: 0,
    address: "",
    iban: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen && initialData) {
      setFormData(initialData);
    } else if (isOpen) {
      setFormData({
        ibanOwnerName: "",
        ibanOwnerSurname: "",
        phone: "",
        latitude: 0,
        longitude: 0,
        address: "",
        iban: "",
      });
    }
    setErrors({});
  }, [isOpen, initialData]);

  const handleInputChange = (field: keyof SellerInfo, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: false }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, boolean> = {};

    if (!formData.ibanOwnerName.trim()) newErrors.ibanOwnerName = true;
    if (!formData.ibanOwnerSurname.trim()) newErrors.ibanOwnerSurname = true;
    if (!formData.phone.trim()) newErrors.phone = true;
    if (!formData.address.trim()) newErrors.address = true;
    if (!formData.iban.trim()) newErrors.iban = true;
    if (formData.latitude === 0 && formData.longitude === 0) newErrors.location = true;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData((prev) => ({
            ...prev,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }));
          setErrors((prev) => ({ ...prev, location: false }));
        },
        (error) => {
          console.error("Error getting location:", error);
          alert(t("SellerInfo.locationError"));
        }
      );
    } else {
      alert(t("SellerInfo.locationNotSupported"));
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error) {
      console.error("Error saving seller info:", error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl shadow-2xl ${
          isDarkMode ? "bg-gray-800" : "bg-white"
        }`}
      >
        {/* Header */}
        <div
          className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b ${
            isDarkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
          }`}
        >
          <h2
            className={`text-lg font-bold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {initialData
              ? t("SellerInfo.editSellerInfo")
              : t("SellerInfo.addSellerInfoTitle")}
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition-colors ${
              isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
            }`}
          >
            <X
              className={`w-5 h-5 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
            />
          </button>
        </div>

        {/* Form Content */}
        <div className="overflow-y-auto p-4 space-y-4" style={{ maxHeight: "calc(90vh - 140px)" }}>
          {/* IBAN Owner Name */}
          <div>
            <label
              className={`block text-sm font-medium mb-1.5 ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {t("SellerInfo.ibanOwnerName")}
            </label>
            <input
              type="text"
              value={formData.ibanOwnerName}
              onChange={(e) => handleInputChange("ibanOwnerName", e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border transition-colors ${
                errors.ibanOwnerName
                  ? "border-red-500 focus:border-red-500"
                  : isDarkMode
                  ? "border-gray-600 bg-gray-700 text-white focus:border-emerald-500"
                  : "border-gray-300 bg-gray-50 text-gray-900 focus:border-emerald-500"
              } outline-none`}
              placeholder={t("SellerInfo.ibanOwnerNamePlaceholder")}
            />
          </div>

          {/* IBAN Owner Surname */}
          <div>
            <label
              className={`block text-sm font-medium mb-1.5 ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {t("SellerInfo.ibanOwnerSurname")}
            </label>
            <input
              type="text"
              value={formData.ibanOwnerSurname}
              onChange={(e) => handleInputChange("ibanOwnerSurname", e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border transition-colors ${
                errors.ibanOwnerSurname
                  ? "border-red-500 focus:border-red-500"
                  : isDarkMode
                  ? "border-gray-600 bg-gray-700 text-white focus:border-emerald-500"
                  : "border-gray-300 bg-gray-50 text-gray-900 focus:border-emerald-500"
              } outline-none`}
              placeholder={t("SellerInfo.ibanOwnerSurnamePlaceholder")}
            />
          </div>

          {/* Phone Number */}
          <div>
            <label
              className={`block text-sm font-medium mb-1.5 ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {t("SellerInfo.phoneNumber")}
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange("phone", e.target.value)}
              className={`w-full px-4 py-3 rounded-xl border transition-colors ${
                errors.phone
                  ? "border-red-500 focus:border-red-500"
                  : isDarkMode
                  ? "border-gray-600 bg-gray-700 text-white focus:border-emerald-500"
                  : "border-gray-300 bg-gray-50 text-gray-900 focus:border-emerald-500"
              } outline-none`}
              placeholder={t("SellerInfo.phoneNumberPlaceholder")}
            />
          </div>

          {/* Location Picker */}
          <div>
            <label
              className={`block text-sm font-medium mb-1.5 ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {t("SellerInfo.location")}
            </label>
            <button
              type="button"
              onClick={handleGetLocation}
              className={`w-full px-4 py-3 rounded-xl border transition-colors flex items-center justify-between ${
                errors.location
                  ? "border-red-500"
                  : isDarkMode
                  ? "border-gray-600 bg-gray-700 hover:bg-gray-600"
                  : "border-gray-300 bg-gray-50 hover:bg-gray-100"
              }`}
            >
              <span
                className={
                  formData.latitude !== 0
                    ? isDarkMode
                      ? "text-white"
                      : "text-gray-900"
                    : isDarkMode
                    ? "text-gray-400"
                    : "text-gray-500"
                }
              >
                {formData.latitude !== 0
                  ? `${formData.latitude.toFixed(4)}, ${formData.longitude.toFixed(4)}`
                  : t("SellerInfo.pinLocationOnMap")}
              </span>
              <MapPin
                className={`w-5 h-5 ${
                  formData.latitude !== 0
                    ? "text-emerald-500"
                    : isDarkMode
                    ? "text-gray-400"
                    : "text-gray-500"
                }`}
              />
            </button>
          </div>

          {/* Address */}
          <div>
            <label
              className={`block text-sm font-medium mb-1.5 ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {t("SellerInfo.addressDetails")}
            </label>
            <textarea
              value={formData.address}
              onChange={(e) => handleInputChange("address", e.target.value)}
              rows={3}
              className={`w-full px-4 py-3 rounded-xl border transition-colors resize-none ${
                errors.address
                  ? "border-red-500 focus:border-red-500"
                  : isDarkMode
                  ? "border-gray-600 bg-gray-700 text-white focus:border-emerald-500"
                  : "border-gray-300 bg-gray-50 text-gray-900 focus:border-emerald-500"
              } outline-none`}
              placeholder={t("SellerInfo.addressPlaceholder")}
            />
          </div>

          {/* IBAN */}
          <div>
            <label
              className={`block text-sm font-medium mb-1.5 ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              {t("SellerInfo.bankAccountNumberIban")}
            </label>
            <input
              type="text"
              value={formData.iban}
              onChange={(e) => handleInputChange("iban", e.target.value.toUpperCase())}
              className={`w-full px-4 py-3 rounded-xl border transition-colors font-mono ${
                errors.iban
                  ? "border-red-500 focus:border-red-500"
                  : isDarkMode
                  ? "border-gray-600 bg-gray-700 text-white focus:border-emerald-500"
                  : "border-gray-300 bg-gray-50 text-gray-900 focus:border-emerald-500"
              } outline-none`}
              placeholder={t("SellerInfo.ibanPlaceholder")}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className={`sticky bottom-0 flex gap-3 p-4 border-t ${
            isDarkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
          }`}
        >
          <button
            onClick={onClose}
            className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-colors ${
              isDarkMode
                ? "bg-gray-700 text-white hover:bg-gray-600"
                : "bg-gray-100 text-gray-900 hover:bg-gray-200"
            }`}
          >
            {t("SellerInfo.cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex-1 py-3 px-4 rounded-xl font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("SellerInfo.saving")}
              </>
            ) : (
              t("SellerInfo.save")
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ✅ Delete Confirmation Modal
interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDarkMode: boolean;
  t: ReturnType<typeof useTranslations>;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isDarkMode,
  t,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error("Error deleting:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative w-full max-w-sm rounded-2xl shadow-2xl p-6 ${
          isDarkMode ? "bg-gray-800" : "bg-white"
        }`}
      >
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h3
            className={`text-lg font-bold mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("SellerInfo.deleteSellerInfo")}
          </h3>
          <p
            className={`text-sm mb-6 ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {t("SellerInfo.deleteSellerInfoConfirmation")}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className={`flex-1 py-2.5 px-4 rounded-xl font-semibold transition-colors ${
                isDarkMode
                  ? "bg-gray-700 text-white hover:bg-gray-600"
                  : "bg-gray-100 text-gray-900 hover:bg-gray-200"
              }`}
            >
              {t("SellerInfo.cancel")}
            </button>
            <button
              onClick={handleConfirm}
              disabled={isDeleting}
              className="flex-1 py-2.5 px-4 rounded-xl font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("SellerInfo.delete")
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ✅ Main Page Component
export default function SellerInfoPage() {
  const { user } = useUser();
  const router = useRouter();
  const t = useTranslations();

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Theme detection
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => observer.disconnect();
  }, []);

  // Firestore listener for real-time updates (matches Flutter's StreamBuilder)
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const docRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data?.sellerInfo) {
            setSellerInfo(data.sellerInfo as SellerInfo);
          } else {
            setSellerInfo(null);
          }
        }
        setIsLoading(false);
      },
      (error) => {
        console.error("Error listening to seller info:", error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Show notification
  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  // Save seller info
  const handleSaveSellerInfo = async (data: SellerInfo) => {
    if (!user) return;

    try {
      const docRef = doc(db, "users", user.uid);
      await updateDoc(docRef, { sellerInfo: data });
      showNotification(
        "success",
        sellerInfo
          ? t("SellerInfo.sellerInfoUpdated")
          : t("SellerInfo.sellerInfoAdded")
      );
    } catch (error) {
      console.error("Error saving seller info:", error);
      showNotification("error", t("SellerInfo.errorOccurred"));
      throw error;
    }
  };

  // Delete seller info
  const handleDeleteSellerInfo = async () => {
    if (!user) return;

    try {
      const docRef = doc(db, "users", user.uid);
      await updateDoc(docRef, { sellerInfo: null });
      showNotification("success", t("SellerInfo.sellerInfoDeleted"));
    } catch (error) {
      console.error("Error deleting seller info:", error);
      showNotification("error", t("SellerInfo.errorOccurred"));
      throw error;
    }
  };

  // Redirect if not logged in
  if (!user && !isLoading) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center p-4 ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div
          className={`text-center p-8 rounded-2xl ${
            isDarkMode ? "bg-gray-800" : "bg-white"
          } shadow-xl max-w-md w-full`}
        >
          <User
            className={`w-16 h-16 mx-auto mb-4 ${
              isDarkMode ? "text-gray-600" : "text-gray-400"
            }`}
          />
          <h2
            className={`text-xl font-bold mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("SellerInfo.loginRequired")}
          </h2>
          <p
            className={`mb-6 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
          >
            {t("SellerInfo.loginRequiredDescription")}
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full py-3 px-4 rounded-xl font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
          >
            {t("SellerInfo.login")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}
    >
      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in ${
            notification.type === "success"
              ? "bg-emerald-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {notification.type === "success" ? (
            <Check className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div
        className={`sticky top-0 z-40 ${
          isDarkMode ? "bg-gray-900/95" : "bg-gray-50/95"
        } backdrop-blur-sm`}
      >
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className={`p-2.5 rounded-xl transition-colors ${
                isDarkMode
                  ? "bg-white/10 hover:bg-white/20"
                  : "bg-black/5 hover:bg-black/10"
              }`}
            >
              <ArrowLeft
                className={`w-5 h-5 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              />
            </button>
            <h1
              className={`text-lg font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("SellerInfo.sellerInfo")}
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {isLoading ? (
          // Loading State
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
            <p
              className={`text-base ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {t("SellerInfo.loading")}
            </p>
          </div>
        ) : sellerInfo ? (
          // Seller Info Card (matches Flutter's _buildSellerInfoCard)
          <div className="space-y-6">
            {/* Section Header */}
            <div>
              <h2
                className={`text-lg font-semibold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("SellerInfo.sellerInformation")}
              </h2>
              <p
                className={`text-sm ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {t("SellerInfo.yourSellerDetails")}
              </p>
            </div>

            {/* Info Card */}
            <div
              className={`rounded-2xl border shadow-lg overflow-hidden ${
                isDarkMode
                  ? "bg-gray-800 border-white/10"
                  : "bg-white border-gray-200"
              }`}
            >
              <div className="p-5 md:p-6">
                {/* Profile Section */}
                <div className="flex flex-col sm:flex-row items-start gap-5">
                  {/* Icon Container */}
                  <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border-2 border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <div className="relative w-14 h-14 md:w-16 md:h-16">
                      <Image
                        src="/images/credit-card-payment.png"
                        alt="Payment"
                        fill
                        className="object-contain"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = "none";
                        }}
                      />
                      <Building2 className="w-full h-full text-emerald-500/70 absolute inset-0" />
                    </div>
                  </div>

                  {/* Info Details */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className={`text-xl font-semibold mb-2 ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {`${sellerInfo.ibanOwnerName} ${sellerInfo.ibanOwnerSurname}`.trim()}
                    </h3>

                    <div className="space-y-2">
                      {/* Phone */}
                      <div className="flex items-center gap-2">
                        <Phone
                          className={`w-4 h-4 flex-shrink-0 ${
                            isDarkMode ? "text-gray-400" : "text-gray-500"
                          }`}
                        />
                        <span
                          className={`text-sm ${
                            isDarkMode ? "text-gray-300" : "text-gray-600"
                          }`}
                        >
                          {sellerInfo.phone}
                        </span>
                      </div>

                      {/* Location */}
                      {sellerInfo.latitude !== 0 && sellerInfo.longitude !== 0 && (
                        <div className="flex items-center gap-2">
                          <MapPin
                            className={`w-4 h-4 flex-shrink-0 ${
                              isDarkMode ? "text-gray-400" : "text-gray-500"
                            }`}
                          />
                          <span
                            className={`text-sm ${
                              isDarkMode ? "text-gray-300" : "text-gray-600"
                            }`}
                          >
                            {sellerInfo.latitude.toFixed(4)}, {sellerInfo.longitude.toFixed(4)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Address Section */}
                {sellerInfo.address && (
                  <div
                    className={`mt-5 p-4 rounded-xl border ${
                      isDarkMode
                        ? "bg-white/5 border-white/10"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <FileText
                        className={`w-4 h-4 ${
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      />
                      <span
                        className={`text-xs font-medium ${
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {t("SellerInfo.addressDetails")}
                      </span>
                    </div>
                    <p
                      className={`text-sm leading-relaxed ${
                        isDarkMode ? "text-gray-300" : "text-gray-600"
                      }`}
                    >
                      {sellerInfo.address}
                    </p>
                  </div>
                )}

                {/* IBAN and Actions */}
                <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  {/* IBAN */}
                  <div>
                    <span
                      className={`text-xs font-medium ${
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      IBAN
                    </span>
                    <p
                      className={`text-sm font-semibold font-mono ${
                        isDarkMode ? "text-gray-300" : "text-gray-700"
                      }`}
                    >
                      {maskIban(sellerInfo.iban)}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsFormModalOpen(true)}
                      className="w-10 h-10 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 flex items-center justify-center transition-colors"
                    >
                      <Edit2 className="w-5 h-5 text-emerald-500" />
                    </button>
                    <button
                      onClick={() => setIsDeleteModalOpen(true)}
                      className="w-10 h-10 rounded-xl bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-5 h-5 text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Empty State (matches Flutter's _buildEmptyState)
          <div className="flex flex-col items-center justify-center py-16 px-4">
            {/* Icon */}
            <div className="w-36 h-36 rounded-full bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-2 border-emerald-500/20 flex items-center justify-center mb-10">
              <div className="relative w-16 h-16">
                <Image
                  src="/images/credit-card-payment.png"
                  alt="Payment"
                  fill
                  className="object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                  }}
                />
                <CreditCard className="w-full h-full text-emerald-500/70 absolute inset-0" />
              </div>
            </div>

            {/* Text */}
            <h2
              className={`text-xl font-bold mb-3 text-center ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("SellerInfo.noSellerInfo")}
            </h2>
            <p
              className={`text-base text-center max-w-sm mb-10 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {t("SellerInfo.addSellerInfoDescription")}
            </p>

            {/* Add Button */}
            <button
              onClick={() => setIsFormModalOpen(true)}
              className="flex items-center gap-2.5 px-8 py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/25 transition-all hover:shadow-xl hover:shadow-emerald-500/30"
            >
              <Plus className="w-5 h-5" />
              {t("SellerInfo.addSellerInfo")}
            </button>
          </div>
        )}
      </div>

      {/* Form Modal */}
      <SellerInfoFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSave={handleSaveSellerInfo}
        initialData={sellerInfo}
        isDarkMode={isDarkMode}
        t={t}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteSellerInfo}
        isDarkMode={isDarkMode}
        t={t}
      />

      {/* Custom Animation Styles */}
      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translate(-50%, -10px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}