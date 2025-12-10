// app/[locale]/complete-profile/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { useTranslations, useLocale } from "next-intl";
import {
  ArrowLeft,
  User,
  Users,
  Calendar,
  Globe,
  CheckCircle,
  Info,
  Mail,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";

export default function CompleteProfilePage() {
  const router = useRouter();
  const t = useTranslations("completeProfile");
  const locale = useLocale();
  const user = auth.currentUser;

  const buildLocalizedUrl = (path: string): string => {
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return locale === "tr" ? `/${cleanPath}` : `/${locale}/${cleanPath}`;
  };

  const [formData, setFormData] = useState({
    gender: "",
    birthDate: "",
    languageCode: locale || "tr",
  });
  const [membershipAgreed, setMembershipAgreed] = useState(false);
  const [personalDataAgreed, setPersonalDataAgreed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Clear shop cache on mount
  useEffect(() => {
    try {
      localStorage.removeItem("selectedShopId");
      console.log("🧹 Cleared shop cache on complete-profile page");
    } catch (error) {
      console.error("Failed to clear shop cache:", error);
    }
  }, []);

  // Redirect if user is not authenticated
  useEffect(() => {
    if (!user) {
      router.push(buildLocalizedUrl("/"));
    }
  }, [user, router]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleBackToLogin = async () => {
    try {
      await signOut(auth);
      router.push(buildLocalizedUrl("/"));
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  };

  const getMaxDate = () => {
    const today = new Date();
    const maxDate = new Date(
      today.getFullYear() - 18,
      today.getMonth(),
      today.getDate()
    );
    return maxDate.toISOString().split("T")[0];
  };

  const validateForm = (): boolean => {
    if (!formData.gender) {
      setError(t("errors.genderRequired"));
      return false;
    }
    if (!formData.birthDate) {
      setError(t("errors.birthDateRequired"));
      return false;
    }
    if (!formData.languageCode) {
      setError(t("errors.languageRequired"));
      return false;
    }
    if (!membershipAgreed || !personalDataAgreed || !termsAgreed) {
      setError(t("errors.agreementRequired"));
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validateForm()) return;
    if (!user) return;

    setLoading(true);

    try {
      const userRef = doc(db, "users", user.uid);

      // ✅ Use setDoc with merge - works even if document doesn't exist
      await setDoc(
        userRef,
        {
          gender: formData.gender,
          birthDate: new Date(formData.birthDate),
          languageCode: formData.languageCode,
          isNew: false,
          agreementsAccepted: true,
          agreementAcceptedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Clear shop cache before navigation
      try {
        localStorage.removeItem("selectedShopId");
      } catch (storageError) {
        console.warn("Failed to clear shop cache:", storageError);
      }

      // Navigate to dashboard
      router.push(buildLocalizedUrl("/dashboard"));
    } catch (err: unknown) {
      console.error("Profile update failed:", err);
      setError(t("errors.updateFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      {/* Animated Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-10 -left-10 w-72 h-72 bg-gradient-to-br from-orange-400 to-pink-500 rounded-full opacity-30 blur-3xl animate-blob"></div>
        <div className="absolute top-1/3 -right-12 w-80 h-80 bg-gradient-to-br from-yellow-400 to-pink-500 rounded-full opacity-30 blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-20 -left-10 w-96 h-96 bg-gradient-to-br from-pink-400 to-purple-600 rounded-full opacity-30 blur-3xl animate-blob animation-delay-4000"></div>
      </div>

      <div className="w-full max-w-lg relative z-10">
        {/* Back Button */}
        <div className="mb-6">
          <button
            onClick={handleBackToLogin}
            className="p-3 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-800 transition-all duration-200 border border-gray-200 dark:border-gray-700 shadow-lg"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
        </div>

        {/* Main Card */}
        <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700/20 p-8">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg animate-pulse">
              <User className="w-12 h-12 text-white" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-center mb-3 bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
            {t("title")}
          </h1>

          {/* User Email Display */}
          {user.email && (
            <div className="flex justify-center mb-4">
              <div className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-full border border-blue-200 dark:border-blue-800">
                <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {user.email}
                </span>
              </div>
            </div>
          )}

          {/* Subtitle */}
          <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
            {t("subtitle")}
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Gender */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t("form.gender")}
              </label>
              <div className="relative">
                <Users className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleInputChange}
                  className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-white/50 dark:bg-gray-700/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 appearance-none"
                  required
                >
                  <option value="">{t("form.selectGender")}</option>
                  <option value="Male">{t("form.male")}</option>
                  <option value="Female">{t("form.female")}</option>
                  <option value="Other">{t("form.other")}</option>
                </select>
              </div>
            </div>

            {/* Birth Date */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t("form.birthDate")}
              </label>
              <div className="relative">
                <Calendar className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="date"
                  name="birthDate"
                  value={formData.birthDate}
                  onChange={handleInputChange}
                  max={getMaxDate()}
                  min="1900-01-01"
                  className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-white/50 dark:bg-gray-700/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  required
                />
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t("form.language")}
              </label>
              <div className="relative">
                <Globe className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <select
                  name="languageCode"
                  value={formData.languageCode}
                  onChange={handleInputChange}
                  className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-white/50 dark:bg-gray-700/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 appearance-none"
                  required
                >
                  <option value="">{t("form.selectLanguage")}</option>
                  <option value="tr">{t("form.turkish")}</option>
                  <option value="en">{t("form.english")}</option>
                  <option value="ru">{t("form.russian")}</option>
                </select>
              </div>
            </div>

            {/* Agreements Section */}
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-3">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t("form.agreementsTitle")}
              </p>

              {/* Membership Agreement */}
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={membershipAgreed}
                  onChange={(e) => setMembershipAgreed(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {t("form.iAccept")}{" "}
                  <Link
                    href={buildLocalizedUrl("/agreements/membership")}
                    target="_blank"
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center"
                  >
                    {t("form.membershipAgreement")}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Link>
                </span>
              </label>

              {/* Personal Data Protection */}
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={personalDataAgreed}
                  onChange={(e) => setPersonalDataAgreed(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {t("form.iAccept")}{" "}
                  <Link
                    href={buildLocalizedUrl("/agreements/personal-data")}
                    target="_blank"
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center"
                  >
                    {t("form.personalDataProtection")}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Link>
                </span>
              </label>

              {/* Terms and Conditions */}
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAgreed}
                  onChange={(e) => setTermsAgreed(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {t("form.iAccept")}{" "}
                  <Link
                    href={buildLocalizedUrl("/agreements/terms")}
                    target="_blank"
                    className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center"
                  >
                    {t("form.termsAndConditions")}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Link>
                </span>
              </label>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                <p className="text-sm text-red-600 dark:text-red-400 text-center font-medium">
                  {error}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 px-4 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-semibold transition-all duration-200 flex items-center justify-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white mr-3"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  {t("form.saving")}
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  {t("form.saveButton")}
                </>
              )}
            </button>
          </form>

          {/* Info Box */}
          <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
            <div className="flex items-start space-x-3">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {t("infoMessage")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes blob {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
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
