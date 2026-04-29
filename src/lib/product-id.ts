// Pure helpers for product ID parsing. Safe to import from client components
// (no Firebase admin imports).

export function normalizeProductId(productId: string): string {
  let rawId = productId.trim();
  if (rawId.startsWith("products_")) {
    rawId = rawId.substring("products_".length);
  } else if (rawId.startsWith("shop_products_")) {
    rawId = rawId.substring("shop_products_".length);
  }
  return rawId;
}

// Extract the product ID from a pathname like:
//   /productdetail/abc123
//   /en/productdetail/abc123
//   /tr/productdetail/abc123?foo=bar
export function extractProductIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/productdetail\/([^/?#]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}
