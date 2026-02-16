"use client";

import React, {
  useState,
  useEffect,
  useRef,
  Suspense,
  useCallback,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
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
  CheckCircleIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useTranslations, useLocale } from "next-intl";
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

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations();
  const twoFactorService = TwoFactorService.getInstance();

  const { isPending2FA, cancel2FA, setNameComplete } = useUser();

  const [resetMessage] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isDark, setIsDark] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [twoFAPending, setTwoFAPending] = useState(false);

  const languageMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTwoFAPending(isPending2FA);
  }, [isPending2FA]);

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

  useEffect(() => {
    const emailParam = searchParams.get("email");
    const passwordParam = searchParams.get("password");
    const showVerification = searchParams.get("showVerification") === "true";
    if (emailParam) setEmail(emailParam);
    if (passwordParam) setPassword(passwordParam);
    setShowVerificationMessage(showVerification);
  }, [searchParams]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleForgotPassword = () => {
    router.push("/password-reset");
  };

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
            router.push(`/email-verification`);
            return;
          }
        }
        if (user) {
          const loginComplete = await checkAndHandle2FA();
          if (loginComplete) {
            toast.success(t("LoginPage.loginSuccess"), {
              icon: "🎉",
              style: { borderRadius: "10px", background: "#10B981", color: "#fff" },
            });
            router.push("/");
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
            case "auth/user-not-found": message = t("LoginPage.userNotFound"); break;
            case "auth/wrong-password": message = t("LoginPage.wrongPassword"); break;
            case "auth/invalid-email": message = t("LoginPage.invalidEmail"); break;
            case "auth/network-request-failed": message = t("LoginPage.networkError"); break;
            case "auth/too-many-requests": message = t("LoginPage.tooManyRequests"); break;
            case "auth/invalid-credential": message = t("LoginPage.invalidCredentials"); break;
          }
        }
        toast.error(message, {
          style: { borderRadius: "10px", background: "#EF4444", color: "#fff" },
        });
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, t, twoFactorService, router, checkAndHandle2FA]
  );

  const handleGoogleSignIn = useCallback(async () => {
    twoFactorService.reset();
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await withTimeout(signInWithPopup(auth, provider), AUTH_TIMEOUT_MS, "AUTH_TIMEOUT");
      const user = result.user;
      if (user) {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
          toast.success(t("LoginPage.googleLoginSuccess"), { icon: "🚀", style: { borderRadius: "10px", background: "#10B981", color: "#fff" } });
          router.push("/complete-profile");
          return;
        }
        const userData = userDoc.data();
        const isProfileIncomplete = !userData.gender || !userData.birthDate || !userData.languageCode;
        if (isProfileIncomplete) {
          toast.success(t("LoginPage.googleLoginSuccess"), { icon: "🚀", style: { borderRadius: "10px", background: "#10B981", color: "#fff" } });
          router.push("/complete-profile");
          return;
        }
        const loginComplete = await checkAndHandle2FA();
        if (loginComplete) {
          toast.success(t("LoginPage.googleLoginSuccess"), { icon: "🚀", style: { borderRadius: "10px", background: "#10B981", color: "#fff" } });
          router.push("/");
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "";
      const authError = error as AuthError;
      if (errorMessage === "AUTH_TIMEOUT") {
        toast.error(t("LoginPage.authTimeout"), { style: { borderRadius: "10px", background: "#EF4444", color: "#fff" } });
      } else if (authError.code === "auth/popup-closed-by-user" || authError.code === "auth/cancelled-popup-request") {
        // User cancelled
      } else if (authError.code === "auth/popup-blocked") {
        toast.error(t("LoginPage.popupBlocked"), { style: { borderRadius: "10px", background: "#EF4444", color: "#fff" } });
      } else if (authError.code === "auth/network-request-failed") {
        toast.error(t("LoginPage.networkError"), { style: { borderRadius: "10px", background: "#EF4444", color: "#fff" } });
      } else if (authError.code === "auth/account-exists-with-different-credential") {
        toast.error(t("LoginPage.accountExistsWithDifferentCredential"), { style: { borderRadius: "10px", background: "#EF4444", color: "#fff" } });
      } else {
        toast.error(t("LoginPage.googleLoginError"), { style: { borderRadius: "10px", background: "#EF4444", color: "#fff" } });
      }
    } finally {
      setIsLoading(false);
    }
  }, [t, twoFactorService, router, checkAndHandle2FA]);

  const handleAppleSignIn = useCallback(async () => {
    twoFactorService.reset();
    setIsLoading(true);
    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
      const result = await withTimeout(signInWithPopup(auth, provider), AUTH_TIMEOUT_MS, "AUTH_TIMEOUT");
      const user = result.user;
      const additionalInfo = getAdditionalUserInfo(result);
      const isNewUser = additionalInfo?.isNewUser ?? false;
      if (user) {
        let displayName: string | null = null;
        const userEmail = user.email || "";
        const profile = additionalInfo?.profile as { name?: { firstName?: string; lastName?: string } } | undefined;
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
        const hasValidName = displayName !== null && displayName !== "" && displayName !== "User" && displayName !== "No Name" && displayName !== emailPrefix && !displayName.includes("@");
        let needsName = !hasValidName;
        let needsCompletion = true;
        if (isNewUser || !userDoc.exists()) {
          let languageCode = "tr";
          if (typeof window !== "undefined") {
            languageCode = localStorage.getItem("locale") || "tr";
          }
          await setDoc(userDocRef, { displayName: hasValidName ? displayName : null, email: userEmail, isNew: true, createdAt: serverTimestamp(), emailVerifiedAt: user.emailVerified ? serverTimestamp() : null, languageCode }, { merge: true });
          needsName = !hasValidName;
          needsCompletion = true;
        } else {
          const userData = userDoc.data();
          if (displayName && hasValidName) {
            const existingName = userData.displayName;
            if (!existingName || existingName === "User" || existingName === "No Name" || existingName === emailPrefix) {
              await setDoc(userDocRef, { displayName }, { merge: true });
            }
          }
          const existingDisplayName = userData.displayName as string | undefined;
          const existingEmailPrefix = (userData.email || userEmail).split("@")[0];
          needsName = !existingDisplayName || existingDisplayName === "" || existingDisplayName === "User" || existingDisplayName === "No Name" || existingDisplayName === existingEmailPrefix;
          needsCompletion = !userData.gender || !userData.birthDate || !userData.languageCode;
        }
        if (needsName) { setNameComplete(false); } else { setNameComplete(true); }
        const needs2FA = await twoFactorService.is2FAEnabled();
        if (needs2FA) {
          setTwoFAPending(true);
          router.push(`/two-factor-verification?type=login`);
          return;
        }
        toast.success(t("LoginPage.appleLoginSuccess") || t("LoginPage.googleLoginSuccess"), { icon: "🍎", style: { borderRadius: "10px", background: "#10B981", color: "#fff" } });
        if (needsName) { router.push("/complete-name"); } else if (needsCompletion) { router.push("/complete-profile"); } else { router.push("/"); }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "";
      const authError = error as AuthError;
      if (errorMessage === "AUTH_TIMEOUT") {
        toast.error(t("LoginPage.authTimeout"), { style: { borderRadius: "10px", background: "#EF4444", color: "#fff" } });
      } else if (authError.code === "auth/popup-closed-by-user" || authError.code === "auth/cancelled-popup-request") {
        // cancelled
      } else if (authError.code === "auth/popup-blocked") {
        toast.error(t("LoginPage.popupBlocked"), { style: { borderRadius: "10px", background: "#EF4444", color: "#fff" } });
      } else if (authError.code === "auth/network-request-failed") {
        toast.error(t("LoginPage.networkError"), { style: { borderRadius: "10px", background: "#EF4444", color: "#fff" } });
      } else if (authError.code === "auth/account-exists-with-different-credential") {
        toast.error(t("LoginPage.accountExistsWithDifferentCredential"), { style: { borderRadius: "10px", background: "#EF4444", color: "#fff" } });
      } else {
        toast.error(t("LoginPage.appleLoginError") || t("LoginPage.googleLoginError"), { style: { borderRadius: "10px", background: "#EF4444", color: "#fff" } });
      }
    } finally {
      setIsLoading(false);
    }
  }, [t, twoFactorService, router, setNameComplete]);

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
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;
      if (user && !user.emailVerified) {
        const functions = getFunctions(undefined, "europe-west3");
        const resendEmailVerificationCode = httpsCallable(functions, "resendEmailVerificationCode");
        await resendEmailVerificationCode();
        toast.success(t("LoginPage.verificationCodeSent") || "Verification code sent!");
        setResendCooldown(30);
      }
      await auth.signOut();
    } catch (error: unknown) {
      let message = t("LoginPage.verificationEmailError");
      if (error && typeof error === "object" && "code" in error) {
        const authError = error as AuthError;
        switch (authError.code) {
          case "auth/user-not-found": message = t("LoginPage.userNotFound"); break;
          case "auth/wrong-password": message = t("LoginPage.wrongPassword"); break;
          case "auth/invalid-email": message = t("LoginPage.invalidEmail"); break;
          case "auth/too-many-requests": message = t("LoginPage.tooManyRequests"); break;
          case "functions/resource-exhausted": message = t("LoginPage.tooManyRequests"); break;
          case "functions/failed-precondition": message = "Email already verified"; break;
          default: message = authError.message || t("LoginPage.verificationEmailError");
        }
      }
      toast.error(message);
    } finally {
      setIsResending(false);
    }
  };

  const handleContinueAsGuest = async () => {
    if (isPending2FA || twoFAPending) {
      try {
        await cancel2FA();
        setTwoFAPending(false);
        setEmail("");
        setPassword("");
        twoFactorService.reset();
        toast.success(t("LoginPage.signedOutSuccessfully") || "Signed out successfully", { icon: "👋", style: { borderRadius: "10px", background: "#6B7280", color: "#fff" } });
        setTimeout(() => { router.push("/"); }, 500);
        return;
      } catch (error) {
        console.error("Error during 2FA cancellation:", error);
        try {
          await auth.signOut();
          const stillLoggedIn = auth.currentUser;
          if (stillLoggedIn) {
            if (typeof window !== "undefined") { sessionStorage.clear(); localStorage.removeItem("firebase:authUser"); }
          }
          setTwoFAPending(false);
          twoFactorService.reset();
          window.location.href = "/";
        } catch (fallbackError) {
          console.error("Fallback sign out failed:", fallbackError);
          if (typeof window !== "undefined") {
            sessionStorage.clear();
            try {
              for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && (key.includes("firebase") || key.includes("firebaseui"))) { localStorage.removeItem(key); }
              }
            } catch (e) { console.error("Error clearing localStorage:", e); }
          }
          window.location.href = "/";
        }
      }
    } else {
      router.push("/");
    }
  };

  const isDisabled = isLoading || isPending2FA || twoFAPending;

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-colors duration-200 ${isDark ? "bg-gray-950" : "bg-gray-50/50"}`}>
      <div className="w-full max-w-md">
        {/* Language Selector */}
        <div className="flex justify-end mb-3">
          <div className="relative" ref={languageMenuRef}>
            <button
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              className={`p-2 rounded-lg transition-colors ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-400" : "bg-white hover:bg-gray-100 text-gray-500"} border ${isDark ? "border-gray-700" : "border-gray-200"}`}
              aria-label={t("header.languageSelection")}
            >
              <GlobeAltIcon className="w-4 h-4" />
            </button>
            {showLanguageMenu && (
              <div className={`absolute right-0 top-full mt-1 w-32 rounded-xl shadow-lg border overflow-hidden z-50 ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                <button
                  onClick={() => switchLanguage("tr")}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2.5 text-left transition-colors text-sm ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-50"} ${locale === "tr" ? (isDark ? "bg-indigo-900/30 text-indigo-400" : "bg-indigo-50 text-indigo-600") : (isDark ? "text-gray-200" : "text-gray-900")}`}
                >
                  <span>🇹🇷</span>
                  <span className="font-medium">{t("header.turkish")}</span>
                </button>
                <button
                  onClick={() => switchLanguage("en")}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2.5 text-left transition-colors text-sm ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-50"} ${locale === "en" ? (isDark ? "bg-indigo-900/30 text-indigo-400" : "bg-indigo-50 text-indigo-600") : (isDark ? "text-gray-200" : "text-gray-900")}`}
                >
                  <span>🇺🇸</span>
                  <span className="font-medium">{t("header.english")}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Main Card */}
        <div className={`rounded-2xl border shadow-sm pt-1 pb-5 px-5 sm:pb-8 sm:px-8 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"}`}>
          {/* Logo */}
          <div className="flex flex-col items-center mb-2 sm:mb-4 pt-2 sm:pt-4">
  <img
    src={isDark ? "/images/beyazlogo.png" : "/images/siyahlogo.png"}
    alt="Logo"
    className="w-[60px] h-[60px] sm:w-[80px] sm:h-[80px] object-contain"
  />
  <h1 className={`text-xl sm:text-2xl font-bold mt-2 ${isDark ? "text-white" : "text-gray-900"}`}>
    {t("LoginPage.welcome")}
  </h1>
</div>

          {/* 2FA Pending */}
          {(isPending2FA || twoFAPending) && (
            <div className={`mb-4 p-3 rounded-xl border flex items-center space-x-2.5 ${isDark ? "bg-orange-900/20 border-orange-800/40" : "bg-orange-50 border-orange-200"}`}>
              <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className={`text-xs ${isDark ? "text-orange-300" : "text-orange-700"}`}>
                {t("LoginPage.twoFactorPending") || "Two-factor authentication required. Complete verification or sign out."}
              </p>
            </div>
          )}

          {/* Verification Success Message */}
          {showVerificationMessage && (
            <div className={`mb-4 p-3 rounded-xl border ${isDark ? "bg-emerald-900/20 border-emerald-800/40" : "bg-emerald-50 border-emerald-200"}`}>
              <div className="flex items-start space-x-2.5">
                <CheckCircleIcon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                <div className="flex-1">
                  <h3 className={`text-sm font-semibold mb-1 ${isDark ? "text-emerald-200" : "text-emerald-800"}`}>
                    {t("LoginPage.accountCreatedSuccessfully")}
                  </h3>
                  <p className={`text-xs mb-2.5 ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                    {t("LoginPage.verificationEmailSentMessage")}
                  </p>
                  <button
                    onClick={resendVerificationCode}
                    disabled={isResending || resendCooldown > 0}
                    className="inline-flex items-center px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-semibold rounded-lg transition-colors disabled:cursor-not-allowed"
                  >
                    {isResending ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                    ) : (
                      <EnvelopeIcon className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {resendCooldown > 0 ? t("LoginPage.resendInSeconds", { seconds: resendCooldown }) : t("LoginPage.resendEmail")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLoginWithPassword} className="space-y-3 sm:space-y-4">
            {/* Email */}
            <div>
              <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                {t("LoginPage.email")}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <EnvelopeIcon className={`h-4 w-4 sm:h-5 sm:w-5 ${isDark ? "text-gray-600" : "text-gray-400"}`} />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 sm:py-3 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600" : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"}`}
                  placeholder={t("LoginPage.enterEmail")}
                  required
                  disabled={isDisabled}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                {t("LoginPage.password")}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LockClosedIcon className={`h-4 w-4 sm:h-5 sm:w-5 ${isDark ? "text-gray-600" : "text-gray-400"}`} />
                </div>
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-10 pr-10 py-2 sm:py-3 rounded-xl border text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-colors ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-600" : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"}`}
                  placeholder={t("LoginPage.enterPassword")}
                  required
                  minLength={6}
                  disabled={isDisabled}
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                  className={`absolute inset-y-0 right-0 pr-3 flex items-center ${isDark ? "text-gray-600 hover:text-gray-400" : "text-gray-400 hover:text-gray-600"}`}
                  disabled={isDisabled}
                >
                  {isPasswordVisible ? <EyeSlashIcon className="h-4 w-4 sm:h-5 sm:w-5" /> : <EyeIcon className="h-4 w-4 sm:h-5 sm:w-5" />}
                </button>
              </div>
            </div>

            {/* Forgot Password */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleForgotPassword}
                className={`text-xs font-medium transition-colors ${isDark ? "text-gray-500 hover:text-gray-300" : "text-gray-500 hover:text-gray-700"}`}
                disabled={isDisabled}
              >
                {t("LoginPage.forgotPassword") || "Forgot Password?"}
              </button>
            </div>

            {/* Reset Message */}
            {resetMessage && (
              <div className={`p-2.5 rounded-xl ${isDark ? "bg-emerald-900/20 border border-emerald-800" : "bg-emerald-50 border border-emerald-200"}`}>
                <p className={`text-[12px] text-center ${isDark ? "text-emerald-300" : "text-emerald-600"}`}>{resetMessage}</p>
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={isDisabled}
              className="w-full py-2.5 sm:py-3 px-4 bg-orange-500 text-white rounded-xl text-[13px] font-semibold hover:bg-orange-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {isDisabled ? (
                <div className="w-4 h-4 border-[2px] border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                t("LoginPage.signIn")
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-4 sm:my-5">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className={`w-full border-t ${isDark ? "border-gray-800" : "border-gray-200"}`} />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className={`px-3 ${isDark ? "bg-gray-900 text-gray-600" : "bg-white text-gray-400"}`}>
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
              className={`w-full py-2.5 sm:py-3 px-4 rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center space-x-2.5 disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? "bg-white text-black hover:bg-gray-100" : "bg-black text-white hover:bg-gray-900"}`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              <span>{t("LoginPage.signInWithApple") || "Continue with Apple"}</span>
            </button>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isDisabled}
              className={`w-full py-2.5 sm:py-3 px-4 border rounded-xl text-[13px] font-semibold transition-colors flex items-center justify-center space-x-2.5 disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? "bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-750" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"}`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span>{t("LoginPage.signInWithGoogle")}</span>
            </button>
          </div>

          {/* Bottom Links */}
          <div className="mt-4 sm:mt-6 space-y-2 text-center">
            <button
              onClick={() => router.push("/registration")}
              disabled={isPending2FA || twoFAPending}
              className={`text-[13px] font-medium transition-colors ${isDark ? "text-orange-400 hover:text-orange-300" : "text-orange-600 hover:text-orange-700"} ${(isPending2FA || twoFAPending) ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {t("LoginPage.noAccount")}{" "}
              <span className="underline">{t("LoginPage.register")}</span>
            </button>

            <button
              onClick={handleContinueAsGuest}
              className={`block w-full text-[12px] font-medium transition-colors py-1 ${
                (isPending2FA || twoFAPending)
                  ? (isDark ? "text-red-400 hover:text-red-300" : "text-red-500 hover:text-red-600")
                  : (isDark ? "text-gray-600 hover:text-gray-400" : "text-gray-400 hover:text-gray-600")
              }`}
            >
              {(isPending2FA || twoFAPending)
                ? t("LoginPage.signOutAndContinueAsGuest") || "Sign Out & Continue as Guest"
                : t("LoginPage.continueAsGuest")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
      <div className="w-6 h-6 border-[2px] border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginContent />
    </Suspense>
  );
}