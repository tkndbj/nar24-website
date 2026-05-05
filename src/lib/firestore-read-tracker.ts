// src/lib/firestore-read-tracker.ts
//
// Session-based Firestore usage tracker (web).
// Mirrors the Flutter implementation at
// flutter_application_1/lib/services/firestore_read_tracker.dart so both apps
// write into the same `firestore_usage_sessions` collection and can be
// compared side-by-side from the admin panel. Each session writes at most
// one document update per flush interval (default 60 s).
//
// Tagged with platform = "web". Initialization, tracking, and flushing are
// all non-blocking and any failure is swallowed so the tracker can never
// crash the page or block a caller.

import type { Firestore, DocumentReference } from "firebase/firestore";
import type { Auth } from "firebase/auth";

// Match the Flutter writer exactly so the admin panel reader keeps working.
const COLLECTION = "firestore_usage_sessions";
const FLUSH_INTERVAL_MS = 60_000;

// Hard caps so a single session document cannot exceed Firestore limits
// (1 MiB / doc, ~20 k field paths). Same values as Flutter.
const MAX_FILES = 200;
const MAX_OPS_PER_FILE = 50;

// Session docs are wired to a Firestore TTL policy on `expiresAt` so they
// auto-delete; without this the collection grows unbounded.
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const PLATFORM = "web" as const;

interface FileBucket {
  reads: number;
  writes: number;
  operations: Map<string, number>;
}

class FirestoreReadTrackerImpl {
  private initialized = false;
  private sessionId: string | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushInFlight = false;
  private sessionWritten = false;

  private appVersion: string | null = null;

  private pendingReads = 0;
  private pendingWrites = 0;
  private pending = new Map<string, FileBucket>();

  // Cached firebase handles. Resolved lazily on first flush so we never
  // force-load Firebase earlier than the rest of the app does.
  private db: Firestore | null = null;
  private auth: Auth | null = null;
  private docRef: DocumentReference | null = null;

  initialize(): void {
    if (this.initialized) return;
    if (typeof window === "undefined") return; // No-op during SSR.

    this.initialized = true;
    this.sessionId = generateSessionId();
    this.appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? null;

    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {
        // Already swallowed inside flush; this is a defence-in-depth net.
      });
    }, FLUSH_INTERVAL_MS);

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
    }
    window.addEventListener("pagehide", this.onPagehide);
  }

  /** Track a read operation. Safe to call before initialize() — it no-ops. */
  trackRead(file: string, operation: string, count: number): void {
    if (!this.initialized || count <= 0) return;
    this.record(file, operation, count, false);
  }

  /** Track a write operation. Safe to call before initialize() — it no-ops. */
  trackWrite(file: string, operation: string, count = 1): void {
    if (!this.initialized || count <= 0) return;
    this.record(file, operation, count, true);
  }

  /** Flush pending counters immediately. Resolves once the write completes. */
  flushNow(): Promise<void> {
    return this.flush();
  }

  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.onPagehide);
    }
    this.initialized = false;
  }

  private onVisibilityChange = () => {
    if (typeof document !== "undefined" && document.hidden) {
      this.flush().catch(() => {});
    }
  };

  private onPagehide = () => {
    this.flush().catch(() => {});
  };

  private record(
    file: string,
    operation: string,
    count: number,
    isWrite: boolean,
  ): void {
    try {
      const safeFile = sanitize(file);
      const safeOp = sanitize(operation);
      if (!safeFile || !safeOp) return;

      const bucketKey =
        this.pending.has(safeFile) || this.pending.size < MAX_FILES
          ? safeFile
          : "_other";

      let bucket = this.pending.get(bucketKey);
      if (!bucket) {
        bucket = { reads: 0, writes: 0, operations: new Map() };
        this.pending.set(bucketKey, bucket);
      }

      if (isWrite) {
        this.pendingWrites += count;
        bucket.writes += count;
      } else {
        this.pendingReads += count;
        bucket.reads += count;
      }

      const existing = bucket.operations.get(safeOp);
      if (existing !== undefined) {
        bucket.operations.set(safeOp, existing + count);
      } else if (bucket.operations.size < MAX_OPS_PER_FILE) {
        bucket.operations.set(safeOp, count);
      } else {
        bucket.operations.set(
          "_other",
          (bucket.operations.get("_other") ?? 0) + count,
        );
      }
    } catch {
      // Tracker faults must never break the caller.
    }
  }

  private async flush(): Promise<void> {
    if (!this.initialized || this.flushInFlight) return;
    if (
      this.pendingReads === 0 &&
      this.pendingWrites === 0 &&
      this.pending.size === 0
    ) {
      return;
    }

    this.flushInFlight = true;

    // Snapshot + clear so new events can accumulate during the write.
    const readsDelta = this.pendingReads;
    const writesDelta = this.pendingWrites;
    const fileDeltas = new Map<string, FileBucket>();
    this.pending.forEach((b, k) => {
      fileDeltas.set(k, {
        reads: b.reads,
        writes: b.writes,
        operations: new Map(b.operations),
      });
    });
    this.pendingReads = 0;
    this.pendingWrites = 0;
    this.pending.clear();

    try {
      const fs = await import("firebase/firestore");

      if (!this.db || !this.auth) {
        const { getFirebaseDb, getFirebaseAuth } = await import(
          "./firebase-lazy"
        );
        const [db, auth] = await Promise.all([
          getFirebaseDb(),
          getFirebaseAuth(),
        ]);
        this.db = db;
        this.auth = auth;
        this.docRef = fs.doc(fs.collection(db, COLLECTION), this.sessionId!);
      }

      const docRef = this.docRef!;
      const user = this.auth.currentUser;

      if (!this.sessionWritten) {
        await fs.setDoc(
          docRef,
          {
            sessionId: this.sessionId,
            date: today(),
            startedAt: fs.serverTimestamp(),
            expiresAt: fs.Timestamp.fromDate(
              new Date(Date.now() + SESSION_TTL_MS),
            ),
            appVersion: this.appVersion,
            platform: PLATFORM,
            userId: user?.uid ?? null,
            displayName: user?.displayName ?? null,
            email: user?.email ?? null,
            totals: { reads: 0, writes: 0 },
          },
          { merge: true },
        );
        this.sessionWritten = true;
      }

      const payload: Record<string, unknown> = {
        lastActivityAt: fs.serverTimestamp(),
        "totals.reads": fs.increment(readsDelta),
        "totals.writes": fs.increment(writesDelta),
      };
      if (user) {
        payload.userId = user.uid;
        if (user.displayName) payload.displayName = user.displayName;
        if (user.email) payload.email = user.email;
      }

      fileDeltas.forEach((b, file) => {
        if (b.reads > 0) {
          payload[`byFile.${file}.reads`] = fs.increment(b.reads);
        }
        if (b.writes > 0) {
          payload[`byFile.${file}.writes`] = fs.increment(b.writes);
        }
        b.operations.forEach((c, op) => {
          payload[`byFile.${file}.operations.${op}`] = fs.increment(c);
        });
      });

      await fs.setDoc(docRef, payload, { merge: true });
    } catch (e) {
      // Re-queue on failure so no data is lost across transient errors.
      this.pendingReads += readsDelta;
      this.pendingWrites += writesDelta;
      fileDeltas.forEach((b, file) => {
        let existing = this.pending.get(file);
        if (!existing) {
          existing = { reads: 0, writes: 0, operations: new Map() };
          this.pending.set(file, existing);
        }
        existing.reads += b.reads;
        existing.writes += b.writes;
        b.operations.forEach((c, op) => {
          existing!.operations.set(
            op,
            (existing!.operations.get(op) ?? 0) + c,
          );
        });
      });
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn("[FirestoreReadTracker] flush failed:", e);
      }
    } finally {
      this.flushInFlight = false;
    }
  }
}

function sanitize(s: string): string {
  const t = s.trim();
  if (!t) return "";
  // Mirror the Flutter sanitizer: strip characters that conflict with
  // Firestore field path syntax or are control characters.
  return t.replace(/[.\/\\\[\]\*`~\x00-\x1F]/g, "_");
}

function today(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function generateSessionId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

export const firestoreReadTracker = new FirestoreReadTrackerImpl();

// ─── Legacy single-label API ───────────────────────────────────────────────
//
// The previous tracker was a console-only debug helper that took one string
// label per call. We keep the same export names so existing call sites work
// without changes. Labels of the form "file:operation" are split into the
// (file, operation) shape that matches Flutter; bare labels become the file
// with operation = "general".

function parseLabel(label: string): { file: string; operation: string } {
  const idx = label.indexOf(":");
  if (idx === -1) {
    return { file: label, operation: "general" };
  }
  return {
    file: label.slice(0, idx).trim(),
    operation: label.slice(idx + 1).trim(),
  };
}

export function trackReads(label: string, count: number): void {
  if (count <= 0) return;
  const { file, operation } = parseLabel(label);
  firestoreReadTracker.trackRead(file, operation, count);
}

export function trackWrites(label: string, count: number): void {
  if (count <= 0) return;
  const { file, operation } = parseLabel(label);
  firestoreReadTracker.trackWrite(file, operation, count);
}

/**
 * Legacy reset hook. The production tracker is session-scoped (one session
 * per page load) so resetting per-logout no longer makes sense, but we keep
 * the export so existing callers compile.
 */
export function resetTracker(): void {
  // intentionally empty
}
