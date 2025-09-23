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
  const { locale } = await params;
  const messages = await getMessages({ locale });
  const timeZone = "Europe/Istanbul";

  return (
    <LayoutWrapper
      locale={locale}
      messages={messages}
      timeZone={timeZone}
    >
      {children}
    </LayoutWrapper>
  );
}