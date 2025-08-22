"use client";

import React, { useState, useRef } from "react";
import { useUser } from "@/context/UserProvider";
import { updateDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import {
  User,
  Camera,
  Mail,
  MapPin,
  Package,
  CreditCard,
  ShoppingCart,
  Upload,
  Star,
  Zap,
  HelpCircle,
  Info,  
  LogOut,
  ChevronRight,
  Box,
  Moon,
  Sun,
  Settings,
  Receipt,
  Bell,
} from "lucide-react";
import Image from "next/image";
import { SavedPaymentMethodsDrawer } from "@/app/components/profile/SavedPaymentMethodsDrawer";
import { useTranslations } from "next-intl";
import { SellerInfoDrawer } from "@/app/components/profile/SellerInfoDrawer";
import { SavedAddressesDrawer } from "@/app/components/profile/AddressesDrawer";

interface ActionButton {
  icon: React.ElementType;
  label: string;
  path?: string;
  action?: () => void;
  gradient: string;
}

interface MainActionButton {
  icon: React.ElementType;
  label: string;
  path?: string;
  description: string;
  featured?: boolean;
  isExternal?: boolean;
}

export default function ProfilePage() {
  const { user, profileData, updateProfileData, isLoading } = useUser();
  
  // For now, we'll mock userOwnsShop - you can replace this with actual logic
  const userOwnsShop = profileData?.userOwnsShop || false;
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPaymentMethodsDrawerOpen, setIsPaymentMethodsDrawerOpen] = useState(false);
  const [isSellerInfoDrawerOpen, setIsSellerInfoDrawerOpen] = useState(false);
  const [isAddressesDrawerOpen, setIsAddressesDrawerOpen] = useState(false);
  const t = useTranslations();
  const router = useRouter();

  React.useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    if (typeof document !== "undefined") {
      const savedTheme = localStorage.getItem("theme");
      const systemPrefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

      if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    if (!validTypes.includes(file.type)) {
      alert(t("ProfilePage.invalidFileType"));
      return;
    }

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(t("ProfilePage.fileSizeError"));
      return;
    }

    setIsUploadingImage(true);
    try {
      const storageRef = ref(storage, `profileImages/${user.uid}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);

      await updateDoc(doc(db, "users", user.uid), {
        profileImage: downloadURL,
      });

      await updateProfileData({ profileImage: downloadURL });

      alert(t("ProfilePage.imageUploadSuccess"));
    } catch (error) {
      console.error("Error uploading image:", error);
      alert(t("ProfilePage.imageUploadError"));
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;

    const confirmLogout = window.confirm(t("ProfilePage.logoutConfirmation"));
    if (!confirmLogout) return;

    try {
      setIsLoggingOut(true);
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Error signing out:", error);
      setIsLoggingOut(false);
    }
  };

  const handleUnauthenticatedTap = () => {
    router.push("/login");
  };

  const handleNavigation = (
    path?: string,
    action?: () => void,
    isExternal?: boolean
  ) => {
    if (action) {
      action();
      return;
    }

    if (!user) {
      handleUnauthenticatedTap();
      return;
    }

    if (path) {
      if (isExternal) {
        window.open(path, "_blank");
      } else {
        router.push(path);
      }
    }
  };

  const toggleTheme = () => {
    if (typeof document !== "undefined") {
      const html = document.documentElement;
      const isDarkMode = html.classList.contains("dark");

      if (isDarkMode) {
        html.classList.remove("dark");
        localStorage.setItem("theme", "light");
      } else {
        html.classList.add("dark");
        localStorage.setItem("theme", "dark");
      }
    }
  };

  if (isLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  const quickActionButtons: ActionButton[] = [
    {
      icon: Box,
      label: t("ProfilePage.myProducts"),
      path: "/myproducts",
      gradient: "from-blue-500 to-blue-600",
    },
    {
      icon: CreditCard,
      label: t("ProfilePage.paymentMethods"),
      action: () => setIsPaymentMethodsDrawerOpen(true),
      gradient: "from-green-500 to-green-600",
    },
    {
      icon: MapPin,
      label: t("ProfilePage.myAddresses"),
      action: () => setIsAddressesDrawerOpen(true),
      gradient: "from-purple-500 to-purple-600",
    },
    {
      icon: Info,
      label: t("ProfilePage.sellerInfo"),
      action: () => setIsSellerInfoDrawerOpen(true),
      gradient: "from-indigo-500 to-indigo-600",
    },
  ];

  // Main action buttons with conditional layout based on userOwnsShop
  const getMainActionButtons = (): MainActionButton[] => {
    const baseButtons: MainActionButton[] = [
      {
        icon: Package,
        label: t("ProfilePage.myOrders"),
        path: "/orders",
        description: t("ProfilePage.trackRecentPurchases"),
      },
      {
        icon: Upload,
        label: t("ProfilePage.sellOnVitrin"),
        path: "/list_product_screen",
        description: t("ProfilePage.startSellingProducts"),
      },
      {
        icon: Star,
        label: t("ProfilePage.myReviews"),
        path: "/reviews",
        description: t("ProfilePage.yourWrittenReviews"),
      },
      {
        icon: Zap,
        label: t("ProfilePage.boosts"),
        path: "/boosts",
        description: t("ProfilePage.promoteYourListings"),
      },
      {
        icon: HelpCircle,
        label: t("ProfilePage.myQuestions"),
        path: "/productquestions",
        description: t("ProfilePage.productQuestionsAnswers"),
      },
    ];

    if (userOwnsShop) {
      return [
        {
          icon: ShoppingCart,
          label: t("ProfilePage.sellerPanel"),
          path: "/seller-panel",
          description: t("ProfilePage.manageYourStore"),
          featured: true,
        },
        ...baseButtons,
      ];
    }

    return baseButtons;
  };

  const mainActionButtons = getMainActionButtons();

  return (
    <div
      className={`min-h-screen py-4 md:py-8 ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
        {/* Header Card */}
        <div
          className={`rounded-2xl md:rounded-3xl shadow-xl overflow-hidden mb-4 md:mb-8 ${
            isDarkMode ? "bg-gray-800" : "bg-white"
          }`}
        >
          {/* Cover Section */}
          <div className="h-24 md:h-40 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 relative">
            <div className="absolute inset-0 bg-black/10"></div>
          </div>

          {/* Profile Section */}
          <div className="relative px-4 md:px-8 pb-4 md:pb-8">
            {/* Profile Image */}
            <div className="flex items-end justify-between -mt-12 md:-mt-20 mb-4 md:mb-8">
              <div className="relative">
                <div
                  className={`w-24 h-24 md:w-40 md:h-40 rounded-full p-2 md:p-3 shadow-2xl ${
                    isDarkMode ? "bg-gray-800" : "bg-white"
                  }`}
                >
                  <div
                    className={`w-full h-full rounded-full overflow-hidden relative ${
                      isDarkMode ? "bg-gray-700" : "bg-gray-200"
                    }`}
                  >
                    {user && profileData?.profileImage ? (
                      <Image
                        src={profileData.profileImage}
                        alt="Profile"
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="w-8 h-8 md:w-16 md:h-16 text-gray-400" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Upload Button */}
                {user && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="absolute bottom-1 md:bottom-3 right-1 md:right-3 w-8 h-8 md:w-12 md:h-12 bg-orange-500 hover:bg-orange-600 rounded-full flex items-center justify-center shadow-lg transition-colors disabled:opacity-50"
                  >
                    {isUploadingImage ? (
                      <div className="animate-spin rounded-full h-4 w-4 md:h-6 md:w-6 border-2 border-white border-t-transparent" />
                    ) : (
                      <Camera className="w-4 h-4 md:w-6 md:h-6 text-white" />
                    )}
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>

              {/* Theme Toggle and Login Button */}
              <div className="flex items-center gap-2 mt-12 md:mt-20">
                <button
                  onClick={toggleTheme}
                  className={`p-2 md:p-3 rounded-full transition-colors ${
                    isDarkMode
                      ? "bg-gray-700 hover:bg-gray-600"
                      : "bg-gray-100 hover:bg-gray-200"
                  }`}
                >
                  {isDarkMode ? (
                    <Sun className="w-4 h-4 md:w-5 md:h-5 text-yellow-500" />
                  ) : (
                    <Moon className="w-4 h-4 md:w-5 md:h-5 text-gray-600" />
                  )}
                </button>

                {user && (
                  <button
                    onClick={() => router.push("/notifications")}
                    className={`p-2 md:p-3 rounded-full transition-colors relative ${
                      isDarkMode
                        ? "bg-gray-700 hover:bg-gray-600"
                        : "bg-gray-100 hover:bg-gray-200"
                    }`}
                  >
                    <Bell className={`w-4 h-4 md:w-5 md:h-5 ${isDarkMode ? "text-white" : "text-gray-600"}`} />
                    {/* Notification badge can be added here if needed */}
                  </button>
                )}

                {!user && (
                  <button
                    onClick={() => router.push("/login")}
                    className="px-4 py-2 md:px-6 md:py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-md font-medium transition-colors text-sm md:text-base"
                  >
                    {t("ProfilePage.login")}
                  </button>
                )}
              </div>
            </div>

            {/* User Info */}
            <div className="space-y-2 md:space-y-4">
              <div>
                <h1
                  className={`text-xl md:text-3xl font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {user
                    ? profileData?.displayName || t("ProfilePage.noName")
                    : t("ProfilePage.notLoggedIn")}
                </h1>
                {user && (
                  <div className="flex items-center gap-3 mt-1 md:mt-2">
                    <div
                      className={`flex items-center gap-2 ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      <Mail className="w-3 h-3 md:w-4 md:h-4" />
                      <span className="text-sm md:text-base">
                        {profileData?.email || user.email}
                      </span>
                    </div>
                    {profileData?.isVerified && (
                      <span
                        className={`inline-flex items-center px-2 py-1 md:px-3 md:py-1 rounded-full text-xs font-medium ${
                          isDarkMode
                            ? "bg-green-900/30 text-green-400"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {t("ProfilePage.verified")}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* User Stats */}
              {user && (
                <div className="flex items-center gap-6 pt-2 md:pt-4">
                  {profileData?.location && (
                    <div
                      className={`flex items-center gap-2 ${
                        isDarkMode ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      <MapPin className="w-3 h-3 md:w-4 md:h-4" />
                      <span className="text-sm md:text-base">
                        {profileData.location}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-8">
          {quickActionButtons.map((button, index) => (
            <button
              key={index}
              onClick={() => handleNavigation(button.path, button.action)}
              className={`group p-3 md:p-4 rounded-xl md:rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 border flex items-center gap-2 md:gap-3 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-100"
              }`}
            >
              <div
                className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-gradient-to-r ${button.gradient} flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0`}
              >
                <button.icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <p
                className={`text-xs md:text-sm font-medium text-left leading-tight ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {button.label}
              </p>
            </button>
          ))}
        </div>

        {/* Main Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6 mb-4 md:mb-8">
          {mainActionButtons.map((button, index) => (
            <button
              key={index}
              onClick={() => handleNavigation(button.path, undefined, button.isExternal)}
              className={`group p-4 md:p-6 rounded-xl md:rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 text-left ${
                button.featured
                  ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                  : isDarkMode
                  ? "bg-gray-800 border border-gray-700"
                  : "bg-white border border-gray-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 md:gap-4">
                  <div
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center ${
                      button.featured
                        ? "bg-white/20"
                        : "bg-gradient-to-r from-orange-500 to-pink-500"
                    }`}
                  >
                    <button.icon
                      className={`w-5 h-5 md:w-6 md:h-6 ${
                        button.featured ? "text-white" : "text-white"
                      }`}
                    />
                  </div>
                  <div>
                    <h3
                      className={`text-sm md:text-base font-semibold ${
                        button.featured
                          ? "text-white"
                          : isDarkMode
                          ? "text-white"
                          : "text-gray-900"
                      }`}
                    >
                      {button.label}
                    </h3>
                    <p
                      className={`text-xs md:text-sm ${
                        button.featured
                          ? "text-white/80"
                          : isDarkMode
                          ? "text-gray-400"
                          : "text-gray-600"
                      }`}
                    >
                      {button.description}
                    </p>
                  </div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform ${
                    button.featured
                      ? "text-white/80"
                      : isDarkMode
                      ? "text-gray-600"
                      : "text-gray-400"
                  }`}
                />
              </div>
            </button>
          ))}
        </div>

        {/* Additional Actions for Authenticated Users */}
        {user && (
          <div
            className={`rounded-xl md:rounded-2xl shadow-md p-4 md:p-6 border mb-4 md:mb-8 ${
              isDarkMode
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-gray-100"
            }`}
          >
            <div className="space-y-3 md:space-y-4">
              {/* Pickup Points */}
              <button
                onClick={() => handleNavigation("/pickup-points")}
                className={`w-full flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-lg md:rounded-xl transition-colors text-left ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
                }`}
              >
                <MapPin
                  className={`w-4 h-4 md:w-5 md:h-5 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                />
                <span
                  className={`text-sm md:text-base ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("ProfilePage.pickupPoints")}
                </span>
                <ChevronRight
                  className={`w-4 h-4 md:w-5 md:h-5 ml-auto ${
                    isDarkMode ? "text-gray-600" : "text-gray-400"
                  }`}
                />
              </button>

              <div
                className={`border-t ${
                  isDarkMode ? "border-gray-700" : "border-gray-200"
                }`}
              ></div>

              {/* My Receipts */}
              <button
                onClick={() => handleNavigation("/receipts")}
                className={`w-full flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-lg md:rounded-xl transition-colors text-left ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
                }`}
              >
                <Receipt
                  className={`w-4 h-4 md:w-5 md:h-5 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                />
                <span
                  className={`text-sm md:text-base ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("ProfilePage.myReceipts")}
                </span>
                <ChevronRight
                  className={`w-4 h-4 md:w-5 md:h-5 ml-auto ${
                    isDarkMode ? "text-gray-600" : "text-gray-400"
                  }`}
                />
              </button>

              <div
                className={`border-t ${
                  isDarkMode ? "border-gray-700" : "border-gray-200"
                }`}
              ></div>

              {/* Become a Seller */}
              <button
                onClick={() => handleNavigation("/createshop")}
                className={`w-full flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-lg md:rounded-xl transition-colors text-left ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
                }`}
              >
                <ShoppingCart
                  className={`w-4 h-4 md:w-5 md:h-5 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                />
                <span
                  className={`text-sm md:text-base ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("ProfilePage.becomeASeller")}
                </span>
                <ChevronRight
                  className={`w-4 h-4 md:w-5 md:h-5 ml-auto ${
                    isDarkMode ? "text-gray-600" : "text-gray-400"
                  }`}
                />
              </button>

              <div
                className={`border-t ${
                  isDarkMode ? "border-gray-700" : "border-gray-200"
                }`}
              ></div>

              {/* Account Settings */}
              <button
                onClick={() => handleNavigation("/account-settings")}
                className={`w-full flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-lg md:rounded-xl transition-colors text-left ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
                }`}
              >
                <Settings
                  className={`w-4 h-4 md:w-5 md:h-5 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                />
                <span
                  className={`text-sm md:text-base ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("ProfilePage.accountSettings")}
                </span>
                <ChevronRight
                  className={`w-4 h-4 md:w-5 md:h-5 ml-auto ${
                    isDarkMode ? "text-gray-600" : "text-gray-400"
                  }`}
                />
              </button>

              <div
                className={`border-t ${
                  isDarkMode ? "border-gray-700" : "border-gray-200"
                }`}
              ></div>

              {/* Support and FAQ */}
              <button
                onClick={() => handleNavigation("/support-and-faq")}
                className={`w-full flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-lg md:rounded-xl transition-colors text-left ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
                }`}
              >
                <Info
                  className={`w-4 h-4 md:w-5 md:h-5 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                />
                <span
                  className={`text-sm md:text-base ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("ProfilePage.supportAndFaq")}
                </span>
                <ChevronRight
                  className={`w-4 h-4 md:w-5 md:h-5 ml-auto ${
                    isDarkMode ? "text-gray-600" : "text-gray-400"
                  }`}
                />
              </button>

              <div
                className={`border-t ${
                  isDarkMode ? "border-gray-700" : "border-gray-200"
                }`}
              ></div>

              {/* Logout */}
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className={`w-full flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-lg md:rounded-xl transition-colors text-left disabled:opacity-50 ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
                }`}
              >
                <LogOut
                  className={`w-4 h-4 md:w-5 md:h-5 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  } ${isLoggingOut ? "animate-pulse" : ""}`}
                />
                <span
                  className={`text-sm md:text-base ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {isLoggingOut
                    ? t("ProfilePage.loggingOut")
                    : t("ProfilePage.logout")}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Unauthenticated State Message */}
        {!user && (
          <div
            className={`rounded-xl md:rounded-2xl shadow-md p-4 md:p-6 border text-center ${
              isDarkMode
                ? "bg-gray-800 border-gray-700"
                : "bg-white border-gray-100"
            }`}
          >
            <div className="space-y-3 md:space-y-4">
              <User
                className={`w-12 h-12 md:w-16 md:h-16 mx-auto ${
                  isDarkMode ? "text-gray-600" : "text-gray-400"
                }`}
              />
              <div>
                <h3
                  className={`text-lg md:text-xl font-semibold mb-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("ProfilePage.loginToAccess")}
                </h3>
                <p
                  className={`text-sm md:text-base mb-4 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("ProfilePage.loginDescription")}
                </p>
                <button
                  onClick={() => router.push("/login")}
                  className="w-full px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
                >
                  {t("ProfilePage.login")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drawers */}
      <SavedPaymentMethodsDrawer
        isOpen={isPaymentMethodsDrawerOpen}
        onClose={() => setIsPaymentMethodsDrawerOpen(false)}
        isDarkMode={isDarkMode}
        localization={t}
      />
      <SellerInfoDrawer
        isOpen={isSellerInfoDrawerOpen}
        onClose={() => setIsSellerInfoDrawerOpen(false)}
        isDarkMode={isDarkMode}
        localization={t}
      />
      <SavedAddressesDrawer
        isOpen={isAddressesDrawerOpen}
        onClose={() => setIsAddressesDrawerOpen(false)}
        isDarkMode={isDarkMode}
        localization={t}
      />
    </div>
  );
}