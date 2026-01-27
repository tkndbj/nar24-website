// context/CouponProvider.tsx - Matching Flutter's CouponService

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
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  getDocs,
  Firestore,
  QuerySnapshot,
  Unsubscribe,
} from "firebase/firestore";
import {
  Coupon,
  UserBenefit,
  BenefitType,
  CheckoutDiscounts,
  createCheckoutDiscounts,
} from "@/app/models/coupon";

// ============================================================================
// TYPES
// ============================================================================

interface CouponUser {
  uid: string;
}

interface CouponContextType {
  // State
  coupons: Coupon[];
  benefits: UserBenefit[];
  isLoading: boolean;
  isInitialized: boolean;

  // Computed
  activeCoupons: Coupon[];
  activeFreeShippingBenefits: UserBenefit[];
  hasFreeShipping: boolean;
  availableFreeShipping: UserBenefit | null;
  totalCouponValue: number;

  // Coupon operations
  fetchAllCoupons: () => Promise<Coupon[]>;
  calculateCouponDiscount: (coupon: Coupon, cartTotal: number) => number;
  findBestCoupon: (cartTotal: number) => Coupon | null;
  markCouponAsUsed: (couponId: string, orderId: string) => Promise<boolean>;

  // Benefit operations
  fetchAllBenefits: () => Promise<UserBenefit[]>;
  markBenefitAsUsed: (benefitId: string, orderId: string) => Promise<boolean>;

  // Checkout helpers
  calculateCheckoutDiscounts: (params: {
    subtotal: number;
    shippingCost: number;
    selectedCoupon?: Coupon | null;
    useFreeShipping?: boolean;
  }) => CheckoutDiscounts;
  markDiscountsAsUsed: (params: {
    orderId: string;
    usedCoupon?: Coupon | null;
    usedFreeShipping?: UserBenefit | null;
  }) => Promise<void>;

  // Refresh
  refresh: () => Promise<void>;
}

const CouponContext = createContext<CouponContextType | undefined>(undefined);

export const useCoupon = (): CouponContextType => {
  const context = useContext(CouponContext);
  if (context === undefined) {
    throw new Error("useCoupon must be used within a CouponProvider");
  }
  return context;
};

// ============================================================================
// PROVIDER
// ============================================================================

interface CouponProviderProps {
  children: ReactNode;
  user: CouponUser | null;
  db: Firestore | null;
}

export const CouponProvider: React.FC<CouponProviderProps> = ({
  children,
  user,
  db,
}) => {
  // ========================================================================
  // STATE
  // ========================================================================

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [benefits, setBenefits] = useState<UserBenefit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // ========================================================================
  // REFS
  // ========================================================================

  const unsubscribeCouponsRef = useRef<Unsubscribe | null>(null);
  const unsubscribeBenefitsRef = useRef<Unsubscribe | null>(null);

  // ========================================================================
  // COMPUTED VALUES
  // ========================================================================

  const activeCoupons = useMemo(() => {
    return coupons
      .filter((c) => c.isValid)
      .sort((a, b) => b.amount - a.amount); // Sort by amount descending
  }, [coupons]);

  const activeFreeShippingBenefits = useMemo(() => {
    return benefits.filter(
      (b) => b.isValid && b.type === BenefitType.FreeShipping
    );
  }, [benefits]);

  const hasFreeShipping = useMemo(() => {
    return activeFreeShippingBenefits.length > 0;
  }, [activeFreeShippingBenefits]);

  const availableFreeShipping = useMemo(() => {
    return activeFreeShippingBenefits.length > 0
      ? activeFreeShippingBenefits[0]
      : null;
  }, [activeFreeShippingBenefits]);

  const totalCouponValue = useMemo(() => {
    return activeCoupons.reduce((sum, coupon) => sum + coupon.amount, 0);
  }, [activeCoupons]);

  // ========================================================================
  // LISTENER HELPERS
  // ========================================================================

  const stopListening = useCallback(() => {
    if (unsubscribeCouponsRef.current) {
      unsubscribeCouponsRef.current();
      unsubscribeCouponsRef.current = null;
    }
    if (unsubscribeBenefitsRef.current) {
      unsubscribeBenefitsRef.current();
      unsubscribeBenefitsRef.current = null;
    }
  }, []);

  const clearData = useCallback(() => {
    setCoupons([]);
    setBenefits([]);
    setIsLoading(false);
  }, []);

  // ========================================================================
  // LISTENERS
  // ========================================================================

  const handleCouponsUpdate = useCallback((snapshot: QuerySnapshot) => {
    const newCoupons = snapshot.docs
      .map((doc) => Coupon.fromFirestore(doc.id, doc.data()))
      .filter((c) => c.isValid); // Filter out expired ones

    setCoupons(newCoupons);
    setIsLoading(false);

    console.log(`📦 Coupons updated: ${newCoupons.length} active`);
  }, []);

  const handleBenefitsUpdate = useCallback((snapshot: QuerySnapshot) => {
    const newBenefits = snapshot.docs
      .map((doc) => UserBenefit.fromFirestore(doc.id, doc.data()))
      .filter((b) => b.isValid); // Filter out expired ones

    setBenefits(newBenefits);
    setIsLoading(false);

    console.log(`🎁 Benefits updated: ${newBenefits.length} active`);
  }, []);

  const startListening = useCallback(
    (userId: string) => {
      if (!db) return;

      // Stop any existing listeners
      stopListening();
      setIsLoading(true);

      // Listen to coupons
      const couponsQuery = query(
        collection(db, "users", userId, "coupons"),
        where("isUsed", "==", false),
        orderBy("createdAt", "desc")
      );

      unsubscribeCouponsRef.current = onSnapshot(
        couponsQuery,
        handleCouponsUpdate,
        (error) => console.error("❌ Coupons listener error:", error)
      );

      // Listen to benefits
      const benefitsQuery = query(
        collection(db, "users", userId, "benefits"),
        where("isUsed", "==", false),
        orderBy("createdAt", "desc")
      );

      unsubscribeBenefitsRef.current = onSnapshot(
        benefitsQuery,
        handleBenefitsUpdate,
        (error) => console.error("❌ Benefits listener error:", error)
      );

      setIsInitialized(true);
      console.log(`🔴 Started listening to coupons & benefits for ${userId}`);
    },
    [db, handleCouponsUpdate, handleBenefitsUpdate, stopListening]
  );

  // ========================================================================
  // COUPON OPERATIONS
  // ========================================================================

  const fetchAllCoupons = useCallback(async (): Promise<Coupon[]> => {
    if (!user || !db) return [];

    try {
      const snapshot = await getDocs(
        query(
          collection(db, "users", user.uid, "coupons"),
          orderBy("createdAt", "desc")
        )
      );

      return snapshot.docs.map((doc) =>
        Coupon.fromFirestore(doc.id, doc.data())
      );
    } catch (error) {
      console.error("❌ Error fetching all coupons:", error);
      return [];
    }
  }, [user, db]);

  const calculateCouponDiscount = useCallback(
    (coupon: Coupon, cartTotal: number): number => {
      if (!coupon.isValid) return 0;
      // Coupon cannot exceed cart total
      return coupon.amount > cartTotal ? cartTotal : coupon.amount;
    },
    []
  );

  const findBestCoupon = useCallback(
    (cartTotal: number): Coupon | null => {
      if (activeCoupons.length === 0) return null;

      // Find coupons that don't exceed cart total, sorted by amount desc
      const usableCoupons = activeCoupons.filter((c) => c.amount <= cartTotal);

      if (usableCoupons.length > 0) {
        return usableCoupons[0]; // Already sorted by amount desc
      }

      // If all coupons exceed cart total, return the smallest one
      // (user still gets full cart covered)
      return activeCoupons[activeCoupons.length - 1];
    },
    [activeCoupons]
  );

  // Renamed from useCoupon to markCouponAsUsed to avoid hook naming conflict
  const markCouponAsUsed = useCallback(
    async (couponId: string, orderId: string): Promise<boolean> => {
      if (!user || !db) return false;

      try {
        await updateDoc(doc(db, "users", user.uid, "coupons", couponId), {
          isUsed: true,
          usedAt: serverTimestamp(),
          orderId: orderId,
        });

        console.log(`✅ Coupon ${couponId} marked as used for order ${orderId}`);
        return true;
      } catch (error) {
        console.error("❌ Error marking coupon as used:", error);
        return false;
      }
    },
    [user, db]
  );

  // ========================================================================
  // BENEFIT OPERATIONS
  // ========================================================================

  const fetchAllBenefits = useCallback(async (): Promise<UserBenefit[]> => {
    if (!user || !db) return [];

    try {
      const snapshot = await getDocs(
        query(
          collection(db, "users", user.uid, "benefits"),
          orderBy("createdAt", "desc")
        )
      );

      return snapshot.docs.map((doc) =>
        UserBenefit.fromFirestore(doc.id, doc.data())
      );
    } catch (error) {
      console.error("❌ Error fetching all benefits:", error);
      return [];
    }
  }, [user, db]);

  // Renamed from useBenefit to markBenefitAsUsed to avoid hook naming conflict
  const markBenefitAsUsed = useCallback(
    async (benefitId: string, orderId: string): Promise<boolean> => {
      if (!user || !db) return false;

      try {
        await updateDoc(doc(db, "users", user.uid, "benefits", benefitId), {
          isUsed: true,
          usedAt: serverTimestamp(),
          orderId: orderId,
        });

        console.log(
          `✅ Benefit ${benefitId} marked as used for order ${orderId}`
        );
        return true;
      } catch (error) {
        console.error("❌ Error marking benefit as used:", error);
        return false;
      }
    },
    [user, db]
  );

  // ========================================================================
  // CHECKOUT HELPERS
  // ========================================================================

  const calculateCheckoutDiscounts = useCallback(
    (params: {
      subtotal: number;
      shippingCost: number;
      selectedCoupon?: Coupon | null;
      useFreeShipping?: boolean;
    }): CheckoutDiscounts => {
      let couponDiscount = 0;
      let shippingDiscount = 0;
      let usedFreeShipping: UserBenefit | null = null;

      // Apply coupon discount
      if (params.selectedCoupon && params.selectedCoupon.isValid) {
        couponDiscount = calculateCouponDiscount(
          params.selectedCoupon,
          params.subtotal
        );
      }

      // Apply free shipping
      if (params.useFreeShipping && hasFreeShipping) {
        shippingDiscount = params.shippingCost;
        usedFreeShipping = availableFreeShipping;
      }

      return createCheckoutDiscounts({
        originalSubtotal: params.subtotal,
        originalShipping: params.shippingCost,
        couponDiscount,
        shippingDiscount,
        appliedCoupon: params.selectedCoupon ?? null,
        appliedFreeShipping: usedFreeShipping,
      });
    },
    [calculateCouponDiscount, hasFreeShipping, availableFreeShipping]
  );

  const markDiscountsAsUsed = useCallback(
    async (params: {
      orderId: string;
      usedCoupon?: Coupon | null;
      usedFreeShipping?: UserBenefit | null;
    }): Promise<void> => {
      const promises: Promise<boolean>[] = [];

      if (params.usedCoupon) {
        promises.push(markCouponAsUsed(params.usedCoupon.id, params.orderId));
      }

      if (params.usedFreeShipping) {
        promises.push(
          markBenefitAsUsed(params.usedFreeShipping.id, params.orderId)
        );
      }

      await Promise.all(promises);
    },
    [markCouponAsUsed, markBenefitAsUsed]
  );

  // ========================================================================
  // REFRESH
  // ========================================================================

  const refresh = useCallback(async (): Promise<void> => {
    if (!user || !db) return;

    setIsLoading(true);

    try {
      // Fetch coupons
      const couponsSnapshot = await getDocs(
        query(
          collection(db, "users", user.uid, "coupons"),
          where("isUsed", "==", false),
          orderBy("createdAt", "desc")
        )
      );

      const newCoupons = couponsSnapshot.docs
        .map((doc) => Coupon.fromFirestore(doc.id, doc.data()))
        .filter((c) => c.isValid);

      setCoupons(newCoupons);

      // Fetch benefits
      const benefitsSnapshot = await getDocs(
        query(
          collection(db, "users", user.uid, "benefits"),
          where("isUsed", "==", false),
          orderBy("createdAt", "desc")
        )
      );

      const newBenefits = benefitsSnapshot.docs
        .map((doc) => UserBenefit.fromFirestore(doc.id, doc.data()))
        .filter((b) => b.isValid);

      setBenefits(newBenefits);

      console.log(
        `✅ Refreshed: ${newCoupons.length} coupons, ${newBenefits.length} benefits`
      );
    } catch (error) {
      console.error("❌ Refresh error:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, db]);

  // ========================================================================
  // EFFECTS
  // ========================================================================

  // Handle user changes
  useEffect(() => {
    if (!user) {
      stopListening();
      clearData();
      setIsInitialized(false);
      return;
    }

    startListening(user.uid);
  }, [user, startListening, stopListening, clearData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  // ========================================================================
  // CONTEXT VALUE
  // ========================================================================

  const contextValue = useMemo<CouponContextType>(
    () => ({
      // State
      coupons,
      benefits,
      isLoading,
      isInitialized,

      // Computed
      activeCoupons,
      activeFreeShippingBenefits,
      hasFreeShipping,
      availableFreeShipping,
      totalCouponValue,

      // Coupon operations
      fetchAllCoupons,
      calculateCouponDiscount,
      findBestCoupon,
      markCouponAsUsed,

      // Benefit operations
      fetchAllBenefits,
      markBenefitAsUsed,

      // Checkout helpers
      calculateCheckoutDiscounts,
      markDiscountsAsUsed,

      // Refresh
      refresh,
    }),
    [
      coupons,
      benefits,
      isLoading,
      isInitialized,
      activeCoupons,
      activeFreeShippingBenefits,
      hasFreeShipping,
      availableFreeShipping,
      totalCouponValue,
      fetchAllCoupons,
      calculateCouponDiscount,
      findBestCoupon,
      markCouponAsUsed,
      fetchAllBenefits,
      markBenefitAsUsed,
      calculateCheckoutDiscounts,
      markDiscountsAsUsed,
      refresh,
    ]
  );

  return (
    <CouponContext.Provider value={contextValue}>
      {children}
    </CouponContext.Provider>
  );
};