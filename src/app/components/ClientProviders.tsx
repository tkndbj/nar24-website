// components/ClientProviders.tsx
"use client";

import { useEffect, useState } from "react";

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return a minimal loading state during SSR
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse h-8 w-20 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return <>{children}</>;
}
