// components/CloudinaryImage.tsx
// ===================================================================
// CloudinaryImage — the single image component for all product &
// banner rendering in the web app.
//
// Direct port of Flutter's lib/widgets/cloudinary_image.dart.
//
// Responsibilities:
//   1. Build the primary (Cloudinary CDN) URL via cloudinaryUrl helpers.
//   2. Automatically fall back to the raw Firebase Storage URL if the
//      CDN request errors out (Cloudinary down, 5xx, DNS failure, etc.)
//      — per image, no manual flip required.
//   3. Honor the global kill switch (enabled = false) without
//      double-fetching: in that mode the primary URL is already the
//      Firebase Storage URL and fallback is skipped.
//
// Do not render product/banner images with next/image or <img>
// directly anywhere else in the app. Go through this component so the
// fallback behavior lives in one place.
//
// Usage:
//   <CloudinaryImage.Product
//     source="products/uid/main/shoe.jpg"
//     size="card"
//     width={400}
//     height={400}
//   />
//
//   <CloudinaryImage.Banner
//     url="https://storage.googleapis.com/bucket/banners/promo.jpg"
//     cdnWidth={800}
//   />
// ===================================================================

"use client";

import React, { useState, useCallback } from "react";
import Image from "next/image";
import { CloudinaryUrl, type ImageSize } from "@/utils/cloudinaryUrl";

// ─── Shared types ───────────────────────────────────────────────────

interface BaseProps {
  width?: number;
  height?: number;
  /** Mirrors CSS object-fit. Default: "cover" */
  fit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  /** Tailwind border-radius class or px value */
  borderRadius?: string | number;
  className?: string;
  alt?: string;
  /** Custom placeholder shown while loading */
  placeholder?: React.ReactNode;
  /** Custom error widget shown when BOTH primary and fallback fail */
  errorWidget?: React.ReactNode;
  /** next/image priority flag for above-the-fold images */
  priority?: boolean;
  /** next/image sizes hint for responsive images */
  sizes?: string;
}

// ─── Default placeholder & error ────────────────────────────────────

function DefaultPlaceholder({
  width,
  height,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <div
      className="bg-gray-200 dark:bg-gray-700 animate-pulse"
      style={{
        width: width ?? "100%",
        height: height ?? "100%",
      }}
    />
  );
}

function DefaultError({ width, height }: { width?: number; height?: number }) {
  return (
    <div
      className="bg-gray-200 dark:bg-gray-700 flex items-center justify-center"
      style={{
        width: width ?? "100%",
        height: height ?? "100%",
      }}
    >
      <svg
        className="text-gray-400 dark:text-gray-500"
        style={{
          width: Math.min(Math.max((width ?? height ?? 100) * 0.3, 16), 48),
          height: Math.min(Math.max((width ?? height ?? 100) * 0.3, 16), 48),
        }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
        />
      </svg>
    </div>
  );
}

// ─── Core image renderer with fallback ──────────────────────────────

interface CoreImageProps extends BaseProps {
  primary: string;
  fallback?: string | null;
}

function CoreImage({
  primary,
  fallback,
  width,
  height,
  fit = "cover",
  borderRadius,
  className = "",
  alt = "",
  placeholder,
  errorWidget,
  priority = false,
  sizes,
}: CoreImageProps) {
  const [src, setSrc] = useState(primary);
  const [hasErrored, setHasErrored] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleError = useCallback(() => {
    if (src === primary && fallback && fallback !== primary) {
      // Primary failed → try fallback
      console.warn(
        `[CloudinaryImage] Primary failed, falling back: ${primary.substring(0, 80)}…`,
      );
      setSrc(fallback);
    } else {
      // Both failed (or no fallback available)
      setHasErrored(true);
      setIsLoading(false);
    }
  }, [src, primary, fallback]);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Reset state when primary URL changes (e.g. product navigation)
  React.useEffect(() => {
    setSrc(primary);
    setHasErrored(false);
    setIsLoading(true);
  }, [primary]);

  if (!primary || hasErrored) {
    return <>{errorWidget ?? <DefaultError width={width} height={height} />}</>;
  }

  const borderRadiusStyle =
    typeof borderRadius === "number"
      ? { borderRadius: `${borderRadius}px` }
      : {};

  const borderRadiusClass =
    typeof borderRadius === "string" ? borderRadius : "";

  // Use fill mode when both width and height are provided (aspect-ratio container)
  // Use explicit dimensions otherwise
  const useFill = width !== undefined && height !== undefined;

  return (
    <div
      className={`relative overflow-hidden ${borderRadiusClass} ${className}`}
      style={{
        width: width ?? "100%",
        height: height ?? "100%",
        ...borderRadiusStyle,
      }}
    >
      {/* Loading placeholder */}
      {isLoading && (
        <div className="absolute inset-0 z-10">
          {placeholder ?? <DefaultPlaceholder width={width} height={height} />}
        </div>
      )}

      {useFill ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes ?? `${width}px`}
          priority={priority}
          unoptimized
          onError={handleError}
          onLoad={handleLoad}
          className="transition-opacity duration-200"
          style={{
            objectFit: fit,
            opacity: isLoading ? 0 : 1,
          }}
        />
      ) : (
        <Image
          src={src}
          alt={alt}
          width={width ?? 400}
          height={height ?? 400}
          sizes={sizes}
          priority={priority}
          unoptimized
          onError={handleError}
          onLoad={handleLoad}
          className="transition-opacity duration-200"
          style={{
            objectFit: fit,
            width: width ?? "100%",
            height: height ?? "100%",
            opacity: isLoading ? 0 : 1,
          }}
        />
      )}
    </div>
  );
}

// ─── Factory components (mirror Flutter's factory constructors) ──────

// ── CloudinaryImage.Product ─────────────────────────────────────────
// Product image. [source] may be a Firebase Storage path
// (e.g. "products/uid/main/x.jpg") OR a legacy full URL.
//
// [size] selects a standard width bucket (200/400/800/1600) to
// maximize Cloudinary cache hit ratio.

interface ProductProps extends BaseProps {
  /** Storage path or legacy full URL */
  source: string;
  /** Standard size bucket: thumbnail(200), card(400), detail(800), zoom(1600) */
  size: ImageSize;
}

function Product({ source, size, ...rest }: ProductProps) {
  if (!source) {
    return (
      rest.errorWidget ?? (
        <DefaultError width={rest.width} height={rest.height} />
      )
    );
  }

  const primary = CloudinaryUrl.isStoragePath(source)
    ? CloudinaryUrl.product(source, size)
    : CloudinaryUrl.productCompat(source, size);

  const fallback = CloudinaryUrl.isStoragePath(source)
    ? CloudinaryUrl.firebaseUrl(source)
    : null;

  return <CoreImage primary={primary} fallback={fallback} {...rest} />;
}

// ── CloudinaryImage.Banner ──────────────────────────────────────────
// Banner-style image from an arbitrary full URL at an explicit CDN
// width. Falls back to the raw URL on CDN error.
// Mirrors Flutter's CloudinaryImage.fromUrl factory.

interface BannerProps extends BaseProps {
  /** Storage path OR legacy full URL */
  source: string;
  /** CDN width to request from Cloudinary */
  cdnWidth: number;
}

function Banner({ source, cdnWidth, ...rest }: BannerProps) {
  if (!source) {
    return (
      rest.errorWidget ?? (
        <DefaultError width={rest.width} height={rest.height} />
      )
    );
  }

  const { primary, fallback } = CloudinaryUrl.resolveBanner(source, cdnWidth);

  return <CoreImage primary={primary} fallback={fallback} {...rest} />;
}

// ── CloudinaryImage.Compat ──────────────────────────────────────────
// Use when the source might be either a storage path or a legacy URL.
// Mirrors Flutter's productCompat + resolveProduct pattern.
// Convenience for migration — use Product once all docs store paths.

interface CompatProps extends BaseProps {
  /** Storage path OR legacy full URL */
  source: string;
  /** Standard size bucket */
  size: ImageSize;
}

function Compat({ source, size, ...rest }: CompatProps) {
  if (!source) {
    return (
      rest.errorWidget ?? (
        <DefaultError width={rest.width} height={rest.height} />
      )
    );
  }

  const primary = CloudinaryUrl.productCompat(source, size);
  const fallback = CloudinaryUrl.isStoragePath(source)
    ? CloudinaryUrl.firebaseUrl(source)
    : null;

  return <CoreImage primary={primary} fallback={fallback} {...rest} />;
}

// ── CloudinaryImage.Raw ─────────────────────────────────────────────
// Use when the caller already holds a pre-built Cloudinary URL.
// The widget auto-detects whether a Firebase Storage fallback can be
// derived. Mirrors Flutter's CloudinaryImage.fromResolvedUrl factory.

interface RawProps extends BaseProps {
  /** Pre-built URL (Cloudinary or otherwise) */
  url: string;
}

function Raw({ url, ...rest }: RawProps) {
  if (!url) {
    return (
      rest.errorWidget ?? (
        <DefaultError width={rest.width} height={rest.height} />
      )
    );
  }

  // Try to derive a fallback from a Cloudinary auto-upload URL
  const fallback = CloudinaryUrl.extractFallbackUrl(url);

  return <CoreImage primary={url} fallback={fallback} {...rest} />;
}

// ─── Compound export ────────────────────────────────────────────────

const CloudinaryImage = {
  /** Product image from storage path or legacy URL + standard size bucket */
  Product,
  /** Banner image from full URL + explicit CDN width */
  Banner,
  /** Migration helper: handles both paths and legacy URLs */
  Compat,
  /** Pre-built URL with auto-detected fallback */
  Raw,
  /** Core renderer — use when you already have primary + fallback URLs */
  Core: CoreImage,
};

export default CloudinaryImage;
export { Product, Banner, Compat, Raw, CoreImage };
export type { ProductProps, BannerProps, CompatProps, RawProps, BaseProps };
