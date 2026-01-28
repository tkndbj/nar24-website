// src/app/api/bundles/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    const shopId = request.nextUrl.searchParams.get("shopId");
    const isActive = request.nextUrl.searchParams.get("isActive");

    if (!shopId || shopId.trim() === "") {
      return NextResponse.json([]);
    }

    const db = getFirestoreAdmin();

    // Build query matching Flutter's logic
    let query = db.collection("bundles").where("shopId", "==", shopId);

    if (isActive === "true") {
      query = query.where("isActive", "==", true);
    }

    const snapshot = await query.get();

    const bundles = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        shopId: data.shopId || "",
        products: (data.products || []).map((p: Record<string, unknown>) => ({
          productId: p.productId || "",
          productName: p.productName || "",
          originalPrice: typeof p.originalPrice === "number" ? p.originalPrice : 0,
          imageUrl: p.imageUrl || null,
        })),
        totalBundlePrice: typeof data.totalBundlePrice === "number" ? data.totalBundlePrice : 0,
        totalOriginalPrice: typeof data.totalOriginalPrice === "number" ? data.totalOriginalPrice : 0,
        discountPercentage: typeof data.discountPercentage === "number" ? data.discountPercentage : 0,
        currency: data.currency || "TL",
        isActive: data.isActive === true,
        purchaseCount: typeof data.purchaseCount === "number" ? data.purchaseCount : 0,
        createdAt: data.createdAt?._seconds ? data.createdAt._seconds * 1000 : Date.now(),
        updatedAt: data.updatedAt?._seconds ? data.updatedAt._seconds * 1000 : null,
      };
    });

    return NextResponse.json(bundles);
  } catch (error) {
    console.error("Error fetching bundles:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}