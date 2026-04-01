// src/app/api/products/batch/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { Product, ProductUtils } from "@/app/models/Product";



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
    // Rate limit: 60 requests/min per IP
    const { applyRateLimit } = await import("@/lib/auth-middleware");
    const limited = await applyRateLimit(request, 60, 60000);
    if (limited) return limited;

    const idsParam = request.nextUrl.searchParams.get("ids");
    if (!idsParam) return NextResponse.json({ products: [], count: 0 });

    const ids = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
      .slice(0, 15); // ← was 10, now 15

    if (ids.length === 0) return NextResponse.json({ products: [], count: 0 });

    const cachedProducts: Product[] = [];
    const uncachedIds: string[] = [];

    for (const id of ids) {
      const cached = getCachedProduct(id);
      if (cached) cachedProducts.push(cached);
      else uncachedIds.push(id);
    }

    if (uncachedIds.length === 0) {
      return NextResponse.json({ products: cachedProducts, count: cachedProducts.length, source: "cache" });
    }

    const db = getFirestoreAdmin();

    const results = await Promise.all(
      uncachedIds.map(async (rawId) => {
        try {
          // Resolve collection and clean ID from prefix
          let collection: string;
          let id: string;

          if (rawId.startsWith('p:')) {
            collection = 'products';
            id = rawId.substring(2);
          } else if (rawId.startsWith('sp:')) {
            collection = 'shop_products';
            id = rawId.substring(3);
          } else {
            collection = 'shop_products'; // unprefixed = backward compat
            id = rawId;
          }

          const doc = await db.collection(collection).doc(id).get();
          if (doc.exists) {
            const product = documentToProduct(doc);
            if (product) {
              cacheProduct(rawId, product);
              return product;
            }
          }
          return null;
        } catch (error) {
          console.error(`Error fetching product ${rawId}:`, error);
          return null;
        }
      })
    );

    const fetchedProducts = results.filter((p): p is Product => p !== null);
    const allProducts = [...cachedProducts, ...fetchedProducts];

    const idOrder = new Map(ids.map((id, index) => [id, index]));
    allProducts.sort((a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999));

    return NextResponse.json(
      { products: allProducts, count: allProducts.length },
      { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=300" } }
    );
  } catch (error) {
    console.error("Error in batch fetch:", error);
    return NextResponse.json({ error: "Internal server error", products: [], count: 0 }, { status: 500 });
  }
}