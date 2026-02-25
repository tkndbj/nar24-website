import { unstable_cache } from "next/cache";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { Restaurant } from "@/types/Restaurant";
import Footer from "../../components/Footer";
import RestaurantsPage from "../../components/restaurants/RestaurantsPage";

const getRestaurants = unstable_cache(
  async (): Promise<Restaurant[]> => {
    try {
      const db = getFirestoreAdmin();
      const snapshot = await db
        .collection("restaurants")
        .where("isActive", "==", true)
        .get();

      const restaurants: Restaurant[] = [];

      for (const doc of snapshot.docs) {
        const d = doc.data();
        if (!d.name) continue;

        restaurants.push({
          id: doc.id,
          name: d.name as string,
          address: d.address as string | undefined,
          averageRating: d.averageRating != null ? Number(d.averageRating) : undefined,
          reviewCount: d.reviewCount != null ? Number(d.reviewCount) : undefined,
          categories: Array.isArray(d.categories) ? (d.categories as string[]) : undefined,
          contactNo: d.contactNo as string | undefined,
          coverImageUrls: Array.isArray(d.coverImageUrls) ? (d.coverImageUrls as string[]) : undefined,
          profileImageUrl: d.profileImageUrl as string | undefined,
          followerCount: d.followerCount != null ? Number(d.followerCount) : undefined,
          isActive: true,
          ownerId: d.ownerId as string | undefined,
          latitude: d.latitude != null ? Number(d.latitude) : undefined,
          longitude: d.longitude != null ? Number(d.longitude) : undefined,
        });
      }

      return restaurants;
    } catch (error) {
      console.error("[Restaurants] Server fetch error:", error);
      return [];
    }
  },
  ["restaurants-list"],
  { revalidate: 60 }
);

export default async function RestaurantsRoute() {
  const restaurants = await getRestaurants();

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <RestaurantsPage restaurants={restaurants} />
      <Footer />
    </div>
  );
}
