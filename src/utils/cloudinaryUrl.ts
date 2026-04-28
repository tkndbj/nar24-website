// utils/cloudinaryUrl.ts

const CLOUD_NAME = "dpeamfn2v";
const STORAGE_BUCKET = "emlak-mobile-app.appspot.com";
const AUTO_UPLOAD_FOLDER = "fb";

export type ImageSize = "thumbnail" | "card" | "detail" | "zoom";

const SIZE_WIDTHS: Record<ImageSize, number> = {
  thumbnail: 200,
  card: 400,
  detail: 800,
  zoom: 1600,
};

// Reads from environment or defaults to true
let _enabled = true;

// Encode a storage path for safe URL interpolation. Segment-aware so the
// "/" separators stay intact while spaces, "#", "?", non-ASCII etc. get
// percent-encoded. Required because raw paths break both Cloudinary and
// the GCS direct URL.
const encodePath = (path: string): string =>
  path.split("/").map(encodeURIComponent).join("/");

export const CloudinaryUrl = {
  get enabled() {
    return _enabled;
  },
  set enabled(val: boolean) {
    _enabled = val;
  },

  /** Custom width URL from a storage path */
  custom(storagePath: string, width: number): string {
    if (!_enabled) return this.firebaseUrl(storagePath);
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_limit,w_${width},f_auto,q_auto/${AUTO_UPLOAD_FOLDER}/${encodePath(storagePath)}`;
  },

  /**
   * Resolve a banner source (storage path OR legacy URL) to primary + fallback.
   *
   * `explicitFallback` — the original tokenized Firebase Storage download URL
   * stored in Firestore. Strongly preferred when available: a tokenized URL
   * always works, whereas the synthesized `firebaseUrl(path)` requires the
   * bucket to be publicly readable.
   */
  resolveBanner(
    source: string,
    width: number,
    explicitFallback?: string | null,
  ): { primary: string; fallback: string | null } {
    const fallback = explicitFallback || null;
    if (!source) return { primary: fallback ?? '', fallback: null };

    if (!_enabled) {
      const direct = this.isStoragePath(source) ? this.firebaseUrl(source) : source;
      return { primary: fallback ?? direct, fallback: null };
    }

    // Storage path (post-migration)
    if (this.isStoragePath(source)) {
      return {
        primary: this.custom(source, width),
        fallback: fallback ?? this.firebaseUrl(source),
      };
    }

    // Legacy URL — extract path, CDN-optimize, original as fallback
    const path = this.extractPathFromUrl(source);
    if (path) {
      return {
        primary: this.custom(path, width),
        fallback: fallback ?? source,
      };
    }

    // Opaque URL — pass through
    return { primary: source, fallback };
  },

  /** Single CDN URL from path or URL — use for prefetching */
  bannerCdn(urlOrPath: string, width: number): string {
    if (!urlOrPath) return '';
    if (!_enabled) {
      return this.isStoragePath(urlOrPath) ? this.firebaseUrl(urlOrPath) : urlOrPath;
    }
    if (this.isStoragePath(urlOrPath)) return this.custom(urlOrPath, width);
    return this.fromUrl(urlOrPath, width);
  },

  /** Build Cloudinary URL from a storage path */
  product(storagePath: string, size: ImageSize = "card"): string {
    if (!_enabled) return this.firebaseUrl(storagePath);
    const w = SIZE_WIDTHS[size];
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_limit,w_${w},f_auto,q_auto/${AUTO_UPLOAD_FOLDER}/${encodePath(storagePath)}`;
  },

  /** Convert a full Firebase URL to Cloudinary URL */
  fromUrl(url: string, width: number): string {
    if (!_enabled) return url;
    const path = this.extractPathFromUrl(url);
    if (!path) return url;
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_limit,w_${width},f_auto,q_auto/${AUTO_UPLOAD_FOLDER}/${encodePath(path)}`;
  },

  /** Direct Firebase Storage URL (fallback) */
  firebaseUrl(storagePath: string): string {
    return `https://storage.googleapis.com/${STORAGE_BUCKET}/${encodePath(storagePath)}`;
  },

  /** True if value is a storage path, not a full URL */
  isStoragePath(value: string): boolean {
    return !value.startsWith("http://") && !value.startsWith("https://");
  },

  /** Handles both legacy URLs and new storage paths */
  productCompat(urlOrPath: string, size: ImageSize = "card"): string {
    if (this.isStoragePath(urlOrPath)) return this.product(urlOrPath, size);
    if (!_enabled) return urlOrPath;
    // Legacy full URL — extract storage path and rewrite through Cloudinary
    const path = this.extractPathFromUrl(urlOrPath);
    if (path) return this.product(path, size);
    return urlOrPath;
  },

  /**
   * Resolve a product source (storage path OR legacy URL) to primary + fallback.
   *
   * `explicitFallback` — see `resolveBanner` for rationale (tokenized download URL).
   */
  resolveProduct(
    source: string,
    size: ImageSize = "card",
    explicitFallback?: string | null,
  ): { primary: string; fallback: string | null } {
    const fallback = explicitFallback || null;
    if (!source) return { primary: fallback ?? "", fallback: null };

    if (!_enabled) {
      const direct = this.isStoragePath(source) ? this.firebaseUrl(source) : source;
      return { primary: fallback ?? direct, fallback: null };
    }

    // Storage path (post-migration)
    if (this.isStoragePath(source)) {
      return {
        primary: this.product(source, size),
        fallback: fallback ?? this.firebaseUrl(source),
      };
    }

    // Legacy URL — extract path, CDN-optimize, original as fallback
    const path = this.extractPathFromUrl(source);
    if (path) {
      return {
        primary: this.product(path, size),
        fallback: fallback ?? source,
      };
    }

    // Opaque URL — pass through, no CDN available
    return { primary: source, fallback };
  },

  /** Extract storage path from Firebase download URL */
  extractPathFromUrl(url: string): string | null {
    try {
      const u = new URL(url);

      // Format 1: firebasestorage.googleapis.com/.../o/ENCODED_PATH?...
      const segments = u.pathname.split("/");
      const oIndex = segments.indexOf("o");
      if (oIndex !== -1 && oIndex + 1 < segments.length) {
        return decodeURIComponent(segments[oIndex + 1]);
      }

      // Format 2: storage.googleapis.com/BUCKET/PATH
      if (u.host === "storage.googleapis.com" && segments.length > 2) {
        return segments.slice(2).join("/");
      }

      return null;
    } catch {
      return null;
    }
  },

  /** Extract fallback Firebase URL from a Cloudinary URL */
  extractFallbackUrl(cloudinaryUrl: string): string | null {
    const marker = `/${AUTO_UPLOAD_FOLDER}/`;
    const idx = cloudinaryUrl.indexOf(marker);
    if (idx === -1) return null;
    const storagePath = cloudinaryUrl.substring(idx + marker.length);
    return `https://storage.googleapis.com/${STORAGE_BUCKET}/${storagePath}`;
  },
};
