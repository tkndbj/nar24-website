import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PlusIcon } from "@heroicons/react/24/outline";

export default function CreateShopButton() {
  const t = useTranslations("shops");

  return (
    <Link href="/createshop">
      <button className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center gap-2 whitespace-nowrap">
        <PlusIcon className="w-4 h-4" />
        {t("createYourShop")}
      </button>
    </Link>
  );
}
