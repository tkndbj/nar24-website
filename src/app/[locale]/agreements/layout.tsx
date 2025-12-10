"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export default function AgreementsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen">
      <button
        onClick={() => router.back()}
        className="fixed top-4 left-4 z-50 p-2 bg-white rounded-full shadow-md hover:bg-gray-100 transition-colors"
        aria-label="Go back"
      >
        <ArrowLeft className="w-6 h-6 text-gray-700" />
      </button>
      {children}
    </div>
  );
}
