import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PlusIcon } from "@heroicons/react/24/outline";

export default function CreateShopButton() {
  const t = useTranslations("shops");

  return (
    <div className="mb-6">
      <Link href="/createshop">
        <button className="w-full sm:w-auto px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg">
          <PlusIcon className="w-5 h-5" />
          {t("createYourShop")}
        </button>
      </Link>
    </div>
  );
}
