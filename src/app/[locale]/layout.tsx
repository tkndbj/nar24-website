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

  return (
    <LayoutWrapper locale={locale} messages={messages}>
      {children}
    </LayoutWrapper>
  );
}
