// src/app/api/reviews/[productId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  sanitizeText,
  sanitizeReviewInput,
} from "@/lib/sanitize";

interface ReviewData {
  rating: number;
  review: string;
  timestamp: Timestamp | Date;
  imageUrls?: string[];
  imageUrl?: string;
  likes?: string[];
  userId: string;
  userName?: string;
  userImage?: string;
  helpful?: number;
  verified?: boolean;
  sellerResponse?: string;
  sellerResponseDate?: Timestamp | Date;
  productId?: string;
}

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
    
    // Parse query parameters
    const limit = parseInt(searchParams.get("limit") || "20");
    const sortBy = searchParams.get("sortBy") || "recent"; // recent, helpful, rating
    const filterRating = searchParams.get("rating") ? parseInt(searchParams.get("rating")!) : null;
    const lastDocId = searchParams.get("lastDocId");

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

    // Determine which collection has the product
    const [, shopProductDoc] = await Promise.all([
      db.collection("products").doc(rawId).get(),
      db.collection("shop_products").doc(rawId).get(),
    ]);

    const isShopProduct = shopProductDoc.exists;
    const baseCollection = isShopProduct ? "shop_products" : "products";

    // Build the query
    let query: FirebaseFirestore.Query = db
      .collection(baseCollection)
      .doc(rawId)
      .collection("reviews");

    // Apply sorting first (needed for proper Firestore query structure)
    if (sortBy === "rating") {
      query = query.orderBy("rating", "desc").orderBy("timestamp", "desc");
    } else if (sortBy === "helpful") {
      query = query.orderBy("helpful", "desc").orderBy("timestamp", "desc");
    } else {
      // Default to recent (timestamp desc)
      query = query.orderBy("timestamp", "desc");
    }

    // Handle pagination with lastDocId
    if (lastDocId) {
      try {
        // Fetch the last document to use as cursor
        const lastDocSnapshot = await db
          .collection(baseCollection)
          .doc(rawId)
          .collection("reviews")
          .doc(lastDocId)
          .get();

        if (lastDocSnapshot.exists) {
          query = query.startAfter(lastDocSnapshot);
        }
      } catch (error) {
        console.warn("Failed to fetch last document for pagination:", error);
        // Continue without pagination if there's an error
      }
    }

    // When filtering by rating, fetch more to account for filtered out items
    // This ensures we have enough results after filtering
    const fetchLimit = filterRating !== null ? limit * 5 : limit;
    query = query.limit(fetchLimit);

    // Execute the query
    const reviewsSnapshot = await query.get();

    // Map and filter the reviews
    let reviews = reviewsSnapshot.docs.map((doc) => {
      const data = doc.data() as ReviewData;

      // Handle timestamp conversion
      let timestampStr = new Date().toISOString();
      if (data.timestamp) {
        if (typeof data.timestamp === 'object' && 'toDate' in data.timestamp) {
          timestampStr = data.timestamp.toDate().toISOString();
        } else if (data.timestamp instanceof Date) {
          timestampStr = data.timestamp.toISOString();
        }
      }

      let sellerResponseDateStr: string | null = null;
      if (data.sellerResponseDate) {
        if (typeof data.sellerResponseDate === 'object' && 'toDate' in data.sellerResponseDate) {
          sellerResponseDateStr = data.sellerResponseDate.toDate().toISOString();
        } else if (data.sellerResponseDate instanceof Date) {
          sellerResponseDateStr = data.sellerResponseDate.toISOString();
        }
      }

      // Combine imageUrl and imageUrls arrays
      let imageUrls: string[] = [];
      if (data.imageUrls && Array.isArray(data.imageUrls)) {
        imageUrls = data.imageUrls;
      } else if (data.imageUrl && typeof data.imageUrl === 'string') {
        imageUrls = [data.imageUrl];
      }

      return {
        id: doc.id,
        productId: data.productId || rawId,
        userId: data.userId || "",
        userName: data.userName || null,
        userImage: data.userImage || null,
        rating: data.rating || 0,
        review: data.review || "",
        imageUrls,
        timestamp: timestampStr,
        likes: data.likes || [],
        helpful: data.helpful || 0,
        verified: data.verified || false,
        sellerResponse: data.sellerResponse || null,
        sellerResponseDate: sellerResponseDateStr,
      };
    });

    // Apply rating filter server-side (handles both integer and decimal ratings)
    // A "4 star" filter shows reviews with rating >= 4 and < 5
    if (filterRating !== null) {
      reviews = reviews.filter(review => {
        const rating = review.rating;
        return rating >= filterRating && rating < filterRating + 1;
      });
    }

    // Apply limit after filtering
    const paginatedReviews = reviews.slice(0, limit);

    // Get total count for the current filter
    const allReviewsSnapshot = await db
      .collection(baseCollection)
      .doc(rawId)
      .collection("reviews")
      .get();

    let totalCount = allReviewsSnapshot.size;

    // If filtering, count only matching reviews
    if (filterRating !== null) {
      totalCount = allReviewsSnapshot.docs.filter(doc => {
        const rating = doc.data().rating || 0;
        return rating >= filterRating && rating < filterRating + 1;
      }).length;
    }

    return NextResponse.json({
      reviews: paginatedReviews,
      totalCount,
      hasMore: reviews.length > limit,
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
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// Optional: POST endpoint for creating reviews
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const db = getFirestoreAdmin();
    const { productId } = await params;
    const body = await request.json();

    // Sanitize and validate all input using the sanitization library
    let sanitizedInput;
    try {
      sanitizedInput = sanitizeReviewInput({
        userId: body.userId,
        userName: body.userName,
        userImage: body.userImage,
        rating: body.rating,
        review: body.review,
        imageUrls: body.imageUrls,
        verified: body.verified,
      });
    } catch (validationError) {
      return NextResponse.json(
        { error: validationError instanceof Error ? validationError.message : "Invalid input" },
        { status: 400 }
      );
    }

    // Validate productId
    if (!productId) {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    // Normalize productId (sanitize first)
    let rawId = sanitizeText(productId.trim());
    const p1 = "products_";
    const p2 = "shop_products_";
    if (rawId.startsWith(p1)) {
      rawId = rawId.substring(p1.length);
    } else if (rawId.startsWith(p2)) {
      rawId = rawId.substring(p2.length);
    }

    if (!rawId) {
      return NextResponse.json(
        { error: "Invalid product ID" },
        { status: 400 }
      );
    }

    // Determine which collection to use
    const [productDoc, shopProductDoc] = await Promise.all([
      db.collection("products").doc(rawId).get(),
      db.collection("shop_products").doc(rawId).get(),
    ]);

    const isShopProduct = shopProductDoc.exists;
    const baseCollection = isShopProduct ? "shop_products" : "products";

    if (!productDoc.exists && !shopProductDoc.exists) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Create review document with sanitized data
    const reviewRef = db
      .collection(baseCollection)
      .doc(rawId)
      .collection("reviews")
      .doc();

    const reviewData = {
      productId: rawId,
      userId: sanitizedInput.userId,
      userName: sanitizedInput.userName,
      userImage: sanitizedInput.userImage,
      rating: sanitizedInput.rating,
      review: sanitizedInput.review,
      imageUrls: sanitizedInput.imageUrls,
      timestamp: new Date(),
      likes: [],
      helpful: 0,
      verified: sanitizedInput.verified,
    };

    await reviewRef.set(reviewData);

    // Update product's average rating and review count
    const reviewsSnapshot = await db
      .collection(baseCollection)
      .doc(rawId)
      .collection("reviews")
      .get();

    let totalRating = 0;
    let reviewCount = 0;

    reviewsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.rating) {
        totalRating += data.rating;
        reviewCount++;
      }
    });

    const averageRating = reviewCount > 0 ? totalRating / reviewCount : 0;

    // Update product document with new average rating and total reviews
    await db.collection(baseCollection).doc(rawId).update({
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews: reviewCount,
    });

    return NextResponse.json({
      success: true,
      reviewId: reviewRef.id,
      averageRating,
      totalReviews: reviewCount,
    });

  } catch (error) {
    console.error("Error creating review:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }}