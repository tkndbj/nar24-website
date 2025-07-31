"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "@heroicons/react/24/outline";
import { toast } from "react-hot-toast";
import { AuthError } from "firebase/auth";

// Remove the interface since Next.js pages don't accept custom props
export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State management
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);

  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Initialize from URL params
  useEffect(() => {
    const emailParam = searchParams.get("email");
    const passwordParam = searchParams.get("password");
    const showVerification = searchParams.get("showVerification") === "true";

    if (emailParam) setEmail(emailParam);
    if (passwordParam) setPassword(passwordParam);
    setShowVerificationMessage(showVerification);
  }, [searchParams]);

  // Email validation
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  // Handle email/password login
  const handleLoginWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error("E-posta adresi gerekli");
      return;
    }

    if (!validateEmail(email)) {
      toast.error("Geçersiz e-posta adresi");
      return;
    }

    if (!password) {
      toast.error("Şifre gerekli");
      return;
    }

    if (password.length < 6) {
      toast.error("Şifre en az 6 karakter olmalı");
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
        toast.error("Lütfen giriş yapmadan önce e-postanızı doğrulayın.");
        return;
      }

      if (user) {
        toast.success("Giriş başarılı! Hoş geldiniz!", {
          icon: "🎉",
          style: {
            borderRadius: "10px",
            background: "#10B981",
            color: "#fff",
          },
        });

        // Always redirect to home page since this is a Next.js page component
        router.push("/");
      }
    } catch (error: unknown) {
      let message = "Bir hata oluştu. Lütfen tekrar deneyin.";

      switch ((error as AuthError).code) {
        case "auth/user-not-found":
          message = "Bu e-posta adresiyle kayıtlı kullanıcı bulunamadı.";
          break;
        case "auth/wrong-password":
          message = "Yanlış şifre.";
          break;
        case "auth/invalid-email":
          message = "Geçersiz e-posta adresi.";
          break;
        case "auth/network-request-failed":
          message = "Ağ hatası. Bağlantınızı kontrol edip tekrar deneyin.";
          break;
        case "auth/too-many-requests":
          message =
            "Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.";
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
        toast.success("Google ile giriş başarılı!", {
          icon: "🚀",
          style: {
            borderRadius: "10px",
            background: "#10B981",
            color: "#fff",
          },
        });

        // Always redirect to home page since this is a Next.js page component
        router.push("/");
      }
    } catch (error: unknown) {
      let message = "Google ile giriş başarısız. Lütfen tekrar deneyin.";

      switch ((error as AuthError).code) {
        case "auth/network-request-failed":
          message = "Ağ hatası. Bağlantınızı kontrol edip tekrar deneyin.";
          break;
        case "auth/account-exists-with-different-credential":
          message =
            "Bu e-posta adresiyle farklı bir giriş yöntemi kullanılarak hesap mevcut.";
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
      toast.error("E-posta ve şifre gerekli");
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
        toast.success("Doğrulama e-postası gönderildi");
      }

      await auth.signOut();
    } catch (error: unknown) {
      let message = "Doğrulama e-postası gönderilemedi";

      switch ((error as AuthError).code) {
        case "auth/user-not-found":
          message = "Kullanıcı bulunamadı";
          break;
        case "auth/wrong-password":
          message = "Yanlış şifre";
          break;
        case "auth/invalid-email":
          message = "Geçersiz e-posta adresi";
          break;
      }

      toast.error(message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-blue-900/20 dark:to-purple-900/20">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-4 -left-4 w-72 h-72 bg-gradient-to-r from-blue-300 to-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute -top-4 -right-4 w-72 h-72 bg-gradient-to-r from-yellow-300 to-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-pink-300 to-indigo-300 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Language Selector */}
          <div className="flex justify-end mb-6">
            <button className="p-3 rounded-full bg-white/20 dark:bg-gray-800/20 backdrop-blur-lg border border-white/20 hover:bg-white/30 dark:hover:bg-gray-700/30 transition-all duration-300 group">
              <svg
                className="w-5 h-5 text-gray-600 dark:text-gray-300 group-hover:text-gray-800 dark:group-hover:text-white transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                />
              </svg>
            </button>
          </div>

          {/* Main Card */}
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700/20 p-8 relative overflow-hidden">
            {/* Card Background Pattern */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-blue-400/10 to-transparent rounded-full"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-purple-400/10 to-transparent rounded-full"></div>

            {/* Logo Section */}
            <div className="text-center mb-8 relative">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg mb-4 relative">
                <UserIcon className="w-10 h-10 text-white" />
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 animate-ping opacity-20"></div>
              </div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-2">
                Hoş Geldiniz
              </h1>
              <p className="text-gray-600 dark:text-gray-400 font-medium">
                Hesabınıza giriş yaparak devam edin
              </p>
            </div>

            {/* Verification Message */}
            {showVerificationMessage && (
              <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-700/30">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <EnvelopeIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-3 font-medium">
                      Lütfen giriş yapmadan önce e-postanızı doğrulayın.
                    </p>
                    <button
                      onClick={resendVerificationEmail}
                      disabled={isResending}
                      className="inline-flex items-center px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-sm font-semibold rounded-xl transition-colors duration-200"
                    >
                      {isResending ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                      ) : (
                        <EnvelopeIcon className="w-4 h-4 mr-2" />
                      )}
                      Tekrar Gönder
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLoginWithPassword} className="space-y-6">
              {/* Email Field */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  E-posta Adresi
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
                    className={`w-full pl-12 pr-4 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 ${
                      focusedField === "email"
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/10 ring-blue-500/20 shadow-lg"
                        : "border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/50 hover:border-gray-300 dark:hover:border-gray-500"
                    } dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-sm font-medium`}
                    placeholder="ornek@email.com"
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Şifre
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
                    className={`w-full pl-12 pr-12 py-4 rounded-2xl border-2 transition-all duration-300 focus:outline-none focus:ring-4 ${
                      focusedField === "password"
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/10 ring-blue-500/20 shadow-lg"
                        : "border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/50 hover:border-gray-300 dark:hover:border-gray-500"
                    } dark:text-white placeholder-gray-500 dark:placeholder-gray-400 text-sm font-medium`}
                    placeholder="Şifrenizi girin"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
                    <span className="mr-2">Giriş Yap</span>
                    <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                    veya
                  </span>
                </div>
              </div>

              {/* Google Sign-in Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full bg-white dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-gray-700 dark:text-gray-200 font-semibold py-4 px-6 rounded-2xl transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl disabled:scale-100 flex items-center justify-center space-x-3 group"
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
                <span>Google ile Giriş Yap</span>
              </button>
            </form>

            {/* Bottom Links */}
            <div className="mt-8 space-y-4 text-center">
              <button
                onClick={() => router.push("/register")}
                className="block w-full text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold text-sm transition-colors duration-200 py-2"
              >
                Hesabınız yok mu? <span className="underline">Kayıt olun</span>
              </button>

              <button
                onClick={() => router.push("/forgot-password")}
                className="block w-full text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium text-sm transition-colors duration-200 py-2"
              >
                Şifrenizi mi unuttunuz?
              </button>

              <button
                onClick={() => router.push("/")}
                className="block w-full text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium text-sm transition-colors duration-200 py-2"
              >
                Misafir olarak devam et
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
