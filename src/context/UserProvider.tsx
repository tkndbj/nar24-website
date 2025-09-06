// contexts/UserProvider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useRef,
} from "react";
import { User, getIdToken as getFirebaseIdToken } from "firebase/auth";
import {
  doc,
  updateDoc,
  getDocFromServer,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import TwoFactorService from "@/services/TwoFactorService";
import AuthStateManager from "@/context/authStateManager";

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
  const authManager = useRef(AuthStateManager.getInstance());
  const [user, setUser] = useState<User | null>(() => {
    // Initialize with cached data if available
    const cached = authManager.current.getCachedData();
    return cached?.user || null;
  });

  const [isLoading, setIsLoading] = useState(() => {
    // Only show loading if we don't have cached data
    const cached = authManager.current.getCachedData();
    return !cached;
  });

  const [isAdmin, setIsAdmin] = useState(() => {
    const cached = authManager.current.getCachedData();
    return cached?.isAdmin || false;
  });

  const [profileData, setProfileData] = useState<ProfileData | null>(() => {
    const cached = authManager.current.getCachedData();
    return cached?.profileData || null;
  });

  const [profileComplete, setProfileCompleteState] = useState<boolean | null>(
    null
  );
  const [pending2FA, setPending2FA] = useState(false);
  const [internalFirebaseUser, setInternalFirebaseUser] = useState<User | null>(
    null
  );

  const twoFactorService = TwoFactorService.getInstance();
  const isMountedRef = useRef(true);

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
      const isEmailPasswordUser = firebaseUser.providerData.some(
        (info) => info.providerId === "password"
      );

      if (isEmailPasswordUser && !firebaseUser.emailVerified) {
        return false;
      }

      const needs2FA = await twoFactorService.is2FAEnabled();

      if (needs2FA) {
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDoc = await getDocFromServer(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const lastVerification =
            userData?.lastTwoFactorVerification?.toDate?.();

          if (lastVerification) {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (lastVerification > fiveMinutesAgo) {
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
  };

  // Initialize auth state manager
  useEffect(() => {
    authManager.current.initialize();

    const unsubscribe = authManager.current.subscribe(async (cachedData) => {
      if (!isMountedRef.current) return;

      if (cachedData) {
        const {
          user: cachedUser,
          profileData: cachedProfile,
          isAdmin: cachedIsAdmin,
        } = cachedData;

        // Check 2FA requirement
        const needs2FA = await check2FARequirement(cachedUser as User);

        if (needs2FA) {
          setPending2FA(true);
          setInternalFirebaseUser(cachedUser);
          setUser(null);
        } else {
          setUser(cachedUser);
          setInternalFirebaseUser(cachedUser);
          setPending2FA(false);
        }

        setProfileData(cachedProfile);
        setIsAdmin(cachedIsAdmin);
        setIsLoading(false);
      } else {
        // User logged out
        setUser(null);
        setInternalFirebaseUser(null);
        setProfileData(null);
        setIsAdmin(false);
        setPending2FA(false);
        setIsLoading(false);
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, []);

  // Fetch user data
  const fetchUserData = async () => {
    const currentUser = user;
    if (!currentUser) return;

    try {
      const serverDoc = await getDocFromServer(
        doc(db, "users", currentUser.uid)
      );

      if (serverDoc.exists()) {
        const data = serverDoc.data();
        setProfileData(data);
        setIsAdmin(data.isAdmin === true);

        const complete = !!(data.gender && data.birthDate && data.languageCode);
        setProfileCompleteState(complete);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh user
  const refreshUser = async () => {
    authManager.current.invalidateCache();
    await auth.currentUser?.reload();
    // The subscription will handle the update
  };

  // Update profile data
  const updateProfileData = async (updates: Partial<ProfileData>) => {
    const currentUser = user;
    if (!currentUser) return;

    try {
      await updateDoc(doc(db, "users", currentUser.uid), updates);

      const updatedProfileData = { ...(profileData || {}), ...updates };
      setProfileData(updatedProfileData);

      // Invalidate cache so next mount gets fresh data
      authManager.current.invalidateCache();

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

  // Get ID token
  const getIdToken = async (): Promise<string | null> => {
    const currentUser = user;
    if (!currentUser) {
      console.log("No user logged in to fetch ID token.");
      return null;
    }
    return await getFirebaseIdToken(currentUser, true);
  };

  // Get profile field
  const getProfileField = <T,>(key: string): T | null => {
    return (profileData?.[key] as T) || null;
  };

  // Update user data immediately
  const updateUserDataImmediately = async (
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
  };

  // Set profile complete
  const setProfileComplete = (complete: boolean) => {
    setProfileCompleteState(complete);
  };

  // Complete 2FA
  const complete2FA = () => {
    if (internalFirebaseUser && pending2FA) {
      setUser(internalFirebaseUser);
      setPending2FA(false);
      fetchUserData();
    }
  };

  // Cancel 2FA
  const cancel2FA = async () => {
    if (internalFirebaseUser) {
      await auth.signOut();
    }
    setUser(null);
    setInternalFirebaseUser(null);
    setProfileData(null);
    setIsAdmin(false);
    setPending2FA(false);
  };

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
    isPending2FA: pending2FA,
    complete2FA,
    cancel2FA,
  };

  return (
    <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>
  );
};
