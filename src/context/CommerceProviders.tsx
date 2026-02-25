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
 *
 * CouponProvider and DiscountSelectionProvider are NOT included here.
 * They are wrapped per-page (cart, productpayment) via CouponProviders.
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
          {children}
        </FavoritesProvider>
      </CartProvider>
    </ProductCacheProvider>
  );
};

export default CommerceProviders;
