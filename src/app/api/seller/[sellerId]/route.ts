// src/app/api/seller/[sellerId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin (do this once)
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();

export async function GET(
  request: NextRequest,
  { params }: { params: { sellerId: string } }
) {
  try {
    const { sellerId } = params;
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shopId");

    if (!sellerId || sellerId.trim() === "") {
      return NextResponse.json(
        { error: "Seller ID is required" },
        { status: 400 }
      );
    }

    // Fetch seller information
    const [sellerDoc, shopDoc] = await Promise.all([
      db.collection("users").doc(sellerId).get(),
      shopId ? db.collection("shops").doc(shopId).get() : Promise.resolve(null),
    ]);

    if (!sellerDoc.exists) {
      return NextResponse.json({ error: "Seller not found" }, { status: 404 });
    }

    const sellerData = sellerDoc.data();
    if (!sellerData) {
      return NextResponse.json(
        { error: "Seller data is empty" },
        { status: 404 }
      );
    }

    // Get seller reviews to calculate average rating
    const reviewsSnapshot = await db
      .collection("users")
      .doc(sellerId)
      .collection("reviews")
      .get();

    let sellerAverageRating = 0;
    let totalReviews = 0;

    if (!reviewsSnapshot.empty) {
      let totalRating = 0;
      reviewsSnapshot.docs.forEach((doc) => {
        const reviewData = doc.data();
        if (reviewData.rating) {
          totalRating += reviewData.rating;
          totalReviews++;
        }
      });
      sellerAverageRating = totalReviews > 0 ? totalRating / totalReviews : 0;
    }

    // Get shop information if shopId is provided
    let shopAverageRating = 0;
    if (shopDoc && shopDoc.exists) {
      const shopData = shopDoc.data();
      shopAverageRating = shopData?.averageRating || 0;
    } else if (!shopId) {
      // Try to find shop by ownerId if no shopId provided
      const shopSnapshot = await db
        .collection("shops")
        .where("ownerId", "==", sellerId)
        .limit(1)
        .get();

      if (!shopSnapshot.empty) {
        const shopData = shopSnapshot.docs[0].data();
        shopAverageRating = shopData?.averageRating || 0;
      }
    }

    const result = {
      sellerName: sellerData.displayName || "Unknown Seller",
      sellerAverageRating: sellerAverageRating,
      shopAverageRating: shopAverageRating,
      sellerIsVerified: sellerData.verified === true,
      totalProductsSold: sellerData.totalProductsSold || 0,
      totalReviews: totalReviews,
      cargoAgreement: sellerData.cargoAgreement || null,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching seller info:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
