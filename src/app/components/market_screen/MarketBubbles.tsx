"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useTheme } from "@/hooks/useTheme";

interface MarketBubblesProps {
  onNavItemTapped: (index: number) => void;
  locale?: string;
}

interface CardData {
  label: string;
  description: string;
  image: string;
  accentColor: string;
  showComingSoon: boolean;
}

export const MarketBubbles: React.FC<MarketBubblesProps> = ({}) => {
  const router = useRouter();
  const isDarkMode = useTheme();
  const t = useTranslations("MarketBubbles");

  const cards: CardData[] = [
    {
      label: t("shops"),
      description: t("shopsDesc"),
      image: "/images/shopbubble.png",
      accentColor: "#f97316",
      showComingSoon: false,
    },
    {
      label: t("becomeASeller"),
      description: t("becomeASellerDesc"),
      image: "/images/createshop.png",
      accentColor: "#8b5cf6",
      showComingSoon: false,
    },
    {
      label: "Vitrin",
      description: t("showcaseDesc"),
      image: "/images/vitrinbubble.png",
      accentColor: "#22c55e",
      showComingSoon: false,
    },
    {
      label: t("food"),
      description: t("foodDesc"),
      image: "/images/foodbubble.png",
      accentColor: "#3b82f6",
      showComingSoon: false,
    },
    {
      label: t("market"),
      description: t("marketDesc"),
      image: "/images/marketbubble.png",
      accentColor: "#ec4899",
      showComingSoon: true,
    },
  ];

  const handleCardClick = (index: number) => {
    if (index === 0) {
      router.push("/shops");
    } else if (index === 1) {
      router.push("/createshop");
    } else if (index === 2) {
      router.push("/dynamicteras");
    } else if (index === 3) {
      router.push("/restaurants");
    }
  };

  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide sm:grid sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
      {cards.map((card, index) => (
        <div
          key={card.label}
          className={`group relative flex flex-row items-center gap-3 rounded-2xl border bg-transparent p-3 lg:p-4 transition-all duration-200 flex-shrink-0 w-[160px] sm:w-auto sm:flex-shrink ${
            isDarkMode ? "border-neutral-700" : "border-gray-200"
          } ${
            card.showComingSoon
              ? "cursor-default opacity-60"
              : "cursor-pointer hover:shadow-md hover:-translate-y-0.5"
          }`}
          onClick={() => !card.showComingSoon && handleCardClick(index)}
        >
          {/* Icon */}
          <div className="relative h-10 w-10 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 lg:h-11 lg:w-11">
            <Image
              src={card.image}
              alt={card.label}
              fill
              className="object-contain"
              sizes="44px"
              priority
              loading="eager"
            />
          </div>

          {/* Text */}
          <div className="flex min-w-0 flex-col">
            <span
              className={`text-sm font-semibold leading-tight ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {card.label}
            </span>
            <span
              className={`mt-0.5 text-xs leading-snug line-clamp-2 ${
                isDarkMode ? "text-neutral-400" : "text-gray-500"
              }`}
            >
              {card.description}
            </span>
            {card.showComingSoon && (
              <span
                className="mt-1 inline-block w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                style={{ backgroundColor: card.accentColor }}
              >
                {t("comingSoon")}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
