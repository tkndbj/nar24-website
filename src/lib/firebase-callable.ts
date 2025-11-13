// lib/firebase-callable.ts
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase"; // ✅ Use functions directly (already exported)

// ✅ Type-safe wrapper for batchUpdateClicks
interface BatchUpdateClicksPayload {
  batchId: string;
  productClicks: Record<string, number>;
  shopProductClicks: Record<string, number>;
  shopClicks: Record<string, number>;
  shopIds: Record<string, string>;
}

interface BatchUpdateClicksResponse {
  success: boolean;
  processed: number;
  batchId: string;
  shardId?: string;
  duration?: number;
  message?: string;
  error?: string;
}

// Export the callable function (using already initialized functions)
export const batchUpdateClicksCallable = httpsCallable<
  BatchUpdateClicksPayload,
  BatchUpdateClicksResponse
>(functions, "batchUpdateClicks");
