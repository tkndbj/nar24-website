"use client";

import { useState, useEffect } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase-lazy";

/**
 * Lightweight Firestore listener that returns the food cart item count.
 * Does NOT depend on FoodCartProvider — reads snapshot.size directly.
 *
 * Used by RestaurantHeader for the badge. Automatically subscribes
 * when uid is provided and unsubscribes on unmount or logout.
 */
export function useFoodCartCount(uid: string | null | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) {
      setCount(0);
      return;
    }

    let unsubscribe: (() => void) | null = null;

    const start = async () => {
      try {
        const db = await getFirebaseDb();
        const q = query(collection(db, "users", uid, "foodCart"));

        unsubscribe = onSnapshot(
          q,
          { includeMetadataChanges: false },
          (snapshot) => {
            // Sum quantities for accurate badge count
            let total = 0;
            snapshot.docs.forEach((doc) => {
              const qty = doc.data().quantity;
              total += typeof qty === "number" && qty > 0 ? qty : 1;
            });
            setCount(total);
          },
          (error) => {
            console.error("[useFoodCartCount] Listener error:", error);
            setCount(0);
          },
        );
      } catch (error) {
        console.error("[useFoodCartCount] Init error:", error);
      }
    };

    start();

    return () => {
      unsubscribe?.();
    };
  }, [uid]);

  return count;
}