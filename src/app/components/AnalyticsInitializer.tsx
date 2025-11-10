// components/AnalyticsInitializer.tsx
"use client";

import { ReactNode } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';

/**
 * AnalyticsInitializer - Handles analytics initialization
 * Must be inside UserProvider to access user context
 */
export function AnalyticsInitializer({ children }: { children: ReactNode }) {
  // This hook uses useUser() internally, so it must be inside UserProvider
  useAnalytics();

  return <>{children}</>;
}