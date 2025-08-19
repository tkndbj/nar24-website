"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TwoFactorVerificationPage from "@/app/components/TwoFactorVerificationPage";

function TwoFactorContent() {
  const searchParams = useSearchParams();
  const type =
    (searchParams.get("type") as "setup" | "login" | "disable") || "login";

  return <TwoFactorVerificationPage type={type} />;
}

function TwoFactorLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}

export default function TwoFactorVerificationRoute() {
  return (
    <Suspense fallback={<TwoFactorLoading />}>
      <TwoFactorContent />
    </Suspense>
  );
}
