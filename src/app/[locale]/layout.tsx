// layout.tsx
import { getMessages } from "next-intl/server";
import { ReactNode } from "react";
import LayoutWrapper from "./layoutWrapper";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  // Await the params object first
  const { locale } = await params;

  // Now use the locale
  const messages = await getMessages({ locale });

  // You could also make this dynamic based on locale
  const timeZone = "Europe/Istanbul"; // or "UTC" for universal

  return (
    <LayoutWrapper
      locale={locale}
      messages={messages}
      timeZone={timeZone} // ADD THIS
    >
      {children}
    </LayoutWrapper>
  );
}
