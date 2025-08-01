// src/app/api/reviews/[productId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    // Initialize Firestore
    const db = getFirestoreAdmin();

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

    // Handle Firebase configuration errors specifically
    if (
      error instanceof Error &&
      error.message.includes("Firebase credentials")
    ) {
      return NextResponse.json(
        { error: "Firebase configuration error" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
