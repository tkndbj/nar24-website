// src/app/api/products/[productId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";

// Helper functions to safely parse data (matching Flutter's approach)
function safeDouble(value: unknown, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || defaultValue;
  return defaultValue;
}

function safeInt(value: unknown, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'number') return Math.floor(value);
  if (typeof value === 'string') return parseInt(value) || defaultValue;
  return defaultValue;
}

function safeString(value: unknown, defaultValue: string = ''): string {
  if (value === null || value === undefined) return defaultValue;
  return String(value);
}

function safeStringArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(e => String(e));
  if (typeof value === 'string') return value.trim() === '' ? [] : [value];
  return [];
}

function safeColorQuantities(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(value)) {
    result[String(key)] = safeInt(val);
  }
  return result;
}

function safeColorImages(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(value)) {
    if (Array.isArray(val)) {
      result[String(key)] = val.map(e => String(e));
    } else if (typeof val === 'string' && val.trim() !== '') {
      result[String(key)] = [String(val)];
    }
  }
  return result;
}

function safeStringNullable(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function parseTimestamp(value: unknown): number | null {
  if (!value) return null;
  
  // Handle Firestore Timestamp objects
  if (value && typeof value === 'object' && '_seconds' in value && typeof (value as { _seconds: unknown })._seconds === 'number') {
    return (value as { _seconds: number })._seconds * 1000;
  }
  
  // Handle regular timestamps
  if (typeof value === 'number') {
    return value > 10000000000 ? value : value * 1000; // Convert seconds to milliseconds if needed
  }
  
  // Handle string dates
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.getTime();
  }
  
  return null;
}

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

    // Extract dynamic attributes
    const rawAttr = data.attributes;
    const attributes: Record<string, unknown> = rawAttr && typeof rawAttr === 'object' ? rawAttr : {};

    // Transform Firestore document to match your Product interface (matching Flutter's fromDocument)
    const product = {
      id: doc.id,
      productName: safeString(data.productName || data.title),
      description: safeString(data.description),
      price: safeDouble(data.price),
      currency: safeString(data.currency, 'TL'),
      condition: safeString(data.condition, 'Brand New'),
      brandModel: safeString(data.brandModel || data.brand || ''),
      imageUrls: safeStringArray(data.imageUrls),
      averageRating: safeDouble(data.averageRating),
      reviewCount: safeInt(data.reviewCount),
      gender: safeStringNullable(data.gender),
      originalPrice: data.originalPrice !== null && data.originalPrice !== undefined ? safeDouble(data.originalPrice) : null,
      discountPercentage: data.discountPercentage !== null && data.discountPercentage !== undefined ? safeInt(data.discountPercentage) : null,
      colorQuantities: safeColorQuantities(data.colorQuantities),
      boostClickCountAtStart: safeInt(data.boostClickCountAtStart),
      availableColors: safeStringArray(data.availableColors),
      userId: safeString(data.userId),
      discountThreshold: data.discountThreshold !== null && data.discountThreshold !== undefined ? safeInt(data.discountThreshold) : null,
      rankingScore: safeDouble(data.rankingScore),
      promotionScore: safeDouble(data.promotionScore),
      campaign: data.campaign?.toString() || null,
      campaignDiscount: data.campaignDiscount !== null && data.campaignDiscount !== undefined ? safeDouble(data.campaignDiscount) : null,
      campaignPrice: data.campaignPrice !== null && data.campaignPrice !== undefined ? safeDouble(data.campaignPrice) : null,
      ownerId: safeString(data.ownerId),
      shopId: data.shopId?.toString() || null,
      ilanNo: safeString(data.ilan_no || data.id, 'N/A'),
      searchIndex: safeStringArray(data.searchIndex),
      createdAt: parseTimestamp(data.createdAt) || Date.now(),
      sellerName: safeString(data.sellerName, 'Unknown'),
      category: safeString(data.category, 'Uncategorized'),
      subcategory: safeString(data.subcategory),
      subsubcategory: safeString(data.subsubcategory),
      quantity: safeInt(data.quantity),
      maxMetre: safeInt(data.maxMetre), 
      bestSellerRank: data.bestSellerRank !== null && data.bestSellerRank !== undefined ? safeInt(data.bestSellerRank) : null,
      sold: data.sold === true,
      clickCount: safeInt(data.clickCount),
      clickCountAtStart: safeInt(data.clickCountAtStart),
      favoritesCount: safeInt(data.favoritesCount),
      cartCount: safeInt(data.cartCount),
      purchaseCount: safeInt(data.purchaseCount),
      deliveryOption: safeString(data.deliveryOption, 'Self Delivery'),
      boostedImpressionCount: safeInt(data.boostedImpressionCount),
      boostImpressionCountAtStart: safeInt(data.boostImpressionCountAtStart),
      isFeatured: data.isFeatured === true,
      isTrending: data.isTrending === true,
      isBoosted: data.isBoosted === true,
      boostStartTime: parseTimestamp(data.boostStartTime),
      boostEndTime: parseTimestamp(data.boostEndTime),
      dailyClickCount: safeInt(data.dailyClickCount),
      lastClickDate: parseTimestamp(data.lastClickDate),
      paused: data.paused === true,
      campaignName: data.campaignName?.toString() || null,
      colorImages: safeColorImages(data.colorImages),
      videoUrl: data.videoUrl?.toString() || null,
      attributes: attributes,
      // Add reference information for sale preferences loading
      reference: {
        id: doc.id,
        path: `${collection}/${doc.id}`,
        parent: {
          id: collection
        }
      }
    };

    // Remove any null/undefined values
    const cleanedProduct = Object.fromEntries(
      Object.entries(product).filter(([, value]) => value !== null && value !== undefined)
    );

    console.log("Returning product successfully with colorImages:", !!cleanedProduct.colorImages);
    console.log("Product has attributes:", Object.keys(cleanedProduct.attributes || {}).length > 0);
    
    return NextResponse.json(cleanedProduct);
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