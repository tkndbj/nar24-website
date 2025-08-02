"use client";

import React, { useState, useEffect, useCallback } from "react";
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
  ChevronDown,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import regionsList from "@/constants/regions";
import { useTranslations } from "next-intl";

interface SellerInfo {
  ibanOwnerName: string;
  ibanOwnerSurname: string;
  phone: string;
  region: string;
  address: string;
  iban: string;
}

interface SellerInfoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
  localization?: ReturnType<typeof useTranslations>;
  shopId?: string;
}

export const SellerInfoDrawer: React.FC<SellerInfoDrawerProps> = ({
  isOpen,
  onClose,
  isDarkMode = false,
  localization,
  shopId,
}) => {
  const router = useRouter();
  const { user } = useUser();

  // Local state
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Animation states
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    ibanOwnerName: "",
    ibanOwnerSurname: "",
    phone: "",
    region: "",
    address: "",
    iban: "",
  });

  const [showRegionDropdown, setShowRegionDropdown] = useState(false);

  // Animation handling
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsAnimating(true), 10);
    } else {
      setIsAnimating(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  // Load seller info from Firebase
  const loadSellerInfo = useCallback(async () => {
    if (!user) {
      setSellerInfo(null);
      return;
    }

    setIsLoading(true);
    try {
      let docRef;

      if (shopId) {
        // For shop-specific seller info
        docRef = doc(db, "shops", shopId, "seller_info", "info");
      } else {
        // For user's personal seller info
        docRef = doc(db, "users", user.uid);
      }

      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();

        if (shopId) {
          // Shop seller info is stored directly
          setSellerInfo(data as SellerInfo);
        } else {
          // User seller info is nested under 'sellerInfo'
          const sellerInfoData = data.sellerInfo;
          setSellerInfo(sellerInfoData || null);
        }
      } else {
        setSellerInfo(null);
      }
    } catch (error) {
      console.error("Error loading seller info:", error);
      showErrorToast("Failed to load seller information");
    } finally {
      setIsLoading(false);
    }
  }, [user, shopId]);

  // Load seller info when drawer opens
  useEffect(() => {
    if (isOpen) {
      loadSellerInfo();
    }
  }, [user, isOpen, loadSellerInfo, shopId]);

  // Toast notifications (replace with your toast system)
  const showErrorToast = (message: string) => {
    console.error(message);
    alert(`Error: ${message}`);
  };

  const showSuccessToast = (message: string) => {
    console.log(message);
    alert(`Success: ${message}`);
  };

  // Handle form input changes
  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // Mask IBAN for display
  const maskIban = (iban: string): string => {
    if (iban.length <= 8) return iban;
    const start = iban.substring(0, 4);
    const end = iban.substring(iban.length - 4);
    return `${start}••••••••${end}`;
  };

  // Add or update seller info
  const handleSaveSellerInfo = async () => {
    if (!user) return;

    const { ibanOwnerName, ibanOwnerSurname, phone, region, address, iban } =
      formData;

    if (
      !ibanOwnerName.trim() ||
      !ibanOwnerSurname.trim() ||
      !phone.trim() ||
      !region.trim() ||
      !address.trim() ||
      !iban.trim()
    ) {
      showErrorToast(
        l("SellerInfoDrawer.fillAllFields") || "Please fill in all fields"
      );
      return;
    }

    try {
      const sellerData = {
        ibanOwnerName: ibanOwnerName.trim(),
        ibanOwnerSurname: ibanOwnerSurname.trim(),
        phone: phone.trim(),
        region: region.trim(),
        address: address.trim(),
        iban: iban.trim(),
      };

      let docRef;

      if (shopId) {
        // For shop-specific seller info
        docRef = doc(db, "shops", shopId, "seller_info", "info");
        await setDoc(docRef, sellerData);
      } else {
        // For user's personal seller info
        docRef = doc(db, "users", user.uid);
        await updateDoc(docRef, { sellerInfo: sellerData });
      }

      showSuccessToast(
        sellerInfo
          ? l("SellerInfoDrawer.sellerInfoUpdated") ||
              "Seller information updated successfully"
          : l("SellerInfoDrawer.sellerInfoAdded") ||
              "Seller information added successfully"
      );

      // Reload seller info
      await loadSellerInfo();

      // Reset form and close modal
      setFormData({
        ibanOwnerName: "",
        ibanOwnerSurname: "",
        phone: "",
        region: "",
        address: "",
        iban: "",
      });
      setShowAddModal(false);
    } catch (error) {
      console.error("Error saving seller info:", error);
      showErrorToast(
        l("SellerInfoDrawer.errorOccurred") || "An error occurred"
      );
    }
  };

  // Delete seller info
  const deleteSellerInfo = async () => {
    if (
      !confirm(
        l("SellerInfoDrawer.deleteConfirmation") ||
          "Are you sure you want to delete your seller information?"
      )
    )
      return;

    setIsDeleting(true);
    try {
      let docRef;

      if (shopId) {
        // For shop-specific seller info
        docRef = doc(db, "shops", shopId, "seller_info", "info");
        await deleteDoc(docRef);
      } else {
        // For user's personal seller info
        docRef = doc(db, "users", user?.uid || "");
        await updateDoc(docRef, { sellerInfo: null });
      }

      showSuccessToast(
        l("SellerInfoDrawer.sellerInfoDeleted") || "Seller information deleted"
      );
      await loadSellerInfo();
    } catch (error) {
      console.error("Error deleting seller info:", error);
      showErrorToast(
        l("SellerInfoDrawer.errorOccurred") || "An error occurred"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // Edit seller info
  const editSellerInfo = () => {
    if (sellerInfo) {
      setFormData({
        ibanOwnerName: sellerInfo.ibanOwnerName,
        ibanOwnerSurname: sellerInfo.ibanOwnerSurname,
        phone: sellerInfo.phone,
        region: sellerInfo.region,
        address: sellerInfo.address,
        iban: sellerInfo.iban,
      });
      setShowAddModal(true);
    }
  };

  // Handle navigation to login
  const handleGoToLogin = () => {
    onClose();
    router.push("/login");
  };

  // Backdrop click handler
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!shouldRender) return null;

  const l = localization || ((key: string) => key.split(".").pop() || key);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleBackdropClick}
      />

      {/* Drawer */}
      <div
        className={`
          absolute right-0 top-0 h-full w-full max-w-md transform transition-transform duration-300 ease-out
          ${isDarkMode ? "bg-gray-900" : "bg-white"}
          shadow-2xl flex flex-col
          ${isAnimating ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header */}
        <div
          className={`
            flex-shrink-0 border-b px-6 py-4
            ${
              isDarkMode
                ? "bg-gray-900 border-gray-700"
                : "bg-white border-gray-200"
            }
            backdrop-blur-xl bg-opacity-95
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                className={`
                  p-2 rounded-full
                  ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
                `}
              >
                <Building
                  size={20}
                  className={isDarkMode ? "text-gray-300" : "text-gray-700"}
                />
              </div>
              <div>
                <h2
                  className={`
                    text-lg font-bold
                    ${isDarkMode ? "text-white" : "text-gray-900"}
                  `}
                >
                  {l("SellerInfoDrawer.title") || "Seller Information"}
                </h2>
                {user && sellerInfo && (
                  <p
                    className={`
                      text-sm
                      ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                    `}
                  >
                    {l("SellerInfoDrawer.yourSellerDetails") ||
                      "Your seller details"}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Add Button - Only show when no seller info exists */}
              {user && !sellerInfo && !isLoading && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className={`
                    p-2 rounded-full transition-colors duration-200
                    ${
                      isDarkMode
                        ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                        : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                    }
                  `}
                  title={
                    l("SellerInfoDrawer.addSellerInfo") || "Add Seller Info"
                  }
                >
                  <Plus size={20} />
                </button>
              )}

              <button
                onClick={onClose}
                className={`
                  p-2 rounded-full transition-colors duration-200
                  ${
                    isDarkMode
                      ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                      : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                  }
                `}
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* Not Authenticated State */}
          {!user ? (
            <div className="flex flex-col items-center justify-center h-full px-6 py-12">
              <div
                className={`
                  w-20 h-20 rounded-full flex items-center justify-center mb-6
                  ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
                `}
              >
                <User
                  size={32}
                  className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                />
              </div>
              <h3
                className={`
                  text-xl font-bold mb-3 text-center
                  ${isDarkMode ? "text-white" : "text-gray-900"}
                `}
              >
                {l("SellerInfoDrawer.loginRequired") || "Login Required"}
              </h3>
              <p
                className={`
                  text-center mb-8 leading-relaxed
                  ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                `}
              >
                {l("SellerInfoDrawer.loginToManageSellerInfo") ||
                  "Please login to view and manage your seller information."}
              </p>
              <button
                onClick={handleGoToLogin}
                className="
                  flex items-center space-x-2 px-6 py-3 rounded-full
                  bg-gradient-to-r from-orange-500 to-pink-500 text-white
                  hover:from-orange-600 hover:to-pink-600
                  transition-all duration-200 shadow-lg hover:shadow-xl
                  active:scale-95
                "
              >
                <LogIn size={18} />
                <span className="font-medium">
                  {l("SellerInfoDrawer.login") || "Login"}
                </span>
              </button>
            </div>
          ) : /* Loading State */ isLoading ? (
            <div className="flex flex-col items-center justify-center h-full px-6 py-12">
              <div className="animate-spin w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full mb-4"></div>
              <p
                className={`
                  text-center
                  ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                `}
              >
                {l("SellerInfoDrawer.loading") ||
                  "Loading seller information..."}
              </p>
            </div>
          ) : /* Empty State */ !sellerInfo ? (
            <div className="flex flex-col items-center justify-center h-full px-6 py-12">
              <div
                className={`
                  w-20 h-20 rounded-full flex items-center justify-center mb-6
                  ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
                `}
              >
                <Building
                  size={32}
                  className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                />
              </div>
              <h3
                className={`
                  text-xl font-bold mb-3 text-center
                  ${isDarkMode ? "text-white" : "text-gray-900"}
                `}
              >
                {l("SellerInfoDrawer.noSellerInfo") || "No Seller Information"}
              </h3>
              <p
                className={`
                  text-center mb-8 leading-relaxed
                  ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                `}
              >
                {l("SellerInfoDrawer.addSellerInfoDescription") ||
                  "Add your seller information to start selling products."}
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="
                  flex items-center space-x-2 px-6 py-3 rounded-full
                  bg-gradient-to-r from-orange-500 to-pink-500 text-white
                  hover:from-orange-600 hover:to-pink-600
                  transition-all duration-200 shadow-lg hover:shadow-xl
                  active:scale-95
                "
              >
                <Plus size={18} />
                <span className="font-medium">
                  {l("SellerInfoDrawer.addSellerInfo") || "Add Seller Info"}
                </span>
              </button>
            </div>
          ) : (
            /* Seller Info Display */
            <div className="px-4 py-4">
              <div
                className={`
                  rounded-xl border p-6 transition-all duration-200
                  ${
                    isDarkMode
                      ? "bg-gray-800 border-gray-700"
                      : "bg-gray-50 border-gray-200"
                  }
                `}
              >
                {/* Header Section */}
                <div className="flex items-center space-x-4 mb-6">
                  <div
                    className={`
                      w-16 h-16 rounded-full flex items-center justify-center
                      ${isDarkMode ? "bg-gray-700" : "bg-white"}
                      border-2 border-orange-500/20
                    `}
                  >
                    <Building size={24} className="text-orange-500" />
                  </div>
                  <div className="flex-1">
                    <h3
                      className={`
                        text-lg font-semibold
                        ${isDarkMode ? "text-white" : "text-gray-900"}
                      `}
                    >
                      {`${sellerInfo.ibanOwnerName} ${sellerInfo.ibanOwnerSurname}`.trim()}
                    </h3>
                    <p
                      className={`
                        text-sm flex items-center space-x-1
                        ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                      `}
                    >
                      <Phone size={14} />
                      <span>{sellerInfo.phone}</span>
                    </p>
                  </div>
                </div>

                {/* Details Section */}
                <div className="space-y-4">
                  {/* Region */}
                  <div
                    className={`
                      p-3 rounded-lg
                      ${isDarkMode ? "bg-gray-700/50" : "bg-white"}
                    `}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      <MapPin
                        size={14}
                        className={
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }
                      />
                      <span
                        className={`
                          text-xs font-medium
                          ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                        `}
                      >
                        {l("SellerInfoDrawer.region") || "Region"}
                      </span>
                    </div>
                    <p
                      className={`
                        text-sm font-medium
                        ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                      `}
                    >
                      {sellerInfo.region}
                    </p>
                  </div>

                  {/* Address */}
                  <div
                    className={`
                      p-3 rounded-lg
                      ${isDarkMode ? "bg-gray-700/50" : "bg-white"}
                    `}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      <MapPin
                        size={14}
                        className={
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }
                      />
                      <span
                        className={`
                          text-xs font-medium
                          ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                        `}
                      >
                        {l("SellerInfoDrawer.addressDetails") ||
                          "Address Details"}
                      </span>
                    </div>
                    <p
                      className={`
                        text-sm font-medium
                        ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                      `}
                    >
                      {sellerInfo.address}
                    </p>
                  </div>

                  {/* IBAN */}
                  <div
                    className={`
                      p-3 rounded-lg
                      ${isDarkMode ? "bg-gray-700/50" : "bg-white"}
                    `}
                  >
                    <div className="flex items-center space-x-2 mb-1">
                      <CreditCard
                        size={14}
                        className={
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }
                      />
                      <span
                        className={`
                          text-xs font-medium
                          ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                        `}
                      >
                        IBAN
                      </span>
                    </div>
                    <p
                      className={`
                        text-sm font-mono font-medium
                        ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                      `}
                    >
                      {maskIban(sellerInfo.iban)}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
                  <button
                    onClick={editSellerInfo}
                    className={`
                      flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors duration-200
                      ${
                        isDarkMode
                          ? "hover:bg-gray-700 text-gray-400 hover:text-blue-400"
                          : "hover:bg-blue-50 text-gray-500 hover:text-blue-600"
                      }
                    `}
                  >
                    <Edit2 size={16} />
                    <span className="text-sm font-medium">
                      {l("SellerInfoDrawer.edit") || "Edit"}
                    </span>
                  </button>

                  <button
                    onClick={deleteSellerInfo}
                    disabled={isDeleting}
                    className={`
                      flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors duration-200
                      ${
                        isDarkMode
                          ? "hover:bg-gray-700 text-gray-400 hover:text-red-400"
                          : "hover:bg-red-50 text-gray-500 hover:text-red-600"
                      }
                      ${isDeleting ? "opacity-50 cursor-not-allowed" : ""}
                    `}
                  >
                    {isDeleting ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    <span className="text-sm font-medium">
                      {isDeleting
                        ? l("SellerInfoDrawer.deleting") || "Deleting..."
                        : l("SellerInfoDrawer.delete") || "Delete"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Seller Info Modal */}
      {showAddModal && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-10 flex items-center justify-center p-6">
          <div
            className={`
              w-full max-w-sm rounded-xl p-6
              ${isDarkMode ? "bg-gray-800" : "bg-white"}
              shadow-2xl max-h-[80vh] overflow-y-auto
            `}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className={`
                  text-lg font-bold
                  ${isDarkMode ? "text-white" : "text-gray-900"}
                `}
              >
                {sellerInfo
                  ? l("SellerInfoDrawer.editSellerInfo") || "Edit Seller Info"
                  : l("SellerInfoDrawer.newSellerInfo") || "New Seller Info"}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setFormData({
                    ibanOwnerName: "",
                    ibanOwnerSurname: "",
                    phone: "",
                    region: "",
                    address: "",
                    iban: "",
                  });
                }}
                className={`
                  p-1 rounded-full transition-colors
                  ${
                    isDarkMode
                      ? "hover:bg-gray-700 text-gray-400"
                      : "hover:bg-gray-100 text-gray-500"
                  }
                `}
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {/* IBAN Owner Name */}
              <div>
                <label
                  className={`
                    block text-sm font-medium mb-2
                    ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                  `}
                >
                  {l("SellerInfoDrawer.ibanOwnerName") || "IBAN Owner Name"}
                </label>
                <input
                  type="text"
                  value={formData.ibanOwnerName}
                  onChange={(e) =>
                    handleInputChange("ibanOwnerName", e.target.value)
                  }
                  placeholder={
                    l("SellerInfoDrawer.ibanOwnerName") || "IBAN Owner Name"
                  }
                  className={`
                    w-full px-3 py-2 rounded-lg border
                    ${
                      isDarkMode
                        ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                        : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                    }
                    focus:ring-2 focus:ring-orange-500 focus:border-transparent
                  `}
                />
              </div>

              {/* IBAN Owner Surname */}
              <div>
                <label
                  className={`
                    block text-sm font-medium mb-2
                    ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                  `}
                >
                  {l("SellerInfoDrawer.ibanOwnerSurname") ||
                    "IBAN Owner Surname"}
                </label>
                <input
                  type="text"
                  value={formData.ibanOwnerSurname}
                  onChange={(e) =>
                    handleInputChange("ibanOwnerSurname", e.target.value)
                  }
                  placeholder={
                    l("SellerInfoDrawer.ibanOwnerSurname") ||
                    "IBAN Owner Surname"
                  }
                  className={`
                    w-full px-3 py-2 rounded-lg border
                    ${
                      isDarkMode
                        ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                        : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                    }
                    focus:ring-2 focus:ring-orange-500 focus:border-transparent
                  `}
                />
              </div>

              {/* Phone Number */}
              <div>
                <label
                  className={`
                    block text-sm font-medium mb-2
                    ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                  `}
                >
                  {l("SellerInfoDrawer.phoneNumber") || "Phone Number"}
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  placeholder={
                    l("SellerInfoDrawer.phoneNumber") || "Phone Number"
                  }
                  className={`
                    w-full px-3 py-2 rounded-lg border
                    ${
                      isDarkMode
                        ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                        : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                    }
                    focus:ring-2 focus:ring-orange-500 focus:border-transparent
                  `}
                />
              </div>

              {/* Region Dropdown */}
              <div className="relative">
                <label
                  className={`
                    block text-sm font-medium mb-2
                    ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                  `}
                >
                  {l("SellerInfoDrawer.region") || "Region"}
                </label>
                <button
                  onClick={() => setShowRegionDropdown(!showRegionDropdown)}
                  className={`
                    w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between
                    ${
                      isDarkMode
                        ? "bg-gray-700 border-gray-600 text-white"
                        : "bg-white border-gray-300 text-gray-900"
                    }
                    focus:ring-2 focus:ring-orange-500 focus:border-transparent
                  `}
                >
                  <span className={formData.region ? "" : "text-gray-500"}>
                    {formData.region ||
                      l("SellerInfoDrawer.selectRegion") ||
                      "Select Region"}
                  </span>
                  <ChevronDown size={16} />
                </button>

                {showRegionDropdown && (
                  <div
                    className={`
                      absolute top-full left-0 right-0 mt-1 border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto
                      ${
                        isDarkMode
                          ? "bg-gray-700 border-gray-600"
                          : "bg-white border-gray-300"
                      }
                    `}
                  >
                    {regionsList.map((region) => (
                      <button
                        key={region}
                        onClick={() => {
                          handleInputChange("region", region);
                          setShowRegionDropdown(false);
                        }}
                        className={`
                          w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600
                          ${isDarkMode ? "text-white" : "text-gray-900"}
                        `}
                      >
                        {region}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Address */}
              <div>
                <label
                  className={`
                    block text-sm font-medium mb-2
                    ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                  `}
                >
                  {l("SellerInfoDrawer.addressDetails") || "Address Details"}
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                  placeholder={
                    l("SellerInfoDrawer.addressDetails") || "Address Details"
                  }
                  rows={3}
                  className={`
                    w-full px-3 py-2 rounded-lg border resize-none
                    ${
                      isDarkMode
                        ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                        : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                    }
                    focus:ring-2 focus:ring-orange-500 focus:border-transparent
                  `}
                />
              </div>

              {/* IBAN */}
              <div>
                <label
                  className={`
                    block text-sm font-medium mb-2
                    ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                  `}
                >
                  {l("SellerInfoDrawer.bankAccountNumberIban") ||
                    "Bank Account Number (IBAN)"}
                </label>
                <input
                  type="text"
                  value={formData.iban}
                  onChange={(e) => handleInputChange("iban", e.target.value)}
                  placeholder="TR00 0000 0000 0000 0000 0000 00"
                  className={`
                    w-full px-3 py-2 rounded-lg border font-mono
                    ${
                      isDarkMode
                        ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                        : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                    }
                    focus:ring-2 focus:ring-orange-500 focus:border-transparent
                  `}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setFormData({
                    ibanOwnerName: "",
                    ibanOwnerSurname: "",
                    phone: "",
                    region: "",
                    address: "",
                    iban: "",
                  });
                }}
                className={`
                  flex-1 py-2 px-4 rounded-lg
                  ${
                    isDarkMode
                      ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }
                  transition-colors duration-200
                `}
              >
                {l("SellerInfoDrawer.cancel") || "Cancel"}
              </button>
              <button
                onClick={handleSaveSellerInfo}
                disabled={
                  !formData.ibanOwnerName.trim() ||
                  !formData.ibanOwnerSurname.trim() ||
                  !formData.phone.trim() ||
                  !formData.region.trim() ||
                  !formData.address.trim() ||
                  !formData.iban.trim()
                }
                className="
                  flex-1 py-2 px-4 rounded-lg
                  bg-gradient-to-r from-orange-500 to-pink-500 text-white
                  hover:from-orange-600 hover:to-pink-600
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-200
                "
              >
                {l("SellerInfoDrawer.save") || "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
