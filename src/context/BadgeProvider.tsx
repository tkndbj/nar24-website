"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  ReactNode,
  useCallback,
} from "react";
import {
  collection,
 
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  Unsubscribe,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "../lib/firebase";
import { trackReads } from "@/lib/firestore-read-tracker";

interface BadgeContextType {
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
  isLoading: boolean;
  error: string | null;
}

const BadgeContext = createContext<BadgeContextType | undefined>(undefined);

export function useBadgeProvider() {
  const context = useContext(BadgeContext);
  if (context === undefined) {
    throw new Error("useBadgeProvider must be used within a BadgeProvider");
  }
  return context;
}

interface BadgeProviderProps {
  children: ReactNode;
  user?: User | null; // Optional: Accept user from parent to avoid duplicate auth listener
}

export function BadgeProvider({ children, user: userProp }: BadgeProviderProps) {
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Store unsubscribe functions using ref to avoid dependency issues
  const unsubscribesRef = useRef<Unsubscribe[]>([]);
  const currentUserIdRef = useRef<string | null>(null);

  // Cancel all subscriptions helper
  const cancelAllSubscriptions = useCallback(() => {
    console.log("🧹 BadgeProvider: Canceling all subscriptions");
    unsubscribesRef.current.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (e) {
        console.warn("Error unsubscribing:", e);
      }
    });
    unsubscribesRef.current = [];
  }, []);

  // Setup Firestore listeners helper
  const setupFirestoreListeners = useCallback((userId: string) => {
    console.log(
      "🔥 BadgeProvider: Setting up Firestore listeners for user:",
      userId
    );
    setIsLoading(true);
    setError(null);

    // Cancel existing subscriptions
    cancelAllSubscriptions();

    const newUnsubscribes: Unsubscribe[] = [];

    try {
      // Listen for ANY unread notification (presence only). limit(1) caps the
      // billing to 1 read on attach + 1 per change, no matter how many unread
      // docs exist — UI just renders a dot on the bell icon.
      const notificationsQuery = query(
        collection(db, "users", userId, "notifications"),
        where("isRead", "==", false),
        where("type", "!=", "message"),
        orderBy("type"), // Required when using != operator
        limit(1)
      );

      const notificationsUnsubscribe = onSnapshot(
        notificationsQuery,
        (querySnapshot) => {
          const count = querySnapshot.docs.length;
          console.log("🔔 BadgeProvider: Has unread notifications:", count > 0);
          trackReads("Badge:Notifications", count);
          setUnreadNotificationsCount(count);
        },
        (error) => {
          console.error(
            "❌ BadgeProvider: Error listening to notifications:",
            error
          );
          setError("Failed to sync notification count");
        }
      );
      newUnsubscribes.push(notificationsUnsubscribe);

      // Store all unsubscribe functions
      unsubscribesRef.current = newUnsubscribes;
      setIsLoading(false);

      console.log("✅ BadgeProvider: All listeners setup successfully");
    } catch (error) {
      console.error("❌ BadgeProvider: Error setting up listeners:", error);
      setError("Failed to setup real-time sync");
      setIsLoading(false);

      // Cleanup any partial subscriptions
      newUnsubscribes.forEach((unsubscribe) => {
        try {
          unsubscribe();
        } catch (e) {
          console.warn("Error cleaning up partial subscription:", e);
        }
      });
    }
  }, [cancelAllSubscriptions]);

  // Handle user prop changes (optimized - no internal auth listener needed when user prop is provided)
  useEffect(() => {
    console.log("🔧 BadgeProvider: User changed:", userProp?.uid || "logged out");

    const newUserId = userProp?.uid || null;

    // Skip if user hasn't changed
    if (newUserId === currentUserIdRef.current) {
      return;
    }

    currentUserIdRef.current = newUserId;

    if (!newUserId) {
      // User logged out - cleanup and reset
      cancelAllSubscriptions();
      setUnreadMessagesCount(0);
      setUnreadNotificationsCount(0);
      setIsLoading(false);
      setError(null);
    } else {
      // Defer listener setup to avoid blocking initial paint
      let deferredId: number | ReturnType<typeof setTimeout>;
      if (typeof requestIdleCallback !== "undefined") {
        deferredId = requestIdleCallback(
          () => setupFirestoreListeners(newUserId),
          { timeout: 3000 }
        );
      } else {
        deferredId = setTimeout(
          () => setupFirestoreListeners(newUserId),
          1000
        );
      }

      return () => {
        if (typeof cancelIdleCallback !== "undefined") {
          cancelIdleCallback(deferredId as number);
        } else {
          clearTimeout(deferredId as ReturnType<typeof setTimeout>);
        }
        cancelAllSubscriptions();
      };
    }

    return () => {
      cancelAllSubscriptions();
    };
  }, [userProp, cancelAllSubscriptions, setupFirestoreListeners]);

  const value: BadgeContextType = {
    unreadMessagesCount,
    unreadNotificationsCount,
    isLoading,
    error,
  };

  return (
    <BadgeContext.Provider value={value}>{children}</BadgeContext.Provider>
  );
}
