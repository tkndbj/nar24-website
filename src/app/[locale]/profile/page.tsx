"use client";

import React, { useState, useRef, useEffect } from "react";
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
  Folder,
  Ticket,
  CheckCircle,
  Store,
} from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import Footer from "@/app/components/Footer";



interface NavItem {
  icon: React.ElementType;
  label: string;
  description?: string;
  path?: string;
  action?: () => void;
  isExternal?: boolean;
  featured?: boolean;
  color?: string;
}

export default function ProfilePage() {
  const { user, profileData, updateProfileData, isLoading } = useUser();
  const userOwnsShop = profileData?.userOwnsShop || false;
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations();
  const router = useRouter();

  useEffect(() => {
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
      if (html.classList.contains("dark")) {
        html.classList.remove("dark");
        localStorage.setItem("theme", "light");
      } else {
        html.classList.add("dark");
        localStorage.setItem("theme", "dark");
      }
    }
  };

  // Loading
  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-gray-950" : "bg-gray-50"}`}>
        <div className="h-6 w-6 border-2 border-orange-200 dark:border-orange-900 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  // --- Sections data ---

  const shortcutItems: NavItem[] = [
    { icon: Box, label: t("ProfilePage.myProducts"), path: "/myproducts", color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40" },
    { icon: MapPin, label: t("ProfilePage.myAddresses"), path: "/saved-addresses", color: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/40" },
    { icon: Info, label: t("ProfilePage.sellerInfo"), path: "/seller-info", color: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40" },
    { icon: Ticket, label: t("ProfilePage.coupons"), path: "/coupon-and-benefits", color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40" },
  ];

  const activityItems: NavItem[] = [
    ...(userOwnsShop
      ? [{
          icon: ShoppingCart,
          label: t("ProfilePage.sellerPanel"),
          path: "/seller-panel",
          description: t("ProfilePage.manageYourStore"),
          featured: true,
          color: "text-purple-600 dark:text-purple-400",
        }]
      : []),
    { icon: Package, label: t("ProfilePage.myOrders"), path: "/orders", description: t("ProfilePage.trackRecentPurchases"), color: "text-orange-500 dark:text-orange-400" },
    { icon: Upload, label: t("ProfilePage.sellOnVitrin"), path: "/listproduct", description: t("ProfilePage.startSellingProducts"), color: "text-emerald-500 dark:text-emerald-400" },
    { icon: Star, label: t("ProfilePage.myReviews"), path: "/reviews", description: t("ProfilePage.yourWrittenReviews"), color: "text-amber-500 dark:text-amber-400" },
    { icon: Zap, label: t("ProfilePage.boosts"), path: "/boosts", description: t("ProfilePage.promoteYourListings"), color: "text-blue-500 dark:text-blue-400" },
    { icon: HelpCircle, label: t("ProfilePage.myQuestions"), path: "/productquestions", description: t("ProfilePage.productQuestionsAnswers"), color: "text-rose-500 dark:text-rose-400" },
  ];

  const accountItems: NavItem[] = [
    { icon: Receipt, label: t("ProfilePage.myReceipts"), path: "/receipts", color: "text-emerald-500 dark:text-emerald-400" },
    { icon: Folder, label: t("ProfilePage.refundForm"), path: "/refundform", color: "text-orange-500 dark:text-orange-400" },
    { icon: Store, label: t("ProfilePage.becomeASeller"), path: "/createshop", color: "text-violet-500 dark:text-violet-400" },
    { icon: Settings, label: t("ProfilePage.accountSettings"), path: "/account-settings", color: "text-gray-500 dark:text-gray-400" },
    { icon: Info, label: t("ProfilePage.supportAndFaq"), path: "/support-and-faq", color: "text-blue-500 dark:text-blue-400" },
  ];

  // Row component for nav lists
  const NavRow = ({ item, showBorder = true }: { item: NavItem; showBorder?: boolean }) => (
    <button
      onClick={() => handleNavigation(item.path, item.action, item.isExternal)}
      className={`w-full flex items-center gap-3 px-4 py-3 md:py-3.5 text-left transition-colors group ${
        showBorder
          ? isDarkMode ? "border-b border-gray-800/70" : "border-b border-gray-100"
          : ""
      } ${isDarkMode ? "hover:bg-gray-800/40" : "hover:bg-gray-50"}`}
    >
      <item.icon
        className={`w-[18px] h-[18px] flex-shrink-0 ${item.color || (isDarkMode ? "text-gray-500" : "text-gray-400")}`}
        strokeWidth={1.8}
      />
      <div className="flex-1 min-w-0">
        <span className={`text-[13px] md:text-sm block font-medium ${isDarkMode ? "text-gray-200" : "text-gray-800"}`}>
          {item.label}
        </span>
        {item.description && (
          <span className={`text-[11px] md:text-xs block mt-0.5 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
            {item.description}
          </span>
        )}
      </div>
      <ChevronRight
        className={`w-4 h-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${isDarkMode ? "text-gray-700" : "text-gray-300"}`}
        strokeWidth={1.5}
      />
    </button>
  );

  // --- Unauthenticated ---
  if (!user) {
    return (
      <div
        className={`min-h-screen flex flex-col ${isDarkMode ? "bg-gray-950" : "bg-gray-50"}`}
        style={{ WebkitFontSmoothing: "antialiased" }}
      >
        <div className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-5 md:px-10 flex-1">
          {/* Top bar */}
          <div className="flex items-center justify-end py-4">
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg transition-colors ${isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-200"}`}
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-gray-500" />
              )}
            </button>
          </div>

          <div className="pt-12 pb-10 text-center">
            <div className={`w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center ${isDarkMode ? "bg-gray-800" : "bg-gray-200"}`}>
              <User className={`w-9 h-9 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} strokeWidth={1.5} />
            </div>
            <h1 className={`text-lg font-semibold mb-1.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {t("ProfilePage.loginToAccess")}
            </h1>
            <p className={`text-sm mb-8 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
              {t("ProfilePage.loginDescription")}
            </p>
            <button
              onClick={() => router.push("/login")}
              className="px-8 py-2.5 rounded-lg text-sm font-medium transition-colors bg-orange-500 hover:bg-orange-600 text-white"
            >
              {t("ProfilePage.login")}
            </button>
          </div>

          <div className={`rounded-xl overflow-hidden ${isDarkMode ? "bg-gray-900 border border-gray-800" : "bg-white border border-gray-200"}`}>
            {activityItems
              .filter((b) => !b.featured)
              .slice(0, 3)
              .map((item, i, arr) => (
                <NavRow key={i} item={item} showBorder={i < arr.length - 1} />
              ))}
          </div>
        </div>

        <Footer />
      </div>
    );
  }

  // --- Authenticated ---
  return (
    <div
      className={`min-h-screen flex flex-col ${isDarkMode ? "bg-gray-950" : "bg-gray-50"}`}
      style={{ WebkitFontSmoothing: "antialiased" }}
    >
      <div className="w-full max-w-4xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-5 md:px-10 pb-12 flex-1">
        {/* Top bar */}
        <div className="flex items-center justify-end py-4">
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg transition-colors ${isDarkMode ? "hover:bg-gray-800" : "hover:bg-gray-200"}`}
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-gray-500" />
            )}
          </button>
        </div>

        {/* ===== Profile Card ===== */}
        <div className={`rounded-xl p-5 mb-5 ${isDarkMode ? "bg-gray-900 border border-gray-800" : "bg-white border border-gray-200"}`}>
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className={`w-16 h-16 md:w-[72px] md:h-[72px] rounded-full overflow-hidden ring-2 ${isDarkMode ? "ring-gray-700 bg-gray-800" : "ring-gray-200 bg-gray-100"}`}>
                {profileData?.profileImage ? (
                  <Image
                    src={profileData.profileImage}
                    alt="Profile"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User className={`w-7 h-7 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} strokeWidth={1.5} />
                  </div>
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingImage}
                className="absolute -bottom-0.5 -right-0.5 w-7 h-7 rounded-full bg-orange-500 hover:bg-orange-600 flex items-center justify-center transition-colors disabled:opacity-50 border-2 border-white dark:border-gray-900"
              >
                {isUploadingImage ? (
                  <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5 text-white" strokeWidth={2} />
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

            {/* User info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className={`text-base md:text-lg font-semibold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                  {profileData?.displayName || t("ProfilePage.noName")}
                </h1>
                {profileData?.isVerified && (
                  <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" strokeWidth={2.5} />
                )}
              </div>
              <div className={`flex items-center gap-1.5 mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                <Mail className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                <span className="text-xs md:text-[13px] truncate">{profileData?.email || user.email}</span>
              </div>
              {profileData?.location && (
                <div className={`flex items-center gap-1.5 mt-0.5 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                  <span className="text-xs truncate">{profileData.location}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== Quick Shortcuts ===== */}
        <div className="grid grid-cols-4 gap-2.5 mb-5">
          {shortcutItems.map((item, i) => (
            <button
              key={i}
              onClick={() => handleNavigation(item.path, item.action)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-colors ${
                isDarkMode
                  ? "bg-gray-900 border border-gray-800 hover:bg-gray-800"
                  : "bg-white border border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.color}`}>
                <item.icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
              </div>
              <span className={`text-[11px] font-medium text-center leading-tight ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {/* ===== Seller Panel (featured) ===== */}
        {userOwnsShop && (
          <button
            onClick={() => handleNavigation("/seller-panel")}
            className="w-full mb-5 flex items-center gap-3 p-4 rounded-xl bg-orange-500 hover:bg-orange-600 transition-colors text-left group"
          >
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
              <ShoppingCart className="w-5 h-5 text-white" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-white block">{t("ProfilePage.sellerPanel")}</span>
              <span className="text-xs text-white/70 block mt-0.5">{t("ProfilePage.manageYourStore")}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-white/50 group-hover:translate-x-0.5 transition-transform flex-shrink-0" strokeWidth={1.5} />
          </button>
        )}

        {/* ===== Activity ===== */}
        <div className={`rounded-xl overflow-hidden mb-5 ${isDarkMode ? "bg-gray-900 border border-gray-800" : "bg-white border border-gray-200"}`}>
          {activityItems
            .filter((b) => !b.featured)
            .map((item, i, arr) => (
              <NavRow key={i} item={item} showBorder={i < arr.length - 1} />
            ))}
        </div>

        {/* ===== Account & Settings ===== */}
        <div className="mb-5">
          <p className={`text-[11px] font-semibold uppercase tracking-wider mb-2 px-1 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
            {t("ProfilePage.accountSettings")}
          </p>
          <div className={`rounded-xl overflow-hidden ${isDarkMode ? "bg-gray-900 border border-gray-800" : "bg-white border border-gray-200"}`}>
            {accountItems.map((item, i) => (
              <NavRow key={i} item={item} showBorder={i < accountItems.length - 1} />
            ))}
          </div>
        </div>

        {/* ===== Logout ===== */}
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm transition-colors disabled:opacity-50 group ${
            isDarkMode
              ? "bg-gray-900 border border-gray-800 text-red-400 hover:bg-red-950/30 hover:border-red-900/50"
              : "bg-white border border-gray-200 text-red-500 hover:bg-red-50 hover:border-red-200"
          }`}
        >
          <LogOut className={`w-4 h-4 ${isLoggingOut ? "animate-spin" : ""}`} strokeWidth={1.8} />
          <span className="font-medium">
            {isLoggingOut ? t("ProfilePage.loggingOut") : t("ProfilePage.logout")}
          </span>
        </button>
      </div>

      <Footer />
    </div>
  );
}
