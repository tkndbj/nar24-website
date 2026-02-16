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
  const [isDark, setIsDark] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const languageMenuRef = useRef<HTMLDivElement>(null);
  const RESEND_COOLDOWN_SECONDS = 60;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTheme = localStorage.getItem("theme");
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
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
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target as Node)) {
        setShowLanguageMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const switchLanguage = (newLocale: string, event?: React.MouseEvent) => {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    let pathWithoutLocale = pathname;
    if (pathname.startsWith(`/${locale}`)) {
      pathWithoutLocale = pathname.substring(`/${locale}`.length) || "/";
    }
    router.push(`/${newLocale}${pathWithoutLocale}`);
    setShowLanguageMenu(false);
  };

  const validateEmail = (value: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  };

  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error(t("passwordReset.emailRequired") || "Please enter your email address");
      return;
    }
    if (!validateEmail(email)) {
      toast.error(t("passwordReset.emailInvalid") || "Please enter a valid email address");
      return;
    }
    setIsLoading(true);
    try {
      const sendResetEmail = httpsCallable(functions, "sendPasswordResetEmail");
      await sendResetEmail({ email: email.trim().toLowerCase() });
      setEmailSent(true);
      setResendCountdown(RESEND_COOLDOWN_SECONDS);
      toast.success(t("passwordReset.emailSentSuccess") || "Password reset email sent!", {
        icon: "✉️",
        style: { borderRadius: "10px", background: "#10B981", color: "#fff" },
      });
    } catch (err: unknown) {
      let errorMessage = t("passwordReset.errorGeneral") || "An error occurred. Please try again.";
      if (err && typeof err === "object" && "code" in err) {
        const firebaseError = err as FirebaseError;
        if (firebaseError.code === "functions/invalid-argument") {
          errorMessage = t("passwordReset.emailInvalid") || "Please enter a valid email address";
        }
      }
      toast.error(errorMessage, { style: { borderRadius: "10px", background: "#EF4444", color: "#fff" } });
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
      toast.success(t("passwordReset.emailResentSuccess") || "Password reset email sent again!", {
        icon: "✉️",
        style: { borderRadius: "10px", background: "#10B981", color: "#fff" },
      });
    } catch {
      toast.error(t("passwordReset.resendFailed") || "Failed to resend email. Please try again.", {
        style: { borderRadius: "10px", background: "#EF4444", color: "#fff" },
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-200 ${isDark ? "bg-gray-950" : "bg-gray-50/50"}`}>
      <div className="w-full max-w-md">
        {/* Top Row */}
        <div className="flex justify-between items-center mb-3">
          <button
            onClick={() => router.push("/login")}
            className={`p-2 rounded-lg transition-colors border ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700" : "bg-white hover:bg-gray-100 text-gray-500 border-gray-200"}`}
            aria-label={t("passwordReset.backToLogin") || "Back to login"}
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </button>

          <div className="relative" ref={languageMenuRef}>
            <button
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              className={`p-2 rounded-lg transition-colors border ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-400 border-gray-700" : "bg-white hover:bg-gray-100 text-gray-500 border-gray-200"}`}
              aria-label={t("header.languageSelection")}
            >
              <GlobeAltIcon className="w-4 h-4" />
            </button>
            {showLanguageMenu && (
              <div className={`absolute right-0 top-full mt-1 w-32 rounded-xl shadow-lg border overflow-hidden z-50 ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                <button
                  onClick={() => switchLanguage("tr")}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2.5 text-left transition-colors text-sm ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-50"} ${locale === "tr" ? (isDark ? "bg-orange-900/30 text-orange-400" : "bg-orange-50 text-orange-600") : (isDark ? "text-gray-200" : "text-gray-900")}`}
                >
                  <span>🇹🇷</span>
                  <span className="font-medium">{t("header.turkish")}</span>
                </button>
                <button
                  onClick={() => switchLanguage("en")}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2.5 text-left transition-colors text-sm ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-50"} ${locale === "en" ? (isDark ? "bg-orange-900/30 text-orange-400" : "bg-orange-50 text-orange-600") : (isDark ? "text-gray-200" : "text-gray-900")}`}
                >
                  <span>🇺🇸</span>
                  <span className="font-medium">{t("header.english")}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main Card */}
        <div className={`rounded-2xl border shadow-sm py-6 px-5 sm:py-8 sm:px-8 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
          {/* Header */}
          <div className="flex flex-col items-center mb-6 sm:mb-8">
            <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mb-4 border ${
              emailSent
                ? (isDark ? "bg-emerald-900/30 border-emerald-700/50" : "bg-emerald-50 border-emerald-200")
                : (isDark ? "bg-gray-800 border-gray-700" : "bg-gray-100 border-gray-200")
            }`}>
              {emailSent ? (
                <CheckCircleIcon className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-500" />
              ) : (
                <LockClosedIcon className={`w-6 h-6 sm:w-7 sm:h-7 ${isDark ? "text-gray-400" : "text-gray-500"}`} />
              )}
            </div>
            <h1 className={`text-lg sm:text-xl font-bold mb-1.5 text-center ${isDark ? "text-white" : "text-gray-900"}`}>
              {emailSent
                ? t("passwordReset.checkYourEmail") || "Check Your Email"
                : t("passwordReset.resetPassword") || "Reset Password"}
            </h1>
            <p className={`text-xs sm:text-sm text-center leading-relaxed px-2 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
              {emailSent
                ? t("passwordReset.successSubtitle") || "We've sent a password reset link to your email. Check your inbox and follow the instructions."
                : t("passwordReset.subtitle") || "Enter your email address and we'll send you a link to reset your password."}
            </p>
          </div>

          {/* Form or Success */}
          {!emailSent ? (
            <form onSubmit={handleSendResetEmail} className="space-y-4">
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {t("passwordReset.emailLabel") || "Email"}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <EnvelopeIcon className={`h-4 w-4 sm:h-5 sm:w-5 ${isDark ? "text-gray-600" : "text-gray-400"}`} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600" : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"}`}
                    placeholder={t("passwordReset.emailPlaceholder") || "Enter your email"}
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 sm:py-3 px-4 bg-orange-500 text-white rounded-xl text-[13px] font-semibold hover:bg-orange-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  t("passwordReset.sendResetLink") || "Send Reset Link"
                )}
              </button>
            </form>
          ) : (
            <div className={`rounded-xl border p-5 space-y-4 ${isDark ? "bg-emerald-900/15 border-emerald-800/40" : "bg-emerald-50/50 border-emerald-200"}`}>
              <div className="flex justify-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDark ? "bg-emerald-900/40" : "bg-emerald-100"}`}>
                  <CheckCircleIcon className="w-7 h-7 text-emerald-500" />
                </div>
              </div>

              <div className="text-center">
                <p className={`text-xs mb-1.5 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                  {t("passwordReset.emailSentTo") || "Email sent to:"}
                </p>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${isDark ? "bg-gray-800 text-gray-200" : "bg-gray-100 text-gray-800"}`}>
                  {email.trim()}
                </span>
              </div>

              <button
                type="button"
                onClick={handleResendEmail}
                disabled={resendCountdown > 0 || isResending}
                className={`w-full py-2.5 px-4 border rounded-xl text-[13px] font-medium transition-colors flex items-center justify-center space-x-2 disabled:cursor-not-allowed ${
                  isDark
                    ? "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750 disabled:text-gray-600"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 disabled:bg-gray-50 disabled:text-gray-400"
                }`}
              >
                {isResending ? (
                  <>
                    <div className={`w-3.5 h-3.5 border-[2px] rounded-full animate-spin ${isDark ? "border-gray-600 border-t-gray-300" : "border-gray-300 border-t-gray-600"}`} />
                    <span>{t("passwordReset.sending") || "Sending..."}</span>
                  </>
                ) : resendCountdown > 0 ? (
                  <>
                    <ArrowPathIcon className="w-3.5 h-3.5" />
                    <span>{t("passwordReset.resend") || "Resend"} ({resendCountdown}s)</span>
                  </>
                ) : (
                  <>
                    <ArrowPathIcon className="w-3.5 h-3.5" />
                    <span>{t("passwordReset.resendEmail") || "Resend Email"}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Info Box */}
          <div className={`mt-4 sm:mt-5 flex items-start space-x-2.5 rounded-xl border p-3 ${isDark ? "bg-amber-900/15 border-amber-800/40" : "bg-amber-50 border-amber-200"}`}>
            <InformationCircleIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isDark ? "text-amber-500" : "text-amber-600"}`} />
            <p className={`text-xs leading-relaxed ${isDark ? "text-amber-400" : "text-amber-800"}`}>
              {t("passwordReset.checkSpamFolder") || "Can't find the email? Check your spam folder."}
            </p>
          </div>

          {/* Back to Login */}
          <div className="mt-4 sm:mt-5 text-center">
            <p className={`text-[13px] ${isDark ? "text-gray-500" : "text-gray-500"}`}>
              {t("passwordReset.rememberPassword") || "Remember your password?"}{" "}
              <button
                onClick={() => router.push("/login")}
                className={`font-semibold transition-colors ${isDark ? "text-orange-400 hover:text-orange-300" : "text-orange-600 hover:text-orange-700"}`}
              >
                {t("passwordReset.signIn") || "Sign In"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordResetLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <div className="w-6 h-6 border-[2px] border-orange-200 border-t-orange-500 rounded-full animate-spin" />
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