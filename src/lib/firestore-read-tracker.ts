// src/lib/firestore-read-tracker.ts
// Lightweight Firestore read/write counter for debugging.
// Logs a grouped summary each time a provider reports reads.
// Shows both the delta since last flush and cumulative totals.

const TAG = "📊 Firestore";

interface Entry {
  reads: number;
  writes: number;
}

const _totals = new Map<string, Entry>();
const _delta = new Map<string, Entry>();
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _flushCount = 0;

function flush() {
  if (_delta.size === 0) return;

  _flushCount++;
  const lines: string[] = [];
  let deltaReads = 0;
  let deltaWrites = 0;
  let totalReads = 0;
  let totalWrites = 0;

  // Sort alphabetically for stable output
  const sorted = [..._delta.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  for (const [label, { reads, writes }] of sorted) {
    const cumulative = _totals.get(label)!;
    if (reads > 0) {
      const suffix = cumulative.reads > reads ? ` (total: ${cumulative.reads})` : "";
      lines.push(`  ${label} Read: +${reads}${suffix}`);
      deltaReads += reads;
    }
    if (writes > 0) {
      const suffix = cumulative.writes > writes ? ` (total: ${cumulative.writes})` : "";
      lines.push(`  ${label} Write: +${writes}${suffix}`);
      deltaWrites += writes;
    }
    totalReads += cumulative.reads;
    totalWrites += cumulative.writes;
  }

  const header = _flushCount === 1 ? "Initial Load" : `Update #${_flushCount}`;
  lines.push(`  ── Delta: +${deltaReads} read, +${deltaWrites} write | Cumulative: ${totalReads} read, ${totalWrites} write`);

  console.log(`%c${TAG} ${header}\n${lines.join("\n")}`, "color:#10b981;font-weight:bold");

  // Clear delta for next window
  _delta.clear();
}

/**
 * Report Firestore reads from a provider/hook.
 * Calls are debounced — the summary prints 2 s after the last report,
 * so all initial-load providers appear in a single group.
 */
export function trackReads(label: string, count: number) {
  // Update cumulative totals
  const prev = _totals.get(label);
  _totals.set(label, {
    reads: (prev?.reads ?? 0) + count,
    writes: prev?.writes ?? 0,
  });

  // Update delta for this flush window
  const prevDelta = _delta.get(label);
  _delta.set(label, {
    reads: (prevDelta?.reads ?? 0) + count,
    writes: prevDelta?.writes ?? 0,
  });

  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(flush, 2000);
}

/** Report Firestore writes from a provider/hook. */
export function trackWrites(label: string, count: number) {
  const prev = _totals.get(label);
  _totals.set(label, {
    reads: prev?.reads ?? 0,
    writes: (prev?.writes ?? 0) + count,
  });

  const prevDelta = _delta.get(label);
  _delta.set(label, {
    reads: prevDelta?.reads ?? 0,
    writes: (prevDelta?.writes ?? 0) + count,
  });

  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(flush, 2000);
}

/** Reset all counters (e.g. on logout). */
export function resetTracker() {
  _totals.clear();
  _delta.clear();
  _flushCount = 0;
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
}
