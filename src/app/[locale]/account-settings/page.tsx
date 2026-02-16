"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserProvider";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { httpsCallable, getFunctions } from "firebase/functions";
import {
  ArrowLeft,
  Shield,
  AlertTriangle,
  Key,
  Trash2,
  ChevronRight,
  LogIn,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface UserSettings {
  twoFactorEnabled: boolean;
}

export default function AccountSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    twoFactorEnabled: false,
  });
  const [deleteEmail, setDeleteEmail] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { user, isLoading: authLoading } = useUser();
  const router = useRouter();
  const t = useTranslations();

  useEffect(() => {
    const check = () => {
      if (typeof document !== "undefined")
        setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    check();
    const obs = new MutationObserver(check);
    if (typeof document !== "undefined")
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (user) loadUserSettings();
  }, [user]);

  const loadUserSettings = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists())
        setSettings({
          twoFactorEnabled: userDoc.data().twoFactorEnabled ?? false,
        });
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FAToggle = async (value: boolean) => {
    router.push(
      value
        ? "/two-factor-verification?type=setup"
        : "/two-factor-verification?type=disable",
    );
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteEmail !== user.email) {
      alert(t("AccountSettings.emailMismatch"));
      return;
    }
    setIsDeleting(true);
    try {
      const functions = getFunctions(undefined, "europe-west3");
      await httpsCallable(
        functions,
        "deleteUserAccount",
      )({ email: deleteEmail });
      router.push("/login");
    } catch (error) {
      console.error("Error deleting account:", error);
      alert(
        error instanceof Error
          ? error.message
          : t("AccountSettings.deleteAccountFailed"),
      );
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  // Toolbar shared across states
  const Toolbar = () => (
    <div
      className={`sticky top-14 z-30 border-b ${isDarkMode ? "bg-gray-900/80 backdrop-blur-xl border-gray-700/80" : "bg-white/80 backdrop-blur-xl border-gray-100/80"}`}
    >
      <div className="max-w-4xl mx-auto flex items-center gap-3 px-3 sm:px-6 py-3">
        <button
          onClick={() => router.back()}
          className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
              : "bg-gray-50 border-gray-200 hover:bg-gray-100"
          }`}
        >
          <ArrowLeft
            className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
          />
        </button>
        <h1
          className={`text-lg font-bold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
        >
          {t("AccountSettings.accountSettings")}
        </h1>
      </div>
    </div>
  );

  if (authLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center pt-20 ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        <Toolbar />
        <div className="text-center py-16 px-3">
          <LogIn
            className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
          />
          <h3
            className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("AccountSettings.loginRequired")}
          </h3>
          <button
            onClick={() => router.push("/login")}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
          >
            {t("AccountSettings.login")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
    >
      <Toolbar />

      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-3">
        {/* Header Banner */}
        <div
          className={`rounded-2xl p-4 text-center ${isDarkMode ? "bg-orange-900/10 border border-orange-700/30" : "bg-orange-50 border border-orange-100"}`}
        >
          <div
            className={`w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center ${isDarkMode ? "bg-orange-900/30" : "bg-orange-100"}`}
          >
            <Shield className="w-5 h-5 text-orange-500" />
          </div>
          <h2
            className={`text-sm font-bold mb-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("AccountSettings.accountSettingsTitle")}
          </h2>
          <p
            className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {t("AccountSettings.accountSettingsSubtitle")}
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Security Section */}
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center ${isDarkMode ? "bg-orange-900/30" : "bg-orange-50"}`}
                >
                  <Shield className="w-3 h-3 text-orange-500" />
                </div>
                <span
                  className={`text-xs font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {t("AccountSettings.securitySettings")}
                </span>
              </div>

              <div
                className={`rounded-2xl border ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
              >
                <div className="px-4 py-3 flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      settings.twoFactorEnabled
                        ? isDarkMode
                          ? "bg-green-900/30"
                          : "bg-green-50"
                        : isDarkMode
                          ? "bg-gray-700"
                          : "bg-gray-100"
                    }`}
                  >
                    <Key
                      className={`w-4 h-4 ${settings.twoFactorEnabled ? (isDarkMode ? "text-green-400" : "text-green-600") : "text-gray-400"}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4
                      className={`text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                    >
                      {t("AccountSettings.twoFactorAuth")}
                    </h4>
                    <p
                      className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      {t("AccountSettings.twoFactorAuthDesc")}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.twoFactorEnabled}
                      onChange={(e) => handle2FAToggle(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className={`w-10 h-5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600 ${isDarkMode ? "bg-gray-600" : "bg-gray-200"}`}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center ${isDarkMode ? "bg-red-900/30" : "bg-red-50"}`}
                >
                  <AlertTriangle
                    className={`w-3 h-3 ${isDarkMode ? "text-red-400" : "text-red-500"}`}
                  />
                </div>
                <span
                  className={`text-xs font-semibold ${isDarkMode ? "text-red-400" : "text-red-600"}`}
                >
                  {t("AccountSettings.dangerZone")}
                </span>
              </div>

              <div
                className={`rounded-2xl border-2 overflow-hidden ${isDarkMode ? "border-red-800/50 bg-gray-800" : "border-red-100 bg-white"}`}
              >
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  className={`w-full px-4 py-3 text-left transition-colors ${isDarkMode ? "hover:bg-red-900/10" : "hover:bg-red-50/50"}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDarkMode ? "bg-red-900/30" : "bg-red-50"}`}
                    >
                      <Trash2
                        className={`w-4 h-4 ${isDarkMode ? "text-red-400" : "text-red-500"}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`text-sm font-semibold ${isDarkMode ? "text-red-400" : "text-red-600"}`}
                      >
                        {t("AccountSettings.deleteAccount")}
                      </h4>
                      <p
                        className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                      >
                        {t("AccountSettings.deleteAccountDesc")}
                      </p>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? "text-red-400/50" : "text-red-300"}`}
                    />
                  </div>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Delete Account Modal */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className={`w-full max-w-sm rounded-2xl shadow-2xl ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <div
              className={`p-4 border-b ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <h3
                className={`text-sm font-bold ${isDarkMode ? "text-red-400" : "text-red-600"}`}
              >
                {t("AccountSettings.deleteAccount")}
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <p
                className={`text-xs ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              >
                {t("AccountSettings.deleteAccountConfirmation")}
              </p>
              <input
                type="email"
                value={deleteEmail}
                onChange={(e) => setDeleteEmail(e.target.value)}
                placeholder={t("AccountSettings.enterEmailToConfirm")}
                className={`w-full px-3 py-2 rounded-xl text-sm border transition-all focus:outline-none focus:ring-2 focus:ring-red-500/20 ${
                  isDarkMode
                    ? "bg-gray-700 border-gray-600 text-white placeholder-gray-500"
                    : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"
                }`}
              />
            </div>
            <div
              className={`flex gap-2 p-4 border-t ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <button
                onClick={() => setShowDeleteDialog(false)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                  isDarkMode
                    ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {t("AccountSettings.cancel")}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting || deleteEmail !== user.email}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
