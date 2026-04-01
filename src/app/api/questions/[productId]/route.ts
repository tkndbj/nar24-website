// src/app/api/questions/[productId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    // Rate limit: 60 requests/min per IP
    const { applyRateLimit } = await import("@/lib/auth-middleware");
    const limited = await applyRateLimit(request, 60, 60000);
    if (limited) return limited;

    // Initialize Firestore
    const db = getFirestoreAdmin();

    // Await the params Promise
    const { productId } = await params;
    const { searchParams } = new URL(request.url);
    const isShop = searchParams.get("isShop") === "true";
    const limit = Math.min(parseInt(searchParams.get("limit") || "5", 10), 30);

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

    // Determine collection based on isShop flag
    const questionCollection = isShop ? "shop_products" : "products";

    // Fetch questions and count in parallel
    const questionsRef = db
      .collection(questionCollection)
      .doc(rawId)
      .collection("product_questions")
      .where("productId", "==", rawId)
      .where("answered", "==", true);

    const [questionsSnapshot, countSnapshot] = await Promise.all([
      questionsRef.orderBy("timestamp", "desc").limit(limit).get(),
      questionsRef.count().get(),
    ]);

    const questions = questionsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        questionText: data.questionText || "",
        answerText: data.answerText || "",
        timestamp:
          data.timestamp?.toDate?.()?.toISOString() || new Date().toISOString(),
        askerName: data.askerName || "Anonymous",
        askerNameVisible: data.askerNameVisible === true,
        answered: data.answered === true,
        productId: data.productId || rawId,
      };
    });

    const totalCount = countSnapshot.data().count;

    return NextResponse.json({
      questions,
      totalCount,
      hasMore: questions.length === limit && totalCount > limit,
    });
  } catch (error) {
    console.error("Error fetching questions:", error);

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