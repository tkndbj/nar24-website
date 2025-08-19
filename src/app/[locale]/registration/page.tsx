"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  User,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  EyeIcon,
  EyeSlashIcon,
  EnvelopeIcon,
  LockClosedIcon,
  UserIcon,
  ArrowRightIcon,
  CalendarIcon,
  GlobeAltIcon,
  GiftIcon,
  UserGroupIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import { AuthError } from "firebase/auth";
import { useTranslations, useLocale } from "next-intl";

// Types
interface FormData {
  name: string;
  surname: string;
  email: string;
  password: string;
  confirmPassword: string;
  gender: string;
  birthDate: string;
  languageCode: string;
  referralCode: string;
}

// Create a separate component for the registration content that uses useSearchParams
function RegistrationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations();

  // State management
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] =
    useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    surname: "",
    email: "",
    password: "",
    confirmPassword: "",
    gender: "",
    birthDate: "",
    languageCode: "",
    referralCode: "",
  });

  const languageMenuRef = useRef<HTMLDivElement>(null);

  // Handle theme detection
  useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDark(document.documentElement.classList.contains("dark"));
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

  // Handle click outside for language menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        languageMenuRef.current &&
        !languageMenuRef.current.contains(event.target as Node)
      ) {
        setShowLanguageMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Initialize from URL params
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setFormData((prev) => ({ ...prev, email: emailParam }));
    }
  }, [searchParams]);

  // Language switching function
  const switchLanguage = (newLocale: string, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    console.log("Switching language to:", newLocale);

    let pathWithoutLocale = pathname;
    if (pathname.startsWith(`/${locale}`)) {
      pathWithoutLocale = pathname.substring(`/${locale}`.length) || "/";
    }

    const newPath = `/${newLocale}${pathWithoutLocale}`;
    console.log("New path:", newPath);

    router.push(newPath);
    setShowLanguageMenu(false);
  };

  // Handle input changes
  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Email validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  // Form validation
  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      toast.error(t("RegistrationPage.nameRequired"));
      return false;
    }
    if (!formData.surname.trim()) {
      toast.error(t("RegistrationPage.surnameRequired"));
      return false;
    }
    if (!formData.email.trim()) {
      toast.error(t("RegistrationPage.emailRequired"));
      return false;
    }
    if (!validateEmail(formData.email)) {
      toast.error(t("RegistrationPage.invalidEmail"));
      return false;
    }
    if (!formData.password) {
      toast.error(t("RegistrationPage.passwordRequired"));
      return false;
    }
    if (formData.password.length < 6) {
      toast.error(t("RegistrationPage.passwordTooShort"));
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      toast.error(t("RegistrationPage.passwordsDoNotMatch"));
      return false;
    }
    if (!formData.gender) {
      toast.error(t("RegistrationPage.genderRequired"));
      return false;
    }
    if (!formData.birthDate) {
      toast.error(t("RegistrationPage.birthDateRequired"));
      return false;
    }
    if (!formData.languageCode) {
      toast.error(t("RegistrationPage.languageRequired"));
      return false;
    }
    return true;
  };

  // Create user document in Firestore
  const createUserDocument = async (
    user: User,
    isGoogleUser: boolean = false
  ) => {
    try {
      const userData = {
        displayName: isGoogleUser
          ? user.displayName || user.email?.split("@")[0] || "User"
          : `${formData.name} ${formData.surname}`,
        email: user.email || "",
        name: isGoogleUser
          ? user.displayName?.split(" ")[0] || ""
          : formData.name,
        surname: isGoogleUser
          ? user.displayName?.split(" ").slice(1).join(" ") || ""
          : formData.surname,
        ...(formData.gender && { gender: formData.gender }),
        ...(formData.birthDate && { birthDate: formData.birthDate }),
        ...(formData.languageCode && { languageCode: formData.languageCode }),
        ...(formData.referralCode && { referralCode: formData.referralCode }),
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
        isNew: true,
      };

      await setDoc(doc(db, "users", user.uid), userData, { merge: true });
    } catch (error) {
      console.error("Error creating user document:", error);
      // Don't throw - continue with registration even if doc creation fails
    }
  };

  // Updated handleRegisterWithPassword function with improvements
  const handleRegisterWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      // Call the cloud function
      const functions = getFunctions(undefined, "europe-west3");
      const registerWithEmailPassword = httpsCallable(
        functions,
        "registerWithEmailPassword"
      );

      const result = await registerWithEmailPassword({
        email: formData.email.trim(),
        password: formData.password,
        name: formData.name.trim(),
        surname: formData.surname.trim(),
        ...(formData.gender && { gender: formData.gender }),
        ...(formData.birthDate && {
          birthDate: new Date(parseInt(formData.birthDate), 0, 1).toISOString(),
        }),
        ...(formData.languageCode && { languageCode: formData.languageCode }),
        ...(formData.referralCode && { referralCode: formData.referralCode }),
      });

      const data = result.data as {
        customToken: string;
        emailSent?: boolean;
        verificationCodeSent?: boolean; // NEW: Check if verification code was sent
        uid: string;
      };

      // Sign in with the custom token temporarily
      const { signInWithCustomToken } = await import("firebase/auth");
      const userCredential = await signInWithCustomToken(
        auth,
        data.customToken
      );
      const user = userCredential.user;

      if (user) {
        // NEW: Check if verification code was sent by cloud function
        if (data.verificationCodeSent || data.emailSent) {
          console.log("Email verification code sent by cloud function");
        } else {
          console.warn("No verification code was sent by cloud function");
        }

        // Sign out immediately (user needs to verify email first)
        await signOut(auth);

        toast.success(t("RegistrationPage.registrationSuccess"), {
          icon: "🎉",
          style: {
            borderRadius: "10px",
            background: "#10B981",
            color: "#fff",
          },
        });

        // NEW: Redirect to email verification page instead of login
        router.push(
          `/email-verification?email=${encodeURIComponent(formData.email)}`
        );
      }
    } catch (error: unknown) {
      console.error("Registration error:", error);

      let message = t("RegistrationPage.registrationError");

      // Handle cloud function errors
      if (error && typeof error === "object" && "code" in error) {
        const authError = error as AuthError;
        switch (authError.code) {
          case "functions/already-exists":
            message = t("RegistrationPage.emailAlreadyInUse");
            break;
          case "functions/invalid-argument":
            message = t("RegistrationPage.invalidData");
            break;
          case "functions/internal":
            message = t("RegistrationPage.serverError");
            break;
          case "functions/unauthenticated":
            message = t("RegistrationPage.authenticationError");
            break;
          default:
            message =
              authError.message || t("RegistrationPage.registrationError");
        }
      }

      toast.error(message, {
        style: {
          borderRadius: "10px",
          background: "#EF4444",
          color: "#fff",
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google registration
  const handleGoogleRegistration = async () => {
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
      });

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user document already exists to determine if it's a new user
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      const isNewUser = !userDoc.exists();

      if (user) {
        if (isNewUser) {
          // Create user document for new Google user
          await createUserDocument(user, true);

          // New Google user should complete profile
          toast.success(t("RegistrationPage.googleRegistrationSuccess"), {
            icon: "🚀",
            style: {
              borderRadius: "10px",
              background: "#10B981",
              color: "#fff",
            },
          });

          router.push("/complete-profile");
        } else {
          // Existing Google user
          toast.success(t("RegistrationPage.googleSignInSuccess"), {
            icon: "🚀",
            style: {
              borderRadius: "10px",
              background: "#10B981",
              color: "#fff",
            },
          });

          router.push("/");
        }
      }
    } catch (error: unknown) {
      let message = t("RegistrationPage.googleRegistrationError");

      switch ((error as unknown as AuthError).code) {
        case "auth/network-request-failed":
          message = t("RegistrationPage.networkError");
          break;
        case "auth/account-exists-with-different-credential":
          message = t("RegistrationPage.accountExistsWithDifferentCredential");
          break;
        case "auth/popup-closed-by-user":
          return; // Don't show error for user-cancelled popup
      }

      toast.error(message, {
        style: {
          borderRadius: "10px",
          background: "#EF4444",
          color: "#fff",
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Generate birth year options
  const generateBirthYears = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear; year >= 1900; year--) {
      years.push(year);
    }
    return years;
  };

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
              ? "bg-gradient-to-r from-blue-600 to-purple-600"
              : "bg-gradient-to-r from-blue-300 to-purple-300"
          }`}
        ></div>
        <div
          className={`absolute -top-4 -right-4 w-72 h-72 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000 ${
            isDark
              ? "bg-gradient-to-r from-yellow-600 to-pink-600"
              : "bg-gradient-to-r from-yellow-300 to-pink-300"
          }`}
        ></div>
        <div
          className={`absolute -bottom-8 left-20 w-72 h-72 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000 ${
            isDark
              ? "bg-gradient-to-r from-pink-600 to-indigo-600"
              : "bg-gradient-to-r from-pink-300 to-indigo-300"
          }`}
        ></div>
      </div>

      <div className="relative min-h-screen flex items-center justify-center p-4 py-8">
        <div className="w-full max-w-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => router.back()}
              className={`p-3 rounded-full backdrop-blur-lg border transition-all duration-300 group ${
                isDark
                  ? "bg-gray-800/20 border-gray-700/20 hover:bg-gray-700/30"
                  : "bg-white/20 border-white/20 hover:bg-white/30"
              }`}
            >
              <ArrowLeftIcon
                className={`w-5 h-5 transition-colors ${
                  isDark
                    ? "text-gray-300 group-hover:text-white"
                    : "text-gray-600 group-hover:text-gray-800"
                }`}
              />
            </button>

            <div className="relative" ref={languageMenuRef}>
              <button
                onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                className={`p-3 rounded-full backdrop-blur-lg border transition-all duration-300 group ${
                  isDark
                    ? "bg-gray-800/20 border-gray-700/20 hover:bg-gray-700/30"
                    : "bg-white/20 border-white/20 hover:bg-white/30"
                }`}
                aria-label={t("header.languageSelection")}
              >
                <GlobeAltIcon
                  className={`w-5 h-5 transition-colors ${
                    isDark
                      ? "text-gray-300 group-hover:text-white"
                      : "text-gray-600 group-hover:text-gray-800"
                  }`}
                />
              </button>

              {/* Language Menu */}
              {showLanguageMenu && (
                <div
                  className={`
                    absolute right-0 top-full mt-2 w-32
                    ${isDark ? "bg-gray-800" : "bg-white"}
                    border ${isDark ? "border-gray-700" : "border-gray-200"}
                    rounded-lg shadow-xl backdrop-blur-xl z-50
                    overflow-hidden
                  `}
                >
                  <button
                    onClick={() => switchLanguage("tr")}
                    className={`
                      w-full flex items-center space-x-3 px-4 py-3 text-left
                      hover:bg-gray-100 dark:hover:bg-gray-700 
                      transition-colors duration-150
                      ${
                        locale === "tr"
                          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                          : ""
                      }
                    `}
                  >
                    <span className="text-lg">🇹🇷</span>
                    <span
                      className={`text-sm font-medium ${
                        isDark ? "text-gray-200" : "text-gray-900"
                      }`}
                    >
                      {t("header.turkish")}
                    </span>
                  </button>
                  <button
                    onClick={() => switchLanguage("en")}
                    className={`
                      w-full flex items-center space-x-3 px-4 py-3 text-left
                      hover:bg-gray-100 dark:hover:bg-gray-700 
                      transition-colors duration-150
                      ${
                        locale === "en"
                          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                          : ""
                      }
                    `}
                  >
                    <span className="text-lg">🇺🇸</span>
                    <span
                      className={`text-sm font-medium ${
                        isDark ? "text-gray-200" : "text-gray-900"
                      }`}
                    >
                      {t("header.english")}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main Card */}
          <div
            className={`backdrop-blur-xl rounded-3xl shadow-2xl border p-8 relative overflow-hidden ${
              isDark
                ? "bg-gray-800/80 border-gray-700/20"
                : "bg-white/80 border-white/20"
            }`}
          >
            {/* Card Background Pattern */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-400/10 to-transparent rounded-full"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-400/10 to-transparent rounded-full"></div>

            {/* Logo Section */}
            <div className="text-center mb-8 relative">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 shadow-lg mb-4 relative">
                <UserIcon className="w-10 h-10 text-white" />
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 animate-ping opacity-20"></div>
              </div>
              <h1
                className={`text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent mb-2 ${
                  isDark
                    ? "from-white to-gray-300"
                    : "from-gray-800 to-gray-600"
                }`}
              >
                {t("RegistrationPage.createAccount")}
              </h1>
              <p
                className={`font-medium ${
                  isDark ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {t("RegistrationPage.joinUsToday")}
              </p>
            </div>

            {/* Registration Form */}
            <form onSubmit={handleRegisterWithPassword} className="space-y-6">
              {/* Name and Surname Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name Field */}
                <div className="space-y-2">
                  <label
                    className={`block text-sm font-semibold mb-2 ${
                      isDark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {t("RegistrationPage.name")}
                  </label>
                  <div className="relative">
                    <div
                      className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                        focusedField === "name"
                          ? "text-green-500"
                          : "text-gray-400"
                      }`}
                    >
                      <UserIcon className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        handleInputChange("name", e.target.value)
                      }
                      onFocus={() => setFocusedField("name")}
                      onBlur={() => setFocusedField(null)}
                      className={`w-full pl-12 pr-4 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
                        focusedField === "name"
                          ? `border-green-500 ring-green-500/20 shadow-lg ${
                              isDark ? "bg-green-900/10" : "bg-green-50/50"
                            }`
                          : `${
                              isDark
                                ? "border-gray-600 bg-gray-700/50 hover:border-gray-500"
                                : "border-gray-200 bg-gray-50/50 hover:border-gray-300"
                            }`
                      } ${
                        isDark
                          ? "text-white placeholder-gray-400"
                          : "text-gray-900 placeholder-gray-500"
                      }`}
                      placeholder={t("RegistrationPage.enterName")}
                      required
                    />
                  </div>
                </div>

                {/* Surname Field */}
                <div className="space-y-2">
                  <label
                    className={`block text-sm font-semibold mb-2 ${
                      isDark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {t("RegistrationPage.surname")}
                  </label>
                  <div className="relative">
                    <div
                      className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                        focusedField === "surname"
                          ? "text-green-500"
                          : "text-gray-400"
                      }`}
                    >
                      <UserIcon className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      value={formData.surname}
                      onChange={(e) =>
                        handleInputChange("surname", e.target.value)
                      }
                      onFocus={() => setFocusedField("surname")}
                      onBlur={() => setFocusedField(null)}
                      className={`w-full pl-12 pr-4 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
                        focusedField === "surname"
                          ? `border-green-500 ring-green-500/20 shadow-lg ${
                              isDark ? "bg-green-900/10" : "bg-green-50/50"
                            }`
                          : `${
                              isDark
                                ? "border-gray-600 bg-gray-700/50 hover:border-gray-500"
                                : "border-gray-200 bg-gray-50/50 hover:border-gray-300"
                            }`
                      } ${
                        isDark
                          ? "text-white placeholder-gray-400"
                          : "text-gray-900 placeholder-gray-500"
                      }`}
                      placeholder={t("RegistrationPage.enterSurname")}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Email Field */}
              <div className="space-y-2">
                <label
                  className={`block text-sm font-semibold mb-2 ${
                    isDark ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {t("RegistrationPage.email")}
                </label>
                <div className="relative">
                  <div
                    className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                      focusedField === "email"
                        ? "text-green-500"
                        : "text-gray-400"
                    }`}
                  >
                    <EnvelopeIcon className="h-5 w-5" />
                  </div>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                    className={`w-full pl-12 pr-4 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
                      focusedField === "email"
                        ? `border-green-500 ring-green-500/20 shadow-lg ${
                            isDark ? "bg-green-900/10" : "bg-green-50/50"
                          }`
                        : `${
                            isDark
                              ? "border-gray-600 bg-gray-700/50 hover:border-gray-500"
                              : "border-gray-200 bg-gray-50/50 hover:border-gray-300"
                          }`
                    } ${
                      isDark
                        ? "text-white placeholder-gray-400"
                        : "text-gray-900 placeholder-gray-500"
                    }`}
                    placeholder={t("RegistrationPage.enterEmail")}
                    required
                  />
                </div>
              </div>

              {/* Password Fields Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Password Field */}
                <div className="space-y-2">
                  <label
                    className={`block text-sm font-semibold mb-2 ${
                      isDark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {t("RegistrationPage.password")}
                  </label>
                  <div className="relative">
                    <div
                      className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                        focusedField === "password"
                          ? "text-green-500"
                          : "text-gray-400"
                      }`}
                    >
                      <LockClosedIcon className="h-5 w-5" />
                    </div>
                    <input
                      type={isPasswordVisible ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) =>
                        handleInputChange("password", e.target.value)
                      }
                      onFocus={() => setFocusedField("password")}
                      onBlur={() => setFocusedField(null)}
                      className={`w-full pl-12 pr-12 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
                        focusedField === "password"
                          ? `border-green-500 ring-green-500/20 shadow-lg ${
                              isDark ? "bg-green-900/10" : "bg-green-50/50"
                            }`
                          : `${
                              isDark
                                ? "border-gray-600 bg-gray-700/50 hover:border-gray-500"
                                : "border-gray-200 bg-gray-50/50 hover:border-gray-300"
                            }`
                      } ${
                        isDark
                          ? "text-white placeholder-gray-400"
                          : "text-gray-900 placeholder-gray-500"
                      }`}
                      placeholder={t("RegistrationPage.enterPassword")}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                      className={`absolute inset-y-0 right-0 pr-4 flex items-center transition-colors ${
                        isDark
                          ? "text-gray-400 hover:text-gray-300"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {isPasswordVisible ? (
                        <EyeSlashIcon className="h-5 w-5" />
                      ) : (
                        <EyeIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm Password Field */}
                <div className="space-y-2">
                  <label
                    className={`block text-sm font-semibold mb-2 ${
                      isDark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {t("RegistrationPage.confirmPassword")}
                  </label>
                  <div className="relative">
                    <div
                      className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                        focusedField === "confirmPassword"
                          ? "text-green-500"
                          : "text-gray-400"
                      }`}
                    >
                      <LockClosedIcon className="h-5 w-5" />
                    </div>
                    <input
                      type={isConfirmPasswordVisible ? "text" : "password"}
                      value={formData.confirmPassword}
                      onChange={(e) =>
                        handleInputChange("confirmPassword", e.target.value)
                      }
                      onFocus={() => setFocusedField("confirmPassword")}
                      onBlur={() => setFocusedField(null)}
                      className={`w-full pl-12 pr-12 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
                        focusedField === "confirmPassword"
                          ? `border-green-500 ring-green-500/20 shadow-lg ${
                              isDark ? "bg-green-900/10" : "bg-green-50/50"
                            }`
                          : `${
                              isDark
                                ? "border-gray-600 bg-gray-700/50 hover:border-gray-500"
                                : "border-gray-200 bg-gray-50/50 hover:border-gray-300"
                            }`
                      } ${
                        isDark
                          ? "text-white placeholder-gray-400"
                          : "text-gray-900 placeholder-gray-500"
                      }`}
                      placeholder={t("RegistrationPage.confirmPassword")}
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setIsConfirmPasswordVisible(!isConfirmPasswordVisible)
                      }
                      className={`absolute inset-y-0 right-0 pr-4 flex items-center transition-colors ${
                        isDark
                          ? "text-gray-400 hover:text-gray-300"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {isConfirmPasswordVisible ? (
                        <EyeSlashIcon className="h-5 w-5" />
                      ) : (
                        <EyeIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Gender and Birth Date Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Gender Field */}
                <div className="space-y-2">
                  <label
                    className={`block text-sm font-semibold mb-2 ${
                      isDark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {t("RegistrationPage.gender")}
                  </label>
                  <div className="relative">
                    <div
                      className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                        focusedField === "gender"
                          ? "text-green-500"
                          : "text-gray-400"
                      }`}
                    >
                      <UserGroupIcon className="h-5 w-5" />
                    </div>
                    <select
                      value={formData.gender}
                      onChange={(e) =>
                        handleInputChange("gender", e.target.value)
                      }
                      onFocus={() => setFocusedField("gender")}
                      onBlur={() => setFocusedField(null)}
                      className={`w-full pl-12 pr-4 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
                        focusedField === "gender"
                          ? `border-green-500 ring-green-500/20 shadow-lg ${
                              isDark ? "bg-green-900/10" : "bg-green-50/50"
                            }`
                          : `${
                              isDark
                                ? "border-gray-600 bg-gray-700/50 hover:border-gray-500"
                                : "border-gray-200 bg-gray-50/50 hover:border-gray-300"
                            }`
                      } ${isDark ? "text-white" : "text-gray-900"}`}
                      required
                    >
                      <option value="">
                        {t("RegistrationPage.selectGender")}
                      </option>
                      <option value="Male">{t("RegistrationPage.male")}</option>
                      <option value="Female">
                        {t("RegistrationPage.female")}
                      </option>
                      <option value="Other">
                        {t("RegistrationPage.other")}
                      </option>
                    </select>
                  </div>
                </div>

                {/* Birth Year Field */}
                <div className="space-y-2">
                  <label
                    className={`block text-sm font-semibold mb-2 ${
                      isDark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {t("RegistrationPage.birthYear")}
                  </label>
                  <div className="relative">
                    <div
                      className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                        focusedField === "birthDate"
                          ? "text-green-500"
                          : "text-gray-400"
                      }`}
                    >
                      <CalendarIcon className="h-5 w-5" />
                    </div>
                    <select
                      value={formData.birthDate}
                      onChange={(e) =>
                        handleInputChange("birthDate", e.target.value)
                      }
                      onFocus={() => setFocusedField("birthDate")}
                      onBlur={() => setFocusedField(null)}
                      className={`w-full pl-12 pr-4 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
                        focusedField === "birthDate"
                          ? `border-green-500 ring-green-500/20 shadow-lg ${
                              isDark ? "bg-green-900/10" : "bg-green-50/50"
                            }`
                          : `${
                              isDark
                                ? "border-gray-600 bg-gray-700/50 hover:border-gray-500"
                                : "border-gray-200 bg-gray-50/50 hover:border-gray-300"
                            }`
                      } ${isDark ? "text-white" : "text-gray-900"}`}
                      required
                    >
                      <option value="">
                        {t("RegistrationPage.selectBirthYear")}
                      </option>
                      {generateBirthYears().map((year) => (
                        <option key={year} value={year.toString()}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Language and Referral Code Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Language Field */}
                <div className="space-y-2">
                  <label
                    className={`block text-sm font-semibold mb-2 ${
                      isDark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {t("RegistrationPage.language")}
                  </label>
                  <div className="relative">
                    <div
                      className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                        focusedField === "language"
                          ? "text-green-500"
                          : "text-gray-400"
                      }`}
                    >
                      <GlobeAltIcon className="h-5 w-5" />
                    </div>
                    <select
                      value={formData.languageCode}
                      onChange={(e) =>
                        handleInputChange("languageCode", e.target.value)
                      }
                      onFocus={() => setFocusedField("language")}
                      onBlur={() => setFocusedField(null)}
                      className={`w-full pl-12 pr-4 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
                        focusedField === "language"
                          ? `border-green-500 ring-green-500/20 shadow-lg ${
                              isDark ? "bg-green-900/10" : "bg-green-50/50"
                            }`
                          : `${
                              isDark
                                ? "border-gray-600 bg-gray-700/50 hover:border-gray-500"
                                : "border-gray-200 bg-gray-50/50 hover:border-gray-300"
                            }`
                      } ${isDark ? "text-white" : "text-gray-900"}`}
                      required
                    >
                      <option value="">
                        {t("RegistrationPage.selectLanguage")}
                      </option>
                      <option value="tr">Türkçe</option>
                      <option value="en">English</option>
                      <option value="ru">Русский</option>
                    </select>
                  </div>
                </div>

                {/* Referral Code Field */}
                <div className="space-y-2">
                  <label
                    className={`block text-sm font-semibold mb-2 ${
                      isDark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {t("RegistrationPage.referralCode")}{" "}
                    <span className="text-gray-400">
                      ({t("RegistrationPage.optional")})
                    </span>
                  </label>
                  <div className="relative">
                    <div
                      className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                        focusedField === "referralCode"
                          ? "text-green-500"
                          : "text-gray-400"
                      }`}
                    >
                      <GiftIcon className="h-5 w-5" />
                    </div>
                    <input
                      type="text"
                      value={formData.referralCode}
                      onChange={(e) =>
                        handleInputChange("referralCode", e.target.value)
                      }
                      onFocus={() => setFocusedField("referralCode")}
                      onBlur={() => setFocusedField(null)}
                      className={`w-full pl-12 pr-4 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
                        focusedField === "referralCode"
                          ? `border-green-500 ring-green-500/20 shadow-lg ${
                              isDark ? "bg-green-900/10" : "bg-green-50/50"
                            }`
                          : `${
                              isDark
                                ? "border-gray-600 bg-gray-700/50 hover:border-gray-500"
                                : "border-gray-200 bg-gray-50/50 hover:border-gray-300"
                            }`
                      } ${
                        isDark
                          ? "text-white placeholder-gray-400"
                          : "text-gray-900 placeholder-gray-500"
                      }`}
                      placeholder={t("RegistrationPage.enterReferralCode")}
                    />
                  </div>
                </div>
              </div>

              {/* Register Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl disabled:scale-100 disabled:shadow-md flex items-center justify-center group"
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span className="mr-2">
                      {t("RegistrationPage.register")}
                    </span>
                    <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div
                    className={`w-full border-t ${
                      isDark ? "border-gray-600" : "border-gray-200"
                    }`}
                  ></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span
                    className={`px-4 font-medium ${
                      isDark
                        ? "bg-gray-800 text-gray-400"
                        : "bg-white text-gray-500"
                    }`}
                  >
                    {t("RegistrationPage.or")}
                  </span>
                </div>
              </div>

              {/* Google Sign-up Button */}
              <button
                type="button"
                onClick={handleGoogleRegistration}
                disabled={isLoading}
                className={`w-full border-2 font-semibold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl disabled:scale-100 flex items-center justify-center space-x-3 group ${
                  isDark
                    ? "bg-gray-700 border-gray-600 hover:border-gray-500 text-gray-200"
                    : "bg-white border-gray-200 hover:border-gray-300 text-gray-700"
                }`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>{t("RegistrationPage.registerWithGoogle")}</span>
              </button>
            </form>

            {/* Bottom Links */}
            <div className="mt-8 space-y-4 text-center">
              <button
                onClick={() => router.push("/login")}
                className={`block w-full font-semibold text-sm transition-colors duration-200 py-2 ${
                  isDark
                    ? "text-green-400 hover:text-green-300"
                    : "text-green-600 hover:text-green-700"
                }`}
              >
                {t("RegistrationPage.alreadyHaveAccount")}{" "}
                <span className="underline">
                  {t("RegistrationPage.signIn")}
                </span>
              </button>

              <button
                onClick={() => router.push("/")}
                className={`block w-full font-medium text-sm transition-colors duration-200 py-2 ${
                  isDark
                    ? "text-gray-500 hover:text-gray-300"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t("RegistrationPage.continueAsGuest")}
              </button>
            </div>
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

// Loading component to show while Suspense is loading
function RegistrationLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

// Main page component that wraps RegistrationContent in Suspense
export default function RegistrationPage() {
  return (
    <Suspense fallback={<RegistrationLoading />}>
      <RegistrationContent />
    </Suspense>
  );
}
