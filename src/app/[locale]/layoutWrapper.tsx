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
import { AppInitializer } from '@/app/components/AppInitializer';
import { AnalyticsInitializer } from '@/app/components/AnalyticsInitializer'; // ✅ NEW
import { db } from "@/lib/firebase";
import { ProductCacheProvider } from '@/context/ProductCacheProvider';

// Inner component that has access to user context
function AppProviders({ children }: { children: React.ReactNode }) {
  const { user } = useUser();

  return (
    <ProductCacheProvider>
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
    </ProductCacheProvider>
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
      {/* ✅ Step 1: Initialize memory manager (no user context needed) */}
      <AppInitializer>
        
        {/* ✅ Step 2: Provide user context */}
        <UserProvider>
          
          {/* ✅ Step 3: Initialize analytics (needs user context) */}
          <AnalyticsInitializer>
            
            {/* ✅ Step 4: Other providers */}
            <AppProviders>{children}</AppProviders>
            
          </AnalyticsInitializer>
        </UserProvider>
      </AppInitializer>
    </NextIntlClientProvider>
  );
}