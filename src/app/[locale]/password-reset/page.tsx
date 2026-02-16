"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, usePathname } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { FirebaseError } from "firebase/app";
import {
  EnvelopeIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  InformationCircleIcon,
  GlobeAltIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import { useTranslations, useLocale } from "next-intl";

function PasswordResetContent() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations();

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const languageMenuRef = useRef<HTMLDivElement>(null);
  const RESEND_COOLDOWN_SECONDS = 60;

  // Handle theme detection
  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;

    if (savedTheme === "dark" || (!savedTheme && systemPrefersDark)) {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }

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

  // Countdown timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Language switching
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
  const validateEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value.trim());
  };

  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error(
        t("passwordReset.emailRequired") || "Please enter your email address"
      );
      return;
    }

    if (!validateEmail(email)) {
      toast.error(
        t("passwordReset.emailInvalid") ||
          "Please enter a valid email address"
      );
      return;
    }

    setIsLoading(true);

    try {
      const sendResetEmail = httpsCallable(functions, "sendPasswordResetEmail");
      await sendResetEmail({ email: email.trim().toLowerCase() });

      setEmailSent(true);
      setResendCountdown(RESEND_COOLDOWN_SECONDS);

      toast.success(
        t("passwordReset.emailSentSuccess") ||
          "Password reset email sent! Check your inbox.",
        {
          icon: "✉️",
          style: {
            borderRadius: "10px",
            background: "#10B981",
            color: "#fff",
          },
        }
      );
    } catch (err: unknown) {
      let errorMessage =
        t("passwordReset.errorGeneral") ||
        "An error occurred. Please try again.";

      if (err && typeof err === "object" && "code" in err) {
        const firebaseError = err as FirebaseError;
        switch (firebaseError.code) {
          case "functions/invalid-argument":
            errorMessage =
              t("passwordReset.emailInvalid") ||
              "Please enter a valid email address";
            break;
          default:
            errorMessage =
              t("passwordReset.errorGeneral") ||
              "An error occurred. Please try again.";
        }
      }

      toast.error(errorMessage, {
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

  const handleResendEmail = async () => {
    if (resendCountdown > 0 || isResending) return;

    setIsResending(true);

    try {
      const sendResetEmail = httpsCallable(functions, "sendPasswordResetEmail");
      await sendResetEmail({ email: email.trim().toLowerCase() });

      setResendCountdown(RESEND_COOLDOWN_SECONDS);

      toast.success(
        t("passwordReset.emailResentSuccess") ||
          "Password reset email sent again!",
        {
          icon: "✉️",
          style: {
            borderRadius: "10px",
            background: "#10B981",
            color: "#fff",
          },
        }
      );
    } catch {
      toast.error(
        t("passwordReset.resendFailed") ||
          "Failed to resend email. Please try again.",
        {
          style: {
            borderRadius: "10px",
            background: "#EF4444",
            color: "#fff",
          },
        }
      );
    } finally {
      setIsResending(false);
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
          className={`absolute -top-4 -left-4 w-40 h-40 sm:w-72 sm:h-72 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob ${
            isDark
              ? "bg-gradient-to-r from-blue-600 to-purple-600"
              : "bg-gradient-to-r from-blue-300 to-purple-300"
          }`}
        ></div>
        <div
          className={`absolute -top-4 -right-4 w-40 h-40 sm:w-72 sm:h-72 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000 ${
            isDark
              ? "bg-gradient-to-r from-yellow-600 to-pink-600"
              : "bg-gradient-to-r from-yellow-300 to-pink-300"
          }`}
        ></div>
        <div
          className={`absolute -bottom-8 left-20 w-40 h-40 sm:w-72 sm:h-72 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000 ${
            isDark
              ? "bg-gradient-to-r from-pink-600 to-indigo-600"
              : "bg-gradient-to-r from-pink-300 to-indigo-300"
          }`}
        ></div>
      </div>

      <div className="relative min-h-screen flex items-center justify-center p-2 sm:p-4">
        <div className="w-full max-w-md">
          {/* Top Row: Back Button + Language Selector */}
          <div className="flex justify-between items-center mb-1 sm:mb-6">
            {/* Back Button */}
            <button
              onClick={() => router.push("/")}
              className={`p-3 rounded-full backdrop-blur-lg border transition-all duration-300 group ${
                isDark
                  ? "bg-gray-800/20 border-gray-700/20 hover:bg-gray-700/30"
                  : "bg-white/20 border-white/20 hover:bg-white/30"
              }`}
              aria-label={t("passwordReset.backToLogin") || "Back to login"}
            >
              <ArrowLeftIcon
                className={`w-5 h-5 transition-colors ${
                  isDark
                    ? "text-gray-300 group-hover:text-white"
                    : "text-gray-600 group-hover:text-gray-800"
                }`}
              />
            </button>

            {/* Language Selector */}
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
            className={`backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-2xl border p-4 sm:p-8 relative overflow-hidden ${
              isDark
                ? "bg-gray-800/80 border-gray-700/20"
                : "bg-white/80 border-white/20"
            }`}
          >
            {/* Card Background Pattern */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-400/10 to-transparent rounded-full"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-400/10 to-transparent rounded-full"></div>

            {/* Header */}
            <div className="text-center mb-4 sm:mb-8 relative">
              {/* Icon */}
              <div className="inline-flex items-center justify-center mb-3 sm:mb-5">
                <div
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center border-2 transition-colors duration-300 ${
                    emailSent
                      ? "bg-gradient-to-br from-green-400/20 to-emerald-400/20 border-green-400/30"
                      : isDark
                      ? "bg-gradient-to-br from-blue-400/20 to-purple-400/20 border-gray-600"
                      : "bg-gradient-to-br from-blue-50 to-purple-50 border-gray-200"
                  }`}
                >
                  {emailSent ? (
                    <CheckCircleIcon className="w-8 h-8 sm:w-10 sm:h-10 text-green-500" />
                  ) : (
                    <LockClosedIcon
                      className={`w-8 h-8 sm:w-10 sm:h-10 ${
                        isDark ? "text-gray-300" : "text-gray-500"
                      }`}
                    />
                  )}
                </div>
              </div>

              {/* Title */}
              <h1
                className={`text-xl sm:text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent ${
                  isDark
                    ? "from-white to-gray-300"
                    : "from-gray-800 to-gray-600"
                }`}
              >
                {emailSent
                  ? t("passwordReset.checkYourEmail") || "Check Your Email"
                  : t("passwordReset.resetPassword") || "Reset Password"}
              </h1>

              {/* Subtitle */}
              <p
                className={`mt-2 text-sm leading-relaxed px-2 ${
                  isDark ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {emailSent
                  ? t("passwordReset.successSubtitle") ||
                    "We've sent a password reset link to your email. Check your inbox and follow the instructions."
                  : t("passwordReset.subtitle") ||
                    "Enter your email address and we'll send you a link to reset your password."}
              </p>
            </div>

            {/* Form or Success State */}
            {!emailSent ? (
              <form
                onSubmit={handleSendResetEmail}
                className="space-y-4 sm:space-y-6 relative"
              >
                {/* Email Field */}
                <div className="space-y-1">
                  <label
                    className={`block text-xs sm:text-sm font-semibold ${
                      isDark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {t("passwordReset.emailLabel") || "Email"}
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
                      className={`w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-4 rounded-xl sm:rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 text-sm font-medium ${
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
                      placeholder={
                        t("passwordReset.emailPlaceholder") ||
                        "Enter your email"
                      }
                      autoFocus
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-2.5 sm:py-4 px-6 rounded-xl sm:rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 shadow-lg hover:shadow-xl disabled:shadow-md flex items-center justify-center"
                >
                  {isLoading ? (
                    <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span>
                      {t("passwordReset.sendResetLink") || "Send Reset Link"}
                    </span>
                  )}
                </button>
              </form>
            ) : (
              /* Success State */
              <div
                className={`rounded-2xl border-2 p-5 sm:p-6 space-y-5 relative ${
                  isDark
                    ? "bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-green-700/30"
                    : "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200"
                }`}
              >
                {/* Success Icon */}
                <div className="flex justify-center">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center ${
                      isDark ? "bg-green-900/40" : "bg-green-100"
                    }`}
                  >
                    <CheckCircleIcon className="w-8 h-8 text-green-500" />
                  </div>
                </div>

                {/* Email sent to */}
                <div className="text-center">
                  <p
                    className={`text-xs mb-1.5 ${
                      isDark ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    {t("passwordReset.emailSentTo") || "Email sent to:"}
                  </p>
                  <span
                    className={`inline-block px-4 py-1.5 rounded-full text-sm font-semibold ${
                      isDark
                        ? "bg-gray-700 text-gray-200"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {email.trim()}
                  </span>
                </div>

                {/* Resend Button */}
                <button
                  type="button"
                  onClick={handleResendEmail}
                  disabled={resendCountdown > 0 || isResending}
                  className={`w-full border-2 font-semibold py-2.5 sm:py-3 px-6 rounded-xl sm:rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 flex items-center justify-center space-x-2 ${
                    isDark
                      ? "bg-gray-700/50 border-gray-600 hover:border-gray-500 text-gray-200 disabled:bg-gray-800/50 disabled:border-gray-700 disabled:text-gray-500"
                      : "bg-white border-gray-200 hover:border-gray-300 text-gray-700 disabled:bg-gray-50 disabled:text-gray-400"
                  } disabled:cursor-not-allowed`}
                >
                  {isResending ? (
                    <>
                      <div
                        className={`w-4 h-4 border-2 rounded-full animate-spin ${
                          isDark
                            ? "border-gray-500 border-t-gray-200"
                            : "border-gray-300 border-t-gray-600"
                        }`}
                      />
                      <span>
                        {t("passwordReset.sending") || "Sending..."}
                      </span>
                    </>
                  ) : resendCountdown > 0 ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4" />
                      <span>
                        {t("passwordReset.resend") || "Resend"} (
                        {resendCountdown}s)
                      </span>
                    </>
                  ) : (
                    <>
                      <ArrowPathIcon className="w-4 h-4" />
                      <span>
                        {t("passwordReset.resendEmail") || "Resend Email"}
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Info Box */}
            <div
              className={`mt-4 sm:mt-6 flex items-start space-x-3 rounded-xl sm:rounded-2xl border p-3 sm:p-4 ${
                isDark
                  ? "bg-gradient-to-r from-amber-900/20 to-orange-900/20 border-amber-700/30"
                  : "bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200"
              }`}
            >
              <InformationCircleIcon
                className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                  isDark ? "text-amber-400" : "text-amber-600"
                }`}
              />
              <p
                className={`text-xs sm:text-sm leading-relaxed ${
                  isDark ? "text-amber-300" : "text-amber-800"
                }`}
              >
                {t("passwordReset.checkSpamFolder") ||
                  "Can't find the email? Check your spam folder."}
              </p>
            </div>

            {/* Back to Login Link */}
            <div className="mt-4 sm:mt-6 text-center">
              <p
                className={`text-sm ${
                  isDark ? "text-gray-400" : "text-gray-500"
                }`}
              >
                {t("passwordReset.rememberPassword") ||
                  "Remember your password?"}{" "}
                <button
                  onClick={() => router.push("/")}
                  className={`font-semibold transition-colors duration-200 ${
                    isDark
                      ? "text-blue-400 hover:text-blue-300"
                      : "text-blue-600 hover:text-blue-700"
                  }`}
                >
                  {t("passwordReset.signIn") || "Sign In"}
                </button>
              </p>
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

function PasswordResetLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

export default function PasswordResetPage() {
  return (
    <Suspense fallback={<PasswordResetLoading />}>
      <PasswordResetContent />
    </Suspense>
  );
}