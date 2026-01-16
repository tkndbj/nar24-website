// contexts/UserProvider.tsx
// UPDATED: Added Apple Sign-In support with name completion flow
// Matches Flutter's user_provider.dart implementation

"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { User } from "firebase/auth";
import type { Timestamp } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase-lazy";
import TwoFactorService from "@/services/TwoFactorService";
import { cacheManager } from "@/app/utils/cacheManager";
import { requestDeduplicator } from "@/app/utils/requestDeduplicator";
import { debouncer } from "@/app/utils/debouncer";
import { impressionBatcher } from "@/app/utils/impressionBatcher";
import { clearPreferenceProductsCache } from "@/app/components/market_screen/PreferenceProduct";
import { analyticsBatcher } from "@/app/utils/analyticsBatcher";

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
  // ✅ NEW: Apple Sign-In specific state and methods
  isAppleUser: boolean;
  isGoogleUser: boolean;
  isSocialUser: boolean;
  needsNameCompletion: boolean;
  isNameStateReady: boolean;
  setNameComplete: (complete: boolean) => void;
  setNameSaveInProgress: (inProgress: boolean) => void;
  updateLocalProfileField: (key: string, value: unknown) => void;
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

// ✅ NEW: LocalStorage keys for caching (matching Flutter's SharedPreferences)
const NAME_COMPLETE_KEY = "user_name_complete";
const PROFILE_COMPLETE_KEY = "user_profile_complete";

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileComplete, setProfileCompleteState] = useState<boolean | null>(
    null
  );
  const [pending2FA, setPending2FA] = useState(false);
  const [internalFirebaseUser, setInternalFirebaseUser] = useState<User | null>(
    null
  );

  // ✅ NEW: Apple Sign-In specific state (matching Flutter's UserProvider)
  const [nameComplete, setNameCompleteState] = useState<boolean | null>(null);
  const [nameSaveInProgress, setNameSaveInProgressState] = useState(false);

  // Store Firebase instances after lazy load
  const authRef = useRef<import("firebase/auth").Auth | null>(null);
  const dbRef = useRef<import("firebase/firestore").Firestore | null>(null);
  const firestoreModuleRef = useRef<typeof import("firebase/firestore") | null>(
    null
  );

  // ✅ NEW: Debounce timer for background fetches (matching Flutter)
  const backgroundFetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const twoFactorService = useMemo(() => TwoFactorService.getInstance(), []);

  // ✅ NEW: Computed property - is user signed in with Apple
  const isAppleUser = useMemo(() => {
    const currentUser = user || internalFirebaseUser;
    return (
      currentUser?.providerData?.some((p) => p.providerId === "apple.com") ??
      false
    );
  }, [user, internalFirebaseUser]);

  // ✅ NEW: Computed property - is user signed in with Google
  const isGoogleUser = useMemo(() => {
    const currentUser = user || internalFirebaseUser;
    return (
      currentUser?.providerData?.some((p) => p.providerId === "google.com") ??
      false
    );
  }, [user, internalFirebaseUser]);

  // ✅ NEW: Computed property - is user signed in with any social provider
  const isSocialUser = useMemo(() => {
    return isAppleUser || isGoogleUser;
  }, [isAppleUser, isGoogleUser]);

  // ✅ NEW: Computed property - is name state ready (matching Flutter's isNameStateReady)
  const isNameStateReady = useMemo(() => {
    // Not ready during save operations
    if (nameSaveInProgress) return false;
    return !isAppleUser || nameComplete !== null || profileData !== null;
  }, [nameSaveInProgress, isAppleUser, nameComplete, profileData]);

  // ✅ NEW: Computed property - does Apple user need to complete their name
  const needsNameCompletion = useMemo(() => {
    if (!isAppleUser) return false;

    // During save, always return false to prevent redirect loops
    if (nameSaveInProgress) return false;

    // If we have cached state, use it
    if (nameComplete !== null) return !nameComplete;

    // If no profile data yet, can't determine
    if (!profileData) return false;

    const displayName = profileData.displayName;
    const email =
      profileData.email || user?.email || internalFirebaseUser?.email || "";
    const emailPrefix = email.split("@")[0];

    // Check if name is missing or invalid (matching Flutter logic)
    return (
      !displayName ||
      displayName === "" ||
      displayName === "User" ||
      displayName === "No Name" ||
      displayName === emailPrefix
    );
  }, [
    isAppleUser,
    nameSaveInProgress,
    nameComplete,
    profileData,
    user,
    internalFirebaseUser,
  ]);

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

  // ✅ NEW: Initialize cached state from localStorage (matching Flutter's SharedPreferences)
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const cachedNameComplete = localStorage.getItem(NAME_COMPLETE_KEY);
      if (cachedNameComplete !== null && nameComplete === null) {
        setNameCompleteState(cachedNameComplete === "true");
      }

      const cachedProfileComplete = localStorage.getItem(PROFILE_COMPLETE_KEY);
      if (cachedProfileComplete !== null && profileComplete === null) {
        setProfileCompleteState(cachedProfileComplete === "true");
      }
    } catch (e) {
      console.error("Error loading cached state:", e);
    }
  }, []);

  // ✅ NEW: Cache name complete state to localStorage
  const cacheNameComplete = useCallback((value: boolean) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(NAME_COMPLETE_KEY, String(value));
    } catch (e) {
      console.error("Error caching name state:", e);
    }
  }, []);

  // ✅ NEW: Cache profile complete state to localStorage
  const cacheProfileComplete = useCallback((value: boolean) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(PROFILE_COMPLETE_KEY, String(value));
    } catch (e) {
      console.error("Error caching profile state:", e);
    }
  }, []);

  // ✅ NEW: Clear cached state on logout
  const clearCachedState = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(NAME_COMPLETE_KEY);
      localStorage.removeItem(PROFILE_COMPLETE_KEY);
    } catch (e) {
      console.error("Error clearing cached state:", e);
    }
  }, []);

  // ✅ NEW: Set name complete state (exposed to components)
  const setNameComplete = useCallback(
    (complete: boolean) => {
      if (nameComplete !== complete) {
        setNameCompleteState(complete);
        cacheNameComplete(complete);
      }
    },
    [nameComplete, cacheNameComplete]
  );

  // ✅ NEW: Set name save in progress (exposed to components)
  const setNameSaveInProgress = useCallback(
    (inProgress: boolean) => {
      if (nameSaveInProgress !== inProgress) {
        setNameSaveInProgressState(inProgress);
        // This triggers re-render which causes router redirect to re-evaluate
      }
    },
    [nameSaveInProgress]
  );

  // ✅ NEW: Update local profile field immediately (for optimistic UI updates)
  const updateLocalProfileField = useCallback((key: string, value: unknown) => {
    setProfileData(
      (prev) =>
        ({
          ...(prev || {}),
          [key]: value,
        } as ProfileData)
    );
  }, []);

  // ✅ MODIFIED: Update user data from Firestore document (with race condition prevention)
  const updateUserDataFromDoc = useCallback(
    (data: Record<string, unknown>, currentUser: User | null) => {
      // Skip updates during name save to prevent race conditions (matching Flutter)
      if (nameSaveInProgress) {
        console.log("⏸️ Skipping data update - name save in progress");
        return;
      }

      setIsAdmin(data.isAdmin === true);
      setProfileData(data as ProfileData);

      // Update profile complete state
      const isComplete = !!(data.gender && data.birthDate && data.languageCode);
      if (profileComplete !== isComplete) {
        setProfileCompleteState(isComplete);
        cacheProfileComplete(isComplete);
      }

      // ✅ NEW: Update name complete state for Apple users
      const userToCheck = currentUser || user || internalFirebaseUser;
      const isApple =
        userToCheck?.providerData?.some((p) => p.providerId === "apple.com") ??
        false;

      if (isApple) {
        const displayName = data.displayName as string | undefined;
        const email = (data.email as string) || userToCheck?.email || "";
        const emailPrefix = email.split("@")[0];

        const hasValidName =
          displayName !== undefined &&
          displayName !== null &&
          displayName !== "" &&
          displayName !== "User" &&
          displayName !== "No Name" &&
          displayName !== emailPrefix;

        // Only update if not currently saving and value differs
        if (!nameSaveInProgress && nameComplete !== hasValidName) {
          // Only update to false if we're certain (server data says invalid)
          // Don't override true -> false during race conditions
          if (hasValidName || nameComplete === null) {
            setNameCompleteState(hasValidName);
            cacheNameComplete(hasValidName);
          }
        }
      }
    },
    [
      nameSaveInProgress,
      profileComplete,
      nameComplete,
      user,
      internalFirebaseUser,
      cacheProfileComplete,
      cacheNameComplete,
    ]
  );

  // Check if user needs 2FA verification
  const check2FARequirement = useCallback(
    async (firebaseUser: User): Promise<boolean> => {
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

        if (needs2FA && dbRef.current && firestoreModuleRef.current) {
          const { doc, getDoc } = firestoreModuleRef.current;
          const userDocRef = doc(dbRef.current, "users", firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const userData = userDoc.data();
            const lastVerification =
              userData?.lastTwoFactorVerification?.toDate?.();

            if (lastVerification) {
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
    },
    [twoFactorService]
  );

  // Fetch user data
  const fetchUserData = useCallback(async () => {
    const currentUser = user || internalFirebaseUser;
    if (!currentUser || !dbRef.current || !firestoreModuleRef.current) return;

    // ✅ NEW: Skip fetch during name save (matching Flutter)
    if (nameSaveInProgress) {
      console.log("⏸️ Skipping fetch - name save in progress");
      return;
    }

    try {
      const { doc, getDoc } = firestoreModuleRef.current;
      const userDoc = await getDoc(
        doc(dbRef.current, "users", currentUser.uid)
      );

      if (userDoc.exists()) {
        const data = userDoc.data();
        updateUserDataFromDoc(data, currentUser);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  }, [user, internalFirebaseUser, nameSaveInProgress, updateUserDataFromDoc]);

  // ✅ NEW: Background fetch with debounce (matching Flutter's _backgroundFetchUserData)
  const backgroundFetchUserData = useCallback(async () => {
    // Skip during name save
    if (nameSaveInProgress) {
      console.log("⏸️ Skipping background fetch - name save in progress");
      return;
    }

    const currentUser = user || internalFirebaseUser;
    if (!currentUser || !dbRef.current || !firestoreModuleRef.current) return;

    // Cancel any pending fetch
    if (backgroundFetchTimeoutRef.current) {
      clearTimeout(backgroundFetchTimeoutRef.current);
    }

    // Debounce - wait 500ms before fetching (matching Flutter's _backgroundFetchDelay)
    backgroundFetchTimeoutRef.current = setTimeout(async () => {
      // Double-check save isn't in progress after delay
      if (nameSaveInProgress) return;

      try {
        const { doc, getDoc } = firestoreModuleRef.current!;
        const userDoc = await getDoc(
          doc(dbRef.current!, "users", currentUser.uid)
        );

        // Check again after async operation
        if (nameSaveInProgress) {
          console.log("⏸️ Aborting background fetch - name save started");
          return;
        }

        if (userDoc.exists()) {
          const data = userDoc.data();
          updateUserDataFromDoc(data, currentUser);
        }
      } catch (error) {
        console.error("Background fetch error:", error);
      }
    }, 500);
  }, [user, internalFirebaseUser, nameSaveInProgress, updateUserDataFromDoc]);

  // Initialize auth state listener with lazy Firebase loading
  useEffect(() => {
    if (typeof window === "undefined") return;

    let currentAuthOperationId = 0;
    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    const initializeAuth = async () => {
      try {
        // Lazy load Firebase Auth and Firestore in parallel
        const [auth, db, firestoreModule] = await Promise.all([
          getFirebaseAuth(),
          getFirebaseDb(),
          import("firebase/firestore"),
        ]);

        if (!isMounted) return;

        // Store references
        authRef.current = auth;
        dbRef.current = db;
        firestoreModuleRef.current = firestoreModule;

        // Set up auth state listener
        unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
          const operationId = ++currentAuthOperationId;

          if (firebaseUser) {
            setInternalFirebaseUser(firebaseUser);
            analyticsBatcher.setCurrentUserId(firebaseUser.uid);

            try {
              const needs2FA = await check2FARequirement(firebaseUser);

              if (!isMounted || operationId !== currentAuthOperationId) return;

              if (needs2FA) {
                setPending2FA(true);
                setUser(null);
              } else {
                setUser(firebaseUser);
                setPending2FA(false);
              }

              // Fetch profile data (respects nameSaveInProgress)
              const { doc, getDoc } = firestoreModule;

              // ✅ NEW: Skip fetch if name save in progress
              if (!nameSaveInProgress) {
                const userDoc = await getDoc(
                  doc(db, "users", firebaseUser.uid)
                );

                if (!isMounted || operationId !== currentAuthOperationId)
                  return;

                if (userDoc.exists()) {
                  const data = userDoc.data();
                  updateUserDataFromDoc(data, firebaseUser);
                }
              }
            } catch (error) {
              if (isMounted && operationId === currentAuthOperationId) {
                console.error("Error during auth state initialization:", error);
              }
            }
          } else {
            setUser(null);
            setInternalFirebaseUser(null);
            setProfileData(null);
            setIsAdmin(false);
            setPending2FA(false);

            // ✅ NEW: Reset Apple-specific state on logout
            setNameCompleteState(null);
            setNameSaveInProgressState(false);
            clearCachedState();

            analyticsBatcher.setCurrentUserId(null);

            cacheManager.clearAll();
            clearPreferenceProductsCache();
            requestDeduplicator.cancelAll();
            debouncer.cancelAll();
          }

          if (isMounted && operationId === currentAuthOperationId) {
            setIsLoading(false);
          }
        });
      } catch (error) {
        console.error("Failed to initialize Firebase Auth:", error);
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
      // ✅ NEW: Cancel pending background fetch on cleanup
      if (backgroundFetchTimeoutRef.current) {
        clearTimeout(backgroundFetchTimeoutRef.current);
      }
    };
  }, [
    check2FARequirement,
    nameSaveInProgress,
    updateUserDataFromDoc,
    clearCachedState,
  ]);

  // ✅ MODIFIED: Profile completion redirect (now also handles name completion)
  useEffect(() => {
    // Only run on client side
    if (typeof window === "undefined") return;

    // Skip if still loading
    if (isLoading) return;

    // Skip if no user
    if (!user) return;

    // Skip if name save in progress (prevents redirect loops)
    if (nameSaveInProgress) return;

    // Get current path
    const currentPath = window.location.pathname;

    // Define public/exempt paths
    const publicPaths = ["/login", "/registration", "/email-verification", "/"];
    const publicPrefixes = [
      "/agreements",
      "/complete-name",
      "/complete-profile",
    ];

    const isPublicPath = publicPaths.some(
      (path) => currentPath === path || currentPath.endsWith(path)
    );
    const hasPublicPrefix = publicPrefixes.some((prefix) =>
      currentPath.includes(prefix)
    );

    if (isPublicPath || hasPublicPrefix) return;

    // ✅ NEW: Check if Apple user needs name completion FIRST
    if (needsNameCompletion && isNameStateReady) {
      console.log("🔀 Redirecting to /complete-name - Apple user needs name");
      window.location.href = "/complete-name";
      return;
    }

    // Then check profile completion
    if (!isProfileComplete) {
      console.log("Profile incomplete, redirecting to complete-profile");
      window.location.href = "/complete-profile";
      return;
    }
  }, [
    user,
    isLoading,
    isProfileComplete,
    needsNameCompletion,
    isNameStateReady,
    nameSaveInProgress,
  ]);

  useEffect(() => {
    if (user) {
      impressionBatcher.setUserId(user.uid);
    } else if (internalFirebaseUser && pending2FA) {
      impressionBatcher.setUserId(internalFirebaseUser.uid);
    } else {
      impressionBatcher.setUserId(null);
    }
  }, [user, internalFirebaseUser, pending2FA]);

  // Refresh user
  const refreshUser = useCallback(async () => {
    if (!authRef.current) return;

    await authRef.current.currentUser?.reload();
    if (authRef.current.currentUser) {
      setUser(authRef.current.currentUser);
      await fetchUserData();
    }
  }, [fetchUserData]);

  // Update profile data
  const updateProfileData = useCallback(
    async (updates: Partial<ProfileData>) => {
      const currentUser = user || internalFirebaseUser;
      if (!currentUser || !dbRef.current || !firestoreModuleRef.current) return;

      try {
        const { doc, updateDoc } = firestoreModuleRef.current;

        await debouncer.debounce(
          "update-profile",
          async () => {
            await updateDoc(
              doc(dbRef.current!, "users", currentUser.uid),
              updates
            );
          },
          300
        )();

        const updatedProfileData = { ...(profileData || {}), ...updates };
        setProfileData(updatedProfileData as ProfileData);
        setIsAdmin(updatedProfileData.isAdmin === true);

        const complete = !!(
          updatedProfileData.gender &&
          updatedProfileData.birthDate &&
          updatedProfileData.languageCode
        );
        setProfileCompleteState(complete);
        cacheProfileComplete(complete);
      } catch (error) {
        console.error("Error updating profile data:", error);
        throw error;
      }
    },
    [user, internalFirebaseUser, profileData, cacheProfileComplete]
  );

  // Get ID token
  const getIdToken = useCallback(async (): Promise<string | null> => {
    const currentUser = user || internalFirebaseUser;
    if (!currentUser) {
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
  const getProfileField = useCallback(
    <T,>(key: string): T | null => {
      return (profileData?.[key] as T) || null;
    },
    [profileData]
  );

  // Update user data immediately
  const updateUserDataImmediately = useCallback(
    async (currentUser: User, options?: { profileComplete?: boolean }) => {
      setInternalFirebaseUser(currentUser);

      if (options?.profileComplete !== undefined) {
        setProfileCompleteState(options.profileComplete);
        cacheProfileComplete(options.profileComplete);
      }

      const needs2FA = await check2FARequirement(currentUser);

      if (needs2FA) {
        setPending2FA(true);
        setUser(null);
      } else {
        setUser(currentUser);
        setPending2FA(false);
      }

      // ✅ NEW: Trigger background fetch for profile data
      backgroundFetchUserData();
    },
    [check2FARequirement, cacheProfileComplete, backgroundFetchUserData]
  );

  // Set profile complete
  const setProfileComplete = useCallback(
    (complete: boolean) => {
      setProfileCompleteState(complete);
      cacheProfileComplete(complete);
    },
    [cacheProfileComplete]
  );

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
    if (internalFirebaseUser && authRef.current) {
      await authRef.current.signOut();
    }
    setUser(null);
    setInternalFirebaseUser(null);
    setProfileData(null);
    setIsAdmin(false);
    setPending2FA(false);

    // ✅ NEW: Reset Apple-specific state
    setNameCompleteState(null);
    setNameSaveInProgressState(false);
    clearCachedState();
  }, [internalFirebaseUser, clearCachedState]);

  const contextValue: UserContextType = useMemo(
    () => ({
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
      // ✅ NEW: Apple Sign-In specific exports
      isAppleUser,
      isGoogleUser,
      isSocialUser,
      needsNameCompletion,
      isNameStateReady,
      setNameComplete,
      setNameSaveInProgress,
      updateLocalProfileField,
    }),
    [
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
      // ✅ NEW: Apple Sign-In specific dependencies
      isAppleUser,
      isGoogleUser,
      isSocialUser,
      needsNameCompletion,
      isNameStateReady,
      setNameComplete,
      setNameSaveInProgress,
      updateLocalProfileField,
    ]
  );

  return (
    <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>
  );
};
