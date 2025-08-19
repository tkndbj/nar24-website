// src/hooks/useTwoFactor.ts

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "react-hot-toast";
import TwoFactorService from "@/services/TwoFactorService";

export interface UseTwoFactorReturn {
  // State
  isLoading: boolean;
  currentMethod: "totp" | "email" | null;
  is2FAEnabled: boolean;
  isTotpEnabled: boolean;

  // Actions
  setup2FA: () => Promise<boolean>;
  disable2FA: () => Promise<boolean>;
  verify2FA: (type: "setup" | "login" | "disable") => Promise<boolean>;
  check2FAStatus: () => Promise<void>;

  // Navigation helpers
  navigateTo2FA: (type: "setup" | "login" | "disable") => void;
}

export function useTwoFactor(): UseTwoFactorReturn {
  const router = useRouter();
  const t = useTranslations();
  const twoFactorService = TwoFactorService.getInstance();

  const [isLoading, setIsLoading] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [isTotpEnabled, setIsTotpEnabled] = useState(false);

  const currentMethod = twoFactorService.getCurrentMethod;

  // Check 2FA status on mount
  useEffect(() => {
    check2FAStatus();
  }, []);

  const check2FAStatus = async () => {
    try {
      const [enabled, totpEnabled] = await Promise.all([
        twoFactorService.is2FAEnabled(),
        twoFactorService.isTotpEnabled(),
      ]);

      setIs2FAEnabled(enabled);
      setIsTotpEnabled(totpEnabled);
    } catch (error) {
      console.error("Error checking 2FA status:", error);
    }
  };

  const setup2FA = async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const result = await twoFactorService.start2FASetup();

      if (result.success) {
        // Navigate to verification screen
        navigateTo2FA("setup");
        return true;
      } else {
        toast.error(
          t(`TwoFactor.${result.message}`) || result.message || "Setup failed"
        );
        return false;
      }
    } catch (error) {
      console.error("Error setting up 2FA:", error);
      toast.error(t("TwoFactor.initError") || "Failed to setup 2FA");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const disable2FA = async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const result = await twoFactorService.start2FADisable();

      if (result.success) {
        // Navigate to verification screen
        navigateTo2FA("disable");
        return true;
      } else {
        toast.error(
          t(`TwoFactor.${result.message}`) || result.message || "Disable failed"
        );
        return false;
      }
    } catch (error) {
      console.error("Error disabling 2FA:", error);
      toast.error(t("TwoFactor.initError") || "Failed to disable 2FA");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const verify2FA = async (
    type: "setup" | "login" | "disable"
  ): Promise<boolean> => {
    // This method can be used for programmatic verification
    // In most cases, you'll navigate to the verification screen instead
    navigateTo2FA(type);
    return new Promise((resolve) => {
      // Listen for navigation events to determine success/failure
      const checkSuccess = () => {
        const currentPath = window.location.pathname;
        if (!currentPath.includes("two-factor-verification")) {
          resolve(!currentPath.includes("login")); // Success if not back to login
        }
      };

      // Set up listeners
      const interval = setInterval(checkSuccess, 1000);

      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(interval);
        resolve(false);
      }, 5 * 60 * 1000);
    });
  };

  const navigateTo2FA = (type: "setup" | "login" | "disable") => {
    router.push(`/two-factor-verification?type=${type}`);
  };

  return {
    // State
    isLoading,
    currentMethod,
    is2FAEnabled,
    isTotpEnabled,

    // Actions
    setup2FA,
    disable2FA,
    verify2FA,
    check2FAStatus,

    // Navigation helpers
    navigateTo2FA,
  };
}

export default useTwoFactor;
