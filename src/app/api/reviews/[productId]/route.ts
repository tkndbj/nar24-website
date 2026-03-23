// src/app/api/reviews/[productId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";

interface ReviewData {
  rating: number;
  review: string;
  timestamp: { toDate(): Date } | Date;
  imageUrls?: string[];
  imageUrl?: string;
  likes?: string[];
  userId: string;
  userName?: string;
  userImage?: string;
  helpful?: number;
  verified?: boolean;
  sellerResponse?: string;
  sellerResponseDate?: { toDate(): Date } | Date;
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

    // Determine collection — prefer isShop param to avoid 2 wasted reads
    const isShopParam = searchParams.get("isShop");
    let baseCollection: string;
    if (isShopParam !== null) {
      baseCollection = isShopParam === "true" ? "shop_products" : "products";
    } else {
      // Fallback: probe both collections (backwards compat)
      const shopProductDoc = await db.collection("shop_products").doc(rawId).get();
      baseCollection = shopProductDoc.exists ? "shop_products" : "products";
    }

    // Build the query
    let query: FirebaseFirestore.Query = db
      .collection(baseCollection)
      .doc(rawId)
      .collection("reviews");

    // Apply rating filter first — Firestore requires range filter field
    // to be the first orderBy when combined with other orderBy fields
    if (filterRating !== null) {
      query = query
        .where("rating", ">=", filterRating)
        .where("rating", "<", filterRating + 1);
    }

    // Apply sorting (rating must come first if filtering by rating)
    if (filterRating !== null) {
      // Range filter on rating requires rating as first orderBy
      query = query.orderBy("rating", "desc").orderBy("timestamp", "desc");
    } else if (sortBy === "rating") {
      query = query.orderBy("rating", "desc").orderBy("timestamp", "desc");
    } else if (sortBy === "helpful") {
      query = query.orderBy("helpful", "desc").orderBy("timestamp", "desc");
    } else {
      query = query.orderBy("timestamp", "desc");
    }

    // Handle pagination with lastDocId
    if (lastDocId) {
      try {
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
      }
    }

    query = query.limit(limit);

    // Execute the paginated query and count in parallel
    const reviewsRef = db
      .collection(baseCollection)
      .doc(rawId)
      .collection("reviews");

    let countQuery: FirebaseFirestore.Query = reviewsRef;
    if (filterRating !== null) {
      countQuery = countQuery
        .where("rating", ">=", filterRating)
        .where("rating", "<", filterRating + 1);
    }

    const [reviewsSnapshot, countSnapshot] = await Promise.all([
      query.get(),
      countQuery.count().get(),
    ]);

    const reviews = reviewsSnapshot.docs.map((doc) => {
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

    const totalCount = countSnapshot.data().count;

    return NextResponse.json({
      reviews,
      totalCount,
      hasMore: totalCount > (lastDocId ? reviews.length : 0) + reviews.length,
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