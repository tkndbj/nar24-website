"use client";

import React, { useState, useEffect, useRef, Suspense, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  AuthError,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  EyeIcon,
  EyeSlashIcon,
  EnvelopeIcon,
  LockClosedIcon,
  
  ArrowRightIcon,
  CheckCircleIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useTranslations, useLocale } from "next-intl";
import TwoFactorService from "@/services/TwoFactorService";
import { useUser } from "@/context/UserProvider";
import { doc, getDoc } from "firebase/firestore";

// Constants for timeouts
const AUTH_TIMEOUT_MS = 30000; // 30 seconds timeout for auth operations

// Helper to create a timeout promise
const withTimeout = <T,>(
  promise: Promise<T>,
  ms: number,
  errorMessage: string
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms)
    ),
  ]);
};

// Create a separate component for the login content that uses useSearchParams
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations();
  const twoFactorService = TwoFactorService.getInstance();

  // 🔥 CRITICAL: Get user context to check 2FA state
  const { isPending2FA, cancel2FA } = useUser();

  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState("");

  // State management
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [twoFAPending, setTwoFAPending] = useState(false);

  const languageMenuRef = useRef<HTMLDivElement>(null);

  // 🔥 CRITICAL: Sync local twoFAPending with global isPending2FA state
  useEffect(() => {
    setTwoFAPending(isPending2FA);
  }, [isPending2FA]);

  // Handle theme detection and initialization
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initialize theme from localStorage or system preference on mount
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }

    // Watch for theme changes via MutationObserver
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };

    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

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
    const passwordParam = searchParams.get("password");
    const showVerification = searchParams.get("showVerification") === "true";

    if (emailParam) setEmail(emailParam);
    if (passwordParam) setPassword(passwordParam);
    setShowVerificationMessage(showVerification);
  }, [searchParams]);

  // Cooldown timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error(
        t("LoginPage.emailRequired") || "Please enter your email address"
      );
      return;
    }

    if (!validateEmail(email)) {
      toast.error(
        t("LoginPage.invalidEmail") || "Please enter a valid email address"
      );
      return;
    }

    setResetLoading(true);
    setResetMessage("");

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetMessage(
        t("LoginPage.resetEmailSent") ||
          "Password reset email sent! Please check your inbox."
      );
      toast.success(
        t("LoginPage.resetEmailSent") || "Password reset email sent!"
      );
    } catch (error) {
      const authError = error as AuthError;
      let errorMessage =
        t("LoginPage.resetEmailFailed") || "Failed to send reset email";

      switch (authError.code) {
        case "auth/user-not-found":
          errorMessage =
            t("LoginPage.userNotFound") || "No account found with this email";
          break;
        case "auth/invalid-email":
          errorMessage = t("LoginPage.invalidEmail") || "Invalid email address";
          break;
        case "auth/too-many-requests":
          errorMessage =
            t("LoginPage.tooManyRequests") ||
            "Too many requests. Please try again later";
          break;
      }

      toast.error(errorMessage);
    } finally {
      setResetLoading(false);
    }
  };

  // Language switching function
  const switchLanguage = (newLocale: string, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    let pathWithoutLocale = pathname;
    if (pathname.startsWith(`/${locale}`)) {
      pathWithoutLocale = pathname.substring(`/${locale}`.length) || "/";
    }

    const newPath = `/${newLocale}${pathWithoutLocale}`;
    router.push(newPath);
    setShowLanguageMenu(false);
  };

  // Email validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  // Check if user needs 2FA after successful login
  const checkAndHandle2FA = useCallback(async (): Promise<boolean> => {
    try {
      const needs2FA = await withTimeout(
        twoFactorService.is2FAEnabled(),
        10000, // 10 second timeout for 2FA check
        "2FA_CHECK_TIMEOUT"
      );

      if (needs2FA) {
        setTwoFAPending(true);

        // Navigate to 2FA verification
        router.push(`/two-factor-verification?type=login`);

        // Return false to indicate 2FA is pending (login not complete)
        return false;
      }

      return true; // No 2FA needed, login complete
    } catch (error) {
      console.error("Error handling 2FA:", error);
      setTwoFAPending(false);
      return true; // If error checking 2FA, proceed with login
    }
  }, [twoFactorService, router]);

  // Handle email/password login
  const handleLoginWithPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error(t("LoginPage.emailRequired"));
      return;
    }

    if (!validateEmail(email)) {
      toast.error(t("LoginPage.invalidEmail"));
      return;
    }

    if (!password) {
      toast.error(t("LoginPage.passwordRequired"));
      return;
    }

    if (password.length < 6) {
      toast.error(t("LoginPage.passwordTooShort"));
      return;
    }

    // Reset TwoFactorService state before new login attempt
    twoFactorService.reset();
    setIsLoading(true);

    try {
      const userCredential = await withTimeout(
        signInWithEmailAndPassword(auth, email.trim(), password),
        AUTH_TIMEOUT_MS,
        "AUTH_TIMEOUT"
      );
      const user = userCredential.user;

      if (user && !user.emailVerified) {
        // Check if user is using email/password (not Google)
        const isEmailPasswordUser = user.providerData.some(
          (info) => info.providerId === "password"
        );

        if (isEmailPasswordUser) {
          await auth.signOut();
          // Store credentials securely in sessionStorage (temporary, auto-clears on tab close)
          if (typeof window !== "undefined") {
            sessionStorage.setItem("verification_email", email.trim());
            sessionStorage.setItem("verification_password", password);
          }
          // Redirect to email verification page without credentials in URL
          router.push(`/email-verification`);
          return;
        }
      }

      if (user) {
        // Check if 2FA verification is needed
        const loginComplete = await checkAndHandle2FA();

        if (loginComplete) {
          // No 2FA needed or 2FA check failed - complete login
          toast.success(t("LoginPage.loginSuccess"), {
            icon: "🎉",
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
      let message = t("LoginPage.loginError");
      const errorMessage = error instanceof Error ? error.message : "";
      const authError = error as AuthError;

      // Handle timeout error
      if (errorMessage === "AUTH_TIMEOUT") {
        message = t("LoginPage.authTimeout");
      } else {
        switch (authError.code) {
          case "auth/user-not-found":
            message = t("LoginPage.userNotFound");
            break;
          case "auth/wrong-password":
            message = t("LoginPage.wrongPassword");
            break;
          case "auth/invalid-email":
            message = t("LoginPage.invalidEmail");
            break;
          case "auth/network-request-failed":
            message = t("LoginPage.networkError");
            break;
          case "auth/too-many-requests":
            message = t("LoginPage.tooManyRequests");
            break;
          case "auth/invalid-credential":
            message = t("LoginPage.invalidCredentials");
            break;
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
      // Always reset loading state
      setIsLoading(false);
    }
  }, [email, password, t, twoFactorService, router, checkAndHandle2FA]);

  // Handle Google sign-in
  const handleGoogleSignIn = useCallback(async () => {
    console.log("🔵 handleGoogleSignIn called");

    // Reset TwoFactorService state before new login attempt
    twoFactorService.reset();
    setIsLoading(true);

    try {
      console.log("🔵 Creating GoogleAuthProvider...");
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
      });

      console.log("🔵 Calling signInWithPopup...");
      const result = await withTimeout(
        signInWithPopup(auth, provider),
        AUTH_TIMEOUT_MS,
        "AUTH_TIMEOUT"
      );
      console.log("🟢 signInWithPopup succeeded");
      const user = result.user;
  
      if (user) {

        // ✅ ADD: Check Firestore document for profile completion
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
  
        // ✅ ADD: Check if document exists
        if (!userDoc.exists()) {
          // New user - no document yet, redirect to complete profile
          toast.success(t("LoginPage.googleLoginSuccess"), {
            icon: "🚀",
            style: {
              borderRadius: "10px",
              background: "#10B981",
              color: "#fff",
            },
          });
          router.push("/complete-profile");
          return;
        }
  
        const userData = userDoc.data();
  
        // ✅ ADD: Check if profile is complete - same logic as Flutter
        const isProfileIncomplete =
          !userData.gender ||
          !userData.birthDate ||
          !userData.languageCode;
  
        if (isProfileIncomplete) {
          toast.success(t("LoginPage.googleLoginSuccess"), {
            icon: "🚀",
            style: {
              borderRadius: "10px",
              background: "#10B981",
              color: "#fff",
            },
          });
          router.push("/complete-profile");
          return;
        }
  
        // ✅ Profile is complete - continue with 2FA check
        const loginComplete = await checkAndHandle2FA();
  
        if (loginComplete) {
          // No 2FA needed or 2FA check failed - complete login
          toast.success(t("LoginPage.googleLoginSuccess"), {
            icon: "🚀",
            style: {
              borderRadius: "10px",
              background: "#10B981",
              color: "#fff",
            },
          });
          router.push("/");
        }
        // If 2FA is needed, user will be redirected to 2FA page
      }
    } catch (error: unknown) {
      console.error("🔴 Google Sign-In Error:", error);
      console.error("🔴 Error type:", typeof error);
      console.error("🔴 Error code:", (error as AuthError)?.code);
      console.error("🔴 Error message:", (error as Error)?.message);

      const errorMessage = error instanceof Error ? error.message : "";
      const authError = error as AuthError;

      // Handle timeout error
      if (errorMessage === "AUTH_TIMEOUT") {
        toast.error(t("LoginPage.authTimeout"), {
          style: {
            borderRadius: "10px",
            background: "#EF4444",
            color: "#fff",
          },
        });
        // Don't return early - let finally handle loading state
      } else if (authError.code === "auth/popup-closed-by-user" || authError.code === "auth/cancelled-popup-request") {
        // User cancelled - don't show error, just reset loading
        console.log("🟡 User cancelled popup");
      } else if (authError.code === "auth/popup-blocked") {
        toast.error(t("LoginPage.popupBlocked"), {
          style: {
            borderRadius: "10px",
            background: "#EF4444",
            color: "#fff",
          },
        });
      } else if (authError.code === "auth/network-request-failed") {
        toast.error(t("LoginPage.networkError"), {
          style: {
            borderRadius: "10px",
            background: "#EF4444",
            color: "#fff",
          },
        });
      } else if (authError.code === "auth/account-exists-with-different-credential") {
        toast.error(t("LoginPage.accountExistsWithDifferentCredential"), {
          style: {
            borderRadius: "10px",
            background: "#EF4444",
            color: "#fff",
          },
        });
      } else {
        toast.error(t("LoginPage.googleLoginError"), {
          style: {
            borderRadius: "10px",
            background: "#EF4444",
            color: "#fff",
          },
        });
      }
    } finally {
      // Always reset loading state - this runs after catch block completes
      console.log("🔵 handleGoogleSignIn finally block - resetting loading");
      setIsLoading(false);
    }
  }, [t, twoFactorService, router, checkAndHandle2FA]);

  // Resend verification email
  const resendVerificationCode = async () => {
    if (!email.trim() || !password) {
      toast.error(t("LoginPage.emailPasswordRequired"));
      return;
    }

    if (resendCooldown > 0) {
      toast.error(t("LoginPage.waitBeforeResend", { seconds: resendCooldown }));
      return;
    }

    setIsResending(true);

    try {
      // First, sign in to get the user context
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const user = userCredential.user;

      if (user && !user.emailVerified) {
        // Call the resend verification code function
        const functions = getFunctions(undefined, "europe-west3");
        const resendEmailVerificationCode = httpsCallable(
          functions,
          "resendEmailVerificationCode"
        );

        await resendEmailVerificationCode();

        toast.success(
          t("LoginPage.verificationCodeSent") || "Verification code sent!"
        );
        setResendCooldown(30); // 30 seconds cooldown
      }

      // Sign out after sending code
      await auth.signOut();
    } catch (error: unknown) {
      let message = t("LoginPage.verificationEmailError");

      if (error && typeof error === "object" && "code" in error) {
        const authError = error as AuthError;
        switch (authError.code) {
          case "auth/user-not-found":
            message = t("LoginPage.userNotFound");
            break;
          case "auth/wrong-password":
            message = t("LoginPage.wrongPassword");
            break;
          case "auth/invalid-email":
            message = t("LoginPage.invalidEmail");
            break;
          case "auth/too-many-requests":
            message = t("LoginPage.tooManyRequests");
            break;
          case "functions/resource-exhausted":
            message = t("LoginPage.tooManyRequests");
            break;
          case "functions/failed-precondition":
            message = "Email already verified";
            break;
          default:
            message =
              authError.message || t("LoginPage.verificationEmailError");
        }
      }

      toast.error(message);
    } finally {
      setIsResending(false);
    }
  };

  // 🔥 CRITICAL FIX: Proper continue as guest handler
  const handleContinueAsGuest = async () => {
    if (isPending2FA || twoFAPending) {
      // User is in 2FA state - must properly cancel and sign out
      try {
        // Use the cancel2FA method from UserProvider (this signs out and resets state)
        await cancel2FA();

        // Reset local state
        setTwoFAPending(false);
        setEmail("");
        setPassword("");

        // Clear any TwoFactorService state
        twoFactorService.reset();

        // Show success message
        toast.success(
          t("LoginPage.signedOutSuccessfully") || "Signed out successfully",
          {
            icon: "👋",
            style: {
              borderRadius: "10px",
              background: "#6B7280",
              color: "#fff",
            },
          }
        );

        // Small delay to ensure state is clean, then navigate
        setTimeout(() => {
          router.push("/");
        }, 500);

        return;
      } catch (error) {
        console.error("Error during 2FA cancellation:", error);

        // Fallback: force sign out and reset
        try {
          await auth.signOut();

          // Verify logout was successful
          const stillLoggedIn = auth.currentUser;
          if (stillLoggedIn) {
            console.error("User still logged in after signOut attempt");
            // Force clear all auth state
            if (typeof window !== "undefined") {
              sessionStorage.clear();
              localStorage.removeItem("firebase:authUser");
            }
          }

          setTwoFAPending(false);
          twoFactorService.reset();

          // Ensure clean state and redirect
          window.location.href = "/";
        } catch (fallbackError) {
          console.error("Fallback sign out failed:", fallbackError);
          // Clear all local auth data before redirect
          if (typeof window !== "undefined") {
            sessionStorage.clear();
            try {
              // Clear all Firebase-related localStorage keys
              for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (
                  key &&
                  (key.includes("firebase") || key.includes("firebaseui"))
                ) {
                  localStorage.removeItem(key);
                }
              }
            } catch (e) {
              console.error("Error clearing localStorage:", e);
            }
          }
          // Force redirect to home
          window.location.href = "/";
        }
      }
    } else {
      // Normal case - just navigate to home
      router.push("/");
    }
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

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Language Selector */}
          <div className="flex justify-end mb-6">
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
              <div className="inline-flex items-center justify-center mb-4">
                <img
                  src={isDark ? "/images/beyazlogo.png" : "/images/siyahlogo.png"}
                  alt="Logo"
                  className="w-20 h-20 object-contain"
                />
              </div>
              <h1
                className={`text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent mb-2 ${
                  isDark
                    ? "from-white to-gray-300"
                    : "from-gray-800 to-gray-600"
                }`}
              >
                {t("LoginPage.welcome")}
              </h1>
              
            </div>

            {/* 2FA Pending Message */}
            {(isPending2FA || twoFAPending) && (
              <div
                className={`mb-6 p-4 rounded-2xl border ${
                  isDark
                    ? "bg-gradient-to-r from-orange-900/20 to-pink-900/20 border-orange-700/30"
                    : "bg-gradient-to-r from-orange-50 to-pink-50 border-orange-200"
                }`}
              >
                <div className="flex items-center justify-center space-x-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500"></div>
                  <p
                    className={`text-sm font-medium ${
                      isDark ? "text-orange-200" : "text-orange-800"
                    }`}
                  >
                    {t("LoginPage.twoFactorPending") ||
                      "Two-factor authentication required. Complete verification or sign out."}
                  </p>
                </div>
              </div>
            )}

            {/* Verification Success Message (for new registrations) */}
            {showVerificationMessage && (
              <div
                className={`mb-6 p-4 rounded-2xl border ${
                  isDark
                    ? "bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-green-700/30"
                    : "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <CheckCircleIcon
                      className={`w-6 h-6 mt-0.5 ${
                        isDark ? "text-green-400" : "text-green-600"
                      }`}
                    />
                  </div>
                  <div className="flex-1">
                    <h3
                      className={`text-sm font-semibold mb-2 ${
                        isDark ? "text-green-200" : "text-green-800"
                      }`}
                    >
                      {t("LoginPage.accountCreatedSuccessfully")}
                    </h3>
                    <p
                      className={`text-sm mb-3 ${
                        isDark ? "text-green-300" : "text-green-700"
                      }`}
                    >
                      {t("LoginPage.verificationEmailSentMessage")}
                    </p>
                    <button
                      onClick={resendVerificationCode}
                      disabled={isResending || resendCooldown > 0}
                      className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-semibold rounded-xl transition-colors duration-200 disabled:cursor-not-allowed"
                    >
                      {isResending ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      ) : (
                        <EnvelopeIcon className="w-4 h-4 mr-2" />
                      )}
                      {resendCooldown > 0
                        ? t("LoginPage.resendInSeconds", {
                            seconds: resendCooldown,
                          })
                        : t("LoginPage.resendEmail")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLoginWithPassword} className="space-y-6">
              {/* Email Field */}
              <div className="space-y-2">
                <label
                  className={`block text-sm font-semibold mb-2 ${
                    isDark ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {t("LoginPage.email")}
                </label>
                <div className="relative">
                  <div
                    className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                      focusedField === "email"
                        ? "text-blue-500"
                        : "text-gray-400"
                    }`}
                  >
                    <EnvelopeIcon className="h-5 w-5" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => setFocusedField(null)}
                    className={`w-full pl-12 pr-4 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
                      focusedField === "email"
                        ? `border-blue-500 ring-blue-500/20 shadow-lg ${
                            isDark ? "bg-blue-900/10" : "bg-blue-50/50"
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
                    placeholder={t("LoginPage.enterEmail")}
                    required
                    disabled={isLoading || isPending2FA || twoFAPending}
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label
                  className={`block text-sm font-semibold mb-2 ${
                    isDark ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {t("LoginPage.password")}
                </label>
                <div className="relative">
                  <div
                    className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200 ${
                      focusedField === "password"
                        ? "text-blue-500"
                        : "text-gray-400"
                    }`}
                  >
                    <LockClosedIcon className="h-5 w-5" />
                  </div>
                  <input
                    type={isPasswordVisible ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => setFocusedField(null)}
                    className={`w-full pl-12 pr-12 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
                      focusedField === "password"
                        ? `border-blue-500 ring-blue-500/20 shadow-lg ${
                            isDark ? "bg-blue-900/10" : "bg-blue-50/50"
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
                    placeholder={t("LoginPage.enterPassword")}
                    required
                    minLength={6}
                    disabled={isLoading || isPending2FA || twoFAPending}
                  />
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                    className={`absolute inset-y-0 right-0 pr-4 flex items-center transition-colors ${
                      isDark
                        ? "text-gray-400 hover:text-gray-300"
                        : "text-gray-400 hover:text-gray-600"
                    }`}
                    disabled={isLoading || isPending2FA || twoFAPending}
                  >
                    {isPasswordVisible ? (
                      <EyeSlashIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Forgot Password Link */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className={`text-sm font-medium transition-colors duration-200 ${
                    isDark
                      ? "text-gray-400 hover:text-gray-200"
                      : "text-gray-600 hover:text-gray-800"
                  } ${resetLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={
                    isLoading || isPending2FA || twoFAPending || resetLoading
                  }
                >
                  {resetLoading
                    ? t("LoginPage.sendingEmail") || "Sending..."
                    : t("LoginPage.forgotPassword") || "Forgot Password?"}
                </button>
              </div>

              {/* Password Reset Success Message */}
              {resetMessage && (
                <div
                  className={`mt-4 p-4 rounded-xl ${
                    isDark
                      ? "bg-green-900/20 border border-green-700"
                      : "bg-green-50 border border-green-200"
                  }`}
                >
                  <p
                    className={`text-sm text-center ${
                      isDark ? "text-green-300" : "text-green-600"
                    }`}
                  >
                    {resetMessage}
                  </p>
                </div>
              )}

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading || isPending2FA || twoFAPending}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 shadow-lg hover:shadow-xl disabled:shadow-md flex items-center justify-center group"
              >
                {isLoading || isPending2FA || twoFAPending ? (
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span className="mr-2">{t("LoginPage.signIn")}</span>
                    <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                  </>
                )}
              </button>
            </form>

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
                  {t("LoginPage.or")}
                </span>
              </div>
            </div>

            {/* Google Sign-in Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading || isPending2FA || twoFAPending}
              className={`w-full border-2 font-semibold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 shadow-lg hover:shadow-xl flex items-center justify-center space-x-3 group ${
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
              <span>{t("LoginPage.signInWithGoogle")}</span>
            </button>

            {/* Bottom Links */}
            <div className="mt-8 space-y-4 text-center">
              <button
                onClick={() => router.push("/registration")}
                disabled={isPending2FA || twoFAPending}
                className={`block w-full font-semibold text-sm transition-colors duration-200 py-2 ${
                  isDark
                    ? "text-blue-400 hover:text-blue-300"
                    : "text-blue-600 hover:text-blue-700"
                } ${
                  isPending2FA || twoFAPending
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }`}
              >
                {t("LoginPage.noAccount")}{" "}
                <span className="underline">{t("LoginPage.register")}</span>
              </button>

              {/* 🔥 CRITICAL FIX: Proper Continue as Guest button */}
              <button
                onClick={handleContinueAsGuest}
                className={`block w-full font-medium text-sm transition-colors duration-200 py-2 ${
                  isDark
                    ? "text-gray-500 hover:text-gray-300"
                    : "text-gray-500 hover:text-gray-700"
                } ${
                  isPending2FA || twoFAPending
                    ? "text-red-500 hover:text-red-400"
                    : ""
                }`}
              >
                {isPending2FA || twoFAPending
                  ? t("LoginPage.signOutAndContinueAsGuest") ||
                    "Sign Out & Continue as Guest"
                  : t("LoginPage.continueAsGuest")}
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
function LoginLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

// Main page component that wraps LoginContent in Suspense
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginContent />
    </Suspense>
  );
}
