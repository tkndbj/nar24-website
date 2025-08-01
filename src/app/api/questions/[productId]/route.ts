// src/app/api/questions/[productId]/route.ts

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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
