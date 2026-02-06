// src/hooks/selectors/useUserSelectors.ts
// Selector hooks for User context - prevent re-renders when only specific values needed

"use client";

import { useMemo } from "react";
import { useUser } from "@/context/UserProvider";

/**
 * Returns whether the user is authenticated.
 * Component using this hook will only re-render when auth status changes.
 */
export function useIsAuthenticated(): boolean {
  const { user } = useUser();
  return user !== null;
}

/**
 * Returns the user ID or null if not authenticated.
 * Component using this hook will only re-render when user ID changes.
 */
export function useUserId(): string | null {
  const { user } = useUser();

  return useMemo(() => {
    return user?.uid ?? null;
  }, [user]);
}

/**
 * Returns whether the current user is an admin.
 */
export function useIsAdmin(): boolean {
  const { isAdmin } = useUser();
  return isAdmin;
}

/**
 * Returns the user loading state.
 */
export function useUserLoading(): boolean {
  const { isLoading } = useUser();
  return isLoading;
}

/**
 * Returns whether the user's profile is complete.
 */
export function useIsProfileComplete(): boolean {
  const { isProfileComplete } = useUser();
  return isProfileComplete;
}

/**
 * Returns profile data.
 */
export function useProfileData() {
  const { profileData } = useUser();
  return profileData;
}

/**
 * Returns the Firebase User object or null.
 * Use sparingly - prefer more specific selectors.
 */
export function useFirebaseUser() {
  const { user } = useUser();
  return user;
}

/**
 * Returns stable user action functions.
 */
export interface UserActions {
  fetchUserData: ReturnType<typeof useUser>["fetchUserData"];
  refreshUser: ReturnType<typeof useUser>["refreshUser"];
  updateProfileData: ReturnType<typeof useUser>["updateProfileData"];
  getIdToken: ReturnType<typeof useUser>["getIdToken"];
  updateUserDataImmediately: ReturnType<typeof useUser>["updateUserDataImmediately"];
  setProfileComplete: ReturnType<typeof useUser>["setProfileComplete"];
  complete2FA: ReturnType<typeof useUser>["complete2FA"];
  cancel2FA: ReturnType<typeof useUser>["cancel2FA"];
  setNameComplete: ReturnType<typeof useUser>["setNameComplete"];
  setNameSaveInProgress: ReturnType<typeof useUser>["setNameSaveInProgress"];
  updateLocalProfileField: ReturnType<typeof useUser>["updateLocalProfileField"];
}

export function useUserActions(): UserActions {
  const {
    fetchUserData,
    refreshUser,
    updateProfileData,
    getIdToken,
    updateUserDataImmediately,
    setProfileComplete,
    complete2FA,
    cancel2FA,
    setNameComplete,
    setNameSaveInProgress,
    updateLocalProfileField,
  } = useUser();

  return useMemo(
    () => ({
      fetchUserData,
      refreshUser,
      updateProfileData,
      getIdToken,
      updateUserDataImmediately,
      setProfileComplete,
      complete2FA,
      cancel2FA,
      setNameComplete,
      setNameSaveInProgress,
      updateLocalProfileField,
    }),
    [
      fetchUserData,
      refreshUser,
      updateProfileData,
      getIdToken,
      updateUserDataImmediately,
      setProfileComplete,
      complete2FA,
      cancel2FA,
      setNameComplete,
      setNameSaveInProgress,
      updateLocalProfileField,
    ]
  );
}

/**
 * Returns Apple/Google sign-in specific states.
 */
export function useSocialAuthState() {
  const { isAppleUser, isGoogleUser, isSocialUser, needsNameCompletion, isNameStateReady } = useUser();

  return useMemo(
    () => ({
      isAppleUser,
      isGoogleUser,
      isSocialUser,
      needsNameCompletion,
      isNameStateReady,
    }),
    [isAppleUser, isGoogleUser, isSocialUser, needsNameCompletion, isNameStateReady]
  );
}

/**
 * Returns 2FA state.
 */
export function use2FAState() {
  const { isPending2FA, complete2FA, cancel2FA } = useUser();

  return useMemo(
    () => ({
      isPending2FA,
      complete2FA,
      cancel2FA,
    }),
    [isPending2FA, complete2FA, cancel2FA]
  );
}
