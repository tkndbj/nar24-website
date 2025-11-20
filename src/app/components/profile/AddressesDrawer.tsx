"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  MapPin,
  Plus,
  Edit2,
  Trash2,
  Star,
  User,
  LogIn,
  RefreshCw,
  ChevronDown,
  Map,
} from "lucide-react";
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

interface Address {
  id: string;
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
  city: string;
  isPreferred: boolean;
  location?: {
    latitude: number;
    longitude: number;
  };
}

interface SavedAddressesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
  localization?: ReturnType<typeof useTranslations>;
}

// Updated script loader utility for modern Google Maps
const loadGoogleMapsScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.google && window.google.maps) {
      resolve();
      return;
    }

    // Check if script is already loading
    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com"]'
    );
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve());
      existingScript.addEventListener("error", reject);
      return;
    }

    // Create and load script with marker library for AdvancedMarkerElement
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=marker,places&v=weekly&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

export const SavedAddressesDrawer: React.FC<SavedAddressesDrawerProps> = ({
  isOpen,
  onClose,
  isDarkMode = false,
  localization,
}) => {
  const router = useRouter();
  const { user } = useUser();

  // Local state
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [removingItems, setRemovingItems] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);

  // Animation states
  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    addressLine1: "",
    addressLine2: "",
    phoneNumber: "",
    city: "",
    location: null as { latitude: number; longitude: number } | null,
  });

  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Load Google Maps script
  useEffect(() => {
    if (typeof window !== "undefined") {
      loadGoogleMapsScript()
        .then(() => setMapsLoaded(true))
        .catch((err) => console.error("Failed to load Google Maps:", err));
    }
  }, []);

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

  // Scroll lock - matches SellerInfoDrawer pattern
  useEffect(() => {
    if (isOpen) {
      // Disable body scroll
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.style.top = `-${scrollY}px`;
    } else {
      // Re-enable body scroll
      const scrollY = document.body.style.top;
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.top = "";

      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || "0") * -1);
      }
    }

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.top = "";
    };
  }, [isOpen]);

  // Load addresses from Firebase
  const loadAddresses = useCallback(async () => {
    if (!user) {
      setAddresses([]);
      return;
    }

    setIsLoading(true);
    try {
      const addressesRef = collection(db, "users", user.uid, "addresses");
      const snapshot = await getDocs(addressesRef);

      const addressList: Address[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Address[];

      // Sort by preferred first, then by creation time
      addressList.sort((a, b) => {
        if (a.isPreferred && !b.isPreferred) return -1;
        if (!a.isPreferred && b.isPreferred) return 1;
        return 0;
      });

      setAddresses(addressList);
    } catch (error) {
      console.error("Error loading addresses:", error);
      showErrorToast("Failed to load addresses");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Load addresses when drawer opens and user changes
  useEffect(() => {
    if (isOpen) {
      loadAddresses();
    }
  }, [user, isOpen, loadAddresses]);

  // Toast notifications
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

  // Add or update address
  const handleSaveAddress = async () => {
    if (!user) return;

    const { addressLine1, phoneNumber, city } = formData;

    if (!addressLine1.trim() || !phoneNumber.trim() || !city.trim()) {
      showErrorToast(
        l("SavedAddressesDrawer.fillAllFields") ||
          "Please fill in all required fields"
      );
      return;
    }

    if (!editingAddress && addresses.length >= 4) {
      showErrorToast(
        l("SavedAddressesDrawer.maxAddressesReached") ||
          "Maximum 4 addresses allowed"
      );
      return;
    }

    try {
      const addressesRef = collection(db, "users", user.uid, "addresses");

      const addressData = {
        addressLine1: addressLine1.trim(),
        addressLine2: formData.addressLine2.trim(),
        phoneNumber: phoneNumber.trim(),
        city: city.trim(),
        ...(formData.location && {
          location: new GeoPoint(
            formData.location.latitude,
            formData.location.longitude
          ),
        }),
      };

      if (editingAddress) {
        // Update existing
        const docRef = doc(
          db,
          "users",
          user.uid,
          "addresses",
          editingAddress.id
        );
        await updateDoc(docRef, addressData);
        showSuccessToast(
          l("SavedAddressesDrawer.addressUpdated") ||
            "Address updated successfully"
        );
      } else {
        // Add new
        const isFirstAddress = addresses.length === 0;
        await addDoc(addressesRef, {
          ...addressData,
          isPreferred: isFirstAddress,
        });
        showSuccessToast(
          l("SavedAddressesDrawer.addressAdded") || "Address added successfully"
        );
      }

      // Reload addresses
      await loadAddresses();

      // Reset form and close modal
      setFormData({
        addressLine1: "",
        addressLine2: "",
        phoneNumber: "",
        city: "",
        location: null,
      });
      setShowAddModal(false);
      setEditingAddress(null);
    } catch (error) {
      console.error("Error saving address:", error);
      showErrorToast(
        l("SavedAddressesDrawer.errorOccurred") || "An error occurred"
      );
    }
  };

  // Set as preferred
  const setAsPreferred = async (addressId: string) => {
    if (!user) return;

    try {
      const batch = writeBatch(db);

      // Remove preferred status from all addresses
      addresses.forEach((address) => {
        const docRef = doc(db, "users", user.uid, "addresses", address.id);
        batch.update(docRef, { isPreferred: false });
      });

      // Set selected address as preferred
      const selectedDocRef = doc(db, "users", user.uid, "addresses", addressId);
      batch.update(selectedDocRef, { isPreferred: true });

      await batch.commit();
      showSuccessToast(
        l("SavedAddressesDrawer.preferredAddressSet") || "Preferred address set"
      );
      await loadAddresses();
    } catch (error) {
      console.error("Error setting preferred address:", error);
      showErrorToast(
        l("SavedAddressesDrawer.errorOccurred") || "An error occurred"
      );
    }
  };

  // Delete address
  const deleteAddress = async (addressId: string) => {
    if (!user) return;
    if (
      !confirm(
        l("SavedAddressesDrawer.deleteConfirmation") ||
          "Are you sure you want to delete this address?"
      )
    )
      return;

    setRemovingItems((prev) => new Set(prev).add(addressId));
    try {
      await deleteDoc(doc(db, "users", user.uid, "addresses", addressId));
      showSuccessToast(
        l("SavedAddressesDrawer.addressDeleted") || "Address deleted"
      );
      await loadAddresses();
    } catch (error) {
      console.error("Error deleting address:", error);
      showErrorToast(
        l("SavedAddressesDrawer.errorOccurred") || "An error occurred"
      );
    } finally {
      setRemovingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(addressId);
        return newSet;
      });
    }
  };

  // Clear all addresses
  const clearAllAddresses = async () => {
    if (!user) return;
    if (
      !confirm(
        l("SavedAddressesDrawer.deleteAllConfirmation") ||
          "Are you sure you want to delete all addresses?"
      )
    )
      return;

    setIsClearing(true);
    try {
      const batch = writeBatch(db);
      addresses.forEach((address) => {
        const docRef = doc(db, "users", user.uid, "addresses", address.id);
        batch.delete(docRef);
      });
      await batch.commit();
      showSuccessToast(
        l("SavedAddressesDrawer.allAddressesCleared") || "All addresses cleared"
      );
      await loadAddresses();
    } catch (error) {
      console.error("Error clearing addresses:", error);
      showErrorToast(
        l("SavedAddressesDrawer.errorOccurred") || "An error occurred"
      );
    } finally {
      setIsClearing(false);
    }
  };

  // Edit address
  const editAddress = (address: Address) => {
    setFormData({
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      phoneNumber: address.phoneNumber,
      city: address.city,
      location: address.location || null,
    });
    setEditingAddress(address);
    setShowAddModal(true);
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

  // Format coordinates for display
  const formatCoordinates = (location?: {
    latitude: number;
    longitude: number;
  }) => {
    if (!location) return "";
    return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  };

  const l = localization || ((key: string) => key.split(".").pop() || key);

  if (!shouldRender) return null;

  const drawerContent = (
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
                <MapPin
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
                  {l("SavedAddressesDrawer.title") || "Saved Addresses"}
                </h2>
                {user && addresses.length > 0 && (
                  <p
                    className={`
                      text-sm
                      ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                    `}
                  >
                    {addresses.length}{" "}
                    {l("SavedAddressesDrawer.ofFourAddresses") ||
                      "of 4 addresses"}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {/* Add Button - Only show when not at limit */}
              {user && addresses.length < 4 && (
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
                  title={l("SavedAddressesDrawer.addNew") || "Add New"}
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

          {/* Clear All Button */}
          {user && addresses.length > 0 && (
            <div className="mt-4">
              <button
                onClick={clearAllAddresses}
                disabled={isClearing}
                className={`
                  flex items-center space-x-2 text-sm transition-colors duration-200
                  ${
                    isDarkMode
                      ? "text-red-400 hover:text-red-300"
                      : "text-red-500 hover:text-red-600"
                  }
                  ${isClearing ? "opacity-50 cursor-not-allowed" : ""}
                `}
              >
                {isClearing ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Trash2 size={16} />
                )}
                <span>
                  {isClearing
                    ? l("SavedAddressesDrawer.clearing") || "Clearing..."
                    : l("SavedAddressesDrawer.clearAll") || "Clear All"}
                </span>
              </button>
            </div>
          )}
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
                {l("SavedAddressesDrawer.loginRequired") || "Login Required"}
              </h3>
              <p
                className={`
                  text-center mb-8 leading-relaxed
                  ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                `}
              >
                {l("SavedAddressesDrawer.loginToManageAddresses") ||
                  "Please login to view and manage your saved addresses."}
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
                  {l("SavedAddressesDrawer.login") || "Login"}
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
                {l("SavedAddressesDrawer.loading") || "Loading addresses..."}
              </p>
            </div>
          ) : /* Empty State */ addresses.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 py-12">
              <div
                className={`
                  w-20 h-20 rounded-full flex items-center justify-center mb-6
                  ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
                `}
              >
                <MapPin
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
                {l("SavedAddressesDrawer.noSavedAddresses") ||
                  "No Saved Addresses"}
              </h3>
              <p
                className={`
                  text-center mb-8 leading-relaxed
                  ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                `}
              >
                {l("SavedAddressesDrawer.addFirstAddress") ||
                  "Add your first address to get started with faster deliveries."}
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
                  {l("SavedAddressesDrawer.addNewAddress") || "Add Address"}
                </span>
              </button>
            </div>
          ) : (
            /* Addresses List */
            <div className="px-4 py-4">
              <div className="space-y-4">
                {addresses.map((address) => {
                  const isRemoving = removingItems.has(address.id);

                  // Build subtitle with address details
                  let subtitleText = "";
                  if (address.addressLine2?.trim()) {
                    subtitleText += address.addressLine2;
                  }
                  if (address.city?.trim()) {
                    if (subtitleText) subtitleText += " • ";
                    subtitleText += address.city;
                  }
                  if (address.phoneNumber?.trim()) {
                    if (subtitleText) subtitleText += "\n";
                    subtitleText += address.phoneNumber;
                  }

                  return (
                    <div
                      key={address.id}
                      className={`
                        transition-all duration-300 transform cursor-pointer
                        ${
                          isRemoving
                            ? "opacity-50 scale-95"
                            : "opacity-100 scale-100"
                        }
                      `}
                    >
                      <div
                        className={`
                          rounded-xl border p-4 transition-all duration-200 relative
                          ${
                            isDarkMode
                              ? "bg-gray-800 border-gray-700 hover:border-gray-600"
                              : "bg-gray-50 border-gray-200 hover:border-gray-300"
                          }
                          ${
                            address.isPreferred
                              ? "ring-2 ring-orange-500 border-orange-500"
                              : ""
                          }
                        `}
                        onClick={() =>
                          !address.isPreferred && setAsPreferred(address.id)
                        }
                      >
                        {/* Preferred Badge */}
                        {address.isPreferred && (
                          <div className="absolute top-3 right-3">
                            <div className="flex items-center space-x-1 px-2 py-1 rounded-full bg-orange-500 text-white text-xs font-medium">
                              <Star size={12} fill="currentColor" />
                              <span>
                                {l("SavedAddressesDrawer.preferred") ||
                                  "Preferred"}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-start space-x-3">
                          {/* Address Icon */}
                          <div
                            className={`
                              w-12 h-8 rounded-lg flex items-center justify-center mt-1
                              ${isDarkMode ? "bg-gray-700" : "bg-white"}
                              border
                              ${
                                isDarkMode
                                  ? "border-gray-600"
                                  : "border-gray-200"
                              }
                            `}
                          >
                            <MapPin size={20} className="text-orange-500" />
                          </div>

                          {/* Address Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h3
                                className={`
                                  font-semibold text-sm pr-24
                                  ${isDarkMode ? "text-white" : "text-gray-900"}
                                `}
                              >
                                {address.addressLine1}
                              </h3>
                            </div>
                            {subtitleText && (
                              <p
                                className={`
                                  text-sm whitespace-pre-line
                                  ${
                                    isDarkMode
                                      ? "text-gray-300"
                                      : "text-gray-600"
                                  }
                                `}
                              >
                                {subtitleText}
                              </p>
                            )}

                            {/* Coordinates if available */}
                            {address.location && (
                              <div className="mt-2">
                                <span
                                  className={`
                                    text-xs
                                    ${
                                      isDarkMode
                                        ? "text-gray-400"
                                        : "text-gray-500"
                                    }
                                  `}
                                >
                                  {l("SavedAddressesDrawer.coordinates") ||
                                    "Coordinates"}
                                  : {formatCoordinates(address.location)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end space-x-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              editAddress(address);
                            }}
                            className={`
                              p-2 rounded-lg transition-colors duration-200
                              ${
                                isDarkMode
                                  ? "hover:bg-gray-700 text-gray-400 hover:text-blue-400"
                                  : "hover:bg-blue-50 text-gray-500 hover:text-blue-600"
                              }
                            `}
                          >
                            <Edit2 size={16} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteAddress(address.id);
                            }}
                            disabled={isRemoving}
                            className={`
                              p-2 rounded-lg transition-colors duration-200
                              ${
                                isDarkMode
                                  ? "hover:bg-gray-700 text-gray-400 hover:text-red-400"
                                  : "hover:bg-red-50 text-gray-500 hover:text-red-600"
                              }
                              ${
                                isRemoving
                                  ? "opacity-50 cursor-not-allowed"
                                  : ""
                              }
                            `}
                          >
                            {isRemoving ? (
                              <RefreshCw size={16} className="animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Address Modal */}
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
                {editingAddress
                  ? l("SavedAddressesDrawer.editAddress") || "Edit Address"
                  : l("SavedAddressesDrawer.newAddress") || "New Address"}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingAddress(null);
                  setFormData({
                    addressLine1: "",
                    addressLine2: "",
                    phoneNumber: "",
                    city: "",
                    location: null,
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
              {/* Address Line 1 */}
              <div>
                <label
                  className={`
                    block text-sm font-medium mb-2
                    ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                  `}
                >
                  {l("SavedAddressesDrawer.addressLine1") || "Address Line 1"} *
                </label>
                <input
                  type="text"
                  value={formData.addressLine1}
                  onChange={(e) =>
                    handleInputChange("addressLine1", e.target.value)
                  }
                  placeholder={
                    l("SavedAddressesDrawer.addressLine1") || "Address Line 1"
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

              {/* Address Line 2 */}
              <div>
                <label
                  className={`
                    block text-sm font-medium mb-2
                    ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                  `}
                >
                  {l("SavedAddressesDrawer.addressLine2") || "Address Line 2"}
                </label>
                <input
                  type="text"
                  value={formData.addressLine2}
                  onChange={(e) =>
                    handleInputChange("addressLine2", e.target.value)
                  }
                  placeholder={
                    l("SavedAddressesDrawer.addressLine2") || "Address Line 2"
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
                  {l("SavedAddressesDrawer.phoneNumber") || "Phone Number"} *
                </label>
                <input
                  type="tel"
                  value={formData.phoneNumber}
                  onChange={(e) =>
                    handleInputChange("phoneNumber", e.target.value)
                  }
                  placeholder={
                    l("SavedAddressesDrawer.phoneNumber") || "Phone Number"
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

              {/* City Dropdown */}
              <div className="relative">
                <label
                  className={`
                    block text-sm font-medium mb-2
                    ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                  `}
                >
                  {l("SavedAddressesDrawer.city") || "City"} *
                </label>
                <button
                  onClick={() => setShowCityDropdown(!showCityDropdown)}
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
                  <span className={formData.city ? "" : "text-gray-500"}>
                    {formData.city ||
                      l("SavedAddressesDrawer.selectCity") ||
                      "Select City"}
                  </span>
                  <ChevronDown size={16} />
                </button>

                {showCityDropdown && (
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
                    {regionsList.map((city) => (
                      <button
                        key={city}
                        onClick={() => {
                          handleInputChange("city", city);
                          setShowCityDropdown(false);
                        }}
                        className={`
                          w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600
                          ${isDarkMode ? "text-white" : "text-gray-900"}
                        `}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Location Picker */}
              <div>
                <label
                  className={`
                    block text-sm font-medium mb-2
                    ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                  `}
                >
                  {l("SavedAddressesDrawer.location") || "Location"}
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
                    if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
                      alert(
                        "Google Maps API key is not configured. Please add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your environment variables."
                      );
                      return;
                    }
                    setShowMapModal(true);
                  }}
                  disabled={!mapsLoaded}
                  className={`
                    w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between
                    ${
                      isDarkMode
                        ? "bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
                        : "bg-white border-gray-300 text-gray-900 hover:bg-gray-50"
                    }
                    focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors
                    ${!mapsLoaded ? "opacity-50 cursor-not-allowed" : ""}
                  `}
                >
                  <span className={formData.location ? "" : "text-gray-500"}>
                    {formData.location
                      ? `${formData.location.latitude.toFixed(
                          4
                        )}, ${formData.location.longitude.toFixed(4)}`
                      : !mapsLoaded
                      ? "Loading Maps..."
                      : l("SavedAddressesDrawer.selectOnMap") ||
                        "Select on Map"}
                  </span>
                  <Map size={16} />
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingAddress(null);
                  setFormData({
                    addressLine1: "",
                    addressLine2: "",
                    phoneNumber: "",
                    city: "",
                    location: null,
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
                {l("SavedAddressesDrawer.cancel") || "Cancel"}
              </button>
              <button
                onClick={handleSaveAddress}
                disabled={
                  !formData.addressLine1.trim() ||
                  !formData.phoneNumber.trim() ||
                  !formData.city.trim()
                }
                className="
                  flex-1 py-2 px-4 rounded-lg
                  bg-gradient-to-r from-orange-500 to-pink-500 text-white
                  hover:from-orange-600 hover:to-pink-600
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-200
                "
              >
                {l("SavedAddressesDrawer.save") || "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map Modal for Location Selection */}
      {showMapModal && mapsLoaded && (
        <LocationPickerModal
          isOpen={showMapModal}
          onClose={() => setShowMapModal(false)}
          onLocationSelect={(location) => {
            setFormData((prev) => ({ ...prev, location }));
            setShowMapModal(false);
          }}
          initialLocation={formData.location}
          isDarkMode={isDarkMode}
          localization={l}
        />
      )}
    </div>
  );

  return typeof window !== 'undefined'
    ? createPortal(drawerContent, document.body)
    : null;
};

// Modern Location Picker Modal with AdvancedMarkerElement
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

  // Initialize map when modal opens
  useEffect(() => {
    if (!isOpen || !window.google || !mapRef.current) return;

    const initializeMap = async () => {
      try {
        // Import the marker library
        const { AdvancedMarkerElement } = (await google.maps.importLibrary(
          "marker"
        )) as google.maps.MarkerLibrary;

        // Default location (Cyprus center)
        const defaultCenter = { lat: 35.1855, lng: 33.3823 };
        const mapCenter = initialLocation
          ? { lat: initialLocation.latitude, lng: initialLocation.longitude }
          : defaultCenter;

        // Create map with Map ID required for AdvancedMarkerElement
        const map = new google.maps.Map(mapRef.current!, {
          center: mapCenter,
          zoom: initialLocation ? 15 : 10,
          mapId: process.env.NEXT_PUBLIC_MAP_ID || "DEMO_MAP_ID", // Required for AdvancedMarkerElement
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
                {
                  featureType: "administrative.locality",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#d59563" }],
                },
                {
                  featureType: "poi",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#d59563" }],
                },
                {
                  featureType: "poi.park",
                  elementType: "geometry",
                  stylers: [{ color: "#263c3f" }],
                },
                {
                  featureType: "poi.park",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#6b9a76" }],
                },
                {
                  featureType: "road",
                  elementType: "geometry",
                  stylers: [{ color: "#38414e" }],
                },
                {
                  featureType: "road",
                  elementType: "geometry.stroke",
                  stylers: [{ color: "#212a37" }],
                },
                {
                  featureType: "road",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#9ca5b3" }],
                },
                {
                  featureType: "road.highway",
                  elementType: "geometry",
                  stylers: [{ color: "#746855" }],
                },
                {
                  featureType: "road.highway",
                  elementType: "geometry.stroke",
                  stylers: [{ color: "#1f2835" }],
                },
                {
                  featureType: "road.highway",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#f3d19c" }],
                },
                {
                  featureType: "transit",
                  elementType: "geometry",
                  stylers: [{ color: "#2f3948" }],
                },
                {
                  featureType: "transit.station",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#d59563" }],
                },
                {
                  featureType: "water",
                  elementType: "geometry",
                  stylers: [{ color: "#17263c" }],
                },
                {
                  featureType: "water",
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#515c6d" }],
                },
                {
                  featureType: "water",
                  elementType: "labels.text.stroke",
                  stylers: [{ color: "#17263c" }],
                },
              ]
            : [],
        });

        mapInstanceRef.current = map;

        // Create initial marker position
        const markerPosition = initialLocation
          ? { lat: initialLocation.latitude, lng: initialLocation.longitude }
          : mapCenter;

        // Create advanced marker
        const marker = new AdvancedMarkerElement({
          map: map,
          position: markerPosition,
          title:
            l("SavedAddressesDrawer.clickToSelectLocation") ||
            "Click to select location",
        });

        markerRef.current = marker;

        // Handle map click with debouncing
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

            // ✅ Correct way to update AdvancedMarkerElement position
            if (markerRef.current) {
              markerRef.current.position = {
                lat: event.latLng.lat(),
                lng: event.latLng.lng(),
              };
            }
          }
        });

        // Set initial selected location
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

    // Cleanup function
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

  // Get user's current location
  const getCurrentLocation = useCallback(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setSelectedLocation(newLocation);

          const latLng = new google.maps.LatLng(
            newLocation.latitude,
            newLocation.longitude
          );

          if (mapInstanceRef.current) {
            mapInstanceRef.current.setCenter(latLng);
            mapInstanceRef.current.setZoom(15);
          }

          if (markerRef.current) {
            markerRef.current.position = {
              lat: newLocation.latitude,
              lng: newLocation.longitude,
            };
          }
        },
        (error) => {
          console.error("Error getting location:", error);
          alert(
            l("SavedAddressesDrawer.locationError") ||
              "Could not get your location. Please ensure location access is enabled."
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    } else {
      alert(
        l("SavedAddressesDrawer.geolocationNotSupported") ||
          "Geolocation is not supported by this browser"
      );
    }
  }, [l]);

  const handleConfirm = useCallback(() => {
    if (selectedLocation) {
      onLocationSelect(selectedLocation);
    }
  }, [selectedLocation, onLocationSelect]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div
        className={`
          w-full max-w-4xl h-[80vh] rounded-xl overflow-hidden
          ${isDarkMode ? "bg-gray-800" : "bg-white"}
          shadow-2xl flex flex-col
        `}
      >
        {/* Header */}
        <div
          className={`
            flex items-center justify-between p-4 border-b
            ${isDarkMode ? "border-gray-700" : "border-gray-200"}
          `}
        >
          <h3
            className={`
              text-lg font-bold
              ${isDarkMode ? "text-white" : "text-gray-900"}
            `}
          >
            {l("SavedAddressesDrawer.selectLocation") || "Select Location"}
          </h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={getCurrentLocation}
              className={`
                px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${
                  isDarkMode
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }
              `}
            >
              {l("SavedAddressesDrawer.useCurrentLocation") ||
                "Use Current Location"}
            </button>
            <button
              onClick={onClose}
              className={`
                p-2 rounded-full transition-colors
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
        </div>

        {/* Map Container */}
        <div className="flex-1 relative">
          <div
            ref={mapRef}
            className="w-full h-full"
            style={{ minHeight: "400px" }}
          />

          {/* Selected Location Info */}
          {selectedLocation && (
            <div
              className={`
                absolute bottom-4 left-4 right-4 p-4 rounded-lg shadow-lg
                ${isDarkMode ? "bg-gray-800" : "bg-white"}
                border ${isDarkMode ? "border-gray-700" : "border-gray-200"}
              `}
            >
              <p
                className={`
                  text-sm font-medium mb-2
                  ${isDarkMode ? "text-white" : "text-gray-900"}
                `}
              >
                {l("SavedAddressesDrawer.selectedLocation") ||
                  "Selected Location"}
                :
              </p>
              <p
                className={`
                  text-sm font-mono
                  ${isDarkMode ? "text-gray-300" : "text-gray-600"}
                `}
              >
                {selectedLocation.latitude.toFixed(6)},{" "}
                {selectedLocation.longitude.toFixed(6)}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`
            flex items-center justify-between p-4 border-t
            ${isDarkMode ? "border-gray-700" : "border-gray-200"}
          `}
        >
          <p
            className={`
              text-sm
              ${isDarkMode ? "text-gray-400" : "text-gray-600"}
            `}
          >
            {l("SavedAddressesDrawer.clickToSelectLocation") ||
              "Click on the map to select a location"}
          </p>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className={`
                px-4 py-2 rounded-lg
                ${
                  isDarkMode
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }
                transition-colors duration-200
              `}
            >
              {l("SavedAddressesDrawer.cancel") || "Cancel"}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedLocation}
              className="
                px-4 py-2 rounded-lg
                bg-gradient-to-r from-orange-500 to-pink-500 text-white
                hover:from-orange-600 hover:to-pink-600
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200
              "
            >
              {l("SavedAddressesDrawer.confirm") || "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
