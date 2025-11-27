// layout.tsx
import { getMessages } from "next-intl/server";
import { ReactNode } from "react";
import LayoutWrapper from "./layoutWrapper";
import Script from "next/script"; // ✅ Import Next.js Script component

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages({ locale });
  const timeZone = "Europe/Istanbul";

  return (
    <>
      {/* ✅ Google Analytics */}
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-WY8NC5PBFL"
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-WY8NC5PBFL');
        `}
      </Script>

      <LayoutWrapper
        locale={locale}
        messages={messages}
        timeZone={timeZone}
      >
        {children}
      </LayoutWrapper>
    </>
  );
}