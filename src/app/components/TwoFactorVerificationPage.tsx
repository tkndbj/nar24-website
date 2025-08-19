"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "react-hot-toast";
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
  ArrowLeftIcon,
  ClipboardDocumentIcon,
  LinkIcon,
  EnvelopeIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import TwoFactorService from "@/services/TwoFactorService";
import QRCode from "qrcode";
// 🔥 CRITICAL FIX: Import useUser to access complete2FA
import { useUser } from "@/context/UserProvider";

interface TwoFactorVerificationPageProps {
  type: "setup" | "login" | "disable";
}

export default function TwoFactorVerificationPage({
  type,
}: TwoFactorVerificationPageProps) {
  const router = useRouter();
  const t = useTranslations();
  const twoFactorService = TwoFactorService.getInstance();

  // 🔥 CRITICAL FIX: Get complete2FA method from UserProvider
  const { complete2FA } = useUser();

  // State management
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isDark, setIsDark] = useState(false);

  // TOTP setup content
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [secretBase32, setSecretBase32] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  // Refs for input fields
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Current method from service
  const currentMethod = twoFactorService.getCurrentMethod;

  // Theme detection
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

  // Initialize flow
  useEffect(() => {
    initFlow();
  }, [type]);

  // Timer effect
  useEffect(() => {
    if (secondsRemaining > 0) {
      timerRef.current = setTimeout(() => {
        setSecondsRemaining((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [secondsRemaining]);

  // Focus first field after loading
  useEffect(() => {
    if (!isLoading && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [isLoading]);

  const initFlow = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      let result;

      if (type === "setup") {
        result = await twoFactorService.start2FASetup();
        if (result.success && result.method === "totp") {
          setOtpauth(result.otpauth || null);
          setSecretBase32(result.secretBase32 || null);

          // Generate QR code
          if (result.otpauth) {
            try {
              const qrDataUrl = await QRCode.toDataURL(result.otpauth, {
                width: 200,
                margin: 2,
                color: {
                  dark: isDark ? "#FFFFFF" : "#000000",
                  light: isDark ? "#1F2937" : "#FFFFFF",
                },
              });
              setQrCodeDataUrl(qrDataUrl);
            } catch (qrError) {
              console.error("Error generating QR code:", qrError);
            }
          }
        } else if (result.success && result.method === "email") {
          startResendTimer();
        }
      } else if (type === "login") {
        result = await twoFactorService.start2FALogin();
      } else if (type === "disable") {
        result = await twoFactorService.start2FADisable();
        if (result.success && result.method === "email") {
          startResendTimer();
        }
      }

      if (!result?.success) {
        setErrorMessage(
          resolveMessage(result?.message || "twoFactorInitError")
        );
      }
    } catch (error) {
      console.error("Error initializing 2FA flow:", error);
      setErrorMessage(resolveMessage("twoFactorInitError"));
    } finally {
      setIsLoading(false);
    }
  };

  const startResendTimer = () => {
    setSecondsRemaining(30);
  };

  const resolveMessage = (key: string): string => {
    const messageMap: Record<string, string> = {
      emailCodeSent:
        t("TwoFactor.emailCodeSent") || "Verification code sent to your email",
      twoFactorInitError:
        t("TwoFactor.initError") || "Failed to initialize verification",
      pleasewait30seconds:
        t("TwoFactor.pleaseWait") ||
        "Please wait 30 seconds before requesting a new code",
      twoFactorEnabledSuccess:
        t("TwoFactor.enabledSuccess") ||
        "Two-factor authentication enabled successfully",
      twoFactorDisabledSuccess:
        t("TwoFactor.disabledSuccess") ||
        "Two-factor authentication disabled successfully",
      verificationSuccess:
        t("TwoFactor.verificationSuccess") || "Verification successful",
      codeNotFound:
        t("TwoFactor.codeNotFound") || "Verification code not found",
      codeExpired:
        t("TwoFactor.codeExpired") || "Verification code has expired",
      tooManyAttempts:
        t("TwoFactor.tooManyAttempts") ||
        "Too many attempts. Please try again later",
      enterAuthenticatorCode:
        t("TwoFactor.enterAuthenticatorCode") ||
        "Enter code from your authenticator app",
      enterAuthenticatorCodeToDisable:
        t("TwoFactor.enterAuthenticatorCodeToDisable") ||
        "Enter code to disable 2FA",
      resendNotApplicableForTotp:
        t("TwoFactor.resendNotApplicableForTotp") ||
        "Cannot resend code for authenticator app",
      invalidCodeFormat:
        t("TwoFactor.invalidCodeFormat") || "Please enter a valid 6-digit code",
      invalidCode: t("TwoFactor.invalidCode") || "Invalid verification code",
      twoFactorVerificationError:
        t("TwoFactor.verificationError") ||
        "Verification failed. Please try again.",
    };

    return messageMap[key] || key;
  };

  const handleCodeChange = (index: number, value: string) => {
    // Handle paste
    if (value.length > 1) {
      const cleanValue = value.replace(/[^0-9]/g, "");
      if (cleanValue.length >= 6) {
        const newCode = cleanValue.slice(0, 6).split("");
        setCode(newCode);
        setErrorMessage(null);
        // Focus last field
        inputRefs.current[5]?.focus();
        // Auto-verify after short delay
        setTimeout(() => verifyCode(newCode), 200);
        return;
      } else if (cleanValue.length > 0) {
        const newCode = [...code];
        newCode[index] = cleanValue[0];
        setCode(newCode);
        value = cleanValue[0];
      } else {
        const newCode = [...code];
        newCode[index] = "";
        setCode(newCode);
        return;
      }
    }

    // Normal single character input
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setErrorMessage(null);

    // Move to next field
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when last digit is entered
    if (index === 5 && value) {
      setTimeout(() => verifyCode(newCode), 100);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      // Move to previous field and clear it
      const newCode = [...code];
      newCode[index - 1] = "";
      setCode(newCode);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const verifyCode = async (codeArray?: string[]) => {
    const currentCode = codeArray || code;
    const codeString = currentCode.join("");

    if (codeString.length !== 6) {
      setErrorMessage(resolveMessage("invalidCodeFormat"));
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      let result;

      switch (type) {
        case "setup":
          result = await twoFactorService.verify2FASetup(codeString);
          break;
        case "login":
          result = await twoFactorService.verify2FALogin(codeString);
          break;
        case "disable":
          result = await twoFactorService.verify2FADisable(codeString);
          break;
        default:
          throw new Error("Invalid verification type");
      }

      if (result.success) {
        toast.success(resolveMessage(result.message || "verificationSuccess"), {
          icon: "✅",
          style: {
            borderRadius: "10px",
            background: "#10B981",
            color: "#fff",
          },
        });

        // 🔥 CRITICAL FIX: Complete 2FA verification for login
        if (type === "login") {
          // Notify UserProvider that 2FA is complete
          complete2FA();

          // Small delay to ensure state is updated
          setTimeout(() => {
            router.push("/");
          }, 100);
        } else {
          // For setup/disable, just go back
          router.back();
        }
      } else {
        const errorMsg =
          result.remaining !== undefined
            ? `${resolveMessage(result.message || "invalidCode")} (${
                result.remaining
              } attempts remaining)`
            : resolveMessage(result.message || "twoFactorVerificationError");

        setErrorMessage(errorMsg);
        clearCode();
      }
    } catch (error) {
      console.error("Error verifying code:", error);
      setErrorMessage(resolveMessage("twoFactorVerificationError"));
      clearCode();
    } finally {
      setIsLoading(false);
    }
  };

  const clearCode = () => {
    setCode(Array(6).fill(""));
    inputRefs.current[0]?.focus();
  };

  const resendCode = async () => {
    if (isResending || secondsRemaining > 0) return;

    setIsResending(true);
    setErrorMessage(null);

    try {
      const result = await twoFactorService.resendVerificationCode();

      if (result.success) {
        startResendTimer();
        toast.success(resolveMessage(result.message || "emailCodeSent"), {
          icon: "📧",
          style: {
            borderRadius: "10px",
            background: "#3B82F6",
            color: "#fff",
          },
        });
      } else {
        setErrorMessage(
          resolveMessage(result.message || "twoFactorResendError")
        );
      }
    } catch (error) {
      console.error("Error resending code:", error);
      setErrorMessage(resolveMessage("twoFactorResendError"));
    } finally {
      setIsResending(false);
    }
  };

  const switchToEmailFallback = async () => {
    if (isLoading) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await twoFactorService.useEmailFallback(type);

      if (result.success) {
        clearCode();
        startResendTimer();

        toast.success(resolveMessage(result.message || "emailCodeSent"), {
          icon: "📧",
          style: {
            borderRadius: "10px",
            background: "#3B82F6",
            color: "#fff",
          },
        });

        // Force re-render to show email input mode
        setOtpauth(null);
        setSecretBase32(null);
        setQrCodeDataUrl(null);
      } else {
        setErrorMessage(resolveMessage(result.message || "twoFactorInitError"));
      }
    } catch (error) {
      console.error("Error switching to email fallback:", error);
      setErrorMessage(resolveMessage("twoFactorInitError"));
    } finally {
      setIsLoading(false);
    }
  };

  const openAuthenticator = async () => {
    if (!otpauth) return;

    try {
      window.open(otpauth, "_blank");
    } catch (error) {
      console.error("Error opening authenticator:", error);
      toast.error(
        t("TwoFactor.openAuthenticatorFailed") ||
          "Failed to open authenticator app"
      );
    }
  };

  const copySecret = async () => {
    if (!secretBase32) return;

    try {
      await navigator.clipboard.writeText(secretBase32);
      toast.success(t("TwoFactor.copied") || "Copied to clipboard", {
        icon: "📋",
        style: {
          borderRadius: "10px",
          background: "#374151",
          color: "#fff",
        },
      });
    } catch (error) {
      console.error("Error copying secret:", error);
    }
  };

  const getTitle = (): string => {
    switch (type) {
      case "setup":
        return t("TwoFactor.setupTitle") || "Set up Two-Factor Authentication";
      case "login":
        return t("TwoFactor.loginTitle") || "Two-Factor Authentication";
      case "disable":
        return (
          t("TwoFactor.disableTitle") || "Disable Two-Factor Authentication"
        );
      default:
        return t("TwoFactor.verificationTitle") || "Verification Required";
    }
  };

  const getSubtitle = (): string => {
    switch (type) {
      case "setup":
        return (
          t("TwoFactor.setupSubtitle") ||
          "Secure your account with an additional layer of protection"
        );
      case "login":
        return (
          t("TwoFactor.loginSubtitle") ||
          "Enter your 6-digit verification code to continue"
        );
      case "disable":
        return (
          t("TwoFactor.disableSubtitle") ||
          "Enter your verification code to disable 2FA"
        );
      default:
        return (
          t("TwoFactor.verificationSubtitle") ||
          "Please enter your verification code"
        );
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
      {/* Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute -top-4 -left-4 w-72 h-72 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob ${
            isDark
              ? "bg-gradient-to-r from-orange-600 to-pink-600"
              : "bg-gradient-to-r from-orange-300 to-pink-300"
          }`}
        ></div>
        <div
          className={`absolute -top-4 -right-4 w-72 h-72 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000 ${
            isDark
              ? "bg-gradient-to-r from-pink-600 to-purple-600"
              : "bg-gradient-to-r from-pink-300 to-purple-300"
          }`}
        ></div>
      </div>

      <div className="relative min-h-screen flex flex-col">
        {/* Header */}
        <div
          className={`${
            isDark ? "bg-gray-800/20" : "bg-white/20"
          } backdrop-blur-lg border-b ${
            isDark ? "border-gray-700/20" : "border-white/20"
          }`}
        >
          <div className="max-w-md mx-auto px-4 py-4 flex items-center">
            <button
              onClick={() => router.back()}
              className={`p-2 rounded-full transition-colors ${
                isDark
                  ? "hover:bg-gray-700/50 text-gray-300 hover:text-white"
                  : "hover:bg-gray-100/50 text-gray-600 hover:text-gray-800"
              }`}
            >
              <ArrowLeftIcon className="w-5 h-5" />
            </button>
            <h1
              className={`flex-1 text-center text-lg font-semibold ${
                isDark ? "text-gray-200" : "text-gray-800"
              }`}
            >
              {getTitle()}
            </h1>
            <div className="w-9" /> {/* Spacer for center alignment */}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 max-w-md mx-auto w-full px-6 py-8">
          <div
            className={`backdrop-blur-xl rounded-3xl shadow-2xl border p-8 ${
              isDark
                ? "bg-gray-800/80 border-gray-700/20"
                : "bg-white/80 border-white/20"
            }`}
          >
            {/* Icon */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-orange-500 to-pink-600 shadow-lg mb-4">
                {type === "disable" ? (
                  <ShieldExclamationIcon className="w-8 h-8 text-white" />
                ) : (
                  <ShieldCheckIcon className="w-8 h-8 text-white" />
                )}
              </div>
              <h2
                className={`text-2xl font-bold mb-2 ${
                  isDark ? "text-gray-200" : "text-gray-800"
                }`}
              >
                {getTitle()}
              </h2>
              <p
                className={`text-sm ${
                  isDark ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {getSubtitle()}
              </p>
            </div>

            {/* Email Fallback Button - Only show for login with TOTP */}
            {type === "login" && currentMethod === "totp" && (
              <div className="text-center mb-6">
                <button
                  onClick={switchToEmailFallback}
                  disabled={isLoading}
                  className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isDark
                      ? "text-orange-400 hover:text-orange-300 hover:bg-orange-900/20"
                      : "text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                  }`}
                >
                  <EnvelopeIcon className="w-4 h-4 mr-2" />
                  {t("TwoFactor.useEmailInstead") || "Use email instead"}
                </button>
              </div>
            )}

            {/* TOTP Setup Options */}
            {type === "setup" && currentMethod === "totp" && (
              <div className="space-y-6 mb-8">
                {/* Add to Authenticator Button */}
                <button
                  onClick={openAuthenticator}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-orange-500 to-pink-600 hover:from-orange-600 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center"
                >
                  <LinkIcon className="w-5 h-5 mr-2" />
                  {t("TwoFactor.addToAuthenticator") ||
                    "Add to Authenticator App"}
                </button>

                {/* QR Code Section */}
                {qrCodeDataUrl && (
                  <div
                    className={`p-4 rounded-xl border ${
                      isDark
                        ? "bg-gray-700/50 border-gray-600/50"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <p
                      className={`text-sm text-center mb-3 ${
                        isDark ? "text-gray-300" : "text-gray-600"
                      }`}
                    >
                      {t("TwoFactor.qrSubtitle") ||
                        "Or scan this QR code with your authenticator app"}
                    </p>
                    <div className="flex justify-center">
                      <img
                        src={qrCodeDataUrl}
                        alt="QR Code"
                        className="w-48 h-48 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {/* Manual Setup */}
                {secretBase32 && (
                  <div
                    className={`p-4 rounded-xl border ${
                      isDark
                        ? "bg-gray-700/50 border-gray-600/50"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <h3
                      className={`text-sm font-semibold mb-2 ${
                        isDark ? "text-gray-200" : "text-gray-800"
                      }`}
                    >
                      {t("TwoFactor.manualSetupTitle") || "Manual Setup"}
                    </h3>
                    <p
                      className={`text-xs mb-3 ${
                        isDark ? "text-gray-400" : "text-gray-600"
                      }`}
                    >
                      {t("TwoFactor.manualSetupHint") ||
                        "Enter this key in your authenticator app"}
                    </p>
                    <div className="flex items-center space-x-2">
                      <div
                        className={`flex-1 px-3 py-2 rounded-lg font-mono text-sm border ${
                          isDark
                            ? "bg-gray-800 border-gray-600 text-gray-200"
                            : "bg-white border-gray-300 text-gray-800"
                        }`}
                      >
                        {secretBase32}
                      </div>
                      <button
                        onClick={copySecret}
                        className={`p-2 rounded-lg transition-colors ${
                          isDark
                            ? "hover:bg-gray-600 text-gray-400 hover:text-gray-200"
                            : "hover:bg-gray-200 text-gray-600 hover:text-gray-800"
                        }`}
                      >
                        <ClipboardDocumentIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <p
                  className={`text-xs text-center ${
                    isDark ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  {t("TwoFactor.enter6DigitsBelow") ||
                    "Enter the 6-digit code from your app below"}
                </p>
              </div>
            )}

            {/* 6-Digit Code Input */}
            <div className="space-y-6">
              <div className="flex justify-center space-x-3">
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      if (el) {
                        inputRefs.current[index] = el;
                      }
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6} // Allow paste
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onFocus={(e) => e.target.select()}
                    className={`w-12 h-14 text-center text-xl font-bold rounded-lg border-2 transition-all duration-200 focus:outline-none focus:ring-4 ${
                      errorMessage
                        ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                        : `${
                            isDark
                              ? "bg-gray-700 border-gray-600 text-white focus:border-orange-500 focus:ring-orange-500/20"
                              : "bg-white border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500/20"
                          }`
                    }`}
                    disabled={isLoading}
                  />
                ))}
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div
                  className={`p-3 rounded-lg border flex items-center space-x-2 ${
                    isDark
                      ? "bg-red-900/20 border-red-700/30 text-red-300"
                      : "bg-red-50 border-red-200 text-red-700"
                  }`}
                >
                  <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                  <p className="text-sm">{errorMessage}</p>
                </div>
              )}

              {/* Verify Button */}
              <button
                onClick={() => verifyCode()}
                disabled={isLoading || code.join("").length !== 6}
                className="w-full bg-gradient-to-r from-orange-500 to-pink-600 hover:from-orange-600 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 flex items-center justify-center"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  t("TwoFactor.verifyButton") || "Verify Code"
                )}
              </button>
            </div>

            {/* Resend Section - Only for email method */}
            {currentMethod === "email" && (
              <div className="mt-8 text-center space-y-4">
                {secondsRemaining > 0 ? (
                  <p
                    className={`text-sm ${
                      isDark ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {t("TwoFactor.resendIn") || "Resend code in"}{" "}
                    {secondsRemaining} {t("TwoFactor.seconds") || "seconds"}
                  </p>
                ) : (
                  <button
                    onClick={resendCode}
                    disabled={isResending}
                    className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isDark
                        ? "text-orange-400 hover:text-orange-300 hover:bg-orange-900/20"
                        : "text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    }`}
                  >
                    {isResending ? (
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    ) : (
                      <ArrowPathIcon className="w-4 h-4 mr-2" />
                    )}
                    {t("TwoFactor.resendCode") || "Resend Code"}
                  </button>
                )}

                <p
                  className={`text-xs ${
                    isDark ? "text-gray-500" : "text-gray-500"
                  }`}
                >
                  {t("TwoFactor.emailFallback") ||
                    "Check your email for the verification code"}
                </p>
              </div>
            )}
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
      `}</style>
    </div>
  );
}
