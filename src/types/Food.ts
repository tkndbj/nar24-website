// types/food.ts

export interface FoodDiscount {
  percentage: number;
  originalPrice: number;
  startDate: Date;
  endDate: Date;
}

export interface FoodExtra {
  name: string;
  price: number;
  /** Per-extra translations spliced from the parent food's `extra_translations`
   *  map by the fetch layer. Undefined when the extra is a predefined English
   *  key (handled by the static translation dictionary). */
  nameTr?: string;
  nameEn?: string;
  nameRu?: string;
}

export interface Food {
  id: string;
  name: string;
  description?: string;
  foodCategory: string;
  foodType: string;
  imageUrl?: string;
  imageStoragePath?: string;
  isAvailable: boolean;
  preparationTime?: number;
  price: number;
  restaurantId: string;
  extras?: FoodExtra[];
  discount?: FoodDiscount;
  /** Auto-translations written by the `translateFoodOnWrite` Cloud Function.
   *  Undefined when translation hasn't run yet — callers fall back to the
   *  raw user-typed `name` / `description`. `nameTr` / `descriptionTr` exist
   *  for the case where the restaurant typed the source in English or
   *  Russian — the CF produces a Turkish variant for TR users. */
  nameTr?: string;
  nameEn?: string;
  nameRu?: string;
  descriptionTr?: string;
  descriptionEn?: string;
  descriptionRu?: string;
}
