// src/app/api/products/[productId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  console.log("API Route called - Environment:", process.env.NODE_ENV);
  
  try {
    // Await the params Promise
    const { productId } = await params;
    console.log("Product ID received:", productId);

    if (!productId || productId.trim() === "") {
      console.log("Invalid product ID");
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    // Initialize Firestore with detailed error logging
    console.log("Initializing Firestore Admin...");
    const db = getFirestoreAdmin();
    console.log("Firestore Admin initialized successfully");

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
      console.log("Invalid product ID format after normalization");
      return NextResponse.json(
        { error: "Invalid product ID format" },
        { status: 400 }
      );
    }

    console.log("Normalized product ID:", rawId);
    console.log("Querying Firestore collections...");

    // Try both collections in parallel (like Flutter does)
    const [productDoc, shopProductDoc] = await Promise.all([
      db.collection("products").doc(rawId).get(),
      db.collection("shop_products").doc(rawId).get(),
    ]);

    console.log("Products collection result:", productDoc.exists);
    console.log("Shop products collection result:", shopProductDoc.exists);

    let doc = null;
    let collection = "";
    if (productDoc.exists) {
      doc = productDoc;
      collection = "products";
    } else if (shopProductDoc.exists) {
      doc = shopProductDoc;
      collection = "shop_products";
    }

    if (!doc || !doc.exists) {
      console.log("Product not found in either collection");
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    console.log("Product found in collection:", collection);

    const data = doc.data();
    if (!data) {
      console.log("Product data is empty");
      return NextResponse.json(
        { error: "Product data is empty" },
        { status: 404 }
      );
    }

    console.log("Product data keys:", Object.keys(data));

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

    console.log("Returning product successfully");
    return NextResponse.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    console.error("Error type:", typeof error);
    console.error("Error name:", error instanceof Error ? error.name : 'Unknown');
    console.error("Error message:", error instanceof Error ? error.message : String(error));

    // Handle Firebase configuration errors specifically
    if (error instanceof Error) {
      if (error.message.includes("Firebase credentials") || 
          error.message.includes("Private key") ||
          error.message.includes("service account")) {
        console.error("Firebase configuration error detected");
        return NextResponse.json(
          { 
            error: "Firebase configuration error",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { 
        error: "Internal server error",
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}