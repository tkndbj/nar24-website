"use client";

// pending-product-applications/page.tsx
// ===================================================================
// Vitrin user's product application tracker — mirrors Flutter's
// vitrin_pending_product_applications.dart with real cursor pagination
// instead of "fetch everything at once".
//
// Behavior contract (matches the Flutter screen except where noted):
//   • Three tabs: pending (default), approved, rejected.
//   • Each tab pulls from BOTH `vitrin_product_applications` (new
//     listings) and `vitrin_edit_product_applications` (edit requests),
//     filtered by `userId == auth.uid` and `status == tab`.
//   • Tabs are loaded lazily — only the active tab fetches, switching
//     to a previously-loaded tab is instant.
//   • Pagination: cursor-based, 10 per source per fetch, merged and
//     sorted by `createdAt desc` client-side. "Load more" pulls the
//     next 10 from each source that still has more. (Flutter loads
//     everything at once; the user explicitly asked for paginated 10.)
//   • Cards: image + status badge + edit-application badge + name +
//     price + category path + rejection reason snippet + submitted at.
//   • Tap a card → modal with full detail (mirrors Flutter's bottom
//     sheet): images strip, name, price, description, attributes,
//     colors, edited-fields chips, rejection reason, timestamps.
//
// Required Firestore composite indexes (created on first run via the
// console link Firestore returns in the error):
//   • vitrin_product_applications: userId asc + status asc + createdAt desc
//   • vitrin_edit_product_applications: userId asc + status asc + createdAt desc
// ===================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  Pencil,
  ChevronRight,
  X,
  LogIn,
  Loader2,
  Inbox,
} from "lucide-react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUser } from "@/context/UserProvider";
import { useTheme } from "@/hooks/useTheme";
import CloudinaryImage from "@/app/components/CloudinaryImage";

// ─── Types ────────────────────────────────────────────────────────────

type TabKey = "pending" | "approved" | "rejected";
const TAB_KEYS: TabKey[] = ["pending", "approved", "rejected"];

interface VitrinApplication {
  id: string;
  applicationId?: string;
  productName: string;
  description: string;
  price: number;
  quantity: number;
  category: string;
  subcategory: string;
  subsubcategory: string;
  condition: string;
  brandModel?: string;
  imageUrls: string[];
  status: TabKey;
  submittedAt: Date;
  reviewedAt?: Date | null;
  rejectionReason?: string | null;
  userId: string;
  gender?: string | null;
  deliveryOption?: string | null;
  availableColors?: string[];
  colorQuantities?: Record<string, number>;
  editType?: string | null;
  originalProductId?: string | null;
  editedFields?: string[];
  isEditApplication: boolean;
}

interface TabState {
  items: VitrinApplication[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMoreNew: boolean;
  hasMoreEdit: boolean;
  lastNewDoc: QueryDocumentSnapshot<DocumentData> | null;
  lastEditDoc: QueryDocumentSnapshot<DocumentData> | null;
  initialized: boolean;
  error: string | null;
}

const PAGE_SIZE = 10;

const NEW_COLLECTION = "vitrin_product_applications";
const EDIT_COLLECTION = "vitrin_edit_product_applications";

// ─── Helpers ──────────────────────────────────────────────────────────

const initialTabState = (): TabState => ({
  items: [],
  isLoading: false,
  isLoadingMore: false,
  hasMoreNew: true,
  hasMoreEdit: true,
  lastNewDoc: null,
  lastEditDoc: null,
  initialized: false,
  error: null,
});

const toDate = (value: unknown): Date => {
  if (!value) return new Date(0);
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return isNaN(parsed) ? new Date(0) : new Date(parsed);
  }
  if (typeof value === "object" && value !== null && "seconds" in value) {
    const seconds = (value as { seconds: number }).seconds;
    return new Date(seconds * 1000);
  }
  return new Date(0);
};

const parseApplication = (
  doc: QueryDocumentSnapshot<DocumentData>,
  isEdit: boolean,
): VitrinApplication => {
  const data = doc.data();
  const status = (data.status as string) ?? "pending";
  const safeStatus: TabKey =
    status === "approved" || status === "rejected" ? status : "pending";

  // Edit apps prefer submittedAt; new apps prefer createdAt.
  const submittedAtRaw = isEdit
    ? data.submittedAt ?? data.createdAt
    : data.createdAt ?? data.submittedAt;

  const priceRaw = data.price;
  const price =
    typeof priceRaw === "number"
      ? priceRaw
      : parseFloat(String(priceRaw ?? "0")) || 0;

  const quantityRaw = data.quantity;
  const quantity =
    typeof quantityRaw === "number"
      ? quantityRaw
      : parseInt(String(quantityRaw ?? "0"), 10) || 0;

  return {
    id: doc.id,
    applicationId:
      typeof data.applicationId === "string" ? data.applicationId : doc.id,
    productName:
      (data.productName as string) ?? (data.title as string) ?? "",
    description: (data.description as string) ?? "",
    price,
    quantity,
    category: (data.category as string) ?? "",
    subcategory: (data.subcategory as string) ?? "",
    subsubcategory: (data.subsubcategory as string) ?? "",
    condition: (data.condition as string) ?? "",
    brandModel:
      (data.brandModel as string) ?? (data.brand as string) ?? undefined,
    imageUrls: Array.isArray(data.imageUrls)
      ? (data.imageUrls as unknown[]).map((v) => String(v))
      : [],
    status: safeStatus,
    submittedAt: toDate(submittedAtRaw),
    reviewedAt: data.reviewedAt ? toDate(data.reviewedAt) : null,
    rejectionReason:
      typeof data.rejectionReason === "string" ? data.rejectionReason : null,
    userId: (data.userId as string) ?? "",
    gender: typeof data.gender === "string" ? data.gender : null,
    deliveryOption:
      typeof data.deliveryOption === "string" ? data.deliveryOption : null,
    availableColors: Array.isArray(data.availableColors)
      ? (data.availableColors as unknown[]).map((v) => String(v))
      : undefined,
    colorQuantities:
      data.colorQuantities && typeof data.colorQuantities === "object"
        ? Object.entries(data.colorQuantities as Record<string, unknown>).reduce<
            Record<string, number>
          >((acc, [k, v]) => {
            const n = typeof v === "number" ? v : parseInt(String(v), 10);
            if (!isNaN(n)) acc[k] = n;
            return acc;
          }, {})
        : undefined,
    editType: isEdit ? ((data.editType as string) ?? "product_edit") : null,
    originalProductId:
      typeof data.originalProductId === "string"
        ? data.originalProductId
        : null,
    editedFields: Array.isArray(data.editedFields)
      ? (data.editedFields as unknown[]).map((v) => String(v))
      : undefined,
    isEditApplication: isEdit,
  };
};

// Stable ordering: combined results sorted by submittedAt desc, ties
// broken by id so the same app never reorders between renders.
const sortApps = (a: VitrinApplication, b: VitrinApplication) => {
  const diff = b.submittedAt.getTime() - a.submittedAt.getTime();
  return diff !== 0 ? diff : a.id.localeCompare(b.id);
};

// ─── Page ─────────────────────────────────────────────────────────────

export default function PendingProductApplicationsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useUser();
  const isDarkMode = useTheme();
  const t = useTranslations("PendingProductApplications");
  const tFields = useTranslations("PendingProductApplications.fields");
  const locale = useLocale();

  const [activeTab, setActiveTab] = useState<TabKey>("pending");
  const [tabs, setTabs] = useState<Record<TabKey, TabState>>({
    pending: initialTabState(),
    approved: initialTabState(),
    rejected: initialTabState(),
  });
  const [selectedApp, setSelectedApp] = useState<VitrinApplication | null>(
    null,
  );

  // Track in-flight loads per tab so a rapid double tab-switch doesn't
  // double-fire the initial fetch. We can't gate on tabs[tab].isLoading
  // alone because state updates are async.
  const inFlight = useRef<Set<TabKey>>(new Set());

  const buildLocalizedUrl = useCallback(
    (path: string): string => {
      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
      return locale === "tr" ? `/${cleanPath}` : `/${locale}/${cleanPath}`;
    },
    [locale],
  );

  // ── Fetch (initial + load-more) ────────────────────────────────
  const fetchTab = useCallback(
    async (tab: TabKey, isLoadMore: boolean) => {
      if (!user) return;
      if (inFlight.current.has(tab)) return;
      inFlight.current.add(tab);

      // Read the freshest cursors via a setTabs callback so we don't
      // race against an in-flight update from another fetch on this tab
      // (load-more after initial load, retry after error, etc.). Then
      // flip the loading flags in the same render so the UI updates
      // synchronously with the read.
      const cursors = await new Promise<{
        newDoc: QueryDocumentSnapshot<DocumentData> | null;
        editDoc: QueryDocumentSnapshot<DocumentData> | null;
        hasMoreNew: boolean;
        hasMoreEdit: boolean;
      }>((resolve) => {
        setTabs((prev) => {
          resolve({
            newDoc: isLoadMore ? prev[tab].lastNewDoc : null,
            editDoc: isLoadMore ? prev[tab].lastEditDoc : null,
            hasMoreNew: isLoadMore ? prev[tab].hasMoreNew : true,
            hasMoreEdit: isLoadMore ? prev[tab].hasMoreEdit : true,
          });
          return {
            ...prev,
            [tab]: {
              ...prev[tab],
              isLoading: !isLoadMore,
              isLoadingMore: isLoadMore,
              error: null,
            },
          };
        });
      });

      try {

        const queries: Promise<{
          source: "new" | "edit";
          docs: QueryDocumentSnapshot<DocumentData>[];
        }>[] = [];

        if (cursors.hasMoreNew) {
          let q = query(
            collection(db, NEW_COLLECTION),
            where("userId", "==", user.uid),
            where("status", "==", tab),
            orderBy("createdAt", "desc"),
            limit(PAGE_SIZE),
          );
          if (cursors.newDoc) q = query(q, startAfter(cursors.newDoc));
          queries.push(
            getDocs(q).then((s) => ({ source: "new" as const, docs: s.docs })),
          );
        }

        if (cursors.hasMoreEdit) {
          let q = query(
            collection(db, EDIT_COLLECTION),
            where("userId", "==", user.uid),
            where("status", "==", tab),
            orderBy("createdAt", "desc"),
            limit(PAGE_SIZE),
          );
          if (cursors.editDoc) q = query(q, startAfter(cursors.editDoc));
          queries.push(
            getDocs(q).then((s) => ({ source: "edit" as const, docs: s.docs })),
          );
        }

        if (queries.length === 0) {
          setTabs((prev) => ({
            ...prev,
            [tab]: {
              ...prev[tab],
              isLoading: false,
              isLoadingMore: false,
              initialized: true,
            },
          }));
          return;
        }

        const results = await Promise.all(queries);

        const fetched: VitrinApplication[] = [];
        let nextNewDoc: QueryDocumentSnapshot<DocumentData> | null =
          cursors.newDoc;
        let nextEditDoc: QueryDocumentSnapshot<DocumentData> | null =
          cursors.editDoc;
        let nextHasMoreNew = cursors.hasMoreNew;
        let nextHasMoreEdit = cursors.hasMoreEdit;

        for (const result of results) {
          if (result.source === "new") {
            for (const d of result.docs) {
              fetched.push(parseApplication(d, false));
            }
            nextNewDoc =
              result.docs.length > 0
                ? result.docs[result.docs.length - 1]
                : nextNewDoc;
            nextHasMoreNew = result.docs.length === PAGE_SIZE;
          } else {
            for (const d of result.docs) {
              fetched.push(parseApplication(d, true));
            }
            nextEditDoc =
              result.docs.length > 0
                ? result.docs[result.docs.length - 1]
                : nextEditDoc;
            nextHasMoreEdit = result.docs.length === PAGE_SIZE;
          }
        }

        setTabs((prev) => {
          const merged = isLoadMore
            ? [...prev[tab].items, ...fetched]
            : fetched;
          // Dedupe by id (defensive — Firestore cursors should make this
          // unnecessary, but a stale render or repeated initial-load
          // could otherwise cause a duplicate React key error).
          const seen = new Set<string>();
          const deduped = merged.filter((a) => {
            if (seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
          });
          deduped.sort(sortApps);
          return {
            ...prev,
            [tab]: {
              ...prev[tab],
              items: deduped,
              lastNewDoc: nextNewDoc,
              lastEditDoc: nextEditDoc,
              hasMoreNew: nextHasMoreNew,
              hasMoreEdit: nextHasMoreEdit,
              isLoading: false,
              isLoadingMore: false,
              initialized: true,
              error: null,
            },
          };
        });
      } catch (err) {
        console.error(`Error loading ${tab} applications:`, err);
        setTabs((prev) => ({
          ...prev,
          [tab]: {
            ...prev[tab],
            isLoading: false,
            isLoadingMore: false,
            initialized: true,
            error: t("errorLoading"),
          },
        }));
      } finally {
        inFlight.current.delete(tab);
      }
    },
    // `tabs` is intentionally omitted — we always read the latest state
    // through setTabs callbacks. Including it would make every tab
    // mutation invalidate this callback and cause re-fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, t],
  );

  // ── Lazy load: fetch the active tab the first time it's visited ──
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    const state = tabs[activeTab];
    if (state.initialized) return;
    if (state.isLoading) return;
    fetchTab(activeTab, false);
  }, [activeTab, authLoading, user, tabs, fetchTab]);

  // Reset all tabs when the auth user changes (e.g. login/logout)
  const lastUidRef = useRef<string | null>(null);
  useEffect(() => {
    const uid = user?.uid ?? null;
    if (lastUidRef.current === uid) return;
    lastUidRef.current = uid;
    setTabs({
      pending: initialTabState(),
      approved: initialTabState(),
      rejected: initialTabState(),
    });
    inFlight.current.clear();
  }, [user]);

  // ── Render guards ──────────────────────────────────────────────
  if (authLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${
          isDarkMode ? "bg-gray-950" : "bg-gray-50/50"
        }`}
      >
        <Loader2
          className={`w-6 h-6 animate-spin ${
            isDarkMode ? "text-gray-500" : "text-gray-400"
          }`}
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className={`min-h-screen ${
          isDarkMode ? "bg-gray-950" : "bg-gray-50/50"
        }`}
      >
        <Header
          isDarkMode={isDarkMode}
          title={t("title")}
          onBack={() => router.back()}
        />
        <div className="flex flex-col items-center justify-center px-4 py-24">
          <div
            className={`w-16 h-16 mb-4 rounded-2xl flex items-center justify-center ${
              isDarkMode ? "bg-gray-900" : "bg-gray-100"
            }`}
          >
            <LogIn
              size={28}
              className={isDarkMode ? "text-gray-700" : "text-gray-300"}
            />
          </div>
          <p
            className={`text-sm mb-4 text-center ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            {t("loginPrompt")}
          </p>
          <button
            onClick={() => router.push(buildLocalizedUrl("/login"))}
            className="inline-flex items-center px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
          >
            {t("login")}
          </button>
        </div>
      </div>
    );
  }

  const activeState = tabs[activeTab];

  return (
    <div
      className={`min-h-screen ${
        isDarkMode ? "bg-gray-950" : "bg-gray-50/50"
      }`}
    >
      <Header
        isDarkMode={isDarkMode}
        title={t("title")}
        subtitle={t("subtitle")}
        onBack={() => router.back()}
      />

      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4">
        {/* Tabs */}
        <div
          className={`p-1 rounded-xl border mb-4 inline-flex w-full sm:w-auto ${
            isDarkMode
              ? "bg-gray-900 border-gray-800"
              : "bg-white border-gray-200"
          }`}
        >
          {TAB_KEYS.map((key) => {
            const isActive = activeTab === key;
            const Icon =
              key === "pending"
                ? Clock
                : key === "approved"
                  ? CheckCircle2
                  : XCircle;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm"
                    : isDarkMode
                      ? "text-gray-400 hover:text-gray-200"
                      : "text-gray-600 hover:text-gray-800"
                }`}
              >
                <Icon size={13} />
                <span>{t(`tabs.${key}`)}</span>
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <TabContent
          state={activeState}
          tab={activeTab}
          isDarkMode={isDarkMode}
          locale={locale}
          onLoadMore={() => fetchTab(activeTab, true)}
          onRetry={() => fetchTab(activeTab, false)}
          onSelect={setSelectedApp}
          t={t}
          tFields={tFields}
        />
      </div>

      {selectedApp && (
        <DetailModal
          application={selectedApp}
          isDarkMode={isDarkMode}
          locale={locale}
          onClose={() => setSelectedApp(null)}
          t={t}
          tFields={tFields}
        />
      )}
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────

function Header({
  isDarkMode,
  title,
  subtitle,
  onBack,
}: {
  isDarkMode: boolean;
  title: string;
  subtitle?: string;
  onBack: () => void;
}) {
  return (
    <div
      className={`sticky top-14 z-30 backdrop-blur-xl border-b ${
        isDarkMode
          ? "bg-gray-950/80 border-gray-800/80"
          : "bg-white/80 border-gray-100/80"
      }`}
    >
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-2 flex items-center gap-3">
        <button
          onClick={onBack}
          className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
              : "bg-gray-50 border-gray-200 hover:bg-gray-100"
          }`}
          aria-label="Back"
        >
          <ArrowLeft
            className={`w-4 h-4 ${
              isDarkMode ? "text-gray-300" : "text-gray-600"
            }`}
          />
        </button>
        <div className="min-w-0">
          <h1
            className={`text-lg font-bold truncate ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={`text-[11px] truncate ${
                isDarkMode ? "text-gray-500" : "text-gray-500"
              }`}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab content ──────────────────────────────────────────────────────

interface TabContentProps {
  state: TabState;
  tab: TabKey;
  isDarkMode: boolean;
  locale: string;
  onLoadMore: () => void;
  onRetry: () => void;
  onSelect: (app: VitrinApplication) => void;
  t: ReturnType<typeof useTranslations>;
  tFields: ReturnType<typeof useTranslations>;
}

function TabContent({
  state,
  tab,
  isDarkMode,
  locale,
  onLoadMore,
  onRetry,
  onSelect,
  t,
}: TabContentProps) {
  if (!state.initialized && state.isLoading) {
    return <SkeletonGrid isDarkMode={isDarkMode} />;
  }

  if (state.error) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16">
        <p
          className={`text-sm mb-4 ${
            isDarkMode ? "text-red-400" : "text-red-600"
          }`}
        >
          {state.error}
        </p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg transition-colors"
        >
          {t("loadMore")}
        </button>
      </div>
    );
  }

  if (state.items.length === 0) {
    return <EmptyState tab={tab} isDarkMode={isDarkMode} t={t} />;
  }

  const hasMore = state.hasMoreNew || state.hasMoreEdit;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {state.items.map((app) => (
          <ApplicationCard
            key={app.id}
            application={app}
            isDarkMode={isDarkMode}
            locale={locale}
            onClick={() => onSelect(app)}
            t={t}
          />
        ))}
      </div>

      {/* Load more / footer */}
      <div className="flex flex-col items-center gap-2 py-6">
        {hasMore && !state.isLoadingMore && (
          <button
            onClick={onLoadMore}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-medium transition-colors ${
              isDarkMode
                ? "border-gray-800 text-gray-300 hover:bg-gray-900"
                : "border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {t("loadMore")}
          </button>
        )}
        {state.isLoadingMore && (
          <Loader2
            className={`w-5 h-5 animate-spin ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          />
        )}
        <p
          className={`text-[11px] ${
            isDarkMode ? "text-gray-600" : "text-gray-500"
          }`}
        >
          {hasMore
            ? t("showingResultsMore", { count: state.items.length })
            : t("showingResults", { count: state.items.length })}
        </p>
        {!hasMore && state.items.length > 0 && (
          <p
            className={`text-[11px] ${
              isDarkMode ? "text-gray-700" : "text-gray-400"
            }`}
          >
            {t("endOfList")}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────

function SkeletonGrid({ isDarkMode }: { isDarkMode: boolean }) {
  const cellClass = isDarkMode
    ? "bg-gray-900 border-gray-800"
    : "bg-white border-gray-100";
  const shimmerClass = isDarkMode ? "bg-gray-800" : "bg-gray-200";
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className={`rounded-2xl border overflow-hidden ${cellClass} animate-pulse`}
        >
          <div className={`aspect-[4/3] ${shimmerClass}`} />
          <div className="p-3 space-y-2">
            <div className={`h-3 w-3/4 rounded ${shimmerClass}`} />
            <div className={`h-3 w-1/2 rounded ${shimmerClass}`} />
            <div className={`h-2 w-2/3 rounded ${shimmerClass}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────

function EmptyState({
  tab,
  isDarkMode,
  t,
}: {
  tab: TabKey;
  isDarkMode: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const titleKey =
    tab === "pending"
      ? "empty.pendingTitle"
      : tab === "approved"
        ? "empty.approvedTitle"
        : "empty.rejectedTitle";
  const descKey =
    tab === "pending"
      ? "empty.pendingDescription"
      : tab === "approved"
        ? "empty.approvedDescription"
        : "empty.rejectedDescription";
  return (
    <div className="flex flex-col items-center justify-center px-4 py-16">
      <div
        className={`w-16 h-16 mb-4 rounded-2xl flex items-center justify-center ${
          isDarkMode ? "bg-gray-900" : "bg-gray-100"
        }`}
      >
        <Inbox
          size={28}
          className={isDarkMode ? "text-gray-700" : "text-gray-300"}
        />
      </div>
      <h3
        className={`text-sm font-semibold mb-1 ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {t(titleKey)}
      </h3>
      <p
        className={`text-xs text-center max-w-xs ${
          isDarkMode ? "text-gray-500" : "text-gray-500"
        }`}
      >
        {t(descKey)}
      </p>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────

interface ApplicationCardProps {
  application: VitrinApplication;
  isDarkMode: boolean;
  locale: string;
  onClick: () => void;
  t: ReturnType<typeof useTranslations>;
}

function ApplicationCard({
  application,
  isDarkMode,
  locale,
  onClick,
  t,
}: ApplicationCardProps) {
  const cardBg = isDarkMode
    ? "bg-gray-900 border-gray-800"
    : "bg-white border-gray-200";

  const formattedPrice = useMemo(
    () => formatPrice(application.price, locale),
    [application.price, locale],
  );
  const formattedDate = useMemo(
    () => formatDate(application.submittedAt, locale, false),
    [application.submittedAt, locale],
  );
  const categoryPath = useMemo(
    () =>
      [application.category, application.subcategory, application.subsubcategory]
        .filter(Boolean)
        .join(" > "),
    [application.category, application.subcategory, application.subsubcategory],
  );

  const firstImage = application.imageUrls[0];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative text-left rounded-2xl border overflow-hidden transition-shadow hover:shadow-md ${cardBg}`}
    >
      <div className="relative aspect-[4/3] bg-gray-100 dark:bg-gray-800">
        {firstImage ? (
          <CloudinaryImage.Raw
            url={firstImage}
            alt={application.productName}
            width={400}
            height={300}
            fit="cover"
            sizes="(max-width: 768px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon
              className={isDarkMode ? "text-gray-700" : "text-gray-300"}
              size={28}
            />
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-2 left-2">
          <StatusBadge status={application.status} t={t} />
        </div>

        {/* Edit / new application badge */}
        <div className="absolute top-2 right-2">
          {application.isEditApplication ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              <Pencil size={9} />
              {t("card.editApplication")}
            </span>
          ) : null}
        </div>

        {/* Image count chip */}
        {application.imageUrls.length > 1 && (
          <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-medium">
            <ImageIcon size={9} />
            {application.imageUrls.length}
          </div>
        )}
      </div>

      <div className="p-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={`text-xs font-semibold leading-snug line-clamp-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {application.productName}
          </h3>
          <span className="text-xs font-bold text-indigo-500 whitespace-nowrap">
            {formattedPrice}
          </span>
        </div>

        {categoryPath && (
          <p
            className={`text-[10px] line-clamp-1 ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            {categoryPath}
          </p>
        )}

        {application.status === "rejected" && application.rejectionReason && (
          <p className="text-[10px] line-clamp-1 px-2 py-1 rounded-md bg-red-50 text-red-700 border border-red-100 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20">
            {application.rejectionReason}
          </p>
        )}

        <div
          className={`flex items-center justify-between text-[10px] pt-0.5 ${
            isDarkMode ? "text-gray-500" : "text-gray-500"
          }`}
        >
          <span className="inline-flex items-center gap-1">
            <Clock size={9} />
            {formattedDate}
          </span>
          <ChevronRight size={11} className="text-indigo-500" />
        </div>
      </div>
    </button>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────

function StatusBadge({
  status,
  t,
}: {
  status: TabKey;
  t: ReturnType<typeof useTranslations>;
}) {
  const config = {
    pending: {
      bg: "bg-amber-100",
      text: "text-amber-800",
      border: "border-amber-200",
      icon: <Clock size={9} />,
    },
    approved: {
      bg: "bg-emerald-100",
      text: "text-emerald-800",
      border: "border-emerald-200",
      icon: <CheckCircle2 size={9} />,
    },
    rejected: {
      bg: "bg-red-100",
      text: "text-red-800",
      border: "border-red-200",
      icon: <XCircle size={9} />,
    },
  }[status];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold border ${config.bg} ${config.text} ${config.border}`}
    >
      {config.icon}
      {t(`tabs.${status}`)}
    </span>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────

interface DetailModalProps {
  application: VitrinApplication;
  isDarkMode: boolean;
  locale: string;
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
  tFields: ReturnType<typeof useTranslations>;
}

function DetailModal({
  application,
  isDarkMode,
  locale,
  onClose,
  t,
  tFields,
}: DetailModalProps) {
  // Lock body scroll while open and close on Escape — keyboard users
  // shouldn't have to fish for the close button.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const categoryPath = [
    application.category,
    application.subcategory,
    application.subsubcategory,
  ]
    .filter(Boolean)
    .join(" > ");

  const sheetClass = isDarkMode
    ? "bg-gray-900 border-gray-800 text-gray-100"
    : "bg-white border-gray-200 text-gray-900";

  const labelClass = isDarkMode ? "text-gray-500" : "text-gray-500";
  const valueClass = isDarkMode ? "text-gray-200" : "text-gray-800";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl border shadow-2xl ${sheetClass}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-4 py-3 border-b ${
            isDarkMode ? "border-gray-800" : "border-gray-100"
          }`}
        >
          <div className="flex items-center gap-2">
            <StatusBadge status={application.status} t={t} />
            {application.isEditApplication && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                <Pencil size={10} />
                {t("card.editApplication")}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label={t("detail.close")}
            className={`w-8 h-8 inline-flex items-center justify-center rounded-lg transition-colors ${
              isDarkMode
                ? "text-gray-400 hover:bg-gray-800"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Image strip */}
          {application.imageUrls.length > 0 && (
            <div>
              <p className={`text-[10px] uppercase tracking-wider mb-2 ${labelClass}`}>
                {t("detail.images")}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {application.imageUrls.map((url, idx) => (
                  <div
                    key={`${url}-${idx}`}
                    className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800"
                  >
                    <CloudinaryImage.Raw
                      url={url}
                      alt={`${application.productName} ${idx + 1}`}
                      width={80}
                      height={80}
                      fit="cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Title + price */}
          <div>
            <h2 className={`text-lg font-bold leading-tight ${valueClass}`}>
              {application.productName}
            </h2>
            <p className="text-2xl font-bold text-indigo-500 mt-1">
              {formatPrice(application.price, locale)}
            </p>
          </div>

          {/* Description */}
          {application.description && (
            <div>
              <p className={`text-[10px] uppercase tracking-wider mb-1 ${labelClass}`}>
                {t("detail.description")}
              </p>
              <p className={`text-sm whitespace-pre-line ${valueClass}`}>
                {application.description}
              </p>
            </div>
          )}

          {/* Detail grid */}
          <div className="grid grid-cols-2 gap-3">
            {categoryPath && (
              <DetailItem
                label={t("detail.category")}
                value={categoryPath}
                isDarkMode={isDarkMode}
                full
              />
            )}
            {application.condition && (
              <DetailItem
                label={t("detail.condition")}
                value={application.condition}
                isDarkMode={isDarkMode}
              />
            )}
            <DetailItem
              label={t("detail.quantity")}
              value={String(application.quantity)}
              isDarkMode={isDarkMode}
            />
            {application.brandModel && (
              <DetailItem
                label={t("detail.brand")}
                value={application.brandModel}
                isDarkMode={isDarkMode}
              />
            )}
            {application.gender && (
              <DetailItem
                label={t("detail.gender")}
                value={application.gender}
                isDarkMode={isDarkMode}
              />
            )}
            {application.deliveryOption && (
              <DetailItem
                label={t("detail.delivery")}
                value={application.deliveryOption}
                isDarkMode={isDarkMode}
              />
            )}
          </div>

          {/* Colors */}
          {application.availableColors &&
            application.availableColors.length > 0 && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider mb-2 ${labelClass}`}>
                  {t("detail.colors")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {application.availableColors.map((color) => {
                    const qty = application.colorQuantities?.[color];
                    return (
                      <span
                        key={color}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs ${
                          isDarkMode
                            ? "bg-gray-800 text-gray-200"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full bg-gray-400 border border-white/30" />
                        <span>{color}</span>
                        {typeof qty === "number" && (
                          <span
                            className={
                              isDarkMode ? "text-gray-500" : "text-gray-400"
                            }
                          >
                            ({qty})
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Edited fields */}
          {application.isEditApplication &&
            application.editedFields &&
            application.editedFields.length > 0 && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-500/10 dark:border-blue-500/20 p-3">
                <p className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 mb-2">
                  {t("detail.editedFields")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {application.editedFields.map((field) => {
                    // Use the localized field label if we have one;
                    // otherwise fall back to the raw key (the messages
                    // file's `fields.*` namespace covers everything we
                    // emit from the listproduct flow).
                    const fallback = field;
                    let label: string;
                    try {
                      label = tFields(field);
                      if (label === field) label = fallback;
                    } catch {
                      label = fallback;
                    }
                    return (
                      <span
                        key={field}
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200"
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Rejection reason */}
          {application.status === "rejected" && application.rejectionReason && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 p-3">
              <p className="text-[11px] font-semibold text-red-800 dark:text-red-300 mb-1">
                {t("detail.rejectionReason")}
              </p>
              <p className="text-sm text-red-800 dark:text-red-200 whitespace-pre-line">
                {application.rejectionReason}
              </p>
            </div>
          )}

          {/* Timestamps */}
          <div
            className={`pt-3 border-t text-[11px] space-y-1 ${
              isDarkMode
                ? "border-gray-800 text-gray-500"
                : "border-gray-100 text-gray-500"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{t("detail.submittedAt")}:</span>
              <span>{formatDate(application.submittedAt, locale, true)}</span>
            </div>
            {application.reviewedAt && (
              <div className="flex items-center gap-2">
                <span className="font-medium">{t("detail.reviewedAt")}:</span>
                <span>{formatDate(application.reviewedAt, locale, true)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className={`px-4 py-3 border-t ${
            isDarkMode ? "border-gray-800" : "border-gray-100"
          }`}
        >
          <button
            onClick={onClose}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              isDarkMode
                ? "bg-gray-800 hover:bg-gray-700 text-gray-100"
                : "bg-gray-100 hover:bg-gray-200 text-gray-800"
            }`}
          >
            {t("detail.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailItem({
  label,
  value,
  isDarkMode,
  full,
}: {
  label: string;
  value: string;
  isDarkMode: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <p
        className={`text-[10px] uppercase tracking-wider mb-0.5 ${
          isDarkMode ? "text-gray-500" : "text-gray-500"
        }`}
      >
        {label}
      </p>
      <p
        className={`text-xs ${
          isDarkMode ? "text-gray-200" : "text-gray-800"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Formatters ───────────────────────────────────────────────────────

function formatPrice(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${Math.round(value)} TL`;
  }
}

function formatDate(date: Date, locale: string, withTime: boolean): string {
  try {
    return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
