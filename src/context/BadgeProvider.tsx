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
import { onAuthStateChanged, User } from "firebase/auth";
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);

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
        setCurrentUser(null);
        setIsLoading(false);
        setError(null);
      } else {
        // User logged in - setup Firestore listeners
        setCurrentUser(user);
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
        (snapshot) => {
          console.log("📄 BadgeProvider: User doc updated");
          // You can access other user fields here if needed
          // Note: We don't update notification count here to avoid conflicts
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

      // (B) Listen to chats collection for unread messages
      const chatsQuery = query(
        collection(db, "chats"),
        where("participants", "array-contains", userId)
      );

      const chatsUnsubscribe = onSnapshot(
        chatsQuery,
        (snapshot) => {
          console.log("💬 BadgeProvider: Chats updated, processing...");
          let totalUnread = 0;

          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const unreadCounts =
              (data.unreadCounts as Record<string, number>) || {};
            totalUnread += unreadCounts[userId] || 0;
          });

          console.log("💬 BadgeProvider: Total unread messages:", totalUnread);
          setUnreadMessagesCount(totalUnread);
        },
        (error) => {
          console.error("❌ BadgeProvider: Error listening to chats:", error);
          setError("Failed to sync message count");
        }
      );
      newUnsubscribes.push(chatsUnsubscribe);

      // (C) Listen to notifications subcollection
      // Exclude notifications of type 'message' from badge count
      const notificationsQuery = query(
        collection(db, "users", userId, "notifications"),
        where("isRead", "==", false),
        where("type", "!=", "message"),
        orderBy("type") // Required when using != operator
      );

      const notificationsUnsubscribe = onSnapshot(
        notificationsQuery,
        (snapshot) => {
          const count = snapshot.docs.length;
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
