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
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import TwoFactorService from "@/services/TwoFactorService";

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
  twoFactorEnabled?: boolean;
  lastTwoFactorVerification?: Timestamp;
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
  // New 2FA related methods
  isPending2FA: boolean;
  complete2FA: () => void;
  cancel2FA: () => Promise<void>;
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

  // CRITICAL SECURITY CHANGE: Store Firebase user internally but don't expose it when 2FA is pending
  const [pending2FA, setPending2FA] = useState(false);
  const [internalFirebaseUser, setInternalFirebaseUser] = useState<User | null>(
    null
  );

  const twoFactorService = TwoFactorService.getInstance();

  // Calculate profile completion status
  const isProfileComplete = React.useMemo(() => {
    if (profileComplete !== null) return profileComplete;
    if (!profileData) return false;

    const complete = !!(
      profileData.gender &&
      profileData.birthDate &&
      profileData.languageCode
    );

    return complete;
  }, [profileComplete, profileData]);

  // Check if user needs 2FA verification
  const check2FARequirement = async (firebaseUser: User): Promise<boolean> => {
    try {
      const needs2FA = await twoFactorService.is2FAEnabled();

      if (needs2FA) {
        // Check if user has recently verified 2FA (within last 5 minutes)
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDoc = await getDocFromServer(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const lastVerification =
            userData?.lastTwoFactorVerification?.toDate?.();

          if (lastVerification) {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (lastVerification > fiveMinutesAgo) {
              // Recently verified, allow access
              return false;
            }
          }
        }

        return true; // Needs 2FA verification
      }

      return false; // No 2FA needed
    } catch (error) {
      console.error("Error checking 2FA requirement:", error);
      return false; // On error, don't block access
    }
  };

  // Reset all state (used during logout)
  const resetState = () => {
    setIsAdmin(false);
    setProfileData(null);
    setProfileCompleteState(null);
    setIsLoading(false);
    setPending2FA(false);
    setInternalFirebaseUser(null);
    setUser(null);
  };

  // Update user data from Firestore document
  const updateUserDataFromDoc = (docData: Record<string, unknown>) => {
    const data = docData || {};
    setIsAdmin(data.isAdmin === true);
    setProfileData(data);

    const complete = !!(data.gender && data.birthDate && data.languageCode);
    setProfileCompleteState(complete);
  };

  // Create default user document for new users
  const createDefaultUserDoc = async (currentUser: User) => {
    try {
      console.log(
        "User document not found, setting safe defaults for",
        currentUser.uid
      );

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
    } catch (error) {
      console.error("Error setting default user data:", error);
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
    // SECURITY: Only use the exposed user, not the internal Firebase user
    const currentUser = user;
    if (!currentUser) return;

    try {
      // Try cache first for faster response
      try {
        const cacheDoc = await getDocFromCache(
          doc(db, "users", currentUser.uid)
        );
        if (cacheDoc.exists()) {
          updateUserDataFromDoc(cacheDoc.data());
        }
      } catch {
        // Cache might not be available - continue with server fetch
      }

      // Always fetch from server for accurate data with timeout
      const serverDocPromise = getDocFromServer(
        doc(db, "users", currentUser.uid)
      );
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
        console.log(
          "User document not found for",
          currentUser.uid,
          ", using safe defaults"
        );
        await createDefaultUserDoc(currentUser);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      setIsAdmin(false);
      setProfileData({
        displayName:
          currentUser.displayName || currentUser.email?.split("@")[0] || "User",
        email: currentUser.email || "",
        isAdmin: false,
        isNew: true,
      });
      setProfileCompleteState(false);
    } finally {
      setIsLoading(false);
    }
  };

  // **MODIFIED**: Update user data immediately (for login optimization)
  const updateUserDataImmediately = async (
    currentUser: User,
    options?: { profileComplete?: boolean }
  ) => {
    // SECURITY: Always store internally first
    setInternalFirebaseUser(currentUser);

    if (options?.profileComplete !== undefined) {
      setProfileCompleteState(options.profileComplete);
    }

    // Check if 2FA is required
    const needs2FA = await check2FARequirement(currentUser);

    if (needs2FA) {
      setPending2FA(true);
      setUser(null); // CRITICAL: Don't expose user until 2FA is complete
    } else {
      setUser(currentUser);
      setPending2FA(false);
    }

    // Fetch fresh data in background without blocking UI
    if (!needs2FA) {
      backgroundFetchUserData(currentUser);
    }
  };

  // Set profile completion status immediately
  const setProfileComplete = (complete: boolean) => {
    setProfileCompleteState(complete);
  };

  // **MODIFIED**: Complete 2FA verification
  const complete2FA = () => {
    if (internalFirebaseUser && pending2FA) {
      setUser(internalFirebaseUser); // Now expose the user
      setPending2FA(false);

      // Fetch user data now that 2FA is complete
      backgroundFetchUserData(internalFirebaseUser);
    }
  };

  // **MODIFIED**: Cancel 2FA and sign out
  const cancel2FA = async () => {
    if (internalFirebaseUser) {
      await auth.signOut();
    }
    resetState();
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
    }
  };

  // Refresh the current user's data and fetch updated state
  const refreshUser = async () => {
    try {
      await auth.currentUser?.reload();
      const currentUser = auth.currentUser;
      setInternalFirebaseUser(currentUser);

      if (currentUser) {
        const needs2FA = await check2FARequirement(currentUser);

        if (needs2FA) {
          setPending2FA(true);
          setUser(null);
        } else {
          setUser(currentUser);
          setPending2FA(false);
          await fetchUserData();
        }
      }
    } catch (error) {
      console.error("Error refreshing user:", error);
    }
  };

  // Update profile data and refresh completion status
  const updateProfileData = async (updates: Partial<ProfileData>) => {
    // SECURITY: Only use the exposed user
    const currentUser = user;
    if (!currentUser) return;

    try {
      const updatePromise = updateDoc(
        doc(db, "users", currentUser.uid),
        updates
      );
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 10000)
      );

      await Promise.race([updatePromise, timeoutPromise]);

      const updatedProfileData = { ...(profileData || {}), ...updates };
      setProfileData(updatedProfileData);

      const complete = !!(
        updatedProfileData.gender &&
        updatedProfileData.birthDate &&
        updatedProfileData.languageCode
      );
      setProfileCompleteState(complete);
    } catch (error) {
      console.error("Error updating profile data:", error);
      throw error;
    }
  };

  // **MODIFIED**: Get the Firebase ID token, forcing a refresh if necessary
  const getIdToken = async (): Promise<string | null> => {
    // SECURITY: Only use the exposed user
    const currentUser = user;
    if (!currentUser) {
      console.log("No user logged in to fetch ID token.");
      return null;
    }
    return await getFirebaseIdToken(currentUser, true);
  };

  // Get specific profile field
  const getProfileField = <T,>(key: string): T | null => {
    return (profileData?.[key] as T) || null;
  };

  // **MODIFIED**: Listen to authentication state changes
  useEffect(() => {
    setIsLoading(true);

    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        setInternalFirebaseUser(currentUser);

        if (currentUser) {
          // Check if 2FA is required
          const needs2FA = await check2FARequirement(currentUser);

          if (needs2FA) {
            setPending2FA(true);
            setUser(null); // CRITICAL: Don't expose user until 2FA is complete
          } else {
            setUser(currentUser);
            setPending2FA(false);
            // Fetch additional user data
            fetchUserData();
          }
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

  // **MODIFIED**: Update fetchUserData dependency when user changes
  useEffect(() => {
    if (user) {
      // Only fetch when user is exposed (not pending 2FA)
      fetchUserData();
    }
  }, [user]);

  const contextValue: UserContextType = {
    user, // This will be null when 2FA is pending
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
    // 2FA properties
    isPending2FA: pending2FA,
    complete2FA,
    cancel2FA,
  };

  return (
    <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>
  );
};
