// src/app/api/collections/by-product/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const db = getFirestoreAdmin();
    const body = await request.json();
    const { productId, shopId } = body;

    if (!productId || !shopId) {
      return NextResponse.json(
        { error: "Product ID and Shop ID are required" },
        { status: 400 }
      );
    }

    // Find collection that contains this product (matching Flutter logic)
    const collectionsSnapshot = await db
      .collection("shops")
      .doc(shopId)
      .collection("collections")
      .where("productIds", "array-contains", productId)
      .limit(1)
      .get();

    if (collectionsSnapshot.empty) {
      return NextResponse.json(
        { error: "No collection found for this product" },
        { status: 404 }
      );
    }

    const collectionDoc = collectionsSnapshot.docs[0];
    const collectionData = collectionDoc.data();
    const productIds = collectionData.productIds || [];

    // Remove current product from the list
    const filteredProductIds = productIds.filter(
      (id: string) => id !== productId
    );

    if (filteredProductIds.length === 0) {
      return NextResponse.json(
        { error: "No other products in this collection" },
        { status: 404 }
      );
    }

    // Fetch products from the collection (max 10, like Flutter)
    const products = [];
    const limitedProductIds = filteredProductIds.slice(0, 10);

    // Fetch products in batches to avoid Firestore limit
    const batchSize = 10;
    for (let i = 0; i < limitedProductIds.length; i += batchSize) {
      const batch = limitedProductIds.slice(i, i + batchSize);

      try {
        const productsSnapshot = await db
          .collection("shop_products")
          .where("__name__", "in", batch)
          .get();

        for (const doc of productsSnapshot.docs) {
          try {
            const data = doc.data();
            const product = {
              id: doc.id,
              productName: data.productName || "",
              price: data.price || 0,
              currency: data.currency || "TL",
              imageUrls: data.imageUrls || [],
            };
            products.push(product);
          } catch (e) {
            console.error(`Error parsing product ${doc.id}:`, e);
          }
        }
      } catch (e) {
        console.error(`Error fetching batch starting at ${i}:`, e);
      }
    }

    if (products.length === 0) {
      return NextResponse.json(
        { error: "No products found in collection" },
        { status: 404 }
      );
    }

    const result = {
      id: collectionDoc.id,
      name: collectionData.name || "Collection",
      imageUrl: collectionData.imageUrl || null,
      products: products,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching product collection:", error);

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
