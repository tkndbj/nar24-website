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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Restaurant } from "@/types/Restaurant";
import { Food, FoodDiscount } from "@/types/Food";
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
}

export default function RestaurantDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { user } = useUser();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);

  const [drinks, setDrinks] = useState<DrinkItem[]>([]);

  const fetchData = useCallback(async () => {
    if (!id) return;

    try {
      const [restaurantSnap, foodsSnap, drinksSnap] = await Promise.all([
        getDoc(doc(db, "restaurants", id)),
        getDocs(
          query(
            collection(db, "foods"),
            where("restaurantId", "==", id),
            where("isAvailable", "==", true),
          ),
        ),
        getDocs(
          query(
            collection(db, "drinks"),
            where("restaurantId", "==", id),
            where("isAvailable", "==", true),
          ),
        ),
      ]);

      if (restaurantSnap.exists()) {
        const d = restaurantSnap.data();
        setRestaurant({
          id: restaurantSnap.id,
          name: d.name as string,
          address: d.address as string | undefined,
          averageRating:
            d.averageRating != null ? Number(d.averageRating) : undefined,
          reviewCount:
            d.reviewCount != null ? Number(d.reviewCount) : undefined,
          categories: Array.isArray(d.categories)
            ? (d.categories as string[])
            : undefined,
          contactNo: d.contactNo as string | undefined,
          coverImageUrls: Array.isArray(d.coverImageUrls)
            ? (d.coverImageUrls as string[])
            : undefined,
          profileImageUrl: d.profileImageUrl as string | undefined,
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
                  open: String(
                    (d.workingHours as Record<string, unknown>).open,
                  ),
                  close: String(
                    (d.workingHours as Record<string, unknown>).close,
                  ),
                }
              : undefined,
          minOrderPrices: Array.isArray(d.minOrderPrices)
            ? (d.minOrderPrices as Array<Record<string, unknown>>).map((p) => ({
                mainRegion: String(p.mainRegion ?? ""),
                subregion: String(p.subregion ?? ""),
                minOrderPrice: Number(p.minOrderPrice ?? 0),
              }))
            : undefined,
        });
      }

      const foodList: Food[] = [];
      for (const docSnap of foodsSnap.docs) {
        const d = docSnap.data();
        if (!d.name) continue;
        let discount: FoodDiscount | undefined;
        if (d.discount && typeof d.discount === "object") {
          const disc = d.discount as Record<string, unknown>;
          const startDate =
            disc.startDate instanceof Timestamp
              ? disc.startDate.toDate()
              : undefined;
          const endDate =
            disc.endDate instanceof Timestamp
              ? disc.endDate.toDate()
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

        foodList.push({
          id: docSnap.id,
          name: d.name as string,
          description: d.description as string | undefined,
          foodCategory: (d.foodCategory || "") as string,
          foodType: (d.foodType || "") as string,
          imageUrl: d.imageUrl as string | undefined,
          isAvailable: d.isAvailable !== false,
          preparationTime:
            d.preparationTime != null ? Number(d.preparationTime) : undefined,
          price: Number(d.price) || 0,
          extras: Array.isArray(d.extras)
            ? d.extras.map((e: Record<string, unknown>) => ({
                name: String(e.name ?? ""),
                price: Number(e.price ?? 0),
              }))
            : [],
          restaurantId: id,
          discount,
        });
      }

      setDrinks(
        drinksSnap.docs.map((docSnap) => ({
          id: docSnap.id,
          restaurantId: id,
          name: (docSnap.data().name as string) || "",
          price: Number(docSnap.data().price) || 0,
          isAvailable: true,
        })),
      );

      setFoods(foodList);
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
          loading={loading}
        />
      </FoodCartProvider>
      <Footer />
    </div>
  );
}
