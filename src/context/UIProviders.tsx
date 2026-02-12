// src/context/UIProviders.tsx
// Composite provider that combines all UI-related providers
// Reduces visual nesting while maintaining proper dependencies

"use client";

import React, { ReactNode } from "react";
import type { User } from "firebase/auth";

import { CelebrationProvider } from "@/app/components/CouponCelebrationOverlay";
import { BadgeProvider } from "./BadgeProvider";
import { SearchProvider } from "./SearchProvider";
import { SearchHistoryProvider } from "./SearchHistoryProvider";

interface UIProvidersProps {
  children: ReactNode;
  user?: User | null;
}

/**
 * UIProviders - Combines all UI-related context providers
 *
 * This provider wraps:
 * - CelebrationProvider - Coupon celebration overlay
 * - BadgeProvider - Notification/message badge counts (accepts user prop)
 * - SearchProvider - Search functionality
 * - SearchHistoryProvider - Search history management (accepts user prop)
 *
 * Optimization: BadgeProvider and SearchHistoryProvider accept user as prop
 * to avoid creating duplicate Firebase auth listeners, reducing listener count.
 */
export const UIProviders: React.FC<UIProvidersProps> = ({
  children,
  user,
}) => {
  return (
    <CelebrationProvider>
      <BadgeProvider user={user}>
        <SearchProvider>
          <SearchHistoryProvider user={user}>
            {children}
          </SearchHistoryProvider>
        </SearchProvider>
      </BadgeProvider>
    </CelebrationProvider>
  );
};

export default UIProviders;
