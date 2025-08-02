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
  Phone,
  Calendar,
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
  const [isDarkMode, setIsDarkMode] = useState(false); // ✅ Keep this consistent with header
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPaymentMethodsDrawerOpen, setIsPaymentMethodsDrawerOpen] =
    useState(false);
  const t = useTranslations();
  const router = useRouter();

  // ✅ FIX: Use the same theme detection logic as the header
  React.useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    // Initialize theme from localStorage or system preference
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

    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    if (!validTypes.includes(file.type)) {
      alert("Lütfen geçerli bir resim dosyası seçin (JPG, PNG veya GIF)");
      return;
    }

    // Validate file size (20MB)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("Resim boyutu 20MB'dan küçük olmalıdır");
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

      // Update local state
      await updateProfileData({ profileImage: downloadURL });

      alert("Profil resmi başarıyla güncellendi!");
    } catch (error) {
      console.error("Error uploading image:", error);
      alert("Resim yüklenemedi. Lütfen tekrar deneyin.");
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

  const handleNavigation = (path?: string, action?: () => void) => {
    if (action) {
      action();
      return;
    }

    if (!user) {
      router.push("/login");
      return;
    }

    if (path) {
      router.push(path);
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
            Profilinizi görüntülemek için giriş yapın
          </h1>
          <button
            onClick={() => router.push("/login")}
            className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
          >
            Giriş Yap
          </button>
        </div>
      </div>
    );
  }

  const quickActionButtons: ActionButton[] = [
    {
      icon: Box,
      label: "Ürünlerim",
      path: "/my-products",
      gradient: "from-blue-500 to-blue-600",
    },
    {
      icon: CreditCard,
      label: "Ödeme Yöntemleri",
      action: () => setIsPaymentMethodsDrawerOpen(true),
      gradient: "from-green-500 to-green-600",
    },
    {
      icon: MapPin,
      label: "Adreslerim",
      path: "/addresses",
      gradient: "from-purple-500 to-purple-600",
    },
    {
      icon: Info,
      label: "Satıcı Bilgileri",
      path: "/seller-info",
      gradient: "from-indigo-500 to-indigo-600",
    },
  ];

  const mainActionButtons = [
    {
      icon: Package,
      label: "Siparişlerim",
      path: "/my-orders",
      description: "Son alışverişlerinizi takip edin",
    },
    {
      icon: Upload,
      label: "Nar24'te Sat",
      path: "/sell",
      description: "Ürünlerinizi satmaya başlayın",
    },
    {
      icon: Star,
      label: "Değerlendirmelerim",
      path: "/my-reviews",
      description: "Yazdığınız değerlendirmeler",
    },
    {
      icon: Zap,
      label: "Yükseltmeler",
      path: "/boosts",
      description: "İlanlarınızı öne çıkarın",
    },
    {
      icon: HelpCircle,
      label: "Sorularım",
      path: "/my-questions",
      description: "Ürün soru ve cevapları",
    },
    {
      icon: ShoppingCart,
      label: "Satıcı Paneli",
      path: "/seller-panel",
      description: "Mağazanızı yönetin",
      featured: true,
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
                  {profileData?.displayName || "İsim Yok"}
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
                      Onaylanmış
                    </span>
                  )}
                </div>
              </div>

              {profileData?.bio && (
                <p
                  className={`text-lg ${
                    isDarkMode ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {profileData.bio}
                </p>
              )}

              {/* User Stats */}
              <div className="flex items-center gap-6 pt-4">
                {profileData?.phone && (
                  <div
                    className={`flex items-center gap-2 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    <Phone className="w-4 h-4" />
                    <span>{profileData.phone}</span>
                  </div>
                )}
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
                {profileData?.birthDate && (
                  <div
                    className={`flex items-center gap-2 ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    <span>
                      {new Date(profileData.birthDate).toLocaleDateString()}
                    </span>
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
              className={`group p-6 rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 border ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-100"
              }`}
            >
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-r ${button.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
              >
                <button.icon className="w-6 h-6 text-white" />
              </div>
              <p
                className={`text-sm font-medium text-center ${
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
            Account Settings
          </h2>

          <div className="space-y-4">
            {/* Become a Seller */}
            <button
              onClick={() => handleNavigation("/become-seller")}
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
                  Become a Seller
                </h3>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  Start your own shop on Nar24
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
                if (
                  confirm(
                    "Are you sure you want to delete your account? This action cannot be undone."
                  )
                ) {
                  // Handle account deletion
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
                  Delete Account
                </h3>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-red-400" : "text-red-500"
                  }`}
                >
                  Permanently delete your account and data
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
                  {isLoggingOut ? "Logging out..." : "Logout"}
                </h3>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  Sign out of your account
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
        localization={{
          SavedPaymentMethodsDrawer: {
            title: t("SavedPaymentMethodsDrawer.title"),
            ofFourMethods: t("SavedPaymentMethodsDrawer.ofFourMethods"),
            addNew: t("SavedPaymentMethodsDrawer.addNew"),
            clearAll: t("SavedPaymentMethodsDrawer.clearAll"),
            clearing: t("SavedPaymentMethodsDrawer.clearing"),
            loginRequired: t("SavedPaymentMethodsDrawer.loginRequired"),
            loginToManagePaymentMethods: t(
              "SavedPaymentMethodsDrawer.loginToManagePaymentMethods"
            ),
            login: t("SavedPaymentMethodsDrawer.login"),
            loading: t("SavedPaymentMethodsDrawer.loading"),
            noSavedPaymentMethods: t(
              "SavedPaymentMethodsDrawer.noSavedPaymentMethods"
            ),
            addFirstPaymentMethod: t(
              "SavedPaymentMethodsDrawer.addFirstPaymentMethod"
            ),
            addNewPaymentMethod: t(
              "SavedPaymentMethodsDrawer.addNewPaymentMethod"
            ),
            preferred: t("SavedPaymentMethodsDrawer.preferred"),
            expires: t("SavedPaymentMethodsDrawer.expires"),
            editPaymentMethod: t("SavedPaymentMethodsDrawer.editPaymentMethod"),
            newPaymentMethod: t("SavedPaymentMethodsDrawer.newPaymentMethod"),
            cardHolderName: t("SavedPaymentMethodsDrawer.cardHolderName"),
            cardNumber: t("SavedPaymentMethodsDrawer.cardNumber"),
            expiryDate: t("SavedPaymentMethodsDrawer.expiryDate"),
            cancel: t("SavedPaymentMethodsDrawer.cancel"),
            save: t("SavedPaymentMethodsDrawer.save"),
            invalidCardNumber: t("SavedPaymentMethodsDrawer.invalidCardNumber"),
            unsupportedCardType: t(
              "SavedPaymentMethodsDrawer.unsupportedCardType"
            ),
            maxPaymentMethodsReached: t(
              "SavedPaymentMethodsDrawer.maxPaymentMethodsReached"
            ),
            paymentMethodAdded: t(
              "SavedPaymentMethodsDrawer.paymentMethodAdded"
            ),
            paymentMethodUpdated: t(
              "SavedPaymentMethodsDrawer.paymentMethodUpdated"
            ),
            paymentMethodDeleted: t(
              "SavedPaymentMethodsDrawer.paymentMethodDeleted"
            ),
            allPaymentMethodsCleared: t(
              "SavedPaymentMethodsDrawer.allPaymentMethodsCleared"
            ),
            preferredPaymentMethodSet: t(
              "SavedPaymentMethodsDrawer.preferredPaymentMethodSet"
            ),
            errorOccurred: t("SavedPaymentMethodsDrawer.errorOccurred"),
            deleteConfirmation: t(
              "SavedPaymentMethodsDrawer.deleteConfirmation"
            ),
            deleteAllConfirmation: t(
              "SavedPaymentMethodsDrawer.deleteAllConfirmation"
            ),
            fillAllFields: t("SavedPaymentMethodsDrawer.fillAllFields"),
          },
        }}
      />
    </div>
  );
}
