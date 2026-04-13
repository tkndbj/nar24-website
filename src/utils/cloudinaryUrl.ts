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

export const CloudinaryUrl = {
  get enabled() {
    return _enabled;
  },
  set enabled(val: boolean) {
    _enabled = val;
  },

  /** Build Cloudinary URL from a storage path */
  product(storagePath: string, size: ImageSize = "card"): string {
    if (!_enabled) return this.firebaseUrl(storagePath);
    const w = SIZE_WIDTHS[size];
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_limit,w_${w},f_auto,q_auto/${AUTO_UPLOAD_FOLDER}/${storagePath}`;
  },

  /** Convert a full Firebase URL to Cloudinary URL */
  fromUrl(url: string, width: number): string {
    if (!_enabled) return url;
    const path = this.extractPathFromUrl(url);
    if (!path) return url;
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_limit,w_${width},f_auto,q_auto/${AUTO_UPLOAD_FOLDER}/${path}`;
  },

  /** Direct Firebase Storage URL (fallback) */
  firebaseUrl(storagePath: string): string {
    return `https://storage.googleapis.com/${STORAGE_BUCKET}/${storagePath}`;
  },

  /** True if value is a storage path, not a full URL */
  isStoragePath(value: string): boolean {
    return !value.startsWith("http://") && !value.startsWith("https://");
  },

  /** Handles both legacy URLs and new storage paths */
  productCompat(urlOrPath: string, size: ImageSize = "card"): string {
    if (this.isStoragePath(urlOrPath)) return this.product(urlOrPath, size);
    return urlOrPath;
  },

  /** Extract storage path from Firebase download URL */
  extractPathFromUrl(url: string): string | null {
    try {
      const u = new URL(url);
      const segments = u.pathname.split("/");
      const oIndex = segments.indexOf("o");
      if (oIndex !== -1 && oIndex + 1 < segments.length) {
        return decodeURIComponent(segments[oIndex + 1]);
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
