// layoutWrapper.tsx
"use client";

import { NextIntlClientProvider } from "next-intl";
import { UserProvider, useUser } from "../../context/UserProvider";
import { CartProvider } from "../../context/CartProvider";
import { FavoritesProvider } from "@/context/FavoritesProvider";
import { BadgeProvider } from "@/context/BadgeProvider";
import { SearchProvider } from "@/context/SearchProvider";
import ConditionalHeader from "../components/ConditionalHeader";
import { SearchHistoryProvider } from "@/context/SearchHistoryProvider";
import ConditionalFooter from "../components/ConditionalFooter";
import CookieConsent from "../components/CookieConsent";
import { PersonalizedRecommendationsProvider } from "@/context/PersonalizedRecommendationsProvider";
import { db } from "@/lib/firebase";

// Inner component that has access to user context
function AppProviders({ children }: { children: React.ReactNode }) {
  const { user } = useUser();

  return (
    <CartProvider user={user} db={db}>
      <FavoritesProvider>
        <BadgeProvider>
          <SearchProvider>
            <SearchHistoryProvider>
              <PersonalizedRecommendationsProvider>
                <ConditionalHeader />
                <main>{children}</main>
                <ConditionalFooter />
                <CookieConsent />
              </PersonalizedRecommendationsProvider>
            </SearchHistoryProvider>
          </SearchProvider>
        </BadgeProvider>
      </FavoritesProvider>
    </CartProvider>
  );
}

export default function LayoutWrapper({
  children,
  locale,
  messages,
  timeZone = "Europe/Istanbul",
}: {
  children: React.ReactNode;
  locale: string;
  messages: Record<string, unknown>;
  timeZone?: string;
}) {
  return (
    <NextIntlClientProvider
      messages={messages}
      locale={locale}
      timeZone={timeZone}
    >
      <UserProvider>
        <AppProviders>{children}</AppProviders>
      </UserProvider>
    </NextIntlClientProvider>
  );
}
