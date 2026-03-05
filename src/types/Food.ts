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
}

export interface Food {
  id: string;
  name: string;
  description?: string;
  foodCategory: string;
  foodType: string;
  imageUrl?: string;
  isAvailable: boolean;
  preparationTime?: number;
  price: number;
  restaurantId: string;
  extras?: FoodExtra[];
  discount?: FoodDiscount;
}
