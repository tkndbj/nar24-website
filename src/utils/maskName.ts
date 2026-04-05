/**
 * Masks a user's display name for privacy.
 * e.g. "Thomas Jackson" → "T***** ****n"
 *      "Alice"          → "A***e"
 */
export function maskName(name: string | undefined | null): string {
  if (!name || name.trim() === "") return name ?? "";

  const parts = name.trim().split(/\s+/);

  const maskWord = (word: string): string => {
    if (word.length <= 1) return word;
    if (word.length === 2) return word[0] + "*";
    return word[0] + "*".repeat(word.length - 2) + word[word.length - 1];
  };

  if (parts.length === 1) {
    return maskWord(parts[0]);
  }

  const first = parts[0];
  const last = parts[parts.length - 1];
  const maskedFirst = first[0] + "*".repeat(Math.max(1, first.length - 1));
  const maskedLast = "*".repeat(Math.max(1, last.length - 1)) + last[last.length - 1];

  // Middle parts (if any) replaced with asterisks of same length
  const middleParts = parts.slice(1, -1).map((w) => "*".repeat(w.length));

  return [maskedFirst, ...middleParts, maskedLast].join(" ");
}
