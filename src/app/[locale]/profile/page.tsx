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
  Trash2,
  LogOut,
  ChevronRight,
  Box,
  Moon,
  Sun,
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

export default function ProfilePage() {
  const { user, profileData, updateProfileData, isLoading } = useUser();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPaymentMethodsDrawerOpen, setIsPaymentMethodsDrawerOpen] =
    useState(false);
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

    try {
      setIsLoggingOut(true);
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Error signing out:", error);
      setIsLoggingOut(false);
    }
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
      router.push("/login");
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

  if (!user) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        }`}
      >
        <div className="text-center">
          <h1
            className={`text-2xl font-bold mb-4 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("ProfilePage.loginToViewProfile")}
          </h1>
          <button
            onClick={() => router.push("/login")}
            className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
          >
            {t("ProfilePage.login")}
          </button>
        </div>
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

  const mainActionButtons = [
    {
      icon: Package,
      label: t("ProfilePage.myOrders"),
      path: "/orders",
      description: t("ProfilePage.trackRecentPurchases"),
    },
    {
      icon: Upload,
      label: t("ProfilePage.sellOnNar24"),
      path: "/sell",
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
    {
      icon: ShoppingCart,
      label: t("ProfilePage.sellerPanel"),
      path: "https://nar24panel.com",
      description: t("ProfilePage.manageYourStore"),
      featured: true,
      isExternal: true,
    },
  ];

  return (
    <div
      className={`min-h-screen py-8 ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header Card */}
        <div
          className={`rounded-3xl shadow-xl overflow-hidden mb-8 ${
            isDarkMode ? "bg-gray-800" : "bg-white"
          }`}
        >
          {/* Cover Section */}
          <div className="h-40 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 relative">
            <div className="absolute inset-0 bg-black/10"></div>
          </div>

          {/* Profile Section */}
          <div className="relative px-8 pb-8">
            {/* Profile Image */}
            <div className="flex items-end justify-between -mt-20 mb-8">
              <div className="relative">
                <div
                  className={`w-40 h-40 rounded-full p-3 shadow-2xl ${
                    isDarkMode ? "bg-gray-800" : "bg-white"
                  }`}
                >
                  <div
                    className={`w-full h-full rounded-full overflow-hidden relative ${
                      isDarkMode ? "bg-gray-700" : "bg-gray-200"
                    }`}
                  >
                    {profileData?.profileImage ? (
                      <Image
                        src={profileData.profileImage}
                        alt="Profile"
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="w-16 h-16 text-gray-400" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Upload Button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className="absolute bottom-3 right-3 w-12 h-12 bg-orange-500 hover:bg-orange-600 rounded-full flex items-center justify-center shadow-lg transition-colors disabled:opacity-50"
                >
                  {isUploadingImage ? (
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
                  ) : (
                    <Camera className="w-6 h-6 text-white" />
                  )}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className={`mt-20 p-3 rounded-full transition-colors ${
                  isDarkMode
                    ? "bg-gray-700 hover:bg-gray-600"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {isDarkMode ? (
                  <Sun className="w-5 h-5 text-yellow-500" />
                ) : (
                  <Moon className="w-5 h-5 text-gray-600" />
                )}
              </button>
            </div>

            {/* User Info */}
            <div className="space-y-4">
              <div>
                <h1
                  className={`text-3xl font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {profileData?.displayName || t("ProfilePage.noName")}
                </h1>
                <div className="flex items-center gap-3 mt-2">
                  <div
                    className={`flex items-center gap-2 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    <Mail className="w-4 h-4" />
                    <span>{profileData?.email || user.email}</span>
                  </div>
                  {profileData?.isVerified && (
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        isDarkMode
                          ? "bg-green-900/30 text-green-400"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {t("ProfilePage.verified")}
                    </span>
                  )}
                </div>
              </div>

              {/* User Stats */}
              <div className="flex items-center gap-6 pt-4">
                {profileData?.location && (
                  <div
                    className={`flex items-center gap-2 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    <MapPin className="w-4 h-4" />
                    <span>{profileData.location}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {quickActionButtons.map((button, index) => (
            <button
              key={index}
              onClick={() => handleNavigation(button.path, button.action)}
              className={`group p-4 rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 border flex items-center gap-3 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-100"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl bg-gradient-to-r ${button.gradient} flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0`}
              >
                <button.icon className="w-5 h-5 text-white" />
              </div>
              <p
                className={`text-sm font-medium text-left leading-tight ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {button.label}
              </p>
            </button>
          ))}
        </div>

        {/* Main Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {mainActionButtons.map((button, index) => (
            <button
              key={index}
              onClick={() => handleNavigation(button.path)}
              className={`group p-6 rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 text-left ${
                button.featured
                  ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                  : isDarkMode
                  ? "bg-gray-800 border border-gray-700"
                  : "bg-white border border-gray-100"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      button.featured
                        ? "bg-white/20"
                        : "bg-gradient-to-r from-orange-500 to-pink-500"
                    }`}
                  >
                    <button.icon
                      className={`w-6 h-6 ${
                        button.featured ? "text-white" : "text-white"
                      }`}
                    />
                  </div>
                  <div>
                    <h3
                      className={`font-semibold ${
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
                      className={`text-sm ${
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
                  className={`w-5 h-5 group-hover:translate-x-1 transition-transform ${
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

        {/* Account Actions */}
        <div
          className={`rounded-2xl shadow-md p-6 border ${
            isDarkMode
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-100"
          }`}
        >
          <h2
            className={`text-xl font-bold mb-6 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("ProfilePage.accountSettings")}
          </h2>

          <div className="space-y-4">
            {/* Become a Seller */}
            <button
              onClick={() => handleNavigation("/createshop")}
              className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors text-left ${
                isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
              }`}
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3
                  className={`font-medium ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("ProfilePage.becomeSeller")}
                </h3>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("ProfilePage.startYourShop")}
                </p>
              </div>
              <ChevronRight
                className={`w-5 h-5 ${
                  isDarkMode ? "text-gray-600" : "text-gray-400"
                }`}
              />
            </button>

            {/* Divider */}
            <div
              className={`border-t ${
                isDarkMode ? "border-gray-700" : "border-gray-200"
              }`}
            ></div>

            {/* Delete Account */}
            <button
              onClick={() => {
                if (confirm(t("ProfilePage.deleteAccountConfirmation"))) {
                  console.log("Delete account");
                }
              }}
              className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors text-left group ${
                isDarkMode ? "hover:bg-red-900/20" : "hover:bg-red-50"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                  isDarkMode
                    ? "bg-red-900/30 group-hover:bg-red-900/50"
                    : "bg-red-100 group-hover:bg-red-200"
                }`}
              >
                <Trash2
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-red-400" : "text-red-600"
                  }`}
                />
              </div>
              <div className="flex-1">
                <h3
                  className={`font-medium ${
                    isDarkMode ? "text-red-400" : "text-red-600"
                  }`}
                >
                  {t("ProfilePage.deleteAccount")}
                </h3>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-red-400" : "text-red-500"
                  }`}
                >
                  {t("ProfilePage.permanentlyDeleteAccount")}
                </p>
              </div>
            </button>

            {/* Divider */}
            <div
              className={`border-t ${
                isDarkMode ? "border-gray-700" : "border-gray-200"
              }`}
            ></div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className={`w-full flex items-center gap-4 p-4 rounded-xl transition-colors text-left disabled:opacity-50 ${
                isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  isDarkMode ? "bg-gray-700" : "bg-gray-100"
                }`}
              >
                <LogOut
                  className={`w-5 h-5 ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  } ${isLoggingOut ? "animate-pulse" : ""}`}
                />
              </div>
              <div className="flex-1">
                <h3
                  className={`font-medium ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {isLoggingOut
                    ? t("ProfilePage.loggingOut")
                    : t("ProfilePage.logout")}
                </h3>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("ProfilePage.signOutAccount")}
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
      {/* SavedPaymentMethodsDrawer */}
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
