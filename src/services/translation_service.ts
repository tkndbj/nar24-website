// services/translation_service.ts

import { User } from "firebase/auth";

// ============================================================================
// TYPES
// ============================================================================

export class TranslationException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationException";
  }
}

export class RateLimitException extends TranslationException {
  retryAfter?: number;

  constructor(message: string, retryAfter?: number) {
    super(message);
    this.name = "RateLimitException";
    this.retryAfter = retryAfter;
  }
}

// ============================================================================
// TRANSLATION SERVICE - Matching Flutter implementation
// ============================================================================

class TranslationService {
  private static instance: TranslationService;

  // Cloud Function URL - same as Flutter
  private static readonly BASE_URL =
    "https://europe-west3-emlak-mobile-app.cloudfunctions.net";

  // In-memory cache: Map<cacheKey, Map<language, translation>>
  private cache: Map<string, Map<string, string>> = new Map();

  // Current user getter (set externally)
  private currentUser: User | null = null;

  private constructor() {}

  static getInstance(): TranslationService {
    if (!TranslationService.instance) {
      TranslationService.instance = new TranslationService();
    }
    return TranslationService.instance;
  }

  /**
   * Set the current Firebase user for authentication
   */
  setUser(user: User | null): void {
    this.currentUser = user;
  }

  /**
   * Generate a short cache key from text (matching Flutter implementation)
   */
  private generateCacheKey(text: string): string {
    // Use first 100 chars + length as key to avoid huge keys
    const truncated = text.length > 100 ? text.substring(0, 100) : text;
    // Simple hash function for browser compatibility
    let hash = 0;
    for (let i = 0; i < truncated.length; i++) {
      const char = truncated.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `${hash}_${text.length}`;
  }

  /**
   * Translate a single text
   */
  async translate(text: string, targetLanguage: string): Promise<string> {
    // Check cache first
    const cacheKey = this.generateCacheKey(text);
    const cachedTranslation = this.cache.get(cacheKey)?.get(targetLanguage);
    if (cachedTranslation) {
      console.log("⚡ Translation cache hit");
      return cachedTranslation;
    }

    if (!this.currentUser) {
      throw new TranslationException("User not authenticated");
    }

    // Get fresh ID token
    const idToken = await this.currentUser.getIdToken();
    if (!idToken) {
      throw new TranslationException("Failed to get authentication token");
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout like Flutter

      const response = await fetch(
        `${TranslationService.BASE_URL}/translateText`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            text,
            targetLanguage,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const translation = data.translation as string;

        // Cache the result
        if (!this.cache.has(cacheKey)) {
          this.cache.set(cacheKey, new Map());
        }
        this.cache.get(cacheKey)!.set(targetLanguage, translation);

        console.log("✅ Translation successful");
        return translation;
      } else if (response.status === 429) {
        const data = await response.json();
        throw new RateLimitException(
          data.error || "Rate limit exceeded",
          data.retryAfter
        );
      } else if (response.status === 401) {
        throw new TranslationException("Authentication failed");
      } else {
        const data = await response.json().catch(() => ({}));
        throw new TranslationException(data.error || "Translation failed");
      }
    } catch (e) {
      if (e instanceof TranslationException) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new TranslationException("Request timeout");
      }
      console.error("Translation error:", e);
      throw new TranslationException(`Network error: ${String(e)}`);
    }
  }

  /**
   * Translate multiple texts at once (more efficient)
   */
  async translateBatch(
    texts: string[],
    targetLanguage: string
  ): Promise<string[]> {
    if (texts.length === 0) return [];
    if (texts.length > 5) {
      throw new TranslationException("Maximum 5 texts per batch");
    }

    // Check cache for all texts
    const results: (string | null)[] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cacheKey = this.generateCacheKey(texts[i]);
      const cached = this.cache.get(cacheKey)?.get(targetLanguage);
      if (cached) {
        results.push(cached);
      } else {
        results.push(null);
        uncachedTexts.push(texts[i]);
        uncachedIndices.push(i);
      }
    }

    // If all cached, return immediately
    if (uncachedTexts.length === 0) {
      console.log("⚡ Batch translation cache hit (all cached)");
      return results as string[];
    }

    if (!this.currentUser) {
      throw new TranslationException("User not authenticated");
    }

    const idToken = await this.currentUser.getIdToken();
    if (!idToken) {
      throw new TranslationException("Failed to get authentication token");
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for batch

      const response = await fetch(
        `${TranslationService.BASE_URL}/translateBatch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            texts: uncachedTexts,
            targetLanguage,
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const translations = data.translations as string[];

        // Merge with cached results and update cache
        for (let i = 0; i < uncachedIndices.length; i++) {
          const originalIndex = uncachedIndices[i];
          const translation = translations[i];
          results[originalIndex] = translation;

          // Cache the result
          const cacheKey = this.generateCacheKey(texts[originalIndex]);
          if (!this.cache.has(cacheKey)) {
            this.cache.set(cacheKey, new Map());
          }
          this.cache.get(cacheKey)!.set(targetLanguage, translation);
        }

        console.log(
          `✅ Batch translation successful (${uncachedTexts.length} new, ${
            texts.length - uncachedTexts.length
          } cached)`
        );
        return results as string[];
      } else if (response.status === 429) {
        const data = await response.json().catch(() => ({}));
        throw new RateLimitException(
          data.error || "Rate limit exceeded",
          data.retryAfter
        );
      } else {
        throw new TranslationException("Batch translation failed");
      }
    } catch (e) {
      if (e instanceof TranslationException) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new TranslationException("Request timeout");
      }
      throw new TranslationException(`Network error: ${String(e)}`);
    }
  }

  /**
   * Check if translation is cached
   */
  isCached(text: string, targetLanguage: string): boolean {
    const cacheKey = this.generateCacheKey(text);
    return this.cache.get(cacheKey)?.has(targetLanguage) ?? false;
  }

  /**
   * Get cached translation if available
   */
  getCached(text: string, targetLanguage: string): string | null {
    const cacheKey = this.generateCacheKey(text);
    return this.cache.get(cacheKey)?.get(targetLanguage) ?? null;
  }

  /**
   * Clear all cached translations
   */
  clearCache(): void {
    this.cache.clear();
    console.log("🗑️ Translation cache cleared");
  }

  /**
   * Get cache statistics (for debugging)
   */
  getCacheStats(): { entries: number; languages: Set<string> } {
    const languages = new Set<string>();
    this.cache.forEach((langMap) => {
      langMap.forEach((_, lang) => languages.add(lang));
    });
    return {
      entries: this.cache.size,
      languages,
    };
  }
}

// Export singleton instance
const translationService = TranslationService.getInstance();
export default translationService;
