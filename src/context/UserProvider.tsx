// contexts/UserProvider.tsx

"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  getIdToken as getFirebaseIdToken,
} from "firebase/auth";
import {
  doc,
  updateDoc,
  getDocFromCache,
  getDocFromServer,
  DocumentSnapshot,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase"; // Adjust path as needed

interface ProfileData {
  displayName?: string;
  email?: string;
  isAdmin?: boolean;
  isNew?: boolean;
  isVerified?: boolean;
  gender?: string;
  birthDate?: string;
  languageCode?: string;
  bio?: string;
  phone?: string;
  location?: string;
  website?: string;
  profileImage?: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  whatsapp?: string;
  [key: string]: unknown;
}

interface UserContextType {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  isProfileComplete: boolean;
  profileData: ProfileData | null;
  fetchUserData: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateProfileData: (updates: Partial<ProfileData>) => Promise<void>;
  getIdToken: () => Promise<string | null>;
  getProfileField: <T>(key: string) => T | null;
  updateUserDataImmediately: (
    user: User,
    options?: { profileComplete?: boolean }
  ) => Promise<void>;
  setProfileComplete: (complete: boolean) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = (): UserContextType => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};

interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileComplete, setProfileCompleteState] = useState<boolean | null>(
    null
  );

  // Calculate profile completion status
  const isProfileComplete = React.useMemo(() => {
    // Use cached value if available, otherwise check profile data
    if (profileComplete !== null) return profileComplete;

    if (!profileData) return false;

    // ✅ FIX: Use consistent logic (only birthDate, not birthYear)
    const complete = !!(
      profileData.gender &&
      profileData.birthDate && // Only check birthDate
      profileData.languageCode
    );

    return complete;
  }, [profileComplete, profileData]);

  // Reset all state (used during logout)
  const resetState = () => {
    setIsAdmin(false);
    setProfileData(null);
    setProfileCompleteState(null);
    setIsLoading(false);
  };

  // Update user data from Firestore document
  const updateUserDataFromDoc = (docData: Record<string, unknown>) => {
    const data = docData || {};
    setIsAdmin(data.isAdmin === true);
    setProfileData(data);

    // Update cached profile completion status with consistent logic
    const complete = !!(
      data.gender &&
      data.birthDate && // Only check birthDate (consistent with AuthService)
      data.languageCode
    );
    setProfileCompleteState(complete);
  };

  // Create default user document for new users
  const createDefaultUserDoc = async (currentUser: User) => {
    try {
      // ❌ DON'T try to create document - this causes permission error
      // Instead, just set safe local defaults and let AuthService handle document creation

      console.log(
        "User document not found, setting safe defaults for",
        currentUser.uid
      );

      // Set safe defaults locally
      const defaultData: ProfileData = {
        displayName:
          currentUser.displayName || currentUser.email?.split("@")[0] || "User",
        email: currentUser.email || "",
        isAdmin: false,
        isNew: true,
      };

      setProfileData(defaultData);
      setIsAdmin(false);
      setProfileCompleteState(false);

      // The document will be created by AuthService on next login/action
    } catch (error) {
      console.error("Error setting default user data:", error);
      // Set minimal safe defaults
      setProfileData({
        displayName: "User",
        email: currentUser.email || "",
        isAdmin: false,
        isNew: true,
      });
      setIsAdmin(false);
      setProfileCompleteState(false);
    }
  };

  // Fetch additional user data from Firestore
  const fetchUserData = async () => {
    if (!user) return;

    try {
      // Try cache first for faster response
      try {
        const cacheDoc = await getDocFromCache(doc(db, "users", user.uid));

        if (cacheDoc.exists()) {
          updateUserDataFromDoc(cacheDoc.data());
        }
      } catch {
        // Cache might not be available - continue with server fetch
      }

      // Always fetch from server for accurate data with timeout
      const serverDocPromise = getDocFromServer(doc(db, "users", user.uid));
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 10000)
      );

      const serverDoc = (await Promise.race([
        serverDocPromise,
        timeoutPromise,
      ])) as DocumentSnapshot;

      if (serverDoc.exists()) {
        updateUserDataFromDoc(serverDoc.data());
      } else {
        // Document doesn't exist - set safe defaults without trying to create it
        console.log(
          "User document not found for",
          user.uid,
          ", using safe defaults"
        );
        await createDefaultUserDoc(user);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      // Set safe defaults on error
      setIsAdmin(false);
      setProfileData({
        displayName: user.displayName || user.email?.split("@")[0] || "User",
        email: user.email || "",
        isAdmin: false,
        isNew: true,
      });
      setProfileCompleteState(false); // Safe default - assume incomplete
    } finally {
      setIsLoading(false);
    }
  };

  // **NEW**: Update user data immediately (for login optimization)
  const updateUserDataImmediately = async (
    currentUser: User,
    options?: { profileComplete?: boolean }
  ) => {
    setUser(currentUser);

    if (options?.profileComplete !== undefined) {
      setProfileCompleteState(options.profileComplete);
    }

    // Don't set loading to false yet - still fetch fresh data in background

    // Fetch fresh data in background without blocking UI
    backgroundFetchUserData(currentUser);
  };

  // **NEW**: Set profile completion status immediately
  const setProfileComplete = (complete: boolean) => {
    setProfileCompleteState(complete);
  };

  // Background fetch that doesn't affect loading state
  const backgroundFetchUserData = async (currentUser: User) => {
    if (!currentUser) return;

    try {
      const docPromise = getDocFromServer(doc(db, "users", currentUser.uid));
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 10000)
      );

      const docSnapshot = (await Promise.race([
        docPromise,
        timeoutPromise,
      ])) as DocumentSnapshot;

      if (docSnapshot.exists()) {
        updateUserDataFromDoc(docSnapshot.data());
      }
    } catch (error) {
      console.error("Error in background fetch:", error);
      // Don't update UI on background fetch errors
    }
  };

  // Refresh the current user's data and fetch updated state
  const refreshUser = async () => {
    try {
      await auth.currentUser?.reload();
      const currentUser = auth.currentUser;
      setUser(currentUser);
      if (currentUser) {
        await fetchUserData();
      }
    } catch (error) {
      console.error("Error refreshing user:", error);
    }
  };

  // Update profile data and refresh completion status
  const updateProfileData = async (updates: Partial<ProfileData>) => {
    if (!user) return;

    try {
      // Update Firestore with timeout
      const updatePromise = updateDoc(doc(db, "users", user.uid), updates);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 10000)
      );

      await Promise.race([updatePromise, timeoutPromise]);

      // Update local cache
      const updatedProfileData = { ...(profileData || {}), ...updates };
      setProfileData(updatedProfileData);

      // ✅ FIX: Use consistent logic (only birthDate, not birthYear)
      const complete = !!(
        updatedProfileData.gender &&
        updatedProfileData.birthDate && // Only check birthDate
        updatedProfileData.languageCode
      );
      setProfileCompleteState(complete);
    } catch (error) {
      console.error("Error updating profile data:", error);
      throw error;
    }
  };

  // Get the Firebase ID token, forcing a refresh if necessary
  const getIdToken = async (): Promise<string | null> => {
    if (!user) {
      console.log("No user logged in to fetch ID token.");
      return null;
    }
    return await getFirebaseIdToken(user, true);
  };

  // Get specific profile field
  const getProfileField = <T,>(key: string): T | null => {
    return (profileData?.[key] as T) || null;
  };

  // Listen to authentication state changes
  useEffect(() => {
    setIsLoading(true);

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        if (currentUser) {
          // If a user is logged in, fetch additional user data
          fetchUserData();
        } else {
          // If the user is logged out, reset all state
          resetState();
        }
      },
      (error) => {
        console.error("Error in authStateChanges:", error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Update fetchUserData dependency when user changes
  useEffect(() => {
    if (user) {
      fetchUserData();
    }
  }, [user]);

  const contextValue: UserContextType = {
    user,
    isLoading,
    isAdmin,
    isProfileComplete,
    profileData,
    fetchUserData,
    refreshUser,
    updateProfileData,
    getIdToken,
    getProfileField,
    updateUserDataImmediately,
    setProfileComplete,
  };

  return (
    <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>
  );
};
