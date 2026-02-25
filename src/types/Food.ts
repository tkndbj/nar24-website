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
}
