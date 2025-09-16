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
import ClientProviders from "../components/ClientProviders";
import { db } from "@/lib/firebase"; // Adjust this import path as needed

// Inner component that has access to user context
function CartProviderWrapper({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  
  return (
    <CartProvider user={user} db={db}>
      {children}
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
      <ClientProviders>
        <UserProvider>
          <CartProviderWrapper>
            <FavoritesProvider>
              <BadgeProvider>
                <SearchProvider>
                  <SearchHistoryProvider>
                    <ConditionalHeader />
                    <main>{children}</main>
                  </SearchHistoryProvider>
                </SearchProvider>
              </BadgeProvider>
            </FavoritesProvider>
          </CartProviderWrapper>
        </UserProvider>
      </ClientProviders>
    </NextIntlClientProvider>
  );
}