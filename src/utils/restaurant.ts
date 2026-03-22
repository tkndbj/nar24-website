import type { Restaurant } from "@/types/Restaurant";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Determine whether a restaurant is currently open based on its
 * `workingDays` (e.g. ["Monday", "Tuesday", ...]) and
 * `workingHours` ({ open: "08:00", close: "22:00" }).
 *
 * - Returns `true` when schedule data is missing (graceful default)..
 * - Handles overnight hours (e.g. open: "22:00", close: "03:00").
 */
export function isRestaurantOpen(
  restaurant: Partial<Pick<Restaurant, "workingDays" | "workingHours">>,
): boolean {
  const { workingDays, workingHours } = restaurant;

  // No schedule data → assume open
  if (!workingDays?.length || !workingHours?.open || !workingHours?.close) {
    return true;
  }

  const now = new Date();
  const todayName = DAY_NAMES[now.getDay()];

  // Parse "HH:mm" → total minutes since midnight
  const toMinutes = (time: string): number => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + (m || 0);
  };

  const currentMin = now.getHours() * 60 + now.getMinutes();
  const openMin = toMinutes(workingHours.open);
  const closeMin = toMinutes(workingHours.close);

  // Overnight span (e.g. 22:00 → 03:00)
  if (closeMin <= openMin) {
    // If it's after midnight but before close, the shift started yesterday
    if (currentMin < closeMin) {
      const yesterdayIdx = (now.getDay() + 6) % 7;
      return workingDays.includes(DAY_NAMES[yesterdayIdx]);
    }
    // Normal part of the shift (after open, before midnight)
    return workingDays.includes(todayName) && currentMin >= openMin;
  }

  // Normal span (e.g. 08:00 → 22:00)
  if (!workingDays.includes(todayName)) {
    return false;
  }

  return currentMin >= openMin && currentMin < closeMin;
}

/**
 * Check whether a restaurant delivers to the user's address.
 *
 * Delivery availability is determined by the `minOrderPrices` array:
 * if the user's subregion (city) or mainRegion appears in any entry,
 * the restaurant delivers there.
 *
 * Returns `true` when:
 *  - The restaurant has no `minOrderPrices` (delivers everywhere / no data)
 *  - The user has no address set (can't determine — assume available)
 *  - A matching mainRegion or subregion entry exists
 */
export function doesRestaurantDeliver(
  restaurant: Pick<Restaurant, "minOrderPrices">,
  userMainRegion?: string,
  userCity?: string,
): boolean {
  if (!restaurant.minOrderPrices?.length) return true;
  if (!userMainRegion && !userCity) return true;

  return restaurant.minOrderPrices.some(
    (p) =>
      (userCity && p.subregion === userCity) ||
      (userMainRegion && p.mainRegion === userMainRegion),
  );
}
