import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin();

// =============================================================================
// SECURITY HEADERS CONFIGURATION
// =============================================================================

const securityHeaders = [
  // Enforce HTTPS for 2 years, include subdomains, allow preload list
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Prevent clickjacking - deny iframe embedding
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  // Prevent MIME type sniffing
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  // Control DNS prefetching
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  // Control referrer information sent with requests
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // Disable browser features you don't need (reduces attack surface)
  {
    key: "Permissions-Policy",
    value: [
      "camera=(self)",           // Allow camera for potential future features
      "microphone=()",           // Disable microphone
      "geolocation=(self)",      // Allow geolocation for shop location
      "browsing-topics=()",      // Disable FLoC/Topics API
      "interest-cohort=()",      // Disable FLoC
      "payment=(self)",          // Allow Payment Request API
      "usb=()",                  // Disable USB access
      "magnetometer=()",         // Disable sensors
      "gyroscope=()",
      "accelerometer=()",
    ].join(", "),
  },
  // Content Security Policy - controls what resources can be loaded
  {
    key: "Content-Security-Policy",
    value: [
      // Default: only allow from same origin
      "default-src 'self'",
  
      // Scripts: self, inline (needed for Next.js), and trusted domains
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://www.googletagmanager.com https://www.google-analytics.com https://*.firebaseapp.com",
  
      // Styles: self, inline (needed for styled-components/tailwind), Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  
      // Images: self, data URIs, blobs, and trusted domains
      "img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.algolia.net",
  
      // Fonts: self and Google Fonts
      "font-src 'self' https://fonts.gstatic.com data:",
  
      // Connect (API calls): self and all required services
      "connect-src 'self' https://*.googleapis.com https://*.google.com https://*.firebaseio.com https://*.cloudfunctions.net https://*.algolia.net https://*.algolianet.com wss://*.firebaseio.com https://firebasestorage.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.google-analytics.com https://*.vercel-insights.com https://*.vercel-analytics.com https://sanalpos.isbank.com.tr https://*.isbank.com.tr",
  
      // Frames: Google Maps, Firebase Auth, Payment Gateways (Turkish 3D Secure - all major banks)
      "frame-src 'self' https://*.google.com https://*.firebaseapp.com https://accounts.google.com https://*.isbank.com.tr https://*.bkm.com.tr https://*.garanti.com.tr https://*.yapikredi.com.tr https://*.akbank.com https://*.ziraatbank.com.tr https://*.halkbank.com.tr https://*.vakifbank.com.tr https://*.qnbfinansbank.com https://*.teb.com.tr https://*.denizbank.com https://*.ingbank.com.tr https://*.hsbc.com.tr https://*.finansbank.com.tr https://*.kuveytturk.com.tr https://*.albaraka.com.tr https://*.odeabank.com.tr https://*.sekerbank.com.tr https://*.anadolubank.com.tr https://*.intertech.com.tr",
  
      // Media (video/audio)
      "media-src 'self' https://firebasestorage.googleapis.com",
  
      // Object/embed: none
      "object-src 'none'",
  
      // Base URI: self only
      "base-uri 'self'",
  
      // Form actions: self only
      "form-action 'self' https://sanalpos.isbank.com.tr https://*.isbank.com.tr",
  
      // Frame ancestors: none (prevents embedding)
      "frame-ancestors 'none'",
  
      // Upgrade insecure requests
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/**",
      },
    ],
    formats: ["image/webp", "image/avif"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    dangerouslyAllowSVG: false,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? {
      exclude: ["error", "warn"],
    } : false,
  },
  experimental: {
    optimizePackageImports: [
      "firebase",
      "firebase/app",
      "firebase/auth",
      "firebase/firestore",
      "firebase/storage",
      "firebase/functions",
      "@heroicons/react",
      "lucide-react",
      "date-fns",
    ],
  },
  poweredByHeader: false,
  reactStrictMode: true,

  // Apply security headers to all routes
  async headers() {
    return [
      {
        // Apply to all routes
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
