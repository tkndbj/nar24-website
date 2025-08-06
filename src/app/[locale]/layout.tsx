import { getMessages } from "next-intl/server";
import { ReactNode } from "react";
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
    <LayoutWrapper locale={params.locale} messages={messages}>
      {children}
    </LayoutWrapper>
  );
}
