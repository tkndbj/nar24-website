"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useUser } from "@/context/UserProvider";
import { ExternalLink, ShieldCheck } from "lucide-react";

const SKIP_PATH_FRAGMENTS = [
  "/login",
  "/registration",
  "/email-verification",
  "/forgot-password",
  "/password-reset",
  "/verify-email",
  "/two-factor-verification",
  "/complete-name",
  "/agreements",
];

export default function AgreementModal() {
  const { user, isLoading, needsNameCompletion } = useUser();
  const t = useTranslations("agreementModal");
  const locale = useLocale();
  const pathname = usePathname() || "";

  const [needsAgreement, setNeedsAgreement] = useState<boolean | null>(null);
  const [membershipAgreed, setMembershipAgreed] = useState(false);
  const [personalDataAgreed, setPersonalDataAgreed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const buildLocalizedUrl = useCallback(
    (path: string): string => {
      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
      return locale === "tr" ? `/${cleanPath}` : `/${locale}/${cleanPath}`;
    },
    [locale],
  );

  useEffect(() => {
    if (!user) {
      setNeedsAgreement(null);
      setMembershipAgreed(false);
      setPersonalDataAgreed(false);
      setTermsAgreed(false);
      setError("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { getFirebaseDb } = await import("@/lib/firebase-lazy");
        const db = await getFirebaseDb();
        if (!db || cancelled) return;
        const { doc, getDoc } = await import("firebase/firestore");
        const snap = await getDoc(doc(db, "users", user.uid));
        if (cancelled) return;
        if (!snap.exists()) {
          setNeedsAgreement(true);
          return;
        }
        setNeedsAgreement(snap.data().agreementsAccepted !== true);
      } catch (err) {
        console.error("Failed to check agreements:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isOnSkippedPath = SKIP_PATH_FRAGMENTS.some((frag) =>
    pathname.includes(frag),
  );

  const shouldShow =
    !isLoading &&
    !!user &&
    needsAgreement === true &&
    !needsNameCompletion &&
    !isOnSkippedPath;

  useEffect(() => {
    if (!shouldShow) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [shouldShow]);

  if (!shouldShow) return null;

  const allAccepted = membershipAgreed && personalDataAgreed && termsAgreed;

  const handleAccept = async () => {
    if (!allAccepted || !user) return;
    setError("");
    setSaving(true);
    try {
      const { getFirebaseDb } = await import("@/lib/firebase-lazy");
      const db = await getFirebaseDb();
      if (!db) throw new Error("Firestore not available");
      const { doc, setDoc, serverTimestamp } = await import(
        "firebase/firestore"
      );
      await setDoc(
        doc(db, "users", user.uid),
        {
          agreementsAccepted: true,
          agreementAcceptedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setNeedsAgreement(false);
    } catch (err) {
      console.error("Failed to save agreements:", err);
      setError(t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
        <div className="flex items-center justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
        </div>
        <h2 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-2">
          {t("title")}
        </h2>
        <p className="text-sm text-center text-gray-600 dark:text-gray-400 mb-6">
          {t("subtitle")}
        </p>

        <div className="space-y-3 mb-5">
          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={membershipAgreed}
              onChange={(e) => setMembershipAgreed(e.target.checked)}
              disabled={saving}
              className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {t("iAccept")}{" "}
              <Link
                href={buildLocalizedUrl("/agreements/membership")}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center"
              >
                {t("membershipAgreement")}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </span>
          </label>

          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={personalDataAgreed}
              onChange={(e) => setPersonalDataAgreed(e.target.checked)}
              disabled={saving}
              className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {t("iAccept")}{" "}
              <Link
                href={buildLocalizedUrl("/agreements/personal-data")}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center"
              >
                {t("personalDataProtection")}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </span>
          </label>

          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(e) => setTermsAgreed(e.target.checked)}
              disabled={saving}
              className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {t("iAccept")}{" "}
              <Link
                href={buildLocalizedUrl("/agreements/terms")}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center"
              >
                {t("termsAndConditions")}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </span>
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 text-center mb-3">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleAccept}
          disabled={!allAccepted || saving}
          className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saving ? t("saving") : t("acceptButton")}
        </button>
      </div>
    </div>
  );
}
