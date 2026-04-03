// src/app/api/products/batch/route.ts
//
// Batch product fetching with unstable_cache for per-product server-side caching.

import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { getFirestoreAdmin } from "@/lib/firebase-admin";
import { Product, ProductUtils } from "@/app/models/Product";

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

// Per-product server-side cache (5 min revalidation)
const cachedFetchProduct = unstable_cache(
  async (rawId: string): Promise<Product | null> => {
    const db = getFirestoreAdmin();

    let collection: string;
    let id: string;

    if (rawId.startsWith("p:")) {
      collection = "products";
      id = rawId.substring(2);
    } else if (rawId.startsWith("sp:")) {
      collection = "shop_products";
      id = rawId.substring(3);
    } else {
      collection = "shop_products";
      id = rawId;
    }

    try {
      const doc = await db.collection(collection).doc(id).get();
      if (!doc.exists) return null;
      return documentToProduct(doc);
    } catch (error) {
      console.error(`Error fetching product ${rawId}:`, error);
      return null;
    }
  },
  ["product-batch"],
  { revalidate: 300, tags: ["products"] },
);

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
      .slice(0, 15);

    if (ids.length === 0) return NextResponse.json({ products: [], count: 0 });

    const results = await Promise.all(ids.map((id) => cachedFetchProduct(id)));
    const allProducts = results.filter((p): p is Product => p !== null);

    const idOrder = new Map(ids.map((id, index) => [id, index]));
    allProducts.sort(
      (a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999)
    );

    return NextResponse.json(
      { products: allProducts, count: allProducts.length },
      {
        headers: {
          "Cache-Control": "public, max-age=120, stale-while-revalidate=300",
        },
      }
    );
  } catch (error) {
    console.error("Error in batch fetch:", error);
    return NextResponse.json(
      { error: "Internal server error", products: [], count: 0 },
      { status: 500 }
    );
  }
}
