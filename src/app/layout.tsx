import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const figtree = localFont({
  src: "./fonts/Figtree-Regular.ttf",
  variable: "--font-figtree",
  display: "swap",
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
    <html className={figtree.variable} suppressHydrationWarning>
      <head>
        {/* Theme script - must run before React to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Preconnect to critical third-party domains for faster loading */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" />
        <link rel="preconnect" href="https://firestore.googleapis.com" />
        <link rel="preconnect" href="https://www.googleapis.com" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
        <link rel="dns-prefetch" href="https://firestore.googleapis.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        {/* Algolia search */}
        <link rel="preconnect" href="https://algolia.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://algolia.net" />
      </head>
      <body className={`${figtree.className} antialiased`}>
        {children}
      </body>
    </html>
  );
}