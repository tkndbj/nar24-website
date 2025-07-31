import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { UserProvider } from "../context/UserProvider";
import { CartProvider } from "../context/CartProvider";
import { FavoritesProvider } from "@/context/FavoritesProvider";
import { BadgeProvider } from "@/context/BadgeProvider";
import { SearchProvider } from "@/context/SearchProvider";
import ConditionalHeader from "./components/ConditionalHeader"; // Import the new component

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Nar24",
  description: "Kıbrın'ın en büyük market platformu",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body
        className={`${inter.className} antialiased bg-gray-50 dark:bg-gray-900 transition-colors duration-300`}
      >
        <UserProvider>
          <CartProvider>
            <FavoritesProvider>
              <BadgeProvider>
                <SearchProvider>
                  {/* Use the new ConditionalHeader component */}
                  <ConditionalHeader />

                  <main>{children}</main>
                </SearchProvider>
              </BadgeProvider>
            </FavoritesProvider>
          </CartProvider>
        </UserProvider>
      </body>
    </html>
  );
}
