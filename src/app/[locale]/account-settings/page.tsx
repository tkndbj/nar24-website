"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserProvider";
import { updateDoc, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { httpsCallable, getFunctions } from "firebase/functions";
import {
  ArrowLeft,
  Settings,
  Shield,
  Bell,
  AlertTriangle,
  Key,
  Mail,
  Smartphone,
  MessageSquare,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface UserSettings {
  twoFactorEnabled: boolean;
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
}

interface NotificationTileProps {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  value: boolean;
  onChanged: ((value: boolean) => void) | null;
  showDivider: boolean;
  isDarkMode: boolean;
}

export default function AccountSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    twoFactorEnabled: false,
    notificationsEnabled: true,
    emailNotifications: true,
    pushNotifications: true,
    smsNotifications: false,
  });
  const [deleteEmail, setDeleteEmail] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { user } = useUser();
  const router = useRouter();
  const t = useTranslations();

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

  useEffect(() => {
    if (user) {
      loadUserSettings();
    }
  }, [user]);

  const loadUserSettings = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setSettings({
          twoFactorEnabled: data.twoFactorEnabled ?? false,
          notificationsEnabled: data.notificationsEnabled ?? true,
          emailNotifications: data.emailNotifications ?? true,
          pushNotifications: data.pushNotifications ?? true,
          smsNotifications: data.smsNotifications ?? false,
        });
      }
    } catch (error) {
      console.error("Error loading user settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateUserSetting = async (field: string, value: boolean) => {
    if (!user) return;

    try {
      await updateDoc(doc(db, "users", user.uid), {
        [field]: value,
      });
    } catch (error) {
      console.error("Error updating setting:", error);
    }
  };

  const handle2FAToggle = async (value: boolean) => {
    if (value) {
      // Enable 2FA - navigate to setup
      router.push("/two-factor-verification?type=setup");
    } else {
      // Disable 2FA - navigate to disable
      router.push("/two-factor-verification?type=disable");
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteEmail !== user.email) {
      alert(t("AccountSettings.emailMismatch"));
      return;
    }

    setIsDeleting(true);
    try {
      const functions = getFunctions(undefined, "europe-west3");
      const deleteUserAccount = httpsCallable(functions, "deleteUserAccount");
      
      await deleteUserAccount({ email: deleteEmail });
      
      // Logout and redirect
      router.push("/login");
    } catch (error) {
      console.error("Error deleting account:", error);
      alert(error instanceof Error ? error.message : t("AccountSettings.deleteAccountFailed"));
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const NotificationTile: React.FC<NotificationTileProps> = ({
    icon: Icon,
    title,
    subtitle,
    value,
    onChanged,
    showDivider,
    isDarkMode,
  }) => (
    <div>
      <div className="p-4">
        <div className="flex items-center gap-4">
          <div
            className={`p-2 rounded-lg ${
              value && onChanged
                ? "bg-green-100 dark:bg-green-900/30"
                : "bg-gray-100 dark:bg-gray-700"
            }`}
          >
            <Icon
              className={`w-5 h-5 ${
                value && onChanged ? "text-green-600 dark:text-green-400" : "text-gray-500"
              }`}
            />
          </div>
          <div className="flex-1">
            <h4
              className={`font-semibold ${
                onChanged
                  ? isDarkMode
                    ? "text-white"
                    : "text-gray-900"
                  : "text-gray-400"
              }`}
            >
              {title}
            </h4>
            <p
              className={`text-sm ${
                isDarkMode ? "text-gray-300" : "text-gray-600"
              }`}
            >
              {subtitle}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => onChanged?.(e.target.checked)}
              disabled={!onChanged}
              className="sr-only peer"
            />
            <div
              className={`w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${
                value && onChanged ? "peer-checked:bg-green-600" : ""
              } ${!onChanged ? "opacity-50 cursor-not-allowed" : ""}`}
            />
          </label>
        </div>
      </div>
      {showDivider && (
        <div
          className={`h-px mx-4 ${
            isDarkMode ? "bg-gray-700" : "bg-gray-200"
          }`}
        />
      )}
    </div>
  );

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
            {t("AccountSettings.loginRequired")}
          </h1>
          <button
            onClick={() => router.push("/login")}
            className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
          >
            {t("AccountSettings.login")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${
        isDarkMode ? "bg-gray-900" : "bg-gray-50"
      }`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 ${
          isDarkMode ? "bg-gray-900" : "bg-gray-50"
        } border-b ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button
              onClick={() => router.back()}
              className={`p-2 rounded-lg transition-colors ${
                isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
              }`}
            >
              <ArrowLeft
                className={`w-5 h-5 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              />
            </button>
            <h1
              className={`text-lg font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("AccountSettings.accountSettings")}
            </h1>
            <div className="w-9" />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header Section */}
        <div className="mb-8">
          <div
            className={`rounded-2xl md:rounded-3xl p-6 md:p-8 text-center ${
              isDarkMode
                ? "bg-gradient-to-br from-orange-900/20 to-pink-900/20"
                : "bg-gradient-to-br from-orange-50 to-pink-50"
            }`}
          >
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-gradient-to-r from-orange-500 to-pink-500 rounded-full">
                <Settings className="w-8 h-8 text-white" />
              </div>
            </div>
            <h2
              className={`text-2xl md:text-3xl font-bold mb-2 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("AccountSettings.accountSettingsTitle")}
            </h2>
            <p
              className={`text-base md:text-lg ${
                isDarkMode ? "text-gray-300" : "text-gray-600"
              }`}
            >
              {t("AccountSettings.accountSettingsSubtitle")}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
          </div>
        ) : (
          <div className="space-y-8">
            {/* Security Section */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-r from-orange-500 to-pink-500 rounded-lg">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <h3
                  className={`text-xl font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("AccountSettings.securitySettings")}
                </h3>
              </div>

              <div
                className={`rounded-xl overflow-hidden ${
                  isDarkMode
                    ? "bg-gray-800 border border-gray-700"
                    : "bg-white border border-gray-100"
                } shadow-sm`}
              >
                <div className="p-4">
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-lg ${
                        settings.twoFactorEnabled
                          ? "bg-green-100 dark:bg-green-900/30"
                          : "bg-gray-100 dark:bg-gray-700"
                      }`}
                    >
                      <Key
                        className={`w-5 h-5 ${
                          settings.twoFactorEnabled
                            ? "text-green-600 dark:text-green-400"
                            : "text-gray-500"
                        }`}
                      />
                    </div>
                    <div className="flex-1">
                      <h4
                        className={`font-semibold ${
                          isDarkMode ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {t("AccountSettings.twoFactorAuth")}
                      </h4>
                      <p
                        className={`text-sm ${
                          isDarkMode ? "text-gray-300" : "text-gray-600"
                        }`}
                      >
                        {t("AccountSettings.twoFactorAuthDesc")}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.twoFactorEnabled}
                        onChange={(e) => handle2FAToggle(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600" />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Notifications Section */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-to-r from-orange-500 to-pink-500 rounded-lg">
                  <Bell className="w-5 h-5 text-white" />
                </div>
                <h3
                  className={`text-xl font-bold ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("AccountSettings.notificationSettings")}
                </h3>
              </div>

              <div
                className={`rounded-xl overflow-hidden ${
                  isDarkMode
                    ? "bg-gray-800 border border-gray-700"
                    : "bg-white border border-gray-100"
                } shadow-sm`}
              >
                <NotificationTile
                  icon={Bell}
                  title={t("AccountSettings.allNotifications")}
                  subtitle={t("AccountSettings.allNotificationsDesc")}
                  value={settings.notificationsEnabled}
                  onChanged={(value) => {
                    setSettings((prev) => ({
                      ...prev,
                      notificationsEnabled: value,
                      emailNotifications: value ? prev.emailNotifications : false,
                      pushNotifications: value ? prev.pushNotifications : false,
                      smsNotifications: value ? prev.smsNotifications : false,
                    }));
                    updateUserSetting("notificationsEnabled", value);
                  }}
                  showDivider={true}
                  isDarkMode={isDarkMode}
                />

                <NotificationTile
                  icon={Mail}
                  title={t("AccountSettings.emailNotifications")}
                  subtitle={t("AccountSettings.emailNotificationsDesc")}
                  value={settings.emailNotifications && settings.notificationsEnabled}
                  onChanged={
                    settings.notificationsEnabled
                      ? (value) => {
                          setSettings((prev) => ({
                            ...prev,
                            emailNotifications: value,
                          }));
                          updateUserSetting("emailNotifications", value);
                        }
                      : null
                  }
                  showDivider={true}
                  isDarkMode={isDarkMode}
                />

                <NotificationTile
                  icon={Smartphone}
                  title={t("AccountSettings.pushNotifications")}
                  subtitle={t("AccountSettings.pushNotificationsDesc")}
                  value={settings.pushNotifications && settings.notificationsEnabled}
                  onChanged={
                    settings.notificationsEnabled
                      ? (value) => {
                          setSettings((prev) => ({
                            ...prev,
                            pushNotifications: value,
                          }));
                          updateUserSetting("pushNotifications", value);
                        }
                      : null
                  }
                  showDivider={true}
                  isDarkMode={isDarkMode}
                />

                <NotificationTile
                  icon={MessageSquare}
                  title={t("AccountSettings.smsNotifications")}
                  subtitle={t("AccountSettings.smsNotificationsDesc")}
                  value={settings.smsNotifications && settings.notificationsEnabled}
                  onChanged={
                    settings.notificationsEnabled
                      ? (value) => {
                          setSettings((prev) => ({
                            ...prev,
                            smsNotifications: value,
                          }));
                          updateUserSetting("smsNotifications", value);
                        }
                      : null
                  }
                  showDivider={false}
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>

            {/* Danger Zone */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-red-600 dark:text-red-400">
                  {t("AccountSettings.dangerZone")}
                </h3>
              </div>

              <div
                className={`rounded-xl overflow-hidden border-2 border-red-200 dark:border-red-800 ${
                  isDarkMode ? "bg-gray-800" : "bg-white"
                } shadow-sm`}
              >
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  className="w-full p-4 text-left hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-red-600 dark:text-red-400">
                        {t("AccountSettings.deleteAccount")}
                      </h4>
                      <p
                        className={`text-sm ${
                          isDarkMode ? "text-gray-300" : "text-gray-600"
                        }`}
                      >
                        {t("AccountSettings.deleteAccountDesc")}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Account Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div
            className={`w-full max-w-md rounded-2xl p-6 ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            }`}
          >
            <h3
              className={`text-xl font-bold mb-4 text-red-600 dark:text-red-400`}
            >
              {t("AccountSettings.deleteAccount")}
            </h3>
            <p
              className={`mb-4 ${
                isDarkMode ? "text-gray-300" : "text-gray-600"
              }`}
            >
              {t("AccountSettings.deleteAccountConfirmation")}
            </p>
            <input
              type="email"
              value={deleteEmail}
              onChange={(e) => setDeleteEmail(e.target.value)}
              placeholder={t("AccountSettings.enterEmailToConfirm")}
              className={`w-full p-3 rounded-lg border mb-4 ${
                isDarkMode
                  ? "bg-gray-700 border-gray-600 text-white"
                  : "bg-white border-gray-300 text-gray-900"
              }`}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className={`flex-1 py-3 rounded-lg font-medium ${
                  isDarkMode
                    ? "bg-gray-700 text-white hover:bg-gray-600"
                    : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                } transition-colors`}
              >
                {t("AccountSettings.cancel")}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting || deleteEmail !== user.email}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting
                  ? t("AccountSettings.deleting")
                  : t("AccountSettings.deleteAccount")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}