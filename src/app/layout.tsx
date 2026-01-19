import type { Metadata, Viewport } from "next";
import { Inter, Figtree } from "next/font/google";
import "./globals.css";

// Optimized font loading - only load weights that are actually used
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"], // Reduced from 9 weights to 4
  display: "swap", // Prevents render-blocking
  preload: true,
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  weight: ["400", "500", "600", "700"], // Reduced from 7 weights to 4
  display: "swap", // Prevents render-blocking
  preload: true,
});

export const metadata: Metadata = {
  title: "Nar24",
  description: "Kıbrın'ın en büyük market platformu",
  icons: {
    icon: '/pomegranate.png',
  },
};

// Viewport configuration for safe area support on iOS devices with notches
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // Required for env(safe-area-inset-*) to work
};

// Inline script to prevent theme flash - runs before React hydration
const themeScript = `
  (function() {
    try {
      var theme = localStorage.getItem('theme');
      if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className={`${inter.variable} ${figtree.variable}`} suppressHydrationWarning>
      <head>
        {/* Theme script - must run before React to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Preconnect to critical third-party domains for faster loading */}
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />
        <link rel="preconnect" href="https://www.googleapis.com" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        {/* Algolia search */}
        <link rel="preconnect" href="https://algolia.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://algolia.net" />
      </head>
      <body className={`${inter.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}