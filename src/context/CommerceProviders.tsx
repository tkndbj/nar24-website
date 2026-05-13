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
import { MarketCartProvider } from "./MarketCartProvider";
import { CouponProvider } from "./CouponProvider";
import { CategoryCacheProvider } from "./CategoryCacheProvider";

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
 * - CartProvider - Shopping cart state and actions (regular products)
 * - FavoritesProvider - Favorites/wishlist state and actions
 * - MarketCartProvider - Market (grocery) cart state and actions
 * - CouponProvider - User's coupons & benefits stream (mounted globally so
 *   the celebration overlay in UIProviders can read them on launch)
 *
 * DiscountSelectionProvider is NOT included here — it is page-scoped
 * (cart, productpayment) via CouponProviders.
 *
 * FoodCartProvider is also NOT included here — it is intentionally
 * scoped to restaurant routes only (mounted inside food pages).
 *
 * Dependencies:
 * - Requires user from UserProvider (MarketCartProvider reads it via useUser internally)
 * - Requires db and functions from FirebaseProvider (lazy loaded)
 */
export const CommerceProviders: React.FC<CommerceProvidersProps> = ({
  children,
  user,
  db,
  functions,
}) => {
  return (
    <CategoryCacheProvider db={db}>
      <ProductCacheProvider>
        <CartProvider user={user} db={db} functions={functions}>
          <FavoritesProvider db={db}>
            <CouponProvider user={user} db={db}>
              <MarketCartProvider>{children}</MarketCartProvider>
            </CouponProvider>
          </FavoritesProvider>
        </CartProvider>
      </ProductCacheProvider>
    </CategoryCacheProvider>
  );
};

export default CommerceProviders;