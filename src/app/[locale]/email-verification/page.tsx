"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  GlobeAltIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import { AuthError } from "firebase/auth";
import { useTranslations, useLocale } from "next-intl";

// Create a separate component for the email verification content
function EmailVerificationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations();

  // State management
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  // Code input state
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

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

  // Initialize from sessionStorage (secure alternative to URL params)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const emailStored = sessionStorage.getItem('verification_email');
      const passwordStored = sessionStorage.getItem('verification_password');

      if (emailStored) setEmail(emailStored);
      if (passwordStored) setPassword(passwordStored);

      // Auto-send verification code when component loads
      if (emailStored && passwordStored) {
        setTimeout(() => {
          resendVerificationCode();
        }, 1000);
      }

      // Clear credentials from sessionStorage after reading (one-time use)
      sessionStorage.removeItem('verification_email');
      sessionStorage.removeItem('verification_password');
    }
  }, []);

  // Cooldown timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

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

  // Handle code input
  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) return; // Prevent multiple characters

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all fields are filled
    if (
      newCode.every((digit) => digit !== "") &&
      newCode.join("").length === 6
    ) {
      setTimeout(() => verifyEmailCode(newCode.join("")), 100);
    }
  };

  // Handle backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  // Clear code inputs
  const clearCode = () => {
    setCode(["", "", "", "", "", ""]);
    codeRefs.current[0]?.focus();
  };

  // Get entered code
  const getEnteredCode = () => code.join("");

  // Check if code is complete
  const isCodeComplete = () => getEnteredCode().length === 6;

  // Resend verification code
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
        setResendCooldown(30);
        clearCode();
      }

      // Sign out after sending code
      await signOut(auth);
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

  // Verify email code
  const verifyEmailCode = async (codeToVerify?: string) => {
    const verificationCode = codeToVerify || getEnteredCode();

    if (!verificationCode || verificationCode.length !== 6) {
      toast.error(
        t("LoginPage.invalidVerificationCode") ||
          "Please enter a valid 6-digit code"
      );
      return;
    }

    setIsVerifying(true);

    try {
      // First, sign in to get the user context
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const user = userCredential.user;

      if (user) {
        // Call the verify code function
        const functions = getFunctions(undefined, "europe-west3");
        const verifyEmailCodeFunction = httpsCallable(
          functions,
          "verifyEmailCode"
        );

        await verifyEmailCodeFunction({ code: verificationCode });

        // Reload user to get updated verification status
        await user.reload();
        const updatedUser = auth.currentUser;

        if (updatedUser?.emailVerified) {
          toast.success(
            t("LoginPage.emailVerified") || "Email verified successfully!",
            {
              icon: "🎉",
              style: {
                borderRadius: "10px",
                background: "#10B981",
                color: "#fff",
              },
            }
          );

          // Redirect to home or complete profile
          setTimeout(() => {
            router.push("/");
          }, 1500);
        }
      }
    } catch (error: unknown) {
      let message = t("LoginPage.verificationError") || "Verification failed";

      if (error && typeof error === "object" && "code" in error) {
        const authError = error as AuthError;
        switch (authError.code) {
          case "functions/invalid-argument":
            message =
              t("LoginPage.invalidVerificationCode") ||
              "Invalid verification code";
            break;
          case "functions/deadline-exceeded":
            message =
              t("LoginPage.verificationCodeExpired") ||
              "Verification code has expired";
            break;
          case "functions/failed-precondition":
            message =
              t("LoginPage.verificationCodeUsed") ||
              "Verification code has already been used";
            break;
          case "functions/not-found":
            message =
              t("LoginPage.noVerificationCode") || "No verification code found";
            break;
          default:
            message = authError.message || t("LoginPage.verificationError");
        }
      }

      toast.error(message);
      clearCode();
    } finally {
      setIsVerifying(false);
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
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => router.push("/login")}
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
            {/* Logo Section */}
            <div className="text-center mb-8 relative">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 shadow-lg mb-4 relative">
                <CheckCircleIcon className="w-10 h-10 text-white" />
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 animate-ping opacity-20"></div>
              </div>
              <h1
                className={`text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent mb-2 ${
                  isDark
                    ? "from-white to-gray-300"
                    : "from-gray-800 to-gray-600"
                }`}
              >
                {t("EmailVerification.title") || "Verify Your Email"}
              </h1>
              <p
                className={`font-medium ${
                  isDark ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {t("EmailVerification.subtitle") ||
                  "Enter the 6-digit code sent to your email"}
              </p>
            </div>

            {/* Email Display */}
            <div
              className={`mb-6 p-4 rounded-2xl border text-center ${
                isDark
                  ? "bg-gray-700/50 border-gray-600"
                  : "bg-gray-50 border-gray-200"
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  isDark ? "text-gray-300" : "text-gray-600"
                }`}
              >
                {t("EmailVerification.sentTo") || "Code sent to:"}
              </p>
              <p
                className={`text-lg font-semibold ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                {email}
              </p>
            </div>

            {/* Code Input */}
            <div className="mb-8">
              <div className="flex justify-center space-x-3 mb-6">
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      if (el) {
                        codeRefs.current[index] = el;
                      }
                    }}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className={`w-12 h-14 text-center text-xl font-bold rounded-xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 ${
                      digit
                        ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                        : `${
                            isDark
                              ? "border-gray-600 bg-gray-700/50 text-white focus:border-green-500 focus:ring-green-500/20"
                              : "border-gray-200 bg-white text-gray-900 focus:border-green-500 focus:ring-green-500/20"
                          }`
                    }`}
                    disabled={isVerifying}
                  />
                ))}
              </div>

              {/* Verify Button */}
              <button
                onClick={() => verifyEmailCode()}
                disabled={!isCodeComplete() || isVerifying}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 shadow-lg hover:shadow-xl disabled:shadow-md flex items-center justify-center group"
              >
                {isVerifying ? (
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span className="mr-2">
                      {t("EmailVerification.verify") || "Verify Email"}
                    </span>
                    <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                  </>
                )}
              </button>
            </div>

            {/* Resend Section */}
            <div className="text-center space-y-4">
              <p
                className={`text-sm ${
                  isDark ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {t("EmailVerification.didntReceive") ||
                  "Didn't receive the code?"}
              </p>
              <button
                onClick={resendVerificationCode}
                disabled={isResending || resendCooldown > 0}
                className={`font-semibold text-sm transition-colors duration-200 ${
                  resendCooldown > 0
                    ? `${
                        isDark ? "text-gray-500" : "text-gray-400"
                      } cursor-not-allowed`
                    : `${
                        isDark
                          ? "text-green-400 hover:text-green-300"
                          : "text-green-600 hover:text-green-700"
                      }`
                } ${isResending ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {isResending ? (
                  <div className="inline-flex items-center">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></div>
                    {t("EmailVerification.sending") || "Sending..."}
                  </div>
                ) : resendCooldown > 0 ? (
                  `${
                    t("EmailVerification.resendIn") || "Resend in"
                  } ${resendCooldown}s`
                ) : (
                  t("EmailVerification.resendCode") || "Resend Code"
                )}
              </button>
            </div>

            {/* Help Text */}
            <div
              className={`mt-6 p-4 rounded-2xl border ${
                isDark
                  ? "bg-blue-900/20 border-blue-700/30"
                  : "bg-blue-50 border-blue-200"
              }`}
            >
              <p
                className={`text-sm text-center ${
                  isDark ? "text-blue-200" : "text-blue-800"
                }`}
              >
                💡{" "}
                {t("EmailVerification.checkSpam") ||
                  "Check your spam folder if you don't see the email"}
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

// Loading component
function EmailVerificationLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

// Main page component
export default function EmailVerificationPage() {
  return (
    <Suspense fallback={<EmailVerificationLoading />}>
      <EmailVerificationContent />
    </Suspense>
  );
}
