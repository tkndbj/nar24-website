// src/app/api/shops/[shopId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ shopId: string }>;
  }
) {
  try {
    const { shopId } = await context.params;

    if (!shopId) {
      return NextResponse.json(
        { error: "Shop ID is required" },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();
    
    // Get shop document from Firestore
    const shopDoc = await db.collection("shops").doc(shopId).get();

    if (!shopDoc.exists) {
      return NextResponse.json(
        { error: "Shop not found" },
        { status: 404 }
      );
    }

    const shopData = shopDoc.data()!;

    // Return shop data in expected format
    const response = {
      id: shopDoc.id,
      name: shopData.name || "",
      profileImageUrl: shopData.profileImageUrl || shopData.logoUrl || "",
      averageRating: shopData.averageRating || 0,
      description: shopData.description || "",
      ownerId: shopData.ownerId || "",
      coOwners: shopData.coOwners || [],
      editors: shopData.editors || [],
      viewers: shopData.viewers || [],
      createdAt: shopData.createdAt?.toDate?.()?.toISOString() || null,
      updatedAt: shopData.updatedAt?.toDate?.()?.toISOString() || null,
      isActive: shopData.isActive !== false,
      contactEmail: shopData.contactEmail || "",
      contactPhone: shopData.contactPhone || "",
      address: shopData.address || {},
      socialLinks: shopData.socialLinks || {},
      businessHours: shopData.businessHours || {},
      categories: shopData.categories || [],
      totalProducts: shopData.totalProducts || 0,
      totalSales: shopData.totalSales || 0,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error fetching shop:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}