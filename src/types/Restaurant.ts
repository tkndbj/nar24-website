export interface Restaurant {
  id: string;
  name: string;
  address?: string;
  averageRating?: number;
  reviewCount?: number;
  categories?: string[];
  contactNo?: string;
  coverImageUrls?: string[];
  profileImageUrl?: string;
  followerCount?: number;
  isActive?: boolean;
  isBoosted?: boolean;
  ownerId?: string;
  latitude?: number;
  longitude?: number;
  clickCount?: number;
  foodType?: string[];
  cuisineTypes?: string[];
  workingDays?: string[];
}
