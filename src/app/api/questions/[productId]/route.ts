// src/app/api/questions/[productId]/route.ts

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
    const isShop = searchParams.get("isShop") === "true";
    const limit = parseInt(searchParams.get("limit") || "5");

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

    // Fetch questions from the product's subcollection
    const questionsSnapshot = await db
      .collection(questionCollection)
      .doc(rawId)
      .collection("product_questions")
      .where("productId", "==", rawId)
      .where("answered", "==", true)
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();

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

    // Get total count of answered questions
    const totalSnapshot = await db
      .collection(questionCollection)
      .doc(rawId)
      .collection("product_questions")
      .where("productId", "==", rawId)
      .where("answered", "==", true)
      .get();

    const totalCount = totalSnapshot.size;

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
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const db = getFirestoreAdmin();
    const body = await request.json();
    const { productId } = await params;
    
    const { 
      sellerId, 
      isShop, 
      questionText, 
      askerNameVisible 
    } = body;

    // Validate required fields
    if (!productId || !sellerId || !questionText || typeof isShop !== "boolean") {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (questionText.trim().length === 0 || questionText.length > 150) {
      return NextResponse.json(
        { error: "Invalid question text" },
        { status: 400 }
      );
    }

    // For now, using mock user data - you'll integrate with your auth system later
    const mockUserId = "current-user-id";
    const mockUserName = "Test User";

    // Normalize productId (same logic as your GET method)
    let rawId = productId.trim();
    const p1 = "products_";
    const p2 = "shop_products_";
    if (rawId.startsWith(p1)) {
      rawId = rawId.substring(p1.length);
    } else if (rawId.startsWith(p2)) {
      rawId = rawId.substring(p2.length);
    }

    // Determine collection
    const productCollection = isShop ? "shop_products" : "products";

    // Get product data
    const productDoc = await db.collection(productCollection).doc(rawId).get();
    if (!productDoc.exists) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const productData = productDoc.data()!;

    // Get seller data
    const sellerCollection = isShop ? "shops" : "users";
    const sellerDoc = await db.collection(sellerCollection).doc(sellerId).get();
    if (!sellerDoc.exists) {
      return NextResponse.json({ error: "Seller not found" }, { status: 404 });
    }
    const sellerData = sellerDoc.data()!;

    // Create question document
    const questionRef = db
      .collection(productCollection)
      .doc(rawId)
      .collection("product_questions")
      .doc();

    const questionPayload = {
      questionId: questionRef.id,
      productId: rawId,
      askerId: mockUserId,
      askerName: mockUserName,
      askerNameVisible: askerNameVisible === true,
      questionText: questionText.trim(),
      timestamp: new Date(),
      answered: false,
      productName: productData.productName || "",
      productImage: (productData.imageUrls && productData.imageUrls[0]) || "",
      productPrice: productData.price || 0,
      productRating: productData.averageRating || 0,
      sellerId,
      sellerName: isShop ? (sellerData.name || "") : (sellerData.displayName || ""),
      sellerImage: isShop ? (sellerData.profileImageUrl || "") : (sellerData.profileImage || ""),
    };

    // Save question
    await questionRef.set(questionPayload);

    return NextResponse.json({
      success: true,
      questionId: questionRef.id,
    });

  } catch (error) {
    console.error("Error submitting question:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}