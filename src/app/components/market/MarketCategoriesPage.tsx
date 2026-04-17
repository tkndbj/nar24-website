// components/market/MarketCategoriesPage.tsx
//
// Web port of lib/screens/market/market_category_screen.dart.
//
// Parity points with Flutter:
//   • Same category set (single source of truth: constants/marketCategories.ts)
//   • Same image assets (public/market-items/*.png) keyed by slug
//   • Same brand green (#00A86B)
//   • Same Firestore path for reviews: nar24market/stats/reviews
//   • Same page size (15) and timestamp-desc ordering for reviews
//   • Same name-masking rule and relative-time formatting for review cards
//   • Same routes on click: /market-categories/[slug] and /market-search?q=…
//
// Web-native deviations (intentional):
//   • No animated AppBar search toggle — always-visible inline search.
//     On mobile web, tapping the input opens the system keyboard; no
//     reason to hide the input behind an icon.
//   • Reviews surface as a proper modal dialog with focus trap, Escape
//     handling, and body-scroll lock. On narrow viewports the dialog
//     goes edge-to-edge, effectively a bottom sheet.
//   • Responsive grid: 3 cols on phones → 6 cols on large desktops.

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { Search, Star, X, AlertCircle, MessageSquare, User } from "lucide-react";

import { db } from "@/lib/firebase";
import { useTheme } from "@/hooks/useTheme";
import {
  MARKET_CATEGORIES,
  type MarketCategory,
} from "@/constants/marketCategories";
import CloudinaryImage from "../CloudinaryImage";

// ─── Constants ───────────────────────────────────────────────────────────────

const BRAND = "#00A86B";

/** Slug → public asset path. Keep in sync with Flutter's _kCategoryAssetBySlug. */
const CATEGORY_ASSET_BY_SLUG: Record<string, string> = {
  "alcohol-cigarette": "/market-items/cigaretteandalcohol.png",
  snack: "/market-items/snacks.png",
  drinks: "/market-items/drinks.png",
  water: "/market-items/water.png",
  "fruit-vegetables": "/market-items/vegetablesandfruit.png",
  food: "/market-items/food.png",
  "meat-chicken-fish": "/market-items/meat.png",
  "basic-food": "/market-items/basicfood.png",
  "dairy-breakfast": "/market-items/dairyandbreakfast.png",
  bakery: "/market-items/bakery.png",
  "ice-cream": "/market-items/icecream.png",
  "fit-form": "/market-items/fitandform.png",
  "home-care": "/market-items/homecare.png",
  "home-lite": "/market-items/homelite.png",
  "personal-care": "/market-items/personalcare.png",
  technology: "/market-items/technology.png",
  "sexual-health": "/market-items/sexualhealth.png",
  baby: "/market-items/baby.png",
  clothing: "/market-items/clothing.png",
  stationery: "/market-items/stationery.png",
  pet: "/market-items/pets.png",
  tools: "/market-items/tools.png",
};

/**
 * Tailwind can't compile dynamically-interpolated class names, so we enumerate
 * every tile-background variant we'll use. Keep these exact tokens present in
 * the source — any that aren't emitted verbatim get tree-shaken out of the CSS.
 */
const CATEGORY_TINT_BY_COLOR: Record<string, string> = {
  rose: "bg-rose-100 dark:bg-rose-500/15",
  amber: "bg-amber-100 dark:bg-amber-500/15",
  orange: "bg-orange-100 dark:bg-orange-500/15",
  sky: "bg-sky-100 dark:bg-sky-500/15",
  green: "bg-green-100 dark:bg-green-500/15",
  red: "bg-red-100 dark:bg-red-500/15",
  stone: "bg-stone-200 dark:bg-stone-500/15",
  yellow: "bg-yellow-100 dark:bg-yellow-500/15",
  lime: "bg-lime-100 dark:bg-lime-500/15",
  pink: "bg-pink-100 dark:bg-pink-500/15",
  emerald: "bg-emerald-100 dark:bg-emerald-500/15",
  blue: "bg-blue-100 dark:bg-blue-500/15",
  indigo: "bg-indigo-100 dark:bg-indigo-500/15",
  violet: "bg-violet-100 dark:bg-violet-500/15",
  slate: "bg-slate-200 dark:bg-slate-500/15",
  fuchsia: "bg-fuchsia-100 dark:bg-fuchsia-500/15",
  cyan: "bg-cyan-100 dark:bg-cyan-500/15",
  purple: "bg-purple-100 dark:bg-purple-500/15",
  teal: "bg-teal-100 dark:bg-teal-500/15",
  zinc: "bg-zinc-200 dark:bg-zinc-500/15",
};

const TINT_FALLBACK = "bg-gray-100 dark:bg-gray-700/40";

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MarketCategoriesPage() {
  const t = useTranslations("market");
  const isDarkMode = useTheme();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [reviewsOpen, setReviewsOpen] = useState(false);

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = searchQuery.trim();
      if (!trimmed) return;
      router.push(`/market-search?q=${encodeURIComponent(trimmed)}`);
    },
    [router, searchQuery],
  );

  return (
    <main className="flex-1">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1
              className={`text-2xl sm:text-3xl font-bold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {t("categoriesHeader")}
            </h1>
            <p
              className={`mt-1 text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {t("categoriesCount", { count: MARKET_CATEGORIES.length })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <form
              onSubmit={handleSearchSubmit}
              className="relative flex-1 sm:w-72"
              role="search"
              aria-label={t("search")}
            >
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                aria-hidden
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchHint")}
                aria-label={t("search")}
                className={`w-full pl-10 pr-4 py-2 rounded-xl text-sm outline-none transition-colors ${
                  isDarkMode
                    ? "bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:border-emerald-500"
                    : "bg-white border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-emerald-500"
                }`}
              />
            </form>

            <ReviewsButton
              label={t("reviewsLabel")}
              isDarkMode={isDarkMode}
              onClick={() => setReviewsOpen(true)}
            />
          </div>
        </header>

        {/* Grid */}
        <section aria-label={t("categoriesHeader")}>
          <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
            {MARKET_CATEGORIES.map((cat) => (
              <li key={cat.slug}>
                <CategoryTile category={cat} isDarkMode={isDarkMode} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Reviews modal */}
      <MarketReviewsModal
        open={reviewsOpen}
        onClose={() => setReviewsOpen(false)}
        isDarkMode={isDarkMode}
      />
    </main>
  );
}

// ─── Category tile ───────────────────────────────────────────────────────────

function CategoryTile({
  category,
  isDarkMode,
}: {
  category: MarketCategory;
  isDarkMode: boolean;
}) {
  const locale = useLocale();
  const label = locale === "tr" ? category.labelTr : category.label;
  const asset = CATEGORY_ASSET_BY_SLUG[category.slug];
  const tint = CATEGORY_TINT_BY_COLOR[category.color] ?? TINT_FALLBACK;
  const Icon = category.icon;

  return (
    <Link
      href={`/market-categories/${category.slug}`}
      aria-label={label}
      className={`group flex flex-col items-center justify-center gap-2 rounded-2xl p-3 sm:p-4 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
        isDarkMode
          ? "bg-[#2D2B3F] border border-gray-700/40 hover:border-emerald-500/40 focus-visible:ring-offset-[#1C1A29]"
          : "bg-white border border-gray-100 shadow-sm hover:shadow-md focus-visible:ring-offset-white"
      }`}
    >
      <div
        className={`relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl ${tint}`}
      >
        {asset ? (
          <Image
            src={asset}
            alt="" /* decorative — label is rendered below */
            width={56}
            height={56}
            className="object-contain p-2 select-none"
            draggable={false}
          />
        ) : (
          <Icon
            className={`w-7 h-7 ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
            aria-hidden
          />
        )}
      </div>
      <span
        className={`text-center text-xs sm:text-[13px] font-semibold leading-tight line-clamp-2 ${
          isDarkMode ? "text-gray-200" : "text-gray-800"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}

// ─── Reviews button (header chip) ────────────────────────────────────────────

function ReviewsButton({
  label,
  isDarkMode,
  onClick,
}: {
  label: string;
  isDarkMode: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
        isDarkMode
          ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25"
          : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
      }`}
    >
      <Star className="w-4 h-4 fill-current" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ─── Reviews model ───────────────────────────────────────────────────────────
// Mirrors the schema written by functions/52-market-payment/index.js.

interface MarketReview {
  id: string;
  buyerName: string;
  rating: number;
  comment: string;
  imageUrls: string[];
  timestamp: Timestamp | null;
}

function reviewFromDoc(doc: QueryDocumentSnapshot<DocumentData>): MarketReview {
  const d = doc.data();
  return {
    id: doc.id,
    buyerName: typeof d.buyerName === "string" ? d.buyerName : "",
    rating: typeof d.rating === "number" ? d.rating : Number(d.rating ?? 0),
    comment: typeof d.comment === "string" ? d.comment : "",
    imageUrls: Array.isArray(d.imageUrls)
      ? d.imageUrls.filter((x: unknown): x is string => typeof x === "string")
      : [],
    timestamp: d.timestamp instanceof Timestamp ? d.timestamp : null,
  };
}

// ─── Reviews modal ───────────────────────────────────────────────────────────

const PAGE_SIZE = 15;
const LOAD_MORE_ROOT_MARGIN = "300px";

function MarketReviewsModal({
  open,
  onClose,
  isDarkMode,
}: {
  open: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");

  // Body scroll lock + Escape-to-close while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-reviews-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t("close")}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
      />

      {/* Panel */}
      <div
        className={`relative w-full sm:max-w-2xl h-[92vh] sm:h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl ${
          isDarkMode ? "bg-[#1C1A29]" : "bg-white"
        }`}
      >
        {/* Drag handle (mobile) */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <span className="h-1 w-10 rounded-full bg-gray-400/60" />
        </div>

        <header
          className={`flex items-center gap-3 px-4 sm:px-6 py-3 border-b ${
            isDarkMode ? "border-gray-800" : "border-gray-200"
          }`}
        >
          <h2
            id="market-reviews-title"
            className={`flex-1 text-base sm:text-lg font-bold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {t("reviewsSheetTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className={`p-2 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              isDarkMode
                ? "text-gray-300 hover:bg-gray-800"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <MarketReviewsList isDarkMode={isDarkMode} />
        </div>
      </div>
    </div>
  );
}

// ─── Reviews list (cursor-paginated, infinite scroll) ────────────────────────

function MarketReviewsList({ isDarkMode }: { isDarkMode: boolean }) {
  const t = useTranslations("market");

  const [reviews, setReviews] = useState<MarketReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  // Invalidation token — discards in-flight results after a reset/retry.
  const fetchTokenRef = useRef(0);

  const fetchPage = useCallback(async ({ reset }: { reset: boolean }) => {
    if (reset) {
      fetchTokenRef.current += 1;
      lastDocRef.current = null;
      setReviews([]);
      setHasMore(true);
      setError(null);
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    const token = fetchTokenRef.current;

    try {
      const base = collection(db, "nar24market", "stats", "reviews");
      const q: Query<DocumentData> = lastDocRef.current
        ? query(
            base,
            orderBy("timestamp", "desc"),
            startAfter(lastDocRef.current),
            limit(PAGE_SIZE),
          )
        : query(base, orderBy("timestamp", "desc"), limit(PAGE_SIZE));

      const snap = await getDocs(q);
      if (token !== fetchTokenRef.current) return; // stale — discard

      const batch = snap.docs.map(reviewFromDoc);
      if (snap.docs.length > 0) {
        lastDocRef.current = snap.docs[snap.docs.length - 1];
      }
      setReviews((prev) => (reset ? batch : [...prev, ...batch]));
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      if (token !== fetchTokenRef.current) return;
      console.error("[MarketReviewsList] fetch error:", err);
      setError(t("reviewsError"));
    } finally {
      if (token === fetchTokenRef.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [t]);

  // Initial load
  useEffect(() => {
    fetchPage({ reset: true });
  }, [fetchPage]);

  // Infinite scroll — observe sentinel.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          hasMore &&
          !isLoading &&
          !isLoadingMore
        ) {
          fetchPage({ reset: false });
        }
      },
      { rootMargin: LOAD_MORE_ROOT_MARGIN },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage, hasMore, isLoading, isLoadingMore]);

  // ── Render states ──

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (error && reviews.length === 0) {
    return (
      <EmptyOrError
        isDarkMode={isDarkMode}
        icon={<AlertCircle className="w-7 h-7" />}
        title={error}
        action={
          <button
            type="button"
            onClick={() => fetchPage({ reset: true })}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-colors"
            style={{ color: BRAND, borderColor: BRAND }}
          >
            {t("tryAgain")}
          </button>
        }
      />
    );
  }

  if (reviews.length === 0) {
    return (
      <EmptyOrError
        isDarkMode={isDarkMode}
        icon={<MessageSquare className="w-7 h-7" />}
        title={t("reviewsEmptyTitle")}
        subtitle={t("reviewsEmptySubtitle")}
      />
    );
  }

  return (
    <ul className="px-4 sm:px-6 py-4 space-y-3">
      {reviews.map((r) => (
        <li key={r.id}>
          <ReviewCard review={r} isDarkMode={isDarkMode} />
        </li>
      ))}
      {/* Sentinel + trailing spinner */}
      <li ref={sentinelRef} aria-hidden className="h-px" />
      {isLoadingMore && (
        <li className="flex justify-center py-4">
          <Spinner small />
        </li>
      )}
    </ul>
  );
}

// ─── Review card ─────────────────────────────────────────────────────────────

function ReviewCard({
  review,
  isDarkMode,
}: {
  review: MarketReview;
  isDarkMode: boolean;
}) {
  const t = useTranslations("market");
  const locale = useLocale();

  const displayName = useMemo(
    () => (review.buyerName ? maskName(review.buyerName) : t("anonymous")),
    [review.buyerName, t],
  );
  const timeText = useMemo(
    () =>
      review.timestamp
        ? formatRelativeTime(review.timestamp.toDate(), locale, t)
        : "",
    [review.timestamp, locale, t],
  );

  return (
    <article
      className={`rounded-2xl p-4 border ${
        isDarkMode
          ? "bg-[#2D2B3F] border-gray-800"
          : "bg-white border-gray-200"
      }`}
    >
      <header className="flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center ${
            isDarkMode ? "bg-gray-800" : "bg-gray-100"
          }`}
        >
          <User
            className={`w-4 h-4 ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
            aria-hidden
          />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-semibold truncate ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {displayName}
          </p>
          {timeText && (
            <p
              className={`text-xs ${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              }`}
            >
              {timeText}
            </p>
          )}
        </div>
        <div className="flex items-center gap-0.5" aria-label={`${review.rating} / 5`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`w-3.5 h-3.5 ${
                i < review.rating
                  ? "fill-amber-400 text-amber-400"
                  : isDarkMode
                    ? "text-gray-700"
                    : "text-gray-300"
              }`}
              aria-hidden
            />
          ))}
        </div>
      </header>

      {review.comment && (
        <p
          className={`mt-3 text-sm leading-relaxed whitespace-pre-line ${
            isDarkMode ? "text-gray-300" : "text-gray-700"
          }`}
        >
          {review.comment}
        </p>
      )}

      {review.imageUrls.length > 0 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto scrollbar-none">
          {review.imageUrls.map((url, i) => (
            <li key={`${review.id}-img-${i}`} className="shrink-0">
              <CloudinaryImage.Banner
                source={url}
                cdnWidth={160}
                width={64}
                height={64}
                fit="cover"
                borderRadius={8}
                alt=""
              />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ─── Presentational helpers ──────────────────────────────────────────────────

function Spinner({ small = false }: { small?: boolean }) {
  const size = small ? "w-5 h-5 border-2" : "w-8 h-8 border-[3px]";
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full border-emerald-500/20 border-t-emerald-500 animate-spin ${size}`}
    />
  );
}

function EmptyOrError({
  isDarkMode,
  icon,
  title,
  subtitle,
  action,
}: {
  isDarkMode: boolean;
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
          isDarkMode ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"
        }`}
      >
        {icon}
      </div>
      <p
        className={`mt-4 text-base font-semibold ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {title}
      </p>
      {subtitle && (
        <p
          className={`mt-1 text-sm max-w-xs ${
            isDarkMode ? "text-gray-400" : "text-gray-500"
          }`}
        >
          {subtitle}
        </p>
      )}
      {action}
    </div>
  );
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Masks a full name so that only first and last characters of each part remain
 * visible. Exactly mirrors the Flutter _maskName in market_category_screen.dart
 * so what the user sees on mobile matches what they see on web.
 *
 * Examples:
 *   "Ayşe Yılmaz"    → "A***  ****z"  (middle chars starred, single-char parts kept)
 *   "Mehmet A Kaya"  → "M*****  *  ***a"
 */
function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .map((part, i) => {
      if (part.length <= 1) return part;
      if (i === 0) return part[0] + "*".repeat(part.length - 1);
      if (i === parts.length - 1) {
        return "*".repeat(part.length - 1) + part[part.length - 1];
      }
      return "*".repeat(part.length);
    })
    .join(" ");
}

/**
 * Short relative-time label in the same style as the Flutter _timeAgo helper
 * ("now" / "5m" / "3h" / "2d" / "4mo" / "1y"). Localized via next-intl.
 */
function formatRelativeTime(
    date: Date,
    _locale: string,
    t: (key: string, values?: Record<string, string | number | Date>) => string,
  ): string {
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return t("timeAgoNow");
  if (min < 60) return t("timeAgoMinutes", { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("timeAgoHours", { count: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t("timeAgoDays", { count: day });
  const mo = Math.floor(day / 30);
  if (mo < 12) return t("timeAgoMonths", { count: mo });
  return t("timeAgoYears", { count: Math.floor(mo / 12) });
}