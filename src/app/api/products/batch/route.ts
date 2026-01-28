// src/app/api/products/batch/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { Product, ProductUtils } from "@/app/models/Product";

interface BundleDisplayData {
  bundleId: string;
  product: Record<string, unknown>;
  totalBundlePrice: number;
  totalOriginalPrice: number;
  discountPercentage: number;
  currency: string;
  totalProductCount: number;
}


// ✅ Memory cache for batch requests
const batchCache = new Map<string, { product: Product; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

function getCachedProduct(id: string): Product | null {
  const cached = batchCache.get(id);
  if (!cached) return null;
  
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    batchCache.delete(id);
    return null;
  }
  
  return cached.product;
}

function cacheProduct(id: string, product: Product) {
  batchCache.set(id, { product, timestamp: Date.now() });
  
  // LRU eviction
  if (batchCache.size > MAX_CACHE_SIZE) {
    const firstKey = batchCache.keys().next().value;
    if (firstKey) batchCache.delete(firstKey);
  }
}

function documentToProduct(
  doc: FirebaseFirestore.DocumentSnapshot
): Product | null {
  const data = doc.data();
  if (!data) return null;

  try {
    return ProductUtils.fromJson({
      ...data,
      id: doc.id,
      reference: {
        id: doc.id,
        path: doc.ref.path,
        parent: { id: doc.ref.parent.id },
      },
    });
  } catch (error) {
    console.error(`Error parsing product ${doc.id}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const idsParam = request.nextUrl.searchParams.get("ids");
    
    if (!idsParam) {
      return NextResponse.json({ products: [], count: 0 });
    }

    const ids = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
      .slice(0, 10); // Limit to 10

    if (ids.length === 0) {
      return NextResponse.json({ products: [], count: 0 });
    }

    // ✅ Check cache first
    const cachedProducts: Product[] = [];
    const uncachedIds: string[] = [];

    for (const id of ids) {
      const cached = getCachedProduct(id);
      if (cached) {
        cachedProducts.push(cached);
      } else {
        uncachedIds.push(id);
      }
    }

    // If all cached, return immediately
    if (uncachedIds.length === 0) {
      return NextResponse.json({
        products: cachedProducts,
        count: cachedProducts.length,
        source: "cache",
      });
    }

    const db = getFirestoreAdmin();
    const fetchedProducts: Product[] = [];

    // ✅ OPTIMIZED: Fetch both collections in parallel for each ID
    const results = await Promise.all(
      uncachedIds.map(async (id) => {
        try {
          // Query both collections simultaneously
          const [shopDoc, prodDoc] = await Promise.all([
            db.collection("shop_products").doc(id).get(),
            db.collection("products").doc(id).get(),
          ]);

          // Prefer shop_products (matching Flutter logic)
          const doc = shopDoc.exists ? shopDoc : prodDoc.exists ? prodDoc : null;
          
          if (doc && doc.exists) {
            const product = documentToProduct(doc);
            if (product) {
              cacheProduct(id, product); // Cache for future requests
              return product;
            }
          }
          return null;
        } catch (error) {
          console.error(`Error fetching product ${id}:`, error);
          return null;
        }
      })
    );

    // Filter out nulls
    for (const product of results) {
      if (product) {
        fetchedProducts.push(product);
      }
    }

    // Combine cached + fetched, maintain order
    const allProducts = [...cachedProducts, ...fetchedProducts];
    
    // Sort by original ID order
    const idOrder = new Map(ids.map((id, index) => [id, index]));
    allProducts.sort((a, b) => {
      const orderA = idOrder.get(a.id) ?? 999;
      const orderB = idOrder.get(b.id) ?? 999;
      return orderA - orderB;
    });

    return NextResponse.json({
      products: allProducts,
      count: allProducts.length,
      source: cachedProducts.length === allProducts.length ? "cache" : "mixed",
    });
  } catch (error) {
    console.error("Error in batch fetch:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        products: [],
        count: 0,
        details:
          process.env.NODE_ENV === "development" ? String(error) : undefined,
      },
      { status: 500 }
    );
  }
}