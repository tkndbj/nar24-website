// src/context/CommerceProviders.tsx
// Composite provider that combines all commerce-related providers
// Reduces visual nesting while maintaining proper dependencies

"use client";

import React, { ReactNode } from "react";
import type { User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import type { Functions } from "firebase/functions";

import { ProductCacheProvider } from "./ProductCacheProvider";
import { CartProvider } from "./CartProvider";
import { FavoritesProvider } from "./FavoritesProvider";
import { CouponProvider } from "./CouponProvider";
import { DiscountSelectionProvider } from "./DiscountSelectionProvider";

interface CommerceProvidersProps {
  children: ReactNode;
  user: User | null;
  db: Firestore | null;
  functions: Functions | null;
}

/**
 * CommerceProviders - Combines all commerce-related context providers
 *
 * This provider wraps:
 * - ProductCacheProvider - Product data caching
 * - CartProvider - Shopping cart state and actions
 * - FavoritesProvider - Favorites/wishlist state and actions
 * - CouponProvider - Coupon management
 * - DiscountSelectionProvider - Discount selection state
 *
 * Dependencies:
 * - Requires user from UserProvider
 * - Requires db and functions from FirebaseProvider (lazy loaded)
 */
export const CommerceProviders: React.FC<CommerceProvidersProps> = ({
  children,
  user,
  db,
  functions,
}) => {
  return (
    <ProductCacheProvider>
      <CartProvider user={user} db={db} functions={functions}>
        <FavoritesProvider db={db}>
          <CouponProvider user={user} db={db}>
            <DiscountSelectionProvider>
              {children}
            </DiscountSelectionProvider>
          </CouponProvider>
        </FavoritesProvider>
      </CartProvider>
    </ProductCacheProvider>
  );
};

export default CommerceProviders;
