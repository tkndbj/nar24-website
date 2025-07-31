import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { UserProvider } from "../context/UserProvider";
import { CartProvider } from "../context/CartProvider";
import { FavoritesProvider } from "@/context/FavoritesProvider";
import { BadgeProvider } from "@/context/BadgeProvider"; // Add this if not already imported
import { SearchProvider } from "@/context/SearchProvider"; // Add this if not already imported
import MarketHeader from "@/app/components/market_screen/MarketHeader"; // Import your header component

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Marketplace App",
  description: "Modern marketplace application built with Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      {/* ✅ ADD: Dark mode background to body */}
      <body
        className={`${inter.className} antialiased bg-gray-50 dark:bg-gray-900 transition-colors duration-300`}
      >
        <UserProvider>
          <CartProvider>
            <FavoritesProvider>
              <BadgeProvider>
                <SearchProvider>
                  {/* Global Header - will appear on all pages */}
                  <MarketHeader />

                  {/* ✅ FIXED: Remove min-h-screen and background from main, let pages control their own background */}
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
