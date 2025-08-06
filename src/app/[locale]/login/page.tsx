"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendEmailVerification,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  EyeIcon,
  EyeSlashIcon,
  EnvelopeIcon,
  LockClosedIcon,
  UserIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import { AuthError } from "firebase/auth";
import { useTranslations, useLocale } from "next-intl";

// Create a separate component for the login content that uses useSearchParams
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations();

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

  // Email validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  // Handle email/password login
  const handleLoginWithPassword = async (e: React.FormEvent) => {
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

    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const user = userCredential.user;

      if (user && !user.emailVerified) {
        await auth.signOut();
        setShowVerificationMessage(true);
        toast.error(t("LoginPage.emailNotVerified"));
        return;
      }

      if (user) {
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
    } catch (error: unknown) {
      let message = t("LoginPage.loginError");

      switch ((error as AuthError).code) {
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

  // Handle Google sign-in
  const handleGoogleSignIn = async () => {
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
      });

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (user) {
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
    } catch (error: unknown) {
      let message = t("LoginPage.googleLoginError");

      switch ((error as AuthError).code) {
        case "auth/network-request-failed":
          message = t("LoginPage.networkError");
          break;
        case "auth/account-exists-with-different-credential":
          message = t("LoginPage.accountExistsWithDifferentCredential");
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

  // Resend verification email
  const resendVerificationEmail = async () => {
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
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const user = userCredential.user;

      if (user && !user.emailVerified) {
        await sendEmailVerification(user);
        toast.success(t("LoginPage.verificationEmailSent"));
        setResendCooldown(30); // 30 seconds cooldown
      }

      await auth.signOut();
    } catch (error: unknown) {
      let message = t("LoginPage.verificationEmailError");

      switch ((error as AuthError).code) {
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
      }

      toast.error(message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className={`min-h-screen transition-all duration-300 ${
      isDark 
        ? "bg-gray-900" 
        : "bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50"
    }`}>
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-4 -left-4 w-72 h-72 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob ${
          isDark 
            ? "bg-gradient-to-r from-blue-600 to-purple-600" 
            : "bg-gradient-to-r from-blue-300 to-purple-300"
        }`}></div>
        <div className={`absolute -top-4 -right-4 w-72 h-72 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000 ${
          isDark 
            ? "bg-gradient-to-r from-yellow-600 to-pink-600" 
            : "bg-gradient-to-r from-yellow-300 to-pink-300"
        }`}></div>
        <div className={`absolute -bottom-8 left-20 w-72 h-72 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000 ${
          isDark 
            ? "bg-gradient-to-r from-pink-600 to-indigo-600" 
            : "bg-gradient-to-r from-pink-300 to-indigo-300"
        }`}></div>
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
                aria-label={t('header.languageSelection')}
              >
                <GlobeAltIcon className={`w-5 h-5 transition-colors ${
                  isDark 
                    ? "text-gray-300 group-hover:text-white" 
                    : "text-gray-600 group-hover:text-gray-800"
                }`} />
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
                      {t('header.turkish')}
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
                      {t('header.english')}
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main Card */}
          <div className={`backdrop-blur-xl rounded-3xl shadow-2xl border p-8 relative overflow-hidden ${
            isDark
              ? "bg-gray-800/80 border-gray-700/20"
              : "bg-white/80 border-white/20"
          }`}>
            {/* Card Background Pattern */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-400/10 to-transparent rounded-full"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-400/10 to-transparent rounded-full"></div>

            {/* Logo Section */}
            <div className="text-center mb-8 relative">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg mb-4 relative">
                <UserIcon className="w-10 h-10 text-white" />
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 animate-ping opacity-20"></div>
              </div>
              <h1 className={`text-3xl font-bold bg-gradient-to-r bg-clip-text text-transparent mb-2 ${
                isDark
                  ? "from-white to-gray-300"
                  : "from-gray-800 to-gray-600"
              }`}>
                {t("LoginPage.welcome")}
              </h1>
              <p className={`font-medium ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}>
                {t("LoginPage.signInToContinue")}
              </p>
            </div>

            {/* Verification Success Message (for new registrations) */}
            {showVerificationMessage && (
              <div className={`mb-6 p-4 rounded-2xl border ${
                isDark
                  ? "bg-gradient-to-r from-green-900/20 to-emerald-900/20 border-green-700/30"
                  : "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200"
              }`}>
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <CheckCircleIcon className={`w-6 h-6 mt-0.5 ${
                      isDark ? "text-green-400" : "text-green-600"
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-sm font-semibold mb-2 ${
                      isDark ? "text-green-200" : "text-green-800"
                    }`}>
                      {t("LoginPage.accountCreatedSuccessfully")}
                    </h3>
                    <p className={`text-sm mb-3 ${
                      isDark ? "text-green-300" : "text-green-700"
                    }`}>
                      {t("LoginPage.verificationEmailSentMessage")}
                    </p>
                    <button
                      onClick={resendVerificationEmail}
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
                <label className={`block text-sm font-semibold mb-2 ${
                  isDark ? "text-gray-300" : "text-gray-700"
                }`}>
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
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label className={`block text-sm font-semibold mb-2 ${
                  isDark ? "text-gray-300" : "text-gray-700"
                }`}>
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

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl disabled:scale-100 disabled:shadow-md flex items-center justify-center group"
              >
                {isLoading ? (
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span className="mr-2">{t("LoginPage.signIn")}</span>
                    <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className={`w-full border-t ${
                    isDark ? "border-gray-600" : "border-gray-200"
                  }`}></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className={`px-4 font-medium ${
                    isDark
                      ? "bg-gray-800 text-gray-400"
                      : "bg-white text-gray-500"
                  }`}>
                    {t("LoginPage.or")}
                  </span>
                </div>
              </div>

              {/* Google Sign-in Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
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
                <span>{t("LoginPage.signInWithGoogle")}</span>
              </button>
            </form>

            {/* Bottom Links */}
            <div className="mt-8 space-y-4 text-center">
              <button
                onClick={() => router.push("/registration")}
                className={`block w-full font-semibold text-sm transition-colors duration-200 py-2 ${
                  isDark
                    ? "text-blue-400 hover:text-blue-300"
                    : "text-blue-600 hover:text-blue-700"
                }`}
              >
                {t("LoginPage.noAccount")}{" "}
                <span className="underline">{t("LoginPage.register")}</span>
              </button>

              <button
                onClick={() => router.push("/forgot-password")}
                className={`block w-full font-medium text-sm transition-colors duration-200 py-2 ${
                  isDark
                    ? "text-gray-400 hover:text-gray-200"
                    : "text-gray-600 hover:text-gray-800"
                }`}
              >
                {t("LoginPage.forgotPassword")}
              </button>

              <button
                onClick={() => router.push("/")}
                className={`block w-full font-medium text-sm transition-colors duration-200 py-2 ${
                  isDark
                    ? "text-gray-500 hover:text-gray-300"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t("LoginPage.continueAsGuest")}
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