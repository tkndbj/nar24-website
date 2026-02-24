/**
 * Product.ts
 *
 * Full TypeScript port of Flutter's Product model.
 *
 * Field structure — matches Flutter exactly:
 *   - Every named field in Firestore has a dedicated typed property.
 *   - Spec fields (clothingSizes, consoleBrand, etc.) are TOP-LEVEL, never in attributes.
 *   - attributes is a true catch-all for any one-off miscellaneous fields only.
 *
 * Migration:
 *   - Old documents stored spec fields inside an `attributes` sub-map.
 *   - Factories read top-level first, fall back to attributes for legacy docs.
 *   - toJson / toMap always write top-level (auto-migrates on next write).
 *
 * Factories — mirrors Flutter's three:
 *   ProductUtils.fromDocument  →  Product.fromDocument(DocumentSnapshot)
 *   ProductUtils.fromJson      →  Product.fromJson(Map)
 *   ProductUtils.fromTypeSense →  Product.fromTypeSense(Map)  ← replaces fromAlgolia
 *
 * No `any` types — Vercel-safe.
 */

// ── ProductSummary (lightweight grid/list view) ───────────────────────────────
// Mirrors Flutter's ProductSummary.  Kept in this file so Product.toSummary()
// can return a typed value without a circular import.

export interface ProductSummary {
  id: string;
  sourceCollection?: string;
  productName: string;
  price: number;
  currency: string;
  condition: string;
  brandModel?: string;
  imageUrls: string[];
  averageRating: number;
  reviewCount: number;
  originalPrice?: number;
  discountPercentage?: number;
  campaignName?: string;
  category: string;
  subcategory: string;
  subsubcategory: string;
  gender?: string;
  availableColors: string[];
  colorImages: Record<string, string[]>;
  sellerName: string;
  shopId?: string;
  userId: string;
  ownerId: string;
  quantity: number;
  colorQuantities: Record<string, number>;
  isBoosted: boolean;
  isFeatured: boolean;
  purchaseCount: number;
  bestSellerRank?: number;
  deliveryOption: string;
  paused: boolean;
  bundleIds: string[];
  discountThreshold?: number;
  bulkDiscountPercentage?: number;
  videoUrl?: string;
  createdAt: Date;
  promotionScore: number;
}

// ── Product ───────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  sourceCollection?: string;

  // ── Core ──────────────────────────────────────────────────────────────────
  productName: string;
  description: string;
  price: number;
  currency: string;
  condition: string;
  brandModel?: string;
  videoUrl?: string;

  // ── Media ─────────────────────────────────────────────────────────────────
  imageUrls: string[];
  colorImages: Record<string, string[]>;

  // ── Classification ────────────────────────────────────────────────────────
  category: string;
  subcategory: string;
  subsubcategory: string;
  productType?: string;
  gender?: string;

  // ── Spec fields (top-level in Firestore, typed here) ──────────────────────
  // Read: top-level first, attributes fallback for legacy docs.
  // Write: always top-level. Mirrors Flutter's typed spec fields exactly.
  clothingSizes?: string[];
  clothingFit?: string;
  clothingTypes?: string[];
  pantSizes?: string[];
  pantFabricTypes?: string[];
  footwearSizes?: string[];
  jewelryMaterials?: string[];
  consoleBrand?: string;
  curtainMaxWidth?: number;
  curtainMaxHeight?: number;

  // ── Inventory ─────────────────────────────────────────────────────────────
  quantity: number;
  maxQuantity?: number;
  colorQuantities: Record<string, number>;
  availableColors: string[];
  deliveryOption: string;

  // ── Ownership ─────────────────────────────────────────────────────────────
  userId: string;
  ownerId: string;
  shopId?: string;
  sellerName: string;
  ilanNo: string;

  // ── Ratings & stats ───────────────────────────────────────────────────────
  averageRating: number;
  reviewCount: number;
  clickCount: number;
  clickCountAtStart: number;
  favoritesCount: number;
  cartCount: number;
  purchaseCount: number;
  bestSellerRank?: number;

  // ── Pricing extras ────────────────────────────────────────────────────────
  originalPrice?: number;
  discountPercentage?: number;
  discountThreshold?: number;
  bulkDiscountPercentage?: number;

  // ── Bundles ───────────────────────────────────────────────────────────────
  bundleIds: string[];
  bundleData?: Array<Record<string, unknown>>;

  // ── Related products ──────────────────────────────────────────────────────
  relatedProductIds: string[];
  relatedLastUpdated?: Date;
  relatedCount: number;

  // ── Archive / moderation ──────────────────────────────────────────────────
  needsUpdate?: boolean;
  archiveReason?: string;
  archivedByAdmin?: boolean;
  archivedByAdminAt?: Date;
  archivedByAdminId?: string;

  // ── Boost / promotion ─────────────────────────────────────────────────────
  promotionScore: number;
  campaign?: string;
  campaignName?: string;
  isFeatured: boolean;
  isBoosted: boolean;
  paused: boolean;
  boostedImpressionCount: number;
  boostImpressionCountAtStart: number;
  boostClickCountAtStart: number;
  boostStartTime?: Date;
  boostEndTime?: Date;
  lastClickDate?: Date;

  // ── Timestamps ────────────────────────────────────────────────────────────
  createdAt: Date;

  // ── Misc ──────────────────────────────────────────────────────────────────
  /** Truly miscellaneous fields. Spec fields are NOT stored here. */
  attributes?: Record<string, unknown>;

  /** Simplified Firestore document reference */
  reference?: {
    id: string;
    path: string;
    parent: { id: string };
  };
}

export interface ProductCardProps {
  product: Product;
  scaleFactor?: number;
  internalScaleFactor?: number;
  portraitImageHeight?: number;
  overrideInternalScaleFactor?: number;
  showCartIcon?: boolean;
  onClick?: (product: Product) => void;
}

// ── Raw API data type ─────────────────────────────────────────────────────────

type RawData = Record<string, unknown>;

// ── Spec keys to strip from attributes (mirrors Flutter's cleanAttrs block) ───

const SPEC_KEYS_TO_STRIP = [
  "gender",
  "productType",
  "clothingSizes",
  "clothingFit",
  "clothingTypes",
  "clothingType", // legacy singular
  "pantSizes",
  "pantFabricTypes",
  "pantFabricType", // legacy singular
  "footwearSizes",
  "jewelryMaterials",
  "consoleBrand",
  "curtainMaxWidth",
  "curtainMaxHeight",
] as const;

// ── ProductUtils ──────────────────────────────────────────────────────────────

export class ProductUtils {
  // ═══════════════════════════════════════════════════════════════════════════
  // SAFE PARSING HELPERS — match Flutter's Parse.* helpers exactly
  // ═══════════════════════════════════════════════════════════════════════════

  static safeDouble(value: unknown, defaultValue = 0): number {
    if (value == null) return defaultValue;
    if (typeof value === "number") return isNaN(value) ? defaultValue : value;
    if (typeof value === "string") {
      const n = parseFloat(value);
      return isNaN(n) ? defaultValue : n;
    }
    return defaultValue;
  }

  static safeInt(value: unknown, defaultValue = 0): number {
    if (value == null) return defaultValue;
    if (typeof value === "number") return Math.floor(value);
    if (typeof value === "string") {
      const n = parseInt(value, 10);
      return isNaN(n) ? defaultValue : n;
    }
    return defaultValue;
  }

  static safeString(value: unknown, defaultValue = ""): string {
    if (value == null) return defaultValue;
    return String(value);
  }

  static safeStringNullable(value: unknown): string | undefined {
    if (value == null) return undefined;
    const s = String(value).trim();
    return s.length > 0 ? s : undefined;
  }

  static safeStringArray(value: unknown): string[] {
    if (value == null) return [];
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string" && value.length > 0) return [value];
    return [];
  }

  static safeBool(value: unknown): boolean {
    return value === true || value === "true" || value === 1;
  }

  static safeBoolNullable(value: unknown): boolean | undefined {
    if (value == null) return undefined;
    return value === true || value === "true" || value === 1;
  }

  static safeDate(value: unknown): Date {
    if (value == null) return new Date();
    // Firestore Timestamp
    if (
      typeof value === "object" &&
      value !== null &&
      "toDate" in value &&
      typeof (value as { toDate?: unknown }).toDate === "function"
    )
      return (value as { toDate: () => Date }).toDate();
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") {
      const d = new Date(value);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    return new Date();
  }

  static safeDateNullable(value: unknown): Date | undefined {
    if (value == null) return undefined;
    if (
      typeof value === "object" &&
      value !== null &&
      "toDate" in value &&
      typeof (value as { toDate?: unknown }).toDate === "function"
    )
      return (value as { toDate: () => Date }).toDate();
    if (value instanceof Date) return value;
    if (typeof value === "number") return new Date(value);
    if (typeof value === "string") {
      const d = new Date(value);
      return isNaN(d.getTime()) ? undefined : d;
    }
    return undefined;
  }

  static safeColorQuantities(value: unknown): Record<string, number> {
    if (value == null || typeof value !== "object" || Array.isArray(value))
      return {};
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[String(k)] = ProductUtils.safeInt(v);
    }
    return result;
  }

  static safeColorImages(value: unknown): Record<string, string[]> {
    if (value == null || typeof value !== "object" || Array.isArray(value))
      return {};
    const result: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(v)) result[String(k)] = v.map(String);
      else if (typeof v === "string" && v.length > 0) result[String(k)] = [v];
    }
    return result;
  }

  static safeBundleData(
    value: unknown,
  ): Array<Record<string, unknown>> | undefined {
    if (value == null || !Array.isArray(value)) return undefined;
    try {
      return value.map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : {},
      );
    } catch {
      return undefined;
    }
  }

  static safeReference(value: unknown): Product["reference"] {
    if (value == null || typeof value !== "object" || Array.isArray(value))
      return undefined;
    const ref = value as Record<string, unknown>;
    if (ref.id && ref.path && ref.parent) {
      return {
        id: String(ref.id),
        path: String(ref.path),
        parent: {
          id: String((ref.parent as Record<string, unknown>)?.id ?? ""),
        },
      };
    }
    return undefined;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPEC FIELD HELPERS — top-level first, attributes fallback (legacy docs)
  // Mirrors Flutter's _specList / _specStr / _specDouble exactly.
  // ═══════════════════════════════════════════════════════════════════════════

  static specStringArray(
    json: RawData,
    attrs: Record<string, unknown>,
    key: string,
  ): string[] | undefined {
    const raw = json[key] ?? attrs[key];
    if (raw == null) return undefined;
    if (Array.isArray(raw)) return raw.map(String);
    return undefined;
  }

  static specString(
    json: RawData,
    attrs: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const raw = json[key] ?? attrs[key];
    if (raw == null) return undefined;
    const s = String(raw).trim();
    return s.length > 0 ? s : undefined;
  }

  static specNumber(
    json: RawData,
    attrs: Record<string, unknown>,
    key: string,
  ): number | undefined {
    const raw = json[key] ?? attrs[key];
    if (raw == null) return undefined;
    const n = Number(raw);
    return isNaN(n) ? undefined : n;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SOURCE COLLECTION HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  static sourceCollectionFromReference(
    ref: Product["reference"],
  ): string | undefined {
    if (!ref) return undefined;
    const path = ref.path ?? "";
    if (path.startsWith("products/")) return "products";
    if (path.startsWith("shop_products/")) return "shop_products";
    if (ref.parent?.id) return ref.parent.id;
    return undefined;
  }

  static sourceCollectionFromJson(json: RawData): string | undefined {
    if (typeof json.sourceCollection === "string" && json.sourceCollection) {
      return json.sourceCollection;
    }
    const ref = ProductUtils.safeReference(json.reference);
    return ProductUtils.sourceCollectionFromReference(ref);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED INTERNAL FACTORY
  // All three public factories delegate to this — mirrors Flutter's _fromMap.
  // ═══════════════════════════════════════════════════════════════════════════

  private static _fromMap(
    d: RawData,
    id: string,
    ref?: Product["reference"],
    sourceCollectionOverride?: string,
  ): Product {
    // Raw attributes sub-map (legacy format)
    const rawAttrs: Record<string, unknown> =
      d.attributes != null &&
      typeof d.attributes === "object" &&
      !Array.isArray(d.attributes)
        ? { ...(d.attributes as Record<string, unknown>) }
        : {};

    // Strip spec keys from attributes so the map holds only truly misc fields.
    // Mirrors Flutter's cleanAttrs block.
    const cleanAttrs = { ...rawAttrs };
    for (const k of SPEC_KEYS_TO_STRIP) delete cleanAttrs[k];

    return {
      id,
      sourceCollection:
        sourceCollectionOverride ?? ProductUtils.sourceCollectionFromJson(d),

      // ── Core ────────────────────────────────────────────────────────────
      productName: ProductUtils.safeString(d.productName ?? d.title),
      description: ProductUtils.safeString(d.description),
      price: ProductUtils.safeDouble(d.price),
      currency: ProductUtils.safeString(d.currency, "TL"),
      condition: ProductUtils.safeString(d.condition, "Brand New"),
      brandModel: ProductUtils.safeStringNullable(d.brandModel ?? d.brand),
      videoUrl: ProductUtils.safeStringNullable(d.videoUrl),

      // ── Media ────────────────────────────────────────────────────────────
      imageUrls: ProductUtils.safeStringArray(d.imageUrls),
      colorImages: ProductUtils.safeColorImages(d.colorImages),

      // ── Classification ────────────────────────────────────────────────────
      category: ProductUtils.safeString(d.category, "Uncategorized"),
      subcategory: ProductUtils.safeString(d.subcategory),
      subsubcategory: ProductUtils.safeString(d.subsubcategory),
      productType: ProductUtils.specString(d, rawAttrs, "productType"),
      // gender: top-level first, attributes fallback (mirrors Flutter comment)
      gender:
        ProductUtils.safeStringNullable(d.gender) ??
        ProductUtils.safeStringNullable(rawAttrs.gender),

      // ── Spec fields ───────────────────────────────────────────────────────
      clothingSizes: ProductUtils.specStringArray(d, rawAttrs, "clothingSizes"),
      clothingFit: ProductUtils.specString(d, rawAttrs, "clothingFit"),
      // clothingTypes: promote legacy singular 'clothingType' (mirrors Flutter)
      clothingTypes:
        ProductUtils.specStringArray(d, rawAttrs, "clothingTypes") ??
        (ProductUtils.specString(d, rawAttrs, "clothingType") != null
          ? [ProductUtils.specString(d, rawAttrs, "clothingType")!]
          : undefined),
      pantSizes: ProductUtils.specStringArray(d, rawAttrs, "pantSizes"),
      // pantFabricTypes: promote legacy singular 'pantFabricType' (mirrors Flutter)
      pantFabricTypes:
        ProductUtils.specStringArray(d, rawAttrs, "pantFabricTypes") ??
        (ProductUtils.specString(d, rawAttrs, "pantFabricType") != null
          ? [ProductUtils.specString(d, rawAttrs, "pantFabricType")!]
          : undefined),
      footwearSizes: ProductUtils.specStringArray(d, rawAttrs, "footwearSizes"),
      jewelryMaterials: ProductUtils.specStringArray(
        d,
        rawAttrs,
        "jewelryMaterials",
      ),
      consoleBrand: ProductUtils.specString(d, rawAttrs, "consoleBrand"),
      curtainMaxWidth: ProductUtils.specNumber(d, rawAttrs, "curtainMaxWidth"),
      curtainMaxHeight: ProductUtils.specNumber(
        d,
        rawAttrs,
        "curtainMaxHeight",
      ),

      // ── Inventory ─────────────────────────────────────────────────────────
      quantity: ProductUtils.safeInt(d.quantity),
      maxQuantity:
        d.maxQuantity != null ? ProductUtils.safeInt(d.maxQuantity) : undefined,
      colorQuantities: ProductUtils.safeColorQuantities(d.colorQuantities),
      availableColors: ProductUtils.safeStringArray(d.availableColors),
      deliveryOption: ProductUtils.safeString(
        d.deliveryOption,
        "Self Delivery",
      ),

      // ── Ownership ─────────────────────────────────────────────────────────
      userId: ProductUtils.safeString(d.userId),
      ownerId: ProductUtils.safeString(d.ownerId),
      shopId: ProductUtils.safeStringNullable(d.shopId),
      sellerName: ProductUtils.safeString(d.sellerName, "Unknown"),
      ilanNo: ProductUtils.safeString(d.ilan_no ?? d.ilanNo ?? d.id, "N/A"),

      // ── Ratings & stats ───────────────────────────────────────────────────
      averageRating: ProductUtils.safeDouble(d.averageRating),
      reviewCount: ProductUtils.safeInt(d.reviewCount),
      clickCount: ProductUtils.safeInt(d.clickCount),
      clickCountAtStart: ProductUtils.safeInt(d.clickCountAtStart),
      favoritesCount: ProductUtils.safeInt(d.favoritesCount),
      cartCount: ProductUtils.safeInt(d.cartCount),
      purchaseCount: ProductUtils.safeInt(d.purchaseCount),
      bestSellerRank:
        d.bestSellerRank != null
          ? ProductUtils.safeInt(d.bestSellerRank)
          : undefined,

      // ── Pricing extras ────────────────────────────────────────────────────
      originalPrice:
        d.originalPrice != null
          ? ProductUtils.safeDouble(d.originalPrice)
          : undefined,
      discountPercentage:
        d.discountPercentage != null
          ? ProductUtils.safeInt(d.discountPercentage)
          : undefined,
      discountThreshold:
        d.discountThreshold != null
          ? ProductUtils.safeInt(d.discountThreshold)
          : undefined,
      bulkDiscountPercentage:
        d.bulkDiscountPercentage != null
          ? ProductUtils.safeInt(d.bulkDiscountPercentage)
          : undefined,

      // ── Bundles ───────────────────────────────────────────────────────────
      bundleIds: ProductUtils.safeStringArray(d.bundleIds),
      bundleData: ProductUtils.safeBundleData(d.bundleData),

      // ── Related ───────────────────────────────────────────────────────────
      relatedProductIds: ProductUtils.safeStringArray(d.relatedProductIds),
      relatedLastUpdated: ProductUtils.safeDateNullable(d.relatedLastUpdated),
      relatedCount: ProductUtils.safeInt(d.relatedCount),

      // ── Archive ───────────────────────────────────────────────────────────
      needsUpdate: ProductUtils.safeBoolNullable(d.needsUpdate),
      archiveReason: ProductUtils.safeStringNullable(d.archiveReason),
      archivedByAdmin: ProductUtils.safeBoolNullable(d.archivedByAdmin),
      archivedByAdminAt: ProductUtils.safeDateNullable(d.archivedByAdminAt),
      archivedByAdminId: ProductUtils.safeStringNullable(d.archivedByAdminId),

      // ── Boost ─────────────────────────────────────────────────────────────
      promotionScore: ProductUtils.safeDouble(d.promotionScore),
      campaign: ProductUtils.safeStringNullable(d.campaign),
      campaignName: ProductUtils.safeStringNullable(d.campaignName),
      isFeatured: ProductUtils.safeBool(d.isFeatured),
      isBoosted: ProductUtils.safeBool(d.isBoosted),
      paused: ProductUtils.safeBool(d.paused),
      boostedImpressionCount: ProductUtils.safeInt(d.boostedImpressionCount),
      boostImpressionCountAtStart: ProductUtils.safeInt(
        d.boostImpressionCountAtStart,
      ),
      boostClickCountAtStart: ProductUtils.safeInt(d.boostClickCountAtStart),
      boostStartTime: ProductUtils.safeDateNullable(d.boostStartTime),
      boostEndTime: ProductUtils.safeDateNullable(d.boostEndTime),
      lastClickDate: ProductUtils.safeDateNullable(d.lastClickDate),

      // ── Timestamps ────────────────────────────────────────────────────────
      createdAt: ProductUtils.safeDate(d.createdAt),

      // ── Misc ──────────────────────────────────────────────────────────────
      reference: ref ?? ProductUtils.safeReference(d.reference),
      attributes: Object.keys(cleanAttrs).length > 0 ? cleanAttrs : undefined,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC FACTORIES — mirrors Flutter's three factories
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Mirrors Flutter's Product.fromDocument(DocumentSnapshot).
   * Pass in the Firestore DocumentSnapshot's data + id + reference.
   */
  static fromDocument(
    data: RawData,
    id: string,
    ref?: Product["reference"],
  ): Product {
    if (data == null) {
      throw new Error(`Missing product document! ID: ${id}`);
    }
    return ProductUtils._fromMap(data, id, ref);
  }

  /**
   * Mirrors Flutter's Product.fromJson(Map<String, dynamic> json).
   * Use for plain JSON (e.g. API responses, localStorage hydration).
   */
  static fromJson(json: RawData): Product {
    return ProductUtils._fromMap(json, ProductUtils.safeString(json.id));
  }

  /**
   * Mirrors Flutter's Product.fromTypeSense(Map<String, dynamic> json).
   *
   * Key differences from fromJson:
   *  1. ID comes from 'id' (Typesense) or 'objectID' fallback.
   *  2. Strips collection prefix from ID (products_XXX → XXX).
   *  3. Decodes JSON-encoded colorImagesJson / colorQuantitiesJson fields
   *     that Typesense stores as serialized strings.
   */
  static fromTypeSense(json: RawData): Product {
    const rawId = String(json.id ?? json.objectID ?? "");

    let id = rawId;
    let sourceCollection: string | undefined;

    if (id.startsWith("products_")) {
      sourceCollection = "products";
      id = id.slice("products_".length);
    } else if (id.startsWith("shop_products_")) {
      sourceCollection = "shop_products";
      id = id.slice("shop_products_".length);
    } else {
      // Infer from shopId presence — mirrors Flutter's fallback
      sourceCollection =
        json.shopId != null && String(json.shopId).length > 0
          ? "shop_products"
          : "products";
    }

    // Decode JSON-encoded nested maps that Typesense stores as strings.
    // Mirrors Flutter's patched['colorImages'] = jsonDecode(colorImagesJson)
    const patched: RawData = { ...json };

    if (typeof patched.colorImagesJson === "string") {
      try {
        patched.colorImages = JSON.parse(patched.colorImagesJson) as unknown;
      } catch {
        // Leave colorImages as-is if parse fails
      }
    }

    if (typeof patched.colorQuantitiesJson === "string") {
      try {
        patched.colorQuantities = JSON.parse(
          patched.colorQuantitiesJson,
        ) as unknown;
      } catch {
        // Leave colorQuantities as-is
      }
    }

    return ProductUtils._fromMap(patched, id, undefined, sourceCollection);
  }

  /**
   * @deprecated Use fromTypeSense() instead.
   * Kept for backward compatibility with any callers that still use fromAlgolia.
   */
  static fromAlgolia(json: RawData): Product {
    // Normalize objectID → id so fromTypeSense's rawId extraction works
    const normalized: RawData = { ...json };
    if (json.objectID != null && json.id == null) {
      normalized.id = json.objectID;
    }
    return ProductUtils.fromTypeSense(normalized);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY CONVERSION — mirrors Flutter's Product.toSummary()
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Returns a lightweight ProductSummary from a full Product.
   * Mirrors Flutter's Product.toSummary() exactly — same fields, same order.
   */
  static toSummary(product: Product): ProductSummary {
    return {
      id: product.id,
      sourceCollection: product.sourceCollection,
      productName: product.productName,
      price: product.price,
      currency: product.currency,
      condition: product.condition,
      brandModel: product.brandModel,
      imageUrls: product.imageUrls,
      averageRating: product.averageRating,
      reviewCount: product.reviewCount,
      originalPrice: product.originalPrice,
      discountPercentage: product.discountPercentage,
      campaignName: product.campaignName,
      category: product.category,
      subcategory: product.subcategory,
      subsubcategory: product.subsubcategory,
      gender: product.gender,
      availableColors: product.availableColors,
      colorImages: product.colorImages,
      sellerName: product.sellerName,
      shopId: product.shopId,
      userId: product.userId,
      ownerId: product.ownerId,
      quantity: product.quantity,
      colorQuantities: product.colorQuantities,
      isBoosted: product.isBoosted,
      isFeatured: product.isFeatured,
      purchaseCount: product.purchaseCount,
      bestSellerRank: product.bestSellerRank,
      deliveryOption: product.deliveryOption,
      paused: product.paused,
      bundleIds: product.bundleIds,
      discountThreshold: product.discountThreshold,
      bulkDiscountPercentage: product.bulkDiscountPercentage,
      videoUrl: product.videoUrl,
      createdAt: product.createdAt,
      promotionScore: product.promotionScore,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERIALIZATION — mirrors Flutter's toJson / toMap
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Mirrors Flutter's Product.toJson().
   * Timestamps serialized as millisecondsSinceEpoch integers.
   * Spec fields always written top-level (never inside attributes).
   */
  static toJson(product: Product): Record<string, unknown> {
    const json: Record<string, unknown> = {
      id: product.id,
      sourceCollection: product.sourceCollection,
      // Core
      productName: product.productName,
      description: product.description,
      price: product.price,
      currency: product.currency,
      condition: product.condition,
      brandModel: product.brandModel,
      videoUrl: product.videoUrl,
      // Media
      imageUrls: product.imageUrls,
      colorImages: product.colorImages,
      // Classification
      category: product.category,
      subcategory: product.subcategory,
      subsubcategory: product.subsubcategory,
      productType: product.productType,
      gender: product.gender,
      // Spec — always top-level
      clothingSizes: product.clothingSizes,
      clothingFit: product.clothingFit,
      clothingTypes: product.clothingTypes,
      pantSizes: product.pantSizes,
      pantFabricTypes: product.pantFabricTypes,
      footwearSizes: product.footwearSizes,
      jewelryMaterials: product.jewelryMaterials,
      consoleBrand: product.consoleBrand,
      curtainMaxWidth: product.curtainMaxWidth,
      curtainMaxHeight: product.curtainMaxHeight,
      // Inventory
      quantity: product.quantity,
      maxQuantity: product.maxQuantity,
      colorQuantities: product.colorQuantities,
      availableColors: product.availableColors,
      deliveryOption: product.deliveryOption,
      // Ownership
      userId: product.userId,
      ownerId: product.ownerId,
      shopId: product.shopId,
      sellerName: product.sellerName,
      ilan_no: product.ilanNo,
      // Ratings & stats
      averageRating: product.averageRating,
      reviewCount: product.reviewCount,
      clickCount: product.clickCount,
      clickCountAtStart: product.clickCountAtStart,
      favoritesCount: product.favoritesCount,
      cartCount: product.cartCount,
      purchaseCount: product.purchaseCount,
      bestSellerRank: product.bestSellerRank,
      // Pricing extras
      originalPrice: product.originalPrice,
      discountPercentage: product.discountPercentage,
      discountThreshold: product.discountThreshold,
      bulkDiscountPercentage: product.bulkDiscountPercentage,
      // Bundles
      bundleIds: product.bundleIds,
      bundleData: product.bundleData,
      // Related
      relatedProductIds: product.relatedProductIds,
      relatedLastUpdated: product.relatedLastUpdated?.getTime(),
      relatedCount: product.relatedCount,
      // Archive
      needsUpdate: product.needsUpdate,
      archiveReason: product.archiveReason,
      archivedByAdmin: product.archivedByAdmin,
      archivedByAdminAt: product.archivedByAdminAt?.getTime(),
      archivedByAdminId: product.archivedByAdminId,
      // Boost
      promotionScore: product.promotionScore,
      campaign: product.campaign,
      campaignName: product.campaignName,
      isFeatured: product.isFeatured,
      isBoosted: product.isBoosted,
      paused: product.paused,
      boostedImpressionCount: product.boostedImpressionCount,
      boostImpressionCountAtStart: product.boostImpressionCountAtStart,
      boostClickCountAtStart: product.boostClickCountAtStart,
      boostStartTime: product.boostStartTime?.getTime(),
      boostEndTime: product.boostEndTime?.getTime(),
      lastClickDate: product.lastClickDate?.getTime(),
      // Timestamps
      createdAt: product.createdAt.getTime(),
      // Misc
      attributes: product.attributes,
    };

    // Remove null / undefined — mirrors Flutter's removeWhere((_, v) => v == null)
    for (const key of Object.keys(json)) {
      if (json[key] == null) delete json[key];
    }
    return json;
  }

  /**
   * Mirrors Flutter's Product.toMap().
   * Use for Firestore writes — keeps Date objects as-is (Firestore SDK handles them).
   * Spec fields always written top-level.
   */
  static toMap(product: Product): Record<string, unknown> {
    const map: Record<string, unknown> = {
      // Core
      productName: product.productName,
      description: product.description,
      price: product.price,
      currency: product.currency,
      condition: product.condition,
      brandModel: product.brandModel,
      videoUrl: product.videoUrl,
      // Media
      imageUrls: product.imageUrls,
      colorImages: product.colorImages,
      // Classification
      category: product.category,
      subcategory: product.subcategory,
      subsubcategory: product.subsubcategory,
      productType: product.productType,
      gender: product.gender,
      // Spec — always top-level (never inside attributes)
      clothingSizes: product.clothingSizes,
      clothingFit: product.clothingFit,
      clothingTypes: product.clothingTypes,
      pantSizes: product.pantSizes,
      pantFabricTypes: product.pantFabricTypes,
      footwearSizes: product.footwearSizes,
      jewelryMaterials: product.jewelryMaterials,
      consoleBrand: product.consoleBrand,
      curtainMaxWidth: product.curtainMaxWidth,
      curtainMaxHeight: product.curtainMaxHeight,
      // Inventory
      quantity: product.quantity,
      maxQuantity: product.maxQuantity,
      colorQuantities: product.colorQuantities,
      availableColors: product.availableColors,
      deliveryOption: product.deliveryOption,
      // Ownership
      userId: product.userId,
      ownerId: product.ownerId,
      shopId: product.shopId,
      sellerName: product.sellerName,
      ilan_no: product.ilanNo,
      // Ratings & stats
      averageRating: product.averageRating,
      reviewCount: product.reviewCount,
      clickCount: product.clickCount,
      clickCountAtStart: product.clickCountAtStart,
      favoritesCount: product.favoritesCount,
      cartCount: product.cartCount,
      purchaseCount: product.purchaseCount,
      bestSellerRank: product.bestSellerRank,
      // Pricing extras
      originalPrice: product.originalPrice,
      discountPercentage: product.discountPercentage,
      discountThreshold: product.discountThreshold,
      bulkDiscountPercentage: product.bulkDiscountPercentage,
      // Bundles
      bundleIds: product.bundleIds,
      bundleData: product.bundleData,
      // Related
      relatedProductIds: product.relatedProductIds,
      relatedLastUpdated: product.relatedLastUpdated, // Date → Firestore handles it
      relatedCount: product.relatedCount,
      // Archive
      needsUpdate: product.needsUpdate,
      archiveReason: product.archiveReason,
      archivedByAdmin: product.archivedByAdmin,
      archivedByAdminAt: product.archivedByAdminAt,
      archivedByAdminId: product.archivedByAdminId,
      // Boost
      promotionScore: product.promotionScore,
      campaign: product.campaign,
      campaignName: product.campaignName,
      isFeatured: product.isFeatured,
      isBoosted: product.isBoosted,
      paused: product.paused,
      boostedImpressionCount: product.boostedImpressionCount,
      boostImpressionCountAtStart: product.boostImpressionCountAtStart,
      boostClickCountAtStart: product.boostClickCountAtStart,
      boostStartTime: product.boostStartTime,
      boostEndTime: product.boostEndTime,
      lastClickDate: product.lastClickDate,
      // Timestamps
      createdAt: product.createdAt,
      // Misc — only written if non-empty (mirrors Flutter's `if (attributes.isNotEmpty)`)
      ...(product.attributes && Object.keys(product.attributes).length > 0
        ? { attributes: product.attributes }
        : {}),
    };

    // Remove null / undefined
    for (const key of Object.keys(map)) {
      if (map[key] == null) delete map[key];
    }
    return map;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COPY WITH — mirrors Flutter's Product.copyWith()
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Mirrors Flutter's Product.copyWith().
   * Includes the two nullable-reset helpers: setOriginalPriceNull
   * and setDiscountPercentageNull (Flutter uses dedicated booleans for this
   * since Dart's copyWith can't distinguish `null` from "not provided").
   */
  static copyWith(
    product: Product,
    updates: Partial<Product> & {
      setOriginalPriceNull?: boolean;
      setDiscountPercentageNull?: boolean;
    },
  ): Product {
    const {
      setOriginalPriceNull = false,
      setDiscountPercentageNull = false,
      ...rest
    } = updates;

    return {
      ...product,
      ...rest,
      originalPrice: setOriginalPriceNull
        ? undefined
        : (rest.originalPrice ?? product.originalPrice),
      discountPercentage: setDiscountPercentageNull
        ? undefined
        : (rest.discountPercentage ?? product.discountPercentage),
    };
  }
}
