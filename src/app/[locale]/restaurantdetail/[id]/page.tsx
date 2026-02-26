"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Restaurant } from "@/types/Restaurant";
import { Food } from "@/types/Food";
import RestaurantDetail from "@/app/components/restaurants/RestaurantDetail";
import Footer from "@/app/components/Footer";

export default function RestaurantDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id) return;

    try {
      const [restaurantSnap, foodsSnap] = await Promise.all([
        getDoc(doc(db, "restaurants", id)),
        getDocs(
          query(
            collection(db, "foods"),
            where("restaurantId", "==", id),
            where("isAvailable", "==", true)
          )
        ),
      ]);

      if (restaurantSnap.exists()) {
        const d = restaurantSnap.data();
        setRestaurant({
          id: restaurantSnap.id,
          name: d.name as string,
          address: d.address as string | undefined,
          averageRating: d.averageRating != null ? Number(d.averageRating) : undefined,
          reviewCount: d.reviewCount != null ? Number(d.reviewCount) : undefined,
          categories: Array.isArray(d.categories) ? (d.categories as string[]) : undefined,
          contactNo: d.contactNo as string | undefined,
          coverImageUrls: Array.isArray(d.coverImageUrls) ? (d.coverImageUrls as string[]) : undefined,
          profileImageUrl: d.profileImageUrl as string | undefined,
          followerCount: d.followerCount != null ? Number(d.followerCount) : undefined,
          isActive: d.isActive !== false,
          ownerId: d.ownerId as string | undefined,
          latitude: d.latitude != null ? Number(d.latitude) : undefined,
          longitude: d.longitude != null ? Number(d.longitude) : undefined,
          foodType: Array.isArray(d.foodType) ? (d.foodType as string[]) : undefined,
          cuisineTypes: Array.isArray(d.cuisineTypes) ? (d.cuisineTypes as string[]) : undefined,
          workingDays: Array.isArray(d.workingDays) ? (d.workingDays as string[]) : undefined,
        });
      }

      const foodList: Food[] = [];
      for (const docSnap of foodsSnap.docs) {
        const d = docSnap.data();
        if (!d.name) continue;
        foodList.push({
          id: docSnap.id,
          name: d.name as string,
          description: d.description as string | undefined,
          foodCategory: (d.foodCategory || "") as string,
          foodType: (d.foodType || "") as string,
          imageUrl: d.imageUrl as string | undefined,
          isAvailable: d.isAvailable !== false,
          preparationTime: d.preparationTime != null ? Number(d.preparationTime) : undefined,
          price: Number(d.price) || 0,
          restaurantId: id,
        });
      }

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
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <RestaurantDetail restaurant={restaurant} foods={foods} loading={loading} />
      <Footer />
    </div>
  );
}
