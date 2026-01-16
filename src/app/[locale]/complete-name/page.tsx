// app/[locale]/complete-name/page.tsx
// Matches Flutter's complete_name_screen.dart implementation
// Required for Apple Sign-In users who don't provide their name

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useUser } from "@/context/UserProvider";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { toast } from "react-hot-toast";
import { getFirebaseDb, getFirebaseAuth } from "@/lib/firebase-lazy";
import { UserIcon, ArrowRightIcon } from "@heroicons/react/24/outline";

export default function CompleteNamePage() {
  const router = useRouter();
  const t = useTranslations();
  const {
    user,
    isLoading,
    isAppleUser,
    needsNameCompletion,
    setNameComplete,
    setNameSaveInProgress,
    updateLocalProfileField,
    refreshUser,
  } = useUser();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [errors, setErrors] = useState<{
    firstName?: string;
    lastName?: string;
  }>({});

  // Theme detection
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    checkTheme();

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  // Redirect if user doesn't need name completion
  useEffect(() => {
    if (isLoading) return;

    // If no user, redirect to login
    if (!user) {
      router.replace("/login");
      return;
    }

    // If not an Apple user or doesn't need name completion, redirect to home
    if (!isAppleUser || (!needsNameCompletion && !hasSaved)) {
      router.replace("/");
      return;
    }
  }, [isLoading, user, isAppleUser, needsNameCompletion, hasSaved, router]);

  // Capitalize first letter of each word
  const capitalizeWords = (text: string): string => {
    return text
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Handle input change with capitalization
  const handleFirstNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = capitalizeWords(e.target.value);
    setFirstName(value);
    if (errors.firstName) {
      setErrors((prev) => ({ ...prev, firstName: undefined }));
    }
  };

  const handleLastNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = capitalizeWords(e.target.value);
    setLastName(value);
    if (errors.lastName) {
      setErrors((prev) => ({ ...prev, lastName: undefined }));
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: { firstName?: string; lastName?: string } = {};

    if (!firstName.trim()) {
      newErrors.firstName =
        t("CompleteName.firstNameRequired") || "First name is required";
    } else if (firstName.trim().length < 2) {
      newErrors.firstName =
        t("CompleteName.nameTooShort") || "Name is too short";
    }

    if (!lastName.trim()) {
      newErrors.lastName =
        t("CompleteName.lastNameRequired") || "Last name is required";
    } else if (lastName.trim().length < 2) {
      newErrors.lastName =
        t("CompleteName.nameTooShort") || "Name is too short";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Save name (matching Flutter's _saveName method exactly)
  const handleSaveName = useCallback(async () => {
    // Guard against duplicate saves (matching Flutter)
    if (hasSaved || isSaving) return;

    if (!validateForm()) return;

    if (!user) {
      toast.error(t("CompleteName.notLoggedIn") || "You must be logged in");
      return;
    }

    setIsSaving(true);
    setHasSaved(true);

    // Step 1: Lock to prevent background fetches from overwriting (matching Flutter)
    setNameSaveInProgress(true);

    try {
      const displayName = `${firstName.trim()} ${lastName.trim()}`;

      // Step 2: Update Firestore FIRST (matching Flutter order)
      const db = await getFirebaseDb();
      const userDocRef = doc(db, "users", user.uid);
      await updateDoc(userDocRef, {
        displayName: displayName,
        updatedAt: serverTimestamp(),
      });

      // Step 3: Update Firebase Auth profile (matching Flutter)
      const auth = await getFirebaseAuth();
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: displayName,
        });
      }

      // Step 4: Update UserProvider state - this controls router redirect (matching Flutter)
      setNameComplete(true);

      // Step 5: Update UserProvider's cached profile data directly (matching Flutter)
      // This ensures immediate consistency without waiting for Firestore fetch
      updateLocalProfileField("displayName", displayName);

      // Step 6: Refresh user data (matching Flutter's ProfileProvider refresh)
      try {
        await refreshUser();
      } catch (e) {
        console.log("User refresh:", e);
      }

      // Step 7: Unlock BEFORE navigation (matching Flutter)
      setNameSaveInProgress(false);

      // Step 8: Navigate - router will re-evaluate and no longer redirect back here
      toast.success(
        t("CompleteName.saveSuccess") || "Name saved successfully!"
      );
      router.push("/");
    } catch (error) {
      console.error("Error saving name:", error);

      // Rollback on error (matching Flutter)
      setNameSaveInProgress(false);
      setNameComplete(false);
      setHasSaved(false);
      setIsSaving(false);

      toast.error(
        t("CompleteName.saveError") || "Failed to save name. Please try again.",
        {
          style: {
            borderRadius: "10px",
            background: "#EF4444",
            color: "#fff",
          },
        }
      );
    }
  }, [
    hasSaved,
    isSaving,
    firstName,
    lastName,
    user,
    t,
    setNameSaveInProgress,
    setNameComplete,
    updateLocalProfileField,
    refreshUser,
    router,
  ]);

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSaveName();
  };

  // Show loading state
  if (isLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDark
            ? "bg-gray-900"
            : "bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50"
        }`}
      >
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen transition-all duration-300 ${
        isDark
          ? "bg-gray-900"
          : "bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50"
      }`}
    >
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute -top-4 -left-4 w-72 h-72 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob ${
            isDark
              ? "bg-gradient-to-r from-orange-600 to-pink-600"
              : "bg-gradient-to-r from-orange-300 to-pink-300"
          }`}
        ></div>
        <div
          className={`absolute -top-4 -right-4 w-72 h-72 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000 ${
            isDark
              ? "bg-gradient-to-r from-yellow-600 to-orange-600"
              : "bg-gradient-to-r from-yellow-300 to-orange-300"
          }`}
        ></div>
        <div
          className={`absolute -bottom-8 left-20 w-72 h-72 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000 ${
            isDark
              ? "bg-gradient-to-r from-pink-600 to-purple-600"
              : "bg-gradient-to-r from-pink-300 to-purple-300"
          }`}
        ></div>
      </div>

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Main Card */}
          <div
            className={`backdrop-blur-xl rounded-3xl shadow-2xl border p-8 relative overflow-hidden ${
              isDark
                ? "bg-gray-800/80 border-gray-700/20"
                : "bg-white/80 border-white/20"
            }`}
          >
            {/* Card Background Pattern */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-orange-400/10 to-transparent rounded-full"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-pink-400/10 to-transparent rounded-full"></div>

            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center ${
                  isDark ? "bg-orange-500/20" : "bg-orange-100"
                }`}
              >
                <UserIcon className="w-10 h-10 text-orange-500" />
              </div>
            </div>

            {/* Title */}
            <h1
              className={`text-2xl font-bold text-center mb-2 ${
                isDark ? "text-white" : "text-gray-900"
              }`}
            >
              {t("CompleteName.title") || "What's your name?"}
            </h1>

            {/* Subtitle */}
            <p
              className={`text-center text-sm mb-8 ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {t("CompleteName.subtitle") ||
                "We need your name for order delivery"}
            </p>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* First Name Field */}
              <div className="space-y-2">
                <label
                  className={`block text-sm font-semibold ${
                    isDark ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {t("CompleteName.firstName") || "First Name"}
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={handleFirstNameChange}
                  disabled={isSaving}
                  placeholder={
                    t("CompleteName.firstNamePlaceholder") ||
                    "Enter your first name"
                  }
                  className={`w-full px-4 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
                    errors.firstName
                      ? "border-red-500 ring-red-500/20"
                      : isDark
                      ? "border-gray-600 bg-gray-700/50 hover:border-gray-500 focus:border-orange-500 focus:ring-orange-500/20 text-white placeholder-gray-400"
                      : "border-gray-200 bg-gray-50/50 hover:border-gray-300 focus:border-orange-500 focus:ring-orange-500/20 text-gray-900 placeholder-gray-500"
                  } ${isSaving ? "opacity-50 cursor-not-allowed" : ""}`}
                />
                {errors.firstName && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.firstName}
                  </p>
                )}
              </div>

              {/* Last Name Field */}
              <div className="space-y-2">
                <label
                  className={`block text-sm font-semibold ${
                    isDark ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {t("CompleteName.lastName") || "Last Name"}
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={handleLastNameChange}
                  disabled={isSaving}
                  placeholder={
                    t("CompleteName.lastNamePlaceholder") ||
                    "Enter your last name"
                  }
                  className={`w-full px-4 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
                    errors.lastName
                      ? "border-red-500 ring-red-500/20"
                      : isDark
                      ? "border-gray-600 bg-gray-700/50 hover:border-gray-500 focus:border-orange-500 focus:ring-orange-500/20 text-white placeholder-gray-400"
                      : "border-gray-200 bg-gray-50/50 hover:border-gray-300 focus:border-orange-500 focus:ring-orange-500/20 text-gray-900 placeholder-gray-500"
                  } ${isSaving ? "opacity-50 cursor-not-allowed" : ""}`}
                />
                {errors.lastName && (
                  <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>
                )}
              </div>

              {/* Continue Button */}
              <button
                type="submit"
                disabled={isSaving}
                className="w-full bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 shadow-lg hover:shadow-xl disabled:shadow-md flex items-center justify-center group"
              >
                {isSaving ? (
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span className="mr-2">
                      {t("CompleteName.continue") || "Continue"}
                    </span>
                    <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}
