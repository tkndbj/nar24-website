"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

interface SalesConfigState {
  salesPaused: boolean;
  pauseReason: string;
}

export function useSalesConfig(): SalesConfigState {
  const [salesPaused, setSalesPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, "settings", "salesConfig"),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          setSalesPaused(data.salesPaused || false);
          setPauseReason(data.pauseReason || "");
        } else {
          setSalesPaused(false);
          setPauseReason("");
        }
      },
      () => {
        setSalesPaused(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { salesPaused, pauseReason };
}
