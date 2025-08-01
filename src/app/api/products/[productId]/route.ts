// src/app/api/products/[productId]/route.ts

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

    // Try both collections in parallel (like Flutter does)
    const [productDoc, shopProductDoc] = await Promise.all([
      db.collection("products").doc(rawId).get(),
      db.collection("shop_products").doc(rawId).get(),
    ]);

    let doc = null;
    if (productDoc.exists) {
      doc = productDoc;
    } else if (shopProductDoc.exists) {
      doc = shopProductDoc;
    }

    if (!doc || !doc.exists) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const data = doc.data();
    if (!data) {
      return NextResponse.json(
        { error: "Product data is empty" },
        { status: 404 }
      );
    }

    // Transform Firestore document to match your Product interface
    const product = {
      id: doc.id,
      productName: data.productName || "",
      price: data.price || 0,
      currency: data.currency || "TL",
      brandModel: data.brandModel || null,
      sellerName: data.sellerName || "",
      shopId: data.shopId || null,
      userId: data.userId || "",
      imageUrls: data.imageUrls || [],
      videoUrl: data.videoUrl || null,
      averageRating: data.averageRating || 0,
      cartCount: data.cartCount || 0,
      favoritesCount: data.favoritesCount || 0,
      purchaseCount: data.purchaseCount || 0,
      deliveryOption: data.deliveryOption || null,
      attributes: data.attributes || {},
      category: data.category || "",
      subcategory: data.subcategory || null,
      description: data.description || null,
      bestSellerRank: data.bestSellerRank || null,
    };

    return NextResponse.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);

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
