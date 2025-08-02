// app/[locale]/layout.tsx
import { getMessages } from "next-intl/server";
import { ReactNode } from "react";
import Script from "next/script";
import LayoutWrapper from "./layoutWrapper";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const messages = await getMessages({ locale: params.locale });

  return (
    <>
      {/* Google Maps Script */}
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="beforeInteractive"
      />

      <LayoutWrapper locale={params.locale} messages={messages}>
        {children}
      </LayoutWrapper>
    </>
  );
}
