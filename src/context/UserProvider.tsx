// contexts/UserProvider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useMemo,
} from "react";
import { User } from "firebase/auth";
import {
  doc,
  updateDoc,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import TwoFactorService from "@/services/TwoFactorService";
import { cacheManager } from "@/app/utils/cacheManager";
import { requestDeduplicator } from "@/app/utils/requestDeduplicator";
import { debouncer } from "@/app/utils/debouncer";

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
  const [profileComplete, setProfileCompleteState] = useState<boolean | null>(null);
  const [pending2FA, setPending2FA] = useState(false);
  const [internalFirebaseUser, setInternalFirebaseUser] = useState<User | null>(null);

  const twoFactorService = useMemo(() => TwoFactorService.getInstance(), []);

  // Calculate profile completion status
  const isProfileComplete = useMemo(() => {
    if (profileComplete !== null) return profileComplete;
    if (!profileData) return false;

    return !!(
      profileData.gender &&
      profileData.birthDate &&
      profileData.languageCode
    );
  }, [profileComplete, profileData]);

  // Check if user needs 2FA verification
  const check2FARequirement = useCallback(async (firebaseUser: User): Promise<boolean> => {
    if (typeof window === "undefined") return false;

    try {
      const isEmailPasswordUser =
        firebaseUser.providerData?.some?.(
          (info) => info.providerId === "password"
        ) ?? false;

      if (isEmailPasswordUser && !firebaseUser.emailVerified) {
        return false;
      }

      const needs2FA = await twoFactorService.is2FAEnabled();

      if (needs2FA) {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const lastVerification = userData?.lastTwoFactorVerification?.toDate?.();

          if (lastVerification) {
            // Reduced from 5 minutes to 2 minutes for better security
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
            if (lastVerification > twoMinutesAgo) {
              return false;
            }
          }
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error("Error checking 2FA requirement:", error);
      return false;
    }
  }, [twoFactorService]);

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    const currentUser = user || internalFirebaseUser;
    if (!currentUser) return;

    try {
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));

      if (userDoc.exists()) {
        const data = userDoc.data();
        setProfileData(data);
        setIsAdmin(data.isAdmin === true);

        const complete = !!(data.gender && data.birthDate && data.languageCode);
        setProfileCompleteState(complete);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  }, [user, internalFirebaseUser]);

  // Initialize auth state listener
  useEffect(() => {
    if (typeof window === "undefined") return;

    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        setInternalFirebaseUser(firebaseUser);

        const needs2FA = await check2FARequirement(firebaseUser);

        if (needs2FA) {
          setPending2FA(true);
          setUser(null);
        } else {
          setUser(firebaseUser);
          setPending2FA(false);
        }

        // Fetch profile data
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setProfileData(data);
            setIsAdmin(data.isAdmin === true);
          }
        } catch (error) {
          console.error("Error fetching initial user data:", error);
        }
      } else {
        // User logged out
        setUser(null);
        setInternalFirebaseUser(null);
        setProfileData(null);
        setIsAdmin(false);
        setPending2FA(false);
        
        // ✅ NEW: Clear all caches on logout
        cacheManager.clearAll();
        requestDeduplicator.cancelAll();
        debouncer.cancelAll();
        console.log('🧹 Cleared all caches and pending operations on logout');
      }

      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [check2FARequirement]);

  // Refresh user
  const refreshUser = useCallback(async () => {
    await auth.currentUser?.reload();
    if (auth.currentUser) {
      setUser(auth.currentUser);
      await fetchUserData();
    }
  }, [fetchUserData]);

  // Update profile data
  const updateProfileData = useCallback(async (updates: Partial<ProfileData>) => {
    const currentUser = user || internalFirebaseUser;
    if (!currentUser) return;

    try {
      await debouncer.debounce(
        'update-profile',
        async () => {
          await updateDoc(doc(db, "users", currentUser.uid), updates);
        },
        300 // 300ms debounce
      )();

      const updatedProfileData = { ...(profileData || {}), ...updates };
      setProfileData(updatedProfileData);
      setIsAdmin(updatedProfileData.isAdmin === true);

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
  }, [user, internalFirebaseUser, profileData]);

  // Get ID token
  const getIdToken = useCallback(async (): Promise<string | null> => {
    const currentUser = user || internalFirebaseUser;
    if (!currentUser) {
      console.log("No user logged in to fetch ID token.");
      return null;
    }
    try {
      return await currentUser.getIdToken(true);
    } catch (error) {
      console.error("Error getting ID token:", error);
      return null;
    }
  }, [user, internalFirebaseUser]);

  // Get profile field
  const getProfileField = useCallback(<T,>(key: string): T | null => {
    return (profileData?.[key] as T) || null;
  }, [profileData]);

  // Update user data immediately
  const updateUserDataImmediately = useCallback(async (
    currentUser: User,
    options?: { profileComplete?: boolean }
  ) => {
    setInternalFirebaseUser(currentUser);

    if (options?.profileComplete !== undefined) {
      setProfileCompleteState(options.profileComplete);
    }

    const needs2FA = await check2FARequirement(currentUser);

    if (needs2FA) {
      setPending2FA(true);
      setUser(null);
    } else {
      setUser(currentUser);
      setPending2FA(false);
    }
  }, [check2FARequirement]);

  // Set profile complete
  const setProfileComplete = useCallback((complete: boolean) => {
    setProfileCompleteState(complete);
  }, []);

  // Complete 2FA
  const complete2FA = useCallback(() => {
    if (internalFirebaseUser && pending2FA) {
      setUser(internalFirebaseUser);
      setPending2FA(false);
      fetchUserData();
    }
  }, [internalFirebaseUser, pending2FA, fetchUserData]);

  // Cancel 2FA
  const cancel2FA = useCallback(async () => {
    if (internalFirebaseUser) {
      await auth.signOut();
    }
    setUser(null);
    setInternalFirebaseUser(null);
    setProfileData(null);
    setIsAdmin(false);
    setPending2FA(false);
  }, [internalFirebaseUser]);

  const contextValue: UserContextType = useMemo(() => ({
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
    isPending2FA: pending2FA,
    complete2FA,
    cancel2FA,
  }), [
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
    pending2FA,
    complete2FA,
    cancel2FA,
  ]);

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
};