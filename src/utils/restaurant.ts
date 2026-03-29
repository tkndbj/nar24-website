import type { Restaurant } from "@/types/Restaurant";

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

  if (!workingDays?.length || !workingHours?.open || !workingHours?.close) {
    return true;
  }

  // Always evaluate in Cyprus time regardless of user's device timezone
  const nowInCyprus = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Nicosia" }),
  );

  const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ] as const;

  const todayName = DAY_NAMES[nowInCyprus.getDay()];

  const toMinutes = (time: string): number => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + (m || 0);
  };

  const currentMin = nowInCyprus.getHours() * 60 + nowInCyprus.getMinutes();
  const openMin = toMinutes(workingHours.open);
  const closeMin = toMinutes(workingHours.close);
  const days = new Set(workingDays);

  if (closeMin > openMin) {
    return (
      days.has(todayName) && currentMin >= openMin && currentMin < closeMin
    );
  } else {
    if (currentMin < closeMin) {
      const yesterdayIdx = (nowInCyprus.getDay() + 6) % 7;
      return days.has(DAY_NAMES[yesterdayIdx]);
    }
    return days.has(todayName) && currentMin >= openMin;
  }
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
  userCity?: string,
): boolean {
  if (!restaurant.minOrderPrices?.length) return true;
  if (!userCity) return true; // can't determine → assume deliverable

  return restaurant.minOrderPrices.some((p) => p.subregion === userCity);
}

/**
 * Get the minimum order price for a restaurant given the user's location.
 *
 * Lookup priority:
 *  1. Exact subregion (city) match
 *  2. mainRegion match
 *
 * Returns `undefined` when no min order applies (no data, no address, or no match).
 */
export function getMinOrderPrice(
  restaurant: Pick<Restaurant, "minOrderPrices">,
  userCity?: string,
): number | undefined {
  if (!restaurant.minOrderPrices?.length) return undefined;
  if (!userCity) return undefined;

  return restaurant.minOrderPrices.find((p) => p.subregion === userCity)
    ?.minOrderPrice;
}
