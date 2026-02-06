// layoutWrapper.tsx
// Performance optimized with composite providers to reduce visual nesting
// while maintaining proper dependency order
"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { NextIntlClientProvider } from "next-intl";
import { UserProvider, useUser } from "../../context/UserProvider";
import ConditionalHeader from "../components/ConditionalHeader";
import { AppInitializer } from "@/app/components/AppInitializer";
import { AnalyticsInitializer } from "@/app/components/AnalyticsInitializer";
import { getFirebaseDb, getFirebaseFunctions } from "@/lib/firebase-lazy";
import type { Firestore } from "firebase/firestore";
import type { Functions } from "firebase/functions";

// Composite providers - reduces nesting while maintaining dependencies
import { CommerceProviders } from "@/context/CommerceProviders";
import { UIProviders } from "@/context/UIProviders";

// Lazy load CookieConsent - only shown conditionally, not needed on initial render
const CookieConsent = dynamic(
  () => import("../components/CookieConsent"),
  { ssr: false }
);

// Lazy load AppDownloadModal - only shown on mobile/tablet devices
const AppDownloadModal = dynamic(
  () => import("../components/AppDownloadModal"),
  { ssr: false }
);

// Inner component that has access to user context and lazy-loaded Firebase
// Uses composite providers to reduce visual nesting from 14 levels to 6
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
    <CommerceProviders user={user} db={db} functions={functions}>
      <UIProviders user={user}>
        <ConditionalHeader />
        <main className="isolate">{children}</main>
        <CookieConsent />
        <AppDownloadModal />
      </UIProviders>
    </CommerceProviders>
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
