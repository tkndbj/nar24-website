"use client";

import { NextIntlClientProvider } from "next-intl";
import { UserProvider } from "../../context/UserProvider";
import { CartProvider } from "../../context/CartProvider";
import { FavoritesProvider } from "@/context/FavoritesProvider";
import { BadgeProvider } from "@/context/BadgeProvider";
import { SearchProvider } from "@/context/SearchProvider";
import ConditionalHeader from "../components/ConditionalHeader";

export default function LayoutWrapper({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode;
  locale: string;
  messages: Record<string, unknown>;
}) {
  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      <UserProvider>
        <CartProvider>
          <FavoritesProvider>
            <BadgeProvider>
              <SearchProvider>
                <ConditionalHeader />
                <main>{children}</main>
              </SearchProvider>
            </BadgeProvider>
          </FavoritesProvider>
        </CartProvider>
      </UserProvider>
    </NextIntlClientProvider>
  );
}
