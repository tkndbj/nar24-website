// src/utils/foodLocalized.ts
//
// Mirrors lib/utils/food_localization.dart's pickLocalized / pickLocalizedExtra.
//
// The `translateFoodOnWrite` and `translateDrinkOnWrite` Cloud Functions
// auto-populate `name_tr` / `name_en` / `name_ru` (and the `description_*`
// counterparts) on the doc — translating from whichever language the
// restaurant typed in. These helpers pick the variant that matches the
// current next-intl locale and fall back to the raw user-typed source when
// the translation hasn't run yet or returned empty for the current locale.

/**
 * Pick the active-locale variant of a restaurant-authored string.
 * `fallback` is the raw user-typed source — used only when the
 * locale-specific variant is missing or empty.
 */
export function pickLocalized(
  locale: string,
  fallback: string,
  tr: string | undefined,
  en: string | undefined,
  ru: string | undefined,
): string {
  if (locale === "tr" && tr && tr.length > 0) return tr;
  if (locale === "en" && en && en.length > 0) return en;
  if (locale === "ru" && ru && ru.length > 0) return ru;
  return fallback;
}

/**
 * Same as [pickLocalized] but for extras. When a per-doc translation is
 * missing, lets the caller fall through to its static dictionary (which
 * handles predefined English-key extras like "Extra Cheese"). Returns
 * `undefined` to signal "no per-doc translation for the active locale — let
 * the static lookup decide".
 */
export function pickLocalizedExtra(
  locale: string,
  tr: string | undefined,
  en: string | undefined,
  ru: string | undefined,
): string | undefined {
  if (locale === "tr" && tr && tr.length > 0) return tr;
  if (locale === "en" && en && en.length > 0) return en;
  if (locale === "ru" && ru && ru.length > 0) return ru;
  return undefined;
}
