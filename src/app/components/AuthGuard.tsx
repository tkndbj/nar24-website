// Create this component to wrap any sensitive pages/components
// components/AuthGuard.tsx

"use client";

import { useEffect } from "react";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export default function AuthGuard({
  children,
  requireAuth = false,
}: AuthGuardProps) {
  const { user, isPending2FA, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    // If authentication is required but user is not authenticated
    if (requireAuth && !isLoading) {
      if (isPending2FA) {
        // User is authenticated but needs 2FA - redirect to 2FA page
        router.push("/two-factor-verification?type=login");
        return;
      }

      if (!user) {
        // User is not authenticated at all - redirect to login
        router.push("/login");
        return;
      }
    }
  }, [user, isPending2FA, isLoading, requireAuth, router]);

  // Don't render children if:
  // - Still loading
  // - Auth required but no user and not pending 2FA
  // - 2FA is pending (they should be on 2FA page)
  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (requireAuth) {
    if (isPending2FA) {
      return <div>Redirecting to 2FA verification...</div>;
    }

    if (!user) {
      return <div>Redirecting to login...</div>;
    }
  }

  return <>{children}</>;
}
