import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/**",
      },
    ],
    // ✅ Image optimization settings
    formats: ["image/webp", "image/avif"], // Modern formats for better compression
    deviceSizes: [640, 750, 828, 1080, 1200, 1920], // Responsive sizes
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384], // Icon/small image sizes
    minimumCacheTTL: 60 * 60 * 24 * 30, // Cache for 30 days
    dangerouslyAllowSVG: false, // Security: block SVG uploads
  },
  // ✅ Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? {
      exclude: ["error", "warn"], // Keep error/warn logs in production
    } : false,
  },
  // ✅ Production optimizations
  swcMinify: true, // Use SWC for faster minification
  poweredByHeader: false, // Remove X-Powered-By header for security
  reactStrictMode: true, // Enable React strict mode
};

export default withNextIntl(nextConfig);
