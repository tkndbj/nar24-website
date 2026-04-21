"use client";

// SmartImage — drop-in replacement for next/image that:
//   1. Routes `source` through Cloudinary (size-bucketed CDN URL) via
//      productCompat, so both new storage paths and legacy Firebase
//      download URLs hit the CDN.
//   2. Sets `unoptimized` so Next does NOT re-proxy the CDN response
//      through its own /_next/image optimizer (no double-fetch, no
//      Cloudinary's f_auto being overridden by Next's encoder).
//   3. Falls back to the raw Firebase Storage URL on CDN error so a
//      Cloudinary outage or a single bad path doesn't break the image.
//
// Accepts every next/image prop EXCEPT `src` and `unoptimized` (controlled
// here) and `onError` (wrapped — use `onFallbackError` to observe both).
//
// Use this anywhere a product / shop / user / review image is rendered.
// Static public assets (e.g. /icons/foo.svg) should keep using raw
// <Image /> so Next's optimizer can serve them.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Image, { ImageProps } from "next/image";
import { CloudinaryUrl, type ImageSize } from "@/utils/cloudinaryUrl";

type NextImageProps = Omit<
  ImageProps,
  "src" | "unoptimized" | "onError"
>;

interface SmartImageProps extends NextImageProps {
  /** Firebase storage path OR legacy Firebase download URL OR pre-built Cloudinary URL */
  source: string;
  /** CDN size bucket: thumbnail(200) / card(400) / detail(800) / zoom(1600) */
  size?: ImageSize;
  /** Called after BOTH the CDN primary and the Firebase fallback fail */
  onFallbackError?: () => void;
}

export default function SmartImage({
  source,
  size = "card",
  onFallbackError,
  alt = "",
  ...rest
}: SmartImageProps) {
  // Primary: Cloudinary CDN URL at the requested size bucket.
  // productCompat handles both storage paths and legacy Firebase URLs
  // (extracts the path from the URL to rebuild the CDN URL).
  const primary = useMemo(
    () => (source ? CloudinaryUrl.productCompat(source, size) : ""),
    [source, size],
  );

  // Fallback: raw Firebase Storage URL. If source is a storage path we
  // compute the Firebase URL directly; if it's already a Firebase URL we
  // use it unchanged; if opaque, no fallback is available.
  const fallback = useMemo(() => {
    if (!source) return "";
    if (CloudinaryUrl.isStoragePath(source)) {
      return CloudinaryUrl.firebaseUrl(source);
    }
    // Legacy Firebase download URL — use as-is.
    const path = CloudinaryUrl.extractPathFromUrl(source);
    if (path) return source;
    // Opaque URL (e.g. Google avatar) — no derivable fallback.
    return "";
  }, [source]);

  const [src, setSrc] = useState(primary);

  // Reset when primary changes (e.g. user navigates to a different product)
  useEffect(() => {
    setSrc(primary);
  }, [primary]);

  const handleError = useCallback(() => {
    if (src === primary && fallback && fallback !== primary) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[SmartImage] Cloudinary failed, falling back to Firebase:",
          primary.substring(0, 80),
        );
      }
      setSrc(fallback);
    } else {
      onFallbackError?.();
    }
  }, [src, primary, fallback, onFallbackError]);

  if (!src) return null;

  return (
    <Image
      {...rest}
      src={src}
      alt={alt}
      onError={handleError}
      unoptimized
    />
  );
}
