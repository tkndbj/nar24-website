// src/context/CouponProviders.tsx
// Per-page wrapper for the discount-selection state used on cart and
// productpayment pages.
//
// CouponProvider is mounted globally in CommerceProviders, so the per-page
// wrapper now only needs DiscountSelectionProvider.

"use client";

import React, { ReactNode } from "react";
import { DiscountSelectionProvider } from "./DiscountSelectionProvider";

interface CouponProvidersProps {
  children: ReactNode;
  // Kept for call-site compatibility with cart / productpayment pages,
  // even though no longer used here (CouponProvider lives in CommerceProviders).
  user?: { uid: string } | null;
  db?: unknown;
}

export const CouponProviders: React.FC<CouponProvidersProps> = ({
  children,
}) => {
  return <DiscountSelectionProvider>{children}</DiscountSelectionProvider>;
};
