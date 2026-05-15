"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Restaurant } from "@/types/Restaurant";
import { Food, FoodDiscount, FoodExtra } from "@/types/Food";
import RestaurantDetail from "@/app/components/restaurants/RestaurantDetail";
import Footer from "@/app/components/Footer";
import { FoodCartProvider } from "@/context/FoodCartProvider";
import { useUser } from "@/context/UserProvider";

interface DrinkItem {
  id: string;
  restaurantId: string;
  name: string;
  price: number;
  isAvailable: boolean;
  /** Auto-translations written by `translateDrinkOnWrite`. May be missing
   *  until the CF has run for this doc. */
  nameTr?: string;
  nameEn?: string;
  nameRu?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache-aware data fetching
//
// The CF `foodMenuRebuild` writes `food_menu_cache/{rid}` with this shape:
//   parent: { foodCount, drinkCount, foodPageCount, drinkPageCount,
//             pageSize, categoryFacets, schemaVersion: 1 }
//   foods/{idx}:  { items: [...slim foods...] }
//   drinks/{idx}: { items: [...slim drinks...] }
//
// We read parent + foods/0 + drinks/0 in parallel for first paint, then fetch
// the remaining shards (if any) in parallel. On any miss or error we fall
// back to direct Firestore queries against `foods` / `drinks`, which is what
// the page did before the cache existed.
// ─────────────────────────────────────────────────────────────────────────────

function parseRestaurant(id: string, d: DocumentData): Restaurant {
  return {
    id,
    name: d.name as string,
    address: d.address as string | undefined,
    averageRating:
      d.averageRating != null ? Number(d.averageRating) : undefined,
    reviewCount: d.reviewCount != null ? Number(d.reviewCount) : undefined,
    categories: Array.isArray(d.categories)
      ? (d.categories as string[])
      : undefined,
    contactNo: d.contactNo as string | undefined,
    coverImageUrls: Array.isArray(d.coverImageUrls)
      ? (d.coverImageUrls as string[])
      : undefined,
    profileImageUrl: d.profileImageUrl as string | undefined,
    profileImageStoragePath: d.profileImageStoragePath as string | undefined,
    followerCount:
      d.followerCount != null ? Number(d.followerCount) : undefined,
    isActive: d.isActive !== false,
    ownerId: d.ownerId as string | undefined,
    latitude: d.latitude != null ? Number(d.latitude) : undefined,
    longitude: d.longitude != null ? Number(d.longitude) : undefined,
    foodType: Array.isArray(d.foodType)
      ? (d.foodType as string[])
      : undefined,
    cuisineTypes: Array.isArray(d.cuisineTypes)
      ? (d.cuisineTypes as string[])
      : undefined,
    workingDays: Array.isArray(d.workingDays)
      ? (d.workingDays as string[])
      : undefined,
    workingHours:
      d.workingHours != null &&
      typeof d.workingHours === "object" &&
      "open" in (d.workingHours as Record<string, unknown>) &&
      "close" in (d.workingHours as Record<string, unknown>)
        ? {
            open: String((d.workingHours as Record<string, unknown>).open),
            close: String((d.workingHours as Record<string, unknown>).close),
          }
        : undefined,
    minOrderPrices: Array.isArray(d.minOrderPrices)
      ? (d.minOrderPrices as Array<Record<string, unknown>>).map((p) => ({
          mainRegion: String(p.mainRegion ?? ""),
          subregion: String(p.subregion ?? ""),
          minOrderPrice: Number(p.minOrderPrice ?? 0),
        }))
      : undefined,
  };
}

// Converts a single slim food item (from the cache OR a direct Firestore doc)
// into a typed `Food`. Both shapes use the same field names; the cache shape
// is a strict subset of the source-doc shape.
function parseFood(
  id: string,
  d: Record<string, unknown>,
  restaurantId: string,
): Food | null {
  if (!d.name) return null;

  // Discount may be present as a raw map with Firestore Timestamps. The CF
  // copies the discount object verbatim into the cache, so Timestamps survive.
  let discount: FoodDiscount | undefined;
  if (d.discount && typeof d.discount === "object") {
    const disc = d.discount as Record<string, unknown>;
    const startDate =
      disc.startDate instanceof Timestamp
        ? disc.startDate.toDate()
        : disc.startDate instanceof Date
          ? (disc.startDate as Date)
          : undefined;
    const endDate =
      disc.endDate instanceof Timestamp
        ? disc.endDate.toDate()
        : disc.endDate instanceof Date
          ? (disc.endDate as Date)
          : undefined;
    if (startDate && endDate && disc.percentage && disc.originalPrice) {
      discount = {
        percentage: Number(disc.percentage),
        originalPrice: Number(disc.originalPrice),
        startDate,
        endDate,
      };
    }
  }

  // Per-extra translations live in a sibling map keyed by extra name. We
  // splice them into each FoodExtra so card components don't have to look
  // the parent doc up again.
  const extraTranslations =
    d.extra_translations && typeof d.extra_translations === "object"
      ? (d.extra_translations as Record<string, Record<string, unknown>>)
      : {};

  const extras: FoodExtra[] | undefined = Array.isArray(d.extras)
    ? (d.extras as Array<Record<string, unknown>>).map((e) => {
        const exName = String(e.name ?? "");
        const trans = extraTranslations[exName];
        return {
          name: exName,
          price: Number(e.price ?? 0),
          nameTr: trans?.tr as string | undefined,
          nameEn: trans?.en as string | undefined,
          nameRu: trans?.ru as string | undefined,
        };
      })
    : undefined;

  return {
    id,
    name: d.name as string,
    description: d.description as string | undefined,
    foodCategory: (d.foodCategory || "") as string,
    foodType: (d.foodType || "") as string,
    imageUrl: d.imageUrl as string | undefined,
    imageStoragePath: d.imageStoragePath as string | undefined,
    isAvailable: d.isAvailable !== false,
    preparationTime:
      d.preparationTime != null ? Number(d.preparationTime) : undefined,
    price: Number(d.price) || 0,
    extras,
    restaurantId,
    discount,
    nameTr: d.name_tr as string | undefined,
    nameEn: d.name_en as string | undefined,
    nameRu: d.name_ru as string | undefined,
    descriptionTr: d.description_tr as string | undefined,
    descriptionEn: d.description_en as string | undefined,
    descriptionRu: d.description_ru as string | undefined,
  };
}

function parseDrink(
  id: string,
  d: Record<string, unknown>,
  restaurantId: string,
): DrinkItem | null {
  if (!d.name) return null;
  return {
    id,
    restaurantId,
    name: (d.name as string) || "",
    price: Number(d.price) || 0,
    isAvailable: d.isAvailable !== false,
    nameTr: d.name_tr as string | undefined,
    nameEn: d.name_en as string | undefined,
    nameRu: d.name_ru as string | undefined,
  };
}

interface MenuCacheResult {
  foods: Food[];
  drinks: DrinkItem[];
  categoryFacets: string[];
  isComplete: boolean; // true when all foods/drinks were retrievable from cache
}

async function loadFromMenuCache(
  restaurantId: string,
): Promise<MenuCacheResult | null> {
  const parentRef = doc(db, "food_menu_cache", restaurantId);

  // First paint: parent + foods/0 + drinks/0 in parallel — same shape Flutter uses.
  const [parentSnap, foods0Snap, drinks0Snap] = await Promise.all([
    getDoc(parentRef),
    getDoc(doc(parentRef, "foods", "0")),
    getDoc(doc(parentRef, "drinks", "0")),
  ]);

  if (!parentSnap.exists()) return null;
  const parent = parentSnap.data();

  const foodPageCount = Number(parent.foodPageCount ?? 0);
  const drinkPageCount = Number(parent.drinkPageCount ?? 0);
  const cachedFoodCount = Number(parent.cachedFoodCount ?? 0);
  const cachedDrinkCount = Number(parent.cachedDrinkCount ?? 0);
  const foodCount = Number(parent.foodCount ?? cachedFoodCount);
  const drinkCount = Number(parent.drinkCount ?? cachedDrinkCount);

  const facets = Array.isArray(parent.categoryFacets)
    ? (parent.categoryFacets as Array<{ value?: unknown; count?: unknown }>)
        .map((f) => (f && typeof f === "object" ? String(f.value ?? "") : ""))
        .filter((s) => s.length > 0)
    : [];

  // Fetch remaining shards in parallel (skip index 0 — already fetched).
  const remainingFoodReads: Promise<DocumentData[]>[] = [];
  for (let i = 1; i < foodPageCount; i++) {
    remainingFoodReads.push(
      getDoc(doc(parentRef, "foods", String(i))).then((snap) => {
        const data = snap.data();
        return Array.isArray(data?.items) ? (data.items as DocumentData[]) : [];
      }),
    );
  }
  const remainingDrinkReads: Promise<DocumentData[]>[] = [];
  for (let i = 1; i < drinkPageCount; i++) {
    remainingDrinkReads.push(
      getDoc(doc(parentRef, "drinks", String(i))).then((snap) => {
        const data = snap.data();
        return Array.isArray(data?.items) ? (data.items as DocumentData[]) : [];
      }),
    );
  }

  const [extraFoodPages, extraDrinkPages] = await Promise.all([
    Promise.all(remainingFoodReads),
    Promise.all(remainingDrinkReads),
  ]);

  const foodPage0 = foods0Snap.exists()
    ? Array.isArray(foods0Snap.data()?.items)
      ? (foods0Snap.data()!.items as DocumentData[])
      : []
    : [];
  const drinkPage0 = drinks0Snap.exists()
    ? Array.isArray(drinks0Snap.data()?.items)
      ? (drinks0Snap.data()!.items as DocumentData[])
      : []
    : [];

  const allFoodItems = [...foodPage0, ...extraFoodPages.flat()];
  const allDrinkItems = [...drinkPage0, ...extraDrinkPages.flat()];

  const foods: Food[] = [];
  for (const item of allFoodItems) {
    const parsed = parseFood(
      String((item as Record<string, unknown>).id ?? ""),
      item as Record<string, unknown>,
      restaurantId,
    );
    if (parsed && parsed.isAvailable) foods.push(parsed);
  }
  const drinks: DrinkItem[] = [];
  for (const item of allDrinkItems) {
    const parsed = parseDrink(
      String((item as Record<string, unknown>).id ?? ""),
      item as Record<string, unknown>,
      restaurantId,
    );
    if (parsed && parsed.isAvailable) drinks.push(parsed);
  }

  // If the cache was capped, `cachedFoodCount < foodCount`. Surface that to
  // the caller so it can decide whether to top up from Firestore-direct. We
  // accept the cap as authoritative for now — restaurants with >500 items are
  // rare and the cache cap (MENU_CACHE_HARD_LIMIT) is sized for that.
  const isComplete =
    cachedFoodCount >= foodCount && cachedDrinkCount >= drinkCount;

  return { foods, drinks, categoryFacets: facets, isComplete };
}

// Pre-cache-era direct Firestore fetch. Used on cache miss or hard error.
async function loadDirectFromFirestore(restaurantId: string): Promise<{
  foods: Food[];
  drinks: DrinkItem[];
}> {
  const [foodsSnap, drinksSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, "foods"),
        where("restaurantId", "==", restaurantId),
        where("isAvailable", "==", true),
      ),
    ),
    getDocs(
      query(
        collection(db, "drinks"),
        where("restaurantId", "==", restaurantId),
        where("isAvailable", "==", true),
      ),
    ),
  ]);

  const foods: Food[] = [];
  for (const docSnap of foodsSnap.docs) {
    const parsed = parseFood(docSnap.id, docSnap.data(), restaurantId);
    if (parsed) foods.push(parsed);
  }
  const drinks: DrinkItem[] = [];
  for (const docSnap of drinksSnap.docs) {
    const parsed = parseDrink(docSnap.id, docSnap.data(), restaurantId);
    if (parsed) drinks.push(parsed);
  }
  return { foods, drinks };
}

export default function RestaurantDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { user } = useUser();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [drinks, setDrinks] = useState<DrinkItem[]>([]);
  const [categoryFacets, setCategoryFacets] = useState<string[] | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id) return;

    try {
      // Restaurant doc + menu cache attempt in parallel. The restaurant doc
      // lives outside the menu cache; reading both at once costs one extra
      // request but cuts perceived latency.
      const [restaurantSnap, cacheResult] = await Promise.all([
        getDoc(doc(db, "restaurants", id)),
        loadFromMenuCache(id).catch((err) => {
          console.warn("[RestaurantDetail] Menu cache read failed:", err);
          return null;
        }),
      ]);

      if (restaurantSnap.exists()) {
        setRestaurant(parseRestaurant(restaurantSnap.id, restaurantSnap.data()));
      }

      if (cacheResult) {
        setFoods(cacheResult.foods);
        setDrinks(cacheResult.drinks);
        setCategoryFacets(cacheResult.categoryFacets);
        if (process.env.NODE_ENV !== "production") {
          console.debug("[RestaurantDetail] menu_cache_hit", {
            restaurantId: id,
            foods: cacheResult.foods.length,
            drinks: cacheResult.drinks.length,
            isComplete: cacheResult.isComplete,
          });
        }
      } else {
        // Cache miss → direct Firestore query. categoryFacets stays undefined
        // so the body falls back to its Typesense facets call.
        const direct = await loadDirectFromFirestore(id);
        setFoods(direct.foods);
        setDrinks(direct.drinks);
        setCategoryFacets(undefined);
        if (process.env.NODE_ENV !== "production") {
          console.debug("[RestaurantDetail] menu_cache_miss", {
            restaurantId: id,
            foods: direct.foods.length,
            drinks: direct.drinks.length,
          });
        }
      }
    } catch (error) {
      console.error("[RestaurantDetail] Fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip">
      <FoodCartProvider user={user} db={db}>
        <RestaurantDetail
          restaurant={restaurant}
          foods={foods}
          drinks={drinks}
          categoryFacets={categoryFacets}
          loading={loading}
        />
      </FoodCartProvider>
      <Footer />
    </div>
  );
}
