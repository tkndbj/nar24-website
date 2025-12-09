// layoutWrapper.tsx
"use client";

import { useState, useEffect } from "react";
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
import { AppInitializer } from "@/app/components/AppInitializer";
import { AnalyticsInitializer } from "@/app/components/AnalyticsInitializer";
import { getFirebaseDb, getFirebaseFunctions } from "@/lib/firebase-lazy";
import { ProductCacheProvider } from "@/context/ProductCacheProvider";
import type { Firestore } from "firebase/firestore";
import type { Functions } from "firebase/functions";

// Inner component that has access to user context and lazy-loaded Firebase
function AppProviders({
  children,
  db,
  functions
}: {
  children: React.ReactNode;
  db: Firestore | null;
  functions: Functions | null;
}) {
  const { user } = useUser();

  return (
    <ProductCacheProvider>
      <CartProvider user={user} db={db} functions={functions}>
        <FavoritesProvider>
          <BadgeProvider>
            <SearchProvider>
              <SearchHistoryProvider>
                <ConditionalHeader />
                <main>{children}</main>
                <ConditionalFooter />
                <CookieConsent />
              </SearchHistoryProvider>
            </SearchProvider>
          </BadgeProvider>
        </FavoritesProvider>
      </CartProvider>
    </ProductCacheProvider>
  );
}

// Component to lazy load Firebase and provide it to children
function FirebaseProvider({ children }: { children: (db: Firestore | null, functions: Functions | null) => React.ReactNode }) {
  const [db, setDb] = useState<Firestore | null>(null);
  const [functions, setFunctions] = useState<Functions | null>(null);

  useEffect(() => {
    let mounted = true;

    // Load Firebase in background after initial render
    const loadFirebase = async () => {
      try {
        const [loadedDb, loadedFunctions] = await Promise.all([
          getFirebaseDb(),
          getFirebaseFunctions(),
        ]);

        if (mounted) {
          setDb(loadedDb);
          setFunctions(loadedFunctions);
        }
      } catch (error) {
        console.error("Failed to load Firebase:", error);
      }
    };

    loadFirebase();

    return () => {
      mounted = false;
    };
  }, []);

  return <>{children(db, functions)}</>;
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
      {/* Step 1: Initialize memory manager (no user context needed) */}
      <AppInitializer>
        {/* Step 2: Provide user context (with lazy Firebase) */}
        <UserProvider>
          {/* Step 3: Initialize analytics (needs user context) */}
          <AnalyticsInitializer>
            {/* Step 4: Lazy load Firebase for cart/other providers */}
            <FirebaseProvider>
              {(db, functions) => (
                <AppProviders db={db} functions={functions}>
                  {children}
                </AppProviders>
              )}
            </FirebaseProvider>
          </AnalyticsInitializer>
        </UserProvider>
      </AppInitializer>
    </NextIntlClientProvider>
  );
}
