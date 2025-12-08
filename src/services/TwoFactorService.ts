// src/lib/services/TwoFactorService.ts

import { auth } from "@/lib/firebase";
import { httpsCallable, getFunctions } from "firebase/functions";

export interface TwoFactorResult {
  success: boolean;
  method?: "totp" | "email";
  message?: string;
  otpauth?: string;
  secretBase32?: string;
  remaining?: number;
}

class TwoFactorService {
  private static instance: TwoFactorService;
  private emailFunctions = getFunctions(undefined, "europe-west2");
  private totpFunctions = getFunctions(undefined, "europe-west3");

  // Ephemeral flow state
  private currentType: "setup" | "login" | "disable" | null = null;
  private currentMethod: "totp" | "email" | null = null;
  private otpauthUri: string | null = null;

  // Track if a flow is in progress to prevent concurrent operations
  private isFlowInProgress = false;

  private constructor() {}

  public static getInstance(): TwoFactorService {
    if (!TwoFactorService.instance) {
      TwoFactorService.instance = new TwoFactorService();
    }
    return TwoFactorService.instance;
  }

  // Check if a flow is currently in progress
  public get isInProgress(): boolean {
    return this.isFlowInProgress;
  }

  // Public getters
  public get getCurrentMethod(): "totp" | "email" | null {
    return this.currentMethod;
  }

  public get getOtpauthUri(): string | null {
    return this.otpauthUri;
  }

  // Check if 2FA is enabled (client-side read)
  public async is2FAEnabled(): Promise<boolean> {
    const user = auth.currentUser;
    if (!user) return false;

    try {
      // You'll need to import firestore
      const { doc, getDoc, getFirestore } = await import("firebase/firestore");
      const db = getFirestore();

      const userDoc = await getDoc(doc(db, "users", user.uid));
      const userData = userDoc.data();
      return userData?.twoFactorEnabled === true;
    } catch (error) {
      console.error("Error checking 2FA status:", error);
      return false;
    }
  }

  // Check if TOTP is enabled
  public async isTotpEnabled(): Promise<boolean> {
    const user = auth.currentUser;
    if (!user) return false;

    try {
      const hasTotp = httpsCallable(this.totpFunctions, "hasTotp");
      const result = await hasTotp({});
      const data = result.data as { enabled: boolean };
      return data?.enabled === true;
    } catch (error) {
      console.error("Error checking TOTP status:", error);
      return false;
    }
  }

  // Email 2FA helpers
  private async startEmail2FA(type: string): Promise<TwoFactorResult> {
    try {
      const startEmail2FAFunc = httpsCallable(
        this.emailFunctions,
        "startEmail2FA"
      );
      const result = await startEmail2FAFunc({ type });
      const data = result.data as { success: boolean; message?: string };
      const success = data?.success === true;

      if (success) {
        this.currentMethod = "email";
      }

      return {
        success,
        method: "email",
        message:
          data?.message || (success ? "emailCodeSent" : "twoFactorInitError"),
      };
    } catch (error) {
      console.error("Error starting email 2FA:", error);
      return {
        success: false,
        message: "twoFactorInitError",
      };
    }
  }

  private async verifyEmail2FA(
    code: string,
    action: "setup" | "login" | "disable"
  ): Promise<TwoFactorResult> {
    try {
      const verifyEmail2FAFunc = httpsCallable(
        this.emailFunctions,
        "verifyEmail2FA"
      );
      const result = await verifyEmail2FAFunc({ code, action });
      const data = result.data as {
        success: boolean;
        message?: string;
        remaining?: number;
      };

      return {
        success: data?.success === true,
        message: data?.message || "twoFactorVerificationError",
        ...(data?.remaining !== undefined && { remaining: data.remaining }),
      };
    } catch (error) {
      console.error("Error verifying email 2FA:", error);
      return {
        success: false,
        message: "twoFactorVerificationError",
      };
    }
  }

  // SETUP FLOW
  public async start2FASetup(): Promise<TwoFactorResult> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    // Reset any previous state before starting new flow
    this.reset();
    this.currentType = "setup";
    this.isFlowInProgress = true;

    try {
      const createTotpSecret = httpsCallable(
        this.totpFunctions,
        "createTotpSecret"
      );
      const result = await createTotpSecret({});
      const data = result.data as { otpauth?: string; secretBase32?: string };

      this.otpauthUri = data?.otpauth || "";
      const secret = data?.secretBase32 || "";
      this.currentMethod = "totp";

      return {
        success: true,
        method: "totp",
        otpauth: this.otpauthUri || "",
        secretBase32: secret,
        message: "totp_setup_started",
      };
    } catch (error) {
      console.error("Error starting TOTP setup, falling back to email:", error);
      // Fallback: email 2FA (setup = enable)
      return await this.startEmail2FA("setup");
    }
  }

  public async verify2FASetup(enteredCode: string): Promise<TwoFactorResult> {
    const code = enteredCode.trim().replace(/\D/g, "");
    if (code.length !== 6) {
      return { success: false, message: "invalidCodeFormat" };
    }

    if (this.currentMethod === "totp") {
      try {
        const verifyTotp = httpsCallable(this.totpFunctions, "verifyTotp");
        await verifyTotp({ code });
        this.otpauthUri = null; // Sensitive cleanup
        this.isFlowInProgress = false; // Flow completed
        return { success: true, message: "twoFactorEnabledSuccess" };
      } catch (error) {
        console.error("Error verifying TOTP:", error);
        return { success: false, message: "invalidCode" };
      }
    }

    // Email flow for setup should use 'setup' as action
    const result = await this.verifyEmail2FA(code, "setup");
    if (result.success) {
      this.isFlowInProgress = false; // Flow completed
    }
    return result;
  }

  // LOGIN FLOW
  public async start2FALogin(): Promise<TwoFactorResult> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    // Reset any previous state before starting new flow
    this.reset();
    this.currentType = "login";
    this.isFlowInProgress = true;

    if (await this.isTotpEnabled()) {
      this.currentMethod = "totp";
      return {
        success: true,
        method: "totp",
        message: "enterAuthenticatorCode",
      };
    }

    // Email fallback
    this.currentMethod = "email";
    return { success: true, method: "email", message: "emailAvailable" };
  }

  public async verify2FALogin(enteredCode: string): Promise<TwoFactorResult> {
    const code = enteredCode.trim().replace(/\D/g, "");
    if (code.length !== 6) {
      return { success: false, message: "invalidCodeFormat" };
    }

    if (this.currentMethod === "totp") {
      try {
        const verifyTotp = httpsCallable(this.totpFunctions, "verifyTotp");
        await verifyTotp({ code });
        this.isFlowInProgress = false; // Flow completed
        return { success: true, message: "twoFactorLoginSuccess" };
      } catch (error) {
        console.error("Error verifying TOTP:", error);
        return { success: false, message: "invalidCode" };
      }
    }

    // For email verification during login, pass 'login' as action
    const result = await this.verifyEmail2FA(code, "login");
    if (result.success) {
      this.isFlowInProgress = false; // Flow completed
    }
    return result;
  }

  // DISABLE FLOW
  public async start2FADisable(): Promise<TwoFactorResult> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    // Reset any previous state before starting new flow
    this.reset();
    this.currentType = "disable";
    this.isFlowInProgress = true;

    if (await this.isTotpEnabled()) {
      this.currentMethod = "totp";
      return {
        success: true,
        method: "totp",
        message: "enterAuthenticatorCodeToDisable",
      };
    }

    // Email fallback
    return await this.startEmail2FA("disable");
  }

  public async verify2FADisable(enteredCode: string): Promise<TwoFactorResult> {
    const code = enteredCode.trim().replace(/\D/g, "");
    if (code.length !== 6) {
      return { success: false, message: "invalidCodeFormat" };
    }

    if (this.currentMethod === "totp") {
      try {
        const verifyTotp = httpsCallable(this.totpFunctions, "verifyTotp");
        await verifyTotp({ code });

        const disableTotp = httpsCallable(this.totpFunctions, "disableTotp");
        await disableTotp({});

        this.isFlowInProgress = false; // Flow completed
        return { success: true, message: "twoFactorDisabledSuccess" };
      } catch (error) {
        console.error("Error disabling TOTP:", error);
        return { success: false, message: "invalidCode" };
      }
    }

    // Email flow for disable uses 'disable' as action
    const result = await this.verifyEmail2FA(code, "disable");
    if (result.success) {
      this.isFlowInProgress = false; // Flow completed
    }
    return result;
  }

  // RESEND
  public async resendVerificationCode(): Promise<TwoFactorResult> {
    if (this.currentMethod === "totp") {
      return { success: false, message: "resendNotApplicableForTotp" };
    }

    const type = this.currentType || "login";
    return await this.resendEmail2FA(type);
  }

  private async resendEmail2FA(type?: string): Promise<TwoFactorResult> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const normalized = type || this.currentType || "login";

    try {
      const resendEmail2FAFunc = httpsCallable(
        this.emailFunctions,
        "resendEmail2FA"
      );
      const result = await resendEmail2FAFunc({ type: normalized });
      const data = result.data as { success: boolean; message?: string };
      const success = data?.success === true;

      if (success) {
        this.currentMethod = "email";
      }

      return {
        success,
        message:
          data?.message || (success ? "emailCodeSent" : "twoFactorResendError"),
      };
    } catch (error) {
      console.error("Error resending email 2FA:", error);
      // Handle throttling scenarios
      if (
        error instanceof Error &&
        error.message.includes("functions/permission-denied")
      ) {
        return { success: false, message: "pleasewait30seconds" };
      }
      return { success: false, message: "twoFactorResendError" };
    }
  }

  public reset(): void {
    this.currentType = null;
    this.currentMethod = null;
    this.otpauthUri = null;
    this.isFlowInProgress = false;
  }

  // FALLBACK
  public async useEmailFallback(type?: string): Promise<TwoFactorResult> {
    const user = auth.currentUser;
    if (!user) throw new Error("User not authenticated");

    const effectiveType = type || this.currentType || "login";

    try {
      const startEmail2FAFunc = httpsCallable(
        this.emailFunctions,
        "startEmail2FA"
      );
      const result = await startEmail2FAFunc({ type: effectiveType });
      const data = result.data as { success: boolean; message?: string };
      const success = data?.success === true;

      if (success) {
        this.currentMethod = "email"; // Switch to email method
      }

      return {
        success,
        method: "email",
        message:
          data?.message || (success ? "emailCodeSent" : "twoFactorInitError"),
      };
    } catch (error) {
      console.error("Error using email fallback:", error);
      return {
        success: false,
        message: "twoFactorInitError",
      };
    }
  }
}

export default TwoFactorService;
