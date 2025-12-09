import type { Metadata } from "next";
import { Inter, Figtree } from "next/font/google";
import "./globals.css";


const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "Nar24",
  description: "Kıbrın'ın en büyük market platformu",
  icons: {
    icon: '/pomegranate.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className={`${inter.variable} ${figtree.variable}`}>
      <body className={`${inter.className} antialiased`}>
        
        {children}
      </body>
    </html>
  );
}