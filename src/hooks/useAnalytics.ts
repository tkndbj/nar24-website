// hooks/useAnalytics.ts
"use client";

import { useEffect } from "react";
import { analyticsBatcher } from "@/app/utils/analyticsBatcher";
import { impressionBatcher } from "@/app/utils/impressionBatcher";
import { useUser } from "@/context/UserProvider";

export function useAnalytics() {
  const { user } = useUser();

  useEffect(() => {
    if (user?.uid) {
      analyticsBatcher.setCurrentUserId(user.uid);
      impressionBatcher.setUserId(user.uid);
    } else {
      analyticsBatcher.setCurrentUserId(null);
      impressionBatcher.setUserId(null);
    }
  }, [user?.uid]);

  return {
    recordClick: analyticsBatcher.recordClick.bind(analyticsBatcher),
    recordShopClick: analyticsBatcher.recordShopClick.bind(analyticsBatcher),
  };
}