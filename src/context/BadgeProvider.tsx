"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  Unsubscribe,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../lib/firebase";

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
}

export function BadgeProvider({ children }: BadgeProviderProps) {
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Store unsubscribe functions
  const [unsubscribes, setUnsubscribes] = useState<Unsubscribe[]>([]);

  useEffect(() => {
    console.log("🔧 BadgeProvider: Initializing...");

    // Listen to auth state changes
    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
      console.log(
        "👤 BadgeProvider: Auth state changed:",
        user?.uid || "logged out"
      );

      if (!user) {
        // User logged out - cleanup and reset
        cancelAllSubscriptions();
        setUnreadMessagesCount(0);
        setUnreadNotificationsCount(0);
        setIsLoading(false);
        setError(null);
      } else {
        // User logged in - setup Firestore listeners
        setupFirestoreListeners(user.uid);
      }
    });

    return () => {
      authUnsubscribe();
      cancelAllSubscriptions();
    };
  }, []);

  const cancelAllSubscriptions = () => {
    console.log("🧹 BadgeProvider: Canceling all subscriptions");
    unsubscribes.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (e) {
        console.warn("Error unsubscribing:", e);
      }
    });
    setUnsubscribes([]);
  };

  const setupFirestoreListeners = (userId: string) => {
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
      // (A) Listen to user document for any additional data
      const userDocUnsubscribe = onSnapshot(
        doc(db, "users", userId),
        (docSnapshot) => {
          console.log("📄 BadgeProvider: User doc updated");
          // You can access other user fields here if needed
          const userData = docSnapshot.data();
          if (userData) {
            // Process user document data if needed
            console.log("User data:", userData);
          }
        },
        (error) => {
          console.error(
            "❌ BadgeProvider: Error listening to user doc:",
            error
          );
          setError("Failed to sync user data");
        }
      );
      newUnsubscribes.push(userDocUnsubscribe);

      // (B) Listen to notifications subcollection
      // Exclude notifications of type 'message' from badge count
      const notificationsQuery = query(
        collection(db, "users", userId, "notifications"),
        where("isRead", "==", false),
        where("type", "!=", "message"),
        orderBy("type") // Required when using != operator
      );

      const notificationsUnsubscribe = onSnapshot(
        notificationsQuery,
        (querySnapshot) => {
          const count = querySnapshot.docs.length;
          console.log("🔔 BadgeProvider: Unread notifications count:", count);
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
      setUnsubscribes(newUnsubscribes);
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
  };

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
