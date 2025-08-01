// src/app/api/reviews/[productId]/route.ts

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
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    // Await the params Promise
    const { productId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "3");

    if (!productId || productId.trim() === "") {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    // Normalize productId (remove prefixes like Flutter does)
    let rawId = productId.trim();
    const p1 = "products_";
    const p2 = "shop_products_";
    if (rawId.startsWith(p1)) {
      rawId = rawId.substring(p1.length);
    } else if (rawId.startsWith(p2)) {
      rawId = rawId.substring(p2.length);
    }

    if (rawId === "") {
      return NextResponse.json(
        { error: "Invalid product ID format" },
        { status: 400 }
      );
    }

    // Try both collections for reviews (like Flutter does)
    const [productReviews, shopProductReviews] = await Promise.all([
      db
        .collection("products")
        .doc(rawId)
        .collection("reviews")
        .orderBy("timestamp", "desc")
        .limit(limit)
        .get(),
      db
        .collection("shop_products")
        .doc(rawId)
        .collection("reviews")
        .orderBy("timestamp", "desc")
        .limit(limit)
        .get(),
    ]);

    // Use whichever collection has reviews
    const reviewsSnapshot = !productReviews.empty
      ? productReviews
      : shopProductReviews;

    const reviews = reviewsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        rating: data.rating || 0,
        review: data.review || "",
        timestamp:
          data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
        imageUrls: data.imageUrls || (data.imageUrl ? [data.imageUrl] : []),
        likes: data.likes || [],
        userId: data.userId || "",
      };
    });

    // Get total count for pagination
    const [totalProductReviews, totalShopProductReviews] = await Promise.all([
      db.collection("products").doc(rawId).collection("reviews").get(),
      db.collection("shop_products").doc(rawId).collection("reviews").get(),
    ]);

    const totalCount = !totalProductReviews.empty
      ? totalProductReviews.size
      : totalShopProductReviews.size;

    return NextResponse.json({
      reviews,
      totalCount,
      hasMore: reviews.length === limit && totalCount > limit,
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
