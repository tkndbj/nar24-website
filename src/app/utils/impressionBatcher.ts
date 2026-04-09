// app/utils/impressionBatcher.ts

interface PageImpressionData {
  pageUrl: string;
  timestamp: number;
}

class ImpressionBatcherClass {
  private static instance: ImpressionBatcherClass;

  // Buffers
  private impressionBuffer: Map<string, number> = new Map();

  // Timers
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Track impressions per page per product
  private pageImpressions: Map<string, PageImpressionData[]> = new Map();

  // User tracking
  private currentUserId: string | null = null;

  // Cached demographics
  private cachedDemographics: { gender?: string; age?: number } | null = null;
  private demographicsFetchedAt: number | null = null;
  private readonly DEMOGRAPHICS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  // Configuration
  private readonly BATCH_INTERVAL = 30_000; // 30 seconds
  private readonly IMPRESSION_COOLDOWN = 60 * 60 * 1000; // 1 hour
  private readonly MAX_IMPRESSIONS_PER_HOUR = 4;
  private readonly MAX_BATCH_SIZE = 100;
  private readonly MAX_RETRIES = 3;

  private retryCount = 0;
  private isDisposed = false;
  private isSending = false;

  // LocalStorage keys
  private readonly PAGE_IMPRESSIONS_PREFIX = "page_impressions_";
  private readonly BUFFER_PERSIST_KEY = "pending_impression_buffer";

  // Auth helper
  private async getAuthToken(): Promise<string | null> {
    try {
      const { getAuth } = await import("firebase/auth");
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return null;
      return await user.getIdToken();
    } catch {
      return null;
    }
  }

  private constructor() {
    this.initialize();
  }

  public static getInstance(): ImpressionBatcherClass {
    if (!ImpressionBatcherClass.instance) {
      ImpressionBatcherClass.instance = new ImpressionBatcherClass();
    }
    return ImpressionBatcherClass.instance;
  }

  private initialize(): void {
    if (typeof window === "undefined") return;

    this.startCleanupTimer();
    this.loadPersistedBuffer();

    window.addEventListener("beforeunload", () => {
      this.persistImpressionBuffer();
      this.persistPageImpressions();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.persistImpressionBuffer();
        this.flush();
      }
    });
  }

  // ── User management ─────────────────────────────────────────────────────────

  public setUserId(userId: string | null): void {
    if (this.currentUserId === userId) return;

    console.log(
      `👤 ImpressionBatcher: User changed from ${this.currentUserId} to ${userId}`,
    );

    this.pageImpressions.clear();
    this.cachedDemographics = null;
    this.demographicsFetchedAt = null;

    this.currentUserId = userId;

    if (userId) {
      this.loadPageImpressions();
    }
  }

  // ── Storage helpers ─────────────────────────────────────────────────────────

  private getStorageKey(): string {
    const userId = this.currentUserId || "anonymous";
    return `${this.PAGE_IMPRESSIONS_PREFIX}${userId}`;
  }

  private getCurrentPageKey(): string {
    if (typeof window === "undefined") return "unknown";
    return window.location.pathname;
  }

  private loadPageImpressions(): void {
    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (!stored) return;

      const data = JSON.parse(stored) as Record<string, PageImpressionData[]>;
      const now = Date.now();

      Object.entries(data).forEach(([productId, pages]) => {
        const validPages = pages.filter(
          (p) => now - p.timestamp < this.IMPRESSION_COOLDOWN,
        );
        if (validPages.length > 0) {
          this.pageImpressions.set(productId, validPages);
        }
      });
    } catch (e) {
      console.error("Error loading page impressions:", e);
    }
  }

  private persistPageImpressions(): void {
    try {
      const data: Record<string, PageImpressionData[]> = {};
      this.pageImpressions.forEach((pages, productId) => {
        data[productId] = pages;
      });
      localStorage.setItem(this.getStorageKey(), JSON.stringify(data));
    } catch (e) {
      console.error("Error persisting page impressions:", e);
    }
  }

  private persistImpressionBuffer(): void {
    if (this.impressionBuffer.size === 0) {
      localStorage.removeItem(this.BUFFER_PERSIST_KEY);
      return;
    }
    try {
      const data: Record<string, number> = {};
      this.impressionBuffer.forEach((count, id) => {
        data[id] = count;
      });
      localStorage.setItem(this.BUFFER_PERSIST_KEY, JSON.stringify(data));
    } catch {}
  }

  private loadPersistedBuffer(): void {
    try {
      const stored = localStorage.getItem(this.BUFFER_PERSIST_KEY);
      if (!stored) return;

      const data: Record<string, number> = JSON.parse(stored);
      for (const [id, count] of Object.entries(data)) {
        const existing = this.impressionBuffer.get(id) || 0;
        this.impressionBuffer.set(id, existing + count);
      }

      localStorage.removeItem(this.BUFFER_PERSIST_KEY);

      if (this.impressionBuffer.size > 0) {
        this.scheduleBatch();
      }
    } catch {
      localStorage.removeItem(this.BUFFER_PERSIST_KEY);
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  private startCleanupTimer(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);

    this.cleanupTimer = setInterval(
      () => {
        const now = Date.now();
        let cleaned = 0;

        this.pageImpressions.forEach((pages, productId) => {
          const valid = pages.filter((p) => {
            if (now - p.timestamp < this.IMPRESSION_COOLDOWN) return true;
            cleaned++;
            return false;
          });

          if (valid.length === 0) {
            this.pageImpressions.delete(productId);
          } else {
            this.pageImpressions.set(productId, valid);
          }
        });

        if (cleaned > 0) {
          this.persistPageImpressions();
        }
      },
      10 * 60 * 1000,
    );
  }

  // ── Core: addImpression ─────────────────────────────────────────────────────

  public addImpression(productId: string): void {
    const now = Date.now();
    const currentPage = this.getCurrentPageKey();

    const existingPages = this.pageImpressions.get(productId) || [];

    // Clean expired
    const validPages = existingPages.filter(
      (p) => now - p.timestamp < this.IMPRESSION_COOLDOWN,
    );

    // Already recorded on this page
    if (validPages.some((p) => p.pageUrl === currentPage)) return;

    // Max per hour reached
    if (validPages.length >= this.MAX_IMPRESSIONS_PER_HOUR) return;

    // Record
    validPages.push({ pageUrl: currentPage, timestamp: now });
    this.pageImpressions.set(productId, validPages);

    const currentCount = this.impressionBuffer.get(productId) || 0;
    this.impressionBuffer.set(productId, currentCount + 1);

    this.persistPageImpressions();
    this.scheduleBatch();

    // Evict old entries if map grows too large
    if (this.pageImpressions.size > 1000) {
      const entries = [...this.pageImpressions.entries()]
        .map(([key, pages]) => ({
          key,
          oldest: Math.min(...pages.map((p) => p.timestamp)),
        }))
        .sort((a, b) => a.oldest - b.oldest);

      while (this.pageImpressions.size > 900) {
        const entry = entries.shift();
        if (entry) this.pageImpressions.delete(entry.key);
      }
    }

    if (this.impressionBuffer.size >= this.MAX_BATCH_SIZE) {
      this.flush();
    }
  }

  // ── Batch sending ───────────────────────────────────────────────────────────

  private scheduleBatch(): void {
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.batchTimer = setTimeout(() => this.sendBatch(), this.BATCH_INTERVAL);
  }

  private async getUserDemographics(): Promise<{
    gender?: string;
    age?: number;
  }> {
    if (
      this.cachedDemographics &&
      this.demographicsFetchedAt &&
      Date.now() - this.demographicsFetchedAt < this.DEMOGRAPHICS_CACHE_TTL
    ) {
      return this.cachedDemographics;
    }

    try {
      const response = await fetch("/api/analytics/user/demographics");
      if (!response.ok) {
        this.cachedDemographics = {};
        this.demographicsFetchedAt = Date.now();
        return {};
      }

      const data = await response.json();
      const demographics: { gender?: string; age?: number } = {};
      if (data.gender) demographics.gender = data.gender;
      if (data.age) demographics.age = data.age;

      this.cachedDemographics = demographics;
      this.demographicsFetchedAt = Date.now();
      return demographics;
    } catch {
      return this.cachedDemographics || {};
    }
  }

  private async sendBatch(): Promise<void> {
    if (this.impressionBuffer.size === 0 || this.isDisposed || this.isSending)
      return;
    this.isSending = true;

    const idsToSend = Array.from(this.impressionBuffer.keys());
    const bufferCopy = new Map(this.impressionBuffer);
    this.impressionBuffer.clear();

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      const demographics = await this.getUserDemographics();
      const token = await this.getAuthToken();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      // Call the cloud function directly — same one Flutter calls
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const url = `https://europe-west3-${projectId}.cloudfunctions.net/incrementImpressionCount`;

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            productIds: idsToSend,
            userGender: demographics.gender || null,
            userAge: demographics.age || null,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`incrementImpressionCount returned ${response.status}`);
      }

      console.log(`📊 ImpressionBatcher: sent ${idsToSend.length} impressions`);
      this.retryCount = 0;
      localStorage.removeItem(this.BUFFER_PERSIST_KEY);
    } catch (e) {
      console.error("❌ ImpressionBatcher: batch send failed —", e);

      if (this.retryCount < this.MAX_RETRIES) {
        this.retryCount++;
        bufferCopy.forEach((count, id) => {
          const current = this.impressionBuffer.get(id) || 0;
          this.impressionBuffer.set(id, current + count);
        });
        setTimeout(() => {
          if (!this.isDisposed) this.sendBatch();
        }, 2000 * this.retryCount);
      } else {
        // Persist for next session
        bufferCopy.forEach((count, id) => {
          const current = this.impressionBuffer.get(id) || 0;
          this.impressionBuffer.set(id, current + count);
        });
        this.persistImpressionBuffer();
        this.impressionBuffer.clear();
        this.retryCount = 0;
      }
    } finally {
      this.isSending = false;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  public async flush(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    await this.sendBatch();
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.batchTimer) clearTimeout(this.batchTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.persistImpressionBuffer();
    this.impressionBuffer.clear();
    this.pageImpressions.clear();
  }
}

export const impressionBatcher = ImpressionBatcherClass.getInstance();
