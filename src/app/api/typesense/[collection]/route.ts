import { NextRequest, NextResponse } from "next/server";

const TYPESENSE_HOST = process.env.TYPESENSE_HOST!;
const TYPESENSE_SEARCH_KEY = process.env.TYPESENSE_SEARCH_KEY!;

export async function GET(
  request: NextRequest,
  { params }: { params: { collection: string } },
) {
  const { collection } = params;

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
