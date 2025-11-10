// src/app/api/relatedproducts/[productId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params;

    if (!productId || productId.trim() === "") {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // Normalize productId (remove prefixes like Flutter does)
    let rawId = productId.trim();
    if (rawId.startsWith("products_")) {
      rawId = rawId.substring("products_".length);
    } else if (rawId.startsWith("shop_products_")) {
      rawId = rawId.substring("shop_products_".length);
    }

    // ✅ Read pre-computed relatedProductIds from product document
    // Try shop_products first (most common)
    let productDoc = await db.collection("shop_products").doc(rawId).get();
    
    if (!productDoc.exists) {
      // Fallback to products collection
      productDoc = await db.collection("products").doc(rawId).get();
    }

    if (!productDoc.exists) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    const productData = productDoc.data();
    const relatedIds = productData?.relatedProductIds || [];

    // If no pre-computed IDs, return empty (Cloud Function hasn't run yet)
    if (relatedIds.length === 0) {
      return NextResponse.json({
        products: [],
        message: "Related products will be available soon"
      });
    }

    // ✅ Batch fetch related products (max 20 IDs)
    const relatedProducts = await batchFetchProducts(db, relatedIds.slice(0, 20));

    return NextResponse.json({
      products: relatedProducts,
      count: relatedProducts.length
    });

  } catch (error) {
    console.error("Error fetching related products:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch related products",
        details: process.env.NODE_ENV === 'development' ? String(error) : undefined
      },
      { status: 500 }
    );
  }
}

// ✅ Helper function: Batch fetch products efficiently
async function batchFetchProducts(
  db: FirebaseFirestore.Firestore,
  productIds: string[]
): Promise<any[]> {
  if (productIds.length === 0) return [];

  const products: any[] = [];

  // Fetch in parallel from shop_products collection
  const fetchPromises = productIds.map(async (id) => {
    try {
      const doc = await db.collection("shop_products").doc(id).get();
      
      if (doc.exists) {
        const data = doc.data();
        return {
          id: doc.id,
          productName: data?.productName || data?.title || "",
          description: data?.description || "",
          price: data?.price || 0,
          currency: data?.currency || "TL",
          brandModel: data?.brandModel || data?.brand || "",
          imageUrls: Array.isArray(data?.imageUrls) ? data.imageUrls : [],
          averageRating: data?.averageRating || 0,
          reviewCount: data?.reviewCount || 0,
          shopId: data?.shopId || null,
          category: data?.category || "",
          subcategory: data?.subcategory || "",
          promotionScore: data?.promotionScore || 0,
          // Add other fields as needed
        };
      }
      return null;
    } catch (error) {
      console.error(`Error fetching product ${id}:`, error);
      return null;
    }
  });

  const results = await Promise.all(fetchPromises);
  
  // Filter out null values
  return results.filter((product) => product !== null);
}