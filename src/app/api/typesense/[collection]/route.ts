import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/auth-middleware";

const TYPESENSE_HOST = process.env.TYPESENSE_HOST!;
const TYPESENSE_SEARCH_KEY = process.env.TYPESENSE_SEARCH_KEY!;

// Only allow collections the app actually uses
const ALLOWED_COLLECTIONS = new Set([
  "products",
  "shop_products",
  "shops",
  "orders",
  "restaurants",
  "foods",
  "market_items", // ← NEW: nar24 market grocery catalogue
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ collection: string }> },
) {
  // Rate limit: 60 requests/min per IP
  const limited = await applyRateLimit(request, 60, 60000);
  if (limited) return limited;

  const { collection } = await params;

  // Validate collection name against whitelist
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    return NextResponse.json(
      { error: "Invalid collection" },
      { status: 400 },
    );
  }

  // Only allow the /documents/search action (read-only)
  const searchParams = request.nextUrl.searchParams;
  const typesenseUrl = `https://${TYPESENSE_HOST}/collections/${collection}/documents/search?${searchParams.toString()}`;

  try {
    const resp = await fetch(typesenseUrl, {
      headers: {
        "X-TYPESENSE-API-KEY": TYPESENSE_SEARCH_KEY,
        "Content-Type": "application/json",
      },
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    console.error("Typesense proxy error:", err);
    return NextResponse.json({ error: "Proxy failed" }, { status: 500 });
  }
}