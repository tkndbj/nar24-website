// src/context/CouponProviders.tsx
// Per-page wrapper for coupon-related providers.
// Only used on pages that need coupon/discount features (cart, productpayment).

"use client";

import React, { ReactNode } from "react";
import type { Firestore } from "firebase/firestore";
import { CouponProvider } from "./CouponProvider";
import { DiscountSelectionProvider } from "./DiscountSelectionProvider";

interface CouponProvidersProps {
  children: ReactNode;
  user: { uid: string } | null;
  db: Firestore | null;
}

export const CouponProviders: React.FC<CouponProvidersProps> = ({
  children,
  user,
  db,
}) => {
  return (
    <CouponProvider user={user} db={db}>
      <DiscountSelectionProvider>
        {children}
      </DiscountSelectionProvider>
    </CouponProvider>
  );
};
