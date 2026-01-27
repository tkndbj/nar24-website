// context/DiscountSelectionProvider.tsx - Matching Flutter's DiscountSelectionService

"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { Coupon, UserBenefit } from "@/app/models/coupon";
import { useCoupon } from "./CouponProvider";
import { FREE_SHIPPING_MINIMUM, COUPON_MINIMUM_MULTIPLIER } from "./CouponProvider";


// ============================================================================
// STORAGE KEYS (matching Flutter SharedPreferences keys)
// ============================================================================

const STORAGE_KEYS = {
  COUPON_ID: "selected_coupon_id",
  FREE_SHIPPING: "use_free_shipping",
  BENEFIT_ID: "selected_benefit_id",
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface DiscountSelectionContextType {
  // State
  selectedCoupon: Coupon | null;
  selectedBenefit: UserBenefit | null;
  useFreeShipping: boolean;
  isLoading: boolean;
  hasAnyDiscount: boolean;

  // Methods
  selectCoupon: (coupon: Coupon | null) => Promise<void>;
  setFreeShipping: (use: boolean, benefit?: UserBenefit | null) => Promise<void>;
  clearAllSelections: () => Promise<void>;
  revalidateSelections: () => Promise<void>;
  clearCouponIfSelected: (couponId: string) => Promise<void>;
  clearBenefitIfSelected: (benefitId: string) => Promise<void>;

  isCouponApplicableForCart: (cartTotal: number) => boolean;
isFreeShippingApplicableForCart: (cartTotal: number) => boolean;

  // Calculation helpers
  calculateCouponDiscount: (cartTotal: number) => number;
  calculateFinalTotal: (cartSubtotal: number) => number;
}

const DiscountSelectionContext = createContext<DiscountSelectionContextType | undefined>(undefined);

export const useDiscountSelection = (): DiscountSelectionContextType => {
  const context = useContext(DiscountSelectionContext);
  if (context === undefined) {
    throw new Error("useDiscountSelection must be used within a DiscountSelectionProvider");
  }
  return context;
};

// ============================================================================
// PROVIDER
// ============================================================================

interface DiscountSelectionProviderProps {
  children: ReactNode;
}

export const DiscountSelectionProvider: React.FC<DiscountSelectionProviderProps> = ({
  children,
}) => {
  // ========================================================================
  // ACCESS COUPON SERVICE
  // ========================================================================

  const {
    coupons,
    benefits,
    isInitialized: couponServiceInitialized,
  } = useCoupon();

  // ========================================================================
  // STATE
  // ========================================================================

  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [selectedBenefit, setSelectedBenefit] = useState<UserBenefit | null>(null);
  const [useFreeShipping, setUseFreeShippingState] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // ========================================================================
  // REFS
  // ========================================================================

  const initializationAttempted = useRef(false);

  // ========================================================================
  // COMPUTED
  // ========================================================================

  const hasAnyDiscount = useMemo(() => {
    return selectedCoupon !== null || useFreeShipping;
  }, [selectedCoupon, useFreeShipping]);

  const isCouponApplicableForCart = useCallback(
    (cartTotal: number): boolean => {
      if (!selectedCoupon) return true; // No coupon selected
      const minimumRequired = selectedCoupon.amount * COUPON_MINIMUM_MULTIPLIER;
      return cartTotal >= minimumRequired;
    },
    [selectedCoupon]
  );
  
  const isFreeShippingApplicableForCart = useCallback(
    (cartTotal: number): boolean => {
      return cartTotal >= FREE_SHIPPING_MINIMUM;
    },
    []
  );

  // ========================================================================
  // HELPER FUNCTIONS
  // ========================================================================

  const findCouponById = useCallback(
    (couponId: string): Coupon | null => {
      return coupons.find((c) => c.id === couponId) ?? null;
    },
    [coupons]
  );

  const findBenefitById = useCallback(
    (benefitId: string): UserBenefit | null => {
      return benefits.find((b) => b.id === benefitId) ?? null;
    },
    [benefits]
  );

  // ========================================================================
  // PERSISTENCE HELPERS
  // ========================================================================

  const saveToStorage = useCallback((key: string, value: string | boolean | null) => {
    if (typeof window === "undefined") return;

    try {
      if (value === null) {
        localStorage.removeItem(key);
      } else if (typeof value === "boolean") {
        localStorage.setItem(key, JSON.stringify(value));
      } else {
        localStorage.setItem(key, value);
      }
    } catch (error) {
      console.error("❌ Error saving to localStorage:", error);
    }
  }, []);

  const loadFromStorage = useCallback((key: string): string | null => {
    if (typeof window === "undefined") return null;

    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error("❌ Error loading from localStorage:", error);
      return null;
    }
  }, []);

  const loadBoolFromStorage = useCallback((key: string): boolean => {
    if (typeof window === "undefined") return false;

    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error("❌ Error loading bool from localStorage:", error);
      return false;
    }
  }, []);

  // ========================================================================
  // INITIALIZATION
  // ========================================================================

  const initialize = useCallback(async () => {
    if (isInitialized || initializationAttempted.current) return;
    initializationAttempted.current = true;

    setIsLoading(true);

    try {
      // Wait for coupon service to have data
      let attempts = 0;
      while (attempts < 10) {
        if (coupons.length > 0 || benefits.length > 0 || couponServiceInitialized) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
        attempts++;
      }

      // Load persisted coupon ID
      const savedCouponId = loadFromStorage(STORAGE_KEYS.COUPON_ID);
      const savedBenefitId = loadFromStorage(STORAGE_KEYS.BENEFIT_ID);
      const savedFreeShipping = loadBoolFromStorage(STORAGE_KEYS.FREE_SHIPPING);

      // Validate and restore coupon selection
      if (savedCouponId) {
        const coupon = findCouponById(savedCouponId);
        if (coupon && coupon.isValid) {
          setSelectedCoupon(coupon);
          console.log(`✅ Restored coupon selection: ${coupon.code || coupon.id}`);
        } else {
          // Coupon no longer valid, clear from storage
          saveToStorage(STORAGE_KEYS.COUPON_ID, null);
          console.log("🗑️ Cleared invalid persisted coupon");
        }
      }

      // Validate and restore free shipping selection
      if (savedFreeShipping && savedBenefitId) {
        const benefit = findBenefitById(savedBenefitId);
        if (benefit && benefit.isValid) {
          setSelectedBenefit(benefit);
          setUseFreeShippingState(true);
          console.log("✅ Restored free shipping selection");
        } else {
          // Benefit no longer valid, clear from storage
          saveToStorage(STORAGE_KEYS.FREE_SHIPPING, null);
          saveToStorage(STORAGE_KEYS.BENEFIT_ID, null);
          console.log("🗑️ Cleared invalid persisted free shipping");
        }
      }

      setIsInitialized(true);
    } catch (error) {
      console.error("❌ Error initializing discount selection:", error);
    } finally {
      setIsLoading(false);
    }
  }, [
    isInitialized,
    coupons,
    benefits,
    couponServiceInitialized,
    loadFromStorage,
    loadBoolFromStorage,
    findCouponById,
    findBenefitById,
    saveToStorage,
  ]);

  // ========================================================================
  // SELECTION METHODS
  // ========================================================================

  const selectCoupon = useCallback(
    async (coupon: Coupon | null): Promise<void> => {
      setSelectedCoupon(coupon);

      if (coupon) {
        saveToStorage(STORAGE_KEYS.COUPON_ID, coupon.id);
        console.log(`💾 Persisted coupon selection: ${coupon.code || coupon.id}`);
      } else {
        saveToStorage(STORAGE_KEYS.COUPON_ID, null);
        console.log("🗑️ Cleared coupon selection");
      }
    },
    [saveToStorage]
  );

  const setFreeShipping = useCallback(
    async (use: boolean, benefit?: UserBenefit | null): Promise<void> => {
      setUseFreeShippingState(use);
      setSelectedBenefit(use ? (benefit ?? null) : null);

      saveToStorage(STORAGE_KEYS.FREE_SHIPPING, use);

      if (use && benefit) {
        saveToStorage(STORAGE_KEYS.BENEFIT_ID, benefit.id);
        console.log("💾 Persisted free shipping selection");
      } else {
        saveToStorage(STORAGE_KEYS.BENEFIT_ID, null);
        if (!use) {
          console.log("🗑️ Cleared free shipping selection");
        }
      }
    },
    [saveToStorage]
  );

  const clearAllSelections = useCallback(async (): Promise<void> => {
    setSelectedCoupon(null);
    setSelectedBenefit(null);
    setUseFreeShippingState(false);

    saveToStorage(STORAGE_KEYS.COUPON_ID, null);
    saveToStorage(STORAGE_KEYS.FREE_SHIPPING, null);
    saveToStorage(STORAGE_KEYS.BENEFIT_ID, null);

    console.log("🗑️ Cleared all discount selections");
  }, [saveToStorage]);

  // ========================================================================
  // REVALIDATION
  // ========================================================================

  const revalidateSelections = useCallback(async (): Promise<void> => {
    let changed = false;

    // Revalidate coupon
    if (selectedCoupon) {
      const freshCoupon = findCouponById(selectedCoupon.id);
      if (!freshCoupon || !freshCoupon.isValid) {
        await selectCoupon(null);
        changed = true;
        console.log("⚠️ Coupon no longer valid, cleared selection");
      }
    }

    // Revalidate free shipping
    if (useFreeShipping && selectedBenefit) {
      const freshBenefit = findBenefitById(selectedBenefit.id);
      if (!freshBenefit || !freshBenefit.isValid) {
        await setFreeShipping(false);
        changed = true;
        console.log("⚠️ Free shipping benefit no longer valid, cleared selection");
      }
    }

    if (changed) {
      console.log("🔄 Discount selections revalidated");
    }
  }, [
    selectedCoupon,
    selectedBenefit,
    useFreeShipping,
    findCouponById,
    findBenefitById,
    selectCoupon,
    setFreeShipping,
  ]);

  const clearCouponIfSelected = useCallback(
    async (couponId: string): Promise<void> => {
      if (selectedCoupon?.id === couponId) {
        await selectCoupon(null);
      }
    },
    [selectedCoupon, selectCoupon]
  );

  const clearBenefitIfSelected = useCallback(
    async (benefitId: string): Promise<void> => {
      if (selectedBenefit?.id === benefitId) {
        await setFreeShipping(false);
      }
    },
    [selectedBenefit, setFreeShipping]
  );

  // ========================================================================
  // CALCULATION HELPERS
  // ========================================================================

  const calculateCouponDiscount = useCallback(
    (cartTotal: number): number => {
      if (!selectedCoupon || !selectedCoupon.isValid) return 0;
      
      // Check minimum requirement (2x coupon amount)
      const minimumRequired = selectedCoupon.amount * COUPON_MINIMUM_MULTIPLIER;
      if (cartTotal < minimumRequired) return 0;
      
      // Cap discount at cart total
      return selectedCoupon.amount > cartTotal ? cartTotal : selectedCoupon.amount;
    },
    [selectedCoupon]
  );

  const calculateFinalTotal = useCallback(
    (cartSubtotal: number): number => {
      const discount = calculateCouponDiscount(cartSubtotal);
      return Math.max(0, cartSubtotal - discount);
    },
    [calculateCouponDiscount]
  );

  // ========================================================================
  // EFFECTS
  // ========================================================================

  // Initialize when coupon service is ready
  useEffect(() => {
    if (couponServiceInitialized && !isInitialized && !initializationAttempted.current) {
      initialize();
    }
  }, [couponServiceInitialized, isInitialized, initialize]);

  // Revalidate when coupons or benefits change
  useEffect(() => {
    if (isInitialized) {
      revalidateSelections();
    }
  }, [coupons, benefits, isInitialized, revalidateSelections]);

  // ========================================================================
  // CONTEXT VALUE
  // ========================================================================

  const contextValue = useMemo<DiscountSelectionContextType>(
    () => ({
      // State
      selectedCoupon,
      selectedBenefit,
      useFreeShipping,
      isLoading,
      hasAnyDiscount,
      isCouponApplicableForCart,
    isFreeShippingApplicableForCart,

      // Methods
      selectCoupon,
      setFreeShipping,
      clearAllSelections,
      revalidateSelections,
      clearCouponIfSelected,
      clearBenefitIfSelected,

      // Calculation helpers
      calculateCouponDiscount,
      calculateFinalTotal,
    }),
    [
      selectedCoupon,
      selectedBenefit,
      useFreeShipping,
      isLoading,
      hasAnyDiscount,
      isCouponApplicableForCart,
      isFreeShippingApplicableForCart,
      selectCoupon,
      setFreeShipping,
      clearAllSelections,
      revalidateSelections,
      clearCouponIfSelected,
      clearBenefitIfSelected,
      calculateCouponDiscount,
      calculateFinalTotal,
    ]
  );

  return (
    <DiscountSelectionContext.Provider value={contextValue}>
      {children}
    </DiscountSelectionContext.Provider>
  );
};