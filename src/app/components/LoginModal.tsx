"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  AuthError,
  getAdditionalUserInfo,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  EyeIcon,
  EyeSlashIcon,
  EnvelopeIcon,
  LockClosedIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import { useTranslations } from "next-intl";
import TwoFactorService from "@/services/TwoFactorService";
import { useUser } from "@/context/UserProvider";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const AUTH_TIMEOUT_MS = 30000;

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

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function LoginModal({
  isOpen,
  onClose,
  onSuccess,
}: LoginModalProps) {
  const router = useRouter();
  const t = useTranslations();
  const twoFactorService = TwoFactorService.getInstance();
  const { isPending2FA, setNameComplete } = useUser();

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [twoFAPending, setTwoFAPending] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setTwoFAPending(isPending2FA);
  }, [isPending2FA]);

  // Dark mode detection
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

  // Handle open/close animations
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    } else {
      setIsAnimating(false);
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) handleClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen]);

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(() => {
      onClose();
      setEmail("");
      setPassword("");
      setIsPasswordVisible(false);
    }, 300);
  };

  /** Close immediately (no animation delay) and fire onSuccess — used after
   *  successful authentication so navigation happens without a 300ms wait. */
  const handleSuccessClose = useCallback(() => {
    setIsAnimating(false);
    onClose();
    setEmail("");
    setPassword("");
    setIsPasswordVisible(false);
    onSuccess?.();
  }, [onClose, onSuccess]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const checkAndHandle2FA = useCallback(async (): Promise<boolean> => {
    try {
      const needs2FA = await withTimeout(
        twoFactorService.is2FAEnabled(),
        10000,
        "2FA_CHECK_TIMEOUT"
      );
      if (needs2FA) {
        setTwoFAPending(true);
        handleClose();
        router.push(`/two-factor-verification?type=login`);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error handling 2FA:", error);
      setTwoFAPending(false);
      return true;
    }
  }, [twoFactorService, router]);

  const handleLoginWithPassword = useCallback(
    async (e: React.FormEvent) => {
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
          const isEmailPasswordUser = user.providerData.some(
            (info) => info.providerId === "password"
          );
          if (isEmailPasswordUser) {
            await auth.signOut();
            if (typeof window !== "undefined") {
              sessionStorage.setItem("verification_email", email.trim());
              sessionStorage.setItem("verification_password", password);
            }
            handleClose();
            router.push(`/email-verification`);
            return;
          }
        }
        if (user) {
          const loginComplete = await checkAndHandle2FA();
          if (loginComplete) {
            toast.success(t("LoginPage.loginSuccess"), {
              icon: "🎉",
              style: {
                borderRadius: "10px",
                background: "#10B981",
                color: "#fff",
              },
            });
            if (onSuccess) {
              handleSuccessClose();
            } else {
              handleClose();
              router.push("/");
            }
          }
        }
      } catch (error: unknown) {
        let message = t("LoginPage.loginError");
        const errorMessage = error instanceof Error ? error.message : "";
        const authError = error as AuthError;
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
        setIsLoading(false);
      }
    },
    [email, password, t, twoFactorService, router, checkAndHandle2FA, handleSuccessClose, onSuccess]
  );

  const handleGoogleSignIn = useCallback(async () => {
    twoFactorService.reset();
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await withTimeout(
        signInWithPopup(auth, provider),
        AUTH_TIMEOUT_MS,
        "AUTH_TIMEOUT"
      );
      const user = result.user;
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
          toast.success(t("LoginPage.googleLoginSuccess"), {
            icon: "🚀",
            style: {
              borderRadius: "10px",
              background: "#10B981",
              color: "#fff",
            },
          });
          if (onSuccess) {
            handleSuccessClose();
          } else {
            handleClose();
            router.push("/");
          }
          return;
        }
        const loginComplete = await checkAndHandle2FA();
        if (loginComplete) {
          toast.success(t("LoginPage.googleLoginSuccess"), {
            icon: "🚀",
            style: {
              borderRadius: "10px",
              background: "#10B981",
              color: "#fff",
            },
          });
          if (onSuccess) {
            handleSuccessClose();
          } else {
            handleClose();
            router.push("/");
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "";
      const authError = error as AuthError;
      if (errorMessage === "AUTH_TIMEOUT") {
        toast.error(t("LoginPage.authTimeout"), {
          style: {
            borderRadius: "10px",
            background: "#EF4444",
            color: "#fff",
          },
        });
      } else if (
        authError.code === "auth/popup-closed-by-user" ||
        authError.code === "auth/cancelled-popup-request"
      ) {
        // User cancelled
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
      } else if (
        authError.code === "auth/account-exists-with-different-credential"
      ) {
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
      setIsLoading(false);
    }
  }, [t, twoFactorService, router, checkAndHandle2FA, handleSuccessClose, onSuccess]);

  const handleAppleSignIn = useCallback(async () => {
    twoFactorService.reset();
    setIsLoading(true);
    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
      const result = await withTimeout(
        signInWithPopup(auth, provider),
        AUTH_TIMEOUT_MS,
        "AUTH_TIMEOUT"
      );
      const user = result.user;
      const additionalInfo = getAdditionalUserInfo(result);
      const isNewUser = additionalInfo?.isNewUser ?? false;
      if (user) {
        let displayName: string | null = null;
        const userEmail = user.email || "";
        const profile = additionalInfo?.profile as
          | { name?: { firstName?: string; lastName?: string } }
          | undefined;
        if (profile?.name) {
          const firstName = profile.name.firstName || "";
          const lastName = profile.name.lastName || "";
          if (firstName || lastName) {
            displayName = [firstName, lastName].filter(Boolean).join(" ");
          }
        }
        if (!displayName && user.displayName) {
          displayName = user.displayName;
        }
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        const emailPrefix = userEmail.split("@")[0];
        const hasValidName =
          displayName !== null &&
          displayName !== "" &&
          displayName !== "User" &&
          displayName !== "No Name" &&
          displayName !== emailPrefix &&
          !displayName.includes("@");
        let needsName = !hasValidName;
        let needsCompletion = true;
        if (isNewUser || !userDoc.exists()) {
          let languageCode = "tr";
          if (typeof window !== "undefined") {
            languageCode = localStorage.getItem("locale") || "tr";
          }
          await setDoc(
            userDocRef,
            {
              displayName: hasValidName ? displayName : null,
              email: userEmail,
              isNew: true,
              createdAt: serverTimestamp(),
              emailVerifiedAt: user.emailVerified
                ? serverTimestamp()
                : null,
              languageCode,
            },
            { merge: true }
          );
          needsName = !hasValidName;
          needsCompletion = true;
        } else {
          const userData = userDoc.data();
          if (displayName && hasValidName) {
            const existingName = userData.displayName;
            if (
              !existingName ||
              existingName === "User" ||
              existingName === "No Name" ||
              existingName === emailPrefix
            ) {
              await setDoc(userDocRef, { displayName }, { merge: true });
            }
          }
          const existingDisplayName = userData.displayName as
            | string
            | undefined;
          const existingEmailPrefix = (userData.email || userEmail).split(
            "@"
          )[0];
          needsName =
            !existingDisplayName ||
            existingDisplayName === "" ||
            existingDisplayName === "User" ||
            existingDisplayName === "No Name" ||
            existingDisplayName === existingEmailPrefix;
          needsCompletion =
            !userData.gender ||
            !userData.birthDate ||
            !userData.languageCode;
        }
        if (needsName) {
          setNameComplete(false);
        } else {
          setNameComplete(true);
        }
        const needs2FA = await twoFactorService.is2FAEnabled();
        if (needs2FA) {
          setTwoFAPending(true);
          handleClose();
          router.push(`/two-factor-verification?type=login`);
          return;
        }
        toast.success(
          t("LoginPage.appleLoginSuccess") || t("LoginPage.googleLoginSuccess"),
          {
            icon: "🍎",
            style: {
              borderRadius: "10px",
              background: "#10B981",
              color: "#fff",
            },
          }
        );
        if (needsName) {
          handleClose();
          router.push("/complete-name");
        } else if (onSuccess) {
          handleSuccessClose();
        } else {
          handleClose();
          router.push("/");
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "";
      const authError = error as AuthError;
      if (errorMessage === "AUTH_TIMEOUT") {
        toast.error(t("LoginPage.authTimeout"), {
          style: {
            borderRadius: "10px",
            background: "#EF4444",
            color: "#fff",
          },
        });
      } else if (
        authError.code === "auth/popup-closed-by-user" ||
        authError.code === "auth/cancelled-popup-request"
      ) {
        // cancelled
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
      } else if (
        authError.code === "auth/account-exists-with-different-credential"
      ) {
        toast.error(t("LoginPage.accountExistsWithDifferentCredential"), {
          style: {
            borderRadius: "10px",
            background: "#EF4444",
            color: "#fff",
          },
        });
      } else {
        toast.error(
          t("LoginPage.appleLoginError") || t("LoginPage.googleLoginError"),
          {
            style: {
              borderRadius: "10px",
              background: "#EF4444",
              color: "#fff",
            },
          }
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [t, twoFactorService, router, setNameComplete, handleSuccessClose, onSuccess]);

  const isDisabled = isLoading || isPending2FA || twoFAPending;

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-end sm:items-center justify-center transition-all duration-300 ${
        isAnimating ? "bg-black/50 backdrop-blur-sm" : "bg-black/0"
      }`}
      onClick={handleBackdropClick}
    >
      <div
        className={`
          w-full sm:w-[400px] sm:max-w-[90vw]
          max-h-[92vh] sm:max-h-[85vh]
          overflow-y-auto overscroll-contain
          rounded-t-3xl sm:rounded-2xl
          shadow-2xl border
          transition-all duration-300 ease-out
          ${
            isDark
              ? "bg-gray-900 border-gray-800"
              : "bg-white border-gray-100"
          }
          ${
            isAnimating
              ? "opacity-100 translate-y-0 sm:scale-100"
              : "opacity-0 translate-y-full sm:translate-y-8 sm:scale-95"
          }
        `}
      >
        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div
            className={`w-10 h-1 rounded-full ${
              isDark ? "bg-gray-700" : "bg-gray-300"
            }`}
          />
        </div>

        {/* Header with close button */}
        <div className="relative px-6 pt-4 sm:pt-6">
          <button
            onClick={handleClose}
            className={`absolute top-4 right-4 sm:top-5 sm:right-5 p-1.5 rounded-full transition-colors ${
              isDark
                ? "bg-gray-800 hover:bg-gray-700 text-gray-400"
                : "bg-gray-100 hover:bg-gray-200 text-gray-500"
            }`}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Logo & Title */}
        <div className="flex flex-col items-center px-6 pb-2 pt-1 sm:pt-0">
          <img
            src={isDark ? "/images/beyazlogo.png" : "/images/siyahlogo.png"}
            alt="Logo"
            className="w-14 h-14 sm:w-16 sm:h-16 object-contain"
          />
          <h2
            className={`text-xl font-bold mt-2 ${
              isDark ? "text-white" : "text-gray-900"
            }`}
          >
            {t("LoginPage.welcome")}
          </h2>
          <p
            className={`text-xs mt-1 ${
              isDark ? "text-gray-500" : "text-gray-400"
            }`}
          >
            {t("LoginPage.signInToContinue") || t("LoginPage.welcome")}
          </p>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 sm:pb-8 pt-4">
          {/* Login Form */}
          <form onSubmit={handleLoginWithPassword} className="space-y-3">
            {/* Email */}
            <div>
              <label
                className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${
                  isDark ? "text-gray-500" : "text-gray-400"
                }`}
              >
                {t("LoginPage.email")}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <EnvelopeIcon
                    className={`h-4 w-4 ${
                      isDark ? "text-gray-600" : "text-gray-400"
                    }`}
                  />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-colors ${
                    isDark
                      ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600"
                      : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"
                  }`}
                  placeholder={t("LoginPage.enterEmail")}
                  required
                  disabled={isDisabled}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${
                  isDark ? "text-gray-500" : "text-gray-400"
                }`}
              >
                {t("LoginPage.password")}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LockClosedIcon
                    className={`h-4 w-4 ${
                      isDark ? "text-gray-600" : "text-gray-400"
                    }`}
                  />
                </div>
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-10 pr-10 py-2.5 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-colors ${
                    isDark
                      ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600"
                      : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"
                  }`}
                  placeholder={t("LoginPage.enterPassword")}
                  required
                  minLength={6}
                  disabled={isDisabled}
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                  className={`absolute inset-y-0 right-0 pr-3 flex items-center ${
                    isDark
                      ? "text-gray-600 hover:text-gray-400"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                  disabled={isDisabled}
                >
                  {isPasswordVisible ? (
                    <EyeSlashIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot Password */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  router.push("/password-reset");
                }}
                className={`text-xs font-medium transition-colors ${
                  isDark
                    ? "text-gray-500 hover:text-gray-300"
                    : "text-gray-500 hover:text-gray-700"
                }`}
                disabled={isDisabled}
              >
                {t("LoginPage.forgotPassword") || "Forgot Password?"}
              </button>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isDisabled}
              className="w-full py-2.5 px-4 bg-orange-500 text-white rounded-xl text-[13px] font-semibold hover:bg-orange-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {isDisabled ? (
                <div className="w-4 h-4 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                t("LoginPage.signIn")
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div
                  className={`w-full border-t ${
                    isDark ? "border-gray-800" : "border-gray-200"
                  }`}
                />
              </div>
              <div className="relative flex justify-center text-xs">
                <span
                  className={`px-3 ${
                    isDark
                      ? "bg-gray-900 text-gray-600"
                      : "bg-white text-gray-400"
                  }`}
                >
                  {t("LoginPage.or")}
                </span>
              </div>
            </div>
          </div>

          {/* Social Buttons */}
          <div className="space-y-2.5">
            {/* Apple */}
            <button
              type="button"
              onClick={handleAppleSignIn}
              disabled={isDisabled}
              className={`w-full py-2.5 px-4 rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center space-x-2.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                isDark
                  ? "bg-white text-black hover:bg-gray-100"
                  : "bg-black text-white hover:bg-gray-900"
              }`}
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              <span>
                {t("LoginPage.signInWithApple") || "Continue with Apple"}
              </span>
            </button>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isDisabled}
              className={`w-full py-2.5 px-4 border rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center space-x-2.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                isDark
                  ? "bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750"
                  : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
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
          </div>

          {/* Bottom Links */}
          <div className="mt-5 space-y-2 text-center">
            <button
              onClick={() => {
                handleClose();
                router.push("/registration");
              }}
              disabled={isPending2FA || twoFAPending}
              className={`text-[13px] font-medium transition-colors ${
                isDark
                  ? "text-orange-400 hover:text-orange-300"
                  : "text-orange-600 hover:text-orange-700"
              } ${
                isPending2FA || twoFAPending
                  ? "opacity-50 cursor-not-allowed"
                  : ""
              }`}
            >
              {t("LoginPage.noAccount")}{" "}
              <span className="underline">{t("LoginPage.register")}</span>
            </button>

            <button
              onClick={handleClose}
              className={`block w-full text-[12px] font-medium transition-colors py-1 ${
                isDark
                  ? "text-gray-600 hover:text-gray-400"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              {t("LoginPage.continueAsGuest")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
